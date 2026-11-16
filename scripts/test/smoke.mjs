#!/usr/bin/env node
// Headless smoke test with regression checks. Run against a dev or preview server:
//   npm run build && npx vite preview --port 4173 &   then   npm run test:smoke [-- http://localhost:4173/]
// Checks: the app boots without errors; country colours survive at the most detailed zoom
// (a flipped lake polygon once painted over them); the More menu sits above the legend; a legend
// highlight is dropped when the filter changes; the organisations filter can compare two; frames
// get lighter while the map moves; the compact country strip; the filters search box stays clear
// of the scrolled list; the filters list stays put when you tap a filter and when you reopen it;
// data grids keep their colours over land while the map moves; northern countries stay drawn on
// zoomed-in flat maps; yesterday's satellite picture is not empty (needs NASA GIBS online); the
// wars and conquests mode plays a conflict, with battle cards and step details; a story opens from a
// shared link; a journey keeps its trail on the map; the Writing systems filter with its script letters in
// the app's own fonts; a script sample on a story card (Phoenician letters) and a religions story; a
// disaster step with its time of day and a plagues story;
// Compare two filters (the two-colour map, its chart linked to the globe, a total divided
// by another, categories, Spanish); the quizzes made from the stories (with a picture opened full screen and
// zoomed), Guess the link and Which language
// family?, a city tour that hops between collections, and the tours of holy places, the alphabet,
// pandemics and tsunamis; Put them in order, Time detective, the daily challenge, your progress, On this day
// with the stories, and a new city tour; terrain in detail (with stand-in tiles): tiles loaded and freed, memory
// capped, detail off, only on Wi-Fi, the counter, the deeper zoom, a saved area offline, and the 3D view.
import { createRequire } from 'node:module';
import fs from 'node:fs';
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
  // A page whose outside server is slow (NASA's satellite tiles) may never go quiet: the checks that need its
  // layer wait for it themselves, so a long load does not stop the whole run.
  await page.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => {
    if (!/Timeout/.test(String(e))) throw e;
    console.log(`note: ${hash} was still loading after 45 s (a slow outside server); going on`);
  });
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

// 4. Motion: lighter frames while moving, GPU world texture when forced on, sharp again after.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=20,15,1.3&lang=en');
  const r = await page.evaluate(async () => {
    const ren = window.atlas.app.renderer;
    const frames = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const full = ren.view.dpr;
    Object.defineProperty(ren.gl, 'software', { value: false, configurable: true });
    ren.requestRender();
    await new Promise((res) => setTimeout(res, 500));
    ren.moving = true; ren.view.lon += 1; ren.requestRender();
    await frames();
    const moving = { dpr: ren.view.dpr, gpu: ren.gpuFrame, lod: ren.lod };
    ren.moving = false; ren.requestRender();
    await new Promise((res) => setTimeout(res, 600));
    return { full, moving, after: { dpr: ren.view.dpr, gpu: ren.gpuFrame } };
  });
  check(r.moving.dpr < r.full && r.after.dpr === r.full, `fewer pixels while moving (${r.full} -> ${r.moving.dpr} -> ${r.after.dpr})`);
  check(r.moving.gpu && !r.after.gpu, `GPU world texture while moving, vectors when still (${r.moving.gpu} / ${r.after.gpu})`);
  check(!errors.length, `no page errors in motion${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 5. With a filter on, a tapped country gets the compact strip (outline kept); the flag opens the full panel.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=fact-tobacco_pct&c=0,18,3&lang=en');
  const tap = (lon, lat) => page.evaluate(([lon, lat]) => { const p = window.atlas.app.renderer.view.project(lon, lat); window.atlas.app.emit('tap', p[0], p[1]); }, [lon, lat]);
  const state = () => page.evaluate(() => {
    const c = document.querySelector('.country-card');
    return { sel: window.atlas.app.selection, compact: c.classList.contains('compact'), hidden: c.hidden, h: c.offsetHeight, text: c.innerText };
  });
  await tap(-2, 17);
  await page.waitForTimeout(600);
  const a = await state();
  check(a.sel === 'MLI' && a.compact && !a.hidden && a.h < 120 && /Tobacco/.test(a.text), `compact strip with the filter value (${a.sel}, ${a.h}px)`);
  await page.click('.cc-flag');
  await page.waitForTimeout(400);
  const b = await state();
  check(!b.compact && b.sel === 'MLI', 'flag opens the full panel, selection kept');
  await tap(9, 17);
  await page.waitForTimeout(600);
  const c = await state();
  check(c.sel === 'NER' && c.compact, 'next country starts compact again');
  check(!errors.length, `no page errors with the card${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 6. Filters sheet on a phone: the search box stays above the list, so scrolled cards never show
// through it (it used to scroll with the list and was see-through), and it still filters.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=-100,60,3&lang=en');
  await page.click('[data-dock="filters"]');
  await page.waitForTimeout(500);
  const r = await page.evaluate(async () => {
    const body = document.querySelector('.sheet-body');
    body.scrollTop = 900;
    await new Promise((res) => setTimeout(res, 300));
    const s = document.querySelector('.search-row').getBoundingClientRect();
    const v = body.getBoundingClientRect();
    // A card shows only where the scrolling body doesn't clip it.
    const behind = [...body.querySelectorAll('.fcard')].filter((c) => {
      const b = c.getBoundingClientRect();
      const top = Math.max(b.top, v.top), bottom = Math.min(b.bottom, v.bottom);
      return bottom > top && bottom > s.top && top < s.bottom && b.right > s.left && b.left < s.right;
    }).length;
    return { scrolled: body.scrollTop, behind, shown: s.height > 0 };
  });
  check(r.scrolled > 0 && r.shown && r.behind === 0, `filter search stays clear of the scrolled list (${r.behind} card(s) behind it)`);
  await page.fill('.search-input', 'tobacco');
  await page.waitForTimeout(200);
  const names = await page.$$eval('.sheet-body .fcard-name', (els) => els.map((e) => e.textContent));
  check(names.length > 0 && names.some((n) => /tobacco/i.test(n)), `filter search still filters (${names.length} result(s) for "tobacco")`);
  check(!errors.length, `no page errors in the filters sheet${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 7. Filters list on a phone: the tapped filter stays under your finger (also once its data has
// loaded, and at the top of the list, where the browser doesn't hold it), and the list reopens
// where it was left after the sheet is closed by tapping the map.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=-100,40,2&lang=en');
  await page.waitForTimeout(4800); // let the gesture hint go
  await page.tap('[data-dock="filters"]');
  await page.waitForTimeout(600);
  const where = (id) => page.evaluate((id) => {
    const body = document.querySelector('.sheet-body');
    const c = body.querySelector(`.fcard[data-id="${id}"]`);
    return { top: Math.round(c.getBoundingClientRect().top), scroll: Math.round(body.scrollTop) };
  }, id);
  // A filter that turns on in the list (Compare two filters opens its own card and closes the panel; "Add your
  // data" is a button that opens its panel, not a filter).
  const pickCard = () => page.evaluate(() => {
    const b = document.querySelector('.sheet-body').getBoundingClientRect();
    return [...document.querySelectorAll('.sheet-body .fcard')].find((c) => c.getBoundingClientRect().top > b.top + 150 && c.getBoundingClientRect().bottom < b.bottom && !c.classList.contains('on') && c.dataset.id !== 'compare' && !c.classList.contains('fcard-add')).dataset.id;
  });
  const tapAndWait = async (id) => {
    await page.tap(`.sheet-body .fcard[data-id="${id}"]`);
    await page.waitForTimeout(150);
    const tapped = await where(id);
    await page.waitForFunction((id) => window.atlas.app.layers.find((l) => l.def.id === id)?.ready, id, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);
    return { tapped, loaded: await where(id) };
  };
  const a = await pickCard();
  const a0 = await where(a);
  const at = await tapAndWait(a);
  check(a0.scroll === 0 && Math.abs(at.tapped.top - a0.top) <= 2 && Math.abs(at.loaded.top - a0.top) <= 2, `tapped filter stays put at the top of the list (${a0.top} -> ${at.tapped.top} -> ${at.loaded.top} px)`);
  await page.evaluate(() => { document.querySelector('.sheet-body').scrollTop += 1200; });
  await page.waitForTimeout(300);
  const b = await pickCard();
  const b0 = await where(b);
  const bt = await tapAndWait(b);
  check(Math.abs(bt.tapped.top - b0.top) <= 2 && Math.abs(bt.loaded.top - b0.top) <= 2, `tapped filter stays put further down (${b0.top} -> ${bt.tapped.top} -> ${bt.loaded.top} px)`);
  await page.touchscreen.tap(200, 150); // the map above the sheet closes it on a phone
  await page.waitForTimeout(600);
  const closed = await page.evaluate(() => document.querySelector('.sheet').hidden);
  await page.tap('[data-dock="filters"]');
  // The sheet slides in from the next frame on; a slow frame (the globe redrawn) can hold that back, so measure once
  // it is fully open.
  await page.waitForFunction(() => { const s = document.querySelector('.sheet'); return s.classList.contains('open') && !s.getAnimations().some((a) => a.playState === 'running'); }, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const back = await where(b);
  check(closed && Math.abs(back.top - b0.top) <= 2 && Math.abs(back.scroll - bt.loaded.scroll) <= 2, `filters list reopens where it was left (scroll ${bt.loaded.scroll} -> ${back.scroll}, its filter at ${b0.top} -> ${back.top} px, the sheet ${closed ? 'closed' : 'still open'} after the map tap)`);
  check(!errors.length, `no page errors in the filters list${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 8. Data grids (rainfall) keep their colours over land while the map moves: the GPU textures go
// under the grid (plain land) and over it (lakes, borders), as in a still frame.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=precipitation&c=-55,-12,1.6&lang=en');
  const r = await page.evaluate(async () => {
    const ren = window.atlas.app.renderer;
    ren.settings.labels = { countries: false, capitals: false, cities: false, seas: false, values: false };
    ren.settings.graticule = false;
    Object.defineProperty(ren.gl, 'software', { value: false, configurable: true });
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const px = (lon, lat) => {
      const p = ren.view.project(lon, lat);
      const d = document.getElementById('fg').getContext('2d').getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    ren.requestRender();
    await wait(800);
    const pts = [[-60, -5], [-50, -12], [-65, -20]]; // Amazon, central Brazil, Bolivia
    const still = pts.map(([a, b]) => px(a, b));
    ren.moving = true;
    for (let i = 0; i < 60 && !ren.gpuFrame; i++) { ren.requestRender(); await wait(100); }
    const moving = pts.map(([a, b]) => px(a, b));
    const gpu = ren.gpuFrame;
    ren.moving = false; ren.requestRender(); await wait(600);
    return { gpu, still, moving };
  });
  const worst = Math.max(...r.still.map((s, i) => Math.hypot(...s.map((v, k) => v - r.moving[i][k]))));
  check(r.gpu && worst < 40, `rainfall keeps its colours over land while moving (GPU ${r.gpu}, largest difference ${Math.round(worst)})`);
  check(!errors.length, `no page errors with rainfall in motion${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 9. Zoomed-in flat maps draw the countries far from the equator (they were skipped as off screen).
for (const proj of ['equirectangular', 'mercator', 'miller']) {
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, `#p=${proj}&l=political&c=-18.6,64.9,6&lang=en`);
  const r = await page.evaluate(async () => {
    const ren = window.atlas.app.renderer;
    ren.settings.labels = { countries: false, capitals: false, cities: false, seas: false, values: false };
    ren.settings.graticule = false;
    // Pinch in on Iceland (links cap the zoom of flat maps).
    const at = ren.view.project(-18.6, 64.9);
    ren.view.zoomAt(8, at[0], at[1]);
    ren.requestRender();
    await new Promise((res) => setTimeout(res, 1500));
    const px = (lon, lat) => {
      const p = ren.view.project(lon, lat);
      const d = document.getElementById('fg').getContext('2d').getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    return { iceland: px(-18.6, 64.9), kind: ren.view.current.kind, zoom: Math.round(ren.view.webZoom * 10) / 10 };
  });
  // The map canvas is see-through where nothing is drawn (the sea is painted underneath it).
  check(r.kind === 'flat' && r.iceland[3] === 255, `${proj}: Iceland drawn when zoomed in (zoom ${r.zoom}, pixel ${r.iceland.join(',')})`);
  check(!errors.length, `no page errors on ${proj}${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 10. Yesterday's satellite picture is not empty (a satellite that sent nothing comes back black).
{
  const { page, errors, ctx } = await open({ viewport: { width: 1000, height: 600 } }, '#p=globe&l=gibs&c=-60,0,1.2&lang=en');
  await page.waitForFunction(() => { const l = window.atlas.app.layers.find((x) => x.def.id === 'gibs'); return l && (l.ready || l.error); }, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const ren = window.atlas.app.renderer;
    const l = window.atlas.app.layers.find((x) => x.def.id === 'gibs');
    const c = document.getElementById('fg');
    const g = c.getContext('2d');
    // Share of lit pixels on a grid of points across the visible globe.
    let lit = 0, n = 0;
    for (let lon = -100; lon <= -20; lon += 5) for (let lat = -50; lat <= 50; lat += 5) {
      const p = ren.view.project(lon, lat);
      if (!p) continue;
      const d = g.getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data;
      n++; if (d[0] + d[1] + d[2] > 60) lit++;
    }
    return { ready: !!l?.ready, error: l?.error ? String(l.error) : null, sat: l?.state.sat ?? null, date: l?.state.date ?? null, lit: n ? lit / n : 0 };
  });
  check(r.ready && r.lit > 0.5 && !!r.sat, `satellite picture of ${r.date} from ${r.sat} is not empty (${Math.round(r.lit * 100)}% lit${r.error ? ', ' + r.error : ''})`);
  check(!errors.length, `no page errors with the satellite picture${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 11. Wars and conquests: pick a conflict from Time travel, it plays on the map; a battle marker
// opens its card; "Details" tells the step; exiting brings the normal map back.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=30,35,1.5&lang=en');
  await page.waitForTimeout(4200);
  await page.tap('[data-dock="time"]');
  await page.waitForTimeout(400);
  await page.locator('.mode-card', { hasText: 'Wars' }).tap();
  await page.waitForSelector('.war-card[data-war="alexander"]', { timeout: 15000 });
  const listed = await page.$$eval('.war-card', (els) => els.length);
  await page.tap('.war-card[data-war="alexander"]');
  await page.waitForSelector('.warbar', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const first = await page.evaluate(() => ({ mode: window.atlas.app.mode, date: document.querySelector('.wb-date').textContent, ticks: document.querySelectorAll('.wb-tick').length, playing: !!document.querySelector('.warbar .tb-play svg') }));
  check(first.mode === 'wars' && first.ticks >= 3 && /BC/.test(first.date), `wars mode plays a conflict (${listed} listed; ${first.date}, ${first.ticks} steps)`);
  // Step 4 of Alexander is Issus: territory drawn, battle marker tappable.
  await page.evaluate(() => document.querySelectorAll('.wb-tick')[3].click());
  await page.waitForTimeout(3200);
  const r = await page.evaluate(() => {
    const ren = window.atlas.app.renderer;
    const px = (lon, lat) => { const p = ren.view.project(lon, lat); const d = document.getElementById('fg').getContext('2d').getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data; return [...d]; };
    return { macedon: px(22.5, 40.0), persia: px(44.4, 32.5), issus: ren.view.project(36.2, 36.85) };
  });
  const red = r.macedon[0] > r.macedon[2] + 40, blue = r.persia[2] > r.persia[0] + 30;
  check(red && blue, `sides drawn in their colours (Macedon ${r.macedon.slice(0, 3)}, Persia ${r.persia.slice(0, 3)})`);
  await page.touchscreen.tap(r.issus[0], r.issus[1]);
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => { const c = document.querySelector('.country-card'); return c && !c.hidden ? c.innerText : ''; });
  check(/Issus/.test(card) && /150/.test(card), `battle card with casualties (${card.split('\n')[0]})`);
  await page.tap('.wb-more');
  await page.waitForTimeout(500);
  const details = await page.evaluate(() => ({ open: !document.querySelector('.sheet').hidden, battles: document.querySelectorAll('.war-battle').length, text: document.querySelector('.war-details')?.innerText.length ?? 0 }));
  check(details.open && details.battles === 1 && details.text > 300, `step details (${details.battles} battle, ${details.text} characters)`);
  await page.tap('.sheet .sheet-head .icon-btn');
  await page.waitForTimeout(300);
  await page.tap('.wb-exit');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ mode: window.atlas.app.mode, bar: !!document.querySelector('.warbar'), stack: window.atlas.app.layers.map((l) => l.def.id).join(','), base: window.atlas.app.renderer.baseMap }));
  check(after.mode === null && !after.bar && after.stack === 'political' && after.base, `leaving restores the map (${after.stack})`);
  check(!errors.length, `no page errors in wars mode${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12. Story collections (Great structures): a shared link opens a story at its step; a marker
// opens its card; Browse lists the story's items; exiting brings the normal map back.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#structures=seven-wonders&step=1&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(4500);
  await page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
  const st = await page.evaluate(() => ({ mode: window.atlas.app.mode, title: document.querySelector('.wb-title')?.textContent, ticks: document.querySelectorAll('.wb-tick').length, on: [...document.querySelectorAll('.wb-tick')].findIndex((t) => t.classList.contains('on')) }));
  check(st.mode === 'structures' && st.on === 0 && st.ticks >= 8 && /Pyramid/.test(st.title), `a shared link opens a structures story (${st.title}, step ${st.on + 1} of ${st.ticks})`);
  const at = await page.evaluate(() => window.atlas.app.renderer.view.project(31.1342, 29.9792));
  await page.touchscreen.tap(at[0], at[1]);
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => { const c = document.querySelector('.country-card'); return c && !c.hidden ? { text: c.innerText, img: !!c.querySelector('.card-img') } : null; });
  check(!!card && /Great Pyramid of Giza/.test(card.text) && /2600–2560/.test(card.text) && card.img, `a marker opens its card with a picture slot (${card?.text.split('\n')[0]})`);
  // A tap that opens a card under the finger must not also select its words (phones then open a dictionary bar).
  const picked = [];
  for (const q of ['.country-card .card-title', '.wb-title']) {
    const box = await page.locator(q).first().boundingBox();
    await page.mouse.dblclick(box.x + 30, box.y + box.height / 2);
    picked.push(await page.evaluate(() => { const s = window.getSelection().toString(); window.getSelection().removeAllRanges(); return s; }));
  }
  check(picked.every((s) => !s.trim()), `the card and the step bar are not text to select${picked.some((s) => s.trim()) ? ` (selected: ${picked.join(' | ')})` : ''}`);
  await page.tap('.country-card .card-close');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('.country-card').hidden), 'the X closes an item card in Time travel');
  await page.tap('.wb-browse');
  await page.waitForTimeout(500);
  const rows = await page.evaluate(() => document.querySelectorAll('.story-list .story-item').length);
  check(rows === 8, `Browse lists the story's items (${rows})`);
  await page.fill('.story-browse-head input', 'colossus');
  await page.waitForTimeout(300);
  const found = await page.evaluate(() => [...document.querySelectorAll('.story-list .story-item-name')].map((e) => e.textContent));
  check(found.length === 1 && /Colossus/.test(found[0]), `Browse search finds one (${found.join(', ')})`);
  await page.tap('.sheet .sheet-head .icon-btn');
  await page.waitForTimeout(300);
  await page.tap('.wb-exit');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ mode: window.atlas.app.mode, bar: !!document.querySelector('.warbar'), base: window.atlas.app.renderer.baseMap, story: document.documentElement.classList.contains('mode-story') }));
  check(after.mode === null && !after.bar && after.base && !after.story, 'leaving a story restores the map');
  check(!errors.length, `no page errors in a story${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12b. Crowded markers move apart (with a line to their place), so each can be tapped; a step text
// too long for the bar ends in "… more" and opens whole when tapped.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#eras=renaissance&step=10&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
  await page.waitForTimeout(500);
  const sp = await page.evaluate(() => {
    const pts = [...window.atlas.time.stories.eras.spots.at.values()];
    let worst = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) worst = Math.min(worst, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) - pts[i].r - pts[j].r);
    return { n: pts.length, moved: pts.filter((p) => Math.hypot(p.x - p.ax, p.y - p.ay) > p.r * 0.7).length, worst };
  });
  check(sp.n >= 10 && sp.moved > 0 && sp.worst >= 2, `crowded markers in Florence move apart (${sp.moved} of ${sp.n} moved; closest gap ${sp.worst.toFixed(1)} px)`);
  const tap = await page.evaluate(() => {
    const s = window.atlas.time.stories.eras;
    const k = s.c.items.findIndex((it) => /Machiavelli/.test(it.name.en));
    const p = s.spots.at.get(k);
    return p ? [p.x, p.y] : null;
  });
  if (tap) await page.touchscreen.tap(tap[0], tap[1]);
  await page.waitForTimeout(700);
  const title = await page.evaluate(() => { const c = document.querySelector('.country-card'); return c.hidden ? '' : c.querySelector('.card-title')?.textContent; });
  check(/Machiavelli/.test(title ?? ''), `a moved marker opens its own card (${title})`);
  await page.tap('.country-card .card-close');
  await page.waitForTimeout(300);
  // Great structures, castles and cathedrals: three lines and "… more", then all of it.
  await page.goto(`${url}?r=2#structures=great-structures-ancient&step=15&p=globe&lang=en`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const cut = await page.evaluate(() => { const e = document.querySelector('.wb-text'); return { cut: e.classList.contains('cut'), more: /… more$/.test(e.textContent), h: e.clientHeight }; });
  await page.tap('.wb-text');
  await page.waitForTimeout(300);
  const whole = await page.evaluate(() => { const e = document.querySelector('.wb-text'); return { open: e.classList.contains('open'), h: e.clientHeight, less: /less$/.test(e.textContent) }; });
  check(cut.cut && cut.more && whole.open && whole.less && whole.h > cut.h, `a long step text ends in "… more" and opens whole (${cut.h} → ${whole.h} px)`);
  check(!errors.length, `no page errors with crowded markers${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12c. Peoples and civilizations: a shared link opens a story millions of years back, with its date
// in years ago (in English and Spanish).
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#people=earliest-ancestors&step=1&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const en = await page.evaluate(() => ({ mode: window.atlas.app.mode, date: document.querySelector('.wb-date')?.textContent ?? '', title: document.querySelector('.wb-title')?.textContent ?? '' }));
  check(en.mode === 'people' && /^7\smillion years ago$/.test(en.date) && /Touma/.test(en.title), `a people story opens in deep time (${en.date}: ${en.title})`);
  await page.goto(`${url}?r=3#people=earliest-ancestors&step=5&p=globe&lang=es`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const es = await page.evaluate(() => document.querySelector('.wb-date')?.textContent ?? '');
  check(/^hace 3,66\smillones de años$/.test(es), `deep-time dates in Spanish (${es})`);
  check(!errors.length, `no page errors in Peoples and civilizations${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12d. Life through time: a step millions of years back is drawn on the continents of its age, its
// fossils move with them (a card gives the latitude then), the continents drift to the next step's
// age, and a tap on the old land says what it is today.
{
  const idx = await (await fetch(`${url}data/life/index.json`)).json();
  let pick = null;
  for (const e of idx.stories) {
    const st = (await (await fetch(`${url}data/life/${e.id}.json`)).json());
    // An old step followed by another old step, showing a fossil within the plate model's reach (5–1000 million years).
    const fossil = (s) => (s.show ?? []).find((k) => st.items[k].pl && st.items[k].t <= -5e6 && st.items[k].t >= -1e9);
    const i = st.steps.findIndex((s, k) => s.ma != null && fossil(s) != null && st.steps[k + 1]?.ma != null && st.steps[k + 1].ma !== s.ma);
    if (i >= 0) { pick = { id: e.id, i, ma: st.steps[i].ma, next: st.steps[i + 1].ma, k: fossil(st.steps[i]), item: st.items[fossil(st.steps[i])] }; break; }
  }
  check(!!pick, `a life story with old steps is published (${pick ? `${pick.id}, step ${pick.i + 1}, ${pick.ma} Ma` : 'none'})`);
  if (pick) {
    const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, `#life=${pick.id}&step=${pick.i + 1}&p=globe&lang=en`);
    await page.waitForSelector('.warbar', { timeout: 30000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
    await page.waitForTimeout(500);
    const old = await page.evaluate(() => { const s = window.atlas.time.stories.life; return { age: s.ageNow(), chip: document.querySelector('.wb-age')?.textContent ?? '' }; });
    check(old.age === pick.ma && /🌋/.test(old.chip), `a life step is drawn on the continents of ${pick.ma} million years ago (${old.chip})`);
    // The fossil's marker is where its plate carried it, not where it is found today.
    const moved = await page.evaluate((k) => {
      const s = window.atlas.time.stories.life, it = s.c.items[k];
      const now = s.itemAt(it, s.ageNow()), today = it.at;
      return { km: Math.round(Math.acos(Math.min(1, Math.sin(now[1] * Math.PI / 180) * Math.sin(today[1] * Math.PI / 180) + Math.cos(now[1] * Math.PI / 180) * Math.cos(today[1] * Math.PI / 180) * Math.cos((now[0] - today[0]) * Math.PI / 180))) * 6371), pl: it.pl };
    }, pick.k);
    check(!!moved.pl && moved.km > 50, `its fossils move with their plate (${pick.item.name.en}: ${moved.km} km from today's place)`);
    // Tap the marker: its card, with the latitude it lay at.
    const sp = await page.evaluate((k) => { const p = window.atlas.time.stories.life.spots.at.get(k); return p ? [p.x, p.y] : null; }, pick.k);
    if (sp) await page.touchscreen.tap(sp[0], sp[1]);
    await page.waitForTimeout(800);
    const card = await page.evaluate(() => { const c = document.querySelector('.country-card'); return { open: !c.hidden, rows: [...c.querySelectorAll('.row')].map((r) => r.textContent).join(' | ') }; });
    check(card.open && /Latitude then/.test(card.rows), `the fossil's card says where it lay then (${card.rows.slice(0, 90)})`);
    await page.evaluate(() => document.querySelector('.country-card .card-close')?.click());
    // The next step: the continents drift to its age.
    await page.evaluate(() => document.querySelectorAll('.wb-nav .icon-btn')[1].click());
    const ages = [];
    for (let i = 0; i < 8; i++) { await page.waitForTimeout(350); ages.push(await page.evaluate(() => window.atlas.time.stories.life.ageNow())); }
    const between = ages.some((a) => a != null && Math.abs(a - pick.ma) > 0.01 && Math.abs(a - pick.next) > 0.01);
    check(between && ages[ages.length - 1] === pick.next, `the continents drift from ${pick.ma} to ${pick.next} million years ago (${ages.map((a) => (a == null ? '-' : Math.round(a))).join(' → ')})`);
    // A tap on old land away from the markers: what it is today.
    const land = await page.evaluate(() => {
      const s = window.atlas.time.stories.life, v = window.atlas.app.renderer.view, w = s.paleo, cur = s.c.steps[s.step];
      // Away from every marker on the map: this step's and the earlier ones' dots.
      const marks = s.c.items.filter((it, k) => (cur.show ?? []).includes(k) || s.onMap(it, cur)).map((it) => v.project(...s.itemAt(it, s.ageNow()))).filter(Boolean);
      for (let y = 120; y < v.h - v.insetBottom - 20; y += 23) for (let x = 20; x < v.w - 20; x += 23) {
        const g = v.invert(x, y);
        if (!g || marks.some((p) => Math.hypot(p[0] - x, p[1] - y) < 40) || [...s.spots.at.values()].some((p) => Math.hypot(p.x - x, p.y - y) < 40)) continue;
        if (w.tapRows(g[0], g[1], s.ageNow(), window.atlas.app)) return [x, y];
      }
      return null;
    });
    if (land) await page.touchscreen.tap(land[0], land[1]);
    await page.waitForTimeout(700);
    const lc = await page.evaluate(() => [...document.querySelectorAll('.country-card:not([hidden]) .row')].map((r) => r.textContent).join(' | '));
    check(!!land && /Today it is/.test(lc), `a tap on the old land says what it is today (${lc.slice(0, 80)})`);
    // Details link to the plate model at this age.
    await page.evaluate(() => document.querySelector('.country-card .card-close')?.click());
    await page.tap('.wb-more');
    await page.waitForTimeout(500);
    await page.tap('.story-drift');
    await page.waitForTimeout(3000);
    check(await page.evaluate(() => window.atlas.app.mode === 'pangea'), '"See the continents move" opens Pangea to today');
    check(!errors.length, `no page errors in Life through time${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

// 12e. Games of the world: a Games step colours each country by how it took part (Moscow 1980: the
// hosts, and the boycott), the host's card holds its medal table, a tap on a country tells its team
// (Kazakhstan was part of the Soviet Union; Turkey boycotted), and Details lists the medal table and
// who stayed away. A World Cup step in Spanish ranks the champions first.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#games=olympics-1948-1988&step=9&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  // A story opens playing; a tap on its step's tick stops it there.
  await page.evaluate(() => document.querySelectorAll('.wb-tick')[8].click());
  await page.waitForTimeout(5000);
  const g = await page.evaluate(() => {
    const s = window.atlas.time.stories.games, gm = s.c.steps[s.step].games, ren = window.atlas.app.renderer;
    const by = (iso) => gm.teams.find((tm) => tm.u.includes(iso))?.s ?? null;
    const px = (lon, lat) => { const p = ren.view.project(lon, lat); return p ? [...document.getElementById('fg').getContext('2d').getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data] : [0, 0, 0, 0]; };
    const k = s.c.items.findIndex((it) => it.id === 'games-summer-1980'), sp = s.spots.at.get(k);
    return { id: gm.id, usa: by('USA'), kaz: by('KAZ'), away: gm.teams.filter((tm) => tm.s === 'g_boycott').length, host: px(58, 55), turkey: px(30.5, 39), marker: sp ? [sp.x, sp.y] : null };
  });
  const yellow = g.host[0] > g.host[2] + 80 && g.host[1] > g.host[2] + 50, red = g.turkey[0] > g.turkey[2] + 40 && g.turkey[0] > g.turkey[1] + 40;
  check(g.id === 'summer-1980' && g.usa === 'g_boycott' && g.kaz === 'g_host' && g.away >= 60 && yellow && red, `Moscow 1980: the hosts in gold, ${g.away} boycotting teams in red (Soviet Union ${g.host.slice(0, 3)}, Turkey ${g.turkey.slice(0, 3)})`);
  if (g.marker) await page.touchscreen.tap(g.marker[0], g.marker[1]);
  await page.waitForTimeout(700);
  const host = await page.evaluate(() => { const c = document.querySelector('.country-card:not([hidden])'); return { title: c?.querySelector('h2, .cc-name, .card-title')?.textContent ?? c?.innerText.split('\n')[0] ?? '', rows: c?.querySelectorAll('.medal-table tbody tr').length ?? 0, first: c?.querySelector('.medal-table tbody tr')?.textContent ?? '' }; });
  check(host.rows === 10 && /Soviet Union/.test(host.first), `the host's card shows the top of the medal table (${host.rows} rows, first: ${host.first.slice(0, 30)})`);
  const tapAt = async (lon, lat) => {
    // The open card (a tall medal table) would cover the land; close it first.
    await page.evaluate(() => document.querySelector('.country-card .card-close')?.click());
    await page.waitForTimeout(500);
    const p = await page.evaluate(([lon, lat]) => window.atlas.app.renderer.view.project(lon, lat), [lon, lat]);
    await page.touchscreen.tap(p[0], p[1]);
    await page.waitForTimeout(700);
    return page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  };
  const kaz = await tapAt(58, 49);
  check(/Kazakhstan was part of/.test(kaz) && /Soviet Union/.test(kaz) && /Host/.test(kaz), `a tap on Kazakhstan: part of the Soviet Union's team (${kaz.replace(/\n+/g, ' · ').slice(0, 90)})`);
  const tur = await tapAt(32.5, 39);
  check(/Turkey/.test(tur) && /Boycotted/.test(tur) && /Afghanistan/.test(tur), `a tap on Turkey: boycotted, and why (${tur.replace(/\n+/g, ' · ').slice(0, 90)})`);
  await page.tap('.wb-more');
  await page.waitForTimeout(600);
  const det = await page.evaluate(() => { const d = document.querySelector('.war-details'); return { rows: d?.querySelectorAll('.medal-table tbody tr').length ?? 0, away: d?.querySelectorAll('.war-events li').length ?? 0, text: d?.textContent ?? '' }; });
  check(det.rows >= 30 && det.away >= 60 && /Medal table/.test(det.text) && /Stayed away/.test(det.text), `Details: the whole medal table (${det.rows} nations) and the ${det.away} teams that stayed away`);
  await page.tap('.sheet .sheet-head .icon-btn');
  await page.waitForTimeout(300);
  await page.goto(`${url}?r=4#games=world-cup-1974-2026&step=14&p=globe&lang=es`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.evaluate(() => document.querySelectorAll('.wb-tick')[13].click());
  await page.waitForTimeout(3000);
  await page.tap('.wb-more');
  await page.waitForTimeout(600);
  const es = await page.evaluate(() => { const d = document.querySelector('.war-details'); return { text: d?.textContent ?? '', first: d?.querySelector('.medal-table tbody tr')?.textContent ?? '' }; });
  check(/Clasificación final/.test(es.text) && /España/.test(es.first) && /Campeón/.test(es.first), `World Cup 2026 in Spanish: the final ranking starts with the champions (${es.first})`);
  check(!errors.length, `no page errors in Games of the world${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12g. Journeys and trade routes: a shared link opens Marco Polo's travels at step 10; the routes of the
// earlier steps stay on the map as a trail (a point on the Yunnan mission of step 9 is drawn in the
// traveller's red), and the step bar counts the steps.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#journeys=marco-polo&step=10&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.evaluate(() => document.querySelectorAll('.wb-tick')[9].click());
  await page.waitForTimeout(4500);
  const j = await page.evaluate(() => {
    const m = window.atlas.time.stories.journeys, ren = window.atlas.app.renderer, v = ren.view;
    // The middle of the longest leg of step 9's route, where no marker sits.
    const path = m.c.steps[8].moves[0].path;
    let best = 0, at = path[0];
    for (let k = 1; k < path.length; k++) {
      const d = Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
      if (d > best) { best = d; at = [(path[k][0] + path[k - 1][0]) / 2, (path[k][1] + path[k - 1][1]) / 2]; }
    }
    const p = v.project(at[0], at[1]);
    let red = 0;
    if (p) {
      const d = document.getElementById('fg').getContext('2d').getImageData(Math.round(p[0] * v.dpr) - 4, Math.round(p[1] * v.dpr) - 4, 9, 9).data;
      for (let i = 0; i < d.length; i += 4) red = Math.max(red, d[i] - Math.max(d[i + 1], d[i + 2]));
    }
    return { mode: window.atlas.app.mode, step: m.step, steps: m.c.steps.length, red, bar: document.querySelector('.warbar')?.textContent ?? '' };
  });
  check(j.mode === 'journeys' && j.step === 9 && /step 10 of 15/.test(j.bar) && j.red > 40, `Marco Polo at step 10: the way already travelled stays on the map as a trail (redness ${j.red})`);
  check(!errors.length, `no page errors in Journeys and trade routes${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12h. Writing systems: each country in the colour of its main language's script, with a letter of each
// script in the legend, drawn with the app's own fonts for scripts (only the ones on screen are fetched).
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=fact-script&c=95,25,2.4&lang=en');
  await page.click('.legend-toggle');
  await page.waitForTimeout(2500);
  const w = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].filter((f) => f.family.includes('Atlas Scripts'));
    return { items: [...document.querySelectorAll('.lg-item')].map((e) => e.textContent.trim()), faces: faces.length, loaded: faces.filter((f) => f.status === 'loaded').length };
  });
  const has = (re) => w.items.some((x) => re.test(x));
  check(has(/A\s*Latin/) && has(/Ж\s*Cyrillic/) && has(/ع\s*Arabic/) && has(/字\s*Chinese characters/) && has(/अ\s*Devanagari/) && has(/한\s*Hangul/) && w.faces >= 15 && w.loaded >= 10,
    `Writing systems legend with a letter of each script (${w.items.length} scripts; ${w.loaded} of ${w.faces} script fonts fetched)`);
  await page.evaluate(() => { const p = window.atlas.app.renderer.view.project(104, 34); window.atlas.app.emit('tap', p[0], p[1]); });
  await page.waitForTimeout(700);
  const cn = await page.evaluate(() => ({ sel: window.atlas.app.selection, text: document.querySelector('.country-card')?.innerText ?? '' }));
  check(cn.sel === 'CHN' && /Writing system/.test(cn.text) && /Chinese characters/.test(cn.text), `China's strip: written in Chinese characters (${cn.sel})`);
  check(!errors.length, `no page errors with Writing systems${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12i. Writing and languages, Religions and philosophies: a card in the alphabet story shows its sample
// in Phoenician letters, drawn with the app's script fonts (fetched for those letters only); a shared link
// opens a religions story at its step.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#writing=alphabet&step=3&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
  await page.evaluate(() => { const m = window.atlas.time.stories.writing; m.itemCard(m.c.items.find((it) => it.id === 'mesha-stele')); });
  await page.waitForSelector('.country-card .item-sample', { timeout: 10000 });
  const sm = await page.evaluate(async () => {
    const text = document.querySelector('.country-card .sample-text')?.textContent ?? '';
    await document.fonts.load('30px "Atlas Scripts"', text);
    const cp = 0x10900;
    const covers = (f) => f.unicodeRange.split(',').some((r) => { const [a, b] = r.trim().replace(/^U\+/i, '').split('-').map((x) => parseInt(x, 16)); return cp >= a && cp <= (b ?? a); });
    const face = [...document.fonts].find((f) => f.family.includes('Atlas Scripts') && covers(f));
    return { text, latin: document.querySelector('.country-card .sample-latin')?.textContent ?? '', means: document.querySelector('.country-card .sample-means')?.textContent ?? '', mode: window.atlas.app.mode, title: document.querySelector('.wb-title')?.textContent ?? '', face: face?.status ?? 'none' };
  });
  check(sm.mode === 'writing' && /Phoenician/.test(sm.title) && /𐤌𐤔𐤏/.test(sm.text) && /mlk mʾb/.test(sm.latin) && /king of Moab/.test(sm.means) && sm.face === 'loaded',
    `the Mesha Stele card shows its words in Phoenician letters, in the app's font for them (${sm.face}; ${sm.means})`);
  await ctx.close();
  const b = await open({ ...devices['Pixel 7'] }, '#beliefs=buddhism&step=1&p=globe&lang=en');
  await b.page.waitForSelector('.warbar', { timeout: 30000 });
  await b.page.waitForTimeout(2500);
  const bu = await b.page.evaluate(() => ({ mode: window.atlas.app.mode, title: document.querySelector('.wb-title')?.textContent ?? '', items: window.atlas.time.stories.beliefs.c?.items?.length ?? 0 }));
  check(bu.mode === 'beliefs' && /awakening/i.test(bu.title) && bu.items > 20, `a shared link opens the story of Buddhism at its first step (${bu.title})`);
  check(!errors.length && !b.errors.length, `no page errors in Writing and Religions stories${errors.length || b.errors.length ? ': ' + [...errors, ...b.errors].join(' | ') : ''}`);
  await b.ctx.close();
}

// 12j. Plagues and cures, Natural disasters: a step with a time of day shows it after the date, in English
// and in Spanish (with a short month when the long date would not fit); a shared link opens the cholera
// story in Soho.
{
  const stepDate = async (hash) => {
    const s = await open({ ...devices['Pixel 7'] }, hash);
    await s.page.waitForSelector('.warbar', { timeout: 30000 });
    await s.page.waitForTimeout(2500);
    await s.page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
    const r = await s.page.evaluate(() => ({ mode: window.atlas.app.mode, date: document.querySelector('.wb-date')?.textContent ?? '', title: document.querySelector('.wb-title')?.textContent ?? '', items: window.atlas.time.stories[window.atlas.app.mode]?.c?.items?.length ?? 0 }));
    await s.ctx.close();
    return { ...r, errors: s.errors };
  };
  const en = await stepDate('#disasters=lisbon-1755&step=1&p=globe&lang=en');
  check(en.mode === 'disasters' && /1 Nov(ember)? 1755, 09:40/.test(en.date) && /All Saints/.test(en.title), `the Lisbon earthquake opens at its time of day (${en.date}: ${en.title})`);
  const es = await stepDate('#disasters=lisbon-1755&step=1&p=globe&lang=es');
  check(/1 (de noviembre de|nov\.) 1755, 09:40/.test(es.date), `in Spanish, the month shortened if the date would not fit: ${es.date}`);
  const ch = await stepDate('#plagues=cholera&step=5&p=globe&lang=en');
  check(ch.mode === 'plagues' && /Soho/.test(ch.title) && ch.items > 20, `a shared link opens the cholera story in Soho (${ch.date}: ${ch.title})`);
  const errs = [...en.errors, ...es.errors, ...ch.errors];
  check(!errs.length, `no page errors in Plagues and Disasters stories${errs.length ? ': ' + errs.join(' | ') : ''}`);
}

// 12k. Music, books and art: a music card plays its clip (Commons is answered here by a stand-in tone, so the
// test does not depend on Commons), and with music on each step plays its clip and names it; a book card shows
// its first line in its own language, with a translation for readers of other languages; an art card shows the
// work, which opens full screen.
{
  const n = 8000 * 12, wav = Buffer.alloc(44 + n);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) wav[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 440 * i) / 8000));
  const tone = async (ctx) => ctx.route('https://upload.wikimedia.org/**', (route) => {
    const u = route.request().url();
    if (!/\/transcoded\/|\.(ogg|oga|opus|mp3|flac|wav)$/i.test(u)) return route.continue();
    const m = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '');
    if (!m) return route.fulfill({ status: 200, body: wav, contentType: 'audio/wav', headers: { 'accept-ranges': 'bytes' } });
    const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: 206, body: wav.subarray(a, b + 1), contentType: 'audio/wav', headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${wav.length}` } });
  });
  const pause = (page) => page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
  const card = async (page, name) => {
    await page.tap('.wb-browse');
    await page.waitForSelector('.story-list .story-item', { timeout: 30000 });
    await page.evaluate((nm) => [...document.querySelectorAll('.story-list .story-item')].find((b) => b.querySelector('.story-item-name')?.textContent.replace(/ ♪$/, '') === nm)?.click(), name);
    await page.waitForFunction((nm) => document.querySelector('.country-card:not([hidden]) .card-title')?.textContent === nm, name, { timeout: 10000 }).catch(() => {});
  };
  // Music: the violins of Cremona.
  {
    const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#music=instruments-of-the-world&step=8&p=globe&lang=en');
    await tone(ctx);
    await page.waitForSelector('.warbar', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await pause(page);
    const off = await page.evaluate(() => ({ has: !!document.querySelector('.wb-music'), on: document.querySelector('.wb-music')?.classList.contains('on') }));
    check(off.has && !off.on, 'a music story has the ♪ button, off by default');
    await card(page, 'Violin');
    await page.waitForSelector('.country-card .item-clip', { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => document.querySelector('.country-card .clip-play')?.click());
    // Playing, and a second in: a busy test machine's sound can take a second or two to start moving after the
    // player says it plays.
    await page.waitForFunction(() => /playing/.test(document.querySelector('.country-card .item-clip')?.className ?? '') && !/^0:00 \//.test(document.querySelector('.country-card .clip-time')?.textContent ?? '0:00 /'), null, { timeout: 10000 }).catch(() => {});
    const clip = await page.evaluate(() => ({ cls: document.querySelector('.country-card .item-clip')?.className ?? '', time: document.querySelector('.country-card .clip-time')?.textContent ?? '', credit: document.querySelector('.country-card .clip-credit')?.textContent ?? '' }));
    check(/playing/.test(clip.cls) && !/^0:00 \//.test(clip.time) && /Wikimedia Commons/.test(clip.credit), `a music card plays its clip, with its credit (${clip.time}; ${clip.credit.slice(0, 70)})`);
    await page.evaluate(() => document.querySelector('.country-card .card-close')?.click());
    await page.tap('.wb-music');
    await page.waitForSelector('.wb-now.playing', { timeout: 10000 }).catch(() => {});
    const now = await page.evaluate(() => document.querySelector('.wb-now')?.textContent ?? '');
    await page.tap('[aria-label="Next step"]');
    await page.waitForTimeout(2500);
    const next = await page.evaluate(() => ({ now: document.querySelector('.wb-now')?.textContent ?? '', playing: !!document.querySelector('.wb-now.playing') }));
    check(/Violin/.test(now) && /^♪/.test(next.now) && next.now !== now && next.playing, `with music on, each step plays its own clip (${now} → ${next.now})`);
    check(!errors.length, `no page errors in a music story${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  // Books: the first line of Don Quixote, in Spanish, with Ormsby's English for English readers only.
  for (const lg of ['en', 'es']) {
    const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, `#books=literature-in-spanish&step=5&p=globe&lang=${lg}`);
    await page.waitForSelector('.warbar', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await pause(page);
    await card(page, lg === 'en' ? 'Don Quixote' : 'Don Quijote de la Mancha');
    await page.waitForSelector('.country-card .item-quote', { timeout: 10000 }).catch(() => {});
    const q = await page.evaluate(() => ({ lang: document.querySelector('.country-card .quote-text')?.getAttribute('lang'), text: document.querySelector('.country-card .quote-text')?.textContent ?? '', means: document.querySelector('.country-card .quote-means')?.textContent ?? null }));
    check(q.lang === 'es' && /^En un lugar de la Mancha/.test(q.text) && (lg === 'en' ? /^In a village of La Mancha/.test(q.means ?? '') : q.means === null), `a book card shows its first line (${lg}: ${q.text.slice(0, 30)}…${q.means ? ' / ' + q.means.slice(0, 30) + '…' : ''})`);
    check(!errors.length, `no page errors in a books story (${lg})${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  // Art: the Mona Lisa, made in Florence and now in the Louvre.
  {
    const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#art=art-through-time&step=8&p=globe&lang=en');
    await page.waitForSelector('.warbar', { timeout: 30000 });
    await page.waitForTimeout(1500);
    await pause(page);
    await card(page, 'Mona Lisa');
    const a = await page.evaluate(() => ({ zoom: !!document.querySelector('.country-card .zoom-wrap'), rows: document.querySelector('.country-card .rows')?.textContent ?? '' }));
    check(a.zoom && /Louvre/.test(a.rows), `an art card shows the work and where it is now (${a.rows.slice(0, 80)})`);
    check(!errors.length, `no page errors in an art story${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

// 12l. World Heritage: the filter shows every site on the list with its counts by category and in danger; a tap
// on the Taj Mahal opens its card (year, UNESCO's page); "Watch the list grow" plays the years; India's card counts
// its sites.
{
  const { page, errors, ctx } = await open({ viewport: { width: 1366, height: 820 } }, '#p=globe&l=political,heritage&c=78,27,4&lang=en');
  await page.waitForFunction(() => /World Heritage sites/.test(document.querySelector('.legend')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
  const leg = await page.evaluate(() => document.querySelector('.legend')?.textContent ?? '');
  const n = Number((/([\d,]+) World Heritage sites/.exec(leg)?.[1] ?? '0').replace(/,/g, ''));
  const by = ['Cultural', 'Natural', 'Mixed \\(cultural and natural\\)', 'In danger'].map((k) => Number((new RegExp(`${k}: ([\\d,]+)`).exec(leg)?.[1] ?? '0').replace(/,/g, '')));
  check(n > 1200 && by[0] + by[1] + by[2] === n && by[3] > 30, `the World Heritage filter shows ${n} sites (${by[0]} cultural, ${by[1]} natural, ${by[2]} mixed; ${by[3]} in danger)`);
  const xy = await page.evaluate(() => window.atlas.app.renderer.view.project(78.0419, 27.175));
  if (xy) await page.mouse.click(xy[0], xy[1]);
  await page.waitForFunction(() => /Taj Mahal/.test(document.querySelector('.country-card:not([hidden])')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
  const c = await page.evaluate(() => ({ text: document.querySelector('.country-card:not([hidden])')?.textContent ?? '', links: [...document.querySelectorAll('.country-card:not([hidden]) a')].map((a) => a.href) }));
  check(/Taj Mahal/.test(c.text) && /1983/.test(c.text) && c.links.some((l) => /whc\.unesco\.org\/en\/list\/252/.test(l)), `a tap on the Taj Mahal opens its card, listed in 1983, with UNESCO's page (${c.text.slice(0, 60)})`);
  await page.evaluate(() => [...document.querySelectorAll('.legend button')].find((b) => /Watch the list grow/.test(b.textContent))?.click());
  await page.waitForTimeout(2200);
  const t1 = await page.evaluate(() => /(\d{4}): ([\d,]+) sites/.exec(document.querySelector('.legend')?.textContent ?? '')?.slice(1) ?? null);
  await page.waitForTimeout(2500);
  const t2 = await page.evaluate(() => /(\d{4}): ([\d,]+) sites/.exec(document.querySelector('.legend')?.textContent ?? '')?.slice(1) ?? null);
  check(!!t1 && !!t2 && Number(t2[0]) > Number(t1[0]) && Number(t2[1].replace(/,/g, '')) > Number(t1[1].replace(/,/g, '')) && Number(t1[0]) < 2000, `"Watch the list grow" plays the years (${t1?.join(': ')} → ${t2?.join(': ')} sites)`);
  await page.evaluate(() => { window.atlas.app.select('IND'); });
  await page.waitForTimeout(800);
  const ind = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.textContent ?? '');
  check(/World Heritage sites\s*\d+ \(/.test(ind), `India's card counts its World Heritage sites (${/World Heritage sites[^A-Z]*/.exec(ind)?.[0] ?? ind.slice(0, 60)})`);
  check(!errors.length, `no page errors with the World Heritage filter${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12m. Inventions and World Heritage stories: a World Heritage story card says when the site was listed, with UNESCO's
// page; the inventions map shows the collection's inventions, and a tap opens one's card.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#heritage=world-heritage-begins&step=3&p=globe&lang=en');
  await page.waitForSelector('.warbar', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const b = document.querySelector('.warbar .tb-play'); if (b && b.getAttribute('aria-label') === 'Pause') b.click(); });
  await page.evaluate(() => { const m = window.atlas.time.stories.heritage; m.itemCard(m.c.items.find((it) => it.id === 'abu-simbel')); });
  await page.waitForTimeout(800);
  const c = await page.evaluate(() => ({ rows: document.querySelector('.country-card:not([hidden]) .rows')?.textContent ?? '', links: [...document.querySelectorAll('.country-card:not([hidden]) a')].map((a) => a.href) }));
  check(/World Heritage\s*Since 1979/.test(c.rows) && c.links.some((l) => /whc\.unesco\.org\/en\/list\/88$/.test(l)), `a World Heritage story card says when Abu Simbel was listed, with UNESCO's page (${/World Heritage[^📜]*/.exec(c.rows)?.[0].slice(0, 50) ?? c.rows.slice(0, 60)})`);
  check(!errors.length, `no page errors in a World Heritage story${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
{
  const { page, errors, ctx } = await open({ viewport: { width: 1366, height: 820 } }, '#p=globe&l=political,inventions&c=-99.15,19.43,6&lang=en');
  await page.waitForFunction(() => /\d+ inventions/.test(document.querySelector('.legend')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
  const n = await page.evaluate(() => Number(/(\d+) inventions/.exec(document.querySelector('.legend')?.textContent ?? '')?.[1] ?? 0));
  const xy = await page.evaluate(() => window.atlas.app.renderer.view.project(-99.153, 19.4302));
  if (xy) await page.mouse.click(xy[0], xy[1]);
  await page.waitForTimeout(1200);
  const card = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.textContent ?? '');
  check(n > 100 && /Invented by/.test(card) && /Open its story/.test(card), `the inventions map shows ${n} inventions, and a tap in Mexico City opens one (${card.slice(0, 60)})`);
  check(!errors.length, `no page errors on the inventions map${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 12f. Compare two filters: from the Filters panel, GDP per capita against life expectancy on a
// two-colour map, with its chart (a strong link); the legend's nine squares count the countries and a
// tap lights theirs; a dot on the chart picks its country, whose strip shows both values with their
// ranks; a total divided by another (Olympic medals per person) ranks who leads; a category against
// a number and two categories; Spanish, with the decimal comma; and "Compare with…" in a filter's
// legend starts from that filter, which the card's X gives back.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=20,30,1.4&lang=en');
  await page.waitForFunction(() => window.atlas.app.registry.has('compare'), null, { timeout: 30000 });
  await page.tap('[data-dock="filters"]');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.fcard[data-id="compare"]').click());
  await page.waitForSelector('.compare-card:not([hidden]) .cmp-canvas', { timeout: 30000 });
  await page.waitForTimeout(800);
  const c1 = await page.evaluate(() => ({
    hash: decodeURIComponent(location.hash), sheet: document.querySelector('.sheet').hidden, sum: document.querySelector('.cmp-sum')?.textContent ?? '',
    stats: document.querySelector('.cmp-stats')?.textContent ?? '', exc: document.querySelectorAll('.cmp-exc .cmp-country').length, w: document.querySelector('.cmp-canvas')?.width ?? 0,
  }));
  check(/o=compare:a=gdp_per_capita;b=life_expectancy/.test(c1.hash) && c1.sheet && /strong link/.test(c1.sum) && /ρ = 0\.\d\d/.test(c1.stats) && c1.exc === 3 && c1.w > 0, `Compare two filters opens from the Filters panel with its chart (${c1.stats.slice(0, 60)})`);
  // "Map" folds the chart away; the legend's nine squares count the countries, and a tap lights them.
  await page.evaluate(() => document.querySelector('.cmp-fold').click());
  await page.waitForTimeout(500);
  if (await page.evaluate(() => !document.querySelector('.lg-bi-grid'))) await page.tap('.legend-toggle');
  await page.waitForTimeout(400);
  const grid = await page.evaluate(() => [...document.querySelectorAll('.lg-bi-cell')].map((c) => Number(c.textContent || 0)));
  const big = grid.indexOf(Math.max(...grid)), total = grid.reduce((n, k) => n + k, 0);
  await page.evaluate((i) => document.querySelectorAll('.lg-bi-cell')[i].click(), big);
  await page.waitForTimeout(500);
  const lit = await page.evaluate(() => ({ n: window.atlas.app.renderer.highlight?.size ?? 0, banner: document.querySelector('.lg-banner:not([hidden])')?.textContent ?? '' }));
  // The banner counts countries as the square does (territories drawn apart are lit, not counted).
  check(grid.length === 9 && total >= 200 && lit.n >= grid[big] && lit.banner.includes(`· ${grid[big]} countries`), `the legend's nine squares hold ${total} countries; a tap lights ${grid[big]} of them (${lit.banner.slice(0, 60)}…${lit.banner.slice(-14)})`);
  await page.evaluate(() => document.querySelector('.lg-banner-x')?.click());
  await page.evaluate(() => document.querySelector('.cmp-fold').click());
  await page.waitForSelector('.compare-card .cmp-canvas', { timeout: 10000 });
  await page.waitForTimeout(500);
  // A dot on the chart: the first spot where the chart's own hit test finds a country.
  const dot = await page.evaluate(() => {
    const cv = document.querySelector('.cmp-canvas'), r = cv.getBoundingClientRect(), hit = window.atlas.compare.hit;
    for (let y = 20; y < r.height - 20; y += 6) for (let x = 50; x < r.width - 10; x += 6) { const iso = hit(x, y); if (iso) return { x: r.left + x, y: r.top + y, iso }; }
    return null;
  });
  if (dot) await page.touchscreen.tap(dot.x, dot.y);
  await page.waitForTimeout(1800);
  const picked = await page.evaluate(() => {
    const sel = window.atlas.app.selection;
    return { iso: sel ? window.atlas.app.data.meta[sel]?.iso ?? sel : null, rows: [...document.querySelectorAll('.country-card:not([hidden]) .cc-row')].map((r) => r.textContent) };
  });
  check(!!dot && picked.iso === dot.iso && picked.rows.length === 2 && picked.rows.every((r) => /\d+(st|nd|rd|th) of \d+/.test(r)), `a dot on the chart picks its country, whose strip shows both values with their ranks (${picked.rows.join(' | ')})`);
  await page.evaluate(() => document.querySelector('.country-card .card-close')?.click());
  // Olympic medals and population: the legend offers the medals per person, ranked in the card.
  await page.selectOption('.compare-card select[data-pick="a"]', 'olympic_medals');
  await page.waitForTimeout(400);
  await page.selectOption('.compare-card select[data-pick="b"]', 'population');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.cmp-fold').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => [...document.querySelectorAll('.legend .lg-act')].find((b) => /^÷/.test(b.textContent))?.click());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('.cmp-fold').click());
  await page.waitForTimeout(600);
  const ratio = await page.evaluate(() => ({
    hash: decodeURIComponent(location.hash), title: document.querySelector('.cmp-title')?.textContent ?? '',
    lists: [...document.querySelectorAll('.cmp-rank')].map((l) => l.querySelectorAll('.cmp-country').length), first: document.querySelector('.cmp-rank .cmp-country')?.textContent ?? '',
  }));
  check(/view=ratio/.test(ratio.hash) && /^÷ Olympic medals/.test(ratio.title) && ratio.lists.join() === '10,4', `a total divided by another: ${ratio.title} (first: ${ratio.first})`);
  // A category against a number: life expectancy by continent, a dot plot with medians.
  await page.selectOption('.compare-card select[data-pick="a"]', 'continent');
  await page.waitForTimeout(400);
  await page.selectOption('.compare-card select[data-pick="b"]', 'life_expectancy');
  await page.waitForTimeout(800);
  const cn = await page.evaluate(() => ({ canvas: !!document.querySelector('.compare-card .cmp-canvas'), stats: document.querySelector('.cmp-stats')?.textContent ?? '' }));
  check(cn.canvas && /Medians/.test(cn.stats) && /η² = 0\.\d\d/.test(cn.stats), `a category against a number: a dot plot by continent (${cn.stats.slice(0, 70)})`);
  // Two categories: driving side by continent, a cross table whose squares light their countries.
  await page.selectOption('.compare-card select[data-pick="a"]', 'driving_side');
  await page.waitForTimeout(400);
  await page.selectOption('.compare-card select[data-pick="b"]', 'continent');
  await page.waitForTimeout(800);
  const cc = await page.evaluate(() => ({ cells: document.querySelectorAll('.cmp-table .cmp-cell').length, stats: document.querySelector('.cmp-stats')?.textContent ?? '' }));
  await page.evaluate(() => document.querySelector('.cmp-table .cmp-cell').click());
  await page.waitForTimeout(500);
  const ccLit = await page.evaluate(() => window.atlas.app.renderer.highlight?.size ?? 0);
  check(cc.cells >= 6 && /Cramér's V = 0\.\d\d/.test(cc.stats) && ccLit > 0, `two categories: a cross table whose squares light their countries (${cc.cells} squares; ${ccLit} lit; ${cc.stats})`);
  // In Spanish, with the decimal comma.
  await page.selectOption('.compare-card select[data-pick="a"]', 'gdp_per_capita');
  await page.waitForTimeout(400);
  await page.selectOption('.compare-card select[data-pick="b"]', 'life_expectancy');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.waitForTimeout(800);
  const es = await page.evaluate(() => ({ sum: document.querySelector('.cmp-sum')?.textContent ?? '', stats: document.querySelector('.cmp-stats')?.textContent ?? '' }));
  check(/relación muy fuerte/.test(es.sum) && /ρ de Spearman = 0,\d\d/.test(es.stats) && /países/.test(es.stats), `in Spanish: ${es.sum.slice(0, 40)}… (${es.stats.slice(0, 40)})`);
  await page.evaluate(() => window.atlas.app.setLang('en'));
  await page.waitForTimeout(300);
  // "Compare with…" in GDP per capita's legend: Compare starts from it, and the X gives it back.
  await page.evaluate(() => document.querySelector('.compare-card [aria-label="Close"]').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.atlas.app.activate('fact-gdp_per_capita'));
  await page.waitForTimeout(1200);
  if (await page.evaluate(() => !document.querySelector('.legend .lg-act'))) await page.tap('.legend-toggle');
  await page.waitForTimeout(300);
  await page.evaluate(() => [...document.querySelectorAll('.legend .lg-act')].find((b) => /Compare with/.test(b.textContent))?.click());
  await page.waitForTimeout(1500);
  const from = await page.evaluate(() => ({ ids: window.atlas.app.layers.map((l) => l.def.id), o: window.atlas.app.instance('compare')?.options, card: !document.querySelector('.compare-card').hidden }));
  await page.evaluate(() => document.querySelector('.compare-card [aria-label="Close"]').click());
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.atlas.app.layers.map((l) => l.def.id));
  check(from.card && from.o?.a === 'gdp_per_capita' && from.o?.b === 'life_expectancy' && !from.ids.includes('fact-gdp_per_capita') && after.includes('fact-gdp_per_capita') && !after.includes('compare'),
    `"Compare with…" starts from GDP per capita and the card's X gives it back (${from.ids.join(',')} → ${after.join(',')})`);
  check(!errors.length, `no page errors in Compare two filters${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 13. Learn: the quizzes made from the stories ask ten questions with four answers (or a tap on the
// globe), and "See it in the story" opens the story at the item; a city tour opens steps of stories
// from different collections and flies to the city each time.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=20,30,1.4&lang=en');
  const menu = async (re) => {
    await page.tap('[data-dock="more"]');
    await page.waitForTimeout(300);
    await page.evaluate((re) => [...document.querySelectorAll('.menu-item')].find((x) => new RegExp(re).test(x.textContent))?.click(), re);
    await page.waitForTimeout(400);
  };
  const storyButton = () => page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /See it in the story/.test(b.textContent)));
  for (const kind of ['when', 'dish', 'era', 'civ', 'period', 'champion', 'journey', 'faith', 'script', 'plague', 'disaster']) {
    await menu('Quiz');
    await page.evaluate((k) => document.querySelector(`[data-quiz="${k}"]`).click(), kind);
    await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
    const q = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', q: document.querySelector('.learn-card .quiz-q')?.textContent, item: document.querySelector('.learn-card .quiz-item, .learn-card .item-sample')?.textContent, opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent) }));
    await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
    await page.waitForTimeout(400);
    const fb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
    const story = await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].some((b) => /See it in the story/.test(b.textContent)));
    check(/1\/10/.test(q.head) && q.opts.length === 4 && new Set(q.opts).size === 4 && !!q.item && !!fb && story, `quiz "${kind}": ${q.q} ${q.item} (${q.opts.join(' / ')})`);
    // Closed, so the next quiz's card is not this one.
    await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
    await page.waitForTimeout(300);
  }
  // Wikimedia may refuse a test machine: a stand-in picture answers for its pictures from here on, so the
  // zoom viewer is tested on its own.
  const pic = fs.readFileSync(new URL('../../docs/screenshots/globe.jpg', import.meta.url));
  await ctx.route(/^https:\/\/(upload|thumb)\.wikimedia\.org\//, (r) => r.fulfill({ status: 200, body: pic, contentType: 'image/jpeg' }));
  await ctx.route(/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//, (r) => r.fulfill({ status: 200, body: pic, contentType: 'image/jpeg' }));
  await ctx.route(/^https:\/\/[a-z-]+\.wikipedia\.org\/api\/rest_v1\/page\/summary\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Stand-in.jpg/330px-Stand-in.jpg' } }) }));
  // A quiz picture opens full screen; a double tap zooms in, and the X closes it and leaves the quiz open.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="disaster"]').click());
  await page.waitForSelector('.learn-card .zoom-wrap .quiz-img:not([hidden])', { timeout: 30000 });
  await page.tap('.learn-card .quiz-img');
  await page.waitForSelector('.zoom-view .zoom-img', { timeout: 5000 });
  await page.waitForTimeout(300);
  const zr = await page.evaluate(() => { const r = document.querySelector('.zoom-img').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
  await page.touchscreen.tap(zr.x, zr.y);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(zr.x, zr.y);
  await page.waitForTimeout(400);
  const zt = await page.evaluate(() => document.querySelector('.zoom-img')?.style.transform ?? '');
  await page.tap('.zoom-close');
  await page.waitForTimeout(300);
  const zc = await page.evaluate(() => ({ gone: !document.querySelector('.zoom-view'), quiz: !document.querySelector('.learn-card').hidden }));
  check(zr.w > 300 && /scale\(2\.5\)/.test(zt) && zc.gone && zc.quiz, `a quiz picture opens full screen (${Math.round(zr.w)} px wide), a double tap zooms in (${zt}), and the X closes it`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Guess the link: two country facts and four answers; the answer comes with its chart, and "See it
  // on the map" opens Compare two filters on that pair.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="link"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
  const lq = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', pair: document.querySelector('.learn-card .quiz-link')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent) }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
  await page.waitForTimeout(500);
  const la = await page.evaluate(() => ({ fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '', plot: !!document.querySelector('.learn-card .quiz-plot'), k: window.atlas.learn.quiz.qs[0].link }));
  check(/1\/10/.test(lq.head) && lq.opts.length === 4 && new Set(lq.opts).size === 4 && /×/.test(lq.pair) && /ρ = −?0\.\d\d/.test(la.fb) && la.plot, `quiz "link": ${lq.pair} (${lq.opts.join(' / ')}): ${la.fb.slice(0, 60)}`);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /See it on the map/.test(b.textContent))?.click());
  await page.waitForTimeout(1500);
  const seen = await page.evaluate(() => ({ learn: document.querySelector('.learn-card').hidden, card: !document.querySelector('.compare-card').hidden, o: window.atlas.app.instance('compare')?.options }));
  check(seen.learn && seen.card && seen.o?.a === la.k?.a && seen.o?.b === la.k?.b, `"See it on the map" opens Compare two filters on that pair (${seen.o?.a} × ${seen.o?.b})`);
  await page.evaluate(() => document.querySelector('.compare-card [aria-label="Close"]')?.click());
  // Which language family?: a language and where it is official, four families; the answer names its close
  // relatives, and "See the families on the map" turns on the Languages filter by family.
  await page.waitForTimeout(400);
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="family"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
  const fq = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', item: document.querySelector('.learn-card .quiz-item')?.textContent ?? '', hint: document.querySelector('.learn-card .tool-hint')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent) }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
  await page.waitForTimeout(400);
  const ff = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  check(/1\/10/.test(fq.head) && fq.opts.length === 4 && new Set(fq.opts).size === 4 && /🗣️/.test(fq.item) && /Official in/.test(fq.hint) && / is an? .+ language/.test(ff), `quiz "family": ${fq.item} (${fq.opts.join(' / ')}): ${ff}`);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /See the families on the map/.test(b.textContent))?.click());
  await page.waitForTimeout(1200);
  const fam = await page.evaluate(() => ({ learn: document.querySelector('.learn-card').hidden, view: window.atlas.app.instance('languages')?.options.view }));
  check(fam.learn && fam.view === 'family', `"See the families on the map" turns on Languages by family (${fam.view})`);
  await page.evaluate(() => window.atlas.app.deactivate('languages'));
  await page.waitForTimeout(300);
  // The quiz card folds to show the map ("Map") and comes back ("Quiz"); the answer's pin is named
  // and sits below the card; after ten questions the result lists each with right or wrong.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="dish"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
  await page.waitForTimeout(2600);
  const ans = await page.evaluate(() => {
    const v = window.atlas.app.renderer.view, q = window.atlas.learn.quiz, cur = q.qs[0];
    const pin = window.atlas.learn.pin, p = pin && v.project(pin.lon, pin.lat);
    const marked = [...document.querySelectorAll('.learn-card .quiz-opt')].filter((b) => b.classList.contains('ok') || b.classList.contains('bad')).length;
    return { bottom: document.querySelector('.learn-card').getBoundingClientRect().bottom, inset: v.insetTop, pinY: p ? p[1] : -1, named: window.atlas.app.renderer.labels.items.some((l) => l.text === pin?.text), marked: cur.ok ? marked === 1 : marked === 2 };
  });
  check(ans.inset > ans.bottom && ans.pinY > ans.bottom && ans.named && ans.marked, `the answer's pin is named and in view below the card (pin at ${Math.round(ans.pinY)} px, card ends at ${Math.round(ans.bottom)})`);
  await page.evaluate(() => document.querySelector('.learn-card .quiz-peek').click());
  await page.waitForTimeout(400);
  const folded = await page.evaluate(() => ({ opts: document.querySelectorAll('.learn-card .quiz-opt').length, h: document.querySelector('.learn-card').getBoundingClientRect().height, next: !!document.querySelector('.learn-card .primary') }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-peek').click());
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => document.querySelectorAll('.learn-card .quiz-opt').length);
  check(folded.opts === 0 && folded.h < 200 && folded.next && back === 4, `"Map" folds the quiz to one line (${Math.round(folded.h)} px) and "Quiz" brings it back`);
  for (let i = 0; i < 10; i++) {
    if (i > 0) await page.evaluate(() => document.querySelector('.learn-card .quiz-opt')?.click());
    await page.waitForTimeout(250);
    await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /Next|See result/.test(b.textContent))?.click());
    await page.waitForTimeout(300);
  }
  const res = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', rows: document.querySelectorAll('.quiz-sum-row').length, marks: [...document.querySelectorAll('.quiz-sum-mark')].map((m) => m.textContent).join(''), thumbs: document.querySelectorAll('.quiz-sum-row .quiz-thumb').length }));
  check(/Result \d+\/10/.test(res.head) && res.rows === 10 && /^[✓✗]{10}$/.test(res.marks) && res.thumbs === 10, `the result lists all ten questions with a picture each (${res.marks})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // States and provinces: 48 countries; in Mexico, a tap on the state asked for scores, and the
  // result lists every state asked with its shape.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="region"]').click());
  await page.waitForSelector('[data-region="MEX"]', { timeout: 15000 });
  const nCountries = await page.evaluate(() => document.querySelectorAll('[data-region]').length);
  await page.evaluate(() => document.querySelector('[data-region="MEX"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-q', { timeout: 15000 });
  await page.waitForTimeout(2800);
  const tgt = await page.evaluate(() => {
    const L = window.atlas.learn, q = L.quiz, r = L.regions.list.find((x) => x.id === q.qs[q.i].id);
    return { p: window.atlas.app.renderer.view.project(r.at[0], r.at[1]), n: r.n };
  });
  // Every state can be tapped: none sits under the zoom buttons or the card once Mexico is framed.
  const hidden = await page.evaluate(() => window.atlas.learn.regions.list.filter((x) => !x.far).filter((x) => {
    const p = window.atlas.app.renderer.view.project(x.at[0], x.at[1]);
    return !p || document.elementFromPoint(p[0], p[1])?.tagName !== 'CANVAS';
  }).map((x) => x.n));
  check(hidden.length === 0, `States and provinces: every state of Mexico can be tapped once it is framed${hidden.length ? ` (under the buttons: ${hidden.join(', ')})` : ''}`);
  if (tgt.p) await page.touchscreen.tap(tgt.p[0], tgt.p[1]);
  await page.waitForTimeout(800);
  const got = await page.evaluate(() => ({ score: window.atlas.learn.quiz?.score, fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '' }));
  check(nCountries === 48 && got.score === 1 && /Correct/.test(got.fb), `States and provinces: a tap on ${tgt.n} scores in Mexico (${nCountries} countries; ${got.fb})`);
  for (let i = 0; i < 30 && !(await page.evaluate(() => !!window.atlas.learn.quiz?.done)); i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.learn-card .tool-actions button')];
      (b.find((x) => /Show me/.test(x.textContent)) ?? b.find((x) => /Next|See result/.test(x.textContent)))?.click();
    });
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  const regRes = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', rows: document.querySelectorAll('.quiz-sum-row').length, shapes: [...document.querySelectorAll('.quiz-sum-row .quiz-thumb img')].filter((i) => i.complete && i.naturalWidth > 0).length }));
  check(/Result 1\/10/.test(regRes.head) && regRes.rows === 10 && regRes.shapes === 10, `its result lists the ten states with their shapes (${regRes.head.slice(0, 16)})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Where in the world: a tap on the globe is the answer; then the story opens at the item.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="where"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-item', { timeout: 30000 });
  await page.touchscreen.tap(206, 640);
  await page.waitForTimeout(700);
  const fb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  check(/km/.test(fb), `quiz "where": a tap on the globe is scored by distance (${fb.slice(0, 70)})`);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /See it in the story/.test(b.textContent))?.click());
  await page.waitForSelector('.warbar', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const opened = await page.evaluate(() => ({ mode: window.atlas.app.mode, card: !!document.querySelector('.country-card:not([hidden])') }));
  // Any collection the Where quiz draws from.
  check(['eras', 'food', 'structures', 'people', 'life', 'games', 'journeys', 'beliefs', 'writing', 'plagues', 'disasters', 'music', 'art', 'inventions', 'heritage'].includes(opened.mode) && opened.card, `"See it in the story" opens the story at the item (${opened.mode})`);
  // A city tour: Hagia Sophia (Great structures), then the siege of 717 (Wars), both over Istanbul.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Istanbul through time"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const stop = async () => {
    await page.waitForTimeout(3500);
    return page.evaluate(() => { const v = window.atlas.app.renderer.view; return { mode: window.atlas.app.mode, lon: v.lon, lat: v.lat, zoom: v.zoom, n: document.querySelector('.learn-card .tour-tools')?.textContent ?? '', bar: document.querySelector('.wb-title')?.textContent ?? '' }; });
  };
  const near = (s) => Math.abs(s.lon - 28.97) < 0.3 && Math.abs(s.lat - 41.01) < 0.3 && s.zoom > 15;
  const s1 = await stop();
  check(s1.mode === 'structures' && near(s1) && /1\/9/.test(s1.n), `a city tour opens a Great structures step over Istanbul (${s1.bar}, zoom ${s1.zoom.toFixed(0)})`);
  const below = await page.evaluate(() => ({ inset: window.atlas.app.renderer.view.insetTop, bottom: document.querySelector('.learn-card').getBoundingClientRect().bottom, mid: window.atlas.app.renderer.view.midY }));
  check(below.inset > below.bottom && below.mid > below.bottom, `the tour's map centres below its card (middle at ${Math.round(below.mid)} px, card ends at ${Math.round(below.bottom)})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Next"]').click());
  const s2 = await stop();
  check(s2.mode === 'wars' && near(s2) && /2\/9/.test(s2.n), `its next stop is a Wars step, still over Istanbul (${s2.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('.learn-card').hidden), 'closing the tour hides its card');
  // Capitals of the ancient world: its first stop opens Mesopotamia and flies to Uruk.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Capitals of the ancient world"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const uruk = await stop();
  check(uruk.mode === 'people' && Math.abs(uruk.lon - 45.64) < 0.3 && Math.abs(uruk.lat - 31.32) < 0.3 && /1\/11/.test(uruk.n), `a tour of ancient capitals starts at Uruk (${uruk.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Winter Games: its first stop opens the Chamonix 1924 step of Games of the world.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Winter Games"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const cham = await stop();
  check(cham.mode === 'games' && /first Winter Games/.test(cham.bar) && /1\/12/.test(cham.n), `the Winter Games tour starts at Chamonix (${cham.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Along the Silk Road: its first stop opens the Silk Road story at Zhang Qian's mission.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Along the Silk Road"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const silk = await stop();
  check(silk.mode === 'journeys' && /Zhang Qian/.test(silk.bar) && /1\/13/.test(silk.n), `the Silk Road tour starts with Zhang Qian (${silk.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Holy places: its first stop opens the faiths story at Göbekli Tepe; The story of the alphabet starts
  // with the first letters, in Egypt.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Holy places"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const holy = await stop();
  check(holy.mode === 'beliefs' && Math.abs(holy.lon - 38.92) < 0.3 && Math.abs(holy.lat - 37.22) < 0.3 && /1\/12/.test(holy.n), `the Holy places tour starts at Göbekli Tepe (${holy.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="The story of the alphabet"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const abc = await stop();
  check(abc.mode === 'writing' && /letters/.test(abc.bar) && /1\/9/.test(abc.n), `the alphabet tour starts with the first letters (${abc.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Pandemics that changed history starts at Constantinople in 542; Tsunamis across the oceans with the
  // orphan tsunami of 1700 in Japan.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Pandemics that changed history"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const pan = await stop();
  check(pan.mode === 'plagues' && Math.abs(pan.lon - 28.98) < 0.3 && Math.abs(pan.lat - 41.01) < 0.3 && /1\/7/.test(pan.n), `the pandemics tour starts at Constantinople (${pan.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Tsunamis across the oceans"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const tsu = await stop();
  check(tsu.mode === 'disasters' && /orphan tsunami/i.test(tsu.bar) && /1\/9/.test(tsu.n), `the tsunamis tour starts with the orphan tsunami of 1700 (${tsu.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // What are you hearing?, Which book is it from?, Who made it?: the clip, the line or the picture is the
  // question, and the name stays hidden until the answer.
  for (const kind of ['listen', 'opening', 'artist', 'site']) {
    await menu('Quiz');
    await page.evaluate((k) => document.querySelector(`[data-quiz="${k}"]`).click(), kind);
    await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
    const q = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', named: !!document.querySelector('.learn-card .quiz-item'), clip: !!document.querySelector('.learn-card .item-clip'), quote: !!document.querySelector('.learn-card .item-quote'), img: !!document.querySelector('.learn-card .quiz-img'), opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent) }));
    await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
    await page.waitForTimeout(400);
    const a = await page.evaluate(() => ({ fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '', named: !!document.querySelector('.learn-card .quiz-item') }));
    const shown = kind === 'listen' ? q.clip : kind === 'opening' ? q.quote : q.img;
    check(/1\/10/.test(q.head) && q.opts.length === 4 && new Set(q.opts).size === 4 && shown && !q.named && a.named && !!a.fb, `quiz "${kind}": ${q.q} (${q.opts.join(' / ')}) → ${a.fb.slice(0, 60)}`);
    await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
    await page.waitForTimeout(300);
  }
  // Sounds of the world opens the gamelan of Java; First lines opens The Tale of Genji in Kyoto.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Sounds of the world"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const snd = await stop();
  check(snd.mode === 'music' && /gamelan/i.test(snd.bar) && /1\/11/.test(snd.n), `the instruments tour starts with the gamelan (${snd.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="First lines"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const fl = await stop();
  check(fl.mode === 'books' && /Genji|Heian/i.test(fl.bar) && /1\/10/.test(fl.n), `the First lines tour starts in Heian Kyoto (${fl.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Lost and rebuilt starts in Warsaw; Invented in Latin America starts with Olmec rubber.
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Lost and rebuilt"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const lr = await stop();
  check(lr.mode === 'heritage' && /Warsaw|paintings/i.test(lr.bar) && /1\/6/.test(lr.n), `the Lost and rebuilt tour starts in Warsaw (${lr.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  await menu('Guided tours');
  await page.evaluate(() => document.querySelector('[data-tour="Invented in Latin America"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  const ila = await stop();
  check(ila.mode === 'inventions' && /rubber/i.test(ila.bar) && /1\/11/.test(ila.n), `the Invented in Latin America tour starts with rubber (${ila.bar})`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // Who invented it?: the invention is named, four inventors to choose from.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="inventor"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
  const iq = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', named: document.querySelector('.learn-card .quiz-item')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent) }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
  await page.waitForTimeout(400);
  const ifb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  check(/1\/10/.test(iq.head) && /Who invented it/.test(iq.q) && !!iq.named && iq.opts.length === 4 && new Set(iq.opts).size === 4 && /: /.test(ifb), `quiz "inventor": ${iq.named} (${iq.opts.join(' / ')}) → ${ifb.slice(0, 70)}`);
  await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  check(!errors.length, `no page errors in quizzes and tours${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 14. Play and learn more: Put them in order, Time detective, the daily challenge (the same questions in two
// browsers on the same day), your progress and its badges, On this day with the stories, and a new city tour.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=20,30,1.4&lang=en');
  const menu = async (re) => {
    await page.tap('[data-dock="more"]');
    await page.waitForTimeout(300);
    await page.evaluate((re) => [...document.querySelectorAll('.menu-item')].find((x) => new RegExp(re).test(x.textContent))?.click(), re);
    await page.waitForTimeout(500);
  };
  const close = async () => { await page.evaluate(() => document.querySelector('.learn-card [aria-label="Close"]')?.click()); await page.waitForTimeout(500); };
  await menu('Quiz');
  const panel = await page.evaluate(() => ({ daily: document.querySelector('[data-quiz="daily"]')?.textContent ?? '', progress: !!document.querySelector('[data-panel="progress"]'), order: !!document.querySelector('[data-quiz="order"]'), det: !!document.querySelector('[data-quiz="detective"]') }));
  check(/Daily challenge #\d+/.test(panel.daily) && panel.progress && panel.order && panel.det, `the Quiz panel has the daily challenge, your progress and the two new games (${panel.daily.slice(0, 60)})`);
  // Put them in order: four things; three taps number all four; the check puts them in order with their dates.
  await page.evaluate(() => document.querySelector('[data-quiz="order"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .order-row', { timeout: 30000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('.learn-card .order-row')].map((r) => r.dataset.order));
  for (let k = 0; k < 3; k++) { await page.evaluate(() => [...document.querySelectorAll('.learn-card .order-row:not(.picked)')][0]?.click()); await page.waitForTimeout(150); }
  const nums = await page.evaluate(() => [...document.querySelectorAll('.learn-card .order-row .order-num')].map((x) => x.textContent).join(''));
  // A tap on the second takes it and the ones after it back.
  await page.evaluate(() => document.querySelectorAll('.learn-card .order-row.picked')[1]?.click());
  await page.waitForTimeout(150);
  const back = await page.evaluate(() => document.querySelectorAll('.learn-card .order-row.picked').length);
  for (let k = 0; k < 2; k++) { await page.evaluate(() => [...document.querySelectorAll('.learn-card .order-row:not(.picked)')][0]?.click()); await page.waitForTimeout(150); }
  await page.evaluate(() => document.querySelector('.learn-card [data-check]')?.click());
  await page.waitForTimeout(800);
  const ord = await page.evaluate(() => {
    const q = window.atlas.learn.quiz, cur = q.qs[0];
    return { fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '', ts: [...document.querySelectorAll('.learn-card .order-row')].map((r) => cur.set.find((x) => (x.id ?? x.name.en) === r.dataset.order).t), pins: window.atlas.learn.pins.length, subs: [...document.querySelectorAll('.learn-card .order-sub')].map((x) => x.textContent) };
  });
  check(rows.length === 4 && nums === '1234' && back === 1 && /in the right place|All four/.test(ord.fb) && ord.ts.every((t, i) => i === 0 || t >= ord.ts[i - 1]) && ord.pins === 4, `Put them in order: 4 things, numbered as tapped, then in order with dates (${ord.subs.map((x) => x.split(' · ')[0]).join(', ')}) → ${ord.fb}`);
  await close();
  // Time detective: the old borders with no names, four years; the answer names them and says what the world was like.
  await menu('Quiz');
  await page.evaluate(() => document.querySelector('[data-quiz="detective"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .quiz-opt', { timeout: 30000 });
  await page.waitForFunction(() => window.atlas.app.layers.some((l) => l.def.id === 'history'), null, { timeout: 30000 });
  const det = await page.evaluate(() => ({ q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', region: document.querySelector('.learn-card .quiz-item')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent), stack: window.atlas.app.layers.map((l) => l.def.id).join(','), base: window.atlas.app.renderer.baseMap, labels: window.atlas.app.renderer.settings.labels.countries }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt').click());
  await page.waitForTimeout(800);
  const deta = await page.evaluate(() => ({ fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '', cap: document.querySelector('.learn-card .quiz-caption')?.textContent ?? '' }));
  check(/When is this map from/.test(det.q) && det.opts.length === 4 && new Set(det.opts).size === 4 && det.stack === 'history' && !det.base && !det.labels && /The world in/.test(deta.cap), `Time detective: ${det.region} (${det.opts.join(' / ')}), old borders without names → ${deta.fb} ${deta.cap.slice(0, 50)}`);
  await close();
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ stack: window.atlas.app.layers.map((l) => l.def.id).join(','), base: window.atlas.app.renderer.baseMap, labels: window.atlas.app.renderer.settings.labels.countries }));
  check(after.stack === 'political' && after.base && after.labels, `closing Time detective brings back today's map and its names (${after.stack})`);
  // The daily challenge: eight questions (one of them Which country in between?); another browser gets the same ones
  // the same day.
  const dailyQs = async (p) => {
    await p.evaluate(() => window.atlas.learn.startQuiz('daily', 'world'));
    await p.waitForFunction(() => window.atlas.learn.quiz?.kind === 'daily', null, { timeout: 30000 });
    return p.evaluate(() => window.atlas.learn.quiz.qs.map((q) => `${q.kind}:${q.item?.id ?? q.det?.year ?? (q.set ? q.set.map((x) => x.id).join('+') : q.id)}`));
  };
  const d1 = await dailyQs(page);
  const other = await open({ viewport: { width: 1000, height: 700 } }, '#p=globe&l=political&c=20,30,1.4&lang=es');
  const d2 = await dailyQs(other.page);
  await other.ctx.close();
  check(d1.length === 8 && JSON.stringify(d1) === JSON.stringify(d2) && d1[0].startsWith('find') && d1.some((x) => x.startsWith('hop')) && d1.some((x) => x.startsWith('order')) && d1.some((x) => x.startsWith('detective')), `the daily challenge has 8 questions, the same in a second browser (${d1.map((x) => x.split(':')[0]).join(', ')})`);
  for (let i = 0; i < 8; i++) {
    const k = await page.evaluate(() => { const q = window.atlas.learn.quiz; return q.qs[q.i].kind; });
    if (k === 'find' || k === 'where') await page.evaluate(() => [...document.querySelectorAll('.learn-card button')].find((b) => /Show me/.test(b.textContent))?.click());
    else if (k === 'order') { for (let j = 0; j < 3; j++) { await page.evaluate(() => [...document.querySelectorAll('.learn-card .order-row:not(.picked)')][0]?.click()); await page.waitForTimeout(100); } await page.evaluate(() => document.querySelector('.learn-card [data-check]')?.click()); }
    else await page.evaluate(() => { const q = window.atlas.learn.quiz, cur = q.qs[q.i]; const b = [...document.querySelectorAll('.learn-card .quiz-opt')]; (b.find((x) => x.textContent && cur.options && cur.options.indexOf(cur.id) === b.indexOf(x)) ?? b[0])?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /Next|See result/.test(b.textContent))?.click());
    await page.waitForTimeout(700);
  }
  const res = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', marks: document.querySelector('.learn-card .daily-marks')?.textContent ?? '', rows: document.querySelectorAll('.learn-card .quiz-sum-row').length, share: !!document.querySelector('.learn-card [data-share]'), p: JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}') }));
  check(/Daily challenge #\d+/.test(res.head) && (res.marks.match(/🟩|🟥/gu) ?? []).length === 8 && res.rows === 8 && res.share && !!res.p.badges?.['daily-1'] && res.p.daily?.streak === 1, `the daily result: ${res.marks}, 8 rows, Share, the first daily badge and a 1-day streak`);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /Done/.test(b.textContent))?.click());
  await page.waitForTimeout(500);
  await menu('Quiz');
  const done = await page.evaluate(() => document.querySelector('[data-quiz="daily"]')?.textContent ?? '');
  await page.evaluate(() => document.querySelector('[data-panel="progress"]').click());
  await page.waitForTimeout(500);
  const prog = await page.evaluate(() => ({ subjects: document.querySelectorAll('.progress [data-subject]').length, got: [...document.querySelectorAll('.progress .badge-chip.got')].map((b) => b.dataset.badge), all: document.querySelectorAll('.progress .badge-chip').length }));
  check(/Done: \d\/8/.test(done) && prog.subjects === 6 && prog.got.includes('daily-1') && prog.all > 40, `once played, the card says "${done.slice(done.indexOf('Done'), done.indexOf('Done') + 30)}"; your progress shows 6 subjects and ${prog.all} badges (${prog.got.join(', ')} earned)`);
  await page.evaluate(() => document.querySelector('.sheet-close, .sheet [aria-label="Close"]')?.click());
  await page.waitForTimeout(300);
  // On this day: 11 November in the stories (the armistice of 1918), the day after, and a story opened at its step.
  await page.evaluate(() => window.atlas.learn.openOnThisDay(new Date(2026, 10, 11)));
  await page.waitForSelector('.otd-story', { timeout: 30000 });
  const otd = await page.evaluate(() => ({ date: document.querySelector('.otd-date')?.textContent ?? '', rows: [...document.querySelectorAll('.otd-story')].map((r) => r.textContent) }));
  await page.evaluate(() => document.querySelector('[data-otd="next"]').click());
  await page.waitForFunction(() => /12 November/.test(document.querySelector('.otd-date')?.textContent ?? ''), null, { timeout: 10000 });
  await page.waitForSelector('.otd-story', { timeout: 30000 });
  const story = await page.evaluate(() => document.querySelector('.otd-story').dataset.story);
  await page.evaluate(() => document.querySelector('.otd-story').click());
  await page.waitForFunction((k) => window.atlas.app.mode === k.split('/')[0], story, { timeout: 30000 }).catch(() => {});
  const opened = await page.evaluate(() => ({ mode: window.atlas.app.mode, bar: document.querySelector('.wb-title')?.textContent ?? '' }));
  check(/11 November/.test(otd.date) && otd.rows.some((r) => /1918/.test(r)) && opened.mode === story.split('/')[0], `On this day: 11 November in the stories (${otd.rows.length} entries, 1918 among them); the next day opens ${story} (${opened.bar})`);
  if (opened.mode) await page.evaluate((m) => window.atlas.time?.modes?.find((x) => x.id === m)?.exit(), opened.mode);
  await page.evaluate(() => document.querySelector('.warbar [aria-label="Close"], .wb-close')?.click());
  await page.waitForTimeout(800);
  // A new city tour: Buenos Aires starts with the May Revolution, at the Cabildo.
  await menu('Guided tours');
  const cities = await page.evaluate(() => document.querySelectorAll('[data-tour$="through time"]').length);
  await page.evaluate(() => document.querySelector('[data-tour="Buenos Aires through time"]').click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-tools', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const ba = await page.evaluate(() => { const v = window.atlas.app.renderer.view; return { mode: window.atlas.app.mode, lon: v.lon, lat: v.lat, n: document.querySelector('.learn-card .tour-tools')?.textContent ?? '', title: document.querySelector('.learn-card .tool-head strong')?.textContent ?? '' }; });
  check(cities >= 20 && ba.mode === 'wars' && Math.abs(ba.lon + 58.37) < 0.3 && Math.abs(ba.lat + 34.61) < 0.3 && /1\/11/.test(ba.n), `${cities} city tours; Buenos Aires starts with ${ba.title} over the Cabildo`);
  await close();
  check(!errors.length, `no page errors in the new games, the daily challenge and On this day${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 15. Terrain in detail, with stand-in tiles (no outside server): zoomed in, the relief is drawn from height tiles
// that load for the area on screen and are freed as the map moves on (memory stays capped); detail can be turned
// off or kept to Wi-Fi; the counter counts; the zoom goes deeper; a saved area works offline and can be deleted;
// the 3D view raises the land.
{
  const zlib = await import('node:zlib');
  /** A PNG of 256 × 256 RGBA pixels from a function. */
  const png = (px) => {
    const raw = Buffer.alloc(256 * (256 * 4 + 1));
    for (let y = 0; y < 256; y++) { raw[y * 1025] = 0; for (let x = 0; x < 256; x++) { const [r, g, b] = px(x, y); const o = y * 1025 + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255; } }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  // Terrarium heights: ridges from 0 to 3,000 m (R*256 + G + B/256 - 32768).
  const heightTile = (z, x, y) => png((px, py) => {
    const gx = x * 256 + px, gy = y * 256 + py;
    const hh = Math.round(1500 + 1500 * Math.sin(gx / 23) * Math.cos(gy / 31)) + 32768;
    return [hh >> 8, hh & 255, 0];
  });
  const picTile = png((px, py) => [60 + (px & 63), 110 + (py & 63), 70]);
  const run = async (opts, fn) => {
    const ctx = await browser.newContext(opts);
    const counts = { terrain: 0, sat: 0 };
    await ctx.route(/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/, (r) => { counts.terrain++; const [, z, x, y] = r.request().url().match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png$/).map(Number); return r.fulfill({ status: 200, body: heightTile(z, x, y), contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); });
    await ctx.route(/^https:\/\/tiles\.maps\.eox\.at\//, (r) => { counts.sat++; return r.fulfill({ status: 200, body: picTile, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); });
    await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url + '#p=globe&l=relief&c=10.4,46.4,2&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    try { await fn(page, ctx, counts); } finally { check(!errors.length, `no page errors with detailed terrain (${opts.isMobile ? 'phone' : 'laptop'})${errors.length ? ': ' + errors.join(' | ') : ''}`); await ctx.close(); }
  };
  // Moves the map, then waits two frames, so the detail has seen the new place before anyone asks it.
  const zoomTo = (page, lon, lat, wz) => page.evaluate(async ([lo, la, w]) => {
    const r = window.atlas.app.renderer, v = r.view;
    v.lon = lo; v.lat = la; v.zoom *= 2 ** (w - v.webZoom); r.requestRender();
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, [lon, lat, wz]);
  const mosaic = (page) => page.evaluate(() => { const m = window.atlas.app.layers[0]?.state.mosaic; const t = window.atlas.terrain; return { loaded: m?.loaded ?? 0, total: m?.total ?? 0, inMemory: t.tiles.size, max: t.tiles.max, requests: t.stats.requests, session: t.stats.session, fromSaved: t.stats.fromSaved }; });
  const settle = (page) => page.waitForFunction(() => { const m = window.atlas.app.layers[0]?.state.mosaic; return m && m.total > 0 && m.loaded === m.total; }, null, { timeout: 30000 }).catch(() => {});

  await run({ ...devices['Pixel 7'] }, async (page, ctx, counts) => {
    // Zoomed out: the world image alone, no tiles.
    const far = await mosaic(page);
    await zoomTo(page, 10.4, 46.4, 8);
    await settle(page);
    const a = await mosaic(page);
    // The relief is drawn from the heights: the map's pixels change when the detail arrives (mountains get shadows).
    const maxZoom = await page.evaluate(() => window.atlas.app.renderer.view.maxZoom);
    check(far.requests === 0 && a.total > 0 && a.loaded === a.total && a.requests >= a.total && counts.terrain >= a.total && a.session > 0 && maxZoom > 400,
      `zoomed in on the Alps, ${a.loaded} height tiles load for the area on screen (none zoomed out), ${(a.session / 1e3).toFixed(0)} KB counted; the zoom goes deeper (max ${maxZoom})`);
    // Moving round the world: new tiles at each place, but memory stays capped.
    for (let lon = -170; lon <= 175; lon += 12) {
      await zoomTo(page, lon, 30, 10);
      await settle(page);
    }
    const b = await mosaic(page);
    check(b.inMemory <= b.max && b.requests > b.max && b.loaded === b.total, `round the world, ${b.requests} tiles fetched but only ${b.inMemory} kept in memory (cap ${b.max}); the last place is complete (${b.loaded}/${b.total})`);
    // Detail off: no more downloads, and the zoom limit is back.
    await page.evaluate(() => { const t = window.atlas.terrain; t.prefs.detail = false; t.tiles.clear(); window.atlas.app.syncMaxZoom(); window.atlas.app.renderer.requestRender(); });
    await zoomTo(page, 15, 47, 8);
    await page.waitForTimeout(2500);
    const c = await mosaic(page);
    const m2 = await page.evaluate(() => window.atlas.app.renderer.view.maxZoom);
    check(c.requests === b.requests && c.total === 0 && m2 === 400, `with detail off, no tiles are fetched (${c.requests - b.requests}) and the deepest zoom is back to normal`);
    await page.evaluate(() => { const t = window.atlas.terrain; t.prefs.detail = true; window.atlas.app.syncMaxZoom(); window.atlas.app.renderer.requestRender(); });
    // Save the area on screen, at the "as on screen" level, heights and satellite.
    await zoomTo(page, 10.4, 46.4, 10);
    await settle(page);
    await page.evaluate(() => window.atlas.terrain.openSave());
    await page.waitForSelector('.terrain-est');
    await page.evaluate(() => { for (const el of document.querySelectorAll('.terrain-save .switch-input')) if (!el.checked) el.click(); });
    const est = await page.evaluate(() => document.querySelector('.terrain-est').textContent);
    await page.evaluate(() => document.querySelector('[data-terrain="save"]').click());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('atlas-globe:saved-areas') || '[]').length === 1, null, { timeout: 60000 });
    const area = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-globe:saved-areas'))[0]);
    const cached = await page.evaluate(async () => (await (await caches.open('atlas-saved-tiles')).keys()).length);
    check(area.tiles > 0 && cached === area.tiles && area.bytes > 0 && /tiles, about/.test(est) && area.sources.length === 2, `saved "${area.name.en}": ${area.tiles} tiles (${(area.bytes / 1e6).toFixed(1)} MB), estimated beforehand as "${est}"`);
    // Offline: the saved tiles still draw the area.
    await ctx.setOffline(true);
    await page.evaluate(() => { const t = window.atlas.terrain; t.tiles.clear(); window.atlas.app.layers[0].state.mosaic?.free(); window.atlas.app.renderer.requestRender(); });
    const before = await mosaic(page);
    await zoomTo(page, 10.4, 46.4, 10);
    await settle(page);
    const off = await mosaic(page);
    check(off.total > 0 && off.loaded === off.total && off.fromSaved >= off.total && off.requests === before.requests, `offline, the saved area is sharp again from the device (${off.loaded}/${off.total} tiles, ${off.fromSaved - before.fromSaved} from the saved area, no downloads)`);
    await ctx.setOffline(false);
    // Delete it: the list is empty and so is the cache.
    page.once('dialog', (d) => d.accept());
    await page.evaluate(() => window.atlas.terrain.openSave());
    await page.waitForSelector('[data-delete]');
    await page.evaluate(() => document.querySelector('[data-delete]').click());
    // (waitForFunction cannot wait on an async check: poll.)
    let gone = { list: -1, cache: -1 };
    for (let k = 0; k < 30; k++) {
      gone = await page.evaluate(async () => ({ list: JSON.parse(localStorage.getItem('atlas-globe:saved-areas') || '[]').length, cache: (await (await caches.open('atlas-saved-tiles')).keys()).length }));
      if (!gone.list && !gone.cache) break;
      await page.waitForTimeout(300);
    }
    check(gone.list === 0 && gone.cache === 0, `deleting the area empties the list and its tiles (${gone.cache} left)`);
    await page.evaluate(() => window.atlas.shell.sheet.close());
    // 3D: the area on screen raised; the slider raises it more.
    await zoomTo(page, 10.4, 46.4, 8);
    await settle(page);
    await page.evaluate(() => document.querySelector('.zoom-3d').click());
    await page.waitForFunction(() => window.atlas.terrain3d.info.ready && window.atlas.terrain3d.info.frames > 0, null, { timeout: 60000 });
    const t3 = await page.evaluate(() => ({ ...window.atlas.terrain3d.info }));
    const nonEmpty = await page.evaluate(() => { const c = document.querySelector('.t3d-canvas'); const g = c.getContext('webgl2'); const px = new Uint8Array(4); g.readPixels(c.width >> 1, c.height >> 1, 1, 1, g.RGBA, g.UNSIGNED_BYTE, px); return px[3]; });
    await page.evaluate(() => { const s = document.querySelector('.t3d-slider'); s.value = s.max; s.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(400);
    const k2 = await page.evaluate(() => window.atlas.terrain3d.info.k);
    await page.evaluate(() => document.querySelector('[data-drape="satellite"]').click());
    await page.waitForFunction(() => window.atlas.terrain3d.info.tiles > 0, null, { timeout: 30000 }).catch(() => {});
    const sat = await page.evaluate(() => window.atlas.terrain3d.info.tiles);
    await page.evaluate(() => document.querySelector('.t3d-close').click());
    await page.waitForTimeout(500);
    const closed = await page.evaluate(() => ({ el: !!document.querySelector('.t3d'), cls: document.documentElement.classList.contains('t3d-open') }));
    check(t3.heights > 0 && t3.top > 2000 && k2 > t3.k && sat > 0 && !closed.el && !closed.cls, `3D: ${t3.heights} height tiles, highest point ${Math.round(t3.top)} m, ×${t3.k.toFixed(1)} raised to ×${k2.toFixed(1)}; a satellite drape of ${sat} tiles; closing leaves the map (${nonEmpty ? 'drawn' : 'not drawn'} at the centre)`);
  });
  // Only on Wi-Fi, on a device that says it is on mobile data: no downloads.
  await run({ viewport: { width: 1000, height: 700 } }, async (page) => {
    await page.evaluate(() => { Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ type: 'cellular' }) }); const t = window.atlas.terrain; t.prefs.wifiOnly = true; });
    await zoomTo(page, 10.4, 46.4, 8);
    await page.waitForTimeout(3000);
    const m = await mosaic(page);
    await page.evaluate(() => { Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ type: 'wifi' }) }); window.atlas.app.renderer.requestRender(); });
    await settle(page);
    const w = await mosaic(page);
    await page.evaluate(() => { window.atlas.terrain.prefs.wifiOnly = false; });
    check(m.requests === 0 && w.loaded > 0 && w.loaded === w.total, `"Only on Wi-Fi": nothing is fetched on mobile data (${m.requests}); on Wi-Fi the area loads (${w.loaded}/${w.total})`);
  });
}


// 16. Beyond Earth, with stand-in Trek tiles: the Space panel lists the worlds; the Moon shows its map, IAU names and
// landing sites, sharper tiles as you zoom in, a place's card ("named after") and a landing's card; Mars in 3D from its
// own heights; the solar system on a date; a space story steps onto the Moon and back; Which world is this? and Who
// landed here? show the world with no names; Back to Earth restores the map.
{
  const zlib = await import('node:zlib');
  const png = (px) => {
    const raw = Buffer.alloc(256 * (256 * 4 + 1));
    for (let y = 0; y < 256; y++) { raw[y * 1025] = 0; for (let x = 0; x < 256; x++) { const [r, g, b] = px(x, y); const o = y * 1025 + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255; } }
    const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td)); return Buffer.concat([len, td, crc]); };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  const greyTile = png((px, py) => [90 + (px & 31), 90 + (py & 31), 95]);
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  let trek = 0;
  await ctx.route(/^https:\/\/trek\.nasa\.gov\/tiles\//, (r) => { trek++; return r.fulfill({ status: 200, body: greyTile, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=0,20,1&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const frames = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

  // The Space panel: every world, by planets, moons and dwarf planets.
  await page.click('[data-dock="space"]');
  await page.waitForTimeout(500);
  const worlds = await page.$$eval('.world-btn[data-world]', (b) => b.map((x) => x.getAttribute('data-world')));
  check(worlds.length >= 19 && worlds.includes('moon') && worlds.includes('pluto') && worlds.includes('titan'), `the Space panel lists ${worlds.length} worlds (${worlds.slice(0, 6).join(', ')}…)`);

  // The Moon: its map, names, landings and a bar with its maps; zoomed in, Trek tiles sharpen it.
  await page.click('.world-btn[data-world="moon"]');
  await page.waitForFunction(() => window.atlas.space.surface.ready && window.atlas.space.surface.names, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const moon = await page.evaluate(() => { const s = window.atlas.space.surface; return { mode: window.atlas.app.mode, id: s.id, names: s.names?.rows.length ?? 0, landings: s.here.length, chips: [...document.querySelectorAll('.worldbar [data-map]')].map((b) => b.getAttribute('data-map')), glow: window.atlas.app.renderer.worldStyle }; });
  check(moon.mode === 'world' && moon.id === 'moon' && moon.names > 1500 && moon.landings >= 30 && moon.chips.join() === 'photo,elev', `the Moon: ${moon.names} IAU names, ${moon.landings} landing sites, maps ${moon.chips.join(' and ')}`);
  await page.evaluate(() => { const v = window.atlas.app.renderer.view; v.flyTo({ lon: -20.08, lat: 9.62, zoom: 30 }, 10); window.atlas.app.renderer.requestRender(); });
  await page.waitForFunction(() => { const m = window.atlas.space.surface.mosaic; return m && m.total > 0 && m.loaded === m.total; }, null, { timeout: 20000 }).catch(() => {});
  const det = await page.evaluate(() => { const m = window.atlas.space.surface.mosaic; return { loaded: m?.loaded ?? 0, total: m?.total ?? 0 }; });
  check(det.total > 0 && det.loaded === det.total && trek > 0, `zoomed in on Copernicus, ${det.loaded}/${det.total} Trek tiles sharpen the map (${trek} fetched)`);
  // A named place's card.
  const cp = await page.evaluate(() => window.atlas.app.renderer.view.project(-20.08, 9.62));
  await page.mouse.click(cp[0], cp[1]);
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(/Copernicus/.test(card) && /Crater/.test(card) && /Named after/.test(card) && /Polish astronomer/.test(card), `a tap on Copernicus opens its card: ${card.split('\n').slice(0, 9).join(' · ').slice(0, 140)}`);
  // A landing's card: Apollo 11.
  await page.evaluate(() => { window.atlas.shell.card.hide(); const v = window.atlas.app.renderer.view; v.flyTo({ lon: 23.47, lat: 0.67, zoom: 12 }, 10); window.atlas.app.renderer.requestRender(); });
  await page.waitForTimeout(800); await frames();
  const a11 = await page.evaluate(() => window.atlas.app.renderer.view.project(23.473, 0.6741));
  await page.mouse.click(a11[0], a11[1]);
  await page.waitForTimeout(500);
  const lcard = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(/Apollo 11/.test(lcard) && /Armstrong/.test(lcard), `a tap on the Apollo 11 marker opens its card (${lcard.split('\n').slice(0, 3).join(' · ')})`);
  // The pointer over the Moon names no Earth country (on the Earth, Apollo 11's spot is in the Congo) and outlines none.
  await page.mouse.move(a11[0] + 30, a11[1] + 30);
  await page.waitForTimeout(400);
  const hov = await page.evaluate(() => ({ tip: !document.querySelector('.tooltip')?.hidden, hover: window.atlas.app.renderer.hover }));
  check(!hov.tip && !hov.hover, `the pointer over the Moon names no Earth country${hov.tip || hov.hover ? ` (${hov.hover})` : ''}`);

  // Mars in 3D: its own heights (Olympus Mons is about 21 km high).
  await page.evaluate(() => { window.atlas.shell.card.hide(); return window.atlas.space.enter('mars', { camera: { lon: -134, lat: 18.6, zoom: 6 } }); });
  await page.waitForTimeout(1500);
  await page.click('.wd-3d');
  await page.waitForFunction(() => window.atlas.terrain3d.info.ready, null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const t3 = await page.evaluate(() => window.atlas.terrain3d.info);
  check(t3.ready && t3.heights > 0 && t3.top > 20000 && t3.top < 23000 && t3.drape === 'photo', `Mars in 3D: ${t3.heights} height tiles, top ${Math.round(t3.top)} m, drape ${t3.drape}, ×${t3.k}`);
  await page.click('.t3d-close');

  // The solar system on a date: on 9 February 1986 Halley's Comet was at its closest to the Sun.
  await page.evaluate(() => window.atlas.space.openOrrery());
  await page.waitForTimeout(600);
  await page.fill('.orr-input', '1986-02-09');
  await page.dispatchEvent('.orr-input', 'change');
  await page.waitForTimeout(500);
  const orr = await page.evaluate(() => window.atlas.orrery.info);
  await page.click('[data-scale="inner"]');
  await page.waitForTimeout(400);
  const ep = await page.evaluate(() => { const s = window.atlas.orrery.spots?.find?.((x) => x.id === 'earth'); return s ? [s.x, s.y] : null; }).catch(() => null);
  const tapped = await page.evaluate(() => { const o = window.atlas.orrery; const s = o.spots.find((x) => x.id === 'mars'); return s ? o.tap(s.x, s.y) : null; });
  await page.waitForTimeout(800);
  const ocard = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(orr.open && Math.abs(orr.jd - 2446470.5) < 1 && !!ep && tapped === 'mars' && /From the Sun on this date/.test(ocard), `the solar system on 9 February 1986 (JD ${orr.jd}); a tap on Mars opens its card with its distance`);
  await page.click('.orr-close');

  // A space story steps onto the Moon and back to the Earth.
  await page.evaluate(() => window.atlas.space.exit());
  await page.evaluate(() => window.atlas.time.stories.space.open('space-race', 0));
  await page.waitForTimeout(1500);
  const steps = await page.evaluate(async () => { const r = await fetch('data/space/space-race.json'); const c = await r.json(); return c.steps.map((s) => s.world ?? 'earth'); });
  const mi = steps.indexOf('moon');
  let onMoon = null, back = null;
  if (mi >= 0) {
    await page.evaluate((i) => window.atlas.time.stories.space.show('space-race', i), mi);
    await page.waitForTimeout(1500);
    onMoon = await page.evaluate(() => ({ id: window.atlas.space.surface.id, style: !!window.atlas.app.renderer.worldStyle }));
    const ei = steps.findIndex((w, k) => k > mi && w === 'earth');
    await page.evaluate((i) => window.atlas.time.stories.space.show('space-race', i), ei >= 0 ? ei : 0);
    await page.waitForTimeout(1000);
    back = await page.evaluate(() => ({ id: window.atlas.space.surface.id, style: !!window.atlas.app.renderer.worldStyle }));
  }
  check(mi >= 0 && onMoon?.id === 'moon' && onMoon.style && back?.id === null && !back.style, `The space race: step ${mi + 1} is on the Moon (the globe turns into it), the next Earth step brings the Earth back`);
  await page.evaluate(() => window.atlas.time.stories.space.exit());

  // Which world is this?: a world with no names and no bar; after the answer, the names come out.
  await page.evaluate(() => window.atlas.learn['startQuiz']('world', 'world'));
  await page.waitForTimeout(1500);
  const wq = await page.evaluate(() => ({ active: window.atlas.space.active, bare: window.atlas.space.surface.bare, bar: !!document.querySelector('.worldbar'), q: document.querySelector('.learn-card .quiz-q')?.textContent, opts: document.querySelectorAll('.learn-card .quiz-opt').length }));
  await page.click('.learn-card .quiz-opt');
  await page.waitForTimeout(600);
  const wa = await page.evaluate(() => ({ bare: window.atlas.space.surface.bare, fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '' }));
  check(wq.active && wq.bare && !wq.bar && wq.opts === 4 && !wa.bare && wa.fb.length > 5, `Which world is this?: a world with no names or bar, four answers; then "${wa.fb.slice(0, 60)}"`);
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  // Who landed here?: a pin on the Moon or Mars, four missions to that world.
  await page.evaluate(() => window.atlas.learn['startQuiz']('landed', 'world'));
  await page.waitForTimeout(1500);
  const lq = await page.evaluate(() => ({ id: window.atlas.space.surface.id, bare: window.atlas.space.surface.bare, q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', opts: document.querySelectorAll('.learn-card .quiz-opt').length }));
  check((lq.id === 'moon' || lq.id === 'mars') && lq.bare && /Who landed here/.test(lq.q) && lq.opts === 4, `Who landed here?: "${lq.q}" with four missions`);
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.waitForTimeout(500);
  const afterQuiz = await page.evaluate(() => ({ active: window.atlas.space.active, id: window.atlas.space.surface.id }));
  check(!afterQuiz.active && afterQuiz.id === null, 'closing the quiz brings the Earth back');

  // Mercury's map; Back to Earth restores the map.
  await page.evaluate(() => window.atlas.space.enter('mercury'));
  await page.waitForTimeout(1500);
  const merc = await page.evaluate(() => ({ id: window.atlas.space.surface.id, ready: window.atlas.space.surface.ready }));
  await page.click('.wd-exit');
  await page.waitForTimeout(1200);
  const earth = await page.evaluate(() => ({ mode: window.atlas.app.mode, base: window.atlas.app.renderer.baseMap, style: window.atlas.app.renderer.worldStyle, layers: window.atlas.app.layers.map((l) => l.def.id) }));
  check(merc.id === 'mercury' && merc.ready && earth.mode === null && earth.base && earth.style === null && earth.layers.includes('political'), `Mercury's map loads; Back to Earth restores the map (${earth.layers.join(', ')})`);
  check(!errors.length, `no page errors beyond Earth${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 17. Stars, the galaxy and the elements: the real sky behind the globe; the sky from Paranal on a June night (the
// Southern Cross, Scorpius, the Milky Way), a tap and a constellation's card, Jupiter and Saturn at their 2020 conjunction,
// daylight; the galaxy from the nearest stars to the Local Group; the periodic table by origin, an element's card and its
// mines; Which constellation? and Where was this element made?; a tour under the Southern sky; search.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=-60,-20,1&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForFunction(() => window.atlas.sky.info.backdrop > 0, null, { timeout: 30000 }).catch(() => {});
  const bd = await page.evaluate(() => window.atlas.sky.info.backdrop);
  check(bd > 0, `the globe's backdrop is the real sky (${bd} frames drawn)`);

  // The Space panel opens the sky, the galaxy and the elements.
  await page.click('[data-dock="space"]');
  await page.waitForTimeout(500);
  const btns = await page.$$eval('[data-space]', (b) => b.map((x) => x.getAttribute('data-space')));
  check(['sky', 'galaxy', 'elements'].every((k) => btns.includes(k)), `the Space panel opens the night sky, our galaxy and the elements (${btns.join(', ')})`);
  await page.click('[data-space="sky"]');
  await page.waitForTimeout(1500);
  const opened = await page.evaluate(() => window.atlas.sky.info.open);

  // From Paranal on a June night, looking at the Southern Cross with Centaurus beside it (a 90° view: on its own the
  // Cross, the smallest constellation, fills a phone's screen).
  await page.evaluate(() => window.atlas.sky.open({ place: { lon: -70.404, lat: -24.627, label: 'Paranal' }, time: '2027-06-10T03:30:00Z', target: 'Cru', fov: 90 }));
  await page.waitForTimeout(2000);
  const s1 = await page.evaluate(() => window.atlas.sky.info);
  check(opened && s1.open && s1.frame === 'horizon' && s1.sunAlt < -18 && s1.stars > 100 && s1.visible.includes('Cru') && s1.visible.includes('Cen'),
    `the sky from Paranal at night: ${s1.stars} stars, ${s1.visible.length} constellations in view (the Southern Cross, Centaurus…), the Sun ${Math.round(-s1.sunAlt)}° below the horizon`);
  // A tap in the middle of the view: the Southern Cross, or one of its stars.
  const mid = await page.evaluate(() => { const h = document.querySelector('.sky .orr-head').getBoundingClientRect(), f = document.querySelector('.sky .orr-foot').getBoundingClientRect(); return [innerWidth / 2, (h.bottom + f.top) / 2]; });
  const tapped = await page.evaluate(([x, y]) => window.atlas.sky.tap(x, y), mid);
  await page.waitForTimeout(800);
  const tcard = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(!!tapped && /Crux|Southern Cross/.test(tcard), `a tap in the middle opens ${tapped}'s card (${tcard.split('\n').slice(0, 2).join(' · ')})`);
  // A constellation's card.
  await page.evaluate(() => window.atlas.sky.cardOf('Ori'));
  await page.waitForTimeout(800);
  const ocard = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(/Orion/.test(ocard) && /Rigel|Betelgeuse/.test(ocard) && /square degrees/.test(ocard) && /Best seen/.test(ocard), `Orion's card: ${ocard.split('\n').filter(Boolean).slice(0, 6).join(' · ').slice(0, 150)}`);
  await page.evaluate(() => window.atlas.shell.card.hide());
  // Jupiter and Saturn side by side on 21 December 2020, from Madrid.
  await page.evaluate(() => window.atlas.sky.open({ place: { lon: -3.7, lat: 40.4, label: 'Madrid' }, time: '2020-12-21T17:30:00Z', target: 'jupiter', fov: 12 }));
  await page.waitForTimeout(1500);
  const mid2 = await page.evaluate(() => { const h = document.querySelector('.sky .orr-head').getBoundingClientRect(), f = document.querySelector('.sky .orr-foot').getBoundingClientRect(); return [innerWidth / 2, (h.bottom + f.top) / 2]; });
  const conj = await page.evaluate(([x, y]) => window.atlas.sky.tap(x, y), mid2);
  check(conj === 'jupiter' || conj === 'saturn', `Jupiter and Saturn together on 21 December 2020 (a tap on them: ${conj})`);
  // In daylight the Sun is up.
  await page.evaluate(() => window.atlas.sky.open({ time: '2027-06-10T16:00:00Z' }));
  await page.waitForTimeout(800);
  const day = await page.evaluate(() => window.atlas.sky.info.sunAlt);
  check(day > 20, `at noon in Madrid the Sun is ${Math.round(day)}° up`);
  await page.click('.sky-close');
  await page.waitForTimeout(400);

  // Our galaxy: the Milky Way from above, the nearest stars and the Local Group.
  await page.evaluate(() => window.atlas.galaxy.open('galaxy'));
  await page.waitForTimeout(2500);
  const g1 = await page.evaluate(() => window.atlas.galaxy.info);
  await page.evaluate(() => window.atlas.galaxy.go('nearby'));
  await page.waitForTimeout(2200);
  const g2 = await page.evaluate(() => window.atlas.galaxy.info);
  await page.evaluate(() => window.atlas.galaxy.go('local'));
  await page.waitForTimeout(2200);
  const g3 = await page.evaluate(() => window.atlas.galaxy.info);
  check(g1.labels.some((l) => /The Sun/.test(l)) && g2.R < 100 && g2.labels.some((l) => /Centauri|Proxima/.test(l)) && g3.R > 1e6 && g3.labels.some((l) => /Andromeda/.test(l)),
    `our galaxy: the Sun on the Milky Way, then the nearest stars (${g2.labels.slice(0, 3).join(', ')}…), then the Local Group (${g3.labels.filter((l) => /Andromeda|Triangulum|Magellanic/.test(l)).slice(0, 3).join(', ')})`);
  await page.click('.gal-close');

  // Where the elements come from: 118 squares; gold's card and its mines.
  await page.evaluate(() => window.atlas.elements.open());
  await page.waitForSelector('.elm-cell[data-z="79"]', { timeout: 15000 }).catch(() => {});
  const cells = await page.$$eval('.elm-cell', (c) => c.length);
  await page.click('[data-origin="ns"]').catch(() => {});
  const dim = await page.$$eval('.elm-cell.dim', (c) => c.length);
  await page.click('.elm-cell[data-z="79"]');
  await page.waitForTimeout(900);
  const ecard = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(cells === 118 && dim > 50 && /Gold/.test(ecard) && /neutron/i.test(ecard) && /Mined/.test(ecard), `the periodic table: ${cells} elements, ${dim} dimmed for "merging neutron stars"; gold's card: ${ecard.split('\n').filter(Boolean).slice(0, 4).join(' · ').slice(0, 120)}`);
  await page.evaluate(() => [...document.querySelectorAll('.country-card a, .country-card button')].find((b) => /who mines it/i.test(b.textContent))?.click());
  await page.waitForTimeout(1200);
  const res = await page.evaluate(() => { const l = window.atlas.app.layers.find((x) => x.def.id === 'resources'); return l ? l.options.res : null; });
  check(res === 'gold' && !(await page.evaluate(() => window.atlas.elements.info.open)), `"Show who mines it" turns on the resources filter for gold (${res})`);

  // Which constellation?: one figure, no names; the answer brings them back; the end closes the sky.
  await page.evaluate(() => window.atlas.learn['startQuiz']('constellation', 'world'));
  await page.waitForTimeout(2500);
  const cq = await page.evaluate(() => ({ open: window.atlas.sky.info.open, bare: window.atlas.sky.bare, focus: window.atlas.sky.info.focus, opts: document.querySelectorAll('.learn-card .quiz-opt').length }));
  await page.click('.learn-card .quiz-opt');
  await page.waitForTimeout(700);
  const ca = await page.evaluate(() => ({ bare: window.atlas.sky.bare, fb: document.querySelector('.learn-card .quiz-fb')?.textContent ?? '' }));
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.waitForTimeout(500);
  const cs = await page.evaluate(() => window.atlas.sky.info.open);
  check(cq.open && cq.bare && !!cq.focus && cq.opts === 4 && !ca.bare && ca.fb.length > 4 && !cs, `Which constellation?: ${cq.focus} drawn alone with four answers; then "${ca.fb.slice(0, 50)}"; closing the quiz closes the sky`);
  // Where was this element made?
  await page.evaluate(() => window.atlas.learn['startQuiz']('element', 'world'));
  await page.waitForTimeout(1200);
  const eq = await page.evaluate(() => ({ sym: document.querySelector('.learn-card .quiz-el-sym')?.textContent ?? '', opts: document.querySelectorAll('.learn-card .quiz-opt').length }));
  await page.click('.learn-card .quiz-opt');
  await page.waitForTimeout(500);
  const ea = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  check(eq.sym.length >= 1 && eq.opts === 4 && /%/.test(ea), `Where was this element made?: ${eq.sym} with four origins; then "${ea.slice(0, 70)}"`);
  await page.evaluate(() => window.atlas.learn['stopQuiz']());

  // A tour under the Southern sky: the sky from Paranal; the tour's end closes it.
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(500);
  await page.click('[data-tour="A night under the Southern sky"]');
  await page.waitForTimeout(2500);
  const t1 = await page.evaluate(() => ({ open: window.atlas.sky.info.open, lat: window.atlas.sky.info.lat, card: document.querySelector('.learn-card .tour-title, .learn-card strong')?.textContent ?? '' }));
  await page.evaluate(async () => { const L = window.atlas.learn; L['tour'].i = 4; await L['showStep'](); });
  await page.waitForTimeout(1500);
  const t2 = await page.evaluate(() => window.atlas.sky.info.visible.includes('Cen'));
  await page.evaluate(() => window.atlas.learn['stopTour']());
  await page.waitForTimeout(600);
  const t3 = await page.evaluate(() => window.atlas.sky.info.open);
  check(t1.open && Math.abs(t1.lat + 24.6) < 0.1 && t2 && !t3, `A night under the Southern sky: from Paranal (${t1.lat.toFixed(1)}°), on to Omega Centauri; closing the tour closes the sky`);

  // Search: a constellation, a star and an element.
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.fill('.search-field', 'Orion');
  await page.waitForTimeout(300);
  const hits = await page.$$eval('.search-item', (r) => r.map((x) => x.textContent));
  await page.fill('.search-field', 'Sirius');
  await page.waitForTimeout(300);
  const hits2 = await page.$$eval('.search-item', (r) => r.map((x) => x.textContent));
  await page.click('.search-item');
  await page.waitForTimeout(1800);
  const after = await page.evaluate(() => ({ open: window.atlas.sky.info.open, card: document.querySelector('.country-card:not([hidden])')?.innerText ?? '' }));
  check(hits.some((x) => /Orion.*Constellation/.test(x)) && hits2.some((x) => /Sirius.*Star/.test(x)) && after.open && /Sirius/.test(after.card), `search finds Orion (constellation) and Sirius (star); picking Sirius opens the sky at it with its card`);
  check(!errors.length, `no page errors among the stars${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 18. Narrated tours and your own data. With a stand-in for the device's voices (headless browsers have none): a
// tour read aloud in Spanish by a Mexican voice rather than a Spanish one, the sentence being read marked, auto-play
// moving on when the voice is done; a story that waits for the voice; the screensaver's playlists (a view, its
// caption read aloud, the next view, the map put back) and a shared playlist link; your data: the panel, a sample
// with years (totals set aside, a year picked), a pasted table with decimal commas, regions, points with a card,
// Compare offered your numbers, the tables still there after a reload, and deleting one.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {}
    window.__spoken = [];
    const voices = [
      { name: 'Monica', lang: 'es-ES', voiceURI: 'es-es', localService: true },
      { name: 'Paulina', lang: 'es-MX', voiceURI: 'es-mx', localService: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'en-us', localService: true },
    ];
    let speaking = false, cur = null, timer = 0;
    const synth = {
      getVoices: () => voices, get speaking() { return speaking; }, get pending() { return false; },
      speak(u) { speaking = true; cur = u; window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, at: Date.now() }); setTimeout(() => u.onstart && u.onstart(), 10); timer = setTimeout(() => { speaking = false; cur = null; u.onend && u.onend(); }, Math.min(1000, 20 * u.text.length)); },
      cancel() { clearTimeout(timer); speaking = false; const u = cur; cur = null; if (u && u.onend) u.onend(); },
      addEventListener() {}, pause() {}, resume() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = ''; this.voice = null; this.rate = 1; } };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const boot = async (hash) => {
    await page.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await page.waitForTimeout(800);
  };
  await boot('#p=globe&l=political&c=-60,0,1&lang=es');

  // A tour read aloud: the Mexican voice, the sentence marked, and auto-play going on after the voice.
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(600);
  await page.click('[data-tour="Born in the stars"]');
  await page.waitForTimeout(1200);
  await page.click('.tour-voice');
  // The sentence is marked while the voice reads it: watched from the page on every frame (a fixed wait can miss
  // it on a busy machine, where the stand-in voice finishes both short sentences first).
  const marked = await page.waitForFunction(() => window.__spoken.length >= 1 && document.querySelectorAll('.tour-s.reading').length === 1, null, { timeout: 5000, polling: 'raf' }).then(() => 1, () => 0);
  const v1 = await page.evaluate(() => ({ spoken: window.__spoken.slice() }));
  v1.marked = marked;
  // (A tour plays by itself from the start: no need to press ▶.)
  await page.waitForFunction(() => window.atlas.learn['tour']?.i >= 1, null, { timeout: 30000 }).catch(() => {});
  const v2 = await page.evaluate(() => ({ i: window.atlas.learn['tour']?.i, n: window.__spoken.length, first: window.__spoken.findIndex((s) => /átomos/i.test(s.text)) }));
  check(v1.spoken[0]?.voice === 'Paulina' && /Los primeros átomos/.test(v1.spoken[0]?.text) && v1.marked === 1 && v2.i === 1 && v2.n >= 3,
    `a tour read aloud in Spanish by a Mexican voice (${v1.spoken[0]?.voice}: "${v1.spoken[0]?.text}"), its sentence marked, auto-play on to stop ${(v2.i ?? 0) + 1} after the voice`);
  await page.evaluate(() => window.atlas.learn['stopTour']());
  await page.waitForTimeout(300);
  const quiet = await page.evaluate(() => window.speechSynthesis.speaking);
  check(!quiet, 'closing the tour stops the voice');

  // A story playing waits for the voice: the step changes only after its last sentence.
  await page.evaluate(() => { window.__spoken.length = 0; });
  await page.evaluate(() => window.atlas.time.stories.eras.open('scientific-revolution'));
  await page.waitForFunction(() => window.atlas.time.stories.eras.step >= 1, null, { timeout: 40000 }).catch(() => {});
  const st = await page.evaluate(() => ({ step: window.atlas.time.stories.eras.step, spoken: window.__spoken.map((x) => x.text) }));
  const firstNext = st.spoken.findIndex((x, i) => i > 0 && /^1543\.$/.test(x));
  check(st.step === 1 && firstNext > 2, `a story read aloud moves on when the voice is done (${firstNext} sentences of the first step read before "1543.")`);
  await page.evaluate(() => window.atlas.time.stories.eras.exit());
  await page.waitForTimeout(800);

  // The screensaver: the panel's playlists, my playlist, and a playlist playing with its captions read aloud.
  await page.evaluate(() => window.atlas.app.setLang('en'));
  await page.evaluate(() => window.atlas.shell.openScreensaver());
  await page.waitForTimeout(500);
  const pls = await page.$$eval('[data-playlist]', (b) => b.map((x) => x.getAttribute('data-playlist')));
  await page.click('.ss .settings-actions .pill.primary');
  await page.waitForTimeout(300);
  const mine = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-playlist') || '[]'));
  check(['', 'planet', 'night', 'restless', 'water', 'life', 'wild', 'green', 'people', 'latam'].every((k) => pls.includes(k)) && mine.length === 1 && mine[0].stack.includes('political'),
    `ambient mode offers 9 playlists and my own (${pls.length} cards); "Add this view" adds the map to my playlist`);
  await page.evaluate(() => { window.__spoken.length = 0; window.atlas.app.ambient.secs = 4; window.atlas.app.ambient.narrate = true; });
  await page.click('[data-playlist="restless"]');
  // The view's filters load, the map arrives, then the voice reads its line.
  await page.waitForFunction(() => window.__spoken.some((x) => /tectonic plates/.test(x.text)), null, { timeout: 20000 }).catch(() => {});
  const a1 = await page.evaluate(() => ({ ...window.atlas.shell.ambient.info, on: window.atlas.app.ambient.on, layers: window.atlas.app.layers.map((l) => l.def.id), cap: document.querySelector('.amb-caption')?.innerText, spoken: window.__spoken.map((x) => x.text).join(' ') }));
  await page.waitForFunction(() => window.atlas.shell.ambient.info.views >= 2, null, { timeout: 30000 }).catch(() => {});
  const a2 = await page.evaluate(() => ({ ...window.atlas.shell.ambient.info, layers: window.atlas.app.layers.map((l) => l.def.id) }));
  check(a1.on && a1.playlist === 'restless' && a1.layers.join() === 'relief,plates' && /tectonic plates/.test(a1.cap) && /tectonic plates/.test(a1.spoken) && a2.index === 1 && a2.layers.includes('volcanoes'),
    `Restless Earth plays: the plates (caption and voice), then the volcanoes (${a2.layers.join(', ')})${a1.on && a1.layers.join() === 'relief,plates' && /tectonic plates/.test(a1.cap ?? '') && /tectonic plates/.test(a1.spoken) ? '' : ` [${JSON.stringify(a1).slice(0, 300)}]`}`);
  await page.evaluate(() => window.atlas.shell.ambient.stop());
  await page.waitForTimeout(1000);
  const back = await page.evaluate(() => window.atlas.app.layers.map((l) => l.def.id).join());
  check(back === 'political', `stopping the screensaver puts the map back (${back})`);

  // Your data: the Filters list has its section and button; a sample with years.
  await page.click('[data-dock="filters"]');
  await page.waitForTimeout(600);
  const sec = await page.evaluate(() => !!document.querySelector('.cat-mine .fcard-add'));
  await page.click('.cat-mine .fcard-add');
  await page.waitForSelector('[data-sample="life-expectancy.csv"]', { timeout: 15000 });
  await page.click('[data-sample="life-expectancy.csv"]');
  await page.waitForSelector('.md-card', { timeout: 30000 });
  const pv = await page.evaluate(() => document.querySelector('.md-found')?.innerText ?? '');
  check(sec && /230 countries/.test(pv) && /1950–2023/.test(pv) && /totals set aside \(Africa/.test(pv) && /French Guiana|GUF/.test(pv),
    `"Your data" in the Filters list opens its panel; the life-expectancy sample: ${pv.split('\n').slice(0, 2).join(' · ')}`);
  await page.click('.md-add');
  await page.waitForTimeout(1500);
  const le = await page.evaluate(() => {
    const a = window.atlas, s = a.myData.sets[a.myData.sets.length - 1], id = `my-${s.id}`, inst = a.app.instance(id);
    const jp = inst?.def.info?.('JPN', inst, 'en')?.[0]?.value;
    a.app.setOption(id, 'year', '1950');
    const jp50 = inst?.def.info?.('JPN', inst, 'en')?.[0]?.value;
    return { id, on: !!inst, jp, jp50, legend: (inst?.def.legend?.(inst, 'en')?.actions ?? []).map((x) => x.label).join() };
  });
  check(le.on && parseFloat(le.jp) > 80 && parseFloat(le.jp50) < 70 && /Play the years/.test(le.legend), `on the map: Japan ${le.jp} in 2023, ${le.jp50} in 1950; the legend plays the years${/Play the years/.test(le.legend) ? '' : ` [legend: ${le.legend.slice(0, 120)}]`}`);

  // A pasted table with semicolons and decimal commas; a name it cannot find.
  await page.evaluate(() => window.atlas.app.emit('mydata'));
  await page.waitForTimeout(500);
  await page.click('.md-paste-box summary');
  await page.fill('.md-paste', 'País;Café (kg por persona)\nBrasil;6,2\nFinlandia;12\nAtlantis;3');
  await page.click('.md-paste-box .pill');
  await page.waitForSelector('.md-card', { timeout: 15000 });
  const pp = await page.evaluate(() => document.querySelector('.md-found')?.innerText ?? '');
  await page.click('.md-add');
  await page.waitForTimeout(1000);
  const bra = await page.evaluate(() => { const a = window.atlas, s = a.myData.sets[a.myData.sets.length - 1], inst = a.app.instance(`my-${s.id}`); return inst?.def.valueLabel?.('BRA', inst); });
  check(/2 countries/.test(pp) && /Not found \(1\): Atlantis/.test(pp) && bra === '6.2', `a pasted table with decimal commas: Brazil ${bra}; "Atlantis" reported as not found`);

  // Regions and points.
  for (const f of ['mexico-world-heritage.csv', 'latin-america-cities.csv']) {
    await page.evaluate(() => window.atlas.app.emit('mydata'));
    await page.waitForTimeout(400);
    await page.click(`[data-sample="${f}"]`);
    await page.waitForSelector('.md-card', { timeout: 30000 });
    await page.click('.md-add');
    await page.waitForTimeout(1500);
  }
  const rg = await page.evaluate(async () => {
    const a = window.atlas, s = a.myData.sets.find((x) => x.geo === 'region'), inst = a.app.instance(`my-${s.id}`);
    await new Promise((r) => setTimeout(r, 1500));
    return { ready: inst?.ready, rows: inst?.def.pick?.(-89.2, 20.6, inst, 'en') };
  });
  check(rg.ready && /Yucat/.test(rg.rows?.[0]?.value ?? '') && rg.rows?.length === 2, `regions: a point in Yucatán finds its state and value (${(rg.rows ?? []).map((r) => r.value).join(', ')})`);
  await page.evaluate(() => { window.atlas.shell.sheet.close(); window.atlas.app.flyTo(-46.6, -23.6, 4); });
  await page.waitForTimeout(3000);
  const sp = await page.evaluate(() => window.atlas.app.renderer.view.project(-46.627, -23.557)) ?? [0, 0];
  await page.mouse.click(sp[0], sp[1]);
  await page.waitForTimeout(1000);
  const card = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  check(/São Paulo/.test(card) && /Population/.test(card), `points: a tap on São Paulo opens its card (${card.split('\n').slice(0, 2).join(' · ')})`);

  // Compare two filters offers your numbers.
  await page.evaluate(() => window.atlas.shell.card.hide());
  await page.evaluate(() => window.atlas.app.emit('compare'));
  await page.waitForSelector('[data-pick="a"]', { timeout: 30000 }).catch(() => {});
  const cmp = await page.evaluate(() => [...(document.querySelector('[data-pick="a"]')?.options ?? [])].map((o) => o.value).filter((v) => v.startsWith('my:')));
  const leId = await page.evaluate(() => { const s = window.atlas.myData.sets.find((x) => x.years.length > 1); return `my:${s.id}:${s.columns[0].key}`; });
  check(cmp.includes(leId), `Compare two filters offers your numbers by country (${cmp.length}: life expectancy; a table of two countries is too small to compare)`);
  await page.evaluate(() => window.atlas.compare['stop']?.());

  // After a reload the tables are still there (and still on the map); deleting one takes its filter away.
  const before = await page.evaluate(() => window.atlas.myData.sets.length);
  await boot('');
  await page.waitForFunction(() => window.atlas.myData.sets.length > 0, null, { timeout: 15000 }).catch(() => {});
  const kept = await page.evaluate(() => ({ n: window.atlas.myData.sets.length, on: window.atlas.app.layers.filter((l) => l.def.id.startsWith('my-')).length }));
  const del = await page.evaluate(async () => { const a = window.atlas, s = a.myData.sets[0]; await a.myData.remove(s.id); return { left: a.myData.sets.length, reg: a.app.registry.has(`my-${s.id}`) }; });
  check(kept.n === before && kept.on >= 1 && del.left === before - 1 && !del.reg, `after a reload ${kept.n} tables are still here (${kept.on} on the map); deleting one removes its filter`);
  // A shared playlist: the link carries its views, and opens the screensaver with them.
  const link = Buffer.from(JSON.stringify([{ stack: ['koppen'] }, { stack: ['popdensity'], fly: [-58.4, -34.6, 3] }])).toString('base64url');
  await page.goto(url + `#ambient=1&mine=${link}&lang=en`).catch(() => {});
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForFunction(() => window.atlas.shell.ambient.info.views >= 1, null, { timeout: 15000 }).catch(() => {});
  const sh = await page.evaluate(() => ({ ...window.atlas.shell.ambient.info, layers: window.atlas.app.layers.map((l) => l.def.id), saved: JSON.parse(localStorage.getItem('atlas-playlist') || '[]').length }));
  await page.evaluate(() => window.atlas.shell.ambient.stop());
  check(sh.playlist === 'mine' && sh.layers.join() === 'koppen' && sh.saved === 2, `a shared playlist link opens the screensaver with its views (${sh.layers.join()}, ${sh.saved} views kept)`);
  check(!errors.length, `no page errors in v0.22.0's features${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 19. v0.23.0: fixes from the phone test, and Spain's Spanish. Tapping "Only on Wi-Fi" in Settings leaves the sheet
// where it was; Russia keeps its colour on Time detective's 1880 map as the map moves over the Middle East; a guided
// tour that shows a story has one set of controls (the story's own play, steps and count are hidden) and the story
// gets them back when the tour ends; an element's sky view has a button back to its card; the rumba has no clip
// (the recording was a narrator); with "Español (España)" the texts use Spain's words (and go back), the map's
// canvas measures Spain's words, and a voice from Spain comes first.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {}
    const voices = [
      { name: 'Paulina', lang: 'es-MX', voiceURI: 'es-mx', localService: true },
      { name: 'Monica', lang: 'es-ES', voiceURI: 'es-es', localService: true },
      { name: 'Samantha', lang: 'en-US', voiceURI: 'en-us', localService: true },
    ];
    const synth = { getVoices: () => voices, speaking: false, pending: false, speak(u) { setTimeout(() => u.onend && u.onend(), 50); }, cancel() {}, addEventListener() {}, pause() {}, resume() {} };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = ''; this.voice = null; this.rate = 1; } };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const boot = async (hash) => {
    // A new address that differs only in its hash does not load the page again: reload it.
    await page.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await page.waitForTimeout(800);
  };
  await boot('#p=globe&l=political&c=100,45,3&lang=en');

  // Settings: the Wi-Fi switch near the bottom of the sheet; a tap turns it on and nothing moves.
  await page.evaluate(() => window.atlas.shell.openSettings());
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = document.querySelector('.sheet-body'), w = [...document.querySelectorAll('.switch')].find((x) => /Wi-Fi/.test(x.textContent)); b.scrollTop += w.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom + 20; });
  await page.waitForTimeout(400);
  const where = () => page.evaluate(() => ({ head: Math.round(document.querySelector('.sheet-head').getBoundingClientRect().top), sheet: document.querySelector('.sheet').scrollTop, on: [...document.querySelectorAll('.switch')].find((x) => /Wi-Fi/.test(x.textContent)).querySelector('input').checked }));
  const w0 = await where();
  const box = await page.evaluate(() => { const r = [...document.querySelectorAll('.switch')].find((x) => /Wi-Fi/.test(x.textContent)).querySelector('.switch-track').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.touchscreen.tap(box[0], box[1]);
  await page.waitForTimeout(800);
  const w1 = await where();
  check(w1.on !== w0.on && w1.head === w0.head && w1.sheet === 0, `Settings: tapping "Only on Wi-Fi" switches it and the sheet stays put (head at ${w0.head} → ${w1.head}px, sheet scrolled ${w1.sheet}px)`);
  await page.touchscreen.tap(box[0], box[1]);
  await page.evaluate(() => window.atlas.shell.sheet.close());
  await page.waitForTimeout(500);

  // Time detective's 1880 map: Russia still coloured after the map moves over the Middle East.
  const shown = await page.evaluate(() => window.atlas.time.history.quizMap(1880));
  await page.evaluate(() => window.atlas.app.flyTo(55, 35, 3));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.atlas.app.flyTo(62, 38, 3.2));
  await page.waitForTimeout(2500);
  const ru = await page.evaluate(() => {
    const ren = window.atlas.app.renderer, g = document.getElementById('fg').getContext('2d');
    const px = (lon, lat) => { const p = ren.view.project(lon, lat); return p ? [...g.getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data] : null; };
    return { volga: px(46, 48), urals: px(60, 52), caspian: px(51, 41.5) };
  });
  await page.evaluate(() => window.atlas.time.history.quizMap(null));
  const near = (a, b) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 30;
  check(shown && ru.volga?.[3] === 255 && ru.urals?.[3] === 255 && near(ru.volga, ru.urals), `Time detective 1880: Russia keeps its colour over the Middle East (lower Volga ${ru.volga?.slice(0, 3)}, southern Urals ${ru.urals?.slice(0, 3)})`);

  // A guided tour stopping at a story: one set of controls.
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(700);
  await page.click('[data-tour="Paris through time"]');
  await page.waitForFunction(() => document.querySelector('.warbar.guided'), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const vis = (sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none');
  const g1 = await page.evaluate((v) => { const vis = new Function(`return (${v})`)(); return { guided: !!document.querySelector('.warbar.guided'), play: vis('.warbar .tb-play'), nav: vis('.warbar .wb-nav'), count: vis('.warbar .wb-count'), tourPlay: vis('.tour-card button, .learn-card button') }; }, vis.toString());
  await page.evaluate(() => window.atlas.learn['stopTour']());
  await page.waitForTimeout(1200);
  const g2 = await page.evaluate(() => ({ bar: !!document.querySelector('.warbar'), guided: !!document.querySelector('.warbar.guided') }));
  check(g1.guided && !g1.play && !g1.nav && !g1.count && !g2.guided, `a tour at a story step shows only the tour's controls (story play ${g1.play}, steps ${g1.nav}, count ${g1.count}); after the tour the story is unguided (${g2.bar ? 'bar kept' : 'bar closed'})`);
  await page.evaluate(() => { for (const s of Object.values(window.atlas.time.stories)) if (s.active) s.exit(); });
  await page.waitForTimeout(1200);

  // An element's sky view, and back to its card.
  await page.evaluate(() => window.atlas.elements.open());
  await page.waitForSelector('.elm-cell[data-z="79"]', { timeout: 15000 }).catch(() => {});
  await page.click('.elm-cell[data-z="79"]');
  await page.waitForTimeout(900);
  await page.evaluate(() => [...document.querySelectorAll('.country-card a, .country-card button')].find((b) => /in the sky/i.test(b.textContent))?.click());
  await page.waitForTimeout(2000);
  const sk = await page.evaluate(() => ({ sky: window.atlas.sky.info.open, back: document.querySelector('.sky-back:not([hidden])')?.textContent ?? '' }));
  await page.click('.sky-back');
  await page.waitForTimeout(1500);
  const bk = await page.evaluate(() => ({ sky: window.atlas.sky.info.open, table: window.atlas.elements.info.open, card: document.querySelector('.country-card:not([hidden])')?.innerText.split('\n').filter(Boolean).slice(0, 2).join(' ') ?? '' }));
  check(sk.sky && /Au/.test(sk.back) && !bk.sky && bk.table && /Gold/.test(bk.card), `from gold's card to the sky ("${sk.back}") and back to the table with gold's card (${bk.card})`);
  await page.evaluate(() => window.atlas.elements.close());
  await page.waitForTimeout(500);

  // The rumba: no clip (the recording only had a narrator).
  const rumba = await page.evaluate(async () => { const j = await (await fetch('data/music/latin-rhythms.json')).json(); const it = j.items.find((i) => i.id === 'rumba'); return it ? { audio: !!it.audio } : null; });
  check(rumba && !rumba.audio, `the Cuban rumba has no clip (${JSON.stringify(rumba)})`);

  // Spain's Spanish: a share link with lang=es-ES, a story's texts with Spain's words, the canvas, the voices.
  await boot('#p=globe&l=political&c=-60,0,1&lang=es-ES');
  await page.evaluate(() => window.atlas.time.stories.inventions.open('who-really-invented-it', 13));
  await page.waitForTimeout(2500);
  const words = () => page.evaluate(() => { const t = document.body.innerText; return { ord: (t.match(/ordenador/g) ?? []).length, comp: (t.match(/computadora/g) ?? []).length, lang: document.documentElement.lang }; });
  const es1 = await words();
  const cv = await page.evaluate(() => { const c = document.createElement('canvas').getContext('2d'); c.font = '16px sans-serif'; return [c.measureText('papas fritas').width, c.measureText('patatas fritas').width]; });
  await page.evaluate(() => window.atlas.app.setLang('es', 'latam'));
  await page.waitForTimeout(800);
  const es2 = await words();
  await page.evaluate(() => window.atlas.app.setLang('es', 'spain'));
  await page.waitForTimeout(800);
  const es3 = await words();
  check(es1.ord > 0 && es1.comp === 0 && es1.lang === 'es-ES' && es2.comp > 0 && es2.ord === 0 && es3.ord > 0 && es3.comp === 0, `Español (España): "ordenador" ×${es1.ord}, no "computadora"; Latin American Spanish brings back "computadora" ×${es2.comp}; and Spain's again`);
  check(Math.abs(cv[0] - cv[1]) < 0.01, `the map's canvas measures Spain's words ("papas fritas" as "patatas fritas": ${cv.map((x) => x.toFixed(1)).join(' = ')})`);
  await page.evaluate(() => window.atlas.time.stories.inventions.exit());
  await page.waitForTimeout(800);
  await page.evaluate(() => window.atlas.shell.openSettings());
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => ({ seg: [...document.querySelectorAll('.seg-wrap .seg-btn')].map((b) => b.textContent + (b.classList.contains('on') ? '*' : '')), voice: document.querySelector('.voice-settings select option')?.textContent ?? '' }));
  await page.evaluate(() => [...document.querySelectorAll('.seg-wrap .seg-btn')].find((b) => /Latinoam/.test(b.textContent))?.click());
  await page.waitForTimeout(800);
  const st2 = await page.evaluate(() => ({ spanish: window.atlas.app.spanish, voice: document.querySelector('.voice-settings select option')?.textContent ?? '', share: window.atlas.app.shareUrl() }));
  check(st.seg.join() === 'English,Español (Latinoamérica),Español (España)*' && /España/.test(st.voice) && st2.spanish === 'latam' && /México/.test(st2.voice) && /lang=es(&|$)/.test(st2.share), `Settings: ${st.seg.join(' | ')}; first voice ${st.voice}, and ${st2.voice} for Latin America`);
  check(!errors.length, `no page errors in v0.23.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 20. Map games: Border hop (v0.24.0). The menu (today's route, four goals, eight knowledge rounds, Blitz); a round
// played with taps on the map (names hidden, a country that does not border refused, the Kaliningrad note, par met
// for three stars and the best route of each goal); hints that cost points and stars; a knowledge round refusing
// Brazil; a challenge link; the daily route kept in your progress; the map and filters put back after a game, and a
// quiz closing it. And the dark-blue story areas lightened against the sea (Persia in Alexander's conquests).
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const boot = async (hash) => {
    await page.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await page.waitForTimeout(800);
  };
  await boot('#p=globe&l=political&c=10,40,1.2&lang=en');
  const info = () => page.evaluate(() => window.atlas.hop.info);

  // The menu.
  await page.evaluate(() => window.atlas.hop.openMenu());
  await page.waitForSelector('[data-play="daily"]', { timeout: 15000 }).catch(() => {});
  const menu = await page.evaluate(() => ({ daily: document.querySelector('[data-play="daily"]')?.textContent ?? '', goals: document.querySelectorAll('[data-goal]').length, rules: document.querySelectorAll('[data-rule]').length, blitz: !!document.querySelector('[data-play="blitz"]') }));
  check(/Daily route #\d+ · .+ → .+/.test(menu.daily) && menu.goals === 4 && menu.rules === 8 && menu.blitz, `Map games: ${menu.daily.split('·').slice(0, 2).join('·').trim()}; ${menu.goals} goals, ${menu.rules} knowledge rounds and Blitz`);

  // A round with taps: Spain → China, fewest people.
  await page.evaluate(() => window.atlas.hop.start({ from: 'ESP', to: 'CHN', goal: 'people', rule: null, overseas: false }, 'practice'));
  await page.waitForTimeout(2500);
  const hidden = await page.evaluate(() => ({ names: window.atlas.app.renderer.settings.labels.countries, layers: window.atlas.app.layers.map((l) => l.def.id).join(), sheet: !!document.querySelector('.sheet.open') }));
  const tapAt = async (lon, lat) => { const p = await page.evaluate(([a, b]) => window.atlas.app.renderer.view.project(a, b), [lon, lat]); if (p) await page.touchscreen.tap(p[0], p[1]); await page.waitForTimeout(500); };
  await tapAt(2.5, 46.5);
  const t1 = await info();
  await tapAt(30, 27);
  const t2 = await info();
  const refused = await page.evaluate(() => document.querySelector('.play-card .quiz-fb')?.textContent ?? '');
  check(!hidden.names && hidden.layers === 'political' && t1.path.join() === 'ESP,FRA' && t2.path.join() === 'ESP,FRA' && /does not border/.test(refused), `a tap on France adds it (names hidden); a tap on Egypt is refused: "${refused}"`);
  for (const id of ['CHE', 'AUT', 'SVK', 'POL', 'RUS']) await page.evaluate((x) => window.atlas.hop.step(x), id);
  const note = await page.evaluate(() => document.querySelector('.play-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.hop.step('CHN'));
  await page.waitForTimeout(800);
  const d1 = await info();
  await page.evaluate(() => document.querySelector('[data-hop="others"]')?.getAttribute('aria-expanded') === 'false' && document.querySelector('[data-hop="others"]').click());
  await page.waitForTimeout(300);
  const card1 = await page.evaluate(() => ({ others: document.querySelectorAll('.hop-other').length, text: document.querySelector('.play-card')?.innerText ?? '' }));
  check(/Kaliningrad/.test(note) && d1.done?.score === 1000 && d1.done.stars === 3 && card1.others === 4 && /Fewest countries: 4 countries in between/.test(card1.text) && d1.done.badges.includes('play-1'),
    `Spain → China with the fewest people: 1000 ★★★ (par 272 M); the best route of each goal (${card1.others}); the Kaliningrad note; badges ${d1.done?.badges.join(', ')}`);

  // Hints: names, the population map and the next step; stars capped.
  await page.evaluate(() => window.atlas.hop.start({ from: 'NOR', to: 'IND', goal: 'people', rule: null, overseas: false }, 'practice'));
  await page.waitForTimeout(1500);
  await page.click('[data-hop="hints"]');
  await page.click('[data-hint="names"]');
  await page.click('[data-hint="filter"]');
  await page.waitForTimeout(1500);
  const h1 = await page.evaluate(() => ({ names: window.atlas.app.renderer.settings.labels.countries, layers: window.atlas.app.layers.map((l) => l.def.id).join() }));
  await page.click('[data-hint="step"]');
  const h2 = await info();
  for (let i = 0; i < 10 && !(await info()).done; i++) await page.evaluate(() => window.atlas.hop.hint('step'));
  const h3 = await info();
  check(h1.names && /fact-population/.test(h1.layers) && h2.path.length === 2 && h3.done && h3.done.stars === 1 && h3.done.score < 1000, `hints: names on, the population map on, the next step (${h2.path.join(' › ')}); finished with hints: ${h3.done?.score} points, ${h3.done?.stars} star`);

  // A knowledge round: only Spanish-speaking countries; Brazil refused.
  await page.evaluate(() => window.atlas.hop.start({ from: 'MEX', to: 'PRY', goal: 'count', rule: 'spa', overseas: false }, 'practice'));
  await page.waitForTimeout(1000);
  for (const id of ['GTM', 'HND', 'NIC', 'CRI', 'PAN', 'COL', 'BRA']) await page.evaluate((x) => window.atlas.hop.step(x), id);
  const k = await page.evaluate(() => ({ path: window.atlas.hop.info.path, fb: document.querySelector('.play-card .quiz-fb')?.textContent ?? '' }));
  check(!k.path.includes('BRA') && /not a Spanish-speaking country/.test(k.fb), `only Spanish-speaking countries: "${k.fb}"`);

  // The map and filters come back after a game; a quiz closes a game.
  await page.evaluate(() => window.atlas.hop.stop());
  await page.waitForTimeout(1200);
  const back = await page.evaluate(() => ({ names: window.atlas.app.renderer.settings.labels.countries, layers: window.atlas.app.layers.map((l) => l.def.id).join(), card: !document.querySelector('.play-card')?.hidden }));
  await page.evaluate(() => window.atlas.hop.start({ from: 'FRA', to: 'POL', goal: 'count', rule: null, overseas: false }, 'practice'));
  await page.waitForTimeout(800);
  await page.evaluate(() => window.atlas.learn['startQuiz']('find', 'world'));
  await page.waitForTimeout(1200);
  const q = await page.evaluate(() => ({ hop: window.atlas.hop.active, quiz: !document.querySelector('.learn-card:not(.play-card)')?.hidden }));
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  check(back.names && back.layers === 'political' && !back.card && !q.hop && q.quiz, `after a game the names and filters are back (${back.layers}); starting a quiz closes the game`);

  // A challenge link, and the daily route.
  await boot('#hop=ESP-CHN&goal=people&beat=870');
  await page.waitForFunction(() => window.atlas.hop.active, null, { timeout: 10000 }).catch(() => {});
  const ch = await page.evaluate(() => ({ info: window.atlas.hop.info, text: document.querySelector('.play-card')?.innerText ?? '' }));
  check(ch.info?.mode === 'challenge' && ch.info.from === 'ESP' && ch.info.goal === 'people' && /A friend scored 870/.test(ch.text), `a challenge link opens the same round with the score to beat (${ch.info?.from} → ${ch.info?.to})`);
  await page.evaluate(() => window.atlas.hop.stop());
  await page.evaluate(() => window.atlas.hop.openMenu());
  await page.waitForSelector('[data-play="daily"]', { timeout: 10000 }).catch(() => {});
  await page.click('[data-play="daily"]');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 16 && !(await info())?.done; i++) await page.evaluate(() => window.atlas.hop.hint('step'));
  const dd = await info();
  await page.evaluate(() => window.atlas.hop.stop());
  await page.evaluate(() => window.atlas.hop.openMenu());
  await page.waitForTimeout(800);
  const dm = await page.evaluate(() => ({ text: document.querySelector('[data-play="daily"]')?.textContent ?? '', saved: Object.keys(JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').play?.daily?.results ?? {}).length }));
  check(dd?.mode === 'daily' && !!dd.done && /Done/.test(dm.text) && dm.saved === 1, `the daily route (${dd?.from} → ${dd?.to}, ${dd?.goal}) is kept: "${dm.text.split('·').slice(-2).join('·').trim()}"`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Dark-blue story areas against the sea: Persia, in Alexander's conquests, stands out from the sea next to it.
  await page.evaluate(() => window.atlas.time.stories.wars.open('alexander', 3));
  await page.waitForTimeout(4500);
  const blue = await page.evaluate(() => {
    const ren = window.atlas.app.renderer, g = document.getElementById('fg').getContext('2d');
    const px = (lon, lat) => { const p = ren.view.project(lon, lat); return p ? [...g.getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data] : null; };
    const bg = (lon, lat) => { const p = ren.view.project(lon, lat); if (!p) return null; const c = document.createElement('canvas'); c.width = ren.view.w * ren.view.dpr; c.height = ren.view.h * ren.view.dpr; const x = c.getContext('2d'); x.drawImage(document.getElementById('bg') ?? document.querySelector('canvas'), 0, 0); x.drawImage(document.getElementById('fg'), 0, 0); return [...x.getImageData(Math.round(p[0] * ren.view.dpr), Math.round(p[1] * ren.view.dpr), 1, 1).data]; };
    return { persia: px(44.4, 32.5), sea: bg(51, 27) };
  });
  const lum = (c) => (c ? 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] : 0);
    // (The old dark blue, #2e6f9e, was about 42 brighter than the Gulf; the lightened one about 88.)
  check(blue.persia && blue.persia[2] > blue.persia[0] + 30 && lum(blue.persia) > lum(blue.sea) + 65, `Persia's blue stands out from the Persian Gulf (${blue.persia?.slice(0, 3)} against ${blue.sea?.slice(0, 3)})`);
  await page.evaluate(() => window.atlas.time.stories.wars.exit());
  check(!errors.length, `no page errors in v0.24.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 21. More map games (v0.25.0). The Map games panel (today's puzzles and the games: twelve since v0.29.0); Pin it (a real tap,
// then pins on the spot: five rounds, the Sharpshooter badge; hard mode hides the seas' names); Higher or lower (the
// fact's map shown, the run ending at a miss); Grand tour (a tap on a city, the best order for three stars, land and
// history tours); Name them all (Spanish names typed in the English app, capitals without accents); Border chain (a
// tap on a neighbour, refusals); Outline (the shape drawn, a wrong guess showing a neighbour); the daily puzzles the
// same in a second browser and kept in the panel; the map put back, a quiz closing a game and a game closing a
// quiz; and "Which country in between?" in the quiz.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const boot = async (p, hash) => {
    await p.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await p.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await p.waitForFunction(() => window.atlas?.play && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await p.waitForTimeout(800);
  };
  await boot(page, '#p=globe&l=political&c=10,30,1.2&lang=en');
  const info = (g) => page.evaluate((x) => window.atlas.play[x].info, g);
  const tapAt = async (lon, lat) => { const p = await page.evaluate(([a, b]) => window.atlas.app.renderer.view.project(a, b), [lon, lat]); if (p) await page.touchscreen.tap(p[0], p[1]); await page.waitForTimeout(400); return !!p; };
  const mapState = () => page.evaluate(() => ({ names: window.atlas.app.renderer.settings.labels.countries, seas: window.atlas.app.renderer.settings.labels.seas, layers: window.atlas.app.layers.map((l) => l.def.id).join(), game: document.documentElement.classList.contains('has-game'), card: !document.querySelector('.play-card')?.hidden }));

  // The panel.
  await page.evaluate(() => window.atlas.play.openMenu());
  await page.waitForSelector('[data-daily]', { timeout: 15000 }).catch(() => {});
  const panel = await page.evaluate(() => ({ daily: [...document.querySelectorAll('[data-daily]')].map((b) => b.dataset.daily), games: [...document.querySelectorAll('[data-game-open]')].map((b) => b.dataset.gameOpen), head: [...document.querySelectorAll('.sheet .sec-title')].map((x) => x.textContent).join(' | ') }));
  check(panel.daily.length === 12 && panel.games.join() === 'hop,pin,hilo,tour,names,chain,outline,museum,climate,explorer,sunrise,lives' && /Today · 0\/12/.test(panel.head), `Map games: ${panel.head}; ${panel.games.join(', ')}`);

  // Pin it: its own panel, then a real tap and four pins on the spot.
  await page.click('[data-game-open="pin"]');
  await page.waitForSelector('[data-play="start"]', { timeout: 5000 }).catch(() => {});
  const pinPanel = await page.evaluate(() => ({ packs: document.querySelectorAll('.sheet .chip-row [data-v]').length, back: !!document.querySelector('[data-play="back"]') }));
  await page.click('.sheet .chip-row [data-v="capitals"]');
  await page.click('[data-play="start"]');
  await page.waitForFunction(() => !!window.atlas.play.pin.info, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const pinMap = await mapState();
  const p0 = await info('pin');
  // A player turns the globe to the place first (Pin it doesn't): it may be on the far side after the earlier sections.
  await page.evaluate(([a, b]) => { const r = window.atlas.app.renderer; r.view.flyTo({ lon: a, lat: b }, 0); r.requestRender(); }, [p0.place[2], p0.place[3]]);
  await page.waitForTimeout(600);
  await tapAt(p0.place[2], p0.place[3]);
  const tapped = await info('pin');
  await page.click('[data-game="confirm"]').catch(() => {});
  await page.waitForTimeout(600);
  const r1 = await info('pin');
  const pinCard = await page.evaluate(() => document.querySelector('.play-card')?.innerText ?? '');
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => window.atlas.play.pin.next());
    await page.evaluate(() => { const g = window.atlas.play.pin, p = g.info.place; g.tap([p[2], p[3]]); g.confirm(); });
  }
  await page.evaluate(() => window.atlas.play.pin.next());
  const pd = await info('pin');
  check(pinPanel.packs === 11 && pinPanel.back && !pinMap.names && pinMap.game && pinMap.card && tapped.pin && r1.results?.[0]?.km < 400 && /\d+ km/.test(pinCard) && pd.done && pd.done.score > 20000 && pd.done.stars === 3 && pd.done.badges.includes('play-sharp'),
    `Pin it: ${pinPanel.packs} packs; names hidden; a tap on ${p0.place[0]} lands ${Math.round(r1.results?.[0]?.km)} km off; five rounds ${pd.done?.score} ${'★'.repeat(pd.done?.stars ?? 0)}; badges ${pd.done?.badges.join(', ')}`);
  await page.evaluate(() => window.atlas.play.pin.start({ pack: 'heritage', hard: true }));
  await page.waitForTimeout(600);
  const hard = await mapState();
  check(hard.seas === false && hard.names === false && (await info('pin')).pack === 'heritage', 'Pin it hard mode: no names at all, not even the seas');

  // Higher or lower: the fact's map comes out with the answer; a miss ends the run.
  await page.evaluate(() => window.atlas.play.hilo.start());
  await page.waitForTimeout(800);
  const h0 = await info('hilo');
  const rightOf = (q) => (q.va >= q.vb ? q.a : q.b), wrongOf = (q) => (q.va >= q.vb ? q.b : q.a);
  await page.click(`[data-hilo="${rightOf(h0.q)}"]`).catch(() => {});
  await page.waitForTimeout(1500);
  const h1 = await info('hilo');
  const hiloMap = await mapState();
  const hiloVal = await page.evaluate(() => document.querySelectorAll('.play-card .hilo-val').length);
  await page.evaluate(() => window.atlas.play.hilo.next());
  await page.waitForTimeout(400);
  const h2 = await info('hilo');
  await page.evaluate((id) => window.atlas.play.hilo.answer(id), wrongOf(h2.q));
  await page.evaluate(() => window.atlas.play.hilo.next());
  await page.waitForTimeout(400);
  const hd = await info('hilo');
  check(h1.ok && h1.run === 1 && hiloMap.layers.includes(`fact-${h0.q.fact}`) && hiloVal === 2 && hd.done && hd.done.run === 1 && hd.done.score > 0,
    `Higher or lower: ${h0.q.fact} of ${h0.q.a} and ${h0.q.b}, right (its map shown, both values); a miss ends the run at ${hd.done?.run} with ${hd.done?.score} points`);

  // Grand tour: a tap on a city; the best order gets three stars. (A fixed day that is not today: the same stops twice,
  // without playing today's puzzle. That day's tour is by land: once, a second start picked other cities.)
  await page.evaluate(() => window.atlas.play.tour.start({ mode: 'air', day: '2030-01-01' }));
  await page.waitForTimeout(2500);
  const t0 = await info('tour');
  const city = await page.evaluate(() => { const s = window.atlas.play.tour['st']; return s.stops[1].at; });
  await tapAt(city[0], city[1]);
  const t1 = await info('tour');
  for (let i = 2; i < 6; i++) await page.evaluate((x) => window.atlas.play.tour.visit(x), i);
  const td = await info('tour');
  await page.evaluate(() => window.atlas.play.tour.start({ mode: 'air', day: '2030-01-01' }));
  await page.waitForTimeout(800);
  const t2 = await info('tour');
  for (const i of td.done.best.slice(1)) await page.evaluate((x) => window.atlas.play.tour.visit(x), i);
  const tp = await info('tour');
  check(t0.stops.length === 6 && t1.order.join() === '0,1' && td.done && td.done.score <= 1000 && JSON.stringify(t2.stops) === JSON.stringify(t0.stops) && tp.done?.score === 1000 && tp.done.stars === 3 && tp.done.badges.includes('play-tour'),
    `Grand tour (${t0.mode}, the same cities twice): ${t0.stops.join(', ')}; a tap visits ${t0.stops[1]}; in order ${td.done?.score}, in the best order ${tp.done?.score} ${'★'.repeat(tp.done?.stars ?? 0)}`);
  await page.evaluate(() => window.atlas.play.tour.start({ mode: 'land' }));
  await page.waitForTimeout(1500);
  const tl = await info('tour');
  await page.evaluate(() => window.atlas.play.tour.start({ mode: 'history' }));
  await page.waitForTimeout(2500);
  const th = await info('tour');
  const thText = await page.evaluate(() => document.querySelector('.play-card')?.innerText ?? '');
  await page.evaluate(() => window.atlas.play.tour.giveUp());
  const tg = await info('tour');
  check(tl?.mode === 'land' && tl.stops.length === 6 && th?.mode === 'history' && th.stops.length === 6 && tg.done?.gaveUp, `Grand tour by land (${tl?.stops.slice(0, 3).join(', ')}…) and a historical journey (${thText.split('\n')[0].slice(0, 60)}); giving up shows the best order`);

  // Name them all: South America, Spanish names count in the English app; capitals without accents.
  await page.evaluate(() => window.atlas.play.names.start({ list: 'countries', area: 'SA' }));
  await page.waitForTimeout(800);
  const n0 = await info('names');
  await page.fill('.play-card .names-input', 'Brasil');
  await page.waitForTimeout(200);
  const n1 = await info('names');
  const typed = await page.evaluate((ids) => { const g = window.atlas.play.names; for (const id of ids) g.try(window.atlas.app.data.name(id, 'en')); return g.info; }, n0.ids);
  const nd = typed;
  await page.evaluate(() => window.atlas.play.names.start({ list: 'capitals', area: 'SA' }));
  await page.waitForTimeout(500);
  const caps = await page.evaluate(() => { const g = window.atlas.play.names; return ['Bogota', 'asuncion', 'BRASÍLIA', 'Paris'].map((x) => g.try(x)); });
  check(n0.ids.length >= 12 && n1.found.includes('BRA') && nd.done && nd.done.stars === 3 && nd.done.badges.includes('play-names') && caps.join() === 'true,true,true,false',
    `Name them all: ${n0.ids.length} South American countries ("Brasil" counts), all named ${nd.done?.score} ★★★; capitals typed without accents (Bogota, asuncion, BRASÍLIA; not Paris)`);

  // Border chain: a tap on a neighbour, then refusals.
  await page.evaluate(() => window.atlas.play.chain.start({ day: '2030-01-01' }));
  await page.waitForTimeout(2000);
  const c0 = await page.evaluate(() => window.atlas.play.chain.info);
  const nb = await page.evaluate(async (first) => { const d = await window.atlas.play.hop.borders(); const n = d.land.filter((x) => x[0] === first || x[1] === first).map((x) => (x[0] === first ? x[1] : x[0])); const all = Object.keys(d.countries); return { n, far: all.find((x) => !n.includes(x) && x !== first && window.atlas.app.data.meta[x]) }; }, c0.chain[0]);
  const target = await page.evaluate((ids) => { const m = window.atlas.app.data.meta; return ids.map((id) => [id, m[id]?.area ?? 0]).sort((a, b) => b[1] - a[1])[0][0]; }, nb.n);
  const tm = await page.evaluate((id) => { const m = window.atlas.app.data.meta[id]; return [m.lx, m.ly]; }, target);
  await tapAt(tm[0], tm[1]);
  const c1 = await page.evaluate(() => window.atlas.play.chain.info);
  await page.evaluate((id) => window.atlas.play.chain.add(id), nb.far);
  const refuse1 = await page.evaluate(() => document.querySelector('.play-card .quiz-fb')?.textContent ?? '');
  await page.evaluate((id) => window.atlas.play.chain.add(id), c0.chain[0]);
  const refuse2 = await page.evaluate(() => document.querySelector('.play-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.play.chain.finish('stop'));
  const cd = await page.evaluate(() => window.atlas.play.chain.info);
  check(c1.chain.length === 2 && c1.chain[1] === target && /does not border/.test(refuse1) && /already in the chain/.test(refuse2) && cd.done && cd.done.score >= 100,
    `Border chain from ${c0.chain[0]}: a tap on ${target} adds it; "${refuse1}"; "${refuse2}"; stopped at ${cd.done?.score} points`);

  // Outline: the shape drawn alone; a wrong guess shows a neighbour or a clue; then right at the second try.
  await page.evaluate(() => window.atlas.play.outline.start());
  await page.waitForTimeout(1000);
  const o0 = await info('outline');
  const ink = await page.evaluate(() => { const c = document.querySelector('.play-card .outline-canvas'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (c.width * c.height); });
  const wrong = await page.evaluate((id) => (id === 'FRA' ? 'Germany' : 'France'), o0.ids[0]);
  await page.fill('.play-card .names-input', wrong);
  await page.press('.play-card .names-input', 'Enter');
  await page.waitForTimeout(300);
  const o1 = await info('outline');
  const miss = await page.evaluate(() => document.querySelector('.play-card')?.innerText ?? '');
  await page.evaluate((id) => window.atlas.play.outline.guess(window.atlas.app.data.name(id, 'en')), o0.ids[0]);
  const o2 = await info('outline');
  check(o0.ids.length === 5 && ink > 0.02 && o1.tries === 1 && (o1.shown.length === 1 || /It is in|begins with/.test(miss)) && /Not /.test(miss) && o2.results[0]?.pts === 700,
    `Outline: ${o0.ids.join(', ')}; the shape covers ${(ink * 100).toFixed(0)} % of its box; "${wrong}" is wrong (${o1.shown.length ? `${o1.shown[0]} shown around it` : 'a clue'}), right at the second try: ${o2.results[0]?.pts}`);

  // A quiz closes a game, a game closes a quiz, and the map comes back.
  await page.evaluate(() => window.atlas.learn['startQuiz']('flag', 'world'));
  await page.waitForTimeout(800);
  const q1 = await page.evaluate(() => ({ outline: !!window.atlas.play.outline.info, quiz: !!window.atlas.learn.quiz }));
  await page.evaluate(() => window.atlas.play.chain.start());
  await page.waitForTimeout(800);
  const q2 = await page.evaluate(() => ({ chain: !!window.atlas.play.chain.info, quiz: !!window.atlas.learn.quiz }));
  await page.evaluate(() => window.atlas.play.host.close());
  await page.waitForTimeout(1000);
  const back = await mapState();
  check(!q1.outline && q1.quiz && q2.chain && !q2.quiz && back.names && back.seas !== false && back.layers === 'political' && !back.game && !back.card, `a quiz closes a game and a game closes a quiz; afterwards the names and filters are back (${back.layers})`);

  // Today's puzzles: the same in a second browser, and kept in the panel once played.
  const firstOf = async (p) => {
    await p.evaluate(() => window.atlas.play.daily('pin'));
    await p.waitForFunction(() => !!window.atlas.play.pin.info, null, { timeout: 15000 });
    const pin = await p.evaluate(() => window.atlas.play.pin.info.place[0]);
    await p.evaluate(() => window.atlas.play.daily('hilo'));
    await p.waitForFunction(() => !!window.atlas.play.hilo.info, null, { timeout: 15000 });
    const hilo = await p.evaluate(() => { const q = window.atlas.play.hilo.info.q; return `${q.fact}:${q.a}-${q.b}`; });
    await p.evaluate(() => window.atlas.play.daily('outline'));
    await p.waitForFunction(() => !!window.atlas.play.outline.info, null, { timeout: 15000 });
    const outline = await p.evaluate(() => window.atlas.play.outline.info.ids.join());
    await p.evaluate(() => window.atlas.play.host.close());
    return { pin, hilo, outline };
  };
  const day1 = await firstOf(page);
  const other = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const op = await other.newPage();
  await boot(op, '#p=globe&l=political&c=10,30,1.2&lang=en');
  const day2 = await firstOf(op);
  await other.close();
  await page.evaluate(() => window.atlas.play.daily('chain'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.atlas.play.chain.finish('stop'));
  await page.evaluate(() => window.atlas.play.host.close());
  await page.evaluate(() => window.atlas.play.openMenu());
  await page.waitForTimeout(600);
  const kept = await page.evaluate(() => ({ chain: document.querySelector('[data-daily="chain"]')?.className ?? '', text: document.querySelector('[data-daily="chain"]')?.textContent ?? '', head: [...document.querySelectorAll('.sheet .sec-title')][0]?.textContent ?? '', p: JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').play }));
  check(JSON.stringify(day1) === JSON.stringify(day2) && /done/.test(kept.chain) && /Done: \d+/.test(kept.text) && /Today · 1\/12/.test(kept.head) && kept.p.games.pin >= 1 && kept.p.games.chain >= 2,
    `today's puzzles are the same in a second browser (pin ${day1.pin}; ${day1.hilo}; outlines ${day1.outline}); the daily chain is kept: "${kept.text.slice(0, 50)}", ${kept.head}`);

  // The panel and the progress in Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.evaluate(() => window.atlas.play.openMenu());
  await page.waitForTimeout(500);
  const esPanel = await page.evaluate(() => ({ title: document.querySelector('.sheet .sheet-title, .sheet h2')?.textContent ?? '', games: [...document.querySelectorAll('[data-game-open] .mode-title')].map((x) => x.textContent) }));
  check(/Juegos en el mapa/.test(esPanel.title) && esPanel.games.join() === 'Salto de fronteras,Pon el pin,Más o menos,Gran vuelta,Nómbralos todos,Cadena de fronteras,Silueta,De museo en museo,Detective del clima,Bitácora del explorador,Carrera del amanecer,¿De quién es esta vida?', `en español: ${esPanel.games.join(', ')}`);
  await page.evaluate(() => window.atlas.app.setLang('en'));
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Which country in between? in the quiz: two countries filled on the map, four choices, the way across.
  await page.evaluate(() => window.atlas.learn['startQuiz']('hop', 'SA'));
  await page.waitForFunction(() => window.atlas.learn.quiz?.kind === 'hop', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const hq = await page.evaluate(() => { const q = window.atlas.learn.quiz, cur = q.qs[q.i], m = window.atlas.app.data.meta; return { n: q.qs.length, cur, sa: m[cur.hop.a].ct === 'SA' || m[cur.hop.b].ct === 'SA', text: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', opts: document.querySelectorAll('.learn-card .quiz-opt').length, names: window.atlas.app.renderer.settings.labels.countries }; });
  const hb = await page.evaluate(async (cur) => { const d = await window.atlas.play.hop.borders(); const nb = (x) => d.land.filter((e) => e[0] === x || e[1] === x).map((e) => (e[0] === x ? e[1] : e[0])); return { a: nb(cur.hop.a).includes(cur.id), b: nb(cur.hop.b).includes(cur.id), touch: nb(cur.hop.a).includes(cur.hop.b), wrongBoth: cur.options.filter((o) => o !== cur.id && nb(cur.hop.a).includes(o) && nb(cur.hop.b).includes(o)).length }; }, hq.cur);
  // Green pixels around the first country's centre (its name is drawn on the centre itself).
  const fill = await page.evaluate((cur) => {
    const ren = window.atlas.app.renderer, g = document.getElementById('fg').getContext('2d'), m = window.atlas.app.data.meta[cur.hop.a];
    const p = ren.view.project(m.lx, m.ly);
    if (!p) return 0;
    const r = Math.round(30 * ren.view.dpr), d = g.getImageData(Math.round(p[0] * ren.view.dpr) - r, Math.round(p[1] * ren.view.dpr) - r, 2 * r, 2 * r).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 60 && d[i + 1] > d[i + 2] + 30) n++;
    return n / (d.length / 4);
  }, hq.cur);
  await page.evaluate(() => { const q = window.atlas.learn.quiz, cur = q.qs[q.i]; const b = [...document.querySelectorAll('.learn-card .quiz-opt')]; b[cur.options.indexOf(cur.id)].click(); });
  await page.waitForTimeout(500);
  const hfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  check(hq.n === 10 && hq.sa && /^Which country do you cross from .+ to .+\?$/.test(hq.text) && hq.opts === 4 && !hq.names && hb.a && hb.b && !hb.touch && hb.wrongBoth === 0 && fill > 0.05 && /^Correct! .+ → .+ → .+/.test(hfb),
    `Which country in between? (South America first): "${hq.text}" (four choices, names hidden, the first country in green: ${(fill * 100).toFixed(0)} % of the pixels around it); "${hfb}"`);

  check(!errors.length, `no page errors in v0.25.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 22. Travel guide (v0.26.0). The panel and its search (Cusco found by its other name); a trip built with +; a city's
// guide, tab by tab: what to eat (a dish opens its story; Wikivoyage's Eat section, from a recorded answer since this
// machine cannot reach it), what to see (the city's tour, a World Heritage site shown with a pin), museums (the Prado),
// the practical facts and the weather by month, History here, Read more; the best order; the trip drawn on the map;
// the share link and a city link (#guide=) in a new browser; the printable page; Plan a trip on a country's card;
// the Want to go list; Spanish; and a city's guide again offline, from the service worker's cache.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  // Wikivoyage, as recorded: a section list with Eat, and its text (prose, then a listing the guide leaves out).
  await ctx.route(/wikivoyage\.org\/w\/api\.php/, (route) => {
    const u = new URL(route.request().url());
    const body = u.searchParams.get('prop') === 'sections'
      ? { parse: { sections: [{ line: 'Understand', index: '1', anchor: 'Understand' }, { line: 'Eat', index: '5', anchor: 'Eat' }] } }
      : { parse: { text: { '*': '<div class="mw-parser-output"><p>Lima is famous for its food, and ceviche is the dish every visitor should try, with fish fresh from the Pacific.</p><ul><li><b>A restaurant</b> listing the guide does not show</li></ul></div>' } } };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const boot = async (p, hash) => {
    await p.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await p.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await p.waitForFunction(() => window.atlas?.guide && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await p.waitForTimeout(800);
  };
  await boot(page, '#p=globe&l=political&c=-70,-10,1.3&lang=en');
  const g = () => page.evaluate(() => window.atlas.guide.info);
  const tabText = () => page.evaluate(() => document.querySelector('.guide-tab')?.innerText ?? '');
  const openCity = async (id, tab, wait = 900) => { await page.evaluate(([i, t]) => window.atlas.guide.openCity(i, t), [id, tab]); await page.waitForTimeout(wait); };

  // The panel, its search, and a trip built with +.
  await page.evaluate(() => window.atlas.guide.open());
  await page.waitForSelector('.guide-search', { timeout: 10000 }).catch(() => {});
  await page.fill('.guide-search', 'cusco');
  await page.waitForTimeout(300);
  const found = await page.evaluate(() => [...document.querySelectorAll('.guide-results [data-guide-city]')].map((x) => x.dataset.guideCity));
  await page.click('.guide-results [data-add="cuzco"]');
  await page.fill('.guide-search', 'lima');
  await page.waitForTimeout(300);
  await page.click('.guide-results [data-add="lima"]');
  await page.waitForTimeout(300);
  const t1 = await g();
  const legs = await page.evaluate(() => [...document.querySelectorAll('.guide-leg')].map((x) => x.textContent));
  check(found[0] === 'cuzco' && t1.trip.join() === 'cuzco,lima' && /^✈️ 5\d\d km · about 1 h/.test(legs[0] ?? ''), `the guide: "cusco" finds Cuzco; a trip of ${t1.trip.join(' → ')}, ${legs[0]}`);

  // Lima: what to eat, a dish's story, Wikivoyage's overview.
  await openCity('lima', 'eat', 2500);
  const eat = await page.evaluate(() => ({ tabs: document.querySelectorAll('.guide-tabs [data-tab]').length, dishes: [...document.querySelectorAll('[data-dish]')].map((x) => x.dataset.dish), text: document.querySelector('.guide-tab')?.innerText ?? '', wv: document.querySelector('[data-wv="eat"]')?.innerText ?? '' }));
  check(eat.tabs === 9 && eat.dishes.some((d) => /ceviche/.test(d)) && /national dish: Ceviche/.test(eat.text) && /From Wikivoyage/.test(eat.wv) && /ceviche is the dish every visitor/.test(eat.wv) && !/A restaurant/.test(eat.wv) && /CC BY-SA/.test(eat.wv),
    `Lima, what to eat: ${eat.dishes.length} dishes (${eat.dishes.slice(0, 3).join(', ')}…), the national dish, and Wikivoyage's overview without its listings, credited`);
  await page.click('[data-dish="pisco-sour"], [data-dish]');
  await page.waitForFunction(() => !!window.atlas.app.mode, null, { timeout: 15000 }).catch(() => {});
  const story = await page.evaluate(() => ({ mode: window.atlas.app.mode, sheet: document.querySelector('.sheet:not([hidden])') ? 'open' : 'closed' }));
  check(!!story.mode && story.sheet === 'closed', `a dish opens its story (${story.mode}) and the guide steps aside`);
  await page.evaluate(() => window.atlas.time.modes.find((m) => m.id === window.atlas.app.mode)?.exit());
  await page.waitForTimeout(800);

  // Cuzco: what to see, with the city's tour; a site shown with a pin.
  await openCity('cuzco', 'see');
  const see = await page.evaluate(() => ({ tour: document.querySelector('[data-guide="tour"]')?.textContent ?? '', whs: [...document.querySelectorAll('[data-whs]')].map((x) => x.textContent), text: document.querySelector('.guide-tab')?.innerText ?? '' }));
  await page.click('[data-whs]');
  await page.waitForTimeout(1200);
  const pin = await g();
  check(/Cusco through time/.test(see.tour) && see.whs.some((x) => /City of Cuzco/.test(x)) && see.whs.some((x) => /Machu Picchu/.test(x)) && /Sacsayhuamán/.test(see.text) && pin.pin && /Cuzco/.test(pin.pin.text),
    `Cuzco, what to see: the tour "${see.tour.trim()}", ${see.whs.length} World Heritage sites (Machu Picchu a day trip away), Sacsayhuamán; a tap shows "${pin.pin?.text}" on the map`);

  // Madrid: museums, facts and the weather by month.
  await openCity('madrid', 'museums');
  const mus = await page.evaluate(() => ({ ids: [...document.querySelectorAll('[data-museum]')].map((x) => x.dataset.museum), heads: [...document.querySelectorAll('.guide-tab .sec-title')].map((x) => x.textContent), text: document.querySelector('.guide-tab')?.innerText ?? '' }));
  check(mus.ids.includes('Q160112') && mus.ids.includes('Q460889') && mus.heads.includes('Art') && /visitors a year/.test(mus.text), `Madrid's museums: ${mus.ids.length}, the Prado and the Reina Sofía under ${mus.heads.join(', ')}, with visitors a year`);
  await openCity('madrid', 'facts');
  const facts = await tabText();
  const chart = await page.evaluate(() => ({ months: document.querySelectorAll('.guide-chart .gc-month').length, best: document.querySelectorAll('.guide-chart .gc-best').length }));
  check(/Spanish/.test(facts) && /euro \(EUR\)/i.test(facts) && /type C, F · 230 V · 50 Hz/.test(facts) && /\+34/.test(facts) && /on the right/.test(facts) && /Sunrise and sunset today\s+\d\d:\d\d · \d\d:\d\d/.test(facts) && chart.months === 12 && chart.best >= 3 && /Best months to go: May–June, September–October/.test(facts),
    `Madrid's facts: Spanish, the euro, plugs C and F at 230 V, +34, sunrise and sunset; the weather chart with ${chart.best} best months: "${(/Best months to go: [^.]+/.exec(facts) ?? [''])[0]}"`);
  await openCity('lima', 'history');
  const hist = await page.evaluate(() => [...document.querySelectorAll('[data-history]')].map((x) => x.dataset.history));
  await openCity('lima', 'more');
  const more = await page.evaluate(() => [...document.querySelectorAll('.guide-more a')].map((a) => a.href));
  check(hist.length >= 5 && new Set(hist.map((x) => x.split('/')[0])).size >= 3 && more.some((h) => /en\.wikivoyage\.org\/wiki\/Lima/.test(h)) && more.some((h) => /es\.wikipedia\.org/.test(h)),
    `Lima, History here: ${hist.length} story items from ${new Set(hist.map((x) => x.split('/')[0])).size} collections; Read more: ${more.length} links (Wikivoyage, Wikipedia)`);

  // The best order, the map, the share link and the printable page.
  await page.evaluate(() => { const gd = window.atlas.guide; gd.trip = []; for (const id of ['lima', 'kyoto', 'madrid', 'mexico-city']) gd.add(id); });
  await page.evaluate(() => window.atlas.guide.open());
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => document.querySelector('[data-guide="total"]')?.textContent ?? '');
  await page.click('[data-guide="best"]');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ trip: window.atlas.guide.info.trip, total: document.querySelector('[data-guide="total"]')?.textContent ?? '' }));
  check(after.trip.join() === 'lima,mexico-city,madrid,kyoto' && parseInt(after.total.replace(/\D/g, ''), 10) < parseInt(before.replace(/\D/g, ''), 10), `Best order: ${after.trip.join(' → ')} (${before.trim()} before, ${after.total.trim()} after)`);
  await page.click('[data-guide="map"]');
  await page.waitForTimeout(2500);
  const onMap = await page.evaluate(() => {
    const ren = window.atlas.app.renderer, c = document.getElementById('fg').getContext('2d');
    const p = ren.view.project(-77.04, -12.05);
    if (!p) return null;
    // Orange pixels of Lima's numbered marker (#e8590c) around its centre.
    const r = Math.round(12 * ren.view.dpr), d = c.getImageData(Math.round(p[0] * ren.view.dpr) - r, Math.round(p[1] * ren.view.dpr) - r, 2 * r, 2 * r).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 140 && d[i] > 1.8 * d[i + 1] && d[i + 1] > 35 && d[i + 2] < 60) n++;
    return { orange: n, onMap: window.atlas.guide.info.onMap, sheet: !document.querySelector('.sheet:not([hidden])') };
  });
  check(onMap && onMap.onMap && onMap.sheet && onMap.orange > 40, `the trip on the map: the guide closes and Lima's numbered marker is drawn (${onMap?.orange} orange pixels)`);
  const share = await page.evaluate(() => window.atlas.guide.shareUrl());
  const printed = await page.evaluate(async () => (await window.atlas.guide.printView()).innerText);
  check(/#trip=lima,mexico-city,madrid,kyoto$/.test(share) && /1\. Lima, Peru/.test(printed) && /4\. Kyoto, Japan/.test(printed) && /Best months/.test(printed) && /Museums: .*Prado/.test(printed), `the share link (${share.split('#')[1]}) and the printable page (${printed.split('\n').length} lines, a section a city)`);
  const other = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await other.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  // A link opened in a new page loads once (the app then writes its own state to the address).
  const fresh = async (hash) => {
    const p = await other.newPage();
    await p.goto(url + hash, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await p.waitForFunction(() => window.atlas?.guide && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    return p;
  };
  const op = await fresh(`#${share.split('#')[1]}`);
  await op.waitForFunction(() => window.atlas.guide.info.trip.length === 4 && !!document.querySelector('.guide-trip'), null, { timeout: 10000 }).catch(() => {});
  const shared = await op.evaluate(() => ({ trip: window.atlas.guide.info.trip, saved: JSON.parse(localStorage.getItem('atlas-globe:trip') || '[]'), panel: !!document.querySelector('.guide-trip') }));
  const op2 = await fresh('#guide=kyoto');
  await op2.waitForFunction(() => window.atlas.guide.info.city === 'kyoto' && !!document.querySelector('.guide-title'), null, { timeout: 10000 }).catch(() => {});
  const cityLink = await op2.evaluate(() => document.querySelector('.guide-title')?.textContent ?? '');
  await other.close();
  check(shared.trip.join() === 'lima,mexico-city,madrid,kyoto' && shared.saved.length === 4 && shared.panel && cityLink === 'Kyoto', `the shared link opens the same trip in another browser (kept there); #guide=kyoto opens ${cityLink}'s guide`);

  // Plan a trip on a country's card; the Want to go list; a tap on a city's dot.
  await page.evaluate(() => window.atlas.app.select('PER'));
  await page.waitForSelector('[data-guide="plan"]', { timeout: 5000 }).catch(() => {});
  await page.click('[data-guide="plan"]');
  await page.waitForTimeout(800);
  const plan = await page.evaluate(() => ({ q: document.querySelector('.guide-search')?.value, res: [...document.querySelectorAll('.guide-results [data-guide-city]')].map((x) => x.dataset.guideCity) }));
  await page.evaluate(() => { localStorage.setItem('atlas-globe:personal', JSON.stringify({ visited: [], wish: ['JPN', 'ITA'], notes: {} })); window.atlas.guide.trip = []; });
  await page.evaluate(() => window.atlas.guide.open());
  await page.waitForTimeout(400);
  await page.click('[data-guide="wish"]');
  await page.waitForTimeout(400);
  const wish = await g();
  const tapped = await page.evaluate(() => { const gd = window.atlas.guide, ren = window.atlas.app.renderer; ren.view.flyTo({ lon: 12.5, lat: 41.9, zoom: 5 }, 0); ren.requestRender(); const p = ren.view.project(12.496, 41.903); return p ? gd['tap'](p[0], p[1]) : null; });
  await page.waitForTimeout(800);
  const afterTap = await g();
  check(plan.q === 'Peru' && plan.res.includes('lima') && plan.res.includes('cuzco') && wish.trip.includes('tokyo') && wish.trip.includes('rome') && tapped && afterTap.city === 'rome',
    `Plan a trip on Peru's card searches its cities (${plan.res.slice(0, 4).join(', ')}…); the Want to go list adds ${wish.trip.join(' and ')}; a tap on Rome's dot opens its guide`);

  // Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await openCity('lima', 'facts');
  const esText = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('.guide-tabs [data-tab]')].map((x) => x.textContent.replace(/^\S+\s/, '')).join(', '), facts: document.querySelector('.guide-tab')?.innerText ?? '' }));
  check(/Comer, Ver, Museos, Arte, Edificios, Personas, Datos, Historia aquí, Más/.test(esText.tabs) && /Idiomas\s+Español, Quechua, Aimara/i.test(esText.facts) && /sol peruano/i.test(esText.facts) && /Mejores meses para ir/.test(esText.facts), `en español: ${esText.tabs}; "${(/Idiomas[^\n]*\n?[^\n]*/.exec(esText.facts) ?? [''])[0].replace(/\s+/g, ' ')}"`);
  await page.evaluate(() => window.atlas.app.setLang('en'));

  // Offline: a city's guide comes from the service worker's cache once it has been opened.
  await page.evaluate(async () => { await navigator.serviceWorker?.ready; });
  await boot(page, '#p=globe&l=political&c=0,30,1.2&lang=en');
  const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  await openCity('kyoto', 'see', 1500);
  const cached = await page.evaluate(async () => (await (await caches.open('atlas-data')).keys()).some((r) => /guide\/c\/kyoto\.json/.test(r.url)));
  await ctx.setOffline(true);
  await page.evaluate(() => { window.atlas.guide['guides'].delete('kyoto'); });
  await openCity('kyoto', 'museums', 1500);
  const off = await tabText();
  await ctx.setOffline(false);
  check(controlled && cached && /Kyoto National Museum|museum/i.test(off) && !/could not be loaded/.test(off), `offline, Kyoto's guide opens again from the device (${off.split('\n').filter(Boolean).length} lines)`);

  check(!errors.length, `no page errors in v0.26.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 23. Art and architecture (v0.27.0). The panel (the three map filters, artists and architects, search); Velázquez's
// trail (the Prado among his museums, drawn on the map, Plan a trip into the travel guide); Gaudí's buildings and a
// building's card; Madrid's Art tab, filtered to Velázquez's paintings of 1600–1800 (Las Meninas), with a work's card
// and its picture's licence (from a recorded Commons answer); Barcelona's Buildings tab by style; the three filters,
// with a tap on the Louvre; Now in on the Mona Lisa's story card, opening Paris's art guide; "Which museum is it
// in?"; Pin it's masterpieces; and Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  // Commons, as recorded: a file's licence and author; pictures as a small grey square.
  await ctx.route(/commons\.wikimedia\.org\/w\/api\.php/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ query: { pages: { 1: { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: '<a href="#">Diego Velázquez</a>' } } }] } } } }) }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await ctx.route(/Special:FilePath|upload\.wikimedia\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=0,40,1.3&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.art && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const cardText = () => page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');

  // The panel.
  await page.evaluate(() => window.atlas.art.open());
  await page.waitForSelector('[data-artist]', { timeout: 15000 }).catch(() => {});
  const panel = await page.evaluate(() => ({ filters: [...document.querySelectorAll('[data-art-filter]')].map((b) => b.dataset.artFilter), artists: document.querySelectorAll('[data-artist]').length, architects: document.querySelectorAll('[data-architect]').length, text: document.querySelector('.art-menu')?.innerText ?? '' }));
  await page.fill('.art-menu .guide-search', 'gaud');
  await page.waitForTimeout(300);
  const found = await page.evaluate(() => [...document.querySelectorAll('[data-architect] .guide-item-title')].map((b) => b.textContent));
  check(panel.filters.join() === 'art-museums,masterpieces,architecture' && panel.artists >= 20 && panel.architects >= 15 && /\d+ best-known works in \d+ museums/.test(panel.text) && found[0] === 'Antoni Gaudí',
    `Art and architecture: three filters, ${panel.artists} artists and ${panel.architects} architects; "gaud" finds ${found[0]}`);

  // Velázquez's trail: on the map, then into the travel guide.
  const velazquez = await page.evaluate(async () => { const r = await fetch('data/artguide/collections.json').then((x) => x.json()); return r.artists.find((a) => a[1] === 'Diego Velázquez')[0]; });
  await page.evaluate((id) => window.atlas.art.openArtist(id), velazquez);
  await page.waitForTimeout(800);
  const trail = await page.evaluate(() => ({ museums: [...document.querySelectorAll('[data-trail-museum]')].map((b) => b.dataset.trailMuseum), works: document.querySelectorAll('.art-trail [data-work]').length }));
  await page.click('[data-art="map"]');
  await page.waitForTimeout(2500);
  const drawn = await page.evaluate(() => {
    const ren = window.atlas.app.renderer, c = document.getElementById('fg').getContext('2d');
    const p = ren.view.project(-3.692, 40.414);
    if (!p) return -1;
    const r = Math.round(12 * ren.view.dpr), d = c.getImageData(Math.round(p[0] * ren.view.dpr) - r, Math.round(p[1] * ren.view.dpr) - r, 2 * r, 2 * r).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 180 && d[i] > 90 && d[i] < 160 && d[i + 1] < 120) n++;
    return n;
  });
  await page.evaluate((id) => window.atlas.art.openArtist(id), velazquez);
  await page.waitForTimeout(600);
  await page.click('[data-art="plan"]');
  await page.waitForTimeout(800);
  const planned = await page.evaluate(() => ({ trip: window.atlas.guide.info.trip, panel: !!document.querySelector('.guide-trip') }));
  check(trail.museums.includes('Q160112') && trail.works >= 10 && drawn > 30 && planned.trip.includes('madrid') && planned.trip.length >= 5 && planned.panel,
    `Velázquez's trail: ${trail.works} works in ${trail.museums.length} museums, the Prado among them, drawn on the map (${drawn} purple pixels at the Prado); Plan a trip makes a trip of ${planned.trip.length} cities (${planned.trip.slice(0, 4).join(', ')}…)`);

  // Gaudí's buildings, and a building's card.
  const gaudi = await page.evaluate(async () => { const r = await fetch('data/artguide/architecture.json').then((x) => x.json()); return r.architects.find((a) => a[1] === 'Antoni Gaudí')[0]; });
  await page.evaluate((id) => window.atlas.art.openArchitect(id), gaudi);
  await page.waitForTimeout(800);
  const gb = await page.evaluate(() => [...document.querySelectorAll('.art-trail [data-building] .guide-item-title')].map((b) => b.textContent));
  await page.click('.art-trail [data-building="Q48435"]');
  await page.waitForTimeout(1200);
  const sagrada = await cardText();
  check(gb.length >= 8 && gb.some((x) => /Casa Milà/.test(x)) && /Architect\s+Antoni Gaudí/.test(sagrada) && /Style\s+Art Nouveau/.test(sagrada) && /City\s+Barcelona/.test(sagrada),
    `Gaudí's trail: ${gb.length} buildings (${gb.slice(0, 3).join(', ')}…); the Sagrada Família's card names him, Art Nouveau and Barcelona`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // Madrid's Art tab, filtered; a work's card with its picture's licence.
  await page.evaluate(() => window.atlas.guide.openCity('madrid', 'art'));
  await page.waitForSelector('.guide-tab [data-work]', { timeout: 15000 }).catch(() => {});
  const all = await page.evaluate(() => ({ text: document.querySelector('.guide-tab')?.innerText ?? '', works: document.querySelectorAll('.guide-tab [data-work]').length, museums: [...document.querySelectorAll('[data-art-museum]')].map((b) => b.dataset.artMuseum) }));
  await page.click('.guide-tab [data-kind="painting"]');
  await page.waitForTimeout(400);
  await page.click('.guide-tab [data-period="baroque"]');
  await page.waitForTimeout(400);
  await page.selectOption('.guide-tab .art-artist-select', velazquez);
  await page.waitForTimeout(500);
  const filtered = await page.evaluate(() => [...document.querySelectorAll('.guide-tab [data-work] .guide-item-title')].map((b) => b.textContent));
  await page.click('.guide-tab [data-work="Q208758"]');
  await page.waitForTimeout(1500);
  const meninas = await page.evaluate(() => ({ text: document.querySelector('.country-card:not([hidden])')?.innerText ?? '', credit: document.querySelector('.country-card .art-credit')?.textContent ?? '', pin: window.atlas.guide.info.pin }));
  check(/In Madrid you can see \d+ of the world’s best-known works, in \d+ museums/.test(all.text) && all.museums.includes('Q160112') && filtered.includes('Las Meninas') && filtered.length >= 3 && filtered.length < all.works
    && /By\s+Diego Velázquez/.test(meninas.text) && /Now in\s+Museo del Prado, Madrid/.test(meninas.text) && /Public domain · Diego Velázquez · Wikimedia Commons/.test(meninas.credit) && /Prado/.test(meninas.pin?.text ?? ''),
    `Madrid's Art tab: ${all.works} works in ${all.museums.length} museums; Velázquez's paintings of 1600–1800: ${filtered.length} (${filtered.slice(0, 3).join(', ')}…); Las Meninas' card with "${meninas.credit}"`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // Barcelona's buildings by style.
  await page.evaluate(() => window.atlas.guide.openCity('barcelona', 'buildings'));
  await page.waitForSelector('.guide-tab [data-building]', { timeout: 15000 }).catch(() => {});
  const bAll = await page.evaluate(() => document.querySelectorAll('.guide-tab [data-building]').length);
  await page.click('.guide-tab [data-style="nouveau"]');
  await page.waitForTimeout(400);
  const bNouveau = await page.evaluate(() => [...document.querySelectorAll('.guide-tab [data-building]')].map((b) => b.innerText.replace(/\s+/g, ' ')));
  check(bAll >= 20 && bNouveau.length >= 5 && bNouveau.length < bAll && bNouveau.every((x) => /Art Nouveau/.test(x)) && bNouveau.some((x) => /Holy Family/.test(x)), `Barcelona's Buildings tab: ${bAll} buildings, ${bNouveau.length} Art Nouveau (the Sagrada Família among them)`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // The three filters; a tap on the Louvre.
  const legend = async (id, opts) => {
    await page.evaluate(([i, o]) => { const a = window.atlas.app; return a.activate(i).then(() => { if (o) { const inst = a.instance(i); Object.assign(inst.options, o); inst.def.onOptionsChanged?.(inst); a.emit('legend'); } }); }, [id, opts]);
    await page.waitForTimeout(1200);
    // The legend's title and items (the phone's legend starts folded).
    return page.evaluate((i) => { const inst = window.atlas.app.instance(i); const l = inst?.def.legend?.(inst); return l ? [l.title, ...(l.items ?? []).map((x) => x.label)].join('\n') : ''; }, id);
  };
  const lm = await legend('art-museums');
  await page.evaluate(() => window.atlas.app.renderer.view.flyTo({ lon: 2.336, lat: 48.861, zoom: 30 }, 0));
  await page.waitForTimeout(1500);
  // Close up, Paris's museums move apart (each with a line to its place): the tap is on the Louvre's dot as drawn.
  const lp = await page.evaluate(() => { const p = window.atlas.app.instance('art-museums').state.crowd?.placed.find((x) => /^Louvre/.test(x.it.name[0])); return p ? [p.x, p.y] : window.atlas.app.renderer.view.project(2.3376, 48.8611); });
  if (lp) await page.touchscreen.tap(lp[0], lp[1]);
  await page.waitForTimeout(1200);
  const louvre = await cardText();
  await page.evaluate(() => { window.atlas.shell.card.hide(); window.atlas.app.deactivate('art-museums'); });
  const lmp = await legend('masterpieces', { kind: 'sculpture' });
  await page.evaluate(() => window.atlas.app.deactivate('masterpieces'));
  const la = await legend('architecture', { style: 'gothic' });
  await page.evaluate(() => window.atlas.app.deactivate('architecture'));
  const line = (t, re) => (re.exec(t) ?? [''])[0];
  check(/\d{3} art museums/.test(lm) && /Louvre/.test(louvre) && /Mona Lisa/.test(louvre) && /Visitors/.test(louvre) && /\d+ masterpieces/.test(lmp) && /\d+ buildings by style/.test(la) && /Gothic/.test(la),
    `filters: "${line(lm, /\d+ art museums/)}", a tap on the Louvre opens its card (Mona Lisa among its works); "${line(lmp, /\d+ masterpieces/)}" (sculpture); "${line(la, /\d+ buildings by style/)}" (Gothic)`);

  // Crowded museums (v0.28.0, from the v0.27.0 phone test): at full zoom over Washington the Smithsonian's
  // museums, which overlap at their places, move apart, each with a line to its place, and a tap on each opens
  // its own card.
  await page.evaluate(() => window.atlas.app.activate('art-museums'));
  await page.evaluate(() => { const r = window.atlas.app.renderer; r.view.flyTo({ lon: -77.025, lat: 38.892, zoom: r.view.maxZoom }, 0); r.requestRender(); });
  await page.waitForTimeout(1500);
  const dc = await page.evaluate(() => {
    const v = window.atlas.app.renderer.view, c = window.atlas.app.instance('art-museums').state.crowd;
    const on = c.placed.filter((p) => p.x > 0 && p.x < v.w && p.y > 0 && p.y < v.h);
    let gap = Infinity;
    for (const a of on) for (const b of on) if (a !== b) gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
    return { gap, moved: on.filter((p) => Math.hypot(p.x - p.ax, p.y - p.ay) > p.r).length, dots: on.map((p) => ({ name: p.it.name[0], x: p.x, y: p.y })) };
  });
  const dcTaps = [];
  for (const d of dc.dots) {
    await page.touchscreen.tap(d.x, d.y);
    await page.waitForTimeout(600);
    dcTaps.push([d.name, await page.evaluate(() => document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? '')]);
    await page.evaluate(() => window.atlas.shell.card.hide());
  }
  await page.evaluate(() => window.atlas.app.deactivate('art-museums'));
  check(dc.dots.length >= 4 && dc.gap >= 2 && dc.moved >= 3 && dcTaps.every(([a, b]) => a === b),
    `crowded museums: at full zoom over Washington ${dc.dots.length} museums are apart (${dc.gap.toFixed(1)} px between the closest), ${dc.moved} with a line to their place, and a tap on each opens its own card${dcTaps.every(([a, b]) => a === b) ? '' : ` (not: ${dcTaps.filter(([a, b]) => a !== b).map(([a, b]) => `${a} → "${b}"`).join('; ')})`}`);


  // Now in, on the Mona Lisa's story card.
  await page.evaluate(async () => { const it = (await fetch('data/art/items.json').then((r) => r.json())).items.find((x) => x.id === 'mona-lisa'); window.atlas.time.stories.art.itemCard(it); });
  await page.waitForTimeout(800);
  const mona = await cardText();
  await page.evaluate(() => [...document.querySelectorAll('.country-card a, .country-card button')].find((b) => /art guide/.test(b.textContent))?.click());
  await page.waitForTimeout(1500);
  const paris = await page.evaluate(() => ({ city: window.atlas.guide.info.city, tab: window.atlas.guide.info.tab }));
  check(/Now in\s+Louvre Museum, Paris/.test(mona) && paris.city === 'paris' && paris.tab === 'art', `the Mona Lisa's story card: "Now in Louvre Museum, Paris", and its link opens Paris's art guide`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Which museum is it in?; Pin it's masterpieces.
  await page.evaluate(() => window.atlas.learn['startQuiz']('museum', 'world'));
  await page.waitForFunction(() => window.atlas.learn.quiz?.kind === 'museum', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const q = await page.evaluate(() => ({ n: window.atlas.learn.quiz.qs.length, text: document.querySelector('.learn-card .quiz-q')?.textContent, img: document.querySelector('.learn-card .quiz-img')?.getAttribute('src') ?? '', opts: document.querySelectorAll('.learn-card .quiz-opt').length }));
  await page.evaluate(() => { const qq = window.atlas.learn.quiz, cur = qq.qs[qq.i]; [...document.querySelectorAll('.learn-card .quiz-opt')][cur.options.indexOf(cur.id)].click(); });
  await page.waitForTimeout(500);
  const qfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.evaluate(() => window.atlas.play.pin.start({ pack: 'masterpieces' }));
  await page.waitForTimeout(800);
  const pin = await page.evaluate(() => window.atlas.play.pin.info);
  await page.evaluate(() => window.atlas.play.host.close());
  check(q.n === 10 && q.text === 'Which museum is it in?' && /Special:FilePath/.test(q.img) && q.opts === 4 && /^Correct! It is in .+, .+\.$/.test(qfb) && pin?.pack === 'masterpieces' && /, /.test(pin.place[5]),
    `"Which museum is it in?": ten works with their pictures, four museums each ("${qfb}"); Pin it's masterpieces (${pin?.place[0]}, ${pin?.place[5]})`);

  // Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.evaluate(() => window.atlas.guide.openCity('madrid', 'art'));
  await page.waitForSelector('.guide-tab [data-work]', { timeout: 15000 }).catch(() => {});
  const esText = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('.guide-tabs [data-tab]')].map((x) => x.textContent.replace(/^\S+\s/, '')).join(', '), text: document.querySelector('.guide-tab')?.innerText ?? '' }));
  await page.evaluate(() => window.atlas.app.setLang('en'));
  check(/Arte, Edificios/.test(esText.tabs) && /En Madrid puedes ver \d+ de las obras más conocidas del mundo/.test(esText.text) && /Las meninas|Las Meninas/.test(esText.text), `en español: ${esText.tabs}; "${(/En Madrid[^.]+/.exec(esText.text) ?? [''])[0]}"`);

  check(!errors.length, `no page errors in v0.27.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 24. Lives on the map (v0.28.0). The list of lives (fields, the search box, the pairs); a life step by step (Frida
// Kahlo: the place and her age, the route from the last place, the details with her Wikipedia article and where her
// works are now); a step dated by its year only ("aged 42–43"); the places to visit today and a place's card with
// its city's guide; two lives side by side (Frida Kahlo and Diego Rivera: both lives' steps, a handshake at their
// wedding, and the same pair from a shared link); Who was born here? (Salzburg lists Mozart first, his card with a
// portrait's licence from recorded answers, by field); a city's People tab; search finds a life; On this day; Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  // Wikidata and Commons, as recorded: a person's portrait, its licence and author; pictures as a small grey square.
  await ctx.route(/wikidata\.org\/w\/api\.php/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ claims: { P18: [{ mainsnak: { datavalue: { value: 'Wolfgang-amadeus-mozart 1.jpg' } } }] } }) }));
  await ctx.route(/commons\.wikimedia\.org\/w\/api\.php/, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ query: { pages: { 1: { imageinfo: [{ extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: '<a href="#">Barbara Krafft</a>' } } }] } } } }) }));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await ctx.route(/Special:FilePath|upload\.wikimedia\.org/, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=-60,20,1.3&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.lives && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const cardText = () => page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  const bar = () => page.evaluate(() => ({ date: document.querySelector('.wb-date')?.textContent ?? '', title: document.querySelector('.wb-title')?.textContent ?? '', meta: [...document.querySelectorAll('.wb-meta > *')].map((x) => x.textContent), name: document.querySelector('.wb-title-short')?.textContent ?? '' }));
  const goStep = (k) => page.evaluate((n) => { const m = window.atlas.time.stories.lives; m['playing'] = false; m['go'](n, { user: true }); }, k);

  // The list: every life, the fields, the pairs; the search box finds a life by its birthplace.
  await page.evaluate(() => window.atlas.time.enter('lives'));
  await page.waitForSelector('.lives-cards [data-war]', { timeout: 15000 }).catch(() => {});
  const all = await page.evaluate(async () => (await fetch('data/lives/index.json').then((r) => r.json())).stories.length);
  const list = await page.evaluate(() => ({ cards: document.querySelectorAll('.lives-cards [data-war]').length, fields: [...document.querySelectorAll('.lives-fields [data-field]')].map((b) => b.dataset.field), pairs: [...document.querySelectorAll('[data-pair]')].map((b) => b.dataset.pair), frida: document.querySelector('.lives-cards [data-war="frida-kahlo"]')?.innerText ?? '' }));
  await page.fill('.lives-search', 'coyoac');
  await page.waitForTimeout(300);
  const found = await page.evaluate(() => [...document.querySelectorAll('.lives-cards [data-war]')].map((b) => b.dataset.war));
  await page.fill('.lives-search', '');
  await page.click('.lives-fields [data-field="arts"]');
  await page.waitForTimeout(300);
  const arts = await page.evaluate(() => [...document.querySelectorAll('.lives-cards [data-war]')].map((b) => b.dataset.war));
  await page.click('.lives-fields [data-field="all"]');
  check(list.cards === all && all >= 3 && list.fields[0] === 'all' && list.fields.includes('arts') && list.pairs.includes('frida-kahlo~diego-rivera') && /1907–1954 · Mexican painter/.test(list.frida) && /Coyoacán/.test(list.frida)
    && found.join() === 'frida-kahlo' && arts.includes('frida-kahlo') && arts.includes('diego-rivera') && arts.length < all,
  `Lives on the map: ${list.cards} lives in ${list.fields.length - 1} fields, ${list.pairs.length} pairs; "coyoac" finds ${found.join()}; ${arts.length} in Art`);

  // A life, step by step: the place and her age, the route from the last place.
  await page.click('.lives-cards [data-war="frida-kahlo"]');
  await page.waitForFunction(() => window.atlas.time.stories.lives.story?.id === 'frida-kahlo', null, { timeout: 15000 }).catch(() => {});
  await goStep(4);
  await page.waitForTimeout(2500);
  const b5 = await bar();
  const s5 = await page.evaluate(() => { const c = window.atlas.time.stories.lives.story, st = c.steps[4]; const v = window.atlas.app.renderer.view; return { moves: st.moves?.map((m) => [m.side, m.path.length, m.path[0], m.path[m.path.length - 1]]), trail: c.trail, sides: c.sides.length, on: !!v.project(st.at[0], st.at[1]), hash: location.hash }; });
  check(/November 1930/.test(b5.date) && b5.title === 'San Francisco' && b5.meta.some((x) => /📍 San Francisco · aged 23/.test(x)) && !b5.meta.some((x) => /Frida Kahlo/.test(x)) && s5.trail && s5.sides === 1 && s5.on
    && s5.moves?.length === 1 && Math.abs(s5.moves[0][2][0] + 99.16) < 0.01 && Math.abs(s5.moves[0][3][0] + 122.42) < 0.01 && /#lives=frida-kahlo&step=5/.test(s5.hash),
  `Frida Kahlo, step 5: ${b5.date}, "${b5.meta[0]}", the route from Coyoacán to San Francisco, ${s5.hash.split('&p=')[0]}`);
  await page.click('.wb-more');
  await page.waitForSelector('.war-details', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('[data-lives="works"]', { timeout: 8000 }).catch(() => {});
  const det = await page.evaluate(() => ({ where: document.querySelector('.story-where')?.textContent ?? '', wiki: document.querySelector('.lives-actions a')?.getAttribute('href') ?? '', works: !!document.querySelector('[data-lives="works"]'), buildings: !!document.querySelector('[data-lives="buildings"]'), beside: !!document.querySelector('[data-lives="beside"]'), rows: document.querySelectorAll('.war-details .story-item, .war-details [class*="item"]').length }));
  await page.evaluate(() => window.atlas.shell.sheet.close());
  check(/San Francisco, United States · aged 23/.test(det.where) && /en\.wikipedia\.org\/wiki\/Frida_Kahlo/.test(det.wiki) && det.works && !det.buildings && det.beside,
    `her details: "${det.where}", her Wikipedia article, Where their works are now, Beside another life`);

  // The places to visit today, and a place's card with its city's guide.
  const last = await page.evaluate(() => window.atlas.time.stories.lives.story.steps.length - 1);
  await goStep(last);
  await page.waitForTimeout(2200);
  const bt = await bar();
  await page.evaluate(() => { const m = window.atlas.time.stories.lives, c = m.story; m.itemCard(c.items[c.steps[c.steps.length - 1].show[0]]); });
  await page.waitForTimeout(600);
  const visit = await cardText();
  check(/Today/i.test(bt.title) && /In their footsteps today/.test(bt.title) && /Frida Kahlo Museum/.test(visit) && /To visit today/.test(visit) && !/\bWhen\b/.test(visit) && /Mexico City: the guide/.test(visit),
    `today: "${bt.title.replace(/\s+/g, ' ').trim()}"; the Blue House's card (no date) links to "${(/[^\n]*: the guide/.exec(visit) ?? [''])[0]}"`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // A step dated by its year only: his age is one of two.
  await page.evaluate(() => window.atlas.time.stories.lives.open('diego-rivera'));
  await page.waitForFunction(() => window.atlas.time.stories.lives.story?.id === 'diego-rivera', null, { timeout: 15000 }).catch(() => {});
  const yk = await page.evaluate(() => window.atlas.time.stories.lives.story.steps.findIndex((s) => s.age0 != null && s.age0 !== s.age));
  await goStep(yk);
  await page.waitForTimeout(1200);
  const by = await bar();
  check(yk > 0 && by.meta.some((x) => /aged \d+–\d+/.test(x)), `Diego Rivera, a step dated by its year (${by.date}): "${by.meta[0]}"`);

  // Two lives side by side.
  await page.evaluate(() => window.atlas.time.stories.lives.pick());
  await page.waitForSelector('[data-pair="frida-kahlo~diego-rivera"]', { timeout: 10000 }).catch(() => {});
  await page.click('[data-pair="frida-kahlo~diego-rivera"]');
  await page.waitForFunction(() => window.atlas.time.stories.lives.story?.id === 'frida-kahlo~diego-rivera', null, { timeout: 15000 }).catch(() => {});
  const wed = await page.evaluate(() => { const m = window.atlas.time.stories.lives; m['playing'] = false; const k = m.story.steps.findIndex((s) => s.who === 'a' && s.date === '1929-08-21'); m['go'](k, { user: true }); return k; });
  await page.waitForTimeout(2200);
  const bp = await bar();
  const pair = await page.evaluate(() => { const c = window.atlas.time.stories.lives.story; return { n: c.steps.length, sides: c.sides.map((s) => s.color), sorted: c.steps.every((s, i) => i === 0 || s.t >= c.steps[i - 1].t), who: [...new Set(c.steps.map((s) => s.who))].sort().join(), events: c.steps.flatMap((s) => (s.events ?? []).map((e) => e.text.en)), hash: location.hash }; });
  check(/Frida Kahlo and Diego Rivera/.test(bp.name) && pair.n >= 25 && pair.sides.length === 2 && pair.sides[0] !== pair.sides[1] && pair.sorted && pair.who === 'a,b'
    && bp.meta.some((x) => /Their paths cross/.test(x)) && bp.meta.some((x) => x === 'Frida Kahlo') && pair.events.some((e) => /Both in Coyoacán, 1929/.test(e)) && new RegExp(`#lives=frida-kahlo~diego-rivera&step=${wed + 1}`).test(pair.hash),
  `two lives side by side: ${bp.name.trim()}, ${pair.n} steps in date order in two colours; at their wedding "${bp.meta.filter((x) => /cross|Kahlo/.test(x)).join('", "')}" ("${pair.events.find((e) => /1929/.test(e))}")`);
  // The same pair from a shared link, in another browser.
  const page2 = await ctx.newPage();
  await page2.goto(url + `#lives=frida-kahlo~diego-rivera&step=${wed + 1}&lang=en`, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page2.waitForFunction(() => window.atlas?.time?.stories.lives.story?.id === 'frida-kahlo~diego-rivera', null, { timeout: 30000 }).catch(() => {});
  await page2.waitForTimeout(1500);
  const shared = await page2.evaluate(() => ({ id: window.atlas.time.stories.lives.story?.id, title: document.querySelector('.wb-title')?.textContent ?? '' }));
  await page2.close();
  check(shared.id === 'frida-kahlo~diego-rivera' && /She marries Diego Rivera/.test(shared.title), `a shared link opens the two lives at that step ("${shared.title}")`);
  await page.evaluate(() => window.atlas.time.stories.lives.exit());
  await page.waitForTimeout(600);

  // Who was born here?
  await page.evaluate(() => window.atlas.app.activate('born-here'));
  await page.waitForFunction(() => /people were born/.test(document.body.innerText) || window.atlas.app.instance('born-here')?.ready, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const legend = await page.evaluate(() => { const l = window.atlas.app.instance('born-here'); const g = l.def.legend(l); return { title: g.title, items: g.items.map((i) => i.label) }; });
  await page.evaluate(() => { const r = window.atlas.app.renderer; r.view.flyTo({ lon: 13.045, lat: 47.8, zoom: 7 }, 0); r.requestRender(); });
  await page.waitForTimeout(1500);
  const sp = await page.evaluate(() => window.atlas.app.renderer.view.project(13.045, 47.8));
  await page.touchscreen.tap(sp[0], sp[1]);
  await page.waitForSelector('.born-panel [data-person]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  const salz = await page.evaluate(() => ({ open: window.atlas.shell.sheet.isOpen('born-here'), place: document.querySelector('.born-panel')?.dataset.place, people: [...document.querySelectorAll('.born-panel [data-person] .guide-item-title')].map((x) => x.textContent), sub: document.querySelector('.born-panel [data-person] .guide-item-sub')?.textContent ?? '' }));
  await page.click('.born-panel [data-person="Q254"]');
  await page.waitForSelector('.country-card:not([hidden]) [data-credit]', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
  const mozart = await cardText();
  check(/Where [\d.,]+\s?[kK]? people were born|Where 12/.test(legend.title) && legend.items.length >= 8 && legend.items.some((x) => /Music/.test(x)) && salz.open && salz.place === 'Salzburg' && salz.people[0] === 'Wolfgang Amadeus Mozart' && /1756–1791 · Austrian composer/.test(salz.sub)
    && /Born\s+1756 · Salzburg/.test(mozart) && /Died\s+1791 · Vienna/.test(mozart) && /Picture: Public domain · Barbara Krafft/.test(mozart),
  `Who was born here?: "${legend.title}" in ${legend.items.length} fields; Salzburg lists ${salz.people.slice(0, 3).join(', ')}…; Mozart's card with his portrait's licence`);
  await page.evaluate(() => window.atlas.shell.card.hide());
  await page.evaluate(() => window.atlas.app.setOption('born-here', 'field', 'sport'));
  await page.waitForTimeout(400);
  const sport = await page.evaluate(() => { const l = window.atlas.app.instance('born-here'); const g = l.def.legend(l); return g.items.map((i) => i.label); });
  await page.evaluate(() => { window.atlas.app.setOption('born-here', 'field', 'all'); window.atlas.app.deactivate('born-here'); });
  check(sport.length === 1 && /Sport/.test(sport[0]), `by field: ${sport.join()}`);

  // A city's People tab: the lives that pass through, who was born there, who died there.
  await page.evaluate(() => window.atlas.guide.openCity('mexico-city', 'people'));
  await page.waitForSelector('.guide-tab [data-person]', { timeout: 15000 }).catch(() => {});
  const ppl = await page.evaluate(() => ({ lives: [...document.querySelectorAll('.guide-tab [data-life]')].map((b) => b.dataset.life), born: document.querySelectorAll('.guide-tab [data-people="born"] [data-person]').length, first: document.querySelector('.guide-tab [data-people="born"] .guide-item-title')?.textContent, died: document.querySelectorAll('.guide-tab [data-people="died"] [data-person]').length, text: document.querySelector('.guide-tab')?.innerText ?? '' }));
  await page.click('.guide-tab [data-life="frida-kahlo"]');
  await page.waitForFunction(() => window.atlas.time.stories.lives.story?.id === 'frida-kahlo', null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const fromGuide = await page.evaluate(() => { const m = window.atlas.time.stories.lives; return { id: m.story?.id, place: document.querySelector('.wb-place')?.textContent ?? '' }; });
  check(ppl.lives.includes('frida-kahlo') && ppl.lives.includes('diego-rivera') && ppl.born >= 10 && ppl.died >= 3 && /Born in Mexico City \(\d+\)/i.test(ppl.text) && fromGuide.id === 'frida-kahlo' && /Mexico City|Coyoacán/.test(fromGuide.place),
    `Mexico City's People tab: ${ppl.lives.length} lives pass through, ${ppl.born} born here (${ppl.first} first), ${ppl.died} died here; a life opens at its first step here ("${fromGuide.place}")`);
  await page.evaluate(() => window.atlas.time.stories.lives.exit());
  await page.waitForTimeout(500);

  // Search finds a life; On this day has her birthday.
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.fill('.search-field', 'frida');
  await page.waitForTimeout(500);
  await page.fill('.search-field', 'frida k');
  await page.waitForTimeout(400);
  const hit = await page.evaluate(() => [...document.querySelectorAll('.search-item')].map((x) => x.innerText.replace(/\n/g, ' · ')).find((x) => /Lives on the map/.test(x)) ?? '');
  await page.evaluate(() => [...document.querySelectorAll('.search-item')].find((x) => /Lives on the map/.test(x.innerText))?.click());
  await page.waitForFunction(() => window.atlas.time.stories.lives.story?.id === 'frida-kahlo', null, { timeout: 15000 }).catch(() => {});
  const otd = await page.evaluate(async () => { const m = await fetch('data/onthisday/07.json').then((r) => r.json()); return (m.days['6'] ?? []).filter((e) => e[0] === 'lives/frida-kahlo').map((e) => e[4]); });
  check(/Frida Kahlo/.test(hit) && /1907–1954/.test(hit) && (await page.evaluate(() => window.atlas.time.stories.lives.story?.id)) === 'frida-kahlo' && otd.includes('Born in the Blue House'),
    `search: "${hit}" opens her life; On this day, 6 July: "${otd.join()}"`);

  // Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await goStep(4);
  await page.waitForTimeout(1200);
  const es5 = await bar();
  await page.evaluate(() => window.atlas.time.stories.lives.pick());
  await page.waitForSelector('.lives-cards [data-war]', { timeout: 10000 }).catch(() => {});
  const esList = await page.evaluate(() => ({ title: document.querySelector('.sheet-title, .sheet-head h2')?.textContent ?? document.querySelector('.sheet')?.innerText.split('\n')[0] ?? '', frida: document.querySelector('.lives-cards [data-war="frida-kahlo"]')?.innerText ?? '', pairs: document.querySelector('.lives-pairs')?.innerText ?? '' }));
  await page.evaluate(() => { window.atlas.shell.sheet.close(); window.atlas.app.setLang('en'); });
  await page.evaluate(() => window.atlas.time.stories.lives.exit());
  check(es5.meta.some((x) => /a los 23 años/.test(x)) && /noviembre de 1930/.test(es5.date) && /Vidas en el mapa/.test(esList.title) && /Pintora mexicana/.test(esList.frida) && /Dos vidas lado a lado/i.test(esList.pairs),
    `en español: ${esList.title.trim()}; "${es5.date}", "${es5.meta[0]}"; ${esList.frida.split('\n')[1] ?? ''}`);

  check(!errors.length, `no page errors in v0.28.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 25. Map view (v0.28.5). States and provinces, on by default: their lines and names over the US from country zoom (Texas
// named), with a filter on (Who was born here?, whose names give way to the states'); a tap on Texas says "State: Texas"
// on the card; Salzburg's born-here panel names its state and country. The style button in the zoom controls: the Map
// style (one light land colour, the Political map's colours gone and its legend saying so), Satellite (NASA's picture
// under the filters, the deeper zoom), the names and the states switched off, all kept after a reload and in the link;
// Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org/, (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political,born-here&c=-98,38,1.4&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.app && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const at = (lon, lat, wz) => page.evaluate(([lon, lat, wz]) => { const r = window.atlas.app.renderer, v = r.view; v.flyTo({ lon, lat, zoom: v.zoom * Math.pow(2, wz - v.webZoom) }, 0); r.requestRender(); }, [lon, lat, wz]);
  const drawn = () => page.evaluate(() => window.atlas.app.renderer.labels.drawn.map((l) => l.text));
  // How many pixels of the map change when the states are switched on (the same frame drawn twice).
  const linesPx = () => page.evaluate(() => {
    const app = window.atlas.app, r = app.renderer, fg = document.getElementById('fg');
    const grab = () => { r['draw'](performance.now()); return fg.getContext('2d').getImageData(0, 0, fg.width, fg.height).data; };
    app.setMapView({ regions: false }); const a = grab();
    app.setMapView({ regions: true }); const b = grab();
    let n = 0;
    for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++;
    return n;
  });

  // States and provinces, on by default, over the US with Who was born here? on.
  await page.waitForFunction(() => window.atlas.app.instance('born-here')?.ready, null, { timeout: 30000 }).catch(() => {});
  await at(-98, 38, 4.4);
  await page.waitForTimeout(2500);
  const on = await page.evaluate(() => ({ regions: window.atlas.app.renderer.labels.drawn.length > 0 }));
  const usPx = await linesPx();
  await page.waitForTimeout(800);
  const usNames = await drawn();
  const states = usNames.filter((t) => /^(TEXAS|KANSAS|NEBRASKA|OKLAHOMA|COLORADO|MONTANA|WYOMING|IOWA|MISSOURI|NEW MEXICO|SOUTH DAKOTA|NORTH DAKOTA)$/.test(t));
  check(on.regions && usPx > 2000 && states.includes('TEXAS') && states.length >= 4,
    `states and provinces, on by default: over the US with Who was born here? on, the lines (${usPx} pixels) and ${states.length} state names (${states.slice(0, 4).join(', ')}…)`);

  // Salzburg's born-here panel names its state and country.
  await page.evaluate(() => { const r = window.atlas.app.renderer; r.view.flyTo({ lon: 13.045, lat: 47.8, zoom: 7 }, 0); r.requestRender(); });
  await page.waitForTimeout(1500);
  const sp = await page.evaluate(() => window.atlas.app.renderer.view.project(13.045, 47.8));
  await page.touchscreen.tap(sp[0], sp[1]);
  await page.waitForSelector('.born-panel .born-where', { timeout: 8000 }).catch(() => {});
  const where = await page.evaluate(() => document.querySelector('.born-panel .born-where')?.textContent ?? '');
  await page.evaluate(() => { window.atlas.shell.sheet.close(); window.atlas.shell.card.hide(); });
  check(/Salzburg/.test(where) && /Austria/.test(where), `Salzburg's born-here panel: "${where}"`);

  // A tap on Texas: the card names the state.
  await page.evaluate(() => window.atlas.app.deactivate('born-here'));
  await at(-99.5, 31.3, 5);
  await page.waitForTimeout(1500);
  const tp = await page.evaluate(() => window.atlas.app.renderer.view.project(-99.5, 31.3));
  await page.touchscreen.tap(tp[0], tp[1]);
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  await page.evaluate(() => window.atlas.shell.card.hide());
  check(/United States/.test(card) && /State\s*\n?\s*Texas/.test(card), `a tap on Texas: the card says "${(/State[^\n]*\n?[^\n]*Texas/.exec(card) ?? [''])[0].replace(/\s+/g, ' ')}"`);

  // The style button: the Map style.
  await at(-98, 38, 4.4);
  await page.click('.zoom-style');
  await page.waitForSelector('.mapstyle:not([hidden]) [data-style="map"]', { timeout: 5000 }).catch(() => {});
  const tiles = await page.evaluate(() => [...document.querySelectorAll('.mapstyle [data-style]')].map((b) => `${b.dataset.style}${b.getAttribute('aria-checked') === 'true' ? '*' : ''}`));
  await page.click('.mapstyle [data-style="map"]');
  await page.waitForTimeout(1500);
  const mp = await page.evaluate(() => {
    const r = window.atlas.app.renderer, fg = document.getElementById('fg');
    r['draw'](performance.now());
    // The land in the Great Plains at eight points: most are the Map style's light grey land (a name or a line may
    // cover a few), none the Political map's colour.
    const d = r.view.dpr, g = fg.getContext('2d');
    const pts = [[-100.5, 39.3], [-101, 41.5], [-99, 37.5], [-103, 39], [-97.5, 40.2], [-104.5, 41], [-98, 35.6], [-102, 36.6]];
    const px = pts.map(([lon, lat]) => { const p = r.view.project(lon, lat); return [...g.getImageData(Math.round(p[0] * d), Math.round(p[1] * d), 1, 1).data].slice(0, 3); });
    const land = px.filter(([R, G, B]) => R > 200 && Math.abs(R - G) < 14 && Math.abs(G - B) < 16).length;
    const pol = window.atlas.app.instance('political');
    return { land: r.theme.land, landPx: land, light: document.documentElement.classList.contains('map-light'), note: pol.def.legend(pol, 'en')?.note ?? '' };
  });
  check(tiles.join() === 'atlas*,map,satellite' && mp.land === '#f2f0e9' && mp.landPx >= 5 && mp.light && /countries are in one colour/.test(mp.note),
    `the style button: ${tiles.join(', ')}; Map: the land ${mp.land} (${mp.landPx} of 8 points in the Great Plains), the Political map's legend: "${mp.note.split('.')[0]}"`);

  // Satellite: NASA's picture under the filters, and the deeper zoom.
  await page.click('.mapstyle [data-style="satellite"]');
  await page.waitForFunction(() => window.atlas.app.renderer.baseImagery?.ready, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const sat = await page.evaluate(() => ({ ready: !!window.atlas.app.renderer.baseImagery?.ready, max: window.atlas.app.renderer.view.maxZoom, chips: [...document.querySelectorAll('.chips .fchip-name')].map((c) => c.textContent).join(', ') }));
  check(sat.ready && sat.max > 400 && /Political map/.test(sat.chips) && !/Satellite/.test(sat.chips), `Satellite: NASA's picture under the filters (${sat.chips}), and the deeper zoom (${sat.max})`);

  // The names off, then the states off; kept after a reload and in the address.
  await page.click('.mapstyle [data-ms="names"]');
  await page.waitForTimeout(800);
  const noNames = await drawn();
  await page.click('.mapstyle [data-ms="regions"]');
  await page.waitForTimeout(1200);
  const hash = await page.evaluate(() => location.hash);
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.app && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const kept = await page.evaluate(() => { const r = window.atlas.app.renderer; return { style: r.theme.region === 'rgba(255,255,255,0.5)' && r.theme.label === '#ffffff', hash: location.hash }; });
  check(!noNames.includes('TEXAS') && /[#&]m=satellite/.test(hash) && /[&]st=0/.test(hash) && kept.style && /m=satellite/.test(kept.hash),
    `the names off (no "TEXAS"), then the states off; after a reload still Satellite and no states (${hash.split('&').filter((x) => /^(m|st|sn)=/.test(x)).join('&')})`);

  // Spanish: the panel, and the card's row.
  await page.evaluate(() => { window.atlas.app.setLang('es'); window.atlas.app.setMapView({ style: 'atlas', regions: true }); window.atlas.app.deactivate('born-here'); });
  await page.click('.zoom-style');
  await page.waitForTimeout(400);
  const esPanel = await page.evaluate(() => document.querySelector('.mapstyle')?.innerText ?? '');
  await page.click('.zoom-style');
  await page.evaluate(async () => { const { app } = window.atlas; app.renderer.requestRender(); });
  await at(-99.5, 31.3, 5);
  await page.waitForTimeout(2000);
  const tp2 = await page.evaluate(() => window.atlas.app.renderer.view.project(-99.5, 31.3));
  await page.touchscreen.tap(tp2[0], tp2[1]);
  await page.waitForTimeout(900);
  const esCard = await page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  await page.evaluate(() => { window.atlas.shell.card.hide(); window.atlas.app.setLang('en'); });
  check(/Estilo del mapa/.test(esPanel) && /Estados y provincias/.test(esPanel) && /Satélite/.test(esPanel) && /Estado\s*\n?\s*Texas/.test(esCard),
    `en español: "Estilo del mapa", "Estados y provincias"; the card: "${(/Estado[^\n]*\n?[^\n]*Texas/.exec(esCard) ?? [''])[0].replace(/\s+/g, ' ')}"`);

  check(!errors.length, `no page errors in v0.28.5's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 26. Search (v0.29.0). With Who was born here? on, "rafa nadal", "Nadal Rafael" and "rafael nadl" find Rafael Nadal
// first, from that filter; choosing him flies close to Manacor, rings his dot and opens his card. With Masterpieces off,
// "las meninas" finds the painting (the filter turns on, its card opens). "texas" finds the state; Languages'
// "Portuguese" highlights its countries; "40.4, -3.7" goes there. An empty box shows the recent searches; Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org/, (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political,born-here&c=0,30,1.4&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.app?.instance('born-here')?.ready && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const find = async (text, wait = 600) => {
    await page.evaluate(() => window.atlas.shell.search.open());
    await page.fill('.search-field', text);
    await page.waitForTimeout(wait);
    return page.evaluate(() => [...document.querySelectorAll('.search-item')].map((x) => ({ label: x.querySelector('.si-label')?.textContent ?? '', tag: x.querySelector('.si-tag')?.textContent ?? '', sub: x.querySelector('.si-sub')?.textContent ?? '' })));
  };
  const choose = async (i = 0) => { await page.evaluate((k) => document.querySelectorAll('.search-item')[k]?.click(), i); await page.waitForTimeout(3000); };
  const cardTitle = () => page.evaluate(() => document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? '');

  // Rafael Nadal, however he is typed.
  const ways = [];
  for (const q of ['rafa nadal', 'Nadal Rafael', 'rafael nadl']) ways.push([q, (await find(q))[0]]);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  const at = await page.evaluate(() => { const v = window.atlas.app.renderer.view; return { wz: v.webZoom, cam: v.camera(), ring: window.atlas.app.renderer.overlays.size }; });
  const nadal = await cardTitle();
  await page.evaluate(() => window.atlas.shell.card.hide());
  check(ways.every(([, r]) => r?.label === 'Rafael Nadal' && /Who was born here/.test(r.tag)) && at.wz >= 8.5 && Math.abs(at.cam.lon - 3.21) < 0.3 && Math.abs(at.cam.lat - 39.57) < 0.3 && nadal === 'Rafael Nadal',
    `"${ways.map(([q]) => q).join('", "')}" find Rafael Nadal first (${ways[0][1]?.tag}); choosing him flies to Manacor (web zoom ${at.wz.toFixed(1)}), rings his dot and opens his card`);

  // A filter that is off: Masterpieces.
  const men = await find('las meninas', 2500);
  await choose(0);
  const menOn = await page.evaluate(() => window.atlas.app.isActive('masterpieces'));
  const menCard = await cardTitle();
  await page.evaluate(() => { window.atlas.shell.card.hide(); window.atlas.app.deactivate('masterpieces'); });
  check(men[0]?.label === 'Las Meninas' && /Masterpieces · turns it on/.test(men[0].tag) && /Velázquez/.test(men[0].sub) && menOn && menCard === 'Las Meninas',
    `with Masterpieces off, "las meninas" finds it (${men[0]?.tag}); choosing it turns the filter on and opens its card`);

  // A state, a legend entry, coordinates.
  const tx = await find('texas', 1500);
  await choose(0);
  const txAt = await page.evaluate(() => ({ cam: window.atlas.app.renderer.view.camera(), sel: window.atlas.app.selection }));
  await page.evaluate(() => window.atlas.app.activate('languages'));
  await page.waitForFunction(() => window.atlas.app.instance('languages')?.ready, null, { timeout: 20000 }).catch(() => {});
  const pt = await find('portuguese');
  await choose(0);
  const hl = await page.evaluate(() => [...(window.atlas.app.renderer.highlight ?? [])]);
  await page.evaluate(() => { window.atlas.shell.legend.clearHighlight(); window.atlas.app.deactivate('languages'); });
  const co = await find('40.4, -3.7');
  await choose(0);
  const coAt = await page.evaluate(() => window.atlas.app.renderer.view.camera());
  check(tx[0]?.label === 'Texas' && /State, United States/.test(tx[0].sub) && Math.abs(txAt.cam.lon + 99.3) < 3 && txAt.sel === 'USA'
    && pt[0]?.label === 'Portuguese' && /Languages/.test(pt[0].tag) && hl.includes('BRA') && hl.includes('PRT')
    && /40.40° N, 3.70° W/.test(co[0]?.label ?? '') && Math.abs(coAt.lat - 40.4) < 0.05 && Math.abs(coAt.lon + 3.7) < 0.05,
    `"texas": ${tx[0]?.label} (${tx[0]?.sub}); "portuguese" with Languages on: ${hl.length} countries highlighted; "40.4, -3.7": ${co[0]?.label}`);

  // The empty box: the recent searches. Spanish.
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.waitForTimeout(400);
  const recent = await page.evaluate(() => [...document.querySelectorAll('.search-item.recent')].map((x) => x.textContent));
  await page.evaluate(() => { window.atlas.shell.search.close(); window.atlas.app.setLang('es'); });
  const esHits = await find('rafa nadal');
  const esHint = await page.evaluate(() => document.querySelector('.search-field').placeholder);
  await page.evaluate(() => { window.atlas.shell.search.close(); window.atlas.app.setLang('en'); });
  check(recent.includes('Rafael Nadal') && recent.includes('Las Meninas') && /¿Quién nació aquí\?/.test(esHits[0]?.tag ?? '') && /tenista español/i.test(esHits[0]?.sub ?? '') && /personas nacidas allí/.test(esHint),
    `an empty box: the recent searches (${recent.join(" | ")}); en español: ${esHits[0]?.sub} · "${esHint}", ${esHits[0]?.label} (${esHits[0]?.tag})`);

  check(!errors.length, `no page errors in v0.29.0's search checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 27. Games with the guide, the journeys, the sun and the lives (v0.29.0): today's Museum hop, Climate detective,
// Explorer's log, Sunrise race and Whose life is this?, each played to the end through its card (a pin on each answer
// scores near the most, and earns the game's badge), the same puzzles in a second browser, the progress panel's new
// badges (Around the app: a masterpiece opened counts), and Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); localStorage.removeItem('atlas-globe:progress'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org/, (route) => route.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const bootGames = async (p) => {
    await p.goto(url + '#p=globe&l=political&c=0,30,1.4&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await p.waitForFunction(() => window.atlas?.play && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
    await p.waitForTimeout(1000);
  };
  await bootGames(page);
  const info = (g) => page.evaluate((g) => window.atlas.play[g].info, g);
  const card = () => page.evaluate(() => document.querySelector('.play-card')?.innerText ?? '');
  const firsts = async (p) => {
    const out = {};
    for (const g of ['museum', 'climate', 'explorer', 'lives']) {
      await p.evaluate((g) => window.atlas.play.daily(g), g);
      await p.waitForFunction((g) => !!window.atlas.play[g].info, g, { timeout: 20000 }).catch(() => {});
      const i = await p.evaluate((g) => window.atlas.play[g].info, g);
      out[g] = g === 'museum' ? i?.stops.join(' / ') : g === 'lives' ? i?.round?.who : i?.name;
      await p.evaluate(() => window.atlas.play.host.close());
    }
    return out;
  };
  const day1 = await firsts(page);

  // Museum hop: five masterpieces, visited in the order they were given.
  await page.evaluate(() => window.atlas.play.daily('museum'));
  await page.waitForFunction(() => !!window.atlas.play.museum.info, null, { timeout: 20000 }).catch(() => {});
  const mh = await info('museum');
  const mhCard = await card();
  for (let i = 1; i < (mh?.stops.length ?? 0); i++) await page.evaluate((i) => window.atlas.play.museum.visit(i), i);
  const mhDone = await info('museum');
  check(mh?.stops.length === 5 && /Museum hop/.test(mhCard) && /masterpiece/.test(mhCard) && mhDone?.done?.score > 0 && mhDone.done.par > 0,
    `Museum hop: ${mh?.stops.slice(0, 2).join(', ')}…; in the given order ${mhDone?.done?.score} points (${Math.round(mhDone?.done?.yours)} km, best ${Math.round(mhDone?.done?.par)} km)`);
  await page.evaluate(() => window.atlas.play.host.close());

  // The three games of pins: each pin on the answer.
  const pinAll = async (g) => {
    await page.evaluate((g) => window.atlas.play.daily(g), g);
    await page.waitForFunction((g) => !!window.atlas.play[g].info, g, { timeout: 20000 }).catch(() => {});
    const first = await info(g);
    const firstCard = await card();
    const chart = await page.evaluate(() => !!document.querySelector('.play-card .climate-chart rect'));
    for (let k = 0; k < (first?.n ?? 0); k++) {
      await page.evaluate((g) => { const p = window.atlas.play[g]; const at = p.info.at; p.tap(at[Math.floor(at.length / 2)]); p.confirm(); }, g);
      await page.waitForTimeout(250);
      await page.evaluate((g) => window.atlas.play[g].next(), g);
    }
    const done = await info(g);
    await page.evaluate(() => window.atlas.play.host.close());
    return { first, firstCard, chart, done };
  };
  const cl = await pinAll('climate');
  check(cl.first?.n === 5 && cl.chart && /Which city has this year of weather/.test(cl.firstCard) && cl.done?.done?.score >= 5 * 5000 + 4 * 1000 && cl.done.done.stars === 3 && cl.done.done.badges.includes('play-climate'),
    `Climate detective: 5 cities, each with its year's chart (${cl.first?.name} first); a pin on each: ${cl.done?.done?.score} points with the climate zones, ${cl.done?.done?.badges.join(', ')}`);
  const ex = await pinAll('explorer');
  check(ex.first?.n >= 4 && /Where did they go next/.test(ex.firstCard) && /· from /.test(ex.firstCard) && ex.done?.results.every((r) => r.km < 1) && ex.done?.done?.stars === 3 && ex.done.done.badges.includes('play-explorer'),
    `Explorer's log: "${ex.firstCard.split('\n').find((l) => / from /.test(l)) ?? ''}", ${ex.first?.n} stops; a pin on each: ${ex.done?.done?.score} points, ${ex.done?.done?.badges.join(', ')}`);
  const sr = await pinAll('sunrise');
  check(sr.first?.n === 5 && /sun rising right now/.test(sr.firstCard) && sr.first.at.length > 100 && sr.done?.results.every((r) => r.km < 1) && sr.done.done.badges.includes('play-sunrise'),
    `Sunrise race: 5 questions (the sunrise line has ${sr.first?.at.length} points); a pin on each: ${sr.done?.done?.score} points, ${sr.done?.done?.badges.join(', ')}`);

  // Whose life is this?: the right name at the first place, five times.
  await page.evaluate(() => window.atlas.play.daily('lives'));
  await page.waitForFunction(() => !!window.atlas.play.lives.info, null, { timeout: 20000 }).catch(() => {});
  const lv = await info('lives');
  const names = await page.evaluate(() => [...document.querySelectorAll('.play-card [data-life]')].map((b) => b.textContent.trim()));
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => { const p = window.atlas.play.lives; p.guess(p.info.round.who); });
    await page.evaluate(() => window.atlas.play.lives.next());
  }
  const lvDone = await info('lives');
  check(lv?.round?.choices.length === 4 && lv.round.choices.includes(lv.round.who) && names.length === 4 && names.every((n) => n.length > 3) && lvDone?.done?.score === 5000 && lvDone.done.badges.includes('play-lives'),
    `Whose life is this?: four names (${names.join(', ')}); right at the first place five times: ${lvDone?.done?.score} points, ${lvDone?.done?.badges.join(', ')}`);
  await page.evaluate(() => window.atlas.play.host.close());

  // The same puzzles in another browser.
  const other = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const op = await other.newPage();
  await bootGames(op);
  const day2 = await firsts(op);
  await other.close();
  check(JSON.stringify(day1) === JSON.stringify(day2) && Object.values(day1).every(Boolean), `today's puzzles are the same in a second browser (${day1.climate}; ${day1.explorer}; ${day1.lives})`);

  // The progress panel: the new badges, and around the app (a masterpiece opened counts).
  // A masterpiece opened from the search (Masterpieces turns on, its card opens).
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.fill('.search-field', 'las meninas');
  await page.waitForTimeout(2500);
  await page.evaluate(() => document.querySelector('.search-item')?.click());
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.atlas.shell.card.hide(); window.atlas.app.deactivate('masterpieces'); });
  await page.evaluate(() => window.atlas.learn['openProgress']());
  await page.waitForTimeout(600);
  const prog = await page.evaluate(() => ({ text: document.querySelector('.progress')?.innerText ?? '', badges: [...document.querySelectorAll('.badge-chip.got')].map((b) => b.dataset.badge), all: [...document.querySelectorAll('.badge-chip')].map((b) => b.dataset.badge), seen: JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').seen }));
  await page.evaluate(() => window.atlas.shell.sheet.close());
  check(['play-climate', 'play-explorer', 'play-sunrise', 'play-lives'].every((b) => prog.badges.includes(b)) && ['play-museum', 'play-cartographer', 'app-trip', 'app-curator', 'app-biographer'].every((b) => prog.all.includes(b)) && /Around the app/i.test(prog.text) && /1 masterpieces opened/.test(prog.text) && prog.seen?.works?.length === 1,
    `the progress panel: ${prog.badges.length} badges earned (${prog.badges.filter((b) => /climate|explorer|sunrise|lives/.test(b)).join(", ")}); "${(/[\d,]+ masterpieces opened[^\n]*/.exec(prog.text) ?? [""])[0]}" (${JSON.stringify(prog.seen)}); Around the app with Curator and Biographer (${prog.all.filter((b) => /^app-/.test(b)).join(", ")})`);

  // Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.evaluate(() => window.atlas.play.climate.start());
  await page.waitForFunction(() => !!window.atlas.play.climate.info, null, { timeout: 20000 }).catch(() => {});
  const esCard = await card();
  await page.evaluate(() => { window.atlas.play.host.close(); window.atlas.app.setLang('en'); });
  check(/Detective del clima/.test(esCard) && /¿Qué ciudad tiene este clima/.test(esCard) && /temperatura/.test(esCard), `en español: "${esCard.split('\n').slice(0, 2).join(' · ')}"`);

  check(!errors.length, `no page errors in v0.29.0's games${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 28. Wild world (v0.30.0), on a phone, with GBIF and iNaturalist answered from fixtures. Animals of the world over
// the Serengeti: a varied carpet; a tap opens an animal's card (Red List badge, countries, the Naturalist count);
// "Show where it lives" shows its squares and its best parks as numbered stars; "Best places to see it" lists parks and
// a park's card; Endangered and Gone; the search finds the jaguar; More → Nature: the finder (ours, and any other
// species from GBIF's live map with its months), What lives here?; Wildlife parks and Zoos and aquariums; Great
// migrations by month; the two quizzes; a tour stop with an animal's range; the guide's Wildlife nearby; Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); localStorage.removeItem('atlas-globe:progress'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org/, (route) => route.abort());
  await ctx.route(/api\.gbif\.org\/v1\/species\/search/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ key: 5229380, nubKey: 5229380, canonicalName: 'Puffinus puffinus', scientificName: 'Puffinus puffinus (Brünnich, 1764)', class: 'Aves', family: 'Procellariidae', vernacularNames: [{ vernacularName: 'Manx shearwater', language: 'eng' }, { vernacularName: 'Pardela pichoneta', language: 'spa' }] }] }) }));
  await ctx.route(/api\.gbif\.org\/v2\/map\/occurrence\/density\/0\/(\d)\/0\.mvt/, (route) => {
    const x = /density\/0\/(\d)\/0/.exec(route.request().url())[1];
    route.fulfill({ contentType: 'application/x-protobuf', body: fs.readFileSync(new URL(`./fixtures/gbif-manx-shearwater-0-${x}-0.mvt`, import.meta.url)) });
  });
  await ctx.route(/api\.inaturalist\.org\/v1\/taxa\?/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ id: 4567, name: 'Puffinus puffinus' }, { id: 41964, name: 'Panthera leo' }] }) }));
  await ctx.route(/api\.inaturalist\.org\/v1\/observations\/histogram/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: { month_of_year: { 1: 2, 2: 3, 3: 40, 4: 120, 5: 300, 6: 420, 7: 380, 8: 210, 9: 60, 10: 8, 11: 2, 12: 1 } } }) }));
  await ctx.route(/api\.inaturalist\.org\/v1\/observations\/species_counts/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [
    { count: 900, taxon: { id: 41964, name: 'Panthera leo', preferred_common_name: 'lion', iconic_taxon_name: 'Mammalia' } },
    { count: 700, taxon: { id: 133061, name: 'Connochaetes taurinus', preferred_common_name: 'blue wildebeest', iconic_taxon_name: 'Mammalia' } },
    { count: 50, taxon: { id: 1, name: 'Bucorvus leadbeateri', preferred_common_name: 'southern ground hornbill', iconic_taxon_name: 'Aves' } },
  ] }) }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political,wild&c=35,-2.5,7&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.app?.instance('wild')?.ready && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // (On a phone the legend starts folded: open it to read it.)
  const legend = () => page.evaluate(() => { if (document.querySelector('.legend-body')?.hidden) document.querySelector('.legend-toggle')?.click(); return document.querySelector('.legend')?.innerText ?? ''; });
  const cardText = () => page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  const drawn = () => page.evaluate(() => (window.atlas.app.instance('wild').state.drawn ?? []).map((d) => ({ id: d.a.id, e: d.a.e, x: d.x, y: d.y })));

  // The carpet: many animals, many kinds, and the savanna's own.
  let d = await drawn();
  const kinds = new Set(d.map((x) => x.e));
  check(d.length >= 20 && kinds.size >= 8 && d.some((x) => ['panthera-leo', 'loxodonta-africana', 'giraffa-camelopardalis', 'connochaetes-taurinus', 'equus-quagga'].includes(x.id)),
    `Animals of the world over the Serengeti: ${d.length} animals, ${kinds.size} different emoji, among them the savanna's own`);

  // An animal's card.
  const W = await page.evaluate(() => [innerWidth, innerHeight]);
  const pickOne = (list) => list.find((x) => x.id === 'panthera-leo' && x.x > 50 && x.x < W[0] - 50 && x.y > 120 && x.y < W[1] * 0.55) ?? list.find((x) => x.x > 50 && x.x < W[0] - 50 && x.y > 120 && x.y < W[1] * 0.55);
  const one = pickOne(d);
  await page.mouse.click(one.x, one.y);
  await page.waitForTimeout(900);
  let card = await cardText();
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').seen?.animals ?? []);
  check(/Group/.test(card) && /Lives in/.test(card) && /Show where it lives/.test(card) && /Its relatives/.test(card) && (/Red List/.test(card) || !/LC|NT|VU|EN|CR/.test(card)) && seen.includes(one.id),
    `a tap opens ${one.id}'s card (group, Red List, where it lives, its buttons) and counts it for the Naturalist badge`);

  // Where the lion lives, and its best parks.
  await page.evaluate(() => window.atlas.app.instance('wild').def.searchLoad());
  await page.evaluate(() => { const b = [...document.querySelectorAll('.country-card button, .country-card a')].find((x) => /Show where it lives/.test(x.textContent)); b?.click(); });
  await page.waitForTimeout(2500);
  const lg = await legend();
  const focus = await page.evaluate(() => window.atlas.wild.info.focus);
  const stars = await page.evaluate(() => (window.atlas.app.instance('wild').state.stars ?? []).length);
  d = await drawn();
  check(focus === one.id && /where it lives/i.test(lg) && /All animals/.test(lg) && d.every((x) => x.id === one.id),
    `"Show where it lives": its squares, the carpet shows only it (${d.length} times), ${stars} best parks as stars; the legend offers all animals again`);
  // Best places to see it: a list of parks; one opens its card.
  // (Open the card again from the carpet, then its "Best places to see it".)
  d = await drawn();
  const again = d.find((x) => x.x > 30 && x.x < W[0] - 30 && x.y > 100 && x.y < W[1] * 0.6) ?? d[0];
  await page.mouse.click(again.x, again.y);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.country-card button, .country-card a')].find((x) => /Best places to see it/.test(x.textContent)); b?.click(); });
  await page.waitForTimeout(2500);
  const parks = await page.evaluate(() => [...document.querySelectorAll('[data-wild="best"] [data-park]')].map((x) => x.textContent));
  await page.evaluate(() => document.querySelector('[data-wild="best"] [data-park]')?.click());
  await page.waitForTimeout(1500);
  card = await cardText();
  check(parks.length >= 3 && /(National park|Nature reserve)/.test(card) && /Plan a trip/.test(card),
    `"Best places to see it": ${parks.length} parks (${parks.slice(0, 2).join('; ').slice(0, 80)}); a park's card with Plan a trip`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // Endangered and Gone.
  await page.evaluate(() => window.atlas.app.setOption('wild', 'status', 'endangered'));
  await page.waitForTimeout(800);
  const en = await legend();
  await page.evaluate(() => window.atlas.app.setOption('wild', 'status', 'gone'));
  await page.waitForTimeout(800);
  const gone = await legend();
  check(/threatened animals/.test(en) && /Critically endangered/.test(en) && /gone since 1500/.test(gone) && /Dodo · 1662/.test(gone) && /Thylacine · 1936/.test(gone),
    'Status: Endangered rings the threatened animals by Red List category; Gone lists the dodo (1662), the thylacine (1936)…');
  await page.evaluate(() => window.atlas.app.setOption('wild', 'status', 'all'));

  // The search finds the jaguar and shows where it lives.
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.fill('.search-field', 'jaguar');
  await page.waitForTimeout(800);
  const hits = await page.evaluate(() => [...document.querySelectorAll('.search-item')].map((x) => x.querySelector('.si-label')?.textContent ?? ''));
  await page.evaluate(() => [...document.querySelectorAll('.search-item')].find((x) => /^Jaguar$/.test(x.querySelector('.si-label')?.textContent ?? ''))?.click());
  await page.waitForTimeout(3000);
  const jf = await page.evaluate(() => ({ focus: window.atlas.wild.info.focus, title: document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? '' }));
  check(hits.includes('Jaguar') && jf.focus === 'panthera-onca' && jf.title === 'Jaguar', `the search finds the jaguar (${hits.slice(0, 3).join(', ')}): its range and its card`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // More → Nature: the finder, ours and GBIF's.
  await page.evaluate(() => window.atlas.wild.open());
  await page.waitForTimeout(800);
  await page.fill('[data-wild="find"]', 'puffin');
  await page.waitForTimeout(1500);
  const finder = await page.evaluate(() => ({ ours: [...document.querySelectorAll('[data-wild="ours"] [data-animal]')].map((x) => x.getAttribute('data-animal')), live: [...document.querySelectorAll('[data-wild="live"] [data-gbif]')].map((x) => x.textContent) }));
  await page.evaluate(() => document.querySelector('[data-wild="live"] [data-gbif]')?.click());
  await page.waitForTimeout(3000);
  const live = await page.evaluate(() => ({ focus: window.atlas.wild.info.focus, months: document.querySelectorAll('.wild-month').length, best: document.querySelectorAll('[data-wild="best"] [data-park]').length, head: document.querySelector('.wild-page-head')?.textContent ?? '' }));
  check(finder.ours.includes('fratercula-arctica') && finder.live.some((t) => /Manx shearwater/.test(t)) && live.focus === 'gbif:5229380' && live.months === 12,
    `the finder: our Atlantic puffin, and GBIF's Manx shearwater with its live map (${live.best} parks) and 12 months of sightings`);

  // What lives here?
  await page.evaluate(() => window.atlas.wild.whatLivesHere([34.83, -2.33]));
  await page.waitForTimeout(1500);
  const here = await page.evaluate(() => [...document.querySelectorAll('[data-wild="here-list"] .guide-item-title')].map((x) => x.textContent));
  check(here.length === 3 && /🦁/.test(here[0]) && /Blue wildebeest/i.test(here[1]),
    `What lives here?: iNaturalist's most-seen animals within 50 km, ours with their emoji (${here.join(', ')})`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Wildlife parks, and zoos and aquariums.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'wild-parks', 'wild-zoos']));
  await page.waitForFunction(() => window.atlas.app.instance('wild-parks')?.ready && window.atlas.app.instance('wild-zoos')?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const places = await legend();
  check(/National parks \(\d/.test(places) && /Aquariums \(\d/.test(places), 'Wildlife parks and Zoos and aquariums: their kinds in the legend');

  // Great migrations by month.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'migrations']));
  await page.waitForFunction(() => window.atlas.app.instance('migrations')?.ready, null, { timeout: 20000 });
  await page.evaluate(() => window.atlas.app.setOption('migrations', 'month', '3'));
  await page.evaluate(() => window.atlas.app.renderer.view.flyTo({ lon: 0, lat: 20, zoom: 1 }, 0));
  await page.waitForTimeout(1200);
  const mg = await legend();
  const travellers = await page.evaluate(() => (window.atlas.app.instance('migrations').state.drawn ?? []).length);
  check(/Migrations · March/.test(mg) && travellers >= 8 && /Play the year/.test(mg), `Great migrations in March: ${travellers} travellers on this side of the globe, the month's moments, ◀ ▶ and Play the year`);

  // The quizzes: tap where an animal lives; which animal lives here.
  await page.evaluate(() => window.atlas.app.setStack(['political']));
  await page.evaluate(() => window.atlas.learn['startQuiz']('habitat', 'world'));
  await page.waitForTimeout(2000);
  const hq = await page.evaluate(() => ({ q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', at: window.atlas.learn.quiz?.qs[0]?.item?.at }));
  await page.evaluate((at) => window.atlas.app.renderer.view.flyTo({ lon: at[0], lat: at[1], zoom: 3 }, 0), hq.at);
  await page.waitForTimeout(800);
  const xy = await page.evaluate((at) => window.atlas.app.renderer.view.project(at[0], at[1]), hq.at);
  await page.mouse.click(xy[0], xy[1]);
  await page.waitForTimeout(800);
  const hfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.evaluate(() => window.atlas.learn['startQuiz']('lives', 'world'));
  await page.waitForTimeout(2500);
  const lq = await page.evaluate(() => ({ q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((x) => x.textContent), id: window.atlas.learn.quiz?.qs[0]?.id }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt')?.click());
  await page.waitForTimeout(800);
  const lfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  check(/Where does this animal live/.test(hq.q) && /Correct!/.test(hfb) && /Which of these animals lives here/.test(lq.q) && lq.opts.length === 4 && /lives here/.test(lfb),
    `Where does it live?: a tap where it lives scores ("${hfb.slice(0, 50)}"); Who lives here?: four animals, then "${lfb.slice(0, 50)}"`);

  // A tour stop shows an animal's range.
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-tour="The Big Five safari"]')?.click());
  await page.waitForTimeout(3500);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card button')].find((x) => x.getAttribute('aria-label') === 'Next')?.click());
  await page.waitForTimeout(3500);
  const tour = await page.evaluate(() => ({ focus: window.atlas.wild.info.focus, wild: window.atlas.app.isActive('wild') }));
  check(tour.wild && tour.focus === 'panthera-leo', `The Big Five safari: its lion stop shows where lions live (${tour.focus})`);
  await page.evaluate(() => window.atlas.learn['stopTour']());

  // The travel guide's Wildlife nearby.
  await page.evaluate(() => window.atlas.guide.openCity('nairobi', 'see'));
  await page.waitForTimeout(2500);
  const nearby = await page.evaluate(() => ({ parks: [...document.querySelectorAll('[data-guide="wildlife"] [data-park]')].map((x) => x.textContent), animals: document.querySelectorAll('[data-guide="wildlife"] [data-animal]').length }));
  check(nearby.parks.length >= 1 && nearby.parks.some((t) => /Nairobi National Park/.test(t)) && nearby.animals >= 3,
    `Nairobi's See tab: Wildlife nearby (${nearby.parks.length} parks, Nairobi National Park among them; ${nearby.animals} animals)`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.evaluate(() => window.atlas.app.setStack(['political', 'wild']));
  await page.waitForFunction(() => window.atlas.app.instance('wild')?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  const es = await legend();
  check(/animales donde viven/.test(es) && /Mamíferos/.test(es), 'Spanish: "animales donde viven", Mamíferos…');
  check(!errors.length, `no page errors in Wild world${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 29. Green planet (v0.31.0), on a phone, with GBIF and iNaturalist answered from fixtures. Plants of the world over
// the Sonoran desert: a varied carpet; a tap opens a plant's card (when it flowers, the Botanist count); "Show where it
// grows" in green, with its best parks and gardens; the search finds the saguaro; More → Nature → Plants: the finder
// (ours, and any plant from GBIF's live map with when it flowers), What grows here?; Famous trees, Botanical gardens,
// Ecoregions (a tap: biome, realm, our plants and animals), the breathing planet by month, Nature's calendar and What's
// on this month, Where our food first grew; the two quizzes; a tour stop with a tree's range; Kyoto's Facts tab; Spanish.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); localStorage.removeItem('atlas-globe:progress'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org/, (route) => route.abort());
  await ctx.route(/api\.gbif\.org\/v1\/species\/search/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ key: 2878688, nubKey: 2878688, canonicalName: 'Quercus lobata', scientificName: 'Quercus lobata Née', class: 'Magnoliopsida', family: 'Fagaceae', vernacularNames: [{ vernacularName: 'valley oak', language: 'eng' }, { vernacularName: 'roble del valle', language: 'spa' }] }] }) }));
  await ctx.route(/api\.gbif\.org\/v2\/map\/occurrence\/density\/0\/(\d)\/0\.mvt/, (route) => {
    const x = /density\/0\/(\d)\/0/.exec(route.request().url())[1];
    route.fulfill({ contentType: 'application/x-protobuf', body: fs.readFileSync(new URL(`./fixtures/gbif-manx-shearwater-0-${x}-0.mvt`, import.meta.url)) });
  });
  await ctx.route(/api\.inaturalist\.org\/v1\/taxa\?/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ id: 50220, name: 'Carnegiea gigantea' }] }) }));
  // Flowering (term 12, value 13): the saguaro's spring; anything else, a year of sightings.
  await ctx.route(/api\.inaturalist\.org\/v1\/observations\/histogram/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: { month_of_year: /term_value_id=13/.test(route.request().url()) ? { 1: 0, 2: 0, 3: 4, 4: 90, 5: 400, 6: 260, 7: 30, 8: 2, 9: 0, 10: 0, 11: 0, 12: 0 } : { 1: 20, 2: 30, 3: 60, 4: 200, 5: 500, 6: 400, 7: 120, 8: 60, 9: 40, 10: 30, 11: 20, 12: 20 } } }) }));
  await ctx.route(/api\.inaturalist\.org\/v1\/observations\/species_counts/, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [
    { count: 900, taxon: { id: 50220, name: 'Carnegiea gigantea', preferred_common_name: 'saguaro', iconic_taxon_name: 'Plantae' } },
    { count: 600, taxon: { id: 2, name: 'Parkinsonia microphylla', preferred_common_name: 'yellow paloverde', iconic_taxon_name: 'Plantae' } },
  ] }) }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political,plants&c=-111.5,31.5,7&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas?.app?.instance('plants')?.ready && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const legend = () => page.evaluate(() => { if (document.querySelector('.legend-body')?.hidden) document.querySelector('.legend-toggle')?.click(); return document.querySelector('.legend')?.innerText ?? ''; });
  const cardText = () => page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  const drawn = () => page.evaluate(() => (window.atlas.app.instance('plants').state.drawn ?? []).map((d) => ({ id: d.a.id, e: d.a.e, x: d.x, y: d.y })));

  let d = await drawn();
  const kinds = new Set(d.map((x) => x.e));
  check(d.length >= 15 && kinds.size >= 6 && d.some((x) => ['carnegiea-gigantea', 'opuntia-ficus-indica', 'agave-americana', 'ferocactus-wislizeni', 'cylindropuntia-fulgida', 'stenocereus-thurberi', 'opuntia-engelmannii'].includes(x.id)),
    `Plants of the world over the Sonoran desert: ${d.length} plants, ${kinds.size} different emoji, its cacti among them`);

  // A plant's card, with when it flowers.
  const W = await page.evaluate(() => [innerWidth, innerHeight]);
  const one = d.find((x) => x.id === 'carnegiea-gigantea' && x.x > 50 && x.x < W[0] - 50 && x.y > 120 && x.y < W[1] * 0.55) ?? d.find((x) => x.x > 50 && x.x < W[0] - 50 && x.y > 120 && x.y < W[1] * 0.55);
  await page.mouse.click(one.x, one.y);
  await page.waitForTimeout(1500);
  let card = await cardText();
  const months = await page.evaluate(() => document.querySelectorAll('.country-card:not([hidden]) [data-green="flowering"] .wild-month').length);
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').seen?.plants ?? []);
  check(/Group/.test(card) && /Grows wild in/.test(card) && /When it flowers/.test(card) && /Show where it grows/.test(card) && months === 12 && seen.includes(one.id),
    `a tap opens ${one.id}'s card (group, where it grows, when it flowers: 12 months from iNaturalist) and counts it for the Botanist badge`);

  // Where it grows, and its best parks and gardens.
  await page.evaluate(() => { const b = [...document.querySelectorAll('.country-card button, .country-card a')].find((x) => /Show where it grows/.test(x.textContent)); b?.click(); });
  await page.waitForTimeout(2500);
  const lg = await legend();
  const focus = await page.evaluate(() => window.atlas.plants.info.focus);
  d = await drawn();
  check(focus === one.id && /where it grows/i.test(lg) && /All plants/.test(lg) && d.every((x) => x.id === one.id),
    `"Show where it grows": its squares in green, the carpet shows only it (${d.length} times); the legend offers all plants again`);
  d = await drawn();
  const again = d.find((x) => x.x > 30 && x.x < W[0] - 30 && x.y > 100 && x.y < W[1] * 0.6) ?? d[0];
  await page.mouse.click(again.x, again.y);
  await page.waitForTimeout(800);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.country-card button, .country-card a')].find((x) => /Best places to see it/.test(x.textContent)); b?.click(); });
  await page.waitForTimeout(2500);
  const best = await page.evaluate(() => [...document.querySelectorAll('[data-green="best"] .guide-item')].map((x) => x.getAttribute('data-park') ? 'park' : x.getAttribute('data-garden') ? 'garden' : '?'));
  check(best.length >= 3 && best.includes('park'), `"Best places to see it": ${best.length} places (${best.join(', ')})`);
  await page.evaluate(() => { window.atlas.shell.sheet.close(); window.atlas.shell.card.hide(); });

  // The search finds the saguaro.
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.fill('.search-field', 'saguaro');
  await page.waitForTimeout(800);
  const hits = await page.evaluate(() => [...document.querySelectorAll('.search-item')].map((x) => x.querySelector('.si-label')?.textContent ?? ''));
  await page.evaluate(() => [...document.querySelectorAll('.search-item')].find((x) => /^Saguaro$/.test(x.querySelector('.si-label')?.textContent ?? ''))?.click());
  await page.waitForTimeout(3000);
  const sf = await page.evaluate(() => ({ focus: window.atlas.plants.info.focus, title: document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? '' }));
  check(hits.includes('Saguaro') && sf.focus === 'carnegiea-gigantea' && sf.title === 'Saguaro', `the search finds the saguaro (${hits.slice(0, 3).join(', ')}): its range and its card`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // More → Nature → Plants: the finder, ours and GBIF's.
  await page.evaluate(() => window.atlas.wild.open());
  await page.waitForTimeout(800);
  await page.click('[data-nature-tab="plants"]');
  await page.waitForTimeout(800);
  await page.fill('[data-green="find"]', 'oak');
  await page.waitForTimeout(1500);
  const finder = await page.evaluate(() => ({ ours: [...document.querySelectorAll('[data-green="ours"] [data-plant]')].map((x) => x.getAttribute('data-plant')), live: [...document.querySelectorAll('[data-green="live"] [data-gbif]')].map((x) => x.textContent) }));
  await page.evaluate(() => document.querySelector('[data-green="live"] [data-gbif]')?.click());
  await page.waitForTimeout(3000);
  const live = await page.evaluate(() => ({ focus: window.atlas.plants.info.focus, months: document.querySelectorAll('[data-green="when"] .wild-month').length, head: document.querySelector('.wild-page-head')?.textContent ?? '' }));
  check(finder.ours.includes('quercus-robur') && finder.live.some((t) => /Valley oak/.test(t)) && live.focus === 'gbif:2878688' && live.months === 12,
    `the plant finder: our English oak, and GBIF's valley oak with its live map and when it flowers (${live.months} months)`);

  // What grows here?
  await page.evaluate(() => window.atlas.plants.whatGrowsHere([-111.0, 32.3]));
  await page.waitForTimeout(1500);
  const here = await page.evaluate(() => [...document.querySelectorAll('[data-green="here-list"] .guide-item-title')].map((x) => x.textContent));
  check(here.length === 2 && /🌵/.test(here[0]), `What grows here?: iNaturalist's most-seen plants within 50 km, ours with their emoji (${here.join(', ')})`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Famous trees and Botanical gardens.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'trees', 'gardens']));
  await page.waitForFunction(() => window.atlas.app.instance('trees')?.ready && window.atlas.app.instance('gardens')?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const tg = await legend();
  check(/Record holders \(\d/.test(tg) && /Arboretums \(\d/.test(tg), 'Famous trees (record holders) and Botanical gardens (arboretums) in the legend');

  // Ecoregions: a tap in the Serengeti.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'ecoregions']));
  await page.waitForFunction(() => window.atlas.app.instance('ecoregions')?.ready, null, { timeout: 20000 });
  await page.evaluate(() => (window.atlas.app.renderer.view.flyTo({ lon: 34.8, lat: -2.4, zoom: 5 }, 0), window.atlas.app.renderer.requestRender()));
  await page.waitForFunction(() => { const v = window.atlas.app.renderer.view; if (!v.project(34.8, -2.4)) { v.flyTo({ lon: 34.8, lat: -2.4, zoom: 5 }, 0); window.atlas.app.renderer.requestRender(); } return !!v.project(34.8, -2.4); }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const exy = await page.evaluate(() => window.atlas.app.renderer.view.project(34.8, -2.4));
  // (A tap on the point; should the globe not have turned there, the filter's own tap at that point.)
  if (exy) await page.mouse.click(exy[0], exy[1]);
  else await page.evaluate(() => { const inst = window.atlas.app.instance('ecoregions'); const sh = window.atlas.shell; inst.def.tap(34.8, -2.4, inst, { card: (...a) => sh.card.showCustom(...a), project: () => null, x: 0, y: 0 }); });
  await page.waitForTimeout(2500);
  card = await cardText();
  const eco = await page.evaluate(() => ({ plants: document.querySelectorAll('.country-card:not([hidden]) [data-eco] [data-plant]').length, animals: document.querySelectorAll('.country-card:not([hidden]) [data-eco] [data-animal-sci]').length }));
  check(/Biome/.test(card) && /Afrotropic/.test(card) && /savanna/i.test(card) && eco.animals >= 3,
    `Ecoregions: a tap in the Serengeti opens its card (biome, realm; ${eco.plants} of our plants, ${eco.animals} of our animals)`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // The breathing planet in April.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'greenness']));
  await page.waitForFunction(() => window.atlas.app.instance('greenness')?.ready || window.atlas.app.instance('greenness')?.error, null, { timeout: 30000 });
  await page.evaluate(() => window.atlas.app.setOption('greenness', 'month', '4'));
  await page.waitForTimeout(1000);
  const gr = await legend();
  const grOk = await page.evaluate(() => ({ ready: window.atlas.app.instance('greenness')?.ready, error: window.atlas.app.instance('greenness')?.error ?? null }));
  check(grOk.ready && /The breathing planet · April/.test(gr) && /Play the year/.test(gr), `The breathing planet: April's greenness from NASA (${grOk.error ?? 'drawn by the GPU'}), ◀ ▶ and Play the year`);

  // Nature's calendar in April, and What's on.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'calendar']));
  await page.waitForFunction(() => window.atlas.app.instance('calendar')?.ready, null, { timeout: 20000 });
  await page.evaluate(() => { window.atlas.app.setOption('calendar', 'month', '4'); (window.atlas.app.renderer.view.flyTo({ lon: 135.8, lat: 35, zoom: 3 }, 0), window.atlas.app.renderer.requestRender()); });
  await page.waitForTimeout(1000);
  const cal = await legend();
  await page.evaluate(() => [...document.querySelectorAll('.legend button')].find((b) => /What’s on this month/.test(b.textContent))?.click());
  await page.waitForTimeout(1500);
  const on = await page.evaluate(() => [...document.querySelectorAll('[data-green="whats-on"] [data-spectacle]')].map((x) => x.getAttribute('data-spectacle')));
  check(/Nature’s calendar · April/.test(cal) && on.length >= 10 && on.slice(0, 6).some((id) => /sakura|cherry|wisteria|nemophila/.test(id)),
    `Nature's calendar in April: ${on.length} spectacles, the nearest to Japan first (${on.slice(0, 3).join(', ')})`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Where our food first grew: maize's journey.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'crops']));
  await page.waitForFunction(() => window.atlas.app.instance('crops')?.ready, null, { timeout: 20000 });
  await page.evaluate(() => window.atlas.shell.search.open());
  await page.fill('.search-field', 'maize');
  await page.waitForTimeout(800);
  await page.evaluate(() => [...document.querySelectorAll('.search-item')].find((x) => /Maize/.test(x.querySelector('.si-label')?.textContent ?? ''))?.click());
  await page.waitForTimeout(2500);
  card = await cardText();
  await page.evaluate(() => { const b = [...document.querySelectorAll('.country-card button, .country-card a')].find((x) => /Show its journey/.test(x.textContent)); b?.click(); });
  await page.waitForTimeout(1500);
  const cr = await legend();
  check(/First grown/.test(card) && /BC/.test(card) && /its journey/.test(cr), `Where our food first grew: maize's card (first grown, BC) and its journey in the legend`);

  // The quizzes: tap where a plant grows; pick the month.
  await page.evaluate(() => window.atlas.app.setStack(['political']));
  await page.evaluate(() => window.atlas.learn['startQuiz']('grows', 'world'));
  await page.waitForTimeout(2000);
  const gq = await page.evaluate(() => ({ q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', at: window.atlas.learn.quiz?.qs[0]?.item?.at }));
  await page.evaluate((at) => (window.atlas.app.renderer.view.flyTo({ lon: at[0], lat: at[1], zoom: 3 }, 0), window.atlas.app.renderer.requestRender()), gq.at);
  await page.waitForTimeout(800);
  const gxy = await page.evaluate((at) => window.atlas.app.renderer.view.project(at[0], at[1]), gq.at);
  await page.mouse.click(gxy[0], gxy[1]);
  await page.waitForTimeout(800);
  const gfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.evaluate(() => window.atlas.learn['startQuiz']('season', 'world'));
  await page.waitForTimeout(2500);
  const sq = await page.evaluate(() => ({ q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((x) => x.textContent), id: window.atlas.learn.quiz?.qs[0]?.id }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt')?.click());
  await page.waitForTimeout(800);
  const sfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  check(/Where does this plant grow wild/.test(gq.q) && /Correct!/.test(gfb) && /best month/.test(sq.q) && sq.opts.length === 4 && sq.opts.every((o) => /^[A-Z][a-z]+$/.test(o)) && sfb.length > 20,
    `Where does it grow?: a tap where it grows scores ("${gfb.slice(0, 45)}"); When is it?: four months (${sq.opts.join(', ')}), then "${sfb.slice(0, 40)}"`);

  // A tour stop shows a tree's range.
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-tour="Giants and ancients: the great trees"]')?.click());
  await page.waitForTimeout(3500);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card button')].find((x) => x.getAttribute('aria-label') === 'Next')?.click());
  await page.waitForTimeout(3500);
  const tour = await page.evaluate(() => ({ focus: window.atlas.plants.info.focus, plants: window.atlas.app.isActive('plants'), trees: window.atlas.app.isActive('trees') }));
  check(tour.plants && tour.trees && tour.focus === 'sequoia-sempervirens', `Giants and ancients: its Hyperion stop shows where coast redwoods grow (${tour.focus})`);
  await page.evaluate(() => window.atlas.learn['stopTour']());

  // The travel guide's Facts tab: nature's calendar near Kyoto.
  await page.evaluate(() => window.atlas.guide.openCity('kyoto', 'facts'));
  await page.waitForTimeout(2500);
  const kyoto = await page.evaluate(() => [...document.querySelectorAll('[data-guide="spectacles"] [data-spectacle]')].map((x) => x.getAttribute('data-spectacle')));
  check(kyoto.includes('sakura-kyoto') && kyoto.includes('autumn-kyoto'), `Kyoto's Facts tab: nature's calendar nearby (${kyoto.slice(0, 4).join(', ')})`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Spanish.
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.evaluate(() => window.atlas.app.setStack(['political', 'plants']));
  await page.waitForFunction(() => window.atlas.app.instance('plants')?.ready, null, { timeout: 20000 });
  await page.waitForTimeout(1000);
  const es = await legend();
  check(/plantas donde crecen/.test(es) && /Árboles/.test(es) && /Cactus y suculentas/.test(es), 'Spanish: "plantas donde crecen", Árboles, Cactus y suculentas…');
  check(!errors.length, `no page errors in Green planet${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 30. Fixes from the phone test (v0.31.1), on a phone. A see-through picture (the Maya Long Count's glyphs) sits on
// paper on a dark card and full screen; the Long Count's card says 36 BC, as its story does, and "Open its story"
// opens the story paused with all its controls, its X going back to the inventions map; World Heritage's "Watch the
// list grow" has play and pause, a year slider (that stays put while the legend is redrawn) and a speed slider; a
// story opened from On this day has its controls, and its X comes back to the day; a quiz and the daily challenge
// put the filters away (no site names on "Where is…?") and bring them back after. A guided tour plays by itself
// and stops at its last stop; the screen stays on while a tour or a story plays. The travel guide leaves "← Montreal"
// after showing an animal or a park; an animal's call plays Commons' MP3 copy, and goes on in the small player when
// its card closes. An architect's trail: its dots open their cards, and a card's Show on the map flies there.
{
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political,inventions&c=-93,16.7,6&lang=en&theme=dark');
  await page.evaluate(() => window.atlas.app.setTheme('dark'));
  await page.waitForFunction(() => /\d+ inventions/.test(document.querySelector('.legend')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});

  // Pictures: a see-through PNG on paper, a JPEG as it is.
  // (A black ring on nothing, drawn by the page: a PNG keeps what is see-through, a JPEG fills it in.)
  const drawn = (type) => page.evaluate((type) => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.stroke(); return c.toDataURL(type); }, type);
  const png = await drawn('image/png');
  const pic = async (src) => {
    await page.evaluate((src) => window.atlas.shell.card.showCustom('🖼️', 'Picture', '', [], [], [], Promise.resolve(src)), src);
    await page.waitForFunction(() => { const i = document.querySelector('.country-card:not([hidden]) .card-img'); return i && !i.hidden; }, null, { timeout: 5000 }).catch(() => {});
    return page.evaluate(() => { const i = document.querySelector('.country-card:not([hidden]) .card-img'); return i ? { cls: i.className, bg: getComputedStyle(i).backgroundColor } : null; });
  };
  const p1 = await pic(png);
  await page.evaluate(() => document.querySelector('.country-card:not([hidden]) .card-img')?.click());
  await page.waitForTimeout(500);
  const z = await page.evaluate(() => { const i = document.querySelector('.zoom-img'); return i ? { cls: i.className, bg: getComputedStyle(i).backgroundColor } : null; });
  await page.keyboard.press('Escape');
  const jpg = await drawn('image/jpeg');
  const p2 = await pic(jpg);
  check(/see-through/.test(p1?.cls ?? '') && p1.bg === 'rgb(247, 244, 236)' && /see-through/.test(z?.cls ?? '') && z.bg === 'rgb(247, 244, 236)' && !/see-through/.test(p2?.cls ?? 'see-through'),
    `a see-through picture sits on paper on a dark card (${p1?.bg}) and full screen (${z?.bg}); a JPEG does not (${p2?.cls})`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // The Long Count: 36 BC on its card, and its story opened with all its controls.
  await page.evaluate(() => { window.atlas.app.renderer.view.flyTo({ lon: -93.004, lat: 16.7028, zoom: 7 }, 0); window.atlas.app.renderer.requestRender(); });
  await page.waitForTimeout(1200);
  const xy = await page.evaluate(() => window.atlas.app.renderer.view.project(-93.004, 16.7028));
  if (xy) await page.touchscreen.tap(xy[0], xy[1]);
  await page.waitForFunction(() => /Long Count/.test(document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? ''), null, { timeout: 8000 }).catch(() => {});
  const card = await page.evaluate(() => document.querySelector('.country-card:not([hidden]) .rows')?.textContent ?? '');
  check(/When\s*36 BC/.test(card), `the Long Count's card says 36 BC, as its story does (${/When[^W]*/.exec(card)?.[0] ?? card.slice(0, 40)})`);
  await page.evaluate(() => [...document.querySelectorAll('.country-card:not([hidden]) button')].find((b) => /Open its story/.test(b.textContent))?.click());
  await page.waitForSelector('.warbar', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const bar = await page.evaluate(() => {
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
    return { mode: window.atlas.app.mode, guided: !!document.querySelector('.warbar.guided'), exit: vis('.warbar .wb-exit'), play: vis('.warbar .tb-play'), nav: vis('.warbar .wb-nav'), paused: document.querySelector('.warbar .tb-play')?.getAttribute('aria-label'), title: document.querySelector('.warbar .wb-title')?.textContent ?? '' };
  });
  check(bar.mode === 'inventions' && !bar.guided && bar.exit && bar.play && bar.nav && bar.paused === 'Play', `"Open its story" opens the story paused with its play, steps and X (${bar.mode}: ${bar.title}; guided ${bar.guided}, X ${bar.exit}, play ${bar.play} "${bar.paused}", steps ${bar.nav})`);
  await page.evaluate(() => document.querySelector('.warbar .wb-exit')?.click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (document.querySelector('.legend-body')?.hidden) document.querySelector('.legend-toggle')?.click(); });
  const back = await page.evaluate(() => ({ mode: window.atlas.app.mode, bar: !!document.querySelector('.warbar'), stack: window.atlas.app.layers.map((l) => l.def.id).join(','), legend: document.querySelector('.legend')?.textContent ?? '' }));
  check(!back.mode && !back.bar && /inventions/.test(back.stack) && /\d+ inventions/.test(back.legend), `its X goes back to the inventions map (${back.stack}; ${/\d+ inventions/.exec(back.legend)?.[0]})`);

  // On this day: a story opened from the list has its controls, and its X comes back to the same day.
  await page.evaluate(() => window.atlas.learn['openOnThisDay'](new Date(2026, 10, 14)));
  await page.waitForSelector('.otd-story', { timeout: 30000 }).catch(() => {});
  const otdStory = await page.evaluate(() => document.querySelector('.otd-story')?.dataset.story ?? '');
  await page.evaluate(() => document.querySelector('.otd-story')?.click());
  await page.waitForSelector('.warbar', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const ob = await page.evaluate(() => {
    const x = document.querySelector('.warbar .wb-exit');
    return { mode: window.atlas.app.mode, guided: !!document.querySelector('.warbar.guided'), x: !!x && getComputedStyle(x).display !== 'none', label: x?.getAttribute('aria-label') ?? '' };
  });
  await page.evaluate(() => document.querySelector('.warbar .wb-exit')?.click());
  await page.waitForTimeout(2000);
  const od = await page.evaluate(() => ({ mode: window.atlas.app.mode, date: document.querySelector('.otd-date')?.textContent ?? '', open: !!document.querySelector('.otd-stories') }));
  check(!!otdStory && ob.mode === otdStory.split('/')[0] && !ob.guided && ob.x && /back to the list/.test(ob.label) && !od.mode && od.open && /14 November/.test(od.date),
    `On this day, 14 November: ${otdStory} opens with its controls, and its X ("${ob.label}") comes back to the list (${od.date})`);
  await page.evaluate(() => window.atlas.shell.sheet.close());
  await page.evaluate(() => window.atlas.app.setStack(['political', 'inventions']));

  // World Heritage: play, pause, the year and speed sliders, back to today's list.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'heritage']));
  await page.waitForFunction(() => /World Heritage sites/.test(document.querySelector('.legend')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => { if (document.querySelector('.legend-body')?.hidden) document.querySelector('.legend-toggle')?.click(); });
  await page.evaluate(() => [...document.querySelectorAll('.legend button')].find((b) => /Watch the list grow/.test(b.textContent))?.click());
  await page.waitForTimeout(1500);
  const seek0 = await page.$('.lg-seek');
  const y = () => page.evaluate(() => Number(/(\d{4}): [\d,]+ sites/.exec(document.querySelector('.legend')?.textContent ?? '')?.[1] ?? 0));
  const y1 = await y();
  await page.waitForTimeout(1500);
  const y2 = await y();
  const same = await page.evaluate((el) => el === document.querySelector('.lg-seek') && el.isConnected, seek0);
  check(y1 >= 1978 && y2 > y1 && same, `"Watch the list grow" plays (${y1} → ${y2}) under a year slider that stays put as the legend is redrawn (${same})`);
  await page.evaluate(() => document.querySelector('.lg-play')?.click());
  const p0 = await y();
  await page.waitForTimeout(1500);
  const p1y = await y();
  const play = await page.evaluate(() => document.querySelector('.lg-play')?.getAttribute('aria-label'));
  check(p0 === p1y && play === 'Play', `⏸ pauses it (${p0} → ${p1y}; the button now says ${play})`);
  await page.evaluate(() => { const s = document.querySelector('.lg-seek'); s.value = '2000'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(500);
  const at2000 = await page.evaluate(() => /2000: ([\d,]+) sites/.exec(document.querySelector('.legend')?.textContent ?? '')?.[1] ?? '');
  await page.evaluate(() => { const s = document.querySelector('.lg-speed'); s.value = '0'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const slow = await page.evaluate(() => document.querySelector('.lg-pace')?.textContent ?? '');
  await page.evaluate(() => document.querySelector('.lg-play')?.click());
  await page.waitForTimeout(2600);
  const s1 = await y();
  await page.evaluate(() => { const s = document.querySelector('.lg-speed'); s.value = s.max; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(300);
  const fast = await page.evaluate(() => document.querySelector('.lg-pace')?.textContent ?? '');
  await page.waitForTimeout(1500);
  const s2 = await y();
  check(Number(at2000.replace(/,/g, '')) > 500 && /0\.5 years a second/.test(slow) && s1 - 2000 <= 2 && /8 years a second/.test(fast) && s2 - s1 >= 6,
    `the year slider goes to 2000 (${at2000} sites); slowest ${slow} (2000 → ${s1} in 2.6 s), fastest ${fast} (→ ${s2} in 1.5 s)`);
  await page.evaluate(() => [...document.querySelectorAll('.legend button')].find((b) => /Back to today’s list/.test(b.textContent))?.click());
  await page.waitForTimeout(600);
  const today = await page.evaluate(() => ({ leg: document.querySelector('.legend')?.textContent ?? '', player: !!document.querySelector('.lg-player') }));
  check(/[\d,]+ World Heritage sites/.test(today.leg) && /Watch the list grow/.test(today.leg) && !today.player, `"Back to today’s list" ends the timeline (${/[\d,]+ World Heritage sites/.exec(today.leg)?.[0]})`);

  // A quiz puts the filters away and brings them back; so does the daily challenge.
  await page.evaluate(() => window.atlas.learn['startQuiz']('find', 'world'));
  await page.waitForFunction(() => window.atlas.learn.quiz?.kind === 'find', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const inQuiz = await page.evaluate(() => window.atlas.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id).join(','));
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.atlas.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id).join(','));
  check(inQuiz === 'political' && after === 'political,heritage', `"Where is…?" puts the World Heritage filter away (${inQuiz}) and brings it back after (${after})`);
  await page.evaluate(() => { try { for (const k of Object.keys(localStorage)) if (/daily/.test(k)) localStorage.removeItem(k); } catch {} });
  await page.evaluate(() => window.atlas.learn['startQuiz']('daily', 'world'));
  await page.waitForFunction(() => window.atlas.learn.quiz?.kind === 'daily', null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  const daily = await page.evaluate(() => ({ kind: window.atlas.learn.quiz?.kind, stack: window.atlas.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id).join(',') }));
  await page.evaluate(() => document.querySelector('.learn-card .tool-head button[aria-label="Close"]')?.click());
  await page.waitForTimeout(1500);
  const after2 = await page.evaluate(() => window.atlas.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id).join(','));
  check(daily.kind === 'daily' && daily.stack === 'political' && after2 === 'political,heritage', `the daily challenge puts the filters away too (${daily.stack}) and its X brings them back (${after2})`);
  check(!errors.length, `no page errors in the phone-test fixes${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
{
  // A guided tour plays by itself from its first stop and stops at its last (↺ plays it again); the screen is kept
  // on while a tour or a story plays (the Screen Wake Lock, answered here by a stand-in that records each lock).
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {}
    window.__wake = { held: 0, asked: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      window.__wake.asked++; window.__wake.held++;
      let gone = false;
      return { release: async () => { if (!gone) { gone = true; window.__wake.held--; } }, addEventListener() {} };
    } } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=0,20,1.2&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-tour="Giants and ancients: the great trees"]')?.click());
  await page.waitForSelector('.learn-card:not([hidden]) .tour-auto', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const t0 = await page.evaluate(() => ({ auto: window.atlas.learn['tour']?.auto, state: document.querySelector('.tour-auto')?.dataset.state, n: window.atlas.learn['tour']?.steps.length, wake: { ...window.__wake } }));
  check(t0.auto === true && t0.state === 'playing' && t0.wake.held === 1, `a guided tour plays by itself from its first stop (${t0.state}) and keeps the screen on (${t0.wake.held} lock held)`);
  // To the last stop; it plays on to its end and stops there.
  await page.evaluate(() => { const tr = window.atlas.learn['tour']; tr.i = tr.steps.length - 2; document.querySelector('.learn-card [aria-label="Next"]')?.click(); });
  await page.waitForFunction(() => document.querySelector('.tour-auto')?.dataset.state === 'again', null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const t1 = await page.evaluate(() => ({ i: window.atlas.learn['tour']?.i, auto: window.atlas.learn['tour']?.auto, state: document.querySelector('.tour-auto')?.dataset.state, title: document.querySelector('.tour-auto')?.getAttribute('title'), wake: { ...window.__wake } }));
  check(t1.i === t0.n - 1 && t1.auto === false && t1.state === 'again' && t1.wake.held === 0, `at its end it stays on its last stop (${(t1.i ?? 0) + 1}/${t0.n}, "${t1.title}") instead of starting over, and lets the screen sleep (${t1.wake.held} held)`);
  await page.evaluate(() => document.querySelector('.tour-auto')?.click());
  await page.waitForTimeout(2500);
  const t2 = await page.evaluate(() => ({ i: window.atlas.learn['tour']?.i, auto: window.atlas.learn['tour']?.auto, held: window.__wake.held }));
  await page.evaluate(() => window.atlas.learn['stopTour']());
  await page.waitForTimeout(500);
  const t3 = await page.evaluate(() => window.__wake.held);
  check(t2.i === 0 && t2.auto === true && t2.held === 1 && t3 === 0, `↺ plays it again from its first stop (${(t2.i ?? 0) + 1}, held ${t2.held}); closing the tour lets go of the screen (${t3})`);
  // A Time travel story playing keeps the screen on; paused, it does not.
  await page.evaluate(() => window.atlas.time.stories.eras.open('scientific-revolution'));
  await page.waitForSelector('.warbar', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const s1 = await page.evaluate(() => ({ playing: document.querySelector('.warbar .tb-play')?.getAttribute('aria-label') === 'Pause', held: window.__wake.held }));
  await page.evaluate(() => document.querySelector('.warbar .tb-play')?.click());
  await page.waitForTimeout(500);
  const s2 = await page.evaluate(() => window.__wake.held);
  await page.evaluate(() => document.querySelector('.warbar .wb-exit')?.click());
  await page.waitForTimeout(800);
  check(s1.playing && s1.held === 1 && s2 === 0, `a story playing keeps the screen on (${s1.held} held); paused, it lets it sleep (${s2})`);
  check(!errors.length, `no page errors in the tour and wake checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
{
  // The travel guide: an animal or a park opened from Montreal's See tab leaves "← Montreal", back to the same tab. An
  // animal's call plays Commons' MP3 copy (answered here by a stand-in tone) with the app's player; closed, its card
  // leaves the small player in the top bar, whose ■ stops it.
  const n = 8000 * 20, wav = Buffer.alloc(44 + n);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + n, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write('data', 36); wav.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) wav[44 + i] = 128 + Math.round(60 * Math.sin((2 * Math.PI * 330 * i) / 8000));
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=-73.6,45.5,5&lang=en');
  const asked = [];
  await ctx.route('https://upload.wikimedia.org/**', (route) => {
    const u = route.request().url();
    if (!/\/transcoded\/|\.(ogg|oga|opus|mp3|flac|wav)$/i.test(u)) return route.continue();
    asked.push(u);
    const m = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '');
    if (!m) return route.fulfill({ status: 200, body: wav, contentType: 'audio/wav', headers: { 'accept-ranges': 'bytes' } });
    const a = Number(m[1]), b = m[2] ? Math.min(Number(m[2]), wav.length - 1) : wav.length - 1;
    return route.fulfill({ status: 206, body: wav.subarray(a, b + 1), contentType: 'audio/wav', headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${a}-${b}/${wav.length}` } });
  });
  await page.evaluate(() => window.atlas.guide.openCity('montreal', 'see'));
  await page.waitForSelector('[data-guide="wildlife"] [data-animal]', { timeout: 30000 }).catch(() => {});
  // An animal with a call (the moose, if it is one of Montreal's).
  const pick = await page.evaluate(async () => {
    const ids = [...document.querySelectorAll('[data-guide="wildlife"] [data-animal]')].map((b) => b.dataset.animal);
    const d = await (await fetch('data/wild/animals.json')).json();
    const withCall = ids.filter((id) => d.animals.find((a) => a.id === id)?.snd);
    return withCall.includes('alces-alces') ? 'alces-alces' : withCall[0] ?? ids[0];
  });
  await page.evaluate((id) => document.querySelector(`[data-guide="wildlife"] [data-animal="${id}"]`)?.click(), pick);
  await page.waitForTimeout(1200);
  const g1 = await page.evaluate(() => ({ card: document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? '', back: document.querySelector('.guide-back')?.textContent ?? '', sheet: !!document.querySelector('.sheet:not([hidden])') }));
  // Its call.
  await page.evaluate(() => document.querySelector('.country-card:not([hidden]) .wild-sound .clip-play')?.click());
  await page.waitForFunction(() => /playing/.test(document.querySelector('.country-card:not([hidden]) .wild-sound .item-clip')?.className ?? ''), null, { timeout: 10000 }).catch(() => {});
  const call = await page.evaluate(() => ({ cls: document.querySelector('.country-card:not([hidden]) .wild-sound .item-clip')?.className ?? '', native: !!document.querySelector('.country-card audio') }));
  check(!!g1.card && /Montreal/.test(g1.back) && /playing/.test(call.cls) && !call.native && asked.some((u) => /\/transcoded\/.+\.mp3$/.test(u)),
    `an animal from Montreal's See tab (${g1.card}) leaves "${g1.back.trim()}"; its call plays Commons' MP3 copy in the app's player (${asked.length} asked: ${(asked[0] ?? '').replace(/^.*\//, '')})`);
  // Its card closed: the call goes on, in the small player; its ■ stops it.
  await page.evaluate(() => document.querySelector('.country-card:not([hidden]) .card-close')?.click());
  await page.waitForFunction(() => { const m = document.querySelector('.clip-mini'); return m && !m.hidden; }, null, { timeout: 5000 }).catch(() => {});
  const mini = await page.evaluate(() => ({ shown: !document.querySelector('.clip-mini')?.hidden, name: document.querySelector('.clip-mini-name')?.textContent ?? '', playing: !document.querySelector('audio') || true }));
  await page.evaluate(() => document.querySelector('.clip-mini-stop')?.click());
  await page.waitForTimeout(600);
  const stopped = await page.evaluate(() => !!document.querySelector('.clip-mini')?.hidden);
  check(mini.shown && !!mini.name && stopped, `with its card closed the call goes on in the small player ("${mini.name}"), and its ■ stops it (${stopped ? 'gone' : 'still there'})`);
  // Back to Montreal, on its See tab; then a park, and back again.
  await page.evaluate(() => document.querySelector('.guide-back-go')?.click());
  await page.waitForTimeout(1200);
  const g2 = await page.evaluate(() => ({ city: document.querySelector('.guide-city')?.dataset.city, tab: document.querySelector('.guide-tabs .chip.on')?.dataset.tab, chip: !!document.querySelector('.guide-back') }));
  // A sight in Paris opens its story; "← Paris" leaves the story and comes back.
  await page.evaluate(() => window.atlas.guide.openCity('paris', 'see'));
  await page.waitForSelector('.guide-city [data-sight]', { timeout: 20000 }).catch(() => {});
  const park = await page.evaluate(() => { const b = document.querySelector('.guide-city [data-sight]'); b?.click(); return b?.querySelector('.guide-item-title')?.textContent ?? ''; });
  await page.waitForTimeout(2500);
  const g3 = await page.evaluate(() => ({ back: /Paris/.test(document.querySelector('.guide-back')?.textContent ?? ''), mode: window.atlas.app.mode }));
  await page.evaluate(() => document.querySelector('.guide-back-go')?.click());
  await page.waitForTimeout(1200);
  const g4 = await page.evaluate(() => (window.atlas.app.mode ? `still in ${window.atlas.app.mode}` : document.querySelector('.guide-city')?.dataset.city));
  // Its X closes the guide without leaving a way back.
  await page.evaluate(() => window.atlas.shell.sheet.isOpen('guide-city') && document.querySelector('.sheet-head .icon-btn')?.click());
  await page.waitForTimeout(600);
  const g5 = await page.evaluate(() => !!document.querySelector('.guide-back'));
  check(g2.city === 'montreal' && g2.tab === 'see' && !g2.chip && !!park && g3.back && !!g3.mode && g4 === 'paris' && !g5,
    `"← Montreal" reopens its See tab (${g2.city}, ${g2.tab}); a sight in Paris (${park}) opens its story (${g3.mode}) and "← Paris" leaves it for the guide (${g4}); the guide's own X leaves no way back`);
  check(!errors.length, `no page errors in the travel guide's way back and the calls${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
{
  // An architect's trail on the map: a tap on a dot opens its building's card, whose "Show on the map" flies there;
  // the trail's chip takes it off the map. A building opened from a city's guide goes on the map as a dot of its own.
  const { page, errors, ctx } = await open({ ...devices['Pixel 7'] }, '#p=globe&l=political&c=2.17,41.4,5&lang=en');
  await page.evaluate(() => window.atlas.guide.load());
  const gaudi = await page.evaluate(async () => { const r = await fetch('data/artguide/architecture.json').then((x) => x.json()); return r.architects.find((a) => a[1] === 'Antoni Gaudí')[0]; });
  await page.evaluate((id) => window.atlas.art.openArchitect(id), gaudi);
  await page.waitForSelector('[data-art="map"]', { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-art="map"]')?.click());
  await page.waitForTimeout(2500);
  // Close in on Barcelona, where his buildings are, and tap the Sagrada Família's dot.
  const pt = await page.evaluate(() => window.atlas.art['trail']?.pts.find((p) => /Sagrada|Holy Family/.test(p.label)) ?? null);
  await page.evaluate((at) => { window.atlas.app.renderer.view.flyTo({ lon: at[0], lat: at[1], zoom: 14 }, 0); window.atlas.app.renderer.requestRender(); }, pt?.at ?? [2.17, 41.4]);
  await page.waitForTimeout(1500);
  const chip = await page.evaluate(() => document.querySelector('.art-trail-chip')?.textContent ?? '');
  const xy = await page.evaluate((at) => window.atlas.app.renderer.view.project(at[0], at[1]), pt?.at ?? [0, 0]);
  if (xy) await page.touchscreen.tap(xy[0], xy[1]);
  await page.waitForTimeout(1200);
  const card = await page.evaluate(() => ({ title: document.querySelector('.country-card:not([hidden]) .card-title')?.textContent ?? '', links: [...document.querySelectorAll('.country-card:not([hidden]) .card-actions .pill')].map((b) => b.textContent) }));
  check(!!pt && /Antoni Gaudí/.test(chip) && /Sagrada|Holy Family/.test(card.title) && card.links.includes('Show on the map'), `Gaudí's trail on the map ("${chip.trim()}"): a tap on a dot opens ${card.title}, with Show on the map (${card.links.join(', ')})`);
  // Show on the map: the card goes, the map stays on the trail at the place.
  await page.evaluate(() => window.atlas.app.renderer.view.flyTo({ lon: 0, lat: 20, zoom: 3 }, 0));
  await page.evaluate(() => [...document.querySelectorAll('.country-card:not([hidden]) .card-actions .pill')].find((b) => b.textContent === 'Show on the map')?.click());
  await page.waitForTimeout(2500);
  const there = await page.evaluate((at) => { const v = window.atlas.app.renderer.view; return { card: !!document.querySelector('.country-card:not([hidden])'), near: Math.abs(v.lon - at[0]) < 0.05 && Math.abs(v.lat - at[1]) < 0.05, zoom: v.zoom, n: window.atlas.art['trail']?.pts.length }; }, pt?.at ?? [0, 0]);
  check(!there.card && there.near && there.zoom >= 13 && there.n > 1, `Show on the map flies to it (zoom ${Math.round(there.zoom)}) with the card put away, the trail kept (${there.n} dots)`);
  await page.evaluate(() => document.querySelector('.art-trail-x')?.click());
  await page.waitForTimeout(400);
  const off = await page.evaluate(() => ({ trail: window.atlas.art['trail'], chip: !!document.querySelector('.art-trail-chip') }));
  // A building from Barcelona's Buildings tab: Show on the map puts it on the map as its own dot.
  await page.evaluate(() => window.atlas.guide.openCity('barcelona', 'buildings'));
  await page.waitForSelector('.guide-tab [data-building]', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.guide-tab [data-building]')?.click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => [...document.querySelectorAll('.country-card:not([hidden]) .card-actions .pill')].find((b) => b.textContent === 'Show on the map')?.click());
  await page.waitForTimeout(2500);
  const one = await page.evaluate(() => ({ n: window.atlas.art['trail']?.pts.length, chip: document.querySelector('.art-trail-chip')?.textContent ?? '' }));
  check(off.trail === null && !off.chip && one.n === 1 && !!one.chip, `the chip's ✕ takes the trail off the map; a building from Barcelona's guide goes on the map as its own dot ("${one.chip.trim()}")`);
  check(!errors.length, `no page errors on the art trails${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 31. Trip planner and your data on another device (v0.31.2), on a phone. ☆ in Madrid's guide puts the Prado, Las
// Meninas (in the Prado), a World Heritage site and a dish into the trip; a building's card does the same; the trip
// panel lists each city's places, which move and go; Van Gogh's trail brings his museums with the works in each;
// the trip's details; the plan copied for an AI assistant and downloaded as JSON; the share link carries the places;
// the printed trip lists them. A backup brings everything to another device; one edited by hand brings the trip but
// not the badges.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org|wikivoyage\.org/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=-3.7,40.4,5&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const places = () => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('atlas-globe:trip-places') || '{}').places ?? {}; } catch { return {}; } });
  const star = (sel) => page.evaluate((sel) => { const b = document.querySelector(sel); b?.click(); return !!b; }, sel);
  // Madrid: the Prado (Museums), Las Meninas (Art), a World Heritage site (See), a dish (Eat).
  await page.evaluate(() => window.atlas.guide.openCity('madrid', 'museums'));
  await page.waitForSelector('[data-plan="museum:Q160112"]', { timeout: 20000 }).catch(() => {});
  await star('[data-plan="museum:Q160112"]');
  await page.waitForTimeout(400);
  const on1 = await page.evaluate(() => document.querySelector('[data-plan="museum:Q160112"]')?.getAttribute('aria-pressed'));
  await page.evaluate(() => window.atlas.guide.openCity('madrid', 'art'));
  await page.waitForSelector('.guide-tab [data-work]', { timeout: 20000 }).catch(() => {});
  const meninas = await page.evaluate(() => { const r = [...document.querySelectorAll('.guide-tab .guide-item-wrap')].find((w) => /Las Meninas/.test(w.textContent)); const b = r?.querySelector('.plan-star'); b?.click(); return b?.dataset.plan ?? ''; });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.atlas.guide.openCity('madrid', 'see'));
  await page.waitForSelector('.guide-tab [data-plan^="whs:"]', { timeout: 20000 }).catch(() => {});
  await star('.guide-tab [data-plan^="whs:"]');
  await page.evaluate(() => window.atlas.guide.openCity('madrid', 'eat'));
  await page.waitForSelector('.guide-tab [data-plan^="dish:"]', { timeout: 20000 }).catch(() => {});
  await star('.guide-tab [data-plan^="dish:"]');
  await page.waitForTimeout(400);
  let pl = await places();
  const prado = (pl.madrid ?? []).find((p) => p.id === 'museum:Q160112');
  check(on1 === 'true' && !!meninas && prado?.why?.some((w) => /Las Meninas/.test(w.t[0])) && (pl.madrid ?? []).some((p) => p.kind === 'whs') && (pl.madrid ?? []).some((p) => p.kind === 'dish'),
    `☆ in Madrid's guide: the Prado, Las Meninas in it (${(prado?.why ?? []).map((w) => w.t[0]).join(', ')}), a World Heritage site and a dish (${(pl.madrid ?? []).map((p) => p.id).join(', ')})`);
  // A building's card: ☆ Add to my trip, under its city (Barcelona joins the trip).
  await page.evaluate(() => window.atlas.guide.openCity('barcelona', 'buildings'));
  await page.waitForSelector('.guide-tab [data-building]', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.guide-tab [data-building]')?.click());
  await page.waitForTimeout(1200);
  await page.evaluate(() => [...document.querySelectorAll('.country-card:not([hidden]) .card-actions .pill')].find((b) => /Add to my trip/.test(b.textContent))?.click());
  await page.waitForTimeout(600);
  const cardBtn = await page.evaluate(() => [...document.querySelectorAll('.country-card:not([hidden]) .card-actions .pill')].map((b) => b.textContent).find((t) => /my trip/.test(t)) ?? '');
  pl = await places();
  const trip1 = await page.evaluate(() => window.atlas.guide.info.trip);
  check(/In my trip/.test(cardBtn) && (pl.barcelona ?? []).some((p) => p.kind === 'building') && trip1.includes('madrid') && trip1.includes('barcelona'), `a building's card: "${cardBtn}", under Barcelona, which joins the trip (${trip1.join(', ')})`);
  await page.evaluate(() => window.atlas.shell.card.hide());
  // The trip panel: each city's places; one moves down, one goes.
  await page.evaluate(() => window.atlas.guide.open());
  await page.waitForSelector('[data-trip-places="madrid"]', { timeout: 15000 }).catch(() => {});
  const listed = await page.evaluate(() => [...document.querySelectorAll('[data-trip-places="madrid"] [data-trip-place]')].map((b) => b.dataset.tripPlace));
  await page.evaluate(() => document.querySelector('[data-trip-places="madrid"] .guide-place-row [aria-label="Later"]')?.click());
  await page.waitForTimeout(500);
  const moved = await page.evaluate(() => [...document.querySelectorAll('[data-trip-places="madrid"] [data-trip-place]')].map((b) => b.dataset.tripPlace));
  await page.evaluate(() => [...document.querySelectorAll('[data-trip-places="madrid"] .guide-place-row')].find((r) => /dish:/.test(r.querySelector('[data-trip-place]')?.dataset.tripPlace ?? ''))?.querySelector('[aria-label="Take it out"]')?.click());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => [...document.querySelectorAll('[data-trip-places="madrid"] [data-trip-place]')].map((b) => b.dataset.tripPlace));
  check(listed.length === 3 && moved[0] === listed[1] && moved[1] === listed[0] && after.length === 2 && !after.some((x) => /^dish:/.test(x)), `the trip panel lists Madrid's places (${listed.join(', ')}); one moves down, the dish goes (${after.join(', ')})`);
  // The trip's details.
  await page.evaluate(() => { const d = document.querySelector('[data-guide="details"]'); if (d) d.open = true; });
  const fill = async (sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, 'change'); };
  await fill('[data-trip-detail="start"]', '2027-04-10');
  await fill('[data-trip-detail="passport"]', 'Mexico');
  await fill('[data-trip-days="madrid"]', '3');
  await page.selectOption('[data-trip-detail="pace"]', 'relaxed');
  const det = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-globe:trip-details') || '{}'));
  check(det.start === '2027-04-10' && det.passport === 'Mexico' && det.days?.madrid === 3 && det.pace === 'relaxed', `the trip's details are kept (${JSON.stringify(det)})`);
  // The plan for an AI assistant, copied; and as JSON.
  await page.evaluate(() => document.querySelector('[data-export="copy"]')?.click());
  await page.waitForTimeout(600);
  const md = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const dl = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await page.evaluate(() => document.querySelector('[data-export="json"]')?.click());
  const d1 = await dl;
  const js = d1 ? JSON.parse(fs.readFileSync(await d1.path(), 'utf8')) : null;
  check(/^# My trip: Madrid → Barcelona/.test(md) && /Museo del Prado/.test(md) && /Las Meninas/.test(md) && /Passport: Mexico/.test(md) && /\(3 days\)/.test(md) && /What I would like from you/.test(md) && /visa/.test(md)
    && js?.cities?.[0]?.id === 'madrid' && js.cities[0].places.some((p) => p.id === 'museum:Q160112') && js.details?.passport === 'Mexico',
    `the plan copied for an AI assistant (${md.split('\n').length} lines: the Prado with Las Meninas, the passport, the request) and as JSON (${js?.cities?.length} cities)`);
  // The share link carries the places: opened on another phone, the same trip and places.
  const link = await page.evaluate(() => window.atlas.guide.shareUrlWithPlaces());
  const other = await browser.newContext({ ...devices['Pixel 7'] });
  await other.route(/wikidata\.org|wikimedia\.org|wikipedia\.org|wikivoyage\.org/, (r) => r.abort());
  const p2 = await other.newPage();
  await p2.goto(link.replace(/^https?:\/\/[^/]+\/(globe\/)?/, url), { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await p2.waitForFunction(() => window.atlas, null, { timeout: 60000 });
  await p2.waitForTimeout(3000);
  const shared = await p2.evaluate(() => ({ trip: window.atlas.guide.info.trip, places: Object.fromEntries(Object.entries(JSON.parse(localStorage.getItem('atlas-globe:trip-places') || '{}').places ?? {}).map(([k, v]) => [k, v.map((p) => p.id)])) }));
  await other.close();
  check(/&tp=z/.test(link) && shared.trip.join() === 'madrid,barcelona' && shared.places.madrid?.includes('museum:Q160112') && shared.places.barcelona?.length === 1, `the share link carries the places (${link.length} characters): opened elsewhere, ${JSON.stringify(shared.places)}`);
  // The printed trip lists them.
  const printed = await page.evaluate(async () => (await window.atlas.guide.printView()).textContent);
  check(/My places/.test(printed) && /Museo del Prado \(Las Meninas/.test(printed) && /3 days/.test(printed), `the printed trip lists each city's places (${/My places[^·]*/.exec(printed)?.[0].slice(0, 70)})`);
  // Van Gogh's trail: Plan a trip brings his museums, with his works in each.
  // (From an empty trip: Clear takes the cities and their places.)
  await page.evaluate(() => window.atlas.guide.open());
  await page.waitForSelector('[data-guide="clear"]', { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-guide="clear"]')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.atlas.art.openArtist('Q5582'));
  await page.waitForSelector('[data-art="plan"]', { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-art="plan"]')?.click());
  await page.waitForTimeout(2500);
  pl = await places();
  const vg = Object.values(pl).flat();
  const best = vg.sort((a, b) => (b.why?.length ?? 0) - (a.why?.length ?? 0))[0];
  check(vg.length >= 10 && vg.every((p) => p.kind === 'museum') && (best?.why?.length ?? 0) >= 5 && Object.keys(pl).includes('amsterdam'), `Van Gogh's trail: ${vg.length} museums in ${Object.keys(pl).length} cities, ${best?.n?.[0]} with ${best?.why?.length} of his works (${(best?.why ?? []).slice(0, 2).map((w) => w.t[0]).join(', ')}…)`);
  // A backup, brought to another device.
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}'); p.badges = { ...(p.badges ?? {}), 'test-badge': '2026-11-16' }; localStorage.setItem('atlas-globe:progress', JSON.stringify(p)); });
  await page.evaluate(() => window.atlas.shell.openSettings());
  await page.waitForSelector('[data-backup="save"]', { timeout: 10000 }).catch(() => {});
  const dl2 = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await page.evaluate(() => document.querySelector('[data-backup="save"]')?.click());
  const d2 = await dl2;
  const file = d2 ? await d2.path() : null;
  const backup = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const restore = async (path) => {
    const c = await browser.newContext({ ...devices['Pixel 7'] });
    await c.route(/wikidata\.org|wikimedia\.org|wikipedia\.org|wikivoyage\.org/, (r) => r.abort());
    const q = await c.newPage();
    await q.goto(url + '#p=globe&l=political&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await q.waitForFunction(() => window.atlas, null, { timeout: 60000 });
    await q.waitForTimeout(800);
    await q.evaluate(() => window.atlas.shell.openSettings());
    await q.waitForSelector('[data-backup="file"]', { state: 'attached', timeout: 10000 }).catch(() => {});
    await q.setInputFiles('[data-backup="file"]', path);
    await q.waitForSelector('[data-backup="replace"]', { timeout: 10000 }).catch(() => {});
    const shown = await q.evaluate(() => ({ text: document.querySelector('.backup-status')?.textContent ?? '', unsealed: !!document.querySelector('[data-backup="unsealed"]') }));
    await Promise.all([q.waitForEvent('load', { timeout: 15000 }).catch(() => {}), q.evaluate(() => document.querySelector('[data-backup="replace"]')?.click())]);
    await q.waitForFunction(() => window.atlas, null, { timeout: 60000 });
    await q.waitForTimeout(1500);
    const got = await q.evaluate(() => ({ trip: window.atlas.guide.info.trip.length, places: Object.values(JSON.parse(localStorage.getItem('atlas-globe:trip-places') || '{}').places ?? {}).flat().length, badge: !!JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').badges?.['test-badge'] }));
    await c.close();
    return { shown, got };
  };
  const r1 = file ? await restore(file) : null;
  check(!!backup?.seal && backup.data?.['atlas-globe:trip-places'] && r1 && !r1.shown.unsealed && /badge/.test(r1.shown.text) && r1.got.trip >= 5 && r1.got.places >= 10 && r1.got.badge,
    `a backup (${Object.keys(backup?.data ?? {}).length} items, sealed) brought to another device: "${(r1?.shown.text ?? '').slice(0, 80)}"; its trip (${r1?.got.trip} cities, ${r1?.got.places} places) and badges are there`);
  // Edited by hand to add a badge: the trip comes over, the badges don't.
  let r2 = null;
  if (backup) {
    const t = JSON.parse(JSON.stringify(backup));
    const p = JSON.parse(t.data['atlas-globe:progress']); p.badges['made-up'] = '2026-11-16'; t.data['atlas-globe:progress'] = JSON.stringify(p);
    const tampered = file + '-edited.json';
    fs.writeFileSync(tampered, JSON.stringify(t));
    r2 = await restore(tampered);
  }
  check(r2 && r2.shown.unsealed && r2.got.trip >= 5 && !r2.got.badge, `a backup edited by hand: it says so; the trip comes over (${r2?.got.trip} cities), the badges don't (${r2?.got.badge ? 'there' : 'not there'})`);
  check(!errors.length, `no page errors in the trip planner and the backup${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 32. Ambient Green planet and steady names (v0.31.3), on a phone. While the globe turns, no name is cut off for a
// frame and back (a simulated 60 fps clock: names lost to a neighbour fade out instead), and the map stops drawing
// once the names have faded in. Ambient mode shows only the view's own names by default (a little smaller), all or
// none as chosen in Settings or the screensaver's panel, and puts the map's names back afterwards, saved or not. The
// Green planet's deserts and strange plants play over ecoregions with captions that say what is where. The legend's
// selects are the same width. The Outline game frames a country's main body (the Netherlands without the Caribbean).
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org|wikivoyage\.org/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=10,46,3&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // Turning the globe, 150 frames at 60 fps (the clock is simulated: this browser draws slower than a phone).
  const turn = await page.evaluate(async () => {
    const app = window.atlas.app, v = app.renderer.view, L = app.renderer.labels;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const realNow = performance.now.bind(performance);
    let virt = realNow();
    performance.now = () => virt;
    const full = [], seen = [], cands = [];
    try {
      v.lon = 0; v.lat = 46; v.zoom = 3; app.renderer.requestRender();
      for (let i = 0; i < 10; i++) { virt += 16.7; await raf(); }
      for (let i = 0; i < 150; i++) {
        v.lon += 0.35; virt += 16.7; app.renderer.requestRender();
        await raf();
        full.push(new Set(L.drawn.map((d) => d.text)));
        seen.push(new Set([...L.drawn.map((d) => d.text), ...L.ghosts]));
        cands.push(new Set(L.items.map((l) => (l.caps ? l.text.toUpperCase() : l.text))));
      }
    } finally { performance.now = realNow; }
    // A cut: a name drawn in full, then gone without fading while still on the map, and back within 10 frames.
    let cuts = 0, fades = 0;
    for (let i = 1; i < seen.length - 1; i++) for (const n of full[i - 1]) {
      if (!full[i].has(n) && seen[i].has(n)) fades++;
      if (seen[i].has(n) || !cands[i].has(n)) continue;
      for (let j = i + 1; j < Math.min(seen.length, i + 11); j++) if (seen[j].has(n)) { cuts++; break; }
    }
    return { cuts, fades, avg: Math.round(full.reduce((a, f) => a + f.size, 0) / full.length) };
  });
  await page.waitForTimeout(1500);
  const still = await page.evaluate(() => window.atlas.app.renderer.labels.fading);
  check(turn.cuts === 0 && turn.avg >= 40 && !still,
    `turning the globe: no name cut off and back (${turn.cuts} cuts in 150 frames, ${turn.avg} names a frame, ${turn.fades} faded out instead); still, the names stop fading`);

  // Ambient mode, the view's own names (the default): the map's countries, cities and seas go, the filter's stay, a
  // little smaller; after it, the names are back, and what was saved meanwhile kept them.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'plants']));
  await page.evaluate(() => window.atlas.app.renderer.view.flyTo({ lon: -105, lat: 28, zoom: 3.4 }, 10));
  await page.waitForTimeout(2500);
  const before = await page.evaluate(() => { const r = window.atlas.app.renderer; return { scale: r.settings.labelScale, labels: { ...r.settings.labels }, names: r.labels.drawn.map((d) => d.text) }; });
  const amb = async (names) => {
    await page.evaluate((names) => { window.atlas.app.ambient.names = names; return window.atlas.shell.ambient.start(''); }, names);
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.atlas.app.save());
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const r = window.atlas.app.renderer; const saved = JSON.parse(localStorage.getItem('atlas-globe:v1') || '{}'); return { scale: r.settings.labelScale, countries: r.settings.labels.countries, cities: r.settings.labels.cities, layer: r.layerLabels, names: r.labels.drawn.map((d) => d.text), saved: saved.labels?.countries, savedScale: saved.labelScale }; });
    await page.evaluate(() => window.atlas.shell.ambient.stop());
    await page.waitForTimeout(800);
    return r;
  };
  const plantName = (names) => names.some((n) => /Saguaro|cholla|Agave|Peyote|Prickly pear|cardón|Organ pipe|barrel/i.test(n));
  const countryName = (names) => names.some((n) => /^(MEXICO|UNITED STATES)$/.test(n));
  const v1 = await amb('view');
  const after = await page.evaluate(() => { const r = window.atlas.app.renderer; return { scale: r.settings.labelScale, countries: r.settings.labels.countries, layer: r.layerLabels }; });
  check(countryName(before.names) && !v1.countries && !v1.cities && v1.layer && Math.abs(v1.scale - before.scale * 0.85) < 0.01 && !countryName(v1.names) && !v1.names.some((n) => /^[A-Z ]{4,}$/.test(n))
    && v1.saved !== false && Math.abs((v1.savedScale ?? 1) - before.scale) < 0.01 && after.countries === before.labels.countries && after.scale === before.scale && after.layer,
    `ambient mode with the view's names: no country, state or sea names (${v1.names.length} names: ${v1.names.slice(0, 4).join(', ')}), at ${v1.scale.toFixed(2)}×; afterwards the names are back (saved meanwhile: countries ${v1.saved}, ${v1.savedScale}×)`);
  const v2 = await amb('none');
  const v3 = await amb('all');
  // (Names keep off the clock too, so which countries are named depends on where the clock is: any will do.)
  check(v2.names.length === 0 && !v2.layer && v3.names.some((n) => /^[A-Z][A-Z .'-]{3,}$/.test(n)),
    `ambient names: None shows none (${v2.names.length}); All shows the map's (${v3.names.length}: ${v3.names.slice(0, 4).join(', ')})`);

  // The setting is in Settings (and in the screensaver's panel), in Spanish too, and is kept.
  await page.evaluate(() => window.atlas.shell.openSettings(true));
  await page.waitForTimeout(500);
  const segs = await page.$$eval('.ambient-names .seg-btn', (b) => b.map((x) => x.textContent));
  await page.evaluate(() => [...document.querySelectorAll('.ambient-names .seg-btn')].find((b) => /None/.test(b.textContent))?.click());
  await page.waitForTimeout(700);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-globe:v1') || '{}').ambient?.names);
  await page.evaluate(() => window.atlas.app.setLang('es'));
  await page.evaluate(() => window.atlas.shell.openScreensaver());
  await page.waitForTimeout(500);
  const esSeg = await page.evaluate(() => document.querySelector('.ambient-names')?.textContent ?? '');
  await page.evaluate(() => { window.atlas.app.setLang('en'); window.atlas.app.ambient.names = 'view'; window.atlas.shell.sheet?.close?.(); });
  check(segs.join('|') === 'Only the view’s|All|None' && kept === 'none' && /Nombres en el mapa/.test(esSeg) && /Solo los de la vista/.test(esSeg),
    `"Names on the map" in Settings (${segs.join(', ')}); None is kept; in Spanish in the screensaver's panel ("${esSeg.slice(0, 50)}")`);

  // The Green planet: the deserts of North America and Borneo's strange plants over the ecoregions, with captions.
  await page.evaluate(() => { const a = window.atlas.app.ambient; a.secs = 60; a.narrate = false; a.names = 'view'; });
  await page.evaluate(() => window.atlas.shell.ambient.start('green'));
  await page.waitForTimeout(800);
  const view = async (k) => {
    await page.evaluate((k) => { const a = window.atlas.shell.ambient; a.idx = k - 1; void a.next(); }, k);
    await page.waitForFunction((k) => window.atlas.shell.ambient.info.index === k, k, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    return page.evaluate(() => {
      const app = window.atlas.app;
      return { ...window.atlas.shell.ambient.info, layers: app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id), opts: Object.fromEntries(app.layers.map((l) => [l.def.id, l.options])), cap: document.querySelector('.amb-caption')?.innerText ?? '', names: app.renderer.labels.drawn.map((d) => d.text), cam: app.renderer.view.camera() };
    });
  };
  const desert = await view(2);
  await page.evaluate(() => window.atlas.app.save());
  await page.waitForTimeout(700);
  const savedDuring = await page.evaluate(() => (JSON.parse(localStorage.getItem('atlas-globe:v1') || '{}').active ?? []).map((a) => a.id).join());
  const borneo = await view(3);
  await page.evaluate(() => window.atlas.shell.ambient.stop());
  await page.waitForTimeout(2500);
  const back = await page.evaluate(() => ({ layers: window.atlas.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id).join(), plants: { ...window.atlas.app.instance('plants')?.options }, saved: (JSON.parse(localStorage.getItem('atlas-globe:v1') || '{}').active ?? []).map((a) => a.id).join() }));
  const deserts = ['Sonoran desert', 'Chihuahuan desert', 'Mojave desert', 'Baja California desert'];
  check(desert.layers.join() === 'ecoregions,plants' && desert.opts.ecoregions?.only === '13' && desert.opts.plants?.pick && /deserts of North America/.test(desert.cap) && /Sonoran/.test(desert.cap) && /saguaro/.test(desert.cap)
    && Math.abs(desert.cam.lon + 110) < 3 && plantName(desert.names) && desert.names.filter((n) => deserts.includes(n)).length >= 3
    && desert.names.every((n) => deserts.includes(n) || /Saguaro|Organ pipe|cardón|cholla|barrel|Engelmann|Claret|Parry|Peyote/i.test(n)),
    `Green planet, the deserts lit up (the other biomes dimmed); "${desert.cap.replace(/\s+/g, ' ').slice(0, 90)}…"; named on the map, only the deserts and their cacti: ${desert.names.join(', ')}`);
  check(borneo.layers.join() === 'ecoregions,plants' && borneo.opts.ecoregions?.only === '1' && /Borneo and Sumatra/.test(borneo.cap) && /corpse lily/.test(borneo.cap) && Math.abs(borneo.cam.lon - 108) < 3
    && borneo.names.some((n) => /^Borneo/.test(n)) && !borneo.names.some((n) => /Luzon|Java|Annamites/.test(n)) && borneo.names.some((n) => /Corpse lily|Titan arum|pitcher|rafflesia|bat flower/i.test(n)),
    `Green planet, strange plants over Borneo and Sumatra's rainforests: ${borneo.names.join(', ')}`);
  check(savedDuring === 'political,plants' && back.layers === 'political,plants' && !back.plants.pick && back.plants.show === 'all' && back.saved === 'political,plants',
    `while a playlist plays, the map from before it is what is saved (${savedDuring}); afterwards it is back as it was (${back.layers}, plants: ${back.plants.show}${back.plants.pick ? ', still picked' : ''})`);

  // The legend's selects, Show and Status of Animals of the world: the same width, inside the row.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'wild']));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.atlas.app.setOption('wild', 'status', 'endangered'));
  await page.evaluate(() => window.atlas.shell.openFilters(true));
  await page.waitForTimeout(800);
  const sel = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.arow')].find((r) => r.querySelectorAll('.arow-opt .select').length >= 2);
    if (!row) return null;
    const rb = row.getBoundingClientRect();
    const ss = [...row.querySelectorAll('.arow-opt .select')].map((x) => x.getBoundingClientRect());
    return { n: ss.length, widths: ss.map((b) => Math.round(b.width)), rights: ss.map((b) => Math.round(b.right)), lefts: ss.map((b) => Math.round(b.left)), row: [Math.round(rb.left), Math.round(rb.right)], text: [...row.querySelectorAll('.arow-opt .select')].map((x) => x.selectedOptions[0]?.textContent) };
  });
  check(sel && Math.max(...sel.widths) - Math.min(...sel.widths) <= 1 && Math.max(...sel.lefts) - Math.min(...sel.lefts) <= 1 && Math.max(...sel.rights) <= sel.row[1],
    `Animals of the world's selects line up: ${sel?.n} selects ${sel?.widths.join(' / ')} px wide (${(sel?.text ?? []).join(', ')}), inside the row`);

  // The Outline game frames a country's main body.
  const ink = await page.evaluate(() => Object.fromEntries(['NLD', 'FRA', 'PRT', 'NZL'].map((id) => {
    const c = window.atlas.play.outline.shape(id, [], 0, 300);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return [id, Math.round((n / (c.width * c.height)) * 100)];
  })));
  check(Object.values(ink).every((x) => x >= 8),
    `Outline frames the main body: ${Object.entries(ink).map(([k, v]) => `${k} ${v} %`).join(', ')} of the box (the Netherlands' Caribbean, France's overseas departments and the Azores left out of the frame)`);
  check(!errors.length, `no page errors in v0.31.3's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 33. Journey to the centre of the Earth (v0.32.0), on a phone, with Macrostrat answered from a fixture. The Earth
// cut open (its layers to scale, names on the cut, none of the map's over the opening, peeled to the inner core);
// dig down from Madrid (its crust from CRUST1.0, the rocks under it, real things at their depths, the readout, the
// other side); seismic waves; earthquakes by depth and a slice across Tonga; the Smithsonian's volcanoes (search
// too); plates that say how fast a place moves; hotspots; where a compass points; underground wonders; the quizzes
// How deep? and Down to the core; Verne's tour, which cuts the Earth open on its way down; ambient views with their
// context (the cut, the Serengeti's own animals, Latin America's Indigenous languages); names that settle on slow
// frames.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org|wikivoyage\.org/, (r) => r.abort());
  await ctx.route(/macrostrat\.org\/api/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ success: { data: [{ name: 'Granite, Variscan', lith: 'granite', best_int_name: 'Carboniferous', t_age: 299, b_age: 359, scale: 'medium' }] } }) }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=10,30,1&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  // The Earth cut open, from More → Inside the Earth.
  await page.evaluate(() => window.atlas.shell['menuItems'].find((m) => m.id === 'inside').onClick());
  await page.waitForTimeout(2500);
  const cut = await page.evaluate(() => {
    const L = window.atlas.app.renderer.labels, v = window.atlas.app.renderer.view, lon1 = window.atlas.inside.info.lon1;
    // No name of the map over the opening: none drawn whose place is between the cut's meridians, north of the equator.
    const over = L.drawn.filter((d) => { const g = v.invert(d.x, d.y + 4); if (!g) return false; const k = ((((g[0] - lon1) % 360) + 360) % 360); return g[1] > 2 && k > 2 && k < 88; }).map((d) => d.text);
    return { info: window.atlas.inside.info, names: L.drawn.map((d) => d.text), over, rows: [...document.querySelectorAll('.inside-layer')].map((b) => b.dataset.layer) };
  });
  check(cut.info.active && cut.info.open && cut.rows.length === 6 && cut.names.includes('Inner core (solid)') && cut.names.includes('Outer core (liquid)') && cut.over.filter((n) => !/core|mantle|crust|zone/i.test(n)).length === 0,
    `More → Inside the Earth cuts the globe open: six layers in the panel, ${cut.names.filter((n) => /core|mantle/.test(n)).join(', ')} on the cut, no map names over the opening (${cut.over.join(', ') || 'none'})`);
  await page.evaluate(() => document.querySelector('[data-layer="outer-core"]')?.click());
  await page.waitForTimeout(500);
  const facts = await page.evaluate(() => ({ focus: window.atlas.inside.info.focus, text: document.querySelector('.inside-facts')?.textContent ?? '' }));
  await page.evaluate(() => window.atlas.inside.setPeel(5));
  await page.waitForFunction(() => window.atlas.inside.info.peel >= 4.95, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  const peeled = await page.evaluate(() => ({ peel: window.atlas.inside.info.peel, names: window.atlas.app.renderer.labels.drawn.map((d) => d.text) }));
  check(facts.focus === 'outer-core' && /How we know/.test(facts.text) && /°C/.test(facts.text) && peeled.peel >= 4.95 && peeled.names.every((n) => /core/i.test(n)),
    `a layer's facts (${facts.focus}: "${facts.text.slice(0, 70)}…"); peeled to the inner core (${peeled.peel.toFixed(2)} of 5), only its names left (${peeled.names.join(', ')})`);
  await page.evaluate(() => { window.atlas.inside.setPeel(0); window.atlas.inside.setFocus(null); });

  // Dig down from Madrid.
  await page.evaluate(() => window.atlas.inside.digAt(-3.7, 40.4));
  await page.waitForTimeout(2500);
  const dig = await page.evaluate(() => ({ tab: window.atlas.inside.info.tab, head: document.querySelector('.inside .small b')?.textContent ?? '', body: document.querySelector('.inside')?.textContent ?? '', marks: document.querySelectorAll('.dig-mark').length, rocks: document.querySelector('.inside-rocks')?.textContent ?? '' }));
  // A touch deep in the column (it scrolls into view first): the readout says what it is like down there.
  await page.evaluate(() => document.querySelector('.dig-svg').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => { const r = document.querySelector('.dig-svg').getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.9]; });
  await page.touchscreen.tap(box[0], box[1]);
  await page.waitForTimeout(300);
  const read = await page.evaluate(() => document.querySelector('.dig-read')?.textContent ?? '');
  check(dig.tab === 'dig' && /Spain/.test(dig.head) && /crust here is about 3\d km thick/.test(dig.body) && dig.marks >= 20 && /Granite, Variscan/.test(dig.rocks) && /New Zealand/.test(dig.body) && /core/i.test(read) && /°C/.test(read) && /GPa/.test(read),
    `dig down from Madrid: ${dig.head}; crust ${/about (\d+) km thick/.exec(dig.body)?.[1]} km; ${dig.marks} things at their depths; "${dig.rocks.slice(0, 60)}…"; deep down: "${read.slice(0, 60)}"; the other side: New Zealand`);

  // The panel on a phone (v0.33.0, from a phone test): the readout is readable in the light theme, a swipe on the
  // column scrolls the panel (it used to read the depth instead), and dragging the grip makes the panel taller (the
  // globe centres above it, and the panel remembers it); dragged to the bottom, it closes.
  await page.evaluate(() => { window.atlas.app.setTheme('light'); document.querySelector('.sheet-body').scrollTop = 0; });
  await page.waitForTimeout(400);
  const startH = await page.evaluate(() => Math.round(document.querySelector('.sheet').getBoundingClientRect().height / innerHeight * 100));
  const contrast = await page.evaluate(() => {
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const cs = getComputedStyle(document.querySelector('.dig-read')), a = lum(rgb(cs.backgroundColor)), b = lum(rgb(cs.color));
    return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10;
  });
  const cdp = await ctx.newCDPSession(page);
  const swipe = async (x, y0, y1) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / 10 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(500);
  };
  const colAt = await page.evaluate(() => { const r = document.querySelector('.dig-svg').getBoundingClientRect(), b = document.querySelector('.sheet-body').getBoundingClientRect(); return [Math.round(r.left + r.width * 0.3), Math.round(Math.min(b.bottom - 30, r.top + 120))]; });
  await swipe(colAt[0], colAt[1], colAt[1] - 220);
  const scrolled = await page.evaluate(() => document.querySelector('.sheet-body').scrollTop);
  const grip = await page.locator('.sheet-grip').boundingBox();
  const gx = grip.x + grip.width / 2, gy = grip.y + grip.height / 2;
  await page.mouse.move(gx, gy); await page.mouse.down(); await page.mouse.move(gx, gy - 100, { steps: 5 }); await page.mouse.move(gx, gy - 200, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(600);
  const taller = await page.evaluate(() => ({ h: Math.round(document.querySelector('.sheet').getBoundingClientRect().height / innerHeight * 100), inset: window.atlas.app.renderer.view.insetBottom, sheet: Math.round(document.querySelector('.sheet').getBoundingClientRect().height), kept: JSON.parse(localStorage.getItem('atlas-globe:sheet-heights') || '{}').inside }));
  await page.evaluate(() => window.atlas.shell.sheet.close());
  await page.waitForTimeout(500);
  await page.evaluate(() => window.atlas.inside.open('dig'));
  await page.waitForTimeout(800);
  const again = await page.evaluate(() => Math.round(document.querySelector('.sheet').getBoundingClientRect().height / innerHeight * 100));
  const g2 = await page.locator('.sheet-grip').boundingBox();
  await page.mouse.move(g2.x + g2.width / 2, g2.y + 5); await page.mouse.down(); await page.mouse.move(g2.x + g2.width / 2, 700, { steps: 8 }); await page.mouse.move(g2.x + g2.width / 2, 820, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(700);
  const closed = await page.evaluate(() => !window.atlas.inside.info.open);
  await page.evaluate(() => { window.atlas.app.setTheme('dark'); try { localStorage.removeItem('atlas-globe:sheet-heights'); } catch {} });
  check(contrast >= 4.5 && startH >= 50 && startH <= 60 && scrolled > 100 && taller.h >= startH + 15 && Math.abs(taller.inset - taller.sheet) <= 2 && taller.kept > 0.6 && Math.abs(again - taller.h) <= 1 && closed,
    `the panel on a phone: readout contrast ${contrast}:1 in the light theme; opens at ${startH}% of the screen; a swipe on the column scrolls it ${scrolled} px; the grip drags it to ${taller.h}% (globe centred above it, kept: ${taller.kept}), ${again}% when opened again; dragged down, it ${closed ? 'closes' : 'stays open'}`);

  // Seismic waves.
  await page.evaluate(() => window.atlas.inside.open('waves'));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-waves="play"]')?.click());
  await page.waitForTimeout(5000);
  const waves = await page.evaluate(() => document.querySelector('.waves-clock')?.textContent ?? '');
  check(/minutes after the quake/.test(waves) && /P waves have reached [1-9]/.test(waves), `seismic waves play: "${waves.slice(0, 90)}"`);
  await page.evaluate(() => window.atlas.inside.stop());
  await page.waitForTimeout(500);

  // Earthquakes by depth: the legend, a deep one's card, and a slice across Tonga.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'quake-depths']));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.atlas.app.renderer.view.flyTo({ lon: -178, lat: -20, zoom: 3 }, 10));
  await page.waitForTimeout(1500);
  const leg = await page.evaluate(() => { const app = window.atlas.app; return app.registry.get('quake-depths').legend(app.instance('quake-depths'), 'en')?.items?.map((i) => i.label).join(' | ') ?? ''; });
  const deepN = Number((/Deep \(300–700 km\) · ([\d,]+)/.exec(leg)?.[1] ?? '0').replace(/,/g, ''));
  // Draw a slice (the legend's action: on a phone the legend starts folded), then two taps on the map across the
  // Tonga trench.
  await page.evaluate(() => { const app = window.atlas.app; app.registry.get('quake-depths').legend(app.instance('quake-depths'), 'en').actions.find((a) => /Draw a slice/.test(a.label)).onClick(); });
  await page.waitForTimeout(400);
  for (const g of [[-179.5, -17.5], [-172, -21]]) {
    const pt = await page.evaluate((g) => window.atlas.app.renderer.view.project(g[0], g[1]), g);
    if (pt) await page.touchscreen.tap(pt[0], pt[1]);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(800);
  const sl = await page.evaluate(() => ({ dots: document.querySelectorAll('.slice-svg circle').length, text: document.querySelector('.slice')?.textContent ?? '' }));
  check(deepN >= 1000 && sl.dots >= 100 && /deeper than 300 km/.test(sl.text),
    `earthquakes by depth: ${deepN} deeper than 300 km since 1970; a slice across Tonga shows ${sl.dots} quakes from the side ("${sl.text.slice(0, 80)}…")`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Volcanoes, plates that move, hotspots, the compass, underground wonders.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'plates', 'volcanoes', 'hotspots-mantle', 'underground']));
  await page.waitForTimeout(3000);
  const geo = await page.evaluate(async () => {
    const app = window.atlas.app;
    const volc = app.registry.get('volcanoes'), plates = app.registry.get('plates');
    const pv = volc.pick(14.999, 37.751, app.instance('volcanoes'), 'en') ?? [];
    const pp = plates.pick(-3.7, 40.4, app.instance('plates'), 'en') ?? [];
    await volc.searchLoad?.();
    const sv = volc.search((t) => (/krakat/i.test(t ?? '') ? 90 : 0), app.instance('volcanoes'), 'en').map((x) => x.label);
    const ug = app.registry.get('underground');
    await ug.searchLoad?.();
    const su = ug.search((t) => (/mammoth/i.test(t ?? '') ? 90 : 0), app.instance('underground'), 'en').map((x) => x.label);
    const legV = volc.legend(app.instance('volcanoes'), 'en')?.items?.map((i) => i.label) ?? [];
    return { pv: pv.map((r) => `${r.label}: ${r.value}`), pp: pp.map((r) => `${r.label}: ${r.value}`), sv, su, legV };
  });
  const total = geo.legV.reduce((a, l) => a + Number((/· ([\d,]+)$/.exec(l)?.[1] ?? '0').replace(/,/g, '')), 0);
  check(geo.pv.some((r) => /Etna/.test(r)) && geo.pv.some((r) => /Type/.test(r)) && total === 1214 && geo.sv.some((x) => /Krakat/.test(x)) && geo.pp.some((r) => /moves: 2\.\d cm a year to the north-east/.test(r)) && geo.su.some((x) => /Mammoth/.test(x)),
    `volcanoes: Etna's card (${geo.pv.slice(0, 3).join('; ')}), ${total} by their last eruption, "Krakat…" found (${geo.sv[0]}); Madrid's plate: ${geo.pp.find((r) => /moves/.test(r))}; "Mammoth" found (${geo.su[0]})`);
  await page.evaluate(() => window.atlas.app.renderer.view.flyTo({ lon: -160, lat: 19, zoom: 3.6 }, 10));
  await page.waitForTimeout(2500);
  const hot = await page.evaluate(() => window.atlas.app.renderer.labels.drawn.map((d) => d.text).filter((t) => /hotspot|Ma$/.test(t)));
  await page.evaluate(() => window.atlas.app.setStack(['political', 'magnetic']));
  await page.waitForTimeout(2500);
  const mag = await page.evaluate(() => {
    const L = window.atlas.app.registry.get('magnetic');
    let card = null;
    L.tap(-3.7, 40.4, window.atlas.app.instance('magnetic'), { card: (i, t, s, rows) => { card = rows.map((r) => r.value).join(' '); }, project: () => null, x: 0, y: 0 });
    return card ?? '';
  });
  check(hot.includes('Hawaiian hotspot') && hot.some((t) => /· \d+(\.\d)? Ma$/.test(t)) && /^\d+(\.\d)?° (east|west) of true north$/.test(mag) && Number(/^[\d.]+/.exec(mag)?.[0]) < 5,
    `hotspots: ${hot.slice(0, 3).join(', ')}; a compass in Madrid points ${mag}`);

  // How deep? and Down to the core.
  await page.evaluate(() => window.atlas.learn['startQuiz']('deep', 'world'));
  await page.waitForTimeout(1500);
  const dq = await page.evaluate(() => ({ n: window.atlas.learn.quiz?.qs.length, q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent) }));
  await page.evaluate(() => document.querySelector('.learn-card .quiz-opt')?.click());
  await page.waitForTimeout(600);
  const dfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  await page.evaluate(() => window.atlas.learn['startQuiz']('layers', 'world'));
  await page.waitForTimeout(1500);
  const lq = await page.evaluate(() => { const q = window.atlas.learn.quiz, cur = q.qs[0]; return { n: q.qs.length, ids: cur.down.slice().sort((a, b) => a.m - b.m).map((x) => x.id) }; });
  for (const id of lq.ids.slice(0, 3)) { await page.evaluate((id) => document.querySelector(`[data-down="${id}"]`)?.click(), id); await page.waitForTimeout(200); }
  await page.evaluate(() => document.querySelector('.learn-card [data-check]')?.click());
  await page.waitForTimeout(500);
  const lfb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
  await page.evaluate(() => window.atlas.learn['stopQuiz']());
  check(dq.n === 10 && /deeper/.test(dq.q) && dq.opts.length === 2 && /\d m|km/.test(dfb) && lq.n === 8 && /Correct! All four in order/.test(lfb),
    `How deep?: 10 pairs ("${dq.opts.join('" or "')}" → "${dfb.slice(0, 70)}"); Down to the core: 8 rounds, the first put in order ("${lfb}")`);

  // Verne's tour cuts the Earth open on the way down and closes it at Kola.
  await page.evaluate(() => window.atlas.learn['openTours']());
  await page.waitForTimeout(600);
  await page.evaluate(() => document.querySelector('[data-tour="Journey to the centre of the Earth"]')?.click());
  await page.waitForTimeout(2500);
  const stepTo = async (k) => { await page.evaluate((k) => { const tr = window.atlas.learn['tour']; tr.i = k - 1; document.querySelector('.learn-card [aria-label="Next"]')?.click(); }, k); await page.waitForTimeout(2500); };
  const v0 = await page.evaluate(() => ({ n: window.atlas.learn['tour']?.steps.length, active: window.atlas.inside.info.active }));
  await stepTo(4);
  const v4 = await page.evaluate(() => ({ active: window.atlas.inside.info.active, focus: window.atlas.inside.info.focus }));
  await stepTo(6);
  const v6 = await page.evaluate(() => ({ active: window.atlas.inside.info.active, ug: window.atlas.app.isActive('underground') }));
  await stepTo(8);
  const v8 = await page.evaluate(() => ({ active: window.atlas.inside.info.active, peel: window.atlas.inside.info.peel }));
  await page.evaluate(() => window.atlas.learn['stopTour']());
  await page.waitForTimeout(400);
  const vEnd = await page.evaluate(() => window.atlas.inside.info.active);
  check(v0.n === 9 && !v0.active && v4.active && v4.focus === 'upper-mantle' && !v6.active && v6.ug && v8.active && !vEnd,
    `Journey to the centre of the Earth: ${v0.n} stops; under the Atlantic the Earth is cut open (${v4.focus}), at Kola it closes (underground wonders on), at the real centre it opens again; the tour's end closes it`);

  // Ambient views with their context.
  await page.evaluate(() => { const a = window.atlas.app.ambient; a.secs = 300; a.narrate = false; a.names = 'view'; });
  const ambient = async (pl, k) => {
    await page.evaluate((pl) => window.atlas.shell.ambient.start(pl), pl);
    await page.waitForTimeout(600);
    await page.evaluate((k) => { const a = window.atlas.shell.ambient; a.idx = k - 1; void a.next(); }, k);
    await page.waitForFunction((k) => window.atlas.shell.ambient.info.index === k, k, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4500);
    const r = await page.evaluate(() => ({ names: window.atlas.app.renderer.labels.drawn.map((d) => d.text), cut: window.atlas.inside.info.active, cap: document.querySelector('.amb-caption')?.innerText ?? '', on: window.atlas.app.ambient.on, index: window.atlas.shell.ambient.info.index, layers: window.atlas.app.layers.map((l) => l.def.id).join() }));
    await page.evaluate(() => window.atlas.shell.ambient.stop());
    await page.waitForTimeout(2500);
    return r;
  };
  const aCut = await ambient('restless', 7);
  const afterCut = await page.evaluate(() => window.atlas.inside.info.active);
  const aSer = await ambient('wild', 1);
  const aLang = await ambient('latam', 4);
  check(aCut.cut && /Inside the Earth/.test(aCut.cap) && !afterCut && aSer.names.some((n) => /^Lion$/.test(n)) && aSer.names.every((n) => !/^[A-Z][A-Z ]+$/.test(n) && !/Polar bear|Kangaroo/.test(n)) && aLang.names.includes('Quechua') && aLang.names.every((n) => /Quechua|Guaraní|Nahuatl|Aymara|Maya|Mapudungun|Zapotec|Tzotzil|Tzeltal|Wayuu|Otomi/.test(n)),
    `ambient: Restless Earth cuts the Earth open (${aCut.cut}, "${aCut.cap.replace(/\s+/g, ' ').slice(0, 40)}…"; after it ${afterCut ? 'still open' : 'closed'}); the Serengeti (view ${aSer.index}, ${aSer.on ? 'playing' : 'stopped'}, ${aSer.layers}) shows its own animals: ${aSer.names.join(', ')}; Latin America lights up ${[...new Set(aLang.names)].join(', ')}`);

  // Names settle even on slow frames: once still, nothing is fading, and the records stay few.
  await page.evaluate(() => window.atlas.app.setStack(['political']));
  await page.waitForTimeout(2500);
  const settle = await page.evaluate(() => { const L = window.atlas.app.renderer.labels; return { fading: L.fading, records: [...L.seen.values()].flat().length, drawn: L.drawn.length }; });
  check(!settle.fading && settle.records < 400 && settle.drawn > 10, `names settle: nothing fading once still, ${settle.records} records for ${settle.drawn} names`);
  check(!errors.length, `no page errors in v0.32.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// 34. Into the deep (v0.33.0), on a phone, with OBIS answered from a fixture. The sea floor by depth zone, a tap on
// the sea for its depth; drain the oceans (the Ice Age land bridges at −120 m) and the sea rising (cities under
// water); GEBCO's undersea names and the famous ones; hydrothermal vents; shipwrecks (search, the deepest); the living
// ocean by month; mangroves and kelp; the garbage patches; Dive from here at the Challenger Deep (the animals at their
// depths, the readout, what lives near there, the Diver badge); the two sea quizzes and How deep? with sea animals
// and wrecks; the Into the deep playlist.
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('atlas-globe:hinted', '1'); } catch {} });
  await ctx.route(/wikidata\.org|wikimedia\.org|wikipedia\.org|wikivoyage\.org/, (r) => r.abort());
  await ctx.route(/api\.obis\.org/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ total: 2, results: [{ scientificName: 'Hirondellea gigas', taxonRank: 'Species', records: 37, class: 'Malacostraca' }, { scientificName: 'Pseudoliparis swirei', taxonRank: 'Species', records: 12, class: 'Teleostei' }] }) }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '#p=globe&l=political&c=142,12,1.5&lang=en', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  const cam = (lon, lat, zoom) => page.evaluate(([a, b, c]) => window.atlas.app.renderer.view.flyTo({ lon: a, lat: b, zoom: c }, 0), [lon, lat, zoom]);
  const tapAt = async (lon, lat) => { const p = await page.evaluate(([a, b]) => window.atlas.app.renderer.view.project(a, b), [lon, lat]); if (p) await page.touchscreen.tap(p[0], p[1]); await page.waitForTimeout(600); return !!p; };
  const cardText = () => page.evaluate(() => document.querySelector('.country-card:not([hidden])')?.innerText ?? '');
  const legendOf = (id) => page.evaluate((id) => { const a = window.atlas.app, inst = a.instance(id), l = inst?.def.legend?.(inst, 'en'); return l ? [l.title ?? '', ...(l.items ?? []).map((x) => x.label), l.note ?? ''].join(' | ') : ''; }, id);

  // The sea floor by zone: five zones; a tap on the Philippine Sea gives its depth and zone.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'seafloor']));
  await page.waitForFunction(() => window.atlas.app.instance('seafloor')?.ready, null, { timeout: 30000 }).catch(() => {});
  await cam(132, 18, 2.5);
  await page.waitForTimeout(1500);
  const floorLeg = await legendOf('seafloor');
  await tapAt(132, 18);
  const floorCard = await cardText();
  await page.evaluate(() => window.atlas.shell.card.hide());
  check(/Sunlit zone/.test(floorLeg) && /Hadal zone/.test(floorLeg) && /Seabed 2030/.test(floorLeg) && /m deep/.test(floorCard) && /(Abyss|Midnight)/.test(floorCard) && /Dive here/.test(floorCard),
    `the sea floor by zone (${floorLeg.split(' | ').length - 2} zones); the Philippine Sea: "${floorCard.replace(/\s+/g, ' ').slice(0, 80)}"`);

  // Drain the oceans: at −120 m Sundaland and Sahul are named; at +70 m low cities are under the sea.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'sealevel']));
  await page.waitForFunction(() => window.atlas.app.instance('sealevel')?.ready, null, { timeout: 30000 }).catch(() => {});
  await cam(120, 0, 1.6);
  await page.waitForTimeout(2500);
  const drain = await page.evaluate(() => ({ names: window.atlas.app.renderer.labels.drawn.map((d) => d.text), level: window.atlas.app.instance('sealevel').state.level }));
  const drainLeg = await legendOf('sealevel');
  await page.evaluate(() => window.atlas.app.setOption('sealevel', 'level', '70'));
  await cam(105, 15, 1.8);
  await page.waitForTimeout(2500);
  const rise = await page.evaluate(() => ({ names: window.atlas.app.renderer.labels.drawn.map((d) => d.text).filter((t) => t.startsWith('🌊')), level: window.atlas.app.instance('sealevel').state.level }));
  const riseLeg = await legendOf('sealevel');
  check(Math.round(drain.level) === -120 && drain.names.includes('Sundaland') && /Ice Age/.test(drainLeg) && Math.round(rise.level) === 70 && rise.names.length >= 3 && /not a flood forecast/.test(riseLeg) && /big cities/.test(riseLeg),
    `drain the oceans to −120 m: ${drain.names.filter((n) => /Sundaland|Sahul|Beringia|Doggerland/.test(n)).join(', ')}; the sea +70 m: ${rise.names.slice(0, 4).join(', ')}… ("${riseLeg.split(' | ')[1]}")`);

  // Undersea names: the famous ones from afar, GEBCO's close up; search; a famous one's card.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'sea-features']));
  await page.waitForFunction(() => window.atlas.app.instance('sea-features')?.ready, null, { timeout: 30000 }).catch(() => {});
  await cam(150, 20, 1.6);
  await page.waitForTimeout(2000);
  const far = await page.evaluate(() => window.atlas.app.renderer.labels.drawn.map((d) => d.text));
  await cam(141, 33, 9);
  await page.waitForTimeout(2000);
  const near = await page.evaluate(() => window.atlas.app.renderer.labels.drawn.map((d) => d.text).filter((t) => /Seamount|Knoll|Canyon|Trough|Basin|Ridge|Bank|Spur|Hill|Hole|Valley|Plateau/.test(t) && !/Trench/.test(t)));
  const featHits = await page.evaluate(async () => { const d = window.atlas.app.registry.get('sea-features'); await d.searchLoad(); return d.search((t) => (/mariana/i.test(t ?? '') ? 90 : 0), window.atlas.app.instance('sea-features'), 'en').map((x) => x.label); });
  const mar = await page.evaluate(async () => (await (await fetch('data/ocean/features.json')).json()).famous.find((f) => /^Mariana Trench$/.test(f.name.en)) ?? null);
  if (mar) { await cam(mar.lon, mar.lat, 2.5); await page.waitForTimeout(1500); await tapAt(mar.lon, mar.lat); }
  const marCard = await cardText();
  check(far.some((n) => /Mariana Trench/.test(n)) && near.length >= 5 && featHits.some((x) => /Mariana Trench/.test(x)) && /Mariana Trench/.test(marCard) && /Undersea feature/.test(marCard),
    `undersea names: from afar ${far.filter((n) => /Trench|Ridge|Rise/.test(n)).slice(0, 4).join(', ')}; close to Japan ${near.length} of GEBCO's (${near.slice(0, 3).join(', ')}); "mariana" finds ${featHits[0]}; its card: "${marCard.replace(/\s+/g, ' ').slice(0, 60)}…"`);
  await page.evaluate(() => window.atlas.shell.card.hide());

  // Vents and wrecks.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'vents', 'wrecks']));
  await page.waitForFunction(() => window.atlas.app.instance('wrecks')?.ready && window.atlas.app.instance('vents')?.ready, null, { timeout: 30000 }).catch(() => {});
  const ventLeg = await legendOf('vents');
  const wreckLeg = await legendOf('wrecks');
  const wreckHits = await page.evaluate(async () => { const d = window.atlas.app.registry.get('wrecks'); return d.search((t) => (/titanic/i.test(t ?? '') ? 90 : 0), window.atlas.app.instance('wrecks'), 'en').map((x) => x.label); });
  await page.evaluate(() => { const a = window.atlas.app; a.registry.get('wrecks').legend(a.instance('wrecks'), 'en').actions[0].onClick(); });
  await page.waitForTimeout(1200);
  const deepest = await cardText();
  await page.evaluate(() => window.atlas.shell.card.hide());
  const ventN = Number(/(\d+) vent fields/.exec(ventLeg)?.[1] ?? 0), famousN = Number(/(\d+) famous wrecks/.exec(wreckLeg)?.[1] ?? 0), moreN = Number((/and ([\d,]+) more/.exec(wreckLeg)?.[1] ?? '0').replace(/,/g, ''));
  check(ventN >= 20 && famousN >= 40 && moreN >= 500 && wreckHits.some((x) => /Titanic/.test(x)) && /Samuel B\. Roberts/.test(deepest) && /6,865 m/.test(deepest),
    `${ventN} vent fields; ${famousN} famous wrecks and ${moreN} more; "titanic" finds ${wreckHits[0]}; the deepest: "${deepest.replace(/\s+/g, ' ').slice(0, 70)}"`);

  // The living ocean, mangroves and kelp, the garbage patches.
  await page.evaluate(() => window.atlas.app.setStack(['political', 'living-ocean', 'coastal-forests', 'garbage-patches']));
  await page.evaluate(() => window.atlas.app.setOptions('living-ocean', { show: 'plankton', month: '5' }));
  await page.waitForFunction(() => ['living-ocean', 'coastal-forests', 'garbage-patches'].every((id) => window.atlas.app.instance(id)?.ready), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const plank = await legendOf('living-ocean');
  await page.evaluate(() => window.atlas.app.setOption('living-ocean', 'show', 'ice'));
  await page.waitForTimeout(800);
  const ice = await legendOf('living-ocean');
  const coast = await legendOf('coastal-forests');
  await cam(-140, 32, 2.2);
  await page.waitForTimeout(1200);
  await tapAt(-140, 32);
  const patch = await cardText();
  await page.evaluate(() => window.atlas.shell.card.hide());
  const mang = Number(/Mangroves · (\d+)/.exec(coast)?.[1] ?? 0), kelp = Number(/Kelp forests · (\d+)/.exec(coast)?.[1] ?? 0);
  check(/Plankton · May/.test(plank) && /Sea ice/.test(ice) && mang >= 10 && kelp >= 12 && /Garbage patch/.test(patch) && /approximate/i.test(patch),
    `the living ocean: "${plank.split(' | ')[0]}", "${ice.split(' | ')[0]}"; ${mang} mangrove ecoregions and ${kelp} kelp forests; a tap in the North Pacific: "${patch.replace(/\s+/g, ' ').slice(0, 60)}…"`);

  // Dive from here at the Challenger Deep.
  await page.evaluate(() => window.atlas.app.setStack(['political']));
  await page.evaluate(() => window.atlas.deep.diveAt(142.2, 11.35));
  await page.waitForTimeout(3500);
  const dive = await page.evaluate(() => ({ info: window.atlas.deep.info, text: document.querySelector('.deep')?.innerText ?? '', animals: [...document.querySelectorAll('.dive-animal')].map((g) => g.dataset.animal), recs: document.querySelectorAll('.dive-svg .dive-rec').length, obis: document.querySelector('.deep-obis')?.innerText ?? '', feats: JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}').feats ?? null }));
  await page.evaluate(() => document.querySelector('.dive-svg').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => { const r = document.querySelector('.dive-svg').getBoundingClientRect(); return [r.left + r.width * 0.42, r.top + r.height * 0.88]; });
  await page.touchscreen.tap(box[0], box[1]);
  await page.waitForTimeout(300);
  const read = await page.evaluate(() => document.querySelector('.dive-read')?.textContent ?? '');
  const badge = await page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' '));
  check(dive.info.floor > 9000 && /hadal zone/i.test(dive.text) && dive.animals.length >= 10 && dive.recs >= 8 && /Hirondellea gigas/.test(dive.obis) && /Hadal/.test(read) && /times the air/.test(read),
    `dive at the Challenger Deep: the floor ${dive.info.floor} m; ${dive.animals.length} animals at their depths, ${dive.recs} records; "${read.slice(0, 70)}…"; seen near there: ${dive.obis.split('\n')[1] ?? ''}${badge ? `; ${badge.trim().slice(0, 40)}` : ''}`);
  await page.evaluate(() => window.atlas.shell.sheet.close());

  // Name the sea feature, Which ocean zone?, and How deep? with the sea.
  const quiz = async (kind) => {
    await page.evaluate((k) => window.atlas.learn['startQuiz'](k, 'world'), kind);
    await page.waitForTimeout(2000);
    const r = await page.evaluate(() => ({ n: window.atlas.learn.quiz?.qs.length, q: document.querySelector('.learn-card .quiz-q')?.textContent ?? '', opts: [...document.querySelectorAll('.learn-card .quiz-opt')].map((b) => b.textContent), pin: window.atlas.learn['pin'] }));
    await page.evaluate(() => document.querySelector('.learn-card .quiz-opt')?.click());
    await page.waitForTimeout(600);
    r.fb = await page.evaluate(() => document.querySelector('.learn-card .quiz-fb')?.textContent ?? '');
    await page.evaluate(() => window.atlas.learn['stopQuiz']());
    await page.waitForTimeout(400);
    return r;
  };
  const qf = await quiz('seafeature');
  const qz = await quiz('zone');
  const seaPool = await page.evaluate(async () => (await window.atlas.learn['loadDeep']()).filter((x) => /^(sea|wreck)-/.test(x.id)).length);
  check(qf.n === 10 && qf.opts.length === 4 && qf.pin?.text === '?' && qf.fb.length > 20 && qz.n === 10 && qz.opts.length === 4 && /m/.test(qz.fb) && seaPool >= 100,
    `Name the sea feature: ${qf.n} pins ("${qf.opts.join('", "')}" → "${qf.fb.slice(0, 50)}…"); Which ocean zone?: ${qz.n} animals ("${qz.q}", → "${qz.fb.slice(0, 50)}…"); How deep? adds ${seaPool} sea animals and wrecks`);

  // The Into the deep playlist: the Ice Age seas.
  await page.evaluate(() => { const a = window.atlas.app.ambient; a.secs = 300; a.narrate = false; a.names = 'view'; });
  await page.evaluate(() => window.atlas.shell.ambient.start('deep'));
  await page.waitForTimeout(600);
  await page.evaluate(() => { const a = window.atlas.shell.ambient; a.idx = 0; void a.next(); });
  await page.waitForFunction(() => window.atlas.shell.ambient.info.index === 1, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const amb = await page.evaluate(() => ({ info: window.atlas.shell.ambient.info, level: window.atlas.app.instance('sealevel')?.options.level, names: window.atlas.app.renderer.labels.drawn.map((d) => d.text) }));
  await page.evaluate(() => window.atlas.shell.ambient.stop());
  await page.waitForTimeout(1500);
  check(amb.info.title === 'The Ice Age seas' && amb.level === '-120' && amb.names.includes('Sundaland'), `the Into the deep playlist: "${amb.info.title}" (the sea at ${amb.level} m; ${amb.names.join(', ')})`);
  check(!errors.length, `no page errors in v0.33.0's checks${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
