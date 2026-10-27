// One-time program updates, applied on launch to the program stored on the
// device. Each is idempotent: running it on an already-updated program changes
// nothing. `undo: false` means the home-screen notice offers no Undo (the
// previous program can't run in the current app).
//
// The earlier A/B updates (arms-shoulders-2026-10, home-workouts-2026-10) were
// superseded by the 3-day redesign, which replaces the whole program.
import { convertProgramUnits, isDayProgram, allProgramExercises, updateEverywhere } from './logic.js';
import { SEED_PROGRAM } from './seed.js';

/** 3-day full body + Armor (Oct 2026): replaces an A/B program, gym and home. */
export function fullBodyUpdate(program) {
  if (isDayProgram(program)) return { program, changes: [] };
  const unit = program.unit || 'lb';
  const fresh = convertProgramUnits({ ...structuredClone(SEED_PROGRAM), unit: 'lb' }, 'lb', unit);
  return {
    program: fresh,
    changes: [
      'Gym and Home are now full body Mon / Wed / Fri, plus Armor (core, hips, right shoulder) on Tue and Thu',
      'Exercises come in pairs (A1, A2): alternate their sets; the rest timer shows what’s next',
      'New: kickstand RDL, floor glute bridge, row to ER at 90/90, single-arm pulldown, body saw, Copenhagen plank, bird dog, suitcase carry, push-up plus, hip mobility',
      'Holds log seconds, carries log meters, incline push-ups log the bar notch',
      'Exercises you’ve done before keep their history',
    ],
  };
}

const OLD_CUFF_CUE = 'Side-lying ER → horizontal abduction (elbow bent 90°, only to body line) → flexion · progress lever, then weight';

/**
 * Right-shoulder superset cue (Oct 2026): straight-arm horizontal abduction is
 * fine side-lying, where the back of the shoulder carries the load. Only a cue
 * still at the old default changes, so the user's own edit is kept.
 */
export function cuffCueUpdate(program) {
  const ex = allProgramExercises(program).find((x) => x.id === 'side_lying_cuff_supersets');
  if (!ex || ex.cue !== OLD_CUFF_CUE) return { program, changes: [] };
  const cue = allProgramExercises(SEED_PROGRAM).find((x) => x.id === ex.id).cue;
  return {
    program: updateEverywhere(program, ex.id, { ...ex, cue }),
    changes: [`${ex.name}: straight arm side-lying (new cue: “${cue}”)`],
  };
}

export const PROGRAM_UPDATES = [
  { id: 'full-body-3day-2026-10', title: '3-day full body + Armor', apply: fullBodyUpdate, undo: false },
  { id: 'cuff-straight-arm-2026-10', title: 'Shoulder superset cue', apply: cuffCueUpdate },
];
