// Default program: full body Mon/Wed/Fri plus Armor (core, hips, right
// shoulder) on Tue/Thu, at the gym and at home, in straight sets. Editable
// in-app; this is used on first launch and by the straight-sets update
// (updates.js). The paired program before it is in programs/paired-2026-10.js.
//
// Two goals, during a small calorie deficit:
// 1. Hips and shoulder. The right leg doesn't yet support a hinge: the front
//    and side of the right hip grip, and a right-foot-forward kickstand RDL
//    loads the left low back. Copenhagens (right ×2) wake the right adductor
//    magnus right before the legs every lifting day, the dowel kickstand hinge
//    practises the pattern daily, and single-leg work starts on the right.
//    The left hip pinches at the front in deep flexion, so depth stops short
//    of it. Right biceps tenodesis + labral debridement June 19 2026: curls,
//    rows and pulldowns stay within the PT's limits; daily shoulder control
//    work (easy primer on lifting days, the full dose on Armor) and a daily
//    posterior capsule stretch, alternating sleeper and cross-body.
// 2. Keep (or build) muscle: about 9–12 hard sets a week for the big muscle
//    groups, with the loads kept heavy. Monday is the heavier day, Friday the
//    lighter one (prefill and progression follow each day's own history).
//
// Also built around a sensitive lower back (no axial loading, stop before the
// pelvis tucks) and a right shoulder that dislikes end-range overhead and
// anterior pinch (remplissage ~10 yr ago).
//
// Each exercise below is its identity (name, cue, load), shared everywhere it
// appears so its history is shared. `p()` adds the per-day prescription:
// sets, rep range and rest (the rest after each set). No pairs: every
// exercise is straight sets.

const p = (ex, sets, repMin, repMax, restSec) => ({ ...ex, sets, repMin, repMax, restSec });

// ---------- warm-up and rehab, every day ----------
// Shoulder first (sleeper stretch, then the easy primer), then the hip primer
// right before the legs: Copenhagens and the dowel kickstand hinge.
const SLEEPER = { id: 'sleeper_stretch', name: 'Sleeper stretch (right)', increment: 0, bodyweight: true, measure: 'time', cue: 'Lie on the right side, rolled back 20–30°, elbow a bit below shoulder height · left hand eases the forearm toward the floor · stretch at the back of the shoulder, never a front pinch' };
// Horizontal abduction and flexion only: ER is easy and the row to ER covers it,
// and a straight arm past 1 lb aches at the front of the shoulder.
const CUFF = { id: 'side_lying_cuff_supersets', name: 'Right-shoulder superset', increment: 0.5, cue: 'Side-lying, straight arm, 1 lb: horizontal abduction, stop at the body line → flexion, stop short of overhead, before any pinch · 2-s pause up, 3-s down · end the set when form slips (shrug, trunk rolls back, elbow bends)' };
// Sets 1–2 work the right adductors (an old proximal adductor magnus injury
// leaves them sleepy), set 3 the left, whose adductor already grips.
const COPENHAGEN = { id: 'copenhagen_plank', name: 'Copenhagen plank', increment: 0, bodyweight: true, measure: 'time', cue: 'Sets 1–2 right leg on the bench, set 3 left · short lever: knee on the bench · body straight · a primer before the legs: stop with ~10 s left · long lever once 30 s is easy' };
const DOWEL_HINGE = { id: 'dowel_kickstand_hinge', name: 'Dowel kickstand hinge', increment: 0, bodyweight: true, perSide: true, cue: 'Right side first · dowel along the spine, touching head, upper back and tailbone · kickstand stance, weight on the front foot · hips back until the front hamstring loads, then push the floor away to stand · stop just before the tailbone leaves the dowel (that’s the low back moving)' };

const primers = () => [
  p(SLEEPER, 3, 30, 30, 15),
  p(CUFF, 2, 8, 10, 30),
  p(COPENHAGEN, 3, 15, 30, 30),
  p(DOWEL_HINGE, 1, 6, 8, 30),
];

