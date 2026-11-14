#!/usr/bin/env node
/**
 * Time detective: for each region of the world and each borders map of public/data/history, which polities
 * cover the region's land and how much, and how different each pair of years looks there. The quiz picks a
 * region and a year, and three other years whose maps of that region clearly differ from it and from each other.
 *
 *   node scripts/data/history/detective.mjs [--check]
 *
 * Writes public/data/history/detective.json. With --check, only checks that it covers the captioned years and the
 * regions (fast).
 * Land is sampled on a 1° grid (0.5° in small regions); a point is land when any shape of that year's map covers it.
 * Only the years the game has a caption for (src/learn/detective.ts) are measured. Node runs that TypeScript file
 * directly (type stripping, Node 22.18 or later).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import { DETECTIVE_YEARS } from '../../../src/learn/detective.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'public/data/history');
const OUT = path.join(DIR, 'detective.json');
const check = process.argv.includes('--check');

/**
 * Regions: [west, south, east, north], the view of the quiz [lon, lat, zoom], and the first year asked about.
 * Before it, the region's map shows broad culture areas ("Plains bison hunters", "Bantu peoples") rather than
 * states, which no one could date from their shapes.
 */
const REGIONS = [
  { id: 'europe', en: 'Europe', es: 'Europa', box: [-11, 35, 42, 61], cam: [15, 49, 3.2], from: -2000 },
  { id: 'mediterranean', en: 'The Mediterranean', es: 'El Mediterráneo', box: [-10, 28, 38, 46], cam: [14, 37, 3.2], from: -2000 },
  { id: 'mideast', en: 'The Middle East', es: 'Oriente Medio', box: [26, 12, 63, 42], cam: [43, 29, 3.2], from: -2000 },
  { id: 'steppe', en: 'Central Asia', es: 'Asia Central', box: [45, 35, 110, 55], cam: [77, 45, 2.4], from: 800 },
  { id: 'southasia', en: 'South Asia', es: 'Asia del Sur', box: [60, 6, 97, 36], cam: [80, 22, 3], from: -2000 },
  { id: 'eastasia', en: 'East Asia', es: 'Asia Oriental', box: [95, 18, 145, 50], cam: [115, 35, 2.6], from: -2000 },
  { id: 'africa', en: 'Africa', es: 'África', box: [-18, -35, 52, 37], cam: [18, 2, 1.9], from: 1880 },
  { id: 'northamerica', en: 'North America', es: 'América del Norte', box: [-130, 14, -55, 60], cam: [-95, 38, 2.1], from: 1783 },
  { id: 'southamerica', en: 'South America', es: 'América del Sur', box: [-82, -56, -34, 13], cam: [-62, -20, 2], from: 1783 },
];
const usable = (s) => s.year in DETECTIVE_YEARS;

const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const snaps = index.snapshots.filter(usable);

// --check is quick: the file must cover the captioned years and regions (measuring the maps again takes minutes).
if (check) {
  const have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  const want = snaps.map((x) => x.year).join(',');
  const bad = !have || have.years.join(',') !== want || have.regions.map((r) => `${r.id}:${r.from}`).join(',') !== REGIONS.map((r) => `${r.id}:${r.from}`).join(',');
  if (bad) { console.error('detective.json is out of date: run node scripts/data/history/detective.mjs'); process.exit(1); }
  console.log('detective.json covers the captioned years and regions');
  process.exit(0);
}

const grid = (box) => {
  const [w, s, e, n] = box;
  const step = (e - w) * (n - s) > 1500 ? 1 : 0.5;
  const pts = [];
  for (let lat = s + step / 2; lat < n; lat += step) for (let lon = w + step / 2; lon < e; lon += step) pts.push([lon, lat]);
  return pts;
};

const out = { about: 'Time detective: share of each region’s land per polity on each borders map (scripts/data/history/detective.mjs).', years: snaps.map((s) => s.year), regions: [] };
const perYear = new Map();
for (const s of snaps) {
  const topo = JSON.parse(fs.readFileSync(path.join(DIR, s.file), 'utf8'));
  const fc = feature(topo, topo.objects.world);
  perYear.set(s.year, fc.features.map((f) => ({ n: f.properties.n ?? '', f, b: geoBounds(f) })));
}

const inBox = (b, p) => {
  const [[w, s], [e, n]] = b;
  if (p[1] < s || p[1] > n) return false;
  return w <= e ? p[0] >= w && p[0] <= e : p[0] >= w || p[0] <= e;
};

for (const r of REGIONS) {
  const pts = grid(r.box);
  const sig = {};
  for (const s of snaps) {
    const feats = perYear.get(s.year);
    const count = new Map();
    let land = 0;
    for (const p of pts) {
      // A named polity wins over an unnamed shape covering the same point.
      let hit = null;
      for (const x of feats) if (inBox(x.b, p) && geoContains(x.f, p)) { hit = x.n; if (hit) break; }
      if (hit === null) continue;
      land++;
      count.set(hit, (count.get(hit) ?? 0) + 1);
    }
    const shares = [...count.entries()].map(([n, c]) => [n, c / Math.max(1, land)]).sort((a, b) => b[1] - a[1]);
    const claimed = shares.filter(([n]) => n).reduce((a, [, v]) => a + v, 0);
    sig[s.year] = { land, claimed, shares };
  }
  // Distance: the share of land that is not under the same polity in both years (unclaimed land counts as one).
  const dist = (a, b) => {
    const A = new Map(sig[a].shares), B = new Map(sig[b].shares);
    let same = 0;
    for (const [n, v] of A) same += Math.min(v, B.get(n) ?? 0);
    return 1 - same;
  };
  const years = snaps.map((s) => s.year);
  const d = years.map((a) => years.map((b) => Math.round(dist(a, b) * 100)));
  out.regions.push({
    id: r.id, en: r.en, es: r.es, cam: r.cam, from: r.from,
    // Per year: how much of the land is under a named polity (%), how many polities hold at least 2%, and the largest.
    maps: years.map((y) => {
      const x = sig[y];
      const named = x.shares.filter(([n]) => n);
      return { claimed: Math.round(x.claimed * 100), polities: named.filter(([, v]) => v >= 0.02).length, top: named.slice(0, 5).map(([n, v]) => [n, Math.round(v * 100)]) };
    }),
    dist: d,
  });
  console.log(`${r.id}: ${pts.length} points; usable maps ${out.regions.at(-1).maps.filter((m, i) => years[i] >= r.from && m.claimed >= 40 && m.polities >= 3).length}/${years.length}`);
}

const text = JSON.stringify(out);
fs.writeFileSync(OUT, text);
console.log(`wrote ${path.relative(ROOT, OUT)} (${Math.round(text.length / 1024)} KB)`);
