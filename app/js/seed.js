// Default program: full body Mon/Wed/Fri plus Armor (core, hips, right
// shoulder) on Tue/Thu, at the gym and at home. Editable in-app; this is used
// on first launch and by the 3-day update (updates.js).
//
// Built around a sensitive lower back (no axial loading, stop before the
// pelvis tucks), a stiff left hip, and a right shoulder that dislikes
// end-range overhead and straight-arm horizontal abduction.
//
// Each exercise below is its identity (name, cue, load), shared everywhere it
// appears so its history is shared. `p()` adds the per-day prescription:
// sets, rep range, rest, and pair. A pair is two exercises with the same
// group letter: alternate their sets. restSec is the rest after that
// exercise, before the next one in the pair.

const p = (ex, sets, repMin, repMax, restSec, group) => ({ ...ex, sets, repMin, repMax, restSec, group });

// ---------- gym ----------
const HACK = { id: 'hack_squat', name: 'Hack squat', increment: 10, cue: 'Warm-up sets first, as straight sets · back flat on pad · stop before pelvis tucks' };
const PALLOF = { id: 'pallof', name: 'Cable Pallof press', increment: 2.5, perSide: true, cue: 'Resist the rotation · ribs down · slow' };
const INCLINE = { id: 'incline_press', name: 'Low-incline machine press', increment: 5, cue: '15–30° · neutral grip · stop handles at torso, elbows ~45° · flat press if it irritates' };
const CS_ROW = { id: 'cs_row', name: 'Chest-supported row', increment: 5, cue: 'Neutral grip · stop elbows at the torso line, no yanking past' };
const LEG_CURL = { id: 'leg_curl', name: 'Seated leg curl', increment: 5, cue: '' };
const LATERAL = { id: 'db_lateral_raise', name: 'DB lateral raise', increment: 2.5, perHand: true, cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward' };
const CURL = { id: 'biceps_curl', name: 'Cable biceps curl', increment: 5, cue: 'Arms in front, elbows still · add reps and slow the lowering before adding weight' };
const PUSHDOWN = { id: 'tri_pushdown', name: 'Rope triceps pushdown', increment: 5, cue: 'Elbows pinned · spread the rope at the bottom' };
const KICKSTAND = { id: 'kickstand_rdl', name: 'Kickstand RDL', increment: 5, perSide: true, cue: 'One DB in front, both hands · 3 s down · stop when the pelvis stops tipping (tap the box) · lower the box as the hip opens' };
const LAT_PD = { id: 'lat_pull_down', name: 'Lat pulldown (neutral grip)', increment: 5, cue: 'Light · full stretch only as far as the shoulder is happy' };
const LEG_PRESS = { id: 'leg_press', name: 'Leg press', increment: 10, cue: 'Feet high, a bit wider, toes slightly out · stop before pelvis tucks' };
const PUSH_UP = { id: 'push_up', name: 'Incline push-up', increment: 0, notch: true, cue: 'Bar in a rack · 3 × 15 at one height → drop the bar a notch · elbows ~45°' };
const BRIDGE = { id: 'glut_bridge', name: 'Floor glute bridge', increment: 0, bodyweight: true, cue: 'Ribs down · stop with hips in line with torso, no arch · then band → DB on hips → single-leg' };
const ROW_ER = { id: 'cable_row_er', name: 'Cable row to ER at 90/90', increment: 2.5, perSide: true, cue: 'Light, slow · elbow ~30° forward of straight out · stop rotating before any front-of-shoulder pinch' };
const HAMMER = { id: 'hammer_curl', name: 'Hammer curl', increment: 5, perHand: true, cue: '' };
const SA_PUSHDOWN = { id: 'cable_tri_ext', name: 'Single-arm cable pushdown', increment: 2.5, perSide: true, cue: 'D-handle · elbow still at your side · squeeze at lockout' };
const SA_PULLDOWN = { id: 'single_arm_pulldown', name: 'Single-arm cable pulldown', increment: 2.5, perSide: true, cue: 'D-handle, seated or half-kneeling · elbow to back pocket · or swap for a close-grip V-handle pulldown' };
const CHEST_PRESS = { id: 'chest_press', name: 'Chest press machine', increment: 5, cue: 'Flat · neutral grip · stop handles at torso' };
const LEG_EXT = { id: 'leg_ext', name: 'Leg extension', increment: 5, cue: 'If it stalls, check seat depth and pad position' };
const PREACHER = { id: 'preacher_machine', name: 'Preacher curl machine', increment: 5, cue: '' };
const BODY_SAW = { id: 'body_saw', name: 'Body saw', increment: 0, bodyweight: true, measure: 'time', cue: 'Forearm plank, feet on sliders or a towel · rock 2–3 in back and forth · plain plank if the shoulder complains' };

// ---------- armor (same at the gym and at home) ----------
const COPENHAGEN = { id: 'copenhagen_plank', name: 'Copenhagen plank', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Short lever: knee on the bench · body straight · long lever once 30 s is easy' };
const BIRD_DOG = { id: 'bird_dog', name: 'Bird dog', increment: 0, bodyweight: true, perSide: true, cue: '10-s hold each rep · brace, no sagging or hip rotation' };
const SIDE_PLANK = { id: 'side_plank', name: 'Side plank', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Straight line, hips up · on your knees if the right shoulder complains' };
const DEAD_BUG = { id: 'dead_bug', name: 'Dead bug', increment: 0, bodyweight: true, perSide: true, cue: "Brace, ribs down, keep natural low-back curve (don't press flat) · slow · arms only as far overhead as is comfortable" };
const CUFF = { id: 'side_lying_cuff_supersets', name: 'Right-shoulder superset', increment: 1, cue: 'Side-lying, straight arm: ER → horizontal abduction → flexion · progress reps, then weight' };
const CARRY = { id: 'suitcase_carry', name: 'Suitcase carry', increment: 5, perHand: true, perSide: true, measure: 'distance', cue: 'One DB at your side · stand tall, don’t lean · slow steps' };
const PUSH_UP_PLUS = { id: 'push_up_plus', name: 'Incline push-up plus', increment: 0, bodyweight: true, cue: 'Hands on a bench or wall · at the top, push your shoulder blades apart' };
const ADDUCTOR_RB = { id: 'adductor_rock_back', name: 'Adductor rock-back', increment: 0, bodyweight: true, perSide: true, cue: 'Hands and knees, one leg out to the side · rock back with the spine still · stop before the back rounds' };
const HIP_FLEXOR = { id: 'hip_flexor_stretch', name: 'Half-kneeling hip flexor stretch', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Squeeze the back-leg glute · ribs down · extra set on the left' };

const armor = () => [
  p(COPENHAGEN, 3, 15, 30, 30, 'A'), p(BIRD_DOG, 3, 6, 6, 45, 'A'),
  p(SIDE_PLANK, 3, 30, 60, 30, 'B'), p(DEAD_BUG, 3, 8, 8, 45, 'B'),
  p(CUFF, 3, 12, 15, 30, 'C'), p(CARRY, 3, 30, 40, 60, 'C'),
  p(PUSH_UP_PLUS, 2, 12, 15, 30, 'D'), p(LATERAL, 2, 15, 20, 45, 'D'),
  p(ADDUCTOR_RB, 2, 8, 8, 20, 'E'), p(HIP_FLEXOR, 2, 30, 30, 30, 'E'),
];

// ---------- home: dumbbells, bands, a pull-up bar and an incline bench ----------
const GOBLET = { id: 'goblet_squat', name: 'Goblet squat to bench', increment: 5, cue: 'Tap the bench, don\'t sit · torso tall, ribs down · stop before pelvis tucks' };
const BAND_PALLOF = { id: 'band_pallof', name: 'Band Pallof press', increment: 0, band: true, perSide: true, cue: 'Band at chest height · resist the rotation · slow' };
const INCLINE_DB = { id: 'incline_db_press', name: 'Incline DB press', increment: 5, perHand: true, cue: 'Low incline (15–30°) · neutral grip · stop at chest, elbows ~45°' };
const DB_ROW = { id: 'db_chest_supported_row', name: 'Chest-supported incline DB row', increment: 5, perHand: true, cue: 'Chest on ~30° bench · neutral grip · no shrug' };
const BAND_LEG_CURL = { id: 'band_leg_curl', name: 'Seated band leg curl', increment: 0, band: true, cue: 'Band anchored low in front · curl heel under the bench · slow return' };
const STANDING_CURL = { id: 'standing_bicep_curl', name: 'Standing bicep curl', increment: 5, perHand: true, cue: 'Elbows still at your sides' };
const BAND_PUSHDOWN = { id: 'band_pushdown', name: 'Band triceps pushdown', increment: 0, band: true, cue: 'Band over the pull-up bar · elbows pinned' };
const BAND_LAT = { id: 'band_lat_pulldown', name: 'Band lat pulldown', increment: 0, band: true, cue: 'Band over the pull-up bar · half-kneeling · neutral grip · elbows to ribs' };
const LUNGE = { id: 'step_back_lunge', name: 'Step-back lunge', increment: 5, perHand: true, perSide: true, cue: 'DBs at your sides · step back, torso tall · shorter step if the left hip complains' };
const BAND_ROW_ER = { id: 'band_row_er', name: 'Band row to ER at 90/90', increment: 0, band: true, perSide: true, cue: 'Band at chest height · elbow ~30° forward of straight out · stop before any pinch' };
const DB_BENCH = { id: 'db_bench_press', name: 'DB bench press', increment: 5, perHand: true, cue: 'Neutral grip · stop at chest · feet down, no big arch' };
const BAND_LEG_EXT = { id: 'band_leg_extension', name: 'Seated band leg extension', increment: 0, band: true, perSide: true, cue: 'Band anchored behind the bench leg · squeeze at the top' };
const CONC_CURL = { id: 'concentration_curl', name: 'Concentration curl', increment: 5, perHand: true, perSide: true, cue: 'Seated, upper arm braced on the inner thigh · arm in front, like a preacher curl' };

export const HOME_PROGRAM = {
  mon: [
    p(GOBLET, 3, 10, 15, 60, 'A'), p(BAND_PALLOF, 3, 10, 10, 60, 'A'),
    p(INCLINE_DB, 3, 10, 12, 45, 'B'), p(DB_ROW, 3, 10, 12, 90, 'B'),
    p(BAND_LEG_CURL, 3, 12, 20, 30, 'C'), p(LATERAL, 3, 12, 20, 60, 'C'),
    p(STANDING_CURL, 3, 10, 15, 30, 'D'), p(BAND_PUSHDOWN, 3, 12, 20, 60, 'D'),
  ],
  wed: [
    p(KICKSTAND, 3, 8, 10, 60, 'A'), p(BAND_LAT, 3, 12, 20, 90, 'A'),
    p(LUNGE, 3, 8, 12, 45, 'B'), p(PUSH_UP, 3, 8, 15, 90, 'B'),
    p(BRIDGE, 3, 12, 20, 30, 'C'), p(BAND_ROW_ER, 2, 12, 15, 60, 'C'),
    p(HAMMER, 3, 10, 12, 30, 'D'), p(BAND_PUSHDOWN, 2, 12, 20, 60, 'D'),
  ],
  fri: [
    p(GOBLET, 2, 12, 15, 60, 'A'), p(BAND_PALLOF, 2, 10, 10, 60, 'A'),
    p(BAND_LAT, 3, 12, 20, 45, 'B'), p(DB_BENCH, 3, 10, 12, 90, 'B'),
    p(BAND_LEG_EXT, 3, 15, 25, 30, 'C'), p(BAND_LEG_CURL, 2, 12, 20, 60, 'C'),
    p(LATERAL, 3, 12, 20, 30, 'D'), p(BAND_PUSHDOWN, 3, 12, 20, 60, 'D'),
    p(CONC_CURL, 3, 10, 15, 30, 'E'), p(BODY_SAW, 3, 20, 30, 60, 'E'),
  ],
  armor: armor(),
};

export const SEED_PROGRAM = {
  mon: [
    p(HACK, 3, 6, 10, 60, 'A'), p(PALLOF, 3, 10, 10, 60, 'A'),
    p(INCLINE, 3, 8, 12, 45, 'B'), p(CS_ROW, 3, 8, 12, 90, 'B'),
    p(LEG_CURL, 3, 10, 15, 30, 'C'), p(LATERAL, 3, 12, 20, 60, 'C'),
    p(CURL, 3, 10, 15, 30, 'D'), p(PUSHDOWN, 3, 10, 15, 60, 'D'),
  ],
  wed: [
    p(KICKSTAND, 3, 8, 10, 60, 'A'), p(LAT_PD, 3, 10, 12, 90, 'A'),
    p(LEG_PRESS, 3, 10, 15, 45, 'B'), p(PUSH_UP, 3, 8, 15, 90, 'B'),
    p(BRIDGE, 3, 12, 20, 30, 'C'), p(ROW_ER, 2, 12, 15, 60, 'C'),
    p(HAMMER, 3, 10, 12, 30, 'D'), p(SA_PUSHDOWN, 2, 12, 15, 60, 'D'),
  ],
  fri: [
    p(HACK, 2, 12, 15, 60, 'A'), p(PALLOF, 2, 10, 10, 60, 'A'),
    p(SA_PULLDOWN, 3, 10, 12, 45, 'B'), p(CHEST_PRESS, 3, 10, 12, 90, 'B'),
    p(LEG_EXT, 3, 12, 15, 30, 'C'), p(LEG_CURL, 2, 12, 15, 60, 'C'),
    p(LATERAL, 3, 12, 20, 30, 'D'), p(PUSHDOWN, 3, 12, 15, 60, 'D'),
    p(PREACHER, 3, 10, 15, 30, 'E'), p(BODY_SAW, 3, 20, 30, 60, 'E'),
  ],
  armor: armor(),
  home: HOME_PROGRAM,
};

// Shown at the top of a session and in the program editor.
const WARMUP = 'Warm-up, about 7 min: 3 min bike or brisk walk · quadruped rock-back ×8 · 90/90 hip switches ×6/side · bird dog ×5/side · one light round of the right-shoulder superset.';
const PAIRS = 'Pairs (A1, A2): alternate their sets. The rest timer shows what’s next.';
export const DAY_NOTES = {
  mon: [WARMUP, PAIRS],
  wed: [WARMUP, PAIRS],
  fri: [WARMUP, PAIRS],
  armor: [PAIRS, 'Then 30–40 min Zone 2 cardio: incline walk or bike, at a pace where you can still talk.'],
};

export const DEFAULT_SETTINGS = {
  units: 'lb',
  beep: true,
  lastDeloadAt: null,
  deloadStartedAt: null,
  lastBackupAt: null,
  location: 'gym',
};
