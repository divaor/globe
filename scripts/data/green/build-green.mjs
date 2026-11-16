// Green planet (v0.31.0): builds public/data/green/ from what fetch-green.mjs asked (scripts/data/green/raw/) and the
// research written by hand (scripts/data/green/*.json), with no network:
//   plants.json    about 250 plants: names, group, emoji, status, height and lifespan, picture, countries, best parks
//                  and gardens, and where each grows wild, as squares of GBIF's map grid (1.40625° a side)
//   gardens.json   botanical gardens and arboretums, each with the plants that grow wild around it
//   trees.json     famous trees: the record holders checked by hand (trees.json here) and Wikidata's remarkable trees
//   calendar.json  nature's calendar: plant and animal spectacles by month (calendar-plants.json, calendar-animals.json)
//   crops.json     where our food first grew, and how it spread (crops.json here)
// (ecoregions.json and the twelve ndvi/*.webp come straight from fetch-green.mjs eco and ndvi.)
//
//   node scripts/data/green/build-green.mjs           build
//   node scripts/data/green/build-green.mjs --check   in check:data: fails if the files are out of date, or a known
//                                                     plant is missing or grows in the wrong place
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoDistance } from 'd3-geo';
import { NATIVE, NAMES, emojiOf } from './choose-green.mjs';
import { COLS, cellOfHash, cellAt, neighbours, countriesOf, continentOf, countryAt, meta, packCells, packCounts, unpackCells, dropStrays } from '../wild/grid.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.join(ROOT, 'scripts/data/green');
const RAW = path.join(HERE, 'raw');
const OUT = path.join(ROOT, 'public/data/green');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const CHECK = process.argv.includes('--check');
const problems = [];

// ---- Names ----------------------------------------------------------------------------------------------------
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const species = read(path.join(RAW, 'species.json'));
const bySci = new Map(species.map((s) => [s.sci, s]));
const same = (a, b) => a && b && a.toLowerCase().replace(/[^a-z]/g, '') === b.toLowerCase().replace(/[^a-z]/g, '');
function englishName(s) {
  for (const l of [s.label?.en, s.wiki?.en?.replace(/\s*\(.*\)$/, ''), ...(s.common?.en ?? [])]) if (l && !same(l, s.sci)) return cap(l.toLowerCase() === l ? l : l);
  return null;
}
function spanishName(s) {
  for (const l of [s.label?.es, s.wiki?.es?.replace(/\s*\(.*\)$/, ''), ...(s.common?.es ?? [])]) if (l && !same(l, s.sci)) return cap(l);
  return null;
}
/** Every plant's names, checked by hand: [English, Latin American Spanish] (scripts/data/green/names.json). */
const CURATED_FILE = path.join(HERE, 'names.json');
const CURATED = fs.existsSync(CURATED_FILE) ? read(CURATED_FILE) : {};
for (const [k, v] of Object.entries(CURATED)) NAMES[k] = v;

// ---- Facts ----------------------------------------------------------------------------------------------------
const UNIT = { Q11573: ['m', 1], Q174728: ['m', 0.01], Q174789: ['m', 0.001], Q3710: ['m', 0.3048], Q218593: ['m', 0.0254], Q577: ['y', 1], Q1092296: ['y', 1] };
function quantity(list, want) {
  const v = (list ?? []).map(([a, u]) => (UNIT[u]?.[0] === want ? a * UNIT[u][1] : null)).filter((x) => x != null && x > 0);
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const r = (x) => Number(x.toPrecision(x >= 100 ? 3 : 2));
  return lo === hi || hi / lo < 1.08 || hi / lo > 6 ? [r(hi)] : [r(lo), r(hi)];
}
const STATUS = { Q211005: 'LC', Q719675: 'NT', Q278113: 'VU', Q96377276: 'EN', Q11394: 'EN', Q219127: 'CR', Q239509: 'EW', Q237350: 'EX', Q3245245: 'DD' };
const STATUS_RANK = { EX: 7, EW: 6, CR: 5, EN: 4, VU: 3, NT: 2, LC: 1, DD: 0 };

// ---- The plants' ranges ---------------------------------------------------------------------------------------
const chosen = read(path.join(RAW, 'chosen.json'));
const ranges = read(path.join(RAW, 'ranges.json'));

/** The squares that hold a botanical garden or an arboretum (Wikidata's, all of them). */
const GARDEN_CELLS = new Set((fs.existsSync(path.join(RAW, 'places.json')) ? read(path.join(RAW, 'places.json')) : []).filter((p) => p.kind === 'garden').map((p) => cellAt(p.at[0], p.at[1])));

