// Pure backup helpers: JSON export/import planning and CSV.
import { isFinished, performedSets } from './logic.js';

export const EXPORT_FORMAT = 'ab-gym-tracker';
export const EXPORT_VERSION = 1;

export function buildExport({ program, settings, sessions }, now = Date.now()) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    program,
    settings,
    sessions,
  };
}

function validSession(s) {
  return (
    s && typeof s.id === 'string' && (s.day === 'A' || s.day === 'B') &&
    typeof s.startedAt === 'number' && Array.isArray(s.entries)
  );
}

function validProgram(p) {
  return p && Array.isArray(p.A) && Array.isArray(p.B) &&
    [...p.A, ...p.B].every((ex) => ex && typeof ex.id === 'string' && typeof ex.name === 'string');
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

export function programsEqual(a, b) {
  const strip = (p) => p && { A: p.A, B: p.B };
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
  const rows = [['date', 'session', 'exercise', 'set', 'weight', 'reps', 'note', 'unit', 'deload']];
  const list = sessions.filter(isFinished).sort((a, b) => a.startedAt - b.startedAt);
  for (const s of list) {
    for (const e of s.entries) {
      const sets = performedSets(e);
      if (!sets.length && e.note) {
        rows.push([isoDate(s.startedAt), s.day, e.name, '', '', '', e.note, s.unit, s.deload ? 1 : 0]);
      }
      sets.forEach((set, i) => {
        rows.push([
          isoDate(s.startedAt), s.day, e.name, i + 1,
          set.weight ?? '', set.reps, e.note || '', s.unit, s.deload ? 1 : 0,
        ]);
      });
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
