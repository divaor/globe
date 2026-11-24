// Checks Deep time's logic (src/deeptime/logic.ts, v0.45.0) with Node: vital signs between points, the young Sun,
// years and days, ice and the ozone layer, the survival verdict, what was alive and happening, the two time scales,
// how long ago in words, the cosmic calendar, the planet's look. Then the real data in public/data/deeptime, when built.
// Usage: node scripts/test/deeptime.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/deeptime/logic.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const G = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---- Vital signs.
const T = (en) => ({ en, es: en });
const series = [
  { id: 'o2', unit: '%', name: T('Oxygen'), points: [[0, 21], [100, 25, 20, 30], [2500, 0.001], [4540, 0]] },
  { id: 'co2', unit: 'ppm', name: T('CO2'), points: [[0, 420], [66, 1000], [252, 4000], [4540, 100000]] },
  { id: 'temp', unit: '°C', name: T('T'), points: [[0, 15], [56, 30], [700, -40], [4540, 70]] },
  { id: 'day', unit: 'h', name: T('Day'), points: [[0, 24], [620, 21.9], [4540, 6]] },
];
const ice = [{ from: 34, to: 0, kind: 'south' }, { from: 2.7, to: 0, kind: 'north' }, { from: 0.026, to: 0.019, kind: 'glacial' }, { from: 717, to: 660, kind: 'snowball' }];
const o2 = series[0];
check(near(G.valueAt(o2, 0).v, 21) && near(G.valueAt(o2, 50).v, 23) && near(G.valueAt(o2, 1270).v, 12.813, 1e-3), 'a value between two points lies on the line between them');
check(G.valueAt(o2, 50).lo === undefined && near(G.valueAt(o2, 100).lo, 20) && G.valueAt(o2, 5000) === null, 'a range only where both points have one; nothing before the oldest point');
check(near(G.sunBrightness(0), 1) && near(G.sunBrightness(4570), 1 / 1.4) && G.sunBrightness(4540) < 0.72, 'the young Sun shone at about 70% (Gough 1981)');
check(near(G.yearDays(24), 365.2422) && Math.round(G.yearDays(21.9)) === 400, 'a 21.9-hour day makes a year of about 400 days');
check(G.iceAt(ice, 0.02) === 'glacial' && G.iceAt(ice, 1) === 'north' && G.iceAt(ice, 20) === 'south' && G.iceAt(ice, 700) === 'snowball' && G.iceAt(ice, 100) === null, 'the iciest state wins: a glacial maximum over northern ice over southern ice');
check(G.ozone(0.001) === 'none' && G.ozone(0.5) === 'thin' && G.ozone(3) === 'full' && G.ozone(21) === 'full', 'the ozone layer grows with oxygen');

// ---- Could you survive here?
const d = { series, ice };
const at = (ma) => G.survival(G.vitalsAt(d, ma));
const keys = (v) => v.reasons.map((r) => r.key);
check(at(0).level === 'ok', 'today: you could live here');
check(at(3000).level === 'no' && keys(at(3000)).includes('no-oxygen') && keys(at(3000)).includes('no-ozone'), 'the Archean: no oxygen to breathe and no ozone layer');
check(at(4500).level === 'no' && keys(at(4500))[0] === 'molten', 'the first days: molten rock');
check(!keys(at(4400)).includes('molten') && G.look(4400, G.vitalsAt(d, 4400)).magma === 0, 'by 4400 million years ago the crust was solid');
check(keys(at(700)).includes('snowball'), 'a Snowball Earth is frozen');
check(G.survival({ ...G.vitalsAt(d, 0), co2: { v: 50000 } }).level === 'no', 'air with 5% carbon dioxide would kill you');

