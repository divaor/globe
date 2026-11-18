#!/usr/bin/env node
/**
 * States and provinces (v0.38.0): for the twelve countries with capitals, each state's capital, area and population,
 * and its three biggest other cities, in English and Spanish: public/data/states/states.json. The borders and the
 * states' own names are the States and provinces quiz's (public/data/regions, v0.10.0); the other 36 countries play
 * with names only.
 *
 * Sources: Wikidata (CC0) for each state's capital, area and population, by its ISO 3166-2 code, through QLever
 * (fetch-states.mjs, kept in .cache/states); GeoNames (CC BY 4.0, cities500, kept in .cache/geonames) for the cities,
 * each put in the state whose border holds it; their names in English and Spanish from Wikidata by GeoNames id.
 *
 *   node scripts/data/states/build-states.mjs            build
 *   node scripts/data/states/build-states.mjs --check    check the file against the borders (no network)
 *   node scripts/data/states/build-states.mjs --list     also print every state (to review)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';
import { geoArea, geoBounds, geoContains, geoDistance } from 'd3-geo';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'public/data/states/states.json');
const REGIONS = path.join(ROOT, 'public/data/regions');

/** The twelve, with their ISO 3166-1 alpha-2 codes (GeoNames' country codes). */
export const COUNTRIES = { MEX: 'MX', USA: 'US', BRA: 'BR', ARG: 'AR', COL: 'CO', CHL: 'CL', PER: 'PE', ESP: 'ES', CAN: 'CA', AUS: 'AU', DEU: 'DE', IND: 'IN' };

/** Spain's regions are grouped from Natural Earth's provinces, with ids of their own: their ISO 3166-2 codes. */
const SPAIN = {
  'ES-ForaldeNavar': 'ES-NC', 'ES-PasVasco': 'ES-PV', 'ES-Aragn': 'ES-AR', 'ES-Catalua': 'ES-CT', 'ES-Extremadura': 'ES-EX',
  'ES-Andaluca': 'ES-AN', 'ES-Galicia': 'ES-GA', 'ES-CastillayLen': 'ES-CL', 'ES-Valenciana': 'ES-VC', 'ES-Murcia': 'ES-MC',
  'ES-Asturias': 'ES-AS', 'ES-Cantabria': 'ES-CB', 'ES-CanaryIs': 'ES-CN', 'ES-IslasBaleare': 'ES-IB', 'ES-LaRioja': 'ES-RI',
  'ES-CastillaLaMa': 'ES-CM', 'ES-Madrid': 'ES-MD',
};
/** Natural Earth's codes where they are not ISO 3166-2's: Bogotá carries Cundinamarca's, Cundinamarca and Lima
 *  Province have their own. */
const FIX = { 'CO-CUN': 'CO-DC', 'COL-1398': 'CO-CUN', 'PER-587': 'PE-LMA' };
export const isoOf = (id) => SPAIN[id] ?? FIX[id] ?? id;
/** Codes ISO 3166-2 has changed since (Mexico City in 2017; four Indian states in 2023): Wikidata may have either. */
const ALT = { 'MX-DIF': ['MX-CMX'], 'IN-UT': ['IN-UK'], 'IN-OR': ['IN-OD'], 'IN-CT': ['IN-CG'], 'IN-TG': ['IN-TS'] };
const codesOf = (iso) => [iso, ...(ALT[iso] ?? [])];

/**
 * Capitals by hand where Wikidata gives two, or none now: the code → the capital's name in GeoNames (its biggest
 * place of that name in the country), a note in English and Spanish, and `self` for a city that is a state of its own
 * (Mexico City, Berlin...: no capital to ask).
 */
