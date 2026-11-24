// States and provinces brought up to date (v0.47.0). Natural Earth's first-level divisions are out of date where a
// country has redrawn them since (Kenya's 47 counties of 2013, DR Congo's 26 provinces of 2015, Nepal's 7 provinces of
// 2015, Viet Nam's 34 provinces of 2025...). build-base.mjs (admin1) replaces those countries' provinces with OCHA's
// Common Operational Datasets of administrative boundaries (COD-AB, on the Humanitarian Data Exchange, CC BY-IGO): each
// country's official boundaries as its own agency gave them to OCHA. See public/data/base/SOURCES.md and
// scripts/data/README.md.
//
//   node scripts/data/build-base.mjs --download     also fetches these datasets into .cache/cod-ab/<iso3>/
//
// For each country below: the HDX dataset, the date its boundaries are valid from and how many units it must have
// (the build stops if a newer dataset says otherwise: check it, then update the entry); the unit type; and how its
// units are made when the dataset's first level is not the country's (Côte d'Ivoire's districts from their regions,
// Tunisia's governorates; Indonesia's four new provinces of Papua, Iraq's Halabja, Lebanon's Keserwan-Jbeil and
// Timor-Leste's Atauro from the second level).
// Names (English and Latin American Spanish, the Wikidata labels, through QLever) are in admin1-updates.json, by unit.
//
// Each country's new provinces are cut to its own Natural Earth outline (the shape the map draws, after
// simplification): their coasts and borders are Natural Earth's, and only the lines between provinces are new. Where
// Natural Earth's outline reaches beyond the dataset's (a strip of coast, an island), that land goes to the nearest
// province it touches (or, for a few named areas, to the one Natural Earth had there). Their internal lines are
// simplified to about Natural Earth's detail.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import pc from 'polygon-clipping';
import { geoArea, geoContains } from 'd3-geo';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const CACHE = path.join(ROOT, '.cache/cod-ab');
const TMP = path.join(ROOT, '.cache/prep/admin1-updates');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const HDX = 'https://data.humdata.org/api/3/action/package_show?id=';

/** Names and Wikidata items of the new units: { names: { A3: { unit: { q, n, es, t?, ne? } } } } (ne: the name of the
 * Natural Earth province that is the same unit, whose label point and rank it keeps). */
export const NAMES = JSON.parse(fs.readFileSync(path.join(HERE, 'admin1-updates.json'), 'utf8')).names;

// Côte d'Ivoire: OCHA's first level is the 31 regions and the two autonomous districts; the country's first level is
// the 12 districts and the 2 autonomous districts (2011), each a group of regions (Wikidata P131).
const CIV_DISTRICTS = {
  'CI-AB': ['CI01'], 'CI-YM': ['CI02'], 'CI-BS': ['CI12', 'CI26', 'CI29'], 'CI-CM': ['CI20', 'CI30'], 'CI-DN': ['CI10', 'CI21'],
  'CI-GD': ['CI13', 'CI22'], 'CI-LC': ['CI06', 'CI19', 'CI25', 'CI27'], 'CI-LG': ['CI03', 'CI15', 'CI24'], 'CI-MG': ['CI09', 'CI16', 'CI32'],
  'CI-SM': ['CI18', 'CI23'], 'CI-SV': ['CI05', 'CI28', 'CI31'], 'CI-VB': ['CI11', 'CI17'], 'CI-WR': ['CI04', 'CI07', 'CI33'], 'CI-ZZ': ['CI08', 'CI14'],
};
// Indonesia: OCHA's provinces are those of 2020. Papua and West Papua were split in 2022 (Laws 14, 15, 16 and 29 of
// 2022) along regency lines: the new provinces are made of their regencies.
const PAPUA = {
  'ID-PT': ['ID9404', 'ID9410', 'ID9412', 'ID9411', 'ID9433', 'ID9434', 'ID9435', 'ID9436'], // Central Papua
  'ID-PE': ['ID9402', 'ID9417', 'ID9416', 'ID9418', 'ID9431', 'ID9432', 'ID9430', 'ID9429'], // Highland Papua
  'ID-PS': ['ID9401', 'ID9413', 'ID9414', 'ID9415'], // South Papua
  'ID-PD': ['ID9107', 'ID9171', 'ID9106', 'ID9108', 'ID9109', 'ID9110'], // Southwest Papua
};
const byUnit = (groups) => Object.fromEntries(Object.entries(groups).flatMap(([k, codes]) => codes.map((c) => [c, k])));

