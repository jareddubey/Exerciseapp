// Pure cut-phase logic: no DOM, no storage. Everything here is unit-tested.
//
// Cut record (kv 'cut'):
// { config, weighins: { 'YYYY-MM-DD': { weightLb, bodyfatPct, note } },
//   waist: { 'YYYY-MM-DD': { r1, r2, waistIn } }, holidays: [{ date, label }],
//   calorieChanges: [{ date, week, oldKcal, newKcal, reason }], mainLifts: [exerciseId],
//   dismissed: { [week]: true } }
//
// Week N = the 7 days (Mon-Sun) ending on the Nth Sunday after startDate.
// Dates are calendar days ('YYYY-MM-DD'), never ms, so DST can't shift a week.
import { DEFAULT_CUT_CONFIG } from './cut-config.js';
import { isFinished, performedSets, convertWeight, clean } from './logic.js';

// ---------- dates ----------

const DAY_MS = 86400000;
export const dayNum = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
};
export const isoFromDayNum = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (iso, n) => isoFromDayNum(dayNum(iso) + n);
export const isValidIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoFromDayNum(dayNum(s)) === s;

/** Local calendar date of a timestamp. */
export function localIso(ms = Date.now()) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const isSunday = (iso) => new Date(dayNum(iso) * DAY_MS).getUTCDay() === 0;

export function totalWeeks(cfg) {
  return Math.round((dayNum(cfg.phase.endDate) - dayNum(cfg.phase.startDate)) / 7);
}

/** Week number of a date: 0 for the start date and earlier. */
export function weekOf(iso, cfg) {
  const d = dayNum(iso) - dayNum(cfg.phase.startDate);
  return d <= 0 ? 0 : Math.ceil(d / 7);
}

/** First (Monday) and last (Sunday) day of week N. */
export function weekRange(n, cfg) {
  const s = dayNum(cfg.phase.startDate);
  return { start: isoFromDayNum(s + 7 * (n - 1) + 1), end: isoFromDayNum(s + 7 * n) };
}

/** Latest week whose Sunday is on or before `today` (0 if none), capped at the phase length. */
export function lastCompletedWeek(today, cfg) {
  const d = dayNum(today) - dayNum(cfg.phase.startDate);
  return Math.max(0, Math.min(totalWeeks(cfg), Math.floor(d / 7)));
}

const inRange = (iso, r) => iso >= r.start && iso <= r.end;

// ---------- config ----------

const isPlainObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge a stored config over the defaults. Arrays are replaced whole. */
export function mergeConfig(stored, defaults = DEFAULT_CUT_CONFIG) {
  if (!isPlainObj(stored)) return structuredClone(defaults);
  const out = {};
  for (const [k, def] of Object.entries(defaults)) {
    const v = stored[k];
    if (v === undefined) out[k] = structuredClone(def);
    else if (isPlainObj(def)) out[k] = mergeConfig(v, def);
    else out[k] = structuredClone(v);
  }
  return out;
}

