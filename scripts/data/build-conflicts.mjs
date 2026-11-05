#!/usr/bin/env node
/**
 * Builds the "Wars and conquests" time-travel data from the authoring files in
 * scripts/data/conflicts/<id>.json (the format is described in scripts/data/conflicts/README.md):
 *
 *   public/data/conflicts/index.json         the list shown in the picker
 *   public/data/conflicts/<id>.json          one conflict: sides, steps (text, moves, battles, events)
 *   public/data/conflicts/<id>-areas.json    TopoJSON: the territory of each side at each step
 *
 * Territory is written as expressions over real map pieces (today's countries, provinces, the
 * historical snapshots, land) combined with hand-drawn polygons, so rough drawings get real
 * coastlines and borders.
 *
 *   node scripts/data/build-conflicts.mjs                     build everything
 *   node scripts/data/build-conflicts.mjs --only ww2,rome     build some
 *   node scripts/data/build-conflicts.mjs --only ww2 --preview <dir>   also draw each step as PNG
 *   node scripts/data/build-conflicts.mjs --check             validate only, write nothing
 *   node scripts/data/build-conflicts.mjs --check --lint      also warn about overlaps, untranslated text...
 *   node scripts/data/build-conflicts.mjs --list countries | --list admin1 ESP | --list hist -323
 *   node scripts/data/build-conflicts.mjs --find mongol       search countries, provinces, snapshots
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'polygon-clipping';
import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, sphericalTriangleArea } from 'topojson-simplify';
import { geoArea, geoCircle, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { rewindTopology } from './winding.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'scripts/data/conflicts');
const OUT = path.join(ROOT, 'public/data/conflicts');
const DATA = path.join(ROOT, 'public/data');

export const ERAS = ['ancient', 'medieval', 'early-modern', 'modern', 'contemporary'];

// ---------------------------------------------------------------------------------------------
// Base map pieces, as polygon-clipping MultiPolygons ([polygon][ring][point][x, y]) with boxes.

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

function multi(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function bboxOf(mp) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const poly of mp) for (const [x, y] of poly[0] ?? []) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
  return [w, s, e, n];
}
const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

let countries = null; // id -> { name, mp }
function loadCountries() {
  if (countries) return countries;
  const topo = readJSON(path.join(DATA, 'base/countries-50m.json'));
  const meta = readJSON(path.join(DATA, 'base/countries-meta.json'));
  countries = new Map();
  for (const f of feature(topo, topo.objects.countries).features) {
    countries.set(f.id, { name: meta[f.id]?.n ?? f.id, mp: multi(f.geometry) });
  }
  return countries;
}

let admin1 = null; // A3 -> Map(name -> mp)
function loadAdmin1() {
  if (admin1) return admin1;
  const topo = readJSON(path.join(DATA, 'base/admin1.json'));
  admin1 = new Map();
  for (const f of feature(topo, topo.objects.admin1).features) {
    const a = f.properties.a;
    if (!a || !f.properties.n) continue;
    if (!admin1.has(a)) admin1.set(a, new Map());
    const m = admin1.get(a);
    const prev = m.get(f.properties.n);
    m.set(f.properties.n, prev ? prev.concat(multi(f.geometry)) : multi(f.geometry));
  }
  return admin1;
}

let land = null; // [{ poly, box }]
function loadLand() {
  if (land) return land;
  const topo = readJSON(path.join(DATA, 'base/land-50m.json'));
  land = [];
  for (const f of feature(topo, topo.objects.land).features) for (const poly of multi(f.geometry)) land.push({ poly, box: bboxOf([poly]) });
  return land;
}

const snapshots = new Map(); // year -> Map(name -> mp)
function snapshotYears() {
  return readJSON(path.join(DATA, 'history/index.json')).snapshots.map((s) => s.year);
}
function loadSnapshot(year) {
  if (snapshots.has(year)) return snapshots.get(year);
  const idx = readJSON(path.join(DATA, 'history/index.json')).snapshots;
  const snap = idx.find((s) => s.year === year);
  if (!snap) throw new Error(`no historical map for year ${year}; there are: ${idx.map((s) => s.year).join(', ')}`);
  const topo = readJSON(path.join(DATA, 'history', snap.file));
  const m = new Map();
  for (const f of feature(topo, topo.objects.world).features) {
    const n = f.properties?.n;
    if (!n) continue;
    m.set(n, (m.get(n) ?? []).concat(multi(f.geometry)));
  }
  snapshots.set(year, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Area expressions.

const isPair = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number');
const isRing = (a) => Array.isArray(a) && a.length >= 3 && a.every(isPair);

function ringPoly(ring, where) {
  for (const [x, y] of ring) if (!(x >= -180 && x <= 180 && y >= -90 && y <= 90)) throw new Error(`${where}: point [${x}, ${y}] is outside lon -180..180 / lat -90..90`);
  const xs = ring.map((p) => p[0]);
  if (Math.max(...xs) - Math.min(...xs) > 180) throw new Error(`${where}: a drawn polygon may not span more than 180° of longitude (split it at the antimeridian)`);
  const r = ring.slice();
  const [a, b] = [r[0], r[r.length - 1]];
  if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  return [[r]];
}

function safe(op, where, ...geoms) {
  const gs = geoms.filter((g) => g && g.length);
  try {
    if (op === 'union') return gs.length ? pc.union(...gs) : [];
    if (op === 'intersection') return geoms.some((g) => !g || !g.length) ? [] : pc.intersection(...geoms);
    if (op === 'difference') return !geoms[0] || !geoms[0].length ? [] : (gs.length > 1 ? pc.difference(geoms[0], ...gs.slice(1)) : geoms[0]);
  } catch (e) {
    throw new Error(`${where}: geometry ${op} failed (${e.message}); try simplifying the drawn polygon`);
  }
  return [];
}

function landIn(mp, where) {
  const box = bboxOf(mp);
  // Land polygons don't overlap, so the nearby ones together are already a valid MultiPolygon.
  const near = loadLand().filter((l) => boxesMeet(l.box, box)).map((l) => l.poly);
  if (!near.length) return [];
  return safe('intersection', where, mp, near);
}

/**
 * Resolves an area expression to a MultiPolygon.
 *   "DEU"                                   a country of today (see --list countries)
 *   { "a1": "ESP", "names": [...] }          provinces/states of a country (or "except": [...], or all)
 *   { "hist": "Mongol Empire", "year": 1279 } a polity on a historical map (see --list hist 1279)
 *   { "poly": [[lon, lat], ...] }            a drawn polygon
 *   { "land": [[lon, lat], ...] | area }     the land inside a drawn polygon (or inside an area)
 *   { "circle": [lon, lat], "km": 40 }       a disc (a city, a siege)
 *   { "ref": "name" }                        an area defined in "defs"
 *   { "prev": "side" | true }                that side's territory at the previous step
 *   { "cur": "side" }                        that side's territory at this step (an earlier side)
 *   [ area, area, ... ]                      union
 *   { "union": [...] }, { "and": [...] }, { "minus": [first, ...others] }
 */
