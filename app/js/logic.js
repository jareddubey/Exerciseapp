// Pure workout logic: no DOM, no storage. Everything here is unit-tested.
//
// Session shape:
// { id, day: 'mon'|'wed'|'fri'|'armor' (older sessions: 'A'|'B'), location, startedAt, finishedAt|null, deload, unit: 'lb'|'kg',
//   entries: [{ exerciseId, name, target: {...exercise}, sets: [{ weight, reps, done }], note }] }

export const DAY = 24 * 60 * 60 * 1000;
export const WEEK = 7 * DAY;
export const DELOAD_AFTER_WEEKS = 6;
export const BACKUP_REMIND_DAYS = 14;
const KG_PER_LB = 0.45359237;

// ---------- weekly schedule ----------
// Full body Mon/Wed/Fri; Armor (core, hips, right shoulder) on Tue and Thu.
// Older sessions use the A/B days of the previous program; they keep their labels.
export const DAYS = ['mon', 'wed', 'fri', 'armor'];
export const LIFT_DAYS = ['mon', 'wed', 'fri'];
const DAY_INFO = {
  mon: { short: 'Mon', title: 'Monday' },
  wed: { short: 'Wed', title: 'Wednesday' },
  fri: { short: 'Fri', title: 'Friday' },
  armor: { short: 'Armor', title: 'Armor' },
};
export const dayLabel = (day) => DAY_INFO[day]?.short ?? day;
export const dayTitle = (day) => DAY_INFO[day]?.title ?? `Session ${day}`;
// Date.getDay() → scheduled day
const SCHEDULE = { 1: 'mon', 2: 'armor', 3: 'wed', 4: 'armor', 5: 'fri' };

// ---------- program structure ----------
// program = { mon, wed, fri, armor: Exercise[], home: { mon, wed, fri, armor }, unit }
// Gym days live at the top level; home days under `home`.
// A session's `location` is 'gym' (or absent, for older sessions) or 'home'.
//
// Exercise fields: id, name, cue, increment, load flags (perHand | bodyweight |
// band | notch), perSide, measure ('time' = seconds, 'distance' = meters,
// absent = reps), plus the per-day prescription in SLOT_KEYS. `group` pairs
// exercises: the same letter on one day means alternate their sets (A1, A2).

export const SLOTS = ['gym', 'home'].flatMap((loc) => DAYS.map((day) => [loc, day]));
export const SLOT_KEYS = ['sets', 'repMin', 'repMax', 'restSec', 'group'];
export const locationOf = (session) => (session?.location === 'home' ? 'home' : 'gym');
export const slotName = (day, location) => `${location === 'home' ? 'Home' : 'Gym'} ${dayLabel(day)}`;
/** A program in the current day layout (older backups use A/B). */
export const isDayProgram = (p) => !!p && DAYS.every((d) => Array.isArray(p[d]));

export function programList(program, day, location = 'gym') {
  return (location === 'home' ? program?.home?.[day] : program?.[day]) || [];
}

export function withProgramList(program, day, location, list) {
  if (location === 'home') {
    return { ...program, home: { ...Object.fromEntries(DAYS.map((d) => [d, []])), ...(program.home || {}), [day]: list } };
  }
  return { ...program, [day]: list };
}

export function allProgramExercises(program) {
  return SLOTS.flatMap(([loc, day]) => programList(program, day, loc));
}

/**
 * Update every program occurrence of exercise `id`. Name, cue and load are
 * shared, so they change everywhere; sets, reps, rest and pair (SLOT_KEYS)
 * belong to each day and change only in `slot` ([location, day]), if given.
 */
export function updateEverywhere(program, id, ex, slot = null) {
  let p = program;
  for (const [loc, day] of SLOTS) {
    const list = programList(p, day, loc);
    if (!list.some((x) => x.id === id)) continue;
    const here = slot && slot[0] === loc && slot[1] === day;
    p = withProgramList(p, day, loc, list.map((x) => {
      if (x.id !== id) return x;
      const out = { ...ex };
      if (!here) for (const k of SLOT_KEYS) { if (x[k] === undefined) delete out[k]; else out[k] = x[k]; }
      return out;
    }));
  }
  return p;
}

