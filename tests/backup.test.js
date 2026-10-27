import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, parseImport, planImport, toCSV, programsEqual } from '../app/js/backup.js';
import { SEED_PROGRAM, DEFAULT_SETTINGS } from '../app/js/seed.js';

const session = (id, extra = {}) => ({
  id, day: 'A', startedAt: new Date(2026, 0, 5, 18).getTime(), finishedAt: new Date(2026, 0, 5, 19).getTime(),
  deload: false, unit: 'lb',
  entries: [{ exerciseId: 'leg_press', name: 'Leg press', note: 'seat 4, "high"', sets: [
    { weight: 100, reps: 12, done: true }, { weight: 100, reps: 11, done: true }, { weight: 100, reps: null, done: false },
  ] }],
  ...extra,
});

test('export → parse round-trips', () => {
  const data = buildExport({ program: SEED_PROGRAM, settings: DEFAULT_SETTINGS, sessions: [session('a')] });
  const back = parseImport(JSON.stringify(data));
  assert.deepEqual(back.sessions, [session('a')]);
  assert.ok(programsEqual(back.program, SEED_PROGRAM));
});

test('parseImport rejects junk', () => {
  assert.throws(() => parseImport('nope'), /JSON/);
  assert.throws(() => parseImport('{"format":"other"}'), /not a Gym Tracker/);
  assert.throws(() => parseImport(JSON.stringify({ format: 'ab-gym-tracker', sessions: [{ id: 1 }] })), /malformed/);
});

test('planImport merges by id and flags conflicts', () => {
  const mine = [session('a'), session('b')];
  const incoming = [session('a'), session('b', { day: 'B' }), session('c')];
  const plan = planImport(mine, incoming);
  assert.deepEqual(plan.added.map((s) => s.id), ['c']);
  assert.deepEqual(plan.conflicts.map((s) => s.id), ['b']);
  assert.equal(plan.identical, 1);
});

test('planImport ignores key order', () => {
  const s = session('a');
  const reordered = Object.fromEntries(Object.entries(s).reverse());
  assert.equal(planImport([s], [reordered]).identical, 1);
});

test('CSV: one row per performed set, escaped note', () => {
  const csv = toCSV([session('a'), { ...session('z'), finishedAt: null }]);
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'date,session,exercise,set,weight,reps,note,unit,deload,location');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '2026-01-05,A,Leg press,1,100,12,"seat 4, ""high""",lb,0,gym');
});

// ---------- older backups ----------

test('v3 export: day sessions and programs validate, no cut', () => {
  const data = buildExport({ program: SEED_PROGRAM, settings: DEFAULT_SETTINGS, sessions: [session('m', { day: 'armor', location: 'home' })] });
  assert.equal(data.version, 3);
  assert.equal('cut' in data, false);
  const back = parseImport(JSON.stringify(data));
  assert.equal(back.sessions[0].day, 'armor');
  assert.equal(back.program.home.armor.length, SEED_PROGRAM.home.armor.length);
  const bad = buildExport({ program: { ...SEED_PROGRAM, home: { ...SEED_PROGRAM.home, fri: 'nope' } }, settings: {}, sessions: [] });
  assert.throws(() => parseImport(JSON.stringify(bad)), /program is malformed/);
  assert.throws(() => parseImport(JSON.stringify({ ...data, sessions: [session('x', { day: 'sat' })] })), /malformed/);
});

test('v2 backups (A/B program, cut data) still parse', () => {
  const ab = { A: [{ id: 'leg_press', name: 'Leg press' }], B: [], home: { A: [], B: [] }, unit: 'lb' };
  const v2 = { format: 'ab-gym-tracker', version: 2, program: ab, settings: DEFAULT_SETTINGS, sessions: [session('a')], cut: { weighins: {} } };
  const back = parseImport(JSON.stringify(v2));
  assert.equal(back.sessions.length, 1);
  assert.equal(back.program.A.length, 1);
  assert.ok(!programsEqual(back.program, SEED_PROGRAM));
});
