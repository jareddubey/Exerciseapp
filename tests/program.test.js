import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  programList, allProgramExercises, SLOTS, SLOT_KEYS, DAYS, LIFT_DAYS, noIncrement, isDayProgram, nextUp, newSession,
  addSavedProgram, programFromSaved, notesFor,
} from '../app/js/logic.js';
import { programsEqual } from '../app/js/backup.js';
import { straightSetsUpdate, fullBodyUpdate, PROGRAM_UPDATES } from '../app/js/updates.js';
import { SEED_PROGRAM, HOME_PROGRAM, DAY_NOTES } from '../app/js/seed.js';
import { PAIRED_PROGRAM, PAIRED_NOTES } from '../app/js/programs/paired-2026-10.js';

const find = (day, id, loc = 'gym') => programList(SEED_PROGRAM, day, loc).find((x) => x.id === id);
const ids = (day, loc = 'gym') => programList(SEED_PROGRAM, day, loc).map((x) => x.id);
const identity = (ex) => Object.fromEntries(Object.entries(ex).filter(([k]) => !SLOT_KEYS.includes(k)));
const PRIMERS = ['sleeper_stretch', 'side_lying_cuff_supersets', 'copenhagen_plank', 'dowel_kickstand_hinge'];

// ---------- seed ----------
test('seed: every day is well formed, in straight sets', () => {
  assert.ok(isDayProgram(SEED_PROGRAM) && isDayProgram(SEED_PROGRAM.home));
  for (const [loc, day] of SLOTS) {
    const list = programList(SEED_PROGRAM, day, loc);
    assert.ok(list.length >= 9, `${loc} ${day}`);
    assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${loc} ${day} ids unique`);
    for (const ex of list) {
      assert.ok(ex.id && ex.name && ex.sets >= 1 && ex.repMin <= ex.repMax && ex.restSec > 0, ex.id);
      assert.equal('group' in ex, false, `${loc} ${day} ${ex.id}: no pairs`);
      if (noIncrement(ex)) assert.equal(ex.increment, 0, ex.id);
    }
  }
});

test('seed: a shared id is the same exercise everywhere; only the prescription differs', () => {
  const byId = new Map();
  for (const ex of allProgramExercises(SEED_PROGRAM)) {
    if (byId.has(ex.id)) assert.deepEqual(identity(ex), identity(byId.get(ex.id)), `shared ${ex.id} differs`);
    byId.set(ex.id, ex);
  }
  // heavier Monday, lighter Friday
  for (const id of ['chest_press', 'cs_row']) assert.ok(find('mon', id).repMin < find('fri', id).repMin, id);
});

test('seed: shoulder then hip primers open every lifting day; Copenhagens before the legs, not on Armor', () => {
  for (const [loc, day] of SLOTS) {
    const list = programList(SEED_PROGRAM, day, loc);
    assert.ok(list.some((x) => x.id === 'dowel_kickstand_hinge'), `${loc} ${day}: hinge practice every day`);
    if (day === 'armor') {
      assert.ok(!list.some((x) => x.id === 'copenhagen_plank'), `${loc} armor`);
      const cuff = list.find((x) => x.id === 'side_lying_cuff_supersets');
      assert.deepEqual([cuff.sets, cuff.repMin, cuff.repMax], [3, 8, 15], `${loc} armor: the hard dose`);
      assert.equal(list.at(-1).id, 'cross_body_stretch');
      continue;
    }
    assert.deepEqual(list.slice(0, 4).map((x) => x.id), PRIMERS, `${loc} ${day}`);
    const [sleeper, cuff, cph] = list;
    assert.deepEqual([sleeper.sets, sleeper.repMax], [3, 30], `${loc} ${day} sleeper`);
    assert.deepEqual([cuff.sets, cuff.repMin, cuff.repMax], [2, 8, 10], `${loc} ${day}: an easy primer`);
    assert.equal(cph.sets, 3, `${loc} ${day}: right, right, left`);
  }
  assert.match(find('mon', 'copenhagen_plank').cue, /Sets 1–2 right/);
  for (const id of ['kickstand_rdl', 'split_squat', 'dowel_kickstand_hinge']) {
    assert.match(allProgramExercises(SEED_PROGRAM).find((x) => x.id === id).cue, /^Right (side|leg)/, id);
  }
  const noRowEr = (list) => list.filter((x) => !x.id.endsWith('row_er'));
  assert.deepEqual(noRowEr(SEED_PROGRAM.armor), noRowEr(HOME_PROGRAM.armor), 'Armor is the same at home but for the row to ER');
});

test('seed: the lifting days as planned, one curl a day, the old extras out', () => {
  assert.deepEqual(ids('mon').slice(4), ['hack_squat', 'chest_press', 'cs_row', 'leg_curl', 'db_lateral_raise', 'standing_bicep_curl', 'single_leg_calf_raise']);
  assert.deepEqual(ids('wed').slice(4), ['kickstand_rdl', 'leg_press', 'lat_pull_down', 'push_up', 'pallof', 'hammer_curl']);
  assert.deepEqual(ids('fri').slice(4), ['split_squat', 'chest_press', 'cs_row', 'leg_ext', 'leg_curl', 'db_lateral_raise', 'standing_bicep_curl', 'single_leg_calf_raise']);
  for (const [loc, day] of SLOTS.filter(([, d]) => d !== 'armor')) {
    const curls = ids(day, loc).filter((id) => ['standing_bicep_curl', 'hammer_curl'].includes(id));
    assert.equal(curls.length, 1, `${loc} ${day}: one curl`);
    assert.equal(ids(day, loc).length, ids(day).length, `${loc} ${day} mirrors the gym`);
  }
  const out = ['tri_pushdown', 'cable_tri_ext', 'band_pushdown', 'suitcase_carry', 'body_saw', 'glut_bridge', 'reverse_pec_deck',
    'band_pull_apart', 'landmine_press', 'single_arm_pulldown', 'preacher_machine', 'concentration_curl', 'leg_press_calf_raise',
    'seated_calf_raise', 'seated_db_calf_raise', 'step_back_lunge', 'incline_db_press'];
  for (const id of out) assert.ok(!allProgramExercises(SEED_PROGRAM).some((x) => x.id === id), id);
  // the incline push-up gains the plus and keeps its notch history
  assert.deepEqual([find('wed', 'push_up').name, find('wed', 'push_up').notch], ['Incline push-up plus', true]);
});

test('seed: weekly hard sets keep muscle in a deficit without piling on', () => {
  const muscles = {
    quads: ['hack_squat', 'leg_press', 'split_squat', 'leg_ext'],
    hamstrings: ['kickstand_rdl', 'leg_curl'],
    chest: ['chest_press', 'push_up'],
    back: ['cs_row', 'lat_pull_down'],
    'side delts': ['db_lateral_raise'],
    biceps: ['standing_bicep_curl', 'hammer_curl'],
    calves: ['single_leg_calf_raise'],
  };
  const sets = (list) => LIFT_DAYS.flatMap((d) => programList(SEED_PROGRAM, d)).filter((x) => list.includes(x.id)).reduce((n, x) => n + x.sets, 0);
  for (const m of ['quads', 'hamstrings', 'chest', 'back']) {
    assert.ok(sets(muscles[m]) >= 8 && sets(muscles[m]) <= 12, `${m}: ${sets(muscles[m])}`);
  }
  for (const m of ['side delts', 'biceps', 'calves']) assert.equal(sets(muscles[m]), 6, m);
  for (const day of LIFT_DAYS) {
    const lifting = programList(SEED_PROGRAM, day).slice(4).reduce((n, x) => n + x.sets, 0);
    assert.ok(lifting >= 16 && lifting <= 21, `${day}: ${lifting} lifting sets`);
  }
});

test('seed: notes for straight sets, the hips and the right arm', () => {
  for (const day of DAYS) assert.ok(DAY_NOTES[day].length, day);
  for (const day of LIFT_DAYS) {
    const all = DAY_NOTES[day].join(' ');
    for (const re of [/side-lying core/, /Copenhagens/, /Straight sets/, /tenodesis/, /right hip grips/, /left hip pinch/]) assert.match(all, re, `${day} ${re}`);
    assert.doesNotMatch(all, /Pairs \(A1/);
  }
  const armor = DAY_NOTES.armor.join(' ');
  for (const re of [/90-90 breathing/, /90\/90 hip switches/, /3 × 15 at 1 lb/, /dog walk/]) assert.match(armor, re);
});

test('newSession: straight sets, and the rest timer moves on once an exercise is done', () => {
  const s = newSession('wed', SEED_PROGRAM, [], { location: 'home' });
  assert.deepEqual(s.entries.map((e) => e.exerciseId), HOME_PROGRAM.wed.map((x) => x.id));
  assert.ok(s.entries.every((e) => !e.target.group));
  const e = (done) => ({ target: {}, sets: done.map((d) => ({ done: d })) });
  const entries = [e([true, false]), e([true, true]), e([true]), e([false])];
  assert.equal(nextUp(entries, 0), null, 'sets left: same exercise');
  assert.equal(nextUp(entries, 1), 3, 'done: the next one with sets left');
  entries[3].sets[0].done = true;
  assert.equal(nextUp(entries, 3), null, 'all done');
});

// ---------- straight-sets update ----------
test('straight-sets update replaces the paired program, gym and home, in the program unit', () => {
  const paired = { ...structuredClone(PAIRED_PROGRAM), unit: 'lb' };
  const { program, changes } = straightSetsUpdate(paired);
  assert.ok(changes.length >= 6);
  assert.ok(changes.some((c) => /Saved programs/.test(c)));
  assert.ok(programsEqual(program, SEED_PROGRAM));
  assert.deepEqual([program.name, program.unit], [SEED_PROGRAM.name, 'lb']);
  assert.ok(programsEqual(paired, PAIRED_PROGRAM), 'input not mutated');
  program.mon[0].sets = 99;
  assert.notEqual(SEED_PROGRAM.mon[0].sets, 99, 'seed not shared');
  const kg = straightSetsUpdate({ ...paired, unit: 'kg' }).program;
  assert.deepEqual([kg.unit, kg.mon.find((x) => x.id === 'hack_squat').increment], ['kg', 5]);
  // idempotent, and a no-op on the seed
  assert.deepEqual(straightSetsUpdate(straightSetsUpdate(paired).program).changes, []);
  assert.deepEqual(straightSetsUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, []);
  // it saves what it replaces, with those notes, and offers Undo
  const u = PROGRAM_UPDATES.at(-1);
  assert.equal(u.apply, straightSetsUpdate);
  assert.notEqual(u.undo, false);
  assert.deepEqual([u.archive.name, u.archive.notes], ['Full body, paired (Oct 2026)', PAIRED_NOTES]);
});

test('every update in order takes an A/B program to the current seed', () => {
  const ab = { unit: 'lb', A: [{ id: 'leg_press', name: 'Leg press' }], B: [], home: { A: [], B: [] } };
  assert.ok(programsEqual(fullBodyUpdate(ab).program, PAIRED_PROGRAM));
  const r = PROGRAM_UPDATES.reduce((p, u) => u.apply(p).program, ab);
  assert.ok(programsEqual(r, SEED_PROGRAM));
});

// ---------- saved programs ----------
test('saved programs: add once by id, restore in the current unit with its own name and notes', () => {
  const entry = { id: 'x', name: 'Full body, paired (Oct 2026)', savedAt: 1, program: { ...structuredClone(PAIRED_PROGRAM), unit: 'lb' }, notes: PAIRED_NOTES };
  const one = addSavedProgram(undefined, entry);
  assert.deepEqual(one, [entry]);
  assert.equal(addSavedProgram(one, { ...entry, name: 'again' }), one, 'same id: unchanged');
  assert.deepEqual(addSavedProgram(one, { ...entry, id: 'y' }).map((x) => x.id), ['y', 'x'], 'newest first');

  const kg = programFromSaved(entry, 'kg');
  assert.deepEqual([kg.unit, kg.name, kg.notes], ['kg', entry.name, PAIRED_NOTES]);
  assert.equal(kg.mon.find((x) => x.id === 'hack_squat').increment, 5);
  kg.mon[0].sets = 99;
  assert.notEqual(entry.program.mon[0].sets, 99, 'entry not shared');
  assert.ok(programsEqual(programFromSaved(entry, 'lb'), PAIRED_PROGRAM));

  assert.equal(notesFor(kg, 'mon', DAY_NOTES), PAIRED_NOTES.mon, 'a restored program shows its own notes');
  assert.equal(notesFor(SEED_PROGRAM, 'mon', DAY_NOTES), DAY_NOTES.mon);
  assert.deepEqual(notesFor({}, 'sat', DAY_NOTES), []);
});
