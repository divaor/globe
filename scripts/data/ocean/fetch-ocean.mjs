// Into the deep (v0.33.0): fetches the open data the app reads from public/data/ocean/. Every download is kept in
// .cache/ocean, so a second run asks nothing again.
//
//   NODE_USE_ENV_PROXY=1 node scripts/data/ocean/fetch-ocean.mjs depth      NOAA ETOPO 2022: depths and heights, 0.25°
//   NODE_USE_ENV_PROXY=1 node scripts/data/ocean/fetch-ocean.mjs features   GEBCO gazetteer: the undersea feature names
//   NODE_USE_ENV_PROXY=1 node scripts/data/ocean/fetch-ocean.mjs plankton   NASA MODIS Aqua chlorophyll: 12 months of 2024
//   NODE_USE_ENV_PROXY=1 node scripts/data/ocean/fetch-ocean.mjs ice        NASA AMSR2 sea ice: 12 months of 2024
//   NODE_USE_ENV_PROXY=1 node scripts/data/ocean/fetch-ocean.mjs wrecks     Wikidata (QLever): shipwrecks with a place
//
// Wikimedia's own sites are never asked; Wikidata answers come from QLever.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ask, val, qidOf, point, yearOf } from '../lives/wdqs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'public/data/ocean');
const RAW = path.join(ROOT, 'scripts/data/ocean/raw');
const CACHE = path.join(ROOT, '.cache/ocean');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const write = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(d) + '\n'); };
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;

/** A download, kept in the cache (binary when `bin`). */
async function get(url, name, bin = false) {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return bin ? fs.readFileSync(f) : fs.readFileSync(f, 'utf8');
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, buf);
      return bin ? buf : buf.toString('utf8');
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
    }
  }
}

// ---- Depths: ETOPO 2022 (NOAA NCEI, public domain), read at 1/12° through NCEI's OPeNDAP server, then each 0.25°
// cell keeps its mean height and its deepest point. Written as one PNG of 1440 × 720 (north up): red and green hold the
// mean (metres + 11 000, 16 bits), blue how much deeper the deepest point is (in 20 m steps), so a trench keeps its depth.
async function depth() {
  const { default: sharp } = await import('sharp');
  const STEP = 5, ROWS = 10800 / STEP, COLS = 21600 / STEP; // 2160 × 4320
  const bin = path.join(CACHE, `etopo-${STEP}.i16`);
  let z;
  if (fs.existsSync(bin)) z = new Int16Array(fs.readFileSync(bin).buffer.slice(0));
  else {
    z = new Int16Array(ROWS * COLS);
    const CH = 240; // rows per request
    for (let r0 = 0; r0 < ROWS; r0 += CH) {
      const r1 = Math.min(ROWS, r0 + CH) - 1;
      const url = `https://www.ngdc.noaa.gov/thredds/dodsC/global/ETOPO2022/60s/60s_surface_elev_netcdf/ETOPO_2022_v1_60s_N90W180_surface.nc.ascii?z%5B${r0 * STEP}:${STEP}:${r1 * STEP}%5D%5B0:${STEP}:21599%5D`;
      const txt = await get(url, `etopo/${STEP}-${r0}.txt`);
      let n = 0;
      for (const line of txt.split('\n')) {
        const m = /^\[(\d+)\], (.*)$/.exec(line);
        if (!m) continue;
        const r = r0 + Number(m[1]);
        const vals = m[2].split(', ');
        if (vals.length !== COLS) throw new Error(`row ${r}: ${vals.length} values`);
        for (let c = 0; c < COLS; c++) z[r * COLS + c] = Math.round(Number(vals[c]));
        n++;
      }
      if (n !== r1 - r0 + 1) throw new Error(`rows ${r0}–${r1}: got ${n}`);
      console.log(`etopo rows ${r0}–${r1}`);
    }
    fs.writeFileSync(bin, Buffer.from(z.buffer));
  }
  // Rows run south to north; the picture runs north to south.
  const B = 3, H = ROWS / B, W = COLS / B; // 720 × 1440
  const px = Buffer.alloc(W * H * 3);
  let deepest = 0, deepAt = null;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let sum = 0, min = 1e9;
      for (let dy = 0; dy < B; dy++) for (let dx = 0; dx < B; dx++) {
        const v = z[(y * B + dy) * COLS + x * B + dx];
        sum += v; if (v < min) min = v;
      }
      const mean = Math.round(sum / (B * B));
      if (min < deepest) { deepest = min; deepAt = [-180 + (x + 0.5) * 0.25, -90 + (y + 0.5) * 0.25]; }
      const v = Math.max(0, Math.min(65535, mean + 11000));
      const o = ((H - 1 - y) * W + x) * 3;
      px[o] = v >> 8; px[o + 1] = v & 255; px[o + 2] = Math.max(0, Math.min(255, Math.round((mean - min) / 20)));
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const f = path.join(OUT, 'depth.png');
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(f);
  console.log(`depth.png ${W}×${H}: ${kb(f)}; deepest cell ${deepest} m at ${deepAt}`);
}

