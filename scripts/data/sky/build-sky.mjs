// Builds the sky (v0.21.0) from the sources fetch_sky.sh downloads and the researched files in this folder:
//   public/data/sky/stars.json           stars to magnitude 6.5 [hip, ra, dec, mag, b-v] and their names and designations
//   public/data/sky/constellations.json  the 88 constellations: names, lines, borders, label, area, brightest star,
//                                        best month, objects in them, and their researched texts (_constellations.json)
//   public/data/sky/objects.json         deep-sky objects: the Messier catalogue and famous others (_objects.json)
//   public/data/sky/milkyway-2k.jpg/-4k.jpg  ESO's Milky Way panorama (galactic coordinates, l = 0 in the middle,
//                                        increasing to the left)
//   public/data/sky/milkyway-top.jpg     the Milky Way seen from above (NASA/JPL-Caltech/ESO/R. Hurt)
// Coordinates are J2000 right ascension and declination in degrees (RA 0..360).
//
//   node scripts/data/sky/build-sky.mjs <sky-src folder> [--only data|images]
//   node scripts/data/sky/build-sky.mjs --check     (validate the researched files and compare the outputs; no sources needed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const OUT = path.join(ROOT, 'public/data/sky');
const args = process.argv.slice(2);
const check = args.includes('--check');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const SRC = args.find((a) => !a.startsWith('--') && a !== only);
const errors = [];
const fail = (m) => errors.push(m);
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const readOpt = (f) => (fs.existsSync(path.join(HERE, f)) ? read(path.join(HERE, f)) : null);
const isText = (t) => t && typeof t === 'object' && typeof t.en === 'string' && t.en.trim() && typeof t.es === 'string' && t.es.trim();
const RAD = Math.PI / 180;
const r3 = (v) => Math.round(v * 1000) / 1000;
const ra = (lon) => (lon < 0 ? lon + 360 : lon);
const vec = (a, d) => [Math.cos(d * RAD) * Math.cos(a * RAD), Math.cos(d * RAD) * Math.sin(a * RAD), Math.sin(d * RAD)];

/** Is a point (ra, dec) inside a ring of [ra, dec]? Winding number in a stereographic projection centred on the point,
 * so rings around a pole or across RA 0 work too (a ring must not hold the point's antipode: constellations are small). */
export function inRing(ring, a, d) {
  const p = vec(a, d);
  // A frame at p: e (east), n (north).
  const e = [-Math.sin(a * RAD), Math.cos(a * RAD), 0];
  const n = [-Math.sin(d * RAD) * Math.cos(a * RAD), -Math.sin(d * RAD) * Math.sin(a * RAD), Math.cos(d * RAD)];
  let wind = 0, prev = null;
  const pts = ring.map(([ra0, de0]) => {
    const v = vec(ra0, de0);
    const z = v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
    const k = 2 / (1 + z);
    return [k * (v[0] * e[0] + v[1] * e[1] + v[2] * e[2]), k * (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]), z];
  });
  if (pts.some((q) => q[2] < -0.2)) return false; // the ring reaches more than ~100° from the point: it is not around it
  for (const q of [...pts, pts[0]]) {
    if (prev) {
      const a0 = Math.atan2(prev[1], prev[0]), a1 = Math.atan2(q[1], q[0]);
      let da = a1 - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      wind += da;
    }
    prev = q;
  }
  return Math.abs(wind) > Math.PI;
}

/** Area of a ring on the sphere, in square degrees (sum of the spherical triangles from its first point). */
function ringArea(ring) {
  const v = ring.map(([a, d]) => vec(a, d));
  let s = 0;
  for (let i = 1; i < v.length - 1; i++) {
    const [A, B, C] = [v[0], v[i], v[i + 1]];
    const triple = A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
    const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
    s += 2 * Math.atan2(triple, 1 + dot(A, B) + dot(B, C) + dot(C, A));
  }
  return Math.abs(s) / (RAD * RAD);
}

/** A border line with long steps along a parallel broken into short ones (so it is drawn along the parallel). */
function densify(line) {
  const out = [];
  for (let i = 0; i < line.length; i++) {
    const [a, d] = line[i];
    if (i) {
      const [a0, d0] = line[i - 1];
      let da = a - a0;
      if (da > 180) da -= 360;
      if (da < -180) da += 360;
      const n = Math.ceil(Math.abs(da) / 2);
      for (let k = 1; k < n; k++) out.push([(a0 + (da * k) / n + 360) % 360, d0 + ((d - d0) * k) / n]);
    }
    out.push([a, d]);
  }
  return out;
}
const flat = (pts) => pts.flatMap(([a, d]) => [r3(a), r3(d)]);

