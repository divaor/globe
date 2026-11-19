// Master the world's four new decks (v0.39.0), run by master.ts like its own: spaced repetition, Learn, Run and
// Marathon, the daily goal. Each says how its question is asked and answered:
//  - Outlines: a country's shape alone in the card; picked among its neighbours, then tapped on a map with no names,
//    then typed.
//  - Big cities: a gold dot on a map with no names, picked among the nearest big cities; then "Tap Lagos" among their
//    dots; then typed.
//  - Landmarks: a World Heritage picture and its name: in which country? Picked, then tapped on the map, then typed.
//  - Rivers, mountains and seas: the river, lake, range, desert, peak or sea drawn in gold, picked among the nearest
//    of its kind; then "Tap “Danube”" among them drawn in white; then typed.
import { geoAzimuthalEqualArea, geoBounds, geoCentroid, geoContains, geoPath } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';
import type { Topology, GeometryObject } from 'topojson-specification';
import type { App } from '../app/app';
import type { RenderCtx } from '../layers/types';
import { h } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { loadJSON } from '../data/store';
import { L, es } from '../play/host';
import { mainBody } from '../play/outline';
import { pickCountry } from '../play/pick';
import { commons, commonsPage, commonsCredit } from '../artguide/data';
import { neighbours, typedRight, type Country, type DeckData, type Question } from './decks';
import { shuffle, type DeckId, type Step } from './srs';

export type ExtraId = 'outlines' | 'cities' | 'landmarks' | 'nature';
export const EXTRA_DECKS: ExtraId[] = ['outlines', 'cities', 'landmarks', 'nature'];
export const isExtra = (d: DeckId): d is ExtraId => (EXTRA_DECKS as string[]).includes(d);

export interface ExtraAnswer { ok: boolean; at: number; given?: string; peek?: boolean }

/** What a deck uses of Master the world. */
export interface Ctx {
  app: App;
  /** The countries (deck.json), once loaded. */
  countries: () => DeckData | null;
  /** A country's name. */
  country: (id: string) => string;
  /** The country a typed text names, if any. */
  matchCountry: (text: string) => string | null;
  /** Flies to show some points together. */
  fit: (points: [number, number][], max?: number) => void;
}

export interface ExtraDeck {
  id: ExtraId;
  /** Its cards, as countries are (id, continent, fame, people); `hard` (v0.39.1, Big cities and Landmarks): the
   *  wider set. */
  load(hard?: boolean): Promise<Country[] | null>;
  /** One of the normal deck's (the hard deck holds them too). */
  isCore?(id: string): boolean;
  has(id: string): boolean;
  name(id: string): string;
  question(c: Country, step: Step, allowed: Map<string, Country>, r: () => number): Question;
  prompt(q: Question): string;
  optionLabel(v: string): string;
  /** The right option's value (a city, a place, a country). */
  right(q: Question): string;
  isRight(q: Question, v: string): boolean;
  /** What the card shows with the question: a shape, a picture. */
  visual(q: Question, answered: boolean): HTMLElement | null;
  frame(q: Question): void;
  draw(rc: RenderCtx, q: Question, a: ExtraAnswer | null): void;
  /** A tap on the map while it asks to tap: what was tapped (null: nothing there). */
  tap(g: [number, number], q: Question): string | null;
  typed(text: string, q: Question): boolean;
  feedback(q: Question, a: ExtraAnswer): string;
  after(q: Question, a: ExtraAnswer): HTMLElement[];
  placeholder(): string;
  /** The names offered while typing. */
  names(allowed: Map<string, Country>): string[];
  tapHint(): string;
  /** Once answered, where the map goes. */
  reveal(q: Question): void;
  /** The names hidden on the map while it plays (the seas' for rivers, mountains and seas). */
  hide?: { seas?: boolean };
  /** "cities", "ciudades": what its cards are. */
  noun(): string;
}

const card = (id: string, ct: string, fame: number, pop: number, near: string[] = []): Country => ({ id, a2: '', ct, fame, pop, cities: [], land: [], near, like: [] });
/** The options: the card and the nearest allowed, filled with others of its continent. */
function pickAmong(c: Country, allowed: Map<string, Country>, n: number, r: () => number): string[] {
  return shuffle([c.id, ...neighbours(c, allowed, n - 1, r)], r);
}

