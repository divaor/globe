// Beyond Earth: the Space button opens a panel of worlds (and the solar system view); picking one shows it on the
// globe with its own bar: its maps (photo, heights, clouds), its named places and landing sites, the 3D view, its
// facts, and the way back to Earth. A shared link opens a world (#world=moon).
import { Orbit, X, Info, Mountain, Tag, Rocket, Earth as EarthIcon, ChevronDown } from 'lucide';
import { h, icon, clear } from '../ui/dom';
import { dataUrl } from '../data/store';
import { terrainActions, type Terrain3DContext } from '../layers/terrainActions';
import { wikiThumb } from '../modes/stories';
import { WORLDS, worldById, tr, L, loadFacts, BIG_TYPES, TYPE_NAMES, type WorldDef, type WorldMap, type Facts } from './worlds';
import { WorldSurface, LANDING_ICON } from './surface';
import type { Hit } from '../ui/search';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { TimeTravel } from '../modes';
import type { InfoRow } from '../layers/types';

const KIND: Record<WorldDef['kind'], { en: string; es: string }> = {
  planet: { en: 'Planet', es: 'Planeta' }, moon: { en: 'Moon', es: 'Luna' }, dwarf: { en: 'Dwarf planet', es: 'Planeta enano' }, asteroid: { en: 'Asteroid', es: 'Asteroide' },
};
const MAP_NAME: Record<WorldMap['id'], { en: string; es: string }> = {
  photo: { en: 'Surface', es: 'Superficie' }, elev: { en: 'Heights', es: 'Alturas' }, clouds: { en: 'Clouds', es: 'Nubes' },
};
const ofParent = (w: WorldDef) => {
  if (w.kind !== 'moon') return tr(KIND[w.kind]);
  if (w.parent === 'earth') return L("Earth's moon", 'El satélite de la Tierra');
  const p = worldById(w.parent);
  return `${L('Moon of', 'Luna de')} ${p ? tr(p.name) : w.parent}`;
};
export const thumbUrl = (id: string) => dataUrl(`worlds/thumbs/${id}.png`);

export class Space {
  readonly surface: WorldSurface;
  private bar: HTMLElement | null = null;
  private savedStack: string[] = [];
  private savedProjection: string | null = null;
  /** Set by the orrery (orrery.ts), which opens from the panel. */
  openOrrery: (() => void) | null = null;
  closeOrrery: (() => void) | null = null;

  constructor(private app: App, private shell: Shell, private time: TimeTravel) {
    this.surface = new WorldSurface(app);
    time.add({
      id: 'world', icon: '🪐', hidden: true, title: () => L('Other worlds', 'Otros mundos'), desc: () => '',
      enter: () => this.enter('moon'), exit: () => this.exit(), tap: (lon, lat, x, y) => this.tap(lon, lat, x ?? 0, y ?? 0),
    });
    shell.addDock({ id: 'space', icon: Orbit, label: () => L('Space', 'Espacio'), order: 35, onClick: () => this.open() });
    app.on('lang', () => { if (this.bar) this.buildBar(); if (shell.sheet.isOpen('space')) this.open(true); });
    app.on('interactEnd', () => this.saveHash());
    this.surface.onChange(() => { if (this.bar) this.buildBar(); });
    // Search finds this world's named places and landings.
    shell.search.provider = () => (this.active && this.surface.def && !this.surface.bare ? {
      hint: () => L(`Search places on ${tr(this.surface.def!.name)}`, `Buscar lugares en ${tr(this.surface.def!.name)}`),
      search: (q, score) => this.searchHits(score),
    } : null);
    // The 3D view of the Moon and Mars (see ui/terrain3d.ts).
    terrainActions.context = () => (this.active && this.surface.def?.heights ? this.context3d() : null);
  }

