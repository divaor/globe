#!/usr/bin/env node
/**
 * Build the "political map through time" data set for Atlas Globe from
 * aourednik/historical-basemaps (GPL-3.0).
 *
 *   node scripts/data/history/build-history.mjs --repo <historical-basemaps clone>
 *   node scripts/data/history/build-history.mjs --src  <dir with world_*.geojson>
 *
 * Writes into public/data/history/ (override with --out):
 *   world_<year>.json  one TopoJSON per snapshot, object "world"
 *   index.json         snapshot list (year, file, labels, feature count)
 *   entities.json      stable colour index + first/last snapshot per entity name
 *   changes.json       what appeared / disappeared / grew / shrank between snapshots
 *
 * See README.md in this folder for the processing steps and options.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { geoArea, geoContains, geoLength } from 'd3-geo';
import { geoStitch } from 'd3-geo-projection';
import { feature as topoFeature, neighbors as topoNeighbors, quantize as topoQuantize } from 'topojson-client';
import { topology as topoTopology } from 'topojson-server';

const require = createRequire(import.meta.url);
const mapshaper = require('mapshaper');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const EARTH_RADIUS_KM = 6371.0088;
const KM2_PER_SR = EARTH_RADIUS_KM * EARTH_RADIUS_KM;
const SOURCE_URL = 'https://github.com/aourednik/historical-basemaps';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
const DEFAULTS = {
  out: path.join(REPO_ROOT, 'public/data/history'),
  work: path.join(os.tmpdir(), 'atlas-history-build'),
  intervalKm: 4, // simplification resolution to start from (weighted Visvalingam, 3D)
  maxIntervalKm: 10, // never simplify coarser than this (world_1492 ends up above targetKb)
  targetKb: 230, // raise the interval step by step until a snapshot fits
  sliverKm2: 300, // polygon parts below this (not the largest part of their entity) merge into a neighbour
  quantization: 100000,
  colours: 24,
  minChangeKm2: 20000,
  minChangePct: 15,
  maxPerList: 12,
  nearKm: 150, // non-touching entities closer than this also try to get different colours
};

export function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '--repo': opts.repo = next(); break;
      case '--src': opts.src = next(); break;
      case '--extra': (opts.extra ||= []).push(next()); break;
      case '--keep-colours': opts.keepColours = next(); break;
      case '--out': opts.out = next(); break;
      case '--work': opts.work = next(); break;
      case '--only': opts.only = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--interval-km': opts.intervalKm = Number(next()); break;
      case '--max-interval-km': opts.maxIntervalKm = Number(next()); break;
      case '--target-kb': opts.targetKb = Number(next()); break;
      case '--sliver-km2': opts.sliverKm2 = Number(next()); break;
      case '--near-km': opts.nearKm = Number(next()); break;
      case '-h': case '--help':
        console.log('Usage: build-history.mjs (--repo <historical-basemaps git clone> | --src <dir of world_*.geojson>) [--extra world_2026.geojson] [--out dir] [--work dir] [--only bc500,1492] [--interval-km 4] [--target-kb 230] [--sliver-km2 300]');
        process.exit(0);
        break;
      default: throw new Error(`Unknown argument ${a}`);
    }
  }
  if (!opts.repo && !opts.src) throw new Error('Pass --repo <historical-basemaps clone> or --src <dir with world_*.geojson>');
  return opts;
}

// ---------------------------------------------------------------------------
// Snapshots, years and labels
// ---------------------------------------------------------------------------
const SNAPSHOT_RE = /^world_(bc)?(\d+)\.geojson$/;

function yearOf(match) {
  // There is no year 0: world_bc1 is 1 BC = -1, world_100 is AD 100.
  return match[1] ? -Number(match[2]) : Number(match[2]);
}

function groupDigits(n, sep) {
  // Thousands separators only from five digits up ("5000 BC", but "10,000 BC").
  return n >= 10000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep) : String(n);
}
export function labelEn(y) {
  return y < 0 ? `${groupDigits(-y, ',')} BC` : y < 1000 ? `AD ${y}` : String(y);
}
export function labelEs(y) {
  return y < 0 ? `${groupDigits(-y, ' ')} a. C.` : y < 1000 ? `${y} d. C.` : String(y);
}

/** Returns {snaps: [{year, base, src}] sorted by year, commit}; with --repo, extracts geojson/ from HEAD into <work>/src. */
export function collectSources(opts) {
  let files;
  let commit = null;
  if (opts.repo) {
    const git = (...args) => execFileSync('git', ['-C', opts.repo, ...args], { maxBuffer: 1 << 30 });
    commit = {
      hash: git('rev-parse', 'HEAD').toString().trim(),
      date: git('log', '-1', '--format=%cI').toString().trim(),
    };
    const dir = path.join(opts.work, 'src');
    fs.mkdirSync(dir, { recursive: true });
    const names = git('ls-tree', '--name-only', 'HEAD', 'geojson/').toString().split('\n')
      .map((p) => path.posix.basename(p)).filter((f) => SNAPSHOT_RE.test(f));
    for (const f of names) fs.writeFileSync(path.join(dir, f), git('show', `HEAD:geojson/${f}`));
    files = names.map((f) => path.join(dir, f));
  } else {
    files = fs.readdirSync(opts.src).filter((f) => SNAPSHOT_RE.test(f)).map((f) => path.join(opts.src, f));
  }
  // --extra: snapshots from elsewhere (the present-day map made by today-snapshot.mjs).
  const extra = new Set((opts.extra || []).map((f) => path.resolve(f)));
  files = [...files, ...extra];
  const snaps = files.map((file) => {
    const m = SNAPSHOT_RE.exec(path.basename(file));
    if (!m) throw new Error(`Not a world_<year>.geojson file: ${file}`);
    return { year: yearOf(m), base: path.basename(file, '.geojson'), src: file, extra: extra.has(path.resolve(file)) };
  }).sort((a, b) => a.year - b.year);
  const seen = new Set();
  for (const s of snaps) {
    if (seen.has(s.year)) throw new Error(`Two files for year ${s.year}`);
    seen.add(s.year);
  }
  return { snaps, commit };
}

