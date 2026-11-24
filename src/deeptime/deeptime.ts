// Deep time (v0.45.0): Explore → Deep time. One timeline from the Earth's first days to today on the globe, joined
// with the plate model ("Pangea to today", which it replaces): the continents move, the planet's look changes (a
// magma ocean, an orange haze, rusty bare land, Snowball Earths, ice caps, green land), the great eruptions glow
// where they happened, the asteroid strikes, and past species appear at their fossil sites while they lived. At any
// moment: the eon, era and period, the Earth's vital signs with a plain "could you survive here?", and what lived
// then. "Play the story" flies through it with a narration that waits for the voice (or for time to read).
// v0.46.0 adds the chapter before: from the Big Bang to the Earth and the Moon, drawn as a scene (cosmos.ts) with
// the universe's own vital signs, and "Big Bang to today", the two chapters joined.
// The parts that need no page are in logic.ts (scripts/test/deeptime.mjs).
import { Hourglass, Clapperboard, Scale, Layers, SkipForward, SkipBack, Square, Pause, Play, Volume2, VolumeX, Orbit, Sparkles } from 'lucide';
import { geoCircle } from 'd3-geo';
import { h, icon, clear } from '../ui/dom';
import { L, Lc, tx, lang, fmtNumber, appLocale, wikiHref } from '../app/i18n';
import { TimeBar } from '../ui/timebar';
import { loadJSON } from '../data/store';
import { loadPaleo, unitName, PALEO_MAX_MA, type PaleoWorld, type Unit } from '../modes/paleo';
import { wikiThumb } from '../modes/stories';
import { speak, stopSpeaking, narrationOn, setNarrationOn, canSpeak } from '../ui/narrator';
import { recordSeen } from '../learn/progress';
import {
  vitalsAt, survival, aliveAt, eventsAt, ago, cosmicDate, shareSince, look, crust, readingTime, EARTH_MA, BIG_BANG_MA,
  tAt, posOfT, sinceBang, maOfT, tOf, chapterFor, afterBang, scaleFactor, spaceTemp, cosmicEra, cosmicSurvival, COSMIC_ERAS, COSMOS_END,
  type DeepData, type Species, type DEvent, type Beat, type Scale as TimeScale, type Vitals, type Level, type Chapter, type CosmicEra,
} from './logic';
import { CosmosScene } from './cosmos';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef, RenderCtx, InfoRow } from '../layers/types';

type Pt = [number, number];
/** The words for a survival reason. */
const REASON: Record<string, () => string> = {
  molten: () => L('The surface is molten rock.', 'La superficie es roca fundida.'),
  'no-oxygen': () => L('There is almost no oxygen: you would pass out in a minute.', 'Casi no hay oxígeno: te desmayarías en un minuto.'),
  'thin-oxygen': () => L('Oxygen is thin, like the top of a high mountain.', 'El oxígeno es escaso, como en la cima de una montaña alta.'),
  'rich-oxygen': () => L('The air is richer in oxygen than today: fires burn fiercely.', 'El aire tiene más oxígeno que hoy: los incendios arden con furia.'),
  'co2-deadly': () => L('So much carbon dioxide that breathing it would kill you.', 'Tanto dióxido de carbono que respirarlo te mataría.'),
  'co2-high': () => L('Carbon dioxide would give you headaches and leave you panting.', 'El dióxido de carbono te daría dolor de cabeza y te dejaría jadeando.'),
  'co2-stuffy': () => L('The air would feel stuffy (high carbon dioxide).', 'El aire se sentiría cargado (mucho dióxido de carbono).'),
  snowball: () => L('The whole planet is frozen.', 'Todo el planeta está congelado.'),
  'too-hot': () => L('Deadly heat across much of the world.', 'Calor mortal en buena parte del mundo.'),
  hot: () => L('A hothouse: dangerously hot near the equator.', 'Un invernadero: un calor peligroso cerca del ecuador.'),
  warm: () => L('Warmer than today, with no ice at the poles.', 'Más cálido que hoy, sin hielo en los polos.'),
  cold: () => L('Colder than today.', 'Más frío que hoy.'),
  'no-ozone': () => L('No ozone layer: the Sun would burn your skin in minutes.', 'Sin capa de ozono: el Sol te quemaría la piel en minutos.'),
  'thin-ozone': () => L('A thin ozone layer: strong sunburn.', 'Una capa de ozono delgada: quemaduras fuertes.'),
  'no-earth': () => L('There is no Earth yet: nothing to stand on and no air to breathe.', 'Aún no hay Tierra: nada que pisar y nada de aire que respirar.'),
  opaque: () => L('The universe is a glowing fog: light cannot get through it.', 'El universo es una niebla brillante: la luz no puede atravesarla.'),
  'scorching-space': () => L('Space itself is hotter than an oven.', 'El propio espacio está más caliente que un horno.'),
  'warm-space': () => L('Space itself is as warm as a summer’s day, but there is still nothing to breathe.', 'El propio espacio está tibio como un día de verano, pero aún no hay nada que respirar.'),
  dark: () => L('No stars yet: complete darkness.', 'Aún no hay estrellas: oscuridad total.'),
};
/** The universe's eras, as the bar and the top line name them. */
const ERA: Record<CosmicEra, () => string> = {
  bang: () => L('The first second', 'El primer segundo'),
  plasma: () => L('The glowing fog', 'La niebla brillante'),
  dark: () => L('The dark ages', 'La edad oscura'),
  stars: () => L('The first stars', 'Las primeras estrellas'),
  galaxies: () => L('Galaxies', 'Galaxias'),
  milkyway: () => L('The Milky Way', 'La Vía Láctea'),
  nebula: () => L('The Sun’s cloud', 'La nube del Sol'),
  disc: () => L('The Sun and its planets', 'El Sol y sus planetas'),
  earth: () => L('The Earth and the Moon', 'La Tierra y la Luna'),
};
const CHAPTER: Record<Chapter, () => string> = {
  cosmos: () => L('From the Big Bang', 'Desde el Big Bang'),
  earth: () => L('The story of life', 'La historia de la vida'),
  all: () => L('Big Bang to today', 'Del Big Bang a hoy'),
};
const CHAPTER_ICON: Record<Chapter, string> = { cosmos: '🌌', earth: '🌍', all: '✨' };
const sup = (n: number) => String(n).replace(/[-0-9]/g, (c) => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
/** How long after the Big Bang, in words ("3 minutes after the Big Bang"). */
export function afterText(t: number): string {
  const a = afterBang(t);
  if (a.unit === 'bang') return L('The Big Bang', 'El Big Bang');
  if (a.unit === 'tiny') return L('10{0} seconds after the Big Bang', '10{0} segundos después del Big Bang', sup(a.exp ?? 0));
  if (a.unit === 'seconds') return L('{0} seconds after the Big Bang', '{0} segundos después del Big Bang', fmtNumber(a.n, a.n < 10 ? 2 : 0));
  if (a.unit === 'minutes') return L('{0} minutes after the Big Bang', '{0} minutos después del Big Bang', fmtNumber(a.n));
  if (a.unit === 'years') return L('{0} years after the Big Bang', '{0} años después del Big Bang', fmtNumber(a.n, a.n < 10 ? 1 : 0));
  if (a.unit === 'thousand') return L('{0} thousand years after the Big Bang', '{0} mil años después del Big Bang', fmtNumber(a.n));
  if (a.unit === 'million') return L('{0} million years after the Big Bang', '{0} millones de años después del Big Bang', fmtNumber(a.n));
  return L('{0} billion years after the Big Bang', '{0} mil millones de años después del Big Bang', fmtNumber(a.n, 2));
}
/** The universe's age at `t` ("3 minutes", "9.2 billion years"). */
function ageText(t: number): string {
  const a = afterBang(t);
  if (a.unit === 'bang') return L('Zero', 'Cero');
  if (a.unit === 'tiny') return `10${sup(a.exp ?? 0)} s`;
  if (a.unit === 'seconds') return `${fmtNumber(a.n, a.n < 10 ? 2 : 0)} s`;
  if (a.unit === 'minutes') return L('{0} minutes', '{0} minutos', fmtNumber(a.n));
  if (a.unit === 'years') return L('{0} years', '{0} años', fmtNumber(a.n, a.n < 10 ? 1 : 0));
  if (a.unit === 'thousand') return L('{0} thousand years', '{0} mil años', fmtNumber(a.n));
  if (a.unit === 'million') return L('{0} million years', '{0} millones de años', fmtNumber(a.n));
  return L('{0} billion years', '{0} mil millones de años', fmtNumber(a.n, 2));
}
/** A moment in words: after the Big Bang in its first million years, how long ago after that. */
export const whenText = (t: number) => (t < 1e6 ? afterText(t) : agoText(maOfT(t)));
/** A temperature from kelvin, in degrees Celsius people can read (10²⁷ °C, 3 billion °C, 2,700 °C, −270 °C). */
function heatText(k: number): string {
  if (!Number.isFinite(k)) return '—';
  if (k >= 1e12) return `10${sup(Math.round(Math.log10(k)))} °C`;
  if (k >= 1e9) return L('{0} billion °C', '{0} mil millones de °C', fmtNumber(k / 1e9, k < 1e10 ? 1 : 0));
  if (k >= 1e6) return L('{0} million °C', '{0} millones de °C', fmtNumber(k / 1e6, k < 1e7 ? 1 : 0));
  const c = k - 273.15;
  return `${fmtNumber(Math.abs(c) >= 100 ? Math.round(c / 10) * 10 : Math.round(c))} °C`;
}
const VERDICT: Record<Level, () => string> = {
  ok: () => L('Could you survive here? Yes', '¿Podrías sobrevivir aquí? Sí'),
  hard: () => L('Could you survive here? Barely', '¿Podrías sobrevivir aquí? A duras penas'),
  no: () => L('Could you survive here? No', '¿Podrías sobrevivir aquí? No'),
};
const LIFE: Record<string, () => string> = {
  sea: () => L('In the sea', 'En el mar'), fresh: () => L('In rivers and lakes', 'En ríos y lagos'), shore: () => L('On the shore', 'En la costa'),
  land: () => L('On land', 'En tierra'), air: () => L('In the air', 'En el aire'),
};
const DIET: Record<string, () => string> = {
  meat: () => L('Meat', 'Carne'), plants: () => L('Plants', 'Plantas'), both: () => L('Plants and meat', 'Plantas y carne'),
  filter: () => L('Filtered food from the water', 'Filtraba comida del agua'), small: () => L('Insects and small prey', 'Insectos y presas pequeñas'),
  light: () => L('Sunlight (photosynthesis)', 'Luz del sol (fotosíntesis)'), chem: () => L('Chemicals (no sunlight)', 'Sustancias químicas (sin luz)'),
  fish: () => L('Fish', 'Peces'),
};

/** How long ago, in words. */
export function agoText(ma: number): string {
  const a = ago(ma);
  if (a.unit === 'today') return L('Today', 'Hoy');
  if (a.unit === 'billion') return L('{0} billion years ago', 'Hace {0} mil millones de años', fmtNumber(a.n, 2));
  if (a.unit === 'million') return L('{0} million years ago', 'Hace {0} millones de años', fmtNumber(a.n, a.n < 10 ? 1 : 0));
  if (a.unit === 'thousand') return L('{0} thousand years ago', 'Hace {0} mil años', fmtNumber(a.n));
  return Lc('deep time', '{0} years ago', 'Hace {0} años', fmtNumber(a.n));
}
/** "2 September, 14:05": where a moment falls on the cosmic calendar. */
function cosmicText(ma: number): string {
  const d = cosmicDate(ma);
  const day = new Intl.DateTimeFormat(appLocale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, d.month, d.day)));
  const late = d.month === 11 && d.day === 31;
  const time = `${String(d.h).padStart(2, '0')}:${String(d.m).padStart(2, '0')}${late ? `:${String(d.s).padStart(2, '0')}` : ''}`;
  return `${day}, ${time}`;
}
/** A seeded random number generator (mulberry32), for the early continents' shapes. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mixColour = (a: string, b: string, f: number) => {
  const p = (s: string, i: number) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * Math.max(0, Math.min(1, f))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

/** An animation under way (an impact), in real time. */
interface Anim { e: DEvent; t0: number }

