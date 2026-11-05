#!/usr/bin/env node
// Captures a projection morph at fixed progress values: node scripts/test/morph-shot.mjs <url> <target> <outPrefix> [t1,t2,...]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, target, prefix, ts = '0.15,0.4,0.65,0.9'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('splash')?.classList.contains('hide') ?? true, null, { timeout: 30000 });
await page.waitForTimeout(500);
for (const t of ts.split(',').map(Number)) {
  await page.evaluate(([target, t]) => {
    const r = window.atlas.app.renderer, v = r.view;
    if (!v.morph) v.setProjection(target, true, 1e12);
    // Find the start time that gives eased progress t.
    let lo = 0, hi = 1;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; const e = m < 0.5 ? 4 * m * m * m : 1 - Math.pow(-2 * m + 2, 3) / 2; if (e < t) lo = m; else hi = m; }
    v.morph.start = performance.now() - lo * 1e12;
    r.requestRender();
  }, [target, t]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${prefix}-${t}.png` });
}
await browser.close();
