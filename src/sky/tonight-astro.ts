// Tonight's sky (v0.49.0): the sums behind it. The Moon seen from a place (its phase, its tilt, when it rises and sets,
// the coming phases), the planets (where, how bright, how big, how much of them is lit, Jupiter's four big moons,
// Saturn's rings), the twilight and the dark hours, and which way up each world is (IAU rotation models). Pure
// functions of a Julian Day and a place, checked by scripts/test/tonight.mjs.
import { precession, mul, transpose, vec, dot, cross, norm, horizon, altAz, moon, eclToEq, RAD, type V3, type M3 } from './astro';
import { positionOf } from '../space/orbits';

/** Days from one new moon to the next. */
export const SYNODIC = 29.530588853;
const EARTH_KM = 6378.14;
export const MOON_KM = 1737.4;
const LIGHT_DAYS_PER_AU = 499.004784 / 86400;

export type PhaseKey = 'new' | 'waxing-crescent' | 'first-quarter' | 'waxing-gibbous' | 'full' | 'waning-gibbous' | 'last-quarter' | 'waning-crescent';
export const PHASE_KEYS: PhaseKey[] = ['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent'];

/** The phase's name from the Moon's age in days: the four main phases last about a day either side of their moment. */
export function phaseKey(age: number): PhaseKey {
  const a = ((age % SYNODIC) + SYNODIC) % SYNODIC;
  if (a < 1 || a > SYNODIC - 1) return 'new';
  if (Math.abs(a - SYNODIC / 4) < 1) return 'first-quarter';
  if (Math.abs(a - SYNODIC / 2) < 1) return 'full';
  if (Math.abs(a - (3 * SYNODIC) / 4) < 1) return 'last-quarter';
  return a < SYNODIC / 4 ? 'waxing-crescent' : a < SYNODIC / 2 ? 'waxing-gibbous' : a < (3 * SYNODIC) / 4 ? 'waning-gibbous' : 'waning-crescent';
}

const toDate = (jd: number, v: V3): V3 => mul(precession(jd), v);
const toJ2000 = (P: M3, v: V3): V3 => mul(transpose(P), v);
const angle = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) / RAD;

/** The Sun's direction from the Earth (J2000 equatorial unit vector) and its distance in au. */
export function sunDir(jd: number): { dir: V3; au: number } {
  const e = positionOf('earth', jd)!;
  const s = eclToEq([-e[0], -e[1], -e[2]]);
  return { dir: norm(s), au: Math.hypot(...s) };
}

export interface MoonNow {
  /** Seen from the place (parallax included): J2000 unit vector, altitude and azimuth (degrees). */
  dir: V3; alt: number; az: number;
  /** From the place, in km; its width in arcseconds. */
  km: number; diam: number;
  /** 0 new, 0.5 full; the lit fraction; days since new; growing or shrinking. */
  phase: number; lit: number; age: number; waxing: boolean; key: PhaseKey;
}

/** The Moon from a place on the Earth (lon, lat in degrees) at a moment. */
export function moonAt(jd: number, lon: number, lat: number): MoonNow {
  const m = moon(jd), hz = horizon(jd, lon, lat), R = m.earthRadii;
  // From the place, not the Earth's centre: up to a degree's difference near the horizon.
  const topo: V3 = [m.eqDate[0] * R - hz.zenith[0], m.eqDate[1] * R - hz.zenith[1], m.eqDate[2] * R - hz.zenith[2]];
  const d = Math.hypot(...topo);
  const v: V3 = [topo[0] / d, topo[1] / d, topo[2] / d];
  const [alt, az] = altAz(v, hz);
  const km = d * EARTH_KM;
  const age = m.phase * SYNODIC;
  return { dir: toJ2000(precession(jd), v), alt, az, km, diam: ((2 * MOON_KM) / km / RAD) * 3600, phase: m.phase, lit: m.lit, age, waxing: m.phase < 0.5, key: phaseKey(age) };
}

/** The point on the Earth with the Moon straight overhead (lon, lat), and the same for the Sun. */
export function subPoint(jd: number, dirJ2000: V3): [number, number] {
  const v = toDate(jd, dirJ2000);
  const ra = Math.atan2(v[1], v[0]) / RAD, dec = Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD;
  const lst0 = horizon(jd, 0, 0).lst; // Greenwich sidereal time
  return [((((ra - lst0) % 360) + 540) % 360) - 180, dec];
}