/** Readable problems with a config, empty if it's usable. */
export function validateConfig(cfg) {
  const errs = [];
  const p = cfg.phase || {};
  if (!isValidIso(p.startDate)) errs.push('Start date is not a valid date.');
  if (!isValidIso(p.endDate)) errs.push('End date is not a valid date.');
  if (!errs.length) {
    if (p.endDate <= p.startDate) errs.push('End date must be after the start date.');
    else if ((dayNum(p.endDate) - dayNum(p.startDate)) % 7) errs.push('Start and end date must be a whole number of weeks apart.');
    if (!isSunday(p.startDate)) errs.push('Start date should be a Sunday (weeks run Mon-Sun).');
  }
  const nums = [
    ['Start weight', p.startWeightLb], ['Goal weight', p.goalWeightLb], ['Target rate', p.targetRateLbPerWeek],
    ['Start calories', cfg.calories?.startTargetKcal], ['Adjustment step', cfg.calories?.adjustmentStepKcal],
    ['Calorie floor', cfg.calories?.floorKcal], ['First rule week', cfg.rules?.firstRuleWeek],
    ['Consecutive weeks', cfg.rules?.consecutiveWeeksRequired], ['Min weigh-ins', cfg.rules?.minWeighinsPerWeek],
    ['Lift decline %', cfg.rules?.liftDeclineThresholdPct],
  ];
  for (const [label, v] of nums) if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${label} must be a number.`);
  const band = p.onTrackRateLbPerWeek;
  if (!Array.isArray(band) || band.length !== 2 || !(band[0] <= band[1])) errs.push('On-track rate needs a low and a high value, low ≤ high.');
  if (cfg.rules?.consecutiveWeeksRequired < 1) errs.push('Consecutive weeks must be at least 1.');
  for (const cp of cfg.checkpoints || []) if (!isValidIso(cp.date)) errs.push(`Checkpoint "${cp.name}" has an invalid date.`);
  return errs;
}

export function emptyCut() {
  return { config: structuredClone(DEFAULT_CUT_CONFIG), weighins: {}, waist: {}, holidays: [], calorieChanges: [], mainLifts: [], dismissed: {} };
}

/** Fill in any missing parts of a stored cut record. */
export function normalizeCut(stored) {
  const base = emptyCut();
  if (!isPlainObj(stored)) return base;
  return {
    ...base,
    ...stored,
    config: mergeConfig(stored.config),
    weighins: isPlainObj(stored.weighins) ? stored.weighins : {},
    waist: isPlainObj(stored.waist) ? stored.waist : {},
    holidays: Array.isArray(stored.holidays) ? stored.holidays : [],
    calorieChanges: Array.isArray(stored.calorieChanges) ? stored.calorieChanges : [],
    mainLifts: Array.isArray(stored.mainLifts) ? stored.mainLifts : [],
    dismissed: isPlainObj(stored.dismissed) ? stored.dismissed : {},
  };
}

// ---------- entries ----------

export const roundTenth = (x) => Math.round(x * 10) / 10;

/** Waist from one or two readings: their average. */
export function waistValue(r1, r2) {
  const rs = [r1, r2].filter((r) => typeof r === 'number' && Number.isFinite(r));
  return rs.length ? clean(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
}

/** Weigh-ins sorted by date: [{ date, weightLb, ... }] */
export function weighinList(weighins) {
  return Object.entries(weighins || {}).map(([date, w]) => ({ date, ...w })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// ---------- weekly weight ----------

export function weekStats(n, cut) {
  const cfg = cut.config;
  const r = weekRange(n, cfg);
  const ws = weighinList(cut.weighins).filter((w) => inRange(w.date, r));
  const count = ws.length;
  return {
    week: n,
    ...r,
    count,
    avg: count ? clean(mean(ws.map((w) => w.weightLb))) : null,
    insufficient: count < cfg.rules.minWeighinsPerWeek,
  };
}

/**
 * Weekly loss in lb (positive = lighter): average of week N−1 minus week N.
 * Week 1 compares to the start weight. If week N−1 has too few weigh-ins, the
 * last week that has enough is used instead, divided by the weeks between.
 */
export function weeklyLoss(n, cut) {
  const cur = weekStats(n, cut);
  if (cur.insufficient) return null;
  for (let m = n - 1; m >= 1; m--) {
    const prev = weekStats(m, cut);
    if (!prev.insufficient) return clean((prev.avg - cur.avg) / (n - m));
  }
  return clean((cut.config.phase.startWeightLb - cur.avg) / n);
}

/** Mean weigh-in of the 7 days ending on each date, where that window has ≥ minEntries. */
export function rolling7(weighins, minEntries = 4) {
  const list = weighinList(weighins);
  if (!list.length) return [];
  const byDay = new Map(list.map((w) => [dayNum(w.date), w.weightLb]));
  const first = dayNum(list[0].date);
  const last = dayNum(list[list.length - 1].date);
  const out = [];
  for (let d = first; d <= last; d++) {
    const vals = [];
    for (let k = d - 6; k <= d; k++) if (byDay.has(k)) vals.push(byDay.get(k));
    if (vals.length >= minEntries) out.push({ date: isoFromDayNum(d), avg: clean(mean(vals)) });
  }
  return out;
}

/** Target weight on a date: start − rate × days/7. */
export function targetWeight(iso, cfg) {
  const days = dayNum(iso) - dayNum(cfg.phase.startDate);
  return clean(cfg.phase.startWeightLb - cfg.phase.targetRateLbPerWeek * (days / 7));
}

/** On-track band after `weeks` weeks (fractional allowed): { lo, hi } weight. */
export function onTrackBand(weeks, cfg) {
  const [slow, fast] = cfg.phase.onTrackRateLbPerWeek;
  const s = cfg.phase.startWeightLb;
  return { lo: clean(s - fast * weeks), hi: clean(s - slow * weeks) };
}

/** 'ahead' (below the band: losing faster than planned), 'on_track', 'behind', or null. */
export function bandStatus(n, cut) {
  const st = weekStats(n, cut);
  if (st.avg == null) return null;
  const { lo, hi } = onTrackBand(n, cut.config);
  return st.avg < lo ? 'ahead' : st.avg > hi ? 'behind' : 'on_track';
}

// ---------- strength ----------

/** Epley estimated 1RM, for sets of 1-12 reps only (null otherwise). */
export function e1rm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!(w > 0) || !Number.isInteger(r) || r < 1 || r > 12) return null;
  return clean(w * (1 + r / 30));
}

/** Best e1RM (lb) per week for one exercise: Map week → value. */
export function bestE1rmByWeek(exerciseId, sessions, cfg) {
  const out = new Map();
  for (const s of sessions) {
    if (!isFinished(s)) continue;
    const wk = weekOf(localIso(s.startedAt), cfg);
    if (wk < 1) continue;
    for (const e of s.entries) {
      if (e.exerciseId !== exerciseId) continue;
      for (const set of performedSets(e)) {
        if (set.weight == null || set.weight === '') continue;
        const v = e1rm(convertWeight(Number(set.weight), s.unit || 'lb', 'lb'), set.reps);
        if (v != null && !(out.get(wk) >= v)) out.set(wk, clean(v));
      }
    }
  }
  return out;
}

/**
 * Lift change in week N vs N−1. Returns null if the lift wasn't trained in
 * both weeks (excluded), else { prev, cur, pct, down }.
 */
export function liftChange(byWeek, n, cfg) {
  const cur = byWeek.get(n);
  const prev = byWeek.get(n - 1);
  if (cur == null || prev == null) return null;
  const pct = clean(((cur - prev) / prev) * 100);
  return { prev, cur, pct, down: cur < prev * (1 - cfg.rules.liftDeclineThresholdPct / 100) };
}

/** Main lifts down in week N: more than half of the lifts trained in both weeks. */
export function mainLiftsDown(n, cut, sessions) {
  const lifts = (cut.mainLifts || []).map((id) => ({ id, change: liftChange(bestE1rmByWeek(id, sessions, cut.config), n, cut.config) }));
  const compared = lifts.filter((l) => l.change);
  const downCount = compared.filter((l) => l.change.down).length;
  return { down: compared.length > 0 && downCount > compared.length / 2, downCount, compared: compared.length, lifts };
}

// ---------- rule engine ----------

/** Per-week inputs to the rules. */
export function weekSignal(n, cut, sessions) {
  const cfg = cut.config;
  const stats = weekStats(n, cut);
  const r = weekRange(n, cfg);
  const holidays = (cut.holidays || []).filter((h) => inRange(h.date, r));
  const loss = weeklyLoss(n, cut);
  const lifts = mainLiftsDown(n, cut, sessions);
  const [slowBelow, fastAbove] = cfg.phase.onTrackRateLbPerWeek;
  return {
    week: n,
    stats,
    holidays,
    loss,
    lifts,
    liftsDown: lifts.down,
    fast: loss != null && loss > fastAbove,
    slow: loss != null && loss < slowBelow,
    skipReason: holidays.length ? 'holiday' : stats.insufficient ? 'insufficient_data' : null,
  };
}

/** Calorie target in effect before week N's check-in. */
export function targetBefore(n, cut) {
  const prior = (cut.calorieChanges || []).filter((c) => c.week < n).sort((a, b) => a.week - b.week || (a.date < b.date ? -1 : 1));
  return prior.length ? prior[prior.length - 1].newKcal : cut.config.calories.startTargetKcal;
}

export function currentTarget(cut) {
  return targetBefore(Infinity, cut);
}

const fmtLb = (x) => `${clean(Math.round(x * 100) / 100)} lb`;
const lossText = (s) => (s.loss >= 0 ? `lost ${fmtLb(s.loss)}` : `gained ${fmtLb(-s.loss)}`);

/**
 * Sunday rule result for completed week N.
 * status: too_early | skipped | conflict | increase | decrease | floor | on_track
 * Recommendations carry deltaKcal, fromKcal, toKcal; `rule` names the rule
 * that fired; `reason` is plain English.
 */
export function evaluateWeek(n, cut, sessions) {
  const cfg = cut.config;
  const { firstRuleWeek, consecutiveWeeksRequired: k } = cfg.rules;
  const sig = weekSignal(n, cut, sessions);
  const base = { week: n, signal: sig, deltaKcal: 0 };
  if (n < firstRuleWeek) {
    return { ...base, status: 'too_early', rule: null, reason: `Weeks 1-${firstRuleWeek - 1} are mostly water and glycogen. Rules start in week ${firstRuleWeek}.` };
  }
  if (sig.skipReason) {
    return {
      ...base, status: 'skipped', rule: sig.skipReason,
      reason: sig.skipReason === 'holiday'
        ? `Holiday week (${sig.holidays.map((h) => h.label).join(', ')}): skipped. It doesn't count toward or reset a streak.`
        : `Only ${sig.stats.count} weigh-in${sig.stats.count === 1 ? '' : 's'} this week (need ${cfg.rules.minWeighinsPerWeek}): skipped. It doesn't count toward or reset a streak.`,
    };
  }

  // The streak: this week plus the previous non-skipped weeks, back to the
  // first rule week or the last confirmed change (which resets streaks).
  const resetAfter = Math.max(firstRuleWeek - 1, ...(cut.calorieChanges || []).filter((c) => c.week < n).map((c) => c.week));
  const streak = [sig];
  for (let m = n - 1; m > resetAfter && streak.length < k; m--) {
    const s = weekSignal(m, cut, sessions);
    if (!s.skipReason) streak.push(s);
  }
  const full = streak.length >= k;
  const all = (f) => full && streak.every(f);
  const from = targetBefore(n, cut);
  const step = cfg.calories.adjustmentStepKcal;
  const [slowBelow, fastAbove] = cfg.phase.onTrackRateLbPerWeek;
  const weeksText = streak.map((s) => `week ${s.week}: ${lossText(s)}${s.liftsDown ? ', main lifts down' : ''}`).join('; ');

  if (all((s) => s.slow) && sig.liftsDown) {
    return {
      ...base, status: 'conflict', rule: 'slow_and_strength_down',
      reason: `Slow loss with falling strength: review sleep, recovery, and intake accuracy. No change (${weeksText}).`,
    };
  }
  if (all((s) => s.fast || s.liftsDown)) {
    const why = streak.every((s) => s.fast) ? `loss over ${fastAbove} lb/week` : streak.every((s) => s.liftsDown) ? 'main lifts down' : 'fast loss or main lifts down';
    return {
      ...base, status: 'increase', rule: 'too_fast_or_strength_down', deltaKcal: step, fromKcal: from, toKcal: from + step,
      reason: `${k} weeks in a row of ${why} (${weeksText}). Add ${step} kcal: ${from} → ${from + step}.`,
    };
  }
  if (all((s) => s.slow)) {
    if (from - step < cfg.calories.floorKcal) {
      return {
        ...base, status: 'floor', rule: 'calorie_floor', fromKcal: from,
        reason: `At calorie floor: review plan. Loss has been under ${slowBelow} lb/week for ${k} weeks (${weeksText}), but ${from} − ${step} would go below the ${cfg.calories.floorKcal} kcal floor.`,
      };
    }
    return {
      ...base, status: 'decrease', rule: 'too_slow', deltaKcal: -step, fromKcal: from, toKcal: from - step,
      reason: `${k} weeks in a row losing under ${slowBelow} lb/week (${weeksText}). Cut ${step} kcal: ${from} → ${from - step}.`,
    };
  }
  const flag = sig.slow ? 'slow' : sig.fast ? 'fast' : sig.liftsDown ? 'lifts' : null;
  const note = flag && k > 1
    ? ` This week was ${flag === 'lifts' ? 'down on main lifts' : `${flag} (${lossText(sig)})`}; another week like it would trigger a change.`
    : ` You ${lossText(sig)} this week.`;
  return { ...base, status: 'on_track', rule: 'on_track', reason: `On track: no change.${note}` };
}

