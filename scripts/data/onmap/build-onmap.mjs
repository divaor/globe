// Put it on the map (v0.36.0): the places a puzzle can ask about, by country, with their names in English and
// Spanish, and the shapes of the ones that are lines or areas. Eight kinds:
//  - rivers (Natural Earth 10m centrelines, joined by name; Spanish names from Wikidata, CC0, through QLever);
//  - lakes, mountain ranges and deserts (Natural Earth 10m, public domain, with their Spanish names);
//  - peaks and volcanoes (Natural Earth's peaks, and the Smithsonian's volcanoes already in the app);
//  - cities (Natural Earth's populated places, already in the app);
//  - heritage and buildings (the cultural World Heritage sites and the notable buildings already in the app);
//  - national parks (already in the app; there are no clean forest shapes in the open data).
// Each place has a fame (length, area, height, people, readers) so a puzzle asks the well-known ones and shows the
// others as the grey candidates. A river, lake, range or desert that crosses several countries is in each of them,
// with a point inside each one (to measure how far off a guess is there).
// Writes public/data/onmap/places.json and shapes.json; --check compares them with what it would write.
// Usage: node scripts/data/onmap/build-onmap.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import mapshaper from 'mapshaper';
import { ask, askFor, val, qidOf, point } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { feature } = require('topojson-client');
const { geoContains, geoDistance, geoLength, geoArea } = require('d3-geo');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const NE = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/ne', `${n}.geojson`), 'utf8'));
const CACHE = path.join(ROOT, '.cache/onmap');
const OUT = path.join(ROOT, 'public/data/onmap');
const CHECK = process.argv.includes('--check');
const KM = 6371;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** At most this many of a kind in a country, the best known first (the rest would only crowd the map). */
const CAP = 16;

// ---- Countries: which one a point is in.
const meta = J('public/data/base/countries-meta.json');
const topo = J('public/data/base/countries-50m.json');
const shapes = feature(topo, topo.objects.countries).features.filter((f) => f.geometry && meta[f.id]).map((f) => {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => (typeof c[0] === 'number' ? ((w = Math.min(w, c[0])), (e = Math.max(e, c[0])), (s = Math.min(s, c[1])), (n = Math.max(n, c[1]))) : c.forEach(walk));
  walk(f.geometry.coordinates);
  return { f, id: f.id, b: [w, s, e, n] };
});
const countryAt = (lon, lat) => {
  for (const x of shapes) {
    if (lon < x.b[0] || lon > x.b[2] || lat < x.b[1] || lat > x.b[3]) continue;
    if (geoContains(x.f, [lon, lat])) return x.id;
  }
  return null;
};
/** The country of a point on a coast or a border: the one it is in, else the nearest within ~15 km. */
const countryNear = (lon, lat) => {
  const id = countryAt(lon, lat);
  if (id) return id;
  for (const d of [0.05, 0.1, 0.15]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const c = countryAt(lon + dx * d, lat + dy * d);
    if (c) return c;
  }
  return null;
};

// ---- Shapes: rivers joined by name, lakes, ranges and deserts, simplified.
async function simplify(name, fc, pct) {
  const out = await mapshaper.applyCommands(`-i in.json -simplify ${pct}% keep-shapes -o out.json format=geojson`, { 'in.json': fc });
  return JSON.parse(out['out.json']);
}
const lineKm = (g) => geoLength(g) * KM;
/**
 * d3 takes an area's outer ring clockwise; a ring the other way round is the rest of the globe. Each polygon is
 * turned the right way (its area under half the globe), so areas and "is this point in it" are right.
 */
function rewind(g) {
  const fix = (poly) => (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI ? poly.map((r) => r.slice().reverse()) : poly);
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: fix(g.coordinates) };
  if (g.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: g.coordinates.map(fix) };
  return g;
}
const areaKm2 = (g) => geoArea(g) * KM * KM;

/** Every vertex of a geometry (to find the countries it crosses), in order. */
const vertices = (g) => {
  const out = [];
  const walk = (c) => (typeof c[0] === 'number' ? out.push(c) : c.forEach(walk));
  walk(g.coordinates);
  return out;
};
/**
 * The countries a shape is in, and a point in each: the middle of its vertices there (a line), or their mean (an
 * area). A country with only a vertex or two of it is left out, unless the shape is small enough to sit in one.
 */
