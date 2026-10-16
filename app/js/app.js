import * as db from './db.js';
import { SEED_PROGRAM, DEFAULT_SETTINGS } from './seed.js';
import {
  nextDay, otherDay, suggestWeight, lastPerformance, lastNote, deloadStatus, sessionsThisWeek,
  lastWorkout, backupStatus, newSession, formatSets, formatTarget, fmtNum, isFinished,
  performedSets, exerciseCatalog, exerciseHistory, convertProgramUnits, makeExerciseId, clean, DAY,
  swapEntry,
} from './logic.js';
import { buildExport, parseImport, planImport, programsEqual, toCSV } from './backup.js';
import { lineChart } from './chart.js';

const state = { program: null, settings: null, sessions: [] };
const app = document.getElementById('app');

// ---------------------------------------------------------------- helpers

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

const fmtDate = (ms, opts = {}) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...opts });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const parseNum = (str) => {
  const s = String(str ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

function toast(msg, ms = 2200) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

function topBar(title, { back = '#/', sub, right } = {}) {
  return h('header', { class: 'top' },
    back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, '‹') : null,
    h('h1', null, title, sub ? h('span', { class: 'sub' }, sub) : null),
    right || null);
}

const activeSession = () =>
  state.sessions.filter((s) => !isFinished(s)).sort((a, b) => b.startedAt - a.startedAt)[0] || null;
const findSession = (id) => state.sessions.find((s) => s.id === id);
const units = () => state.settings.units;

// ---------------------------------------------------------------- persistence

async function saveSettings(patch) {
  Object.assign(state.settings, patch);
  await db.setKV('settings', state.settings);
}
async function saveProgram(program) {
  state.program = { ...program, updatedAt: Date.now() };
  await db.setKV('program', state.program);
}

// Debounced per-session autosave, flushed when the page is hidden.
const pending = new Map();
function autosave(session) {
  clearTimeout(pending.get(session.id)?.t);
  pending.set(session.id, { session, t: setTimeout(() => flushSave(session.id), 150) });
}
function flushSave(id) {
  const ids = id ? [id] : [...pending.keys()];
  return Promise.all(ids.map((k) => {
    const p = pending.get(k);
    if (!p) return null;
    clearTimeout(p.t);
    pending.delete(k);
    return db.putSession(p.session);
  }));
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flushSave(); saveScroll(); } });
addEventListener('pagehide', () => { flushSave(); saveScroll(); });

// ---------------------------------------------------------------- wake lock

let wakeLock = null;
let wantWake = false;
async function acquireWake() {
  wantWake = true;
  if (!('wakeLock' in navigator) || wakeLock || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed (low battery etc.) */ }
}
function releaseWake() {
  wantWake = false;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (wantWake) acquireWake();
    rest.sync();
  }
});

// ---------------------------------------------------------------- rest timer

const rest = (() => {
  let audio = null;
  let iv = null;
  let hideT = null;
  const timeEl = h('div', { class: 'rt-time' }, '0:00');
  const labelEl = h('div', { class: 'rt-label' }, 'Rest');
  const bar = h('div', { id: 'rest', role: 'timer', 'aria-live': 'off' },
    h('div', { class: 'rt-main' }, timeEl, labelEl),
    h('button', { class: 'btn', onclick: () => adjust(-15), 'aria-label': 'Minus 15 seconds' }, '−15'),
    h('button', { class: 'btn', onclick: () => adjust(15), 'aria-label': 'Plus 15 seconds' }, '+15'),
    h('button', { class: 'btn primary', onclick: () => skip() }, 'Skip'));
  document.body.append(bar);

  const get = () => ls.get('restTimer');
  const put = (t) => (t ? ls.set('restTimer', t) : ls.del('restTimer'));

  function unlockAudio() {
    // iOS only allows audio after a user gesture; call from tap handlers.
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
  }
  function beep() {
    if (!audio || !state.settings?.beep) return;
    try {
      const t0 = audio.currentTime;
      [0, 0.25, 0.5].forEach((d) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.4, t0 + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
        o.connect(g).connect(audio.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 0.2);
      });
    } catch { /* ignore */ }
  }
  // Sit just under the header. When the iOS keyboard pans the visual viewport
  // past the header, follow the top of the visible area instead.
  function position() {
    const root = document.documentElement.style;
    const hdr = document.querySelector('.top');
    const hdrH = hdr ? hdr.offsetHeight : 0;
    const off = window.visualViewport ? Math.max(0, visualViewport.offsetTop - hdrH) : 0;
    root.setProperty('--hdr-h', `${hdrH}px`);
    root.setProperty('--rest-h', bar.classList.contains('show') ? `${bar.offsetHeight}px` : '0px');
    bar.style.transform = off ? `translateY(${off}px)` : '';
    bar.classList.toggle('floating', off > 0);
  }
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  addEventListener('resize', position);

  function render() {
    paint();
    position();
  }
  function paint() {
    const t = get();
    if (!t) { bar.classList.remove('show', 'over', 'flash'); return; }
    const left = Math.round((t.endAt - Date.now()) / 1000);
    const s = Math.max(0, left);
    timeEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    labelEl.textContent = left > 0 ? `Rest · ${t.label}` : `Rest over · ${t.label}`;
    bar.classList.add('show');
    bar.classList.toggle('over', left <= 0);
    if (left <= 0 && !t.fired) {
      t.fired = true;
      put(t);
      const late = Date.now() - t.endAt > 30_000;
      if (!late) {
        navigator.vibrate?.([300, 120, 300, 120, 300]);
        beep();
      }
      bar.classList.remove('flash');
      void bar.offsetWidth; // restart animation
      bar.classList.add('flash');
      clearTimeout(hideT);
      hideT = setTimeout(() => { if (get()?.fired) skip(); }, late ? 1500 : 6000);
    }
  }
  function loop() {
    clearInterval(iv);
    iv = setInterval(render, 250);
    render();
  }
  function start(sec, label) {
    unlockAudio();
    clearTimeout(hideT);
    bar.classList.remove('flash');
    put({ endAt: Date.now() + sec * 1000, label, fired: false });
    loop();
  }
  function adjust(delta) {
    unlockAudio();
    const t = get();
    if (!t) return;
    const base = t.fired ? Date.now() : t.endAt;
    t.endAt = Math.max(Date.now() + 1000, base + delta * 1000);
    t.fired = false;
    clearTimeout(hideT);
    bar.classList.remove('flash');
    put(t);
    render();
  }
  function skip() {
    put(null);
    clearInterval(iv);
    clearTimeout(hideT);
    render();
  }
  function sync() { if (get()) loop(); else render(); }
  return { start, skip, sync, unlockAudio, position };
})();

