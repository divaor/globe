#!/usr/bin/env node
/**
 * Builds the time-travel stories from their authoring files. Four collections share one format:
 *
 *   wars        scripts/data/conflicts/<id>.json   (format: scripts/data/conflicts/README.md)
 *   eras        scripts/data/eras/<id>.json        (Eras and ideas; format: scripts/data/STORIES.md)
 *   food        scripts/data/food/<id>.json        (Food through time)
 *   structures  scripts/data/structures/<id>.json  (Great structures)
 *   people      scripts/data/people/<id>.json      (Peoples and civilizations)
 *   life        scripts/data/life/<id>.json        (Life through time: steps older than 5 million
 *                                                   years are drawn on the continents of their age)
 *   games       scripts/data/games/<id>.json       (Games of the world: a step that names a Games or
 *                                                   a World Cup gets its teams and host city from
 *                                                   scripts/data/games/, see attach.mjs)
 *
 * Each collection is written to public/data/<dir>/:
 *
 *   index.json         the list shown in the picker (and, but for wars, the categories)
 *   <id>.json          one story: sides, steps (text, moves, battles, events, items shown)
 *   <id>-areas.json    TopoJSON: the territory of each side at each step
 *   items.json         every marker of the collection, for browsing and quizzes (not wars)
 *
 * The collections other than wars also have scripts/data/<dir>/_collection.json: their
 * categories (icon, colour) and a shared catalogue of items (dishes, structures) that stories
 * show by id.
 *
 * Territory is written as expressions over real map pieces (today's countries, provinces, the
 * historical snapshots, land) combined with hand-drawn polygons, so rough drawings get real
 * coastlines and borders.
 *
 *   node scripts/data/build-conflicts.mjs                     build everything
 *   node scripts/data/build-conflicts.mjs --kind eras         build one collection
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
import { feature, quantize } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, simplify, sphericalTriangleArea } from 'topojson-simplify';
import { geoArea, geoCircle, geoDistance, geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import { rewindTopology } from './winding.mjs';
import { paleoMa, tooOld, plateFor, rotate, paleoLand, PALEO_YEARS } from './paleo-rot.mjs';
import { attachGames, gamesIds, gamesSides } from './games/attach.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = path.join(ROOT, 'public/data');

/** The collections: where their sources and outputs live. */
export const KINDS = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life', games: 'games' };
/** The collections whose deep-time steps are drawn on the continents of their age (the plate model). */
const PALEO_KINDS = new Set(['life']);
const srcDir = (kind) => path.join(ROOT, 'scripts/data', KINDS[kind]);
const outDir = (kind) => path.join(DATA, KINDS[kind]);
const ITEM_TYPES = ['person', 'work', 'place', 'invention', 'event', 'site', 'dish', 'crop', 'animal', 'structure', 'institution', 'fossil', 'culture', 'species', 'games'];

export const ERAS = ['precambrian', 'paleozoic', 'mesozoic', 'cenozoic', 'prehistory', 'ancient', 'medieval', 'early-modern', 'modern', 'contemporary'];
/** The geologic eras: only the Life through time stories are grouped by them. */
const GEO_ERAS = ['precambrian', 'paleozoic', 'mesozoic', 'cenozoic'];

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
// Some historical shapes cross ±180° (the Russian Empire, the USSR, Fiji...): their rings jump from
// 180 to -180, which in the plane is a band around the whole world. Unwrap such polygons so their
// longitudes run on past ±180, then cut them into the -180..180 window.
export function splitAntimeridian(mp) {
  const out = [];
  const unwrap = (r) => {
    const o = [[r[0][0], r[0][1]]];
    for (let i = 1; i < r.length; i++) {
      let x = r[i][0];
      const px = o[i - 1][0];
      while (x - px > 180) x -= 360;
      while (x - px < -180) x += 360;
      o.push([x, r[i][1]]);
    }
    return o;
  };
  for (const poly of mp) {
    if (!poly.some((r) => r.some((pt, i) => i && Math.abs(pt[0] - r[i - 1][0]) > 180))) { out.push(poly); continue; }
    const outer = unwrap(poly[0]);
    // A ring around a pole doesn't close once unwrapped: leave such polygons as they are.
    if (Math.abs(outer[0][0] - outer[outer.length - 1][0]) > 1e-9) { out.push(poly); continue; }
    const xs = outer.map((pt) => pt[0]), lo = Math.min(...xs), hi = Math.max(...xs);
    // Holes go to the copy of themselves that lies inside the outer ring's span.
    const holes = poly.slice(1).map((r) => {
      const h = unwrap(r);
      const k = [0, 360, -360].find((d) => h[0][0] + d >= lo && h[0][0] + d <= hi) ?? 0;
      return h.map(([x, y]) => [x + k, y]);
    });
    for (const shift of [-360, 0, 360]) {
      if (hi <= -180 + shift || lo >= 180 + shift) continue;
      const box = [[[-180 + shift, -90], [180 + shift, -90], [180 + shift, 90], [-180 + shift, 90], [-180 + shift, -90]]];
      for (const part of pc.intersection([[outer, ...holes]], [box])) out.push(part.map((r) => r.map(([x, y]) => [x - shift, y])));
    }
  }
  return out;
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
    m.set(n, (m.get(n) ?? []).concat(splitAntimeridian(multi(f.geometry))));
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
  // Up to ten digits: deep time (7 million years ago is -7000000).
  const m = /^(-?\d{1,10})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(s ?? ''));
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