/** Bodyweight and band exercises log reps only. */
export const repsOnly = (ex) => !!(ex && (ex.bodyweight || ex.band));
/** Loads with no weight increment: reps-only, or a bar height (notch). */
export const noIncrement = (ex) => repsOnly(ex) || !!ex?.notch;

/** Pair labels for a list of exercises: 'A1', 'A2' in a pair, 'C' alone in its group, null without one. */
export function pairLabels(list) {
  const total = {};
  const seen = {};
  for (const ex of list) if (ex?.group) total[ex.group] = (total[ex.group] || 0) + 1;
  return list.map((ex) => {
    const g = ex?.group;
    if (!g) return null;
    seen[g] = (seen[g] || 0) + 1;
    return total[g] > 1 ? `${g}${seen[g]}` : g;
  });
}

/**
 * After a set of entry `i`, which entry is next: the other exercise(s) of its
 * pair in turn, then the first later entry with sets left. null when done or
 * when the entry isn't paired.
 */
export function nextUp(entries, i) {
  const g = entries[i]?.target?.group;
  if (!g) return null;
  const open = (j) => entries[j].sets.some((s) => !s.done);
  const members = entries.map((e, j) => (e.target?.group === g ? j : -1)).filter((j) => j >= 0);
  if (members.length < 2) return null;
  const at = members.indexOf(i);
  for (let k = 1; k <= members.length; k++) {
    const j = members[(at + k) % members.length];
    if (open(j)) return j;
  }
  for (let j = members[members.length - 1] + 1; j < entries.length; j++) if (open(j)) return j;
  return null;
}
export const isFinished = (s) => !!(s && s.finishedAt);

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function roundTo(x, step) {
  if (!step) return x;
  return Math.round(x / step) * step;
}

// Rounds to remove float noise (e.g. 92.50000001).
export const clean = (x) => Math.round(x * 1000) / 1000;

export function convertWeight(w, from, to) {
  if (w == null || from === to || !from || !to) return w;
  return from === 'lb' ? w * KG_PER_LB : w / KG_PER_LB;
}

// A set counts as performed once reps are logged.
export function performedSets(entry) {
  return (entry?.sets || []).filter((s) => Number(s.reps) > 0);
}

function byStartDesc(a, b) {
  return (b.startedAt || 0) - (a.startedAt || 0);
}

/**
 * Which day to offer: today's scheduled day (Mon/Wed/Fri lifting, Tue/Thu
 * Armor) unless it's already done today; otherwise the first lifting day not
 * done this week (Mon-Sun), else Armor.
 */
export function nextDay(sessions, now = Date.now()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const done = sessions.filter(isFinished);
  const doneToday = new Set(done.filter((s) => s.finishedAt >= midnight.getTime()).map((s) => s.day));
  const doneWeek = new Set(done.filter((s) => s.finishedAt >= weekStart(now)).map((s) => s.day));
  const scheduled = SCHEDULE[new Date(now).getDay()];
  if (scheduled && !doneToday.has(scheduled)) return scheduled;
  return LIFT_DAYS.find((d) => !doneWeek.has(d)) || 'armor';
}

/**
 * Most recent finished performance of an exercise.
 * opts: { before: ms, excludeId, skipDeload, units, day } — when `units` is
 * given, weights are converted into it; `day` limits it to sessions of that day.
 */
export function lastPerformance(exerciseId, sessions, opts = {}) {
  const { before, excludeId, skipDeload, units, day } = opts;
  const list = sessions
    .filter(isFinished)
    .filter((s) => day == null || s.day === day)
    .filter((s) => s.id !== excludeId)
    .filter((s) => before == null || s.startedAt < before)
    .filter((s) => !(skipDeload && s.deload))
    .sort(byStartDesc);
  for (const s of list) {
    const entry = s.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = performedSets(entry);
    if (!sets.length) continue;
    return {
      sessionId: s.id,
      date: s.startedAt,
      day: s.day,
      deload: !!s.deload,
      unit: units || s.unit,
      note: entry.note || '',
      sets: sets.map((x) => ({
        weight: x.weight == null || x.weight === '' ? null : clean(convertWeight(Number(x.weight), s.unit, units || s.unit)),
        reps: Number(x.reps),
      })),
    };
  }
  return null;
}

