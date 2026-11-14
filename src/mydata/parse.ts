// Your own data: a CSV (or TSV, or a table pasted from a spreadsheet) read into a map. This module only reads and
// matches, with no page around it, so scripts/test/mydata.mjs checks it in Node:
//   - the table: the delimiter (comma, semicolon, tab or bar), quotes, a preamble above the header (World Bank
//     downloads have four lines of it), empty trailing columns;
//   - numbers written either way (1,234.5 or 1.234,5), with spaces, %, currency signs or brackets for minus;
//   - where each row is: a country (its name in English or Spanish, an alias, or an ISO code), a region inside a
//     country (a state, province, department...), or a point (latitude and longitude);
//   - the shape: one value per place, a row per place and year (Our World in Data), or a column per year (World
//     Bank); world and regional totals (World, Europe, High income...) are set aside, not reported as unknown.

export interface Table { header: string[]; rows: string[][]; delimiter: string; skipped: number }

const DELIMS = [',', ';', '\t', '|'];

/** Splits text into rows of fields (RFC 4180 quoting; \r\n, \n or \r line ends). */
export function splitRows(text: string, d: string, limit = Infinity): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false, i = 0;
  const n = text.length;
  while (i < n && rows.length < limit) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f.trim() === '') { q = true; f = ''; i++; continue; }
    if (c === d) { row.push(f); f = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      row.push(f); rows.push(row); row = []; f = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
      i++; continue;
    }
    f += c; i++;
  }
  if (rows.length < limit && (f !== '' || row.length)) { row.push(f); rows.push(row); }
  return rows;
}

/** Reads a table: finds the delimiter, the header row and the rows under it. */
export function parseTable(raw: string): Table {
  const text = raw.replace(/^﻿/, '');
  // The delimiter: the one that splits the first lines into the most, most consistent columns.
  let best = { d: ',', score: -1, mode: 1 };
  for (const d of DELIMS) {
    const sample = splitRows(text, d, 40).filter((r) => r.some((x) => x.trim()));
    if (!sample.length) continue;
    const counts = new Map<number, number>();
    for (const r of sample) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    const [mode, freq] = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (mode < 2) continue;
    const score = (freq / sample.length) * Math.log2(mode + 1);
    if (score > best.score) best = { d, score, mode };
  }
  const all = splitRows(text, best.d).filter((r) => r.some((x) => x.trim()));
  // The header: the first row as wide as most rows (a preamble's rows are narrower).
  const mode = best.mode;
  let h = all.findIndex((r) => r.length >= Math.max(2, mode * 0.8));
  if (h < 0) h = 0;
  let header = (all[h] ?? []).map((x) => x.trim());
  let rows = all.slice(h + 1).map((r) => r.map((x) => x.trim()));
  // Columns with no name and nothing in them (a trailing comma on every line) go.
  const keep = header.map((name, j) => name !== '' || rows.some((r) => (r[j] ?? '') !== ''));
  header = header.filter((_, j) => keep[j]).map((name, j) => name || `Column ${j + 1}`);
  rows = rows.map((r) => r.filter((_, j) => keep[j]));
  return { header, rows, delimiter: best.d, skipped: h };
}

// ---- Numbers -------------------------------------------------------------------------------------
const MISSING = /^(|na|n\/a|nan|null|none|-|–|—|\.\.|\.|…|x|s\/d|nd|n\.d\.)$/i;

/** Which mark is the decimal point in a column of numbers: '.' or ',' (a semicolon-separated file leans to ','). */
export function guessDecimal(samples: string[], delimiter: string): '.' | ',' {
  let dot = 0, comma = 0;
  for (const raw of samples) {
    const s = raw.replace(/[\s  %$€£¥]/g, '').replace(/^[+\-−]/, '');
    // "1.234" or "1,234" could be either (a thousand, or one and a bit): it does not vote.
    if (/^\d{1,3}[.,]\d{3}$/.test(s)) continue;
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^\d{1,3}(\.\d{3}){2,}$/.test(s) || /^\d*,\d+$/.test(s)) comma++;
    else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s) || /^\d{1,3}(,\d{3}){2,}$/.test(s) || /^\d*\.\d+$/.test(s)) dot++;
  }
  if (comma > dot) return ',';
  if (dot > comma) return '.';
  return delimiter === ';' ? ',' : '.';
}

