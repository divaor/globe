// Builds the other worlds' data in public/data/worlds/ from the sources fetched by fetch_worlds.sh:
//   - <id>-4k.jpg / <id>-2k.jpg: each world's map, equirectangular from 180°W to 180°E (east to the right), 90°N at the top;
//     <id>-elev-2k.jpg: the Moon's and Mars's colour-shaded heights; venus-clouds-2k.jpg; sun-4k/2k.jpg, drawn here;
//   - (fill) the parts of Pluto, Charon and Triton no spacecraft saw, painted plain instead of black;
//   - thumbs/<id>.png: a small round picture of each world, for the Space panel;
//   - <id>-names.json: the IAU names of its places (see namesOf), for labels, taps and search;
//   - <id>/h/<z>/<y>/<x>.webp: the Moon's and Mars's heights as Terrarium tiles (lossless WebP, in steps of 16 m; an
//     equirectangular tile grid, zooms 0–3),
//     for the 3D view;
//   - previews (with --preview <dir>): each map with its biggest named places marked, to check that it lines up.
//
//   node scripts/data/space/build-worlds.mjs <src> [--only textures,fill,thumbs,names,heights] [--preview <dir>] [--world moon,mars]
//   (the Sun alone needs no sources: --only textures,thumbs --world sun)
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

sharp.cache(false);
sharp.concurrency(2);
const args = process.argv.slice(2);
const SRC = args[0];
if (!SRC || SRC.startsWith('--')) { console.error('usage: build-worlds.mjs <src> [--only ...] [--preview dir] [--world ids]'); process.exit(1); }
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only')?.split(',');
const want = (step) => !only || only.includes(step);
const worldsWanted = opt('--world')?.split(',');
const PREVIEW = opt('--preview');
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../public/data/worlds');
fs.mkdirSync(path.join(OUT, 'thumbs'), { recursive: true });
if (PREVIEW) fs.mkdirSync(PREVIEW, { recursive: true });

/**
 * Each world: where its map comes from (`trek`: a Trek layer's zoom-3 tiles; `usgs`: a USGS mosaic and its label;
 * `sss`: a Solar System Scope texture), the sizes written, its IAU names file, its radius (km) and, for the thumbnail,
 * the longitude it faces.
 */
