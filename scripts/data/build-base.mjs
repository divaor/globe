#!/usr/bin/env node
// Builds the base map data used by the app from Natural Earth (public domain).
//
//   1. Download the source GeoJSON (once) into .cache/ne/:
//        node scripts/data/build-base.mjs --download
//   2. Build everything (or only some steps, e.g. `... countries cities`):
//        node scripts/data/build-base.mjs
//
// Outputs (public/data/base and public/data/layers):
//   countries-110m.json / -50m.json / -10m.json   TopoJSON, object "countries", feature id = country id
//   countries-meta.json                             per-country properties keyed by the same id
//   cities.json                                     populated places (compact rows)
//   admin1.json                                     states / provinces (lazy-loaded when zoomed in)
//   land-110m.json / land-50m.json                  land polygons (for clipping)
//   layers/physical-50m.json, physical-10m.json     lakes, rivers, glaciers, ice shelves
//   layers/landforms.json, peaks.json, marine.json  ranges, deserts, plateaus... peaks, sea labels
//   layers/timezones.json                           nominal time zones

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { rewindTopology } from './winding.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.cache/ne');
const PREP = path.join(ROOT, '.cache/prep');
const BASE = path.join(ROOT, 'public/data/base');
const LAYERS = path.join(ROOT, 'public/data/layers');
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

const SOURCES = [
  'ne_110m_admin_0_countries', 'ne_50m_admin_0_countries', 'ne_10m_admin_0_countries',
  'ne_10m_populated_places', 'ne_10m_admin_1_states_provinces',
  'ne_50m_lakes', 'ne_10m_lakes', 'ne_50m_rivers_lake_centerlines', 'ne_10m_rivers_lake_centerlines',
  'ne_50m_glaciated_areas', 'ne_10m_antarctic_ice_shelves_polys', 'ne_10m_time_zones',
  'ne_10m_geography_regions_polys', 'ne_10m_geography_regions_elevation_points',
  'ne_50m_geography_marine_polys', 'ne_10m_reefs', 'ne_10m_playas', 'ne_50m_land', 'ne_110m_land',
];

const CONTINENTS = {
  Africa: 'AF', Asia: 'AS', Europe: 'EU', 'North America': 'NA', 'South America': 'SA',
  Oceania: 'OC', Antarctica: 'AN', 'Seven seas (open ocean)': 'SS',
};

