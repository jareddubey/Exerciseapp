import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSession, programList, withProgramList, updateEverywhere, allProgramExercises, SLOTS, SLOT_KEYS, DAYS,
  suggestWeight, prefillWeights, lastFor, formatSets, formatTarget, convertProgramUnits, noIncrement, pairLabels, nextUp,
  isDayProgram, slotName, dayLabel, dayTitle, DAY,
} from '../app/js/logic.js';
import { fullBodyUpdate, cuffCueUpdate, controlWorkUpdate, pairingUpdate, supportedDeadBugUpdate, cuffDoseUpdate, capsuleStretchUpdate, recoveryArmorUpdate, copenhagenCarryUpdate, PROGRAM_UPDATES } from '../app/js/updates.js';
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
test('seed: every day is well formed, in pairs (a lone finisher at most)', () => {
  assert.ok(isDayProgram(SEED_PROGRAM) && isDayProgram(SEED_PROGRAM.home));
  for (const [loc, day] of SLOTS) {
    const list = programList(SEED_PROGRAM, day, loc);
    assert.ok(list.length >= 8, `${loc} ${day}`);
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${loc} ${day} ids unique`);
    for (const ex of list) {
      assert.ok(ex.id && ex.name && ex.sets >= 1 && ex.repMin <= ex.repMax && ex.restSec > 0, ex.id);
      if (noIncrement(ex)) assert.equal(ex.increment, 0, ex.id);
    }
    // Wednesday opens with the unpaired shoulder primer; everything else is grouped,
    // in pairs except a lone curl at the end.
    const grouped = day === 'wed' ? list.slice(1) : list;
    if (day === 'wed') assert.deepEqual([list[0].id, list[0].group], ['side_lying_cuff_supersets', undefined], `${loc} wed primer`);
    const sizes = {};
    for (const ex of grouped) sizes[ex.group] = (sizes[ex.group] || 0) + 1;
    const counts = Object.values(sizes);
    assert.ok(counts.every((k) => k === 2 || k === 1) && counts.filter((k) => k === 1).length <= 1, `${loc} ${day}: pairs`);
    if (counts.includes(1)) assert.equal(sizes[grouped.at(-1).group], 1, `${loc} ${day}: the lone one is last`);
    assert.ok(!pairLabels(grouped).includes(null));
  }
  const noRowEr = (list) => list.filter((x) => !x.id.endsWith('row_er'));
  assert.deepEqual(noRowEr(SEED_PROGRAM.armor), noRowEr(HOME_PROGRAM.armor), 'Armor is the same at home but for the row to ER');
  assert.ok(DAYS.every((d) => DAY_NOTES[d].length));
  for (const [loc, day] of SLOTS.filter(([, d]) => d !== 'armor')) {
    const list = programList(SEED_PROGRAM, day, loc);
    // daily shoulder control: the primer every lifting day, A2 with the first squat Mon/Fri
    const primer = list.find((x) => x.id === 'side_lying_cuff_supersets');
    assert.deepEqual([primer.sets, primer.repMax], [2, 10], `${loc} ${day} primer`);
    if (day !== 'wed') assert.deepEqual(pairLabels(list).slice(0, 2), ['A1', 'A2']);
    if (day !== 'wed') assert.equal(list[1].id, 'side_lying_cuff_supersets');
    // PT: regular curls and hammer curls 3×/week
    assert.ok(list.some((x) => x.id === 'hammer_curl'), `${loc} ${day} hammer`);
    assert.ok(list.some((x) => ['standing_bicep_curl', 'preacher_machine', 'concentration_curl'].includes(x.id)), `${loc} ${day} curl`);
  }
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
    'standing_bicep_curl', 'hammer_curl', 'preacher_machine', 'tri_pushdown', 'pallof', 'side_lying_cuff_supersets', 'chest_press']) {
    assert.ok(byIdAnywhere(id), id);
  }
  for (const id of ['hip_thrust', 'chin_up', 'db_curl', 'flat_press']) assert.ok(!byIdAnywhere(id), id);
  assert.equal(find('wed', 'push_up').notch, true);
  assert.equal(find('armor', 'side_plank').measure, 'time');
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
  const plank = { ...find('armor', 'side_plank'), sets: 3, repMin: 30, repMax: 60 };
  const carry = { id: 'suitcase_carry', name: 'Suitcase carry', increment: 5, perHand: true, perSide: true, measure: 'distance', sets: 3, repMin: 30, repMax: 40, restSec: 60 };
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
  assert.equal(programList(kg, 'mon', 'home').find((x) => x.id === 'db_bench_press').increment, 2.5);
  assert.equal(programList(kg, 'fri', 'gym').find((x) => x.id === 'landmine_press').increment, 1.25);
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
    assert.equal(ex.cue, STRAIGHT_ARM_CUE);
    assert.equal(ex.sets, 3);
  }
  assert.deepEqual(cuffCueUpdate(program).changes, []);
  const mine = updateEverywhere(SEED_PROGRAM, 'side_lying_cuff_supersets', { ...find('armor', 'side_lying_cuff_supersets'), cue: 'my cue' });
  assert.deepEqual(cuffCueUpdate(mine).changes, []);
  assert.match(find('armor', 'side_lying_cuff_supersets').cue, /straight arm/);
  // the dose update takes it on to the current cue
  assert.equal(allProgramExercises(cuffDoseUpdate(program).program).find((x) => x.id === 'side_lying_cuff_supersets').cue,
    find('armor', 'side_lying_cuff_supersets').cue);
});
const STRAIGHT_ARM_CUE = 'Side-lying, straight arm: ER → horizontal abduction → flexion · progress reps, then weight';

test('cuff dose update: 1 lb HA + flexion, hard on Armor, easy primers, 0.5 lb steps; keeps a user edit', () => {
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'lb' };
  old = updateEverywhere(old, 'side_lying_cuff_supersets', { ...find('armor', 'side_lying_cuff_supersets'), cue: STRAIGHT_ARM_CUE, increment: 1 });
  for (const [loc, day] of SLOTS) {
    const list = programList(old, day, loc);
    old = withProgramList(old, day, loc, list.map((x) => (x.id === 'side_lying_cuff_supersets'
      ? { ...x, ...(day === 'armor' ? { repMin: 12, repMax: 15 } : { repMin: 10, repMax: 12 }) } : x)));
  }
  const { program, changes } = cuffDoseUpdate(old);
  assert.equal(changes.length, 3);
  for (const [loc, day] of SLOTS) {
    const got = programList(program, day, loc).find((x) => x.id === 'side_lying_cuff_supersets');
    assert.deepEqual(got, find(day, 'side_lying_cuff_supersets', loc), `${loc} ${day}`);
  }
  assert.deepEqual(cuffDoseUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(cuffDoseUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  const kg = cuffDoseUpdate({ ...old, unit: 'kg' }).program;
  assert.equal(kg.armor.find((x) => x.id === 'side_lying_cuff_supersets').increment, 1.25);
  const mine = updateEverywhere(old, 'side_lying_cuff_supersets', { ...find('armor', 'side_lying_cuff_supersets'), cue: 'my cue' });
  assert.deepEqual(cuffDoseUpdate(mine).changes, [], 'a cue the user edited is left alone');
  assert.ok(DAY_NOTES.armor.some((t) => /3 × 15 at 1 lb/.test(t)));
  assert.ok(DAY_NOTES.mon.some((t) => /well short of fatigue/.test(t)));
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
    for (const day of ['mon', 'wed', 'fri']) old = withProgramList(old, day, loc, programList(old, day, loc).filter((x) => x.id !== 'side_lying_cuff_supersets'));
  }
  const { program, changes } = controlWorkUpdate(old);
  assert.equal(changes.length, 6);
  assert.ok(changes.includes('Mon, Wed, Fri: right-shoulder superset as an easy primer at the start (2 sets)'));
  const primer = program.fri[0];
  assert.deepEqual([primer.id, primer.sets, primer.cue, 'group' in primer], ['side_lying_cuff_supersets', 2, 'mine', false]);
  for (const loc of ['gym', 'home']) {
    for (const day of ['armor', 'wed']) {
      assert.deepEqual(programList(program, day, loc).map((x) => x.id), programList(SEED_PROGRAM, day, loc).map((x) => x.id), `${loc} ${day}`);
    }
  }
  const cuff = program.armor.find((x) => x.id === 'side_lying_cuff_supersets');
  assert.equal(cuff.cue, 'mine', 'keeps the user\'s exercise');
  assert.equal(cuff.group, 'B', 'takes the new pair');
  assert.equal(program.armor.find((x) => x.id === 'supine_db_fly').increment, 1.25, 'kg increment');
  assert.equal(program.wed.find((x) => x.id === 'reverse_pec_deck').group, 'E');
  assert.deepEqual(controlWorkUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(controlWorkUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  const edited = withProgramList(old, 'armor', 'gym', oldArmor.slice(1));
  assert.equal(controlWorkUpdate(edited).program.armor.length, 9, 'an Armor the user changed is left alone');
});

test('pairing update: re-pairs lifting days still in their shipped form', () => {
  const shipped = {
    gym: {
      mon: ['side_lying_cuff_supersets', 'hack_squat', 'pallof', 'incline_press', 'cs_row', 'leg_curl', 'db_lateral_raise', 'biceps_curl', 'tri_pushdown'],
      wed: ['side_lying_cuff_supersets', 'kickstand_rdl', 'lat_pull_down', 'leg_press', 'push_up', 'glut_bridge', 'reverse_pec_deck', 'hammer_curl', 'cable_tri_ext'],
      fri: ['side_lying_cuff_supersets', 'hack_squat', 'pallof', 'single_arm_pulldown', 'chest_press', 'leg_ext', 'leg_curl', 'db_lateral_raise', 'tri_pushdown', 'preacher_machine', 'body_saw'],
    },
    home: {
      mon: ['side_lying_cuff_supersets', 'goblet_squat', 'band_pallof', 'incline_db_press', 'db_chest_supported_row', 'band_leg_curl', 'db_lateral_raise', 'standing_bicep_curl', 'band_pushdown'],
      wed: ['side_lying_cuff_supersets', 'kickstand_rdl', 'band_lat_pulldown', 'step_back_lunge', 'push_up', 'glut_bridge', 'band_pull_apart', 'hammer_curl', 'band_pushdown'],
      fri: ['side_lying_cuff_supersets', 'goblet_squat', 'band_pallof', 'band_lat_pulldown', 'db_bench_press', 'band_leg_extension', 'band_leg_curl', 'db_lateral_raise', 'band_pushdown', 'concentration_curl', 'body_saw'],
    },
  };
  const mk = (id) => ({ id, name: id, sets: 3, repMin: 10, repMax: 12, restSec: 60, increment: 5, group: 'Z', cue: id === 'standing_bicep_curl' ? 'Elbows still at your sides' : 'mine' });
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'lb' };
  for (const loc of ['gym', 'home']) for (const day of ['mon', 'wed', 'fri']) old = withProgramList(old, day, loc, shipped[loc][day].map(mk));
  const { program, changes } = pairingUpdate(old);
  assert.equal(changes.length, 6);
  for (const loc of ['gym', 'home']) {
    for (const day of ['mon', 'wed', 'fri']) {
      const got = programList(program, day, loc);
      const want = programList(SEED_PROGRAM, day, loc);
      assert.deepEqual(got.map((x) => x.id), want.map((x) => x.id), `${loc} ${day}`);
      assert.deepEqual(got.map((x) => [x.sets, x.group]), want.map((x) => [x.sets, x.group]), `${loc} ${day} prescription`);
    }
  }
  assert.equal(program.mon.find((x) => x.id === 'hack_squat').cue, 'mine', 'keeps the user\'s exercise');
  assert.equal(program.fri.find((x) => x.id === 'landmine_press').increment, 2.5);
  assert.equal('group' in program.wed[0], false, 'Wednesday primer stays unpaired');
  assert.equal(program.wed.find((x) => x.id === 'standing_bicep_curl').cue, find('mon', 'standing_bicep_curl').cue, 'old default cue updated');
  assert.deepEqual(pairingUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(pairingUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  // a day the user changed is left alone
  const edited = withProgramList(old, 'mon', 'gym', shipped.gym.mon.slice(1).map(mk));
  assert.equal(pairingUpdate(edited).program.mon.length, 8);
});

test('supported dead bug update: takes the dead bug\'s place on Armor, gym and home', () => {
  const deadBug = { id: 'dead_bug', name: 'Dead bug', sets: 3, repMin: 8, repMax: 8, restSec: 20, increment: 0, group: 'A', cue: 'mine' };
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'kg' };
  for (const loc of ['gym', 'home']) {
    old = withProgramList(old, 'armor', loc, programList(old, 'armor', loc).map((x) => (x.id === 'supported_dead_bug' ? deadBug : x)));
  }
  const { program, changes } = supportedDeadBugUpdate(old);
  assert.equal(changes.length, 2);
  for (const loc of ['gym', 'home']) {
    assert.deepEqual(programList(program, 'armor', loc), programList(SEED_PROGRAM, 'armor', loc), loc);
  }
  assert.deepEqual(supportedDeadBugUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(supportedDeadBugUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  assert.match(DAY_NOTES.armor[0], /90-90 breathing/);
  for (const day of DAYS) assert.match(DAY_NOTES[day][0], /side-lying core/, `${day} side-lying core`);
});

test('capsule stretch update: sleeper on lifting days, cross-body on Armor, last in the session', () => {
  const stretches = ['sleeper_stretch', 'cross_body_stretch'];
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'lb' };
  for (const [loc, day] of SLOTS) old = withProgramList(old, day, loc, programList(old, day, loc).filter((x) => !stretches.includes(x.id)));
  old = withProgramList(old, 'fri', 'gym', programList(old, 'fri', 'gym').map((x, i, l) => (i === l.length - 1 ? { ...x, restSec: 60 } : x)));
  const { program, changes } = capsuleStretchUpdate(old);
  assert.equal(program.fri.at(-2).restSec, 30, 'the lone curl\'s rest becomes a pair rest');
  assert.equal(changes.length, 1);
  for (const [loc, day] of SLOTS) {
    const got = programList(program, day, loc);
    const want = programList(SEED_PROGRAM, day, loc);
    assert.deepEqual(got.map((x) => [x.id, x.group]), want.map((x) => [x.id, x.group]), `${loc} ${day}`);
    assert.equal(got.at(-1).id, day === 'armor' ? 'cross_body_stretch' : 'sleeper_stretch');
  }
  assert.deepEqual(capsuleStretchUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(capsuleStretchUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  assert.equal(formatTarget(find('mon', 'sleeper_stretch')), '3 × 30 s');
});

test('recovery Armor update: about 50 min of motor control, keeps the user\'s exercises', () => {
  const ex = (id, extra = {}) => ({ id, name: id, sets: 3, repMin: 8, repMax: 12, restSec: 45, increment: 0, group: 'Z', cue: 'mine', ...extra });
  const shipped = (rowEr) => ['copenhagen_plank', 'bird_dog', 'side_plank', 'supported_dead_bug', 'side_lying_cuff_supersets', 'suitcase_carry',
    'supine_db_fly', 'adductor_rock_back', rowEr, 'hip_flexor_stretch', 'cross_body_stretch']
    .map((id) => ex(id, id === 'bird_dog' ? { cue: '10-s hold each rep · brace, no sagging or hip rotation' } : {}));
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'lb' };
  old = withProgramList(old, 'armor', 'gym', shipped('cable_row_er'));
  old = withProgramList(old, 'armor', 'home', shipped('band_row_er'));
  const { program, changes } = recoveryArmorUpdate(old);
  assert.equal(changes.length, 2);
  for (const loc of ['gym', 'home']) {
    const got = programList(program, 'armor', loc);
    const want = programList(SEED_PROGRAM, 'armor', loc);
    assert.deepEqual(got.map((x) => [x.id, x.sets, x.repMin, x.repMax, x.restSec, x.group]), want.map((x) => [x.id, x.sets, x.repMin, x.repMax, x.restSec, x.group]), loc);
  }
  assert.equal(program.armor.find((x) => x.id === 'side_lying_cuff_supersets').cue, 'mine', 'keeps the user\'s exercise');
  assert.equal(program.armor.find((x) => x.id === 'bird_dog').cue, find('armor', 'bird_dog').cue, 'old default cue updated');
  assert.deepEqual(recoveryArmorUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(recoveryArmorUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  const edited = withProgramList(old, 'armor', 'gym', shipped('cable_row_er').slice(1));
  assert.equal(recoveryArmorUpdate(edited).program.armor.length, 10, 'an Armor the user changed is left alone');
  for (const id of ['suitcase_carry', 'adductor_rock_back']) assert.ok(!SEED_PROGRAM.armor.some((x) => x.id === id), id);
  assert.match(changes[0], /Out: suitcase_carry, adductor_rock_back/);
  assert.match(DAY_NOTES.armor.at(-1), /dog walk/);
});

test('Copenhagen + carry update: Copenhagen right ×2 left ×1 on Armor, carries on Wednesday', () => {
  const recovery = (rowEr) => ['supported_dead_bug', 'bird_dog', 'side_lying_cuff_supersets', 'hip_flexor_stretch', 'supine_db_fly', 'side_plank', rowEr, 'cross_body_stretch'];
  const carryless = {
    gym: ['side_lying_cuff_supersets', 'kickstand_rdl', 'lat_pull_down', 'leg_press', 'push_up', 'glut_bridge', 'reverse_pec_deck', 'hammer_curl', 'cable_tri_ext', 'standing_bicep_curl', 'sleeper_stretch'],
    home: ['side_lying_cuff_supersets', 'kickstand_rdl', 'band_lat_pulldown', 'step_back_lunge', 'push_up', 'glut_bridge', 'band_pull_apart', 'hammer_curl', 'band_pushdown', 'standing_bicep_curl', 'sleeper_stretch'],
  };
  const all = new Map(allProgramExercises(SEED_PROGRAM).map((x) => [x.id, x]));
  const mk = (id) => ({ ...all.get(id), cue: 'mine', sets: 9, group: 'Z' });
  let old = { ...structuredClone(SEED_PROGRAM), unit: 'kg' };
  old = withProgramList(old, 'armor', 'gym', recovery('cable_row_er').map(mk));
  old = withProgramList(old, 'armor', 'home', recovery('band_row_er').map(mk));
  for (const loc of ['gym', 'home']) old = withProgramList(old, 'wed', loc, carryless[loc].map(mk));
  const { program, changes } = copenhagenCarryUpdate(old);
  assert.equal(changes.length, 4);
  for (const loc of ['gym', 'home']) {
    for (const day of ['armor', 'wed']) {
      const got = programList(program, day, loc);
      const want = programList(SEED_PROGRAM, day, loc);
      assert.deepEqual(got.map((x) => [x.id, x.sets, x.group]), want.map((x) => [x.id, x.sets, x.group]), `${loc} ${day}`);
    }
  }
  assert.equal(program.wed.find((x) => x.id === 'suitcase_carry').increment, 2.5, 'kg increment');
  assert.equal(program.wed.find((x) => x.id === 'glut_bridge').cue, 'mine', 'keeps the user\'s exercise');
  assert.equal('group' in program.wed[0], false, 'Wednesday primer stays unpaired');
  assert.deepEqual(copenhagenCarryUpdate(program).changes, [], 'idempotent');
  assert.deepEqual(copenhagenCarryUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, [], 'no-op on the seed');
  // an old per-side Copenhagen at its default cue becomes right ×2, left ×1
  const perSide = updateEverywhere(SEED_PROGRAM, 'copenhagen_plank', { ...find('armor', 'copenhagen_plank'), perSide: true, cue: 'Short lever: knee on the bench · body straight · long lever once 30 s is easy' });
  const fixed = copenhagenCarryUpdate(perSide).program.armor.find((x) => x.id === 'copenhagen_plank');
  assert.deepEqual(fixed, find('armor', 'copenhagen_plank'));
  assert.equal(find('wed', 'suitcase_carry', 'home').measure, 'distance');
});

test('updates in order take a first-shipped 3-day program to the current seed', () => {
  // control work then pairing on a device that skipped the control update
  const p0 = { ...structuredClone(SEED_PROGRAM), unit: 'lb' };
  const r = PROGRAM_UPDATES.reduce((p, u) => u.apply(p).program, p0);
  assert.deepEqual(r.mon.map((x) => x.id), SEED_PROGRAM.mon.map((x) => x.id));
});
