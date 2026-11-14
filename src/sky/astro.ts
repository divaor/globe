// Positions in the sky: sidereal time, precession, the Sun, Moon and planets seen from the Earth, the horizon of a place,
// and galactic coordinates. Accurate to a fraction of a degree over a few thousand years: plenty for a sky map.
import { julian, positionOf } from '../space/orbits';

export const RAD = Math.PI / 180;
export type V3 = [number, number, number];
export type M3 = [number, number, number, number, number, number, number, number, number]; // row-major

export { julian };
export const vec = (raDeg: number, decDeg: number): V3 => {
  const a = raDeg * RAD, d = decDeg * RAD, c = Math.cos(d);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
};
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** RA (0..360) and Dec of a unit vector, in degrees. */
export const radec = (v: V3): [number, number] => {
  let a = Math.atan2(v[1], v[0]) / RAD;
  if (a < 0) a += 360;
  return [a, Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD];
};
export const mul = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const transpose = (m: M3): M3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const mmul = (a: M3, b: M3): M3 => {
  const o = new Array(9).fill(0) as M3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
};

/** Greenwich mean sidereal time, degrees (IAU 1982). */
export function gmst(jd: number): number {
  const T = (jd - 2451545) / 36525;
  const g = 280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

/** Precession from J2000 to the equator and equinox of a date (Lieske 1977, as in Meeus ch. 21). */
export function precession(jd: number): M3 {
  const t = (jd - 2451545) / 36525;
  const as = (x: number) => (x / 3600) * RAD;
  const z0 = as(2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t);
  const z = as(2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t);
  const th = as(2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t);
  const [cz0, sz0, cz, sz, ct, st] = [Math.cos(z0), Math.sin(z0), Math.cos(z), Math.sin(z), Math.cos(th), Math.sin(th)];
  return [
    cz0 * ct * cz - sz0 * sz, -sz0 * ct * cz - cz0 * sz, -st * cz,
    cz0 * ct * sz + sz0 * cz, -sz0 * ct * sz + cz0 * cz, -st * sz,
    cz0 * st, -sz0 * st, ct,
  ];
}

const EPS0 = 23.4392911 * RAD;
/** J2000 ecliptic to J2000 equatorial. */
const eclToEq = (v: V3, eps = EPS0): V3 => [v[0], v[1] * Math.cos(eps) - v[2] * Math.sin(eps), v[1] * Math.sin(eps) + v[2] * Math.cos(eps)];

/** J2000 equatorial to galactic (IAU, Hipparcos values). */
export const TO_GALACTIC: M3 = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762,
];
/** Galactic longitude and latitude (degrees) to a J2000 equatorial unit vector. */
export function fromGalactic(l: number, b: number): V3 {
  const g: V3 = [Math.cos(b * RAD) * Math.cos(l * RAD), Math.cos(b * RAD) * Math.sin(l * RAD), Math.sin(b * RAD)];
  return mul(transpose(TO_GALACTIC), g);
}

export interface Body { id: string; eq: V3; dist: number; mag: number }
// Absolute magnitudes (V(1,0)), for a rough brightness: m = H + 5 log10(r Δ).
const H: Record<string, number> = { mercury: -0.6, venus: -4.4, mars: -1.5, jupiter: -9.4, saturn: -8.9, uranus: -7.2, neptune: -6.9 };
export const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

/** The Sun and the planets seen from the Earth: J2000 equatorial unit vectors, distance (au) and magnitude. */
export function solarSystem(jd: number): Body[] {
  const e = positionOf('earth', jd)!;
  const out: Body[] = [];
  const sun: V3 = [-e[0], -e[1], -e[2]];
  out.push({ id: 'sun', eq: norm(eclToEq(sun)), dist: Math.hypot(...sun), mag: -26.7 });
  for (const id of PLANETS) {
    const p = positionOf(id, jd);
    if (!p) continue;
    const g: V3 = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
    const d = Math.hypot(...g), r = Math.hypot(...p), R = Math.hypot(...e);
    // Dimmer as less of the lit side faces us (phase angle i, in degrees; rough linear coefficients).
    const i = Math.acos(Math.max(-1, Math.min(1, (r * r + d * d - R * R) / (2 * r * d)))) / RAD;
    // Phase curves for Mercury, Venus and Mars from Mallama & Hilton (2018); a small linear term for the giants.
    const ph = id === 'mercury' ? 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
      : id === 'venus' ? -1.044e-3 * i + 3.687e-4 * i ** 2 - 2.814e-6 * i ** 3 + 8.938e-9 * i ** 4
      : id === 'mars' ? 2.267e-2 * i - 1.302e-4 * i ** 2 : 0.005 * i;
    out.push({ id, eq: norm(eclToEq(g)), dist: d, mag: H[id] + 5 * Math.log10(r * d) + ph });
  }
  return out;
}