/** A plant's squares, each with its sightings: strays dropped, gardens and introduced populations left out. */
function cellsOf(a) {
  const raw = ranges[a.id] ?? {};
  const m = new Map();
  for (const [g, n] of Object.entries(raw)) if (n >= 2) m.set(cellOfHash(g), n);
  // A square with two or three sightings and no neighbour with any is a stray (a garden plant, a mistake).
  if (m.size >= 10) for (const [c, n] of [...m]) if (n <= 3 && !neighbours(c).some((k) => m.has(k))) m.delete(c);
  // A lone square with a garden in it, none of its range within two squares: the garden.
  dropStrays(m, GARDEN_CELLS);
  const native = NATIVE[a.sci];
  if (native) for (const c of [...m.keys()]) { const cc = countriesOf(c); if (!cc.length || !cc.some((id) => native.includes(continentOf(id)))) m.delete(c); }
  // Plants are carried around the world in gardens and fields: a continent with under 5% of a plant's sightings is
  // gardens and escapes, not where it grows wild.
  if (m.size >= 6) {
    const per = {};
    let total = 0;
    for (const [c, n] of m) for (const ct of new Set(countriesOf(c).map(continentOf))) if (ct) { per[ct] = (per[ct] ?? 0) + n; total += n; }
    const weak = new Set(Object.keys(per).filter((ct) => per[ct] < total * 0.05));
    if (weak.size) for (const c of [...m.keys()]) { const cts = new Set(countriesOf(c).map(continentOf)); if (cts.size && [...cts].every((ct) => weak.has(ct))) m.delete(c); }
  }
  // Squares out at sea (a seaweed's, or a mistake's) only for plants of the shore.
  return m;
}

const pool = chosen.map((a) => {
  const cells = cellsOf(a);
  const n = {};
  for (const [c, k] of cells) { const w = Math.log2(Math.max(2, k)); for (const ct of new Set(countriesOf(c).map(continentOf))) if (ct) n[ct] = (n[ct] ?? 0) + w; }
  const home = Object.entries(n).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'sea';
  return { ...a, cells, home };
});

// The plants are the ones checked by hand in names.json, in the group given there; a plant GBIF has no wild
// sightings of is left out (and listed).
const picked = [];
for (const [sci, [, , g]] of Object.entries(CURATED)) {
  const a = pool.find((x) => x.sci === sci);
  if (!a) { problems.push(`not asked about yet (run choose-green and fetch-green ranges): ${sci}`); continue; }
  if (!a.cells.size) { problems.push(`no wild sightings: ${sci}`); continue; }
  picked.push({ ...a, g: g ?? a.g });
}

// ---- Places: parks (Wild world's) and gardens ------------------------------------------------------------------
const places = fs.existsSync(path.join(RAW, 'places.json')) ? read(path.join(RAW, 'places.json')) : [];
const parks = read(path.join(ROOT, 'public/data/wild/parks.json')).parks;
const placeName = (p) => {
  const en = p.label?.en ?? p.label?.mul ?? p.wiki?.en ?? p.label?.es ?? null;
  const es = p.label?.es ?? p.wiki?.es ?? en;
  return en ? [en, es] : null;
};
const gardensAll = places.filter((p) => p.kind === 'garden' && placeName(p));
const gardens = gardensAll.sort((a, b) => b.sl - a.sl).slice(0, 1300);
const byCell = (list) => { const m = new Map(); list.forEach((p, i) => { const c = cellAt(p.at[0], p.at[1]); (m.get(c) ?? m.set(c, []).get(c)).push(i); }); return m; };
const parksByCell = byCell(parks), gardensByCell = byCell(gardens);

