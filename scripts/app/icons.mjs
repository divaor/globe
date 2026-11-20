#!/usr/bin/env node
// The app icon (v0.43.0), drawn from the real map in one of three styles:
//   a  Political globe: countries coloured by continent, as on the app's map, on a deep blue night.
//   b  Spectrum orb: the top bar's colour orb with the continents in white, so the icon and the logo are one.
//   c  Line globe: a light, flat globe of meridians and parallels with one bold pin.
// The stores round the corners themselves, so every icon is a full square. Android's adaptive icon has two layers
// (a background and a foreground that fits the middle 66%).
//   node scripts/app/icons.mjs --preview <dir>   the three styles side by side (for choosing)
//   node scripts/app/icons.mjs --style <a|b|c> [--web]   the chosen one into resources/ (for @capacitor/assets, then
//     `npx capacitor-assets generate`); with --web also the website's icons in public/icons/
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoOrthographic, geoPath, geoGraticule } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const topo = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/base/countries-110m.json'), 'utf8'));
const meta = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/base/countries-meta.json'), 'utf8'));
const countries = feature(topo, topo.objects.countries).features;
const land = merge(topo, topo.objects.countries.geometries);

// The map's palette (src/engine/colors.ts): continent hue families in OKLCH.
function oklch(L, C, h) {
  h = (h * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const g = (x) => Math.round(Math.max(0, Math.min(1, x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055)) * 255);
  return '#' + [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => g(v).toString(16).padStart(2, '0')).join('');
}
const HUE = { EU: 252, AS: 86, AF: 42, NA: 302, SA: 352, OC: 152, AN: 225, SS: 195 };
const SH = [0.8, 0.66, 0.74, 0.61, 0.85, 0.7, 0.64, 0.78, 0.69];
const colour = (id) => { const m = meta[id]; if (!m) return '#888'; return oklch(m.ct === 'AN' ? 0.93 : SH[(m.mc - 1) % 9], m.ct === 'AN' ? 0.02 : 0.14, HUE[m.ct] ?? 195); };

/** The globe turned to show Africa, Europe and the Atlantic (the most recognisable face), at radius r around (c, c). */
const globe = (c, r) => geoOrthographic().rotate([-8, -22]).translate([c, c]).scale(r).clipAngle(90).precision(0.2);
const N = 1024;

/** Each style: its background layer, its foreground layer (both N×N SVG bodies) and the globe's radius in each. */
const STYLES = {
  a: {
    name: 'Political globe',
    bg: () => `<defs><radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#1b3d73"/><stop offset="1" stop-color="#050b1a"/></radialGradient></defs><rect width="${N}" height="${N}" fill="url(#bg)"/>`,
    fg: (r) => {
      const c = N / 2, p = geoPath(globe(c, r));
      return `<defs>
  <radialGradient id="oc" cx="36%" cy="32%" r="75%"><stop offset="0" stop-color="#3f97de"/><stop offset="0.6" stop-color="#15528f"/><stop offset="1" stop-color="#082345"/></radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.8" stop-color="#5fb4ff" stop-opacity="0.5"/><stop offset="1" stop-color="#5fb4ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="shade" cx="36%" cy="30%" r="72%"><stop offset="0" stop-color="#fff" stop-opacity="0.25"/><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/></radialGradient>
</defs>
<circle cx="${c}" cy="${c}" r="${r * 1.16}" fill="url(#glow)"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#oc)"/>
<path d="${p(geoGraticule().step([20, 20])())}" fill="none" stroke="#9fd0ff" stroke-opacity="0.2" stroke-width="${N / 600}"/>
${countries.map((f) => `<path d="${p(f) ?? ''}" fill="${colour(f.id)}" stroke="#0b1a33" stroke-width="${N / 700}"/>`).join('')}
<circle cx="${c}" cy="${c}" r="${r}" fill="url(#shade)"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#bfe0ff" stroke-opacity="0.55" stroke-width="${N / 300}"/>`;
    },
  },
  b: {
    name: 'Spectrum orb',
    bg: () => `<defs><radialGradient id="bg" cx="50%" cy="38%" r="80%"><stop offset="0" stop-color="#1d1b3a"/><stop offset="1" stop-color="#08070f"/></radialGradient></defs><rect width="${N}" height="${N}" fill="url(#bg)"/>`,
    fg: (r) => {
      const c = N / 2, p = geoPath(globe(c, r));
      // The top bar's orb (src/styles/main.css .brand-logo): a conic sweep from cyan through green, yellow, coral
      // and violet, drawn as 72 thin wedges (SVG has no conic gradient).
      const stops = ['#2fc4d9', '#39d98a', '#ffd166', '#ff6b6b', '#8c6cff', '#2fc4d9'];
      const mix = (t) => { const k = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1))), u = t * (stops.length - 1) - k; const a = stops[k], b = stops[k + 1]; return '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - u) + parseInt(b.slice(i, i + 2), 16) * u).toString(16).padStart(2, '0')).join(''); };
      const wedges = Array.from({ length: 72 }, (_, i) => {
        const a0 = ((200 + i * 5 - 90) * Math.PI) / 180, a1 = ((200 + (i + 1) * 5.4 - 90) * Math.PI) / 180;
        return `<path d="M${c},${c}L${c + r * 1.02 * Math.cos(a0)},${c + r * 1.02 * Math.sin(a0)}A${r * 1.02},${r * 1.02} 0 0 1 ${c + r * 1.02 * Math.cos(a1)},${c + r * 1.02 * Math.sin(a1)}Z" fill="${mix(i / 72)}"/>`;
      }).join('');
      return `<defs>
  <clipPath id="disc"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath>
  <radialGradient id="hi" cx="34%" cy="30%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="rim" cx="50%" cy="50%" r="50%"><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0.82" stop-color="#3fd0e0" stop-opacity="0.45"/><stop offset="1" stop-color="#3fd0e0" stop-opacity="0"/></radialGradient>
</defs>
<circle cx="${c}" cy="${c}" r="${r * 1.15}" fill="url(#glow)"/>
<g clip-path="url(#disc)">${wedges}
  <path d="${p(land)}" fill="#ffffff" fill-opacity="0.9"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#rim)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#hi)"/>
</g>
<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="${N / 260}"/>`;
    },
  },
  c: {
    name: 'Line globe',
    bg: () => `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9fbf8"/><stop offset="1" stop-color="#bfeee8"/></linearGradient></defs><rect width="${N}" height="${N}" fill="url(#bg)"/>`,
    fg: (r) => {
      const c = N / 2, p = geoPath(globe(c, r));
      const ink = '#0f3d4a', sw = N / 70;
      // A map pin standing on the globe (on West Africa's coast): the round head and its point.
      const [px, py] = globe(c, r)([-12, 14]);
      const pr = r * 0.2, top = py - pr * 2.6;
      return `<circle cx="${c}" cy="${c}" r="${r}" fill="#ffffff"/>
<path d="${p(land)}" fill="#7fd8c9"/>
<path d="${p(geoGraticule().step([30, 30])())}" fill="none" stroke="${ink}" stroke-opacity="0.35" stroke-width="${sw * 0.45}"/>
<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${ink}" stroke-width="${sw}"/>
<path d="M${px},${py} C${px - pr * 0.35},${py - pr * 0.9} ${px - pr},${top + pr * 1.35} ${px - pr},${top + pr} A${pr},${pr} 0 1 1 ${px + pr},${top + pr} C${px + pr},${top + pr * 1.35} ${px + pr * 0.35},${py - pr * 0.9} ${px},${py}Z" fill="#ff6b5a" stroke="${ink}" stroke-width="${sw * 0.8}" stroke-linejoin="round"/>
<circle cx="${px}" cy="${top + pr}" r="${pr * 0.38}" fill="#ffffff" stroke="${ink}" stroke-width="${sw * 0.6}"/>`;
    },
  },
};

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}" viewBox="0 0 ${N} ${N}">${body}</svg>`;
/** The full icon (iOS, Play's 512 px icon, the website): background and foreground, the globe at 39% of the side. */
const full = (s) => svg(STYLES[s].bg() + STYLES[s].fg(N * 0.39));
/** Android's adaptive layers: the foreground's globe within the middle 66% (its safe circle), so a bit smaller. */
const fgOnly = (s) => svg(STYLES[s].fg(N * 0.29));
const bgOnly = (s) => svg(STYLES[s].bg());
const png = (s, size = N) => sharp(Buffer.from(s)).resize(size, size).png().toBuffer();

