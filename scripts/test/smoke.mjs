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
// pandemics and tsunamis.
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
  check(['eras', 'food', 'structures', 'people', 'life', 'games', 'journeys', 'beliefs', 'writing'].includes(opened.mode) && opened.card, `"See it in the story" opens the story at the item (${opened.mode})`);
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
  for (const kind of ['listen', 'opening', 'artist']) {
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
  check(!errors.length, `no page errors in quizzes and tours${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
