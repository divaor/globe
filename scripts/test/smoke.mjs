#!/usr/bin/env node
// Headless smoke test with regression checks. Run against a dev or preview server:
//   npm run build && npx vite preview --port 4173 &   then   npm run test:smoke [-- http://localhost:4173/]
// Checks: the app boots without errors; country colours survive at the most detailed zoom
// (a flipped lake polygon once painted over them); the More menu sits above the legend; a legend
// highlight is dropped when the filter changes; the organisations filter can compare two.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { ({ chromium, devices } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }

const url = process.argv[2] || 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures.push(msg); };

async function open(opts, hash) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + hash, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  return { page, errors, ctx };
}

// 1. Boot + colours at the most detailed level of detail.
{
  const { page, errors, ctx } = await open({ viewport: { width: 1000, height: 600 } }, '#p=globe&l=political&c=84.1,28.3,14&lang=en');
  await page.waitForFunction(() => window.atlas.app.renderer.lod === '10m', null, { timeout: 30000 }).catch(() => {});
  // Labels and grid lines off, so the sample hits the country fill.
  await page.evaluate(() => {
    const ren = window.atlas.app.renderer;
    ren.settings.labels = { countries: false, capitals: false, cities: false, seas: false };
    ren.settings.graticule = false;
    ren.requestRender();
  });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const ren = window.atlas.app.renderer;
    const p = ren.view.project(84.1, 28.3); // central Nepal
    const c = document.getElementById('fg');
    const d = c.getContext('2d').getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data;
    const lake = ren.theme.lake;
    return { lod: ren.lod, px: [...d], lake };
  });
  check(r.lod === '10m', `detailed (10m) data loads when zoomed in (lod ${r.lod})`);
  const hex = '#' + r.px.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
  const lake = [1, 3, 5].map((i) => parseInt(r.lake.slice(i, i + 2), 16));
  const dist = Math.hypot(...lake.map((v, i) => v - r.px[i]));
  check(r.px[3] === 255 && dist > 60, `country colour visible at 10m (pixel ${hex}, lake ${r.lake}, distance ${Math.round(dist)})`);
  check(!errors.length, `no page errors on boot${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 2. Phone: the More menu is above the open legend.
{
  const { page, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=-100,25,3&lang=en');
  await page.click('.legend-toggle');
  await page.click('[data-dock="more"]');
  await page.waitForTimeout(300);
  const onTop = await page.evaluate(() => {
    const m = document.querySelector('.menu');
    const lg = document.querySelector('.legend');
    const a = m.getBoundingClientRect(), b = lg.getBoundingClientRect();
    const x = Math.max(a.left, b.left) + 4, y = Math.max(a.top, b.top) + 4; // a point inside both
    return m.contains(document.elementFromPoint(x, y));
  });
  check(onTop, 'More menu sits above the legend');
  await ctx.close();
}

// 3. Legend highlight is dropped on filter change; organisations compare.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=organizations&c=15,48,2.2&lang=en');
  await page.click('.legend-toggle');
  const pickers = await page.locator('.lg-select').count();
  check(pickers === 2, `organisation pickers in the legend (${pickers})`);
  if (pickers === 2) {
    await page.selectOption('.lg-select >> nth=0', 'nato');
    await page.selectOption('.lg-select >> nth=1', 'eu');
    await page.waitForTimeout(500);
    const items = await page.evaluate(() => [...document.querySelectorAll('.lg-item .lg-label')].map((e) => e.textContent));
    check(items.length === 3 && /Both/.test(items.join()), `compare shows only/both/only (${items.join(' | ')})`);
  }
  await page.click('.lg-item >> nth=0');
  const banner = await page.evaluate(() => { const b = document.querySelector('.lg-banner'); return b && !b.hidden ? b.textContent : ''; });
  check(/countries/.test(banner), `selected category's full name shown on the map (${banner})`);
  const before = await page.evaluate(() => window.atlas.app.renderer.highlight?.size ?? 0);
  await page.evaluate(() => { window.atlas.app.deactivate('organizations'); window.atlas.app.activate('fact-daylight_saving'); });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.atlas.app.renderer.highlight?.size ?? 0);
  check(before > 0 && after === 0, `legend highlight cleared when the filter changes (${before} -> ${after})`);
  check(await page.evaluate(() => document.querySelector('.lg-banner').hidden), 'banner hidden once the highlight is cleared');
  check(!errors.length, `no page errors in filters${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
