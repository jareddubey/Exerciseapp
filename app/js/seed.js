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

export const DEFAULT_SETTINGS = {
  units: 'lb',
  beep: true,
  lastDeloadAt: null,
  deloadStartedAt: null,
  lastBackupAt: null,
};