// ---- the planets --------------------------------------------------------------------------------------------------

export const PLANET_IDS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const;
export type PlanetId = (typeof PLANET_IDS)[number];
// Absolute magnitudes (V(1,0)) and widths at 1 au (arcseconds, equatorial).
const H: Record<PlanetId, number> = { mercury: -0.6, venus: -4.4, mars: -1.5, jupiter: -9.4, saturn: -8.9, uranus: -7.2, neptune: -6.9 };
const WIDTH: Record<PlanetId, number> = { mercury: 6.74, venus: 16.92, mars: 9.36, jupiter: 196.94, saturn: 165.6, uranus: 70.48, neptune: 68.3 };

export interface PlanetNow {
  id: PlanetId;
  /** From the Earth: J2000 unit vector, altitude and azimuth from the place, distance (au). */
  dir: V3; alt: number; az: number; au: number;
  mag: number;
  /** Width in arcseconds; the lit fraction of the disc; the angle from the Sun (degrees). */
  diam: number; lit: number; elong: number;
  /** From the planet toward the Sun (J2000 unit vector): which side is lit. */
  sunward: V3;
}

/** Where the planets are, seen from a place. */
export function planetsAt(jd: number, lon: number, lat: number): PlanetNow[] {
  const P = precession(jd), hz = horizon(jd, lon, lat);
  const e = positionOf('earth', jd)!;
  const R = Math.hypot(...e);
  const sun = sunDir(jd).dir;
  return PLANET_IDS.map((id) => {
    // Where it was when the light left it (a few minutes to hours).
    let p = positionOf(id, jd)!;
    let g: V3 = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
    p = positionOf(id, jd - Math.hypot(...g) * LIGHT_DAYS_PER_AU)!;
    g = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
    const d = Math.hypot(...g), r = Math.hypot(...p);
    const dir = norm(eclToEq(g));
    const cosi = Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d)));
    const i = Math.acos(cosi) / RAD;
    // Phase curves for Mercury, Venus and Mars from Mallama & Hilton (2018); a small linear term for the giants; Saturn's
    // rings add up to a magnitude as they open (Meeus, ch. 41).
    let mag = H[id] + 5 * Math.log10(r * d) + (
      id === 'mercury' ? 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
        : id === 'venus' ? -1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4
          : id === 'mars' ? 2.267e-2 * i - 1.302e-4 * i ** 2 : 0.005 * i);
    if (id === 'saturn') { const sb = Math.abs(Math.sin(ringTilt(jd, dir) * RAD)); mag += -2.6 * sb + 1.25 * sb * sb; }
    const [alt, az] = altAz(mul(P, dir), hz);
    return { id, dir, alt, az, au: d, mag, diam: WIDTH[id] / d, lit: (1 + cosi) / 2, elong: angle(dir, sun), sunward: norm(eclToEq([-p[0], -p[1], -p[2]])) };
  });
}

/** Saturn's rings: how far open they are as seen from the Earth (degrees; positive when we see their north side). */
export function ringTilt(jd: number, saturnDir: V3): number {
  const pole = bodyAxes('saturn', jd).pole;
  return Math.asin(Math.max(-1, Math.min(1, -dot(pole, saturnDir)))) / RAD;
}

/** Jupiter's four big moons (Meeus, Astronomical Algorithms, ch. 44, the lower accuracy method): X toward the sky's west
 *  along Jupiter's equator and Y toward its north, in Jupiter's radii; in front of Jupiter or behind it. */
