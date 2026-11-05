#!/usr/bin/env node
// Renders the app icons from the real map: a globe (orthographic) with countries coloured by
// continent, on the app's dark background. Outputs public/icons/*.png + icon.svg.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'public/icons');
const topo = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/base/countries-110m.json'), 'utf8'));
const meta = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/base/countries-meta.json'), 'utf8'));
const countries = feature(topo, topo.objects.countries).features;

// Same OKLCH palette idea as src/engine/colors.ts (continent hue families).
function oklch(L, C, h) {
  h = (h * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const g = (x) => Math.round(Math.max(0, Math.min(1, x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055)) * 255);
  return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => g(v).toString(16).padStart(2, '0')).join('');
}
const HUE = { EU: 252, AS: 86, AF: 42, NA: 302, SA: 352, OC: 152, AN: 225, SS: 195 };
const SH = [0.8, 0.66, 0.74, 0.61, 0.85, 0.7, 0.64, 0.78, 0.69];
const color = (id) => { const m = meta[id]; if (!m) return '#888'; return oklch(m.ct === 'AN' ? 0.93 : SH[(m.mc - 1) % 9], m.ct === 'AN' ? 0.02 : 0.14, HUE[m.ct] ?? 195); };

function svg(size, { maskable = false } = {}) {
  const r = maskable ? size * 0.36 : size * 0.4;
  const c = size / 2;
  const proj = geoOrthographic().rotate([10, -18]).translate([c, c]).scale(r).clipAngle(90).precision(0.3);
  const p = geoPath(proj);
  const land = countries.map((f) => `<path d="${p(f) ?? ''}" fill="${color(f.id)}" stroke="#0b1a33" stroke-width="${size / 900}"/>`).join('');
  const bg = maskable
    ? `<rect width="${size}" height="${size}" fill="url(#bg)"/>`
    : `<rect x="${size * 0.04}" y="${size * 0.04}" width="${size * 0.92}" height="${size * 0.92}" rx="${size * 0.22}" fill="url(#bg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>
  <radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#14305c"/><stop offset="1" stop-color="#040a17"/></radialGradient>
  <radialGradient id="oc" cx="36%" cy="32%" r="75%"><stop offset="0" stop-color="#3a8fd6"/><stop offset="0.6" stop-color="#14508d"/><stop offset="1" stop-color="#082345"/></radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.78" stop-color="#5fb4ff" stop-opacity="0.55"/><stop offset="1" stop-color="#5fb4ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="shade" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
</defs>
${bg}
<circle cx="${c}" cy="${c}" r="${r * 1.17}" fill="url(#glow)"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#oc)"/>
<path d="${p(geoGraticule10())}" fill="none" stroke="#9fd0ff" stroke-opacity="0.18" stroke-width="${size / 700}"/>
${land}
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#shade)"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#9fd0ff" stroke-opacity="0.5" stroke-width="${size / 400}"/>
</svg>`;
}

await fs.mkdir(OUT, { recursive: true });
await fs.writeFile(path.join(OUT, 'icon.svg'), svg(256));
for (const [name, size, opts] of [['icon-192.png', 192, {}], ['icon-512.png', 512, {}], ['icon-maskable-512.png', 512, { maskable: true }], ['apple-touch-icon.png', 180, { maskable: true }], ['favicon-48.png', 48, {}]]) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(path.join(OUT, name));
}
console.log('icons written to', OUT);
