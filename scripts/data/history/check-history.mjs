#!/usr/bin/env node
/**
 * Validates public/data/history (or --data <dir>): schema of every file, integer quantized arcs,
 * no inverted polygons (d3-geo winding), colour indices consistent with entities.json, index and
 * changes consistent with the snapshot files, file sizes, and neighbour colour clashes.
 *
 *   node scripts/data/history/check-history.mjs [--data public/data/history] [--max-kb 250]
 *
 * Exits with code 1 when an error is found (size overruns are warnings).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoArea } from 'd3-geo';
import { feature, neighbors } from 'topojson-client';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const dir = arg('data', path.resolve(SCRIPT_DIR, '../../../public/data/history'));
const maxKb = Number(arg('max-kb', 250));
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

const index = read('index.json');
const entities = read('entities.json');
const changes = read('changes.json');
if (!index.source || index.license !== 'GPL-3.0' || !Array.isArray(index.snapshots)) err('index.json: bad header');
const seen = new Map(); // name -> [years]
let total = 0;
let clashes = 0;
let pairs = 0;
const ALLOWED = new Set(['n', 's', 'p', 'pr', 'c']);

index.snapshots.forEach((snap, i) => {
  const prev = index.snapshots[i - 1];
  if (prev && !(prev.year < snap.year)) err(`index.json: years not strictly ascending at ${snap.year}`);
  if (snap.year === 0) err('index.json: year 0 does not exist');
  const expectFile = `world_${snap.year < 0 ? `bc${-snap.year}` : snap.year}.json`;
  if (snap.file !== expectFile) err(`index.json: ${snap.year} -> ${snap.file}, expected ${expectFile}`);
  if (!snap.label_en || !snap.label_es) err(`index.json: missing labels for ${snap.year}`);
  const text = fs.readFileSync(path.join(dir, snap.file), 'utf8');
  total += text.length;
  if (text.length > maxKb * 1024) warnings.push(`${snap.file}: ${(text.length / 1024).toFixed(0)} KB > ${maxKb} KB`);
  const topo = JSON.parse(text);
  if (topo.type !== 'Topology' || !topo.transform) err(`${snap.file}: not a quantized Topology`);
  const keys = Object.keys(topo.objects);
  if (keys.length !== 1 || keys[0] !== 'world' || topo.objects.world.type !== 'GeometryCollection') err(`${snap.file}: objects must be exactly { world: GeometryCollection }`);
  for (const arc of topo.arcs) for (const pt of arc) if (!Number.isInteger(pt[0]) || !Number.isInteger(pt[1])) { err(`${snap.file}: non-integer arc coordinate`); break; }
  const geoms = topo.objects.world.geometries;
  if (geoms.length !== snap.features) err(`${snap.file}: ${geoms.length} geometries, index says ${snap.features}`);
  const names = new Set();
  for (const g of geoms) {
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') err(`${snap.file}: geometry type ${g.type}`);
    const p = g.properties || {};
    for (const k of Object.keys(p)) if (!ALLOWED.has(k)) err(`${snap.file}: unexpected property ${k}`);
    if (![1, 2, 3].includes(p.pr)) err(`${snap.file}: pr=${p.pr}`);
    if (p.n) {
      names.add(p.n);
      if (!Number.isInteger(p.c) || p.c < 0 || p.c > 23) err(`${snap.file}: ${p.n} c=${p.c}`);
      if (!entities[p.n]) err(`${snap.file}: ${p.n} missing from entities.json`);
      else if (entities[p.n].c !== p.c) err(`${snap.file}: ${p.n} c=${p.c} but entities.json says ${entities[p.n].c}`);
      if (p.s === p.n || p.p === p.n) err(`${snap.file}: ${p.n} has s/p equal to n`);
    } else if (p.c != null || p.s != null || p.p != null) err(`${snap.file}: unnamed feature with c/s/p`);
  }
  for (const n of names) {
    if (!seen.has(n)) seen.set(n, []);
    seen.get(n).push(snap.year);
  }
  const fc = feature(topo, topo.objects.world);
  fc.features.forEach((f, k) => {
    const a = geoArea(f);
    if (!(a > 0 && a < 2 * Math.PI)) err(`${snap.file}: feature ${k} (${f.properties.n || 'unnamed'}) has area ${a} sr (inverted or empty)`);
  });
  const nb = neighbors(geoms);
  nb.forEach((list, a) => list.forEach((b) => {
    if (b <= a) return;
    const A = geoms[a].properties;
    const B = geoms[b].properties;
    if (!A.n || !B.n || A.n === B.n) return;
    pairs++;
    if (A.c === B.c) { clashes++; err(`${snap.file}: neighbours ${A.n} / ${B.n} share colour ${A.c}`); }
  }));
});

for (const [name, e] of Object.entries(entities)) {
  const years = seen.get(name);
  if (!years) { err(`entities.json: ${name} appears in no snapshot`); continue; }
  if (e.first !== years[0] || e.last !== years[years.length - 1] || e.n !== years.length) err(`entities.json: ${name} first/last/n mismatch`);
}
for (const n of seen.keys()) if (!entities[n]) err(`entities.json: missing ${n}`);

if (changes.length !== index.snapshots.length - 1) err('changes.json: wrong length');
changes.forEach((c, i) => {
  if (c.from !== index.snapshots[i].year || c.to !== index.snapshots[i + 1].year) err(`changes.json: entry ${i} years`);
  for (const k of ['appeared', 'disappeared', 'grew', 'shrank']) if (!Array.isArray(c[k]) || c[k].length > 12) err(`changes.json: entry ${i} ${k}`);
});

const all = fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
console.log(`${index.snapshots.length} snapshots, ${Object.keys(entities).length} entities, snapshot files ${(total / 1024).toFixed(0)} KB, folder ${(all / 1024).toFixed(0)} KB`);
console.log(`touching entity pairs ${pairs}, same colour ${clashes}`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors.slice(0, 50)) console.log(`ERROR: ${e}`);
if (errors.length) {
  console.log(`${errors.length} error(s)`);
  process.exit(1);
}
console.log('OK');
