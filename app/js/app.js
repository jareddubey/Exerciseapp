import * as db from './db.js';
import { SEED_PROGRAM, DEFAULT_SETTINGS, DAY_NOTES } from './seed.js';
import {
  nextDay, suggestWeight, lastFor, lastNote, deloadStatus, sessionsThisWeek,
  lastWorkout, backupStatus, newSession, formatSets, formatTarget, fmtNum, isFinished,
  performedSets, exerciseCatalog, exerciseHistory, convertProgramUnits, makeExerciseId, clean, DAY,
  swapEntry, editEntry, programList, withProgramList, allProgramExercises, updateEverywhere, repsOnly, noIncrement, locationOf,
  slotName, SLOTS, DAYS, LIFT_DAYS, dayLabel, dayTitle, pairLabels, nextUp, isDayProgram,
} from './logic.js';
import { buildExport, parseImport, planImport, programsEqual, toCSV } from './backup.js';
import { lineChart } from './chart.js';
import { PROGRAM_UPDATES } from './updates.js';

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
const currentLocation = () => (state.program?.home && state.settings.location === 'home' ? 'home' : 'gym');
// Program definition of an exercise id, from any gym/home day.
const programDef = (id) => allProgramExercises(state.program).find((x) => x.id === id);

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
  function beep(times = 3) {
    if (!audio || !state.settings?.beep) return;
    try {
      const t0 = audio.currentTime;
      [0, 0.25, 0.5].slice(0, times).forEach((d) => {
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
  return { start, skip, sync, unlockAudio, position, beep };
})();

// ---------------------------------------------------------------- hold stopwatch

// An analog stopwatch in the session header for timing holds (the rest timer
// handles rests). Tap to start or pause, double-tap to reset to 0. The hand
// laps the 60-s dial; one beep at 30 s, three at 60 s.
const stopwatch = (() => {
  const R = 19;
  const C = 2 * Math.PI * R;
  const DOUBLE_TAP_MS = 300;
  let startAt = null; // running since
  let banked = 0; // seconds from earlier runs, before a pause
  let prevSec = 0;
  let raf = 0;
  let lastSec = -1;
  let lastTap = 0;
  const svg = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };
  const arc = svg('circle', { cx: 22, cy: 22, r: R, class: 'sw-arc', transform: 'rotate(-90 22 22)', 'stroke-dasharray': `0 ${C}` });
  const hand = svg('line', { x1: 22, y1: 22, x2: 22, y2: 6, class: 'sw-hand' });
  const num = svg('text', { x: 22, y: 34, class: 'sw-num' });
  const face = svg('svg', { viewBox: '0 0 44 44', 'aria-hidden': 'true' });
  face.append(svg('circle', { cx: 22, cy: 22, r: R, class: 'sw-face' }), arc);
  for (let i = 0; i < 12; i++) {
    const a = (i * 30 * Math.PI) / 180;
    const r0 = i % 3 ? 16 : 14; // longer ticks at 0, 15, 30, 45 s
    face.append(svg('line', { x1: 22 + r0 * Math.sin(a), y1: 22 - r0 * Math.cos(a), x2: 22 + 18 * Math.sin(a), y2: 22 - 18 * Math.cos(a), class: 'sw-tick' }));
  }
  face.append(num, hand, svg('circle', { cx: 22, cy: 22, r: 2, class: 'sw-hub' }));
  const el = h('button', { class: 'stopwatch', type: 'button', onclick: tap }, face);

  const elapsed = () => banked + (startAt == null ? 0 : (Date.now() - startAt) / 1000);
  function paint() {
    const sec = elapsed();
    const lap = sec % 60;
    hand.setAttribute('transform', `rotate(${lap * 6} 22 22)`);
    arc.setAttribute('stroke-dasharray', `${(C * lap) / 60} ${C}`);
    const whole = Math.floor(sec);
    if (whole === lastSec) return;
    lastSec = whole;
    num.textContent = whole || '';
    const what = startAt != null ? 'running' : whole ? 'paused' : 'ready';
    el.setAttribute('aria-label', `Hold stopwatch: ${whole} s, ${what}. Tap to start or pause, double-tap to reset.`);
  }
  // Beep as the hold passes 30 s and 60 s, but not late (app in the background).
  function marks(sec) {
    for (const [at, n] of [[30, 1], [60, 3]]) {
      if (prevSec < at && sec >= at && sec - at < 2) {
        rest.beep(n);
        navigator.vibrate?.(n === 1 ? 150 : [300, 120, 300]);
        if (at === 60) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
      }
    }
    prevSec = sec;
  }
  function frame() {
    paint();
    if (startAt == null) return;
    marks(elapsed());
    raf = requestAnimationFrame(frame);
  }
  function tap() {
    rest.unlockAudio();
    cancelAnimationFrame(raf);
    const now = Date.now();
    if (now - lastTap < DOUBLE_TAP_MS) {
      // double tap: the first tap's start or pause is undone by the reset
      lastTap = 0;
      startAt = null;
      banked = 0;
      prevSec = 0;
      el.classList.remove('flash');
    } else {
      lastTap = now;
      if (startAt != null) { banked = elapsed(); startAt = null; } else startAt = now;
      prevSec = elapsed();
    }
    el.classList.toggle('running', startAt != null);
    lastSec = -1;
    frame();
  }
  paint();
  return { el };
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
    case 'program': {
      const home = b === 'home';
      const d = home ? parts[2] : b;
      view = viewProgram(home ? 'home' : 'gym', DAYS.includes(d) ? d : 'mon');
      currentRoute = 'program';
      break;
    }
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

  const notice = state.settings.programNotice;
  if (notice) {
    root.append(h('div', { class: 'banner' },
      h('p', null, h('b', null, `Program updated: ${notice.title}`)),
      h('ul', { style: 'margin:0 0 10px;padding-left:20px' }, notice.changes.map((c) => h('li', null, c))),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: async () => { await saveSettings({ programNotice: null }); route(); } }, 'OK'),
        notice.undo === false ? null
          : h('button', { class: 'btn small', onclick: () => { if (confirm('Undo these program changes?')) undoProgramUpdate(notice); } }, 'Undo'))));
  }

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
      `Resume ${dayTitle(active.day)}`,
      h('small', null, `${locationOf(active) === 'home' ? 'Home · ' : ''}Started ${fmtTime(active.startedAt)} · ${done}/${total} sets`)));
  } else {
    const loc = currentLocation();
    if (state.program.home) {
      root.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Where are you training?' },
        [['gym', 'Gym'], ['home', 'Home']].map(([l, label]) =>
          h('button', { 'aria-pressed': String(loc === l), onclick: async () => { await saveSettings({ location: l }); route(); } }, label))));
    }
    const list = programList(state.program, next, loc);
    const pairs = new Set(list.map((x) => x.group).filter(Boolean)).size;
    root.append(
      h('button', { class: 'start', onclick: () => startSession(next) },
        `Start ${dayTitle(next)}`,
        h('small', null, `${loc === 'home' ? 'Home' : 'Gym'} · ${dl.active ? 'Deload week' : `${list.length} exercises${pairs ? ` · ${pairs} pairs` : ''}`}`)),
      h('div', { class: 'row', style: 'justify-content:center;gap:0 4px' },
        h('span', { class: 'muted small' }, 'Or start'),
        DAYS.filter((d) => d !== next).map((d) => h('button', { class: 'linkish', onclick: () => startSession(d) }, dayLabel(d)))));
  }

  const lifts = sessionsThisWeek(state.sessions, now, [...LIFT_DAYS, 'A', 'B']);
  const armor = sessionsThisWeek(state.sessions, now, ['armor']);
  root.append(h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, last ? fmtDate(last.finishedAt, { weekday: undefined }) : '—'),
      h('span', null, last ? `Last workout (${dayLabel(last.day)}${locationOf(last) === 'home' ? ' · Home' : ''})` : 'No workouts yet')),
    h('div', { class: 'stat' }, h('b', null, `${lifts}/3 · ${armor}/2`), h('span', null, 'Lifting · Armor this week'))));

  root.append(h('nav', { class: 'nav' },
    h('a', { href: '#/history' }, 'History'),
    h('a', { href: progHash(currentLocation(), active ? active.day : next) }, 'Program'),
    h('a', { href: '#/settings' }, h('span', null, 'Settings & backup',
      h('span', { class: 'muted small' }, dl.anchor && !dl.active ? ` · ${dl.weeks} wk since deload` : '')))));
  return root;
}