// ---------------------------------------------------------------- scroll memory

let currentRoute = '';
function saveScroll() {
  if (currentRoute.startsWith('session')) ls.set(`scroll:${currentRoute}`, scrollY);
}
let scrollT;
addEventListener('scroll', () => { clearTimeout(scrollT); scrollT = setTimeout(saveScroll, 200); }, { passive: true });

// ---------------------------------------------------------------- router

function route() {
  saveScroll();
  flushSave();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [a, b] = parts;
  let view;
  releaseWake();
  switch (a) {
    case 'session': {
      const s = b ? findSession(b) : activeSession();
      view = s ? viewSession(s) : viewHome();
      currentRoute = s ? `session/${s.id}` : '';
      break;
    }
    case 'history': view = viewHistory(b === 'exercises' ? 'exercises' : 'sessions'); currentRoute = 'history'; break;
    case 'exercise': view = viewExercise(decodeURIComponent(b || '')); currentRoute = 'exercise'; break;
    case 'program': view = viewProgram(b === 'B' ? 'B' : 'A'); currentRoute = 'program'; break;
    case 'settings': view = viewSettings(); currentRoute = 'settings'; break;
    default: view = viewHome(); currentRoute = '';
  }
  app.replaceChildren(view);
  rest.position();
  const y = currentRoute.startsWith('session') ? ls.get(`scroll:${currentRoute}`, 0) : 0;
  requestAnimationFrame(() => scrollTo(0, y));
}
addEventListener('hashchange', route);
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ---------------------------------------------------------------- home

let deferredInstall = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; if (!currentRoute) route(); });
let updateReady = null;

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function viewHome() {
  const now = Date.now();
  const active = activeSession();
  const next = nextDay(state.sessions);
  const dl = deloadStatus(state.settings, state.sessions, now);
  const bk = backupStatus(state.settings, state.sessions, now);
  const last = lastWorkout(state.sessions);
  const root = h('div', null, topBar('Gym Tracker', { back: null }));

  if (updateReady) {
    root.append(h('div', { class: 'banner' },
      h('p', null, 'A new version is ready.'),
      h('button', { class: 'btn small', onclick: () => updateReady() }, 'Update now')));
  }

  if (!isStandalone() && !ls.get('installDismissed')) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const dismiss = () => { ls.set('installDismissed', true); route(); };
    root.append(h('div', { class: 'banner' },
      h('p', null, h('b', null, 'Add to Home Screen. '),
        ios
          ? 'In Safari tap Share, then "Add to Home Screen". It runs offline and stops Safari from clearing your data.'
          : 'Install the app so it runs offline and your data is kept.'),
      h('div', { class: 'row' },
        !ios && deferredInstall
          ? h('button', { class: 'btn small', onclick: async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; dismiss(); } }, 'Install')
          : null,
        h('button', { class: 'btn small', onclick: dismiss }, 'Got it'))));
  }

  if (bk.show) {
    root.append(h('div', { class: 'banner' },
      h('p', null, bk.never ? `No backup yet (${bk.days} days of data). ` : `Last backup: ${bk.days} days ago. `,
        'Export a copy so a cleared phone doesn’t lose your log.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => exportJSON() }, 'Back up now'),
        h('a', { class: 'btn small', href: '#/settings', style: 'display:inline-flex;align-items:center;text-decoration:none' }, 'Options'))));
  }

  if (dl.active) {
    root.append(h('div', { class: 'banner' },
      h('p', null, h('b', null, 'Deload week. '), `One set less per exercise, same weights. Ends ${fmtDate(dl.activeUntil)}.`),
      h('button', { class: 'btn small', onclick: async () => { await saveSettings({ lastDeloadAt: Date.now(), deloadStartedAt: null }); route(); } }, 'Deload done')));
  } else if (dl.due) {
    root.append(h('div', { class: 'banner' },
      h('p', null, h('b', null, `${dl.weeks} weeks since your last deload. `), 'Time for an easy week: one set less per exercise.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: async () => { await saveSettings({ deloadStartedAt: Date.now() }); route(); } }, 'Start deload week'),
        h('button', { class: 'btn small', onclick: async () => { await saveSettings({ lastDeloadAt: Date.now(), deloadStartedAt: null }); route(); } }, 'Deload done'))));
  }

  if (active) {
    const done = active.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const total = active.entries.reduce((n, e) => n + e.sets.length, 0);
    root.append(h('button', { class: 'start', onclick: () => go('#/session') },
      `Resume Session ${active.day}`, h('small', null, `Started ${fmtTime(active.startedAt)} · ${done}/${total} sets`)));
  } else {
    root.append(
      h('button', { class: 'start', onclick: () => startSession(next) },
        `Start Session ${next}`, h('small', null, dl.active ? 'Deload week' : `${state.program[next].length} exercises`)),
      h('div', { style: 'text-align:center' },
        h('button', { class: 'linkish', onclick: () => startSession(otherDay(next)) }, `Start Session ${otherDay(next)} instead`)));
  }

  root.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, last ? fmtDate(last.finishedAt, { weekday: undefined }) : '—'),
      h('span', null, last ? `Last workout (${last.day})` : 'No workouts yet')),
    h('div', { class: 'stat' }, h('b', null, `${sessionsThisWeek(state.sessions, now)} / 3`), h('span', null, 'Sessions this week'))));

  root.append(h('nav', { class: 'nav' },
    h('a', { href: '#/history' }, 'History'),
    h('a', { href: '#/program' }, 'Program'),
    h('a', { href: '#/settings' }, h('span', null, 'Settings & backup',
      h('span', { class: 'muted small' }, dl.anchor && !dl.active ? ` · ${dl.weeks} wk since deload` : '')))));
  return root;
}

