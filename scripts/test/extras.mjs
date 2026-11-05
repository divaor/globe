#!/usr/bin/env node
// Exercises quiz, tours, on-this-day (mocked), travel map and 4K export; saves screenshots.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, outDir] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
await page.route('**/api.wikimedia.org/**', (r) => r.fulfill({ json: { selected: [
  { year: 1605, text: 'The Gunpowder Plot to blow up the Parliament in London is foiled.', pages: [{ title: 'Gunpowder_Plot', coordinates: { lat: 51.4995, lon: -0.1248 } }] },
  { year: 1916, text: 'The Kingdom of Poland is proclaimed by the emperors of Germany and Austria-Hungary.', pages: [] },
  { year: 1940, text: 'Franklin D. Roosevelt is elected for a third term as President of the United States.', pages: [] },
] } }));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('splash')?.classList.contains('hide') ?? true, null, { timeout: 30000 });
await page.waitForTimeout(1500);
const shot = async (name, ms = 2500) => { await page.waitForTimeout(ms); await page.screenshot({ path: `${outDir}/x-${name}.png` }); };
// Quiz: flags
await page.evaluate(() => window.atlas.learn['startQuiz']('flag', 'world'));
await shot('quiz');
await page.evaluate(() => document.querySelector('.quiz-opt')?.click());
await shot('quiz-answer', 2500);
await page.evaluate(() => window.atlas.learn['stopQuiz']());
// Tour
await page.evaluate(() => { const l = window.atlas.learn; return l['startTour'](l.constructor && (window.TOURS_FOR_TEST ?? null) || null); }).catch(() => {});
await page.evaluate(() => { document.querySelector('[data-dock="more"]')?.click(); });
await page.waitForTimeout(300);
await page.evaluate(() => { [...document.querySelectorAll('.menu-item')].find((b) => /tour|visita/i.test(b.textContent))?.click(); });
await page.waitForTimeout(500);
await page.evaluate(() => { document.querySelectorAll('.mode-card')[1]?.click(); });
await shot('tour', 4000);
await page.evaluate(() => window.atlas.learn['stopTour']());
// On this day
await page.evaluate(() => window.atlas.learn['openOnThisDay']());
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelector('.otd-item')?.click());
await shot('otd', 3000);
await page.evaluate(() => window.atlas.shell.sheet.close());
// Travel map
await page.evaluate(() => { const p = window.atlas.personal; p['p'].visited = ['MEX', 'ESP', 'FRA', 'ITA', 'USA', 'JPN', 'PER']; p['p'].wish = ['NZL', 'ISL', 'KEN']; p['p'].notes = { MEX: 'Tacos al pastor in CDMX!' }; p['save'](); window.atlas.app.setStack(['travel']); window.atlas.app.setProjection('naturalEarth', false); });
await shot('travel', 3000);
// 4K export
const dl = page.waitForEvent('download', { timeout: 30000 });
await page.evaluate(() => window.atlas.personal['exportImage']('4k'));
const d = await dl;
await d.saveAs(`${outDir}/x-export-4k.png`);
console.log('download:', d.suggestedFilename());
console.log(logs.join('\n') || 'no console errors');
await browser.close();