  /** The named places and landings of this world that match a search. */
  private searchHits(score: (name: string) => number): Hit[] {
    const s = this.surface, w = s.def!;
    const out: Hit[] = [];
    const ui = { card: (ic: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>) => this.shell.card.showCustom(ic, title, sub, rows, links, notes, image) };
    const fly = (lon: number, lat: number, zoom: number, then: () => void) => { this.app.renderer.view.flyTo({ lon, lat, zoom }, 1300); this.app.renderer.requestRender(); setTimeout(then, 1350); };
    (s.names?.rows ?? []).forEach((r, i) => {
      const common = s.label(r[2]);
      const sc = Math.max(score(r[2]), common !== r[2] ? score(common) : 0);
      if (sc <= 0) return;
      const zoom = Math.max(1.2, Math.min(60, (0.8 * w.radius) / Math.max(1, r[4])));
      out.push({ kind: 'place', lon: r[0], lat: r[1], label: common, sub: `${tr(TYPE_NAMES[r[3]]) || r[3]}${r[4] ? ` · ${Math.round(r[4])} km` : ''}`, score: sc + Math.log10(Math.max(1, r[4])) * 3, icon: '🏷️', pick: () => fly(r[0], r[1], zoom, () => s.nameCard(i, ui)) });
    });
    for (const l of s.here) {
      const sc = score(tr(l.name));
      if (sc > 0) out.push({ kind: 'place', lon: l.at[0], lat: l.at[1], label: tr(l.name), sub: `${tr(l.agency)} · ${l.date.slice(0, 4)}`, score: sc + 20, icon: LANDING_ICON[l.kind], pick: () => fly(l.at[0], l.at[1], 12, () => s.landingCard(l, ui)) });
    }
    return out;
  }

  /** What the 3D view needs on this world: its heights, its maps as drapes, its biggest names and its sky. */
  private context3d(): Terrain3DContext {
    const w = this.surface.def!;
    const src = (id: WorldMap['id']) => w.maps.find((m) => m.id === id)?.detail?.src;
    const photo = src('photo'), elev = src('elev');
    const mars = w.id === 'mars';
    const names = this.surface.names?.rows ?? [];
    const inBox = ([bw, bs, be, bn]: [number, number, number, number], lon: number, lat: number) =>
      lat >= bs && lat <= bn && (bw <= be ? lon >= bw && lon <= be : lon >= bw || lon <= be);
    return {
      R: w.radius, heights: w.heights!,
      drapes: [
        ...(photo ? [{ id: 'photo', label: L('Surface', 'Superficie'), src: photo }] : []),
        ...(elev ? [{ id: 'elev', label: L('Heights', 'Alturas'), src: elev }] : []),
        { id: 'grey', label: L('Relief', 'Relieve'), palette: mars ? [[-8200, '#4a3024'], [0, '#a8694a'], [21200, '#f2dcc6']] as [number, string][] : [[-9000, '#2e2e30'], [0, '#8c8c8e'], [10700, '#e6e6e6']] as [number, string][] },
      ],
      drape: this.surface.map === 'elev' ? 'elev' : 'photo',
      labels: (box) => names.filter((r) => r[4] > 0 && inBox(box, r[0], r[1]))
        .sort((a, b) => (BIG_TYPES.has(b[3]) ? 2 : 1) * b[4] - (BIG_TYPES.has(a[3]) ? 2 : 1) * a[4]).slice(0, 12)
        .map((r) => ({ name: this.surface.label(r[2]), lon: r[0], lat: r[1] })),
      areaName: (box) => {
        // The biggest named place near the middle of the area.
        const [bw, bs, be, bn] = box;
        const lon0 = bw <= be ? (bw + be) / 2 : ((bw + be + 360) / 2 + 540) % 360 - 180, lat0 = (bs + bn) / 2;
        let best: string | null = null, bd = Infinity;
        for (const r of names) {
          if (!inBox(box, r[0], r[1]) || r[4] <= 0) continue;
          const d = Math.hypot(((r[0] - lon0 + 540) % 360) - 180, r[1] - lat0) / Math.sqrt(r[4]);
          if (d < bd) { bd = d; best = this.surface.label(r[2]); }
        }
        return best ? { en: `Around ${best}, ${w.name.en}`, es: `Alrededor de ${best}, ${w.name.es}` } : w.name;
      },
      kScale: mars ? 0.3 : 0.5,
      sky: mars ? [0.79, 0.62, 0.47] : [0.03, 0.03, 0.05],
      skyCss: mars ? 'linear-gradient(180deg, #b98c68 0%, #e3c3a2 100%)' : 'linear-gradient(180deg, #000 0%, #0d1018 100%)',
    };
  }

  get active() { return this.app.mode === 'world'; }

  // ---- the panel of worlds ------------------------------------------------------------------------