/**
 * Last performance to show and progress from: the most recent on the same day
 * when there is one (an exercise can be heavy on Monday and light on Friday),
 * otherwise the most recent on any day.
 */
export function lastFor(exerciseId, sessions, opts = {}) {
  const { day, ...rest } = opts;
  return (day && lastPerformance(exerciseId, sessions, { ...rest, day })) || lastPerformance(exerciseId, sessions, rest);
}

/** Most recent non-empty note for an exercise. */
export function lastNote(exerciseId, sessions, opts = {}) {
  const { before, excludeId } = opts;
  const list = sessions
    .filter(isFinished)
    .filter((s) => s.id !== excludeId)
    .filter((s) => before == null || s.startedAt < before)
    .sort(byStartDesc);
  for (const s of list) {
    const e = s.entries.find((x) => x.exerciseId === exerciseId);
    if (e && e.note && e.note.trim()) return { note: e.note.trim(), date: s.startedAt };
  }
  return null;
}

export function topWeight(sets) {
  const ws = sets.map((s) => s.weight).filter((w) => w != null && !Number.isNaN(w));
  return ws.length ? Math.max(...ws) : null;
}

/**
 * Double progression. If every set last time (excluding deload sessions) hit
 * repMax, and at least the programmed number of sets was done, suggest
 * top weight + increment. Otherwise suggest the same weight.
 * Returns { weight, increase, hitTop, lastWeight, last } — weight is null if
 * there is no history or the exercise is reps-only (bodyweight/band). For a
 * band exercise, `increase` means "move to a stronger band". `hitTop` is the
 * rule alone, for loads without an increment (notch, bodyweight).
 * opts.day prefers history from that day (see lastFor).
 */
export function suggestWeight(exercise, sessions, opts = {}) {
  const units = opts.units || 'lb';
  const last = lastFor(exercise.id, sessions, { ...opts, units, skipDeload: true });
  if (!last) return { weight: null, increase: false, hitTop: false, lastWeight: null, last };
  const hitTop =
    last.sets.length >= exercise.sets && last.sets.every((s) => s.reps >= exercise.repMax);
  // Bands: no weight, but flag "use a stronger band" on the same rule.
  if (repsOnly(exercise)) return { weight: null, increase: hitTop && !!exercise.band, hitTop, lastWeight: null, last };
  const lastWeight = topWeight(last.sets);
  if (lastWeight == null) return { weight: null, increase: false, hitTop, lastWeight: null, last };
  const increase = hitTop && exercise.increment > 0;
  return {
    weight: clean(increase ? lastWeight + exercise.increment : lastWeight),
    increase,
    hitTop,
    lastWeight,
    last,
  };
}

/** Per-set prefill weights for a new session. */
export function prefillWeights(exercise, sessions, nSets, opts = {}) {
  const units = opts.units || 'lb';
  const sug = suggestWeight(exercise, sessions, opts);
  if (sug.weight == null) return Array(nSets).fill(null);
  if (sug.increase) return Array(nSets).fill(sug.weight);
  // Same weight: mirror last session set-by-set (handles drop sets), rounded
  // to 0.5 in case of a unit conversion.
  const sets = sug.last.sets;
  return Array.from({ length: nSets }, (_, i) => {
    const w = (sets[i] || sets[sets.length - 1]).weight;
    return w == null ? sug.weight : clean(roundTo(w, units === 'kg' ? 0.25 : 0.5));
  });
}

export function targetSets(exercise, deload) {
  return deload ? Math.max(1, exercise.sets - 1) : exercise.sets;
}

/** A session entry for one exercise, weights prefilled from history. */
export function makeEntry(ex, sessions, opts = {}) {
  const units = opts.units || 'lb';
  const n = targetSets(ex, !!opts.deload);
  const weights = prefillWeights(ex, sessions, n, { units, day: opts.day });
  return {
    exerciseId: ex.id,
    name: ex.name,
    target: { ...ex },
    sets: weights.map((w) => ({ weight: repsOnly(ex) ? null : w, reps: null, done: false })),
    note: '',
  };
}