async function startSession(day) {
  if (activeSession()) return go('#/session');
  const dl = deloadStatus(state.settings, state.sessions);
  const s = newSession(day, state.program, state.sessions, { units: units(), deload: dl.active });
  state.sessions.push(s);
  await db.putSession(s);
  ls.del(`scroll:session/${s.id}`);
  go('#/session');
}

// ---------------------------------------------------------------- session

function viewSession(session) {
  const live = !isFinished(session);
  if (live) acquireWake();
  const unit = session.unit;
  const progress = h('span', { class: 'sub' });
  const updateProgress = () => {
    const done = session.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const total = session.entries.reduce((n, e) => n + e.sets.length, 0);
    progress.textContent = `${fmtDate(session.startedAt)} · ${done}/${total} sets${session.deload ? ' · deload' : ''}`;
  };
  updateProgress();
  const save = () => { autosave(session); updateProgress(); };

  const header = h('header', { class: 'top' },
    h('a', { class: 'icon-btn', href: live ? '#/' : '#/history', 'aria-label': 'Back' }, '‹'),
    h('h1', null, `Session ${session.day}`, progress));

  const root = h('div', { class: 'session' }, header);
  session.entries.forEach((e, i) => root.append(exerciseCard(session, i, live, save)));

  const foot = h('div', { class: 'session-foot' });
  if (live) {
    foot.append(
      h('button', { class: 'btn primary block', style: 'min-height:56px;font-size:19px', onclick: () => finishSession(session) }, 'Finish session'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: session.deload, onchange: (ev) => { session.deload = ev.target.checked; save(); } }),
        'Deload session (targets one set less)'),
      h('button', { class: 'btn danger block', onclick: () => discardSession(session) }, 'Discard session'));
  } else {
    foot.append(
      h('p', { class: 'muted small' }, `Finished ${fmtDate(session.finishedAt)} ${fmtTime(session.finishedAt)}. Changes save automatically.`),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: session.deload, onchange: (ev) => { session.deload = ev.target.checked; save(); } }),
        'Deload session'),
      h('a', { class: 'btn block', href: '#/history', style: 'display:flex;align-items:center;justify-content:center;text-decoration:none' }, 'Done'),
      h('button', { class: 'btn danger block', onclick: () => deleteSessionConfirm(session) }, 'Delete session'));
  }
  root.append(foot);
  return root;
}