// ---- The cosmos (v0.46.0): the chapters' time scales, the expansion, the eras, the verdict.
{
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  for (const ch of ['cosmos', 'earth', 'all']) for (const sc of ['story', 'true']) {
    let ok = true, prev = -1;
    for (let i = 0; i <= 200; i++) {
      const p = i / 200, t = G.tAt(p, sc, ch);
      if (!(t >= prev - 1e-9)) ok = false;
      prev = t;
      const back = G.posOfT(t, sc, ch);
      if (!near(back, p, 1e-6) && t > 1e-30) ok = false;
    }
    check(ok, `${ch}, ${sc} scale: time only moves forward along the bar, and a moment finds its place again`);
  }
  check(G.tAt(0, 'story', 'cosmos') === 0 && near(G.maOfT(G.tAt(1, 'story', 'cosmos')), G.COSMOS_END, 1e-6) && near(G.maOfT(G.tAt(1, 'story', 'all')), 0, 1e-9), 'the cosmos chapter runs from the Big Bang to the Moon; Big Bang to today, to today');
  const tNuclei = 3 * 60 / (365.25 * 86400);
  check(G.posOfT(tNuclei, 'story', 'cosmos') > 0.05 && G.posOfT(380000, 'story', 'cosmos') < 0.2, 'the story scale gives the first 380,000 years room: the first three minutes are not squeezed to nothing');
  check(near(G.posOfT(G.sinceBang(G.EARTH_MA), 'true', 'all'), 1 - G.EARTH_MA / G.BIG_BANG_MA, 1e-9), 'on the true scale the Earth forms two thirds of the way along');
  const a380 = G.scaleFactor(380000);
  check(near(1 / a380, 1090, 60) && near(G.spaceTemp(380000), 2970, 150), `when the first atoms formed the universe was about 1/1,100 of today's size and 3,000 K (${Math.round(1 / a380)}, ${Math.round(G.spaceTemp(380000))} K)`);
  check(near(G.scaleFactor(G.sinceBang(0)), 1, 1e-6) && near(G.spaceTemp(G.sinceBang(0)), 2.7255, 1e-3), 'today: the scale factor is 1 and space is 2.7 K');
  const half = G.scaleFactor(G.sinceBang(G.BIG_BANG_MA - 5800));
  check(near(half, 0.5, 0.05), `at about 5.8 billion years the universe was half today's size (${half.toFixed(3)})`);
  const warm = G.spaceTemp(15e6);
  check(warm > 273 && warm < 373 && G.cosmicSurvival(15e6).reasons.some((r) => r.key === 'warm-space'), `fifteen million years after the Big Bang space itself was as warm as a summer's day (${Math.round(warm - 273)} °C)`);
  check(G.cosmicSurvival(100).reasons.some((r) => r.key === 'opaque') && G.cosmicSurvival(100).level === 'no', 'before the first atoms the universe was a glowing fog');
  check(G.cosmicEra(0) === 'bang' && G.cosmicEra(1000) === 'plasma' && G.cosmicEra(1e7) === 'dark' && G.cosmicEra(G.sinceBang(13500)) === 'stars' && G.cosmicEra(G.sinceBang(4569)) === 'nebula' && G.cosmicEra(G.sinceBang(4520)) === 'earth', 'the eras in order');
  const ab = G.afterBang(3.17e-40);
  check(ab.unit === 'tiny' && ab.exp === -32 && G.afterBang(tNuclei).unit === 'minutes' && G.afterBang(380000).n === 380 && G.afterBang(G.sinceBang(13600)).unit === 'million', `how long after the Big Bang, in words (10^${ab.exp} s, ${G.afterBang(tNuclei).n} minutes)`);
  check(G.chapterFor(13000) === 'cosmos' && G.chapterFor(4000) === 'earth', 'a moment before the Earth opens the cosmos chapter');
}

// ---- Life and events.
const sp = [
  { id: 'a', from: 100, to: 66 }, { id: 'b', from: 66, to: 0, alive: true }, { id: 'c', from: 300, to: 252 },
];
check(G.aliveAt(sp, 66).map((s) => s.id).join() === 'a,b' && G.aliveAt(sp, 260).map((s) => s.id).join() === 'c', 'alive from the first appearance to the last');
const ev = [{ id: 'x', ma: 66.04 }, { id: 'y', ma: 252.2, to: 251.5 }, { id: 'z', ma: 201 }];
check(G.eventsAt(ev, 66, 0.1).map((e) => e.id).join() === 'x' && G.eventsAt(ev, 251.9, 0.01).map((e) => e.id).join() === 'y', 'events under way, and moments near in time');