export function jupiterMoons(jd: number): { id: 'io' | 'europa' | 'ganymede' | 'callisto'; x: number; y: number; front: boolean }[] {
  const d = jd - 2451545.0;
  const s = (a: number) => Math.sin(a * RAD), c = (a: number) => Math.cos(a * RAD);
  const V = 172.74 + 0.00111588 * d;
  const M = 357.529 + 0.9856003 * d;
  const N = 20.020 + 0.0830853 * d + 0.329 * s(V);
  const J = 66.115 + 0.9025179 * d - 0.329 * s(V);
  const A = 1.915 * s(M) + 0.020 * s(2 * M);
  const B = 5.555 * s(N) + 0.168 * s(2 * N);
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * c(M) - 0.00014 * c(2 * M);
  const r = 5.20872 - 0.25208 * c(N) - 0.00611 * c(2 * N);
  const D = Math.sqrt(r * r + R * R - 2 * r * R * c(K));
  const psi = Math.asin((R / D) * s(K)) / RAD;
  const lam = 34.35 + 0.083091 * d + 0.329 * s(V) + B;
  const DS = 3.12 * s(lam + 42.8);
  const DE = DS - 2.22 * s(psi) * c(lam + 22) - 1.30 * ((r - D) / D) * s(lam - 100.5);
  const t = d - D / 173;
  const u1 = 163.8069 + 203.4058646 * t + psi - B;
  const u2 = 358.4140 + 101.2916335 * t + psi - B;
  const u3 = 5.7176 + 50.2345180 * t + psi - B;
  const u4 = 224.8092 + 21.4879800 * t + psi - B;
  const G = 331.18 + 50.310482 * t, Hh = 87.45 + 21.569231 * t;
  // The corrections, from the uncorrected angles.
  const U = [u1 + 0.473 * s(2 * (u1 - u2)), u2 + 1.065 * s(2 * (u2 - u3)), u3 + 0.165 * s(G), u4 + 0.843 * s(Hh)];
  const Rr = [5.9057 - 0.0244 * c(2 * (u1 - u2)), 9.3966 - 0.0882 * c(2 * (u2 - u3)), 14.9883 - 0.0216 * c(G), 26.3627 - 0.1939 * c(Hh)];
  const one = (id: 'io' | 'europa' | 'ganymede' | 'callisto', u: number, rr: number) => ({ id, x: rr * s(u), y: -rr * c(u) * s(DE), front: c(u) < 0 });
  return [one('io', U[0], Rr[0]), one('europa', U[1], Rr[1]), one('ganymede', U[2], Rr[2]), one('callisto', U[3], Rr[3])];
}

// ---- which way up each world is (IAU WGCCRE 2015, the main terms) --------------------------------------------------

export type Spinner = 'moon' | 'mars' | 'jupiter' | 'saturn';
/** A world's north pole and the directions of its 0° and 90° east meridians (J2000 unit vectors). */
export function bodyAxes(id: Spinner, jd: number): { pole: V3; X: V3; Y: V3 } {
  const d = jd - 2451545, T = d / 36525;
  let a: number, de: number, W: number;
  if (id === 'moon') {
    const E1 = (125.045 - 0.0529921 * d) * RAD;
    a = 269.9949 + 0.0031 * T - 3.8787 * Math.sin(E1);
    de = 66.5392 + 0.013 * T + 1.5419 * Math.cos(E1);
    W = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * Math.sin(E1);
  } else if (id === 'mars') { a = 317.68143 - 0.1061 * T; de = 52.8865 - 0.0609 * T; W = 176.63 + 350.89198226 * d; }
  else if (id === 'jupiter') { a = 268.056595 - 0.006499 * T; de = 64.495303 + 0.002413 * T; W = 284.95 + 870.536 * d; }
  else { a = 40.589 - 0.036 * T; de = 83.537 - 0.004 * T; W = 38.9 + 810.7939024 * d; }
  const pole = vec(a, de);
  const Q = norm(cross([0, 0, 1], pole));
  const w = (W % 360) * RAD;
  const PQ = cross(pole, Q);
  const X: V3 = [0, 1, 2].map((k) => Math.cos(w) * Q[k] + Math.sin(w) * PQ[k]) as V3;
  return { pole, X, Y: cross(pole, X) };
}

/** The point of a world facing us: longitude (east) and latitude, degrees. `dir` points from us to the world. */
export function subObserver(axes: { pole: V3; X: V3; Y: V3 }, dir: V3): [number, number] {
  const v: V3 = [-dir[0], -dir[1], -dir[2]];
  return [Math.atan2(dot(v, axes.Y), dot(v, axes.X)) / RAD, Math.asin(Math.max(-1, Math.min(1, dot(v, axes.pole)))) / RAD];
}

/** The way the lit side faces on a disc seen at `dir`, with `up` (a J2000 direction, the zenith or the pole) at the top:
 *  degrees counter-clockwise from the right. */