// ---------------------------------------------------------------------------------------------
// Items: the markers of the stories other than wars (people, works, sites, dishes, structures).

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const ITEM_TEXTS = ['place', 'details', 'why', 'how', 'by', 'size', 'status'];

function checkItem(it, where, coll, catalog = false) {
  if (!it || typeof it !== 'object' || Array.isArray(it)) throw new Error(`${where}: must be an object`);
  if ((catalog || it.id != null) && !ID_RE.test(it.id ?? '')) throw new Error(`${where}: "id" must be lowercase letters, digits and hyphens`);
  text(it.name, `${where}.name`);
  if (!isPair(it.at) || !inRange(it.at)) throw new Error(`${where}: "at" must be [lon, lat]`);
  if (!coll.cats.has(it.cat)) throw new Error(`${where}: "cat" "${it.cat}" is not a category of this collection (${[...coll.cats.keys()].join(', ')})`);
  if (it.icon != null && (typeof it.icon !== 'string' || !it.icon)) throw new Error(`${where}: "icon" must be an emoji`);
  if (it.type != null && !ITEM_TYPES.includes(it.type)) throw new Error(`${where}: "type" must be one of ${ITEM_TYPES.join(', ')}`);
  const t = parseDate(it.date, `${where}.date`);
  if (it.end != null && parseDate(it.end, `${where}.end`) < t) throw new Error(`${where}: "end" is before "date"`);
  // "until": when it stopped existing (a civilization's fall, a lost building); time tours hide it after.
  if (it.until != null && parseDate(it.until, `${where}.until`) < Math.max(t, it.end != null ? parseDate(it.end, '') : t)) throw new Error(`${where}: "until" is before "date" or "end"`);
  if (it.life != null) {
    if (!Array.isArray(it.life) || it.life.length !== 2) throw new Error(`${where}: "life" is ["born", "died"] (died may be null)`);
    parseDate(it.life[0], `${where}.life[0]`);
    if (it.life[1] != null) parseDate(it.life[1], `${where}.life[1]`);
  }
  text(it.text, `${where}.text`);
  for (const k of ITEM_TEXTS) text(it[k], `${where}.${k}`, false);
  if (it.facts != null && !Array.isArray(it.facts)) throw new Error(`${where}: "facts" is [{ "label": {en, es}, "value": {en, es} }]`);
  for (const [j, f] of (it.facts ?? []).entries()) { text(f?.label, `${where}.facts[${j}].label`); text(f?.value, `${where}.facts[${j}].value`); }
  if (it.wiki != null && (typeof it.wiki !== 'object' || typeof it.wiki.en !== 'string' || typeof it.wiki.es !== 'string' || !it.wiki.en)) throw new Error(`${where}: "wiki" is { "en": "Article title", "es": "Título del artículo" }`);
  if (it.country != null && !loadCountries().has(it.country)) throw new Error(`${where}: "country" "${it.country}" is not a country code (see --list countries)`);
  // "img": a Wikimedia Commons file for the card, when the article has no picture of its own.
  // An SVG is fine too: Commons serves the card a PNG thumbnail of it.
  if (it.img != null && (typeof it.img !== 'string' || !/\.(jpe?g|png|gif|tiff?|webp|svg)$/i.test(it.img) || /^(File:|https?:)/i.test(it.img))) throw new Error(`${where}: "img" is a Commons file name such as "Pompeii bread.jpg" (no "File:", no address)`);
  const known = new Set(['id', 'name', 'at', 'cat', 'icon', 'type', 'date', 'end', 'until', 'life', 'text', 'facts', 'wiki', 'img', 'country', ...ITEM_TEXTS]);
  for (const k of Object.keys(it)) if (!known.has(k)) throw new Error(`${where}: unknown field "${k}"`);
  return t;
}

/** An item as the app gets it: fixed field order, with its time and icon filled in. */
function normItem(it, coll) {
  const o = { id: it.id, name: it.name, at: it.at.map((v) => Math.round(v * 1e4) / 1e4), cat: it.cat, icon: it.icon ?? coll.cats.get(it.cat).icon, date: it.date, t: parseDate(it.date, '') };
  for (const k of ['end', 'until', 'life', 'type', 'country', 'place', 'text', 'details', 'why', 'how', 'by', 'size', 'status', 'facts', 'wiki', 'img', 'podium']) if (it[k] != null) o[k] = it[k];
  if (it.until != null) o.tu = parseDate(it.until, '');
  if (o.id == null) delete o.id;
  return o;
}

