import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextDay, suggestWeight, prefillWeights, lastPerformance, lastNote, deloadStatus,
  sessionsThisWeek, backupStatus, newSession, targetSets, formatSets, formatTarget,
  convertIncrement, makeExerciseId, exerciseHistory, WEEK, DAY,
} from '../app/js/logic.js';
import { SEED_PROGRAM } from '../app/js/seed.js';

const T0 = new Date(2026, 0, 5, 18, 0).getTime(); // Monday 5 Jan 2026, 18:00
const curl = SEED_PROGRAM.A.find((e) => e.id === 'biceps_curl'); // 2 × 12–15, +5
const press = SEED_PROGRAM.A.find((e) => e.id === 'chest_press'); // 3 × 10–12, +5
const deadBug = SEED_PROGRAM.A.find((e) => e.id === 'dead_bug');

let n = 0;
function sess(day, at, entries, extra = {}) {
  return {
    id: `s${++n}`, day, startedAt: at, finishedAt: at + 3600e3, deload: false, unit: 'lb',
    entries: Object.entries(entries).map(([exerciseId, sets]) => ({
      exerciseId, name: exerciseId, note: '',
      sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })),
    })),
    ...extra,
  };
}

// ---------- nextDay ----------
test('nextDay: A when there is no history', () => {
  assert.equal(nextDay([]), 'A');
});

test('nextDay: opposite of the last completed session', () => {
  assert.equal(nextDay([sess('A', T0, {})]), 'B');
  assert.equal(nextDay([sess('A', T0, {}), sess('B', T0 + 2 * DAY, {})]), 'A');
});

test('nextDay: uses finish time, not array order', () => {
  const late = sess('B', T0 + 2 * DAY, {});
  const early = sess('A', T0, {});
  assert.equal(nextDay([late, early]), 'A');
});

test('nextDay: ignores unfinished sessions', () => {
  const open = { ...sess('B', T0 + DAY, {}), finishedAt: null };
  assert.equal(nextDay([sess('A', T0, {}), open]), 'B');
});

test('nextDay: A/B/A then B/A/B pattern falls out of alternation', () => {
  const s = [];
  const seq = [];
  for (let i = 0; i < 6; i++) {
    const d = nextDay(s);
    seq.push(d);
    s.push(sess(d, T0 + i * 2 * DAY, {}));
  }
  assert.deepEqual(seq, ['A', 'B', 'A', 'B', 'A', 'B']);
});

// ---------- suggestWeight ----------
test('suggestWeight: no history → null', () => {
  assert.deepEqual(suggestWeight(curl, []).weight, null);
});

test('suggestWeight: every set at repMax → add increment', () => {
  const s = [sess('A', T0, { biceps_curl: [[30, 15], [30, 15]] })];
  const r = suggestWeight(curl, s);
  assert.equal(r.increase, true);
  assert.equal(r.weight, 35);
  assert.equal(r.lastWeight, 30);
});

test('suggestWeight: one set short of repMax → same weight', () => {
  const s = [sess('A', T0, { biceps_curl: [[30, 15], [30, 14]] })];
  const r = suggestWeight(curl, s);
  assert.equal(r.increase, false);
  assert.equal(r.weight, 30);
});

test('suggestWeight: fewer sets than programmed → no increase', () => {
  const s = [sess('A', T0, { chest_press: [[90, 12], [90, 12]] })];
  assert.equal(suggestWeight(press, s).increase, false);
});

test('suggestWeight: unlogged sets (no reps) do not count as performed', () => {
  const s = [sess('A', T0, { chest_press: [[90, 12], [90, 12], [90, null]] })];
  assert.equal(suggestWeight(press, s).increase, false);
});

test('suggestWeight: uses most recent session only', () => {
  const s = [
    sess('A', T0, { chest_press: [[90, 12], [90, 12], [90, 12]] }),
    sess('A', T0 + 4 * DAY, { chest_press: [[95, 11], [95, 10], [95, 10]] }),
  ];
  const r = suggestWeight(press, s);
  assert.equal(r.weight, 95);
  assert.equal(r.increase, false);
});

test('suggestWeight: biceps curl history is shared across A and B', () => {
  const s = [sess('A', T0, { biceps_curl: [[30, 15], [30, 15]] })];
  const bCurl = SEED_PROGRAM.B.find((e) => e.id === 'biceps_curl');
  assert.equal(suggestWeight(bCurl, s).weight, 35);
  s.push(sess('B', T0 + 2 * DAY, { biceps_curl: [[35, 13], [35, 12]] }));
  assert.equal(suggestWeight(curl, s).weight, 35);
  assert.equal(suggestWeight(curl, s).increase, false);
});