export function brightLimb(dir: V3, sunward: V3, up: V3): number {
  const u = norm(sub(up, scale(dir, dot(up, dir))));
  const right = cross(dir, u);
  const t = sub(sunward, scale(dir, dot(sunward, dir)));
  return Math.atan2(dot(t, u), dot(t, right)) / RAD;
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];

/** Altitude and azimuth (degrees) of a J2000 direction from a place at a moment. */
export function altAzAt(v: V3, jd: number, lon: number, lat: number): [number, number] {
  return altAz(mul(precession(jd), v), horizon(jd, lon, lat));
}

/** The zenith of a place at a moment, as a J2000 direction. */
export function zenithJ2000(jd: number, lon: number, lat: number): V3 {
  return toJ2000(precession(jd), horizon(jd, lon, lat).zenith);
}

// ---- a night, sampled ----------------------------------------------------------------------------------------------

/** From the local noon before (or at) a moment to the next one: "tonight" for that moment. */
export function nightWindow(jd: number, lon: number): [number, number] {
  const solar = ((((jd + 0.5 + lon / 360) % 1) + 1) % 1); // local mean solar time, as a fraction of a day
  const noon0 = jd - ((solar - 0.5 + 1) % 1);
  return [noon0, noon0 + 1];
}

export interface Samples {
  t: number[]; sun: number[]; moon: number[]; lit: number[];
  planets: Record<PlanetId, number[]>;
  /** For fixed stars and objects: altitude of a J2000 direction at sample k. */
  altOf: (v: V3, k: number) => number;
}

/** Altitudes of the Sun, the Moon and the planets every `stepMin` minutes from jd0 to jd1. */
export function sample(jd0: number, jd1: number, lon: number, lat: number, stepMin = 10): Samples {
  const n = Math.max(2, Math.round(((jd1 - jd0) * 1440) / stepMin) + 1);
  const out: Samples = { t: [], sun: [], moon: [], lit: [], planets: Object.fromEntries(PLANET_IDS.map((id) => [id, [] as number[]])) as unknown as Record<PlanetId, number[]>, altOf: () => 0 };
  const hzs: { zenith: V3; north: V3; east: V3 }[] = [], Ps: M3[] = [];
  for (let k = 0; k < n; k++) {
    const jd = jd0 + ((jd1 - jd0) * k) / (n - 1);
    const P = precession(jd), hz = horizon(jd, lon, lat);
    out.t.push(jd);
    out.sun.push(altAz(mul(P, sunDir(jd).dir), hz)[0]);
    const m = moonAt(jd, lon, lat);
    out.moon.push(m.alt); out.lit.push(m.lit);
    for (const p of planetsAt(jd, lon, lat)) out.planets[p.id].push(p.alt);
    hzs.push(hz); Ps.push(P);
  }
  out.altOf = (v, k) => altAz(mul(Ps[k], v), hzs[k])[0];
  return out;
}

/** When a sampled altitude crosses h0 going up and going down (linear between samples). */
export function crossings(t: number[], a: number[], h0: number): { up: number[]; down: number[] } {
  const up: number[] = [], down: number[] = [];
  for (let k = 1; k < t.length; k++) {
    const x = a[k - 1] - h0, y = a[k] - h0;
    if ((x < 0) === (y < 0)) continue;
    const tc = t[k - 1] + ((t[k] - t[k - 1]) * x) / (x - y);
    (y >= 0 ? up : down).push(tc);
  }
  return { up, down };
}

/** The highest sample, refined with a parabola through its neighbours. */
export function highest(t: number[], a: number[]): { jd: number; alt: number } {
  let k = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[k]) k = i;
  if (k > 0 && k < a.length - 1) {
    const [y0, y1, y2] = [a[k - 1], a[k], a[k + 1]];
    const den = y0 - 2 * y1 + y2;
    if (den < 0) { const s = (0.5 * (y0 - y2)) / den; return { jd: t[k] + s * (t[k + 1] - t[k]), alt: y1 - 0.25 * (y0 - y2) * s }; }
  }
  return { jd: t[k], alt: a[k] };
}

// Rise and set: the top edge of the Sun or Moon on the horizon, with the air's bending (Meeus, ch. 15).
export const H0 = { sun: -0.833, moon: -0.83, planet: -0.567 };

