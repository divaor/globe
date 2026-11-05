#!/usr/bin/env node
/**
 * Builds a present-day snapshot (world_<year>.geojson) for the political map through time, from the
 * app's own current borders (Natural Earth 1:50m, public domain), in the historical-basemaps format
 * that build-history.mjs reads (NAME, SUBJECTO, PARTOF, BORDERPRECISION).
 *
 *   node scripts/data/history/today-snapshot.mjs --out <dir>/world_2026.geojson [--year 2026]
 *       [--base public/data/base/countries-50m.json] [--meta public/data/base/countries-meta.json]
 *       [--prev public/data/history/world_2010.json]
 *
 * Every country is matched to the entity of the previous snapshot (2010) that covers the same
 * land: points are sampled inside the country and looked up in the 2010 map, and a country takes
 * the 2010 entity's NAME when each is the other's best match. That keeps colours and the "What
 * changed" lists stable, so only real changes show (South Sudan appears, Sudan shrinks). A country
 * with no such match is a new entity under its current name. The current name to display goes in
 * DISPLAY_EN / DISPLAY_ES when it differs from the 2010 name ("Zaire" is shown as "DR Congo"), and
 * RENAMED_FROM marks official renames that happened after 2010.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Countries whose 2010 entity has another name (renamed, or an older name in the 2010 data).
const SAME_AS_2010 = {
  SWZ: 'Swaziland', MKD: 'Macedonia', CZE: 'Czech Republic', TUR: 'Turkey', BLR: 'Byelarus', COD: 'Zaire', MMR: 'Burma',
  CIV: 'Ivory Coast', GMB: 'Gambia, The', PRK: "Korea, Democratic People's Republic of", KOR: 'Korea, Republic of',
  TZA: 'Tanzania, United Republic of', TTO: 'Trinidad', CYN: 'Turkish Cypriot-administered area', USA: 'United States',
  COG: 'Congo', VIR: 'United States Virgin Islands', WLF: 'Wallis and Futuna Islands', CUW: 'Netherlands Antilles',
  BLM: 'Saint Barthelemy',
};
// Drawn as part of the 2010 entity around them, as in the 2010 map: Somaliland (de facto
// independent since 1991, unrecognised) and the Siachen Glacier (disputed).
const MERGE = new Set(['SOL', 'KAS']);
// States that came into being after 2010 (listed as "appeared"). Places that are new only because
// the 2010 data left them out (Singapore, Solomon Islands, Kosovo...) are drawn but not listed.
export const NEW_SINCE = { SSD: 2011 };
// Official renames between 2010 and today: 2010 name -> current names and year.
export const RENAMES = {
  'Czech Republic': { en: 'Czechia', es: 'Chequia', fromEs: 'República Checa', year: 2016 },
  Swaziland: { en: 'Eswatini', es: 'Esuatini', fromEs: 'Suazilandia', year: 2018 },
  Macedonia: { en: 'North Macedonia', es: 'Macedonia del Norte', fromEs: 'Macedonia', year: 2019 },
  Turkey: { en: 'Türkiye', es: 'Türkiye', fromEs: 'Turquía', year: 2022 },
};

function args(argv) {
  const o = {
    year: 2026,
    base: path.join(ROOT, 'public/data/base/countries-50m.json'),
    meta: path.join(ROOT, 'public/data/base/countries-meta.json'),
    prev: path.join(ROOT, 'public/data/history/world_2010.json'),
    out: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '');
    if (!(k in o)) throw new Error(`Unknown argument ${argv[i]}`);
    o[k] = k === 'year' ? Number(argv[++i]) : argv[++i];
  }
  if (!o.out) throw new Error('Pass --out <file>/world_<year>.geojson');
  return o;
}

/** Small deterministic PRNG (mulberry32), seeded per country so runs are reproducible. */
function rng(seedText) {
  let a = [...seedText].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0), 1779033703);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inBox = ([[w, s], [e, n]], [x, y]) => y >= s && y <= n && (w <= e ? x >= w && x <= e : x >= w || x <= e);

/** Up to `want` points inside a feature (plus its label point), sampled uniformly in its box. */
function samplePoints(f, seed, label, want = 60, tries = 4000) {
  const [[w, s], [e, n]] = geoBounds(f);
  const span = (e >= w ? e - w : e + 360 - w);
  const r = rng(seed);
  const pts = [];
  if (label && geoContains(f, label)) pts.push(label);
  for (let i = 0; i < tries && pts.length < want; i++) {
    let x = w + r() * span;
    if (x > 180) x -= 360;
    const p = [x, s + r() * (n - s)];
    if (geoContains(f, p)) pts.push(p);
  }
  return pts;
}

