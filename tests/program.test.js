import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSession, programList, withProgramList, updateEverywhere, allProgramExercises, SLOTS, SLOT_KEYS, DAYS,
  suggestWeight, prefillWeights, lastFor, formatSets, formatTarget, convertProgramUnits, noIncrement, pairLabels, nextUp,
  isDayProgram, slotName, dayLabel, dayTitle, DAY,
} from '../app/js/logic.js';
import { fullBodyUpdate, cuffCueUpdate, controlWorkUpdate, PROGRAM_UPDATES } from '../app/js/updates.js';
import { SEED_PROGRAM, HOME_PROGRAM, DAY_NOTES } from '../app/js/seed.js';

const T0 = new Date(2026, 0, 5, 18, 0).getTime(); // Monday
let n = 0;
function sess(day, at, entries, extra = {}) {
  return {
    id: `p${++n}`, day, startedAt: at, finishedAt: at + 3600e3, deload: false, unit: 'lb',
    entries: Object.entries(entries).map(([exerciseId, sets]) => ({
      exerciseId, name: exerciseId, note: '', sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
    })),
    ...extra,
  };
}
const find = (day, id, loc = 'gym') => programList(SEED_PROGRAM, day, loc).find((x) => x.id === id);
const identity = (ex) => Object.fromEntries(Object.entries(ex).filter(([k]) => !SLOT_KEYS.includes(k)));

