#!/usr/bin/env node
// Renders the live layers with mocked API responses (the build machine cannot reach the APIs).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--disable-accelerated-2d-canvas'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
const now = Date.now();
const quakes = { features: [
  [142.4, 38.3, 24, 6.8, 'near the east coast of Honshu, Japan', 1], [-72.6, -33.0, 30, 5.9, 'offshore Valparaíso, Chile', 0], [-155.3, 19.4, 3, 3.1, 'Hawaii', 0],
  [27.3, 37.9, 10, 4.4, 'western Turkey', 0], [120.9, 23.8, 15, 5.2, 'Taiwan', 0], [-117.6, 35.7, 8, 2.9, 'Ridgecrest, CA', 0], [96.1, 2.5, 35, 6.1, 'Sumatra', 0],
].map(([lon, lat, depth, mag, place, tsu], i) => ({ geometry: { coordinates: [lon, lat, depth] }, properties: { mag, place, time: now - i * 3_600_000, url: '', tsunami: tsu } })) };
await page.route('**/earthquake.usgs.gov/**', (r) => r.fulfill({ json: quakes }));
await page.route('**/api.open-meteo.com/**', (r) => {
  const u = new URL(r.request().url());
  const n = u.searchParams.get('latitude').split(',').length;
  const lats = u.searchParams.get('latitude').split(',').map(Number);
  r.fulfill({ json: Array.from({ length: n }, (_, i) => ({ current: { temperature_2m: Math.round(30 - Math.abs(lats[i]) * 0.6), weather_code: [0, 2, 3, 61, 71, 95][i % 6], wind_speed_10m: 12, is_day: 1 } })) });
});
await page.route('**/api.wheretheiss.at/**', (r) => r.fulfill({ json: { latitude: 12.3, longitude: 45.6, altitude: 418, velocity: 27580, visibility: 'daylight' } }));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.getElementById('splash')?.classList.contains('hide') ?? true, null, { timeout: 30000 });
await page.evaluate(() => { window.atlas.app.setStack(['political', 'quakes', 'weather', 'iss']); window.atlas.app.renderer.view.flyTo({ lon: 110, lat: 20, zoom: 1.1 }); });
await page.waitForTimeout(6000);
await page.screenshot({ path: out });
console.log(logs.join('\n') || 'no console errors');
await browser.close();