/**
 * The countries. `cod`: the HDX dataset; `valid`: its valid_on date; `n`: units; `t`: their type; `since`, `was`: what
 * changed (for the docs). `resource`/`layer`/`key`: a dataset published as shapefiles. `group`: units made of several
 * of the dataset's (unit → its codes); `split`: first-level units replaced by groups of their second-level ones
 * (`parents`, `group`, the rest keeping the parent's code); `level: 2`: the second level is the country's first;
 * `drop`: units left out (a contested area), whose land goes, piece by piece, to the province Natural Earth had there
 * (`old`: Natural Earth name → unit).
 */
export const UPDATES = {
  BDI: { cod: 'cod-ab-bdi', valid: '2026-07-07', n: 5, t: 'Province', since: '2025', was: '18 provinces' },
  BGD: { cod: 'cod-ab-bgd', valid: '2023-05-21', n: 8, t: 'Division', since: '2015', was: '7 divisions (Mymensingh missing)' },
  BHR: { cod: 'cod-ab-bhr', valid: '2026-11-16', n: 4, t: 'Governorate', since: '2014', was: '5 governorates (Central abolished)' },
  CAF: { cod: 'cod-ab-caf', valid: '2024-05-30', n: 20, t: 'Prefecture', since: '2020', was: '16 prefectures and Bangui' },
  CIV: { cod: 'cod-ab-civ', valid: '2018-07-06', n: 14, t: 'District', since: '2011', was: '19 regions', group: CIV_DISTRICTS },
  COD: { cod: 'cod-ab-cod', valid: '2019-09-11', n: 26, t: 'Province', since: '2015', was: '11 provinces' },
  ETH: { cod: 'cod-ab-eth', valid: '2025-01-01', n: 14, t: 'Region', since: '2020–2023', was: '11 (Sidama, South West, South and Central Ethiopia missing)', drop: ['ET99'], old: { Oromia: 'ET04', Somali: 'ET05' } },
  GHA: { cod: 'cod-ab-gha', valid: '2021-03-08', n: 16, t: 'Region', since: '2019', was: '10 regions' },
  IDN: { cod: 'cod-ab-idn', valid: '2020-04-01', n: 38, t: 'Province', since: '2012, 2022', was: '33 provinces (North Kalimantan and the four new provinces of Papua missing)', split: { parents: ['ID91', 'ID94'], group: PAPUA } },
  IRQ: { cod: 'cod-ab-irq', valid: '2019-06-03', n: 19, t: 'Governorate', since: '2014, 2025', was: '18 governorates (Halabja missing)', split: { parents: ['IQG06'], group: { 'IQ-HAL': ['IQG06Q05'] } } },
  KAZ: { cod: 'cod-ab-kaz', resource: 'kaz_adm_unhcr_2023_SHP.zip', layer: 'kaz_adm_unhcr_2023_SHP/kaz_admbnda_adm1_unhcr_2023', key: 'ADM1_PCODE', n: 20, t: 'Region', since: '2018, 2022', was: '14 regions and 2 cities (Shymkent, Abai, Jetisu and Ulytau missing)' },
  KEN: { cod: 'cod-ab-ken', valid: '2019-10-31', n: 47, t: 'County', since: '2013', was: '8 provinces' },
  KHM: { cod: 'cod-ab-khm', valid: '2018-10-04', n: 25, t: 'Province', since: '2013', was: '24 (Tboung Khmum missing)' },
  LAO: { cod: 'cod-ab-lao', valid: '2019-11-12', n: 18, t: 'Province', since: '2013', was: '17 (Xaisomboun missing)' },
  LBN: { cod: 'cod-ab-lbn', valid: '2024-11-13', n: 9, t: 'Governorate', since: '2014, 2017', was: '6 governorates', split: { parents: ['LB3'], group: { 'LB-KJ': ['LB34', 'LB35'] } } },
  MAR: { cod: 'cod-ab-mar', valid: '2020-12-03', n: 10, t: 'Region', since: '2015', was: '16 regions' },
  MDG: { cod: 'cod-ab-mdg', valid: '2018-08-10', n: 24, t: 'Region', since: '2021', was: '22 regions' },
  MLI: { cod: 'cod-ab-mli', valid: '2025-09-04', n: 20, t: 'Region', since: '2016, 2023', was: '8 regions and Bamako' },
  MRT: { cod: 'cod-ab-mrt', valid: '2024-03-27', n: 15, t: 'Region', since: '2014', was: '12 regions and Nouakchott' },
  NAM: { cod: 'cod-ab-nam', valid: '2020-01-09', n: 14, t: 'Region', since: '2013', was: '13 regions (Kavango undivided)' },
  NPL: { cod: 'cod-ab-npl', valid: '2024-03-14', n: 7, t: 'Province', since: '2015', was: '14 zones' },
  OMN: { cod: 'cod-ab-omn', valid: '2026-11-09', n: 11, t: 'Governorate', since: '2011', was: '11 (Ash Sharqiyah South under its old name)' },
  PAK: { cod: 'cod-ab-pak', valid: '2022-09-09', n: 7, t: 'Province', since: '2018', was: '8 (the Federally Administered Tribal Areas, merged into Khyber Pakhtunkhwa)' },
  PNG: { cod: 'cod-ab-png', valid: '2019-05-08', n: 22, t: 'Province', since: '2012', was: '20 provinces' },
  QAT: { cod: 'cod-ab-qat', valid: '2024-06-27', n: 8, t: 'Municipality', since: '2014', was: '7 municipalities' },
  SDN: { cod: 'cod-ab-sdn', valid: '2020-08-31', n: 19, t: 'State', since: '2013', was: '17 states (West Kordofan missing)' },
  SLE: { cod: 'cod-ab-sle', valid: '2023-12-15', n: 5, t: 'Province', since: '2017', was: '4 provinces' },
  TCD: { cod: 'cod-ab-tcd', valid: '2025-02-12', n: 23, t: 'Province', since: '2012, 2018', was: '22 (Ennedi undivided)' },
  TLS: { cod: 'cod-ab-tls', valid: '2020-09-11', n: 14, t: 'Municipality', since: '2022', was: '13 municipalities (Atauro, part of Dili until 2022, missing)', split: { parents: ['TL06'], group: { 'TL-AT': ['TL0604'] } } },
  TUN: { cod: 'cod-ab-tun', valid: '2022-11-15', n: 24, t: 'Governorate', since: '1983, 2000', was: '23 governorates (Ariana missing)', level: 2 },
  TZA: { cod: 'cod-ab-tza', resource: 'tza_admbnda_adm1_20181019.zip', layer: 'tza_admbnda_adm1_20181019', key: 'ADM1_PCODE', n: 31, t: 'Region', since: '2016', was: '30 regions (Songwe missing)' },
  VNM: { cod: 'cod-ab-vnm', valid: '2025-09-25', n: 34, t: 'Province', since: '2025', was: '63 provinces' },
  YEM: { cod: 'cod-ab-yem', valid: '2019-11-22', n: 22, t: 'Governorate', since: '2013', was: '21 governorates (Socotra missing)' },
};

