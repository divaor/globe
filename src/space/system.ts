// The solar system around the globe (v0.50.0): from any world, where its planet, its sister moons and the Sun are, at
// their real distances and sizes, in that world's own frame (the frame its map is drawn in, so a moon shows on the
// side of the globe that faces it). Each world turns as the IAU's rotation models say (WGCCRE 2015, the main terms);
// the moons go round on orbits fitted to JPL Horizons' positions (moon-orbits.json, scripts/data/space/build-moon-
// orbits.mjs), the Earth's Moon on its own series. Pure functions of a Julian Day, checked by scripts/test/tonight.mjs.
import { precession, gmst, mul, transpose, vec, dot, cross, norm, moon as moonSeries, eclToEq, RAD, type V3 } from '../sky/astro';
import { positionOf, positionFromElements, orbitPath } from './orbits';
import ORBITS from './moon-orbits.json';

export const AU_KM = 149597870.7;
/** The Sun's radius (km). */
export const SUN_KM = 695700;
const EARTH_KM = 6378.14; // the Moon series' Earth radius

/** Each world's radius (km) and the planet it goes round (null: the Sun). */
export const BODIES: Record<string, { r: number; parent: string | null }> = {
  mercury: { r: 2439.4, parent: null }, venus: { r: 6051.8, parent: null }, earth: { r: 6371, parent: null }, moon: { r: 1737.4, parent: 'earth' },
  mars: { r: 3389.5, parent: null }, ceres: { r: 469.7, parent: null }, vesta: { r: 262.7, parent: null },
  jupiter: { r: 69911, parent: null }, io: { r: 1821.6, parent: 'jupiter' }, europa: { r: 1560.8, parent: 'jupiter' }, ganymede: { r: 2634.1, parent: 'jupiter' }, callisto: { r: 2410.3, parent: 'jupiter' },
  saturn: { r: 58232, parent: null }, enceladus: { r: 252.1, parent: 'saturn' }, titan: { r: 2574.7, parent: 'saturn' },
  uranus: { r: 25362, parent: null }, neptune: { r: 24622, parent: null }, triton: { r: 1353.4, parent: 'neptune' },
  pluto: { r: 1188.3, parent: null }, charon: { r: 606, parent: 'pluto' },
};