function countriesOf(g, line) {
  let pts = vertices(g);
  if (!line && pts.length < 40) {
    // A small area: a few points inside it as well, so a lake in one country is found from inside.
    const [w, s, e, n] = pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [180, 90, -180, -90]);
    for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) { const p = [w + ((e - w) * i) / 4, s + ((n - s) * j) / 4]; if (geoContains({ type: 'Feature', geometry: g }, p)) pts.push(p); }
  }
  const by = new Map();
  for (const p of pts) { const c = countryNear(p[0], p[1]); if (!c) continue; if (!by.has(c)) by.set(c, []); by.get(c).push(p); }
  const min = Math.min(3, Math.max(1, Math.floor(pts.length / 4)));
  const out = [];
  for (const [c, ps] of by) {
    if (ps.length < min) continue;
    const at = line ? ps[Math.floor(ps.length / 2)] : [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
    out.push([c, r3(at[0]), r3(at[1]), ps.length]);
  }
  return out.sort((a, b) => b[3] - a[3]).map((x) => x.slice(0, 3));
}

// ---- Spanish names for the rivers (Wikidata through QLever).
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\(.*?\)/g, '').replace(/\b(river|rio|rivière|riviere|fleuve|fluss|reka|nehri|he|jiang|darya|gol)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
async function riverNames() {
  const rows = await ask(CACHE, 'rivers', `SELECT ?r ?en ?es ?c ?sl WHERE {
  ?r wdt:P31 wd:Q4022 . ?r wikibase:sitelinks ?sl . FILTER(?sl >= 5)
  ?r rdfs:label ?en . FILTER(LANG(?en) = "en")
  OPTIONAL { ?r rdfs:label ?es . FILTER(LANG(?es) = "es") }
  OPTIONAL { ?r wdt:P625 ?c }
}`);
  const alts = await ask(CACHE, 'rivers-alt', `SELECT ?r ?alt WHERE {
  ?r wdt:P31 wd:Q4022 . ?r wikibase:sitelinks ?sl . FILTER(?sl >= 5)
  ?r <http://www.w3.org/2004/02/skos/core#altLabel> ?alt . FILTER(LANG(?alt) = "en" || LANG(?alt) = "es")
}`);
  const byQ = new Map();
  for (const b of rows) {
    const q = qidOf(val(b, 'r'));
    if (!q) continue;
    const r = byQ.get(q) ?? { q, en: val(b, 'en'), es: val(b, 'es') ?? null, sl: Number(val(b, 'sl')), at: [], keys: new Set() };
    const c = point(val(b, 'c'));
    if (c) r.at.push(c);
    byQ.set(q, r);
  }
  for (const b of alts) { const r = byQ.get(qidOf(val(b, 'r'))); if (r) r.keys.add(norm(val(b, 'alt'))); }
  const byKey = new Map();
  for (const r of byQ.values()) {
    r.keys.add(norm(r.en));
    if (r.es) r.keys.add(norm(r.es));
    for (const k of r.keys) { if (!k) continue; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); }
  }
  return byKey;
}
/** The Wikidata river for a Natural Earth one: the same name, its point nearest the river (within 600 km). */
function matchRiver(byKey, names, g) {
  const pts = vertices(g).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 40)) === 0);
  let best = null, bd = 600 / KM;
  for (const n of names) for (const r of byKey.get(norm(n)) ?? []) {
    for (const c of r.at.length ? r.at : []) for (const p of pts) {
      const d = geoDistance(c, p);
      if (d < bd || (best && d === bd && r.sl > best.sl)) { bd = d; best = r; }
    }
  }
  return best;
}
const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** A name without its disambiguation ("Río Verde (Mato Grosso do Sul)" → "Río Verde"). */
const plain = (s) => (s ? String(s).replace(/\s*\([^)]*\)\s*$/, '').trim() : s);
/** The English and Spanish labels of Wikidata items (Natural Earth gives the ids of its lakes, regions and peaks). */
async function labels(qids) {
  const out = new Map();
  const rows = await askFor(CACHE, `labels-${qids.length}`, 's', qids, '?s ?l', `?s rdfs:label ?l . FILTER(LANG(?l) = "en" || LANG(?l) = "es")`);
  for (const r of rows) { const q = qidOf(val(r, 's')); if (!q || !r.l) continue; const o = out.get(q) ?? {}; o[r.l['xml:lang']] = plain(r.l.value); out.set(q, o); }
  return out;
}
/** "Toluca, Nevado de", "Fournaise, Piton de la" (the volcano lists' way) → "Nevado de Toluca", "Piton de la Fournaise". */
const unflip = (n) => { const m = /^([^,]+), ([^,]+)$/.exec(n); return m && m[2].split(' ').length <= 3 ? `${m[2]} ${m[1]}` : n; };
/** Names the sources have wrong, by their English name. */
const FIX = {
  'Chihuahuan Desert': [null, 'Desierto de Chihuahua'], 'Ordos Desert': [null, 'Desierto de Ordos'], Rhin: ['Rhine', 'Rin'],
};

