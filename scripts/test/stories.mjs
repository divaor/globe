#!/usr/bin/env node
// Plays every story of the time-travel collections in a phone-sized browser. For each story it:
// opens it from the picker, visits each step, checks that the details list the step's items (or
// battles), checks that Browse lists every item, and reports page errors. Then it checks each
// collection's "Browse everything" and a shared link. Usage (with a preview server running):
//   node scripts/test/stories.mjs [http://localhost:4173/] [eras,food,structures,people,life | all] [id,id...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { ({ chromium, devices } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }

const url = process.argv[2] || 'http://localhost:4173/';
const kindsArg = process.argv[3] || 'eras,food,structures,people,life';
const kinds = kindsArg === 'all' ? ['wars', 'eras', 'food', 'structures', 'people', 'life'] : kindsArg.split(',');
const only = process.argv[4]?.split(',');
const DIR = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life' };
const HASH = { wars: 'war', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life' };
const CARD = { wars: /Wars and conquests/, eras: /Eras and ideas/, food: /Food through time/, structures: /Great structures/, people: /Peoples and civilizations/, life: /Life through time/ };

const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '#p=globe&l=political&c=20,30,1.4&lang=en', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
await page.waitForTimeout(4000);
const json = (p) => page.evaluate(async (p) => (await fetch(p)).json(), p);
const closeSheet = () => page.evaluate(() => document.querySelector('.sheet:not([hidden]) .sheet-head .icon-btn')?.click());

/** Opens a collection's picker: from the bar when already in it, else from the Time travel menu. */
async function openPicker(kind) {
  if (await page.evaluate((k) => window.atlas.app.mode === k, kind)) {
    await page.evaluate(() => document.querySelector('.wb-list').click());
  } else {
    await page.tap('[data-dock="time"]');
    await page.waitForTimeout(300);
    const re = CARD[kind].source;
    await page.evaluate((re) => { const el = [...document.querySelectorAll('.mode-card')].find((c) => new RegExp(re).test(c.textContent)); el?.click(); }, re);
  }
  await page.waitForSelector('.war-card', { timeout: 15000 });
}

let failures = 0;
const report = (ok, msg) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

for (const kind of kinds) {
  const idx = await json(`data/${DIR[kind]}/index.json`);
  const list = idx.conflicts ?? idx.stories ?? [];
  // A story asked for by id must be there (a stale build would otherwise pass without playing it).
  if (only && kinds.length === 1) for (const id of only) if (!list.some((e) => e.id === id)) report(false, `${kind}/${id}: not in the published index`);
  for (const entry of list) {
    if (only && !only.includes(entry.id)) continue;
    const before = errors.length;
    await openPicker(kind);
    await page.waitForSelector(`.war-card[data-war="${entry.id}"]`, { timeout: 15000 });
    await page.evaluate((id) => document.querySelector(`.war-card[data-war="${id}"]`).click(), entry.id);
    await page.waitForSelector('.warbar', { timeout: 15000 });
    const data = await json(`data/${DIR[kind]}/${entry.id}.json`);
    const problems = [];
    for (let i = 0; i < data.steps.length; i++) {
      await page.evaluate((i) => document.querySelectorAll('.wb-tick')[i].click(), i);
      await page.waitForTimeout(i === 0 ? 1500 : 800);
      const st = data.steps[i];
      const shown = await page.evaluate(() => document.querySelector('.wb-title').textContent);
      if (!shown) problems.push(`step ${i + 1}: empty title`);
      if (kind === 'life') {
        // An old step is drawn on the continents of its age, and on a phone its own markers are in
        // view once the camera and the continents have moved (between the top bar and the story bar).
        if (st.ma != null) {
          const drawn = await page.waitForFunction((ma) => Math.abs((window.atlas.time.stories.life.ageNow() ?? -1) - ma) < 1e-6, st.ma, { timeout: 6000 }).then(() => true, () => false);
          if (!drawn) problems.push(`step ${i + 1}: the continents of ${st.ma} million years ago are not drawn`);
        }
        if (st.show?.length) {
          await page.waitForTimeout(1400);
          const out = await page.evaluate(() => {
            const s = window.atlas.time.stories.life, v = window.atlas.app.renderer.view, cur = s.c.steps[s.step];
            return cur.show.filter((k) => { const sp = s.spots.at.get(k); return !sp || sp.x < 0 || sp.x > v.w || sp.y < 56 || sp.y > v.h - v.insetBottom; }).map((k) => s.c.items[k].name.en);
          });
          if (out.length) problems.push(`step ${i + 1}: out of view: ${out.join(', ')}`);
        }
      }
      const want = { battles: st.battles?.length ?? 0, items: st.show?.length ?? 0 };
      if (want.battles || want.items) {
        await page.evaluate(() => document.querySelector('.wb-more').click());
        await page.waitForTimeout(250);
        const got = await page.evaluate(() => ({ battles: document.querySelectorAll('.war-battle').length, items: document.querySelectorAll('.war-details .story-item').length }));
        if (got.battles !== want.battles) problems.push(`step ${i + 1}: details show ${got.battles} of ${want.battles} battles`);
        if (got.items !== want.items) problems.push(`step ${i + 1}: details show ${got.items} of ${want.items} items`);
        await closeSheet();
        await page.waitForTimeout(150);
      }
    }
    if (data.items?.length) {
      // Browse lists every item of the story (the list stops at 300; the count says all).
      await page.evaluate(() => document.querySelector('.wb-browse').click());
      await page.waitForTimeout(400);
      const got = await page.evaluate(() => ({ rows: document.querySelectorAll('.story-list .story-item').length, count: document.querySelector('.sheet:not([hidden]) .sheet-body .muted.small')?.textContent ?? '' }));
      if (got.rows !== Math.min(300, data.items.length) || !got.count.startsWith(String(data.items.length))) problems.push(`browse lists ${got.rows} (${got.count}) of ${data.items.length} items`);
      // A search narrows it down.
      const q = data.items[0].name.en.split(' ')[0];
      await page.fill('.story-browse-head input', q);
      await page.waitForTimeout(250);
      const narrowed = await page.evaluate(() => document.querySelectorAll('.story-list .story-item').length);
      if (!(narrowed >= 1 && narrowed <= data.items.length)) problems.push(`search "${q}" lists ${narrowed}`);
      await closeSheet();
      await page.waitForTimeout(150);
    }
    const errs = errors.slice(before);
    report(!problems.length && !errs.length, `${kind}/${entry.id}: ${data.steps.length} steps${data.items ? `, ${data.items.length} items` : ''}${problems.length ? ' · ' + problems.join(' · ') : ''}${errs.length ? ' · errors: ' + errs.join(' | ') : ''}`);
  }
  if (kind !== 'wars' && list.length && !only) {
    // "Browse everything": the whole collection.
    const all = (await json(`data/${DIR[kind]}/items.json`)).items;
    await openPicker(kind);
    await page.evaluate(() => document.querySelector('.story-browse-all').click());
    await page.waitForSelector('.story-list', { timeout: 15000 });
    await page.waitForTimeout(300);
    const count = await page.evaluate(() => document.querySelector('.sheet:not([hidden]) .sheet-body .muted.small')?.textContent ?? '');
    report(count.startsWith(String(all.length)), `${kind}: "Browse everything" lists ${count} (items.json has ${all.length})`);
    await closeSheet();
  }
  await page.evaluate(() => document.querySelector('.wb-exit')?.click());
  await page.waitForTimeout(500);
}

// A shared link opens a story at its step.
for (const kind of kinds) {
  const idx = await json(`data/${DIR[kind]}/index.json`);
  const id = (only ?? (idx.conflicts ?? idx.stories).map((e) => e.id)).find((x) => (idx.conflicts ?? idx.stories).some((e) => e.id === x));
  if (!id) continue;
  const p2 = await ctx.newPage();
  await p2.goto(`${url}#${HASH[kind]}=${id}&step=2&p=globe&lang=es`, { waitUntil: 'networkidle' });
  await p2.waitForSelector('.warbar', { timeout: 30000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const r = await p2.evaluate(() => ({ mode: window.atlas?.app.mode, step: [...document.querySelectorAll('.wb-tick')].findIndex((t) => t.classList.contains('on')), hash: location.hash }));
  report(r.mode === kind && r.step === 1 && r.hash.includes(`${HASH[kind]}=${id}`), `shared link opens ${kind}/${id} at step 2 (${JSON.stringify(r)})`);
  await p2.close();
}
await browser.close();
console.log(failures ? `\n${failures} problem(s)` : '\nall stories play');
process.exit(failures ? 1 : 0);
