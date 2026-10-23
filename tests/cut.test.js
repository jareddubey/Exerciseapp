import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekOf, weekRange, lastCompletedWeek, totalWeeks, addDays, e1rm, weekStats, weeklyLoss, rolling7,
  targetWeight, onTrackBand, bestE1rmByWeek, mainLiftsDown, evaluateWeek, checkpointStatus, currentTarget,
  acceptRecommendation, mergeConfig, validateConfig, emptyCut, normalizeCut, waistValue, localIso, bandStatus,
} from '../app/js/cut.js';
import { DEFAULT_CUT_CONFIG } from '../app/js/cut-config.js';

const CFG = DEFAULT_CUT_CONFIG;

/** A cut whose week N (1-based) has 7 daily weigh-ins at avgs[N-1]. null = no weigh-ins. */
function cutWith(avgs, extra = {}) {
  const cut = { ...emptyCut(), ...extra };
  if (extra.config) cut.config = mergeConfig(extra.config);
  avgs.forEach((avg, i) => {
    if (avg == null) return;
    const { start } = weekRange(i + 1, cut.config);
    for (let d = 0; d < 7; d++) cut.weighins[addDays(start, d)] = { weightLb: avg };
  });
  return cut;
}

/** Weekly averages losing `losses[i]` lb in week i+1, from the start weight. */
function fromLosses(losses) {
  let w = CFG.phase.startWeightLb;
  return losses.map((l) => (w = Math.round((w - l) * 100) / 100));
}

let n = 0;
/** A finished session on a local date with one set per lift: { liftId: [weight, reps] } */
function sess(iso, lifts, unit = 'lb') {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(y, m - 1, d, 18).getTime();
  return {
    id: `s${++n}`, day: 'A', startedAt: at, finishedAt: at + 3600e3, deload: false, unit,
    entries: Object.entries(lifts).map(([exerciseId, [weight, reps]]) => ({
      exerciseId, name: exerciseId, note: '', sets: [{ weight, reps, done: true }],
    })),
  };
}

/** One session on the Wednesday of each week, lift e1RMs scaled by factors[i] (week i+1). */
function liftSessions(factors, lifts = ['press', 'row', 'squat']) {
  return factors.map((f, i) => sess(addDays(weekRange(i + 1, CFG).start, 2),
    Object.fromEntries(lifts.map((id) => [id, [Math.round(100 * f * 1000) / 1000, 10]]))));
}

// ---------- week math ----------

test('weeks: week 1 is Mon Oct 26 - Sun Nov 1, 2026', () => {
  assert.deepEqual(weekRange(1, CFG), { start: '2026-10-26', end: '2026-11-01' });
  assert.equal(weekOf('2026-10-25', CFG), 0, 'start date is the baseline, not week 1');
  assert.equal(weekOf('2026-10-26', CFG), 1);
  assert.equal(weekOf('2026-11-01', CFG), 1, 'DST ends Nov 1 in the US; still week 1');
  assert.equal(weekOf('2026-11-02', CFG), 2);
});

test('weeks: week 12 ends Jan 17, 2027 and the phase is 12 weeks', () => {
  assert.deepEqual(weekRange(12, CFG), { start: '2027-01-11', end: '2027-01-17' });
  assert.equal(weekOf('2027-01-17', CFG), 12);
  assert.equal(totalWeeks(CFG), 12);
  assert.equal(weekOf('2026-12-06', CFG), 6, 'Week 6 checkpoint date is the end of week 6');
});

test('weeks: a week is complete from its Sunday', () => {
  assert.equal(lastCompletedWeek('2026-10-31', CFG), 0);
  assert.equal(lastCompletedWeek('2026-11-01', CFG), 1);
  assert.equal(lastCompletedWeek('2026-11-07', CFG), 1);
  assert.equal(lastCompletedWeek('2027-03-01', CFG), 12, 'capped at the phase length');
});

test('localIso uses local calendar date', () => {
  assert.equal(localIso(new Date(2026, 10, 1, 23, 30).getTime()), '2026-11-01');
});

// ---------- e1RM ----------