/** The Moon (Astronomical Almanac's low-precision series, about 0.3°): equatorial of date, distance in Earth radii,
 * and its phase (0 new, 0.5 full) and lit fraction. */
export function moon(jd: number): { eqDate: V3; earthRadii: number; phase: number; lit: number } {
  const T = (jd - 2451545) / 36525;
  const s = (a: number, b: number) => Math.sin((a + b * T) * RAD);
  const c = (a: number, b: number) => Math.cos((a + b * T) * RAD);
  const lam = 218.32 + 481267.881 * T + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03);
  const bet = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89) - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const par = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36) + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  const ecl: V3 = [Math.cos(bet * RAD) * Math.cos(lam * RAD), Math.cos(bet * RAD) * Math.sin(lam * RAD), Math.sin(bet * RAD)];
  const eps = (23.439291 - 0.0130042 * T) * RAD;
  const eqDate = eclToEq(ecl, eps);
  // Phase from the elongation of the Moon from the Sun (the Sun's ecliptic longitude of date, low precision).
  const g = (357.529 + 35999.05 * T) * RAD;
  const sunLam = 280.459 + 36000.770 * T + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
  const el = (((lam - sunLam) % 360) + 360) % 360;
  return { eqDate, earthRadii: 1 / Math.sin(par * RAD), phase: el / 360, lit: (1 - Math.cos(el * RAD)) / 2 };
}

/** The horizon of a place at a time, in equatorial coordinates of date: zenith, north and east unit vectors. */
export function horizon(jd: number, lon: number, lat: number): { zenith: V3; north: V3; east: V3; lst: number } {
  const lst = (gmst(jd) + lon + 360) % 360;
  const a = lst * RAD, f = lat * RAD;
  return {
    lst,
    zenith: [Math.cos(f) * Math.cos(a), Math.cos(f) * Math.sin(a), Math.sin(f)],
    north: [-Math.sin(f) * Math.cos(a), -Math.sin(f) * Math.sin(a), Math.cos(f)],
    east: [-Math.sin(a), Math.cos(a), 0],
  };
}

/** Altitude and azimuth (degrees, azimuth from north through east) of an equatorial-of-date direction. */
export function altAz(v: V3, hz: { zenith: V3; north: V3; east: V3 }): [number, number] {
  const alt = Math.asin(Math.max(-1, Math.min(1, dot(v, hz.zenith)))) / RAD;
  let az = Math.atan2(dot(v, hz.east), dot(v, hz.north)) / RAD;
  if (az < 0) az += 360;
  return [alt, az];
}

/** An approximate star colour from its B−V index (Ballesteros 2012 temperature, then a black-body tint). */
export function bvColor(bv: number): [number, number, number] {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  const t = 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
  // Tanner Helland's black-body approximation, softened toward white (stars look pale to the eye).
  const k = t / 100;
  let r = k <= 66 ? 255 : 329.7 * Math.pow(k - 60, -0.1332);
  let g = k <= 66 ? 99.47 * Math.log(k) - 161.1 : 288.1 * Math.pow(k - 60, -0.0755);
  let bl = k >= 66 ? 255 : k <= 19 ? 0 : 138.5 * Math.log(k - 10) - 305.0;
  const mix = 0.45;
  [r, g, bl] = [r, g, bl].map((x) => Math.max(0, Math.min(255, x)) * (1 - mix) + 255 * mix);
  return [r / 255, g / 255, bl / 255];
}