/** A collection's categories and shared catalogue (scripts/data/<dir>/_collection.json). */
function loadCollection(kind) {
  if (kind === 'wars') return null;
  const where = `${KINDS[kind]}/_collection.json`;
  const f = path.join(srcDir(kind), '_collection.json');
  if (!fs.existsSync(f)) throw new Error(`${where} is missing`);
  const c = readJSON(f);
  text(c.name, `${where} name`);
  const cats = new Map();
  for (const [i, cat] of (c.categories ?? []).entries()) {
    const w = `${where} categories[${i}]`;
    if (!/^[a-z][a-z0-9-]*$/.test(cat.id ?? '')) throw new Error(`${w}: "id" must be lowercase letters, digits and hyphens`);
    if (cats.has(cat.id)) throw new Error(`${w}: category "${cat.id}" twice`);
    text(cat.name, `${w}.name`);
    if (typeof cat.icon !== 'string' || !cat.icon) throw new Error(`${w}: "icon" (an emoji) is missing`);
    if (!isColor(cat.color)) throw new Error(`${w}: "color" must be #rrggbb`);
    cats.set(cat.id, { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color });
  }
  if (!cats.size) throw new Error(`${where}: at least one category`);
  const coll = { kind, name: c.name, cats, catalog: new Map() };
  // The catalogue may be split over _collection.json and any _catalog-*.json files beside it.
  const parts = [[where, c.catalog ?? []]];
  for (const f of fs.readdirSync(srcDir(kind)).filter((x) => /^_catalog.*\.json$/.test(x)).sort()) {
    parts.push([`${KINDS[kind]}/${f}`, readJSON(path.join(srcDir(kind), f)).catalog ?? []]);
  }
  for (const [w, list] of parts) {
    for (const [i, it] of list.entries()) {
      checkItem(it, `${w} catalog[${i}] (${it?.id})`, coll, true);
      if (coll.catalog.has(it.id)) throw new Error(`${w}: catalogue item "${it.id}" is already in the catalogue`);
      coll.catalog.set(it.id, it);
    }
  }
  return coll;
}

function validate(c, file, kind = 'wars', coll = null) {
  const wars = kind === 'wars';
  const where = path.basename(file);
  if (c.id !== path.basename(file, '.json')) throw new Error(`${where}: "id" must be the file name ("${path.basename(file, '.json')}")`);
  text(c.name, `${where} name`); text(c.summary, `${where} summary`); text(c.region, `${where} region`); text(c.outcome, `${where} outcome`);
  text(c.casualtiesNote, `${where} casualtiesNote`, false);
  if (!ERAS.includes(c.era)) throw new Error(`${where}: "era" must be one of ${ERAS.join(', ')}`);
  if (GEO_ERAS.includes(c.era) && !PALEO_KINDS.has(kind)) throw new Error(`${where}: "era" ${c.era} is for Life through time; use one of ${ERAS.filter((e) => !GEO_ERAS.includes(e)).join(', ')}`);
  if (typeof c.icon !== 'string' || !c.icon) throw new Error(`${where}: "icon" (an emoji) is missing`);
  const t0 = parseDate(c.start, `${where} start`), t1 = parseDate(c.end, `${where} end`);
  if (t1 < t0) throw new Error(`${where}: "end" is before "start"`);
  if (!c.camera || !inRange([c.camera.lon, c.camera.lat]) || !(c.camera.zoom >= 1 && c.camera.zoom <= 30)) throw new Error(`${where}: "camera" needs lon, lat and zoom 1..30`);
  if (wars && (!Array.isArray(c.sides) || c.sides.length < 2)) throw new Error(`${where}: at least two "sides"`);
  if (c.sides != null && !Array.isArray(c.sides)) throw new Error(`${where}: "sides" is a list`);
  if ((c.sides ?? []).length > 8) throw new Error(`${where}: at most 8 "sides"`);
  if (!wars && c.catalog != null && !['all', 'shown'].includes(c.catalog)) throw new Error(`${where}: "catalog" is "all" (every catalogue item appears from its date on) or "shown" (only the items the steps show)`);
  if (c.catalog === 'all' && !coll.catalog.size) throw new Error(`${where}: "catalog": "all" but the collection has no catalogue`);
  if (!wars && c.casualties != null) throw new Error(`${where}: "casualties" is for wars`);
  const sides = new Set();
  for (const [i, s] of (c.sides ?? []).entries()) {
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
    if (wars && i === 0 && !st.control) throw new Error(`${w}: the first step needs "control"`);
    if (wars && (st.places || st.show)) throw new Error(`${w}: "places" and "show" are for eras, food and structures`);
    if (st.games != null && (kind !== 'games' || !gamesIds().has(st.games))) throw new Error(`${w}.games: ${kind !== 'games' ? 'only in Games of the world' : `"${st.games}" is not a Games (summer-1936, winter-2026, wc-1930, wwc-1991...)`}`);
    if (st.places != null && !Array.isArray(st.places)) throw new Error(`${w}.places: a list of items`);
    for (const [j, it] of (st.places ?? []).entries()) checkItem(it, `${w}.places[${j}]`, coll);
    if (st.show != null && !Array.isArray(st.show)) throw new Error(`${w}.show: a list of catalogue ids`);
    for (const id of st.show ?? []) if (!coll.catalog.has(id)) throw new Error(`${w}.show: "${id}" is not in the catalogue`);
    if (st.control) for (const k of Object.keys(st.control)) if (!sides.has(k)) throw new Error(`${w}.control: "${k}" is not a side`);
    if (st.camera && (!inRange([st.camera.lon, st.camera.lat]) || !(st.camera.zoom >= 1 && st.camera.zoom <= 30))) throw new Error(`${w}.camera: lon, lat and zoom 1..30`);
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
/** Spanish writes thousands with a space ("40 000"): make it a no-break space, so a number never
 * splits across two lines. */
function keepNumbers(v, es = false) {
  if (typeof v === 'string') return es ? v.replace(/(\d) (?=\d{3}(?!\d))/g, '$1\u00a0') : v;
  if (Array.isArray(v)) return v.map((x) => keepNumbers(x, es));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'wiki' ? x : keepNumbers(x, k === 'es' || es)]));
  return v;
}

