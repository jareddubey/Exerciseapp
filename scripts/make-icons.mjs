// Renders app/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: node scripts/make-icons.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../app/icons/icon.svg', import.meta.url), 'utf8');
const out = (f) => new URL(`../app/icons/${f}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, file, { square = false, pad = 0 } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = square ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:${square ? '#2f5d62' : 'transparent'}">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center">
    <div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body></html>`);
  await page.screenshot({ path: out(file), omitBackground: !square });
}
await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
await render(180, 'apple-touch-icon.png', { square: true }); // iOS rounds corners itself
await render(512, 'maskable-512.png', { square: true, pad: 56 });
await browser.close();
console.log('icons written');