const args = process.argv.slice(2);
if (args[0] === '--preview') {
  // Each style as the stores show it: an iPhone's rounded square, an Android circle, and small on a home screen.
  const dir = path.resolve(args[1] ?? '.');
  await fs.mkdir(dir, { recursive: true });
  const T = 300, G = 40, W = 3 * T + 4 * G + 40, H = 3 * (T + G) + 180;
  const tiles = [];
  for (const [i, s] of ['a', 'b', 'c'].entries()) {
    const big = await png(full(s), T);
    const round = await sharp(big).composite([{ input: Buffer.from(`<svg width="${T}" height="${T}"><rect width="${T}" height="${T}" rx="${T * 0.225}" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    const circle = await sharp(Buffer.from(svg(STYLES[s].bg() + STYLES[s].fg(N * 0.29)))).resize(T, T).composite([{ input: Buffer.from(`<svg width="${T}" height="${T}"><circle cx="${T / 2}" cy="${T / 2}" r="${T * 0.46}" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    const small = await sharp(await png(full(s), 120)).composite([{ input: Buffer.from(`<svg width="120" height="120"><rect width="120" height="120" rx="27" fill="#fff"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
    const x = G + i * (T + G) + 20;
    tiles.push({ input: round, left: x, top: 90 }, { input: circle, left: x, top: 90 + T + G }, { input: small, left: x + (T - 120) / 2, top: 90 + 2 * (T + G) + 30 });
    await fs.writeFile(path.join(dir, `icon-${s}.png`), await png(full(s)));
  }
  const labels = ['a', 'b', 'c'].map((s, i) => `<text x="${G + i * (T + G) + 20 + T / 2}" y="58" font-family="sans-serif" font-size="30" font-weight="700" fill="#e8eef8" text-anchor="middle">${s.toUpperCase()}. ${STYLES[s].name}</text>`).join('');
  const rows = ['iPhone', 'Android', 'Home screen'].map((t, i) => `<text x="14" y="${90 + i * (T + G) + (i === 2 ? 90 : T / 2)}" font-family="sans-serif" font-size="18" fill="#8fa3bf" transform="rotate(-90 14 ${90 + i * (T + G) + (i === 2 ? 90 : T / 2)})" text-anchor="middle">${t}</text>`).join('');
  await sharp({ create: { width: W, height: H, channels: 4, background: '#141a26' } })
    .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}">${labels}${rows}</svg>`), left: 0, top: 0 }, ...tiles])
    .png().toFile(path.join(dir, 'icon-styles.png'));
  console.log(`preview in ${dir}`);
} else if (args[0] === '--style' && STYLES[args[1]]) {
  // @capacitor/assets reads resources/: icon-only.png (iOS, 1024), icon-foreground.png and icon-background.png
  // (Android's adaptive icon), splash.png and splash-dark.png (2732 × 2732, the icon on the background).
  const s = args[1], RES = path.join(ROOT, 'resources'), WEB = path.join(ROOT, 'public/icons');
  await fs.mkdir(RES, { recursive: true });
  await fs.writeFile(path.join(RES, 'icon-only.png'), await png(full(s)));
  await fs.writeFile(path.join(RES, 'icon-foreground.png'), await png(fgOnly(s)));
  await fs.writeFile(path.join(RES, 'icon-background.png'), await png(bgOnly(s)));
  const S = 2732, icon = await png(full(s), 640);
  const splash = (bg) => sharp({ create: { width: S, height: S, channels: 4, background: bg } }).composite([{ input: icon, left: (S - 640) / 2, top: (S - 640) / 2 }]).png().toBuffer();
  await fs.writeFile(path.join(RES, 'splash.png'), await splash(s === 'c' ? '#e9fbf8' : '#0b1220'));
  await fs.writeFile(path.join(RES, 'splash-dark.png'), await splash('#0b1220'));
  // The website's icons: the same art (browsers and the home screen round them too, except the favicon).
  if (args.includes('--web')) {
    await fs.writeFile(path.join(WEB, 'icon.svg'), full(s));
    for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180], ['favicon-48.png', 48]]) {
      await fs.writeFile(path.join(WEB, name), await png(full(s), size));
    }
  }
  console.log(`style ${s} (${STYLES[s].name}) written to resources/${args.includes('--web') ? ' and public/icons/' : ''}`);
} else {
  console.log('usage: node scripts/app/icons.mjs --preview <dir> | --style <a|b|c>');
  process.exit(2);
}
