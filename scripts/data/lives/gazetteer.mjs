// A gazetteer of the world's towns for Lives on the map (v0.28.0): where a town is, by name, and which towns are
// near a point. It reads GeoNames' cities500 (every place of 500 people or more, about 237,000; CC BY 4.0,
// https://download.geonames.org/export/dump/), kept in .cache/geonames and fetched once.
//
//   node scripts/data/lives/gazetteer.mjs "Coyoacán"            the places of that name, the biggest first
//   node scripts/data/lives/gazetteer.mjs "Stratford" GB         only in one country (ISO code)
//   node scripts/data/lives/gazetteer.mjs --near -99.16 19.35    the towns within 30 km of [lon, lat]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, '.cache/geonames');
const FILE = path.join(DIR, 'cities500.txt');
const URL = 'https://download.geonames.org/export/dump/cities500.zip';
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';

/** Lowercase, no accents, no punctuation: "Coyoacán" → "coyoacan", "Saint-Rémy-de-Provence" → "saint remy de provence". */
export const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`.]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Kilometres between two [lon, lat] points. */
export function km(a, b) {
  const r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

let cache = null;
/** { places: [{ name, ascii, alt: [..], at: [lon, lat], cc, admin1, pop }], byName: Map(norm name → places), cell(lon, lat) → places } */
export function loadGazetteer() {
  if (cache) return cache;
  if (!fs.existsSync(FILE)) {
    fs.mkdirSync(DIR, { recursive: true });
    const zip = path.join(DIR, 'cities500.zip');
    execFileSync('curl', ['-sS', '--fail', '--max-time', '300', '-A', UA, '-o', zip, URL], { stdio: 'inherit' });
    execFileSync('unzip', ['-o', '-q', zip, '-d', DIR], { stdio: 'inherit' });
  }
  const places = [];
  const byName = new Map();
  const grid = new Map();
  for (const line of fs.readFileSync(FILE, 'utf8').split('\n')) {
    if (!line) continue;
    const f = line.split('\t');
    const p = { name: f[1], ascii: f[2], alt: f[3] ? f[3].split(',') : [], at: [Number(f[5]), Number(f[4])], cc: f[8], admin1: f[10], pop: Number(f[14]) || 0 };
    places.push(p);
    for (const n of new Set([p.name, p.ascii, ...p.alt].map(norm))) {
      if (!n) continue;
      const list = byName.get(n);
      if (list) list.push(p); else byName.set(n, [p]);
    }
    const k = `${Math.floor(p.at[0])},${Math.floor(p.at[1])}`;
    const cellList = grid.get(k);
    if (cellList) cellList.push(p); else grid.set(k, [p]);
  }
  cache = { places, byName, grid };
  return cache;
}

/** The places called `name` (in any language GeoNames knows), the biggest first; `cc` keeps one country. */
export function findPlace(name, cc) {
  const { byName } = loadGazetteer();
  return [...(byName.get(norm(name)) ?? [])].filter((p) => !cc || p.cc === cc.toUpperCase()).sort((a, b) => b.pop - a.pop);
}

/** The places within `radius` km of a point, the nearest first, each with its distance (`d`). */
export function near(at, radius = 30) {
  const { grid } = loadGazetteer();
  const out = [];
  const dLat = Math.ceil(radius / 111) + 1;
  const dLon = Math.ceil(radius / (111 * Math.max(0.1, Math.cos(at[1] * Math.PI / 180)))) + 1;
  for (let x = Math.floor(at[0]) - dLon; x <= Math.floor(at[0]) + dLon; x++) {
    for (let y = Math.floor(at[1]) - dLat; y <= Math.floor(at[1]) + dLat; y++) {
      const wx = ((x + 180) % 360 + 360) % 360 - 180;
      for (const p of grid.get(`${wx},${y}`) ?? []) { const d = km(at, p.at); if (d <= radius) out.push({ ...p, d }); }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

/**
 * Does a place name ("Coyoacán, Mexico City", "Stratford-upon-Avon, England") name a town near the point?
 * Returns { ok, nearest } where `nearest` is the closest town (for the message).
 */
export function namedNear(placeNames, at, radius = 30) {
  const hay = placeNames.map((s) => ` ${norm(s)} `);
  const around = near(at, radius);
  for (const p of around) {
    for (const n of new Set([p.name, p.ascii, ...p.alt].map(norm))) {
      if (n.length >= 3 && hay.some((h) => h.includes(` ${n} `))) return { ok: true, nearest: around[0], match: p };
    }
  }
  return { ok: false, nearest: around[0] ?? null };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const row = (p) => `${p.name}\t${p.cc}${p.admin1 ? `-${p.admin1}` : ''}\t[${p.at[0].toFixed(4)}, ${p.at[1].toFixed(4)}]\tpop ${p.pop}${p.d != null ? `\t${p.d.toFixed(1)} km` : ''}`;
  if (args[0] === '--near') {
    const list = near([Number(args[1]), Number(args[2])], Number(args[3]) || 30);
    console.log(list.length ? list.slice(0, 15).map(row).join('\n') : 'no town within that distance');
  } else if (args[0]) {
    const list = findPlace(args[0], args[1]);
    console.log(list.length ? list.slice(0, 12).map(row).join('\n') : `no town called "${args[0]}"${args[1] ? ` in ${args[1]}` : ''} (try another spelling, or the nearest town)`);
  } else {
    console.log('usage: gazetteer.mjs "<town>" [country code]   |   gazetteer.mjs --near <lon> <lat> [km]');
  }
}