// ---------- gym ----------
const HACK = { id: 'hack_squat', name: 'Hack squat', increment: 10, cue: 'Warm-up sets first · back flat on pad · feet a bit higher and wider if the left hip pinches · stop before pelvis tucks' };
const CHEST_PRESS = { id: 'chest_press', name: 'Chest press machine', increment: 5, cue: 'Flat · neutral grip · stop handles at torso, elbows ~45°' };
const CS_ROW = { id: 'cs_row', name: 'Chest-supported row', increment: 5, cue: 'Neutral grip · stop elbows at the torso line, no yanking past' };
const LEG_CURL = { id: 'leg_curl', name: 'Seated leg curl', increment: 5, cue: '' };
const LATERAL = { id: 'db_lateral_raise', name: 'DB lateral raise', increment: 2.5, perHand: true, cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward' };
const STANDING_CURL = { id: 'standing_bicep_curl', name: 'Standing bicep curl', increment: 5, perHand: true, cue: 'Elbows at your sides · don’t let them drift back at the bottom · add reps before weight' };
const HAMMER = { id: 'hammer_curl', name: 'Hammer curl', increment: 5, perHand: true, cue: '' };
const SL_CALF = { id: 'single_leg_calf_raise', name: 'Single-leg calf raise', increment: 5, perSide: true, cue: 'On a step, hand on the wall, DB in the same-side hand · weaker side first, the other side matches its reps · slow stretch, pause at the top' };
const KICKSTAND = { id: 'kickstand_rdl', name: 'Kickstand RDL', increment: 5, perSide: true, cue: 'Right side first · front foot carries the weight, back toes just for balance · one DB in front, both hands · hips back, 3 s down, until the front hamstring loads, then push the floor away to stand · stop where the pelvis stops tipping (tap the box) · left low back talks → higher box or lighter' };
const LEG_PRESS = { id: 'leg_press', name: 'Leg press', increment: 10, cue: 'Feet high, a bit wider, toes slightly out · stop before the pelvis tucks or the left hip pinches' };
const LAT_PD = { id: 'lat_pull_down', name: 'Lat pulldown (neutral grip)', increment: 5, cue: 'Light · full stretch only as far as the shoulder is happy' };
// Same id as the incline push-up, so its bar-notch history continues.
const PUSH_UP_PLUS = { id: 'push_up', name: 'Incline push-up plus', increment: 0, notch: true, cue: 'Bar in a rack (a bench at home) · elbows ~45° · at the top, push the floor away until the shoulder blades spread · 3 × 15 at one height → drop the bar a notch' };
const PALLOF = { id: 'pallof', name: 'Cable Pallof press', increment: 2.5, perSide: true, cue: 'Resist the rotation · ribs down · slow' };
// The front leg's adductor magnus and glute carry a split squat, so it's the
// second "right leg supports me" exercise. The DB opposite the front leg
// makes that hip hold the pelvis level too.
const SPLIT_SQUAT = { id: 'split_squat', name: 'Split squat', increment: 5, perSide: true, cue: 'Right leg forward first · DB in the hand opposite the front leg, other hand on a rack · back knee down to a pad, torso tall, ribs down · push through the whole front foot · stop short of any front-hip pinch' };
const LEG_EXT = { id: 'leg_ext', name: 'Leg extension', increment: 5, cue: 'If it stalls, check seat depth and pad position' };

// ---------- armor ----------
// Recovery, mobility and motor control, before or after the long dog walk.
// The shoulder drills are light: stop a set when the shoulder stops feeling
// centered, not at failure. Same at the gym and at home except the row to ER
// (cable or band).
// Two weeks in place of the dead bug while the left adductor and hip flexor
// grip in 90-90; swap the dead bug back in (its history is kept) once wk 2 is clean.
const SUPPORTED_DEAD_BUG = { id: 'supported_dead_bug', name: 'Supported dead bug', increment: 0, bodyweight: true, perSide: true, cue: 'Wk 1: calves on a bench, arm reaches only, on a long exhale → once clean, hands press into knees, 5-s holds · Wk 2: one hand presses its knee while the other leg reaches low, clean side first · end the set when the left adductor grips' };
const BIRD_DOG = { id: 'bird_dog', name: 'Bird dog', increment: 0, bodyweight: true, perSide: true, cue: '5-s hold each rep · brace, no sagging or hip rotation' };
const ROW_ER = { id: 'cable_row_er', name: 'Cable row to ER at 90/90', increment: 2.5, perSide: true, cue: 'Light, slow · elbow ~30° forward of straight out · stop rotating before any front-of-shoulder pinch' };
const FLY = { id: 'supine_db_fly', name: 'Supine DB fly (PT)', increment: 1, perHand: true, cue: 'Super light · slow lowering, only as wide as the shoulder stays centered · control drill, not chest training' };
const SIDE_PLANK = { id: 'side_plank', name: 'Side plank', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Straight line, hips up · on your knees if the right shoulder complains' };
const HIP_FLEXOR = { id: 'hip_flexor_stretch', name: 'Half-kneeling hip flexor stretch', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Squeeze the back-leg glute · ribs down · extra set on the left' };
const CROSS_BODY = { id: 'cross_body_stretch', name: 'Cross-body stretch (right)', increment: 0, bodyweight: true, measure: 'time', cue: 'On your back, or shoulder blade against a wall so it can’t slide · pull the right arm across at or below shoulder height · stretch at the back of the shoulder, never a front pinch' };

const armor = (rowEr) => [
  p(SUPPORTED_DEAD_BUG, 3, 5, 6, 30),
  p(BIRD_DOG, 2, 6, 6, 30),
  p(DOWEL_HINGE, 2, 6, 8, 30),
  p(CUFF, 3, 8, 15, 30),
  p(rowEr, 2, 12, 15, 30),
  p(FLY, 2, 12, 15, 30),
  p(SIDE_PLANK, 2, 20, 40, 30),
  p(HIP_FLEXOR, 2, 30, 30, 15),
  p(CROSS_BODY, 3, 30, 30, 15),
];

// ---------- home: dumbbells, bands, a pull-up bar and an incline bench ----------
const GOBLET = { id: 'goblet_squat', name: 'Goblet squat to bench', increment: 5, cue: 'Tap the bench, don\'t sit · torso tall, ribs down · stop before pelvis tucks' };
const DB_BENCH = { id: 'db_bench_press', name: 'DB bench press', increment: 5, perHand: true, cue: 'Neutral grip · stop at chest · feet down, no big arch' };
const DB_ROW = { id: 'db_chest_supported_row', name: 'Chest-supported incline DB row', increment: 5, perHand: true, cue: 'Chest on ~30° bench · neutral grip · no shrug' };
const BAND_LEG_CURL = { id: 'band_leg_curl', name: 'Seated band leg curl', increment: 0, band: true, cue: 'Band anchored low in front · curl heel under the bench · slow return' };
const BAND_LAT = { id: 'band_lat_pulldown', name: 'Band lat pulldown', increment: 0, band: true, cue: 'Band over the pull-up bar · half-kneeling · neutral grip · elbows to ribs' };
const BAND_PALLOF = { id: 'band_pallof', name: 'Band Pallof press', increment: 0, band: true, perSide: true, cue: 'Band at chest height · resist the rotation · slow' };
const BAND_LEG_EXT = { id: 'band_leg_extension', name: 'Seated band leg extension', increment: 0, band: true, perSide: true, cue: 'Band anchored behind the bench leg · squeeze at the top' };
const BAND_ROW_ER = { id: 'band_row_er', name: 'Band row to ER at 90/90', increment: 0, band: true, perSide: true, cue: 'Band at chest height · elbow ~30° forward of straight out · stop before any pinch' };

export const HOME_PROGRAM = {
  mon: [
    ...primers(),
    p(GOBLET, 3, 8, 12, 90),
    p(DB_BENCH, 3, 8, 12, 90),
    p(DB_ROW, 3, 8, 12, 90),
    p(BAND_LEG_CURL, 3, 12, 20, 60),
    p(LATERAL, 3, 12, 20, 60),
    p(STANDING_CURL, 2, 10, 15, 60),
    p(SL_CALF, 3, 12, 20, 45),
  ],
  wed: [
    ...primers(),
    p(KICKSTAND, 3, 8, 10, 90),
    p(GOBLET, 3, 12, 15, 90),
    p(BAND_LAT, 3, 12, 20, 90),
    p(PUSH_UP_PLUS, 3, 10, 15, 60),
    p(BAND_PALLOF, 3, 10, 10, 60),
    p(HAMMER, 2, 10, 12, 60),
  ],
  fri: [
    ...primers(),
    p(SPLIT_SQUAT, 3, 8, 12, 90),
    p(DB_BENCH, 3, 10, 15, 90),
    p(DB_ROW, 3, 10, 15, 90),
    p(BAND_LEG_EXT, 2, 15, 25, 60),
    p(BAND_LEG_CURL, 2, 12, 20, 60),
    p(LATERAL, 3, 12, 20, 60),
    p(STANDING_CURL, 2, 10, 15, 60),
    p(SL_CALF, 3, 12, 20, 45),
  ],
  armor: armor(BAND_ROW_ER),
};

export const SEED_PROGRAM = {
  name: 'Straight sets: hips, shoulder, muscle (Nov 2026)',
  mon: [
    ...primers(),
    p(HACK, 3, 8, 12, 120),
    p(CHEST_PRESS, 3, 8, 12, 90),
    p(CS_ROW, 3, 8, 12, 90),
    p(LEG_CURL, 3, 10, 15, 60),
    p(LATERAL, 3, 12, 20, 60),
    p(STANDING_CURL, 2, 10, 15, 60),
    p(SL_CALF, 3, 12, 20, 45),
  ],
  wed: [
    ...primers(),
    p(KICKSTAND, 3, 8, 10, 90),
    p(LEG_PRESS, 3, 10, 15, 120),
    p(LAT_PD, 3, 10, 12, 90),
    p(PUSH_UP_PLUS, 3, 10, 15, 60),
    p(PALLOF, 3, 10, 10, 60),
    p(HAMMER, 2, 10, 12, 60),
  ],
  fri: [
    ...primers(),
    p(SPLIT_SQUAT, 3, 8, 12, 90),
    p(CHEST_PRESS, 3, 10, 15, 90),
    p(CS_ROW, 3, 10, 15, 90),
    p(LEG_EXT, 2, 12, 15, 60),
    p(LEG_CURL, 2, 12, 15, 60),
    p(LATERAL, 3, 12, 20, 60),
    p(STANDING_CURL, 2, 10, 15, 60),
    p(SL_CALF, 3, 12, 20, 45),
  ],
  armor: armor(ROW_ER),
  home: HOME_PROGRAM,
};

// Shown at the top of a session and in the program editor: a title and its
// bullets. Cues live on the exercises.
const WARMUP = { title: 'Warm-up, about 10 min', items: [
  'Easy bike or brisk walk: 3–5 min',
  'Left side-lying core: hip ER and abduction ×8–10',
  'Quadruped rock-back ×8',
  '90/90 hip switches ×6/side',
  'Bird dog ×5/side',
] };
export const DAY_NOTES = {
  mon: [WARMUP],
  wed: [WARMUP],
  fri: [WARMUP],
  armor: [{ title: 'Opener, about 5 min', items: [
    '90-90 breathing, feet on the wall: 5 exhales ×2',
    'Left side-lying core: hip ER and abduction ×8–10',
    'Adductor rock-back ×8/side',
    '90/90 hip switches ×6/side',
  ] }],
};

export const DEFAULT_SETTINGS = {
  units: 'lb',
  beep: true,
  lastDeloadAt: null,
  deloadStartedAt: null,
  lastBackupAt: null,
  location: 'gym',
  savedPrograms: [],
};
