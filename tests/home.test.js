import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSession, nextDay, programList, withProgramList, updateEverywhere, allProgramExercises, exerciseCatalog,
  suggestWeight, formatSets, convertProgramUnits, repsOnly, locationOf, exerciseHistory, DAY,
} from '../app/js/logic.js';
import { homeWorkoutsUpdate, armsShouldersUpdate } from '../app/js/updates.js';
import { toCSV, parseImport, buildExport } from '../app/js/backup.js';
import { SEED_PROGRAM, HOME_PROGRAM } from '../app/js/seed.js';

const T0 = new Date(2026, 0, 5, 18, 0).getTime();
let n = 0;
function sess(day, at, entries, extra = {}) {
  return {
    id: `h${++n}`, day, startedAt: at, finishedAt: at + 3600e3, deload: false, unit: 'lb',
    entries: Object.entries(entries).map(([exerciseId, sets]) => ({
      exerciseId, name: exerciseId, note: '', sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
    })),
    ...extra,
  };
}

test('home seed: every exercise is well formed, ids unique per day, shared ids identical', () => {
  for (const day of ['A', 'B']) {
    const list = HOME_PROGRAM[day];
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
    for (const ex of list) {
      assert.ok(ex.id && ex.name && ex.sets >= 1 && ex.repMin <= ex.repMax && ex.restSec > 0, ex.id);
      if (repsOnly(ex)) assert.equal(ex.increment, 0, ex.id);
    }
  }
  const byId = new Map();
  for (const ex of allProgramExercises(SEED_PROGRAM)) {
    if (byId.has(ex.id)) assert.deepEqual(ex, byId.get(ex.id), `shared ${ex.id} differs`);
    byId.set(ex.id, ex);
  }
  // dead bug is the same exercise at the gym and at home
  assert.ok(SEED_PROGRAM.A.some((x) => x.id === 'dead_bug') && HOME_PROGRAM.A.some((x) => x.id === 'dead_bug'));
});

test('programList / withProgramList address gym and home days', () => {
  assert.equal(programList(SEED_PROGRAM, 'A', 'gym'), SEED_PROGRAM.A);
  assert.equal(programList(SEED_PROGRAM, 'B', 'home'), HOME_PROGRAM.B);
  assert.deepEqual(programList({ A: [], B: [] }, 'A', 'home'), []);
  const p = withProgramList({ A: [1], B: [2] }, 'B', 'home', [3]);
  assert.deepEqual(p, { A: [1], B: [2], home: { A: [], B: [3] } });
  assert.deepEqual(withProgramList(p, 'A', 'gym', [9]).A, [9]);
});

test('newSession: home location uses the home list and is recorded', () => {
  const s = newSession('A', SEED_PROGRAM, [], { now: T0, location: 'home' });
  assert.equal(s.location, 'home');
  assert.deepEqual(s.entries.map((e) => e.exerciseId), HOME_PROGRAM.A.map((x) => x.id));
  assert.equal(locationOf(newSession('A', SEED_PROGRAM, [], { now: T0 })), 'gym');
  assert.equal(locationOf({ day: 'A' }), 'gym', 'older sessions without location are gym');
});

test('home sessions count in the same A/B rotation', () => {
  const s = [sess('A', T0, {}, { location: 'home' })];
  assert.equal(nextDay(s), 'B');
  s.push(sess('B', T0 + 2 * DAY, {}));
  assert.equal(nextDay(s), 'A');
});

test('band exercise: reps only, "stronger band" when every set hits the top', () => {
  const band = HOME_PROGRAM.A.find((x) => x.id === 'band_pushdown'); // 3 × 12–20
  const hit = [sess('A', T0, { band_pushdown: [[null, 20], [null, 20], [null, 20]] }, { location: 'home' })];
  const r = suggestWeight(band, hit);
  assert.equal(r.weight, null);
  assert.equal(r.increase, true);
  const miss = [sess('A', T0, { band_pushdown: [[null, 20], [null, 18], [null, 20]] })];
  assert.equal(suggestWeight(band, miss).increase, false);
  const ns = newSession('A', SEED_PROGRAM, hit, { now: T0 + 2 * DAY, location: 'home' });
  assert.ok(ns.entries.find((e) => e.exerciseId === 'band_pushdown').sets.every((x) => x.weight === null));
});