// The best places to see a plant: the parks and gardens in its squares, those in the squares with the most sightings
// first (a garden in its range shows it growing wild nearby, and usually in its beds too).
const best = new Map();
const famous = gardens.map(() => []);
picked.sort((a, b) => b.sl - a.sl);
for (const [ai, a] of picked.entries()) {
  const scored = [];
  for (const [c, n] of a.cells) {
    for (const pi of parksByCell.get(c) ?? []) scored.push({ id: parks[pi].id, n, sl: parks[pi].sl, g: -1 });
    for (const gi of gardensByCell.get(c) ?? []) scored.push({ id: gardens[gi].qid, n, sl: gardens[gi].sl, g: gi });
  }
  scored.sort((x, y) => y.n - x.n || y.sl - x.sl);
  // Wild places first (up to four parks), then up to two gardens near where it grows; more of either when the other is
  // short.
  const parksOf = scored.filter((s) => s.g < 0), gardensOf = scored.filter((s) => s.g >= 0);
  const np = Math.max(4, 6 - Math.min(2, gardensOf.length));
  const top = [...parksOf.slice(0, np), ...gardensOf.slice(0, 6 - Math.min(np, parksOf.length))].slice(0, 6);
  best.set(a.id, top.map((s) => s.id));
  for (const s of top) if (s.g >= 0 && famous[s.g].length < 8) famous[s.g].push(ai);
}

// ---- Plants ---------------------------------------------------------------------------------------------------
const crops = fs.existsSync(path.join(HERE, 'crops.json')) ? read(path.join(HERE, 'crops.json')).crops : [];
const plants = picked.map((a) => {
  const s = bySci.get(a.sci) ?? a;
  const cs = [...a.cells.keys()].sort((x, y) => x - y);
  const cc = new Set();
  for (const c of cs) for (const id of countriesOf(c)) cc.add(id);
  const status = (s.status ?? []).map((q) => STATUS[q]).filter(Boolean).sort((x, y) => STATUS_RANK[y] - STATUS_RANK[x])[0] ?? null;
  const facts = {};
  const ht = quantity(s.q?.height, 'm'), life = quantity(s.q?.life, 'y');
  if (ht) facts.h = ht; if (life) facts.y = life;
  const en = NAMES[a.sci]?.[0] ?? englishName(s) ?? s.sci, es = NAMES[a.sci]?.[1] ?? spanishName(s) ?? en;
  const crop = crops.find((c) => c.sci === a.sci || (c.wild ?? []).includes(a.sci));
  return {
    id: a.id, q: a.qid, sci: a.sci, n: [en, es], g: a.g, e: emojiOf(a.sci, a.tax, a.g),
    fam: a.tax?.family ?? null, ord: a.tax?.order ?? null, st: status, sl: a.sl,
    ...(Object.keys(facts).length ? { f: facts } : {}), ...(s.img ? { img: s.img } : {}),
    cc: [...cc].sort(), home: a.home, best: best.get(a.id) ?? [], ...(crop ? { crop: crop.id } : {}),
    c: packCells(cs), k: packCounts(cs.map((c) => a.cells.get(c))),
  };
});

const gardenOut = gardens.map((p, i) => ({
  id: p.qid, n: placeName(p), at: p.at, k: /arboret/i.test(`${p.label?.en ?? ''} ${p.label?.es ?? ''} ${p.wiki?.en ?? ''}`) ? 'arb' : 'bg', sl: p.sl, cc: p.cc,
  ...(p.img ? { img: p.img } : {}), ...(p.since && p.since > 1400 && p.since <= 2026 ? { since: p.since } : {}),
  f: famous[i].slice(0, 6).map((ai) => plants[ai].id),
}));