async function startSession(day) {
  if (activeSession()) return go('#/session');
  const dl = deloadStatus(state.settings, state.sessions);
  const s = newSession(day, state.program, state.sessions, { units: units(), deload: dl.active, location: currentLocation() });
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
    h('h1', null, `${dayTitle(session.day)}${locationOf(session) === 'home' ? ' · Home' : ''}`, progress),
    live ? stopwatch.el : null);

  const root = h('div', { class: 'session' }, header);
  if (live && DAY_NOTES[session.day]) {
    root.append(h('div', { class: 'day-note' }, DAY_NOTES[session.day].map((t) => h('p', null, t))));
  }
  // Paired exercises (A1, A2) sit together in one bordered group.
  const labels = pairLabels(session.entries.map((e) => e.target || {}));
  let group = null;
  session.entries.forEach((e, i) => {
    const card = exerciseCard(session, i, live, save, labels[i]);
    const g = /\d$/.test(labels[i] || '') ? e.target.group : null;
    if (!g) { group = null; root.append(card); return; }
    if (group?.key !== g) { group = { key: g, el: h('div', { class: 'pair-group' }) }; root.append(group.el); }
    group.el.append(card);
  });

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

function exerciseCard(session, ei, live, save, pairLabel) {
  const e = session.entries[ei];
  const unit = session.unit;
  const ex = e.target || programDef(e.exerciseId) ||
    { id: e.exerciseId, name: e.name, sets: e.sets.length, repMin: 0, repMax: 0, increment: 5, restSec: 90 };
  const bw = repsOnly(ex);
  const wUnit = ex.notch ? 'notch' : ex.perHand ? `${unit} ea` : unit;
  const opts = { units: unit, before: session.startedAt, excludeId: session.id, day: session.day };
  const last = lastFor(e.exerciseId, state.sessions, opts);
  const sug = live ? suggestWeight(ex, state.sessions, opts) : null;
  const prevNote = lastNote(e.exerciseId, state.sessions, opts);
  const inc = ex.notch ? 1 : ex.increment || (unit === 'kg' ? 1.25 : 2.5);
  const repBase = (si) => last?.sets[si]?.reps ?? last?.sets[last.sets.length - 1]?.reps ?? ex.repMax;
  // Reps, seconds (holds) or meters (carries); the stepper moves seconds and meters by 5.
  const measure = ex.measure === 'time' ? 'Sec' : ex.measure === 'distance' ? 'Meters' : 'Reps';
  const repStep = ex.measure ? 5 : 1;
  const badge = sug?.increase && !ex.band ? `↑ Add ${fmtNum(ex.increment)} ${wUnit}`
    : !sug?.hitTop ? null
      : ex.band ? '↑ Stronger band'
        : ex.notch ? '↓ Lower the bar a notch'
          : ex.bodyweight && ex.repMin < ex.repMax ? '↑ Harder variation' : null;

  const count = h('span', { class: 'ex-count' });
  const updateCount = () => { count.textContent = `${e.sets.filter((s) => s.done).length}/${e.sets.length}`; };

  const card = h('section', { class: 'card', 'aria-label': e.name },
    h('div', { class: 'ex-head' }, pairLabel ? h('span', { class: 'pair' }, pairLabel) : null, h('h2', null, e.name), count),
    ex.cue ? h('p', { class: 'cue' }, ex.cue) : null,
    h('div', { class: 'meta' },
      h('span', { class: 'target' }, formatTarget({ ...ex, sets: e.sets.length }, false)),
      h('span', { class: 'muted' }, `${ex.restSec}s rest`),
      badge ? h('span', { class: 'badge-up' }, badge) : null,
      ex.band ? h('span', { class: 'tag' }, 'BAND') : null),
    h('div', { class: 'last' },
      last
        ? [`Last${last.deload ? ' (deload)' : ''}${last.day !== session.day ? ` (${dayLabel(last.day)})` : ''} ${fmtDate(last.date, { weekday: undefined })}: `,
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
      h('span', null, `${ex.notch ? 'Notch' : 'Weight'}, unticked sets (±${fmtNum(inc)})`),
      h('button', { class: 'step', onclick: () => bump(-inc), 'aria-label': `Decrease ${ex.notch ? 'notch' : 'weight'} by ${fmtNum(inc)} ${ex.notch ? '' : unit}` }, '−'),
      h('button', { class: 'step', onclick: () => bump(inc), 'aria-label': `Increase ${ex.notch ? 'notch' : 'weight'} by ${fmtNum(inc)} ${ex.notch ? '' : unit}` }, '+')));
  }

  const setsEl = h('div', { class: 'sets' });
  card.append(setsEl);

  function renderSets() {
    weightInputs.length = 0;
    setsEl.replaceChildren(h('div', { class: `set-head${bw ? ' bw' : ''}`, 'aria-hidden': 'true' },
      h('span', null, '#'),
      bw ? null : h('span', { style: 'text-align:center' }, wUnit),
      h('span', { class: 'c-reps' }, ex.perSide ? `${measure} /side` : measure),
      h('span', { class: 'c-done' }, 'Done')));
    e.sets.forEach((s, si) => setsEl.append(setRow(s, si)));
    updateCount();
  }

  function setRow(s, si) {
    const row = h('div', { class: `set${bw ? ' bw' : ''}${s.done ? ' done' : ''}` });
    const reps = h('input', {
      class: 'num', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
      'aria-label': `Set ${si + 1} ${measure.toLowerCase()}`, placeholder: String(repBase(si)), value: s.reps ?? '',
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
        'aria-label': ex.notch ? `Set ${si + 1} notch` : `Set ${si + 1} weight (${wUnit})`, placeholder: '—', value: fmtNum(s.weight),
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
        if (s.done && live) {
          const nx = nextUp(session.entries, ei);
          rest.start(ex.restSec || 60, nx == null ? e.name : `next: ${session.entries[nx].name}`);
        }
      },
    }, '✓');
    row.append(
      h('button', { class: 'step', onclick: () => stepReps(-repStep), 'aria-label': `Set ${si + 1} ${measure.toLowerCase()} minus ${repStep}` }, '−'),
      reps,
      h('button', { class: 'step', onclick: () => stepReps(repStep), 'aria-label': `Set ${si + 1} ${measure.toLowerCase()} plus ${repStep}` }, '+'),
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
      class: 'btn small', style: 'margin-left:auto', 'aria-label': `Edit ${e.name} sets, reps and settings`,
      onclick: () => card.replaceChildren(...editPanel(session, ei)),
    }, '✎ Edit') : null,
    live ? h('button', {
      class: 'btn small', 'aria-label': `Swap ${e.name} for another exercise`,
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
  const inProgram = programDef(id);
  if (inProgram) return { ...inProgram };
  const snap = state.sessions.filter((s) => s.entries.some((e) => e.exerciseId === id))
    .sort((a, b) => b.startedAt - a.startedAt)[0]?.entries.find((e) => e.exerciseId === id);
  return snap?.target ? { ...snap.target } : { id, name: snap?.name || id, sets: 2, repMin: 10, repMax: 12, restSec: 60, increment: 5 };
}

// How an exercise is loaded, as one choice in forms; stored as flags.
const LOAD_TYPES = [
  ['weight', 'Weight (machine, cable, barbell)'],
  ['dumbbell', 'Dumbbells (weight per hand)'],
  ['bodyweight', 'Bodyweight (no weight)'],
  ['band', 'Band (no weight)'],
  ['notch', 'Bar height (log the notch)'],
];
const loadOf = (ex) => (ex?.notch ? 'notch' : ex?.band ? 'band' : ex?.bodyweight ? 'bodyweight' : ex?.perHand ? 'dumbbell' : 'weight');
const loadFlags = (load) => ({ bodyweight: load === 'bodyweight', band: load === 'band', perHand: load === 'dumbbell', notch: load === 'notch' });
const loadSelect = (value) => h('select', { class: 'field' },
  LOAD_TYPES.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));

