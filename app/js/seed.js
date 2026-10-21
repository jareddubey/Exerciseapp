// Default program. Editable in-app; this is only used on first launch.
export const SEED_PROGRAM = {
  A: [
    { id: 'leg_press', name: 'Leg press', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 10, cue: 'Low back flat on pad · stop before pelvis tucks' },
    { id: 'chest_press', name: 'Chest press machine', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, cue: 'Neutral grip · stop handles at torso' },
    { id: 'cable_row', name: 'Seated cable row', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, cue: '' },
    { id: 'lateral_raise', name: 'Cable lateral raise', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward' },
    { id: 'leg_curl', name: 'Seated leg curl', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 5, cue: '' },
    { id: 'cable_er', name: 'Cable external rotation', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 2.5, perSide: true, cue: 'Elbow pinned at side · light' },
    { id: 'tri_pushdown', name: 'Cable triceps pushdown', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, cue: '' },
    { id: 'biceps_curl', name: 'Cable / machine biceps curl', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, cue: 'Every session (PT: 3×/week)' },
    { id: 'dead_bug', name: 'Dead bug', sets: 2, repMin: 8, repMax: 8, restSec: 60, increment: 0, perSide: true, bodyweight: true, cue: "Brace, ribs down, keep natural low-back curve (don't press flat) · slow" },
  ],
  B: [
    { id: 'hack_squat', name: 'Hack squat', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 10, cue: 'Back flat on pad · no Smith (axial load)' },
    { id: 'cs_row', name: 'Chest-supported row', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, cue: 'Neutral grip' },
    { id: 'flat_press', name: 'Flat chest press', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, cue: 'Stop handles at torso' },
    { id: 'leg_ext', name: 'Leg extension', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 5, cue: '' },
    { id: 'hip_thrust', name: 'Hip thrust machine', sets: 2, repMin: 10, repMax: 12, restSec: 60, increment: 10, cue: 'Neutral spine · glutes, not low back' },
    { id: 'biceps_curl', name: 'Cable / machine biceps curl', sets: 3, repMin: 12, repMax: 15, restSec: 60, increment: 5, cue: 'Every session (PT: 3×/week)' },
    { id: 'cable_tri_ext', name: 'Cable triceps extension', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 2.5, cue: 'Single arm · elbow still at side · squeeze at lockout' },
    { id: 'lateral_raise', name: 'Cable lateral raise', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward' },
    { id: 'pallof', name: 'Cable Pallof press', sets: 2, repMin: 10, repMax: 10, restSec: 60, increment: 2.5, perSide: true, cue: '' },
  ],
};

// Home workouts: same muscle groups as gym A/B with dumbbells, a pull-up bar,
// bands and an adjustable bench. Low-back friendly: no heavy hinges, no
// bridging, no standing overhead pressing. Exercises with the same id share
// history across days (and with the gym, e.g. dead bug).
// perHand: weight is per dumbbell. band: reps only (note the band used).
const DB_LATERAL = { id: 'db_lateral_raise', name: 'DB lateral raise', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 2.5, perHand: true, cue: 'Light · to shoulder height · thumbs level, no pouring · arms slightly forward' };
const DB_CURL = { id: 'db_curl', name: 'Incline DB curl', sets: 3, repMin: 10, repMax: 15, restSec: 60, increment: 5, perHand: true, cue: 'Bench ~60° · elbows stay back · slow on the way down' };

export const HOME_PROGRAM = {
  A: [
    { id: 'goblet_squat', name: 'Goblet squat to bench', sets: 3, repMin: 10, repMax: 15, restSec: 90, increment: 5, cue: 'Tap the bench, don\'t sit · torso tall, ribs down · stop before pelvis tucks' },
    { id: 'db_bench_press', name: 'DB bench press', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, perHand: true, cue: 'Neutral grip · stop at chest · feet down, no big arch' },
    { id: 'chin_up', name: 'Chin-up', sets: 3, repMin: 6, repMax: 10, restSec: 90, increment: 0, bodyweight: true, cue: 'Band-assisted if needed (note the band) · full hang · no kipping' },
    { ...DB_LATERAL },
    { id: 'band_leg_curl', name: 'Seated band leg curl', sets: 2, repMin: 12, repMax: 20, restSec: 60, increment: 0, band: true, cue: 'Band anchored low in front · curl heel under the bench · slow return' },
    { id: 'db_external_rotation', name: 'Side-lying DB external rotation', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 2.5, perSide: true, cue: 'Towel under elbow · light, slow' },
    { id: 'band_pushdown', name: 'Band triceps pushdown', sets: 3, repMin: 12, repMax: 20, restSec: 60, increment: 0, band: true, cue: 'Band over the pull-up bar · elbows pinned' },
    { ...DB_CURL },
    { id: 'dead_bug', name: 'Dead bug', sets: 2, repMin: 8, repMax: 8, restSec: 60, increment: 0, perSide: true, bodyweight: true, cue: "Brace, ribs down, keep natural low-back curve (don't press flat) · slow" },
  ],
  B: [
    { id: 'rfe_split_squat', name: 'Rear-foot-elevated split squat', sets: 3, repMin: 8, repMax: 12, restSec: 90, increment: 5, perSide: true, perHand: true, cue: 'Rear foot on bench · torso tall · front leg does the work' },
    { id: 'db_chest_supported_row', name: 'Chest-supported incline DB row', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, perHand: true, cue: 'Chest on ~30° bench · neutral grip · no shrug' },
    { id: 'incline_db_press', name: 'Incline DB press', sets: 3, repMin: 10, repMax: 12, restSec: 90, increment: 5, perHand: true, cue: 'Bench ~30° · stop at chest · ribs down' },
    { id: 'band_leg_extension', name: 'Seated band leg extension', sets: 2, repMin: 15, repMax: 25, restSec: 60, increment: 0, band: true, perSide: true, cue: 'Band anchored behind the bench leg · squeeze at the top' },
    { id: 'band_hip_abduction', name: 'Seated band hip abduction', sets: 2, repMin: 15, repMax: 25, restSec: 60, increment: 0, band: true, cue: 'Band above knees · sit tall · pause at widest' },
    { ...DB_CURL },
    { id: 'lying_db_triceps_ext', name: 'Lying DB triceps extension', sets: 2, repMin: 12, repMax: 15, restSec: 60, increment: 5, perHand: true, cue: 'Elbows point up and stay still · lower beside your head' },
    { ...DB_LATERAL },
    { id: 'band_pallof', name: 'Band Pallof press', sets: 2, repMin: 10, repMax: 10, restSec: 60, increment: 0, band: true, perSide: true, cue: 'Band at chest height · resist the rotation · slow' },
  ],
};
SEED_PROGRAM.home = HOME_PROGRAM;

export const DEFAULT_SETTINGS = {
  units: 'lb',
  beep: true,
  lastDeloadAt: null,
  deloadStartedAt: null,
  lastBackupAt: null,
  location: 'gym',
};