// ---------------------------------------------------------------------------
// Attribute normalisation
// ---------------------------------------------------------------------------
// Encoding damage and accent typos in the source (only obvious ones are fixed; spelling is left alone).
const TEXT_FIXES = new Map([
  ['M?ori', 'Māori'],
  ['Arag\uFFFDn', 'Aragón'],
  ['Monte Alb?n', 'Monte Albán'],
  ['Monte Alb\uFFFDn', 'Monte Albán'],
  ['Monte Albàn', 'Monte Albán'],
  ['Teotihuac\uFFFDn', 'Teotihuacán'],
  ['Teotihuacàn', 'Teotihuacán'],
]);
// Polygons that are water bodies tagged like polities (world_700); dropped so they read as water.
const WATER_NAMES = new Set(['Lake Vygozero', 'Lake Segozerskoye']);
// Obvious labelling errors in the source, matched by snapshot, current name and a point inside.
const NAME_FIXES = [
  // The whole of Switzerland has NAME "" (the feature called "Switzerland" is a zero-area sliver).
  { files: ['world_1994', 'world_2000', 'world_2010'], from: null, at: [8.2, 46.8], to: 'Switzerland' },
  // New Zealand carries the name of the Central Asian Kelteminar culture (which is also drawn in
  // Central Asia as "Kelteminar culture"); it is unnamed in the neighbouring snapshots.
  { files: ['world_bc5000'], from: 'Kelteminar', at: [172.5, -41.5], to: null },
];
// Polygon parts filed under the wrong entity: the part containing `at` moves to entity `to`.
const PART_FIXES = [
  // Corsica is a part of "Kingdom of Italy" in 1914 only; it is French in 1900 and 1920.
  { files: ['world_1914'], from: 'Kingdom of Italy', at: [9.1, 42.2], to: { n: 'France', s: null, p: null } },
];

/** Planar even-odd point-in-polygon on lon/lat rings (only used away from the antimeridian). */
function containsPlanar(geometry, [x, y]) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some((rings) => {
    let inside = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  });
}

export function cleanText(v) {
  if (v == null) return null;
  const s = String(v).normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (/^(?:[\d.]+|true|false|null)$/i.test(s)) return null; // junk values such as "1", "3", "true"
  return TEXT_FIXES.get(s) ?? s;
}