function exerciseCard(session, ei, live, save) {
  const e = session.entries[ei];
  const unit = session.unit;
  const ex = e.target || state.program.A.concat(state.program.B).find((x) => x.id === e.exerciseId) ||
    { id: e.exerciseId, name: e.name, sets: e.sets.length, repMin: 0, repMax: 0, increment: 5, restSec: 90 };
  const bw = !!ex.bodyweight;
  const opts = { units: unit, before: session.startedAt, excludeId: session.id };
  const last = lastPerformance(e.exerciseId, state.sessions, opts);
  const sug = live ? suggestWeight(ex, state.sessions, opts) : null;
  const prevNote = lastNote(e.exerciseId, state.sessions, opts);
  const inc = ex.increment || (unit === 'kg' ? 1.25 : 2.5);
  const repBase = (si) => last?.sets[si]?.reps ?? last?.sets[last.sets.length - 1]?.reps ?? ex.repMax;

  const count = h('span', { class: 'ex-count' });
  const updateCount = () => { count.textContent = `${e.sets.filter((s) => s.done).length}/${e.sets.length}`; };

  const card = h('section', { class: 'card', 'aria-label': e.name },
    h('div', { class: 'ex-head' }, h('h2', null, e.name), count),
    ex.cue ? h('p', { class: 'cue' }, ex.cue) : null,
    h('div', { class: 'meta' },
      h('span', { class: 'target' }, formatTarget({ ...ex, sets: e.sets.length }, false)),
      h('span', { class: 'muted' }, `${ex.restSec}s rest`),
      sug?.increase ? h('span', { class: 'badge-up' }, `↑ Add ${fmtNum(ex.increment)} ${unit}`) : null),
    h('div', { class: 'last' },
      last
        ? [`Last${last.deload ? ' (deload)' : ''} ${fmtDate(last.date, { weekday: undefined })}: `,
           h('b', null, formatSets(last.sets, unit, ex))]
        : 'Last: first time'),
    prevNote ? h('div', { class: 'prev-note' }, `Note ${fmtDate(prevNote.date, { weekday: undefined })}: ${prevNote.note}`) : null);

  // Weight stepper for all unticked sets
  const weightInputs = [];
  if (!bw) {
    const bump = (d) => {
      e.sets.forEach((s, i) => {
        if (s.done) return;
        s.weight = clean(Math.max(0, (s.weight ?? 0) + d));
        weightInputs[i].value = fmtNum(s.weight);
      });
      save();
    };
    card.append(h('div', { class: 'wstep' },
      h('span', null, `Weight, unticked sets (±${fmtNum(inc)})`),
      h('button', { class: 'step', onclick: () => bump(-inc), 'aria-label': `Decrease weight by ${fmtNum(inc)} ${unit}` }, '−'),
      h('button', { class: 'step', onclick: () => bump(inc), 'aria-label': `Increase weight by ${fmtNum(inc)} ${unit}` }, '+')));
  }

  const setsEl = h('div', { class: 'sets' });
  card.append(setsEl);

  function renderSets() {
    weightInputs.length = 0;
    setsEl.replaceChildren(h('div', { class: `set-head${bw ? ' bw' : ''}`, 'aria-hidden': 'true' },
      h('span', null, '#'),
      bw ? null : h('span', { style: 'text-align:center' }, unit),
      h('span', { class: 'c-reps' }, ex.perSide ? 'Reps /side' : 'Reps'),
      h('span', { class: 'c-done' }, 'Done')));
    e.sets.forEach((s, si) => setsEl.append(setRow(s, si)));
    updateCount();
  }

  function setRow(s, si) {
    const row = h('div', { class: `set${bw ? ' bw' : ''}${s.done ? ' done' : ''}` });
    const reps = h('input', {
      class: 'num', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
      'aria-label': `Set ${si + 1} reps`, placeholder: String(repBase(si)), value: s.reps ?? '',
      oninput: () => { s.reps = parseNum(reps.value); save(); },
    });
    const stepReps = (d) => {
      s.reps = s.reps == null ? repBase(si) : Math.max(0, s.reps + d);
      reps.value = s.reps;
      save();
    };
    row.append(h('span', { class: 'n' }, si + 1));
    if (!bw) {
      const w = h('input', {
        class: 'num', type: 'text', inputmode: 'decimal', autocomplete: 'off',
        'aria-label': `Set ${si + 1} weight (${unit})`, placeholder: '—', value: fmtNum(s.weight),
        oninput: () => {
          const old = s.weight;
          s.weight = parseNum(w.value);
          // carry the change to later unticked sets that had the same weight
          for (let j = si + 1; j < e.sets.length; j++) {
            if (!e.sets[j].done && e.sets[j].weight === old) {
              e.sets[j].weight = s.weight;
              weightInputs[j].value = fmtNum(s.weight);
            }
          }
          save();
        },
      });
      weightInputs[si] = w;
      row.append(w);
    }
    const tick = h('button', {
      class: 'tick', 'aria-pressed': String(!!s.done), 'aria-label': `Set ${si + 1} done`,
      onclick: () => {
        s.done = !s.done;
        tick.setAttribute('aria-pressed', String(s.done));
        row.classList.toggle('done', s.done);
        updateCount();
        save();
        if (s.done && live) rest.start(ex.restSec || 60, e.name);
      },
    }, '✓');
    row.append(
      h('button', { class: 'step', onclick: () => stepReps(-1), 'aria-label': `Set ${si + 1} reps minus 1` }, '−'),
      reps,
      h('button', { class: 'step', onclick: () => stepReps(1), 'aria-label': `Set ${si + 1} reps plus 1` }, '+'),
      tick);
    return row;
  }

  renderSets();

  card.append(h('div', { class: 'set-actions' },
    h('button', {
      class: 'btn small', onclick: () => {
        const prev = e.sets[e.sets.length - 1];
        e.sets.push({ weight: bw ? null : prev?.weight ?? null, reps: null, done: false });
        renderSets(); save();
      },
    }, '+ Set'),
    h('button', {
      class: 'btn small', onclick: () => {
        const lastSet = e.sets[e.sets.length - 1];
        if (!lastSet) return;
        if ((lastSet.reps != null || lastSet.done) && !confirm('Remove the last set? It has data.')) return;
        e.sets.pop();
        renderSets(); save();
      },
    }, '− Set'),
    live ? h('button', {
      class: 'btn small', style: 'margin-left:auto', 'aria-label': `Swap ${e.name} for another exercise`,
      onclick: () => card.replaceChildren(...swapPanel(session, ei)),
    }, '⇄ Swap') : null));

  card.append(h('textarea', {
    class: 'note', rows: '1', placeholder: 'Note (seat position, how it felt…)', value: e.note || '',
    'aria-label': `${e.name} note`,
    oninput: (ev) => { e.note = ev.target.value; save(); },
  }));
  return card;
}

// Definition for an exercise id: program first, else its most recent session snapshot.
function exerciseDef(id) {
  const inProgram = state.program.A.concat(state.program.B).find((x) => x.id === id);
  if (inProgram) return { ...inProgram };
  const snap = state.sessions.filter((s) => s.entries.some((e) => e.exerciseId === id))
    .sort((a, b) => b.startedAt - a.startedAt)[0]?.entries.find((e) => e.exerciseId === id);
  return snap?.target ? { ...snap.target } : { id, name: snap?.name || id, sets: 2, repMin: 10, repMax: 12, restSec: 60, increment: 5 };
}

