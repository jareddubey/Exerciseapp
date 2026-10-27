// One-time program updates, applied on launch to the program stored on the
// device. Each is idempotent: running it on an already-updated program changes
// nothing. `undo: false` means the home-screen notice offers no Undo (the
// previous program can't run in the current app).
//
// The earlier A/B updates (arms-shoulders-2026-10, home-workouts-2026-10) were
// superseded by the 3-day redesign, which replaces the whole program.
import { convertProgramUnits, convertIncrement, isDayProgram, allProgramExercises, updateEverywhere, programList, withProgramList, SLOT_KEYS } from './logic.js';
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
      'New: kickstand RDL, floor glute bridge, row to ER at 90/90, single-arm pulldown, reverse pec deck, body saw, Copenhagen plank, bird dog, suitcase carry, supine DB fly (PT), hip mobility',
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

const CUFF_ID = 'side_lying_cuff_supersets';
// Armor as the 3-day update first shipped it.
const OLD_ARMOR = ['copenhagen_plank', 'bird_dog', 'side_plank', 'dead_bug', 'side_lying_cuff_supersets', 'suitcase_carry',
  'push_up_plus', 'db_lateral_raise', 'adductor_rock_back', 'hip_flexor_stretch'];
// Wednesday's row to ER moves to Armor; a light rear-delt drill takes its place.
const WED_SWAP = { gym: ['cable_row_er', 'reverse_pec_deck'], home: ['band_row_er', 'band_pull_apart'] };

/**
 * Shoulder control work on Armor (Oct 2026): light shoulder drills build
 * centering, not muscle, so they live on Armor. Supine DB fly (PT) and row to
 * ER replace push-up plus and the light lateral raise; Wednesday gets a light
 * reverse pec deck (band pull-apart at home). Lifting days start with the
 * shoulder superset as an easy primer, so control work is daily. Only days
 * still in their shipped form change; exercises the user already has keep
 * their name, cue and load.
 */
export function controlWorkUpdate(program) {
  const unit = program.unit || 'lb';
  const fromSeed = (ex) => ({ ...ex, increment: convertIncrement(ex.increment, 'lb', unit) });
  let p = program;
  const changes = [];
  for (const loc of ['gym', 'home']) {
    const label = loc === 'home' ? 'Home ' : '';
    // Daily control work: the shoulder superset as an easy primer on lifting days.
    const primed = [];
    for (const day of ['mon', 'wed', 'fri']) {
      const list = programList(p, day, loc);
      if (list.some((x) => x.id === CUFF_ID)) continue;
      const mine = allProgramExercises(p).find((x) => x.id === CUFF_ID);
      const seedEx = programList(SEED_PROGRAM, day, loc)[0];
      const primer = mine ? { ...mine, ...Object.fromEntries(SLOT_KEYS.map((k) => [k, seedEx[k]])) } : fromSeed(seedEx);
      if (primer.group === undefined) delete primer.group;
      p = withProgramList(p, day, loc, [primer, ...list]);
      primed.push(day.charAt(0).toUpperCase() + day.slice(1));
    }
    if (primed.length) changes.push(`${label}${primed.join(', ')}: right-shoulder superset as an easy primer at the start (2 sets)`);
    const armor = programList(p, 'armor', loc);
    if (armor.map((x) => x.id).join() === OLD_ARMOR.join()) {
      const next = programList(SEED_PROGRAM, 'armor', loc).map((ex) => {
        const mine = armor.find((x) => x.id === ex.id);
        return mine ? { ...mine, ...Object.fromEntries(SLOT_KEYS.map((k) => [k, ex[k]])) } : fromSeed(ex);
      });
      p = withProgramList(p, 'armor', loc, next);
      changes.push(`${label}Armor: supine DB fly (PT) and row to ER at 90/90 replace push-up plus and the light lateral raise`);
    }
    const [from, to] = WED_SWAP[loc];
    const wed = programList(p, 'wed', loc);
    const i = wed.findIndex((x) => x.id === from);
    if (i >= 0 && !wed.some((x) => x.id === to)) {
      const seedEx = programList(SEED_PROGRAM, 'wed', loc).find((x) => x.id === to);
      const next = [...wed];
      next[i] = { ...fromSeed(seedEx), group: wed[i].group };
      p = withProgramList(p, 'wed', loc, next);
      changes.push(`${label}Wed: ${seedEx.name} (light) replaces ${wed[i].name}, which moves to Armor`);
    }
  }
  return { program: p, changes };
}

export const PROGRAM_UPDATES = [
  { id: 'full-body-3day-2026-10', title: '3-day full body + Armor', apply: fullBodyUpdate, undo: false },
  { id: 'cuff-straight-arm-2026-10', title: 'Shoulder superset cue', apply: cuffCueUpdate },
  { id: 'control-work-armor-2026-10', title: 'Shoulder control work on Armor', apply: controlWorkUpdate },
];
