// Pure backup helpers: JSON export/import planning and CSV.
import { isFinished, performedSets, locationOf } from './logic.js';

export const EXPORT_FORMAT = 'ab-gym-tracker';
// v2 adds `cut` (the fat-loss phase record). v1 files still import.
export const EXPORT_VERSION = 2;

export function buildExport({ program, settings, sessions, cut }, now = Date.now()) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    program,
    settings,
    sessions,
    cut: cut ?? null,
  };
}

function validSession(s) {
  return (
    s && typeof s.id === 'string' && (s.day === 'A' || s.day === 'B') &&
    typeof s.startedAt === 'number' && Array.isArray(s.entries)
  );
}

function validProgram(p) {
  const lists = [p?.A, p?.B];
  if (p?.home != null) lists.push(p.home.A, p.home.B);
  return !!p && lists.every(Array.isArray) &&
    lists.flat().every((ex) => ex && typeof ex.id === 'string' && typeof ex.name === 'string');
}

/** Parse and validate an export file. Throws with a readable message. */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  if (!data || data.format !== EXPORT_FORMAT) throw new Error('This file is not a Gym Tracker backup.');
  if (!Array.isArray(data.sessions)) throw new Error('Backup has no sessions list.');
  const bad = data.sessions.filter((s) => !validSession(s));
  if (bad.length) throw new Error(`Backup contains ${bad.length} malformed session(s).`);
  if (data.program != null && !validProgram(data.program)) throw new Error('Backup program is malformed.');
  if (data.cut != null && (typeof data.cut !== 'object' || Array.isArray(data.cut))) throw new Error('Backup cut data is malformed.');
  return data;
}

const stable = (v) => JSON.stringify(v, (k, val) =>
  val && typeof val === 'object' && !Array.isArray(val)
    ? Object.fromEntries(Object.keys(val).sort().map((key) => [key, val[key]]))
    : val);

/**
 * Merge by session id. New ids are added; ids that exist with different
 * content are reported as conflicts (the caller asks before overwriting).
 */
export function planImport(current, incoming) {
  const byId = new Map(current.map((s) => [s.id, s]));
  const added = [];
  const conflicts = [];
  let identical = 0;
  for (const s of incoming) {
    const mine = byId.get(s.id);
    if (!mine) added.push(s);
    else if (stable(mine) === stable(s)) identical++;
    else conflicts.push(s);
  }
  return { added, conflicts, identical };
}

const byKey = (list, key) => new Map((list || []).map((x) => [key(x), x]));
const changeKey = (c) => `${c.week}|${c.date}`;

/**
 * Merge an imported cut record into the current one. Dated entries (weigh-ins,
 * waist, holidays, calorie changes) missing here are added; ones that differ
 * are conflicts, taken from the backup only if `replace`. With `replace`, the
 * backup's plan settings and main lifts are taken too.
 * Returns { cut, added, conflicts }.
 */
export function mergeCut(current, incoming, { replace = false } = {}) {
  if (!incoming) return { cut: current, added: 0, conflicts: 0 };
  let added = 0;
  let conflicts = 0;
  const mergeMap = (mine = {}, theirs = {}) => {
    const out = { ...mine };
    for (const [k, v] of Object.entries(theirs || {})) {
      if (!(k in out)) { out[k] = v; added++; } else if (stable(out[k]) !== stable(v)) { conflicts++; if (replace) out[k] = v; }
    }
    return out;
  };
  const mergeList = (mine, theirs, key) => {
    const m = byKey(mine, key);
    for (const x of theirs || []) {
      const k = key(x);
      if (!m.has(k)) { m.set(k, x); added++; } else if (stable(m.get(k)) !== stable(x)) { conflicts++; if (replace) m.set(k, x); }
    }
    return [...m.values()].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  };
  const planDiffers = stable(current.config) !== stable(incoming.config ?? current.config) ||
    stable(current.mainLifts) !== stable(incoming.mainLifts ?? current.mainLifts);
  if (planDiffers) conflicts++;
  const cut = {
    ...current,
    weighins: mergeMap(current.weighins, incoming.weighins),
    waist: mergeMap(current.waist, incoming.waist),
    holidays: mergeList(current.holidays, incoming.holidays, (x) => x.date),
    calorieChanges: mergeList(current.calorieChanges, incoming.calorieChanges, changeKey),
    dismissed: { ...(incoming.dismissed || {}), ...(current.dismissed || {}) },
  };
  if (replace && planDiffers) {
    if (incoming.config) cut.config = incoming.config;
    if (incoming.mainLifts) cut.mainLifts = incoming.mainLifts;
  }
  return { cut, added, conflicts };
}

export function programsEqual(a, b) {
  const strip = (p) => p && { A: p.A, B: p.B, home: p.home ?? null };
  return stable(strip(a)) === stable(strip(b));
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function isoDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** One row per performed set of each finished session, oldest first. */
export function toCSV(sessions) {
  const rows = [['date', 'session', 'exercise', 'set', 'weight', 'reps', 'note', 'unit', 'deload', 'location']];
  const list = sessions.filter(isFinished).sort((a, b) => a.startedAt - b.startedAt);
  for (const s of list) {
    for (const e of s.entries) {
      const sets = performedSets(e);
      if (!sets.length && e.note) {
        rows.push([isoDate(s.startedAt), s.day, e.name, '', '', '', e.note, s.unit, s.deload ? 1 : 0, locationOf(s)]);
      }
      sets.forEach((set, i) => {
        rows.push([
          isoDate(s.startedAt), s.day, e.name, i + 1,
          set.weight ?? '', set.reps, e.note || '', s.unit, s.deload ? 1 : 0, locationOf(s),
        ]);
      });
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
