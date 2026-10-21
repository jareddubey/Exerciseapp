import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armsShouldersUpdate } from '../app/js/updates.js';
import { SEED_PROGRAM } from '../app/js/seed.js';

const ex = (id, name, sets, extra = {}) => ({ id, name, sets, repMin: 12, repMax: 15, restSec: 60, increment: 5, cue: '', ...extra });

// The program as it was before this update (original seed).
const OLD = {
  unit: 'lb',
  A: [
    ex('leg_press', 'Leg press', 3), ex('chest_press', 'Chest press machine', 3), ex('cable_row', 'Seated cable row', 3),
    ex('leg_curl', 'Seated leg curl', 2), ex('cable_er', 'Cable external rotation', 2), ex('tri_pushdown', 'Cable triceps pushdown', 2),
    ex('biceps_curl', 'Cable / machine biceps curl', 2), ex('dead_bug', 'Dead bug', 2),
  ],
  B: [
    ex('hack_squat', 'Hack squat', 3), ex('cs_row', 'Chest-supported row', 3), ex('flat_press', 'Flat chest press', 3),
    ex('leg_ext', 'Leg extension', 2), ex('hip_abduction', 'Hip abduction machine', 2), ex('biceps_curl', 'Cable / machine biceps curl', 2),
    ex('calf_raise', 'Seated calf raise', 2), ex('pallof', 'Cable Pallof press', 2),
  ],
};
const ids = (list) => list.map((x) => x.id);

test('arms & shoulders update: applies all changes, keeps user edits', () => {
  const { program, changes } = armsShouldersUpdate(OLD);
  assert.deepEqual(ids(program.A), ['leg_press', 'chest_press', 'cable_row', 'lateral_raise', 'leg_curl', 'cable_er', 'tri_pushdown', 'biceps_curl', 'dead_bug']);
  assert.deepEqual(ids(program.B), ['hack_squat', 'cs_row', 'flat_press', 'leg_ext', 'hip_abduction', 'biceps_curl', 'cable_tri_ext', 'lateral_raise', 'pallof']);
  assert.equal(program.A.find((x) => x.id === 'tri_pushdown').sets, 3);
  assert.equal(program.A.find((x) => x.id === 'biceps_curl').sets, 3);
  assert.equal(program.B.find((x) => x.id === 'biceps_curl').sets, 3);
  assert.equal(program.A.find((x) => x.id === 'lateral_raise').sets, 3);
  assert.equal(changes.length, 5);
  assert.ok(changes.includes('A & B: Cable / machine biceps curl 2 → 3 sets'));
  assert.equal(OLD.A.length, 8, 'input not mutated');
});

test('arms & shoulders update: idempotent, and a no-op on the new seed', () => {
  const once = armsShouldersUpdate(OLD).program;
  assert.deepEqual(armsShouldersUpdate(once).changes, []);
  assert.deepEqual(armsShouldersUpdate({ ...SEED_PROGRAM, unit: 'lb' }).changes, []);
});

test('arms & shoulders update: kg program gets kg increments', () => {
  const { program } = armsShouldersUpdate({ ...OLD, unit: 'kg' });
  assert.equal(program.A.find((x) => x.id === 'lateral_raise').increment, 1.25);
});

test('arms & shoulders update: no calf raise → lateral raise inserted before core', () => {
  const noCalf = { ...OLD, B: OLD.B.filter((x) => x.id !== 'calf_raise') };
  const { program } = armsShouldersUpdate(noCalf);
  assert.deepEqual(ids(program.B).slice(-4), ['biceps_curl', 'cable_tri_ext', 'lateral_raise', 'pallof']);
});