// What each set counts: reps, seconds (holds) or meters (carries). Stored as `measure`.
const MEASURES = [['reps', 'Reps'], ['time', 'Seconds (holds)'], ['distance', 'Meters (carries)']];
const MEASURE_WORD = { reps: 'Reps', time: 'Seconds', distance: 'Meters' };
/** Measure select plus the min/max labels that follow it. */
function measureControls(value) {
  const select = h('select', { class: 'field' },
    MEASURES.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  const minL = h('span');
  const maxL = h('span');
  const relabel = () => { minL.textContent = `${MEASURE_WORD[select.value]} min`; maxL.textContent = `${MEASURE_WORD[select.value]} max`; };
  select.addEventListener('change', relabel);
  relabel();
  return { select, minL, maxL };
}
/** Store the measure on an exercise (absent means reps). */
function setMeasure(ex, value) {
  if (value === 'time' || value === 'distance') ex.measure = value;
  else delete ex.measure;
  return ex;
}

// Inline form that replaces an exercise card to change its parameters mid-workout.
// Same id, so history and progression continue.
function editPanel(session, ei) {
  const e = session.entries[ei];
  const base = e.target || exerciseDef(e.exerciseId);
  const inProgram = allProgramExercises(state.program).some((x) => x.id === e.exerciseId);

  const text = (v, attrs = {}) => h('input', { class: 'field', autocomplete: 'off', value: v ?? '', ...attrs });
  const num = (v, mode = 'numeric') => text(String(v ?? ''), { type: 'text', inputmode: mode });
  const f = {
    name: text(base.name || e.name), cue: text(base.cue),
    sets: num(e.sets.length), restSec: num(base.restSec ?? 60),
    repMin: num(base.repMin ?? 10), repMax: num(base.repMax ?? 12),
    increment: num(base.increment || (session.unit === 'kg' ? 2.5 : 5), 'decimal'),
  };
  const perSide = h('input', { type: 'checkbox', checked: !!base.perSide });
  const load = loadSelect(loadOf(base));
  const meas = measureControls(base.measure || 'reps');
  const permanent = h('input', { type: 'checkbox' });

  async function apply() {
    const nm = f.name.value.trim();
    if (!nm) { alert('Name is required.'); return; }
    const n = (inp, d) => { const v = parseNum(inp.value); return v == null ? d : v; };
    const setCount = Math.max(1, Math.round(n(f.sets, e.sets.length)));
    const ex = {
      ...base, id: e.exerciseId, name: nm, cue: f.cue.value.trim(),
      sets: session.deload ? setCount + 1 : setCount, restSec: Math.max(0, Math.round(n(f.restSec, 60))),
      repMin: Math.max(1, Math.round(n(f.repMin, 10))), repMax: Math.max(1, Math.round(n(f.repMax, 12))),
      perSide: perSide.checked, ...loadFlags(load.value),
    };
    setMeasure(ex, meas.select.value);
    ex.increment = noIncrement(ex) ? 0 : Math.max(0, n(f.increment, 5));
    if (ex.repMax < ex.repMin) [ex.repMin, ex.repMax] = [ex.repMax, ex.repMin];
    if (repsOnly(ex) && !repsOnly(base) && e.sets.some((s) => s.weight != null)
      && !confirm('Reps-only load clears the weights logged for this exercise today. Continue?')) return;

    const r = editEntry(e, ex, setCount);
    session.entries = session.entries.map((x, i) => (i === ei ? r.entry : x));
    autosave(session);
    await flushSave(session.id);
    if (permanent.checked) await saveProgram(updateEverywhere(state.program, e.exerciseId, ex, [locationOf(session), session.day]));
    toast(r.kept ? `Saved · kept ${r.kept} logged set${r.kept > 1 ? 's' : ''}` : permanent.checked ? 'Saved to workout and program' : 'Saved for this workout');
    route();
  }

  const shared = SLOTS.filter(([l, d]) => programList(state.program, d, l).some((x) => x.id === e.exerciseId))
    .map(([l, d]) => slotName(d, l));
  return [
    h('h2', null, `Edit ${e.name}`),
    h('p', { class: 'muted small' }, 'Just for this workout unless you tick the box below. History continues under the same exercise.'),
    h('div', { class: 'form', style: 'margin-top:10px' },
      h('label', null, 'Name', f.name),
      h('label', null, 'Cue (optional)', f.cue),
      h('label', null, 'Load', load),
      h('label', null, 'Each set counts', meas.select),
      h('div', { class: 'grid2' },
        h('label', null, session.deload ? 'Sets today (deload)' : 'Sets', f.sets),
        h('label', null, 'Rest after (sec)', f.restSec)),
      h('div', { class: 'grid2' }, h('label', null, meas.minL, f.repMin), h('label', null, meas.maxL, f.repMax)),
      h('label', null, `Increment (${session.unit})`, f.increment),
      h('label', { class: 'check' }, perSide, 'Per side'),
      inProgram ? h('label', { class: 'check' }, permanent, `Also save to the program (${shared.join(', ')})`) : null,
      inProgram && shared.length > 1 ? h('p', { class: 'muted small' }, `Name, cue and load change on every day; sets, reps and rest only on ${dayLabel(session.day)}.`) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: apply }, 'Save'),
        h('button', { class: 'btn', onclick: () => route() }, 'Cancel'))),
  ];
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
  const load = loadSelect(loadOf(base));
  const meas = measureControls('reps');
  const fields = h('div', { class: 'form' },
    h('label', null, 'Name', name),
    h('label', null, 'Load', load),
    h('label', null, 'Each set counts', meas.select),
    h('div', { class: 'grid2' }, h('label', null, 'Sets', f.sets), h('label', null, 'Rest after (sec)', f.restSec)),
    h('div', { class: 'grid2' }, h('label', null, meas.minL, f.repMin), h('label', null, meas.maxL, f.repMax)),
    h('label', null, `Increment (${units()})`, f.increment),
    h('label', { class: 'check' }, perSide, 'Per side'));
  pick.addEventListener('change', () => { fields.hidden = !!pick.value; });

  const loc = locationOf(session);
  const inProgram = programList(state.program, session.day, loc).some((x) => x.id === e.exerciseId);
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
        perSide: perSide.checked, ...loadFlags(load.value),
      };
      setMeasure(ex, meas.select.value);
      ex.increment = noIncrement(ex) ? 0 : Math.max(0, n(f.increment, 5));
      if (ex.repMax < ex.repMin) [ex.repMin, ex.repMax] = [ex.repMax, ex.repMin];
    }
    // The replacement takes over this slot's pair and, in a pair, its rest.
    if (base.group) ex = { ...ex, group: base.group, restSec: base.restSec ?? ex.restSec };
    else delete ex.group;
    const r = swapEntry(session, ei, ex, state.sessions);
    session.entries = r.entries;
    autosave(session);
    await flushSave(session.id);
    if (permanent.checked) {
      const list = programList(state.program, session.day, loc).map((x) => (x.id === e.exerciseId ? { ...ex } : x));
      await saveProgram(withProgramList(state.program, session.day, loc, list));
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
      inProgram ? h('label', { class: 'check' }, permanent, `Also replace it in the ${slotName(session.day, loc)} program`) : null,
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
  if (!confirm(`Delete ${dayTitle(session.day)} from ${fmtDate(session.startedAt)}? This can’t be undone.`)) return;
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
          h('div', { class: 'l1' }, `${fmtDate(s.startedAt, { year: 'numeric' })} · ${dayLabel(s.day)}${locationOf(s) === 'home' ? ' · Home' : ''} `, s.deload ? h('span', { class: 'tag deload' }, 'DELOAD') : null),
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
  const ex = programDef(id) || exerciseDef(id);
  const hist = exerciseHistory(id, state.sessions, units());
  const root = h('div', null, topBar(name, { back: '#/history/exercises' }));
  if (!hist.length) {
    root.append(h('p', { class: 'empty' }, 'No history yet.'));
    return root;
  }
  // A notch number isn't a load to chart; holds and carries total seconds or meters.
  const weighted = !ex.notch && hist.some((x) => x.top != null);
  const points = hist.map((x) => ({ x: x.date, y: weighted ? x.top : x.sets.reduce((n, s) => n + s.reps, 0) }))
    .filter((p) => p.y != null);
  const total = ex.measure === 'time' ? 'Total seconds' : ex.measure === 'distance' ? 'Total meters' : 'Total reps';
  root.append(h('div', { class: 'card' },
    h('h2', null, weighted ? `Top-set weight (${units()}${ex.perHand ? ' each' : ''})` : total),
    lineChart(points, { label: `${name} progress chart` })));
  root.append(h('div', { class: 'list' }, [...hist].reverse().map((x) =>
    h('a', { href: `#/session/${x.sessionId}` },
      h('div', null,
        h('div', { class: 'l1' }, `${fmtDate(x.date, { year: 'numeric' })} · ${dayLabel(x.day)}${x.location === 'home' ? ' · Home' : ''}`, x.deload ? ' · deload' : ''),
        h('div', { class: 'l2' }, formatSets(x.sets, units(), ex) || '—'),
        x.note ? h('div', { class: 'l2' }, `“${x.note}”`) : null)))));
  return root;
}

