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
  // A filter that turns on in the list (Compare two filters opens its own card and closes the panel).
  const pickCard = () => page.evaluate(() => {
    const b = document.querySelector('.sheet-body').getBoundingClientRect();
    return [...document.querySelectorAll('.sheet-body .fcard')].find((c) => c.getBoundingClientRect().top > b.top + 150 && c.getBoundingClientRect().bottom < b.bottom && !c.classList.contains('on') && c.dataset.id !== 'compare').dataset.id;
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
  await page.waitForTimeout(700);
  const back = await where(b);
  check(closed && Math.abs(back.top - b0.top) <= 2 && Math.abs(back.scroll - bt.loaded.scroll) <= 2, `filters list reopens where it was left (scroll ${bt.loaded.scroll} -> ${back.scroll})`);
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
  // The daily challenge: seven questions; another browser gets the same ones the same day.
  const dailyQs = async (p) => {
    await p.evaluate(() => window.atlas.learn.startQuiz('daily', 'world'));
    await p.waitForFunction(() => window.atlas.learn.quiz?.kind === 'daily', null, { timeout: 30000 });
    return p.evaluate(() => window.atlas.learn.quiz.qs.map((q) => `${q.kind}:${q.item?.id ?? q.det?.year ?? (q.set ? q.set.map((x) => x.id).join('+') : q.id)}`));
  };
  const d1 = await dailyQs(page);
  const other = await open({ viewport: { width: 1000, height: 700 } }, '#p=globe&l=political&c=20,30,1.4&lang=es');
  const d2 = await dailyQs(other.page);
  await other.ctx.close();
  check(d1.length === 7 && JSON.stringify(d1) === JSON.stringify(d2) && d1[0].startsWith('find') && d1.some((x) => x.startsWith('order')) && d1.some((x) => x.startsWith('detective')), `the daily challenge has 7 questions, the same in a second browser (${d1.map((x) => x.split(':')[0]).join(', ')})`);
  for (let i = 0; i < 7; i++) {
    const k = await page.evaluate(() => { const q = window.atlas.learn.quiz; return q.qs[q.i].kind; });
    if (k === 'find' || k === 'where') await page.evaluate(() => [...document.querySelectorAll('.learn-card button')].find((b) => /Show me/.test(b.textContent))?.click());
    else if (k === 'order') { for (let j = 0; j < 3; j++) { await page.evaluate(() => [...document.querySelectorAll('.learn-card .order-row:not(.picked)')][0]?.click()); await page.waitForTimeout(100); } await page.evaluate(() => document.querySelector('.learn-card [data-check]')?.click()); }
    else await page.evaluate(() => { const q = window.atlas.learn.quiz, cur = q.qs[q.i]; const b = [...document.querySelectorAll('.learn-card .quiz-opt')]; (b.find((x) => x.textContent && cur.options && cur.options.indexOf(cur.id) === b.indexOf(x)) ?? b[0])?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /Next|See result/.test(b.textContent))?.click());
    await page.waitForTimeout(700);
  }
  const res = await page.evaluate(() => ({ head: document.querySelector('.learn-card .tool-head')?.textContent ?? '', marks: document.querySelector('.learn-card .daily-marks')?.textContent ?? '', rows: document.querySelectorAll('.learn-card .quiz-sum-row').length, share: !!document.querySelector('.learn-card [data-share]'), p: JSON.parse(localStorage.getItem('atlas-globe:progress') || '{}') }));
  check(/Daily challenge #\d+/.test(res.head) && (res.marks.match(/🟩|🟥/gu) ?? []).length === 7 && res.rows === 7 && res.share && !!res.p.badges?.['daily-1'] && res.p.daily?.streak === 1, `the daily result: ${res.marks}, 7 rows, Share, the first daily badge and a 1-day streak`);
  await page.evaluate(() => [...document.querySelectorAll('.learn-card .tool-actions button')].find((b) => /Done/.test(b.textContent))?.click());
  await page.waitForTimeout(500);
  await menu('Quiz');
  const done = await page.evaluate(() => document.querySelector('[data-quiz="daily"]')?.textContent ?? '');
  await page.evaluate(() => document.querySelector('[data-panel="progress"]').click());
  await page.waitForTimeout(500);
  const prog = await page.evaluate(() => ({ subjects: document.querySelectorAll('.progress [data-subject]').length, got: [...document.querySelectorAll('.progress .badge-chip.got')].map((b) => b.dataset.badge), all: document.querySelectorAll('.progress .badge-chip').length }));
  check(/Done: \d\/7/.test(done) && prog.subjects === 6 && prog.got.includes('daily-1') && prog.all > 40, `once played, the card says "${done.slice(done.indexOf('Done'), done.indexOf('Done') + 30)}"; your progress shows 6 subjects and ${prog.all} badges (${prog.got.join(', ')} earned)`);
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
  await page.waitForTimeout(300);
  const v1 = await page.evaluate(() => ({ spoken: window.__spoken.slice(), marked: document.querySelectorAll('.tour-s.reading').length }));
  await page.click('.tour-tools [aria-label="Auto"]');
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
  check(['', 'planet', 'night', 'restless', 'water', 'life', 'people', 'latam'].every((k) => pls.includes(k)) && mine.length === 1 && mine[0].stack.includes('political'),
    `ambient mode offers 7 playlists and my own (${pls.length} cards); "Add this view" adds the map to my playlist`);
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

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