  open(force = false) {
    if (!force && this.shell.sheet.isOpen('space')) { this.shell.sheet.close(); return; }
    const wrap = h('div', { class: 'space-panel' });
    const top = h('div', { class: 'space-actions' });
    const earth = h('button', { type: 'button', class: `pill${this.active ? '' : ' on'}`, 'data-world': 'earth' }, icon(EarthIcon, 16), L('Earth', 'La Tierra'));
    earth.addEventListener('click', () => { this.shell.sheet.close(); void this.exit(); });
    top.append(earth);
    if (this.openOrrery) {
      const orr = h('button', { type: 'button', class: 'pill primary', 'data-space': 'orrery' }, '☀️ ', L('The solar system', 'El sistema solar'));
      orr.addEventListener('click', () => { this.shell.sheet.close(); this.openOrrery!(); });
      top.append(orr);
    }
    const stories = this.time.stories.space;
    if (stories) {
      const st = h('button', { type: 'button', class: 'pill', 'data-space': 'stories' }, '🚀 ', L('Space stories', 'Historias del espacio'));
      st.addEventListener('click', () => void this.time.enter('space'));
      top.append(st);
    }
    wrap.append(h('p', { class: 'muted small' }, L('Visit other worlds on the globe with their real maps: tap a place for its name and story, and see where every spacecraft landed.', 'Visita otros mundos en el globo con sus mapas reales: toca un lugar para ver su nombre y su historia, y mira dónde aterrizó cada nave.')), top);
    const groups: [string, (w: WorldDef) => boolean][] = [
      [L('Planets', 'Planetas'), (w) => w.kind === 'planet'],
      [L('Moons', 'Lunas'), (w) => w.kind === 'moon'],
      [L('Dwarf planets and asteroids', 'Planetas enanos y asteroides'), (w) => w.kind === 'dwarf' || w.kind === 'asteroid'],
    ];
    for (const [title, test] of groups) {
      wrap.append(h('h3', { class: 'sec-title' }, title));
      const grid = h('div', { class: 'world-grid' });
      for (const w of WORLDS.filter(test)) {
        const b = h('button', { type: 'button', class: `world-btn${this.surface.id === w.id && this.active ? ' on' : ''}`, 'data-world': w.id },
          h('img', { src: thumbUrl(w.id), alt: '', width: 64, height: 64, loading: 'lazy' }),
          h('span', { class: 'world-name' }, tr(w.name)), h('span', { class: 'world-sub' }, ofParent(w)));
        b.addEventListener('click', () => { this.shell.sheet.close(); void this.enter(w.id); });
        grid.append(b);
      }
      wrap.append(grid);
    }
    this.shell.openPanel('space', L('Beyond Earth', 'Más allá de la Tierra'), wrap);
  }

  // ---- world mode ---------------------------------------------------------------------------------