// ---------------------------------------------------------------- program editor

let editing = null; // { loc, day, index, mode: 'edit'|'add'|'swap' }

const progHash = (loc, day) => (loc === 'home' ? `#/program/home/${day}` : `#/program/${day}`);
const isEditing = (loc, day) => editing && editing.loc === loc && editing.day === day;
const loadLabel = (ex) => (ex.band ? 'band' : ex.bodyweight ? 'bodyweight' : ex.notch ? 'bar notch'
  : `+${fmtNum(ex.increment)} ${units()}${ex.perHand ? ' ea' : ''}`);
// Other program days that also contain this exercise id (shared history).
const otherSlotsWith = (id, loc, day) => SLOTS
  .filter(([l, d]) => !(l === loc && d === day) && programList(state.program, d, l).some((x) => x.id === id))
  .map(([l, d]) => slotName(d, l));

function viewProgram(loc, day) {
  const list = programList(state.program, day, loc);
  const root = h('div', null, topBar('Program'));
  const nav = (l, d) => () => { editing = null; go(progHash(l, d)); };
  root.append(
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Location' },
      [['gym', 'Gym'], ['home', 'Home']].map(([l, label]) =>
        h('button', { 'aria-pressed': String(l === loc), onclick: nav(l, day) }, label))),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Day', style: 'margin-top:8px' },
      DAYS.map((d) => h('button', { 'aria-pressed': String(d === day), onclick: nav(loc, d) }, dayLabel(d)))));
  if (DAY_NOTES[day]) root.append(h('div', { class: 'day-note' }, DAY_NOTES[day].map((t) => h('p', null, t))));
  root.append(h('p', { class: 'muted small' },
    `Weights and increments in ${units()}. Exercises with the same pair letter alternate sets. Renaming keeps history; “Swap” starts a new exercise and leaves the old history under the old one.`));

  const labels = pairLabels(list);
  list.forEach((ex, i) => {
    if (isEditing(loc, day) && editing.index === i && editing.mode !== 'add') {
      root.append(exerciseForm(loc, day, i, editing.mode));
      return;
    }
    const shared = otherSlotsWith(ex.id, loc, day);
    root.append(h('div', { class: 'card prog-item' },
      h('div', { class: 'ex-head' }, labels[i] ? h('span', { class: 'pair' }, labels[i]) : null,
        h('h2', null, ex.name, shared.map((name) => h('span', { class: 'tag', style: 'margin-left:6px' }, `ALSO ${name.toUpperCase()}`)))),
      ex.cue ? h('p', { class: 'cue' }, ex.cue) : null,
      h('div', { class: 'meta muted' }, `${formatTarget(ex)} · ${ex.restSec}s rest · ${loadLabel(ex)}`),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', disabled: i === 0, 'aria-label': 'Move up', onclick: () => move(loc, day, i, -1) }, '↑'),
        h('button', { class: 'btn small', disabled: i === list.length - 1, 'aria-label': 'Move down', onclick: () => move(loc, day, i, 1) }, '↓'),
        h('button', { class: 'btn small', onclick: () => { editing = { loc, day, index: i, mode: 'edit' }; route(); } }, 'Edit'),
        h('button', { class: 'btn small', onclick: () => { editing = { loc, day, index: i, mode: 'swap' }; route(); } }, 'Swap'),
        h('button', { class: 'btn small danger', 'aria-label': `Remove ${ex.name}`, onclick: () => removeEx(loc, day, i) }, '✕'))));
  });

  if (isEditing(loc, day) && editing.mode === 'add') root.append(exerciseForm(loc, day, list.length, 'add'));
  else {
    root.append(h('button', { class: 'btn primary block', style: 'margin-top:16px', onclick: () => { editing = { loc, day, index: list.length, mode: 'add' }; route(); } }, '+ Add exercise'));
  }
  return root;
}

