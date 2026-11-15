// Two lives side by side (Lives on the map, v0.28.0): two lives put together as one story. Kept free of the page
// (no DOM, no translations table) so the checks can run it (scripts/test/lives.mjs).
import type { Conflict, Step, Item, Side } from '../modes/stories';

type Text = { en: string; es: string };
type Pt = [number, number];
/** Between the two ids of two lives side by side, in the address too ("#lives=frida-kahlo~diego-rivera"). */
export const SEP = '~';
/** Two colours that stay apart when both lives are of the same field. */
const PAIR = ['#e64980', '#339af0'];
const R = Math.PI / 180;
export function km(a: Pt, b: Pt): number {
  const s = Math.sin(((b[1] - a[1]) * R) / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(((b[0] - a[0]) * R) / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** "A and B" ("A e Isabel" in Spanish). */
export function twoNames(a: Text, b: Text): Text {
  const y = /^(i|hi)(?![aeiouáéíóú])/i.test(b.es) ? 'e' : 'y';
  return { en: `${a.en} and ${b.en}`, es: `${a.es} ${y} ${b.es}` };
}
/** A date's year: "1929", "44 BC" ("44 a. C."). */
function yearText(date: string, l: 'en' | 'es'): string {
  const y = Number(/^-?\d+/.exec(date)?.[0] ?? 0);
  return y < 0 ? `${-y}${l === 'es' ? ' a. C.' : ' BC'}` : String(y);
}

/**
 * Two lives as one story: both lives' steps in the order they happened, each with its own colour and trail, and a
 * handshake where their paths crossed: where one life's markers name the other person, or where both have a step in
 * the same place (within 40 km) within two years of each other.
 */
export function mergeLives(a: Conflict, b: Conflict, words: { both: Text; summary: Text }): Conflict {
  const colA = a.sides[0]?.color ?? PAIR[0];
  let colB = b.sides[0]?.color ?? PAIR[1];
  if (colB === colA) colB = colA === PAIR[1] ? PAIR[0] : PAIR[1];
  const sides: Side[] = [{ id: 'a', name: a.name, color: colA }, { id: 'b', name: b.name, color: colB }];
  const ia = a.items ?? [], ib = b.items ?? [];
  const items: Item[] = [...ia, ...ib].map((it) => ({ ...it, first: -1 }));
  const own = (c: Conflict, who: string, shift: number) => c.steps.map((st): Step => ({
    ...st, who, control: { a: null, b: null },
    moves: st.moves?.map((m) => ({ ...m, side: who })),
    show: st.show?.map((k) => k + shift),
  }));
  const sa = own(a, 'a', 0), sb = own(b, 'b', ia.length);
  const steps: Step[] = [];
  for (let i = 0, j = 0; i < sa.length || j < sb.length;) {
    if (j >= sb.length || (i < sa.length && sa[i].t <= sb[j].t)) steps.push(sa[i++]); else steps.push(sb[j++]);
  }
  steps.forEach((st, k) => { for (const n of st.show ?? []) if (items[n].first < 0) items[n].first = k; });
  // Where their paths crossed.
  const alive = (st: Step) => st.at && st.age != null && !st.aftermath;
  const year = (st: Step, l: 'en' | 'es') => yearText(st.date, l);
  const mark = (st: Step, at: Pt, text: Text) => {
    st.met = true;
    if (!(st.events ?? []).some((e) => e.at && km(e.at, at) < 40)) st.events = [...(st.events ?? []), { icon: '🤝', text, at }];
  };
  for (const st of steps) {
    if (!alive(st)) continue;
    const other = st.who === 'a' ? b : a;
    // One life's markers name the other person: they met here.
    const named = (st.show ?? []).map((k) => items[k]).some((it) => it.type === 'person' && (it.id === other.id || (it.wiki?.en && it.wiki.en === other.life?.wiki?.en)));
    const near = steps.filter((x) => x.who !== st.who && alive(x) && km(x.at!, st.at!) <= 40 && Math.abs(x.t - st.t) <= 2 && x.t <= st.t);
    if (!named && !near.length) continue;
    const place = st.label ?? st.place!;
    const when = (l: 'en' | 'es') => { const y1 = year(st, l), y0 = near.length ? year(near[near.length - 1], l) : y1; return y0 === y1 ? y1 : `${y0}–${y1}`; };
    mark(st, st.at!, { en: `${words.both.en.replace('{place}', place.en)}, ${when('en')}`, es: `${words.both.es.replace('{place}', place.es)}, ${when('es')}` });
  }
  const cats = [...(a.cats ?? [])];
  for (const k of b.cats ?? []) if (!cats.some((x) => x.id === k.id)) cats.push(k);
  const sources = [...a.sources];
  for (const s of b.sources) if (!sources.some((x) => x.url === s.url)) sources.push(s);
  const mid = (x: number, y: number) => (x + y) / 2;
  // Two cameras a world apart: look between them, from far enough to see both.
  const dLon = ((b.camera.lon - a.camera.lon + 540) % 360) - 180;
  const far = km([a.camera.lon, a.camera.lat], [b.camera.lon, b.camera.lat]);
  return {
    id: `${a.id}${SEP}${b.id}`, name: twoNames(a.name, b.name), icon: '👥', era: a.t0 <= b.t0 ? a.era : b.era, kind: 'lives',
    region: { en: `${a.region.en} · ${b.region.en}`, es: `${a.region.es} · ${b.region.es}` },
    summary: words.summary,
    start: a.t0 <= b.t0 ? a.start : b.start, end: a.t1 >= b.t1 ? a.end : b.end, t0: Math.min(a.t0, b.t0), t1: Math.max(a.t1, b.t1),
    camera: { lon: a.camera.lon + dLon / 2, lat: mid(a.camera.lat, b.camera.lat), zoom: Math.max(1.2, Math.min(a.camera.zoom, b.camera.zoom, far > 6000 ? 1.4 : far > 2500 ? 2 : 3)) },
    sides, steps, items, cats, trail: true, lives: [a.life!, b.life!],
    outcome: { en: `${a.name.en}: ${a.outcome.en} ${b.name.en}: ${b.outcome.en}`, es: `${a.name.es}: ${a.outcome.es} ${b.name.es}: ${b.outcome.es}` },
    sources,
  };
}
