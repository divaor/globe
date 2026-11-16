// Journey to the centre of the Earth (v0.32.0): fetches the open data the app reads from public/data/earth/. Every
// download is kept in .cache/earth, so a second run asks nothing again.
//
//   NODE_USE_ENV_PROXY=1 node scripts/data/earth/fetch-earth.mjs quakes     USGS: every earthquake of magnitude 5.5 or more since 1970
//   NODE_USE_ENV_PROXY=1 node scripts/data/earth/fetch-earth.mjs volcanoes  Smithsonian GVP: the volcanoes of the last 10,000 years
//   NODE_USE_ENV_PROXY=1 node scripts/data/earth/fetch-earth.mjs crust      CRUST1.0: how thick the crust is, on a 1° grid
//   NODE_USE_ENV_PROXY=1 node scripts/data/earth/fetch-earth.mjs magnetic   NOAA: the magnetic poles since 1590 and the WMM2025 model
//   NODE_USE_ENV_PROXY=1 node scripts/data/earth/fetch-earth.mjs wonders    Wikidata (QLever): caves, geysers, hot springs, craters, mines
//
// Wikimedia's own sites are never asked (this machine is blocked there); Wikidata answers come from QLever.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ask, val, qidOf, point } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'public/data/earth');
const RAW = path.join(ROOT, 'scripts/data/earth/raw');
const CACHE = path.join(ROOT, '.cache/earth');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const write = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d) + '\n'); };
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;

/** A download, kept in the cache (binary when `bin`). */
async function get(url, name, bin = false) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return bin ? fs.readFileSync(f) : fs.readFileSync(f, 'utf8');
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const b = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(f, b);
      return bin ? b : b.toString('utf8');
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
}
/** The one file in a zip (unzip is on the build machine). */
const unzipOne = (zip, name) => execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 28 }).toString('utf8');

// ---- Earthquakes -------------------------------------------------------------------------------------------------
/** Every earthquake of M5.5+ since 1970, as columns: lon and lat in hundredths of a degree, depth in km, magnitude
 *  in tenths, the day (days since 1970-01-01); the place USGS names for those of M7 and more. */