function resolve(expr, ctx, where) {
  if (typeof expr === 'string') {
    const c = loadCountries().get(expr);
    if (!c) {
      const near = [...loadCountries()].filter(([id, v]) => id.includes(expr.toUpperCase()) || v.name.toLowerCase().includes(expr.toLowerCase())).slice(0, 8).map(([id, v]) => `${id} (${v.name})`);
      throw new Error(`${where}: unknown country "${expr}"${near.length ? `; did you mean ${near.join(', ')}?` : ' (see --list countries)'}`);
    }
    return c.mp;
  }
  if (Array.isArray(expr)) {
    if (isRing(expr)) return ringPoly(expr, where);
    return safe('union', where, ...expr.map((e, i) => resolve(e, ctx, `${where}[${i}]`)));
  }
  if (!expr || typeof expr !== 'object') throw new Error(`${where}: an area must be a country code, a list or an object, got ${JSON.stringify(expr)}`);
  const key = Object.keys(expr).find((k) => ['a1', 'hist', 'poly', 'land', 'circle', 'ref', 'prev', 'cur', 'union', 'and', 'minus', 'country'].includes(k));
  switch (key) {
    case 'country': return resolve(expr.country, ctx, where);
    case 'a1': {
      const regions = loadAdmin1().get(expr.a1);
      if (!regions) throw new Error(`${where}: no provinces for country "${expr.a1}"`);
      const pick = expr.names ?? [...regions.keys()].filter((n) => !(expr.except ?? []).includes(n));
      for (const n of [...(expr.names ?? []), ...(expr.except ?? [])]) {
        if (!regions.has(n)) throw new Error(`${where}: "${n}" is not a province of ${expr.a1}; there are: ${[...regions.keys()].join(', ')}`);
      }
      return safe('union', where, ...pick.map((n) => regions.get(n)));
    }
    case 'hist': {
      const snap = loadSnapshot(expr.year);
      const mp = snap.get(expr.hist);
      if (!mp) {
        const q = expr.hist.toLowerCase();
        const near = [...snap.keys()].filter((n) => n.toLowerCase().includes(q.slice(0, 5)) || q.includes(n.toLowerCase())).slice(0, 10);
        throw new Error(`${where}: no "${expr.hist}" on the ${expr.year} map${near.length ? `; similar: ${near.join(', ')}` : ` (see --list hist ${expr.year})`}`);
      }
      return mp;
    }
    case 'poly': {
      if (!isRing(expr.poly)) throw new Error(`${where}: "poly" must be a list of at least 3 [lon, lat] points`);
      return ringPoly(expr.poly, where);
    }
    case 'land': {
      const inner = isRing(expr.land) ? ringPoly(expr.land, where) : resolve(expr.land, ctx, `${where}.land`);
      return landIn(inner, where);
    }
    case 'circle': {
      const [lon, lat] = expr.circle;
      const km = expr.km ?? 30;
      const g = geoCircle().center([lon, lat]).radius(km / 111.2).precision(6)();
      return [g.coordinates];
    }
    case 'ref': {
      if (!ctx.defs || !(expr.ref in ctx.defs)) throw new Error(`${where}: no area "${expr.ref}" in "defs"`);
      if (!ctx.refs.has(expr.ref)) {
        if (ctx.resolving.has(expr.ref)) throw new Error(`${where}: "defs.${expr.ref}" refers to itself`);
        ctx.resolving.add(expr.ref);
        ctx.refs.set(expr.ref, resolve(ctx.defs[expr.ref], { ...ctx, prev: null }, `defs.${expr.ref}`));
        ctx.resolving.delete(expr.ref);
      }
      return ctx.refs.get(expr.ref);
    }
    case 'prev': {
      if (!ctx.prev) throw new Error(`${where}: "prev" has no previous step here (not in defs or the first step)`);
      const side = expr.prev === true ? ctx.side : expr.prev;
      if (!(side in ctx.prev)) throw new Error(`${where}: no side "${side}" at the previous step`);
      return ctx.prev[side];
    }
    case 'cur': {
      if (!ctx.cur || !(expr.cur in ctx.cur)) throw new Error(`${where}: "cur" can only name a side listed before this one in "sides"`);
      return ctx.cur[expr.cur];
    }
    case 'union': return resolve(expr.union, ctx, `${where}.union`);
    case 'and': return safe('intersection', where, ...expr.and.map((e, i) => resolve(e, ctx, `${where}.and[${i}]`)));
    case 'minus': return safe('difference', where, ...expr.minus.map((e, i) => resolve(e, ctx, `${where}.minus[${i}]`)));
    default: throw new Error(`${where}: unknown area ${JSON.stringify(expr).slice(0, 120)}`);
  }
}