// Inline form that replaces an exercise card to swap it mid-workout.
function swapPanel(session, ei) {
  const e = session.entries[ei];
  const base = e.target || {};
  const inSession = new Set(session.entries.map((x) => x.exerciseId));
  const cat = exerciseCatalog(state.program, state.sessions);
  const known = [...cat.entries()].filter(([id]) => !inSession.has(id)).sort((a, b) => a[1].localeCompare(b[1]));

  const pick = h('select', { class: 'field', 'aria-label': 'Replacement exercise' },
    h('option', { value: '' }, 'New exercise…'),
    known.map(([id, name]) => h('option', { value: id }, name)));
  const name = h('input', { class: 'field', autocomplete: 'off', placeholder: 'e.g. Hip abduction machine' });
  const num = (v, mode = 'numeric') => h('input', { class: 'field', type: 'text', inputmode: mode, value: String(v) });
  const f = {
    sets: num(base.sets ?? 2), restSec: num(base.restSec ?? 60),
    repMin: num(base.repMin ?? 10), repMax: num(base.repMax ?? 12),
    increment: num(base.increment || (units() === 'kg' ? 2.5 : 5), 'decimal'),
  };
  const perSide = h('input', { type: 'checkbox' });
  const bodyweight = h('input', { type: 'checkbox' });
  const fields = h('div', { class: 'form' },
    h('label', null, 'Name', name),
    h('div', { class: 'grid2' }, h('label', null, 'Sets', f.sets), h('label', null, 'Rest (sec)', f.restSec)),
    h('div', { class: 'grid2' }, h('label', null, 'Reps min', f.repMin), h('label', null, 'Reps max', f.repMax)),
    h('label', null, `Increment (${units()})`, f.increment),
    h('label', { class: 'check' }, perSide, 'Reps per side'),
    h('label', { class: 'check' }, bodyweight, 'Bodyweight (reps only)'));
  pick.addEventListener('change', () => { fields.hidden = !!pick.value; });

  const inProgram = state.program[session.day].some((x) => x.id === e.exerciseId);
  const permanent = h('input', { type: 'checkbox' });

  async function doSwap() {
    let ex;
    if (pick.value) {
      ex = exerciseDef(pick.value);
    } else {
      const nm = name.value.trim();
      if (!nm) { alert('Pick an exercise or enter a name.'); return; }
      const n = (inp, d) => { const v = parseNum(inp.value); return v == null ? d : v; };
      ex = {
        id: makeExerciseId(nm, new Set([...cat.keys(), ...inSession])), name: nm, cue: '',
        sets: Math.max(1, Math.round(n(f.sets, 2))), restSec: Math.max(0, Math.round(n(f.restSec, 60))),
        repMin: Math.max(1, Math.round(n(f.repMin, 10))), repMax: Math.max(1, Math.round(n(f.repMax, 12))),
        increment: bodyweight.checked ? 0 : Math.max(0, n(f.increment, 5)),
        perSide: perSide.checked, bodyweight: bodyweight.checked,
      };
      if (ex.repMax < ex.repMin) [ex.repMin, ex.repMax] = [ex.repMax, ex.repMin];
    }
    const r = swapEntry(session, ei, ex, state.sessions);
    session.entries = r.entries;
    autosave(session);
    await flushSave(session.id);
    if (permanent.checked) {
      const list = state.program[session.day].map((x) => (x.id === e.exerciseId ? { ...ex } : x));
      await saveProgram({ ...state.program, [session.day]: list });
    }
    toast(r.kept ? `${e.name} kept (has sets) · ${ex.name} added` : `Swapped to ${ex.name}`);
    route();
  }

  return [
    h('h2', null, `Swap ${e.name}`),
    h('p', { class: 'muted small' }, 'Just for this workout unless you tick the box below. History for each exercise stays separate.'),
    h('div', { class: 'form', style: 'margin-top:10px' },
      h('label', null, 'Replace with', pick),
      fields,
      inProgram ? h('label', { class: 'check' }, permanent, `Also replace it in the Session ${session.day} program`) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: doSwap }, 'Swap'),
        h('button', { class: 'btn', onclick: () => route() }, 'Cancel'))),
  ];
}

async function finishSession(session) {
  const missing = session.entries.reduce((n, e) => n + e.sets.filter((s) => !(Number(s.reps) > 0)).length, 0);
  const msg = missing
    ? `Finish session? ${missing} set${missing > 1 ? 's have' : ' has'} no reps logged and won’t count.`
    : 'Finish and save this session?';
  if (!confirm(msg)) return;
  session.finishedAt = Date.now();
  await flushSave(session.id);
  await db.putSession(session);
  ls.del(`scroll:session/${session.id}`);
  rest.skip();
  releaseWake();
  const sets = session.entries.reduce((n, e) => n + performedSets(e).length, 0);
  toast(`Saved · ${sets} sets`);
  go('#/');
}

async function discardSession(session) {
  if (!confirm('Discard this session? Everything entered in it will be deleted.')) return;
  pending.delete(session.id);
  await db.deleteSession(session.id);
  state.sessions = state.sessions.filter((s) => s.id !== session.id);
  rest.skip();
  go('#/');
}

async function deleteSessionConfirm(session) {
  if (!confirm(`Delete Session ${session.day} from ${fmtDate(session.startedAt)}? This can’t be undone.`)) return;
  const p = pending.get(session.id);
  if (p) { clearTimeout(p.t); pending.delete(session.id); }
  await db.deleteSession(session.id);
  state.sessions = state.sessions.filter((s) => s.id !== session.id);
  toast('Session deleted');
  go('#/history');
}

// ---------------------------------------------------------------- history