const lc = (a3) => a3.toLowerCase();
const dirOf = (a3) => path.join(CACHE, lc(a3));
const pkgFile = (a3) => path.join(dirOf(a3), 'package.json');
const resName = (a3) => UPDATES[a3].resource ?? `${lc(a3)}_admin_boundaries.geojson.zip`;

/** Downloads each country's dataset (once) into .cache/cod-ab/<iso3>/. */
export async function downloadUpdates() {
  for (const [a3, u] of Object.entries(UPDATES)) {
    fs.mkdirSync(dirOf(a3), { recursive: true });
    if (!fs.existsSync(pkgFile(a3))) {
      const res = await fetch(HDX + u.cod, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`${u.cod}: HTTP ${res.status}`);
      fs.writeFileSync(pkgFile(a3), await res.text());
    }
    const zip = path.join(dirOf(a3), resName(a3));
    if (fs.existsSync(zip)) continue;
    const r = JSON.parse(fs.readFileSync(pkgFile(a3), 'utf8')).result.resources.find((x) => x.name === resName(a3));
    if (!r) throw new Error(`${u.cod}: no resource ${resName(a3)}`);
    process.stdout.write(`download ${u.cod} ${resName(a3)}... `);
    execFileSync('curl', ['-sS', '-L', '--fail', '--max-time', '3600', '-A', UA, '-o', `${zip}.part`, r.url]);
    fs.renameSync(`${zip}.part`, zip);
    console.log('ok');
  }
}