  /** Shows a world on the globe (from Earth, a story or another world). */
  async enter(id: string, opts: { map?: WorldMap['id']; camera?: { lon: number; lat: number; zoom: number }; quiz?: boolean } = {}) {
    const w = worldById(id);
    if (!w) return;
    const app = this.app;
    this.closeOrrery?.();
    if (app.mode && app.mode !== 'world') await this.time.modes.find((m) => m.id === app.mode)?.exit();
    this.shell.sheet.close();
    this.shell.card.hide();
    if (!this.active) {
      this.savedStack = app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id);
      this.savedProjection = app.projection;
      app.mode = 'world';
      document.documentElement.classList.add('mode-world');
      app.select(null);
      app.renderer.baseMap = false;
      await app.setStack(['world']);
    }
    this.surface.quiet = false; this.surface.bare = !!opts.quiz;
    const done = this.surface.set(id, opts.map ?? 'photo');
    const cam = opts.camera ?? { lon: w.face[0], lat: w.face[1], zoom: 1 };
    app.renderer.view.flyTo(cam, opts.quiz ? 500 : 900);
    app.renderer.requestRender();
    // A quiz shows no bar: it would give the answer away.
    if (opts.quiz) { this.bar?.remove(); this.bar = null; app.renderer.view.insetBottom = 0; } else this.buildBar();
    app.emit('mode', 'world');
    app.emit('world', id);
    this.saveHash();
    await done;
  }

  /** A quiz question: the world with no names, no markers and no bar, turned to a random side (or to a landing site). */
  async quizShow(id: string, at?: [number, number]) {
    const camera = at ? { lon: at[0], lat: at[1], zoom: 7 } : { lon: Math.random() * 360 - 180, lat: Math.random() * 50 - 25, zoom: 1 };
    await this.enter(id, { camera, quiz: true });
  }

  /** After the answer: the names and the landings come out. */
  quizReveal() {
    this.surface.bare = false;
    this.surface.showNames = true; this.surface.showLandings = true;
    this.app.renderer.requestRender();
  }

  async exit() {
    if (!this.active) return;
    const app = this.app;
    this.bar?.remove(); this.bar = null;
    app.renderer.view.insetBottom = 0;
    await this.surface.set(null);
    app.mode = null;
    document.documentElement.classList.remove('mode-world');
    app.renderer.baseMap = true;
    this.shell.card.hide();
    if (this.shell.sheet.isOpen('space')) this.shell.sheet.close();
    await app.setStack(this.savedStack.length ? this.savedStack : ['political']);
    if (this.savedProjection && this.savedProjection !== app.projection) app.setProjection(this.savedProjection as never);
    app.renderer.view.flyTo({ zoom: 1 }, 700);
    app.emit('mode', null);
    app.emit('world', null);
    app.save();
  }

  private saveHash() {
    if (!this.active || !this.surface.id) return;
    const v = this.app.renderer.view;
    const p = new URLSearchParams({ world: this.surface.id, c: `${v.lon.toFixed(2)},${v.lat.toFixed(2)},${v.zoom.toFixed(2)}`, lang: this.app.lang });
    if (this.surface.map !== 'photo') p.set('map', this.surface.map);
    history.replaceState(null, '', `#${p}`);
  }

  // ---- the bar --------------------------------------------------------------------------------------

  private buildBar() {
    const w = this.surface.def;
    if (!this.active || !w) return;
    this.bar?.remove();
    const pick = h('button', { type: 'button', class: 'wd-pick', 'aria-label': L('Choose a world', 'Elegir un mundo') },
      h('img', { src: thumbUrl(w.id), alt: '', width: 40, height: 40 }),
      h('span', { class: 'wd-head' }, h('span', { class: 'wd-name' }, tr(w.name), icon(ChevronDown, 16)), h('span', { class: 'wd-sub' }, ofParent(w))));
    pick.addEventListener('click', () => this.open());
    const tool = (ic: typeof Info, label: string, cls: string, fn: () => void) => {
      const b = h('button', { type: 'button', class: `icon-btn ${cls}`, title: label, 'aria-label': label }, icon(ic, 18));
      b.addEventListener('click', fn);
      return b;
    };
    const tools = h('div', { class: 'wb-tools' },
      tool(Info, L('About this world', 'Sobre este mundo'), 'wd-info', () => void this.factsCard()),
      ...(w.heights ? [tool(Mountain, L('3D view', 'Vista 3D'), 'wd-3d', () => terrainActions.view3d())] : []),
      tool(X, L('Back to Earth', 'Volver a la Tierra'), 'wd-exit', () => void this.exit()));
    const chips = h('div', { class: 'chip-row wd-chips' });
    if (w.maps.length > 1) for (const m of w.maps) {
      const b = h('button', { type: 'button', class: `chip${this.surface.map === m.id ? ' on' : ''}`, 'data-map': m.id }, tr(MAP_NAME[m.id]));
      b.addEventListener('click', () => { void this.surface.set(w.id, m.id).then(() => this.saveHash()); });
      chips.append(b);
    }
    const toggle = (ic: typeof Tag, label: string, on: boolean, attr: string, fn: () => void) => {
      const b = h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), [attr]: '' }, icon(ic, 14), label);
      b.addEventListener('click', () => { fn(); this.buildBar(); this.app.renderer.requestRender(); });
      return b;
    };
    if (w.names) chips.append(toggle(Tag, L('Names', 'Nombres'), this.surface.showNames, 'data-names', () => { this.surface.showNames = !this.surface.showNames; }));
    if (this.surface.here.length) chips.append(toggle(Rocket, `${L('Landings', 'Aterrizajes')} (${this.surface.here.length})`, this.surface.showLandings, 'data-landings', () => { this.surface.showLandings = !this.surface.showLandings; }));
    const note = w.note ? h('p', { class: 'wd-note muted small' }, tr(w.note)) : null;
    this.bar = h('section', { class: 'worldbar glass', 'aria-label': tr(w.name) }, h('div', { class: 'wb-top' }, pick, tools), chips, note);
    this.app.root.append(this.bar);
    // The map above the bar is what the camera frames.
    requestAnimationFrame(() => {
      if (!this.bar) return;
      const r = this.bar.getBoundingClientRect();
      document.documentElement.style.setProperty('--wd-h', `${Math.round(r.height)}px`);
      this.app.renderer.view.insetBottom = Math.max(0, window.innerHeight - r.top - 8);
      this.app.renderer.requestRender();
    });
  }

  // ---- facts ----------------------------------------------------------------------------------------

  /** The facts card of a world (also from the orrery). */
  async factsCard(id = this.surface.id ?? '', extra: InfoRow[] = []) {
    const f = (await loadFacts()).get(id);
    const w = worldById(id);
    if (!f && !w) return;
    const rows = [...extra, ...factRows(f)];
    const notes = [f?.text ? tr(f.text) : '', f?.wow ? `💡 ${tr(f.wow)}` : '', w?.note ? tr(w.note) : ''].filter(Boolean);
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    if (f?.wiki) links.push({ label: 'Wikipedia', href: `https://${L('en', 'es')}.wikipedia.org/wiki/${encodeURIComponent(tr(f.wiki).replace(/ /g, '_'))}` });
    if (w && !(this.active && this.surface.id === id)) links.push({ label: L('Visit on the globe', 'Visitar en el globo'), onClick: () => void this.enter(id) });
    if (id === 'earth') links.push({ label: L('Back to the Earth', 'Volver a la Tierra'), onClick: () => { this.closeOrrery?.(); void this.exit(); } });
    const name = f ? tr(f.name) : tr(w!.name);
    const KIND_OF: Record<string, { en: string; es: string }> = { star: { en: 'Star', es: 'Estrella' }, planet: KIND.planet, dwarf: KIND.dwarf, comet: { en: 'Comet', es: 'Cometa' }, moon: KIND.moon, asteroid: KIND.asteroid };
    const sub = w ? ofParent(w) : f ? tr(KIND_OF[f.kind] ?? KIND.planet) : '';
    const ic = id === 'sun' ? '☀️' : id === 'halley' ? '☄️' : id === 'earth' ? '🌍' : '🪐';
    this.shell.card.showCustom(ic, name, sub, rows, links, notes, f?.wiki ? wikiThumb(f.wiki) : undefined);
  }

  // ---- taps -----------------------------------------------------------------------------------------

  private tap(lon: number, lat: number, x: number, y: number): boolean {
    const s = this.surface;
    // A quiz question: nothing to tap (a card would give the answer away).
    if (s.bare) return true;
    const ui = { card: (ic: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>) => this.shell.card.showCustom(ic, title, sub, rows, links, notes, image) };
    const l = s.landingAt(x, y);
    if (l) { s.landingCard(l, ui); return true; }
    const i = s.showNames ? s.nameAt(lon, lat, x, y) : null;
    if (i != null) { s.nameCard(i, ui); return true; }
    this.shell.card.hide();
    return true;
  }
}