export class DeepTime {
  readonly layer: LayerDef;
  private world: PaleoWorld | null = null;
  private data: DeepData | null = null;
  private species: Species[] = [];
  private ma = 250;
  /** The same moment in years after the Big Bang (precise in the first million years, where `ma` is not). */
  private t = sinceBang(250);
  private chapter: Chapter = 'earth';
  private scene: CosmosScene | null = null;
  private scale: TimeScale = 'story';
  private bar: TimeBar | null = null;
  private top: HTMLElement | null = null;
  private vitalsEl: HTMLElement | null = null;
  private caption: HTMLElement | null = null;
  private vitalsOpen = false;
  /** Continents only: no life, events, vital signs or planet look (the plain plate view). */
  private plain = false;
  private hits: { x: number; y: number; r: number; go: () => void }[] = [];
  private anims: Anim[] = [];
  private lastMa = this.ma;
  private player: { i: number; token: number; paused: boolean } | null = null;
  private token = 0;
  private protos: { lon: number; lat: number; r: number; jag: number[] }[] = [];
  /** Hooks main.ts sets: leave whatever mode is on. */
  leaveMode: () => Promise<void> = async () => {};

  constructor(private app: App, private shell: Shell) {
    const self = this;
    this.layer = {
      id: 'deeptime', category: 'earth', icon: '⏳', kind: 'fill', hidden: true,
      name: { en: 'Deep time', es: 'El tiempo profundo' },
      desc: { en: 'The Earth from its first days to today.', es: 'La Tierra desde sus primeros días hasta hoy.' },
      credit: 'Plate model: Merdith et al. (2021), CC BY 4.0; fossils: the Paleobiology Database (CC BY 4.0)',
      drawFill(rc) { self.drawPlanet(rc); },
      labels(rc) { if (self.world && self.ma <= PALEO_MAX_MA) self.world.labels(rc, self.ma, { big: 1500, small: 900 }); },
    };
    app.register([this.layer]);
    app.renderer.overlays.add((rc) => this.drawMarks(rc));
    // The search box finds past species and events ("T. rex", "Snowball Earth").
    shell.search.extra.push((q, score) => {
      if (!this.data) { void this.load().catch(() => {}); return []; }
      return this.find(q, score).map((x) => ({ kind: 'place' as const, lon: x.at[0], lat: x.at[1], label: x.label, icon: x.icon, score: x.s + 4, sub: x.sub, tag: `⏳ ${L('Deep time', 'El tiempo profundo')}`, pick: x.go }));
    });
    const r = seeded(20240521);
    for (let i = 0; i < 16; i++) this.protos.push({ lon: r() * 360 - 180, lat: Math.asin(r() * 1.6 - 0.8) * 57.3, r: 0.5 + r(), jag: Array.from({ length: 28 }, () => 0.75 + r() * 0.5) });
  }

  get active() { return this.app.mode === 'deeptime'; }
  get info() {
    return {
      active: this.active, ma: this.ma, t: this.t, chapter: this.chapter, scale: this.scale, plain: this.plain, loaded: !!this.data, species: this.species.length, events: this.data?.events.length ?? 0,
      hits: this.hits.length, anims: this.anims.length, playing: !!this.player && !this.player.paused, beat: this.player?.i ?? null, beats: this.beats().length,
      scene: !!this.scene?.visible, spots: this.scene?.spots.map((s) => s.id) ?? [],
    };
  }

  async load(): Promise<DeepData> {
    if (this.data) return this.data;
    const [d, s] = await Promise.all([loadJSON<DeepData>('deeptime/deeptime.json'), loadJSON<{ species: Species[] }>('deeptime/species.json')]);
    this.data = d;
    this.species = s.species;
    return d;
  }

