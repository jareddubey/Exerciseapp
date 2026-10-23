// Minimal inline-SVG line chart. points: [{ x: ms, y: number }]
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}

const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function lineChart(points, { label = '' } = {}) {
  const W = 320, H = 160, L = 36, R = 10, T = 12, B = 22;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  if (!points.length) return svg;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (x0 === x1) { x0 -= 1; x1 += 1; }
  const pad = Math.max(1, (y1 - y0) * 0.15);
  y0 -= pad; y1 += pad;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);

  for (const v of [Math.max(...ys), Math.min(...ys)]) {
    svg.append(el('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'grid' }));
    svg.append(el('text', { x: L - 6, y: sy(v) + 4, 'text-anchor': 'end' }, String(Math.round(v * 10) / 10)));
  }
  svg.append(el('text', { x: L, y: H - 6 }, fmtDate(points[0].x)));
  if (points.length > 1) svg.append(el('text', { x: W - R, y: H - 6, 'text-anchor': 'end' }, fmtDate(points[points.length - 1].x)));
  if (points.length > 1) {
    svg.append(el('polyline', { class: 'line', points: points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ') }));
  }
  for (const p of points) svg.append(el('circle', { cx: sx(p.x), cy: sy(p.y), r: 3.5, class: 'dot' }));
  return svg;
}

/**
 * Layered time chart. x values are day numbers (days since epoch, UTC).
 * opts: {
 *   x0, x1,                       x domain (day numbers)
 *   layers: [
 *     { type: 'band', upper: [{x,y}], lower: [{x,y}], cls }   shaded area between two lines
 *     { type: 'yband', y0, y1, cls }                           horizontal shaded range
 *     { type: 'line', points: [{x,y}], cls, dashed }
 *     { type: 'dots', points: [{x,y}], cls, r }
 *   ],
 *   markers: [{ x, label, cls }]  vertical rules (checkpoints), label at top
 *   ticks: [{ x, cls }]           short ticks on the x axis (holidays)
 *   readout(x) → string|null      tap/drag readout for the nearest day
 *   label, height, width          width is the viewBox width: smaller → larger text (small multiples)
 * }
 * Returns a wrapper div holding the readout line and the svg.
 */
export function timeChart(opts) {
  const { x0, x1, layers = [], markers = [], ticks = [], readout, label = '', height = 190, width = 320 } = opts;
  const W = width, H = height, L = 36, R = 10, T = 16, B = 22;
  const wrap = document.createElement('div');
  wrap.className = 'tchart';
  const read = document.createElement('div');
  read.className = 'readout';
  read.textContent = ' ';
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': label });
  wrap.append(read, svg);

  const ys = [];
  for (const ly of layers) {
    if (ly.type === 'band') ys.push(...ly.upper.map((p) => p.y), ...ly.lower.map((p) => p.y));
    else if (ly.type === 'yband') ys.push(ly.y0, ly.y1);
    else ys.push(...ly.points.map((p) => p.y));
  }
  if (!ys.length) return wrap;
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const pad = Math.max(0.5, (y1 - y0) * 0.08);
  y0 -= pad; y1 += pad;
  const sx = (x) => L + ((x - x0) / Math.max(1, x1 - x0)) * (W - L - R);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const pts = (list) => list.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  // Recessive grid: 4 round-number gridlines.
  const step = niceStep((y1 - y0) / 4);
  for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
    svg.append(el('line', { x1: L, x2: W - R, y1: sy(v), y2: sy(v), class: 'grid' }));
    svg.append(el('text', { x: L - 6, y: sy(v) + 4, 'text-anchor': 'end' }, String(Math.round(v * 10) / 10)));
  }
  const fmtDay = (d) => new Date(d * DAY_MS).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  svg.append(el('text', { x: L, y: H - 6 }, fmtDay(x0)));
  svg.append(el('text', { x: W - R, y: H - 6, 'text-anchor': 'end' }, fmtDay(x1)));

  for (const ly of layers) {
    if (ly.type === 'band') {
      if (ly.upper.length) svg.append(el('polygon', { class: ly.cls || 'band', points: `${pts(ly.upper)} ${pts([...ly.lower].reverse())}` }));
    } else if (ly.type === 'yband') {
      svg.append(el('rect', { class: ly.cls || 'band', x: L, width: W - L - R, y: sy(ly.y1), height: Math.max(1, sy(ly.y0) - sy(ly.y1)) }));
    } else if (ly.type === 'line') {
      if (ly.points.length > 1) svg.append(el('polyline', { class: `${ly.cls || 'line'}${ly.dashed ? ' dashed' : ''}`, points: pts(ly.points) }));
      else if (ly.points.length === 1) svg.append(el('circle', { class: 'dot', cx: sx(ly.points[0].x), cy: sy(ly.points[0].y), r: 3 }));
    } else if (ly.type === 'dots') {
      for (const p of ly.points) svg.append(el('circle', { class: ly.cls || 'dot', cx: sx(p.x), cy: sy(p.y), r: ly.r || 2.5 }));
    }
  }
  for (const m of markers) {
    svg.append(el('line', { class: m.cls || 'marker', x1: sx(m.x), x2: sx(m.x), y1: T - 4, y2: H - B }));
    const mx = sx(m.x);
    const anchor = mx > W - R - 24 ? 'end' : mx < L + 24 ? 'start' : 'middle';
    svg.append(el('text', { class: 'marker-label', x: anchor === 'end' ? W - R : mx, y: T - 6, 'text-anchor': anchor }, m.label));
  }
  for (const t of ticks) svg.append(el('line', { class: t.cls || 'tick-mark', x1: sx(t.x), x2: sx(t.x), y1: H - B, y2: H - B + 6 }));

  if (readout) {
    const cross = el('line', { class: 'crosshair', x1: 0, x2: 0, y1: T, y2: H - B, visibility: 'hidden' });
    svg.append(cross);
    const move = (ev) => {
      const box = svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      const x = Math.round(x0 + ((px - L) / (W - L - R)) * (x1 - x0));
      if (x < x0 || x > x1) return;
      const text = readout(x);
      cross.setAttribute('x1', sx(x)); cross.setAttribute('x2', sx(x));
      cross.setAttribute('visibility', 'visible');
      read.textContent = text || fmtDay(x);
    };
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); read.textContent = ' '; });
  }
  return wrap;
}

const DAY_MS = 86400000;
function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