/** Case/spacing variants ("Chinese Warlords" / "Chinese warlords") map to the most frequent spelling. */
export function buildCanon(snaps) {
  const counts = new Map(); // lower-case key -> Map(spelling -> weight)
  const add = (v, w) => {
    const s = cleanText(v);
    if (!s) return;
    const key = s.toLowerCase();
    let m = counts.get(key);
    if (!m) counts.set(key, (m = new Map()));
    m.set(s, (m.get(s) || 0) + w);
  };
  for (const snap of snaps) {
    const gj = JSON.parse(fs.readFileSync(snap.src, 'utf8'));
    for (const f of gj.features) {
      const p = f.properties || {};
      add(p.NAME, 1000); // NAME spellings win over SUBJECTO/PARTOF spellings
      add(p.SUBJECTO, 1);
      add(p.PARTOF, 1);
    }
  }
  const canon = new Map();
  const variants = [];
  for (const [key, m] of counts) {
    const sorted = [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    canon.set(key, sorted[0][0]);
    if (sorted.length > 1) variants.push(sorted.map((e) => e[0]));
  }
  return { canon: (v) => { const s = cleanText(v); return s ? canon.get(s.toLowerCase()) : null; }, variants };
}

export function normaliseSnapshot(snap, canon, stats) {
  const gj = JSON.parse(fs.readFileSync(snap.src, 'utf8'));
  const precCounts = new Map();
  const feats = [];
  for (const f of gj.features) {
    stats.sourceFeatures++;
    const g = f.geometry;
    if (!g || !g.coordinates || !g.coordinates.length) { stats.droppedNoGeometry++; continue; }
    const P = f.properties || {};
    let n = canon(P.NAME);
    let s = canon(P.SUBJECTO);
    let p = canon(P.PARTOF);
    if (n && WATER_NAMES.has(n)) { stats.droppedWater.push(n); continue; }
    if (!n && s) { stats.nameFromSubjecto.push(s); n = s; s = null; }
    const fix = NAME_FIXES.find((x) => x.files.includes(snap.base) && x.from === n && containsPlanar(g, x.at));
    if (fix) {
      stats.namesFixed.push(`${fix.from ?? '(unnamed)'} -> ${fix.to ?? '(unnamed)'}`);
      n = fix.to;
      if (!n) s = p = null;
    }
    const prRaw = Number(P.BORDERPRECISION);
    const pr = prRaw === 1 || prRaw === 2 || prRaw === 3 ? prRaw : null;
    if (pr == null) stats.missingPrecision++;
    else precCounts.set(pr, (precCounts.get(pr) || 0) + 1);
    let geometry = g;
    const partFix = PART_FIXES.find((x) => x.files.includes(snap.base) && x.from === n && g.type === 'MultiPolygon');
    if (partFix) {
      const hit = g.coordinates.filter((poly) => containsPlanar({ type: 'Polygon', coordinates: poly }, partFix.at));
      if (hit.length && hit.length < g.coordinates.length) {
        stats.namesFixed.push(`part of ${n} -> ${partFix.to.n}`);
        feats.push({ type: 'Feature', properties: { ...partFix.to, pr }, geometry: { type: 'MultiPolygon', coordinates: hit } });
        geometry = { type: 'MultiPolygon', coordinates: g.coordinates.filter((poly) => !hit.includes(poly)) };
      }
    }
    // Present-day snapshot only: current display names, rename and new-state markers.
    const extraProps = snap.extra ? {
      d: n ? cleanText(P.DISPLAY_EN) : null, ds: n ? cleanText(P.DISPLAY_ES) : null,
      rn: n ? cleanText(P.RENAMED_FROM) : null, rns: n ? cleanText(P.RENAMED_FROM_ES) : null,
      ns: n && Number(P.NEW_SINCE) ? Number(P.NEW_SINCE) : null,
    } : {};
    feats.push({
      type: 'Feature',
      properties: n
        ? { n, s: s && s !== n ? s : null, p: p && p !== n ? p : null, pr, ...extraProps }
        : { n: null, s: null, p: null, pr, ...extraProps },
      geometry,
    });
  }
  // Missing / out-of-range BORDERPRECISION (null, 0) takes the snapshot's most common value.
  const modal = [...precCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1;
  for (const f of feats) if (f.properties.pr == null) f.properties.pr = modal;
  stats.modalPrecision = modal;
  return feats;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const polygonsOf = (g) => (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []);
const setPolygons = (g, polys) => {
  if (polys.length === 1) { g.type = 'Polygon'; g.arcs = polys[0]; } else { g.type = 'MultiPolygon'; g.arcs = polys; }
};

/**
 * Sliver elimination on an unquantized topology: polygon parts smaller than maxKm2 that are not
 * the largest part of their entity and that touch other entities are handed to the neighbour
 * that shares the longest border with them (the classic GIS "eliminate"). These parts are mostly
 * remnants of resolved overlaps (world_1492 has hundreds). Islands are never touched.
 */
export function eliminateSlivers(topo, maxKm2) {
  const geoms = topo.objects.world.geometries;
  const parts = [];
  geoms.forEach((g, gi) => {
    for (const poly of polygonsOf(g)) {
      const f = topoFeature(topo, { type: 'Polygon', arcs: poly });
      parts.push({ g: gi, poly, km2: geoArea(f) * KM2_PER_SR });
    }
  });
  const arcUse = new Map();
  parts.forEach((part, pi) => {
    for (const ring of part.poly) for (const a0 of ring) {
      const a = a0 < 0 ? ~a0 : a0;
      let u = arcUse.get(a);
      if (!u) arcUse.set(a, (u = []));
      u.push(pi);
    }
  });
  const arcKm = new Map();
  const lengthOf = (a) => {
    let v = arcKm.get(a);
    if (v == null) arcKm.set(a, (v = geoLength({ type: 'LineString', coordinates: topo.arcs[a] }) * EARTH_RADIUS_KM));
    return v;
  };
  const largest = new Map();
  parts.forEach((part, pi) => {
    const cur = largest.get(part.g);
    if (cur == null || parts[cur].km2 < part.km2) largest.set(part.g, pi);
  });
  const owner = parts.map((part) => part.g);
  const candidates = parts.map((_, pi) => pi)
    .filter((pi) => parts[pi].km2 < maxKm2 && largest.get(parts[pi].g) !== pi)
    .sort((a, b) => parts[a].km2 - parts[b].km2);
  let moved = 0;
  let movedKm2 = 0;
  for (const pi of candidates) {
    const shared = new Map();
    for (const ring of parts[pi].poly) for (const a0 of ring) {
      const a = a0 < 0 ? ~a0 : a0;
      for (const pj of arcUse.get(a)) {
        if (pj === pi || owner[pj] === owner[pi]) continue;
        shared.set(owner[pj], (shared.get(owner[pj]) || 0) + lengthOf(a));
      }
    }
    if (!shared.size) continue;
    let best = -1;
    let bestKm = -1;
    for (const [g, km] of shared) if (km > bestKm) { best = g; bestKm = km; }
    owner[pi] = best;
    moved++;
    movedKm2 += parts[pi].km2;
  }
  if (moved) {
    const polys = geoms.map(() => []);
    parts.forEach((part, pi) => polys[owner[pi]].push(part.poly));
    geoms.forEach((g, gi) => setPolygons(g, polys[gi]));
  }
  return { moved, movedKm2 };
}

const SR_EPS = 1e-12; // ~40 m²: anything smaller is a degenerate ring

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

/** Removes repeated points and out-and-back spikes (…A, B, A…) from a closed ring. */
function removeSpikes(ring, counters) {
  let pts = ring.slice(0, -1);
  for (;;) {
    const st = [];
    for (const p of pts) {
      if (st.length && samePoint(st[st.length - 1], p)) continue;
      if (st.length >= 2 && samePoint(st[st.length - 2], p)) { st.pop(); continue; }
      st.push(p);
    }
    for (;;) { // the same across the ring's start/end
      if (st.length >= 2 && samePoint(st[0], st[st.length - 1])) st.pop();
      else if (st.length >= 3 && samePoint(st[st.length - 2], st[0])) st.pop();
      else if (st.length >= 3 && samePoint(st[st.length - 1], st[1])) st.shift();
      else break;
    }
    if (st.length === pts.length) break;
    counters.spikes += pts.length - st.length;
    pts = st;
  }
  return pts.length >= 3 ? [...pts, pts[0]] : null;
}

/**
 * d3-geo needs clockwise exterior rings and counter-clockwise holes. Every polygon here is far
 * smaller than a hemisphere, so a ring is wound correctly iff its standalone spherical area is
 * < 2π (exterior) or > 2π (hole). Wrongly wound rings are reversed; spikes are removed and
 * degenerate rings (fewer than 3 distinct points, ~zero area) dropped.
 */
export function repairPolygons(geometry, counters) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const out = [];
  for (const rings of polys) {
    const fixed = [];
    for (let k = 0; k < rings.length; k++) {
      const exterior = k === 0;
      let ring = removeSpikes(rings[k], counters);
      if (!ring) { counters.degenerate++; if (exterior) break; continue; }
      let a = geoArea({ type: 'Polygon', coordinates: [ring] });
      if (exterior ? a > 2 * Math.PI : a < 2 * Math.PI) {
        ring = ring.slice().reverse();
        a = 4 * Math.PI - a;
        counters.rewound++;
      }
      const own = exterior ? a : 4 * Math.PI - a;
      if (own < SR_EPS) { counters.degenerate++; if (exterior) break; continue; }
      fixed.push(ring);
    }
    if (fixed.length) out.push(fixed);
  }
  if (!out.length) return null;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

/**
 * geoStitch appends stitched rings to whichever polygon its first fragment came from, after the
 * rings it left alone, so an exterior can end up behind its own holes (Russia's outline behind
 * Lake Onega). Polygons with exactly one exterior (area < 2π) are just reordered; holes of
 * reshuffled polygons go to the smallest exterior that contains most of their vertices.
 */
function regroupRings(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const out = []; // [{ ring, area, holes }]
  const pending = [];
  for (const rings of polys) {
    const ext = [];
    const holes = [];
    for (const ring of rings) {
      const a = geoArea({ type: 'Polygon', coordinates: [ring] });
      if (a < 2 * Math.PI) ext.push({ ring, area: a, holes: [] });
      else holes.push(ring);
    }
    if (ext.length === 1) ext[0].holes = holes;
    else pending.push(...holes);
    out.push(...ext);
  }
  const bySize = [...out].sort((x, y) => x.area - y.area);
  for (const hole of pending) {
    const step = Math.max(1, Math.floor((hole.length - 1) / 7));
    const probes = [];
    for (let i = 0; i < hole.length - 1; i += step) probes.push(hole[i]);
    let best = null;
    let bestHits = 0;
    for (const ex of bySize) {
      const poly = { type: 'Polygon', coordinates: [ex.ring] };
      const hits = probes.filter((pt) => geoContains(poly, pt)).length;
      if (hits > bestHits) { best = ex; bestHits = hits; }
      if (hits === probes.length) break; // smallest exterior that fully contains it
    }
    if (!best) return null; // cannot place the hole: caller keeps the unstitched geometry
    best.holes.push(hole);
  }
  const coords = out.map((ex) => [ex.ring, ...ex.holes]);
  return coords.length === 1 ? { type: 'Polygon', coordinates: coords[0] } : { type: 'MultiPolygon', coordinates: coords };
}

export function touchesSeam(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polys) for (const ring of rings) for (const [x, y] of ring) {
    if (x <= -179.9999 || x >= 179.9999 || y <= -89.9999 || y >= 89.9999) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Per-snapshot processing
// ---------------------------------------------------------------------------
async function ms(cmd, input) {
  const res = await mapshaper.applyCommands(`${cmd} -quiet`, input);
  return res['out.json'].toString();
}

/**
 * Near-duplicate named polygons (each covering >= 90% of the other) are digitising leftovers, e.g.
 * world_1938 has "Israel" under "Mandatory Palestine (GB)" and "Oman (British Raj)" under
 * "Muscat and Oman". The source's author saw the later one painted on top, so the earlier one is
 * dropped. (Ordinary overlaps are resolved by size in pass 1.)
 */
export async function dropDuplicates(feats, stats) {
  const fc = JSON.stringify({ type: 'FeatureCollection', features: feats.map((f, i) => ({ ...f, properties: { fid: i } })) });
  const areas = JSON.parse(await ms('-i in.json -each "farea=this.area" -o out.json format=json', { 'in.json': fc }));
  const cells = JSON.parse(await ms(
    '-i in.json -each "fid=this.id" -mosaic calc="ids=collect(fid)" -filter "!!ids && ids.length>1" -each "carea=this.area"'
    + ' -o out.json format=json', { 'in.json': fc },
  ));
  const overlap = new Map();
  for (const { ids, carea } of cells) {
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const i = Math.min(ids[a], ids[b]);
      const j = Math.max(ids[a], ids[b]);
      overlap.set(i * 1e6 + j, (overlap.get(i * 1e6 + j) || 0) + carea);
    }
  }
  const drop = new Set();
  for (const [key, ov] of [...overlap].sort((x, y) => x[0] - y[0])) {
    const i = Math.floor(key / 1e6);
    const j = key % 1e6;
    if (!feats[i].properties.n || !feats[j].properties.n) continue;
    if (ov >= 0.9 * Math.max(areas[i].farea, areas[j].farea)) {
      drop.add(i);
      stats.duplicatesDropped.push(`${feats[i].properties.n} -> ${feats[j].properties.n}`);
    }
  }
  return feats.filter((_, i) => !drop.has(i));
}

export async function processSnapshot(snap, canon, opts) {
  const stats = {
    year: snap.year, file: `${snap.base}.json`, sourceFeatures: 0, droppedNoGeometry: 0, droppedWater: [],
    nameFromSubjecto: [], namesFixed: [], missingPrecision: 0, duplicatesDropped: [],
  };
  const feats = await dropDuplicates(normaliseSnapshot(snap, canon, stats), stats);
  const fields = snap.extra ? 'n,s,p,pr,d,ds,rn,rns,ns' : 'n,s,p,pr';
  const sourceNames = new Set(feats.map((f) => f.properties.n).filter(Boolean));

  // Pass 1: resolve overlaps and dissolve. Overlaps go to the named feature, then to the smaller
  // one (small entities drawn on top of a large one keep their territory). Gaps are filled.
  const pass1 = await ms(
    '-i in.json name=world -each "pri=(n==null?1e18:0)+this.area" -sort pri ascending'
    + ` -clean overlap-rule=min-id -dissolve ${fields} -o out.json format=topojson no-quantization`,
    { 'in.json': JSON.stringify({ type: 'FeatureCollection', features: feats }) },
  );
  let topo = JSON.parse(pass1);
  stats.sliversMoved = 0;
  stats.sliversKm2 = 0;
  if (opts.sliverKm2 > 0) {
    // Two rounds catch parts that were left behind when their best neighbour moved itself.
    for (let round = 0; round < 2; round++) {
      const r = eliminateSlivers(topo, opts.sliverKm2);
      stats.sliversMoved += r.moved;
      stats.sliversKm2 += r.movedKm2;
      if (!r.moved) break;
      topo = JSON.parse(await ms(`-i in.json -dissolve ${fields} -o out.json format=topojson no-quantization`,
        { 'in.json': JSON.stringify(topo) }));
    }
  }
  const cleaned = JSON.stringify(topo);

  // Pass 2: simplify (weighted Visvalingam on the sphere, small shapes protected) and quantize.
  // Start at intervalKm and coarsen until the file fits targetKb.
  let interval = opts.intervalKm;
  let txt;
  for (;;) {
    // No fix-geometry: it leaves non-integer "quantized" coordinates that a later rounding
    // turns into flipped (inverted) spike rings. Rings are repaired below on the integer grid.
    txt = await ms(
      `-i in.json -simplify weighted keep-shapes interval=${Math.round(interval * 1000)}`
      + ` -o out.json format=topojson quantization=${opts.quantization}`,
      { 'in.json': cleaned },
    );
    if (txt.length <= opts.targetKb * 1024 || interval >= opts.maxIntervalKm) break;
    interval = Math.min(opts.maxIntervalKm, interval * 1.25);
  }
  stats.intervalKm = Math.round(interval * 10) / 10;
  const simplified = JSON.parse(txt);
  const { transform } = simplified;

  // Ring repair, antimeridian/pole stitching, then rebuild the topology on the same grid.
  const counters = { rewound: 0, spikes: 0, degenerate: 0, stitched: 0, stitchReverted: 0, droppedEmpty: 0 };
  let features = [];
  for (const f of topoFeature(simplified, simplified.objects.world).features) {
    const geometry = f.geometry && repairPolygons(f.geometry, counters);
    if (!geometry) { counters.droppedEmpty++; continue; }
    let out = { type: 'Feature', properties: f.properties, geometry };
    if (touchesSeam(geometry)) {
      // Removes the cut lines along ±180° and the pole edge (as world-atlas does), so feature
      // outlines and coastline meshes show no seam on a globe. Kept only if the area is unchanged.
      const stitched = geoStitch(out).geometry;
      const regrouped = stitched && stitched.coordinates.length ? regroupRings(stitched) : null;
      const a0 = geoArea(out);
      const a1 = regrouped ? geoArea(regrouped) : -1;
      if (a1 >= 0 && Math.abs(a1 - a0) <= 1e-10 + 1e-6 * a0) {
        out = { type: 'Feature', properties: f.properties, geometry: regrouped };
        counters.stitched++;
      } else counters.stitchReverted++;
    }
    features.push(out);
  }
  // Re-quantizing is the identity for grid points; stitched seam points snap back to the grid.
  // Verify the decoded result and repair again until nothing changes.
  let rebuilt;
  for (let round = 0; ; round++) {
    rebuilt = topoQuantize(topoTopology({ world: { type: 'FeatureCollection', features } }), transform);
    const c = { rewound: 0, spikes: 0, degenerate: 0 };
    const next = [];
    for (const f of topoFeature(rebuilt, rebuilt.objects.world).features) {
      const geometry = repairPolygons(f.geometry, c);
      if (geometry) next.push({ type: 'Feature', properties: f.properties, geometry });
      else counters.droppedEmpty++;
    }
    if (!c.rewound && !c.spikes && !c.degenerate && next.length === features.length) break;
    if (round >= 4) throw new Error(`${snap.base}: ring repair does not converge`);
    counters.rewound += c.rewound;
    counters.spikes += c.spikes;
    counters.degenerate += c.degenerate;
    features = next;
  }
  Object.assign(stats, counters);
  // Named entities that did not survive: zero-area source slivers, or polygons entirely covered by
  // smaller overlapping ones (resolved overlaps) - listed in the build report.
  const kept = new Set(rebuilt.objects.world.geometries.map((g) => g.properties?.n).filter(Boolean));
  stats.vanished = [...sourceNames].filter((n) => !kept.has(n));
  return { snap, topology: rebuilt, stats };
}

// ---------------------------------------------------------------------------
// Analysis on the final topologies: areas, adjacency, proximity
// ---------------------------------------------------------------------------
export function analyse(result, nearKm) {
  const topo = result.topology;
  const geoms = topo.objects.world.geometries;
  const fc = topoFeature(topo, topo.objects.world);
  const areaByName = new Map();
  let inverted = 0;
  fc.features.forEach((f) => {
    const sr = geoArea(f);
    if (sr > 2 * Math.PI) inverted++;
    const n = f.properties.n;
    if (n) areaByName.set(n, (areaByName.get(n) || 0) + sr * KM2_PER_SR);
  });

  // Touching entities: shared arcs, weighted by shared border length.
  const arcOwners = new Map();
  geoms.forEach((g, gi) => {
    for (const poly of polygonsOf(g)) for (const ring of poly) for (const a0 of ring) {
      const a = a0 < 0 ? ~a0 : a0;
      let u = arcOwners.get(a);
      if (!u) arcOwners.set(a, (u = []));
      if (!u.includes(gi)) u.push(gi);
    }
  });
  const decodedArcs = topoFeature(topo, { type: 'MultiLineString', arcs: topo.arcs.map((_, i) => [i]) }).geometry.coordinates;
  const touching = new Map(); // "a\u0000b" -> km of shared border
  let sharedArcs = 0;
  for (const [a, owners] of arcOwners) {
    if (owners.length < 2) continue;
    sharedArcs++;
    const km = geoLength({ type: 'LineString', coordinates: decodedArcs[a] }) * EARTH_RADIUS_KM;
    for (let i = 0; i < owners.length; i++) for (let j = i + 1; j < owners.length; j++) {
      const na = geoms[owners[i]].properties?.n;
      const nb = geoms[owners[j]].properties?.n;
      if (!na || !nb || na === nb) continue;
      const key = na < nb ? `${na}\u0000${nb}` : `${nb}\u0000${na}`;
      touching.set(key, (touching.get(key) || 0) + km);
    }
  }
  // Sanity check against topojson-client's own neighbour computation.
  const nbCount = topoNeighbors(geoms).reduce((s, l) => s + l.length, 0) / 2;

  // Near but not touching (across straits, narrow gaps): vertex grid search.
  const near = new Set();
  if (nearKm > 0) {
    const cellDeg = Math.max(0.5, nearKm / 111);
    const grid = new Map();
    const maxRad = nearKm / EARTH_RADIUS_KM;
    fc.features.forEach((f, fi) => {
      if (!f.properties.n) return;
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of polys) for (const [x, y] of rings[0]) {
        const key = `${Math.floor((x + 180) / cellDeg)},${Math.floor((y + 90) / cellDeg)}`;
        let cell = grid.get(key);
        if (!cell) grid.set(key, (cell = []));
        cell.push([x, y, fi]);
      }
    });
    const nCols = Math.ceil(360 / cellDeg);
    const nearFeatures = new Set(); // f1 * 65536 + f2
    const rad = Math.PI / 180;
    for (const [key, cell] of grid) {
      const [cx, cy] = key.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const other = grid.get(`${(((cx + dx) % nCols) + nCols) % nCols},${cy + dy}`);
        if (!other) continue;
        for (const [x1, y1, f1] of cell) for (const [x2, y2, f2] of other) {
          if (f1 >= f2) continue;
          const pk = f1 * 65536 + f2;
          if (nearFeatures.has(pk)) continue;
          const h = Math.sin(((y2 - y1) * rad) / 2) ** 2
            + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin(((x2 - x1) * rad) / 2) ** 2;
          if (2 * Math.asin(Math.min(1, Math.sqrt(h))) <= maxRad) nearFeatures.add(pk);
        }
      }
    }
    for (const pk of nearFeatures) {
      const n1 = fc.features[Math.floor(pk / 65536)].properties.n;
      const n2 = fc.features[pk % 65536].properties.n;
      if (n1 === n2) continue;
      const key = n1 < n2 ? `${n1}\u0000${n2}` : `${n2}\u0000${n1}`;
      if (!touching.has(key)) near.add(key);
    }
  }
  return { areaByName, touching, near, inverted, features: geoms.length, arcs: topo.arcs.length, sharedArcs, nbCount };
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
/**
 * Stable colour index per entity name. Greedy colouring of the adjacency graph accumulated over
 * all snapshots (entities with the most area x snapshots first), then local search to remove the
 * remaining conflicts. Edge weight: per snapshot 1 + ln(1 + shared border km / 100) for touching
 * entities, 0.25 for entities that are only near each other.
 */
export function assignColours(importance, edges, K, fixed = new Map()) {
  const names = [...importance.keys()].sort((a, b) => importance.get(b) - importance.get(a) || (a < b ? -1 : 1));
  const colour = new Map();
  const usage = new Array(K).fill(0);
  // Entities with a colour from an earlier build keep it (--keep-colours), so adding a snapshot does
  // not repaint the existing maps; only new entities are coloured, around their fixed neighbours.
  for (const name of names) if (fixed.has(name)) { colour.set(name, fixed.get(name)); usage[fixed.get(name)]++; }
  const cost = (name, c) => {
    let s = 0;
    const e = edges.get(name);
    if (e) for (const [nb, w] of e) if (colour.get(nb) === c) s += w;
    return s;
  };
  for (const name of names) {
    if (fixed.has(name)) continue;
    let best = 0;
    let bestCost = Infinity;
    for (let c = 0; c < K; c++) {
      const v = cost(name, c);
      if (v < bestCost - 1e-9 || (Math.abs(v - bestCost) <= 1e-9 && usage[c] < usage[best])) { best = c; bestCost = v; }
    }
    colour.set(name, best);
    usage[best]++;
  }
  for (let pass = 0; pass < 50; pass++) {
    let changed = 0;
    for (const name of names) {
      if (fixed.has(name)) continue;
      const cur = colour.get(name);
      let best = cur;
      let bestCost = cost(name, cur);
      if (bestCost === 0) continue;
      for (let c = 0; c < K; c++) {
        const v = cost(name, c);
        if (v < bestCost - 1e-9) { best = c; bestCost = v; }
      }
      if (best !== cur) { colour.set(name, best); usage[cur]--; usage[best]++; changed++; }
    }
    if (!changed) break;
  }
  return { colour, usage };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(opts.work, { recursive: true });
  fs.mkdirSync(opts.out, { recursive: true });
  const { snaps: allSnaps, commit } = collectSources(opts);
  if (!allSnaps.length) throw new Error('No world_*.geojson files found');
  const snaps = opts.only ? allSnaps.filter((s) => opts.only.includes(s.base.replace(/^world_/, ''))) : allSnaps;
  console.log(`${allSnaps.length} snapshots found, processing ${snaps.length}`);

  const { canon, variants } = buildCanon(allSnaps);
  const results = [];
  for (const snap of snaps) {
    const t0 = Date.now();
    const r = await processSnapshot(snap, canon, opts);
    r.analysis = analyse(r, opts.nearKm);
    r.stats.features = r.analysis.features;
    r.stats.inverted = r.analysis.inverted;
    results.push(r);
    console.log(`${snap.base.padEnd(22)} src ${String(r.stats.sourceFeatures).padStart(5)} -> ${String(r.stats.features).padStart(4)} features,`
      + ` interval ${r.stats.intervalKm} km, slivers ${r.stats.sliversMoved}, stitched ${r.stats.stitched}, rewound ${r.stats.rewound}, spikes ${r.stats.spikes}, degenerate ${r.stats.degenerate},`
      + ` inverted ${r.stats.inverted} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (r.analysis.inverted) throw new Error(`${snap.base}: ${r.analysis.inverted} inverted features after processing`);
  }

  // Entity statistics and adjacency graph over all processed snapshots.
  const entities = new Map(); // name -> {first, last, n, importance}
  const edges = new Map();
  const addEdge = (a, b, w) => {
    for (const [x, y] of [[a, b], [b, a]]) {
      let m = edges.get(x);
      if (!m) edges.set(x, (m = new Map()));
      m.set(y, (m.get(y) || 0) + w);
    }
  };
  for (const r of results) {
    for (const [name, km2] of r.analysis.areaByName) {
      const e = entities.get(name) || { first: r.snap.year, last: r.snap.year, n: 0, importance: 0 };
      e.first = Math.min(e.first, r.snap.year);
      e.last = Math.max(e.last, r.snap.year);
      e.n++;
      e.importance += km2;
      entities.set(name, e);
    }
    for (const [key, km] of r.analysis.touching) { const [a, b] = key.split('\u0000'); addEdge(a, b, 1 + Math.log1p(km / 100)); }
    for (const key of r.analysis.near) { const [a, b] = key.split('\u0000'); addEdge(a, b, 0.25); }
  }
  const fixed = new Map();
  if (opts.keepColours) {
    for (const [name, e] of Object.entries(JSON.parse(fs.readFileSync(opts.keepColours, 'utf8')))) {
      if (entities.has(name) && Number.isInteger(e.c) && e.c < opts.colours) fixed.set(name, e.c);
    }
    // Two kept colours that now clash on a shared border (a new snapshot made them neighbours): the
    // smaller entity is recoloured.
    for (const r of results) {
      for (const key of r.analysis.touching.keys()) {
        const [a, b] = key.split('\u0000');
        if (fixed.has(a) && fixed.has(b) && fixed.get(a) === fixed.get(b)) {
          fixed.delete(entities.get(a).importance < entities.get(b).importance ? a : b);
        }
      }
    }
    console.log(`kept the colours of ${fixed.size} entities from ${opts.keepColours}`);
  }
  const { colour, usage } = assignColours(new Map([...entities].map(([k, v]) => [k, v.importance])), edges, opts.colours, fixed);

  // Conflict statistics (same colour on touching entities), for the log / report.
  let touchingPairs = 0;
  let touchingConflicts = 0;
  let nearPairs = 0;
  let nearConflicts = 0;
  const conflictList = [];
  for (const r of results) {
    for (const [key, km] of r.analysis.touching) {
      const [a, b] = key.split('\u0000');
      touchingPairs++;
      if (colour.get(a) === colour.get(b)) { touchingConflicts++; conflictList.push([r.snap.year, a, b, Math.round(km)]); }
    }
    for (const key of r.analysis.near) {
      const [a, b] = key.split('\u0000');
      nearPairs++;
      if (colour.get(a) === colour.get(b)) nearConflicts++;
    }
  }

  // Write snapshot TopoJSON files with the colour index.
  const index = [];
  for (const r of results) {
    for (const g of r.topology.objects.world.geometries) {
      const p = g.properties || {};
      const props = {};
      if (p.n) props.n = p.n;
      if (p.s) props.s = p.s;
      if (p.p) props.p = p.p;
      props.pr = p.pr;
      if (p.n) props.c = colour.get(p.n);
      if (p.d) props.d = p.d;
      if (p.ds) props.ds = p.ds;
      if (p.rn) props.rn = p.rn;
      if (p.rns) props.rns = p.rns;
      if (p.ns) props.ns = p.ns;
      g.properties = props;
    }
    const file = `${r.snap.base}.json`;
    const text = JSON.stringify(r.topology);
    fs.writeFileSync(path.join(opts.out, file), text);
    r.stats.bytes = text.length;
    index.push({
      year: r.snap.year, file, label_en: labelEn(r.snap.year), label_es: labelEs(r.snap.year), features: r.analysis.features,
      ...(r.snap.extra ? { source: 'Present-day borders: Natural Earth 1:50m (public domain), matched to the 2010 entities by scripts/data/history/today-snapshot.mjs' } : {}),
    });
  }

  const sourceText = `historical-basemaps by André Ourednik and contributors, ${SOURCE_URL}`
    + (commit ? ` (commit ${commit.hash.slice(0, 7)}, ${commit.date.slice(0, 10)})` : '');
  fs.writeFileSync(path.join(opts.out, 'index.json'), `${JSON.stringify({ source: sourceText, license: 'GPL-3.0', snapshots: index }, null, 1)}\n`);

  const entitiesOut = {};
  for (const name of [...entities.keys()].sort()) {
    const e = entities.get(name);
    entitiesOut[name] = { c: colour.get(name), first: e.first, last: e.last, n: e.n };
  }
  fs.writeFileSync(path.join(opts.out, 'entities.json'), `${JSON.stringify(entitiesOut)}\n`);

  // Changes between consecutive snapshots. Entities count from minChangeKm2 (20,000 km²); an area
  // under a tenth of that is "negligible", so a name that goes from a sliver to a large territory
  // (e.g. "India" 1938 -> 1945) is listed as appeared rather than as a +244,000% growth.
  const changes = [];
  const negligible = opts.minChangeKm2 / 10;
  for (let i = 0; i + 1 < results.length; i++) {
    const A = results[i].analysis.areaByName;
    const B = results[i + 1].analysis.areaByName;
    const names = new Set([...A.keys(), ...B.keys()]);
    const rows = [...names].map((n) => ({ n, a: A.get(n) || 0, b: B.get(n) || 0 }));
    const top = (list) => list.slice(0, opts.maxPerList);
    const appeared = top(rows.filter((r) => r.b >= opts.minChangeKm2 && r.a < negligible).sort((x, y) => y.b - x.b).map((r) => r.n));
    const disappeared = top(rows.filter((r) => r.a >= opts.minChangeKm2 && r.b < negligible).sort((x, y) => y.a - x.a).map((r) => r.n));
    const both = rows
      .filter((r) => Math.max(r.a, r.b) >= opts.minChangeKm2 && Math.min(r.a, r.b) >= negligible)
      .map((r) => ({ ...r, pct: Math.max(-99, Math.round(((r.b - r.a) / r.a) * 100)), size: Math.max(r.a, r.b) }))
      .sort((x, y) => y.size - x.size);
    const grew = top(both.filter((e) => e.pct >= opts.minChangePct).map((e) => [e.n, e.pct]));
    const shrank = top(both.filter((e) => e.pct <= -opts.minChangePct).map((e) => [e.n, e.pct]));
    const step = { from: results[i].snap.year, to: results[i + 1].snap.year, appeared, disappeared, grew, shrank };
    if (results[i + 1].snap.extra) {
      // The present-day map comes from another source with other outlines, so area changes would
      // mostly be differences between the two datasets. Only real events are listed: states that
      // came into being since the previous snapshot, the areas they took, and official renames.
      const props = results[i + 1].topology.objects.world.geometries.map((g) => g.properties || {});
      const born = [...new Set(props.filter((p) => p.n && p.ns > results[i].snap.year).map((p) => p.n))];
      step.appeared = born;
      step.disappeared = [];
      const fromParents = new Set();
      for (const n of born) {
        // The entity that held most of the new state's land in the previous snapshot.
        const parents = results[i].analysis.areaByName;
        let best = null;
        for (const r of rows) if (r.a >= opts.minChangeKm2 && r.b < r.a && r.n !== n && parents.has(r.n)) {
          const shrinkKm2 = r.a - r.b;
          const bornKm2 = B.get(n) || 0;
          if (Math.abs(shrinkKm2 - bornKm2) < 0.35 * bornKm2 && (!best || Math.abs(shrinkKm2 - bornKm2) < Math.abs((best.a - best.b) - bornKm2))) best = r;
        }
        if (best) fromParents.add(best.n);
      }
      step.grew = [];
      step.shrank = both.filter((e) => fromParents.has(e.n)).map((e) => [e.n, e.pct]);
      // [old, new] in English, then in Spanish.
      step.renamed = [...new Map(props.filter((p) => p.rn).map((p) => [p.rn, [p.rn, p.d || p.n, p.rns || p.rn, p.ds || p.d || p.n]])).values()];
    }
    changes.push(step);
  }
  fs.writeFileSync(path.join(opts.out, 'changes.json'), `${JSON.stringify(changes)}\n`);

  const report = {
    commit,
    options: opts,
    nameVariantsMerged: variants,
    colourUsage: usage,
    touchingPairs,
    touchingConflicts,
    nearPairs,
    nearConflicts,
    conflicts: conflictList.sort((a, b) => b[3] - a[3]).slice(0, 200),
    snapshots: results.map((r) => ({ ...r.stats, arcs: r.analysis.arcs, sharedArcs: r.analysis.sharedArcs, neighbourPairs: r.analysis.nbCount })),
  };
  fs.writeFileSync(path.join(opts.work, 'build-report.json'), `${JSON.stringify(report, null, 1)}\n`);
  const total = results.reduce((s, r) => s + r.stats.bytes, 0);
  console.log(`entities ${entities.size}, colour usage ${usage.join(',')}`);
  console.log(`touching pairs ${touchingPairs}, same colour ${touchingConflicts}; near pairs ${nearPairs}, same colour ${nearConflicts}`);
  console.log(`snapshot files ${(total / 1024).toFixed(0)} KB total; report: ${path.join(opts.work, 'build-report.json')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