test('e1rm: Epley weight × (1 + reps/30)', () => {
  assert.equal(e1rm(100, 10), 133.333);
  assert.equal(e1rm(200, 1), 206.667);
  assert.equal(e1rm(90, 12), 126);
});

test('e1rm: only 1-12 reps count', () => {
  assert.equal(e1rm(100, 13), null);
  assert.equal(e1rm(100, 0), null);
  assert.equal(e1rm(null, 10), null);
  assert.equal(e1rm(0, 10), null);
});

test('bestE1rmByWeek: best set per week, kg converted to lb, 13+ rep sets ignored', () => {
  const s = [
    sess('2026-10-28', { press: [100, 10] }),
    sess('2026-10-30', { press: [110, 8] }),
    sess('2026-11-03', { press: [200, 15] }),
    sess('2026-11-04', { press: [50, 10] }, 'kg'),
  ];
  const by = bestE1rmByWeek('press', s, CFG);
  assert.equal(by.get(1), 139.333); // 110 × (1 + 8/30)
  assert.ok(Math.abs(by.get(2) - 50 / 0.45359237 * (4 / 3)) < 0.01);
});

test('mainLiftsDown: needs more than half of the lifts trained in both weeks', () => {
  const s = [
    sess('2026-11-04', { a: [100, 10], b: [100, 10], c: [100, 10] }),
    sess('2026-11-11', { a: [97, 10], b: [99, 10] }), // a down 3%, b down 1%, c not trained
  ];
  let r = mainLiftsDown(3, { ...emptyCut(), mainLifts: ['a', 'b', 'c'] }, s);
  assert.equal(r.compared, 2);
  assert.equal(r.downCount, 1);
  assert.equal(r.down, false, '1 of 2 is not more than half');
  r = mainLiftsDown(3, { ...emptyCut(), mainLifts: ['a', 'c'] }, s);
  assert.equal(r.down, true, '1 of 1 compared');
  r = mainLiftsDown(3, { ...emptyCut(), mainLifts: ['c'] }, s);
  assert.equal(r.down, false, 'no lifts compared');
});

test('lift down means more than 2% below', () => {
  const s = [sess('2026-11-04', { a: [100, 10] }), sess('2026-11-11', { a: [98, 10] })];
  assert.equal(mainLiftsDown(3, { ...emptyCut(), mainLifts: ['a'] }, s).down, false, 'exactly 2% is not down');
});

// ---------- weekly averages ----------

test('weekStats + weeklyLoss: week 1 vs start weight, later weeks vs previous week', () => {
  const cut = cutWith([173, 172.2]);
  assert.equal(weekStats(1, cut).avg, 173);
  assert.equal(weeklyLoss(1, cut), 1);
  assert.equal(weeklyLoss(2, cut), 0.8);
});

test('weeklyLoss: a gap week falls back to the last full week, per week', () => {
  const cut = cutWith([173, null, 171]);
  assert.equal(weeklyLoss(3, cut), 1);
});

test('rolling7: shown only with 4+ entries in the 7-day window', () => {
  const w = {};
  ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-11-02'].forEach((d, i) => { w[d] = { weightLb: 174 - i }; });
  const r = rolling7(w, 4);
  assert.deepEqual(r.map((x) => x.date), ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(r[0].avg, 172.5);
  assert.equal(r[4].avg, 171.5, 'Oct 27-Nov 2: 173, 172, 171, 170');
});

test('target line and on-track band', () => {
  assert.equal(targetWeight('2026-10-25', CFG), 174);
  assert.equal(targetWeight('2026-11-08', CFG), 172.5);
  assert.deepEqual(onTrackBand(4, CFG), { lo: 169, hi: 172 });
  assert.equal(bandStatus(1, cutWith([173.3])), 'on_track');
  assert.equal(bandStatus(1, cutWith([173.8])), 'behind');
  assert.equal(bandStatus(1, cutWith([172.5])), 'ahead');
});

// ---------- rule engine ----------

test('rules: two consecutive weeks losing 0.3 lb → −150', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3, 0.3]));
  assert.equal(evaluateWeek(3, cut, []).status, 'on_track', 'one slow week is not enough');
  const r = evaluateWeek(4, cut, []);
  assert.equal(r.status, 'decrease');
  assert.equal(r.deltaKcal, -150);
  assert.equal(r.toKcal, 2150);
  assert.equal(r.rule, 'too_slow');
});