type Spin = (d: number, T: number) => [number, number, number]; // pole RA, pole Dec, prime meridian W (degrees)
const s = (x: number) => Math.sin(x * RAD), c = (x: number) => Math.cos(x * RAD);
// Jupiter's moons' wobbles.
const J = (T: number) => [0, 73.32 + 91472.9 * T, 24.62 + 45137.2 * T, 283.9 + 4850.7 * T, 355.8 + 1191.3 * T, 119.9 + 262.1 * T, 229.8 + 64.3 * T, 352.25 + 2382.6 * T, 113.35 + 6070 * T];
const SPIN: Record<string, Spin> = {
  mercury: (d, T) => [281.0103 - 0.0328 * T, 61.4155 - 0.0049 * T, 329.5988 + 6.1385108 * d],
  venus: (d) => [272.76, 67.16, 160.2 - 1.4813688 * d],
  moon: (d, T) => { const E1 = 125.045 - 0.0529921 * d, E2 = 250.089 - 0.1059842 * d, E3 = 260.008 + 13.0120009 * d;
    return [269.9949 + 0.0031 * T - 3.8787 * s(E1) - 0.1204 * s(E2) + 0.07 * s(E3), 66.5392 + 0.013 * T + 1.5419 * c(E1) + 0.0239 * c(E2) - 0.0278 * c(E3), 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * s(E1) + 0.1208 * s(E2) - 0.0642 * s(E3)]; },
  mars: (d, T) => [317.68143 - 0.1061 * T, 52.8865 - 0.0609 * T, 176.63 + 350.89198226 * d],
  ceres: (d) => [291.418, 66.764, 170.65 + 952.1532 * d],
  vesta: (d) => [309.031, 42.235, 285.39 + 1617.3329428 * d],
  jupiter: (d, T) => [268.056595 - 0.006499 * T, 64.495303 + 0.002413 * T, 284.95 + 870.536 * d],
  io: (d, T) => { const j = J(T); return [268.05 - 0.009 * T + 0.094 * s(j[3]) + 0.024 * s(j[4]), 64.5 + 0.003 * T + 0.04 * c(j[3]) + 0.011 * c(j[4]), 200.39 + 203.4889538 * d - 0.085 * s(j[3]) - 0.022 * s(j[4])]; },
  europa: (d, T) => { const j = J(T); return [268.08 - 0.009 * T + 1.086 * s(j[4]) + 0.06 * s(j[5]) + 0.015 * s(j[6]) + 0.009 * s(j[7]), 64.51 + 0.003 * T + 0.468 * c(j[4]) + 0.026 * c(j[5]) + 0.007 * c(j[6]) + 0.002 * c(j[7]), 36.022 + 101.3747235 * d - 0.98 * s(j[4]) - 0.054 * s(j[5]) - 0.014 * s(j[6]) - 0.008 * s(j[7])]; },
  ganymede: (d, T) => { const j = J(T); return [268.2 - 0.009 * T - 0.037 * s(j[4]) + 0.431 * s(j[5]) + 0.091 * s(j[6]), 64.57 + 0.003 * T - 0.016 * c(j[4]) + 0.186 * c(j[5]) + 0.039 * c(j[6]), 44.064 + 50.3176081 * d + 0.033 * s(j[4]) - 0.389 * s(j[5]) - 0.082 * s(j[6])]; },
  callisto: (d, T) => { const j = J(T); return [268.72 - 0.009 * T - 0.068 * s(j[5]) + 0.59 * s(j[6]) + 0.01 * s(j[8]), 64.83 + 0.003 * T - 0.029 * c(j[5]) + 0.254 * c(j[6]) - 0.004 * c(j[8]), 259.51 + 21.5710715 * d + 0.061 * s(j[5]) - 0.533 * s(j[6]) - 0.009 * s(j[8])]; },
  saturn: (d, T) => [40.589 - 0.036 * T, 83.537 - 0.004 * T, 38.9 + 810.7939024 * d],
  enceladus: (d, T) => [40.66 - 0.036 * T, 83.52 - 0.004 * T, 6.32 + 262.7318996 * d],
  titan: (d) => [39.4827, 83.4279, 186.5855 + 22.5769768 * d],
  uranus: (d) => [257.311, -15.175, 203.81 - 501.1600928 * d],
  neptune: (d, T) => { const N = 357.85 + 52.316 * T; return [299.36 + 0.7 * s(N), 43.46 - 0.51 * c(N), 249.978 + 541.1397757 * d - 0.48 * s(N)]; },
  triton: (d, T) => { const N = 177.85 + 52.316 * T;
    return [299.36 - 32.35 * s(N) - 6.28 * s(2 * N) - 2.08 * s(3 * N) - 0.74 * s(4 * N), 41.17 + 22.55 * c(N) + 2.1 * c(2 * N) + 0.55 * c(3 * N) + 0.16 * c(4 * N), 296.53 - 61.2572637 * d + 22.25 * s(N) + 6.73 * s(2 * N) + 2.05 * s(3 * N) + 0.74 * s(4 * N)]; },
  pluto: (d) => [132.993, -6.163, 302.695 + 56.3625225 * d],
  charon: (d) => [132.993, -6.163, 122.695 + 56.3625225 * d],
};

export interface Axes { pole: V3; X: V3; Y: V3 }

/** A world's north pole and its 0° and 90° east meridians (J2000 unit vectors): the frame its map is drawn in. */
export function axesOf(id: string, jd: number): Axes {
  if (id === 'earth') {
    // The Earth turns with sidereal time on its pole of date.
    const Pt = transpose(precession(jd)), G = gmst(jd) * RAD;
    return { pole: mul(Pt, [0, 0, 1]), X: mul(Pt, [Math.cos(G), Math.sin(G), 0]), Y: mul(Pt, [-Math.sin(G), Math.cos(G), 0]) };
  }
  const f = SPIN[id];
  const d = jd - 2451545, [a, de, W] = f ? f(d, d / 36525) : [0, 90, 0];
  const pole = vec(a, de);
  const Q = norm(cross([0, 0, 1], pole));
  const PQ = cross(pole, Q), w = (W % 360) * RAD;
  const X: V3 = [0, 1, 2].map((k) => Math.cos(w) * Q[k] + Math.sin(w) * PQ[k]) as V3;
  return { pole, X, Y: cross(pole, X) };
}