// ---- Famous trees ---------------------------------------------------------------------------------------------
const handFile = path.join(HERE, 'trees.json');
const hand = fs.existsSync(handFile) ? read(handFile).trees : [];
const plantBySci = new Map(plants.map((p) => [p.sci, p]));
const ccOf = (at) => countryAt(at[0], at[1]);
const near = (a, b, km) => geoDistance(a, b) * 6371 <= km;
const treesOut = hand.map((t) => {
  const sp = t.sci ? plantBySci.get(t.sci) : null;
  const spNames = t.species ?? (sp ? { en: sp.n[0], es: sp.n[1] } : null);
  return {
    id: t.id, n: [t.name.en, t.name.es], at: t.at, sl: 99, cc: t.country ?? ccOf(t.at),
    ...(t.sci && spNames ? { sp: [spNames.en, spNames.es, t.sci] } : {}), ...(sp ? { plant: sp.id } : {}),
    ...(t.img ? { img: t.img } : {}), ...(t.qid ? { q: t.qid } : {}),
    ...(t.record ? { rec: t.record } : {}), ...(t.text ? { text: t.text } : {}),
    ...(t.age ? { age: t.age } : {}), ...(t.height ? { h: t.height } : {}),
    ...(t.secret ? { secret: true } : {}), ...(t.place ? { place: t.place } : {}), ...(t.status && t.status !== 'alive' ? { status: t.status === 'dead' ? 'gone' : t.status } : {}),
    src: t.sources ?? [],
  };
});
const UNIT_M = { Q11573: 1, Q174728: 0.01, Q3710: 0.3048 };
// Trees whose place is kept secret to protect them (the tallest redwoods, the oldest bristlecone): never at Wikidata's
// point; the hand-checked list has them at their park.
const SECRET = /^(Hyperion|Helios|Icarus|Daedalus|Stratosphere Giant|Lost Monarch|Del Norte Titan|Methuselah)\b/i;
const wdTrees = places.filter((p) => p.kind === 'tree' && placeName(p) && !SECRET.test(placeName(p)[0])).sort((a, b) => b.sl - a.sl);
for (const p of wdTrees) {
  if (treesOut.length >= 420) break;
  // The hand-checked trees win: a Wikidata tree of the same name or within 2 km of one is the same tree.
  const n = placeName(p);
  if (treesOut.some((t) => (t.q && t.q === p.qid) || near(t.at, p.at, 2) || (near(t.at, p.at, 60) && same(t.n[0], n[0])))) continue;
  const sci = p.taxonName?.sci ?? null, sp = sci ? plantBySci.get(sci) : null;
  const h = p.height && UNIT_M[p.height[1]] ? Math.round(p.height[0] * UNIT_M[p.height[1]] * 10) / 10 : null;
  treesOut.push({
    id: p.qid, n, at: p.at, sl: p.sl, cc: p.cc ?? ccOf(p.at), q: p.qid,
    ...(sci ? { sp: [sp?.n[0] ?? p.taxonName?.en ?? sci, sp?.n[1] ?? p.taxonName?.es ?? p.taxonName?.en ?? sci, sci] } : {}), ...(sp ? { plant: sp.id } : {}),
    ...(p.img ? { img: p.img } : {}), ...(h && h > 1 && h < 120 ? { h } : {}), ...(p.since && p.since > -5000 && p.since <= 2026 ? { since: p.since } : {}),
    ...(p.gone ? { status: 'gone' } : {}),
  });
}

// ---- Nature's calendar ----------------------------------------------------------------------------------------
const calendar = [];
for (const f of ['calendar-plants.json', 'calendar-animals.json']) {
  const file = path.join(HERE, f);
  if (!fs.existsSync(file)) { problems.push(`missing ${f}`); continue; }
  for (const s of read(file).spectacles) {
    calendar.push({
      id: s.id, kind: s.kind, e: s.emoji, n: s.name, at: s.at, place: s.place, cc: s.country ?? null, months: s.months, peak: s.peak,
      text: s.text, ...(s.how ? { how: s.how } : {}), ...(s.sci ? { sci: s.sci } : {}), src: s.sources,
    });
  }
}
const calIds = new Set();
for (const s of calendar) {
  if (calIds.has(s.id)) problems.push(`spectacle ${s.id} twice`);
  calIds.add(s.id);
  if (!s.months?.length || s.months.some((m) => m < 1 || m > 12) || !s.months.includes(s.peak)) problems.push(`spectacle ${s.id}: bad months`);
  if (!s.n?.en || !s.n?.es || !s.text?.en || !s.text?.es || !s.place?.en || !s.place?.es || !s.src?.length) problems.push(`spectacle ${s.id}: missing text or sources`);
  if (Math.abs(s.at[0]) > 180 || Math.abs(s.at[1]) > 90) problems.push(`spectacle ${s.id}: bad point`);
  if (s.cc && !meta[s.cc]) problems.push(`spectacle ${s.id}: unknown country ${s.cc}`);
}

// ---- Where our food first grew --------------------------------------------------------------------------------
const cropOut = crops.map((c) => ({
  id: c.id, e: c.emoji, n: c.name, sci: c.sci, origin: { at: c.origin.at, place: c.origin.place, km: c.origin.radiusKm }, date: c.date,
  ...(c.dateNote ? { dateNote: c.dateNote } : {}), spread: c.spread.map((s) => ({ from: s.from, to: s.to, date: s.date, label: s.label })),
  text: c.text, ...(c.today ? { today: c.today } : {}), ...(c.story ? { story: c.story } : {}),
  ...(plants.find((p) => p.crop === c.id) ? { plant: plants.find((p) => p.crop === c.id).id } : {}), src: c.sources,
}));
const stories = new Map();
for (const c of cropOut) {
  if (!c.n?.en || !c.n?.es || !c.text?.en || !c.text?.es || !c.src?.length) problems.push(`crop ${c.id}: missing text or sources`);
  if (c.story) {
    const [coll, id, step] = c.story;
    const f = path.join(ROOT, 'public/data', coll, `${id}.json`);
    if (!stories.has(f)) stories.set(f, fs.existsSync(f) ? read(f) : null);
    const st = stories.get(f);
    if (!st) problems.push(`crop ${c.id}: no story ${coll}/${id}`);
    else if (!(st.steps ?? [])[step - 1]) problems.push(`crop ${c.id}: story ${coll}/${id} has no step ${step} (numbered from 1)`);
  }
}