const WORLDS = [
  { id: 'moon', trek: 'LRO_WAC_Mosaic_Global_303ppd_v02', sizes: [4096, 2048], iau: 'MOON', r: 1737.4, face: 0, elev: 'LRO_LOLA_ClrShade_Global_256ppd_v06' },
  { id: 'mars', trek: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', sizes: [4096, 2048], iau: 'MARS', r: 3389.5, face: -70, elev: 'Mars_MGS_MOLA_ClrShade_merge_global_463m' },
  { id: 'mercury', trek: 'Mercury_MESSENGER_mosaic_global_250m_2013', sizes: [4096, 2048], iau: 'MERCURY', r: 2439.4, face: 0 },
  { id: 'venus', trek: 'Venus_Magellan_C3-MDIR_Colorized_Global_Mosaic_4641m', sizes: [4096, 2048], iau: 'VENUS', r: 6051.8, face: 0, clouds: '4k_venus_atmosphere.jpg' },
  { id: 'io', trek: 'Io_GalileoSSI_Voyager_Global_Mosaic_ClrMerge_1km', sizes: [2048], iau: 'IO', r: 1821.6, face: 0 },
  { id: 'europa', trek: 'Europa_Voyager_Galileo_Blend_ColorMosaic', sizes: [2048], iau: 'EUROPA', r: 1560.8, face: 0 },
  { id: 'ganymede', trek: 'Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m', sizes: [2048], iau: 'GANYMEDE', r: 2634.1, face: 0 },
  { id: 'callisto', usgs: 'Callisto_Voyager_GalileoSSI_global_mosaic_1km', sizes: [4096, 2048], iau: 'CALLISTO', r: 2410.3, face: 0 },
  { id: 'enceladus', trek: 'Enceladus_Cassini_mosaic_global_110m', sizes: [2048], iau: 'ENCELADUS', r: 252.1, face: 0 },
  { id: 'titan', usgs: 'Titan_ISS_P19658_Mosaic_Global_4km', sizes: [4096, 2048], iau: 'TITAN', r: 2574.7, face: 0 },
  { id: 'ceres', usgs: 'Ceres_Dawn_FC_DLR_global_20ppd_Oct2015', sizes: [4096, 2048], iau: 'CERES', r: 469.7, face: 0 },
  { id: 'vesta', trek: 'Vesta_Dawn_HAMO_TrueClr_DLR_global_74ppd_IAU', sizes: [2048], iau: 'VESTA', r: 262.7, face: 0 },
  // `unseen`: parts no spacecraft saw (the far south of Pluto and Charon, Triton's north) are black in the mosaics; the
  // fill step paints them plain (fillUnseen).
  { id: 'pluto', usgs: 'Pluto_NewHorizons_Global_Mosaic_300m_Jul2017_8bit', sizes: [4096, 2048], iau: 'PLUTO', r: 1188.3, face: 180, unseen: true },
  { id: 'charon', usgs: 'Charon_NewHorizons_Global_Mosaic_300m_Jul2017_8bit', sizes: [2048], iau: 'CHARON', r: 606, face: 0, unseen: true },
  { id: 'triton', usgs: 'Triton_Voyager2_ClrMosaic_GlobalFill_600m', sizes: [2048], iau: 'TRITON', r: 1353.4, face: 0, unseen: true },
  { id: 'jupiter', sss: '8k_jupiter.jpg', sizes: [4096, 2048], r: 69911, face: 0 },
  { id: 'saturn', sss: '8k_saturn.jpg', sizes: [4096, 2048], r: 58232, face: 0 },
  { id: 'uranus', sss: '2k_uranus.jpg', sizes: [2048], r: 25362, face: 0 },
  { id: 'neptune', sss: '2k_neptune.jpg', sizes: [2048], r: 24622, face: 0 },
  // The Sun (v0.54.0): drawn here (sunMap), with no source to fetch; it lights itself (its thumbnail too).
  { id: 'sun', drawn: true, sizes: [4096, 2048], r: 695700, face: 0, selfLit: true },
].filter((w) => !worldsWanted || worldsWanted.includes(w.id));

const log = (...a) => console.log(...a);
const jpeg = (img) => img.jpeg({ quality: 82, mozjpeg: true, chromaSubsampling: '4:2:0' });

// ---- maps ----------------------------------------------------------------------------------------

/** A Trek layer's zoom-3 tiles (16 × 8 of 256 px) stitched into one 4096 × 2048 picture (no data: dark grey). */
async function stitchTrek(layer) {
  const dir = path.join(SRC, 'trek', layer, '3');
  const files = fs.readdirSync(dir);
  const comp = files.map((f) => { const [r, c] = f.replace(/\.\w+$/, '').split('_').map(Number); return { input: path.join(dir, f), left: c * 256, top: r * 256 }; });
  if (comp.length !== 128) throw new Error(`${layer}: ${comp.length} of 128 tiles`);
  const buf = await sharp({ create: { width: 4096, height: 2048, channels: 3, background: '#3a3a3a' } }).composite(comp).png().toBuffer();
  return sharp(buf);
}

/** How a USGS mosaic's columns run: the east longitude of its left edge (maps always have east to the right). */
function usgsLeftEdge(name) {
  const lbl = ['_pds3.lbl', '.lbl'].map((x) => path.join(SRC, 'usgs', name + x)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const num = (re) => { const m = lbl.match(re); return m ? Number(m[1]) : null; };
  const west = /POSITIVE_LONGITUDE_DIRECTION\s*=\s*"?WEST|LongitudeDirection\s*=\s*PositiveWest/i.test(lbl);
  const westmost = num(/WESTERNMOST_LONGITUDE\s*=\s*(-?[\d.]+)/);
  const minLon = num(/MinimumLongitude\s*=\s*(-?[\d.]+)/), maxLon = num(/MaximumLongitude\s*=\s*(-?[\d.]+)/);
  let left;
  if (westmost !== null) left = west ? -westmost : westmost;
  else if (minLon !== null) left = west ? -maxLon : minLon;
  else throw new Error(`${name}: no longitude range in its label`);
  return { left: ((left % 360) + 540) % 360 - 180, west };
}

/** Turns a picture whose left edge is at east longitude `left` so that it starts at 180°W. */
async function rollTo180(img, left, W, H) {
  const shift = Math.round((((left + 180) % 360) + 360) % 360 / 360 * W) % W;
  const buf = await img.resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().png().toBuffer();
  if (!shift) return sharp(buf);
  // Column 0 of the output is longitude −180, which sits `W - shift` columns into the input.
  const cut = W - shift;
  const a = await sharp(buf).extract({ left: cut, top: 0, width: W - cut, height: H }).toBuffer();
  const b = await sharp(buf).extract({ left: 0, top: 0, width: cut, height: H }).toBuffer();
  return sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: W - cut, top: 0 }]);
}

