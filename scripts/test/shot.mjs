#!/usr/bin/env node
// Screenshot helper: node scripts/test/shot.mjs <url> <out.png> [width] [height] [js-to-run-before-shot] [waitMs]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require.resolve('playwright', { paths: [process.env.NODE_PATH || '', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }
const [url, out, w = '1280', h = '800', script = '', wait = '1500', scale = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || "").split("\n").slice(0, 6).join("\n")}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.getElementById('splash') || document.getElementById('splash').classList.contains('hide'), null, { timeout: 30000 });
await page.waitForTimeout(800);
if (script) { await page.evaluate(script); }
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(logs.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
