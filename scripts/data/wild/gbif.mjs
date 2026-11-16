// Questions to GBIF shared by Wild world (v0.30.0) and Green planet (v0.31.0): answers kept in .cache/wild/gbif, a few
// at a time, and an organism's range from GBIF's ad hoc map tiles (only sightings shared under CC0 or CC BY, without
// zoo animals or garden plants (LIVING_SPECIMEN) or fossils, from 1970 on unless `gone`), in GBIF's squares:
// geohashes of 3 characters, 1.40625° a side (about 150 km at the equator).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeMVT } from './mvt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CACHE = path.join(ROOT, '.cache/wild');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

/** A GBIF answer (JSON, or the bytes of a tile), kept in .cache/wild/gbif. */
export async function gbif(url, file, { binary = false } = {}) {
  const f = path.join(CACHE, 'gbif', file);
  if (fs.existsSync(f)) return binary ? fs.readFileSync(f) : read(f);
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (r.status === 204 || r.status === 404) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, binary ? Buffer.alloc(0) : 'null'); return binary ? Buffer.alloc(0) : null; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body);
      return binary ? body : JSON.parse(body.toString('utf8'));
    } catch (e) {
      if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
      await sleep(3000 * attempt);
    }
  }
}

/** Runs `fn` over `items`, `n` at a time. */
export async function pool(items, n, fn) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k], k); if (++done % 50 === 0) console.log(`  ${done}/${items.length}`); }
  }));
}

const BASIS = ['HUMAN_OBSERVATION', 'PRESERVED_SPECIMEN', 'MACHINE_OBSERVATION', 'OCCURRENCE', 'MATERIAL_SAMPLE', 'OBSERVATION'];
/** The squares (geohash of 3 characters) where an animal was seen, with how many sightings. */
export async function rangeOf(key, gone) {
  const q = new URLSearchParams({ srs: 'EPSG:4326', taxonKey: key, mode: 'GEO_CENTROID', occurrenceStatus: 'PRESENT', hasGeospatialIssue: 'false' });
  for (const l of ['CC0_1_0', 'CC_BY_4_0']) q.append('license', l);
  for (const b of BASIS) q.append('basisOfRecord', b);
  if (!gone) q.set('year', '1970,2026');
  const cells = {};
  // First the two tiles of the whole world (squares of 11.25° × 5.625°): which of the eight finer tiles to ask for.
  const want = new Set();
  const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  for (let x = 0; x < 2; x++) {
    const buf = await gbif(`https://api.gbif.org/v2/map/occurrence/adhoc/0/${x}/0.mvt?${q}`, `tiles/${key}${gone ? '-all' : ''}/0-${x}-0.mvt`, { binary: true });
    if (!buf.length) continue;
    for (const L of decodeMVT(buf)) for (const f of L.feats) {
      const g = String(f.props.geohash ?? '');
      if (g.length !== 2) continue;
      // A geohash of 2 characters: 5 bits of longitude (11.25°) and 5 of latitude (5.625°).
      const bits = B32.indexOf(g[0]) * 32 + B32.indexOf(g[1]);
      let lon = 0, lat = 0;
      for (let i = 9; i >= 0; i--) { const b = (bits >> i) & 1; if ((9 - i) % 2 === 0) lon = lon * 2 + b; else lat = lat * 2 + b; }
      const w = -180 + lon * 11.25, s = -90 + lat * 5.625;
      for (let tx = 0; tx < 4; tx++) for (let ty = 0; ty < 2; ty++) {
        const tw = -180 + tx * 90, tn = 90 - ty * 90;
        if (w < tw + 90 && w + 11.25 > tw && s < tn && s + 5.625 > tn - 90) want.add(`${tx}-${ty}`);
      }
    }
  }
  for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) {
    if (!want.has(`${x}-${y}`)) continue;
    const buf = await gbif(`https://api.gbif.org/v2/map/occurrence/adhoc/1/${x}/${y}.mvt?${q}`, `tiles/${key}${gone ? '-all' : ''}/1-${x}-${y}.mvt`, { binary: true });
    if (!buf.length) continue;
    for (const L of decodeMVT(buf)) for (const f of L.feats) {
      const g = f.props.geohash, n = Number(f.props.total) || 0;
      if (typeof g === 'string' && g.length === 3) cells[g] = Math.max(cells[g] ?? 0, n);
    }
  }
  return cells;
}