/** Build a new in-progress session from the program, prefilled from history. */
export function newSession(day, program, sessions, opts = {}) {
  const now = opts.now ?? Date.now();
  const units = opts.units || 'lb';
  const deload = !!opts.deload;
  const location = opts.location === 'home' ? 'home' : 'gym';
  return {
    id: opts.id || uid(),
    day,
    location,
    startedAt: now,
    finishedAt: null,
    deload,
    unit: units,
    entries: programList(program, day, location).map((ex) => makeEntry(ex, sessions, { units, deload, day })),
  };
}

const entryHasData = (e) => e.sets.some((s) => Number(s.reps) > 0 || s.done) || !!(e.note && e.note.trim());

/**
 * Swap the exercise at `index` mid-session. An untouched entry is replaced;
 * one with logged sets or a note is kept (so its history survives) and the
 * new exercise is inserted right after it. Returns { entries, index } where
 * index is the position of the new entry.
 */
export function swapEntry(session, index, ex, sessions) {
  const entry = makeEntry(ex, sessions, { units: session.unit, deload: session.deload, day: session.day });
  const entries = [...session.entries];
  if (entryHasData(entries[index])) {
    entries.splice(index + 1, 0, entry);
    return { entries, index: index + 1, kept: true };
  }
  entries[index] = entry;
  return { entries, index, kept: false };
}

/**
 * Change an entry's parameters mid-session (same id, so history continues).
 * `ex` becomes the entry's target; `setCount` is how many sets this workout has.
 * New sets copy the last set's weight. Only empty sets are removed, from the
 * end; sets with reps or a tick are never dropped. Switching to a reps-only
 * load clears weights. Returns { entry, kept } where kept counts sets that
 * stayed because they have data.
 */
export function editEntry(entry, ex, setCount) {
  const noWeight = repsOnly(ex);
  const sets = entry.sets.map((s) => ({ ...s, weight: noWeight ? null : s.weight }));
  while (sets.length < setCount) {
    sets.push({ weight: noWeight ? null : sets[sets.length - 1]?.weight ?? null, reps: null, done: false });
  }
  let kept = 0;
  for (let i = sets.length - 1; i >= 0 && sets.length > setCount; i--) {
    const s = sets[i];
    if (Number(s.reps) > 0 || s.done) kept++;
    else sets.splice(i, 1);
  }
  return { entry: { ...entry, name: ex.name, target: { ...ex }, sets }, kept: Math.min(kept, sets.length - setCount) };
}

/**
 * Deload tracking. Anchor = last deload (or first session ever). A deload week
 * that was started and has run its 7 days counts as done automatically.
 */
export function deloadStatus(settings, sessions, now = Date.now()) {
  const { lastDeloadAt, deloadStartedAt } = settings || {};
  const active = !!deloadStartedAt && now >= deloadStartedAt && now < deloadStartedAt + WEEK;
  let anchor = lastDeloadAt || null;
  if (deloadStartedAt && !active) {
    const ended = deloadStartedAt + WEEK;
    if (!anchor || ended > anchor) anchor = Math.min(ended, now);
  }
  if (!anchor) {
    const starts = sessions.filter(isFinished).map((s) => s.startedAt);
    anchor = starts.length ? Math.min(...starts) : null;
  }
  const weeks = anchor ? Math.max(0, Math.floor((now - anchor) / WEEK)) : 0;
  return {
    anchor,
    weeks,
    active,
    activeUntil: active ? deloadStartedAt + WEEK : null,
    due: !active && weeks >= DELOAD_AFTER_WEEKS,
  };
}

/** Local Monday 00:00 of the week containing `now`. */
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

/** Finished sessions since Monday, optionally only of the given days. */
export function sessionsThisWeek(sessions, now = Date.now(), days = null) {
  const start = weekStart(now);
  return sessions.filter((s) => isFinished(s) && s.finishedAt >= start && s.finishedAt <= now && (!days || days.includes(s.day))).length;
}

export function lastWorkout(sessions) {
  const done = sessions.filter(isFinished).sort((a, b) => b.finishedAt - a.finishedAt);
  return done[0] || null;
}

export function backupStatus(settings, sessions, now = Date.now()) {
  const finished = sessions.filter(isFinished);
  if (!finished.length) return { days: null, show: false, never: !settings?.lastBackupAt };
  const anchor = settings?.lastBackupAt || Math.min(...finished.map((s) => s.finishedAt));
  const days = Math.floor((now - anchor) / DAY);
  return { days, show: days >= BACKUP_REMIND_DAYS, never: !settings?.lastBackupAt };
}

