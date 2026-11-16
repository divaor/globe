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

await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
