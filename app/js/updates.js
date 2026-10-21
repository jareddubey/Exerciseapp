// One-time program updates, applied on launch to the program stored on the
// device. Each works by exercise id so the user's own edits are preserved,
// and is idempotent: running it on an already-updated program changes nothing.
import { convertIncrement } from './logic.js';

const LATERAL_RAISE = {
  id: 'lateral_raise', name: 'Cable lateral raise', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5,
  cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward',
};
const TRI_EXT = {
  id: 'cable_tri_ext', name: 'Cable triceps extension', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 2.5,
  cue: 'Single arm · elbow still at side · squeeze at lockout',
};

const withUnit = (ex, unit) => ({ ...ex, increment: convertIncrement(ex.increment, 'lb', unit || 'lb') });

function insertAfter(list, afterIds, ex) {
  for (const id of afterIds) {
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) { list.splice(i + 1, 0, ex); return; }
  }
  // fall back: before the core exercise at the end, else append
  const core = list.findIndex((x) => x.id === 'pallof' || x.id === 'dead_bug');
  if (core >= 0) list.splice(core, 0, ex); else list.push(ex);
}

function setSets(list, id, sets, changes, label) {
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0 && list[i].sets < sets) {
    changes.push(`${label}: ${list[i].name} ${list[i].sets} → ${sets} sets`);
    list[i] = { ...list[i], sets };
  }
}

/** Arms & shoulders focus (Oct 2026). Returns { program, changes }. */
export function armsShouldersUpdate(program) {
  const unit = program.unit || 'lb';
  const A = [...program.A];
  const B = [...program.B];
  const changes = [];
  const lat = withUnit(LATERAL_RAISE, unit);

  if (!A.some((x) => x.id === lat.id)) {
    insertAfter(A, ['cable_row', 'chest_press'], { ...lat });
    changes.push('A: added Cable lateral raise 3 × 12–20');
  }
  setSets(A, 'tri_pushdown', 3, changes, 'A');

  if (!B.some((x) => x.id === lat.id)) {
    const calf = B.findIndex((x) => x.id === 'calf_raise');
    if (calf >= 0) {
      B[calf] = { ...lat };
      changes.push('B: Seated calf raise → Cable lateral raise 3 × 12–20');
    } else {
      insertAfter(B, ['biceps_curl'], { ...lat });
      changes.push('B: added Cable lateral raise 3 × 12–20');
    }
  }
  if (!B.some((x) => x.id === TRI_EXT.id)) {
    insertAfter(B, ['biceps_curl'], withUnit(TRI_EXT, unit));
    changes.push('B: added Cable triceps extension 2 × 12–15');
  }

  const bicepsBefore = changes.length;
  setSets(A, 'biceps_curl', 3, changes, 'A');
  setSets(B, 'biceps_curl', 3, changes, 'B');
  if (changes.length - bicepsBefore === 2) {
    changes.splice(bicepsBefore, 2, changes[bicepsBefore].replace(/^A: /, 'A & B: '));
  }

  return { program: { ...program, A, B }, changes };
}

export const PROGRAM_UPDATES = [{ id: 'arms-shoulders-2026-10', title: 'Arms & shoulders focus', apply: armsShouldersUpdate }];