// ---- Time scales.
const round = (x) => Math.round(x * 1000) / 1000;
check(G.maAt(0, 'story') === 4540 && G.maAt(1, 'story') === 0 && G.maAt(0.7, 'story') === 66 && round(G.posOf(66, 'story')) === 0.7, 'the story scale: the dinosaurs end at 70% of the bar');
check(round(G.posOf(G.maAt(0.42, 'story'), 'story')) === 0.42 && round(G.maAt(G.posOf(123, 'story'), 'story')) === 123, 'positions and ages go back and forth');
check(near(G.maAt(0.5, 'true'), 2270) && near(G.posOf(66, 'true'), 1 - 66 / 4540) && near(G.maAt(0, 'true', 13787), 13787), 'the true scale: the bar is even');
check(G.ago(4540).unit === 'billion' && G.ago(4540).n === 4.54 && G.ago(66).n === 66 && G.ago(0.3).unit === 'thousand' && G.ago(0.3).n === 300 && G.ago(0).unit === 'today' && G.ago(2.58).n === 2.6, 'how long ago in words: 4.54 billion, 66 million, 300 thousand, today');

// ---- The cosmic calendar.
const cd = (ma) => G.cosmicDate(ma);
const sun = cd(4570), dino = cd(66), us = cd(0.3);
check(cd(13787).month === 0 && cd(13787).day === 1 && cd(0).month === 11 && cd(0).day === 31, 'the Big Bang on 1 January, today at the end of 31 December');
check(sun.month === 8 && sun.day <= 5, `the Sun forms in early September (${sun.day}/${sun.month + 1})`);
check(dino.month === 11 && dino.day === 30, `the dinosaurs die on 30 December (${dino.day}/${dino.month + 1} ${dino.h}:${dino.m})`);
check(us.month === 11 && us.day === 31 && us.h === 23 && us.m >= 48, `Homo sapiens arrives in the last minutes of 31 December (${us.h}:${us.m}:${us.s})`);
check(G.shareSince(0.3) < 0.00003 && G.shareSince(4540) > 0.32 && G.shareSince(4540) < 0.34, 'humans: about 0.002% of all time; the Earth: the last third');

// ---- The planet's look.
const lk = (ma) => G.look(ma, G.vitalsAt(d, ma));
check(lk(4500).magma === 1 && lk(4000).magma === 0, 'molten at first, then cooled');
check(lk(700).snowball && lk(700).capN === 90, 'a Snowball Earth is white to the equator');
check(lk(3000).haze > 0 && lk(1000).haze === 0, 'an orange haze in the Archean');
check(lk(500).green === 0 && lk(400).green > 0 && lk(100).green > 0.8, 'green land once plants spread');
check(lk(20).capS > 0 && lk(20).capN === 0 && lk(1).capN > 0, 'ice in the south since 34 million years ago, in the north since 2.7');
check(G.crust(4540) === 0 && G.crust(0) === 1 && G.crust(2500) > G.crust(3500), 'the continents grow');
check(G.readingTime('a b c') === 5 && G.readingTime(Array(100).fill('w').join(' ')) === 20, 'a beat waits long enough to read it');