// ---- Outlines
export function outlinesDeck(x: Ctx): ExtraDeck {
  const name = (id: string) => x.country(id);
  return {
    id: 'outlines',
    async load() { return x.countries()?.countries ?? null; },
    has: (id) => !!x.countries()?.countries.some((c) => c.id === id),
    name,
    question(c, step, allowed, r) { return { deck: 'outlines', id: c.id, step, reverse: false, ...(step === 'pick' ? { options: pickAmong(c, allowed, 4, r) } : {}) }; },
    prompt: (q) => (q.step === 'tap' ? L('Tap this country on the map', 'Toca este país en el mapa') : q.step === 'type' ? L('Which country has this shape? Type its name.', '¿Qué país tiene esta silueta? Escribe su nombre.') : L('Which country has this shape?', '¿Qué país tiene esta silueta?')),
    optionLabel: name,
    right: (q) => q.id,
    isRight: (q, v) => v === q.id,
    visual(q) { return shapeCanvas(x.app, q.id, 220); },
    frame(q) {
      if (q.step !== 'tap') return;
      const c = x.countries()?.countries.find((k) => k.id === q.id);
      const meta = x.app.data.meta;
      const at = (id: string): [number, number] | null => (meta[id] ? [meta[id].lx, meta[id].ly] : null);
      x.fit([at(q.id), ...[...(c?.land ?? []), ...(c?.near ?? [])].slice(0, 4).map(at)].filter((p): p is [number, number] => !!p), 8);
    },
    draw(rc, q, a) {
      if (!a) return;
      rc.fillCountry(q.id, a.ok ? 'rgba(46,204,113,0.5)' : 'rgba(255,196,60,0.45)');
      rc.strokeCountry(q.id, a.ok ? '#2ecc71' : '#ffc83c', 2.4);
      if (!a.ok && a.given && a.given !== q.id && q.step === 'tap') rc.fillCountry(a.given, 'rgba(255,107,107,0.55)');
    },
    tap: (g) => pickCountry(x.app, g, (x.countries()?.countries ?? []).map((c) => c.id)),
    typed(text, q) { return x.matchCountry(text) === q.id || typedRight(text, [x.app.data.meta[q.id]?.n ?? '', x.app.data.meta[q.id]?.es ?? '']); },
    feedback(q, a) {
      const n = name(q.id);
      if (a.peek) return `👀 ${n}`;
      if (a.ok) return `✅ ${n}`;
      return `❌ ${a.given && a.given !== q.id && q.step !== 'type' ? L(`That is ${name(a.given)}. It is ${n}.`, `Ese es ${name(a.given)}. Es ${n}.`) : L(`It is ${n}.`, `Es ${n}.`)}`;
    },
    after: () => [],
    placeholder: () => L('Type the country…', 'Escribe el país…'),
    names: (allowed) => [...allowed.keys()].map(name),
    tapHint: () => L('Tap it on the map.', 'Tócalo en el mapa.'),
    reveal(q) { x.app.flyToCountry(q.id, false); },
    noun: () => L('outlines', 'siluetas'),
  };
}

/** A country's shape alone on a small canvas (its largest piece and the ones near it, as the Outline game). */
export function shapeCanvas(app: App, id: string, size: number): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = size, hh = Math.round(size * 0.7);
  const cv = h('canvas', { class: 'outline-canvas mw-shape', 'data-master': 'shape', width: String(w * dpr), height: String(hh * dpr), style: `width:${w}px;height:${hh}px` }) as HTMLCanvasElement;
  const ctx = cv.getContext('2d');
  const f = app.data.best('50m').byId.get(id)?.feature ?? app.data.best('110m').byId.get(id)?.feature;
  if (!ctx || !f) return cv;
  ctx.scale(dpr, dpr);
  const body = mainBody(f as GeoJSON.Feature);
  const c = geoCentroid(body as never);
  const proj = geoAzimuthalEqualArea().rotate([-c[0], -c[1]]).fitExtent([[10, 10], [w - 10, hh - 10]], body as never);
  const path = geoPath(proj, ctx);
  ctx.beginPath(); path(f as never); ctx.fillStyle = '#5dade2'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  return cv;
}

