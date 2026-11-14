// Where the planets, dwarf planets and Halley's Comet are on any date: Keplerian orbits from JPL's elements.
// The planets use "Approximate Positions of the Planets" (E. M. Standish, JPL; table 2a with the 2b terms for Jupiter
// to Neptune, good from 3000 BC to AD 3000 to about a degree, plenty for an orrery). The others use osculating
// elements from JPL's Small-Body Database, moved along their orbits as two bodies (Sun and body).
const RAD = Math.PI / 180;

/** Julian Day of a date (UTC). */
export const julian = (d: Date) => d.getTime() / 86400000 + 2440587.5;

interface Planet { id: string; el: number[]; rate: number[]; bcsf?: number[] }
// a (au), e, I (°), L (°), long. perihelion (°), long. ascending node (°): values at J2000 and rates per century.
const PLANETS: Planet[] = [
  { id: 'mercury', el: [0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819], rate: [0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182] },
  { id: 'venus', el: [0.72332102, 0.00676399, 3.39777545, 181.97970850, 131.76755713, 76.67261496], rate: [-0.00000026, -0.00005107, 0.00043494, 58517.81560260, 0.05679648, -0.27274174] },
  { id: 'earth', el: [1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389], rate: [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.31795260, -0.24123856] },
  { id: 'mars', el: [1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984], rate: [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431] },
  { id: 'jupiter', el: [5.20248019, 0.04853590, 1.29861416, 34.33479152, 14.27495244, 100.29282654], rate: [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619], bcsf: [-0.00012452, 0.06064060, -0.35635438, 38.35125000] },
  { id: 'saturn', el: [9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702], rate: [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002], bcsf: [0.00025899, -0.13434469, 0.87320147, 38.35125000] },
  { id: 'uranus', el: [19.18797948, 0.04685740, 0.77298127, 314.20276625, 172.43404441, 73.96250215], rate: [-0.00020455, -0.00001550, -0.00180155, 428.49512595, 0.09266985, 0.05739699], bcsf: [0.00058331, -0.97731848, 0.17689245, 7.67025000] },
  { id: 'neptune', el: [30.06952752, 0.00895439, 1.77005520, 304.22289287, 46.68158724, 131.78635853], rate: [0.00006447, 0.00000818, 0.00022400, 218.46515314, 0.01009938, -0.00606302], bcsf: [-0.00041348, 0.68346318, -0.10162547, 7.67025000] },
];

interface Small { id: string; epoch: number; a: number; e: number; i: number; om: number; w: number; ma: number; per: number }
// JPL Small-Body Database, osculating elements (au, degrees, days). Halley's period is the time between its 1986 and
// 2061 perihelia, so its next return falls on the right date.
const SMALL: Small[] = [
  { id: 'ceres', epoch: 2461200.5, a: 2.765552595034094, e: 0.07969229514816586, i: 10.58802780183462, om: 80.24862682043221, w: 73.29421453021587, ma: 274.4193463761342, per: 1679.853119758983 },
  { id: 'pluto', epoch: 2457588.5, a: 39.58862938517124, e: 0.2518378778576892, i: 17.14771140999114, om: 110.2923840543057, w: 113.7090015158565, ma: 38.68366347318184, per: 90981.71647718345 },
  { id: 'haumea', epoch: 2461200.5, a: 43.06029023650952, e: 0.1944430148898797, i: 28.20847393040364, om: 121.7860561329425, w: 240.6905472508661, ma: 223.2104118812299, per: 103208.1173403618 },
  { id: 'makemake', epoch: 2461200.5, a: 45.57093317300052, e: 0.1588889953992523, i: 29.02785603743067, om: 79.2948338209406, w: 297.0922733397207, ma: 169.9379962048232, per: 112364.8068762869 },
  { id: 'eris', epoch: 2461200.5, a: 67.93394687853566, e: 0.4382385347971672, i: 43.9258279471791, om: 36.00477044417249, w: 150.7949235840312, ma: 211.774434275007, per: 204516.6629430732 },
  // Perihelion 1986-02-09.47 (JD 2446469.97); the next one 2061-07-28 (JD 2474033): 27 563 days.
  { id: 'halley', epoch: 2446469.9736161465, a: 17.92863504856923, e: 0.9679359956953211, i: 162.1905300439129, om: 59.09894720612437, w: 112.2414314637764, ma: 0, per: 27563 },
];

export const BODY_IDS = [...PLANETS.map((p) => p.id), ...SMALL.map((s) => s.id)];

/** Solves Kepler's equation M = E − e sin E (radians). */
function kepler(M: number, e: number): number {
  M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  let E = e < 0.8 ? M : Math.PI * Math.sign(M || 1);
  for (let k = 0; k < 50; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/** Heliocentric ecliptic position (au) from a, e, I, ω (perihelion argument), Ω, and the mean anomaly (radians). */
function place(a: number, e: number, I: number, w: number, O: number, M: number): [number, number, number] {
  const E = kepler(M, e);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

export interface Orbit { a: number; e: number; I: number; w: number; O: number; M: number }

/** A body's orbit (its shape and where it is on it) on a Julian Day. */
export function orbitOf(id: string, jd: number): Orbit | null {
  const p = PLANETS.find((x) => x.id === id);
  if (p) {
    const T = (jd - 2451545) / 36525;
    const [a, e, I, L, pi, O] = p.el.map((v, k) => v + p.rate[k] * T);
    let M = L - pi;
    if (p.bcsf) { const [b, c, s, f] = p.bcsf; M += b * T * T + c * Math.cos(f * T * RAD) + s * Math.sin(f * T * RAD); }
    return { a, e, I: I * RAD, w: (pi - O) * RAD, O: O * RAD, M: M * RAD };
  }
  const s = SMALL.find((x) => x.id === id);
  if (!s) return null;
  return { a: s.a, e: s.e, I: s.i * RAD, w: s.w * RAD, O: s.om * RAD, M: (s.ma + (360 / s.per) * (jd - s.epoch)) * RAD };
}

/** Where a body is (heliocentric ecliptic, au). */
export function positionOf(id: string, jd: number): [number, number, number] | null {
  const o = orbitOf(id, jd);
  return o ? place(o.a, o.e, o.I, o.w, o.O, o.M) : null;
}

/** Points along a body's whole orbit (for drawing it). */
export function orbitPath(id: string, jd: number, n = 180): [number, number, number][] {
  const o = orbitOf(id, jd);
  if (!o) return [];
  const pts: [number, number, number][] = [];
  // Even steps in the eccentric anomaly, so the far end of a comet's orbit is not too sparse.
  for (let k = 0; k <= n; k++) {
    const E = (k / n) * 2 * Math.PI;
    pts.push(place(o.a, o.e, o.I, o.w, o.O, E - o.e * Math.sin(E)));
  }
  return pts;
}

export const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