// ---- The real data.
const dir = path.join(ROOT, 'public/data/deeptime');
if (fs.existsSync(path.join(dir, 'deeptime.json'))) {
  const D = JSON.parse(fs.readFileSync(path.join(dir, 'deeptime.json'), 'utf8'));
  const S = JSON.parse(fs.readFileSync(path.join(dir, 'species.json'), 'utf8')).species;
  check(D.events.length >= 80 && S.length >= 200, `${D.events.length} events and ${S.length} species`);
  const today = G.survival(G.vitalsAt(D, 0));
  check(today.level === 'ok', `today you could live here (${today.reasons.map((r) => r.key).join(', ') || 'nothing to say'})`);
  const arch = G.survival(G.vitalsAt(D, 3000));
  check(arch.level === 'no', `3 billion years ago you could not (${arch.reasons.map((r) => r.key).join(', ')})`);
  const atD = (ma) => G.survival(G.vitalsAt(D, ma));
  check(keys(atD(300)).includes('rich-oxygen') && atD(300).level !== 'no', 'the Carboniferous: richer air than today');
  check(keys(atD(1000)).includes('thin-ozone') && !keys(atD(1000)).includes('no-ozone'), 'the mid-Proterozoic: a thin ozone layer');
  check(keys(atD(445)).includes('thin-oxygen') && !keys(atD(445)).includes('no-oxygen'), 'the Ordovician: thin air, like a high mountain');
  for (const ma of [500, 300, 150, 50, 1]) check(G.aliveAt(S, ma).length >= 8, `${G.aliveAt(S, ma).length} species alive ${ma} million years ago`);
  check(D.events.some((e) => e.id.includes('chicxulub') && e.at), 'the asteroid that ended the dinosaurs is on the map');
  check(D.beats.length >= 40, `${D.beats.length} narrated moments`);

  // The pace of play (v0.46.1): the same clock as the app's (events and the cosmos scene's moments), per chapter.
  const cb = await rolldown({ input: path.join(ROOT, 'src/deeptime/cosmos.ts'), platform: 'neutral', logLevel: 'silent', external: [/lucide/] });
  const C = await import(`data:text/javascript;base64,${Buffer.from((await cb.generate({ format: 'esm' })).output[0].code).toString('base64')}`);
  const tOf = (e) => e.t ?? G.sinceBang(e.ma);
  const clockFor = (ch, sc) => {
    const lo = ch === 'earth' ? G.sinceBang(G.EARTH_MA) : 0, hi = ch === 'cosmos' ? G.sinceBang(G.COSMOS_END) : G.sinceBang(0);
    const inside = (t) => t >= lo - 1 && t <= hi + 1;
    const marks = D.events.filter((e) => inside(tOf(e))).map((e) => ({ at: G.posOfT(tOf(e), sc, ch), dur: e.first || e.kind === 'impact' || e.kind === 'extinction' ? 2.6 : 1.8 }));
    const spans = ch === 'earth' ? [] : C.SCENE_MOMENTS.filter((m) => inside(m.from) || inside(m.to)).map((m) => ({ from: G.posOfT(Math.max(lo, m.from), sc, ch), to: G.posOfT(Math.min(hi, m.to), sc, ch), dur: m.dur }));
    return G.paceClock(marks, spans);
  };
  const secs = (k, ch, sc, ma0, ma1) => k.to(G.posOfT(G.sinceBang(ma1), sc, ch)) - k.to(G.posOfT(G.sinceBang(ma0), sc, ch));
  const old = (ch, sc, ma0, ma1) => (G.posOfT(G.sinceBang(ma1), sc, ch) - G.posOfT(G.sinceBang(ma0), sc, ch)) / 0.012;
  for (const ch of ['cosmos', 'earth', 'all']) for (const sc of ['story', 'true']) {
    const k = clockFor(ch, sc);
    let mono = true, back = 0;
    for (let i = 1; i <= 400; i++) { const p = i / 400; if (k.to(p) <= k.to(p - 1 / 400)) mono = false; back = Math.max(back, Math.abs(k.from(k.to(p)) - p)); }
    check(mono && back < 1e-9 && k.total > 60 && k.total < 300, `${ch}, ${sc} scale: ${Math.round(k.total)} s of play at 1×, every moment in order`);
  }
  for (const ch of ['cosmos', 'all']) {
    const k = clockFor(ch, 'story');
    const moon = secs(k, ch, 'story', 4510, 4500);
    check(moon >= 5, `${ch}: Theia's blow and the Moon gathering take ${moon.toFixed(1)} s (they flashed by in ${old(ch, 'story', 4510, 4500).toFixed(1)} s)`);
  }
  {
    const k = clockFor('earth', 'story');
    const quiet = secs(k, 'earth', 'story', 1600, 1320), was = old('earth', 'story', 1600, 1320);
    const blast = secs(k, 'earth', 'story', 66.5, 65.5), wasB = old('earth', 'story', 66.5, 65.5);
    check(quiet < was * 0.7 && blast > wasB * 1.5, `the play goes quicker through a quiet stretch of the "boring billion", 1,600 to 1,320 million years ago (${quiet.toFixed(1)} s, was ${was.toFixed(1)}) and slower at the asteroid (${blast.toFixed(1)} s, was ${wasB.toFixed(1)})`);
  }
} else console.log('(public/data/deeptime is not built yet: the real-data checks wait)');

if (failed) { console.error(`${failed} failed`); process.exit(1); }
console.log('deep time: all good');