/** The dataset's layer of a level, unzipped once: a GeoJSON file, or a shapefile. */
function layerFile(a3, level) {
  const u = UPDATES[a3], dir = dirOf(a3), zip = path.join(dir, resName(a3));
  if (!fs.existsSync(zip)) throw new Error(`${a3}: ${path.relative(ROOT, zip)} is missing; run node scripts/data/build-base.mjs --download`);
  if (u.layer) {
    const shp = path.join(dir, `${u.layer}.shp`);
    if (!fs.existsSync(shp)) execFileSync('unzip', ['-o', '-q', zip, `${u.layer}.*`, '-d', dir]);
    return shp;
  }
  const name = `${lc(a3)}_admin${level}.geojson`, file = path.join(dir, name);
  if (!fs.existsSync(file)) execFileSync('unzip', ['-o', '-q', zip, name, '-d', dir]);
  return file;
}

const run = (cmd) => mapshaper.runCommands(cmd);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeFC = (f, features) => fs.writeFileSync(f, JSON.stringify({ type: 'FeatureCollection', features }));
const list = (a) => JSON.stringify(a).replace(/"/g, "'");
const lookup = (groups) => JSON.stringify(byUnit(groups)).replace(/"/g, "'");

/** The country's units from its dataset, one feature each ({ k: unit }), simplified to `interval` metres. */
async function codUnits(a3, dir, interval) {
  const u = UPDATES[a3];
  const parts = [];
  const top = layerFile(a3, u.level ?? 1);
  const key = u.key ?? `adm${u.level ?? 1}_pcode`;
  // The dataset's own date: a newer dataset (other units, other lines) must be looked at before it is used.
  if (u.valid) {
    const rows = JSON.parse(Object.values(await mapshaper.applyCommands(`-i "${top}" -drop geometry -o format=json`))[0]);
    const dates = new Set(rows.map((p) => String(p.valid_on).slice(0, 10)));
    if (dates.size !== 1 || !dates.has(u.valid)) throw new Error(`${a3}: ${u.cod} is valid on ${[...dates]}, not ${u.valid}: check it and update UPDATES`);
  }
  const proj = u.layer ? '-proj wgs84' : '';
  let keep = 'true', expr = key;
  if (u.group) expr = `${lookup(u.group)}[${key}]`;
  if (u.split) keep = `!${list(u.split.parents)}.includes(${key})`;
  parts.push(path.join(dir, 'units-1.geojson'));
  await run(`-i "${top}" ${proj} -filter "${keep}" -each "k=${expr}" -filter "k != null" -dissolve k -o "${parts[0]}" format=geojson geojson-type=FeatureCollection`);
  if (u.split) {
    parts.push(path.join(dir, 'units-2.geojson'));
    await run(`-i "${layerFile(a3, 2)}" -filter "${list(u.split.parents)}.includes(adm1_pcode)" -each "k=${lookup(u.split.group)}[adm2_pcode] || adm1_pcode" -dissolve k -o "${parts[1]}" format=geojson geojson-type=FeatureCollection`);
  }
  const out = path.join(dir, 'units.geojson');
  await run(`-i ${parts.map((p) => `"${p}"`).join(' ')} combine-files -merge-layers force -dissolve k ` +
    `${u.drop ? `-filter "!${list(u.drop)}.includes(k)" ` : ''}-simplify interval=${interval} keep-shapes -o "${out}" format=geojson geojson-type=FeatureCollection`);
  const count = readJSON(out).features.length;
  if (count !== u.n) throw new Error(`${a3}: ${count} units in ${u.cod}, not ${u.n}`);
  return out;
}

const polysOf = (g) => (!g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const keyOf = (p) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
// mapshaper writes GeoJSON rings as RFC 7946 has them (outer rings anticlockwise), d3 wants them the other way round:
// areas and point tests here do not depend on the winding.
const km2 = (f) => { const a = geoArea(f); return Math.min(a, 4 * Math.PI - a) * 6371 ** 2; };
const inRing = ([x, y], r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
};
const inside = (pt, g) => polysOf(g).some((poly) => inRing(pt, poly[0]) && !poly.slice(1).some((h) => inRing(pt, h)));
const asGeom = (mp) => (mp.length === 1 ? { type: 'Polygon', coordinates: mp[0] } : { type: 'MultiPolygon', coordinates: mp });

/** A MultiPolygon cut into the cells of a grid of `size` degrees (aligned on multiples of it): the non-empty pieces. */
function cells(mp, size) {
  const box = (m) => { let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity; for (const poly of m) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); } return [w, s, e, n]; };
  const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  const [w, s, e, n] = box(mp), out = [];
  for (let i = Math.floor(w / size); i * size < e; i++) {
    const col = pc.intersection(mp, rect(i * size, s - 1, (i + 1) * size, n + 1));
    if (!col.length) continue;
    const [, cs, , cn] = box(col);
    for (let j = Math.floor(cs / size); j * size < cn; j++) {
      const c = pc.intersection(col, rect(i * size, j * size, (i + 1) * size, (j + 1) * size));
      if (c.length) out.push(c);
    }
  }
  return out;
}

/** The size of a set of features: the diagonal of their box, in km. */
function sizeKm(features) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const f of features) for (const poly of polysOf(f.geometry)) for (const [x, y] of poly[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return Math.hypot((e - w) * 111 * Math.cos(((s + n) / 2) * Math.PI / 180), (n - s) * 111);
}

/**
 * The country's new provinces, cut to the outline of its Natural Earth provinces (`old`, as simplified for the map).
 * Returns features with the map's properties: n, es, a, t, lr, lx, ly.
 */
async function newProvinces(a3, old) {
  const u = UPDATES[a3], names = NAMES[a3];
  if (!names) throw new Error(`${a3}: no names in admin1-updates.json`);
  const dir = path.join(TMP, lc(a3));
  fs.mkdirSync(dir, { recursive: true });
  const interval = Math.round(Math.max(800, Math.min(5000, sizeKm(old) * 4)));
  const units = await codUnits(a3, dir, interval);
  const f = (n) => path.join(dir, n);
  writeFC(f('old.geojson'), old.map((x) => ({ type: 'Feature', geometry: x.geometry, properties: { n: x.properties.n } })));
  await run(`-i "${f('old.geojson')}" -dissolve -o "${f('outline.geojson')}" format=geojson geojson-type=FeatureCollection`);
  await run(`-i "${units}" -clip "${f('outline.geojson')}" -o "${f('clipped.geojson')}" format=geojson geojson-type=FeatureCollection`);
  await run(`-i "${f('outline.geojson')}" -erase "${units}" -explode -o "${f('left.geojson')}" format=geojson geojson-type=FeatureCollection`);
  const clipped = readJSON(f('clipped.geojson')).features.filter((x) => x.geometry);
  // Leftover pieces of the outline (Natural Earth's coasts and borders reach beyond the dataset's in places): first,
  // what lies in a named Natural Earth province goes to its unit.
  const owner = new Map();
  for (const x of clipped) for (const poly of polysOf(x.geometry)) for (const ring of poly) for (const p of ring) owner.set(keyOf(p), x.properties.k);
  const extra = [];
  let pieces = readJSON(f('left.geojson')).features.filter((x) => x.geometry).map((x) => polysOf(x.geometry));
  for (const [name, k] of Object.entries(u.old ?? {})) {
    const o = old.filter((x) => x.properties.n === name).flatMap((x) => polysOf(x.geometry));
    if (!o.length) throw new Error(`${a3}: no Natural Earth province "${name}"`);
    const rest = [];
    for (const mp of pieces) {
      const within = pc.intersection(mp, o);
      if (within.length) extra.push({ k, mp: within });
      rest.push(...pc.difference(mp, o).map((poly) => [poly]));
    }
    pieces = rest;
  }
  // The rest: a piece that touches one unit goes to it; one that touches several (a strip of coast along a few
  // provinces) is cut into cells about one simplification step wide, each going to the nearest of them; one that
  // touches none (an island the dataset leaves out) goes to the nearest unit.
  const segs = new Map(clipped.map((x) => [x.properties.k, polysOf(x.geometry).flatMap((poly) => poly.flatMap((ring) => ring.slice(1).map((p, i) => [ring[i], p])))]));
  const nearest = ([x, y], ks) => {
    const c = Math.cos(y * Math.PI / 180);
    let best = Infinity, k = null;
    for (const key of ks) for (const [[ax, ay], [bx, by]] of segs.get(key)) {
      const dx = (bx - ax) * c, dy = by - ay, px = (x - ax) * c, py = y - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d < best) { best = d; k = key; }
    }
    return k;
  };
  const centre = (mp) => { const r = mp[0][0]; return r.slice(1).reduce((a, p) => [a[0] + p[0] / (r.length - 1), a[1] + p[1] / (r.length - 1)], [0, 0]); };
  for (const mp of pieces) {
    const votes = new Set();
    for (const poly of mp) for (const ring of poly) for (const p of ring) { const k = owner.get(keyOf(p)); if (k) votes.add(k); }
    if (votes.size === 1) extra.push({ k: [...votes][0], mp });
    else if (!votes.size) extra.push({ k: nearest(centre(mp), [...segs.keys()]), mp });
    else for (const c of cells(mp, interval / 111000)) extra.push({ k: nearest(centre(c), [...votes]), mp: c });
  }
  writeFC(f('extra.geojson'), extra.map((x) => ({ type: 'Feature', geometry: asGeom(x.mp), properties: { k: x.k } })));
  // A unit that lies wholly outside the outline (a small island Natural Earth leaves out) keeps its own shape.
  const missing = readJSON(units).features.filter((x) => !clipped.some((c) => c.properties.k === x.properties.k));
  for (const m of missing) console.warn(`  ${a3}: ${m.properties.k} is outside Natural Earth's outline; kept as the dataset draws it`);
  writeFC(f('missing.geojson'), missing);
  const inner = '-each "lx=Math.round(this.innerX * 100) / 100, ly=Math.round(this.innerY * 100) / 100"';
  await run(`-i "${f('clipped.geojson')}" "${f('extra.geojson')}" "${f('missing.geojson')}" combine-files -merge-layers force -dissolve k ` +
    `${inner} -o "${f('new.geojson')}" format=geojson geojson-type=FeatureCollection`);
  // Where the name goes: Natural Earth's point for a province it had, if it is still inside; else a point inside the
  // province's part that the dataset draws (not the slivers it was given, nor Western Sahara, cut off later).
  await run(`-i "${f('clipped.geojson')}" "${f('missing.geojson')}" combine-files -merge-layers force -dissolve k ${inner} -o "${f('labels.geojson')}" format=geojson geojson-type=FeatureCollection`);
  const at = new Map(readJSON(f('labels.geojson')).features.map((x) => [x.properties.k, [x.properties.lx, x.properties.ly]]));
  const fresh = readJSON(f('new.geojson')).features;
  // Label rank: Natural Earth's for a province it had, else its usual one for the country's provinces; 9, as Natural
  // Earth gives its city regions, for a small new one.
  const ranks = old.map((x) => x.properties.lr).filter((r) => r != null && r < 9);
  const count = new Map(ranks.map((r) => [r, ranks.filter((x) => x === r).length]));
  const lr = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 7;
  const out = fresh.map((x) => {
    const k = x.properties.k, nm = names[k];
    if (!nm) throw new Error(`${a3}: no name for unit ${k} in admin1-updates.json`);
    const was = old.find((o) => nm.ne && o.properties.n === nm.ne && inside([o.properties.lx, o.properties.ly], x.geometry));
    const [lx, ly] = was ? [was.properties.lx, was.properties.ly] : at.get(k);
    const rank = was?.properties.lr ?? (km2(x) < 2500 ? 9 : lr);
    return { type: 'Feature', geometry: x.geometry, properties: { n: nm.n, es: nm.es, a: a3, t: nm.t ?? u.t, lr: rank, lx, ly } };
  });
  if (out.length !== u.n) throw new Error(`${a3}: ${out.length} provinces made, not ${u.n}`);
  const named = new Set(out.map((x) => x.properties.n));
  if (named.size !== out.length) throw new Error(`${a3}: two provinces share a name`);
  return out;
}