async function quakes() {
  const parts = [['1970-01-01', '1990-01-01'], ['1990-01-01', '2010-01-01'], ['2010-01-01', '2026-11-16']];
  const rows = [];
  for (const [a, b] of parts) {
    const csv = await get(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=csv&starttime=${a}&endtime=${b}&minmagnitude=5.5&eventtype=earthquake&orderby=time-asc`, `quakes-${a}-${b}.csv`);
    const lines = csv.trim().split('\n');
    const head = lines[0].split(',');
    const ix = (k) => head.indexOf(k);
    const [iT, iLat, iLon, iD, iM, iP] = ['time', 'latitude', 'longitude', 'depth', 'mag', 'place'].map(ix);
    for (const l of lines.slice(1)) {
      // The place is quoted and may hold commas; it is the last quoted field before the rest.
      const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
      const lon = Number(cells[iLon]), lat = Number(cells[iLat]), d = Number(cells[iD]), m = Number(cells[iM]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isFinite(m)) continue;
      rows.push({ t: Math.floor(Date.parse(cells[iT]) / 86400000), lon, lat, d: Math.max(0, Math.round(Number.isFinite(d) ? d : 0)), m, p: cells[iP] });
    }
  }
  rows.sort((a, b) => a.t - b.t);
  const big = {};
  rows.forEach((r, i) => { if (r.m >= 7 && r.p) big[i] = r.p; });
  const out = {
    src: 'USGS ANSS Comprehensive Catalog (ComCat), M5.5+, 1970 to 2026-11-15 (public domain)',
    n: rows.length,
    lon: rows.map((r) => Math.round(r.lon * 100)), lat: rows.map((r) => Math.round(r.lat * 100)),
    d: rows.map((r) => r.d), m: rows.map((r) => Math.round(r.m * 10)), t: rows.map((r) => r.t), big,
  };
  write(path.join(OUT, 'quakes.json'), out);
  const deep = rows.filter((r) => r.d >= 300).length;
  console.log(`quakes.json: ${rows.length} earthquakes (${deep} deeper than 300 km, ${Object.keys(big).length} of M7+, deepest ${Math.max(...rows.map((r) => r.d))} km), ${kb(path.join(OUT, 'quakes.json'))}`);
}

// ---- Volcanoes ---------------------------------------------------------------------------------------------------
/** The Smithsonian's volcanoes of the Holocene (the last ~11,700 years): name, number (for its page), place, height,
 *  type, the year of its last eruption (negative: BCE; null: unknown), tectonic setting and evidence. */
async function volcanoes() {
  const json = JSON.parse(await get('https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes&outputFormat=application%2Fjson', 'gvp-holocene.json'));
  const setting = (s) => (/subduction/i.test(s ?? '') ? 's' : /rift/i.test(s ?? '') ? 'r' : /intraplate/i.test(s ?? '') ? 'i' : 'u');
  const out = json.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: p.Volcano_Number, n: p.Volcano_Name, lon: Math.round(lon * 1000) / 1000, lat: Math.round(lat * 1000) / 1000,
      e: p.Elevation ?? null, t: p.Primary_Volcano_Type ?? '', y: Number.isFinite(p.Last_Eruption_Year) ? p.Last_Eruption_Year : null,
      c: p.Country ?? '', s: setting(p.Tectonic_Setting), ev: p.Evidence_Category ?? '',
    };
  }).sort((a, b) => a.id - b.id);
  write(path.join(OUT, 'volcanoes.json'), { src: 'Global Volcanism Program, Smithsonian Institution: Volcanoes of the World (v5), Holocene volcanoes', volcanoes: out });
  const recent = out.filter((v) => v.y != null && v.y >= 1900).length;
  console.log(`volcanoes.json: ${out.length} volcanoes (${recent} erupted since 1900), ${kb(path.join(OUT, 'volcanoes.json'))}`);
}

// ---- The crust ---------------------------------------------------------------------------------------------------
/** CRUST1.0's crust thickness (km, from the surface or sea floor down to the Moho), on its 1° grid, as 180 rows of
 *  360 bytes from 89.5°N to 89.5°S and 179.5°W to 179.5°E, base64. */
async function crust() {
  await get('https://igppweb.ucsd.edu/~gabi/crust1/crsthk.xyz.zip', 'crsthk.xyz.zip', true);
  const xyz = unzipOne(path.join(CACHE, 'crsthk.xyz.zip'), 'crsthk.xyz');
  const grid = new Uint8Array(360 * 180);
  let n = 0, max = 0, min = 999;
  for (const l of xyz.trim().split('\n')) {
    const [lon, lat, t] = l.trim().split(/\s+/).map(Number);
    const col = Math.round(lon + 179.5), row = Math.round(89.5 - lat);
    if (col < 0 || col > 359 || row < 0 || row > 179) continue;
    grid[row * 360 + col] = Math.max(0, Math.min(255, Math.round(t)));
    n++; max = Math.max(max, t); min = Math.min(min, t);
  }
  if (n !== 64800) throw new Error(`crust: ${n} cells`);
  write(path.join(OUT, 'crust.json'), { src: 'CRUST1.0 (Laske, Masters, Ma & Pasyanos 2013), crust thickness on a 1° grid', rows: 180, cols: 360, km: Buffer.from(grid).toString('base64') });
  console.log(`crust.json: 64,800 cells, ${min}–${max} km thick, ${kb(path.join(OUT, 'crust.json'))}`);
}

// ---- The magnetic Earth ------------------------------------------------------------------------------------------
/** The north and south magnetic poles year by year since 1590 (gufm1 and IGRF), and the World Magnetic Model 2025's
 *  coefficients, for where a compass points. */
async function magnetic() {
  const track = (txt) => txt.trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)).filter((r) => r.length >= 3 && r.every(Number.isFinite))
    .map(([lon, lat, year]) => [Math.round(year), Math.round((lon > 180 ? lon - 360 : lon) * 100) / 100, Math.round(lat * 100) / 100]);
  const north = track(await get('https://www.ngdc.noaa.gov/geomag/data/poles/NP.xy', 'NP.xy'));
  const south = track(await get('https://www.ngdc.noaa.gov/geomag/data/poles/SP.xy', 'SP.xy'));
  await get('https://www.ncei.noaa.gov/sites/default/files/2024-12/WMM2025COF.zip', 'WMM2025COF.zip', true);
  const list = execFileSync('unzip', ['-Z1', path.join(CACHE, 'WMM2025COF.zip')]).toString('utf8').split('\n').filter((f) => /\.COF$/i.test(f));
  const cof = unzipOne(path.join(CACHE, 'WMM2025COF.zip'), list[0]);
  const lines = cof.split('\n');
  const epoch = Number(lines[0].trim().split(/\s+/)[0]);
  const coef = [];
  for (const l of lines.slice(1)) {
    const v = l.trim().split(/\s+/).map(Number);
    if (v.length < 6 || !v.every(Number.isFinite)) continue;
    coef.push(v.slice(0, 6));
  }
  const tests = await get('https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt', 'WMM2025_TEST_VALUES.txt');
  const checks = tests.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).map(Number))
    .map((v) => ({ year: v[0], h: v[1], lat: v[2], lon: v[3], dec: v[10] }));
  write(path.join(OUT, 'magnetic.json'), {
    src: 'NOAA NCEI: magnetic pole positions (gufm1 to 1990, IGRF after); World Magnetic Model 2025 (public domain)',
    north, south, wmm: { epoch, coef }, checks,
  });
  console.log(`magnetic.json: north pole ${north[0][0]}–${north.at(-1)[0]} (${north.length}), south (${south.length}), WMM ${epoch} with ${coef.length} coefficients, ${checks.length} test values, ${kb(path.join(OUT, 'magnetic.json'))}`);
}

// ---- Underground wonders (Wikidata) -------------------------------------------------------------------------------
/** Caves, geysers, hot springs, impact craters on Earth and mines with coordinates, the better known first (by the
 *  number of Wikipedias that have them): names in English and Spanish, length, depth and diameter where given. */
async function wonders() {
  const C = path.join(CACHE, 'wd');
  const kinds = [
    ['cave', 'Q35509', 3], ['geyser', 'Q83471', 2], ['spring', 'Q177380', 4], ['crater', 'Q55818', 2], ['mine', 'Q820477', 4],
  ];
  const out = {};
  for (const [k, q, minSl] of kinds) {
    const rows = await ask(C, `${k}-${minSl}`, `SELECT ?s ?sl ?c ?en ?es ?len ?dep ?dia WHERE {
      ?s wdt:P31/wdt:P279* wd:${q} . ?s wikibase:sitelinks ?sl . FILTER(?sl >= ${minSl}) ?s wdt:P625 ?c .
      FILTER NOT EXISTS { ?s wdt:P376 ?body . FILTER(?body != wd:Q2) }
      OPTIONAL { ?s rdfs:label ?en . FILTER(LANG(?en) = "en") } OPTIONAL { ?s rdfs:label ?es . FILTER(LANG(?es) = "es") }
      OPTIONAL { ?s wdt:P2043 ?len } OPTIONAL { ?s wdt:P4511 ?dep } OPTIONAL { ?s wdt:P2386 ?dia } }`);
    const by = new Map();
    for (const r of rows) {
      const id = qidOf(val(r, 's')); const c = point(val(r, 'c'), 3);
      if (!id || !c || by.has(id)) continue;
      by.set(id, { id, n: [val(r, 'en') ?? val(r, 'es') ?? id, val(r, 'es') ?? val(r, 'en') ?? id], at: c, sl: Number(val(r, 'sl')),
        ...(val(r, 'len') ? { len: Number(val(r, 'len')) } : {}), ...(val(r, 'dep') ? { dep: Number(val(r, 'dep')) } : {}), ...(val(r, 'dia') ? { dia: Number(val(r, 'dia')) } : {}) });
    }
    out[k] = [...by.values()].filter((w) => !/^Q\d+$/.test(w.n[0])).sort((a, b) => b.sl - a.sl);
    console.log(`${k}: ${out[k].length} (from ${rows.length} rows; top: ${out[k].slice(0, 5).map((w) => w.n[0]).join(', ')})`);
  }
  write(path.join(RAW, 'wonders-wikidata.json'), out);
}

const step = process.argv[2];
const steps = { quakes, volcanoes, crust, magnetic, wonders };
if (!steps[step]) { console.error(`usage: fetch-earth.mjs ${Object.keys(steps).join(' | ')}`); process.exit(1); }
await steps[step]();