/** A world's facts as card rows. */
export function factRows(f: Facts | undefined): InfoRow[] {
  if (!f) return [];
  const n = (v: number, d = 0) => v.toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: d });
  const rows: InfoRow[] = [];
  if (f.radius) rows.push({ icon: '📏', label: L('Diameter', 'Diámetro'), value: `${n(f.radius * 2)} km` });
  if (f.gravity) rows.push({ icon: '🪶', label: L('Gravity', 'Gravedad'), value: `${n(f.gravity, 2)} m/s² (${n(f.gravity / 9.81 * 100)} % ${L('of Earth', 'de la Tierra')})` });
  if (f.day) {
    const hrs = Math.abs(f.day);
    const v = hrs > 72 ? `${n(hrs / 24, 1)} ${L('Earth days', 'días terrestres')}` : `${n(hrs, 1)} h`;
    rows.push({ icon: '🔄', label: L('One turn', 'Una vuelta'), value: f.day < 0 ? `${v} (${L('backwards', 'al revés')})` : v });
  }
  if (f.year) rows.push({ icon: '🗓️', label: f.parent === 'sun' ? L('One year', 'Un año') : L('One orbit', 'Una órbita'), value: f.year > 800 ? `${n(f.year / 365.25, 1)} ${L('Earth years', 'años terrestres')}` : `${n(f.year, f.year < 10 ? 2 : 0)} ${L('Earth days', 'días terrestres')}` });
  if (f.distance) rows.push({ icon: '📡', label: f.parent === 'sun' ? L('From the Sun', 'Del Sol') : L('From its planet', 'De su planeta'), value: f.parent === 'sun' ? `${n(f.distance, 1)} ${L('million km', 'millones de km')}` : `${n(f.distance, 1)} ${L('thousand km', 'mil km')}` });
  if (f.moons != null) rows.push({ icon: '🌙', label: L('Moons', 'Lunas'), value: n(f.moons) });
  if (f.temp) rows.push({ icon: '🌡️', label: L('Temperature', 'Temperatura'), value: tr(f.temp) });
  if (f.atmosphere) rows.push({ icon: '💨', label: L('Air', 'Atmósfera'), value: tr(f.atmosphere) });
  if (f.discovered) rows.push({ icon: '🔭', label: L('Discovered', 'Descubrimiento'), value: tr(f.discovered) });
  if (f.firstVisit) rows.push({ icon: '🛰️', label: L('First visit', 'Primera visita'), value: tr(f.firstVisit) });
  return rows;
}