/** A J2000 vector in a world's own frame. */
export const inFrame = (ax: Axes, v: V3): V3 => [dot(v, ax.X), dot(v, ax.Y), dot(v, ax.pole)];

type Fit = { a: number; n: number; L0: number; P: number[]; Q: number[] };
const FITS = ORBITS.moons as Record<string, Fit>;

/** Where a moon is from its planet's centre (J2000 equatorial, km). */
export function moonOffset(id: string, jd: number): V3 {
  if (id === 'moon') {
    const m = moonSeries(jd);
    return mul(transpose(precession(jd)), [m.eqDate[0] * m.earthRadii * EARTH_KM, m.eqDate[1] * m.earthRadii * EARTH_KM, m.eqDate[2] * m.earthRadii * EARTH_KM]);
  }
  const f = FITS[id];
  if (!f) return [0, 0, 0];
  const L = (f.L0 + f.n * (jd - ORBITS.t0)) * RAD;
  return [0, 1, 2].map((k) => f.a * (Math.cos(L) * f.P[k] + Math.sin(L) * f.Q[k])) as V3;
}

/** Where a world is from the Sun (J2000 equatorial, km). */
export function helio(id: string, jd: number): V3 {
  const b = BODIES[id];
  if (b?.parent) { const p = helio(b.parent, jd), o = moonOffset(id, jd); return [p[0] + o[0], p[1] + o[1], p[2] + o[2]]; }
  const e = id === 'vesta' ? positionFromElements(ORBITS.vesta, jd) : positionOf(id, jd);
  if (!e) return [AU_KM, 0, 0];
  const q = eclToEq(e as V3);
  return [q[0] * AU_KM, q[1] * AU_KM, q[2] * AU_KM];
}

/** A moon's whole orbit round its planet (J2000, km from the planet): its real path over one turn. */
export function orbitPoints(id: string, jd: number, n = 120): V3[] {
  const f = FITS[id];
  const P = f ? 360 / Math.abs(f.n) : 27.321661;
  const out: V3[] = [];
  for (let k = 0; k <= n; k++) out.push(moonOffset(id, jd + ((k / n) - 0.5) * P));
  return out;
}

export interface Member { id: string; r: number; pos: V3 }
export interface System {
  /** The world looked at, its frame, and its radius (km). */
  me: string; axes: Axes; R: number;
  /** Its planet (for a moon) and the planet's moons other than itself: where each is from it (J2000, km). */
  members: Member[];
  /** The orbits drawn: each moon's path round its planet, from the world looked at (J2000, km). */
  orbits: { id: string; pts: V3[] }[];
  /** The Sun: its direction from the world (J2000 unit vector) and how far (km). */
  sun: V3; sunKm: number;
}

/** The world's neighbourhood: its planet and moons, their orbits, and the Sun. */
export function systemOf(me: string, jd: number): System | null {
  const b = BODIES[me];
  if (!b) return null;
  const primary = b.parent ?? me;
  const moons = Object.keys(BODIES).filter((k) => BODIES[k].parent === primary);
  const myOff: V3 = b.parent ? moonOffset(me, jd) : [0, 0, 0];
  const rel = (v: V3): V3 => [v[0] - myOff[0], v[1] - myOff[1], v[2] - myOff[2]];
  const members: Member[] = [];
  if (b.parent) members.push({ id: primary, r: BODIES[primary].r, pos: rel([0, 0, 0]) });
  for (const m of moons) if (m !== me) members.push({ id: m, r: BODIES[m].r, pos: rel(moonOffset(m, jd)) });
  const orbits = moons.map((m) => ({ id: m, pts: orbitPoints(m, jd).map(rel) }));
  const h = helio(me, jd);
  const sunKm = Math.hypot(...h);
  return { me, axes: axesOf(me, jd), R: b.r, members, orbits, sun: [-h[0] / sunKm, -h[1] / sunKm, -h[2] / sunKm], sunKm };
}

// ---- Round the Sun, and views locked to an orbit (v0.51.0) -------------------------------------------------------