// ---------- seed ----------
test('seed: every day is well formed and made of pairs', () => {
  assert.ok(isDayProgram(SEED_PROGRAM) && isDayProgram(SEED_PROGRAM.home));
  for (const [loc, day] of SLOTS) {
    const list = programList(SEED_PROGRAM, day, loc);
    assert.ok(list.length >= 8, `${loc} ${day}`);
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${loc} ${day} ids unique`);
    for (const ex of list) {
      assert.ok(ex.id && ex.name && ex.sets >= 1 && ex.repMin <= ex.repMax && ex.restSec > 0, ex.id);
      if (noIncrement(ex)) assert.equal(ex.increment, 0, ex.id);
    }
    // Lifting days open with the unpaired shoulder primer; everything else is in pairs.
    const paired = day === 'armor' ? list : list.slice(1);
    if (day !== 'armor') assert.deepEqual([list[0].id, list[0].group], ['side_lying_cuff_supersets', undefined], `${loc} ${day} primer`);
    const sizes = {};
    for (const ex of paired) sizes[ex.group] = (sizes[ex.group] || 0) + 1;
    assert.ok(Object.values(sizes).every((k) => k === 2), `${loc} ${day}: every group is a pair`);
    assert.ok(!pairLabels(paired).includes(null));
  }
  const noRowEr = (list) => list.filter((x) => !x.id.endsWith('row_er'));
  assert.deepEqual(noRowEr(SEED_PROGRAM.armor), noRowEr(HOME_PROGRAM.armor), 'Armor is the same at home but for the row to ER');
  assert.ok(DAYS.every((d) => DAY_NOTES[d].length));
});

test('seed: a shared id is the same exercise everywhere; only the prescription differs', () => {
  const byId = new Map();
  for (const ex of allProgramExercises(SEED_PROGRAM)) {
    if (byId.has(ex.id)) assert.deepEqual(identity(ex), identity(byId.get(ex.id)), `shared ${ex.id} differs`);
    byId.set(ex.id, ex);
  }
  // heavy Monday, lighter Friday
  assert.deepEqual([find('mon', 'hack_squat').repMin, find('fri', 'hack_squat').repMin], [6, 12]);
});

test('seed: keeps ids with history and avoids what the shoulder and back dislike', () => {
  for (const id of ['hack_squat', 'leg_press', 'leg_curl', 'leg_ext', 'cs_row', 'lat_pull_down', 'push_up', 'db_lateral_raise',
    'biceps_curl', 'hammer_curl', 'preacher_machine', 'tri_pushdown', 'pallof', 'side_lying_cuff_supersets', 'dead_bug', 'chest_press']) {
    assert.ok(byIdAnywhere(id), id);
  }
  for (const id of ['hip_thrust', 'chin_up', 'db_curl', 'flat_press']) assert.ok(!byIdAnywhere(id), id);
  assert.equal(find('wed', 'push_up').notch, true);
  assert.equal(find('armor', 'side_plank').measure, 'time');
  assert.equal(find('armor', 'suitcase_carry').measure, 'distance');
});
const byIdAnywhere = (id) => allProgramExercises(SEED_PROGRAM).some((x) => x.id === id);

// ---------- days, pairs ----------
test('day labels and slot names; older A/B days keep their letter', () => {
  assert.equal(dayLabel('armor'), 'Armor');
  assert.equal(dayTitle('mon'), 'Monday');
  assert.equal(dayLabel('A'), 'A');
  assert.equal(dayTitle('B'), 'Session B');
  assert.equal(slotName('wed', 'home'), 'Home Wed');
});

test('pairLabels: A1/A2 for a pair, the bare letter alone, null without a group', () => {
  assert.deepEqual(pairLabels([{ group: 'A' }, { group: 'A' }, { group: 'B' }, {}, { group: 'C' }, { group: 'C' }]),
    ['A1', 'A2', 'B', null, 'C1', 'C2']);
});

test('nextUp: alternates within the pair, then moves on', () => {
  const e = (group, done) => ({ target: { group }, sets: done.map((d) => ({ done: d })) });
  const entries = [e('A', [true, false]), e('A', [true, false]), e('B', [false]), e(undefined, [false])];
  assert.equal(nextUp(entries, 0), 1);
  assert.equal(nextUp(entries, 1), 0);
  entries[1].sets[1].done = true;
  assert.equal(nextUp(entries, 1), 0, 'partner still has a set');
  entries[0].sets[1].done = true;
  assert.equal(nextUp(entries, 0), 2, 'pair done → next exercise');
  assert.equal(nextUp(entries, 3), null, 'not paired');
});

// ---------- per-day history ----------
test('lastFor and suggestions prefer the same day, then fall back to any day', () => {
  const hack = find('fri', 'hack_squat'); // 2 × 12–15
  const s = [
    sess('fri', T0 - 3 * DAY, { hack_squat: [[90, 15], [90, 15]] }),
    sess('mon', T0, { hack_squat: [[140, 8], [140, 8], [140, 7]] }),
  ];
  assert.equal(lastFor('hack_squat', s, { day: 'fri' }).sets[0].weight, 90);
  assert.equal(lastFor('hack_squat', s).sets[0].weight, 140);
  assert.equal(suggestWeight(hack, s, { day: 'fri' }).weight, 100, 'Friday progresses from Friday');
  assert.equal(lastFor('hack_squat', s, { day: 'wed' }).sets[0].weight, 140, 'no Wednesday history → latest');
  const ns = newSession('fri', SEED_PROGRAM, s, { now: T0 + 4 * DAY });
  assert.deepEqual(ns.entries.find((x) => x.exerciseId === 'hack_squat').sets.map((x) => x.weight), [100, 100]);
  // old A/B history still seeds the new days
  const old = [sess('B', T0, { cs_row: [[60, 12], [60, 11], [70, 10]] })];
  assert.deepEqual(prefillWeights(find('mon', 'cs_row'), old, 3, { day: 'mon' }), [60, 60, 70]);
});

test('updateEverywhere: name and load shared, prescription per day', () => {
  const edited = { ...find('mon', 'hack_squat'), name: 'Hack squat (narrow)', sets: 4 };
  const p = updateEverywhere(SEED_PROGRAM, 'hack_squat', edited, ['gym', 'mon']);
  const mon = programList(p, 'mon', 'gym').find((x) => x.id === 'hack_squat');
  const fri = programList(p, 'fri', 'gym').find((x) => x.id === 'hack_squat');
  assert.equal(mon.sets, 4);
  assert.equal(fri.name, 'Hack squat (narrow)');
  assert.deepEqual([fri.sets, fri.repMin, fri.restSec, fri.group], [2, 12, 60, 'A']);
  assert.equal(find('mon', 'hack_squat').sets, 3, 'not mutated');
  // without a slot, every day keeps its own prescription
  const q = updateEverywhere(SEED_PROGRAM, 'db_lateral_raise', { ...find('mon', 'db_lateral_raise'), cue: 'x', sets: 9 });
  assert.equal(programList(q, 'fri', 'home').find((x) => x.id === 'db_lateral_raise').sets, 3);
  assert.equal(programList(q, 'fri', 'home').find((x) => x.id === 'db_lateral_raise').cue, 'x');
  // an exercise without a pair doesn't pick one up from the edited day
  const r = updateEverywhere({ mon: [{ id: 'x', group: 'A' }], wed: [{ id: 'x' }], fri: [], armor: [] }, 'x', { id: 'x', group: 'A', name: 'X' }, ['gym', 'mon']);
  assert.equal('group' in r.wed[0], false);
});

test('withProgramList fills missing home days', () => {
  const p = withProgramList({ mon: [], wed: [], fri: [], armor: [] }, 'fri', 'home', [1]);
  assert.deepEqual(p.home, { mon: [], wed: [], fri: [1], armor: [] });
});

// ---------- holds, carries, notch ----------
test('timed holds, carries and notch format and progress', () => {
  const plank = find('armor', 'side_plank'); // 3 × 30–60 s/side
  const carry = find('armor', 'suitcase_carry'); // 3 × 30–40 m/side, +5 lb ea
  const pushUp = find('wed', 'push_up'); // notch, 3 × 8–15
  assert.equal(formatTarget(plank), '3 × 30–60 s/side');
  assert.equal(formatTarget(carry), '3 × 30–40 m/side');
  assert.equal(formatSets([{ weight: null, reps: 45 }, { weight: null, reps: 40 }], 'lb', plank), '45, 40 s/side');
  assert.equal(formatSets([{ weight: 25, reps: 30 }, { weight: 25, reps: 30 }], 'lb', carry), '25 lb ea — 30, 30 m/side');
  assert.equal(formatSets([{ weight: 14, reps: 15 }, { weight: 13, reps: 12 }], 'lb', pushUp), 'notch 14 × 15 · notch 13 × 12');

  const top = [sess('armor', T0, { side_plank: [[null, 60], [null, 60], [null, 60]] })];
  assert.deepEqual(pick(suggestWeight(plank, top)), { weight: null, increase: false, hitTop: true });
  const carried = [sess('armor', T0, { suitcase_carry: [[25, 40], [25, 40], [25, 40]] })];
  assert.equal(suggestWeight(carry, carried).weight, 30);
  const pushed = [sess('wed', T0, { push_up: [[14, 15], [14, 15], [14, 15]] })];
  assert.deepEqual(pick(suggestWeight(pushUp, pushed)), { weight: 14, increase: false, hitTop: true }, 'notch: flag, never auto-change');
  assert.deepEqual(prefillWeights(pushUp, pushed, 3), [14, 14, 14]);
});
const pick = (r) => ({ weight: r.weight, increase: r.increase, hitTop: r.hitTop });

// ---------- sessions, units ----------
test('newSession uses the day and location lists and snapshots pairs', () => {
  const s = newSession('wed', SEED_PROGRAM, [], { now: T0, location: 'home' });
  assert.equal(s.day, 'wed');
  assert.deepEqual(s.entries.map((e) => e.exerciseId), HOME_PROGRAM.wed.map((x) => x.id));
  assert.equal(s.entries[1].target.group, 'A');
});

test('unit conversion covers every gym and home day', () => {
  const kg = convertProgramUnits({ ...SEED_PROGRAM, unit: 'lb' }, 'lb', 'kg');
  assert.equal(programList(kg, 'mon', 'gym').find((x) => x.id === 'hack_squat').increment, 5);
  assert.equal(programList(kg, 'fri', 'home').find((x) => x.id === 'db_bench_press').increment, 2.5);
  assert.equal(programList(kg, 'wed', 'gym').find((x) => x.id === 'push_up').increment, 0);
});

// ---------- 3-day update ----------
const OLD = {
  unit: 'lb',
  A: [{ id: 'leg_press', name: 'Leg press', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 10 }],
  B: [{ id: 'hack_squat', name: 'Hack squat', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 10 }],
  home: { A: [], B: [] },
};

test('3-day update replaces an A/B program, gym and home, in the program unit', () => {
  const { program, changes } = fullBodyUpdate(OLD);
  assert.ok(changes.length >= 3);
  assert.ok(isDayProgram(program) && isDayProgram(program.home));
  assert.equal(program.A, undefined);
  assert.deepEqual(program.mon.map((x) => x.id), SEED_PROGRAM.mon.map((x) => x.id));
  assert.equal(program.unit, 'lb');
  const kg = fullBodyUpdate({ ...OLD, unit: 'kg' }).program;
  assert.equal(kg.unit, 'kg');
  assert.equal(kg.mon.find((x) => x.id === 'hack_squat').increment, 5);
  assert.equal(OLD.A.length, 1, 'input not mutated');
  program.mon[0].sets = 99;
  assert.notEqual(SEED_PROGRAM.mon[0].sets, 99, 'seed not shared');
});

test('3-day update: idempotent, no-op on the seed, and offers no undo', () => {
  const once = fullBodyUpdate(OLD).program;
  assert.deepEqual(fullBodyUpdate(once).changes, []);
  assert.deepEqual(fullBodyUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, []);
  assert.equal(PROGRAM_UPDATES.find((u) => u.id === 'full-body-3day-2026-10').undo, false);
});

test('cuff cue update: changes the old default cue on every day, keeps a user edit', () => {
  const old = 'Side-lying ER → horizontal abduction (elbow bent 90°, only to body line) → flexion · progress lever, then weight';
  const withOld = updateEverywhere(SEED_PROGRAM, 'side_lying_cuff_supersets', { ...find('armor', 'side_lying_cuff_supersets'), cue: old });
  const { program, changes } = cuffCueUpdate(withOld);
  assert.equal(changes.length, 1);
  for (const loc of ['gym', 'home']) {
    const ex = programList(program, 'armor', loc).find((x) => x.id === 'side_lying_cuff_supersets');
    assert.equal(ex.cue, find('armor', 'side_lying_cuff_supersets').cue);
    assert.equal(ex.sets, 3);
  }
  assert.deepEqual(cuffCueUpdate(program).changes, []);
  const mine = updateEverywhere(SEED_PROGRAM, 'side_lying_cuff_supersets', { ...find('armor', 'side_lying_cuff_supersets'), cue: 'my cue' });
  assert.deepEqual(cuffCueUpdate(mine).changes, []);
  assert.match(find('armor', 'side_lying_cuff_supersets').cue, /straight arm/);
});

test('control work update: moves shoulder drills to Armor on a program in its shipped form', () => {
  const ex = (id) => ({ id, name: id, sets: 2, repMin: 12, repMax: 15, restSec: 30, increment: 0, group: 'X', cue: 'mine' });
  const oldArmor = ['copenhagen_plank', 'bird_dog', 'side_plank', 'dead_bug', 'side_lying_cuff_supersets', 'suitcase_carry',
    'push_up_plus', 'db_lateral_raise', 'adductor_rock_back', 'hip_flexor_stretch'].map(ex);
  const swapWed = (list, from, to) => list.map((x) => (x.id === to ? { ...ex(from), group: x.group } : x));
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'kg' };
  old = withProgramList(old, 'armor', 'gym', oldArmor);
  old = withProgramList(old, 'armor', 'home', oldArmor);
  old = withProgramList(old, 'wed', 'gym', swapWed(old.wed, 'cable_row_er', 'reverse_pec_deck'));
  old = withProgramList(old, 'wed', 'home', swapWed(old.home.wed, 'band_row_er', 'band_pull_apart'));
  for (const loc of ['gym', 'home']) {
    for (const day of ['mon', 'wed', 'fri']) old = withProgramList(old, day, loc, programList(old, day, loc).slice(1));
  }
  const { program, changes } = controlWorkUpdate(old);
  assert.equal(changes.length, 6);
  assert.ok(changes.includes('Mon, Wed, Fri: right-shoulder superset as an easy primer at the start (2 sets)'));
  const primer = program.fri[0];
  assert.deepEqual([primer.id, primer.sets, primer.cue, 'group' in primer], ['side_lying_cuff_supersets', 2, 'mine', false]);
  for (const loc of ['gym', 'home']) {
    for (const day of DAYS) {
      assert.deepEqual(programList(program, day, loc).map((x) => x.id), programList(SEED_PROGRAM, day, loc).map((x) => x.id), `${loc} ${day}`);
    }
  }
  const cuff = program.armor.find((x) => x.id === 'side_lying_cuff_supersets');
  assert.equal(cuff.cue, 'mine', 'keeps the user\'s exercise');
  assert.equal(cuff.group, 'C', 'takes the new pair');
  assert.equal(program.armor.find((x) => x.id === 'supine_db_fly').increment, 1.25, 'kg increment');
  assert.equal(program.wed.find((x) => x.id === 'reverse_pec_deck').group, 'C');
  assert.deepEqual(controlWorkUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(controlWorkUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  const edited = withProgramList(old, 'armor', 'gym', oldArmor.slice(1));
  assert.equal(controlWorkUpdate(edited).program.armor.length, 9, 'an Armor the user changed is left alone');
});