// ---- Big cities
interface City { en: string; es: string; at: [number, number]; cc: string; cap: boolean; pop: number }
export function citiesDeck(x: Ctx): ExtraDeck {
  const by = new Map<string, City>();
  const cards: { core?: Country[]; hard?: Country[] } = {};
  const core = new Set<string>();
  const name = (id: string) => { const c = by.get(id); return c ? (es() ? c.es : c.en) : id; };
  const at = (id: string) => by.get(id)?.at;
  const dot = (rc: RenderCtx, p: [number, number], fill: string, r = 6.5) => {
    const pt = rc.project(p[0], p[1]);
    if (!pt) return null;
    rc.ctx.beginPath(); rc.ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2); rc.ctx.fillStyle = fill; rc.ctx.fill();
    rc.ctx.lineWidth = 2.5; rc.ctx.strokeStyle = 'rgba(10,20,35,0.9)'; rc.ctx.stroke();
    return pt;
  };
  return {
    id: 'cities',
    async load(hard = false) {
      const k = hard ? 'hard' : 'core';
      if (cards[k]) return cards[k]!;
      const d = await loadJSON<{ cities: [string, string, string | 0, number, number, string, string, number, number, number, string[], number?][] }>(hard ? 'master/cities-hard.json' : 'master/cities.json').catch(() => null);
      if (!d) return null;
      cards[k] = d.cities.map(([id, en, nes, lon, lat, cc, ct, pop, cap, sl, near, isCore]) => {
        by.set(id, { en, es: nes || en, at: [lon, lat], cc, cap: cap === 1, pop });
        if (!hard || isCore) core.add(id);
        return card(id, ct, sl, pop, near);
      });
      return cards[k]!;
    },
    has: (id) => by.has(id),
    isCore: (id) => core.has(id),
    name,
    question(c, step, allowed, r) {
      // Its nearest big cities (of the region played), the ones it is picked or tapped among.
      const near = [...c.near.filter((n) => allowed.has(n)), ...neighbours(c, allowed, 6, r)].filter((v, i, a) => a.indexOf(v) === i && v !== c.id);
      if (step === 'pick') return { deck: 'cities', id: c.id, step, reverse: false, options: shuffle([c.id, ...near.slice(0, 3)], r) };
      return { deck: 'cities', id: c.id, step, reverse: false, cands: step === 'tap' ? shuffle([c.id, ...near.slice(0, 6)], r) : [c.id, ...near.slice(0, 3)] };
    },
    prompt: (q) => (q.step === 'tap' ? L(`Tap ${name(q.id)}`, `Toca ${name(q.id)}`) : q.step === 'type' ? L('Which city is this? Type its name.', '¿Qué ciudad es esta? Escribe su nombre.') : L('Which city is this?', '¿Qué ciudad es esta?')),
    optionLabel: name,
    right: (q) => q.id,
    isRight: (q, v) => v === q.id,
    visual: () => null,
    frame(q) {
      const pts = [q.id, ...(q.options ?? q.cands ?? [])].map(at).filter((p): p is [number, number] => !!p);
      x.fit(pts, 14);
    },
    draw(rc, q, a) {
      // The others first (white, while tapping or once answered), then the one asked (gold until answered).
      const others = (q.step === 'tap' ? q.cands ?? [] : a ? q.options ?? q.cands ?? [] : []).filter((v) => v !== q.id);
      for (const v of others) {
        const p = at(v);
        const pt = p && dot(rc, p, a && a.given === v && !a.ok ? '#ff6b6b' : '#ffffff', 6);
        if (pt && a) rc.labels.add({ text: name(v), x: pt[0] + 11, y: pt[1], align: 'left', priority: a.given === v ? 3100 : 2900, size: 12, weight: 650, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
      }
      const p = at(q.id);
      if (!p) return;
      if (q.step === 'tap' && !a) { dot(rc, p, '#ffffff', 6); return; }
      const pt = rc.project(p[0], p[1]);
      if (!pt) return;
      const t = (rc.now - (a?.at ?? 0)) / 1000;
      const pulse = 11 + 5 * (0.5 + 0.5 * Math.sin(rc.now / 300));
      rc.ctx.beginPath(); rc.ctx.arc(pt[0], pt[1], pulse, 0, Math.PI * 2); rc.ctx.lineWidth = 2; rc.ctx.strokeStyle = a ? (a.ok ? 'rgba(46,204,113,0.9)' : 'rgba(255,211,77,0.85)') : 'rgba(255,211,77,0.85)'; rc.ctx.stroke();
      dot(rc, p, a && a.ok ? '#2ecc71' : '#ffd34d', 7.5);
      if (a) rc.labels.add({ text: name(q.id), x: pt[0] + 14, y: pt[1], align: 'left', priority: 3300, size: 14, weight: 800, color: '#ffd34d', halo: 'rgba(0,0,0,0.85)' });
      if (!a || t < 6) requestAnimationFrame(() => x.app.renderer.requestRender());
    },
    tap(g, q) {
      const view = x.app.renderer.view, tp = view.project(g[0], g[1]);
      if (!tp) return null;
      let best: string | null = null, bd = 34;
      for (const v of q.cands ?? []) {
        const p = at(v), pp = p && view.project(p[0], p[1]);
        const d = pp ? Math.hypot(pp[0] - tp[0], pp[1] - tp[1]) : Infinity;
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    },
    typed: (text, q) => { const c = by.get(q.id); return !!c && typedRight(text, [c.en, c.es]); },
    feedback(q, a) {
      const c = by.get(q.id), n = name(q.id), ctry = c ? x.country(c.cc) : '';
      if (a.peek) return `👀 ${n}, ${ctry}`;
      if (a.ok) return `✅ ${n} · ${ctry}`;
      return `❌ ${a.given && a.given !== q.id && q.step !== 'type' ? L(`That is ${name(a.given)}. `, `Esa es ${name(a.given)}. `) : ''}${L(`It is ${n}, ${ctry}.`, `Es ${n}, ${ctry}.`)}`;
    },
    after(q) {
      const c = by.get(q.id);
      if (!c) return [];
      const bits = [c.cap ? L(`The capital of ${x.country(c.cc)}`, `La capital de ${x.country(c.cc)}`) : '', c.pop ? L(`${fmtNumber(c.pop)} people`, `${fmtNumber(c.pop)} habitantes`) : ''].filter(Boolean);
      return bits.length ? [h('div', { class: 'tool-hint', 'data-master': 'about' }, bits.join(' · '))] : [];
    },
    placeholder: () => L('Type the city…', 'Escribe la ciudad…'),
    names: (allowed) => [...allowed.keys()].map(name),
    tapHint: () => L('Tap its dot on the map.', 'Toca su punto en el mapa.'),
    reveal() { /* the map is already there */ },
    noun: () => L('cities', 'ciudades'),
  };
}

// ---- Landmarks
interface Site { en: string; es: string; at: [number, number]; cc: string[]; kind: string; year: number; img: string }
export function landmarksDeck(x: Ctx): ExtraDeck {
  const by = new Map<string, Site>();
  const cards: { core?: Country[]; hard?: Country[] } = {};
  const core = new Set<string>();
  const site = (id: string) => { const s = by.get(id); return s ? (es() ? s.es : s.en) : id; };
  const countryCard = (id: string) => x.countries()?.countries.find((c) => c.id === id);
  const all = () => new Map((x.countries()?.countries ?? []).filter((c) => !c.t).map((c) => [c.id, c]));
  return {
    id: 'landmarks',
    async load(hard = false) {
      const k = hard ? 'hard' : 'core';
      if (cards[k]) return cards[k]!;
      const d = await loadJSON<{ sites: [string, string, string | 0, number, number, string[], string, string, number, string, number, number?][] }>(hard ? 'master/landmarks-hard.json' : 'master/landmarks.json').catch(() => null);
      if (!d) return null;
      cards[k] = d.sites.map(([id, en, nes, lon, lat, cc, ct, kind, year, img, sl, isCore]) => {
        by.set(id, { en, es: nes || en, at: [lon, lat], cc, kind, year, img });
        if (!hard || isCore) core.add(id);
        return card(id, ct, sl, sl);
      });
      return cards[k]!;
    },
    has: (id) => by.has(id),
    isCore: (id) => core.has(id),
    name: site,
    question(c, step, _allowed, r) {
      const s = by.get(c.id)!;
      if (step !== 'pick') return { deck: 'landmarks', id: c.id, step, reverse: false };
      // Its country among three of its neighbours (none of its own other countries).
      const home = countryCard(s.cc[0]);
      const pool = new Map([...all()].filter(([id]) => !s.cc.includes(id) || id === s.cc[0]));
      const others = home ? neighbours(home, pool, 3, r).filter((id) => !s.cc.includes(id)) : [];
      return { deck: 'landmarks', id: c.id, step, reverse: false, options: shuffle([s.cc[0], ...others.slice(0, 3)], r) };
    },
    prompt(q) {
      const n = site(q.id);
      return q.step === 'tap' ? L(`Tap the country of ${n}`, `Toca el país de ${n}`) : q.step === 'type' ? L(`${n}: type its country`, `${n}: escribe su país`) : L(`${n}: in which country?`, `${n}: ¿en qué país está?`);
    },
    optionLabel: (v) => x.country(v),
    right: (q) => by.get(q.id)?.cc[0] ?? '',
    isRight: (q, v) => !!by.get(q.id)?.cc.includes(v),
    visual(q, answered) {
      const s = by.get(q.id);
      if (!s) return null;
      const img = h('img', { class: 'mw-photo', src: commons(s.img, 480), alt: site(q.id), loading: 'eager', 'data-master': 'photo' }) as HTMLImageElement;
      img.addEventListener('error', () => img.classList.add('mw-photo-none'));
      const fig = h('figure', { class: 'mw-photo-fig' }, img);
      if (answered) {
        // The picture's credit, read from Commons.
        const cap = h('figcaption', { class: 'mw-credit' }, h('a', { href: commonsPage(s.img), target: '_blank', rel: 'noopener' }, L('Picture: Wikimedia Commons', 'Imagen: Wikimedia Commons')));
        fig.append(cap);
        void commonsCredit(s.img).then((c) => { if (c) cap.firstElementChild!.textContent = `${c.author ? `${c.author} · ` : ''}${c.licence} · Wikimedia Commons`; });
      }
      return fig;
    },
    frame(q) {
      if (q.step !== 'tap') return;
      // Its part of the world, its country among others.
      const s = by.get(q.id), home = s && countryCard(s.cc[0]);
      const meta = x.app.data.meta;
      const pts = [s?.cc[0], ...(home ? [...home.land, ...home.near].slice(0, 6) : [])].map((id) => (id && meta[id] ? [meta[id].lx, meta[id].ly] as [number, number] : null)).filter((p): p is [number, number] => !!p);
      x.fit(pts, 6);
    },
    draw(rc, q, a) {
      if (!a) return;
      const s = by.get(q.id);
      if (!s) return;
      for (const c of s.cc) { rc.fillCountry(c, a.ok ? 'rgba(46,204,113,0.45)' : 'rgba(255,196,60,0.42)'); rc.strokeCountry(c, a.ok ? '#2ecc71' : '#ffc83c', 2.2); }
      if (!a.ok && a.given && !s.cc.includes(a.given)) rc.fillCountry(a.given, 'rgba(255,107,107,0.55)');
      const pt = rc.project(s.at[0], s.at[1]);
      if (pt) {
        star(rc.ctx, pt[0], pt[1], 9);
        rc.labels.add({ text: site(q.id), x: pt[0] + 13, y: pt[1], align: 'left', priority: 3300, size: 13, weight: 800, color: '#ffd34d', halo: 'rgba(0,0,0,0.85)' });
      }
    },
    tap: (g) => pickCountry(x.app, g, all().keys()),
    typed(text, q) {
      const s = by.get(q.id);
      if (!s) return false;
      const m = x.matchCountry(text);
      return (!!m && s.cc.includes(m)) || typedRight(text, s.cc.flatMap((c) => [x.app.data.meta[c]?.n ?? '', x.app.data.meta[c]?.es ?? '']));
    },
    feedback(q, a) {
      const s = by.get(q.id), where = s ? s.cc.map(x.country).join(L(' and ', ' y ')) : '';
      if (a.peek) return `👀 ${site(q.id)} · ${where}`;
      if (a.ok) return `✅ ${site(q.id)} · ${where}`;
      return `❌ ${a.given && q.step !== 'type' && x.app.data.meta[a.given] ? L(`Not ${x.country(a.given)}: `, `No es ${x.country(a.given)}: `) : ''}${L(`it is in ${where}.`, `está en ${where}.`)}`;
    },
    after(q) {
      const s = by.get(q.id);
      if (!s) return [];
      const kind = s.kind === 'n' ? L('natural', 'natural') : s.kind === 'm' ? L('mixed', 'mixto') : L('cultural', 'cultural');
      return [h('div', { class: 'tool-hint', 'data-master': 'about' }, L(`A World Heritage site since ${s.year} (${kind})`, `Patrimonio de la Humanidad desde ${s.year} (${kind})`))];
    },
    placeholder: () => L('Type the country…', 'Escribe el país…'),
    names: () => [...all().keys()].map(x.country),
    tapHint: () => L('Tap the country on the map.', 'Toca el país en el mapa.'),
    reveal(q) { const s = by.get(q.id); if (s) x.fit([s.at], 5); },
    noun: () => L('landmarks', 'maravillas'),
  };
}

// ---- Rivers, mountains and seas
export type NatureKind = 'river' | 'lake' | 'range' | 'desert' | 'peak' | 'ocean' | 'sea' | 'gulf' | 'bay' | 'strait' | 'channel';
/** "Which river is this?" by kind. */
const KIND_Q: Record<NatureKind, [string, string]> = {
  river: ['Which river is this?', '¿Qué río es este?'], lake: ['Which lake is this?', '¿Qué lago es este?'],
  range: ['Which mountain range is this?', '¿Qué cordillera es esta?'], desert: ['Which desert is this?', '¿Qué desierto es este?'],
  peak: ['Which mountain is this?', '¿Qué montaña es esta?'], ocean: ['Which ocean is this?', '¿Qué océano es este?'],
  sea: ['Which sea is this?', '¿Qué mar es este?'], gulf: ['Which gulf is this?', '¿Qué golfo es este?'],
  bay: ['Which bay is this?', '¿Qué bahía es esta?'], strait: ['Which strait is this?', '¿Qué estrecho es este?'],
  channel: ['Which channel is this?', '¿Qué canal es este?'],
};
export const KIND_NAME: Record<NatureKind, [string, string]> = {
  river: ['A river', 'Un río'], lake: ['A lake', 'Un lago'], range: ['A mountain range', 'Una cordillera'], desert: ['A desert', 'Un desierto'],
  peak: ['A mountain', 'Una montaña'], ocean: ['An ocean', 'Un océano'], sea: ['A sea', 'Un mar'], gulf: ['A gulf', 'Un golfo'],
  bay: ['A bay', 'Una bahía'], strait: ['A strait', 'Un estrecho'], channel: ['A channel', 'Un canal'],
};
/** The words a typed name may leave out ("Amazon" for "Amazon River", "Danubio" for "Río Danubio"). */
const GENERIC = /\b(river|lake|mount|mountains|range|desert|sea|ocean|gulf|bay|strait|channel|of|the|r[ií]o|lago|monte|montes|monta[nñ]as|cordillera|desierto|mar|oc[eé]ano|golfo|bah[ií]a|estrecho|canal|de|del|la|las|los|el)\b/gi;
interface Place { kind: NatureKind; en: string; es: string; at: [number, number]; cc: string[]; f: GeoJSON.Feature | null }
export function natureDeck(x: Ctx): ExtraDeck {
  const by = new Map<string, Place>();
  let cards: Country[] | null = null;
  const name = (id: string) => { const p = by.get(id); return p ? (es() ? p.es : p.en) : id; };
  const line = (p: Place) => !!p.f && /Line/.test(p.f.geometry.type);
  const box = (p: Place): [number, number][] => { if (!p.f) return [p.at]; const [[w, s], [e, n]] = geoBounds(p.f); return [[w, s], [e, n], p.at]; };
  /** One place drawn: a river as a line, a peak as a triangle, the rest as filled shapes. */
  const paint = (rc: RenderCtx, p: Place, fill: string, stroke: string, glow = false) => {
    const { ctx, path } = rc;
    if (p.kind === 'peak' || !p.f) {
      const pt = rc.project(p.at[0], p.at[1]);
      if (!pt) return;
      ctx.beginPath(); ctx.moveTo(pt[0], pt[1] - 10); ctx.lineTo(pt[0] + 9, pt[1] + 7); ctx.lineTo(pt[0] - 9, pt[1] + 7); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,20,35,0.9)'; ctx.stroke();
      return;
    }
    ctx.beginPath(); path(p.f as never);
    if (line(p)) {
      if (glow) { ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.stroke(); }
      ctx.lineWidth = glow ? 4.5 : 3; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    } else {
      ctx.fillStyle = fill; ctx.fill();
      ctx.lineWidth = glow ? 2.6 : 1.6; ctx.strokeStyle = stroke; ctx.stroke();
    }
  };
  const label = (rc: RenderCtx, p: Place, text: string, color: string, priority: number) => {
    const at = p.f && !line(p) && p.kind !== 'peak' ? p.at : p.at;
    const pt = rc.project(at[0], at[1]);
    if (pt) rc.labels.add({ text, x: pt[0], y: pt[1] - (p.kind === 'peak' ? 16 : 0), priority, size: 13, weight: 800, color, halo: 'rgba(0,0,0,0.85)' });
  };
  return {
    id: 'nature',
    hide: { seas: true },
    async load() {
      if (cards) return cards;
      const d = await loadJSON<{ items: [NatureKind, string, string | 0, number, number, string[], string, number, number, number[]][]; shapes: Topology }>('master/nature.json').catch(() => null);
      if (!d) return null;
      const shapes = new Map<number, GeoJSON.Feature>();
      for (const obj of Object.values(d.shapes.objects)) {
        const fc = topoFeature(d.shapes, obj as GeometryObject) as unknown as GeoJSON.FeatureCollection;
        for (const f of fc.features) shapes.set((f.properties as { i: number }).i, f);
      }
      cards = d.items.map(([kind, en, nes, lon, lat, cc, ct, fame, shape, near], i) => {
        const id = `n${i}`;
        by.set(id, { kind, en, es: nes || en, at: [lon, lat], cc, f: shape >= 0 ? shapes.get(shape) ?? null : null });
        return card(id, ct, fame, fame, near.map((k) => `n${k}`));
      });
      return cards;
    },
    has: (id) => by.has(id),
    name,
    question(c, step, allowed, r) {
      // Among the nearest of its kind (the region played's first, then the world's).
      const kindOf = (id: string) => { const k = by.get(id)?.kind; return k && ['ocean', 'sea', 'gulf', 'bay', 'strait', 'channel'].includes(k) ? 'water' : k; };
      const mine = kindOf(c.id);
      const near = [...c.near.filter((n) => allowed.has(n)), ...c.near, ...[...by.keys()].filter((k) => k !== c.id && kindOf(k) === mine)].filter((v, i, a) => a.indexOf(v) === i && v !== c.id && kindOf(v) === mine);
      if (step === 'pick') return { deck: 'nature', id: c.id, step, reverse: false, options: shuffle([c.id, ...near.slice(0, 3)], r) };
      return { deck: 'nature', id: c.id, step, reverse: false, cands: step === 'tap' ? shuffle([c.id, ...near.slice(0, 4)], r) : [c.id] };
    },
    prompt(q) {
      const p = by.get(q.id);
      if (!p) return '';
      if (q.step === 'tap') return L(`Tap “${name(q.id)}”`, `Toca «${name(q.id)}»`);
      const k = KIND_Q[p.kind];
      return q.step === 'type' ? `${L(k[0], k[1])} ${L('Type its name.', 'Escribe su nombre.')}` : L(k[0], k[1]);
    },
    optionLabel: name,
    right: (q) => q.id,
    isRight: (q, v) => v === q.id,
    visual: () => null,
    frame(q) {
      const p = by.get(q.id);
      if (!p) return;
      const pts: [number, number][] = [...box(p), ...(q.step === 'tap' ? (q.cands ?? []).flatMap((v) => { const o = by.get(v); return o ? [o.at] : []; }) : [])];
      x.fit(pts, p.kind === 'peak' ? 10 : 9);
    },
    draw(rc, q, a) {
      const dark = rc.theme.dark;
      const white = dark ? 'rgba(235,240,248,0.92)' : 'rgba(255,255,255,0.95)';
      const whiteFill = dark ? 'rgba(235,240,248,0.28)' : 'rgba(255,255,255,0.45)';
      const p = by.get(q.id);
      if (!p) return;
      // While tapping (and after), the others of its kind in white; the one picked by mistake in red.
      if (q.step === 'tap') for (const v of q.cands ?? []) {
        if (v === q.id && !a) { paint(rc, p, whiteFill, white); continue; }
        if (v === q.id) continue;
        const o = by.get(v);
        if (!o) continue;
        const bad = a && a.given === v && !a.ok;
        paint(rc, o, bad ? 'rgba(255,107,107,0.5)' : whiteFill, bad ? '#ff6b6b' : white);
        if (a) label(rc, o, name(v), bad ? '#ffb3b3' : '#fff', bad ? 3100 : 2800);
      }
      if (q.step === 'tap' && !a) return;
      const gold = a ? (a.ok ? '#2ecc71' : '#ffc83c') : '#ffd34d';
      paint(rc, p, a ? (a.ok ? 'rgba(46,204,113,0.45)' : 'rgba(255,196,60,0.42)') : 'rgba(255,211,77,0.42)', gold, true);
      if (a) {
        label(rc, p, name(q.id), '#ffd34d', 3300);
        if (q.step === 'pick' && !a.ok && a.given) { const o = by.get(a.given); if (o) { paint(rc, o, 'rgba(255,107,107,0.4)', '#ff6b6b'); label(rc, o, name(a.given), '#ffb3b3', 3100); } }
      }
    },
    tap(g, q) {
      const view = x.app.renderer.view, tp = view.project(g[0], g[1]);
      if (!tp) return null;
      let best: string | null = null, bd = 26;
      for (const v of q.cands ?? []) {
        const p = by.get(v);
        if (!p) continue;
        let d = Infinity;
        if (p.kind === 'peak' || !p.f) { const pp = view.project(p.at[0], p.at[1]); d = pp ? Math.hypot(pp[0] - tp[0], pp[1] - tp[1]) : Infinity; }
        else if (line(p)) d = lineDistance(p.f.geometry as GeoJSON.MultiLineString | GeoJSON.LineString, tp, view);
        else if (geoContains(p.f, g)) d = 0;
        else { const pp = view.project(p.at[0], p.at[1]); d = pp ? Math.hypot(pp[0] - tp[0], pp[1] - tp[1]) : Infinity; }
        // (Inside a lake or sea counts as on it: the nearest wins.)
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    },
    typed(text, q) {
      const p = by.get(q.id);
      if (!p) return false;
      const bare = (s: string) => s.replace(GENERIC, ' ').replace(/\s+/g, ' ').trim();
      return typedRight(text, [p.en, p.es, bare(p.en), bare(p.es)].filter((s) => s.length >= 2));
    },
    feedback(q, a) {
      const n = name(q.id);
      if (a.peek) return `👀 ${n}`;
      if (a.ok) return `✅ ${n}`;
      return `❌ ${a.given && a.given !== q.id && q.step !== 'type' && by.has(a.given) ? L(`That is ${name(a.given)}. `, `Ese es ${name(a.given)}. `) : ''}${L(`It is ${n}.`, `Es ${n}.`)}`;
    },
    after(q) {
      const p = by.get(q.id);
      if (!p) return [];
      const k = KIND_NAME[p.kind];
      // Its countries (three at most: the Sahara's are fifteen).
      const where = p.cc.slice(0, 3).map(x.country).join(', ') + (p.cc.length > 3 ? '…' : '');
      return [h('div', { class: 'tool-hint', 'data-master': 'about' }, `${L(k[0], k[1])}${where ? ` · ${where}` : ''}`)];
    },
    placeholder: () => L('Type its name…', 'Escribe su nombre…'),
    names: (allowed) => [...allowed.keys()].map(name),
    tapHint: () => L('Tap it on the map.', 'Tócalo en el mapa.'),
    reveal() { /* the map is already there */ },
    noun: () => L('places', 'lugares'),
  };
}

/** How far a tap (screen point) is from a line, in pixels. */
function lineDistance(g: GeoJSON.MultiLineString | GeoJSON.LineString, tp: [number, number], view: App['renderer']['view']): number {
  const lines = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
  let m = Infinity;
  for (const l of lines) {
    let prev: [number, number] | null = null;
    for (const c of l) {
      const p = view.project(c[0], c[1]);
      if (p && prev) {
        const [ax, ay] = prev, [bx, by] = p, dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((tp[0] - ax) * dx + (tp[1] - ay) * dy) / (dx * dx + dy * dy || 1)));
        m = Math.min(m, Math.hypot(ax + t * dx - tp[0], ay + t * dy - tp[1]));
      }
      prev = p;
    }
  }
  return m;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
  ctx.closePath();
  ctx.fillStyle = '#ffd34d'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#5a3d00'; ctx.stroke();
}