const unit = (v: V3): V3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** The orbit a world goes round the Sun on (its planet's, for a moon): one whole turn, from the Sun (J2000, km). */
export function sunOrbit(id: string, jd: number, n = 180): V3[] {
  const p = BODIES[id]?.parent ?? id;
  if (p === 'vesta') {
    const per = ORBITS.vesta.per, out: V3[] = [];
    for (let k = 0; k <= n; k++) { const q = eclToEq(positionFromElements(ORBITS.vesta, jd + (k / n - 0.5) * per) as V3); out.push([q[0] * AU_KM, q[1] * AU_KM, q[2] * AU_KM]); }
    return out;
  }
  return orbitPath(p, jd, n).map((e) => { const q = eclToEq(e as V3); return [q[0] * AU_KM, q[1] * AU_KM, q[2] * AU_KM] as V3; });
}

/** The moon whose orbit a planet's view locks to: its first (the Moon, Io, Enceladus, Triton, Charon). */
const firstMoon = (id: string) => Object.keys(BODIES).find((k) => BODIES[k].parent === id) ?? null;

/**
 * The pole of the orbit a view locks to (J2000 unit vector, the way the orbit turns): for a moon its own orbit round
 * its planet; for a planet with moons the orbit of its first moon (so its moons' orbits lie flat); else, and always
 * with `round` 'sun', the orbit round the Sun (its planet's, for a moon).
 */
export function orbitPole(id: string, jd: number, round: 'own' | 'sun' = 'own'): V3 {
  const b = BODIES[id];
  if (round === 'own') {
    const m = b?.parent ? id : firstMoon(id);
    if (m) {
      // The plane of the orbit as drawn (a whole turn), so it lies flat however the Moon wobbles within a month.
      const pts = orbitPoints(m, jd, 48), h: V3 = [0, 0, 0];
      for (let k = 1; k < pts.length; k++) { const c = cross(pts[k - 1], pts[k]); h[0] += c[0]; h[1] += c[1]; h[2] += c[2]; }
      return unit(h);
    }
  }
  const p = b?.parent ?? id;
  return unit(cross(helio(p, jd), helio(p, jd + 1)));
}

export type Lock = 'free' | 'orbit' | 'planet' | 'sun';
export interface Frame { h: V3; s: V3 }

/**
 * A locked view's frame: up (the orbit's pole) and the way its angle round the pole is counted from. Locked to the
 * orbit, that is a fixed way in space (the March equinox), so the world turns and its moons go round under a camera that
 * stays put; following its planet or the Sun, it is the way to the planet or the Sun, which stays put on the screen.
 */
export function lockFrame(lock: Exclude<Lock, 'free'>, id: string, jd: number): Frame {
  const b = BODIES[id];
  let h: V3, toward: V3;
  if (lock === 'planet' && b?.parent) {
    h = orbitPole(id, jd);
    const o = moonOffset(id, jd);
    toward = [-o[0], -o[1], -o[2]];
  } else if (lock === 'sun') {
    h = orbitPole(id, jd, 'sun');
    const p = helio(id, jd);
    toward = [-p[0], -p[1], -p[2]];
  } else {
    h = orbitPole(id, jd);
    toward = [1, 0, 0];
  }
  const d = dot(toward, h);
  let s: V3 = [toward[0] - d * h[0], toward[1] - d * h[1], toward[2] - d * h[2]];
  if (Math.hypot(...s) < 1e-6) s = [-h[1], h[0], 0];
  return { h, s: unit(s) };
}

/** Where a locked camera looks from and which way is up (J2000 unit vectors): `az` degrees round the pole from the
 *  frame's way, `el` degrees above the orbit. */
export function lockCamera(f: Frame, az: number, el: number): { c: V3; u: V3 } {
  const t = cross(f.h, f.s), A = az * RAD, E = el * RAD;
  const p: V3 = [0, 1, 2].map((k) => Math.cos(A) * f.s[k] + Math.sin(A) * t[k]) as V3;
  return {
    c: [0, 1, 2].map((k) => Math.cos(E) * p[k] + Math.sin(E) * f.h[k]) as V3,
    u: [0, 1, 2].map((k) => Math.cos(E) * f.h[k] - Math.sin(E) * p[k]) as V3,
  };
}

/** A camera direction's angles in a frame (the other way from lockCamera). */
export function lockAngles(f: Frame, c: V3): { az: number; el: number } {
  const t = cross(f.h, f.s);
  return { az: Math.atan2(dot(c, t), dot(c, f.s)) / RAD, el: Math.asin(Math.max(-1, Math.min(1, dot(c, f.h)))) / RAD };
}