test('bodyweight exercise never flags an increase', () => {
  const chin = HOME_PROGRAM.A.find((x) => x.id === 'chin_up');
  const s = [sess('A', T0, { chin_up: [[null, 10], [null, 10], [null, 10]] })];
  assert.equal(suggestWeight(chin, s).increase, false);
});

test('dumbbell progression and "lb ea" formatting', () => {
  const press = HOME_PROGRAM.A.find((x) => x.id === 'db_bench_press'); // 3 × 10–12, +5, perHand
  const s = [sess('A', T0, { db_bench_press: [[40, 12], [40, 12], [40, 12]] }, { location: 'home' })];
  assert.equal(suggestWeight(press, s).weight, 45);
  assert.equal(formatSets([{ weight: 40, reps: 12 }, { weight: 40, reps: 11 }], 'lb', press), '40 lb ea — 12, 11');
  assert.equal(formatSets([{ weight: null, reps: 15 }], 'lb', { band: true }), '15 reps');
});

test('home and gym histories stay separate except shared ids', () => {
  const s = [
    sess('A', T0, { chest_press: [[100, 12]], dead_bug: [[null, 8]] }),
    sess('A', T0 + 2 * DAY, { db_bench_press: [[40, 12]], dead_bug: [[null, 8]] }, { location: 'home' }),
  ];
  assert.equal(exerciseHistory('chest_press', s).length, 1);
  assert.equal(exerciseHistory('db_bench_press', s).length, 1);
  const bug = exerciseHistory('dead_bug', s);
  assert.deepEqual(bug.map((x) => x.location), ['gym', 'home']);
});

test('catalog and unit conversion include home days', () => {
  const cat = exerciseCatalog(SEED_PROGRAM, []);
  assert.ok(cat.has('chin_up') && cat.has('leg_press'));
  const kg = convertProgramUnits({ ...SEED_PROGRAM, unit: 'lb' }, 'lb', 'kg');
  assert.equal(kg.home.A.find((x) => x.id === 'db_bench_press').increment, 2.5);
  assert.equal(kg.home.A.find((x) => x.id === 'band_pushdown').increment, 0);
  const noHome = convertProgramUnits({ A: [], B: [], unit: 'lb' }, 'lb', 'kg');
  assert.equal(noHome.home, undefined);
});

test('updateEverywhere keeps a shared exercise in sync across all days', () => {
  const curl = { ...HOME_PROGRAM.A.find((x) => x.id === 'db_curl'), sets: 4 };
  const p = updateEverywhere(SEED_PROGRAM, 'db_curl', curl);
  assert.equal(p.home.A.find((x) => x.id === 'db_curl').sets, 4);
  assert.equal(p.home.B.find((x) => x.id === 'db_curl').sets, 4);
  assert.equal(SEED_PROGRAM.home.A.find((x) => x.id === 'db_curl').sets, 3, 'not mutated');
});

test('home update: adds home days once, in the program unit, keeps gym days', () => {
  const old = { unit: 'kg', A: [{ id: 'x', name: 'X', sets: 1, repMin: 1, repMax: 1, restSec: 60, increment: 5 }], B: [] };
  const r = homeWorkoutsUpdate(old);
  assert.equal(r.changes.length, 2);
  assert.equal(r.program.A, old.A);
  assert.equal(r.program.home.A.find((x) => x.id === 'db_bench_press').increment, 2.5);
  assert.deepEqual(homeWorkoutsUpdate(r.program).changes, []);
  // the arms update leaves home days alone
  assert.equal(armsShouldersUpdate(r.program).program.home, r.program.home);
});

test('backup: CSV has location, home programs validate', () => {
  const s = sess('A', T0, { db_bench_press: [[40, 12]] }, { location: 'home' });
  assert.ok(toCSV([s]).split('\r\n')[1].endsWith(',home'));
  const data = parseImport(JSON.stringify(buildExport({ program: SEED_PROGRAM, settings: {}, sessions: [s] })));
  assert.equal(data.program.home.B.length, HOME_PROGRAM.B.length);
  const bad = buildExport({ program: { ...SEED_PROGRAM, home: { A: 'nope', B: [] } }, settings: {}, sessions: [] });
  assert.throws(() => parseImport(JSON.stringify(bad)), /program is malformed/);
});