test('rules: slow week, holiday week, slow week → −150 (holiday ignored, not a reset)', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3, 0.3, 0.3]), { holidays: [{ date: '2026-11-26', label: 'Thanksgiving' }] });
  const hol = evaluateWeek(5, cut, []);
  assert.equal(weekOf('2026-11-26', CFG), 5);
  assert.equal(hol.status, 'skipped');
  assert.equal(hol.rule, 'holiday');
  const cut2 = cutWith(fromLosses([1, 1, 0.3, 0.3, 0.3]), { holidays: [{ date: '2026-11-19', label: 'Trip' }] });
  assert.equal(evaluateWeek(4, cut2, []).status, 'skipped');
  const r = evaluateWeek(5, cut2, []);
  assert.equal(r.status, 'decrease', 'weeks 3 and 5 make the streak');
  assert.equal(r.deltaKcal, -150);
});

test('rules: two weeks losing 1.5 lb → +150', () => {
  const r = evaluateWeek(4, cutWith(fromLosses([1, 1, 1.5, 1.5])), []);
  assert.equal(r.status, 'increase');
  assert.equal(r.deltaKcal, 150);
  assert.equal(r.toKcal, 2450);
});

test('rules: normal loss but main lifts down 2.5% two weeks running → +150', () => {
  const cut = cutWith(fromLosses([1, 1, 0.75, 0.75]), { mainLifts: ['press', 'row', 'squat'] });
  const sessions = liftSessions([1, 1, 0.975, 0.975 * 0.975]);
  assert.equal(evaluateWeek(3, cut, sessions).status, 'on_track');
  const r = evaluateWeek(4, cut, sessions);
  assert.equal(r.status, 'increase');
  assert.equal(r.deltaKcal, 150);
  assert.match(r.reason, /main lifts down/);
});

test('rules: slow loss and lifts down → conflict, no change', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3, 0.3]), { mainLifts: ['press', 'row', 'squat'] });
  const r = evaluateWeek(4, cut, liftSessions([1, 1, 0.975, 0.975 * 0.975]));
  assert.equal(r.status, 'conflict');
  assert.equal(r.deltaKcal, 0);
  assert.match(r.reason, /^Slow loss with falling strength: review sleep, recovery, and intake accuracy/);
});

test('rules: a week with 3 weigh-ins is insufficient_data and skipped', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3]));
  const { start } = weekRange(4, cut.config);
  for (let d = 0; d < 3; d++) cut.weighins[addDays(start, d)] = { weightLb: 172 };
  assert.equal(weekStats(4, cut).insufficient, true);
  const r = evaluateWeek(4, cut, []);
  assert.equal(r.status, 'skipped');
  assert.equal(r.rule, 'insufficient_data');
  assert.equal(r.deltaKcal, 0);
});

test('rules: cut recommended at 2,100 kcal is blocked by the 2,000 floor', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3, 0.3]), { config: { calories: { startTargetKcal: 2100 } } });
  const r = evaluateWeek(4, cut, []);
  assert.equal(r.status, 'floor');
  assert.equal(r.deltaKcal, 0);
  assert.match(r.reason, /^At calorie floor: review plan/);
  const ok = evaluateWeek(4, cutWith(fromLosses([1, 1, 0.3, 0.3]), { config: { calories: { startTargetKcal: 2150 } } }), []);
  assert.equal(ok.toKcal, 2000, 'landing exactly on the floor is allowed');
});

test('rules: weeks 1-2 never produce a recommendation', () => {
  for (const losses of [[3, 3], [0, 0], [-1, -1]]) {
    const cut = cutWith(fromLosses(losses), { mainLifts: ['press'] });
    const sessions = liftSessions([1, 0.9], ['press']);
    for (const wk of [1, 2]) {
      const r = evaluateWeek(wk, cut, sessions);
      assert.equal(r.status, 'too_early');
      assert.equal(r.deltaKcal, 0);
    }
  }
});

test('rules: week 2 does not count toward a week-3 streak', () => {
  const r = evaluateWeek(3, cutWith(fromLosses([0.2, 0.2, 0.2])), []);
  assert.equal(r.status, 'on_track');
});

