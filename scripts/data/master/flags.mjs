// Master the world (v0.34.0): flags that look alike. Each flag of the deck (public/flags, flag-icons, MIT) is drawn
// small (32×24) in the browser, its colours taken to CIELAB, and every pair compared pixel by pixel (the mean colour
// difference, ΔE). Each country gets its three closest flags; the closest pairs are listed for the hand-written notes
// on how to tell them apart (curated/flags.json). Writes .cache/master/flags-near.json (read by build-master.mjs).
//   node scripts/data/master/flags.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require.resolve('playwright', { paths: ['/opt/node-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules'] }))); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/master/deck.json'), 'utf8')).countries;
const W = 32, H = 24;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
const pixels = {};
for (const c of deck) {
  const svg = fs.readFileSync(path.join(ROOT, 'public/flags', `${c.a2.toLowerCase()}.svg`), 'utf8');
  pixels[c.id] = await page.evaluate(async ([svg, W, H]) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, W, H);
    return Array.from(g.getImageData(0, 0, W, H).data);
  }, [svg, W, H]);
}
await browser.close();

// sRGB → CIELAB (D65).
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
const lab = (r, g, b) => {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const L = {};
for (const [id, px] of Object.entries(pixels)) { const out = []; for (let i = 0; i < px.length; i += 4) out.push(lab(px[i], px[i + 1], px[i + 2])); L[id] = out; }
const ids = Object.keys(L);
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1], a[i][2] - b[i][2]); return s / a.length; };
const near = {}, pairs = [];
for (const a of ids) {
  const d = ids.filter((b) => b !== a).map((b) => [b, diff(L[a], L[b])]).sort((x, y) => x[1] - y[1]);
  near[a] = d.slice(0, 3).map(([b, v]) => [b, Math.round(v * 10) / 10]);
  for (const [b, v] of d.slice(0, 3)) if (a < b) pairs.push([a, b, Math.round(v * 10) / 10]);
}
pairs.sort((x, y) => x[2] - y[2]);
fs.mkdirSync(path.join(ROOT, '.cache/master'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.cache/master/flags-near.json'), JSON.stringify({ near, pairs }, null, 0));
console.log(`${ids.length} flags; the closest pairs:`);
console.log(pairs.slice(0, 60).map((p) => p.join(' ')).join('\n'));