async function move(loc, day, i, d) {
  const list = [...programList(state.program, day, loc)];
  [list[i], list[i + d]] = [list[i + d], list[i]];
  await saveProgram(withProgramList(state.program, day, loc, list));
  route();
}

async function removeEx(loc, day, i) {
  const list = programList(state.program, day, loc);
  if (!confirm(`Remove ${list[i].name} from ${slotName(day, loc)}? Its history is kept.`)) return;
  await saveProgram(withProgramList(state.program, day, loc, list.filter((_, j) => j !== i)));
  route();
}

function exerciseForm(loc, day, index, mode) {
  const list = programList(state.program, day, loc);
  const orig = mode === 'add' ? null : list[index];
  const base = mode === 'edit' ? orig : {
    name: '', cue: '', sets: orig?.sets ?? 2, repMin: orig?.repMin ?? 10, repMax: orig?.repMax ?? 12,
    restSec: orig?.restSec ?? 60, increment: orig?.increment || (units() === 'kg' ? 2.5 : 5), perSide: false,
    perHand: loc === 'home', group: orig?.group ?? '',
  };
  const f = {};
  const field = (key, label, attrs = {}) => {
    f[key] = h('input', { class: 'field', value: base[key] ?? '', ...attrs });
    return h('label', null, label, f[key]);
  };
  f.perSide = h('input', { type: 'checkbox', checked: !!base.perSide });
  f.load = loadSelect(loadOf(base));
  const meas = measureControls(base.measure || 'reps');

  // Reuse an existing exercise (shares its history), e.g. biceps curl on both days.
  let reuse = null;
  if (mode !== 'edit') {
    const inDay = new Set(list.map((x) => x.id));
    const cat = exerciseCatalog(state.program, state.sessions);
    const opts = [...cat.entries()].filter(([id]) => !inDay.has(id)).sort((a, b) => a[1].localeCompare(b[1]));
    if (opts.length) {
      reuse = h('select', { class: 'field' },
        h('option', { value: '' }, 'New exercise'),
        opts.map(([id, name]) => h('option', { value: id }, name)));
      reuse.addEventListener('change', () => {
        if (!reuse.value) return;
        const ex = exerciseDef(reuse.value);
        f.name.value = ex.name;
        for (const k of ['cue', 'sets', 'repMin', 'repMax', 'restSec', 'increment']) f[k].value = ex[k] ?? '';
        f.perSide.checked = !!ex.perSide;
        f.load.value = loadOf(ex);
        meas.select.value = ex.measure || 'reps';
        meas.select.dispatchEvent(new Event('change'));
      });
    }
  }

  const shared = mode === 'edit' ? otherSlotsWith(orig.id, loc, day) : [];
  const num = { type: 'text', inputmode: 'decimal' };
  const form = h('form', { class: 'card form', onsubmit: (ev) => { ev.preventDefault(); submit(); } },
    h('h2', null, mode === 'edit' ? `Edit ${orig.name}` : mode === 'swap' ? `Swap out ${orig.name}` : `Add to ${slotName(day, loc)}`),
    reuse ? h('label', null, 'Exercise', reuse) : null,
    field('name', 'Name', { required: true, autocomplete: 'off' }),
    field('cue', 'Cue (optional)', { autocomplete: 'off' }),
    h('label', null, 'Load', f.load),
    h('label', null, 'Each set counts', meas.select),
    h('div', { class: 'grid2' }, field('sets', 'Sets', { ...num, inputmode: 'numeric' }), field('restSec', 'Rest after (sec)', { ...num, inputmode: 'numeric' })),
    h('div', { class: 'grid2' },
      h('label', null, meas.minL, f.repMin = h('input', { class: 'field', value: base.repMin ?? '', ...num, inputmode: 'numeric' })),
      h('label', null, meas.maxL, f.repMax = h('input', { class: 'field', value: base.repMax ?? '', ...num, inputmode: 'numeric' }))),
    field('increment', `Increment (${units()})`, num),
    field('group', 'Pair letter (optional, e.g. A)', { autocomplete: 'off', maxlength: '2', autocapitalize: 'characters' }),
    h('label', { class: 'check' }, f.perSide, 'Per side'),
    shared.length ? h('p', { class: 'muted small' }, `Also in ${shared.join(', ')}: name, cue and load change there too; sets, reps, rest and pair stay per day.`) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'submit' }, 'Save'),
      h('button', { class: 'btn', type: 'button', onclick: () => { editing = null; route(); } }, 'Cancel')));

  async function submit() {
    const n = (k, d) => { const v = parseNum(f[k].value); return v == null ? d : v; };
    const fields = {
      name: f.name.value.trim(), cue: f.cue.value.trim(),
      sets: Math.max(1, Math.round(n('sets', 1))), restSec: Math.max(0, Math.round(n('restSec', 60))),
      repMin: Math.max(1, Math.round(n('repMin', 1))), repMax: Math.max(1, Math.round(n('repMax', 1))),
      perSide: f.perSide.checked, ...loadFlags(f.load.value),
    };
    if (!fields.name) return alert('Name is required.');
    if (fields.repMax < fields.repMin) [fields.repMin, fields.repMax] = [fields.repMax, fields.repMin];
    setMeasure(fields, meas.select.value);
    fields.increment = noIncrement(fields) ? 0 : Math.max(0, n('increment', 0));
    const group = f.group.value.trim().toUpperCase();
    if (group) fields.group = group;

    let id;
    if (mode === 'edit') id = orig.id;
    else if (reuse?.value) id = reuse.value;
    else {
      const taken = new Set([...exerciseCatalog(state.program, state.sessions).keys()]);
      id = makeExerciseId(fields.name, taken);
    }
    const ex = { id, ...fields };
    const next = [...list];
    if (mode === 'add') next.push(ex);
    else next[index] = ex;
    // keep shared exercises (same id on other days) in sync
    const program = updateEverywhere(withProgramList(state.program, day, loc, next), id, ex, [loc, day]);
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
  // Backups from before the 3-day program hold an A/B program; it isn't applied.
  const oldProgram = data.program && !isDayProgram(data.program);
  const progDiff = data.program && !oldProgram && !programsEqual(data.program, state.program);
  const lines = [
    `Import backup from ${data.exportedAt ? fmtDate(Date.parse(data.exportedAt), { year: 'numeric' }) : 'unknown date'}?`,
    `• ${plan.added.length} new session(s) will be added`,
    plan.conflicts.length ? `• ${plan.conflicts.length} session(s) differ from yours (you’ll be asked)` : null,
    plan.identical ? `• ${plan.identical} already present` : null,
    progDiff ? '• The backup has a different program (you’ll be asked)' : null,
    oldProgram ? '• The backup’s program is the old A/B one, so your current program is kept' : null,
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
  if (!program) {
    // A fresh program already includes every update.
    state.settings.appliedUpdates = PROGRAM_UPDATES.map((u) => u.id);
    await db.setKV('program', state.program);
    await db.setKV('settings', state.settings);
  } else {
    await applyProgramUpdates();
  }
  if (!settings) await db.setKV('settings', state.settings);
}

// One-time updates to a program already on the device. The previous program is
// kept so the home-screen notice can offer Undo.
async function applyProgramUpdates() {
  const applied = new Set(state.settings.appliedUpdates || []);
  const pending = PROGRAM_UPDATES.filter((u) => !applied.has(u.id));
  if (!pending.length) return;
  const before = state.program;
  let program = before;
  const titles = [];
  const changes = [];
  for (const u of pending) {
    applied.add(u.id);
    const r = u.apply(program);
    if (r.changes.length) { program = r.program; titles.push(u.title); changes.push(...r.changes); }
  }
  if (changes.length) {
    // One notice (and one Undo) for everything applied on this launch, merged
    // with a notice the user hasn't dismissed yet.
    const prev = state.settings.programNotice;
    const id = pending[pending.length - 1].id;
    await db.setKV(`programBackup:${id}`, prev ? (await db.getKV(`programBackup:${prev.id}`)) || before : before);
    await saveProgram(program);
    state.settings.programNotice = {
      id,
      title: [prev?.title, ...titles].filter(Boolean).join(' + '),
      changes: [...(prev?.changes || []), ...changes],
      undo: prev?.undo !== false && pending.every((u) => u.undo !== false),
    };
  }
  await saveSettings({ appliedUpdates: [...applied] });
}

async function undoProgramUpdate(notice) {
  const prev = await db.getKV(`programBackup:${notice.id}`);
  if (!prev) return;
  await saveProgram(prev);
  await saveSettings({ programNotice: null });
  toast('Program change undone');
  route();
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