// ---- Build.
const places = []; // [kind, en, es, lon, lat, fame, shape]
const byCountry = {}; // ISO → [[place, lon, lat] | [place]]
/**
 * A country's home: the bounding box of its pieces near its biggest one (within two and a half times that piece's
 * size, and 300 km), so Corsica is in France, and Réunion and French Guiana are not.
 */
const homes = new Map();
function home(c, p) {
  if (!homes.has(c)) {
    const f = shapes.find((x) => x.id === c)?.f;
    if (!f) { homes.set(c, null); } else {
      const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) => {
        const pts = poly[0];
        let w = 180, s = 90, e = -180, n = -90;
        for (const q of pts) { w = Math.min(w, q[0]); e = Math.max(e, q[0]); s = Math.min(s, q[1]); n = Math.max(n, q[1]); }
        return { b: [w, s, e, n], mid: [(w + e) / 2, (s + n) / 2], a: Math.abs(geoArea({ type: 'Polygon', coordinates: poly })) };
      });
      const big = polys.reduce((a, b) => (b.a > a.a ? b : a));
      const size = geoDistance([big.b[0], big.b[1]], [big.b[2], big.b[3]]) / 2;
      const near = polys.filter((x) => geoDistance(x.mid, big.mid) <= size * 2.5 + 300 / KM);
      const b = near.reduce((a, x) => [Math.min(a[0], x.b[0]), Math.min(a[1], x.b[1]), Math.max(a[2], x.b[2]), Math.max(a[3], x.b[3])], [180, 90, -180, -90]);
      homes.set(c, [b[0] - 0.5, b[1] - 0.5, b[2] + 0.5, b[3] + 0.5]);
    }
  }
  const b = homes.get(c);
  return !b || (b[2] - b[0] > 300) || (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]);
}
const add = (k, en, es, at, fame, cs, shape = -1) => {
  const i = places.length;
  const fx = FIX[en];
  if (fx) { es = fx[1] ?? es; en = fx[0] ?? en; }
  en = capFirst(plain(en)); es = es ? capFirst(plain(es)) : null;
  // A country's own places only: not its lands across the oceans (Réunion is not a place in France's puzzle).
  cs = cs.filter((c) => home(c[0], c.length > 1 ? [c[1], c[2]] : at));
  if (!cs.length) return;
  if (cs[0].length > 1) at = [cs[0][1], cs[0][2]];
  places.push([k, en, es && es !== en ? es : 0, r2(at[0]), r2(at[1]), Math.round(fame), shape]);
  for (const c of cs) { (byCountry[c[0]] ??= []).push(c.length > 1 ? [i, r2(c[1]), r2(c[2])] : [i]); }
};
const shapeFeatures = []; // for shapes.json: { type: 'Feature', id, geometry }