/** Planar signed area of a ring (x = lon, y = lat): positive when counter-clockwise. */
function signedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a / 2;
}

/** d3 winding: exterior rings clockwise, holes anticlockwise; drops slivers. */
function toD3(mp) {
  const out = [];
  for (const poly of mp) {
    const [ext, ...holes] = poly;
    if (!ext || Math.abs(signedArea(ext)) < 1e-5) continue; // < ~100 m²·deg: a sliver
    const fix = (r, cw) => ((signedArea(r) < 0) === cw ? r : r.slice().reverse());
    out.push([fix(ext, true), ...holes.filter((h) => Math.abs(signedArea(h)) >= 1e-5).map((h) => fix(h, false))]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Dates: "YYYY", "YYYY-MM" or "YYYY-MM-DD"; negative years are BC (-334 = 334 BC, no year 0).

export function parseDate(s, where) {
  const m = /^(-?\d{1,6})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(s ?? ''));
  if (!m) throw new Error(`${where}: date "${s}" must be YYYY, YYYY-MM or YYYY-MM-DD (negative years are BC)`);
  const y = Number(m[1]);
  if (y === 0) throw new Error(`${where}: there is no year 0 (1 BC is -1, AD 1 is 1)`);
  const mo = m[2] ? Number(m[2]) : 0, d = m[3] ? Number(m[3]) : 0;
  if (mo && (mo < 1 || mo > 12)) throw new Error(`${where}: month ${mo} out of range`);
  if (d && (d < 1 || d > 31)) throw new Error(`${where}: day ${d} out of range`);
  const astro = y < 0 ? y + 1 : y;
  return astro + (mo ? (mo - 1) / 12 : 0) + (d ? (d - 1) / 365.25 : 0);
}

// ---------------------------------------------------------------------------------------------
// Validation.

const LANGS = ['en', 'es'];
function text(v, where, required = true) {
  if (v == null) { if (required) throw new Error(`${where}: missing (needs "en" and "es")`); return; }
  if (typeof v !== 'object') throw new Error(`${where}: must be { "en": ..., "es": ... }`);
  for (const l of LANGS) if (typeof v[l] !== 'string' || !v[l].trim()) throw new Error(`${where}.${l}: missing text`);
}
const isColor = (c) => /^#[0-9a-fA-F]{6}$/.test(c);
const inRange = ([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;

function checkLosses(v, sides, where) {
  if (v == null) return;
  if (typeof v !== 'object' || Array.isArray(v)) throw new Error(`${where}: "casualties" is { "<side>": n or [low, high], "note"?: {en, es} }`);
  for (const [k, x] of Object.entries(v)) {
    if (k === 'note') { text(x, `${where}.note`); continue; }
    if (k !== 'total' && !sides.has(k)) throw new Error(`${where}: "${k}" is not a side (or "total")`);
    const ok = (n) => typeof n === 'number' && n >= 0;
    if (!(ok(x) || (Array.isArray(x) && x.length === 2 && x.every(ok) && x[0] <= x[1]))) throw new Error(`${where}.${k}: a number or [low, high]`);
  }
}

function validate(c, file) {
  const where = path.basename(file);
  if (c.id !== path.basename(file, '.json')) throw new Error(`${where}: "id" must be the file name ("${path.basename(file, '.json')}")`);
  text(c.name, `${where} name`); text(c.summary, `${where} summary`); text(c.region, `${where} region`); text(c.outcome, `${where} outcome`);
  text(c.casualtiesNote, `${where} casualtiesNote`, false);
  if (!ERAS.includes(c.era)) throw new Error(`${where}: "era" must be one of ${ERAS.join(', ')}`);
  if (typeof c.icon !== 'string' || !c.icon) throw new Error(`${where}: "icon" (an emoji) is missing`);
  const t0 = parseDate(c.start, `${where} start`), t1 = parseDate(c.end, `${where} end`);
  if (t1 < t0) throw new Error(`${where}: "end" is before "start"`);
  if (!c.camera || !inRange([c.camera.lon, c.camera.lat]) || !(c.camera.zoom >= 1 && c.camera.zoom <= 12)) throw new Error(`${where}: "camera" needs lon, lat and zoom 1..12`);
  if (!Array.isArray(c.sides) || c.sides.length < 2) throw new Error(`${where}: at least two "sides"`);
  const sides = new Set();
  for (const [i, s] of c.sides.entries()) {
    if (!/^[a-z][a-z0-9_]*$/.test(s.id ?? '')) throw new Error(`${where} sides[${i}]: "id" must be lowercase letters, digits or _`);
    if (sides.has(s.id)) throw new Error(`${where}: side "${s.id}" twice`);
    sides.add(s.id);
    text(s.name, `${where} sides.${s.id}.name`);
    text(s.members, `${where} sides.${s.id}.members`, false);
    if (!isColor(s.color)) throw new Error(`${where} sides.${s.id}: "color" must be #rrggbb`);
  }
  if (!Array.isArray(c.sources) || !c.sources.length) throw new Error(`${where}: at least one source in "sources"`);
  for (const s of c.sources) if (!s.title || !/^https?:\/\//.test(s.url ?? '')) throw new Error(`${where}: each source needs "title" and an http(s) "url"`);
  if (!Array.isArray(c.steps) || c.steps.length < 3) throw new Error(`${where}: at least three "steps"`);
  let last = -Infinity;
  for (const [i, st] of c.steps.entries()) {
    const w = `${where} steps[${i}]`;
    const t = parseDate(st.date, `${w}.date`);
    if (t < last) throw new Error(`${w}: date ${st.date} is before the previous step's`);
    last = t;
    text(st.title, `${w}.title`); text(st.text, `${w}.text`); text(st.details, `${w}.details`, false);
    if (i === 0 && !st.control) throw new Error(`${w}: the first step needs "control"`);
    if (st.control) for (const k of Object.keys(st.control)) if (!sides.has(k)) throw new Error(`${w}.control: "${k}" is not a side`);
    if (st.camera && (!inRange([st.camera.lon, st.camera.lat]) || !(st.camera.zoom >= 1 && st.camera.zoom <= 12))) throw new Error(`${w}.camera: lon, lat and zoom 1..12`);
    for (const [j, mv] of (st.moves ?? []).entries()) {
      if (!sides.has(mv.side)) throw new Error(`${w}.moves[${j}]: "side" "${mv.side}" is not a side`);
      if (!Array.isArray(mv.path) || mv.path.length < 2 || !mv.path.every((p) => isPair(p) && inRange(p))) throw new Error(`${w}.moves[${j}]: "path" needs 2+ [lon, lat] points`);
      text(mv.label, `${w}.moves[${j}].label`, false);
    }
    for (const [j, b] of (st.battles ?? []).entries()) {
      const bw = `${w}.battles[${j}]`;
      text(b.name, `${bw}.name`); text(b.details, `${bw}.details`, false); text(b.result, `${bw}.result`, false);
      if (!isPair(b.at) || !inRange(b.at)) throw new Error(`${bw}: "at" must be [lon, lat]`);
      parseDate(b.date ?? st.date, `${bw}.date`);
      if (b.winner != null && !sides.has(b.winner) && b.winner !== 'none') throw new Error(`${bw}: "winner" must be a side or "none"`);
      checkLosses(b.casualties, sides, `${bw}.casualties`);
    }
    for (const [j, e] of (st.events ?? []).entries()) {
      text(e.text, `${w}.events[${j}].text`);
      if (e.at && (!isPair(e.at) || !inRange(e.at))) throw new Error(`${w}.events[${j}]: "at" must be [lon, lat]`);
      if (e.date) parseDate(e.date, `${w}.events[${j}].date`);
    }
    if (st.deaths != null && !(typeof st.deaths === 'number' || (Array.isArray(st.deaths) && st.deaths.length === 2))) throw new Error(`${w}.deaths: a number or [low, high] (cumulative)`);
  }
  checkLosses(c.casualties, sides, `${where} casualties`);
}

// ---------------------------------------------------------------------------------------------
// Build one conflict.

async function build(file, opts) {
  const c = readJSON(file);
  validate(c, file);
  const sides = c.sides.map((s) => s.id);
  const ctx = { defs: c.defs ?? {}, refs: new Map(), resolving: new Set(), prev: null, side: null };
  const areas = []; // unique MultiPolygons (d3 winding)
  const keyOf = new Map();
  const steps = [];
  let state = {};
  const memo = new Map();
  // A side set to null (no territory) stays empty, its "derive" rule included, until set again.
  const ended = new Set();
  for (const [i, st] of c.steps.entries()) {
    const next = {};
    for (const side of sides) {
      const own = st.control?.[side];
      if (own === null) ended.add(side); else if (own !== undefined) ended.delete(side);
      const derive = ended.has(side) ? undefined : c.sides.find((x) => x.id === side).derive;
      const expr = own === null ? null : own ?? derive;
      if (expr === undefined) { next[side] = ended.has(side) ? [] : state[side] ?? []; continue; }
      const key = JSON.stringify(expr);
      const usesPrev = key.includes('"prev"') || key.includes('"cur"');
      if (!usesPrev && memo.has(key)) { next[side] = memo.get(key); continue; }
      const mp = expr === null ? [] : resolve(expr, { ...ctx, prev: i ? state : null, cur: next, side }, `${c.id} steps[${i}].control.${side}`);
      if (!usesPrev) memo.set(key, mp);
      next[side] = mp;
    }
    state = next;
    const control = {};
    for (const side of sides) {
      const d3mp = toD3(state[side]);
      if (!d3mp.length) { control[side] = null; continue; }
      const full = JSON.stringify(d3mp);
      let idx = keyOf.get(full);
      if (idx === undefined) { idx = areas.length; areas.push(d3mp); keyOf.set(full, idx); }
      control[side] = idx;
    }
    const { control: _c, ...rest } = st;
    steps.push({ ...rest, t: parseDate(st.date, ''), control });
  }
  if (!steps.some((s) => Object.values(s.control).some((v) => v !== null))) throw new Error(`${c.id}: no step has any territory`);
  if (opts.lint) lint(c, steps, areas);

  // Territory TopoJSON: shared arcs, simplified for world-to-country zoom, quantised.
  const fc = { type: 'FeatureCollection', features: areas.map((mp, i) => ({ type: 'Feature', id: i, properties: {}, geometry: { type: 'MultiPolygon', coordinates: mp } })) };
  let topo = topology({ areas: fc }, 1e5);
  topo = simplify(presimplify(topo, sphericalTriangleArea), 2e-8);
  const fixed = rewindTopology(topo);
  if (fixed.length) console.warn(`  ${c.id}: rewound ${fixed.length} polygon(s)`);
  for (const g of topo.objects.areas.geometries) {
    if (g.type == null) throw new Error(`${c.id}: area ${g.id} vanished when simplified (too small?)`);
  }

  const { defs: _d, steps: _s, ...meta } = c;
  const t0 = parseDate(c.start, ''), t1 = parseDate(c.end, '');
  const out = { ...meta, t0, t1, steps };
  if (opts.write) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `${c.id}.json`), JSON.stringify(out));
    fs.writeFileSync(path.join(OUT, `${c.id}-areas.json`), JSON.stringify(topo));
  }
  if (opts.preview) await preview(out, topo, opts.preview);
  const size = Buffer.byteLength(JSON.stringify(topo)) + Buffer.byteLength(JSON.stringify(out));
  if (opts.stale) {
    // CI: the files the app loads must match their source.
    const same = (f, v) => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === JSON.stringify(v);
    if (!same(path.join(OUT, `${c.id}.json`), out) || !same(path.join(OUT, `${c.id}-areas.json`), topo)) {
      throw new Error(`public/data/conflicts/${c.id}*.json are out of date; run npm run data:conflicts`);
    }
  }
  return { meta: out, size, areas: areas.length };
}

// ---------------------------------------------------------------------------------------------
// Lint: warnings worth a look (they don't stop the build).

function lint(c, steps, areas) {
  const warn = (m) => console.warn(`  warn ${c.id}: ${m}`);
  const sq = (mp) => mp.reduce((a, poly) => a + Math.abs(signedArea(poly[0])) - poly.slice(1).reduce((h, r) => h + Math.abs(signedArea(r)), 0), 0);
  const texts = [];
  const walk = (v, where) => {
    if (v && typeof v === 'object' && typeof v.en === 'string' && typeof v.es === 'string') { texts.push([v, where]); return; }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'control' && k !== 'defs') walk(x, `${where}.${k}`);
  };
  walk(c, '');
  for (const [v, where] of texts) if (v.en === v.es && v.en.split(' ').length > 3) warn(`${where}: Spanish text identical to English`);
  steps.forEach((st, i) => {
    if (st.text.en.length > 260) warn(`steps[${i}].text is ${st.text.en.length} characters (aim for 220 or less)`);
    if (st.title.en.length > 60) warn(`steps[${i}].title is long (${st.title.en.length} characters)`);
    // Sides sharing ground in the same step (planar degrees², a rough measure).
    const held = Object.entries(st.control).filter(([, v]) => v !== null);
    for (let a = 0; a < held.length; a++) for (let b = a + 1; b < held.length; b++) {
      if (held[a][1] === held[b][1]) { warn(`steps[${i}]: ${held[a][0]} and ${held[b][0]} have the same territory`); continue; }
      let inter = [];
      try { inter = pc.intersection(areas[held[a][1]], areas[held[b][1]]); } catch { continue; }
      const area = sq(inter);
      if (area > 0.05) warn(`steps[${i}] ${st.date}: ${held[a][0]} and ${held[b][0]} overlap (~${Math.round(area * 12000)} km²)`);
    }
  });
  for (const s of c.sides) {
    const used = steps.some((st) => st.control[s.id] != null) || steps.some((st) => (st.moves ?? []).some((m) => m.side === s.id) || (st.battles ?? []).some((b) => b.winner === s.id));
    if (!used) warn(`side "${s.id}" never holds territory, moves or wins`);
  }
}

// ---------------------------------------------------------------------------------------------
// Previews: each step drawn on a globe as a PNG, to check the territory and arrows by eye.

function fmtDate(s) {
  const [y, mo, d] = (/^(-?\d+)(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s) ?? []).slice(1);
  const year = Number(y) < 0 ? `${-Number(y)} BC` : y;
  return [d, mo && ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1], year].filter(Boolean).join(' ');
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function preview(c, topo, dir) {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(dir, { recursive: true });
  const areas = feature(topo, topo.objects.areas).features;
  const landTopo = readJSON(path.join(DATA, 'base/land-110m.json'));
  const landF = feature(landTopo, landTopo.objects.land);
  const W = 640, H = 640;
  let cam = c.camera;
  const jobs = [];
  c.steps.forEach((st, i) => {
    cam = st.camera ?? cam;
    const proj = geoOrthographic().rotate([-cam.lon, -cam.lat]).scale(290 * cam.zoom).translate([W / 2, H / 2 + 20]).clipAngle(90).precision(0.3);
    const p = geoPath(proj);
    const parts = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`, `<path d="${p({ type: 'Sphere' })}" fill="#cfe3f3"/>`,
      `<path d="${p(geoGraticule10())}" fill="none" stroke="#b5cde2" stroke-width="0.5"/>`, `<path d="${p(landF)}" fill="#ece6d6" stroke="#9aa5ad" stroke-width="0.4"/>`];
    for (const s of c.sides) {
      const idx = st.control[s.id];
      if (idx == null) continue;
      parts.push(`<path d="${p(areas[idx])}" fill="${s.color}" fill-opacity="0.72" stroke="${s.color}" stroke-width="1"/>`);
    }
    for (const mv of st.moves ?? []) {
      const col = c.sides.find((s) => s.id === mv.side).color;
      const d = p({ type: 'LineString', coordinates: mv.path });
      if (d) parts.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow-${mv.side})"/>`);
    }
    for (const b of st.battles ?? []) {
      const xy = proj(b.at);
      if (!xy) continue;
      parts.push(`<circle cx="${xy[0]}" cy="${xy[1]}" r="5" fill="#111" stroke="#fff" stroke-width="1.5"/><text x="${xy[0] + 7}" y="${xy[1] + 4}" font-size="11" font-family="sans-serif" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(b.name.en)}</text>`);
    }
    for (const e of st.events ?? []) {
      if (!e.at) continue;
      const xy = proj(e.at);
      if (xy) parts.push(`<rect x="${xy[0] - 4}" y="${xy[1] - 4}" width="8" height="8" fill="#f2c14e" stroke="#111"/>`);
    }
    const markers = c.sides.map((s) => `<marker id="arrow-${s.id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.color}"/></marker>`).join('');
    const shown = c.sides.filter((s) => st.control[s.id] != null || (st.moves ?? []).some((m) => m.side === s.id));
    const legend = shown.map((s, k) => `<rect x="${12 + (k % 3) * 205}" y="${H - 44 + Math.floor(k / 3) * 18}" width="12" height="12" fill="${s.color}"/><text x="${28 + (k % 3) * 205}" y="${H - 34 + Math.floor(k / 3) * 18}" font-size="12" font-family="sans-serif">${esc(s.name.en.slice(0, 30))}</text>`).join('');
    const title = `<text x="12" y="22" font-size="15" font-weight="bold" font-family="sans-serif">${esc(`${i + 1}/${c.steps.length} · ${fmtDate(st.date)} · ${st.title.en}`)}</text>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${markers}</defs>${parts.join('')}${title}${legend}</svg>`;
    jobs.push(sharp(Buffer.from(svg)).png().toFile(path.join(dir, `${c.id}-${String(i + 1).padStart(2, '0')}.png`)));
  });
  await Promise.all(jobs);
}