/** A number from a cell (null when empty or not a number). Percentages stay as written (45% is 45). */
export function toNumber(raw: string, dec: '.' | ','): number | null {
  let s = raw.trim();
  if (MISSING.test(s)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s  ']/g, '').replace(/−/g, '-')
    .replace(/^[^\d+\-.,]+/, '').replace(/%$/, '').replace(/[^\d.,]+$/, '');
  if (dec === ',') s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  else s = s.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return isFinite(v) ? (neg ? -v : v) : null;
}

// ---- Names ---------------------------------------------------------------------------------------
/** Lower case, no accents or punctuation, "&" as "and", no leading "the". */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[’'`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/^the /, '').replace(/ the$/, '');
}

export interface CountryMeta { n: string; es?: string; a2?: string | null }

/** Other names countries go by in data files (World Bank, the UN, Our World in Data, Spanish sources). */
const ALIASES: Record<string, string[]> = {
  USA: ['usa', 'us', 'u s', 'u s a', 'united states', 'eeuu', 'ee uu', 'estados unidos de america'],
  GBR: ['uk', 'u k', 'great britain', 'britain', 'united kingdom of great britain and northern ireland', 'gran bretana'],
  RUS: ['russian federation', 'federacion de rusia', 'federacion rusa'],
  KOR: ['korea', 'korea rep', 'korea republic of', 'republic of korea', 'korea south', 'south korea', 'corea', 'republica de corea'],
  PRK: ['korea dem peoples rep', 'korea dem rep', 'democratic peoples republic of korea', 'korea north', 'dprk'],
  IRN: ['iran islamic rep', 'iran islamic republic of', 'islamic republic of iran'],
  EGY: ['egypt arab rep'], YEM: ['yemen rep'], SYR: ['syrian arab republic'], VEN: ['venezuela rb', 'venezuela bolivarian republic of'],
  BOL: ['bolivia plurinational state of'], TZA: ['tanzania united republic of', 'united republic of tanzania'], VNM: ['viet nam'],
  LAO: ['lao pdr', 'lao peoples democratic republic', 'lao'], CZE: ['czechia', 'chequia'], TUR: ['turkiye', 'turquia'],
  CIV: ['cote divoire', 'cote d ivoire', 'ivory coast', 'costa de marfil'],
  COD: ['congo dem rep', 'democratic republic of congo', 'dr congo', 'drc', 'congo kinshasa', 'rd congo', 'republica democratica del congo'],
  COG: ['congo rep', 'congo', 'congo brazzaville', 'republic of congo'], GMB: ['gambia'], BHS: ['bahamas'],
  FSM: ['micronesia fed sts', 'micronesia', 'micronesia federated states of'], LCA: ['st lucia'], KNA: ['st kitts and nevis'],
  VCT: ['st vincent and the grenadines', 'st vincent and grenadines'], KGZ: ['kyrgyz republic'], SVK: ['slovak republic'],
  MKD: ['macedonia', 'fyrom', 'macedonia fyr', 'north macedonia'], SWZ: ['swaziland', 'eswatini'], MMR: ['burma', 'myanmar'],
  CPV: ['cape verde', 'cabo verde'], TLS: ['timor leste', 'east timor'], HKG: ['hong kong sar china', 'hong kong'],
  MAC: ['macao sar china', 'macau', 'macao'], PSE: ['west bank and gaza', 'palestinian territories', 'state of palestine', 'palestine state of'],
  BRN: ['brunei darussalam'], MDA: ['moldova republic of', 'republic of moldova'], VAT: ['holy see', 'vatican'],
  CUW: ['curacao'], SXM: ['sint maarten dutch part'], MAF: ['st martin french part', 'saint martin french part'],
  TWN: ['taiwan province of china', 'chinese taipei', 'taiwan'], XKX: ['kosovo', 'owid kos'], NLD: ['netherlands', 'holland', 'paises bajos'],
  STP: ['sao tome and principe'], BIH: ['bosnia', 'bosnia herzegovina'], TTO: ['trinidad', 'trinidad tobago'], ATG: ['antigua'],
  DOM: ['dominican rep'], CAF: ['central african rep', 'car'], ARE: ['uae', 'emiratos arabes'], SAU: ['ksa'], PNG: ['png'],
  VIR: ['virgin islands us', 'us virgin islands'], VGB: ['british virgin islands', 'virgin islands british'], CYN: ['northern cyprus'],
  MEX: ['mejico'], PER: ['peru'], BRA: ['brasil'], DEU: ['alemania'], ESP: ['espana'], JPN: ['japon'], CHN: ['china peoples republic of', 'peoples republic of china'],
};

/** Totals for more than one country (set aside, not reported as unknown). */
const GROUP = /\b(world|mundo|income|ingreso|countries|paises|region|union|ida|ibrd|oecd|ocde|area|members|total|africa|asia|europe|europa|america|americas|oceania|caribbean|caribe|pacific|middle east|sub saharan|small states|fragile|dividend|least developed|heavily indebted|g20|g7|euro|ussr|yugoslavia|czechoslovakia|international|excl|including|un)\b/;

/** Places that some files list on their own but this map draws as part of a country (France's overseas
 * departments, the Caribbean Netherlands...): set aside and named, not reported as unknown. */
const PARTS = new Set(['GUF', 'GLP', 'MTQ', 'MYT', 'REU', 'BES', 'SJM', 'TKL', 'CXR', 'CCK', 'ANT']);
const PART_NAMES = /^(french guiana|guyane|guayana francesa|guadeloupe|guadalupe|martinique|martinica|mayotte|reunion|bonaire sint eustatius and saba|caribbean netherlands|bonaire|channel islands|svalbard and jan mayen|svalbard|tokelau|christmas island|cocos keeling islands|netherlands antilles)$/;

export type CountryMatch = string | 'group' | 'part' | null;
export interface CountryIndex { match(raw: string): CountryMatch; name(id: string, lang: 'en' | 'es'): string }

/** Matches country names (English, Spanish, aliases) and ISO codes (alpha-3 and alpha-2) to the map's ids. */
export function countryIndex(meta: Record<string, CountryMeta>): CountryIndex {
  const by = new Map<string, string>();
  const put = (k: string | null | undefined, id: string) => { if (k) { const n = norm(k); if (n && !by.has(n)) by.set(n, id); } };
  for (const [id, m] of Object.entries(meta)) { put(m.n, id); put(m.es, id); }
  for (const [id, list] of Object.entries(ALIASES)) if (meta[id]) for (const a of list) by.set(norm(a), id);
  const a3 = new Set(Object.keys(meta).map((k) => k.toUpperCase()));
  const a2 = new Map<string, string>();
  for (const [id, m] of Object.entries(meta)) if (m.a2 && !a2.has(m.a2.toUpperCase())) a2.set(m.a2.toUpperCase(), id);
  a2.set('XK', 'XKX'); a2.set('UK', 'GBR');
  return {
    match(raw: string): CountryMatch {
      const s = raw.trim();
      if (!s) return null;
      if (/^owid_kos$/i.test(s)) return 'XKX';
      if (/^owid_/i.test(s)) return 'group';
      if (/^[A-Za-z]{3}$/.test(s) && a3.has(s.toUpperCase())) return s.toUpperCase();
      if (/^[A-Z]{3}$/.test(s) && PARTS.has(s)) return 'part';
      if (/^[A-Z]{2}$/.test(s) && a2.has(s)) return a2.get(s)!;
      const n = norm(s);
      const bare = norm(s.replace(/\s*\([^)]*\)\s*$/, ''));
      const hit = by.get(n) ?? by.get(n.replace(/^republic of /, '')) ?? by.get(bare);
      if (hit) return hit;
      if (PART_NAMES.test(n) || PART_NAMES.test(bare)) return 'part';
      return GROUP.test(n) ? 'group' : null;
    },
    name(id, lang) { const m = meta[id]; return m ? (lang === 'es' && m.es ? m.es : m.n) : id; },
  };
}