test('rules: a confirmed change resets the streaks', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3, 0.3, 0.3, 0.3]));
  const rec = evaluateWeek(4, cut, []);
  cut.calorieChanges.push(acceptRecommendation(rec, '2026-11-22'));
  assert.deepEqual(cut.calorieChanges[0], { date: '2026-11-22', week: 4, oldKcal: 2300, newKcal: 2150, reason: 'too_slow' });
  assert.equal(currentTarget(cut), 2150);
  assert.equal(evaluateWeek(5, cut, []).status, 'on_track', 'needs 2 new weeks');
  const r = evaluateWeek(6, cut, []);
  assert.equal(r.status, 'decrease');
  assert.equal(r.fromKcal, 2150);
  assert.equal(r.toKcal, 2000);
});

test('rules: a dismissed (unconfirmed) recommendation keeps the streak', () => {
  const cut = cutWith(fromLosses([1, 1, 0.3, 0.3, 0.3]));
  assert.equal(evaluateWeek(5, cut, []).status, 'decrease');
});

test('rules: on track with normal loss', () => {
  const r = evaluateWeek(4, cutWith(fromLosses([1, 1, 0.8, 0.7])), []);
  assert.equal(r.status, 'on_track');
  assert.match(r.reason, /^On track: no change\./);
});

// ---------- checkpoints ----------

function checkpointCut(avg, waistIn) {
  const cut = cutWith([173, 172, 171, 170.5, 170.2, avg]);
  cut.waist['2026-12-06'] = { r1: waistIn, r2: waistIn, waistIn };
  return cut;
}

test('checkpoint Week 6: (169.8 lb, 34.5 in) passes', () => {
  const cp = CFG.checkpoints[0];
  const r = checkpointStatus(cp, checkpointCut(169.8, 34.5), '2026-12-06');
  assert.equal(r.status, 'pass');
});

test('checkpoint Week 6: (170.4 lb, 34.3 in) fails', () => {
  const cp = CFG.checkpoints[0];
  const r = checkpointStatus(cp, checkpointCut(170.4, 34.3), '2026-12-06');
  assert.equal(r.status, 'fail');
  assert.equal(r.weightOk, false);
  assert.equal(r.waistOk, true);
});

test('checkpoint: upcoming before its date, no_data without a waist', () => {
  const cp = CFG.checkpoints[0];
  assert.equal(checkpointStatus(cp, checkpointCut(169.8, 34.5), '2026-12-05').status, 'upcoming');
  const cut = cutWith([173, 172, 171, 170.5, 170.2, 169.8]);
  assert.equal(checkpointStatus(cp, cut, '2026-12-07').status, 'no_data');
});

// ---------- config + entries ----------

test('mergeConfig: stored values override defaults, missing keys fall back', () => {
  const c = mergeConfig({ calories: { floorKcal: 1900 }, proteinTargetG: [140, 160] });
  assert.equal(c.calories.floorKcal, 1900);
  assert.equal(c.calories.startTargetKcal, 2300);
  assert.deepEqual(c.proteinTargetG, [140, 160]);
  assert.equal(c.phase.startDate, '2026-10-25');
  assert.notEqual(c.checkpoints, DEFAULT_CUT_CONFIG.checkpoints, 'defaults are copied, not shared');
});

test('validateConfig: defaults are valid; bad dates are reported', () => {
  assert.deepEqual(validateConfig(DEFAULT_CUT_CONFIG), []);
  const bad = mergeConfig({ phase: { startDate: '2026-10-26', endDate: '2026-10-20' } });
  assert.ok(validateConfig(bad).length > 0);
});

test('normalizeCut fills in a partial record', () => {
  const c = normalizeCut({ weighins: { '2026-10-26': { weightLb: 173 } } });
  assert.deepEqual(c.holidays, []);
  assert.equal(c.config.calories.floorKcal, 2000);
  assert.equal(c.weighins['2026-10-26'].weightLb, 173);
});

test('waistValue averages two readings', () => {
  assert.equal(waistValue(35, 35.2), 35.1);
  assert.equal(waistValue(34.8, null), 34.8);
  assert.equal(waistValue(null, null), null);
});