test('suggestWeight: deload sessions are skipped as the progression basis', () => {
  const s = [
    sess('A', T0, { biceps_curl: [[30, 14], [30, 13]] }),
    sess('A', T0 + 2 * DAY, { biceps_curl: [[30, 15]] }, { deload: true }),
  ];
  const r = suggestWeight(curl, s);
  assert.equal(r.weight, 30);
  assert.equal(r.increase, false);
});

test('suggestWeight: bodyweight exercise never suggests a weight', () => {
  const s = [sess('A', T0, { dead_bug: [[null, 8], [null, 8]] })];
  const r = suggestWeight(deadBug, s);
  assert.equal(r.weight, null);
  assert.equal(r.increase, false);
});

test('suggestWeight: converts lb history when training in kg', () => {
  const s = [sess('A', T0, { biceps_curl: [[100, 14], [100, 12]] })];
  const r = suggestWeight(curl, s, { units: 'kg' });
  assert.ok(Math.abs(r.weight - 45.359) < 0.01);
});

test('prefillWeights: mirrors last session per set, or all-up on progression', () => {
  const s = [sess('A', T0, { chest_press: [[90, 12], [90, 11], [85, 10]] })];
  assert.deepEqual(prefillWeights(press, s, 3), [90, 90, 85]);
  const up = [sess('A', T0, { chest_press: [[90, 12], [90, 12], [90, 12]] })];
  assert.deepEqual(prefillWeights(press, up, 3), [95, 95, 95]);
});

// ---------- lastPerformance / notes ----------
test('lastPerformance: before/excludeId filters (editing an old session)', () => {
  const a = sess('A', T0, { chest_press: [[80, 12], [80, 12], [80, 12]] });
  const b = sess('A', T0 + 4 * DAY, { chest_press: [[85, 10], [85, 10], [85, 10]] });
  assert.equal(lastPerformance('chest_press', [a, b]).sets[0].weight, 85);
  assert.equal(lastPerformance('chest_press', [a, b], { before: b.startedAt, excludeId: b.id }).sets[0].weight, 80);
});

test('lastNote: most recent non-empty note', () => {
  const a = sess('A', T0, { leg_press: [[100, 10]] });
  a.entries[0].note = 'seat 4';
  const b = sess('A', T0 + 4 * DAY, { leg_press: [[100, 11]] });
  assert.equal(lastNote('leg_press', [a, b]).note, 'seat 4');
});

// ---------- deload ----------
test('deload: not due with no history', () => {
  const d = deloadStatus({}, [], T0);
  assert.equal(d.due, false);
  assert.equal(d.weeks, 0);
});

test('deload: counts weeks from first session, due at 6', () => {
  const s = [sess('A', T0, {})];
  assert.equal(deloadStatus({}, s, T0 + 5 * WEEK + 6 * DAY).due, false);
  assert.equal(deloadStatus({}, s, T0 + 5 * WEEK + 6 * DAY).weeks, 5);
  const d = deloadStatus({}, s, T0 + 6 * WEEK);
  assert.equal(d.weeks, 6);
  assert.equal(d.due, true);
});

test('deload: "Deload done" resets the counter', () => {
  const s = [sess('A', T0, {})];
  const done = T0 + 7 * WEEK;
  const d = deloadStatus({ lastDeloadAt: done }, s, done + 2 * WEEK);
  assert.equal(d.weeks, 2);
  assert.equal(d.due, false);
  assert.equal(deloadStatus({ lastDeloadAt: done }, s, done + 6 * WEEK).due, true);
});

test('deload: active for 7 days after starting, then counts as done', () => {
  const s = [sess('A', T0, {})];
  const start = T0 + 6 * WEEK;
  const during = deloadStatus({ deloadStartedAt: start }, s, start + 3 * DAY);
  assert.equal(during.active, true);
  assert.equal(during.due, false);
  const after = deloadStatus({ deloadStartedAt: start }, s, start + WEEK + DAY);
  assert.equal(after.active, false);
  assert.equal(after.weeks, 0);
  assert.equal(after.due, false);
  assert.equal(deloadStatus({ deloadStartedAt: start }, s, start + 7 * WEEK).due, true);
});

test('deload: drops one set per exercise (min 1)', () => {
  assert.equal(targetSets(press, true), 2);
  assert.equal(targetSets({ sets: 1 }, true), 1);
  assert.equal(targetSets(press, false), 3);
  const ns = newSession('A', SEED_PROGRAM, [], { deload: true, now: T0 });
  assert.equal(ns.entries[0].sets.length, 2);
  assert.equal(ns.deload, true);
  assert.equal(formatTarget(press, true), '2 × 10–12');
});

// ---------- misc ----------
test('newSession: prefills weights, leaves reps blank, snapshots targets', () => {
  const s = [sess('A', T0, { biceps_curl: [[30, 15], [30, 15]] })];
  const ns = newSession('B', SEED_PROGRAM, s, { now: T0 + 2 * DAY });
  const e = ns.entries.find((x) => x.exerciseId === 'biceps_curl');
  assert.deepEqual(e.sets.map((x) => x.weight), [35, 35]);
  assert.ok(e.sets.every((x) => x.reps === null && !x.done));
  assert.equal(e.target.repMax, 15);
  assert.equal(ns.finishedAt, null);
});

