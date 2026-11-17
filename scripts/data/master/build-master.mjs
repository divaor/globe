// Master the world (v0.34.0): the decks. For the 193 members of the United Nations, Vatican City and Palestine:
//   - the capital and the three largest other cities, far enough apart to be told apart on the map (GeoNames,
//     CC BY 4.0, places of 15,000 people or more; fewer for the smallest countries), their English and Spanish
//     names from Wikidata (CC0), and the capitals that need a decision (curated/capitals.json);
//   - how well known each country is (population, the size of its economy, how many Wikipedias have an article
//     about it): the order new countries are met in;
//   - its neighbours (the land borders of scripts/data/play/build-borders.mjs; for islands, the nearest countries);
//   - flags that look alike (from the flags drawn small and compared) and how to tell them apart (curated/flags.json).
// Writes public/data/master/deck.json.
//   node scripts/data/master/build-master.mjs          (--check: only check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countries, namesByGeonames } from './fetch-master.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/master');
const OUT = path.join(ROOT, 'public/data/master');
const check = process.argv.includes('--check');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const meta = read(path.join(ROOT, 'public/data/base/countries-meta.json'));
const borders = read(path.join(ROOT, 'public/data/play/borders.json'));
const cur = read(path.join(HERE, 'curated/capitals.json'));
const problems = [];

