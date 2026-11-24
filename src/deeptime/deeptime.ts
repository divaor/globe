// Deep time (v0.45.0): Explore → Deep time. One timeline from the Earth's first days to today on the globe, joined
// with the plate model ("Pangea to today", which it replaces): the continents move, the planet's look changes (a
// magma ocean, an orange haze, rusty bare land, Snowball Earths, ice caps, green land), the great eruptions glow
// where they happened, the asteroid strikes, and past species appear at their fossil sites while they lived. At any
// moment: the eon, era and period, the Earth's vital signs with a plain "could you survive here?", and what lived
// then. "Play the story" flies through it with a narration that waits for the voice (or for time to read).
// The parts that need no page are in logic.ts (scripts/test/deeptime.mjs).
import { Hourglass, Clapperboard, Scale, Layers, SkipForward, SkipBack, Square, Pause, Play, Volume2, VolumeX } from 'lucide';
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
  vitalsAt, survival, aliveAt, eventsAt, maAt, posOf, ago, cosmicDate, shareSince, look, crust, readingTime, EARTH_MA,
  type DeepData, type Species, type DEvent, type Scale as TimeScale, type Vitals, type Level,
} from './logic';
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
};
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
    return { active: this.active, ma: this.ma, scale: this.scale, plain: this.plain, loaded: !!this.data, species: this.species.length, events: this.data?.events.length ?? 0, hits: this.hits.length, anims: this.anims.length, playing: !!this.player && !this.player.paused, beat: this.player?.i ?? null };
  }

  async load(): Promise<DeepData> {
    if (this.data) return this.data;
    const [d, s] = await Promise.all([loadJSON<DeepData>('deeptime/deeptime.json'), loadJSON<{ species: Species[] }>('deeptime/species.json')]);
    this.data = d;
    this.species = s.species;
    return d;
  }

  /** Opens Deep time at `ma` (Pangea, 250 million years ago, by default). */
  async enter(ma = 250, o: { plain?: boolean } = {}) {
    if (this.active) { this.setMa(ma); return; }
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
    this.ma = Math.max(0, Math.min(EARTH_MA, ma));
    this.lastMa = this.ma;
    this.buildBar();
    this.top = h('div', { class: 'dt-top glass', 'data-deeptime': 'top' });
    this.vitalsEl = h('div', { class: 'dt-vitals glass', 'data-deeptime': 'vitals' });
    this.vitalsEl.addEventListener('click', () => { this.vitalsOpen = !this.vitalsOpen; this.renderVitals(); });
    app.root.append(this.top, this.vitalsEl);
    this.renderHud();
    if (app.renderer.view.current.kind === 'globe') app.renderer.view.flyTo({ lon: 15, lat: 10, zoom: 1 }, 1200);
    app.emit('mode', 'deeptime');
    app.renderer.requestRender();
  }
  private saved: { stack: string[]; projection: string } = { stack: [], projection: '' };

  async exit() {
    if (!this.active) return;
    this.stopStory();
    const app = this.app;
    this.bar?.destroy(); this.bar = null;
    this.top?.remove(); this.top = null;
    this.vitalsEl?.remove(); this.vitalsEl = null;
    this.caption?.remove(); this.caption = null;
    this.anims = [];
    app.renderer.view.insetBottom = 0;
    app.mode = null;
    document.documentElement.classList.remove('mode-time', 'mode-deeptime');
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
    const sc = this.scale;
    const pos = (ma: number) => posOf(ma, sc);
    const eons = units.filter((u) => u.rank === 'eon');
    const periods = units.filter((u) => u.rank === 'period');
    const bands = (sc === 'story' ? [...eons.filter((u) => u.end >= 541), ...periods.filter((u) => u.start <= 541)] : eons)
      .map((u) => ({ from: pos(Math.min(u.start, EARTH_MA)), to: pos(u.end), color: u.color, label: unitName(u) }));
    const ticks = (sc === 'story' ? [4000, 2500, 1000, 541, 252, 66, 0] : [4000, 3000, 2000, 1000, 0]).map((m) => ({ at: pos(m), label: m ? (m >= 1000 ? `${fmtNumber(m / 1000, 1)} Ga` : `${m} Ma`) : L('Today', 'Hoy') }));
    this.bar = new TimeBar({
      title: L('Deep time', 'El tiempo profundo'),
      format: (f) => agoText(maAt(f, this.scale)),
      caption: (f) => this.captionFor(maAt(f, this.scale)),
      bands, ticks, start: 0, end: 1, pos: pos(this.ma),
      rate: 0.012,
      onPos: (f) => this.onTime(maAt(f, this.scale)),
      onExit: () => void this.exit(),
      onList: () => this.openNow(),
      listLabel: L('What lived then', 'Qué vivía entonces'),
    });
    // The bar's own tools: play the story, the scale, continents only.
    const tools = this.bar.el.querySelector('.tb-tools');
    const story = h('button', { type: 'button', class: 'pill sm', 'data-deeptime': 'story', title: L('Play the story, narrated', 'Reproducir la historia narrada') }, icon(Clapperboard, 16), h('span', { class: 'tb-list-label' }, L('Play the story', 'Reproducir la historia')));
    story.addEventListener('click', () => void this.playStory());
    const scale = h('button', { type: 'button', class: 'icon-btn', 'data-deeptime': 'scale', title: this.scale === 'story' ? L('True scale: every million years the same width', 'Escala real: cada millón de años del mismo ancho') : L('Story scale: more room for the busy recent past', 'Escala de historia: más espacio para el pasado reciente') }, icon(Scale, 18));
    scale.addEventListener('click', () => { this.scale = this.scale === 'story' ? 'true' : 'story'; this.buildBar(); this.shell.toast(this.scale === 'true' ? L('True scale: see how little of the time is ours', 'Escala real: mira qué poco del tiempo es nuestro') : L('Story scale', 'Escala de historia'), 2500); });
    const plain = h('button', { type: 'button', class: `icon-btn${this.plain ? ' on' : ''}`, 'data-deeptime': 'plain', title: L('Continents only', 'Solo continentes'), 'aria-pressed': String(this.plain) }, icon(Layers, 18));
    plain.addEventListener('click', () => { this.plain = !this.plain; this.buildBar(); this.renderHud(); this.app.renderer.requestRender(); });
    tools?.prepend(story, scale, plain);
    this.app.root.append(this.bar.el);
    requestAnimationFrame(() => { if (this.bar) { this.app.renderer.view.insetBottom = this.bar.coveredHeight(); this.app.renderer.requestRender(); } });
  }

  private captionFor(ma: number): string {
    const w = this.world;
    if (!w) return '';
    const parts = ['period', 'era', 'eon'].map((r) => w.unit(ma, r)).filter((u): u is Unit => !!u).map(unitName);
    return parts.join(' · ');
  }

  /** Moves to `ma` (from code: the story, a card's "Go to its time", a link). */
  setMa(ma: number) {
    if (!this.bar) return;
    this.bar.setPos(posOf(Math.max(0, Math.min(EARTH_MA, ma)), this.scale));
  }

  private onTime(ma: number) {
    const prev = this.ma;
    this.ma = ma;
    // Moving forward through an impact starts its animation.
    if (this.data && !this.plain && ma < prev) for (const e of this.data.events) if (e.kind === 'impact' && e.ma <= prev && e.ma > ma && prev - ma < 5) this.anims.push({ e, t0: performance.now() });
    this.lastMa = prev;
    this.keepPlace();
    this.renderHud();
    this.app.renderer.requestRender();
  }

  /** The address keeps the moment, so Share sends it (#deeptime=66), at most a few times a second. */
  private placeAt = 0;
  private keepPlace() {
    const now = performance.now();
    if (now - this.placeAt < 400) return;
    this.placeAt = now;
    const v = this.ma >= 100 ? Math.round(this.ma) : this.ma >= 1 ? Math.round(this.ma * 10) / 10 : Math.round(this.ma * 10000) / 10000;
    history.replaceState(history.state, '', `#deeptime=${v}&p=${this.app.projection}&lang=${lang()}`);
  }

  // ---- The heads-up display ----------------------------------------------------------------------------------------

  private renderHud() {
    const w = this.world, d = this.data;
    if (!w || !d || !this.top) return;
    const ma = this.ma;
    clear(this.top);
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
    if (ma > PALEO_MAX_MA && !this.plain) this.top.append(h('div', { class: 'dt-note muted small' }, L('Before a billion years ago no one knows where the land was: the continents here are an impression.', 'Antes de hace mil millones de años nadie sabe dónde estaba la tierra: estos continentes son una impresión.')));
    this.renderVitals();
  }

  private renderVitals() {
    const el = this.vitalsEl, d = this.data;
    if (!el || !d) return;
    el.hidden = this.plain;
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
    if (!w || !d || !this.active) return;
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
    if (!this.active || !d || this.plain) return;
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
    const rows: InfoRow[] = [{ icon: '📅', label: L('When', 'Cuándo'), value: e.to != null ? this.when(e.ma, e.to) : `${agoText(e.ma)}${e.err ? ` (± ${fmtNumber(e.err, e.err < 1 ? 2 : 0)} Ma)` : ''}` }];
    if (k) rows.push({ icon: k.icon, label: L('Kind', 'Tipo'), value: tx(k.name) });
    if (e.sure === 'debated') rows.push({ icon: '❓', label: L('Certainty', 'Certeza'), value: L('Debated', 'Debatido') });
    if (e.first) rows.push({ icon: '🥇', label: L('A first', 'Un primero'), value: L('The first time in Earth’s history', 'La primera vez en la historia de la Tierra') });
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    const href = wikiHref(e.wiki);
    if (href) links.push({ label: 'Wikipedia', href });
    if (Math.abs(this.ma - e.ma) > this.window(this.ma)) links.push({ label: L('Go to that moment', 'Ir a ese momento'), onClick: () => this.setMa(e.ma) });
    if (e.story) links.push({ label: L('Open its story', 'Abrir su historia'), onClick: () => void this.exit().then(() => this.app.emit('open-story', 'life', e.story![0], e.story![1])) });
    this.shell.card.showCustom(k?.icon ?? '•', tx(e.name), agoText(e.ma), rows, links, [tx(e.text)], e.wiki ? wikiThumb(e.wiki) : undefined);
    if (fly && e.at) { const at = this.place(e.at, e.pl, e.ma); this.app.flyTo(at[0], at[1], 2.5); }
    if (e.kind === 'impact' && Math.abs(this.ma - e.ma) < 1) this.anims.push({ e, t0: performance.now() });
  }

  /** What lived then: the eras, the vital signs, what is happening, and every species alive, by where they lived. */
  openNow() {
    const d = this.data, w = this.world;
    if (!d || !w) return;
    const ma = this.ma;
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

  // ---- Play the story ----------------------------------------------------------------------------------------------

  /** Plays the narrated story from the beat nearest after the present moment (or from the start). */
  async playStory(from?: number) {
    const d = this.data;
    if (!d?.beats.length) return;
    this.stopStory(false);
    const my = ++this.token;
    let i = from ?? Math.max(0, d.beats.findIndex((b) => b.ma <= this.ma + 1e-9));
    if (i < 0 || (from == null && this.ma < 0.001)) i = 0;
    this.player = { i, token: my, paused: false };
    if (this.bar?.playing) this.bar.toggle();
    this.shell.card.hide();
    this.buildCaption();
    while (this.player && this.player.token === my && this.player.i < d.beats.length) {
      const b = d.beats[this.player.i];
      await this.glide(b.ma, my);
      if (this.player?.token !== my) return;
      this.showBeat(b);
      const text = tx(b.text);
      if (narrationOn()) await speak(text, { lang: lang() });
      else await this.wait(readingTime(text) * 1000, my);
      while (this.player?.token === my && this.player.paused) await this.wait(250, my);
      if (this.player?.token !== my) return;
      this.player.i++;
    }
    if (this.player?.token === my) { this.stopStory(); recordSeen('deeptime', 'story:life'); }
  }

  private wait(ms: number, my: number) {
    return new Promise<void>((res) => {
      const t0 = performance.now();
      const tick = () => { if (this.player?.token !== my || performance.now() - t0 >= ms) res(); else setTimeout(tick, 100); };
      tick();
    });
  }

  /** Moves the bar to `ma` smoothly: faster across quiet stretches (seconds by the story scale's distance). */
  private async glide(ma: number, my: number) {
    const p0 = posOf(this.ma, 'story'), p1 = posOf(ma, 'story');
    const secs = Math.max(1.2, Math.min(8, Math.abs(p1 - p0) * 60));
    const t0 = performance.now();
    while (this.player?.token === my) {
      if (this.player.paused) { await this.wait(200, my); continue; }
      const f = Math.min(1, (performance.now() - t0) / (secs * 1000));
      const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
      this.setMa(maAt(p0 + (p1 - p0) * e, 'story'));
      if (f >= 1) return;
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  private showBeat(b: DeepData['beats'][number]) {
    const d = this.data!;
    if (this.caption) {
      const txt = this.caption.querySelector('.dt-cap-text');
      if (txt) txt.textContent = tx(b.text);
      const n = this.caption.querySelector('.dt-cap-n');
      if (n) n.textContent = `${(this.player?.i ?? 0) + 1}/${d.beats.length}`;
    }
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
    next.addEventListener('click', () => { if (this.player) void this.playStory(Math.min((this.data?.beats.length ?? 1) - 1, this.player.i + 1)); });
    prev.addEventListener('click', () => { if (this.player) void this.playStory(Math.max(0, this.player.i - 1)); });
    stop.addEventListener('click', () => this.stopStory());
    voice?.addEventListener('click', () => { setNarrationOn(!narrationOn()); clear(voice); voice.append(icon(narrationOn() ? Volume2 : VolumeX, 18)); });
    this.caption = h('div', { class: 'dt-caption glass', 'data-deeptime': 'caption' },
      h('div', { class: 'dt-cap-text', 'aria-live': 'polite' }, ''),
      h('div', { class: 'dt-cap-tools' }, h('span', { class: 'dt-cap-n muted small' }, ''), prev, pause, next, voice, stop));
    this.app.root.append(this.caption);
    if (this.bar) this.caption.style.bottom = `${this.bar.coveredHeight() + 10}px`;
  }

  stopStory(remove = true) {
    this.token++;
    this.player = null;
    stopSpeaking();
    if (remove) { this.caption?.remove(); this.caption = null; }
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
      if (sc > 0) out.push({ s: sc - 2, label: tx(e.name), sub: L('Deep time · {0}', 'Tiempo profundo · {0}', agoText(e.ma)), icon: this.kindIcon(e.kind), at: e.at ?? [0, 0], go: () => void this.enter(e.ma).then(() => { this.setMa(e.ma); this.showEvent(e, true); }) });
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
    if (ma > EARTH_MA) return L('On the cosmic calendar, today is {0}: the Earth has not formed yet', 'En el calendario cósmico, hoy es {0}: la Tierra aún no se ha formado', agoText(ma).toLowerCase());
    const e = this.data?.events.slice().sort((a, b) => Math.abs(a.ma - ma) - Math.abs(b.ma - ma))[0];
    return e ? L('On the cosmic calendar, today is {0}: {1}', 'En el calendario cósmico, hoy es {0}: {1}', agoText(ma).toLowerCase(), tx(e.name)) : null;
  }
  async openDay(day: string) {
    await this.load();
    const ma = Math.min(EARTH_MA, this.calendarMa(day));
    await this.enter(ma);
    this.setMa(ma);
  }

  /** A link: #deeptime=66 (an age in Ma) or #deeptime=tyrannosaurus (a species or an event, at its time). */
  async openLink(v: string) {
    await this.load();
    const n = Number(v);
    if (v.trim() && Number.isFinite(n)) { await this.enter(n); this.setMa(n); return; }
    const e = this.data?.events.find((x) => x.id === v);
    const s = e ? null : this.species.find((x) => x.id === v);
    const ma = e ? e.ma : s ? (s.alive ? s.from / 2 : (s.from + s.to) / 2) : 250;
    await this.enter(ma);
    this.setMa(ma);
    if (e) this.showEvent(e, true); else if (s) this.showSpecies(s, true);
  }

  /** The menu entry. */
  menu() {
    this.shell.addMenu({ id: 'deeptime', icon: Hourglass, label: () => L('Deep time', 'El tiempo profundo'), order: 10.5, group: 'explore', onClick: () => void this.enter(this.active ? this.ma : 4540) });
  }
}