// Build one conflict.

async function build(file, opts) {
  const c = readJSON(file);
  const kind = opts.kind ?? 'wars', coll = opts.coll ?? null, wars = kind === 'wars';
  validate(c, file, kind, coll);
  c.sides = c.sides ?? [];
  if (kind === 'games') {
    // The Games' own sides (host, medals, champions, took part, boycotts...), after the story's.
    const kinds = new Set(c.steps.filter((st) => st.games).map((st) => st.games.split('-')[0]));
    if (kinds.size) for (const s of gamesSides(kinds)) if (!c.sides.some((x) => x.id === s.id)) c.sides.push(s);
  }
  const sides = c.sides.map((s) => s.id);
  // Items (not wars): the steps' own places and the catalogue items they show, each listed once.
  const items = [];
  const itemOf = new Map();
  const addItem = (it, first) => {
    if (it.id != null && itemOf.has(it.id)) return itemOf.get(it.id);
    const k = items.push({ ...normItem(it, coll), first }) - 1;
    if (it.id != null) itemOf.set(it.id, k);
    return k;
  };
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
    const { control: _c, places, show: showIds, ...rest } = st;
    // Battles pop up and events appear in list order: make that the order they happened in
    // (undated ones count as the step's date; ties keep the author's order).
    const byDate = (list) => list.map((x, k) => [parseDate(x.date ?? st.date, ''), k, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[2]);
    if (rest.battles) rest.battles = byDate(rest.battles);
    if (rest.events) rest.events = byDate(rest.events);
    const out = { ...rest, t: parseDate(st.date, ''), control };
    if (!wars) {
      const shown = [...(places ?? []).map((it) => addItem(it, i)), ...(showIds ?? []).map((id) => addItem(coll.catalog.get(id), i))];
      out.show = [...new Set(shown)].sort((a, b) => items[a].t - items[b].t || a - b);
    }
    steps.push(out);
  }
  if (wars && !steps.some((s) => Object.values(s.control).some((v) => v !== null))) throw new Error(`${c.id}: no step has any territory`);
  if (kind === 'games') {
    // Games of the world: each Games step's teams, and its host city's marker.
    const addArea = (mp) => {
      const d3mp = toD3(mp);
      const full = JSON.stringify(d3mp);
      let idx = keyOf.get(full);
      if (idx === undefined) { idx = areas.length; areas.push(d3mp); keyOf.set(full, idx); }
      return idx;
    };
    attachGames(c, steps, { addItem, addArea, warn: opts.lint ? (m) => console.warn(`  ${m}`) : null });
    // Only the Games' sides that some team has (no "Banned" in a story where nobody was).
    const unused = c.sides.filter((s) => s.id.startsWith('g_') && !steps.some((st) => st.games?.teams.some((tm) => tm.s === s.id))).map((s) => s.id);
    c.sides = c.sides.filter((s) => !unused.includes(s.id));
    for (const st of steps) for (const id of unused) delete st.control[id];
  }
  if (c.catalog === 'all') {
    // A time tour: every catalogue item of the story's period (from its start to its last step)
    // appears on the map from its date on (and goes after its "until"). Older items appear only
    // when a step shows them, except those still standing in the period ("until" after its start).
    const first = c.start != null ? parseDate(c.start, '') : -Infinity;
    const last = steps[steps.length - 1].t;
    for (const it of [...coll.catalog.values()].sort((a, b) => parseDate(a.date, '') - parseDate(b.date, ''))) {
      const t = parseDate(it.date, '');
      const inPeriod = it.until != null ? parseDate(it.until, '') >= first - 1e-6 : t >= first - 1e-6;
      if (inPeriod && t <= last + 1e-6) addItem(it, -1);
    }
  }
  if (PALEO_KINDS.has(kind)) paleoPass(c, steps, items, opts);
  if (opts.lint) lint(c, steps, areas);

  // Territory TopoJSON: shared arcs, simplified for world-to-country zoom, quantised.
  const fc = { type: 'FeatureCollection', features: areas.map((mp, i) => ({ type: 'Feature', id: i, properties: {}, geometry: { type: 'MultiPolygon', coordinates: mp } })) };
  let topo = areas.length ? topology({ areas: fc }, 1e5) : null;
  if (!topo) topo = { type: 'Topology', objects: { areas: { type: 'GeometryCollection', geometries: [] } }, arcs: [] };
  else {
    // presimplify decodes the arcs to full-precision floats; quantise again (about 40 m to 400 m
    // per step depending on the conflict's extent), which makes the file several times smaller.
    topo = quantize(simplify(presimplify(topo, sphericalTriangleArea), 2e-8), 1e5);
    const fixed = rewindTopology(topo);
    if (fixed.length) console.warn(`  ${c.id}: rewound ${fixed.length} polygon(s)`);
    for (const g of topo.objects.areas.geometries) {
      if (g.type == null) throw new Error(`${c.id}: area ${g.id} vanished when simplified (too small?)`);
    }
  }

  const { defs: _d, steps: _s, ...meta } = c;
  const t0 = parseDate(c.start, ''), t1 = parseDate(c.end, '');
  const out = keepNumbers({ ...meta, t0, t1, steps });
  if (!wars) {
    out.kind = kind;
    out.items = items;
    out.cats = [...coll.cats.values()].filter((cat) => items.some((it) => it.cat === cat.id));
  }
  const OUT = outDir(kind);
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
      throw new Error(`public/data/${KINDS[kind]}/${c.id}*.json are out of date; run npm run data:stories`);
    }
  }
  return { meta: out, size, areas: areas.length };
}