const km = (a, b) => { const r = Math.PI / 180, x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r), y = (b[1] - a[1]) * r; return Math.hypot(x, y) * 6371; };
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---- Natural Earth's populated places (CC0: metro populations, English and Spanish names, the capitals; the same
// places as the map's own), and GeoNames' (for the smallest countries, which Natural Earth gives few places)
const ne = JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/ne/ne_10m_populated_places.geojson'), 'utf8')).features.map((f) => {
  const p = f.properties;
  return { ne: true, id: p.GEONAMESID > 0 ? Number(p.GEONAMESID) : -p.NE_ID, name: p.NAME_EN || p.NAME, es: p.NAME_ES || p.NAME_EN || p.NAME, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], pop: p.POP_MAX, rank: p.SCALERANK, cla: p.FEATURECLA, a3: p.ADM0_A3, a2: p.ISO_A2 };
});
// A country's own places (not its overseas ones: Cayenne is in France's list, but French Guiana's).
const neOf = (id, a2) => ne.filter((p) => (p.a3 === id || p.a2 === a2) && (!/^[A-Z]{2}$/.test(p.a2 ?? '') || p.a2 === a2));
const FEATURES = new Set(['PPLC', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPL', 'PPLG']);
const NOT_A_TOWN = /school|hospital|university|airport|camp\b/i;
const byId = new Map(), byCountry = new Map();
for (const line of fs.readFileSync(path.join(ROOT, '.cache/geonames/cities500.txt'), 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 15) continue;
  const p = { id: Number(f[0]), name: f[1], lat: Number(f[4]), lon: Number(f[5]), code: f[7], cc: f[8], pop: Number(f[14]) };
  byId.set(p.id, p);
  if (!FEATURES.has(p.code)) continue;
  (byCountry.get(p.cc) ?? byCountry.set(p.cc, []).get(p.cc)).push(p);
}
const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const alike = (a, b) => { const x = fold(a), y = fold(b); return x === y || x.startsWith(y.slice(0, 5)) || y.startsWith(x.slice(0, 5)) || x.includes(y) || y.includes(x); };
/** The Natural Earth place for a GeoNames place: the same id, or one close by with a like name. */
const neFor = (g, list) => list.find((p) => p.id === g.id) ?? list.find((p) => km([p.lon, p.lat], [g.lon, g.lat]) < 15 && alike(p.name, g.name));

// ---- The countries and their capitals
const members = cur.members.split(/\s+/);
// The territories a setting adds (Kosovo, Taiwan, Western Sahara, the dependencies people know best).
const territories = (cur.territories ?? '').split(/\s+/).filter(Boolean);
const wd = await countries();
const deck = [];
for (const id of [...members, ...territories]) {
  const terr = territories.includes(id);
  const m = meta[id];
  if (!m) { problems.push(`${id}: not on the map`); continue; }
  const c = cur.capitals[id] ?? {};
  const places = neOf(id, m.a2);
  let cap = null;
  if (c.cap) { const g = byId.get(c.cap); cap = g ? (neFor(g, places) ?? g) : null; }
  else {
    const caps = places.filter((p) => p.cla === 'Admin-0 capital');
    if (caps.length > 1) problems.push(`${id}: ${caps.length} capitals in Natural Earth (${caps.map((p) => p.name).join(', ')}): decide in curated/capitals.json`);
    cap = caps[0] ?? null;
    if (!cap) { const g = (byCountry.get(m.a2) ?? []).filter((p) => p.code === 'PPLC').sort((a, b) => b.pop - a.pop)[0]; cap = g ? (neFor(g, places) ?? g) : null; }
  }
  if (!cap && c.skip !== 'capitals') { problems.push(`${id}: no capital`); continue; }
  const wdNames = wd.filter((r) => r.iso3.value === id && r.capLabel).map((r) => r.capLabel.value);
  if (cap && !c.cap && wdNames.length && !wdNames.some((n) => alike(n, cap.name))) console.log(`check ${id}: ${cap.name}; Wikidata ${wdNames.join(' / ')}`);
  const seats = (c.seats ?? []).map((s) => byId.get(s)).filter(Boolean);
  const area = borders.countries[id]?.area ?? 1000;
  deck.push({ id, m, c, cap, seats, area, places, terr });
}

// ---- Three other cities: the largest (by their metro areas), far enough from the capital and from each other;
// for the smallest countries, GeoNames' towns.
for (const d of deck) {
  if (!d.cap) { d.cities = []; continue; }
  const isSeat = (p) => d.seats.some((s) => s.id === p.id || (km([s.lon, s.lat], [p.lon, p.lat]) < 12 && alike(s.name, p.name)));
  const isCap = (p) => p.id === d.cap.id || (km([d.cap.lon, d.cap.lat], [p.lon, p.lat]) < 5 && alike(d.cap.name, p.name));
  // The best-known first (Natural Earth's rank: Hamburg and Munich before Mannheim), then the most people.
  const neList = d.places.filter((p) => !isCap(p) && !isSeat(p)).sort((a, b) => a.rank - b.rank || b.pop - a.pop);
  const gnList = (byCountry.get(d.m.a2) ?? []).filter((p) => !isCap(p) && !isSeat(p) && !NOT_A_TOWN.test(p.name)).sort((a, b) => b.pop - a.pop);
  const minPop = d.area < 100 ? 200 : d.area < 5000 ? 500 : d.area < 50000 ? 5000 : 15000;
  // Not the far islands (Ponta Delgada for Portugal, Honolulu for the United States): the country as the map shows it.
  const reach = Math.max(600, 2.5 * Math.sqrt(d.area));
  const base = Math.min(250, Math.max(1.2, 0.08 * Math.sqrt(d.area)));
  const capAt = [d.cap.lon, d.cap.lat];
  let picked = [];
  for (const [pool, f, least] of [[neList, 1, minPop], [neList, 0.5, minPop], [neList, 0.25, minPop], [gnList, 0.5, minPop], [gnList, 0.25, Math.min(minPop, 2000)], [gnList, 0.2, Math.min(minPop, 500)]]) {
    const minD = base * f;
    for (const p of pool) {
      if (picked.length === 3) break;
      if (p.pop < least) continue;
      const at = [p.lon, p.lat];
      if (km(at, capAt) < minD * 0.5 || km(at, capAt) > reach) continue;
      if (d.seats.some((s) => km(at, [s.lon, s.lat]) < minD * 0.5)) continue;
      if (picked.some((q) => km(at, [q.lon, q.lat]) < minD || alike(q.name, p.name))) continue;
      picked.push(p);
    }
    if (picked.length === 3) break;
  }
  if (d.c.cities) picked = [];
  for (const x of d.c.cities ?? d.c.extra ?? []) if (picked.length < 3) picked.push({ id: -1, name: x.en, lon: x.at[0], lat: x.at[1], pop: x.pop ?? 0, over: x });
  d.cities = picked;
}

// ---- Names: Natural Earth's English and Spanish; for GeoNames' towns, Wikidata's (when it is the same place)
const gnOnly = [...new Set(deck.flatMap((d) => [d.cap, ...d.cities, ...d.seats]).filter((p) => p && !p.ne && p.id > 0).map((p) => p.id))];
const named = new Map();
for (let i = 0; i < gnOnly.length; i += 400) {
  for (const r of await namesByGeonames(gnOnly.slice(i, i + 400), `g${i / 400}`)) {
    const g = Number(r.gn.value), now = { en: r.en?.value, es: r.es?.value }, was = named.get(g);
    if (!was || (!was.es && now.es)) named.set(g, now);
  }
}
const names = (p, over) => {
  if (over) return { en: over.en, es: over.es ?? over.en };
  if (p.ne) return { en: p.name, es: p.es };
  const n = named.get(p.id);
  const own = p.name.replace(/ (Village|Hamlet)$/, '');
  const en = n?.en && alike(n.en, own) ? n.en : own;
  return { en, es: n?.es && alike(n.es, own) ? n.es : en };
};

// ---- How well known: population, economy, Wikipedias
const links = new Map(wd.map((r) => [r.iso3.value, Number(r.links.value)]));
links.set('DNK', links.get('DNK') ?? 300);
const lg = (v) => Math.log10(Math.max(1, v));
const z = (vals) => { const a = vals.filter(Number.isFinite), mu = a.reduce((s, v) => s + v, 0) / a.length, sd = Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length) || 1; return (v) => (Number.isFinite(v) ? (v - mu) / sd : 0); };
const zPop = z(deck.map((d) => lg(d.m.pop))), zGdp = z(deck.map((d) => lg(d.m.gdp))), zLinks = z(deck.map((d) => links.get(d.id) ?? NaN));
for (const d of deck) d.fame = Math.round((0.35 * zPop(lg(d.m.pop)) + 0.3 * zGdp(lg(d.m.gdp)) + 0.35 * zLinks(links.get(d.id) ?? NaN)) * 100) / 100;

// ---- Neighbours: land borders, else the nearest countries (islands)
const graph = new Map();
for (const [a, b] of borders.land ?? []) { (graph.get(a) ?? graph.set(a, new Set()).get(a)).add(b); (graph.get(b) ?? graph.set(b, new Set()).get(b)).add(a); }
const inDeck = new Set(deck.map((d) => d.id));
const centre = (d) => [d.m.lx, d.m.ly];
for (const d of deck) {
  const land = [...(graph.get(d.id) ?? [])].filter((x) => inDeck.has(x));
  const near = deck.filter((o) => o.id !== d.id && !land.includes(o.id)).map((o) => [o.id, km(centre(d), centre(o))]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  d.land = land;
  d.near = near.slice(0, Math.max(0, 6 - land.length));
}

// ---- Flags that look alike: the well-known groups first, then the closest by colour (flags.mjs)
const fl = read(path.join(HERE, 'curated/flags.json'));
const nearFile = path.join(ROOT, '.cache/master/flags-near.json');
const flagNear = fs.existsSync(nearFile) ? read(nearFile).near : {};
if (!fs.existsSync(nearFile)) problems.push('no .cache/master/flags-near.json: run node scripts/data/master/flags.mjs');
for (const d of deck) {
  const mates = fl.groups.filter((g) => g.includes(d.id)).flat().filter((x) => x !== d.id && inDeck.has(x));
  d.like = [...new Set([...mates, ...(flagNear[d.id] ?? []).map(([b]) => b)])].slice(0, 5);
}
for (const g of fl.groups) for (const x of g) if (!inDeck.has(x)) problems.push(`flags group: ${x} is not in the deck`);
for (const [k, v] of Object.entries(fl.notes)) {
  const [a, b] = k.split('|');
  if (!inDeck.has(a) || !inDeck.has(b) || a >= b) problems.push(`flag note ${k}: two countries of the deck, in order`);
  if (!v.en || !v.es) problems.push(`flag note ${k}: en and es`);
}

// ---- Check and write
for (const d of deck) {
  if (d.cap && d.cities.length < 2 && d.c.skip !== 'capitals') (d.terr ? console.log : (x) => problems.push(x))(`${d.id}: only ${d.cities.length} other cities`);
}
const out = {
  about: 'Master the world: each country with its capital, three other cities (GeoNames, CC BY 4.0; names from Wikidata, CC0), how well known it is, its neighbours.',
  countries: deck.map((d) => ({
    id: d.id, a2: d.m.a2, ct: d.m.ct, fame: d.fame, pop: d.m.pop, ...(d.terr ? { t: 1 } : {}),
    ...(d.cap ? { cap: { ...names(d.cap, d.c.name), at: [r3(d.cap.lon), r3(d.cap.lat)], pop: d.cap.pop } } : {}),
    cities: d.cities.map((p) => ({ ...names(p, p.over), at: [r3(p.lon), r3(p.lat)], pop: p.pop })),
    ...(d.seats.length ? { seats: d.seats.map((p) => names(neFor(p, d.places) ?? p)) } : {}),
    ...(d.c.note ? { note: d.c.note } : {}),
    ...(d.c.skip ? { skip: d.c.skip } : {}),
    land: d.land, near: d.near, like: d.like,
  })),
  flagNotes: fl.notes,
};
if (!check) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'deck.json'), JSON.stringify(out) + '\n'); }
console.log(`deck: ${out.countries.length} countries; ${out.countries.filter((c) => c.cities.length === 3).length} with three other cities; ${deck.flatMap((d) => d.cities).filter((p) => !p.ne).length} towns from GeoNames`);
if (problems.length) { console.error(`${problems.length} problem(s):\n- ${problems.join('\n- ')}`); process.exit(1); }
