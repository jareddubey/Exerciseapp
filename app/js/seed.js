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
const CS_ROW = { id: 'cs_row', name: 'Chest-supported row', increment: 5, cue: 'Neutral grip · stop elbows at the torso line, no yanking past' };
const LEG_CURL = { id: 'leg_curl', name: 'Seated leg curl', increment: 5, cue: '' };
const LATERAL = { id: 'db_lateral_raise', name: 'DB lateral raise', increment: 2.5, perHand: true, cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward' };
const PUSHDOWN = { id: 'tri_pushdown', name: 'Rope triceps pushdown', increment: 5, cue: 'Elbows pinned · spread the rope at the bottom' };
const KICKSTAND = { id: 'kickstand_rdl', name: 'Kickstand RDL', increment: 5, perSide: true, cue: 'One DB in front, both hands · 3 s down · stop when the pelvis stops tipping (tap the box) · lower the box as the hip opens' };
const LAT_PD = { id: 'lat_pull_down', name: 'Lat pulldown (neutral grip)', increment: 5, cue: 'Light · full stretch only as far as the shoulder is happy' };
const LEG_PRESS = { id: 'leg_press', name: 'Leg press', increment: 10, cue: 'Feet high, a bit wider, toes slightly out · stop before pelvis tucks' };
const PUSH_UP = { id: 'push_up', name: 'Incline push-up', increment: 0, notch: true, cue: 'Bar in a rack · 3 × 15 at one height → drop the bar a notch · elbows ~45°' };
const BRIDGE = { id: 'glut_bridge', name: 'Floor glute bridge', increment: 0, bodyweight: true, cue: 'Ribs down · stop with hips in line with torso, no arch · then band → DB on hips → single-leg' };
const ROW_ER = { id: 'cable_row_er', name: 'Cable row to ER at 90/90', increment: 2.5, perSide: true, cue: 'Light, slow · elbow ~30° forward of straight out · stop rotating before any front-of-shoulder pinch' };
const REVERSE_PEC = { id: 'reverse_pec_deck', name: 'Reverse pec deck', increment: 5, cue: 'Start light · stop at the body line · end the set when the shoulder stops feeling centered' };
const HAMMER = { id: 'hammer_curl', name: 'Hammer curl', increment: 5, perHand: true, cue: '' };
const SA_PUSHDOWN = { id: 'cable_tri_ext', name: 'Single-arm cable pushdown', increment: 2.5, perSide: true, cue: 'D-handle · elbow still at your side · squeeze at lockout' };
const SA_PULLDOWN = { id: 'single_arm_pulldown', name: 'Single-arm cable pulldown', increment: 2.5, perSide: true, cue: 'D-handle, seated or half-kneeling · elbow to back pocket · or swap for a close-grip V-handle pulldown' };
const CHEST_PRESS = { id: 'chest_press', name: 'Chest press machine', increment: 5, cue: 'Flat · neutral grip · stop handles at torso, elbows ~45°' };
const LANDMINE = { id: 'landmine_press', name: 'Half-kneeling landmine press', increment: 2.5, perSide: true, cue: 'Log plates only · knee down on the pressing side · neutral grip on the bar end · press up and forward, stop short of any front-of-shoulder pinch' };
const LEG_EXT = { id: 'leg_ext', name: 'Leg extension', increment: 5, cue: 'If it stalls, check seat depth and pad position' };
const PREACHER = { id: 'preacher_machine', name: 'Preacher curl machine', increment: 5, cue: 'Control the lowering · don’t bounce out of the bottom' };
// Wednesday's core: the one lifting day without it (Mon Pallof, Fri body saw).
const CARRY = { id: 'suitcase_carry', name: 'Suitcase carry', increment: 5, perHand: true, perSide: true, measure: 'distance', cue: 'One DB at your side · stand tall, don’t lean · slow steps' };
const BODY_SAW = { id: 'body_saw', name: 'Body saw', increment: 0, bodyweight: true, measure: 'time', cue: 'Forearm plank, feet on sliders or a towel · rock 2–3 in back and forth · plain plank if the shoulder complains' };

// ---------- armor ----------
// Recovery, mobility and motor control: core, hips and shoulder control, no
// strength work. The shoulder drills are light: stop a set when the shoulder
// stops feeling centered, not at failure. Same at the gym and at home except
// the row to ER (cable or band).
// Sets 1–2 work the right adductors (an old proximal adductor magnus injury
// leaves them sleepy), set 3 the left, whose adductor already grips.
const COPENHAGEN = { id: 'copenhagen_plank', name: 'Copenhagen plank', increment: 0, bodyweight: true, measure: 'time', cue: 'Sets 1–2 right leg on the bench, set 3 left · short lever: knee on the bench · body straight · long lever once 30 s is easy' };
const BIRD_DOG = { id: 'bird_dog', name: 'Bird dog', increment: 0, bodyweight: true, perSide: true, cue: '5-s hold each rep · brace, no sagging or hip rotation' };
const SIDE_PLANK = { id: 'side_plank', name: 'Side plank', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Straight line, hips up · on your knees if the right shoulder complains' };
// Two weeks in place of the dead bug while the left adductor and hip flexor
// grip in 90-90; swap the dead bug back in (its history is kept) once wk 2 is clean.
const SUPPORTED_DEAD_BUG = { id: 'supported_dead_bug', name: 'Supported dead bug', increment: 0, bodyweight: true, perSide: true, cue: 'Wk 1: calves on a bench, arm reaches only, on a long exhale → once clean, hands press into knees, 5-s holds · Wk 2: one hand presses its knee while the other leg reaches low, clean side first · end the set when the left adductor grips' };
// Horizontal abduction and flexion only: ER is easy and the row to ER covers it,
// and a straight arm past 1 lb aches at the front of the shoulder.
const CUFF = { id: 'side_lying_cuff_supersets', name: 'Right-shoulder superset', increment: 0.5, cue: 'Side-lying, straight arm, 1 lb: horizontal abduction, stop at the body line → flexion, stop short of overhead, before any pinch · 2-s pause up, 3-s down · end the set when form slips (shrug, trunk rolls back, elbow bends)' };
const FLY = { id: 'supine_db_fly', name: 'Supine DB fly (PT)', increment: 1, perHand: true, cue: 'Super light · slow lowering, only as wide as the shoulder stays centered · control drill, not chest training' };
const HIP_FLEXOR = { id: 'hip_flexor_stretch', name: 'Half-kneeling hip flexor stretch', increment: 0, bodyweight: true, perSide: true, measure: 'time', cue: 'Squeeze the back-leg glute · ribs down · extra set on the left' };

// Daily right posterior capsule stretch, alternating: sleeper Mon/Wed/Fri,
// cross-body on Armor (Tue/Thu). Gentle: the remplissage tethers the back of
// the cuff, and the shoulder dislikes anterior pinch.
const SLEEPER = { id: 'sleeper_stretch', name: 'Sleeper stretch (right)', increment: 0, bodyweight: true, measure: 'time', cue: 'Lie on the right side, rolled back 20–30°, elbow a bit below shoulder height · left hand eases the forearm toward the floor · stretch at the back of the shoulder, never a front pinch' };
const CROSS_BODY = { id: 'cross_body_stretch', name: 'Cross-body stretch (right)', increment: 0, bodyweight: true, measure: 'time', cue: 'On your back, or shoulder blade against a wall so it can’t slide · pull the right arm across at or below shoulder height · stretch at the back of the shoulder, never a front pinch' };

// Daily shoulder control: an easy primer on lifting days (between the first
// lower-body exercise's sets, or before Wednesday's), the full dose on Armor.
const primer = () => ({ ...CUFF, sets: 2, repMin: 8, repMax: 10, restSec: 30 });
const pairedPrimer = () => p(CUFF, 2, 8, 10, 60, 'A');

const armor = (rowEr) => [
  p(SUPPORTED_DEAD_BUG, 3, 5, 6, 20, 'A'), p(BIRD_DOG, 2, 6, 6, 30, 'A'),
  p(CUFF, 3, 8, 15, 20, 'B'), p(HIP_FLEXOR, 2, 30, 30, 30, 'B'),
  p(COPENHAGEN, 3, 15, 30, 20, 'C'), p(FLY, 2, 12, 15, 20, 'C'),
  p(rowEr, 2, 12, 15, 20, 'D'), p(SIDE_PLANK, 2, 20, 40, 30, 'D'),
  p(CROSS_BODY, 3, 30, 30, 15, 'E'),
];

// ---------- home: dumbbells, bands, a pull-up bar and an incline bench ----------
const GOBLET = { id: 'goblet_squat', name: 'Goblet squat to bench', increment: 5, cue: 'Tap the bench, don\'t sit · torso tall, ribs down · stop before pelvis tucks' };
const BAND_PALLOF = { id: 'band_pallof', name: 'Band Pallof press', increment: 0, band: true, perSide: true, cue: 'Band at chest height · resist the rotation · slow' };
const INCLINE_DB = { id: 'incline_db_press', name: 'Incline DB press', increment: 5, perHand: true, cue: 'Low incline (15–30°) · neutral grip · stop at chest, elbows ~45°' };
const DB_ROW = { id: 'db_chest_supported_row', name: 'Chest-supported incline DB row', increment: 5, perHand: true, cue: 'Chest on ~30° bench · neutral grip · no shrug' };
const BAND_LEG_CURL = { id: 'band_leg_curl', name: 'Seated band leg curl', increment: 0, band: true, cue: 'Band anchored low in front · curl heel under the bench · slow return' };
const STANDING_CURL = { id: 'standing_bicep_curl', name: 'Standing bicep curl', increment: 5, perHand: true, cue: 'Elbows at your sides · don’t let them drift back at the bottom · add reps before weight' };
const BAND_PUSHDOWN = { id: 'band_pushdown', name: 'Band triceps pushdown', increment: 0, band: true, cue: 'Band over the pull-up bar · elbows pinned' };
const BAND_LAT = { id: 'band_lat_pulldown', name: 'Band lat pulldown', increment: 0, band: true, cue: 'Band over the pull-up bar · half-kneeling · neutral grip · elbows to ribs' };
const LUNGE = { id: 'step_back_lunge', name: 'Step-back lunge', increment: 5, perHand: true, perSide: true, cue: 'DBs at your sides · step back, torso tall · shorter step if the left hip complains' };
const BAND_PULL_APART = { id: 'band_pull_apart', name: 'Band pull-apart', increment: 0, band: true, cue: 'Light band · arms straight at chest height · stop at the body line · end the set when the shoulder stops feeling centered' };
const BAND_ROW_ER = { id: 'band_row_er', name: 'Band row to ER at 90/90', increment: 0, band: true, perSide: true, cue: 'Band at chest height · elbow ~30° forward of straight out · stop before any pinch' };
const DB_BENCH = { id: 'db_bench_press', name: 'DB bench press', increment: 5, perHand: true, cue: 'Neutral grip · stop at chest · feet down, no big arch' };
const BAND_LEG_EXT = { id: 'band_leg_extension', name: 'Seated band leg extension', increment: 0, band: true, perSide: true, cue: 'Band anchored behind the bench leg · squeeze at the top' };
const CONC_CURL = { id: 'concentration_curl', name: 'Concentration curl', increment: 5, perHand: true, perSide: true, cue: 'Seated, upper arm braced on the inner thigh · arm in front, like a preacher curl' };

export const HOME_PROGRAM = {
  mon: [
    p(GOBLET, 3, 10, 15, 60, 'A'), pairedPrimer(),
    p(DB_BENCH, 3, 10, 12, 45, 'B'), p(DB_ROW, 3, 10, 12, 90, 'B'),
    p(BAND_LEG_CURL, 3, 12, 20, 30, 'C'), p(LATERAL, 3, 12, 20, 60, 'C'),
    p(STANDING_CURL, 2, 10, 15, 30, 'D'), p(BAND_PUSHDOWN, 3, 12, 20, 60, 'D'),
    p(HAMMER, 2, 10, 12, 30, 'E'), p(BAND_PALLOF, 3, 10, 10, 60, 'E'),
    p(SLEEPER, 3, 30, 30, 15, 'F'),
  ],
  wed: [
    primer(),
    p(KICKSTAND, 3, 8, 10, 60, 'A'), p(BAND_LAT, 3, 12, 20, 90, 'A'),
    p(LUNGE, 3, 8, 12, 45, 'B'), p(PUSH_UP, 3, 8, 15, 90, 'B'),
    p(BRIDGE, 3, 12, 20, 30, 'C'), p(CARRY, 2, 30, 40, 60, 'C'),
    p(HAMMER, 2, 10, 12, 30, 'D'), p(BAND_PUSHDOWN, 2, 12, 20, 60, 'D'),
    p(BAND_PULL_APART, 2, 12, 15, 30, 'E'), p(STANDING_CURL, 2, 10, 15, 60, 'E'),
    p(SLEEPER, 3, 30, 30, 15, 'F'),
  ],
  fri: [
    p(GOBLET, 2, 12, 15, 60, 'A'), pairedPrimer(),
    p(BAND_LAT, 3, 12, 20, 45, 'B'), p(INCLINE_DB, 3, 10, 12, 90, 'B'),
    p(BAND_LEG_EXT, 3, 15, 25, 30, 'C'), p(BAND_LEG_CURL, 2, 12, 20, 60, 'C'),
    p(LATERAL, 3, 12, 20, 30, 'D'), p(BAND_PUSHDOWN, 3, 12, 20, 60, 'D'),
    p(CONC_CURL, 2, 10, 15, 30, 'E'), p(BODY_SAW, 3, 20, 30, 60, 'E'),
    p(HAMMER, 2, 10, 12, 30, 'F'), p(SLEEPER, 3, 30, 30, 15, 'F'),
  ],
  armor: armor(BAND_ROW_ER),
};

export const SEED_PROGRAM = {
  mon: [
    p(HACK, 3, 6, 10, 60, 'A'), pairedPrimer(),
    p(CHEST_PRESS, 3, 8, 12, 45, 'B'), p(CS_ROW, 3, 8, 12, 90, 'B'),
    p(LEG_CURL, 3, 10, 15, 30, 'C'), p(LATERAL, 3, 12, 20, 60, 'C'),
    p(STANDING_CURL, 2, 10, 15, 30, 'D'), p(PUSHDOWN, 3, 10, 15, 60, 'D'),
    p(HAMMER, 2, 10, 12, 30, 'E'), p(PALLOF, 3, 10, 10, 60, 'E'),
    p(SLEEPER, 3, 30, 30, 15, 'F'),
  ],
  wed: [
    primer(),
    p(KICKSTAND, 3, 8, 10, 60, 'A'), p(LAT_PD, 3, 10, 12, 90, 'A'),
    p(LEG_PRESS, 3, 10, 15, 45, 'B'), p(PUSH_UP, 3, 8, 15, 90, 'B'),
    p(BRIDGE, 3, 12, 20, 30, 'C'), p(CARRY, 2, 30, 40, 60, 'C'),
    p(HAMMER, 2, 10, 12, 30, 'D'), p(SA_PUSHDOWN, 2, 12, 15, 60, 'D'),
    p(REVERSE_PEC, 2, 12, 15, 30, 'E'), p(STANDING_CURL, 2, 10, 15, 60, 'E'),
    p(SLEEPER, 3, 30, 30, 15, 'F'),
  ],
  fri: [
    p(HACK, 2, 12, 15, 60, 'A'), pairedPrimer(),
    p(SA_PULLDOWN, 3, 10, 12, 45, 'B'), p(LANDMINE, 3, 8, 12, 90, 'B'),
    p(LEG_EXT, 3, 12, 15, 30, 'C'), p(LEG_CURL, 2, 12, 15, 60, 'C'),
    p(LATERAL, 3, 12, 20, 30, 'D'), p(PUSHDOWN, 3, 12, 15, 60, 'D'),
    p(PREACHER, 2, 10, 15, 30, 'E'), p(BODY_SAW, 3, 20, 30, 60, 'E'),
    p(HAMMER, 2, 10, 12, 30, 'F'), p(SLEEPER, 3, 30, 30, 15, 'F'),
  ],
  armor: armor(ROW_ER),
  home: HOME_PROGRAM,
};

// Shown at the top of a session and in the program editor.
// PT's side-lying drill: deep core on, then the left hip turns out and lifts
// while it stays on. Primes the left side before squats, hinges and core work.
const SIDE_LYING_CORE = 'left side-lying core (on your right side): 3–5 pelvic floor breaths → multifidus + TA co-contraction → left hip ER and abduction ×8–10 slow, keeping it on, about 20–30% effort';
const WARMUP = `Warm-up, about 9 min: 3 min bike or brisk walk · ${SIDE_LYING_CORE} · quadruped rock-back ×8 · 90/90 hip switches ×6/side · bird dog ×5/side.`;
const PRIMER_PAIRED = 'The right-shoulder primer is A2: easy sets between the squats, before you press and pull. 1 lb, stop well short of fatigue: practice, not training.';
const PRIMER_FIRST = 'Then the right-shoulder primer: easy sets, before you press and pull. 1 lb, stop well short of fatigue: practice, not training.';
const ARMOR_OPENER = `Opener, about 5 min: 90-90 breathing, feet on the wall, heels pressing lightly (5 long exhales with a 2–3 s pause, twice) · ${SIDE_LYING_CORE} · adductor rock-back ×8/side. A hand on the left inner thigh should feel it stay quiet.`;
const CUFF_GOALS = 'Right-shoulder superset is the hard dose today. Goal: 3 × 15 at 1 lb with 3-s holds and no front-of-shoulder ache → then 1.5 lb (wrist weight), not 2. A dull ache up to 2/10 that’s gone within an hour is OK; a pinch, or a shoulder that’s worse the next day → shorter range. More load later: bend the elbow and use 2 lb.';
const PAIRS = 'Pairs (A1, A2): alternate their sets. The rest timer shows what’s next.';
export const DAY_NOTES = {
  mon: [WARMUP, PRIMER_PAIRED, PAIRS],
  wed: [`${WARMUP} ${PRIMER_FIRST}`, PAIRS],
  fri: [WARMUP, PRIMER_PAIRED, PAIRS],
  armor: [ARMOR_OPENER, CUFF_GOALS, PAIRS, 'Then 30–40 min Zone 2 cardio: a long dog walk counts, at a pace where you can still talk.'],
};

export const DEFAULT_SETTINGS = {
  units: 'lb',
  beep: true,
  lastDeloadAt: null,
  deloadStartedAt: null,
  lastBackupAt: null,
  location: 'gym',
};