const src = (name) => path.join(CACHE, `${name}.geojson`);
const readJSON = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function download() {
  await fs.mkdir(CACHE, { recursive: true });
  for (const name of SOURCES) {
    const file = src(name);
    try { await fs.access(file); continue; } catch { /* fetch it */ }
    process.stdout.write(`download ${name}... `);
    const res = await fetch(`${NE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    await fs.writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log('ok');
  }
}

const run = (cmd) => mapshaper.runCommands(cmd);

/** Writes a trimmed copy of a source layer (mapped properties, optional filter) and returns its path. */
async function prep(name, map, filter = () => true, suffix = '') {
  const fc = await readJSON(src(name));
  fc.features = fc.features.filter((f) => f.geometry && filter(f.properties, f)).map((f) => ({
    type: 'Feature', geometry: f.geometry, properties: map(f.properties, f),
  }));
  await fs.mkdir(PREP, { recursive: true });
  const out = path.join(PREP, `${name}${suffix}.geojson`);
  await fs.writeFile(out, JSON.stringify(fc));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Country ids. ISO 3166-1 alpha-3 when Natural Earth has one (ISO_A3_EH also fixes France and
// Norway), otherwise NE's ADM0_A3 (Kosovo uses the common XKX). Small territories that NE tags
// with their sovereign's ISO code (Baikonur, Clipperton, Coral Sea Is. ...) keep their own ADM0_A3,
// so every feature has a unique id and the same id at every resolution.
let idMap = null; // ADM0_A3 -> id
async function countryIds() {
  if (idMap) return idMap;
  const fc = await readJSON(src('ne_10m_admin_0_countries'));
  const adm = new Set(fc.features.map((f) => f.properties.ADM0_A3));
  idMap = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    const iso = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : null;
    let id = p.ADM0_A3;
    if (iso && (iso === p.ADM0_A3 || !adm.has(iso))) id = iso;
    if (p.ADM0_A3 === 'KOS') id = 'XKX';
    idMap.set(p.ADM0_A3, id);
  }
  const ids = [...idMap.values()];
  const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
  if (dup.length) throw new Error(`duplicate country ids: ${dup}`);
  return idMap;
}
const countryId = (adm0) => idMap.get(adm0) || (adm0 === 'KOS' ? 'XKX' : adm0);

// Short map labels for long names (cards and search keep the full names).
const SHORT_EN = { CHN: 'China', USA: 'United States', COD: 'DR Congo', COG: 'Congo', FSM: 'Micronesia', USG: 'Guantánamo' };
const SHORT_ES = {
  COD: 'R. D. del Congo', COG: 'Rep. del Congo', CAF: 'Rep. Centroafricana', DOM: 'Rep. Dominicana', CYN: 'Chipre del Norte',
  USG: 'Guantánamo', ATF: 'Tierras Australes Fr.', UMI: 'Islas ultram. de EE. UU.', VIR: 'Islas Vírgenes (EE. UU.)',
  VGB: 'Islas Vírgenes Brit.', IOA: 'Terr. Austr. del Índico', IOT: 'Terr. Brit. del Índico', SGS: 'Georgias del Sur',
  FSM: 'Micronesia', MNP: 'Islas Marianas del N.', VCT: 'San Vicente y Granadinas', SPI: 'Campo de hielo Pat. Sur',
  HMD: 'Islas Heard y McDonald', CNM: 'Línea Verde', SPM: 'San Pedro y Miquelón',
};

async function countries() {
  await countryIds();
  for (const [res, q, simplify] of [['110m', '1e5', ''], ['50m', '1e5', ''], ['10m', '4e5', '-simplify 40% keep-shapes']]) {
    const file = await prep(`ne_${res}_admin_0_countries`, (p) => ({ id: countryId(p.ADM0_A3) }));
    await run(`-i "${file}" name=countries ${simplify} -o "${path.join(BASE, `countries-${res}.json`)}" format=topojson quantization=${q} id-field=id`);
  }
  const fc = await readJSON(src('ne_10m_admin_0_countries'));
  const meta = {};
  for (const f of fc.features) {
    const p = f.properties;
    const id = countryId(p.ADM0_A3);
    const iso = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : null;
    meta[id] = {
      n: p.NAME_EN || p.NAME, es: p.NAME_ES || p.NAME_EN || p.NAME, ab: p.ABBREV,
      sn: SHORT_EN[p.ADM0_A3] ?? ((p.NAME_EN || p.NAME).length > 18 ? p.NAME : undefined),
      ses: SHORT_ES[p.ADM0_A3],
      ct: CONTINENTS[p.CONTINENT] || 'SS', rg: p.REGION_UN, sr: p.SUBREGION,
      mc: p.MAPCOLOR9, mc13: p.MAPCOLOR13, lx: round(p.LABEL_X, 2), ly: round(p.LABEL_Y, 2),
      lr: p.LABELRANK, ml: p.MIN_LABEL, pop: p.POP_EST, gdp: p.GDP_MD, eco: p.ECONOMY, inc: p.INCOME_GRP,
      type: p.TYPE, sov: p.SOVEREIGNT, sovA3: p.SOV_A3,
      iso: iso && iso !== id ? iso : undefined, // the ISO code a small territory shares with its sovereign
      a2: p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : null, wd: p.WIKIDATAID,
    };
  }
  await fs.writeFile(path.join(BASE, 'countries-meta.json'), JSON.stringify(meta));
  console.log('countries:', Object.keys(meta).length);
}

// NAME_EN comes from Wikidata and has a few bad links (Mazatlán labelled "Juarez", Tampico
// "Ciudad Madero Tamaulipas", Cuttack "Pochinki"). Trust it only when it resembles the place's
// name in some other language; otherwise use Natural Earth's own NAME.
const LATIN_NAMES = ['NAME', 'NAMEASCII', 'NAME_ES', 'NAME_DE', 'NAME_FR', 'NAME_PT', 'NAME_IT', 'NAME_NL', 'NAME_SV', 'NAME_PL', 'NAME_HU', 'NAME_ID', 'NAME_VI', 'NAME_TR'];
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const EN_EXONYMS = new Set(['Gothenburg', 'Ghent', 'Bokhtar', 'Konye-Urgench']);
function englishName(p) {
  const en = p.NAME_EN;
  if (!en || en === p.NAME) return p.NAME;
  if (EN_EXONYMS.has(en)) return en;
  const a = fold(en);
  const ok = LATIN_NAMES.some((k) => {
    const b = fold(p[k]);
    return b.length > 1 && (a.includes(b) || b.includes(a) || (a.length >= 4 && a.slice(0, 4) === b.slice(0, 4)));
  });
  return ok ? en : p.NAME;
}

async function cities() {
  await countryIds();
  const fc = await readJSON(src('ne_10m_populated_places'));
  const rows = [];
  for (const f of fc.features) {
    const p = f.properties;
    const cls = p.FEATURECLA || '';
    if (/station|historic/i.test(cls)) continue;
    const cap = p.ADM0CAP === 1 || /Admin-0 capital/.test(cls) ? 2 : /Admin-1 (region )?capital/.test(cls) ? 1 : 0;
    const flags = (p.MEGACITY ? 1 : 0) | (p.WORLDCITY ? 2 : 0) | (/alt/.test(cls) ? 4 : 0);
    const [lon, lat] = f.geometry.coordinates;
    const name = englishName(p);
    rows.push([round(lon), round(lat), name, p.NAME_ES && p.NAME_ES !== name ? p.NAME_ES : 0,
      p.POP_MAX || 0, Math.round((p.MIN_ZOOM || 10) * 10) / 10, cap, flags, countryId(p.ADM0_A3),
      p.TIMEZONE || 0, p.ADM1NAME || 0]);
  }
  // Most important first: lower min-zoom, then capitals, then population.
  rows.sort((a, b) => a[5] - b[5] || b[6] - a[6] || b[4] - a[4]);
  const out = { fields: ['lon', 'lat', 'name', 'name_es', 'pop', 'minZoom', 'capital', 'flags', 'country', 'tz', 'admin1'], rows };
  await fs.writeFile(path.join(BASE, 'cities.json'), JSON.stringify(out));
  console.log('cities:', rows.length);
}

async function admin1() {
  await countryIds();
  const file = await prep('ne_10m_admin_1_states_provinces', (p) => ({
    n: str(p.name_en) || str(p.name), es: str(p.name_es) || str(p.name_en) || str(p.name),
    a: countryId(p.adm0_a3), t: str(p.type_en), lr: p.labelrank,
    lx: round(p.longitude, 2), ly: round(p.latitude, 2),
  }));
  await run(`-i "${file}" name=admin1 -simplify 6% keep-shapes -o "${path.join(BASE, 'admin1.json')}" format=topojson quantization=1e5`);
}

const named = (p) => {
  const n = str(p.name_en) || str(p.name);
  const es = str(p.name_es);
  return { n, es: es && es !== n ? es : undefined, sr: p.scalerank };
};

async function physical() {
  const l50 = await prep('ne_50m_lakes', named);
  const r50 = await prep('ne_50m_rivers_lake_centerlines', named);
  const g50 = await prep('ne_50m_glaciated_areas', (p) => ({ sr: p.scalerank }));
  const ice = await prep('ne_10m_antarctic_ice_shelves_polys', (p) => ({ sr: p.scalerank }));
  await run(`-i "${l50}" name=lakes -i "${r50}" name=rivers -i "${g50}" name=glaciers ` +
    `-i "${ice}" name=iceshelves -simplify 20% keep-shapes target=iceshelves ` +
    `-o "${path.join(LAYERS, 'physical-50m.json')}" format=topojson quantization=1e5 target=*`);
  const l10 = await prep('ne_10m_lakes', named);
  const r10 = await prep('ne_10m_rivers_lake_centerlines', named);
  await run(`-i "${l10}" name=lakes -simplify 50% keep-shapes -i "${r10}" name=rivers -simplify 50% ` +
    `-o "${path.join(LAYERS, 'physical-10m.json')}" format=topojson quantization=4e5 target=*`);
}

async function landforms() {
  const regions = await prep('ne_10m_geography_regions_polys', (p) => {
    const n = str(p.NAME_EN) || str(p.NAME); const es = str(p.NAME_ES);
    return { n, es: es && es !== n ? es : undefined, k: p.FEATURECLA, sr: p.SCALERANK, ml: p.MIN_LABEL };
  }, (p) => !['Continent', 'Dragons-be-here', 'Lake'].includes(p.FEATURECLA));
  const reefs = await prep('ne_10m_reefs', (p) => ({ sr: p.scalerank }));
  const playas = await prep('ne_10m_playas', (p) => ({ n: str(p.name) || undefined }));
  await run(`-i "${regions}" name=regions -simplify 15% keep-shapes ` +
    `-i "${reefs}" name=reefs -simplify 30% -i "${playas}" name=playas -simplify 30% keep-shapes ` +
    `-o "${path.join(LAYERS, 'landforms.json')}" format=topojson quantization=1e5 target=*`);

  const peaksFC = await readJSON(src('ne_10m_geography_regions_elevation_points'));
  const peaks = peaksFC.features.map((f) => {
    const p = f.properties; const [lon, lat] = f.geometry.coordinates;
    const n = str(p.name_en) || str(p.name); const es = str(p.name_es);
    return [round(lon), round(lat), n, es && es !== n ? es : 0, p.elevation, p.featurecla, p.min_zoom ?? 9];
  }).sort((a, b) => b[4] - a[4]);
  await fs.writeFile(path.join(LAYERS, 'peaks.json'), JSON.stringify({ fields: ['lon', 'lat', 'name', 'name_es', 'elevation', 'kind', 'minZoom'], rows: peaks }));

  // Marine labels: one point inside each sea/ocean polygon.
  const marinePolys = await prep('ne_50m_geography_marine_polys', (p) => {
    const n = str(p.name_en) || str(p.name); const es = str(p.name_es);
    return { n, es: es && es !== n ? es : '', k: p.featurecla, sr: p.scalerank };
  }, (p) => str(p.name_en) || str(p.name));
  const tmp = path.join(PREP, 'marine-points.geojson');
  await run(`-i "${marinePolys}" -points inner -o "${tmp}" format=geojson`);
  const marine = (await readJSON(tmp)).features.filter((f) => f.geometry).map((f) => {
    const p = f.properties; const [lon, lat] = f.geometry.coordinates;
    return [round(lon, 2), round(lat, 2), p.n, p.es || 0, p.k, p.sr];
  }).sort((a, b) => a[5] - b[5]);
  await fs.writeFile(path.join(LAYERS, 'marine.json'), JSON.stringify({ fields: ['lon', 'lat', 'name', 'name_es', 'kind', 'scalerank'], rows: marine }));
}

async function timezones() {
  const file = await prep('ne_10m_time_zones', (p) => ({
    z: p.zone, u: p.utc_format, p: str(p.places) || undefined, tz: str(p.tz_name1st) || undefined, c: p.map_color8,
  }));
  await run(`-i "${file}" name=zones -simplify 12% keep-shapes -o "${path.join(LAYERS, 'timezones.json')}" format=topojson quantization=1e5`);
}

async function land() {
  for (const res of ['110m', '50m']) {
    const file = await prep(`ne_${res}_land`, () => ({}));
    await run(`-i "${file}" name=land -o "${path.join(BASE, `land-${res}.json`)}" format=topojson quantization=1e5`);
  }
}

if (process.argv.includes('--download')) {
  await download();
} else {
  await fs.mkdir(BASE, { recursive: true });
  await fs.mkdir(LAYERS, { recursive: true });
  const only = process.argv.slice(2);
  const steps = { countries, cities, admin1, physical, landforms, timezones, land };
  for (const [name, fn] of Object.entries(steps)) {
    if (only.length && !only.includes(name)) continue;
    console.log(`== ${name}`);
    await fn();
  }
  // Simplification can flip a tiny ring inside out, which d3 then draws as "everything but this
  // shape". Rewind any polygon bigger than a hemisphere.
  for (const dir of [BASE, LAYERS]) {
    for (const name of await fs.readdir(dir)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(dir, name);
      const topo = JSON.parse(await fs.readFile(file, 'utf8'));
      if (topo.type !== 'Topology') continue;
      const fixed = rewindTopology(topo);
      if (fixed.length) { await fs.writeFile(file, JSON.stringify(topo)); console.log(`rewound ${name}: ${fixed.join(', ')}`); }
    }
  }
}