export interface NightTimes {
  sunset: number | null; sunrise: number | null;
  /** The ends of the evening twilights and the starts of the morning ones: civil (−6°), nautical (−12°), astronomical (−18°). */
  civilDusk: number | null; nauticalDusk: number | null; astroDusk: number | null;
  astroDawn: number | null; nauticalDawn: number | null; civilDawn: number | null;
  /** The Sun never sets (midnight sun) or never rises (polar night) in this window; or it never gets fully dark. */
  polar: 'day' | 'night' | null; darkest: number;
}

export function nightTimes(s: Samples): NightTimes {
  const c = (h: number) => crossings(s.t, s.sun, h);
  const set = c(H0.sun), civ = c(-6), nau = c(-12), ast = c(-18);
  const max = Math.max(...s.sun), min = Math.min(...s.sun);
  return {
    sunset: set.down[0] ?? null, sunrise: set.up[set.up.length - 1] ?? null,
    civilDusk: civ.down[0] ?? null, nauticalDusk: nau.down[0] ?? null, astroDusk: ast.down[0] ?? null,
    astroDawn: ast.up[ast.up.length - 1] ?? null, nauticalDawn: nau.up[nau.up.length - 1] ?? null, civilDawn: civ.up[civ.up.length - 1] ?? null,
    polar: min > H0.sun ? 'day' : max < H0.sun ? 'night' : null, darkest: min,
  };
}

/** The next main phases after a moment: 0 new, 1 first quarter, 2 full, 3 last quarter (to within an hour or so). */
export function nextPhases(jd: number, n = 4): { jd: number; k: 0 | 1 | 2 | 3 }[] {
  const el = (t: number) => moon(t).phase * 360;
  const out: { jd: number; k: 0 | 1 | 2 | 3 }[] = [];
  const step = 0.25;
  let t0 = jd, e0 = el(t0);
  while (out.length < n && t0 < jd + 40) {
    const t1 = t0 + step, e1 = el(t1);
    for (const k of [0, 1, 2, 3] as const) {
      const target = k * 90;
      const d0 = ((e0 - target + 540) % 360) - 180, d1 = ((e1 - target + 540) % 360) - 180;
      if (d0 < 0 && d1 >= 0 && d1 - d0 < 90) {
        let a = t0, b = t1;
        for (let i = 0; i < 24; i++) { const m = (a + b) / 2; const dm = ((el(m) - target + 540) % 360) - 180; if (dm < 0) a = m; else b = m; }
        out.push({ jd: (a + b) / 2, k });
      }
    }
    t0 = t1; e0 = e1;
  }
  return out.sort((a, b) => a.jd - b.jd).slice(0, n);
}

/** The eight points of the compass, 0 north, 1 north-east … 7 north-west. */
export const compass8 = (az: number) => Math.round((((az % 360) + 360) % 360) / 45) % 8;

/** How a brightness looks: 0 dazzling … 5 needs a telescope. */
export function brightness(mag: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return mag <= -3 ? 0 : mag <= -1.5 ? 1 : mag <= 0.5 ? 2 : mag <= 3.5 ? 3 : mag <= 6 ? 4 : 5;
}

/** When something is worth looking at tonight: up at least `minAlt` while the Sun is below `sunBelow`. */
export function goodHours(s: Samples, alt: number[], minAlt: number, sunBelow: number): { from: number; to: number; best: { jd: number; alt: number }; frac: number } | null {
  let first = -1, last = -1, bk = -1, n = 0;
  for (let k = 0; k < s.t.length; k++) {
    if (s.sun[k] < sunBelow && alt[k] > minAlt) { if (first < 0) first = k; last = k; n++; if (bk < 0 || alt[k] > alt[bk]) bk = k; }
  }
  if (first < 0) return null;
  const dark = s.sun.filter((x) => x < sunBelow).length || 1;
  return { from: s.t[first], to: s.t[last], best: { jd: s.t[bk], alt: alt[bk] }, frac: n / dark };
}

/** The Moon's direction from the Earth's centre (J2000 unit vector). */
export function moonGeo(jd: number): V3 {
  return norm(toJ2000(precession(jd), moon(jd).eqDate));
}