const CAPITAL = {
  // Cities that are states of their own.
  'MX-DIF': { name: 'Mexico City', self: 1 }, 'AR-C': { name: 'Buenos Aires', self: 1 }, 'US-DC': { name: 'Washington', self: 1 },
  'CO-DC': { name: 'Bogotá', self: 1 }, 'PE-LMA': { name: 'Lima', self: 1 }, 'DE-BE': { name: 'Berlin', self: 1 }, 'DE-HH': { name: 'Hamburg', self: 1 },
  'IN-CH': { name: 'Chandigarh', self: 1 }, 'BR-DF': { name: 'Brasília', self: 1 }, 'IN-DL': { name: 'New Delhi' },
  // Two capitals, or a shared one.
  'ES-CN': { name: 'Santa Cruz de Tenerife', note: ['shared with Las Palmas de Gran Canaria', 'compartida con Las Palmas de Gran Canaria'] },
  'ES-CL': { name: 'Valladolid', note: ['the seat of its government: it has no official capital', 'sede de su gobierno: no tiene capital oficial'] },
  'IN-LA': { name: 'Leh', note: ['shared with Kargil', 'compartida con Kargil'] },
  'IN-JK': { name: 'Srinagar', note: ['in summer; Jammu in winter', 'en verano; Jammu en invierno'] },
  'IN-MH': { name: 'Mumbai', note: ['Nagpur is its second capital', 'Nagpur es su segunda capital'] },
  'IN-KA': { name: 'Bengaluru' },
  'IN-UT': { name: 'Dehradun', note: ['in winter; Gairsain in summer', 'en invierno; Gairsain en verano'] },
  'IN-HR': { name: 'Chandigarh', note: ['shared with Punjab, in a territory of its own', 'compartida con Punyab, en un territorio propio'] },
  'IN-PB': { name: 'Chandigarh', note: ['shared with Haryana, in a territory of its own', 'compartida con Haryana, en un territorio propio'] },
  // None now in Wikidata.
  'IN-OR': { name: 'Bhubaneswar' }, 'IN-CT': { name: 'Raipur' }, 'IN-TG': { name: 'Hyderabad' }, 'CO-BOL': { name: 'Cartagena' }, 'US-AK': { name: 'Juneau' },
};
/** GeoNames places that are parts of a city rather than cities (New York's boroughs). */
const NOT_CITY = new Set(['Brooklyn', 'Queens', 'The Bronx', 'Manhattan', 'Staten Island', 'Jervis Bay Village']);
/** Facts Wikidata lacks (census figures): people, the year, km². */
const FACTS = {
  'IN-DL': { p: 16787941, y: 2011, a: 1484 }, 'IN-CH': { p: 1055450, y: 2011, a: 114 },
  // Wikidata's Lima Department counts Lima Province too: the 2017 census less the province's (9,485,405 − 8,574,974),
  // and its area less the province's (34,828 − 2,672 km²).
  'PE-LIM': { p: 910431, y: 2017, a: 32156 },
};
/**
 * Names as people say them, for the long official ones ("Toluca de Lerdo", "Heroica Puebla de Zaragoza"): English and
 * Spanish; the official name is still accepted when typed. And names GeoNames has garbled, by its id.
 */