// ---------------------------------------------------------------------------------------------
// Life through time: steps older than 5 million years are drawn on the continents of their age.

/**
 * Each such step gets its age (`ma`, in millions of years; `deep` when it is older than the plate
 * model, which then draws today's land), and every place drawn on it the plate that carries it
 * (`pl`; `pls` for a route's points), so the app moves it with its continent. Cameras get the plate
 * under the point they look at.
 */
function paleoPass(c, steps, items, opts) {
  const warn = (m) => { if (opts.lint) console.warn(`  warn ${c.id}: ${m}`); };
  const place = (pt, ma, what) => {
    const r = plateFor(pt, ma);
    if (r.note) warn(`${what} is drawn with its plate, but ${r.note}`);
    return r.pl;
  };
  steps.forEach((st, i) => {
    if (st.t < PALEO_YEARS) {
      const held = Object.entries(st.control).filter(([, v]) => v != null).map(([k]) => k);
      if (held.length) throw new Error(`${c.id} steps[${i}]: a step older than 5 million years is drawn on the continents of its age, so it can't have territory ("control": ${held.join(', ')}); show items and moves instead`);
    }
    const ma = paleoMa(st.t);
    if (ma != null) st.ma = Math.round(ma * 1000) / 1000;
    else if (tooOld(st.t)) st.deep = true;
    if (ma == null) return;
    for (const [j, mv] of (st.moves ?? []).entries()) mv.pls = mv.path.map((pt, k) => place(pt, ma, `steps[${i}].moves[${j}].path[${k}]`));
    for (const [j, ev] of (st.events ?? []).entries()) if (ev.at) { const pl = place(ev.at, ma, `steps[${i}].events[${j}]`); if (pl) ev.pl = pl; }
  });
  if (!steps.some((st) => st.ma != null)) return;
  for (const cam of [c.camera, ...steps.map((st) => st.camera)]) {
    if (!cam) continue;
    const pl = plateFor([cam.lon, cam.lat], 0).pl;
    if (pl) cam.pl = pl;
  }
  items.forEach((it, idx) => {
    // The steps that draw it: those that show it, and the later ones that keep it as a dot until it
    // dies out (in a time tour, from its date on). Its plate is looked up at the first old map among them.
    const draws = (st, k) => st.show?.includes(idx)
      || ((it.first >= 0 ? k > it.first : st.t >= it.t - 1e-6) && !(it.tu != null && st.t > it.tu + 1e-6));
    const j = steps.findIndex((st, k) => st.ma != null && draws(st, k));
    const ma = j >= 0 ? steps[j].ma : paleoMa(it.t);
    if (ma == null) return;
    const pl = place(it.at, ma, `item "${it.name.en}"`);
    if (pl) it.pl = pl;
  });
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
  // Names and Wikipedia titles are often the same in both languages; only flag real sentences.
  for (const [v, where] of texts) if (v.en === v.es && v.en.split(' ').length > 3 && !/\.wiki$/.test(where)) warn(`${where}: Spanish text identical to English`);
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
    const used = steps.some((st) => st.control[s.id] != null) || steps.some((st) => (st.moves ?? []).some((m) => m.side === s.id) || (st.battles ?? []).some((b) => b.winner === s.id) || st.games?.teams.some((tm) => tm.s === s.id));
    if (!used) warn(`side "${s.id}" never holds territory, moves or wins`);
  }
}

