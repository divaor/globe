// Checks the sky's astronomy and data (v0.21.0) against known events and figures:
//   - Jupiter and Saturn 0.1° apart at the great conjunction of 21 December 2020;
//   - the Moon full on 23 April 2024 and new at the eclipse of 8 April 2024, close to the Sun then;
//   - the galactic centre at RA 17h 45.6m, Dec −28° 56′;
//   - Polaris at about the observer's latitude;
//   - Venus at its usual brightness at greatest elongation (−4.4 to −4.8);
//   - the 88 constellations covering the whole sky (41,253 square degrees) and the brightest stars named.
// Usage: node scripts/test/sky.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// astro.ts imports other TypeScript modules: bundle it with rolldown (Vite's bundler) and load the result.
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/sky/astro.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const A = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
const sep = (a, b) => (Math.acos(Math.max(-1, Math.min(1, A.dot(a, b)))) * 180) / Math.PI;
const jd = (iso) => A.julian(new Date(iso));

{
  const t = jd('2020-12-21T18:20:00Z');
  const ss = A.solarSystem(t);
  const j = ss.find((b) => b.id === 'jupiter'), s = ss.find((b) => b.id === 'saturn');
  const d = sep(j.eq, s.eq);
  check(d < 0.2, `Jupiter and Saturn ${d.toFixed(3)}° apart on 21 December 2020 (0.10° observed)`);
}
{
  const m = A.moon(jd('2024-04-23T23:49:00Z'));
  check(Math.abs(m.phase - 0.5) < 0.01 && m.lit > 0.99, `the Moon full on 23 April 2024 (phase ${m.phase.toFixed(3)}, lit ${m.lit.toFixed(3)})`);
  const t = jd('2024-04-08T18:18:00Z');
  const sun = A.mul(A.precession(t), A.solarSystem(t)[0].eq), mo = A.moon(t).eqDate;
  const d = sep(sun, mo);
  check(d < 1, `the Moon in front of the Sun at the eclipse of 8 April 2024 (${d.toFixed(2)}° apart, seen from the Earth's centre)`);
}
{
  const [ra, dec] = A.radec(A.fromGalactic(0, 0));
  check(Math.abs(ra - 266.405) < 0.05 && Math.abs(dec + 28.936) < 0.05, `the galactic centre at RA ${(ra / 15).toFixed(3)} h, Dec ${dec.toFixed(2)}°`);
}
{
  const t = jd('2026-11-14T22:00:00Z');
  const hz = A.horizon(t, -3.7, 40.4);
  const [alt] = A.altAz(A.mul(A.precession(t), A.vec(37.95, 89.264)), hz);
  check(Math.abs(alt - 40.4) < 1.2, `Polaris ${alt.toFixed(1)}° up from Madrid (latitude 40.4°)`);
}
{
  // Venus at greatest eastern elongation, 4 June 2023: magnitude −4.4 (−4.3 to −4.5 published).
  const v = A.solarSystem(jd('2023-06-04T12:00:00Z')).find((b) => b.id === 'venus');
  check(v.mag > -4.9 && v.mag < -4.1, `Venus at magnitude ${v.mag.toFixed(1)} at its greatest elongation of June 2023`);
}
{
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/sky/constellations.json'), 'utf8'));
  const area = c.cons.reduce((s, k) => s + k.area, 0);
  check(c.cons.length === 88 && Math.abs(area - 41253) < 60, `${c.cons.length} constellations covering ${Math.round(area)} square degrees`);
  const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/sky/stars.json'), 'utf8'));
  const named = ['32349', '30438', '71683', '69673', '91262', '24608', '24436', '37279', '27989', '11767'].filter((h) => s.names[h]?.[0]);
  check(s.stars.length > 4800 && named.length === 10, `${s.stars.length} stars; Sirius, Canopus, Alpha Centauri, Arcturus, Vega, Capella, Rigel, Procyon, Betelgeuse and Polaris named`);
}
console.log(fails ? `\n${fails} sky check(s) failed` : '\nsky checks passed');
process.exit(fails ? 1 : 0);
