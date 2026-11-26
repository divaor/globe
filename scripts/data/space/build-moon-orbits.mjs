#!/usr/bin/env node
// The moons' orbits for the solar system around the globe (v0.50.0): each moon's positions from JPL Horizons (around
// its planet, ICRF/J2000, every few hours from 2024 to 2030), fitted with a circle in a fixed plane turning at a steady
// rate. Plenty for a picture (the fit's worst miss is printed: a few degrees at most). Vesta's orbit round the Sun too
// (it is not in the solar system view's list). Written to src/space/moon-orbits.json.
//   NODE_USE_ENV_PROXY=1 node scripts/data/space/build-moon-orbits.mjs
//   node scripts/data/space/build-moon-orbits.mjs --check   (the file is there and well formed; no network)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = path.join(ROOT, 'src/space/moon-orbits.json');
const UA = 'AtlasGlobe-research/1.0 (https://example.org)';
const T0 = 2461041.5; // 2026-01-01 0h TDB

// Horizons ids: the moon, its planet's centre, the step (hours, about an eighth of its period).
const MOONS = [
  ['io', '501', '599', 5], ['europa', '502', '599', 10], ['ganymede', '503', '599', 20], ['callisto', '504', '599', 48],
  ['enceladus', '602', '699', 4], ['titan', '606', '699', 48],
  ['triton', '801', '899', 16], ['charon', '901', '999', 18],
];

if (process.argv.includes('--check')) {
  const j = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const ok = MOONS.every(([id]) => { const m = j.moons[id]; return m && m.a > 0 && Number.isFinite(m.n) && Number.isFinite(m.L0) && m.P.length === 3 && m.Q.length === 3; }) && j.vesta?.a > 2;
  console.log(ok ? `moon orbits: ${Object.keys(j.moons).length} moons and Vesta, fitted ${j.fitted}` : 'moon orbits: missing or malformed');
  process.exit(ok ? 0 : 1);
}

const q = (o) => 'https://ssd.jpl.nasa.gov/api/horizons.api?format=text&' + Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
async function horizons(params) {
  for (let k = 0; k < 4; k++) {
    try {
      const r = await fetch(q(params), { headers: { 'User-Agent': UA } });
      if (r.ok) return await r.text();
    } catch { /* retry */ }
    await new Promise((ok) => setTimeout(ok, 2000 * (k + 1)));
  }
  throw new Error('Horizons did not answer');
}
const rows = (text) => {
  const a = text.indexOf('$$SOE'), b = text.indexOf('$$EOE');
  return text.slice(a + 5, b).trim().split('\n').map((l) => l.split(',').map((x) => x.trim()));
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

const out = { source: 'JPL Horizons (ssd.jpl.nasa.gov), positions 2024–2030, fitted by scripts/data/space/build-moon-orbits.mjs', fitted: new Date().toISOString().slice(0, 10), t0: T0, moons: {}, vesta: null };
for (const [id, cmd, center, hours] of MOONS) {
  const text = await horizons({ COMMAND: `'${cmd}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'VECTORS'", CENTER: `'500@${center}'`,
    START_TIME: "'2024-01-01'", STOP_TIME: "'2030-01-01'", STEP_SIZE: `'${hours} h'`, REF_PLANE: "'FRAME'", REF_SYSTEM: "'ICRF'", VEC_TABLE: "'1'", OUT_UNITS: "'KM-S'", CSV_FORMAT: "'YES'" });
  const pts = rows(text).map((c) => ({ t: Number(c[0]), r: [Number(c[2]), Number(c[3]), Number(c[4])] })).filter((p) => Number.isFinite(p.r[0]));
  // The orbit's plane: the mean of r × r'.
  let h = [0, 0, 0];
  for (let i = 1; i < pts.length; i++) { const c = cross(pts[i - 1].r, pts[i].r); h = [h[0] + c[0], h[1] + c[1], h[2] + c[2]]; }
  h = norm(h);
  // Two axes in that plane (the first where it crosses the equator; any line in it for an orbit right over the equator).
  const P = norm(Math.abs(h[2]) < 0.999999 ? cross([0, 0, 1], h) : cross(h, [1, 0, 0])), Q = cross(h, P);
  // The angle round the orbit, unwrapped, and a straight line through it.
  let last = null, turns = 0;
  const th = pts.map((p) => {
    let a = Math.atan2(dot(p.r, Q), dot(p.r, P)) * 180 / Math.PI;
    if (last != null) { const d = a - last; if (d < -180) turns += 360; else if (d > 180) turns -= 360; }
    last = a;
    return a + turns;
  });
  const n = pts.length, ts = pts.map((p) => p.t - T0);
  const mt = ts.reduce((s, x) => s + x, 0) / n, ma = th.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (ts[i] - mt) * (th[i] - ma); sxx += (ts[i] - mt) ** 2; }
  const rate = sxy / sxx, L0 = ma - rate * mt;
  const a = pts.reduce((s, p) => s + Math.hypot(...p.r), 0) / n;
  const miss = Math.max(...th.map((x, i) => Math.abs(x - (L0 + rate * ts[i]))));
  const rMiss = Math.max(...pts.map((p) => Math.abs(Math.hypot(...p.r) - a) / a));
  out.moons[id] = { a: Math.round(a), n: +rate.toFixed(8), L0: +(((L0 % 360) + 360) % 360).toFixed(4), P: P.map((x) => +x.toFixed(6)), Q: Q.map((x) => +x.toFixed(6)) };
  console.log(`${id}: a ${Math.round(a)} km, period ${(360 / Math.abs(rate)).toFixed(4)} d${rate < 0 ? ' (backwards)' : ''}, ${n} positions; worst miss ${miss.toFixed(2)}° and ${(rMiss * 100).toFixed(1)}% in distance`);
}

// Vesta round the Sun: osculating elements (ecliptic J2000) at 2026-01-01, as src/space/orbits.ts's small bodies.
const el = await horizons({ COMMAND: "'4;'", OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'ELEMENTS'", CENTER: "'500@10'", START_TIME: "'2026-01-01'", STOP_TIME: "'2026-01-02'",
  STEP_SIZE: "'1 d'", REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'AU-D'", CSV_FORMAT: "'YES'" });
const e = rows(el)[0].map(Number);
// JDTDB, Calendar, EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
out.vesta = { epoch: e[0], a: e[11], e: e[2], i: e[4], om: e[5], w: e[6], ma: e[9], per: e[13] };
console.log(`vesta: a ${e[11].toFixed(4)} au, e ${e[2].toFixed(4)}, period ${(e[13] / 365.25).toFixed(2)} years`);
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${path.relative(ROOT, OUT)}`);