export function buildToday(o) {
  const meta = JSON.parse(fs.readFileSync(o.meta, 'utf8'));
  const baseTopo = JSON.parse(fs.readFileSync(o.base, 'utf8'));
  const prevTopo = JSON.parse(fs.readFileSync(o.prev, 'utf8'));
  const today = feature(baseTopo, baseTopo.objects.countries).features
    .filter((f) => f.geometry && meta[f.id] && meta[f.id].ct !== 'AN'); // Antarctica is in no snapshot
  const prev = feature(prevTopo, prevTopo.objects.world).features.filter((f) => f.geometry && f.properties?.n);
  const prevBoxes = prev.map((f) => geoBounds(f));

  // Overlap estimate between each current country and each 2010 entity (area x share of samples).
  const overlap = new Map(); // id -> Map(name -> steradians)
  for (const f of today) {
    const m = meta[f.id];
    const pts = samplePoints(f, f.id, m.lx != null ? [m.lx, m.ly] : null);
    const hits = new Map();
    for (const p of pts) {
      const i = prev.findIndex((g, j) => inBox(prevBoxes[j], p) && geoContains(g, p));
      if (i >= 0) hits.set(prev[i].properties.n, (hits.get(prev[i].properties.n) || 0) + 1);
    }
    const area = geoArea(f);
    overlap.set(f.id, new Map([...hits].map(([n, k]) => [n, (area * k) / Math.max(1, pts.length)])));
  }
  const bestOf = (m) => [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
  const bestCountry = new Map(); // 2010 name -> current id with the largest overlap
  for (const [id, m] of overlap) {
    for (const [n, v] of m) {
      const cur = bestCountry.get(n);
      if (!cur || v > overlap.get(cur).get(n) || (v === overlap.get(cur).get(n) && id < cur)) bestCountry.set(n, id);
    }
  }
  const prevProps = new Map(prev.map((f) => [f.properties.n, f.properties]));

  const key = new Map(); // id -> entity name used in the history data
  const report = { matched: [], merged: [], added: [], absent2010: [] };
  const taken = new Set();
  for (const f of today) {
    const alias = SAME_AS_2010[f.id];
    if (alias && prevProps.has(alias)) { key.set(f.id, alias); taken.add(alias); report.matched.push(`${meta[f.id].n} = ${alias}`); }
  }
  for (const f of today) {
    if (key.has(f.id)) continue;
    const m = meta[f.id];
    const display = m.sn || m.n;
    const best = bestOf(overlap.get(f.id));
    if (MERGE.has(f.id) && best) { key.set(f.id, best); report.merged.push(`${display} -> ${best}`); continue; }
    if (best && !taken.has(best) && bestCountry.get(best) === f.id) { key.set(f.id, best); taken.add(best); report.matched.push(`${display} = ${best}`); continue; }
    if (prevProps.has(display)) { key.set(f.id, display); taken.add(display); report.matched.push(`${display} (same name)`); continue; }
    key.set(f.id, display);
    (NEW_SINCE[f.id] ? report.added : report.absent2010).push(display);
  }

  const features = today.map((f) => {
    const m = meta[f.id];
    const n = key.get(f.id);
    const ren = RENAMES[n];
    // A merged place (Somaliland) is drawn as the entity around it, under that entity's name.
    const host = MERGE.has(f.id) ? today.find((g) => g.id !== f.id && key.get(g.id) === n) : null;
    const mm = host ? meta[host.id] : m;
    const en = ren ? ren.en : (mm.sn || mm.n);
    const es = ren ? ren.es : (mm.ses || mm.es || en);
    // The sovereign of a dependency, by its entity name (Hong Kong under China, Greenland under Denmark).
    const sovId = m.sovA3 && m.sovA3 !== f.id ? Object.keys(meta).find((k) => k === m.sovA3 || meta[k].iso === m.sovA3) : null;
    const subj = prevProps.get(n)?.s ?? (sovId && key.get(sovId) && key.get(sovId) !== n ? key.get(sovId) : null);
    return {
      type: 'Feature',
      properties: {
        NAME: n, SUBJECTO: subj, PARTOF: null, BORDERPRECISION: 3,
        DISPLAY_EN: en !== n ? en : null, DISPLAY_ES: es !== n ? es : null,
        RENAMED_FROM: ren ? n : null, RENAMED_FROM_ES: ren ? ren.fromEs : null,
        NEW_SINCE: NEW_SINCE[f.id] ?? null,
      },
      geometry: f.geometry,
    };
  });
  return { type: 'FeatureCollection', features, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2));
  const { report, ...fc } = buildToday(o);
  fs.mkdirSync(path.dirname(o.out), { recursive: true });
  fs.writeFileSync(o.out, JSON.stringify(fc));
  console.log(`${fc.features.length} countries -> ${o.out}`);
  console.log(`matched to 2010: ${report.matched.length}; merged: ${report.merged.join(', ') || 'none'}`);
  console.log(`new since 2010: ${report.added.join(', ') || 'none'}`);
  console.log(`not in the 2010 data (drawn, not listed as new): ${report.absent2010.join(', ') || 'none'}`);
}