/** What the picker needs before a conflict is opened. */
function indexEntry(m) {
  // Only the sides that hold territory at some step (not the ones of the aftermath alone).
  const sides = m.sides.filter((s) => m.steps.some((st) => !st.aftermath && st.control[s.id] != null));
  return {
    id: m.id, name: m.name, icon: m.icon, era: m.era, region: m.region, summary: m.summary, start: m.start, end: m.end,
    t0: m.t0, t1: m.t1, steps: m.steps.length, sides: sides.map((s) => ({ name: s.name, color: s.color })),
  };
}

// ---------------------------------------------------------------------------------------------
// CLI.

function listing(args) {
  const [what, arg] = args;
  if (what === 'countries') for (const [id, v] of [...loadCountries()].sort()) console.log(`${id}\t${v.name}`);
  else if (what === 'admin1') {
    const m = loadAdmin1().get(arg);
    if (!m) throw new Error(`no provinces for "${arg}"`);
    console.log([...m.keys()].sort().join('\n'));
  } else if (what === 'hist') console.log([...loadSnapshot(Number(arg)).keys()].sort().join('\n'));
  else throw new Error('--list countries | admin1 <A3> | hist <year>');
}

function find(q) {
  const s = q.toLowerCase();
  for (const [id, v] of loadCountries()) if (id.toLowerCase() === s || v.name.toLowerCase().includes(s)) console.log(`country\t${id}\t${v.name}`);
  for (const [a, m] of loadAdmin1()) for (const n of m.keys()) if (n.toLowerCase().includes(s)) console.log(`admin1\t${a}\t${n}`);
  for (const y of snapshotYears()) for (const n of loadSnapshot(y).keys()) if (n.toLowerCase().includes(s)) console.log(`hist\t${y}\t${n}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--list')) { listing(argv.slice(argv.indexOf('--list') + 1)); return; }
  if (argv.includes('--find')) { find(get('--find')); return; }
  const only = get('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const check = argv.includes('--check');
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json') && (!only || only.includes(path.basename(f, '.json')))).map((f) => path.join(SRC, f));
  if (only) for (const id of only) if (!files.some((f) => path.basename(f, '.json') === id)) throw new Error(`no scripts/data/conflicts/${id}.json`);
  const results = [];
  let failed = 0;
  for (const file of files) {
    try {
      const r = await build(file, { write: !check, preview: get('--preview'), stale: check && !only, lint: argv.includes('--lint') });
      results.push(r);
      console.log(`ok   ${r.meta.id}: ${r.meta.steps.length} steps, ${r.areas} areas, ${(r.size / 1024).toFixed(0)} KB`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${path.basename(file)}: ${e.message}`);
    }
  }
  if (check && !only && !failed) {
    // CI: the picker's list must match the sources too.
    const index = results.map((r) => r.meta).sort((a, b) => a.t0 - b.t0).map(indexEntry);
    const f = path.join(OUT, 'index.json');
    if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8') !== JSON.stringify({ conflicts: index })) {
      failed++;
      console.error('FAIL public/data/conflicts/index.json is out of date; run npm run data:conflicts');
    }
  } else if (!check && !only && !failed) {
    // The picker's list: everything needed before a conflict is opened.
    const index = results.map((r) => r.meta).sort((a, b) => a.t0 - b.t0).map(indexEntry);
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ conflicts: index }));
    // Drop outputs whose source is gone.
    const keep = new Set(index.flatMap((m) => [`${m.id}.json`, `${m.id}-areas.json`]).concat('index.json'));
    for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.unlinkSync(path.join(OUT, f));
    console.log(`index: ${index.length} conflicts`);
  } else if (!check && only && !failed && fs.existsSync(path.join(OUT, 'index.json'))) {
    // Partial build: refresh these entries in the existing index.
    const idx = readJSON(path.join(OUT, 'index.json'));
    for (const r of results) {
      const m = r.meta;
      const entry = indexEntry(m);
      const i = idx.conflicts.findIndex((x) => x.id === m.id);
      if (i >= 0) idx.conflicts[i] = entry; else idx.conflicts.push(entry);
    }
    idx.conflicts.sort((a, b) => a.t0 - b.t0);
    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