async function mapOf(w) {
  if (w.trek) return stitchTrek(w.trek);
  if (w.usgs) {
    const f = path.join(SRC, 'usgs', `${w.usgs}.tif`);
    const { left } = usgsLeftEdge(w.usgs);
    log(`  ${w.id}: left edge at ${left}°E`);
    // Big mosaics: shrink first (the 8-bit ones are grey; normalise their contrast a little).
    const big = sharp(f, { limitInputPixels: false, unlimited: true }).toColourspace('srgb');
    const W = 4096, H = 2048;
    const roll = await rollTo180(big, left, W, H);
    return sharp(await roll.png().toBuffer());
  }
  if (w.sss) return sharp(path.join(SRC, 'sss', w.sss));
  if (w.drawn) return sunMap(4096, 2048);
  throw new Error(w.id);
}

// ---- the Sun (v0.54.0): its look, drawn -----------------------------------------------------------

/** A small seeded random number generator (the same map every build). */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash3 = (x, y, z, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * The Sun's surface as an equirectangular map: granules (cells of hot gas rising, bright, with darker lanes where it
 * sinks), a gentle larger mottling, and a few groups of sunspots in the two belts where they appear (5–35° north and
 * south), each a dark core in a lighter rim. Worked out on the sphere, so granules stay round near the poles. The
 * limb's darkening is not in the map: the app shades the disc as it is seen. Not a real day's Sun, which changes by the
 * hour, but how its surface looks.
 */
async function sunMap(W, H) {
  const out = Buffer.alloc(W * H * 3);
  const GR = 110; // granule cells across the sphere's radius
  const R = rng(20260126);
  // Sunspot groups: latitude, longitude, spots (offset along the group, size).
  const spots = [];
  for (let g = 0; g < 9; g++) {
    const lat = (R() < 0.5 ? -1 : 1) * (6 + R() * 26), lon = -180 + R() * 360, n = 1 + Math.floor(R() * 4), tilt = (R() - 0.5) * 20;
    for (let k = 0; k < n; k++) {
      const along = (k - (n - 1) / 2) * (2.2 + R() * 2.5);
      spots.push({ lat: lat + Math.sin(tilt * Math.PI / 180) * along * 0.4 + (R() - 0.5), lon: lon + along, r: (k === 0 ? 1.2 : 0.5) + R() * 1.1 });
    }
  }
  const sp = spots.map((s) => { const la = s.lat * Math.PI / 180, lo = s.lon * Math.PI / 180; return { v: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)], r: s.r * Math.PI / 180 }; });
  const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // Larger, softer mottling: value noise on the sphere.
  const vnoise = (x, y, z, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    let acc = 0;
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      acc += hash3(xi + dx, yi + dy, zi + dz, s) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    return acc;
  };
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      const px = cl * Math.cos(lon), py = cl * Math.sin(lon), pz = sl;
      // Granules: the two nearest jittered cell points (Worley); the lanes are where they are about as near.
      const gx = px * GR, gy = py * GR, gz = pz * GR, ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
      let f1 = 9, f2 = 9;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz;
        const qx = cx + hash3(cx, cy, cz, 1), qy = cy + hash3(cx, cy, cz, 2), qz = cz + hash3(cx, cy, cz, 3);
        const d = (qx - gx) ** 2 + (qy - gy) ** 2 + (qz - gz) ** 2;
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const lane = smooth(0.0, 0.22, Math.sqrt(f2) - Math.sqrt(f1));
      const mott = vnoise(px * 9 + 50, py * 9 + 50, pz * 9 + 50, 7) * 0.6 + vnoise(px * 23 + 50, py * 23 + 50, pz * 23 + 50, 8) * 0.4;
      let b = 0.80 + 0.22 * lane + 0.16 * (mott - 0.5);
      // Sunspots: a dark core (umbra) in a lighter rim (penumbra), with faculae (bright patches) around the groups.
      let umb = 0, pen = 0, fac = 0;
      for (const s of sp) {
        const d = Math.acos(Math.max(-1, Math.min(1, px * s.v[0] + py * s.v[1] + pz * s.v[2])));
        if (d > s.r * 6) continue;
        const ragged = 1 + 0.18 * (vnoise(px * 120, py * 120, pz * 120, 11) - 0.5);
        umb = Math.max(umb, 1 - smooth(0.36 * s.r, 0.46 * s.r, d * ragged));
        pen = Math.max(pen, 1 - smooth(0.85 * s.r, s.r, d * ragged));
        fac = Math.max(fac, (1 - smooth(s.r, 5 * s.r, d)) * vnoise(px * 40, py * 40, pz * 40, 12));
      }
      b *= 1 + 0.10 * fac * (1 - pen);
      b *= 1 - 0.36 * pen;
      b *= 1 - 0.55 * umb;
      // Brightness to colour: deep orange in the lanes and spots, yellow-white in the granules' middles.
      const t = Math.max(0, Math.min(1.15, b));
      const o = (y * W + x) * 3;
      out[o] = Math.min(255, Math.round(60 + 200 * Math.min(1, t * 1.06)));
      out[o + 1] = Math.min(255, Math.round(10 + 190 * Math.pow(t, 2.2)));
      out[o + 2] = Math.min(255, Math.round(2 + 90 * Math.pow(t, 5)));
    }
  }
  return sharp(out, { raw: { width: W, height: H, channels: 3 } });
}

