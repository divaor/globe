// The map games' border graph (v0.24.0): which countries share a land border, from the app's own 1:50m country
// map (public/data/base/countries-50m.json), so a route on screen is a route in the game. Two countries are
// neighbours when their outlines share an edge. The few borders made by a country's smaller piece are sorted by
// hand in border-rules.json: an exclave on the same continent counts (Kaliningrad, Nakhchivan, Cabinda...); an
// overseas region on another continent does not by default (French Guiana); tunnels and bridges count (the Channel
// Tunnel, the Øresund Bridge...); ferries do not. Each country also gets what the games score and ask about: its
// population, area and capital, and the groups of the knowledge rounds (Spanish-speaking, driving on the left,
// NATO, the EU, Olympic hosts...), from public/data/attributes/countries.json and the Games of the world data.
//
// The graph is checked against two other lists of neighbours: the country facts' own "borders" (CIA World
// Factbook) and Wikidata's "shares border with" (P47, cached in wikidata-p47.json; --fetch refreshes it).
// Differences are printed for review; the ones reviewed are listed in border-rules.json.
//
// Usage: node scripts/data/play/build-borders.mjs [--fetch] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { feature } = require('topojson-client');
const { geoArea, geoContains, geoDistance } = require('d3-geo');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'public/data/play/borders.json');
const check = process.argv.includes('--check');

const topo = read('public/data/base/countries-50m.json');
const meta = read('public/data/base/countries-meta.json');
const attrs = read('public/data/attributes/countries.json').data;
const cities = read('public/data/base/cities.json');
const rules = JSON.parse(fs.readFileSync(path.join(HERE, 'border-rules.json'), 'utf8'));
const skip = new Set(rules.skip.map((x) => x.id));
const geoms = topo.objects.countries.geometries.filter((g) => !skip.has(g.id));
const ids = geoms.map((g) => g.id);

// ---- Neighbours: outlines that share an arc, and which piece of each country they touch -------------------------
const owners = new Map();
const pieces = new Map();
const features = new Map();
for (const g of geoms) {
  const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
  const f = feature(topo, g);
  features.set(g.id, f);
  const coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [];
  pieces.set(g.id, coords.map((c) => geoArea({ type: 'Polygon', coordinates: c })));
  polys.forEach((poly, pi) => poly.forEach((ring) => ring.forEach((a) => {
    const k = a < 0 ? ~a : a;
    if (!owners.has(k)) owners.set(k, []);
    owners.get(k).push([g.id, pi]);
  })));
}
const mainPiece = (id) => { const a = pieces.get(id); return a.indexOf(Math.max(...a)); };
const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const touch = new Map();
for (const list of owners.values()) for (const [a, pa] of list) for (const [b, pb] of list) {
  if (a >= b) continue;
  const k = key(a, b);
  if (!touch.has(k)) touch.set(k, []);
  touch.get(k).push([pa, pb]);
}

const overseas = new Set(rules.overseas.map((x) => key(x.a, x.b)));
const exclaves = new Map(rules.exclaves.map((x) => [key(x.a, x.b), x.note]));
const land = [], away = [], odd = [];
for (const [k, prs] of touch) {
  const [a, b] = k.split('|');
  const viaMain = prs.some(([pa, pb]) => pa === mainPiece(a) && pb === mainPiece(b));
  if (overseas.has(k)) { away.push([a, b, rules.overseas.find((x) => key(x.a, x.b) === k).note]); continue; }
  if (!viaMain && !exclaves.has(k)) odd.push(k);
  land.push(exclaves.has(k) ? [a, b, exclaves.get(k)] : [a, b]);
}
for (const x of rules.overseas) if (x.manual) { if (touch.has(key(x.a, x.b))) odd.push(`${x.a}|${x.b} (added by hand as overseas, but the map has it)`); else away.push([x.a, x.b, x.note]); }
for (const x of rules.add) { if (touch.has(key(x.a, x.b))) odd.push(`${x.a}|${x.b} (added by hand, but the map has it)`); else land.push([x.a, x.b, x.note]); }
for (const k of overseas) if (!touch.has(k) && !rules.overseas.find((x) => key(x.a, x.b) === k)?.manual) odd.push(`${k} (listed as overseas, but they do not touch)`);
for (const k of exclaves.keys()) if (!touch.has(k)) odd.push(`${k} (listed as an exclave, but they do not touch)`);
const links = rules.links.map((x) => [x.a, x.b, x.note]);
for (const [a, b] of links) for (const id of [a, b]) if (!ids.includes(id)) odd.push(`link ${a}–${b}: ${id} is not on the map`);
if (odd.length) { console.error(`Borders through a country's smaller piece that border-rules.json does not sort:\n  ${odd.join('\n  ')}`); process.exit(1); }

// ---- Each country: population, area, capital, continent, and the groups the knowledge rounds use ---------------
const F = cities.fields, col = (n) => F.indexOf(n);
const capitalOf = (a3) => {
  const rows = cities.rows.filter((r) => r[col('country')] === a3 && r[col('capital')] === 2);
  const named = attrs[a3]?.capital;
  const pick = rows.find((r) => r[col('name')] === named) ?? rows.sort((x, y) => y[col('pop')] - x[col('pop')])[0];
  return pick ? [pick[col('lon')], pick[col('lat')]] : null;
};
const R = 6371;
const countries = {};
for (const id of ids) {
  const m = meta[id] ?? {}, at = attrs[id] ?? {};
  const area = at.area_km2 ?? Math.round(geoArea(features.get(id)) * R * R);
  const cap = capitalOf(id) ?? (m.lx !== undefined ? [m.lx, m.ly] : null);
  countries[id] = { pop: at.population ?? m.pop ?? 0, area, cap: cap && cap.map((v) => Math.round(v * 100) / 100), ct: m.ct ?? '' };
}