// ---------------------------------------------------------------------------------------------
// Previews: each step drawn on a globe as a PNG, to check the territory and arrows by eye.

function fmtDate(s) {
  const [y, mo, d] = (/^(-?\d+)(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s) ?? []).slice(1);
  const n = -Number(y);
  if (n >= 1e9) return `${Math.round(n / 1e7) / 100} billion years ago`;
  if (n >= 1e6) return `${Math.round(n / 1e4) / 100} million years ago`;
  if (n > 10000) return `${n.toLocaleString('en')} years ago`;
  const year = Number(y) < 0 ? `${-Number(y)} BC` : y;
  return [d, mo && ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1], year].filter(Boolean).join(' ');
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function preview(c, topo, dir) {
  const sharp = (await import('sharp')).default;
  fs.mkdirSync(dir, { recursive: true });
  const areas = feature(topo, topo.objects.areas).features;
  // Land drawn country by country: the single Afro-Eurasian land polygon gets clipped wrongly in
  // close-up views and paints the land as sea.
  const landTopo = readJSON(path.join(DATA, 'base/countries-50m.json'));
  const landF = feature(landTopo, landTopo.objects.countries);
  const byIso = new Map(landF.features.map((f) => [f.id, f]));
  const W = 640, H = 640;
  let cam = c.camera;
  const jobs = [];
  c.steps.forEach((st, i) => {
    cam = st.camera ?? cam;
    // A step older than 5 million years (Life through time) is drawn on the continents of its age:
    // its places and the camera move with their plates.
    const ma = st.ma ?? null;
    const at = (pt, pl) => (ma != null ? rotate(pt, pl, ma) : pt);
    const centre = at([cam.lon, cam.lat], cam.pl);
    const proj0 = geoOrthographic().rotate([-centre[0], -centre[1]]).scale(290 * cam.zoom).translate([W / 2, H / 2 + 20]).clipAngle(90).precision(0.3);
    // Points on the far side of the globe are hidden (paths are clipped by clipAngle; points aren't).
    const proj = Object.assign((pt) => (geoDistance(centre, pt) < Math.PI / 2 - 0.005 ? proj0(pt) : null), proj0);
    const p = geoPath(proj0);
    const parts = [`<rect width="${W}" height="${H}" fill="#ffffff"/>`, `<path d="${p({ type: 'Sphere' })}" fill="#cfe3f3"/>`,
      `<path d="${p(geoGraticule10())}" fill="none" stroke="#b5cde2" stroke-width="0.5"/>`];
    if (ma != null) {
      const old = paleoLand(ma);
      parts.push(`<path d="${p(old.shelf)}" fill="#b4d2e8"/>`, `<path d="${p(old.land)}" fill="#ece6d6" stroke="#9aa5ad" stroke-width="0.4"/>`);
    } else parts.push(`<path d="${p(landF)}" fill="${st.deep ? '#e2e2e2' : '#ece6d6'}" stroke="#9aa5ad" stroke-width="0.4"/>`);
    if (st.games) {
      // Games of the world: each team's countries in its colour, and an arc from each to the host city.
      const sideCol = (id) => c.sides.find((s) => s.id === id)?.color ?? '#888888';
      for (const tm of st.games.teams) {
        for (const u of tm.u) {
          const f = u.startsWith('#') ? areas[Number(u.slice(1))] : byIso.get(u);
          if (f) parts.push(`<path d="${p(f)}" fill="${sideCol(tm.s)}" fill-opacity="0.82" stroke="#ffffff" stroke-width="0.35"/>`);
        }
      }
      for (const tm of st.games.teams) {
        if (!tm.o) continue;
        const d = p({ type: 'LineString', coordinates: [tm.o, st.games.host] });
        if (d) parts.push(`<path d="${d}" fill="none" stroke="#1d3557" stroke-width="0.8" stroke-opacity="0.75"/>`);
      }
    }
    for (const s of c.sides) {
      const idx = st.control[s.id];
      if (idx == null) continue;
      parts.push(`<path d="${p(areas[idx])}" fill="${s.color}" fill-opacity="0.72" stroke="${s.color}" stroke-width="1"/>`);
    }
    for (const mv of st.moves ?? []) {
      const col = c.sides.find((s) => s.id === mv.side).color;
      const d = p({ type: 'LineString', coordinates: mv.path.map((pt, k) => at(pt, mv.pls?.[k])) });
      if (d) parts.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" marker-end="url(#arrow-${mv.side})"/>`);
    }
    for (const b of st.battles ?? []) {
      const xy = proj(b.at);
      if (!xy) continue;
      parts.push(`<circle cx="${xy[0]}" cy="${xy[1]}" r="5" fill="#111" stroke="#fff" stroke-width="1.5"/><text x="${xy[0] + 7}" y="${xy[1] + 4}" font-size="11" font-family="sans-serif" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(b.name.en)}</text>`);
    }
    for (const e of st.events ?? []) {
      if (!e.at) continue;
      const xy = proj(at(e.at, e.pl));
      if (xy) parts.push(`<rect x="${xy[0] - 4}" y="${xy[1] - 4}" width="8" height="8" fill="#f2c14e" stroke="#111"/>`);
    }
    if (c.items) {
      // Items: earlier ones (and, in a time tour, every catalogue item built by now) as small dots,
      // this step's ones as larger dots with their names.
      const col = new Map(c.cats.map((k) => [k.id, k.color]));
      const now = new Set(st.show);
      c.items.forEach((it, k) => {
        if (now.has(k) || !((it.first >= 0 && it.first < i) || (it.first === -1 && it.t <= st.t)) || (it.tu != null && it.tu < st.t)) return;
        const xy = proj(at(it.at, it.pl));
        if (xy) parts.push(`<circle cx="${xy[0]}" cy="${xy[1]}" r="2.6" fill="${col.get(it.cat)}" fill-opacity="0.75" stroke="#fff" stroke-width="0.8"/>`);
      });
      for (const k of st.show) {
        const it = c.items[k], xy = proj(at(it.at, it.pl));
        if (!xy) continue;
        parts.push(`<circle cx="${xy[0]}" cy="${xy[1]}" r="5.5" fill="${col.get(it.cat)}" stroke="#fff" stroke-width="1.5"/><text x="${xy[0] + 8}" y="${xy[1] + 4}" font-size="10.5" font-family="sans-serif" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(it.name.en.slice(0, 40))}</text>`);
      }
    }
    const markers = c.sides.map((s) => `<marker id="arrow-${s.id}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${s.color}"/></marker>`).join('');
    const shown = c.items
      ? [...c.sides.filter((s) => st.control[s.id] != null || st.games?.teams.some((tm) => tm.s === s.id) || (st.moves ?? []).some((m) => m.side === s.id)), ...c.cats.filter((k) => st.show.some((x) => c.items[x].cat === k.id))]
      : c.sides.filter((s) => st.control[s.id] != null || (st.moves ?? []).some((m) => m.side === s.id));
    const legend = shown.map((s, k) => `<rect x="${12 + (k % 3) * 205}" y="${H - 44 + Math.floor(k / 3) * 18}" width="12" height="12" fill="${s.color}"/><text x="${28 + (k % 3) * 205}" y="${H - 34 + Math.floor(k / 3) * 18}" font-size="12" font-family="sans-serif">${esc(s.name.en.slice(0, 30))}</text>`).join('');
    const map = ma != null ? `<text x="12" y="40" font-size="11.5" font-family="sans-serif" fill="#555">${esc(`continents of ${ma} million years ago (Merdith et al. 2021)`)}</text>`
      : st.deep ? `<text x="12" y="40" font-size="11.5" font-family="sans-serif" fill="#555">today's land: older than the plate model (1000 million years)</text>` : '';
    const title = `<text x="12" y="22" font-size="15" font-weight="bold" font-family="sans-serif">${esc(`${i + 1}/${c.steps.length} · ${fmtDate(st.date)} · ${st.title.en}`)}</text>${map}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${markers}</defs>${parts.join('')}${title}${legend}</svg>`;
    jobs.push(sharp(Buffer.from(svg)).png().toFile(path.join(dir, `${c.id}-${String(i + 1).padStart(2, '0')}.png`)));
  });
  await Promise.all(jobs);
}

/** What the picker needs before a story is opened (not wars): its most common categories too. */
function storyEntry(m) {
  const sides = m.sides.filter((s) => m.steps.some((st) => !st.aftermath && (st.control[s.id] != null || st.games?.teams.some((tm) => tm.s === s.id))));
  const count = new Map();
  for (const it of m.items) count.set(it.cat, (count.get(it.cat) ?? 0) + 1);
  return {
    id: m.id, name: m.name, icon: m.icon, era: m.era, region: m.region, summary: m.summary, start: m.start, end: m.end,
    t0: m.t0, t1: m.t1, steps: m.steps.length, items: m.items.length, sides: sides.map((s) => ({ name: s.name, color: s.color })),
    cats: [...count].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id),
  };
}

