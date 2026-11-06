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
// wars and conquests mode plays a conflict, with battle cards and step details.
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
  const pickCard = () => page.evaluate(() => {
    const b = document.querySelector('.sheet-body').getBoundingClientRect();
    return [...document.querySelectorAll('.sheet-body .fcard')].find((c) => c.getBoundingClientRect().top > b.top + 150 && c.getBoundingClientRect().bottom < b.bottom && !c.classList.contains('on')).dataset.id;
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

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
