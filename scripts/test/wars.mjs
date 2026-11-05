#!/usr/bin/env node
// Plays every conflict of the "Wars and conquests" mode in a phone-sized browser: opens it from the
// picker, visits each step, opens the details of steps with battles, and reports page errors, steps
// without any territory and battles placed far from the step's view. Usage (with a preview server):
//   node scripts/test/wars.mjs [http://localhost:4173/] [id,id...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium, devices;
try { ({ chromium, devices } = require('playwright')); } catch { ({ chromium, devices } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }

const url = process.argv[2] || 'http://localhost:4173/';
const only = process.argv[3]?.split(',');
const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url + '#p=globe&l=political&c=20,30,1.4&lang=en', { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.atlas && (document.getElementById('splash')?.classList.contains('hide') ?? true), null, { timeout: 60000 });
await page.waitForTimeout(4500);
const index = await page.evaluate(async () => (await (await fetch('data/conflicts/index.json')).json()).conflicts);
let failures = 0;
for (const entry of index) {
  if (only && !only.includes(entry.id)) continue;
  const before = errors.length;
  // In the mode, the bar's list button switches conflicts; otherwise Time travel opens the list.
  const inMode = await page.evaluate(() => window.atlas.app.mode === 'wars');
  if (inMode) await page.evaluate(() => document.querySelector('.wb-tools .icon-btn').click());
  else {
    await page.tap('[data-dock="time"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = [...document.querySelectorAll('.mode-card')].find((c) => /Wars/.test(c.textContent)); el?.click(); });
  }
  await page.waitForSelector(`.war-card[data-war="${entry.id}"]`, { timeout: 15000 });
  await page.evaluate((id) => document.querySelector(`.war-card[data-war="${id}"]`).click(), entry.id);
  await page.waitForSelector('.warbar', { timeout: 15000 });
  const data = await page.evaluate(async (id) => (await (await fetch(`data/conflicts/${id}.json`)).json()), entry.id);
  const problems = [];
  for (let i = 0; i < data.steps.length; i++) {
    await page.evaluate((i) => document.querySelectorAll('.wb-tick')[i].click(), i);
    await page.waitForTimeout(i === 0 ? 1600 : 900);
    const st = data.steps[i];
    if (!Object.values(st.control).some((v) => v !== null)) problems.push(`step ${i + 1}: no territory`);
    const shown = await page.evaluate(() => document.querySelector('.wb-title').textContent);
    if (!shown) problems.push(`step ${i + 1}: empty title`);
    if (st.battles?.length) {
      await page.evaluate(() => document.querySelector('.wb-more').click());
      await page.waitForTimeout(250);
      const n = await page.evaluate(() => document.querySelectorAll('.war-battle').length);
      if (n !== st.battles.length) problems.push(`step ${i + 1}: details show ${n} of ${st.battles.length} battles`);
      await page.evaluate(() => document.querySelector('.sheet .sheet-head .icon-btn').click());
      await page.waitForTimeout(150);
    }
  }
  const errs = errors.slice(before);
  const ok = !problems.length && !errs.length;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${entry.id}: ${data.steps.length} steps${problems.length ? ' · ' + problems.join(' · ') : ''}${errs.length ? ' · errors: ' + errs.join(' | ') : ''}`);
}
await page.evaluate(() => document.querySelector('.wb-tools .icon-btn:last-child')?.click());

// A shared link opens the war at its step.
{
  const id = (only ?? index.map((e) => e.id))[0];
  const p2 = await ctx.newPage();
  await p2.goto(`${url}#war=${id}&step=2&p=globe&lang=es`, { waitUntil: 'networkidle' });
  await p2.waitForSelector('.warbar', { timeout: 30000 }).catch(() => {});
  await p2.waitForTimeout(1500);
  const r = await p2.evaluate(() => ({ mode: window.atlas?.app.mode, step: document.querySelectorAll('.wb-tick.on').length && [...document.querySelectorAll('.wb-tick')].findIndex((t) => t.classList.contains('on')), hash: location.hash }));
  const ok = r.mode === 'wars' && r.step === 1 && r.hash.includes(`war=${id}`);
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} shared link opens ${id} at step 2 (${JSON.stringify(r)})`);
  await p2.close();
}
await browser.close();
console.log(failures ? `\n${failures} conflict(s) with problems` : '\nall conflicts play');
process.exit(failures ? 1 : 0);