  /** Opens Deep time at `ma` (Pangea, 250 million years ago, by default). */
  async enter(ma = 250, o: { plain?: boolean; chapter?: Chapter; t?: number } = {}) {
    const t = o.t ?? sinceBang(ma);
    if (this.active) { if (o.chapter && o.chapter !== this.chapter) this.setChapter(o.chapter, t); else this.setT(t); return; }
    await this.leaveMode();
    this.shell.toast(L('Loading deep time…', 'Cargando el tiempo profundo…'), 1500);
    const [world] = await Promise.all([loadPaleo(this.app), this.load()]);
    this.world = world;
    const app = this.app;
    this.saved = { stack: app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id), projection: app.projection };
    app.mode = 'deeptime';
    this.plain = !!o.plain;
    document.documentElement.classList.add('mode-time', 'mode-deeptime');
    app.select(null);
    app.renderer.baseMap = false;
    await app.setStack(['deeptime']);
    this.chapter = o.chapter ?? chapterFor(maOfT(t));
    this.t = this.clampT(t);
    this.ma = Math.max(0, maOfT(this.t));
    this.lastMa = this.ma;
    this.scene = new CosmosScene((id) => !!this.data?.events.some((e) => e.id === id), (k) => this.sceneWord(k), (id) => { const e = this.data?.events.find((x) => x.id === id); if (e) this.showEvent(e); });
    // Just above the map's canvases, under everything else on the page.
    const fg = app.root.querySelector('#fg');
    if (fg) fg.after(this.scene.el); else app.root.prepend(this.scene.el);
    this.buildBar();
    this.top = h('div', { class: 'dt-top glass', 'data-deeptime': 'top' });
    this.vitalsEl = h('div', { class: 'dt-vitals glass', 'data-deeptime': 'vitals' });
    this.vitalsEl.addEventListener('click', () => { this.vitalsOpen = !this.vitalsOpen; this.renderVitals(); });
    app.root.append(this.top, this.vitalsEl);
    app.renderer.keepOut.add(this.keepNames);
    window.addEventListener('resize', this.fitBar);
    this.renderHud();
    this.syncScene();
    if (this.chapter !== 'earth') recordSeen('deeptime', 'chapter:cosmos');
    if (app.renderer.view.current.kind === 'globe') app.renderer.view.flyTo({ lon: 15, lat: 10, zoom: 1 }, 1200);
    app.emit('mode', 'deeptime');
    app.renderer.requestRender();
  }
  private saved: { stack: string[]; projection: string } = { stack: [], projection: '' };
  /** The map's names keep off the panels over it: the top line, the vital signs and the story's caption. */
  private keepNames = () => this.app.renderer.boxesOf([this.top, this.vitalsEl, this.caption].filter((e): e is HTMLElement => !!e));

  async exit() {
    if (!this.active) return;
    this.stopStory();
    const app = this.app;
    this.bar?.destroy(); this.bar = null;
    this.top?.remove(); this.top = null;
    this.vitalsEl?.remove(); this.vitalsEl = null;
    this.caption?.remove(); this.caption = null;
    this.scene?.destroy(); this.scene = null;
    this.anims = [];
    app.renderer.view.insetBottom = 0;
    app.renderer.keepOut.delete(this.keepNames);
    window.removeEventListener('resize', this.fitBar);
    document.documentElement.style.removeProperty('--dt-bar-h');
    app.mode = null;
    document.documentElement.classList.remove('mode-time', 'mode-deeptime', 'dt-playing', 'dt-cosmos');
    app.renderer.baseMap = true;
    this.shell.card.hide();
    if (this.shell.sheet.isOpen('deeptime')) this.shell.sheet.close();
    await app.setStack(this.saved.stack.length ? this.saved.stack : ['political']);
    if (this.saved.projection && this.saved.projection !== app.projection) app.setProjection(this.saved.projection as never);
    app.emit('mode', null);
    app.save();
  }

  // ---- The time bar ------------------------------------------------------------------------------------------------

  private buildBar() {
    this.bar?.destroy();
    const units = this.world!.units;
    const sc = this.scale, ch = this.chapter;
    const pos = (ma: number) => posOfT(sinceBang(ma), sc, ch);
    const eons = units.filter((u) => u.rank === 'eon');
    const periods = units.filter((u) => u.rank === 'period');
    // The bands: the universe's eras before the Earth, the eons and (on the story scale) the periods after.
    const bands: { from: number; to: number; color: string; label?: string }[] = [];
    if (ch !== 'earth') {
      for (const [i, e] of COSMIC_ERAS.entries()) {
        const next = COSMIC_ERAS[i + 1]?.from ?? sinceBang(COSMOS_END);
        if (ch === 'all' && e.id === 'earth') continue;
        bands.push({ from: posOfT(e.from, sc, ch), to: posOfT(ch === 'all' && i === COSMIC_ERAS.length - 2 ? sinceBang(EARTH_MA) : next, sc, ch), color: e.color, label: ERA[e.id]() });
      }
    }
    if (ch !== 'cosmos') {
      for (const u of sc === 'story' ? [...eons.filter((x) => x.end >= 541), ...periods.filter((x) => x.start <= 541)] : eons) bands.push({ from: pos(Math.min(u.start, EARTH_MA)), to: pos(u.end), color: u.color, label: unitName(u) });
    }
    const ga = (m: number) => (m >= 1000 ? `${fmtNumber(m / 1000, m % 1000 ? 1 : 0)} Ga` : m ? `${m} Ma` : L('Today', 'Hoy'));
    const tickMa = ch === 'cosmos' ? (sc === 'story' ? [13000, 10000, 4600] : [12000, 10000, 8000, 6000]) : ch === 'all' ? (sc === 'story' ? [EARTH_MA, 1000, 252, 66, 0] : [10000, 5000, 0]) : sc === 'story' ? [4000, 2500, 1000, 541, 252, 66, 0] : [4000, 3000, 2000, 1000, 0];
    const ticks = tickMa.map((m) => ({ at: pos(m), label: ga(m) }));
    if (ch !== 'earth') ticks.unshift({ at: 0, label: L('Big Bang', 'Big Bang') });
    this.bar = new TimeBar({
      title: L('Deep time', 'El tiempo profundo'),
      format: (f) => whenText(tAt(f, this.scale, this.chapter)),
      // "From 4.54 Ga to today", in the ticks' units ("From 4.54 billion years ago" read "Desde Hace…" in Spanish).
      rangeFormat: (f) => {
        const t = tAt(f, this.scale, this.chapter), m = maOfT(t);
        if (t < 1e6) return `${fmtNumber(BIG_BANG_MA / 1000, 1)} Ga`;
        return m < 0.0005 ? L('today', 'hoy') : m < 1 ? `${fmtNumber(m * 1000, 0)} ka` : m < 1000 ? `${fmtNumber(m, m < 10 ? 1 : 0)} Ma` : `${fmtNumber(m / 1000, 2)} Ga`;
      },
      caption: (f) => this.captionAt(tAt(f, this.scale, this.chapter)),
      bands, ticks, start: 0, end: 1, pos: posOfT(this.t, sc, ch),
      rate: 0.012,
      onPos: (f) => this.onTime(tAt(f, this.scale, this.chapter)),
      onExit: () => void this.exit(),
      onList: () => this.openNow(),
      listLabel: L('What lived then', 'Qué vivía entonces'),
    });
    // The bar's own tools: the chapter, play the story, the scale, continents only.
    const tools = this.bar.el.querySelector('.tb-tools');
    const chapter = h('button', { type: 'button', class: 'icon-btn', 'data-deeptime': 'chapter', title: L('Chapter: {0}', 'Capítulo: {0}', CHAPTER[ch]()), 'aria-label': L('Chapter: {0}', 'Capítulo: {0}', CHAPTER[ch]()) }, icon(ch === 'earth' ? Orbit : Sparkles, 18));
    chapter.addEventListener('click', () => this.openChapters());
    const story = h('button', { type: 'button', class: 'pill sm', 'data-deeptime': 'story', title: L('Play the story, narrated', 'Reproducir la historia narrada') }, icon(Clapperboard, 16), h('span', { class: 'tb-list-label' }, L('Play the story', 'Reproducir la historia')));
    story.addEventListener('click', () => void this.playStory());
    const scale = h('button', { type: 'button', class: 'icon-btn', 'data-deeptime': 'scale', title: this.scale === 'story' ? L('True scale: every million years the same width', 'Escala real: cada millón de años del mismo ancho') : L('Story scale: more room for the busy recent past', 'Escala de historia: más espacio para el pasado reciente') }, icon(Scale, 18));
    scale.addEventListener('click', () => { this.scale = this.scale === 'story' ? 'true' : 'story'; this.buildBar(); this.shell.toast(this.scale === 'true' ? L('True scale: see how little of the time is ours', 'Escala real: mira qué poco del tiempo es nuestro') : L('Story scale', 'Escala de historia'), 2500); });
    const plain = h('button', { type: 'button', class: `icon-btn${this.plain ? ' on' : ''}`, 'data-deeptime': 'plain', title: L('Continents only', 'Solo continentes'), 'aria-pressed': String(this.plain), hidden: ch === 'cosmos' }, icon(Layers, 18));
    plain.addEventListener('click', () => { this.plain = !this.plain; this.buildBar(); this.renderHud(); this.app.renderer.requestRender(); });
    tools?.prepend(chapter, story, scale, plain);
    this.bar.el.classList.add('dt-bar');
    this.app.root.append(this.bar.el);
    requestAnimationFrame(() => this.fitBar());
  }

  /** The chapters, to switch between. */
  private openChapters() {
    const list = h('div', { class: 'mode-list', 'data-deeptime': 'chapters' });
    const desc: Record<Chapter, () => string> = {
      cosmos: () => L('The universe from its first instant: the first atoms, stars and galaxies, the Milky Way, the Sun, the Earth and the Moon.', 'El universo desde su primer instante: los primeros átomos, estrellas y galaxias, la Vía Láctea, el Sol, la Tierra y la Luna.'),
      earth: () => L('The Earth from its first days to today: moving continents, past life, ice ages, the asteroid.', 'La Tierra desde sus primeros días hasta hoy: continentes en movimiento, vida del pasado, glaciaciones, el asteroide.'),
      all: () => L('Both chapters in one: 13.8 billion years, and how little of it is ours.', 'Los dos capítulos en uno: 13 800 millones de años, y qué poco de ese tiempo es nuestro.'),
    };
    for (const ch of ['cosmos', 'earth', 'all'] as Chapter[]) {
      const on = ch === this.chapter;
      const b = h('button', { type: 'button', class: `mode-card${on ? ' on' : ''}`, 'data-deeptime-chapter': ch },
        h('span', { class: 'mode-icon' }, CHAPTER_ICON[ch]),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, CHAPTER[ch]()), h('span', { class: 'mode-desc' }, desc[ch]())));
      b.addEventListener('click', () => { this.shell.sheet.close(); if (!on) this.setChapter(ch, ch === 'earth' && this.ma > EARTH_MA ? sinceBang(EARTH_MA) : ch === 'cosmos' && this.ma < COSMOS_END ? 0 : this.t); });
      list.append(b);
    }
    this.shell.openPanel('deeptime-chapter', L('Deep time', 'El tiempo profundo'), list);
  }

  /** Switches chapter, at moment `t` (kept inside the chapter). */
  setChapter(ch: Chapter, t = this.t) {
    if (!this.active) return;
    if (this.player) this.stopStory();
    this.chapter = ch;
    this.t = this.clampT(t);
    this.ma = Math.max(0, maOfT(this.t));
    this.buildBar();
    this.renderHud();
    this.syncScene();
    this.keepPlace();
    if (ch !== 'earth') recordSeen('deeptime', 'chapter:cosmos');
    this.app.renderer.requestRender();
  }

  /** A moment kept inside the present chapter. */
  private clampT(t: number) {
    const lo = this.chapter === 'earth' ? sinceBang(EARTH_MA) : 0, hi = this.chapter === 'cosmos' ? sinceBang(COSMOS_END) : sinceBang(0);
    return Math.max(lo, Math.min(hi, t));
  }

  /** The scene of the cosmos, over the globe while the moment is before the Moon (in the cosmos chapters). */
  private syncScene() {
    const sc = this.scene;
    if (!sc) return;
    const on = this.chapter !== 'earth' && this.ma > COSMOS_END;
    document.documentElement.classList.toggle('dt-cosmos', on);
    if (on) {
      const top = this.top?.getBoundingClientRect(), root = this.app.root.getBoundingClientRect();
      const v = this.vitalsEl && !this.vitalsEl.hidden ? this.vitalsEl.getBoundingClientRect() : null;
      // On a phone the vital signs sit over the middle: the scene keeps above them.
      const over = v && v.height && v.right > root.left + root.width * 0.4 ? root.bottom - v.top + 6 : 0;
      sc.inset = { top: top && top.height ? top.bottom - root.top + 6 : 0, bottom: Math.max(this.bar?.coveredHeight() ?? 0, over) };
    }
    sc.show(on);
    sc.setTime(this.t);
  }

  /** The scene's words: an event's name, or a few labels of its own. */
  private sceneWord(k: string): string | null {
    const e = this.data?.events.find((x) => x.id === k);
    if (e) return tx(e.name);
    const words: Record<string, () => string> = {
      jupiter: () => L('Jupiter', 'Júpiter'), mars: () => L('Mars', 'Marte'), earth: () => L('The Earth', 'La Tierra'), theia: () => L('Theia', 'Tea'),
      moon: () => L('The Moon', 'La Luna'), 'sun-here': () => L('The Sun will form here', 'Aquí se formará el Sol'),
    };
    return words[k]?.() ?? null;
  }

  /** Keep the map, the vital signs and the story's caption above the time bar (its height changes with the screen). */
  private fitBar = () => {
    if (!this.bar) return;
    const hgt = this.bar.coveredHeight();
    this.app.renderer.view.insetBottom = hgt;
    document.documentElement.style.setProperty('--dt-bar-h', `${Math.round(hgt)}px`);
    this.app.renderer.requestRender();
  }

  /** The bar's second line: the universe's era before the Earth, the period, era and eon after. */
  private captionAt(t: number): string {
    const ma = maOfT(t);
    return ma > EARTH_MA ? ERA[cosmicEra(t)]() : this.captionFor(ma);
  }

  private captionFor(ma: number): string {
    const w = this.world;
    if (!w) return '';
    const parts = ['period', 'era', 'eon'].map((r) => w.unit(ma, r)).filter((u): u is Unit => !!u).map(unitName);
    return parts.join(' · ');
  }

  /** Moves to `ma` (from code: the story, a card's "Go to its time", a link). */
  setMa(ma: number) { this.setT(sinceBang(ma)); }

  /** Moves to `t` years after the Big Bang; to the chapter it belongs to when it is outside this one. */
  setT(t: number) {
    if (!this.bar) return;
    const ma = maOfT(t);
    if (this.chapter === 'earth' && ma > EARTH_MA + 1e-9) { this.setChapter('cosmos', t); return; }
    if (this.chapter === 'cosmos' && ma < COSMOS_END - 1e-9) { this.setChapter('earth', t); return; }
    this.bar.setPos(posOfT(t, this.scale, this.chapter));
  }

  private onTime(t: number) {
    const prev = this.ma;
    const ma = Math.max(0, maOfT(t));
    this.t = t;
    this.ma = ma;
    // Moving forward through an impact starts its animation.
    if (this.data && !this.plain && ma < prev) for (const e of this.data.events) if (e.kind === 'impact' && e.ma <= prev && e.ma > ma && prev - ma < 5) this.anims.push({ e, t0: performance.now() });
    this.lastMa = prev;
    this.keepPlace();
    this.renderHud();
    // After the heads-up display, whose height the scene keeps clear of.
    this.syncScene();
    this.app.renderer.requestRender();
  }

  /** The address keeps the moment, so Share sends it (#deeptime=66), at most a few times a second. */
  private placeAt = 0;
  private keepPlace() {
    const now = performance.now();
    if (now - this.placeAt < 400) return;
    this.placeAt = now;
    // The first million years by "t" (years after the Big Bang), since in Ma they all read 13,787.
    const v = this.t < 1e6 ? `t${Number(this.t.toPrecision(3))}` : this.ma >= 100 ? Math.round(this.ma) : this.ma >= 1 ? Math.round(this.ma * 10) / 10 : Math.round(this.ma * 10000) / 10000;
    const ch = this.chapter !== chapterFor(this.ma) ? `&ch=${this.chapter}` : '';
    history.replaceState(history.state, '', `#deeptime=${v}${ch}&p=${this.app.projection}&lang=${lang()}`);
  }

  // ---- The heads-up display ----------------------------------------------------------------------------------------

  private renderHud() {
    const w = this.world, d = this.data;
    if (!w || !d || !this.top) return;
    const ma = this.ma;
    clear(this.top);
    if (ma > EARTH_MA) { this.renderCosmosHud(); return; }
    const chain = ['eon', 'era', 'period', 'epoch'].map((r) => w.unit(ma, r)).filter((u): u is Unit => !!u);
    this.top.append(
      h('div', { class: 'dt-ago', 'data-deeptime': 'ago' }, agoText(ma)),
      h('div', { class: 'dt-chain', 'data-deeptime': 'eras' }, chain.map((u) => h('span', { class: 'dt-unit', style: `--u: ${u.color}` }, unitName(u)))),
      h('div', { class: 'dt-cal', 'data-deeptime': 'calendar', title: L('All the time since the Big Bang squeezed into one year', 'Todo el tiempo desde el Big Bang comprimido en un año') },
        `🗓️ ${L('Cosmic calendar', 'Calendario cósmico')}: ${cosmicText(ma)}`),
    );
    const now = eventsAt(d.events.filter((e) => !e.at || e.kind === 'ice' || e.kind === 'extinction' || e.kind === 'air'), ma, this.window(ma)).slice(0, 2);
    for (const e of now) {
      const b = h('button', { type: 'button', class: 'dt-now', 'data-deeptime-event': e.id }, `${this.kindIcon(e.kind)} ${tx(e.name)}`);
      b.addEventListener('click', () => this.showEvent(e));
      this.top.append(b);
    }
    if (ma > PALEO_MAX_MA && !this.plain && !(this.chapter !== 'earth' && ma > COSMOS_END)) this.top.append(h('div', { class: 'dt-note muted small' }, L('Before a billion years ago no one knows where the land was: the continents here are an impression.', 'Antes de hace mil millones de años nadie sabe dónde estaba la tierra: estos continentes son una impresión.')));
    this.renderVitals();
  }

  /** Events around a moment: by tenfolds of time in the first million years (seconds, minutes…), by Ma after. */
  private eventsNear(t: number, wide = 1): DEvent[] {
    const d = this.data;
    if (!d) return [];
    if (t < 1e6) {
      const lt = t > 0 ? Math.log10(t) : -50;
      return d.events.filter((e) => e.t != null && (e.t <= 0 ? lt < -36 : Math.abs(Math.log10(e.t) - lt) <= 1.2 * wide)).sort((a, b) => Math.abs(tOf(a) - t) - Math.abs(tOf(b) - t));
    }
    return eventsAt(d.events.filter((e) => e.t == null || e.t >= 1e6 || (e.to != null && maOfT(t) <= e.ma && maOfT(t) >= e.to)), maOfT(t), this.window(maOfT(t)) * wide);
  }

  /** The top line before the Earth: how long after the Big Bang (or ago), the universe's era, the cosmic calendar. */
  private renderCosmosHud() {
    const top = this.top!, t = this.t, era = COSMIC_ERAS.find((x) => x.id === cosmicEra(t))!;
    top.append(
      h('div', { class: 'dt-ago', 'data-deeptime': 'ago' }, whenText(t)),
      t >= 1e6 ? h('div', { class: 'dt-after muted small', 'data-deeptime': 'after' }, afterText(t)) : '',
      h('div', { class: 'dt-chain', 'data-deeptime': 'eras' }, h('span', { class: 'dt-unit', style: `--u: ${era.color}` }, ERA[era.id]())),
      h('div', { class: 'dt-cal', 'data-deeptime': 'calendar', title: L('All the time since the Big Bang squeezed into one year', 'Todo el tiempo desde el Big Bang comprimido en un año') },
        `🗓️ ${L('Cosmic calendar', 'Calendario cósmico')}: ${cosmicText(this.ma)}`),
    );
    for (const e of this.eventsNear(t).slice(0, 2)) {
      const b = h('button', { type: 'button', class: 'dt-now', 'data-deeptime-event': e.id }, `${this.kindIcon(e.kind)} ${tx(e.name)}`);
      b.addEventListener('click', () => this.showEvent(e));
      top.append(b);
    }
    this.renderVitals();
  }

  /** The universe's vital signs, before the Earth: its age, how hot space is, its size, what is in it, light. */
  private universeRows(t: number): [string, string, string][] {
    const a = scaleFactor(t), k = spaceTemp(t), era = cosmicEra(t);
    const size = a <= 0 ? L('A point', 'Un punto') : a < 0.01 ? L('1/{0} of today’s', '1/{0} del actual', fmtNumber(Math.round(1 / a))) : a < 0.995 ? L('{0}% of today’s', '{0}% del actual', fmtNumber(a * 100, a < 0.1 ? 1 : 0)) : L('Today’s', 'El actual');
    const made = t < 3.17e-13 ? L('Quarks, electrons and light', 'Quarks, electrones y luz') : t < 6e-6 ? L('Protons, neutrons, electrons and light', 'Protones, neutrones, electrones y luz')
      : t < 380000 ? L('Hydrogen and helium nuclei, electrons and light', 'Núcleos de hidrógeno y helio, electrones y luz') : era === 'dark' ? L('Hydrogen and helium gas, and dark matter', 'Gas de hidrógeno y helio, y materia oscura')
        : era === 'nebula' || era === 'disc' || era === 'earth' ? L('Gas and dust made by many stars before the Sun', 'Gas y polvo hechos por muchas estrellas antes del Sol') : L('Stars are making carbon, oxygen and iron', 'Las estrellas fabrican carbono, oxígeno y hierro');
    const light = t < 380000 ? L('None gets through: a glowing fog', 'Ninguna la atraviesa: una niebla brillante') : era === 'dark' ? L('No stars yet: darkness', 'Aún no hay estrellas: oscuridad')
      : era === 'stars' ? L('The first stars', 'Las primeras estrellas') : era === 'nebula' || era === 'disc' || era === 'earth' ? L('Our Sun, among billions of stars', 'Nuestro Sol, entre miles de millones de estrellas') : L('Billions of galaxies', 'Miles de millones de galaxias');
    return [
      ['⏳', L('Age of the universe', 'Edad del universo'), ageText(t)],
      ['🌡️', L('Temperature of space', 'Temperatura del espacio'), heatText(k)],
      ['📏', L('Size compared with today', 'Tamaño comparado con hoy'), size],
      ['⚛️', L('What it is made of', 'De qué está hecho'), made],
      ['💡', L('Light', 'Luz'), light],
    ];
  }

  private renderVitals() {
    const el = this.vitalsEl, d = this.data;
    if (!el || !d) return;
    el.hidden = this.plain;
    if (!this.plain && this.ma > EARTH_MA) {
      const verdict = cosmicSurvival(this.t);
      const rows = this.universeRows(this.t);
      clear(el);
      el.dataset.level = verdict.level;
      el.classList.toggle('open', this.vitalsOpen);
      el.append(
        h('div', { class: 'dt-verdict', 'data-deeptime': 'verdict' }, VERDICT[verdict.level]()),
        h('div', { class: 'dt-rows' }, (this.vitalsOpen ? rows : rows.slice(1, 2)).map(([i, label, value]) => h('div', { class: 'dt-row' }, h('span', { class: 'dt-ri' }, i), h('span', { class: 'dt-rl' }, label), h('span', { class: 'dt-rv' }, value)))));
      if (this.vitalsOpen) el.append(h('ul', { class: 'dt-reasons' }, verdict.reasons.map((r) => h('li', { 'data-level': r.level }, REASON[r.key]?.() ?? r.key))));
      el.append(h('div', { class: 'dt-more muted small' }, this.vitalsOpen ? L('From the Planck satellite’s measurements of the oldest light. Tap to close.', 'Según las mediciones de la luz más antigua del satélite Planck. Toca para cerrar.') : L('Tap for more', 'Toca para ver más')));
      return;
    }
    if (this.plain) return;
    const v = vitalsAt(d, this.ma);
    const verdict = survival(v);
    clear(el);
    el.dataset.level = verdict.level;
    el.classList.toggle('open', this.vitalsOpen);
    const num = (r: Vitals['o2'], digits = 0) => (r ? fmtNumber(r.v, digits) : '—');
    const rows: [string, string, string][] = [
      ['🫁', L('Oxygen', 'Oxígeno'), v.o2 ? `${num(v.o2, v.o2.v < 1 ? 2 : 0)}%` : '—'],
      ['🏭', L('Carbon dioxide', 'Dióxido de carbono'), v.co2 ? `${fmtNumber(Math.round(v.co2.v))} ppm` : '—'],
      ['🌡️', L('Average temperature', 'Temperatura media'), v.temp ? `${num(v.temp)} °C` : '—'],
      ['🕐', L('A day lasts', 'Un día dura'), v.day ? L('{0} hours', '{0} horas', fmtNumber(v.day.v, 1)) : '—'],
      ['☀️', L('The Sun', 'El Sol'), L('{0}% as bright as today', '{0}% del brillo actual', fmtNumber(v.sun * 100))],
    ];
    if (this.vitalsOpen) {
      if (v.year) rows.push(['📆', L('Days in a year', 'Días en un año'), fmtNumber(v.year)]);
      if (v.moon) rows.push(['🌙', L('The Moon', 'La Luna'), L('{0} km away', 'a {0} km', fmtNumber(Math.round(v.moon.v * 1000)))]);
      if (v.sea) rows.push(['🌊', L('Sea level', 'Nivel del mar'), `${v.sea.v >= 0 ? '+' : ''}${fmtNumber(Math.round(v.sea.v))} m`]);
      if (v.genera) rows.push(['🐚', L('Kinds of sea animals known from fossils', 'Tipos de animales marinos conocidos por fósiles'), L('{0} genera', '{0} géneros', fmtNumber(Math.round(v.genera.v)))]);
      rows.push(['🛡️', L('Ozone layer', 'Capa de ozono'), v.ozone === 'none' ? L('Not yet', 'Todavía no') : v.ozone === 'thin' ? L('Thin', 'Delgada') : L('Yes', 'Sí')]);
      rows.push(['🧊', L('Ice', 'Hielo'), v.ice === 'snowball' ? L('The whole Earth', 'La Tierra entera') : v.ice === 'glacial' ? L('An ice age at its peak', 'Una glaciación en su apogeo') : v.ice === 'north' ? L('Both poles', 'Ambos polos') : v.ice === 'south' ? L('The south pole', 'El polo sur') : v.ice === 'caps' ? L('Small caps', 'Casquetes pequeños') : L('No permanent ice', 'Sin hielo permanente')]);
    }
    el.append(
      h('div', { class: 'dt-verdict', 'data-deeptime': 'verdict' }, VERDICT[verdict.level]()),
      h('div', { class: 'dt-rows' }, rows.map(([i, label, value]) => h('div', { class: 'dt-row' }, h('span', { class: 'dt-ri' }, i), h('span', { class: 'dt-rl' }, label), h('span', { class: 'dt-rv' }, value)))));
    if (this.vitalsOpen) el.append(h('ul', { class: 'dt-reasons' }, verdict.reasons.map((r) => h('li', { 'data-level': r.level }, REASON[r.key]?.() ?? r.key))));
    el.append(h('div', { class: 'dt-more muted small' }, this.vitalsOpen ? L('Approximate values from rock and fossil records. Tap to close.', 'Valores aproximados según rocas y fósiles. Toca para cerrar.') : L('Tap for more', 'Toca para ver más')));
  }

  // ---- The planet ----------------------------------------------------------------------------------------------------

  /** Where a present-day place carried by plate `pl` was at `ma` (today's place before the plate model). */
  private place(at: Pt, pl: string | undefined, ma = this.ma): Pt {
    return this.world && pl && ma <= PALEO_MAX_MA ? this.world.rotate(at[0], at[1], pl, ma) : at;
  }

  private drawPlanet(rc: RenderCtx) {
    const w = this.world, d = this.data;
    if (!w || !d || !this.active || this.scene?.visible) return;
    const { ctx, path } = rc;
    const ma = this.ma, dark = rc.theme.dark;
    const v = vitalsAt(d, ma);
    const lk = this.plain ? null : look(ma, v);
    // The sea.
    ctx.beginPath(); path({ type: 'Sphere' });
    ctx.fillStyle = lk ? (dark ? mixColour(lk.sea, '#000000', 0.35) : lk.sea) : (dark ? '#123a5a' : '#bcdcf0');
    ctx.fill();
    // The land: the plate model from a billion years ago, an impression before (blended across 1000–1100 Ma).
    const greenLand = dark ? '#3f7a3a' : '#7fb069';
    const land = lk ? mixColour(lk.land, greenLand, lk.green) : (dark ? '#8d8a73' : '#d8cfb0');
    const shelf = lk ? mixColour(lk.sea, '#ffffff', dark ? 0.12 : 0.3) : (dark ? '#24597a' : '#a9d0e6');
    const fade = ma <= PALEO_MAX_MA ? 1 : ma >= 1100 ? 0 : 1 - (ma - PALEO_MAX_MA) / 100;
    if (fade > 0) {
      ctx.save(); ctx.globalAlpha *= fade;
      w.draw(rc, Math.min(ma, PALEO_MAX_MA), { shelf, land: () => land, coast: dark ? 'rgba(10,25,45,0.7)' : 'rgba(40,50,70,0.5)' });
      ctx.restore();
    }
    if (fade < 1) this.drawProtos(rc, ma, land, 1 - fade);
    if (!lk) return;
    // A magma ocean, a haze, ice.
    if (lk.magma > 0) this.drawMagma(rc, lk.magma);
    if (lk.capN > 0 || lk.capS > 0) {
      ctx.save();
      ctx.fillStyle = dark ? 'rgba(225,238,248,0.86)' : 'rgba(250,253,255,0.92)';
      for (const [lat, r] of [[90, lk.capN], [-90, lk.capS]] as const) {
        if (r <= 0) continue;
        ctx.beginPath(); path(r >= 90 ? { type: 'Sphere' } : geoCircle().center([0, lat]).radius(r)()); ctx.fill();
      }
      ctx.restore();
    }
    if (lk.haze > 0) { ctx.save(); ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = `rgba(214,134,52,${0.32 * lk.haze})`; ctx.fill(); ctx.restore(); }
    // The great eruptions glow while they last.
    const t = rc.now / 1000;
    for (const e of d.events) {
      if (e.kind !== 'volcano' || !e.at || !(ma <= e.ma + 0.3 && ma >= (e.to ?? e.ma) - 0.3)) continue;
      const c = this.place(e.at, e.pl);
      const r = Math.max(1.5, (e.r ?? 300) / 111.2);
      ctx.save();
      ctx.globalAlpha *= 0.55 + 0.25 * Math.sin(t * 3 + e.ma);
      ctx.beginPath(); path(geoCircle().center(c).radius(r)()); ctx.fillStyle = '#ff5a1f'; ctx.fill();
      ctx.beginPath(); path(geoCircle().center(c).radius(r * 0.45)()); ctx.fillStyle = '#ffd34d'; ctx.fill();
      ctx.restore();
      this.app.renderer.requestRender();
    }
    // A mass extinction darkens the world a little.
    if (d.events.some((e) => e.kind === 'extinction' && ma <= e.ma + 0.05 && ma >= (e.to ?? e.ma) - 0.05)) {
      ctx.save(); ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = 'rgba(60,0,0,0.18)'; ctx.fill(); ctx.restore();
    }
  }

  /** The early continents: an impression (no one knows where the land was), growing with the crust. */
  private drawProtos(rc: RenderCtx, ma: number, colour: string, alpha: number) {
    const share = Math.sqrt(crust(ma));
    if (share <= 0.01) return;
    const { ctx, path } = rc;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = colour;
    ctx.strokeStyle = rc.theme.dark ? 'rgba(255,255,255,0.35)' : 'rgba(40,50,70,0.4)';
    ctx.setLineDash([4, 4]);
    const drift = (EARTH_MA - ma) * 0.03;
    for (const p of this.protos) {
      const R = p.r * 18 * share;
      const ring: Pt[] = p.jag.map((k, i) => {
        const a = (i / p.jag.length) * Math.PI * 2;
        const lat = Math.max(-85, Math.min(85, p.lat + Math.sin(a) * R * k));
        return [((p.lon + drift + Math.cos(a) * R * k / Math.max(0.2, Math.cos(p.lat / 57.3)) + 540) % 360) - 180, lat];
      });
      ring.push(ring[0]);
      ctx.beginPath(); path({ type: 'Polygon', coordinates: [ring.reverse()] }); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /** The magma ocean: a glowing surface with dark crust breaking up and drifting. */
  private drawMagma(rc: RenderCtx, k: number) {
    const { ctx, path } = rc;
    const t = rc.now / 1000;
    ctx.save();
    ctx.globalAlpha *= k;
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = '#c1360f'; ctx.fill();
    ctx.fillStyle = '#ff8a1e';
    for (let i = 0; i < 40; i++) {
      const lon = ((i * 47 + t * 4) % 360) - 180, lat = Math.sin(i * 1.7) * 70;
      ctx.beginPath(); path(geoCircle().center([lon, lat]).radius(3 + (i % 5) * 2 + Math.sin(t + i) * 1.2)()); ctx.fill();
    }
    ctx.fillStyle = 'rgba(40,12,6,0.55)';
    for (let i = 0; i < 30; i++) {
      const lon = ((i * 83 - t * 2.5) % 360) - 180, lat = Math.cos(i * 2.3) * 75;
      ctx.beginPath(); path(geoCircle().center([lon, lat]).radius(4 + (i % 4) * 3)()); ctx.fill();
    }
    ctx.restore();
    this.app.renderer.requestRender();
  }

  // ---- Markers ------------------------------------------------------------------------------------------------------

  /** How close in time an event must be to show as a moment (wider in the long early ages). */
  private window(ma: number) { return ma > 1000 ? 40 : ma > 250 ? 4 : ma > 20 ? 1 : ma > 1 ? 0.1 : 0.004; }
  private kindIcon(kind: string) { return this.data?.kinds.find((k) => k.id === kind)?.icon ?? '•'; }
  private groupOf(id: string) { return this.data?.groups.find((g) => g.id === id); }

  private dot(rc: RenderCtx, at: Pt, emoji: string, color: string, r: number, go: () => void, alpha = 1): [number, number] | null {
    const p = rc.project(at[0], at[1]);
    if (!p) return null;
    const { ctx } = rc;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = rc.theme.dark ? 'rgba(20,28,44,0.92)' : 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
    ctx.font = `${Math.round(r * 1.15)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.fillText(emoji, p[0], p[1] + 0.5);
    ctx.restore();
    rc.labels.reserve(p[0] - r, p[1] - r, p[0] + r, p[1] + r);
    this.hits.push({ x: p[0], y: p[1], r: r + 6, go });
    return p;
  }

  private drawMarks(rc: RenderCtx) {
    this.hits = [];
    const d = this.data;
    if (!this.active || !d || this.plain || this.scene?.visible) return;
    const ma = this.ma, zoom = this.app.renderer.view.zoom;
    // Past species at their fossil sites (the first site; all of them when zoomed in).
    for (const s of aliveAt(this.species, ma)) {
      const g = this.groupOf(s.group);
      const sites = zoom >= 3 ? s.sites : s.sites.slice(0, 1);
      for (const site of sites) {
        const at = this.place(site.at, site.pl);
        const p = this.dot(rc, at, s.icon, g?.color ?? '#888888', 10, () => this.showSpecies(s));
        if (p && zoom >= 2.2) rc.labels.add({ text: tx(s.common ?? s.name), x: p[0], y: p[1], gap: 14, avoid: [[p[0] - 10, p[1] - 10, p[0] + 10, p[1] + 10]], own: [p[0] - 10, p[1] - 10, p[0] + 10, p[1] + 10], priority: 2600, size: 11, weight: 600, color: rc.theme.dark ? '#f2f5fa' : '#1b2433', halo: rc.theme.dark ? 'rgba(10,20,35,0.85)' : 'rgba(255,255,255,0.9)' });
      }
    }
    // Events in their moment; firsts pulse.
    const t = rc.now / 1000;
    for (const e of eventsAt(d.events, ma, this.window(ma))) {
      if (!e.at) continue;
      const at = this.place(e.at, e.pl);
      const k = d.kinds.find((x) => x.id === e.kind);
      if (e.first) {
        const p = rc.project(at[0], at[1]);
        if (p) { rc.ctx.save(); rc.ctx.beginPath(); rc.ctx.arc(p[0], p[1], 16 + 6 * Math.sin(t * 4), 0, Math.PI * 2); rc.ctx.strokeStyle = k?.color ?? '#27ae60'; rc.ctx.lineWidth = 2; rc.ctx.globalAlpha *= 0.6; rc.ctx.stroke(); rc.ctx.restore(); this.app.renderer.requestRender(); }
      }
      const p = this.dot(rc, at, k?.icon ?? '•', k?.color ?? '#555555', 12, () => this.showEvent(e));
      if (p) rc.labels.add({ text: tx(e.name), x: p[0], y: p[1], gap: 16, avoid: [[p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12]], own: [p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12], priority: 3200, size: 12, weight: 700, color: rc.theme.dark ? '#ffffff' : '#1b2433', halo: rc.theme.dark ? 'rgba(10,20,35,0.85)' : 'rgba(255,255,255,0.92)' });
    }
    this.drawImpacts(rc);
  }

  /** An asteroid strike: the rock streaks in, a flash, shock rings, debris round the globe, then the world dims. */
  private drawImpacts(rc: RenderCtx) {
    const now = performance.now();
    this.anims = this.anims.filter((a) => now - a.t0 < 9000);
    for (const a of this.anims) {
      const e = a.e;
      if (/chicxulub/.test(e.id) && now - a.t0 > 3000) recordSeen('deeptime', 'impact:chicxulub');
      if (!e.at) continue;
      const at = this.place(e.at, e.pl, e.ma);
      const p = rc.project(at[0], at[1]);
      const s = (now - a.t0) / 1000;
      const { ctx, path } = rc;
      const big = Math.min(1, (e.r ?? 50) / 90);
      ctx.save();
      if (s < 1.2 && p) {
        // The rock coming in from the upper left, its trail glowing.
        const f = s / 1.2, x0 = p[0] - 260, y0 = p[1] - 220;
        const x = x0 + (p[0] - x0) * f, y = y0 + (p[1] - y0) * f;
        const grd = ctx.createLinearGradient(x0, y0, x, y);
        grd.addColorStop(0, 'rgba(255,200,120,0)'); grd.addColorStop(1, 'rgba(255,230,180,0.95)');
        ctx.strokeStyle = grd; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      } else if (s >= 1.2) {
        const f = s - 1.2;
        // The flash.
        if (f < 0.6 && p) { ctx.fillStyle = `rgba(255,255,240,${0.9 * (1 - f / 0.6)})`; ctx.beginPath(); ctx.arc(p[0], p[1], 30 + 200 * f, 0, Math.PI * 2); ctx.fill(); }
        // Shock rings and the fireball spreading over the globe.
        const reach = Math.min(1, f / 3) * (20 + 70 * big);
        ctx.strokeStyle = `rgba(255,140,40,${0.85 * (1 - f / 7)})`; ctx.lineWidth = 3;
        for (const k of [1, 0.66, 0.33]) { ctx.beginPath(); path(geoCircle().center(at).radius(Math.max(0.5, reach * k))()); ctx.stroke(); }
        ctx.fillStyle = `rgba(255,90,20,${0.3 * (1 - f / 7)})`;
        ctx.beginPath(); path(geoCircle().center(at).radius(Math.max(0.5, reach * 0.5))()); ctx.fill();
        // Debris raining back down all over the world, then darkness and cold.
        if (f > 1.5) {
          const g = Math.min(1, (f - 1.5) / 2) * (1 - Math.max(0, f - 5.5) / 2.3);
          ctx.fillStyle = `rgba(12,8,6,${0.55 * big * Math.max(0, g)})`;
          ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
        }
      }
      ctx.restore();
      this.app.renderer.requestRender();
    }
  }

  tap(x?: number, y?: number, lon?: number, lat?: number): boolean {
    if (x != null && y != null) {
      let best: (typeof this.hits)[number] | null = null, bd = Infinity;
      for (const ht of this.hits) { const dd = Math.hypot(ht.x - x, ht.y - y); if (dd <= ht.r && dd < bd) { bd = dd; best = ht; } }
      if (best) { best.go(); return true; }
    }
    if (lon == null || lat == null || !this.world) return true;
    if (this.ma <= PALEO_MAX_MA) {
      const rows = this.world.tapRows(lon, lat, this.ma, this.app);
      if (rows) { this.shell.card.showCustom('🌋', agoText(this.ma), this.captionFor(this.ma), rows); return true; }
    }
    this.shell.card.hide();
    return true;
  }

  // ---- Cards and panels --------------------------------------------------------------------------------------------

  private when(from: number, to: number, alive?: boolean): string {
    if (alive) return L('From {0} to today', 'Desde {0} hasta hoy', agoText(from).toLowerCase());
    return `${agoText(from)} → ${agoText(to).toLowerCase()}`;
  }

  showSpecies(s: Species, fly = false) {
    const g = this.groupOf(s.group);
    const rows: InfoRow[] = [
      { icon: '📅', label: L('Lived', 'Vivió'), value: this.when(s.from, s.to, s.alive) },
      { icon: '📍', label: L('Fossils found at', 'Fósiles hallados en'), value: s.sites.map((x) => tx(x.place)).join(' · ') },
      { icon: s.life === 'air' ? '🪽' : s.life === 'sea' ? '🌊' : '🌍', label: L('Where it lived', 'Dónde vivía'), value: LIFE[s.life]?.() ?? s.life },
      { icon: '🍽️', label: L('It ate', 'Comía'), value: DIET[s.diet]?.() ?? s.diet },
    ];
    const size = [s.len != null ? (s.len >= 1 ? `${fmtNumber(s.len, s.len < 10 ? 1 : 0)} m` : `${fmtNumber(s.len * 100, s.len < 0.1 ? 1 : 0)} cm`) : '', s.mass != null ? (s.mass >= 1000 ? L('{0} tonnes', '{0} toneladas', fmtNumber(s.mass / 1000, 1)) : `${fmtNumber(s.mass, s.mass < 1 ? 2 : 0)} kg`) : ''].filter(Boolean).join(' · ');
    if (size) rows.push({ icon: '📏', label: L('Size', 'Tamaño'), value: size });
    if (s.kin) rows.push({ icon: '🧬', label: L('Closest living relatives', 'Parientes vivos más cercanos'), value: tx(s.kin) });
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    const href = wikiHref(s.wiki);
    if (href) links.push({ label: 'Wikipedia', href });
    if (!(this.ma <= s.from && this.ma >= s.to)) links.push({ label: L('Go to its time', 'Ir a su época'), onClick: () => this.setMa((s.from + s.to) / 2) });
    if (s.story) links.push({ label: L('Open its story', 'Abrir su historia'), onClick: () => void this.exit().then(() => this.app.emit('open-story', 'life', s.story![0], s.story![1])) });
    this.shell.card.showCustom(s.icon, tx(s.common ?? s.name), [s.common ? tx(s.name) : '', g ? tx(g.name) : ''].filter(Boolean).join(' · '), rows, links, [tx(s.text)], wikiThumb(s.wiki));
    recordSeen('deeptime', s.id);
    if (fly) { const at = this.place(s.sites[0].at, s.sites[0].pl); this.app.flyTo(at[0], at[1], 3); }
  }

  showEvent(e: DEvent, fly = false) {
    const k = this.data?.kinds.find((x) => x.id === e.kind);
    const te = tOf(e);
    const cosmic = e.ma > EARTH_MA;
    const whenValue = te < 1e6 && e.to == null ? afterText(te) : e.to != null ? `${whenText(te)} → ${agoText(e.to).toLowerCase()}` : `${agoText(e.ma)}${e.err ? ` (± ${fmtNumber(e.err, e.err < 1 ? 2 : 0)} Ma)` : ''}`;
    const rows: InfoRow[] = [{ icon: '📅', label: L('When', 'Cuándo'), value: whenValue }];
    if (cosmic && te >= 1e6) rows.push({ icon: '💥', label: L('Age of the universe', 'Edad del universo'), value: ageText(te) });
    if (k) rows.push({ icon: k.icon, label: L('Kind', 'Tipo'), value: tx(k.name) });
    if (e.sure === 'debated') rows.push({ icon: '❓', label: L('Certainty', 'Certeza'), value: L('Debated', 'Debatido') });
    if (e.first) {
      // Before the Earth, a first is the universe's (or, in the Sun's disc, the solar system's).
      const where = e.ma <= EARTH_MA ? L('The first time in Earth’s history', 'La primera vez en la historia de la Tierra')
        : e.kind === 'planet' ? L('The first time in the solar system’s history', 'La primera vez en la historia del sistema solar')
        : L('The first time in the universe’s history', 'La primera vez en la historia del universo');
      rows.push({ icon: '🥇', label: L('A first', 'Un primero'), value: where });
    }
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    const href = wikiHref(e.wiki);
    if (href) links.push({ label: 'Wikipedia', href });
    if (Math.abs(posOfT(te, this.scale, this.chapter) - posOfT(this.t, this.scale, this.chapter)) > 0.004 || (this.chapter === 'earth' && cosmic)) links.push({ label: L('Go to that moment', 'Ir a ese momento'), onClick: () => this.setT(te) });
    if (e.story) links.push({ label: L('Open its story', 'Abrir su historia'), onClick: () => void this.exit().then(() => this.app.emit('open-story', 'life', e.story![0], e.story![1])) });
    this.shell.card.showCustom(k?.icon ?? '•', tx(e.name), whenText(te), rows, links, [tx(e.text)], e.wiki ? wikiThumb(e.wiki) : undefined);
    if (cosmic) recordSeen('deeptime', `cosmos:${e.id}`);
    if (fly && e.at) { const at = this.place(e.at, e.pl, e.ma); this.app.flyTo(at[0], at[1], 2.5); }
    if (e.kind === 'impact' && Math.abs(this.ma - e.ma) < 1) this.anims.push({ e, t0: performance.now() });
  }

  /** What lived then: the eras, the vital signs, what is happening, and every species alive, by where they lived. */
  openNow() {
    const d = this.data, w = this.world;
    if (!d || !w) return;
    const ma = this.ma;
    if (ma > EARTH_MA) { this.openUniverse(); return; }
    const body = h('div', { class: 'guide deeptime', 'data-deeptime': 'now' });
    body.append(h('p', { class: 'dt-now-when' }, `${agoText(ma)} · ${this.captionFor(ma)}`));
    const verdict = survival(vitalsAt(d, ma));
    body.append(h('p', { class: 'dt-now-verdict', 'data-level': verdict.level }, VERDICT[verdict.level]()), h('ul', { class: 'dt-reasons' }, verdict.reasons.map((r) => h('li', { 'data-level': r.level }, REASON[r.key]?.() ?? r.key))));
    const evs = eventsAt(d.events, ma, this.window(ma) * 3);
    if (evs.length) {
      body.append(h('h3', { class: 'sec-title' }, L('Happening around now', 'Sucediendo por estas fechas')));
      const list = h('div', { class: 'guide-list' });
      for (const e of evs) {
        const b = h('button', { type: 'button', class: 'guide-row', 'data-deeptime-event': e.id }, h('span', { class: 'guide-icon' }, this.kindIcon(e.kind)), h('span', { class: 'guide-text' }, h('span', { class: 'guide-name' }, tx(e.name)), h('span', { class: 'guide-sub' }, agoText(e.ma))));
        b.addEventListener('click', () => this.showEvent(e, true));
        list.append(b);
      }
      body.append(list);
    }
    const alive = aliveAt(this.species, ma);
    const groups: [string, () => string, (s: Species) => boolean][] = [
      ['sea', LIFE.sea, (s) => s.life === 'sea' && s.group !== 'plant'],
      ['shore', () => L('In rivers, lakes and on shores', 'En ríos, lagos y costas'), (s) => (s.life === 'fresh' || s.life === 'shore') && s.group !== 'plant'],
      ['land', LIFE.land, (s) => s.life === 'land' && s.group !== 'plant'],
      ['air', LIFE.air, (s) => s.life === 'air'],
      ['plant', () => L('Plants and algae', 'Plantas y algas'), (s) => s.group === 'plant'],
    ];
    if (!alive.length) body.append(h('p', { class: 'muted' }, ma > 3800 ? L('No life yet that we know of.', 'Aún no hay vida que conozcamos.') : L('Only microbes, too small to see.', 'Solo microbios, demasiado pequeños para verlos.')));
    for (const [id, title, test] of groups) {
      const list = alive.filter(test);
      if (!list.length) continue;
      body.append(h('h3', { class: 'sec-title', 'data-deeptime-life': id }, `${title()} · ${list.length}`));
      const box = h('div', { class: 'guide-list' });
      for (const s of list) {
        const b = h('button', { type: 'button', class: 'guide-row', 'data-deeptime-species': s.id }, h('span', { class: 'guide-icon' }, s.icon), h('span', { class: 'guide-text' }, h('span', { class: 'guide-name' }, tx(s.common ?? s.name)), h('span', { class: 'guide-sub' }, `${s.common ? `${tx(s.name)} · ` : ''}${s.sites[0] ? tx(s.sites[0].place) : ''}`)));
        b.addEventListener('click', () => this.showSpecies(s, true));
        box.append(b);
      }
      body.append(box);
    }
    body.append(h('p', { class: 'muted small' }, L('Share of all time since the Big Bang that came after this moment: {0}%.', 'Parte de todo el tiempo desde el Big Bang que vino después de este momento: {0}%.', fmtNumber(shareSince(ma) * 100, ma < 1 ? 4 : 1))));
    if (d.sources.length) body.append(h('details', { class: 'dt-sources' }, h('summary', null, L('Where the vital signs come from', 'De dónde salen los signos vitales')),
      h('ul', null, d.sources.map((x) => h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title))))));
    this.shell.openPanel('deeptime', L('What lived then', 'Qué vivía entonces'), body);
  }

  /** What there was then, before the Earth: no life yet, the universe's vital signs, what is happening. */
  private openUniverse() {
    const t = this.t;
    const body = h('div', { class: 'guide deeptime', 'data-deeptime': 'now' });
    body.append(h('p', { class: 'dt-now-when' }, `${whenText(t)} · ${ERA[cosmicEra(t)]()}`));
    if (t >= 1e6) body.append(h('p', { class: 'muted small' }, afterText(t)));
    const verdict = cosmicSurvival(t);
    body.append(h('p', { class: 'dt-now-verdict', 'data-level': verdict.level }, VERDICT[verdict.level]()), h('ul', { class: 'dt-reasons' }, verdict.reasons.map((r) => h('li', { 'data-level': r.level }, REASON[r.key]?.() ?? r.key))));
    body.append(h('p', { class: 'muted', 'data-deeptime-life': 'none' }, L('No life yet: there is no Earth.', 'Aún no hay vida: no existe la Tierra.')));
    body.append(h('h3', { class: 'sec-title' }, L('The universe then', 'El universo entonces')),
      h('div', { class: 'dt-rows' }, this.universeRows(t).map(([i, label, value]) => h('div', { class: 'dt-row' }, h('span', { class: 'dt-ri' }, i), h('span', { class: 'dt-rl' }, label), h('span', { class: 'dt-rv' }, value)))));
    const evs = this.eventsNear(t, 2.5);
    if (evs.length) {
      body.append(h('h3', { class: 'sec-title' }, L('Happening around now', 'Sucediendo por estas fechas')));
      const list = h('div', { class: 'guide-list' });
      for (const e of evs) {
        const b = h('button', { type: 'button', class: 'guide-row', 'data-deeptime-event': e.id }, h('span', { class: 'guide-icon' }, this.kindIcon(e.kind)), h('span', { class: 'guide-text' }, h('span', { class: 'guide-name' }, tx(e.name)), h('span', { class: 'guide-sub' }, whenText(tOf(e)))));
        b.addEventListener('click', () => this.showEvent(e));
        list.append(b);
      }
      body.append(list);
    }
    body.append(h('p', { class: 'muted small' }, L('Share of all time since the Big Bang that came after this moment: {0}%.', 'Parte de todo el tiempo desde el Big Bang que vino después de este momento: {0}%.', fmtNumber(shareSince(this.ma) * 100, 1))));
    body.append(h('p', { class: 'muted small' }, L('The universe’s age, temperature and size: the Planck satellite’s 2018 results.', 'La edad, la temperatura y el tamaño del universo: los resultados de 2018 del satélite Planck.')));
    this.shell.openPanel('deeptime', L('What there was then', 'Qué había entonces'), body);
  }

  // ---- Play the story ----------------------------------------------------------------------------------------------

  /** Plays the narrated story from the beat nearest after the present moment (or from the start). */
  /** The chapter's beats: the cosmos's then the Earth's own ones up to the Moon, the Earth's, or all of them. */
  private beats(): Beat[] {
    const d = this.data;
    if (!d) return [];
    const cosmos = d.beatsCosmos ?? [];
    return this.chapter === 'earth' ? d.beats : this.chapter === 'cosmos' ? [...cosmos, ...d.beats.filter((b) => b.ma >= COSMOS_END)] : [...cosmos, ...d.beats];
  }

  async playStory(from?: number) {
    const beats = this.beats();
    if (!beats.length) return;
    this.stopStory(false);
    const my = ++this.token;
    const end = this.chapter === 'cosmos' ? sinceBang(COSMOS_END) : sinceBang(0);
    let i = from ?? Math.max(0, beats.findIndex((b) => tOf(b) >= this.t - 1e-9));
    if (i < 0 || (from == null && this.t >= end - 1)) i = 0;
    this.player = { i, token: my, paused: false };
    document.documentElement.classList.add('dt-playing');
    if (this.bar?.playing) this.bar.toggle();
    this.shell.card.hide();
    this.buildCaption();
    while (this.player && this.player.token === my && this.player.i < beats.length) {
      const b = beats[this.player.i];
      await this.glide(tOf(b), my);
      if (this.player?.token !== my) return;
      this.showBeat(b);
      const text = tx(b.text);
      if (narrationOn()) await speak(text, { lang: lang() });
      else await this.wait(readingTime(text) * 1000, my);
      while (this.player?.token === my && this.player.paused) await this.wait(250, my);
      if (this.player?.token !== my) return;
      this.player.i++;
    }
    if (this.player?.token === my) { this.stopStory(); recordSeen('deeptime', this.chapter === 'earth' ? 'story:life' : `story:${this.chapter}`); }
  }

  private wait(ms: number, my: number) {
    return new Promise<void>((res) => {
      const t0 = performance.now();
      const tick = () => { if (this.player?.token !== my || performance.now() - t0 >= ms) res(); else setTimeout(tick, 100); };
      tick();
    });
  }

  /** Moves the bar to `t` smoothly: faster across quiet stretches (seconds by the story scale's distance). */
  private async glide(t: number, my: number) {
    const ch = this.chapter;
    const p0 = posOfT(this.t, 'story', ch), p1 = posOfT(t, 'story', ch);
    const secs = Math.max(1.2, Math.min(8, Math.abs(p1 - p0) * 60));
    const t0 = performance.now();
    while (this.player?.token === my) {
      if (this.player.paused) { await this.wait(200, my); continue; }
      const f = Math.min(1, (performance.now() - t0) / (secs * 1000));
      const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
      this.setT(f >= 1 ? t : tAt(p0 + (p1 - p0) * e, 'story', ch));
      if (f >= 1) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  private showBeat(b: Beat) {
    const d = this.data!;
    if (this.caption) {
      const txt = this.caption.querySelector('.dt-cap-text');
      if (txt) txt.textContent = tx(b.text);
      const n = this.caption.querySelector('.dt-cap-n');
      if (n) n.textContent = `${(this.player?.i ?? 0) + 1}/${this.beats().length}`;
    }
    // In the cosmos, the scene points at the beat's spot.
    if (this.scene) this.scene.focus = b.focus ?? null;
    if (b.focus) {
      const e = d.events.find((x) => x.id === b.focus);
      const s = e ? null : this.species.find((x) => x.id === b.focus);
      const at = e?.at ? this.place(e.at, e.pl, b.ma) : s ? this.place(s.sites[0].at, s.sites[0].pl, b.ma) : null;
      if (at) this.app.flyTo(at[0], at[1], 2.2);
      if (e?.kind === 'impact') this.anims.push({ e, t0: performance.now() });
    } else if (b.cam) this.app.flyTo(b.cam[0], b.cam[1], b.cam[2]);
  }

  private buildCaption() {
    this.caption?.remove();
    const pause = h('button', { type: 'button', class: 'icon-btn', 'data-deeptime': 'pause', 'aria-label': L('Pause', 'Pausa') }, icon(Pause, 18));
    const prev = h('button', { type: 'button', class: 'icon-btn', 'aria-label': L('Back', 'Volver') }, icon(SkipBack, 18));
    const next = h('button', { type: 'button', class: 'icon-btn', 'data-deeptime': 'next', 'aria-label': L('Next', 'Siguiente') }, icon(SkipForward, 18));
    const stop = h('button', { type: 'button', class: 'icon-btn', 'data-deeptime': 'stop', 'aria-label': L('Stop', 'Detener') }, icon(Square, 16));
    const voice = canSpeak() ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': L('Read aloud', 'Leer en voz alta') }, icon(narrationOn() ? Volume2 : VolumeX, 18)) : null;
    pause.addEventListener('click', () => {
      if (!this.player) return;
      this.player.paused = !this.player.paused;
      if (this.player.paused) stopSpeaking();
      clear(pause); pause.append(icon(this.player.paused ? Play : Pause, 18));
    });
    next.addEventListener('click', () => { if (this.player) void this.playStory(Math.min(this.beats().length - 1, this.player.i + 1)); });
    prev.addEventListener('click', () => { if (this.player) void this.playStory(Math.max(0, this.player.i - 1)); });
    stop.addEventListener('click', () => this.stopStory());
    voice?.addEventListener('click', () => { setNarrationOn(!narrationOn()); clear(voice); voice.append(icon(narrationOn() ? Volume2 : VolumeX, 18)); });
    this.caption = h('div', { class: 'dt-caption glass', 'data-deeptime': 'caption' },
      h('div', { class: 'dt-cap-text', 'aria-live': 'polite' }, ''),
      h('div', { class: 'dt-cap-tools' }, h('span', { class: 'dt-cap-n muted small' }, ''), prev, pause, next, voice, stop));
    this.app.root.append(this.caption);
    this.fitBar();
  }

  stopStory(remove = true) {
    this.token++;
    this.player = null;
    if (this.scene) this.scene.focus = null;
    stopSpeaking();
    if (remove) { this.caption?.remove(); this.caption = null; document.documentElement.classList.remove('dt-playing'); }
  }

  /** The search: past species and events, each opening Deep time at its time. */
  find(q: string, score: (s: string) => number): { s: number; label: string; sub: string; icon: string; at: Pt; go: () => void }[] {
    const out: { s: number; label: string; sub: string; icon: string; at: Pt; go: () => void }[] = [];
    if (!this.data) return out;
    for (const s of this.species) {
      const sc = Math.max(score(s.name.en), score(s.name.es), s.common ? Math.max(score(s.common.en), score(s.common.es)) : 0);
      const mid = s.alive ? s.from / 2 : (s.from + s.to) / 2;
      if (sc > 0) out.push({ s: sc, label: tx(s.common ?? s.name), sub: L('Deep time · {0}', 'Tiempo profundo · {0}', agoText(s.from)), icon: s.icon, at: s.sites[0].at, go: () => void this.enter(mid).then(() => { this.setMa(mid); this.showSpecies(s, true); }) });
    }
    for (const e of this.data.events) {
      const sc = Math.max(score(e.name.en), score(e.name.es));
      if (sc > 0) out.push({ s: sc - 2, label: tx(e.name), sub: L('Deep time · {0}', 'Tiempo profundo · {0}', whenText(tOf(e))), icon: this.kindIcon(e.kind), at: e.at ?? [0, 0], go: () => void this.enter(e.ma, { t: tOf(e) }).then(() => { this.setT(tOf(e)); this.showEvent(e, true); }) });
    }
    return out.sort((a, b) => b.s - a.s).slice(0, 12);
  }

  /** Today on the cosmic calendar: the moment of deep time that falls on today's date ("24 November: …"). */
  calendarMa(day: string): number {
    const [y, m, dd] = day.split('-').map(Number);
    const doy = (Date.UTC(y, m - 1, dd) - Date.UTC(y, 0, 1)) / 864e5;
    return 13787 * (1 - (Math.min(364, doy) + 0.5) / 365);
  }
  dayLine(day: string): string | null {
    const ma = this.calendarMa(day);
    // The nearest event on either side of the Earth's birth (the cosmos's before September, the Earth's after).
    const pool = this.data?.events.filter((e) => (ma > EARTH_MA) === (e.ma > EARTH_MA)) ?? [];
    const e = pool.slice().sort((a, b) => Math.abs(a.ma - ma) - Math.abs(b.ma - ma))[0];
    if (!e) return ma > EARTH_MA ? L('On the cosmic calendar, today is {0}: the Earth has not formed yet', 'En el calendario cósmico, hoy es {0}: la Tierra aún no se ha formado', agoText(ma).toLowerCase()) : null;
    return L('On the cosmic calendar, today is {0}: {1}', 'En el calendario cósmico, hoy es {0}: {1}', agoText(ma).toLowerCase(), tx(e.name));
  }
  async openDay(day: string) {
    await this.load();
    const ma = this.calendarMa(day);
    await this.enter(ma, { chapter: chapterFor(ma) });
    this.setMa(ma);
  }

  /**
   * A link: #deeptime=66 (an age in Ma), #deeptime=t380000 (years after the Big Bang, for the first million years) or
   * #deeptime=tyrannosaurus (a species or an event, at its time); &ch=all for Big Bang to today.
   */
  async openLink(v: string, chapterParam?: string) {
    await this.load();
    // The chapter comes with the link (main.ts reads it before the app rewrites the address).
    const ch = (chapterParam ?? new URLSearchParams(location.hash.slice(1)).get('ch')) as Chapter | null;
    const chapter = ch === 'cosmos' || ch === 'earth' || ch === 'all' ? ch : undefined;
    const n = Number(v);
    const tv = /^t[0-9.e+-]+$/i.test(v.trim()) ? Number(v.trim().slice(1)) : NaN;
    if (Number.isFinite(tv)) { await this.enter(maOfT(tv), { chapter, t: tv }); this.setT(tv); return; }
    if (v.trim() && Number.isFinite(n)) { await this.enter(n, { chapter }); this.setMa(n); return; }
    const e = this.data?.events.find((x) => x.id === v);
    const s = e ? null : this.species.find((x) => x.id === v);
    const t = e ? tOf(e) : sinceBang(s ? (s.alive ? s.from / 2 : (s.from + s.to) / 2) : 250);
    await this.enter(maOfT(t), { chapter, t });
    this.setT(t);
    if (e) this.showEvent(e, true); else if (s) this.showSpecies(s, true);
  }

  /** The menu entry. */
  menu() {
    this.shell.addMenu({ id: 'deeptime', icon: Hourglass, label: () => L('Deep time', 'El tiempo profundo'), order: 10.5, group: 'explore', onClick: () => void (this.active ? this.setChapter('earth', this.ma > EARTH_MA ? sinceBang(EARTH_MA) : this.t) : this.enter(EARTH_MA, { chapter: 'earth' })) });
    this.shell.addMenu({ id: 'bigbang', icon: Orbit, label: () => L('From the Big Bang', 'Desde el Big Bang'), order: 10.6, group: 'explore', onClick: () => void (this.active ? this.setChapter('cosmos', 0) : this.enter(BIG_BANG_MA, { chapter: 'cosmos', t: 0 })) });
  }
}
