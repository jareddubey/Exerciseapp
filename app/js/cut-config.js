// Fat-loss phase plan. Every number the cut module uses lives here. The copy
// saved on the device (edited under Settings → Cut plan) overrides these;
// any key missing from it falls back to the default below.
// Dates are local calendar days, 'YYYY-MM-DD'. Weights are lb, waist inches.
export const DEFAULT_CUT_CONFIG = {
  phase: {
    name: 'Cut Oct 2026 - Jan 2027',
    startDate: '2026-10-25', // Sunday, baseline day
    endDate: '2027-01-17', // Sunday, end of week 12
    checkinWeekday: 'Sunday',
    startWeightLb: 174.0,
    startWaistIn: 35.0,
    startBodyfatPct: 18.0, // handheld BIA, informational only
    goalWeightLb: 165.0,
    goalWaistIn: [33.5, 34.0],
    targetRateLbPerWeek: 0.75,
    onTrackRateLbPerWeek: [0.5, 1.25],
  },
  calories: {
    startTargetKcal: 2300,
    maintenanceEstimateKcal: 2600,
    adjustmentStepKcal: 150,
    floorKcal: 2000, // never recommend below this; flag for review instead
  },
  proteinTargetG: [150, 170],
  stepsTarget: 10000,
  rules: {
    firstRuleWeek: 3, // weeks 1-2 are water/glycogen noise
    consecutiveWeeksRequired: 2,
    minWeighinsPerWeek: 4,
    liftDeclineThresholdPct: 2.0,
  },
  checkpoints: [
    { name: 'Week 6', date: '2026-12-06', maxWeightLb: 170.0, maxWaistIn: 34.5 },
    { name: 'Week 12', date: '2027-01-17', maxWeightLb: 165.0, maxWaistIn: 34.0 },
  ],
  nextPhases: [ // display only for now
    { name: 'Maintenance', weeks: '4-8', targetKcal: 2600 },
    { name: 'Build', targetKcal: 'maintenance +100-200', training: '4-day upper/lower + VO2max block' },
  ],
};