// ---- Regions -------------------------------------------------------------------------------------
export interface RegionMeta { n: string; es?: string; a: string; t?: string }
export interface RegionIndex { match(raw: string, country?: string | null): string | null }
/** The id a region gets: its country and English name. */
export const regionId = (r: RegionMeta) => `${r.a}|${r.n}`;

/** Words in region names that data files often add or leave out ("Province of", "Departamento de", "State"). */
const REGION_WORDS = /\b(province|provincia|state|estado|departamento|department|region|oblast|prefecture|county|municipality|governorate|district|territory|territorio|of|de|del|la|el|do|da|dos|das)\b/g;
const loose = (s: string) => norm(s).replace(REGION_WORDS, ' ').replace(/\s+/g, ' ').trim();

/** Matches region names (English or Spanish, with or without "Province", "State of"...), within a country when
 * the row names one, else among the regions whose name is not shared by two countries. */
export function regionIndex(regions: RegionMeta[]): RegionIndex {
  const inCountry = new Map<string, Map<string, string>>();
  const global = new Map<string, string | null>();
  for (const r of regions) {
    const id = regionId(r);
    let m = inCountry.get(r.a);
    if (!m) inCountry.set(r.a, (m = new Map()));
    for (const name of [r.n, r.es]) {
      if (!name) continue;
      for (const k of [norm(name), loose(name)]) {
        if (!k) continue;
        if (!m.has(k)) m.set(k, id);
        global.set(k, global.has(k) && global.get(k) !== id ? null : id);
      }
    }
  }
  // Mexico's capital goes by several names (the map has it as "Mexico", its federal district; "México" alone, as
  // Mexican statistics write it, is the State of Mexico).
  const mx = inCountry.get('MEX');
  const df = regions.find((r) => r.a === 'MEX' && r.t === 'Federal District');
  if (mx && df) for (const k of ['cdmx', 'ciudad de mexico', 'mexico city', 'distrito federal', 'df', 'mexico df', 'ciudad mexico']) mx.set(k, regionId(df));
  return {
    match(raw, country) {
      const k1 = norm(raw), k2 = loose(raw);
      if (!k1) return null;
      if (country) { const m = inCountry.get(country); return m?.get(k1) ?? m?.get(k2) ?? null; }
      return global.get(k1) ?? global.get(k2) ?? null;
    },
  };
}