/** True if the result asks for a calorie change the user can accept. */
export const isActionable = (res) => !!res && res.deltaKcal !== 0;

/** The calorie change record for accepting a recommendation. */
export function acceptRecommendation(res, todayIso) {
  return { date: todayIso, week: res.week, oldKcal: res.fromKcal, newKcal: res.toKcal, reason: res.rule };
}

// ---------- checkpoints ----------

/**
 * Pass/fail at a checkpoint: that week's average weight and the waist on (or
 * latest in the week before) the checkpoint date, each ≤ its max.
 * status: upcoming | no_data | pass | fail
 */
export function checkpointStatus(cp, cut, today) {
  const cfg = cut.config;
  if (today < cp.date) return { status: 'upcoming', weight: null, waist: null };
  const wk = weekOf(cp.date, cfg);
  const weight = wk >= 1 ? weekStats(wk, cut).avg : null;
  const from = addDays(cp.date, -6);
  const waists = Object.entries(cut.waist || {}).filter(([d]) => d >= from && d <= cp.date).sort(([a], [b]) => (a < b ? 1 : -1));
  const waist = waists.length ? waists[0][1].waistIn : null;
  if (weight == null || waist == null) return { status: 'no_data', weight, waist };
  const pass = weight <= cp.maxWeightLb && waist <= cp.maxWaistIn;
  return { status: pass ? 'pass' : 'fail', weight, waist, weightOk: weight <= cp.maxWeightLb, waistOk: waist <= cp.maxWaistIn };
}

export function nextCheckpoint(cut, today) {
  return [...(cut.config.checkpoints || [])].sort((a, b) => (a.date < b.date ? -1 : 1)).find((cp) => cp.date >= today) || null;
}