/** All exercises seen in program or history, id -> latest name. */
export function exerciseCatalog(program, sessions) {
  const map = new Map();
  const sorted = sessions.filter(isFinished).sort((a, b) => a.startedAt - b.startedAt);
  for (const s of sorted) for (const e of s.entries) map.set(e.exerciseId, e.name || e.exerciseId);
  for (const ex of allProgramExercises(program)) map.set(ex.id, ex.name);
  return map;
}

/** Chronological history for one exercise, weights converted to `units`. */
export function exerciseHistory(exerciseId, sessions, units = 'lb') {
  return sessions
    .filter(isFinished)
    .sort((a, b) => a.startedAt - b.startedAt)
    .flatMap((s) => {
      const e = s.entries.find((x) => x.exerciseId === exerciseId);
      if (!e) return [];
      const sets = performedSets(e).map((x) => ({
        weight: x.weight == null || x.weight === '' ? null : clean(convertWeight(Number(x.weight), s.unit, units)),
        reps: Number(x.reps),
      }));
      if (!sets.length && !e.note) return [];
      return [{ sessionId: s.id, date: s.startedAt, day: s.day, location: locationOf(s), deload: !!s.deload, sets, note: e.note || '', top: topWeight(sets) }];
    });
}

/** Convert per-exercise increments when switching units (5 lb ↔ 2.5 kg). */
export function convertIncrement(inc, from, to) {
  if (!inc || from === to) return inc;
  const step = to === 'kg' ? 1.25 : 2.5;
  return clean(Math.max(step, roundTo(convertWeight(inc, from, to), step)));
}

export function convertProgramUnits(program, from, to) {
  let p = { ...program, unit: to };
  for (const [loc, day] of SLOTS) {
    if (loc === 'home' && !program.home) continue;
    p = withProgramList(p, day, loc, programList(program, day, loc)
      .map((ex) => ({ ...ex, increment: convertIncrement(ex.increment, from, to) })));
  }
  return p;
}

/** Slug id for a new exercise, unique against `taken`. */
export function makeExerciseId(name, taken) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'exercise';
  let id = base;
  let i = 2;
  while (taken.has(id)) id = `${base}_${i++}`;
  return id;
}

// ---------- formatting ----------

export function fmtNum(n) {
  if (n == null || n === '') return '';
  return String(clean(Number(n)));
}

/** ' s' for timed holds, ' m' for carries, '' for reps. */
export const measureUnit = (ex) => (ex?.measure === 'time' ? ' s' : ex?.measure === 'distance' ? ' m' : '');

/** "90 lb — 12, 11, 10", "90 lb × 12, 11 · 85 lb × 10", "30, 30 s/side", "notch 14 — 15, 15" */
export function formatSets(sets, unit, ex = {}) {
  if (!sets?.length) return '';
  const side = ex.perSide ? '/side' : '';
  const mu = measureUnit(ex);
  if (ex.perHand) unit = `${unit} ea`;
  if (repsOnly(ex) || sets.every((s) => s.weight == null)) {
    return sets.map((s) => s.reps).join(', ') + (mu ? mu + side : side ? ' /side' : ' reps');
  }
  const load = (w) => (w == null ? 'BW' : ex.notch ? `notch ${fmtNum(w)}` : `${fmtNum(w)} ${unit}`);
  const groups = [];
  for (const s of sets) {
    const g = groups[groups.length - 1];
    if (g && g.weight === s.weight) g.reps.push(s.reps);
    else groups.push({ weight: s.weight, reps: [s.reps] });
  }
  if (groups.length === 1) return `${load(groups[0].weight)} — ${groups[0].reps.join(', ')}${mu}${side}`;
  return groups.map((g) => `${load(g.weight)} × ${g.reps.join(', ')}`).join(' · ') + mu + side;
}

export function formatTarget(exercise, deload) {
  const n = targetSets(exercise, deload);
  const reps = exercise.repMin === exercise.repMax ? `${exercise.repMax}` : `${exercise.repMin}–${exercise.repMax}`;
  return `${n} × ${reps}${measureUnit(exercise)}${exercise.perSide ? '/side' : ''}`;
}