// ---- What the table holds -------------------------------------------------------------------------
export type Geo = 'country' | 'region' | 'points';
export interface Column { j: number; name: string; kind: 'number' | 'category' | 'text' }
export interface Plan {
  geo: Geo;
  /** The column naming the place (country or region); with regions, also the country's column if there is one. */
  place: number; country: number | null;
  /** A column of names to show when the place column holds codes (Our World in Data's Entity beside its Code). */
  label: number | null;
  lat: number | null; lon: number | null;
  /** A column of years (a row per place and year), or columns that are years (a column per year). */
  year: number | null; yearCols: { j: number; year: number }[];
  decimal: '.' | ',';
  columns: Column[];
}

const H = (s: string) => norm(s);
const LAT = /^(lat|latitude|latitud|lat dd|y)$/, LON = /^(lon|lng|long|longitude|longitud|lon dd|x)$/;
const YEAR = /^(year|years|ano|anio|anos|date|fecha|period|periodo|time)$/;
const isYear = (v: number | null) => v !== null && Number.isInteger(v) && v >= 1000 && v <= 2200;

/** Works out where the rows are and which columns hold values. */
export function planTable(t: Table, countries: CountryIndex, regions?: RegionIndex | null): Plan | { error: 'empty' | 'noplace' } {
  const { header, rows } = t;
  if (!rows.length || header.length < 2) return { error: 'empty' };
  const sample = rows.length > 400 ? rows.filter((_, i) => i % Math.ceil(rows.length / 400) === 0) : rows;
  const col = (j: number) => sample.map((r) => r[j] ?? '').filter((v) => !MISSING.test(v.trim()));
  const decimal = guessDecimal(header.flatMap((_, j) => col(j).slice(0, 60)), t.delimiter);
  const numShare = (j: number) => { const v = col(j); return v.length ? v.filter((x) => toNumber(x, decimal) !== null).length / v.length : 0; };
  // Columns that are years (World Bank: 1960, 1961, ...).
  const yearCols = header.map((name, j) => ({ j, year: /^\s*(1[0-9]{3}|2[01][0-9]{2})(\s*\[YR\d{4}\])?\s*$/.test(name) ? Number(name.trim().slice(0, 4)) : NaN }))
    .filter((c) => !isNaN(c.year));
  const wide = yearCols.length >= 3;
  // Points: latitude and longitude columns.
  const lat = header.findIndex((n, j) => LAT.test(H(n)) && numShare(j) > 0.9 && col(j).every((v) => Math.abs(toNumber(v, decimal) ?? 0) <= 90));
  const lon = header.findIndex((n, j) => LON.test(H(n)) && numShare(j) > 0.9 && col(j).every((v) => Math.abs(toNumber(v, decimal) ?? 0) <= 360));
  // A column of years.
  const yearJ = wide ? -1 : header.findIndex((n, j) => YEAR.test(H(n)) && col(j).every((v) => isYear(toNumber(v, '.'))));
  // The country column: the text column whose values most often name a country (codes count too).
  const placeShare = (j: number, f: (v: string) => boolean) => {
    const vals = [...new Set(col(j))];
    const real = vals.filter((v) => { const m = countries.match(v); return m !== 'group' && m !== 'part'; });
    return real.length ? real.filter(f).length / real.length : 0;
  };
  const textCols = header.map((_, j) => j).filter((j) => j !== lat && j !== lon && j !== yearJ && !yearCols.some((c) => c.j === j) && numShare(j) < 0.5);
  let country: number | null = null, cBest = 0;
  for (const j of textCols) {
    const s = placeShare(j, (v) => !!countries.match(v)) + (/country|pais|nation|iso|code|codigo|entity/.test(H(header[j])) ? 0.05 : 0);
    if (s > cBest) { cBest = s; country = j; }
  }
  if (cBest < 0.5) country = null;
  // A region column: names regions inside the row's country (or, alone, regions anywhere).
  let region: number | null = null;
  if (regions) {
    let rBest = 0;
    for (const j of textCols) {
      if (j === country) continue;
      const vals = sample.filter((r) => (r[j] ?? '').trim());
      if (!vals.length) continue;
      const hits = vals.filter((r) => regions.match(r[j], country !== null ? (() => { const c = countries.match(r[country!]); return c && c !== 'group' && c !== 'part' ? c : null; })() : null)).length / vals.length;
      const s = hits + (/region|state|estado|province|provincia|departamento|department|county|condado/.test(H(header[j])) ? 0.05 : 0);
      if (s > rBest) { rBest = s; region = j; }
    }
    if (rBest < (country !== null ? 0.5 : 0.7)) region = null;
  }
  const geo: Geo | null = lat >= 0 && lon >= 0 ? 'points' : region !== null ? 'region' : country !== null ? 'country' : null;
  if (!geo) return { error: 'noplace' };
  const place = geo === 'region' ? region! : geo === 'country' ? country! : (textCols.find((j) => /name|nombre|city|ciudad|place|lugar|label|title|titulo/.test(H(header[j]))) ?? textCols[0] ?? -1);
  const label = geo === 'country' && /code|iso|codigo/.test(H(header[place]))
    ? textCols.find((j) => j !== place && /entity|country|name|pais|nombre/.test(H(header[j]))) ?? null : null;
  const used = new Set([place, country, label, lat, lon, yearJ, ...yearCols.map((c) => c.j)].filter((j): j is number => j !== null && j >= 0));
  const columns: Column[] = header.map((name, j) => ({ j, name })).filter((c) => !used.has(c.j)).map(({ j, name }) => {
    const v = col(j);
    if (!v.length) return { j, name, kind: 'text' as const };
    if (numShare(j) >= 0.8) return { j, name, kind: 'number' as const };
    const distinct = new Set(v).size;
    return { j, name, kind: distinct <= Math.max(12, Math.min(40, v.length * 0.5)) ? 'category' as const : 'text' as const };
  }).filter((c) => !(/^(code|codigo|iso|iso3|iso2|iso a3|iso a2|id|country code|indicator code|series code)$/.test(H(c.name)) && c.kind !== 'number'));
  return { geo, place, country: geo === 'region' ? country : null, label, lat: lat >= 0 ? lat : null, lon: lon >= 0 ? lon : null, year: yearJ >= 0 ? yearJ : null, yearCols: wide ? yearCols : [], decimal, columns };
}