// Olympic hosts: the country under each Summer and Winter Games' stadium in the Games of the world data.
const games = read('public/data/games/items.json').items.filter((x) => x.cat === 'summer' || x.cat === 'winter');
const hosts = new Set();
for (const g of games) {
  const t = Number(String(g.date).slice(0, 4));
  if (t > 2026) continue;
  // A stadium on the shore can fall just outside the 1:50m outline (Stockholm 1912, Sochi 2014): its nearest city's.
  const c = ids.find((id) => geoContains(features.get(id), g.at))
    ?? cities.rows.reduce((b, r) => { const d = geoDistance(g.at, [r[col('lon')], r[col('lat')]]); return d < b.d ? { d, c: r[col('country')] } : b; }, { d: Infinity, c: '' }).c;
  if (c) hosts.add(c);
}
const groups = {
  spa: ids.filter((id) => attrs[id]?.languages?.includes('spa')),
  ara: ids.filter((id) => attrs[id]?.languages?.includes('ara')),
  fra: ids.filter((id) => attrs[id]?.languages?.includes('fra')),
  rus: ids.filter((id) => attrs[id]?.languages?.includes('rus')),
  left: ids.filter((id) => attrs[id]?.driving_side === 'left'),
  nato: ids.filter((id) => attrs[id]?.organizations?.includes('nato')),
  eu: ids.filter((id) => attrs[id]?.organizations?.includes('eu')),
  olympics: ids.filter((id) => hosts.has(id)),
};

const out = {
  about: 'Land borders between the countries of the app’s 1:50m map (Natural Earth), with tunnels and bridges; for the map games. Built by scripts/data/play/build-borders.mjs.',
  countries,
  land: land.sort((x, y) => key(x[0], x[1]).localeCompare(key(y[0], y[1]))),
  overseas: away,
  links,
  groups,
  notes: rules.notes,
};

// ---- Checks against the country facts' own lists and Wikidata ---------------------------------------------------
const ours = new Set([...land, ...away].map(([a, b]) => key(a, b)));
const cia = new Set();
for (const id of ids) for (const n of attrs[id]?.borders ?? []) if (ids.includes(n)) cia.add(key(id, n));
const p47file = path.join(HERE, 'wikidata-p47.json');
if (process.argv.includes('--fetch')) {
  const q = 'SELECT ?a ?b WHERE { ?x wdt:P298 ?a; wdt:P47 ?y . ?y wdt:P298 ?b . }';
  const r = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(q)}`, { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'AtlasGlobe-research/1.0 (https://example.org)' } });
  const j = await r.json();
  const pairs = [...new Set(j.results.bindings.map((x) => key(x.a.value, x.b.value)))].sort();
  fs.writeFileSync(p47file, JSON.stringify({ about: 'Wikidata P47 (shares border with) between items with an ISO 3166-1 alpha-3 code (P298). CC0.', fetched: new Date().toISOString().slice(0, 10), pairs }, null, 0));
}
const wd = new Set(fs.existsSync(p47file) ? JSON.parse(fs.readFileSync(p47file, 'utf8')).pairs.filter((k) => k.split('|').every((x) => ids.includes(x))) : []);
const reviewed = new Set(rules.reviewed.map((x) => x.pair));
const name = (k) => k.split('|').map((x) => meta[x]?.n ?? x).join(' – ');
const report = [];
for (const k of ours) if (!cia.has(k) && !wd.has(k) && !reviewed.has(k)) report.push(`only on our map: ${name(k)} (${k})`);
for (const k of new Set([...cia].filter((x) => wd.has(x)))) if (!ours.has(k) && !reviewed.has(k) && !links.some(([a, b]) => key(a, b) === k)) report.push(`in the Factbook and Wikidata, not on our map: ${name(k)} (${k})`);
console.log(`${ids.length} countries; ${land.length} land borders (${land.filter((x) => x[2]).length} through an exclave), ${away.length} overseas, ${links.length} tunnels and bridges`);
console.log(`agree with the Factbook: ${[...ours].filter((k) => cia.has(k)).length}/${ours.size}; with Wikidata: ${[...ours].filter((k) => wd.has(k)).length}/${ours.size} (${wd.size} Wikidata pairs on the map)`);
console.log(`Olympic hosts: ${groups.olympics.length} (${groups.olympics.join(' ')})`);
if (report.length) { console.log(`\nNot yet reviewed (add to border-rules.json "reviewed" once checked):\n  ${report.join('\n  ')}`); if (check) process.exit(1); }

const json = JSON.stringify(out);
if (check) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== json) { console.error('public/data/play/borders.json is out of date: run node scripts/data/play/build-borders.mjs'); process.exit(1); }
  console.log('borders.json is up to date');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${(json.length / 1024).toFixed(1)} KB)`);
}