/**
 * Replaces the provinces of the updated countries in a list of built features (Natural Earth's, simplified), each
 * country's where its first one was. Logs what changed.
 */
export async function updateProvinces(features) {
  const out = [];
  const done = new Set();
  for (const ft of features) {
    const a3 = ft.properties?.a;
    if (!UPDATES[a3]) { out.push(ft); continue; }
    if (done.has(a3)) continue;
    done.add(a3);
    const old = features.filter((x) => x.properties?.a === a3 && x.geometry);
    const fresh = await newProvinces(a3, old);
    console.log(`  ${a3}: ${old.length} → ${fresh.length} (${UPDATES[a3].cod})`);
    out.push(...fresh);
  }
  for (const a3 of Object.keys(UPDATES)) if (!done.has(a3)) throw new Error(`${a3}: no Natural Earth provinces to replace`);
  return out;
}

/**
 * For the cities of updated countries: the province a point is in. First by the dataset's own lines, as detailed as
 * it draws them (the units the states build kept in .cache/prep, before simplification): a city on a river between
 * two provinces stays in its own. Else (a coastal town beyond the dataset's coast) by the built admin1 features of
 * its country, or the nearest of them.
 */
export function provinceFinder(features) {
  const by = new Map(), detailed = new Map();
  for (const f of features) {
    if (!UPDATES[f.properties.a] || !f.properties.n) continue;
    if (!by.has(f.properties.a)) by.set(f.properties.a, []);
    by.get(f.properties.a).push(f);
  }
  const fine = (a3) => {
    if (!detailed.has(a3)) {
      const files = ['units-1.geojson', 'units-2.geojson'].map((n) => path.join(TMP, lc(a3), n)).filter((f) => fs.existsSync(f));
      detailed.set(a3, files.flatMap((f) => readJSON(f).features).filter((x) => x.geometry && NAMES[a3]?.[x.properties.k]));
    }
    return detailed.get(a3);
  };
  return (a3, lon, lat) => {
    const list = by.get(a3);
    if (!list) return null;
    const own = fine(a3).find((x) => inside([lon, lat], x.geometry));
    if (own) return NAMES[a3][own.properties.k].n;
    const hit = list.find((f) => geoContains(f, [lon, lat]));
    if (hit) return hit.properties.n;
    let best = Infinity, name = null;
    const c = Math.cos(lat * Math.PI / 180);
    for (const f of list) for (const poly of polysOf(f.geometry)) for (const ring of poly) for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1], [bx, by2] = ring[i];
      const dx = (bx - ax) * c, dy = by2 - ay, px = (lon - ax) * c, py = lat - ay;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      const d = (px - t * dx) ** 2 + (py - t * dy) ** 2;
      if (d < best) { best = d; name = f.properties.n; }
    }
    return name;
  };
}
