// Pure workout logic: no DOM, no storage. Everything here is unit-tested.
//
// Session shape:
// { id, day: 'A'|'B', startedAt, finishedAt|null, deload, unit: 'lb'|'kg',
//   entries: [{ exerciseId, name, target: {...exercise}, sets: [{ weight, reps, done }], note }] }

export const DAY = 24 * 60 * 60 * 1000;
export const WEEK = 7 * DAY;
export const DELOAD_AFTER_WEEKS = 6;
export const BACKUP_REMIND_DAYS = 14;
const KG_PER_LB = 0.45359237;

export const otherDay = (day) => (day === 'A' ? 'B' : 'A');
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

/** Which session is next: the opposite of the last completed one (A if none). */
export function nextDay(sessions) {
  const done = sessions.filter(isFinished).sort((a, b) => b.finishedAt - a.finishedAt);
  return done.length ? otherDay(done[0].day) : 'A';
}

/**
 * Most recent finished performance of an exercise.
 * opts: { before: ms, excludeId, skipDeload, units } — when `units` is given,
 * weights are converted into it.
 */
export function lastPerformance(exerciseId, sessions, opts = {}) {
  const { before, excludeId, skipDeload, units } = opts;
  const list = sessions
    .filter(isFinished)
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
 * Returns { weight, increase, lastWeight, last } — weight is null if there is
 * no history or the exercise is bodyweight.
 */
export function suggestWeight(exercise, sessions, opts = {}) {
  const units = opts.units || 'lb';
  const last = lastPerformance(exercise.id, sessions, { ...opts, units, skipDeload: true });
  if (!last || exercise.bodyweight) return { weight: null, increase: false, lastWeight: null, last };
  const lastWeight = topWeight(last.sets);
  if (lastWeight == null) return { weight: null, increase: false, lastWeight: null, last };
  const hitTop =
    last.sets.length >= exercise.sets && last.sets.every((s) => s.reps >= exercise.repMax);
  const increase = hitTop && exercise.increment > 0;
  return {
    weight: clean(increase ? lastWeight + exercise.increment : lastWeight),
    increase,
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
  const weights = prefillWeights(ex, sessions, n, { units });
  return {
    exerciseId: ex.id,
    name: ex.name,
    target: { ...ex },
    sets: weights.map((w) => ({ weight: ex.bodyweight ? null : w, reps: null, done: false })),
    note: '',
  };
}

/** Build a new in-progress session from the program, prefilled from history. */
export function newSession(day, program, sessions, opts = {}) {
  const now = opts.now ?? Date.now();
  const units = opts.units || 'lb';
  const deload = !!opts.deload;
  return {
    id: opts.id || uid(),
    day,
    startedAt: now,
    finishedAt: null,
    deload,
    unit: units,
    entries: (program[day] || []).map((ex) => makeEntry(ex, sessions, { units, deload })),
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
  const entry = makeEntry(ex, sessions, { units: session.unit, deload: session.deload });
  const entries = [...session.entries];
  if (entryHasData(entries[index])) {
    entries.splice(index + 1, 0, entry);
    return { entries, index: index + 1, kept: true };
  }
  entries[index] = entry;
  return { entries, index, kept: false };
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

export function sessionsThisWeek(sessions, now = Date.now()) {
  const start = weekStart(now);
  return sessions.filter((s) => isFinished(s) && s.finishedAt >= start && s.finishedAt <= now).length;
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
  for (const day of ['A', 'B']) for (const ex of program?.[day] || []) map.set(ex.id, ex.name);
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
      return [{ sessionId: s.id, date: s.startedAt, day: s.day, deload: !!s.deload, sets, note: e.note || '', top: topWeight(sets) }];
    });
}

/** Convert per-exercise increments when switching units (5 lb ↔ 2.5 kg). */
export function convertIncrement(inc, from, to) {
  if (!inc || from === to) return inc;
  const step = to === 'kg' ? 1.25 : 2.5;
  return clean(Math.max(step, roundTo(convertWeight(inc, from, to), step)));
}

export function convertProgramUnits(program, from, to) {
  const conv = (list) => list.map((ex) => ({ ...ex, increment: convertIncrement(ex.increment, from, to) }));
  return { ...program, A: conv(program.A), B: conv(program.B), unit: to };
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

/** "90 lb — 12, 11, 10" or "90 lb × 12, 11 · 85 lb × 10" */
export function formatSets(sets, unit, { perSide, bodyweight } = {}) {
  if (!sets?.length) return '';
  const side = perSide ? '/side' : '';
  if (bodyweight || sets.every((s) => s.weight == null)) {
    return sets.map((s) => s.reps).join(', ') + (side ? ' /side' : ' reps');
  }
  const groups = [];
  for (const s of sets) {
    const g = groups[groups.length - 1];
    if (g && g.weight === s.weight) g.reps.push(s.reps);
    else groups.push({ weight: s.weight, reps: [s.reps] });
  }
  if (groups.length === 1) return `${fmtNum(groups[0].weight)} ${unit} — ${groups[0].reps.join(', ')}${side}`;
  return groups.map((g) => `${g.weight == null ? 'BW' : fmtNum(g.weight) + ' ' + unit} × ${g.reps.join(', ')}`).join(' · ') + side;
}

export function formatTarget(exercise, deload) {
  const n = targetSets(exercise, deload);
  const reps = exercise.repMin === exercise.repMax ? `${exercise.repMax}` : `${exercise.repMin}–${exercise.repMax}`;
  return `${n} × ${reps}${exercise.perSide ? '/side' : ''}`;
}