/** Every marker of a collection, for browsing and quizzes: where each first appears in a story. */
function collectionItems(results) {
  const out = [];
  const seen = new Map();
  for (const r of [...results].sort((a, b) => a.meta.t0 - b.meta.t0)) {
    const m = r.meta;
    m.items.forEach((it) => {
      let step = it.first;
      if (step < 0) { step = m.steps.findIndex((st) => st.t >= it.t); if (step < 0) step = m.steps.length - 1; }
      if (it.id != null && seen.has(it.id)) return;
      const { first: _f, details: _d, facts: _x, ...rest } = it;
      const k = out.push({ ...rest, story: m.id, step }) - 1;
      if (it.id != null) seen.set(it.id, k);
    });
  }
  return out;
}

/** Warns when two items of a collection have the same name: the same thing told by two stories
 * should share one id (or, for a catalogue item, be shown with `show`), so it is listed once. */
function repeatedNames(kind, items) {
  const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const by = new Map();
  for (const it of items) { const k = norm(it.name.en); by.set(k, [...(by.get(k) ?? []), it]); }
  for (const list of by.values()) {
    if (list.length > 1) console.warn(`  warn ${kind}: "${list[0].name.en}" is listed ${list.length} times (${list.map((it) => it.story).join(', ')}); give them one id`);
  }
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

/** A collection's picker list (and, but for wars, its name and categories). */
function indexOf(kind, coll, metas) {
  metas = [...metas].sort((a, b) => a.t0 - b.t0);
  if (kind === 'wars') return { conflicts: metas.map(indexEntry) };
  return { name: coll.name, categories: [...coll.cats.values()], stories: metas.map(storyEntry) };
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes('--list')) { listing(argv.slice(argv.indexOf('--list') + 1)); return; }
  if (argv.includes('--find')) { find(get('--find')); return; }
  const only = get('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
  const check = argv.includes('--check');
  const kinds = get('--kind') ? get('--kind').split(',') : Object.keys(KINDS);
  for (const k of kinds) if (!KINDS[k]) throw new Error(`--kind is one of ${Object.keys(KINDS).join(', ')}`);
  const same = (f, v) => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === JSON.stringify(v);
  const found = new Set();
  let failed = 0;
  for (const kind of kinds) {
    const SRC = srcDir(kind), OUT = outDir(kind);
    if (!fs.existsSync(SRC)) continue;
    const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json') && !f.startsWith('_') && (!only || only.includes(path.basename(f, '.json')))).map((f) => path.join(SRC, f));
    if (only && !files.length) continue;
    let coll = null;
    try { coll = loadCollection(kind); } catch (e) { failed++; console.error(`FAIL ${e.message}`); continue; }
    const results = [];
    let kindFailed = 0;
    for (const file of files) {
      found.add(path.basename(file, '.json'));
      try {
        const r = await build(file, { kind, coll, write: !check, preview: get('--preview'), stale: check && !only, lint: argv.includes('--lint') });
        results.push(r);
        const m = r.meta;
        console.log(`ok   ${kind === 'wars' ? '' : `${kind}/`}${m.id}: ${m.steps.length} steps, ${r.areas} areas${m.items ? `, ${m.items.length} items` : ''}, ${(r.size / 1024).toFixed(0)} KB`);
      } catch (e) {
        kindFailed++;
        console.error(`FAIL ${KINDS[kind]}/${path.basename(file)}: ${e.message}`);
      }
    }
    failed += kindFailed;
    if (kindFailed) continue;
    if (!only && !results.length) continue; // a collection with no stories yet publishes nothing
    if (!only) {
      const index = indexOf(kind, coll, results.map((r) => r.meta));
      const items = kind === 'wars' ? null : { items: collectionItems(results) };
      if (items) repeatedNames(kind, items.items);
      if (check) {
        // CI: the picker's list (and the collection's items) must match the sources too.
        if (!same(path.join(OUT, 'index.json'), index) || (items && !same(path.join(OUT, 'items.json'), items))) {
          failed++;
          console.error(`FAIL public/data/${KINDS[kind]}/index.json${items ? ' or items.json' : ''} is out of date; run npm run data:stories`);
        }
      } else {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
        if (items) fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items));
        // Drop outputs whose source is gone.
        const keep = new Set(results.flatMap((r) => [`${r.meta.id}.json`, `${r.meta.id}-areas.json`]).concat('index.json', 'items.json'));
        for (const f of fs.readdirSync(OUT)) if (!keep.has(f)) fs.unlinkSync(path.join(OUT, f));
        console.log(`index: ${results.length} ${kind === 'wars' ? 'conflicts' : `stories in ${KINDS[kind]}`}`);
      }
    } else if (!check && results.length) {
      // Partial build: refresh these entries in the existing index, and the collection's items.
      const metas = new Map();
      const f = path.join(OUT, 'index.json');
      if (fs.existsSync(f)) {
        const idx = readJSON(f);
        for (const e of idx.conflicts ?? idx.stories ?? []) {
          const pf = path.join(OUT, `${e.id}.json`);
          if (fs.existsSync(pf)) metas.set(e.id, readJSON(pf));
        }
      }
      for (const r of results) metas.set(r.meta.id, r.meta);
      fs.writeFileSync(f, JSON.stringify(indexOf(kind, coll, metas.values())));
      if (kind !== 'wars') fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify({ items: collectionItems([...metas.values()].map((meta) => ({ meta }))) }));
    }
  }
  if (only) for (const id of only) if (!found.has(id)) { failed++; console.error(`FAIL no story "${id}" in ${kinds.map((k) => `scripts/data/${KINDS[k]}`).join(', ')}`); }
  if (failed) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