// ---- Undersea feature names: the GEBCO gazetteer (IHO-IOC GEBCO, through NOAA NCEI), 200 a page.
async function features() {
  const all = [];
  for (let page = 1; page < 100; page++) {
    const j = JSON.parse(await get(`https://www.ngdc.noaa.gov/gazetteer/feature?itemsPerPage=200&page=${page}`, `gaz/${page}.json`));
    all.push(...j.featureList);
    if (all.length >= j.featureCount || !j.featureList.length) break;
  }
  const types = new Map();
  const rows = [];
  for (const f of all) {
    if (f.status && f.status !== 'APPROVED') continue;
    const m = /POINT \(([-\d.]+) ([-\d.]+)\)/.exec(f.geometry ?? '');
    if (!m) continue;
    const t = f.type?.name ?? 'Feature';
    if (!types.has(t)) types.set(t, types.size);
    rows.push([f.id, f.name.trim(), types.get(t), Math.round(Number(m[1]) * 1000) / 1000, Math.round(Number(m[2]) * 1000) / 1000,
      f.discoveryYear ?? null, (f.history ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) || null]);
  }
  write(path.join(RAW, 'gebco-features.json'), { types: [...types.keys()], rows });
  console.log(`gebco: ${rows.length} named features of ${all.length}; ${types.size} kinds: ${[...types.keys()].slice(0, 12).join(', ')}…`);
}

// ---- The living ocean: twelve months of 2024 from NASA GIBS (public domain).
// Plankton: MODIS Aqua's daily chlorophyll has gaps (clouds, the swaths); each month is made from every other day,
// each spot keeping its latest clear reading. Sea ice: AMSR2 sea ice concentration on the 15th of the month.
async function gibsMonths(kind, layer, days) {
  const { default: sharp } = await import('sharp');
  const dir = path.join(OUT, kind);
  fs.mkdirSync(dir, { recursive: true });
  const W = 2048, H = 1024;
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const acc = Buffer.alloc(W * H * 4);
    for (const d of days) {
      const dd = String(d).padStart(2, '0');
      if (m === 2 && d > 28) continue;
      const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${W}&HEIGHT=${H}&FORMAT=image/png&TRANSPARENT=TRUE&TIME=2024-${mm}-${dd}`;
      const buf = await get(url, `${kind}/2024-${mm}-${dd}.png`, true);
      const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (info.width !== W || info.height !== H) throw new Error(`${kind} ${mm}-${dd}: ${info.width}×${info.height}`);
      for (let i = 0; i < W * H * 4; i += 4) if (data[i + 3] > 0) { acc[i] = data[i]; acc[i + 1] = data[i + 1]; acc[i + 2] = data[i + 2]; acc[i + 3] = data[i + 3]; }
    }
    let lit = 0; for (let i = 3; i < acc.length; i += 4) if (acc[i]) lit++;
    const f = path.join(dir, `${mm}.webp`);
    await sharp(acc, { raw: { width: W, height: H, channels: 4 } }).resize(1024, 512).webp({ quality: 80, alphaQuality: 70, effort: 6 }).toFile(f);
    console.log(`${kind} ${mm}: ${kb(f)}, ${Math.round((lit / (W * H)) * 100)} % covered`);
  }
}

// ---- Shipwrecks on Wikidata with a place, the better known first (by the number of Wikipedias that have them).
async function wrecks() {
  const C = path.join(CACHE, 'wd');
  const rows = await ask(C, 'wrecks-2', `SELECT ?s ?sl ?c ?en ?es ?dep ?t WHERE {
    ?s wdt:P31/wdt:P279* wd:Q852190 . ?s wikibase:sitelinks ?sl . FILTER(?sl >= 2) ?s wdt:P625 ?c .
    OPTIONAL { ?s rdfs:label ?en . FILTER(LANG(?en) = "en") } OPTIONAL { ?s rdfs:label ?es . FILTER(LANG(?es) = "es") }
    OPTIONAL { ?s wdt:P4511 ?dep } OPTIONAL { ?s wdt:P585 ?t } }`);
  const by = new Map();
  for (const r of rows) {
    const id = qidOf(val(r, 's')); const c = point(val(r, 'c'), 2);
    if (!id || !c || by.has(id)) continue;
    const y = val(r, 't') ? yearOf(val(r, 't')) : null;
    by.set(id, { id, n: [val(r, 'en') ?? val(r, 'es') ?? id, val(r, 'es') ?? val(r, 'en') ?? id], at: c, sl: Number(val(r, 'sl')),
      ...(val(r, 'dep') ? { dep: Math.abs(Number(val(r, 'dep'))) } : {}), ...(y ? { y } : {}) });
  }
  const out = [...by.values()].filter((w) => !/^Q\d+$/.test(w.n[0])).sort((a, b) => b.sl - a.sl);
  write(path.join(RAW, 'wrecks-wikidata.json'), out);
  console.log(`wrecks: ${out.length} (from ${rows.length} rows; top: ${out.slice(0, 6).map((w) => w.n[0]).join(', ')})`);
}

const step = process.argv[2];
if (step === 'depth') await depth();
else if (step === 'features') await features();
else if (step === 'plankton') await gibsMonths('plankton', 'MODIS_Aqua_L2_Chlorophyll_A', [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29]);
else if (step === 'ice') await gibsMonths('ice', 'AMSRU2_Sea_Ice_Concentration_25km', [15]);
else if (step === 'wrecks') await wrecks();
else { console.error('usage: fetch-ocean.mjs depth | features | plankton | ice | wrecks'); process.exit(1); }