const SHORT = {
  'Toluca de Lerdo': 'Toluca', 'Ecatepec de Morelos': 'Ecatepec', 'León de Los Aldama': 'León', 'Acapulco de Juárez': 'Acapulco',
  'Chilpancingo de los Bravo': 'Chilpancingo', 'Oaxaca de Juárez': 'Oaxaca', 'Victoria de Durango': 'Durango', 'Santiago de Querétaro': 'Querétaro',
  'Tlaxcala de Xicoténcatl': 'Tlaxcala', 'Tlaxcala de Xicohténcatl': 'Tlaxcala', 'Heroica Puebla de Zaragoza': 'Puebla', 'Pachuca de Soto': 'Pachuca',
  'Xalapa-Enríquez': 'Xalapa', 'Heroica Matamoros': 'Matamoros', 'Heroica Ciudad de Juchitán de Zaragoza': 'Juchitán', 'Heroica Nogales': 'Nogales',
  'Tapachula de Córdova y Ordóñez': 'Tapachula', 'Comitán de Domínguez': 'Comitán', 'Uruapan del Progreso': 'Uruapan', 'Zamora de Hidalgo': 'Zamora',
  'Apatzingán de la Constitución': 'Apatzingán', 'Iguala de la Independencia': 'Iguala', 'Cuautla de Morelos': 'Cuautla', 'Yautepec de Zaragoza': 'Yautepec',
  'Poza Rica de Hidalgo': 'Poza Rica', 'Tenosique de Pino Suárez': 'Tenosique', 'Progreso de Castro': 'Progreso', 'Jerez de García Salinas': 'Jerez',
  'San Francisco de Campeche': 'Campeche', 'Ixtapa-Zihuatanejo': 'Zihuatanejo', 'San Fernando del Valle de Catamarca': 'Catamarca',
  'Gasteiz / Vitoria': 'Vitoria-Gasteiz', 'Mieres del Camino': 'Mieres',
};
const GN_NAME = {};
/** Wikidata labels that are garbled. */
const LABEL_FIX = { 'San Martíu Texmelucac': 'San Martín Texmelucan' };
/** A state wrapped around a city that is a state of its own: its districts are not the outer state's towns. */
const AROUND = { 'PE-LIM': [-77.03, -12.05, 40] };

/** GeoNames feature codes that are not towns in their own right (parts of a city, historical, abandoned...). */
const NOT_TOWN = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH', 'PPLR', 'PPLF', 'STLMT']);

const km = (a, b) => geoDistance(a, b) * 6371;

/** The regions of a country: id, ISO code, names and border. */
export function regionsOf(a3) {
  const topo = JSON.parse(fs.readFileSync(path.join(REGIONS, `${a3}.json`), 'utf8'));
  return feature(topo, topo.objects.regions).features.map((f) => ({ id: f.properties.id, iso: isoOf(f.properties.id), en: f.properties.n, es: f.properties.es, f }));
}

/** The places of GeoNames' cities500 in the twelve countries. */
function geonames() {
  const want = new Set(Object.values(COUNTRIES));
  const out = new Map();
  for (const line of fs.readFileSync(path.join(ROOT, '.cache/geonames/cities500.txt'), 'utf8').split('\n')) {
    const c = line.split('\t');
    if (c.length < 15 || !want.has(c[8]) || c[6] !== 'P' || NOT_TOWN.has(c[7])) continue;
    const pop = Number(c[14]) || 0;
    // (A seat of government with no count stays in: Tarapoto has none in GeoNames. Wikidata gives it one.)
    if (!pop && !c[7].startsWith('PPLA')) continue;
    if (!out.has(c[8])) out.set(c[8], []);
    out.get(c[8]).push({ gn: c[0], name: GN_NAME[c[1]] ?? c[1], ascii: c[2], lon: Number(c[5]), lat: Number(c[4]), pop, code: c[7], a1: c[10], a2: c[11], a3: c[12], a4: c[13] });
  }
  return out;
}

/** The value of a SPARQL binding. */
const v = (r, k) => r[k]?.value;
const point = (wkt) => { const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/i.exec(wkt ?? ''); return m ? [Number(m[1]), Number(m[2])] : null; };
const UNIT_KM2 = { 'http://www.wikidata.org/entity/Q712226': 1, 'http://www.wikidata.org/entity/Q25343': 1e-6, 'http://www.wikidata.org/entity/Q232291': 2.589988, 'http://www.wikidata.org/entity/Q81292': 0.00404686, 'http://www.wikidata.org/entity/Q35852': 0.01 };
const RANK = { 'http://wikiba.se/ontology#PreferredRank': 2, 'http://wikiba.se/ontology#NormalRank': 1, 'http://wikiba.se/ontology#DeprecatedRank': 0 };