test('sessionsThisWeek counts finished sessions since Monday', () => {
  const s = [
    sess('A', T0 - 2 * DAY, {}), // previous week (Sat)
    sess('B', T0, {}),
    sess('A', T0 + 2 * DAY, {}),
    { ...sess('B', T0 + 3 * DAY, {}), finishedAt: null },
  ];
  assert.equal(sessionsThisWeek(s, T0 + 4 * DAY), 2);
});

test('backupStatus reminds after 14 days', () => {
  const s = [sess('A', T0, {})];
  assert.equal(backupStatus({}, s, T0 + 10 * DAY).show, false);
  assert.equal(backupStatus({}, s, T0 + 15 * DAY).show, true);
  assert.equal(backupStatus({ lastBackupAt: T0 + 10 * DAY }, s, T0 + 15 * DAY).show, false);
});

test('formatSets', () => {
  assert.equal(formatSets([{ weight: 90, reps: 12 }, { weight: 90, reps: 11 }, { weight: 90, reps: 10 }], 'lb'), '90 lb — 12, 11, 10');
  assert.equal(formatSets([{ weight: 90, reps: 12 }, { weight: 85, reps: 10 }], 'lb'), '90 lb × 12 · 85 lb × 10');
  assert.equal(formatSets([{ weight: null, reps: 8 }, { weight: null, reps: 8 }], 'lb', { perSide: true, bodyweight: true }), '8, 8 /side');
});

test('unit helpers', () => {
  assert.equal(convertIncrement(5, 'lb', 'kg'), 2.5);
  assert.equal(convertIncrement(10, 'lb', 'kg'), 5);
  assert.equal(convertIncrement(2.5, 'lb', 'kg'), 1.25);
  assert.equal(convertIncrement(2.5, 'kg', 'lb'), 5);
  assert.equal(convertIncrement(0, 'lb', 'kg'), 0);
  assert.equal(makeExerciseId('Leg Press', new Set(['leg_press'])), 'leg_press_2');
});

test('exerciseHistory is chronological with top weight', () => {
  const s = [
    sess('B', T0 + 2 * DAY, { biceps_curl: [[35, 12], [30, 15]] }),
    sess('A', T0, { biceps_curl: [[30, 15], [30, 15]] }),
  ];
  const h = exerciseHistory('biceps_curl', s);
  assert.deepEqual(h.map((x) => x.top), [30, 35]);
  assert.deepEqual(h.map((x) => x.day), ['A', 'B']);
});

// ---------- mid-session swap ----------
import { swapEntry, makeEntry } from '../app/js/logic.js';

test('swapEntry: untouched exercise is replaced in place', () => {
  const s = newSession('B', SEED_PROGRAM, [], { now: T0 });
  const i = s.entries.findIndex((e) => e.exerciseId === 'hip_thrust');
  const abd = { id: 'hip_abduction', name: 'Hip abduction machine', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 5 };
  const r = swapEntry(s, i, abd, []);
  assert.equal(r.entries.length, s.entries.length);
  assert.equal(r.entries[i].exerciseId, 'hip_abduction');
  assert.equal(r.index, i);
  assert.equal(r.kept, false);
  assert.ok(!r.entries.some((e) => e.exerciseId === 'hip_thrust'));
});

test('swapEntry: exercise with logged sets is kept, new one inserted after', () => {
  const s = newSession('B', SEED_PROGRAM, [], { now: T0 });
  const i = s.entries.findIndex((e) => e.exerciseId === 'hip_thrust');
  s.entries[i].sets[0].reps = 8;
  const abd = { id: 'hip_abduction', name: 'Hip abduction machine', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 5 };
  const r = swapEntry(s, i, abd, []);
  assert.equal(r.entries.length, s.entries.length + 1);
  assert.equal(r.entries[i].exerciseId, 'hip_thrust');
  assert.equal(r.entries[i + 1].exerciseId, 'hip_abduction');
  assert.equal(r.kept, true);
});

test('swapEntry: swapped-in exercise is prefilled from its own history, deload respected', () => {
  const hist = [sess('A', T0, { leg_press: [[100, 12], [100, 12], [100, 12]] })];
  const s = newSession('B', SEED_PROGRAM, hist, { now: T0 + 2 * DAY, deload: true });
  const legPress = SEED_PROGRAM.A[0];
  const r = swapEntry(s, 0, legPress, hist);
  assert.deepEqual(r.entries[0].sets.map((x) => x.weight), [110, 110]);
  assert.equal(makeEntry(legPress, hist).sets.length, 3);
});
