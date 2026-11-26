// Checks Tonight's sky's sums (src/sky/tonight-astro.ts, v0.49.0) with Node against known values: Jupiter's moons and
// Saturn's rings from Meeus's worked examples, the rings edge-on in March 2025, the new and full moons of 2026's
// eclipses, sunrise and sunset in London on the June solstice, the Moon's librations, the phase names, the night's
// window and twilight, and the planets' brightness and phases.
// Usage: node scripts/test/tonight.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/sky/tonight-astro.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const T = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const jd = (iso) => new Date(iso).getTime() / 86400000 + 2440587.5;
const iso = (j) => new Date((j - 2440587.5) * 86400000).toISOString().slice(0, 16).replace('T', ' ');
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// Jupiter's moons, Meeus example 44.a (1992 December 16, 0h).
const want = { io: [-3.44, 0.21], europa: [7.44, 0.25], ganymede: [1.24, 0.65], callisto: [7.08, 1.10] };
const jm = T.jupiterMoons(2448972.5);
check(jm.every((m) => near(m.x, want[m.id][0], 0.06) && near(m.y, want[m.id][1], 0.06)),
  `Jupiter's moons as in Meeus 44.a: ${jm.map((m) => `${m.id} ${m.x.toFixed(2)},${m.y.toFixed(2)}`).join('; ')}`);

// Saturn's rings, Meeus example 45.a (1992 December 16, 0h): B = 16.442°; edge-on to us on 2025 March 23.
const sat = (j) => T.planetsAt(j, 0, 0).find((p) => p.id === 'saturn');
const B92 = T.ringTilt(2448972.5, sat(2448972.5).dir);
check(near(B92, 16.442, 0.3), `Saturn's rings open ${B92.toFixed(2)}° on 1992-12-16 (Meeus: 16.44°)`);
const B25 = T.ringTilt(jd('2025-03-23T12:00Z'), sat(jd('2025-03-23T12:00Z')).dir);
check(Math.abs(B25) < 0.4, `Saturn's rings edge-on on 2025-03-23 (${B25.toFixed(2)}°)`);
const B26 = T.ringTilt(jd('2026-11-26T00:00Z'), sat(jd('2026-11-26T00:00Z')).dir);
check(B26 < -2 && B26 > -12, `late 2026: the rings' south side, ${B26.toFixed(1)}° open`);

// The Moon's phases: 2026's eclipses fall on a new moon (17 February, 12 August) and a full moon (3 March, 28 August).
const ph = (from, k) => T.nextPhases(jd(from), 4).find((p) => p.k === k).jd;
const cases = [['2026-02-10T00:00Z', 0, '2026-02-17T12:01Z'], ['2026-08-01T00:00Z', 0, '2026-08-12T17:37Z'], ['2026-02-25T00:00Z', 2, '2026-03-03T11:38Z'], ['2026-08-20T00:00Z', 2, '2026-08-28T04:18Z']];
for (const [from, k, at] of cases) {
  const got = ph(from, k);
  check(near(got, jd(at), 2 / 24), `${k ? 'full' : 'new'} moon at ${iso(got)} UTC (eclipse at ${at.slice(0, 16).replace('T', ' ')})`);
}
const four = T.nextPhases(jd('2026-11-26T00:00Z'), 4);
check(four.length === 4 && new Set(four.map((p) => p.k)).size === 4 && four.every((p, i) => !i || p.jd > four[i - 1].jd), `the next four phases in order: ${four.map((p) => `${p.k}@${iso(p.jd)}`).join(', ')}`);
check(T.phaseKey(0.3) === 'new' && T.phaseKey(4) === 'waxing-crescent' && T.phaseKey(7.4) === 'first-quarter' && T.phaseKey(11) === 'waxing-gibbous'
  && T.phaseKey(14.8) === 'full' && T.phaseKey(18) === 'waning-gibbous' && T.phaseKey(22.1) === 'last-quarter' && T.phaseKey(26) === 'waning-crescent' && T.phaseKey(29.2) === 'new', 'phase names by age');
const fullNow = T.moonAt(jd('2026-03-03T11:38Z'), 0, 0);
check(fullNow.key === 'full' && fullNow.lit > 0.99, `at the full moon: ${fullNow.key}, ${(fullNow.lit * 100).toFixed(1)}% lit`);

// Sunrise and sunset in London on the 2026 June solstice: 03:43 and 21:21 BST (20:21 UTC).
const lon = -0.1278, lat = 51.5074;
const [n0, n1] = T.nightWindow(jd('2026-06-21T23:00Z'), lon);
check(near(((n0 + 0.5 + lon / 360) % 1 + 1) % 1, 0.5, 1e-9) && n1 - n0 === 1, `the night's window starts at local noon (${iso(n0)} UTC)`);
const s = T.sample(n0, n1, lon, lat, 10);
const nt = T.nightTimes(s);
check(near(nt.sunset, jd('2026-06-21T20:21Z'), 3 / 1440), `London sunset ${iso(nt.sunset)} UTC (20:21)`);
check(near(nt.sunrise, jd('2026-06-22T03:43Z'), 3 / 1440), `London sunrise ${iso(nt.sunrise)} UTC (03:43)`);
check(nt.astroDusk === null && nt.nauticalDusk !== null && nt.polar === null, 'no astronomical darkness in London at midsummer, but nautical twilight ends');
const north = T.sample(...T.nightWindow(jd('2026-06-21T12:00Z'), 18.95), 18.95, 69.65, 20);
check(T.nightTimes(north).polar === 'day', 'Tromsø at midsummer: the Sun never sets');
const southPole = T.sample(...T.nightWindow(jd('2026-06-21T12:00Z'), 0), 0, -89.9, 20);
check(T.nightTimes(southPole).polar === 'night', 'the South Pole at midwinter: the Sun never rises');

