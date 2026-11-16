// Wild world (v0.30.0): builds public/data/wild/ from what fetch-wild.mjs asked (scripts/data/wild/raw/), with no
// network:
//   animals.json  about 400 animals: names, group, emoji, status, facts, picture and call, countries, best parks,
//                 and where each lives, as squares of GBIF's map grid (1.40625° a side, about 150 km)
//   parks.json    national parks and nature reserves, each with the animals it is best for
//   zoos.json     zoos, safari parks and aquariums
//
//   node scripts/data/wild/build-wild.mjs           build
//   node scripts/data/wild/build-wild.mjs --check   in check:data: fails if the files are out of date, or a known
//                                                   animal is missing or lives in the wrong place
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTRA, NATIVE, NAMES, STORY, emojiOf } from './choose.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const RAW = path.join(ROOT, 'scripts/data/wild/raw');
const OUT = path.join(ROOT, 'public/data/wild');
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const CHECK = process.argv.includes('--check');

import { COLS, ROWS, DEG, cellOfHash, cellCenter, cellAt, neighbours, countriesOf, continentOf, circleCells, packCells, packCounts, unpackCells, dropStrays } from './grid.mjs';

// ---- Names ----------------------------------------------------------------------------------------------------
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const species = read(path.join(RAW, 'species.json'));
// Words written with a capital inside an English name that is not in title case ("African bush elephant"): the
// proper words. A bird name in title case ("Common Blackbird") keeps only those: "Common blackbird".
const PROPER = new Set();
for (const s of species) {
  const l = s.label?.en;
  if (!l || l === s.sci) continue;
  const w = l.split(/\s+/);
  if (w.slice(1).some((x) => /^[a-z]/.test(x))) for (const x of w.slice(1)) if (/^[A-Z]/.test(x)) PROPER.add(x.replace(/[^\p{L}'’-]/gu, ''));
}
for (const x of ['African', 'American', 'Eurasian', 'European', 'Asian', 'Asiatic', 'Indian', 'Atlantic', 'Pacific', 'Andean', 'Amazon', 'Amazonian', 'Bengal', 'Siberian', 'Japanese', 'Chinese',
  'Australian', 'Himalayan', 'Caspian', 'Mediterranean', 'Nile', 'Galápagos', 'Galapagos', 'Arabian', 'Iberian', 'Barbary', 'Egyptian', 'Malagasy', 'Madagascar', 'Philippine', 'Bornean',
  'Sumatran', 'Javan', 'Malayan', 'Tibetan', 'Mongolian', 'Canada', 'Canadian', 'Mexican', 'Californian', 'California', 'Alpine', 'Antarctic', 'Arctic', 'Magellanic', 'Humboldt', 'Adélie',
  'Komodo', 'Cape', 'Congo', 'Nubian', 'Ethiopian', 'Somali', 'Persian', 'Tasmanian', 'Steller’s', "Steller's", 'Grévy’s', "Grevy's", 'Przewalski’s', "Przewalski's", 'Darwin’s', "Darwin's",
  'Jackson’s', "Jackson's", 'Wilson’s', "Wilson's", 'Bewick’s', "Bewick's", 'Ross', 'Weddell', 'Baird’s', "Baird's", 'Cuvier’s', "Cuvier's", 'Risso’s', "Risso's", 'Hector’s', "Hector's", 'Bryde’s', "Bryde's",
  'Atlas', 'Gila', 'Christmas', 'Island', 'Falkland', 'Labrador', 'Carolina', 'Stephens', 'Xerces', 'Rocky', 'Mountains', 'Schomburgk’s', "Schomburgk's", 'Pinta', 'Bramble', 'Cay', 'Pyrenean', 'Japan', 'Queen', 'Alexandra’s', "Alexandra's", 'Goliath', 'Portuguese', 'Spanish', 'Greek', 'Hermann’s', "Hermann's", 'Aldabra', 'Burmese', 'Nicobar', 'Andaman']) PROPER.add(x);
function englishName(s) {
  let l = s.label?.en;
  if (!l || l === s.sci || l.toLowerCase() === s.sci.toLowerCase()) l = (s.common?.en ?? [])[0] ?? s.wiki?.en?.replace(/\s*\(.*\)$/, '') ?? null;
  if (!l || l.toLowerCase() === s.sci.toLowerCase()) return null;
  const w = l.split(/\s+/);
  const title = w.length > 1 && w.slice(1).every((x) => /^[A-Z]/.test(x));
  if (title) l = [w[0], ...w.slice(1).map((x) => (PROPER.has(x.replace(/[^\p{L}'’-]/gu, '')) ? x : x.toLowerCase()))].join(' ');
  return cap(l.replace(/-([A-Z])/g, (m, c) => (PROPER.has(c) ? m : `-${c.toLowerCase()}`)));
}
function spanishName(s) {
  let l = s.label?.es;
  const sci = s.sci.toLowerCase();
  if (!l || l.toLowerCase() === sci) l = (s.common?.es ?? [])[0] ?? null;
  if ((!l || l.toLowerCase() === sci) && s.wiki?.es && s.wiki.es.toLowerCase() !== sci) l = s.wiki.es.replace(/\s*\(.*\)$/, '');
  if (!l || l.toLowerCase() === sci) return null;
  return cap(l);
}

// ---- Facts: size, weight and lifespan in the units the app shows ------------------------------------------------
const UNIT = {
  Q11570: ['kg', 1], Q41803: ['kg', 0.001], Q191118: ['kg', 1000], Q100995: ['kg', 0.45359237], Q48013: ['kg', 0.0283495], Q3241121: ['kg', 1e-6],
  Q11573: ['m', 1], Q174728: ['m', 0.01], Q174789: ['m', 0.001], Q3710: ['m', 0.3048], Q218593: ['m', 0.0254], Q828224: ['m', 1000],
  Q577: ['y', 1], Q1092296: ['y', 1], Q5151: ['y', 1 / 12], Q573: ['y', 1 / 365.25], Q23387: ['y', 7 / 365.25],
};
function quantity(list, want) {
  const v = (list ?? []).map(([a, u]) => (UNIT[u]?.[0] === want ? a * UNIT[u][1] : null)).filter((x) => x != null && x > 0);
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const r = (x) => Number(x.toPrecision(x >= 100 ? 3 : 2));
  // A newborn's weight sits beside the adult's on Wikidata (a lion of 1.6–188 kg): far apart, only the adult's.
  return lo === hi || hi / lo < 1.08 ? [r(hi)] : hi / lo > 4 ? [r(hi)] : [r(lo), r(hi)];
}
const STATUS = { Q211005: 'LC', Q719675: 'NT', Q278113: 'VU', Q96377276: 'EN', Q11394: 'EN', Q219127: 'CR', Q239509: 'EW', Q237350: 'EX', Q3245245: 'DD' };
const STATUS_RANK = { EX: 7, EW: 6, CR: 5, EN: 4, VU: 3, NT: 2, LC: 1, DD: 0 };

// ---- Choosing the animals -------------------------------------------------------------------------------------
/** How many animals of each group the app keeps (the ones asked for by name always, the best known for the rest). */
const QUOTA = { mammals: 150, birds: 100, reptiles: 45, sea: 70, small: 30 };
/** No continent may hold more than this share of a group, so every part of the world gets its own animals. */
const CAP = 0.22;

const chosen = read(path.join(RAW, 'chosen.json'));
/** Every animal's names, checked by hand: [English, Latin American Spanish] (scripts/data/wild/names.json). */
const CURATED_FILE = path.join(ROOT, 'scripts/data/wild/names.json');
const CURATED = fs.existsSync(CURATED_FILE) ? read(CURATED_FILE) : {};
for (const [k, v] of Object.entries(CURATED)) NAMES[k] = v;
const ranges = read(path.join(RAW, 'ranges.json'));
const extraBy = new Map(EXTRA.map((e) => [e.sci, e]));

/** The squares that hold a zoo or an aquarium (Wikidata's, all of them): a lone square of sightings there is the zoo. */
const ZOO_CELLS = new Set(read(path.join(RAW, 'places.json')).filter((p) => p.kind === 'zoo' || p.kind === 'aquarium').map((p) => cellAt(p.at[0], p.at[1])));

/** An animal's squares, each with its sightings: strays dropped, introduced populations left out. */
function cellsOf(a) {
  const e = extraBy.get(a.sci);
  if (a.gone && e?.range) { const m = new Map(); for (const c of e.range.flatMap(circleCells)) m.set(c, 1); return m; }
  const raw = ranges[a.id] ?? {}, dom = ranges[`${a.id}#domestic`] ?? {};
  const m = new Map();
  // Less its domestic form's sightings (dogs in a wolf's squares): a square stays when wild ones are left.
  for (const [g, n] of Object.entries(raw)) { const k = n - (dom[g] ?? 0); if (k >= 2 || (k > 0 && !dom[g])) m.set(cellOfHash(g), k); }
  // A square with one or two sightings and no neighbour with any is a stray (a bird blown off course, a mistake).
  if (m.size >= 10) for (const [c, n] of [...m]) if (n <= 2 && !neighbours(c).some((k) => m.has(k))) m.delete(c);
  // A lone square with a zoo in it, none of its range within two squares: the zoo.
  dropStrays(m, ZOO_CELLS);
  const native = NATIVE[a.sci];
  if (native) for (const c of [...m.keys()]) { const cc = countriesOf(c); if (!cc.length || !cc.some((id) => native.includes(continentOf(id)))) m.delete(c); }
  // Animals that don't fly or swim the oceans: a continent with under 2% of their sightings is zoos, safari parks and
  // escapes (lions in Belgium), not where they live.
  if ((a.g === 'mammals' || a.g === 'reptiles' || a.g === 'small') && m.size >= 10) {
    const per = {};
    let total = 0;
    for (const [c, n] of m) for (const ct of new Set(countriesOf(c).map(continentOf))) if (ct) { per[ct] = (per[ct] ?? 0) + n; total += n; }
    const weak = new Set(Object.keys(per).filter((ct) => per[ct] < total * 0.02));
    if (weak.size) for (const c of [...m.keys()]) { const cts = new Set(countriesOf(c).map(continentOf)); if (cts.size && [...cts].every((ct) => weak.has(ct))) m.delete(c); }
  }
  return m;
}

const pool = chosen.map((a) => {
  const cells = cellsOf(a);
  // Its home: the continent where most of its sightings are (a Eurasian bird watched mostly in Europe is European);
  // "sea" for animals seen mostly out at sea.
  const n = {};
  let sea = 0;
  for (const [c, k] of cells) {
    const w = Math.log2(Math.max(2, k)), cc = countriesOf(c);
    if (!cc.length) { sea += w; continue; }
    for (const ct of new Set(cc.map(continentOf))) if (ct) n[ct] = (n[ct] ?? 0) + w;
  }
  const land = Object.entries(n).sort((x, y) => y[1] - x[1])[0];
  const home = !land || sea > land[1] * 2 ? 'sea' : land[0];
  return { ...a, cells, home };
});

const picked = [];
for (const [g, quota] of Object.entries(QUOTA)) {
  const list = pool.filter((a) => a.g === g && !a.gone && a.cells.size).sort((x, y) => y.must - x.must || y.sl - x.sl);
  const per = {};
  const out = [];
  for (const a of list) {
    if (out.length >= quota && !a.must) break;
    if (!a.must && (per[a.home] ?? 0) >= Math.ceil(quota * CAP)) continue;
    // One name, one animal (Wikidata keeps a few species twice under old and new names).
    const name = (x) => NAMES[x.sci]?.[0] ?? englishName(species.find((y) => y.qid === x.qid) ?? x);
    if (out.some((b) => name(b) && name(b) === name(a))) continue;
    out.push(a); per[a.home] = (per[a.home] ?? 0) + 1;
  }
  picked.push(...out);
}
picked.push(...pool.filter((a) => a.gone && a.cells.size));

// ---- Places ---------------------------------------------------------------------------------------------------
const places = read(path.join(RAW, 'places.json'));
const placeName = (p) => {
  const en = p.label?.en ?? p.label?.mul ?? p.wiki?.en ?? p.label?.es ?? null;
  const es = p.label?.es ?? p.wiki?.es ?? en;
  return en ? [en, es] : null;
};
const AREA = { Q712226: 1, Q35852: 0.01, Q81292: 1e-6, Q232291: 2.589988, Q25343: 1e-6, Q23931103: 0.004046856 }; // km², hectare, m², square mile, m², acre
const parksAll = places.filter((p) => (p.kind === 'np' || p.kind === 'reserve') && placeName(p));
const zoosAll = places.filter((p) => (p.kind === 'zoo' || p.kind === 'aquarium') && placeName(p));
// About 2,100 parks and reserves and 1,300 zoos and aquariums: the national parks and the best known of the rest.
const parks = parksAll.sort((a, b) => b.sl - a.sl).slice(0, 2100);
const zoos = zoosAll.sort((a, b) => b.sl - a.sl).slice(0, 1300);
const parksByCell = new Map();
parks.forEach((p, i) => { const c = cellAt(p.at[0], p.at[1]); (parksByCell.get(c) ?? parksByCell.set(c, []).get(c)).push(i); });

// The best places to see an animal: the parks in its squares, those in the squares with the most sightings first.
const best = new Map();
const famous = parks.map(() => []);
picked.sort((a, b) => b.sl - a.sl);
for (const [ai, a] of picked.entries()) {
  if (a.gone) continue;
  const scored = [];
  for (const [c, n] of a.cells) for (const pi of parksByCell.get(c) ?? []) scored.push([pi, n, parks[pi].sl]);
  scored.sort((x, y) => y[1] - x[1] || y[2] - x[2]);
  const top = scored.slice(0, 8).map((x) => x[0]);
  best.set(a.id, top);
  for (const pi of top.slice(0, 3)) famous[pi].push(ai);
}

// ---- Output ---------------------------------------------------------------------------------------------------
const animals = picked.map((a) => {
  const s = species.find((x) => x.qid === a.qid) ?? a;
  const e = extraBy.get(a.sci);
  const cs = [...a.cells.keys()].sort((x, y) => x - y);
  const cc = new Set();
  for (const c of cs) for (const id of countriesOf(c)) cc.add(id);
  const status = a.gone ? 'EX' : (s.status ?? []).map((q) => STATUS[q]).filter(Boolean).sort((x, y) => STATUS_RANK[y] - STATUS_RANK[x])[0] ?? null;
  const facts = {};
  // A weight given once is too often a newborn's (a jaguar of 0.8 kg): weights only where Wikidata has several.
  const mass = (s.q?.mass?.length ?? 0) >= 2 ? quantity(s.q?.mass, 'kg') : null, len = quantity(s.q?.length, 'm'), ht = quantity(s.q?.height, 'm'), life = quantity(s.q?.life, 'y'), wing = quantity(s.q?.wingspan, 'm');
  if (mass) facts.kg = mass; if (len) facts.m = len; if (ht) facts.h = ht; if (life) facts.y = life; if (wing) facts.w = wing;
  const en = NAMES[a.sci]?.[0] ?? englishName(s) ?? s.sci, es = NAMES[a.sci]?.[1] ?? spanishName(s) ?? en;
  return {
    id: a.id, q: a.qid, sci: a.sci, n: [en, es], g: a.g, ...(a.g2 ? { g2: a.g2 } : {}), e: emojiOf(a.sci, a.tax),
    fam: a.tax?.family ?? null, ord: a.tax?.order ?? null, cls: a.tax?.class ?? null, st: status, sl: a.sl,
    ...(Object.keys(facts).length ? { f: facts } : {}),
    ...(s.img ? { img: s.img } : {}), ...(s.audio ? { snd: s.audio } : {}),
    ...(a.gone ? { gone: a.gone, last: e.place } : {}), ...(e?.story ?? STORY[a.sci] ? { story: e?.story ?? STORY[a.sci] } : {}),
    cc: [...cc].sort(), home: a.home, best: (best.get(a.id) ?? []).map((pi) => parks[pi].qid),
    c: packCells(cs), k: packCounts(cs.map((c) => a.cells.get(c))),
  };
});

const parkOut = parks.map((p, i) => {
  const area = p.area && AREA[p.area[1]] ? Math.round(p.area[0] * AREA[p.area[1]]) : null;
  return {
    id: p.qid, n: placeName(p), at: p.at, k: p.kind === 'np' ? 'np' : 'res', sl: p.sl, cc: p.cc,
    ...(area ? { km2: area } : {}), ...(p.whs ? { whs: Number(p.whs) || p.whs } : {}), ...(p.img ? { img: p.img } : {}),
    f: famous[i].slice(0, 5).map((ai) => animals[ai].id),
  };
});
const zooOut = zoos.map((p) => ({ id: p.qid, n: placeName(p), at: p.at, k: p.kind === 'aquarium' ? 'aq' : 'zoo', sl: p.sl, cc: p.cc, ...(p.img ? { img: p.img } : {}) }));

// Migrations through the year: researched by hand (scripts/data/wild/migrations.json), checked and copied.
const migrations = read(path.join(ROOT, 'scripts/data/wild/migrations.json'));
const migProblems = [];
const ids = new Set();
for (const m of migrations.migrations) {
  if (ids.has(m.id)) migProblems.push(`migration ${m.id} twice`);
  ids.add(m.id);
  if (m.months?.length !== 12) migProblems.push(`migration ${m.id}: ${m.months?.length} months`);
  if (!m.name?.en || !m.name?.es || !m.text?.en || !m.text?.es || !m.sources?.length || (m.path?.length ?? 0) < 2) migProblems.push(`migration ${m.id}: missing text, sources or path`);
  for (const p of [...m.path, ...m.months.filter(Boolean)]) if (Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) migProblems.push(`migration ${m.id}: bad point ${p}`);
}

const files = {
  'animals.json': { grid: { cols: COLS, rows: ROWS, deg: DEG }, credit: 'GBIF.org occurrence data (CC0 and CC BY records), Wikidata (CC0)', animals },
  'parks.json': { parks: parkOut },
  'zoos.json': { zoos: zooOut },
  'migrations.json': migrations,
};

// ---- Checks ---------------------------------------------------------------------------------------------------
const problems = [...migProblems];
const byName = (en) => animals.find((a) => a.n[0] === en);
const unpack = unpackCells;
const livesAt = (en, lon, lat) => {
  const a = byName(en);
  if (!a) { problems.push(`missing: ${en}`); return; }
  const want = cellAt(lon, lat), cells = new Set(unpack(a.c));
  if (![want, ...neighbours(want)].some((c) => cells.has(c))) problems.push(`${en} does not live at ${lon}, ${lat}`);
};
livesAt('Lion', 34.8, -2.6); livesAt('Polar bear', -95, 72); livesAt('Jaguar', -57, -17); livesAt('Giant panda', 103.5, 31);
livesAt('Koala', 149, -28.5); livesAt('Emperor penguin', 166.7, -77.8); livesAt('Dodo', 57.57, -20.28); livesAt('American bison', -110.5, 44.6);
for (const [en, lon, lat] of [['Lion', -100, 40], ['Polar bear', 20, 0], ['Koala', -60, -10], ['House sparrow', -58.4, -34.6]]) {
  const a = byName(en); if (a && new Set(unpack(a.c)).has(cellAt(lon, lat))) problems.push(`${en} should not live at ${lon}, ${lat}`);
}
for (const a of animals) {
  if (!a.n[0] || (a.n[0] === a.sci && !NAMES[a.sci])) problems.push(`no English name: ${a.sci}`);
  if (Object.keys(CURATED).length && !CURATED[a.sci]) problems.push(`no checked names in names.json: ${a.sci}`);
  if (!a.c) problems.push(`no range: ${a.n[0]}`);
}
const n = {}; for (const a of animals) n[a.gone ? 'gone' : a.g] = (n[a.gone ? 'gone' : a.g] ?? 0) + 1;

if (CHECK) {
  for (const [f, d] of Object.entries(files)) {
    const p = path.join(OUT, f);
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== JSON.stringify(d) + '\n') problems.push(`${f} is out of date: run node scripts/data/wild/build-wild.mjs`);
  }
  if (problems.length) { console.error(`wild checks failed:\n  ${problems.join('\n  ')}`); process.exit(1); }
  console.log(`wild checks passed (${animals.length} animals, ${parkOut.length} parks, ${zooOut.length} zoos and aquariums)`);
} else {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [f, d] of Object.entries(files)) fs.writeFileSync(path.join(OUT, f), JSON.stringify(d) + '\n');
  const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
  console.log(`animals.json: ${animals.length} (${JSON.stringify(n)}) ${kb('animals.json')} KB; parks.json: ${parkOut.length} ${kb('parks.json')} KB; zoos.json: ${zooOut.length} ${kb('zoos.json')} KB`);
  if (problems.length) console.warn(`problems:\n  ${problems.join('\n  ')}`);
}