const files = {
  'plants.json': { grid: { cols: COLS, rows: 128, deg: 360 / COLS }, credit: 'GBIF.org occurrence data (CC0 and CC BY records), Wikidata (CC0)', plants },
  'gardens.json': { gardens: gardenOut },
  'trees.json': { trees: treesOut },
  'calendar.json': { spectacles: calendar },
  'crops.json': { crops: cropOut },
};

// ---- Checks ---------------------------------------------------------------------------------------------------
const bySciOut = (sci) => plants.find((p) => p.sci === sci);
const growsAt = (sci, lon, lat) => {
  const p = bySciOut(sci);
  if (!p) { problems.push(`missing: ${sci}`); return; }
  const want = cellAt(lon, lat), cells = new Set(unpackCells(p.c));
  if (![want, ...neighbours(want)].some((c) => cells.has(c))) problems.push(`${sci} does not grow at ${lon}, ${lat}`);
};
growsAt('Carnegiea gigantea', -111.0, 32.3); growsAt('Welwitschia mirabilis', 15.0, -23.3); growsAt('Sequoiadendron giganteum', -118.75, 36.56);
growsAt('Adansonia grandidieri', 44.4, -20.25); growsAt('Araucaria araucana', -71.2, -38.7); growsAt('Dionaea muscipula', -78.0, 34.3);
growsAt('Yucca brevifolia', -116.0, 34.0); growsAt('Cedrus libani', 36.0, 34.25);
for (const [sci, lon, lat] of [['Carnegiea gigantea', -3.7, 40.4], ['Sequoiadendron giganteum', -0.1, 51.5], ['Ginkgo biloba', 2.35, 48.85], ['Jacaranda mimosifolia', 28.2, -25.75], ['Opuntia ficus-indica', 14.5, 37.5]]) {
  const p = bySciOut(sci); if (p && new Set(unpackCells(p.c)).has(cellAt(lon, lat))) problems.push(`${sci} should not grow at ${lon}, ${lat}`);
}
for (const p of plants) {
  if (!p.n[0] || (p.n[0] === p.sci && !CURATED[p.sci])) problems.push(`no English name: ${p.sci}`);
  if (Object.keys(CURATED).length && !CURATED[p.sci]) problems.push(`no checked names in names.json: ${p.sci}`);
  if (!p.c) problems.push(`no range: ${p.n[0]}`);
}
for (const t of treesOut) if (!t.n[0] || Math.abs(t.at[0]) > 180 || Math.abs(t.at[1]) > 90) problems.push(`tree ${t.id}: bad name or point`);
const n = {}; for (const p of plants) n[p.g] = (n[p.g] ?? 0) + 1;

if (CHECK) {
  for (const [f, d] of Object.entries(files)) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== JSON.stringify(d) + '\n') problems.push(`${f} is out of date: run node scripts/data/green/build-green.mjs`);
  }
  for (const f of ['ecoregions.json', ...Array.from({ length: 12 }, (_, i) => `ndvi/${String(i + 1).padStart(2, '0')}.webp`)]) if (!fs.existsSync(path.join(OUT, f))) problems.push(`missing ${f}: run fetch-green.mjs eco / ndvi`);
  if (problems.length) { console.error(`green checks failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
  console.log(`green checks passed (${plants.length} plants, ${gardenOut.length} gardens, ${treesOut.length} trees, ${calendar.length} spectacles, ${cropOut.length} crops)`);
} else {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, d] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), JSON.stringify(d) + '\n');
  const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  console.log(`plants.json: ${plants.length} (${JSON.stringify(n)}) ${kb('plants.json')} KB; gardens.json: ${gardenOut.length} ${kb('gardens.json')} KB; trees.json: ${treesOut.length} ${kb('trees.json')} KB; calendar.json: ${calendar.length}; crops.json: ${cropOut.length}`);
  if (problems.length) console.warn(`problems:\n  ${problems.join('\n  ')}`);
}