function viewHistory(tab) {
  const root = h('div', null, topBar('History'));
  root.append(h('div', { class: 'seg', role: 'tablist' },
    h('button', { 'aria-pressed': String(tab === 'sessions'), onclick: () => go('#/history') }, 'Sessions'),
    h('button', { 'aria-pressed': String(tab === 'exercises'), onclick: () => go('#/history/exercises') }, 'Exercises')));
  const finished = state.sessions.filter(isFinished).sort((a, b) => b.startedAt - a.startedAt);
  if (!finished.length) {
    root.append(h('p', { class: 'empty' }, 'No finished sessions yet.'));
    return root;
  }
  if (tab === 'sessions') {
    root.append(h('div', { class: 'list' }, finished.map((s) => {
      const sets = s.entries.reduce((n, e) => n + performedSets(e).length, 0);
      const mins = Math.round((s.finishedAt - s.startedAt) / 60000);
      return h('a', { href: `#/session/${s.id}` },
        h('div', null,
          h('div', { class: 'l1' }, `${fmtDate(s.startedAt, { year: 'numeric' })} · ${s.day} `, s.deload ? h('span', { class: 'tag deload' }, 'DELOAD') : null),
          h('div', { class: 'l2' }, `${sets} sets · ${mins} min`)));
    })));
  } else {
    const cat = exerciseCatalog(state.program, state.sessions);
    const rows = [...cat.entries()].map(([id, name]) => ({ id, name, hist: exerciseHistory(id, state.sessions, units()) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    root.append(h('div', { class: 'list' }, rows.map((r) => {
      const lastH = r.hist[r.hist.length - 1];
      return h('a', { href: `#/exercise/${encodeURIComponent(r.id)}` },
        h('div', null,
          h('div', { class: 'l1' }, r.name),
          h('div', { class: 'l2' }, r.hist.length ? `${r.hist.length} sessions · last ${lastH.top != null ? fmtNum(lastH.top) + ' ' + units() : fmtDate(lastH.date)}` : 'No history')));
    })));
  }
  return root;
}

function viewExercise(id) {
  const cat = exerciseCatalog(state.program, state.sessions);
  const name = cat.get(id) || id;
  const ex = state.program.A.concat(state.program.B).find((x) => x.id === id) || {};
  const hist = exerciseHistory(id, state.sessions, units());
  const root = h('div', null, topBar(name, { back: '#/history/exercises' }));
  if (!hist.length) {
    root.append(h('p', { class: 'empty' }, 'No history yet.'));
    return root;
  }
  const weighted = hist.some((x) => x.top != null);
  const points = hist.map((x) => ({ x: x.date, y: weighted ? x.top : x.sets.reduce((n, s) => n + s.reps, 0) }))
    .filter((p) => p.y != null);
  root.append(h('div', { class: 'card' },
    h('h2', null, weighted ? `Top-set weight (${units()})` : 'Total reps'),
    lineChart(points, { label: `${name} progress chart` })));
  root.append(h('div', { class: 'list' }, [...hist].reverse().map((x) =>
    h('a', { href: `#/session/${x.sessionId}` },
      h('div', null,
        h('div', { class: 'l1' }, `${fmtDate(x.date, { year: 'numeric' })} · ${x.day}`, x.deload ? ' · deload' : ''),
        h('div', { class: 'l2' }, formatSets(x.sets, units(), ex) || '—'),
        x.note ? h('div', { class: 'l2' }, `“${x.note}”`) : null)))));
  return root;
}

// ---------------------------------------------------------------- program editor

let editing = null; // { day, index, mode: 'edit'|'add'|'swap' }

function viewProgram(day) {
  const list = state.program[day];
  const root = h('div', null, topBar('Program'));
  root.append(h('div', { class: 'seg' },
    ['A', 'B'].map((d) => h('button', { 'aria-pressed': String(d === day), onclick: () => { editing = null; go(`#/program/${d}`); } }, `Session ${d}`))));
  root.append(h('p', { class: 'muted small' },
    `Weights and increments in ${units()}. Renaming keeps history; “Swap” starts a new exercise and leaves the old history under the old one.`));

  list.forEach((ex, i) => {
    if (editing && editing.day === day && editing.index === i && editing.mode !== 'add') {
      root.append(exerciseForm(day, i, editing.mode));
      return;
    }
    const sharedIn = state.program[otherDay(day)].some((x) => x.id === ex.id);
    root.append(h('div', { class: 'card prog-item' },
      h('h2', null, ex.name, sharedIn ? h('span', { class: 'tag', style: 'margin-left:6px' }, `ALSO ${otherDay(day)}`) : null),
      ex.cue ? h('p', { class: 'cue' }, ex.cue) : null,
      h('div', { class: 'meta muted' },
        `${formatTarget(ex)} · ${ex.restSec}s rest · ${ex.bodyweight ? 'bodyweight' : `+${fmtNum(ex.increment)} ${units()}`}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(day, i, -1) }, '↑'),
        h('button', { class: 'btn small', disabled: i === list.length - 1, 'aria-label': 'Move down', onclick: () => move(day, i, 1) }, '↓'),
        h('button', { class: 'btn small', onclick: () => { editing = { day, index: i, mode: 'edit' }; route(); } }, 'Edit'),
        h('button', { class: 'btn small', onclick: () => { editing = { day, index: i, mode: 'swap' }; route(); } }, 'Swap'),
        h('button', { class: 'btn small danger', 'aria-label': `Remove ${ex.name}`, onclick: () => removeEx(day, i) }, '✕'))));
  });

  if (editing && editing.day === day && editing.mode === 'add') root.append(exerciseForm(day, list.length, 'add'));
  else {
    root.append(h('button', { class: 'btn primary block', style: 'margin-top:16px', onclick: () => { editing = { day, index: list.length, mode: 'add' }; route(); } }, '+ Add exercise'));
  }
  return root;
}

async function move(day, i, d) {
  const list = [...state.program[day]];
  [list[i], list[i + d]] = [list[i + d], list[i]];
  await saveProgram({ ...state.program, [day]: list });
  route();
}

async function removeEx(day, i) {
  const ex = state.program[day][i];
  if (!confirm(`Remove ${ex.name} from Session ${day}? Its history is kept.`)) return;
  await saveProgram({ ...state.program, [day]: state.program[day].filter((_, j) => j !== i) });
  route();
}

function exerciseForm(day, index, mode) {
  const orig = mode === 'add' ? null : state.program[day][index];
  const base = mode === 'edit' ? orig : {
    name: '', cue: '', sets: orig?.sets ?? 2, repMin: orig?.repMin ?? 10, repMax: orig?.repMax ?? 12,
    restSec: orig?.restSec ?? 60, increment: orig?.increment ?? (units() === 'kg' ? 2.5 : 5), perSide: false, bodyweight: false,
  };
  const f = {};
  const field = (key, label, attrs = {}) => {
    f[key] = h('input', { class: 'field', value: base[key] ?? '', ...attrs });
    return h('label', null, label, f[key]);
  };
  const check = (key, label) => {
    f[key] = h('input', { type: 'checkbox', checked: !!base[key] });
    return h('label', { class: 'check' }, f[key], label);
  };

  // Reuse an existing exercise (shares its history), e.g. biceps curl on both days.
  let reuse = null;
  if (mode !== 'edit') {
    const inDay = new Set(state.program[day].map((x) => x.id));
    const cat = exerciseCatalog(state.program, state.sessions);
    const opts = [...cat.entries()].filter(([id]) => !inDay.has(id));
    if (opts.length) {
      reuse = h('select', { class: 'field' },
        h('option', { value: '' }, 'New exercise'),
        opts.map(([id, name]) => h('option', { value: id }, name)));
      reuse.addEventListener('change', () => {
        const ex = state.program.A.concat(state.program.B).find((x) => x.id === reuse.value);
        const name = cat.get(reuse.value);
        if (!reuse.value) return;
        f.name.value = name;
        if (ex) for (const k of ['cue', 'sets', 'repMin', 'repMax', 'restSec', 'increment']) f[k].value = ex[k] ?? '';
        if (ex) { f.perSide.checked = !!ex.perSide; f.bodyweight.checked = !!ex.bodyweight; }
      });
    }
  }

  const num = { type: 'text', inputmode: 'decimal' };
  const form = h('form', { class: 'card form', onsubmit: (ev) => { ev.preventDefault(); submit(); } },
    h('h2', null, mode === 'edit' ? `Edit ${orig.name}` : mode === 'swap' ? `Swap out ${orig.name}` : `Add to Session ${day}`),
    reuse ? h('label', null, 'Exercise', reuse) : null,
    field('name', 'Name', { required: true, autocomplete: 'off' }),
    field('cue', 'Cue (optional)', { autocomplete: 'off' }),
    h('div', { class: 'grid2' }, field('sets', 'Sets', { ...num, inputmode: 'numeric' }), field('restSec', 'Rest (sec)', { ...num, inputmode: 'numeric' })),
    h('div', { class: 'grid2' }, field('repMin', 'Reps min', { ...num, inputmode: 'numeric' }), field('repMax', 'Reps max', { ...num, inputmode: 'numeric' })),
    field('increment', `Increment (${units()})`, num),
    check('perSide', 'Reps per side'),
    check('bodyweight', 'Bodyweight (reps only)'),
    mode === 'edit' && state.program[otherDay(day)].some((x) => x.id === orig.id)
      ? h('p', { class: 'muted small' }, `Also in Session ${otherDay(day)}: changes apply to both.`) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
      h('button', { class: 'btn', type: 'button', onclick: () => { editing = null; route(); } }, 'Cancel')));

  async function submit() {
    const n = (k, d) => { const v = parseNum(f[k].value); return v == null ? d : v; };
    const fields = {
      name: f.name.value.trim(), cue: f.cue.value.trim(),
      sets: Math.max(1, Math.round(n('sets', 1))), restSec: Math.max(0, Math.round(n('restSec', 60))),
      repMin: Math.max(1, Math.round(n('repMin', 1))), repMax: Math.max(1, Math.round(n('repMax', 1))),
      increment: Math.max(0, n('increment', 0)),
      perSide: f.perSide.checked, bodyweight: f.bodyweight.checked,
    };
    if (!fields.name) return alert('Name is required.');
    if (fields.repMax < fields.repMin) [fields.repMin, fields.repMax] = [fields.repMax, fields.repMin];
    if (fields.bodyweight) fields.increment = 0;

    let id;
    if (mode === 'edit') id = orig.id;
    else if (reuse?.value) id = reuse.value;
    else {
      const taken = new Set([...exerciseCatalog(state.program, state.sessions).keys()]);
      id = makeExerciseId(fields.name, taken);
    }
    const ex = { id, ...fields };
    const program = { ...state.program, A: [...state.program.A], B: [...state.program.B] };
    if (mode === 'add') program[day].push(ex);
    else program[day][index] = ex;
    // keep shared exercises (same id on both days) in sync
    const od = otherDay(day);
    program[od] = program[od].map((x) => (x.id === id ? { ...ex } : x));
    editing = null;
    await saveProgram(program);
    toast('Program saved');
    route();
  }
  return form;
}

// ---------------------------------------------------------------- settings & backup

function viewSettings() {
  const s = state.settings;
  const dl = deloadStatus(s, state.sessions);
  const root = h('div', null, topBar('Settings & backup'));

  root.append(h('h3', null, 'Units'),
    h('div', { class: 'seg' }, ['lb', 'kg'].map((u) =>
      h('button', { 'aria-pressed': String(s.units === u), onclick: () => setUnits(u) }, u))),
    h('p', { class: 'muted small' }, 'New sessions log in this unit. Past sessions keep theirs and are converted for display and suggestions.'));

  root.append(h('h3', null, 'Rest timer'),
    h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: !!s.beep, onchange: async (ev) => { await saveSettings({ beep: ev.target.checked }); } }),
      'Beep when rest is over'),
    h('p', { class: 'muted small' }, 'Vibration works on Android. iPhone doesn’t allow web apps to vibrate, and the beep is muted by the silent switch, so the bar also flashes.'));

  root.append(h('h3', null, 'Backup'),
    h('p', { class: 'small' }, s.lastBackupAt ? `Last backup: ${fmtDate(s.lastBackupAt, { year: 'numeric' })} (${Math.floor((Date.now() - s.lastBackupAt) / DAY)} days ago)` : 'Never backed up.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn primary block', onclick: () => exportJSON() }, 'Export backup (JSON)'),
      h('button', { class: 'btn block', onclick: () => exportCSV() }, 'Export spreadsheet (CSV)'),
      h('label', { class: 'btn block', style: 'display:flex;align-items:center;justify-content:center' },
        'Import backup (JSON)',
        h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: (ev) => importJSON(ev.target) }))));

  root.append(h('h3', null, 'Deload'),
    h('p', { class: 'small' }, dl.active
      ? `Deload week in progress, until ${fmtDate(dl.activeUntil)}.`
      : dl.anchor ? `${dl.weeks} week${dl.weeks === 1 ? '' : 's'} since last deload${s.lastDeloadAt ? '' : ' (counted from your first session)'}. Reminder after 6.` : 'Counter starts with your first session.'),
    h('div', { class: 'row' },
      dl.active ? null : h('button', { class: 'btn small', onclick: async () => { await saveSettings({ deloadStartedAt: Date.now() }); route(); } }, 'Start deload week'),
      h('button', { class: 'btn small', onclick: async () => { await saveSettings({ lastDeloadAt: Date.now(), deloadStartedAt: null }); toast('Deload counter reset'); route(); } }, 'Deload done')));

  const storageP = h('p', { class: 'small muted' }, 'Checking storage…');
  (async () => {
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const est = await navigator.storage?.estimate?.().catch(() => null);
    storageP.textContent = `${state.sessions.filter(isFinished).length} sessions stored on this device. ` +
      (persisted ? 'Storage is persistent.' : 'Storage is not marked persistent. Install to Home Screen and keep backups.') +
      (est?.usage ? ` Using ${(est.usage / 1024).toFixed(0)} KB.` : '');
  })();
  root.append(h('h3', null, 'Data'), storageP,
    h('button', { class: 'btn danger block', onclick: () => clearData() }, 'Clear all data'));
  root.append(h('p', { class: 'muted small', style: 'margin-top:24px' }, 'All data stays on this device. No accounts, no tracking.'));
  return root;
}

async function setUnits(u) {
  if (u === units()) return;
  const program = convertProgramUnits(state.program, state.program.unit || units(), u);
  await saveProgram(program);
  await saveSettings({ units: u });
  toast(`Units: ${u}`);
  route();
}

const today = () => new Date().toISOString().slice(0, 10);

async function shareOrDownload(filename, text, type) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

async function exportJSON() {
  await flushSave();
  const data = buildExport({ program: state.program, settings: state.settings, sessions: state.sessions });
  const ok = await shareOrDownload(`gym-tracker-${today()}.json`, JSON.stringify(data, null, 1), 'application/json');
  if (ok) {
    await saveSettings({ lastBackupAt: Date.now() });
    toast('Backup exported');
    route();
  }
}

async function exportCSV() {
  await flushSave();
  await shareOrDownload(`gym-tracker-${today()}.csv`, toCSV(state.sessions), 'text/csv');
}

async function importJSON(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let data;
  try {
    data = parseImport(await file.text());
  } catch (err) {
    alert(`Import failed: ${err.message}`);
    return;
  }
  const plan = planImport(state.sessions, data.sessions);
  const progDiff = data.program && !programsEqual(data.program, state.program);
  const lines = [
    `Import backup from ${data.exportedAt ? fmtDate(Date.parse(data.exportedAt), { year: 'numeric' }) : 'unknown date'}?`,
    `• ${plan.added.length} new session(s) will be added`,
    plan.conflicts.length ? `• ${plan.conflicts.length} session(s) differ from yours (you’ll be asked)` : null,
    plan.identical ? `• ${plan.identical} already present` : null,
    progDiff ? '• The backup has a different program (you’ll be asked)' : null,
  ].filter(Boolean);
  if (!confirm(lines.join('\n'))) return;

  let toWrite = [...plan.added];
  if (plan.conflicts.length && confirm(`Replace ${plan.conflicts.length} existing session(s) with the backup’s version?\n\nCancel keeps yours.`)) {
    toWrite = toWrite.concat(plan.conflicts);
  }
  if (toWrite.length) await db.putSessions(toWrite);
  if (progDiff && confirm('Replace your current program with the one from the backup?\n\nCancel keeps your current program.')) {
    const incomingUnit = data.program.unit || data.settings?.units || 'lb';
    await saveProgram({ ...data.program, unit: incomingUnit });
    await saveSettings({ units: incomingUnit });
  }
  const inc = data.settings || {};
  const latest = (k) => Math.max(state.settings[k] || 0, inc[k] || 0) || null;
  await saveSettings({ lastDeloadAt: latest('lastDeloadAt'), deloadStartedAt: latest('deloadStartedAt'), lastBackupAt: latest('lastBackupAt') });
  state.sessions = await db.getAllSessions();
  toast(`Imported ${toWrite.length} session(s)`);
  route();
}

async function clearData() {
  if (!confirm('Delete ALL sessions, program edits and settings on this device?\n\nExport a backup first if you want to keep them.')) return;
  if (!confirm('Really delete everything? This can’t be undone.')) return;
  pending.clear();
  await db.clearAll();
  rest.skip();
  await load();
  toast('All data cleared');
  go('#/');
}

// ---------------------------------------------------------------- boot

async function load() {
  const [program, settings, sessions] = await Promise.all([db.getKV('program'), db.getKV('settings'), db.getAllSessions()]);
  state.settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  state.program = program || { ...structuredClone(SEED_PROGRAM), unit: 'lb', updatedAt: Date.now() };
  state.sessions = sessions || [];
  if (!program) await db.setKV('program', state.program);
  if (!settings) await db.setKV('settings', state.settings);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => {
      updateReady = () => worker.postMessage('SKIP_WAITING');
      if (!currentRoute) route();
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !updateReady) return;
    reloaded = true;
    location.reload();
  });
}

(async function boot() {
  try {
    await load();
  } catch (err) {
    app.replaceChildren(h('p', { class: 'empty' }, `Could not open storage: ${err.message}. Private browsing can block it.`));
    return;
  }
  // Ask for persistent storage (granted more readily once installed).
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }
  // An unfinished session resumes on open.
  if (activeSession() && !location.hash) history.replaceState(null, '', '#/session');
  route();
  rest.sync();
  registerSW();
  // Unlock audio on the first touch so the rest beep can play later (iOS).
  addEventListener('pointerdown', () => rest.unlockAudio(), { once: true });
})();