// The Moon's face toward us: libration keeps the middle of the near side within about 8° of 0°, 0°.
let worst = [0, 0];
for (let k = 0; k < 400; k++) {
  const j = jd('2026-01-01T00:00Z') + k * 0.9;
  const m = T.moonAt(j, 0, 0);
  const [lo, la] = T.subObserver(T.bodyAxes('moon', j), m.dir);
  worst = [Math.max(worst[0], Math.abs(lo)), Math.max(worst[1], Math.abs(la))];
}
check(worst[0] > 4 && worst[0] < 9 && worst[1] > 4 && worst[1] < 8.5, `the Moon's librations: up to ${worst[0].toFixed(1)}° east–west, ${worst[1].toFixed(1)}° north–south`);

// The Moon's tilt: a crescent after sunset near the equator lies like a bowl (its lit side down).
let cres = null;
for (let k = 0; k < 30 * 24 && !cres; k++) {
  const j = jd('2026-11-09T00:00Z') + k / 24;
  const m = T.moonAt(j, -78.5, -0.2);
  const sunAlt = T.sample(j, j + 1e-3, -78.5, -0.2, 1).sun[0];
  if (m.age > 3 && m.age < 5 && m.alt > 10 && sunAlt < -8) cres = { j, m };
}
const tilt = cres ? T.brightLimb(cres.m.dir, T.sunDir(cres.j).dir, T.zenithJ2000(cres.j, -78.5, -0.2)) : NaN;
check(cres && tilt < -50 && tilt > -130, `a waxing crescent over Quito after dusk has its lit side down (${tilt.toFixed(0)}° from the right)`);

// The planets: brightness in the right range, Venus half lit at its greatest elongation, Jupiter's width.
const span = Array.from({ length: 120 }, (_, k) => jd('2026-01-01T00:00Z') + k * 3);
const ps = span.map((j) => T.planetsAt(j, 0, 0));
const by = (id) => ps.map((list) => list.find((p) => p.id === id));
const range = (id, f) => { const v = by(id).map(f); return [Math.min(...v), Math.max(...v)]; };
const [vMin, vMax] = range('venus', (p) => p.mag), [jMin, jMax] = range('jupiter', (p) => p.mag), [mMin, mMax] = range('mars', (p) => p.mag);
check(vMin > -4.95 && vMax < -3.7 && jMin > -2.95 && jMax < -1.6 && mMin > -2.9 && mMax < 1.9, `magnitudes in 2026: Venus ${vMin.toFixed(1)}…${vMax.toFixed(1)}, Jupiter ${jMin.toFixed(1)}…${jMax.toFixed(1)}, Mars ${mMin.toFixed(1)}…${mMax.toFixed(1)}`);
const ven = by('venus');
const ge = ven.reduce((a, b) => (b.elong > a.elong ? b : a));
check(ge.elong > 44 && ge.elong < 48 && near(ge.lit, 0.5, 0.06), `Venus at its greatest elongation (${ge.elong.toFixed(1)}°) is ${(ge.lit * 100).toFixed(0)}% lit`);
const [jdMin, jdMax] = range('jupiter', (p) => p.diam);
check(jdMin > 29 && jdMax < 50.5, `Jupiter ${jdMin.toFixed(0)}–${jdMax.toFixed(0)}″ wide`);
check(T.brightness(-4.3) === 0 && T.brightness(-2.2) === 1 && T.brightness(0.4) === 2 && T.brightness(2) === 3 && T.brightness(5.7) === 4 && T.brightness(7.8) === 5, 'brightness words by magnitude');
check(T.compass8(0) === 0 && T.compass8(44) === 1 && T.compass8(180) === 4 && T.compass8(350) === 0 && T.compass8(-90) === 6, 'compass points');

// The sub-lunar point: the Moon is straight overhead there.
const jj = jd('2026-11-26T03:00Z');
const m0 = T.moonAt(jj, 0, 0);
const [slon, slat] = T.subPoint(jj, m0.dir);
const over = T.moonAt(jj, slon, slat);
check(over.alt > 88.5, `the Moon is overhead at ${slon.toFixed(1)}, ${slat.toFixed(1)} (${over.alt.toFixed(1)}° up)`);

console.log(failed ? `\n${failed} check(s) failed` : '\nall Tonight\'s sky checks passed');
process.exit(failed ? 1 : 0);