let wrote = 0, stale = 0;
function emit(file, value) {
  const p = path.join(OUT, file), text = JSON.stringify(value);
  if (check) {
    if (!fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== text) { console.error(`FAIL public/data/sky/${file} is out of date; run node scripts/data/sky/build-sky.mjs <sky-src>`); stale++; }
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(p, text);
  wrote++;
  console.log(`wrote public/data/sky/${file} (${Math.round(text.length / 1024)} KB)`);
}

// ---- the researched files (all optional until written)
const RC = readOpt('_constellations.json');
const RS = readOpt('_stars.json');
const RO = readOpt('_objects.json');
const OBJ_TYPES = ['galaxy', 'nebula', 'planetary', 'snr', 'open', 'globular', 'dark', 'star', 'other'];
const CON_ORIGINS = ['ptolemy', 'dutch', 'hevelius', 'lacaille', 'other'];
if (RC) for (const [i, c] of RC.constellations.entries()) {
  const w = `_constellations.json [${i}] (${c.id})`;
  for (const k of ['name', 'meaning', 'origin', 'text']) if (!isText(c[k])) fail(`${w}: "${k}" needs en and es`);
  if (c.other != null && !isText(c.other)) fail(`${w}: "other" needs en and es`);
  if (!CON_ORIGINS.includes(c.originType)) fail(`${w}: "originType" is one of ${CON_ORIGINS.join(', ')}`);
  if (!c.wiki?.en) fail(`${w}: "wiki" needs an English title`);
}
if (RO) for (const [i, o] of RO.objects.entries()) {
  const w = `_objects.json [${i}] (${o.id})`;
  if (!isText(o.name) || !isText(o.text)) fail(`${w}: "name" and "text" need en and es`);
  if (!OBJ_TYPES.includes(o.type)) fail(`${w}: "type" is one of ${OBJ_TYPES.join(', ')}`);
  if (!(o.ra >= 0 && o.ra < 360 && o.dec >= -90 && o.dec <= 90)) fail(`${w}: "ra" (0..360) and "dec" (degrees)`);
  if (o.ly != null && !(o.ly > 0)) fail(`${w}: "ly" is a distance in light-years`);
}

if (check) {
  if (errors.length) { for (const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
  // Without the sources, compare only what the researched files feed: rebuild needs the sources.
  for (const f of ['stars.json', 'constellations.json', 'objects.json']) if (!fs.existsSync(path.join(OUT, f))) { console.error(`FAIL public/data/sky/${f} is missing`); stale++; }
  if (stale) process.exit(1);
  const c = read(path.join(OUT, 'constellations.json'));
  if (RC) for (const x of RC.constellations) { const b = c.cons.find((k) => k.id === x.id); if (!b || JSON.stringify(b.text) !== JSON.stringify(x.text)) { console.error(`FAIL public/data/sky/constellations.json is out of date for ${x.id}; rebuild it`); process.exit(1); } }
  console.log(`ok   sky: ${c.cons.length} constellations${RC ? ' (researched)' : ''}`);
  process.exit(0);
}
if (!SRC) { console.error('usage: node scripts/data/sky/build-sky.mjs <sky-src folder> [--only data|images]'); process.exit(2); }
if (errors.length) { for (const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
const src = (f) => read(path.join(SRC, f));

if (only !== 'images') {
  // ---- stars
  const S = src('stars.6.json').features;
  const N = src('starnames.json');
  const stars = S.map((f) => [Number(f.id), r3(ra(f.geometry.coordinates[0])), r3(f.geometry.coordinates[1]), Math.round(Number(f.properties.mag) * 100) / 100, Math.round((parseFloat(f.properties.bv) || 0.6) * 100) / 100])
    .sort((a, b) => a[3] - b[3]);
  const have = new Set(stars.map((s) => s[0]));
  const names = {};
  const sinfo = new Map((RS?.stars ?? []).map((s) => [s.hip, s]));
  for (const [hip, n] of Object.entries(N)) {
    if (!have.has(Number(hip))) continue;
    const r = sinfo.get(Number(hip));
    const en = r?.name?.en ?? n.name ?? '', es = r?.name?.es ?? n.es ?? '';
    const desig = n.bayer || n.flam || '';
    if (!en && !desig) continue;
    names[hip] = [en, es && es !== en ? es : '', desig, n.c || ''];
  }
  for (const s of RS?.stars ?? []) if (!have.has(s.hip)) fail(`_stars.json: star ${s.name?.en} (HIP ${s.hip}) is not among the stars to magnitude 6.5`);
  emit('stars.json', { source: 'd3-celestial (BSD) from XHIP (Anderson & Francis 2012) and star name cross-indexes; names after the IAU WGSN', stars, names });
  // Where the elements come from (_elements.json).
  const RE = readOpt('_elements.json');
  if (RE) {
    const ORIG = ['bigbang', 'cosmic', 'lowmass', 'massive', 'wd', 'ns', 'human', 'none'];
    const minerals = read(path.join(ROOT, 'public/data/attributes/minerals.json'));
    const els = RE.elements.map((e) => { const { sources: _s, ...rest } = e; return rest; }).sort((a, b) => a.z - b.z);
    if (els.length !== 118 || els.some((e, i) => e.z !== i + 1)) fail('_elements.json: all 118 elements, 1 to 118');
    for (const e of els) {
      const w = `_elements.json ${e.symbol} (${e.z})`;
      if (!isText(e.name)) fail(`${w}: "name" needs en and es`);
      const sum = Object.entries(e.origin ?? {}).reduce((s, [k, v]) => { if (!ORIG.includes(k)) fail(`${w}: origin "${k}" is not one of ${ORIG.join(', ')}`); return s + v; }, 0);
      if (Math.abs(sum - 1) > 0.02) fail(`${w}: the origin shares add up to ${sum.toFixed(2)}, not 1`);
      if (e.mined && !minerals[e.mined]) fail(`${w}: "mined" ${e.mined} is not in minerals.json`);
      for (const k of ['made', 'earth', 'uses', 'fact']) if (e[k] != null && !isText(e[k])) fail(`${w}: "${k}" needs en and es`);
    }
    emit('elements.json', { source: 'Atlas Globe research after J. A. Johnson (2019), Science 363, 474 (sources in scripts/data/sky/_elements.json)', elements: els });
  }
  // The researched stars (cards) and the galaxy view's nearby stars, features and Local Group.
  if (RS) {
    const strip = (x) => { const { sources: _s, ...rest } = x; return rest; };
    emit('starinfo.json', { source: 'Atlas Globe research (sources in scripts/data/sky/_stars.json)', stars: RS.stars.map(strip) });
    emit('galaxy.json', { source: 'Atlas Globe research (sources in scripts/data/sky/_stars.json)', nearby: RS.nearby.map(strip), galaxy: RS.galaxy.map(strip), localGroup: RS.localGroup.map(strip) });
  }

  // ---- constellations
  const C = src('constellations.json').features;
  const L = new Map(src('constellations.lines.json').features.map((f) => [f.id, f.geometry.coordinates]));
  const B = src('constellations.bounds.json').features;
  const borders = src('constellations.borders.json').features.map((f) => f.geometry.coordinates.map((line) => flat(densify(line.map(([lo, la]) => [ra(lo), la]))))).flat();
  const research = new Map((RC?.constellations ?? []).map((c) => [c.id, c]));
  const objList = RO ? RO.objects : src('messier.json').features.map((f) => ({ id: f.id, ra: ra(f.geometry.coordinates[0]), dec: f.geometry.coordinates[1] }));
  const cons = [];
  for (const f of C) {
    const p = f.properties;
    if (cons.some((c) => c.id === f.id)) continue; // Serpens: one entry for its two parts
    const rings = B.filter((b) => b.id === f.id).flatMap((b) => (b.geometry.type === 'Polygon' ? b.geometry.coordinates : b.geometry.coordinates.flat())).map((r) => r.map(([lo, la]) => [ra(lo), la]));
    const inside = (a, d) => rings.some((r) => inRing(r, a, d));
    const area = rings.reduce((s, r) => s + ringArea(r), 0);
    const decs = rings.flat().map((q) => q[1]);
    if (inside(0, 90)) decs.push(90); // Ursa Minor holds the north celestial pole, Octans the south
    if (inside(0, -90)) decs.push(-90);
    let brightest = null;
    for (const s of stars) if (inside(s[1], s[2])) { brightest = s[0]; break; }
    const objects = objList.filter((o) => inside(o.ra, o.dec)).map((o) => o.id);
    const lab = C.filter((x) => x.id === f.id).map((x) => x.geometry.coordinates);
    const r = research.get(f.id);
    // The month when it is highest in the sky at about 9 pm: then the sidereal time (the Sun's RA + 135°) is its RA, and
    // the Sun's RA is about (month − 3.2) × 30° in the middle of a month (0° at the March equinox).
    const labRa = ra(lab[0][0]);
    const best = ((Math.round((labRa - 135) / 30 + 3.2) % 12) + 12) % 12 || 12;
    cons.push({
      id: f.id,
      name: r?.name ?? { en: p.name.replace(/ (Caput|Cauda)$/, ''), es: (p.es || p.name).replace(/ \(.*\)$/, '') },
      la: p.name.replace(/ (Caput|Cauda)$/, ''), gen: f.id === 'Cru' ? 'Crucis' : p.gen, rank: Number(p.rank), // d3-celestial gives "Crux"
      at: lab.map(([lo, la]) => [r3(ra(lo)), r3(la)]),
      lines: (L.get(f.id) ?? []).map((line) => flat(line.map(([lo, la]) => [ra(lo), la]))),
      bounds: rings.map((rr) => flat(rr)),
      area: Math.round(area * 10) / 10, dec: [Math.round(Math.min(...decs)), Math.round(Math.max(...decs))], best, brightest, objects,
      ...(r ? { meaning: r.meaning, origin: r.origin, originType: r.originType, text: r.text, ...(r.other ? { other: r.other } : {}), wiki: r.wiki } : {}),
    });
  }
  if (cons.length !== 88) fail(`expected 88 constellations, got ${cons.length}`);
  const total = cons.reduce((s, c) => s + c.area, 0);
  if (Math.abs(total - 41253) > 60) fail(`the constellations cover ${Math.round(total)} square degrees, not the sky's 41,253: a border ring is wrong`);
  for (const c of RC?.constellations ?? []) if (!cons.some((k) => k.id === c.id)) fail(`_constellations.json: no constellation ${c.id}`);
  emit('constellations.json', { source: 'd3-celestial (BSD): IAU constellations, lines, names; borders from Davenhall & Leggett (1989, VizieR VI/49)', cons, borders });

  // ---- deep-sky objects
  let objects;
  if (RO) objects = RO.objects.map((o) => { const { sources: _s, ...rest } = o; return { ...rest, ra: r3(o.ra), dec: r3(o.dec) }; });
  else {
    const T = { s: 'galaxy', e: 'galaxy', i: 'galaxy', oc: 'open', gc: 'globular', pn: 'planetary', snr: 'snr', sfr: 'nebula', rn: 'nebula', en: 'nebula', pos: 'other', sd: 'galaxy' };
    objects = src('messier.json').features.map((f) => ({ id: f.id, name: { en: f.properties.alt || f.id, es: f.properties.alt || f.id }, type: T[f.properties.type] ?? 'other', ra: r3(ra(f.geometry.coordinates[0])), dec: r3(f.geometry.coordinates[1]), mag: f.properties.mag }));
  }
  // The constellation an object is in: the researched one (SN 1006 sits on the Lupus–Centaurus border), else from the borders.
  for (const o of objects) o.con = o.con ?? cons.find((c) => c.bounds.some((b) => inRing(b.reduce((acc, v, i) => (i % 2 ? acc : [...acc, [v, b[i + 1]]]), []), o.ra, o.dec)))?.id;
  emit('objects.json', { source: RO ? 'Atlas Globe research (sources in scripts/data/sky/_objects.json)' : 'd3-celestial (BSD): Messier objects (SEDS)', objects });
}

if (only !== 'data') {
  // ---- the Milky Way: ESO's panorama, as is (galactic coordinates), in two sizes.
  const sharp = createRequire(path.join(ROOT, 'package.json'))('sharp');
  for (const [w, q] of [[2048, 78], [4096, 80]]) {
    const file = `milkyway-${w / 1024}k.jpg`;
    if (check) continue;
    await sharp(path.join(SRC, 'eso0932a.jpg')).resize(w, w / 2, { kernel: 'lanczos3' }).jpeg({ quality: q, mozjpeg: true }).toFile(path.join(OUT, file));
    console.log(`wrote public/data/sky/${file} (${Math.round(fs.statSync(path.join(OUT, file)).size / 1024)} KB)`);
  }
  // The Milky Way from above (eso1339g): north galactic pole up, the centre above the Sun. In the 5600 px original the
  // Sun is at (2800, 3857) and 1,000 light-years are 43.9 px (measured on the annotated eso1339e).
  if (fs.existsSync(path.join(SRC, 'eso1339g.jpg'))) {
    await sharp(path.join(SRC, 'eso1339g.jpg')).resize(2048, 2048, { kernel: 'lanczos3' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(OUT, 'milkyway-top.jpg'));
    console.log(`wrote public/data/sky/milkyway-top.jpg (${Math.round(fs.statSync(path.join(OUT, 'milkyway-top.jpg')).size / 1024)} KB)`);
  }
}
if (errors.length) { for (const e of errors) console.error(`FAIL ${e}`); process.exit(1); }