// ---- the parts no spacecraft saw (v0.54.0) ---------------------------------------------------------

/** A box blur (radius r) of a W × H plane: wraps east–west, stops at the poles. Two passes look like a Gaussian. */
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
  for (let y = 0; y < H; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += src[y * W + ((k % W) + W) % W];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = s / n;
      s += src[y * W + (x + r + 1) % W] - src[y * W + ((x - r) % W + W) % W];
    }
  }
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.max(0, Math.min(H - 1, k)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = s / n;
      s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
    }
  }
  return out;
}

/**
 * Paints the parts of a map that no spacecraft saw (left black in the mosaic) the plain colour of the ground around
 * them, with a soft edge and a faint, even mottling, so the world shows whole without making up what is there. Only
 * big black areas count (a crater's shadow stays). Run on the written maps; once filled, nothing is left to fill.
 */
async function fillUnseen(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++) dark[i] = 0.3 * data[3 * i] + 0.59 * data[3 * i + 1] + 0.11 * data[3 * i + 2] < 14 ? 1 : 0;
  // The black areas joined up (wrapping east–west); only those bigger than 0.2% of the map.
  const mask = new Float32Array(N), seen = new Uint8Array(N), stack = new Int32Array(N), comp = new Int32Array(N);
  let filled = 0;
  for (let i0 = 0; i0 < N; i0++) {
    if (!dark[i0] || seen[i0]) continue;
    let sp = 0, n = 0;
    stack[sp++] = i0; seen[i0] = 1;
    while (sp) {
      const i = stack[--sp]; comp[n++] = i;
      const x = i % W, y = (i - x) / W;
      for (const j of [y * W + (x + 1) % W, y * W + (x + W - 1) % W, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j >= 0 && dark[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
    if (n > N * 0.002) { for (let k = 0; k < n; k++) mask[comp[k]] = 1; filled += n; }
  }
  if (!filled) { log(`  ${path.basename(file)}: nothing unseen`); return; }
  // A few pixels wider: the mosaic's edge fades to black over them.
  const grown = boxBlur(mask, W, H, Math.max(2, Math.round(W / 512)));
  for (let i = 0; i < N; i++) mask[i] = grown[i] > 0.001 ? 1 : 0;
  // The colours of the ground around, spread smoothly across them (push-pull: averaged down a pyramid of halved maps,
  // then each level's gaps taken from the one above), so the fill meets each edge in that edge's own colour.
  const known = new Float32Array(N);
  for (let i = 0; i < N; i++) known[i] = mask[i] || dark[i] ? 0 : 1;
  const levels = [{ W, H, w: known, c: [0, 1, 2].map((k) => Float32Array.from({ length: N }, (_, i) => data[3 * i + k] * known[i])) }];
  while (levels.at(-1).W > 8) {
    const p = levels.at(-1), w2 = p.W >> 1, h2 = Math.max(1, p.H >> 1);
    const w = new Float32Array(w2 * h2), c = [0, 1, 2].map(() => new Float32Array(w2 * h2));
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      const o = y * w2 + x;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = Math.min(p.H - 1, 2 * y + dy) * p.W + 2 * x + dx;
        w[o] += p.w[i] / 4;
        for (let k = 0; k < 3; k++) c[k][o] += p.c[k][i] / 4;
      }
    }
    levels.push({ W: w2, H: h2, w, c });
  }
  // The smallest level: what it knows, and its gaps (a pole all unseen) spread in from their neighbours, so a pole takes
  // the colour of the ground nearest it.
  const T = levels.at(-1), top = [0, 1, 2].map((k) => Float32Array.from({ length: T.W * T.H }, (_, o) => (T.w[o] > 0 ? T.c[k][o] / T.w[o] : NaN)));
  const mean = [0, 1, 2].map((k) => { let s = 0, n = 0; for (const v of top[k]) if (!Number.isNaN(v)) { s += v; n++; } return n ? s / n : 0; });
  const gap = Array.from({ length: T.W * T.H }, (_, o) => !(T.w[o] > 0));
  for (let k = 0; k < 3; k++) for (let o = 0; o < top[k].length; o++) if (gap[o]) top[k][o] = mean[k];
  for (let it = 0; it < 400; it++) for (let y = 0; y < T.H; y++) for (let x = 0; x < T.W; x++) {
    const o = y * T.W + x;
    if (!gap[o]) continue;
    const nb = [y * T.W + (x + 1) % T.W, y * T.W + (x + T.W - 1) % T.W, ...(y > 0 ? [o - T.W] : []), ...(y < T.H - 1 ? [o + T.W] : [])];
    for (let k = 0; k < 3; k++) top[k][o] = nb.reduce((s, j) => s + top[k][j], 0) / nb.length;
  }
  // From the top down: where a level knows too little, the level above fills in (bilinear, wrapping east–west).
  let up = { W: T.W, H: T.H, c: top };
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], out = [0, 1, 2].map(() => new Float32Array(L.W * L.H));
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const o = y * L.W + x, a = Math.min(1, L.w[o] * 2);
      let u = [0, 0, 0];
      if (up) {
        const fx = (x + 0.5) / 2 - 0.5, fy = Math.max(0, Math.min(up.H - 1, (y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, y1 = Math.min(up.H - 1, y0 + 1);
        const at = (xx, yy, k) => up.c[k][yy * up.W + ((xx % up.W) + up.W) % up.W];
        u = [0, 1, 2].map((k) => (at(x0, y0, k) * (1 - tx) + at(x0 + 1, y0, k) * tx) * (1 - ty) + (at(x0, y1, k) * (1 - tx) + at(x0 + 1, y1, k) * tx) * ty);
      }
      for (let k = 0; k < 3; k++) out[k][o] = L.w[o] > 0 ? a * (L.c[k][o] / L.w[o]) + (1 - a) * u[k] : u[k];
    }
    up = { W: L.W, H: L.H, c: out };
  }
  // Fully painted inside, fading out just outside the edge, with a faint, even mottling (± 3%, the same every build).
  const r = Math.max(2, Math.round(W / 256));
  const a1 = boxBlur(boxBlur(mask, W, H, r), W, H, r);
  const R = rng(7), gw = 64, gh = 32, grid = Float32Array.from({ length: gw * gh }, () => R() * 2 - 1);
  for (let i = 0; i < N; i++) {
    const a = mask[i] ? 1 : Math.min(1, a1[i] * 2);
    if (a <= 0) continue;
    const x = i % W, y = (i - x) / W, fx = (x / W) * gw, fy = Math.min(gh - 1.001, (y / H) * (gh - 1));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, g = (xx, yy) => grid[yy * gw + (xx % gw)];
    const m = 1 + 0.03 * ((g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty);
    for (let k = 0; k < 3; k++) data[3 * i + k] = Math.max(0, Math.min(255, Math.round(data[3 * i + k] * (1 - a) + up.c[k][i] * m * a)));
  }
  await jpeg(sharp(data, { raw: { width: W, height: H, channels: 3 } })).toFile(file + '.tmp');
  fs.renameSync(file + '.tmp', file);
  log(`  ${path.basename(file)}: ${(100 * filled / N).toFixed(1)}% unseen, filled from the ground around`);
}

async function fillAll() {
  for (const w of WORLDS.filter((x) => x.unseen)) for (const s of w.sizes) await fillUnseen(path.join(OUT, `${w.id}-${s / 1024}k.jpg`));
}

async function textures() {
  for (const w of WORLDS) {
    log(`map ${w.id}`);
    const img = await mapOf(w);
    const png = await img.resize(4096, 2048, { kernel: 'lanczos3', fit: 'fill' }).removeAlpha().png().toBuffer();
    for (const s of w.sizes) {
      const out = path.join(OUT, `${w.id}-${s / 1024}k.jpg`);
      await jpeg(sharp(png).resize(s, s / 2, { kernel: 'lanczos3' })).toFile(out);
      log(`  ${path.basename(out)} ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
    }
    if (w.elev) {
      const e = await (await stitchTrek(w.elev)).resize(2048, 1024, { kernel: 'lanczos3' }).png().toBuffer();
      const out = path.join(OUT, `${w.id}-elev-2k.jpg`);
      await jpeg(sharp(e)).toFile(out);
      log(`  ${path.basename(out)} ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
    }
    if (w.clouds) {
      const out = path.join(OUT, `${w.id}-clouds-2k.jpg`);
      await jpeg(sharp(path.join(SRC, 'sss', w.clouds)).resize(2048, 1024, { kernel: 'lanczos3' })).toFile(out);
      log(`  ${path.basename(out)} ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
    }
  }
}

// ---- thumbnails: the world as a small lit ball ---------------------------------------------------

async function thumbs() {
  const S = 128;
  // The Earth too (the solar system view shows it), from the app's Blue Marble picture.
  for (const w of [...WORLDS, ...(worldsWanted && !worldsWanted.includes('earth') ? [] : [{ id: 'earth', face: -40, file: path.join(OUT, '../raster/bluemarble-2k.jpg') }])]) {
    const file = w.file ?? path.join(OUT, `${w.id}-2k.jpg`);
    if (!fs.existsSync(file)) continue;
    const { data, info } = await sharp(file).resize(1024, 512).raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(S * S * 4);
    const lon0 = (w.face * Math.PI) / 180, lat0 = (15 * Math.PI) / 180;
    // Light from the upper left.
    const L = [-0.55, 0.45, 0.70];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const nx = (x + 0.5 - S / 2) / (S / 2 - 1), ny = (S / 2 - y - 0.5) / (S / 2 - 1);
      const rr = nx * nx + ny * ny;
      const o = (y * S + x) * 4;
      if (rr > 1) continue;
      const nz = Math.sqrt(1 - rr);
      // Orthographic: rotate the point (nx, ny, nz) by the latitude and longitude faced.
      const yy = ny * Math.cos(lat0) + nz * Math.sin(lat0), zz = -ny * Math.sin(lat0) + nz * Math.cos(lat0);
      const lat = Math.asin(yy), lon = Math.atan2(nx, zz) + lon0;
      const u = ((((lon / (2 * Math.PI) + 0.5) % 1) + 1) % 1) * info.width, v = (0.5 - lat / Math.PI) * info.height;
      const p = (Math.min(info.height - 1, Math.max(0, Math.floor(v))) * info.width + Math.min(info.width - 1, Math.floor(u))) * 3;
      // The Sun shines by itself: no dark side, only its edge a little darker.
      const lit = w.selfLit ? 0.62 + 0.42 * Math.sqrt(nz) : 0.35 + 0.75 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      const edge = Math.min(1, (1 - Math.sqrt(rr)) * S * 0.5);
      for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, data[p + k] * lit);
      out[o + 3] = Math.round(255 * edge);
    }
    await sharp(out, { raw: { width: S, height: S, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, 'thumbs', `${w.id}.png`));
  }
  log('thumbnails done');
}

// ---- IAU names -------------------------------------------------------------------------------------

/** The records of a shapefile's .dbf (in a zip). */
function readDbf(zip) {
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n');
  const dbf = names.find((n) => n.toLowerCase().endsWith('.dbf'));
  const b = execFileSync('unzip', ['-p', zip, dbf], { maxBuffer: 1 << 28 });
  const n = b.readUInt32LE(4), hl = b.readUInt16LE(8), rl = b.readUInt16LE(10);
  const fields = [];
  for (let i = 32; b[i] !== 0x0d; i += 32) fields.push({ name: b.subarray(i, i + 11).toString('latin1').replace(/\0.*$/, ''), len: b[i + 16] });
  const rows = [];
  for (let k = 0; k < n; k++) {
    let o = hl + k * rl + 1;
    const r = {};
    for (const f of fields) { r[f.name] = b.subarray(o, o + f.len).toString('utf8').trim(); o += f.len; }
    rows.push(r);
  }
  return rows;
}

/** IAU feature types → a short code, an icon class and how much a label of it matters. */
const TYPES = {
  'Crater, craters': 'cr', 'Mare, maria': 'ma', 'Oceanus, oceani': 'oc', 'Lacus, lacūs': 'la', 'Sinus, sinūs': 'si', 'Palus, paludes': 'pa',
  'Mons, montes': 'mo', 'Vallis, valles': 'va', 'Rima, rimae': 'ri', 'Rupes, rupēs': 'ru', 'Dorsum, dorsa': 'do', 'Catena, catenae': 'ca',
  'Promontorium, promontoria': 'pr', 'Planitia, planitiae': 'pl', 'Planum, plana': 'pn', 'Terra, terrae': 'te', 'Chasma, chasmata': 'ch',
  'Fossa, fossae': 'fo', 'Tholus, tholi': 'th', 'Patera, paterae': 'pe', 'Labyrinthus, labyrinthi': 'lb', 'Mensa, mensae': 'me',
  'Chaos, chaoses': 'cs', 'Colles': 'co', 'Collis, colles': 'co', 'Fluctus, fluctūs': 'fl', 'Linea, lineae': 'li', 'Macula, maculae': 'mc',
  'Regio, regiones': 're', 'Scopulus, scopuli': 'sc', 'Sulcus, sulci': 'su', 'Tessera, tesserae': 'ts', 'Corona, coronae': 'cn',
  'Arcus, arcūs': 'ar', 'Astrum, astra': 'as', 'Farrum, farra': 'fa', 'Fluctus, fluctus': 'fl', 'Undae': 'un', 'Unda, undae': 'un',
  'Cavus, cavi': 'cv', 'Labes, labēs': 'lv', 'Lingula, lingulae': 'lg', 'Serpens, serpentes': 'se', 'Vastitas, vastitates': 'vs',
  'Facula, faculae': 'fc', 'Flexus, flexūs': 'fx', 'Insula, insulae': 'in', 'Mare': 'ma', 'Lacus': 'la', 'Flumen, flumina': 'fm',
  'Albedo Feature': 'al', 'Statio': 'st', 'Astronaut-named features': 'an', 'Landing site name': 'ls', 'Eruptive center': 'ec',
  'Plume': 'pm', 'Dorsa': 'do', 'Fretum, freta': 'ft', 'Sinus': 'si', 'Labes': 'lv', 'Saxum, saxa': 'sx', 'Tholus': 'th',
  'Virga, virgae': 'vi', 'Large ringed feature': 'lr', 'Lacuna, lacunae': 'lc', 'Plume, plumes': 'pm', 'Lenticula, lenticulae': 'le', 'Reticulum, reticula': 'rt', 'Planitia': 'pl', 'Satellite Feature': null,
};
const BIG_TYPES = new Set(['lr', 'ma', 'oc', 'te', 'pl', 'pn', 're', 'vs', 'ch', 'mo', 'va', 'ts', 'la', 'si', 'pa', 'al', 'lb', 'fm', 'in', 'un']);

/** One world's named places: [lon, lat, name, type code, diameter km, origin index]; origins listed once. */
function namesOf(w) {
  const zip = path.join(SRC, 'iau', `${w.iau}.zip`);
  const rows = readDbf(zip);
  const unknown = new Map();
  const origins = [], originIx = new Map();
  const out = [];
  for (const r of rows) {
    if (!/Adopted/i.test(r.approval)) continue;
    const code = TYPES[r.type];
    if (code === null) continue;
    if (code === undefined) { unknown.set(r.type, (unknown.get(r.type) ?? 0) + 1); continue; }
    const lon = ((Number(r.center_lon) + 540) % 360) - 180, lat = Number(r.center_lat);
    const d = Math.round(Number(r.diameter || 0) * 10) / 10;
    if (!isFinite(lon) || !isFinite(lat)) continue;
    const origin = r.origin.trim();
    let oi = -1;
    if (origin) { oi = originIx.get(origin); if (oi === undefined) { oi = origins.length; origins.push(origin); originIx.set(origin, oi); } }
    out.push([Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, r.name, code, d, oi]);
  }
  if (unknown.size) log(`  ${w.id}: types not used: ${[...unknown].map(([t, n]) => `${t} (${n})`).join(', ')}`);
  // Biggest first: labels are placed in this order.
  out.sort((a, b) => (BIG_TYPES.has(b[3]) - BIG_TYPES.has(a[3])) || b[4] - a[4]);
  return { names: out, origins };
}

function names() {
  for (const w of WORLDS) {
    if (!w.iau) continue;
    const { names: list, origins } = namesOf(w);
    const file = path.join(OUT, `${w.id}-names.json`);
    // Spanish origins, when translated (scripts/data/space/origins-es/<id>.json: { "<English>": "<Spanish>" }).
    const esFile = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'origins-es', `${w.id}.json`);
    const es = fs.existsSync(esFile) ? JSON.parse(fs.readFileSync(esFile, 'utf8')) : {};
    const missing = origins.filter((o) => !es[o]).length;
    fs.writeFileSync(file, JSON.stringify({ world: w.id, source: 'IAU Gazetteer of Planetary Nomenclature (USGS)', cols: ['lon', 'lat', 'name', 'type', 'km', 'origin'], rows: list, origins: { en: origins, es: origins.map((o) => es[o] ?? null) } }));
    log(`  ${w.id}: ${list.length} names, ${origins.length} origins (${missing} not in Spanish yet), ${(fs.statSync(file).size / 1e3).toFixed(0)} KB`);
  }
}

// ---- heights for the 3D view ---------------------------------------------------------------------

/** A height grid (metres, Float32), equirectangular from 180°W, from the raw sources. */
async function heightGrid(id) {
  if (id === 'moon') {
    // LOLA via the CGI Moon Kit: uint16 half-metres + 20 000 (10 km), relative to 1737.4 km, centred on 0°.
    const { data, info } = await sharp(path.join(SRC, 'dem', 'ldem_16_uint.tif'), { limitInputPixels: false }).toColourspace('grey16').raw({ depth: 'ushort' }).toBuffer({ resolveWithObject: true });
    const a = new Uint16Array(data.buffer, data.byteOffset, info.width * info.height);
    const g = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) g[i] = a[i] / 2 - 10000;
    return { g, W: info.width, H: info.height };
  }
  if (id === 'mars') {
    // MOLA MEGDR 16 px/°: big-endian int16 metres above the areoid, 5760 × 2880, columns from 0°E.
    const b = fs.readFileSync(path.join(SRC, 'dem', 'megt90n000eb.img'));
    const W = 5760, H = 2880, g = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + ((x + W / 2) % W)] = b.readInt16BE((y * W + x) * 2);
    return { g, W, H };
  }
  throw new Error(id);
}

/** Box-averaged resample of a height grid to W × H. */
function resample({ g, W, H }, W2, H2) {
  const out = new Float32Array(W2 * H2);
  const fx = W / W2, fy = H / H2;
  for (let y = 0; y < H2; y++) {
    const y0 = y * fy, y1 = (y + 1) * fy;
    for (let x = 0; x < W2; x++) {
      const x0 = x * fx, x1 = (x + 1) * fx;
      let s = 0, n = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
        const wgt = (Math.min(x1, xx + 1) - Math.max(x0, xx)) * (Math.min(y1, yy + 1) - Math.max(y0, yy));
        s += g[Math.min(H - 1, yy) * W + Math.min(W - 1, xx)] * wgt; n += wgt;
      }
      out[y * W2 + x] = s / n;
    }
  }
  return out;
}

async function heights() {
  for (const id of ['moon', 'mars']) {
    const Q = 16;
    if (worldsWanted && !worldsWanted.includes(id)) continue;
    const grid = await heightGrid(id);
    let bytes = 0, files = 0;
    for (let z = 0; z <= 3; z++) {
      const cols = 2 << z, rows = 1 << z, W2 = cols * 256, H2 = rows * 256;
      const g = resample(grid, W2, H2);
      for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
        const px = Buffer.alloc(256 * 256 * 3);
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          // Terrarium (R·256 + G + B/256 − 32768) in steps of Q metres, far finer than a pixel's kilometres; B stays 0. Rounding
          // keeps the files small.
          const v = Math.round(g[(ty * 256 + y) * W2 + tx * 256 + x] / Q) * Q + 32768;
          const o = (y * 256 + x) * 3;
          px[o] = v >> 8; px[o + 1] = v & 255; px[o + 2] = 0;
        }
        const dir = path.join(OUT, id, 'h', String(z), String(ty));
        fs.mkdirSync(dir, { recursive: true });
        // Lossless WebP: about 30% smaller than PNG.
        const f = path.join(dir, `${tx}.webp`);
        await sharp(px, { raw: { width: 256, height: 256, channels: 3 } }).webp({ lossless: true, effort: 6 }).toFile(f);
        bytes += fs.statSync(f).size; files++;
      }
    }
    let lo = Infinity, hi = -Infinity;
    for (const v of grid.g) { if (v < lo) lo = v; if (v > hi) hi = v; }
    log(`heights ${id}: ${files} tiles, ${(bytes / 1e6).toFixed(1)} MB, from ${Math.round(lo)} to ${Math.round(hi)} m`);
  }
}

// ---- previews: the map with its biggest places marked --------------------------------------------

async function previews() {
  for (const w of WORLDS) {
    const file = path.join(OUT, `${w.id}-2k.jpg`);
    if (!w.iau || !fs.existsSync(file)) continue;
    const { names: list } = namesOf(w);
    const W = 2048, H = 1024;
    const top = list.filter((r) => r[4] > 0).slice(0, 60);
    const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${top.map(([lon, lat, n, , km]) => {
      const x = ((lon + 180) / 360) * W, y = ((90 - lat) / 180) * H;
      const r = Math.max(3, Math.min(60, (km / (2 * Math.PI * w.r)) * W / 2));
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#ff0" stroke-width="2"/><text x="${x + r + 2}" y="${y + 4}" font-size="14" fill="#ff0" stroke="#000" stroke-width="0.6" font-family="sans-serif">${n.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    }).join('')}</svg>`;
    await sharp(file).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toFile(path.join(PREVIEW, `${w.id}.jpg`));
  }
  log(`previews in ${PREVIEW}`);
}

if (want('textures')) await textures();
if (want('fill')) await fillAll();
if (want('thumbs')) await thumbs();
if (want('names')) names();
if (want('heights')) await heights();
if (PREVIEW) await previews();