// ---- The values ----------------------------------------------------------------------------------
export interface Built {
  geo: Geo;
  /** The value columns that can be shown (a column per year makes one column, its name the indicator's). */
  columns: { key: string; name: string; kind: 'number' | 'category' }[];
  /** The years, oldest first (empty when the table has none). */
  years: number[];
  /** values[column key][year, or '' without years][place id] */
  values: Record<string, Record<string, Record<string, number | string>>>;
  /** Points: where, what they are called, and the whole row. */
  points: { lat: number; lon: number; label: string; row: string[] }[];
  /** Names of places (as written in the file) and of the regions they belong to. */
  labels: Record<string, string>;
  matched: number; unmatched: string[]; groups: string[];
  /** Places this map draws as part of a country (French Guiana...). */
  parts: string[];
  rows: number;
}

/** Reads the values: each row to its place (and year), numbers parsed, totals set aside. */
export function buildData(t: Table, p: Plan, countries: CountryIndex, regions?: RegionIndex | null): Built {
  const out: Built = { geo: p.geo, columns: [], years: [], values: {}, points: [], labels: {}, matched: 0, unmatched: [], groups: [], parts: [], rows: t.rows.length };
  const unmatched = new Set<string>(), groups = new Set<string>(), parts = new Set<string>(), years = new Set<number>(), places = new Set<string>();
  const set = (key: string, y: string, id: string, v: number | string) => { ((out.values[key] ??= {})[y] ??= {})[id] = v; };
  const valueCols = p.columns.filter((c) => c.kind !== 'text');
  // A column per year: one indicator, named by the "Indicator Name" column when there is one.
  const indicatorJ = t.header.findIndex((h) => /^(indicator name|series name|indicator|serie|indicador)$/.test(norm(h)));
  for (const r of t.rows) {
    if (p.geo === 'points') {
      const la = toNumber(r[p.lat!] ?? '', p.decimal), lo = toNumber(r[p.lon!] ?? '', p.decimal);
      if (la === null || lo === null || Math.abs(la) > 90) { unmatched.add(r.slice(0, 2).join(' ')); continue; }
      const id = `p${out.points.length}`;
      out.points.push({ lat: la, lon: lo > 180 ? lo - 360 : lo, label: p.place >= 0 ? (r[p.place] ?? '') : '', row: r });
      for (const c of valueCols) {
        const raw = r[c.j] ?? '';
        if (c.kind === 'number') { const v = toNumber(raw, p.decimal); if (v !== null) set(String(c.j), '', id, v); } else if (raw.trim()) set(String(c.j), '', id, raw.trim());
      }
      out.matched++;
      continue;
    }
    const name = (r[p.place] ?? '').trim();
    if (!name) continue;
    const shown = p.label !== null && r[p.label]?.trim() ? r[p.label].trim() : name;
    let id: string | null = null;
    if (p.geo === 'country') {
      const m = countries.match(name);
      if (m === 'group') { groups.add(shown); continue; }
      if (m === 'part') { parts.add(shown); continue; }
      id = m;
    } else {
      const cm = p.country !== null ? countries.match(r[p.country] ?? '') : null;
      if (cm === 'group' || cm === 'part') { (cm === 'group' ? groups : parts).add(r[p.country!]); continue; }
      id = regions?.match(name, cm) ?? null;
    }
    if (!id) { unmatched.add(p.geo === 'region' && p.country !== null ? `${name} (${r[p.country] ?? ''})` : shown); continue; }
    places.add(id);
    out.labels[id] ??= name;
    if (p.yearCols.length) {
      const key = indicatorJ >= 0 ? `ind:${r[indicatorJ]}` : 'value';
      for (const { j, year } of p.yearCols) { const v = toNumber(r[j] ?? '', p.decimal); if (v !== null) { set(key, String(year), id, v); years.add(year); } }
      continue;
    }
    const y = p.year !== null ? toNumber(r[p.year] ?? '', '.') : null;
    if (p.year !== null && !isYear(y)) continue;
    if (y !== null) years.add(y);
    for (const c of valueCols) {
      const raw = r[c.j] ?? '';
      if (c.kind === 'number') { const v = toNumber(raw, p.decimal); if (v !== null) set(String(c.j), y === null ? '' : String(y), id, v); } else if (raw.trim()) set(String(c.j), y === null ? '' : String(y), id, raw.trim());
    }
  }
  if (p.yearCols.length) {
    const keys = Object.keys(out.values);
    out.columns = keys.map((k) => ({ key: k, name: k.startsWith('ind:') ? k.slice(4) : 'Value', kind: 'number' as const }));
  } else out.columns = valueCols.filter((c) => out.values[String(c.j)]).map((c) => ({ key: String(c.j), name: c.name, kind: c.kind as 'number' | 'category' }));
  out.years = [...years].sort((a, b) => a - b);
  out.matched = p.geo === 'points' ? out.points.length : places.size;
  out.unmatched = [...unmatched].slice(0, 200);
  out.groups = [...groups];
  out.parts = [...parts];
  return out;
}
