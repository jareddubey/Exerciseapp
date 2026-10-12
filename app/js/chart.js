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
