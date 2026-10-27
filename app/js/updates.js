// One-time program updates, applied on launch to the program stored on the
// device. Each is idempotent: running it on an already-updated program changes
// nothing. `undo: false` means the home-screen notice offers no Undo (the
// previous program can't run in the current app).
//
// The earlier A/B updates (arms-shoulders-2026-10, home-workouts-2026-10) were
// superseded by the 3-day redesign, which replaces the whole program.
import { convertProgramUnits, convertIncrement, isDayProgram, allProgramExercises, updateEverywhere, programList, withProgramList, SLOT_KEYS, SLOTS } from './logic.js';
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

const STRAIGHT_ARM_CUE = 'Side-lying, straight arm: ER → horizontal abduction → flexion · progress reps, then weight';
const OLD_CUFF_CUE = 'Side-lying ER → horizontal abduction (elbow bent 90°, only to body line) → flexion · progress lever, then weight';

/**
 * Right-shoulder superset cue (Oct 2026): straight-arm horizontal abduction is
 * fine side-lying, where the back of the shoulder carries the load. Only a cue
 * still at the old default changes, so the user's own edit is kept.
 */
export function cuffCueUpdate(program) {
  const ex = allProgramExercises(program).find((x) => x.id === 'side_lying_cuff_supersets');
  if (!ex || ex.cue !== OLD_CUFF_CUE) return { program, changes: [] };
  const cue = STRAIGHT_ARM_CUE; // cuffDoseUpdate takes it from here to the current cue
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
      const mine = allProgramExercises(p).find((x) => x.id === CUFF_ID)
        || fromSeed(programList(SEED_PROGRAM, 'armor', loc).find((x) => x.id === CUFF_ID));
      const primer = { ...mine, sets: 2, repMin: 10, repMax: 12, restSec: 30 };
      delete primer.group;
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

// Mon/Wed/Fri as the control-work update left them.
const SHIPPED_DAYS = {
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
// Default cues this update rewrites (a cue the user edited is kept).
const OLD_CUES = { standing_bicep_curl: 'Elbows still at your sides', chest_press: 'Flat · neutral grip · stop handles at torso', preacher_machine: '' };
const PAIRING_CHANGES = {
  gym: [
    'Mon/Fri: shoulder primer is A2 with hack squat (same room); Pallof moves to Monday with hammer curls, off Friday',
    'Mon: flat chest press machine replaces the low-incline press; Fri: half-kneeling landmine press replaces the chest press',
    'Curls and hammer curls every lifting day, 2 sets each: standing DB curl Mon/Wed, preacher Fri',
  ],
  home: [
    'Home Mon/Fri: shoulder primer is A2 with the goblet squat; band Pallof moves to Monday, off Friday',
    'Home Mon: DB bench press; Fri: incline DB press',
    'Home: curls and hammer curls every lifting day, 2 sets each',
  ],
};

/**
 * Pairing and curls (Oct 2026): the primer pairs with the first squat (the
 * hack squat is in a different room from the cables), flat machine press on
 * Monday and landmine press on Friday, and both curl types 3×/week. Days still
 * in their shipped form are replaced; exercises the user already has keep
 * their name, cue and load.
 */
export function pairingUpdate(program) {
  const unit = program.unit || 'lb';
  const existing = new Map(allProgramExercises(program).map((x) => [x.id, x]));
  let p = program;
  const changes = [];
  for (const loc of ['gym', 'home']) {
    let changed = false;
    for (const day of ['mon', 'wed', 'fri']) {
      if (programList(p, day, loc).map((x) => x.id).join() !== SHIPPED_DAYS[loc][day].join()) continue;
      const next = programList(SEED_PROGRAM, day, loc).map((ex) => {
        const mine = existing.get(ex.id);
        if (!mine) return { ...ex, increment: convertIncrement(ex.increment, 'lb', unit) };
        const out = { ...mine };
        for (const k of SLOT_KEYS) { if (ex[k] === undefined) delete out[k]; else out[k] = ex[k]; }
        if (OLD_CUES[out.id] === out.cue) out.cue = ex.cue;
        return out;
      });
      p = withProgramList(p, day, loc, next);
      changed = true;
    }
    if (changed) changes.push(...PAIRING_CHANGES[loc]);
  }
  // keep a rewritten cue the same on every day the exercise appears
  for (const id of Object.keys(OLD_CUES)) {
    const ex = allProgramExercises(p).find((x) => x.id === id && x.cue !== OLD_CUES[id]);
    if (ex) p = updateEverywhere(p, id, ex);
  }
  return { program: p, changes };
}

/**
 * Supported dead bug (Oct 2026): the left adductor and hip flexor grip when the
 * legs hold 90-90, so Armor's dead bug becomes a two-week supported version
 * (legs on a bench, then hand-to-knee press). It takes the dead bug's place
 * and pair; the dead bug's history stays, ready to swap back in.
 */
export function supportedDeadBugUpdate(program) {
  let p = program;
  const changes = [];
  for (const loc of ['gym', 'home']) {
    const list = programList(p, 'armor', loc);
    const i = list.findIndex((x) => x.id === 'dead_bug');
    if (i < 0 || list.some((x) => x.id === 'supported_dead_bug')) continue;
    const seedEx = programList(SEED_PROGRAM, 'armor', loc).find((x) => x.id === 'supported_dead_bug');
    const next = [...list];
    next[i] = { ...seedEx, group: list[i].group };
    p = withProgramList(p, 'armor', loc, next);
    changes.push(`${loc === 'home' ? 'Home ' : ''}Armor: supported dead bug replaces the dead bug for 2 weeks (wk 1 legs on a bench, wk 2 hand-to-knee press)`);
  }
  return { program: p, changes };
}

/**
 * Right-shoulder superset dose (Oct 2026): horizontal abduction and flexion
 * only, at 1 lb with pauses, since ER is easy and 2 lb straight-arm aches at the
 * front of the shoulder. Armor is the hard dose (3 × 8–15), primers stay easy
 * (2 × 8–10), and load goes up 0.5 lb at a time. Only a superset still at its
 * shipped cue changes, so the user's own edit is kept.
 */
export function cuffDoseUpdate(program) {
  const ex = allProgramExercises(program).find((x) => x.id === CUFF_ID);
  if (!ex || ex.cue !== STRAIGHT_ARM_CUE) return { program, changes: [] };
  const seedEx = allProgramExercises(SEED_PROGRAM).find((x) => x.id === CUFF_ID);
  const unit = program.unit || 'lb';
  let p = updateEverywhere(program, CUFF_ID, { ...ex, cue: seedEx.cue, increment: convertIncrement(seedEx.increment, 'lb', unit) });
  for (const [loc, day] of SLOTS) {
    if (loc === 'home' && !p.home) continue;
    const list = programList(p, day, loc);
    const i = list.findIndex((x) => x.id === CUFF_ID);
    if (i < 0) continue;
    const [repMin, repMax] = day === 'armor' ? [8, 15] : [8, 10];
    const next = [...list];
    next[i] = { ...list[i], repMin, repMax };
    p = withProgramList(p, day, loc, next);
  }
  return {
    program: p,
    changes: [
      `${ex.name}: horizontal abduction and flexion only, 1 lb, 2-s pause up and 3-s down (ER is covered by the row to ER)`,
      'Armor is its hard dose (3 × 8–15); the lifting-day primer stays easy (2 × 8–10)',
      'Goal 3 × 15 with 3-s holds, then 1.5 lb: load goes up 0.5 lb at a time',
    ],
  };
}

export const PROGRAM_UPDATES = [
  { id: 'full-body-3day-2026-10', title: '3-day full body + Armor', apply: fullBodyUpdate, undo: false },
  { id: 'cuff-straight-arm-2026-10', title: 'Shoulder superset cue', apply: cuffCueUpdate },
  { id: 'control-work-armor-2026-10', title: 'Shoulder control work on Armor', apply: controlWorkUpdate },
  { id: 'pairing-curls-2026-10', title: 'Pairs by room, landmine press, curls 3×/week', apply: pairingUpdate },
  { id: 'supported-dead-bug-2026-10', title: 'Supported dead bug on Armor', apply: supportedDeadBugUpdate },
  { id: 'cuff-dose-2026-10', title: 'Right-shoulder superset dose', apply: cuffDoseUpdate },
];