/** The level of GeoNames' admin codes that is a municipality, per country (one place each among the other cities). */
const MUNI = { ES: 'a3', MX: 'a2', BR: 'a2', CO: 'a2', PE: 'a3', CL: 'a3', DE: 'a4' };
/** Where "X City" is the city's English name (Quebec City, Carson City), not a municipality's label. */
const CITY_NAMES = new Set(['US', 'CA', 'AU', 'IN']);
/** Spanish labels that are jokes or literal translations nobody uses. */
const BAD_ES = new Set(['Cuchillo amarillo']);
const norm = (x) => (x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const alike = (a, b) => !!a && !!b && norm(a).slice(0, 3) === norm(b).slice(0, 3);
/**
 * A place's English and Spanish names from Wikidata's labels, made plain: no municipality's label ("Bilbao City",
 * "Kreisfreie Stadt Oldenburg", "Calahorra (municipal capital)", "Ciudad de Valladolid"), and an English label that
 * looks nothing like the place's other names (a vandalised one) replaced by GeoNames' name.
 */
function plainNames(en, es, gname, ascii, a2) {
  let e = (LABEL_FIX[en] ?? en ?? '').replace(/\s*\([^)]*\)\s*$/, '').replace(/^Kreisfreie Stadt /, '').replace(/,\s*[^,]+\s(?:Province|District|Department|Municipality)$/, '').trim();
  let s = (es ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (BAD_ES.has(s)) s = '';
  const city = /^(.*\S)\s+(?:City|city|Municipality|municipality)$/.exec(e);
  if (city && !CITY_NAMES.has(a2) && (norm(city[1]) === norm(gname) || norm(city[1]) === norm(ascii) || norm(city[1]) === norm(s))) e = city[1];
  const ciudad = /^Ciudad de (.+)$/.exec(s);
  if (ciudad && (norm(ciudad[1]) === norm(e) || norm(ciudad[1]) === norm(gname))) s = ciudad[1];
  if (!e || !(alike(e, gname) || alike(e, ascii) || (alike(e, s) && alike(s, gname)))) e = /[^\u0000-\u00ff]/.test(gname ?? '') && ascii ? ascii : gname || s;
  // (A transliteration with marks, "Ngūr", in plain letters.)
  if (/[^\u0000-\u00ff]/.test(e) && ascii && norm(e) === norm(ascii)) e = ascii;
  const full = [e, s].filter((x) => x && SHORT[x]);
  e = SHORT[e] ?? e;
  s = SHORT[s] ?? s;
  return { en: e, es: s && s !== e ? s : 0, full: [...new Set(full)] };
}

async function build() {
  const { divisions, populations, areas, namesByGeonames } = await import('./fetch-states.mjs');
  const regions = Object.fromEntries(Object.keys(COUNTRIES).map((a3) => [a3, regionsOf(a3)]));
  const codes = Object.values(regions).flat().flatMap((r) => codesOf(r.iso));
  const [divs, pops, ars] = [await divisions(codes), await populations(codes), await areas(codes)];
  const places = geonames();

  // The capital of each code (the one with a GeoNames id first), its population (the preferred, else the latest),
  // its area (the preferred, else the largest: the total, land and water).
  const cap = new Map();
  for (const r of divs) {
    const code = v(r, 'code');
    if (!v(r, 'cap')) continue;
    const c = { item: v(r, 'cap'), gn: v(r, 'capGn'), at: point(v(r, 'capCoord')), en: v(r, 'capEn'), es: v(r, 'capEs') };
    const list = cap.get(code) ?? [];
    const had = list.find((x) => x.item === c.item);
    // (One item comes in several rows: each field from whichever row has it.)
    if (had) { for (const k of ['gn', 'at', 'en', 'es']) had[k] ??= c[k]; } else list.push(c);
    cap.set(code, list);
  }
  const pop = new Map();
  for (const r of pops) {
    const code = v(r, 'code'), x = { n: Number(v(r, 'pop')), date: v(r, 'date') ?? '', rank: RANK[v(r, 'rank')] ?? 1 };
    if (!x.n || !x.rank) continue;
    const b = pop.get(code);
    if (!b || x.rank > b.rank || (x.rank === b.rank && x.date > b.date)) pop.set(code, x);
  }
  const areaList = new Map();
  for (const r of ars) {
    const code = v(r, 'code'), f = UNIT_KM2[v(r, 'unit')];
    if (!f) continue;
    const x = { a: Number(v(r, 'amount')) * f, rank: RANK[v(r, 'rank')] ?? 1 };
    if (!x.rank || !(x.a > 0)) continue;
    if (!areaList.has(code)) areaList.set(code, []);
    areaList.get(code).push(x);
  }
  // The area closest to the border's own (Tierra del Fuego's 987,168 km² counts Argentina's Antarctic claim).
  const borderArea = (f) => { let a = geoArea(f); if (a > 2 * Math.PI) a = 4 * Math.PI - a; return a * 6371 * 6371; };
  const areaOf = (iso, f) => {
    const list = codesOf(iso).flatMap((c) => areaList.get(c) ?? []);
    if (!list.length) return null;
    const own = borderArea(f);
    return list.reduce((best, x) => { const d = Math.abs(Math.log(x.a / own)), db = Math.abs(Math.log(best.a / own)); return d < db - 0.05 || (Math.abs(d - db) <= 0.05 && x.rank > best.rank) ? x : best; });
  };
  const popOf = (iso) => codesOf(iso).map((c) => pop.get(c)).find(Boolean);
  const capsOf = (iso) => codesOf(iso).flatMap((c) => cap.get(c) ?? []);

  const out = { source: 'Wikidata (CC0): capitals, area, population; GeoNames (CC BY 4.0): cities; borders: Natural Earth (public domain)', countries: {} };
  const problems = [];
  const chosen = [];
  for (const [a3, a2] of Object.entries(COUNTRIES)) {
    const regs = regions[a3];
    const span = (f) => { const [[w, so], [e, n]] = geoBounds(f); return km([w, so], [e < w ? e + 360 : e, n]); };
    // Each place in its state. First by the border; then each state's own first-level code in GeoNames (the one
    // with most people inside its border: in a small state such as Bremen, more of the neighbour's villages than
    // its own towns fall inside the simplified line); then every place by that code, the border deciding only where
    // a code has several states or none (a simplified line puts Manhattan's point in New Jersey).
    const inside = new Map(regs.map((r) => [r.id, []]));
    const countryPlaces = (places.get(a2) ?? []).filter((p) => !NOT_CITY.has(p.name));
    const where = new Map();
    for (const p of countryPlaces) {
      const r = regs.find((x) => geoContains(x.f, [p.lon, p.lat]));
      if (r) { inside.get(r.id).push(p); where.set(p, r); }
    }
    const codeOf = new Map(), byCode = new Map();
    for (const r of regs) {
      const votes = new Map();
      for (const p of inside.get(r.id)) votes.set(p.a1, (votes.get(p.a1) ?? 0) + p.pop);
      const a1 = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
      codeOf.set(r.id, a1);
      if (!byCode.has(a1)) byCode.set(a1, []);
      byCode.get(a1).push(r);
    }
    const inState = new Map(regs.map((r) => [r.id, []]));
    for (const p of countryPlaces) {
      const owners = byCode.get(p.a1) ?? [];
      const r = owners.length === 1 ? owners[0] : owners.find((x) => x === where.get(p)) ?? (owners.length ? null : where.get(p));
      if (r) inState.get(r.id).push(p);
    }
    const states = {};
    // A place by name in the country (the biggest of that name), for the capitals by hand.
    const byName = (name) => (places.get(a2) ?? []).filter((p) => p.name === name || p.ascii === name).sort((a, b) => b.pop - a.pop)[0];
    for (const r of regs) {
      const rank = (p) => p.pop || 50_000;
      const list = inState.get(r.id).slice().sort((a, b) => rank(b) - rank(a));
      const caps = capsOf(r.iso);
      const hand = CAPITAL[r.iso];
      let c, cp;
      if (hand) {
        cp = byName(hand.name);
        if (!cp) { problems.push(`${r.iso} ${r.en}: ${hand.name} not in GeoNames`); continue; }
        const w = caps.find((x) => x.gn === cp.gn || (x.at && km(x.at, [cp.lon, cp.lat]) < 15));
        c = { gn: cp.gn, en: w?.en ?? null, es: w?.es ?? null, at: [cp.lon, cp.lat] };
      } else {
        c = caps.find((x) => x.gn) ?? caps[0];
        if (!c) { problems.push(`${r.iso} ${r.en}: no capital in Wikidata`); continue; }
        if (caps.length > 1) problems.push(`${r.iso} ${r.en}: ${caps.length} capitals (${caps.map((x) => x.en).join(', ')}); took ${c.en}`);
        // The capital among GeoNames' places: by id, else the nearest within 15 km of its point (its name, or the biggest).
        // (Among all the country's places: a coastal or border capital can fall just outside its simplified state.)
        const near = c.at ? (places.get(a2) ?? []).filter((p) => km([p.lon, p.lat], c.at) < 15).sort((a, b) => b.pop - a.pop) : [];
        cp = list.find((p) => p.gn === c.gn) ?? near.find((p) => p.gn === c.gn) ?? near.find((p) => p.name.toLowerCase() === (c.en ?? '').toLowerCase() || p.ascii.toLowerCase() === (c.en ?? '').toLowerCase()) ?? near[0];
      }
      const at = cp ? [cp.lon, cp.lat] : c.at;
      if (!at) { problems.push(`${r.iso} ${r.en}: the capital ${c.en} has no point`); continue; }
      if (!cp) problems.push(`${r.iso} ${r.en}: the capital ${c.en} is not among GeoNames' places in it`);
      // The other cities to choose from: the biggest eight that are not the capital nor a part of it (in its
      // municipality, where GeoNames knows municipalities; else within 15 km), one per municipality and one per name.
      // (A state of its own, a city, has none: nothing to ask.)
      const mk = MUNI[a2], seen = new Set(), seenName = new Set();
      if (cp && mk && cp[mk]) seen.add(cp[mk]);
      if (cp) seenName.add(norm(cp.name));
      const cands = [];
      for (const p of hand?.self ? [] : list) {
        if (cands.length >= 14) break;
        if (p === cp || km([p.lon, p.lat], at) <= (mk ? 4 : 15) || seenName.has(norm(p.name))) continue;
        const ar = AROUND[r.iso];
        if (ar && km([p.lon, p.lat], [ar[0], ar[1]]) < ar[2]) continue;
        if (mk && p[mk]) { if (seen.has(p[mk])) continue; seen.add(p[mk]); }
        seenName.add(norm(p.name));
        cands.push(p);
      }
      const p = popOf(r.iso), ar = areaOf(r.iso, r.f), f = FACTS[r.iso];
      if (!p && !f) problems.push(`${r.iso} ${r.en}: no population`);
      if (!ar && !f) problems.push(`${r.iso} ${r.en}: no area`);
      states[r.id] = { iso: r.iso, en: r.en, a2, span: span(r.f), cap: { gn: cp?.gn ?? c.gn ?? null, gname: cp?.name ?? c.en, ascii: cp?.ascii ?? c.en, en: c.en, es: c.es, at, gpop: cp?.pop ?? 0, ...(hand?.note ? { note: hand.note } : {}), ...(hand?.self ? { self: 1 } : {}) }, cands, pop: f?.p ?? p?.n ?? null, popYear: f ? String(f.y) : p?.date?.slice(0, 4) ?? null, area: f?.a ?? (ar ? Math.round(ar.a) : null) };
      if (cp) chosen.push(cp.gn);
      for (const o of cands) chosen.push(o.gn);
    }
    out.countries[a3] = states;
  }

  // The cities' names in English and Spanish, and their people (Wikidata, by GeoNames id: GeoNames' own counts
  // can be a district's, Nabarangpur's); GeoNames' own otherwise.
  const names = new Map();
  // (Each batch kept under a hash of its ids, so a changed list asks again.)
  const ids = [...new Set(chosen)].sort();
  const tag = (list) => { let h = 2166136261; for (const ch of list.join()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
  for (let k = 0; k < ids.length; k += 200) {
    const batch = ids.slice(k, k + 200);
    for (const r of await namesByGeonames(batch, `cityinfo-${tag(batch)}`)) {
      const g = v(r, 'gn');
      if (!names.has(g)) names.set(g, []);
      let it = names.get(g).find((x) => x.item === v(r, 'item'));
      if (!it) { it = { item: v(r, 'item'), en: v(r, 'en'), es: v(r, 'es'), pop: 0, d: '' }; names.get(g).push(it); }
      it.en ??= v(r, 'en'); it.es ??= v(r, 'es');
      // (Its latest count; the bigger of two on one date.)
      const n = Number(v(r, 'pop')), d = v(r, 'date') ?? '';
      if (n > 0 && (d > it.d || (d === it.d && n > it.pop))) { it.pop = n; it.d = d; }
    }
  }
  // The file: a state → [capital en, es (0: as en), lon, lat, note?], area km², people, the year counted, and its
  // other cities [en, es (0: as en), lon, lat, people]; `big`: the first of them is bigger than the capital.
  const r5 = (x) => Math.round(x * 1e4) / 1e4;
  // (Several items can share a GeoNames id, an ancient city or a municipality with the town: the one named most
  // like GeoNames' place.)
  const named = (gn, gname) => {
    const list = names.get(gn) ?? [];
    // (And of two named alike, the plainer name: the town, not "its district".)
    const score = (x) => { const a = norm(x.en), b = norm(gname); let k = 0; while (k < a.length && a[k] === b[k]) k++; return k; };
    return list.slice().sort((x, y) => score(y) - score(x) || norm(x.en).length - norm(y.en).length)[0] ?? {};
  };
  // People: the count of the item named for the place (Wikidata's), else GeoNames' up to 50,000 (GeoNames gives
  // some towns their district's count, or a wrong one: Meads, Kentucky, 288,649; a real city has Wikidata's).
  const SURE = 50_000;
  const people = (gn, gname, own) => named(gn, gname).pop || Math.min(own, SURE);
  const sure = (gn, gname) => !!named(gn, gname).pop;
  const file = { source: out.source, countries: {} };
  for (const [a3, states] of Object.entries(out.countries)) {
    file.countries[a3] = {};
    for (const [id, s] of Object.entries(states)) {
      // The candidates by Wikidata's count (GeoNames' where it has none), named, one per name. The biggest of them
      // all, for "X is the biggest"; three spread over the state (a twentieth of its size apart from the capital and
      // each other, at least 10 km), for the State capitals deck's dots.
      // (The capital's count: the larger of the two: Wikidata's Tlaxcala is the locality, 13,555.)
      s.cap.pop = Math.max(named(s.cap.gn, s.cap.gname).pop || 0, s.cap.gpop);
      const capName = plainNames(s.cap.en ?? CAPITAL[s.iso]?.name, s.cap.es, s.cap.gname, s.cap.ascii, s.a2).en;
      const seenN = new Set([norm(capName)]);
      const ranked = [];
      for (const o of s.cands.map((o) => ({ ...o, pop: people(o.gn, o.name, o.pop) })).sort((x, y) => y.pop - x.pop)) {
        const w = named(o.gn, o.name), n = plainNames(w.en ?? o.name, w.es, o.name, o.ascii, s.a2);
        if (seenN.has(norm(n.en))) continue;
        seenN.add(norm(n.en));
        ranked.push({ ...o, n });
      }
      s.big = ranked[0] && s.cap.pop && ranked[0].pop > s.cap.pop * 1.3 && sure(ranked[0].gn, ranked[0].name) && sure(s.cap.gn, s.cap.gname) ? ranked[0] : null;
      // (At most 60 km: Valparaíso's border reaches Easter Island.)
      const gap = Math.min(60, Math.max(10, s.span / 20));
      s.others = [];
      for (const o of ranked) {
        if (s.others.length >= 3) break;
        if (km([o.lon, o.lat], s.cap.at) < gap || s.others.some((x) => km([o.lon, o.lat], [x.lon, x.lat]) < gap)) continue;
        s.others.push(o);
      }
      if (s.others.length < 3 && !s.cap.self) problems.push(`${s.iso} ${s.en}: only ${s.others.length} other cities`);
      const cn = s.cap.gn ? named(s.cap.gn, s.cap.gname) : {};
      const capN = plainNames(s.cap.en ?? cn.en ?? CAPITAL[s.iso]?.name, s.cap.es ?? cn.es, s.cap.gname, s.cap.ascii, s.a2);
      file.countries[a3][id] = {
        c: [capN.en, capN.es, r5(s.cap.at[0]), r5(s.cap.at[1]), s.cap.pop, ...(s.cap.note ? [s.cap.note] : [])],
        ...(capN.full.length ? { f: capN.full } : {}),
        ...(s.cap.self ? { s: 1 } : {}),
        a: s.area, p: s.pop, y: s.popYear ? Number(s.popYear) : null,
        o: s.others.map((o) => [o.n.en, o.n.es, r5(o.lon), r5(o.lat), o.pop]),
        ...(s.big ? { b: [s.big.n.en, s.big.n.es, s.big.pop] } : {}),
      };
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(file));
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${Object.values(file.countries).reduce((n, s) => n + Object.keys(s).length, 0)} states, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
  if (problems.length) console.log(`\n${problems.length} to look at:\n  ${problems.join('\n  ')}`);
  return file;
}

/** The file against the borders: every state of the twelve, a capital inside its state (or near), three cities. */
export function check(file = JSON.parse(fs.readFileSync(OUT, 'utf8'))) {
  const errs = [];
  for (const a3 of Object.keys(COUNTRIES)) {
    const regs = regionsOf(a3), states = file.countries[a3] ?? {};
    for (const r of regs) {
      const s = states[r.id];
      if (!s) { errs.push(`${a3} ${r.id}: missing`); continue; }
      if (!s.c?.[0]) errs.push(`${r.id}: no capital`);
      if (!(s.a > 0) || !(s.p > 0)) errs.push(`${r.id}: no area or population`);
      // (A city that is a state of its own has none, and Lakshadweep's islands have no other town.)
      if (!s.s && r.iso !== 'IN-LD' && (!Array.isArray(s.o) || s.o.length < 1)) errs.push(`${r.id}: no other cities`);
      if (s.c && !(Math.abs(s.c[2]) <= 180 && Math.abs(s.c[3]) <= 90)) errs.push(`${r.id}: the capital has no point`);
    }
  }
  return errs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--check')) {
    const errs = check();
    console.log(errs.length ? `${errs.length} problems:\n  ${errs.join('\n  ')}` : 'states.json: every state of the twelve has a capital, area, population and cities');
    process.exit(errs.length ? 1 : 0);
  }
  const file = await build();
  if (process.argv.includes('--list')) {
    for (const [a3, states] of Object.entries(file.countries)) {
      console.log(`\n${a3}`);
      for (const [id, s] of Object.entries(states)) console.log(`  ${id}: ${s.c[0]}${s.c[1] ? ` / ${s.c[1]}` : ''}${s.b ? ` (biggest: ${s.b[0]})` : ''} · ${s.a} km² · ${s.p} (${s.y}) · ${s.o.map((o) => o[0]).join(', ')}`);
    }
  }
}