async function main() {
  // Rivers.
  const riv = NE('ne_10m_rivers_lake_centerlines');
  const byName = new Map();
  for (const f of riv.features) {
    const p = f.properties;
    if (p.featurecla !== 'River' || !f.geometry) continue;
    const en = str(p.name_en) || str(p.name);
    if (!en || /canal|branch|delta|channel|distributary|protoka/i.test(en)) continue;
    const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const l of lines) { if (!byName.has(en)) byName.set(en, []); byName.get(en).push({ l, names: [p.name, p.name_alt].filter(str) }); }
  }
  // The pieces of a name that touch (ends within ~40 km of each other) are one river.
  const groups = [];
  for (const [en, segs] of byName) {
    const parent = segs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const ends = segs.map((s) => [s.l[0], s.l[s.l.length - 1]]);
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      if (find(i) === find(j)) continue;
      if (ends[i].some((a) => ends[j].some((b) => Math.abs(a[0] - b[0]) < 0.4 && Math.abs(a[1] - b[1]) < 0.4))) parent[find(i)] = find(j);
    }
    const by = new Map();
    for (let i = 0; i < segs.length; i++) { const r = find(i); if (!by.has(r)) by.set(r, { en, names: new Set([en]), lines: [] }); const g = by.get(r); g.lines.push(segs[i].l); segs[i].names.forEach((n) => g.names.add(n)); }
    groups.push(...by.values());
  }
  const rivFC = { type: 'FeatureCollection', features: groups.map((g, i) => ({ type: 'Feature', properties: { i }, geometry: { type: 'MultiLineString', coordinates: g.lines } })) };
  const rivS = await simplify('rivers', rivFC, 8);
  const names = await riverNames();
  let matched = 0;
  const gl = groups;
  for (const f of rivS.features) {
    const g = gl[f.properties.i];
    const km = lineKm(f.geometry);
    if (km < 35) continue;
    const cs = countriesOf(f.geometry, true);
    if (!cs.length) continue;
    const w = matchRiver(names, [...g.names], f.geometry);
    let en = g.en, es = null;
    if (w) { matched++; en = w.en; es = w.es; }
    // The English and Spanish names, as people say them: "Amazon River", "Río Amazonas".
    if (!es) es = /^(r[ií]o|lago|arroyo)\b/i.test(g.en) ? g.en : `río ${g.en}`;
    if (w && plain(w.en) === plain(w.es)) es = /^r[ií]o\b/i.test(w.es) ? w.es : `río ${w.es}`;
    shapeFeatures.push({ type: 'Feature', id: `r${shapeFeatures.length}`, geometry: f.geometry });
    add('river', capFirst(en), capFirst(es), cs[0].slice(1), km, cs, shapeFeatures.length - 1);
  }
  console.log(`rivers: ${places.filter((p) => p[0] === 'river').length} (${matched} matched in Wikidata)`);

  // Lakes.
  const lakes = NE('ne_10m_lakes');
  const reservoir = (n) => /^(presa|represa|embalse|barragem|barrage|reservoir|vodokhranilishche)\b|reservoir|vodokhranilishche|\bdam$/i.test(n ?? '');
  const lakeFC = { type: 'FeatureCollection', features: lakes.features.filter((f) => str(f.properties.name) && f.properties.featurecla !== 'Reservoir' && !reservoir(f.properties.name) && !reservoir(f.properties.name_en) && f.geometry).map((f) => ({ type: 'Feature', properties: { n: str(f.properties.name_en) || str(f.properties.name), es: str(f.properties.name_es), q: str(f.properties.wikidataid) }, geometry: f.geometry })) };
  const lakeS = await simplify('lakes', lakeFC, 15);
  const regs = NE('ne_10m_geography_regions_polys');
  const peakFC = NE('ne_10m_geography_regions_elevation_points');
  const lab = await labels([...lakeFC.features.map((f) => f.properties.q), ...regs.features.map((f) => str(f.properties.WIKIDATAID)), ...peakFC.features.map((f) => str(f.properties.wikidataid))].filter(Boolean));
  /** Wikidata's names first (Natural Earth's Spanish ones have slips: "TIERRAS ALTAS DE GUINEA"). */
  const named = (q, en, es) => { const w = q && lab.get(q); return [w?.en || en, w?.es || es]; };
  const lakeBy = new Map();
  for (const f0 of lakeS.features) {
    const f = { ...f0, geometry: rewind(f0.geometry) };
    if (reservoir(lab.get(f.properties.q)?.en) || reservoir(lab.get(f.properties.q)?.es)) continue;
    const a = areaKm2(f.geometry);
    if (a < 12) continue;
    const prev = lakeBy.get(f.properties.n);
    if (prev && prev.a >= a) continue; // a lake in several pieces: the biggest
    lakeBy.set(f.properties.n, { f, a });
  }
  for (const { f, a } of lakeBy.values()) {
    const cs = countriesOf(f.geometry, false);
    if (!cs.length) continue;
    shapeFeatures.push({ type: 'Feature', id: `l${shapeFeatures.length}`, geometry: f.geometry });
    const [en, es] = named(f.properties.q, f.properties.n, f.properties.es);
    add('lake', en, es, cs[0].slice(1), a, cs, shapeFeatures.length - 1);
  }

  // Ranges and deserts.
  const areaFC = { type: 'FeatureCollection', features: regs.features.filter((f) => ['Range/mtn', 'Desert'].includes(f.properties.FEATURECLA) && f.geometry).map((f) => ({ type: 'Feature', properties: { n: str(f.properties.NAME_EN) || str(f.properties.NAME), es: str(f.properties.NAME_ES), q: str(f.properties.WIKIDATAID), k: f.properties.FEATURECLA === 'Desert' ? 'desert' : 'range', sr: f.properties.SCALERANK }, geometry: f.geometry })) };
  const areaS = await simplify('areas', areaFC, 20);
  for (const f0 of areaS.features) {
    const f = { ...f0, geometry: rewind(f0.geometry) };
    if (!f.properties.n) continue;
    const cs = countriesOf(f.geometry, false);
    if (!cs.length) continue;
    shapeFeatures.push({ type: 'Feature', id: `a${shapeFeatures.length}`, geometry: f.geometry });
    // Fame: its rank first (Natural Earth's own), then its size.
    const [en, es] = named(f.properties.q, f.properties.n, f.properties.es);
    add(f.properties.k, en, es, cs[0].slice(1), (10 - (f.properties.sr ?? 9)) * 1e6 + Math.min(999999, areaKm2(f.geometry)), cs, shapeFeatures.length - 1);
  }

  // Peaks, and volcanoes not already a peak.
  const peakPts = [];
  for (const f of peakFC.features) {
    const p = f.properties, [lon, lat] = f.geometry.coordinates;
    if (p.featurecla !== 'mountain' || !p.elevation || !(str(p.name_en) || str(p.name))) continue;
    const c = countryNear(lon, lat);
    if (!c) continue;
    peakPts.push([lon, lat]);
    const [en, es] = named(str(p.wikidataid), str(p.name_en) || str(p.name), str(p.name_es));
    add('peak', en, es, [lon, lat], p.elevation, [[c]]);
  }
  const vol = J('public/data/earth/volcanoes.json').volcanoes.filter((v) => v.e >= 400 && /strato|shield|caldera|complex|compound|volcano/i.test(v.t));
  for (const v of vol) {
    if (peakPts.some((p) => geoDistance(p, [v.lon, v.lat]) < 15 / KM)) continue;
    const c = countryNear(v.lon, v.lat);
    if (!c) continue;
    add('peak', unflip(v.n), null, [v.lon, v.lat], v.e * 0.9, [[c]]); // a peak of the same height is better known
  }

  // Cities: the biggest, a capital first.
  const cities = J('public/data/base/cities.json');
  const fi = Object.fromEntries(cities.fields.map((k, i) => [k, i]));
  for (const r of cities.rows) {
    const c = r[fi.country];
    if (!meta[c] || !r[fi.pop]) continue;
    add('city', r[fi.name], r[fi.name_es] || null, [r[fi.lon], r[fi.lat]], r[fi.pop] * (r[fi.capital] === 1 ? 3 : 1), [[c]]);
  }

  // Heritage (cultural sites) and buildings.
  const builtPts = [];
  const cityNames = new Set(cities.rows.flatMap((r) => [String(r[fi.name]).toLowerCase(), String(r[fi.name_es] || '').toLowerCase()]));
  const isCity = (n) => cityNames.has(String(plain(n)).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) || cityNames.has(String(plain(n)).toLowerCase());
  for (const s of J('public/data/layers/heritage.json').sites) {
    if (s.c !== 'c' || s.x || s.merged || !s.at || !s.cc?.[0]) continue;
    if (!meta[s.cc[0]]) continue;
    const [en, es] = s.w?.[0] ? [s.w[0], s.w[1] || null] : s.n;
    if (isCity(en)) continue;
    builtPts.push(s.at);
    add('built', en, es, s.at, (s.pop ?? 0) * 1.3, [[s.cc[0]]]);
  }
  const arch = J('public/data/artguide/architecture.json');
  for (const b of arch.buildings) {
    const [, n, nes, lon, lat, , , , , , wikis] = b;
    if (wikis < 7 || isCity(n)) continue;
    if (builtPts.some((p) => geoDistance(p, [lon, lat]) < 1.5 / KM)) continue;
    const c = countryNear(lon, lat);
    if (!c) continue;
    builtPts.push([lon, lat]);
    add('built', n, nes || null, [lon, lat], wikis * 0.6, [[c]]); // a heritage site of as many readers is better known
  }

  // National parks.
  for (const p of J('public/data/wild/parks.json').parks) {
    if (p.k !== 'np' || !p.cc || !meta[p.cc]) continue;
    add('park', p.n[0], p.n[1] || null, p.at, p.sl, [[p.cc]]);
  }

  // Each country keeps its best-known CAP of each kind (and every shape used by one).
  const keep = new Set();
  for (const [c, list] of Object.entries(byCountry)) {
    const byKind = new Map();
    for (const e of list) { const k = places[e[0]][0]; if (!byKind.has(k)) byKind.set(k, []); byKind.get(k).push(e); }
    const out = [];
    for (const l of byKind.values()) out.push(...l.sort((a, b) => places[b[0]][5] - places[a[0]][5]).slice(0, CAP));
    byCountry[c] = out;
    for (const e of out) keep.add(e[0]);
  }
  // Renumber: only the places some country keeps, and only their shapes.
  const order = [...keep].sort((a, b) => a - b);
  const newIdx = new Map(order.map((o, i) => [o, i]));
  const usedShapes = [...new Set(order.map((i) => places[i][6]).filter((s) => s >= 0))].sort((a, b) => a - b);
  const newShape = new Map(usedShapes.map((s, i) => [s, i]));
  const outPlaces = order.map((i) => { const p = places[i].slice(); p[6] = p[6] >= 0 ? newShape.get(p[6]) : -1; return p; });
  const outBy = Object.fromEntries(Object.keys(byCountry).sort().map((c) => [c, byCountry[c].map((e) => [newIdx.get(e[0]), ...e.slice(1)])]));
  const fc = { type: 'FeatureCollection', features: usedShapes.map((s, i) => ({ type: 'Feature', properties: { i }, geometry: shapeFeatures[s].geometry })) };
  const topoOut = await mapshaper.applyCommands('-i in.json name=shapes -o out.json format=topojson quantization=1e5', { 'in.json': fc });
  const placesJson = JSON.stringify({
    about: 'Put it on the map (v0.36.0): places by country. places: [kind, name, nombre (0: as name), lon, lat, fame, shape (index in shapes.json, -1: a point)]; countries: ISO → [place, lon, lat] (a point inside that country for a river, lake, range or desert that crosses several) or [place]. Natural Earth (public domain), Wikidata (CC0), Smithsonian GVP, UNESCO. Built by scripts/data/onmap/build-onmap.mjs.',
    kinds: ['river', 'lake', 'range', 'desert', 'peak', 'city', 'built', 'park'],
    places: outPlaces, countries: outBy,
  });
  const shapesJson = String(topoOut['out.json']);
  const counts = {};
  for (const p of outPlaces) counts[p[0]] = (counts[p[0]] ?? 0) + 1;
  if (CHECK) {
    const a = fs.existsSync(path.join(OUT, 'places.json')) ? fs.readFileSync(path.join(OUT, 'places.json'), 'utf8') : '';
    const b = fs.existsSync(path.join(OUT, 'shapes.json')) ? fs.readFileSync(path.join(OUT, 'shapes.json'), 'utf8') : '';
    if (a !== placesJson || b !== shapesJson) { console.log('public/data/onmap is out of date: run node scripts/data/onmap/build-onmap.mjs'); process.exit(1); }
    console.log('Put it on the map places are up to date');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'places.json'), placesJson);
  fs.writeFileSync(path.join(OUT, 'shapes.json'), shapesJson);
  console.log(`places: ${outPlaces.length} (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}) in ${Object.keys(outBy).length} countries; ${usedShapes.length} shapes; ${(placesJson.length / 1024).toFixed(0)} KB + ${(shapesJson.length / 1024).toFixed(0)} KB`);
}
await main();
