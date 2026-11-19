// Put it on the map (v0.36.0): a Wordle-style puzzle on the globe. Six things from a country or a region (a river, a
// range, a city, a building...) to put where they are: tap a name, then one of the grey places of its kind (all the
// rivers there as grey lines, the ranges as grey areas, the cities as dots...); on a computer a name can also be
// dragged onto the map. Check: each turns green when right, and yellow to red by how far off it is (against the
// size of the country); the greens stay, the others move; five checks. One puzzle a day, the same for everyone (a
// country one day, a region the next), shared as a grid of coloured squares; any country or region any time.
import { MapPinned, Check as CheckIcon, Shuffle, Share2 } from 'lucide';
import { feature } from 'topojson-client';
import { geoContains } from 'd3-geo';
import type { Topology, GeometryObject } from 'topojson-specification';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { ftile } from '../ui/features';
import { h, icon, clear } from '../ui/dom';
import { subregion, t, dataLang, tx } from '../app/i18n';
import { loadJSON } from '../data/store';
import { L, es, type PlayHost, type HostGame } from '../play/host';
import { shareText } from '../play/pin';
import { recordFeat, dayKey, onReset, type Badge } from '../learn/progress';
import { loadDeck } from '../master/data';
import { CONTS, REGION_CT } from '../fill/logic';
import {
  ITEMS, MIXES, MIX_KINDS, SHAPED, TRIES, byKind, dailyScope, entriesOf, grid, hash, makePuzzle, mark, missColor, playable,
  regionEntries, rng, spanOf, type Cand, type Kind, type Mark, type Mix, type PlaceRow,
} from './logic';
import { onmapState, saveOnmap, resetOnmap } from './store';
import { bell } from '../today/reminders';

const KIND: Record<Kind, { icon: string; en: string; es: string }> = {
  river: { icon: '🌊', en: 'River', es: 'Río' },
  lake: { icon: '💧', en: 'Lake', es: 'Lago' },
  range: { icon: '⛰️', en: 'Mountain range', es: 'Cordillera' },
  desert: { icon: '🏜️', en: 'Desert', es: 'Desierto' },
  peak: { icon: '🗻', en: 'Peak or volcano', es: 'Pico o volcán' },
  city: { icon: '🏙️', en: 'City', es: 'Ciudad' },
  built: { icon: '🏛️', en: 'Heritage or building', es: 'Patrimonio o edificio' },
  park: { icon: '🌲', en: 'National park', es: 'Parque nacional' },
};
const MIX_TEXT: Record<Mix, { icon: string; en: string; es: string }> = {
  all: { icon: '🧭', en: 'Everything', es: 'Todo' }, nature: { icon: '🌿', en: 'Nature', es: 'Naturaleza' }, cities: { icon: '🏙️', en: 'Cities', es: 'Ciudades' }, built: { icon: '🏛️', en: 'Built', es: 'Construido' },
};
const GREEN = '#2ecc71', PLACED = '#4dabf7';

interface Item { c: Cand; k: Kind; given: Cand | null; locked: boolean; last: { m: Mark; off: number; km: number } | null }
interface Session {
  scope: string; mix: Mix; day: string | null; ids: string[];
  cands: Map<Kind, Cand[]>; span: number;
  items: Item[]; active: number | null; changed: boolean;
  rows: Mark[][]; done: boolean; solved: boolean; fold: boolean;
  /** On a phone, while a name is being placed, the card is one line; this shows the six names again. */
  list: boolean;
  note: string;
}
/** A phone (the card is above the map, not beside it). */
const narrow = () => window.innerWidth < 1000;
interface Shape { f: GeoJSON.Feature; line: boolean }

export class PutOnMap implements HostGame {
  private s: Session | null = null;
  private places: PlaceRow[] = [];
  private rows: Record<string, number[][]> = {};
  private shapes = new Map<number, Shape>();
  private deck: { id: string; ct: string }[] = [];
  private okCountries = new Map<Mix, string[]>();
  private okRegions: string[] = [];
  private others = new Map<string, string[]>();
  private regionsLabels: boolean | null = null;
  private loaded: Promise<boolean> | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {
    shell.addMenu({ id: 'onmap', icon: MapPinned, label: () => L('Put it on the map', 'Ponlo en el mapa'), order: 28.6, group: 'play', onClick: () => void this.openPanel() });
    onReset.push(() => resetOnmap());
  }

  // ---- Data
  private load(): Promise<boolean> {
    this.loaded ??= (async () => {
      const [pl, topo, deck] = await Promise.all([
        loadJSON<{ places: PlaceRow[]; countries: Record<string, number[][]> }>('onmap/places.json').catch(() => null),
        loadJSON<Topology>('onmap/shapes.json').catch(() => null),
        loadDeck(),
      ]);
      if (!pl || !topo || !deck) { this.loaded = null; return false; }
      this.places = pl.places;
      this.rows = pl.countries;
      for (const obj of Object.values(topo.objects)) {
        const fc = feature(topo, obj as GeometryObject) as unknown as GeoJSON.FeatureCollection;
        for (const f of fc.features) this.shapes.set((f.properties as { i: number }).i, { f, line: /Line/.test(f.geometry.type) });
      }
      const meta = this.app.data.meta;
      this.deck = deck.countries.filter((c) => !c.t && meta[c.id]).map((c) => ({ id: c.id, ct: c.ct }));
      for (const m of MIXES) this.okCountries.set(m, this.deck.filter((c) => playable(this.candsOf(c.id, m), m)).map((c) => c.id));
      this.okRegions = this.regionNames().filter((r) => playable(this.candsOf(`r:${r}`, 'all'), 'all'));
      return true;
    })();
    return this.loaded;
  }
  /** The data is here (the Map games panel waits for it before showing the puzzle of the day). */
  ready() { return this.load(); }

  private regionNames() { return [...new Set(this.deck.map((c) => this.app.data.meta[c.id]?.sr).filter((x): x is string => !!x && !!REGION_CT[x]))]; }
  /** The countries of a scope: a country (its ISO code), a region ('r:South America') or a continent ('SA'). */
  private members(scope: string): string[] {
    if (scope.startsWith('r:')) { const r = scope.slice(2); return this.deck.filter((c) => this.app.data.meta[c.id]?.sr === r).map((c) => c.id); }
    if (scope.length === 2) return this.deck.filter((c) => (CONTS as readonly string[]).includes(c.ct) ? c.ct === scope : REGION_CT[this.app.data.meta[c.id]?.sr ?? ''] === scope).map((c) => c.id);
    return [scope];
  }
  private candsOf(scope: string, mix: Mix) {
    const entries = scope.length === 3 ? entriesOf(this.rows[scope], this.places) : regionEntries(this.rows, this.members(scope), this.places);
    return byKind(entries, this.places, MIX_KINDS[mix]);
  }
  private name(i: number) { const p = this.places[i]; return es() && p[2] ? p[2] : p[1]; }
  private countryName(id: string) { return this.app.data.name(id, dataLang()); }
  scopeName(scope: string) {
    if (scope.startsWith('r:')) return es() ? subregion(scope.slice(2)) : scope.slice(2);
    if (scope.length === 2) return t(`cont.${scope}`);
    return this.countryName(scope);
  }

  /** What the tests read. */
  get info() {
    const s = this.s;
    if (!s) return null;
    return {
      scope: s.scope, mix: s.mix, day: s.day, done: s.done, solved: s.solved, active: s.active, rows: s.rows.map((r) => r.join('')), span: s.span,
      items: s.items.map((it) => ({ name: this.places[it.c.i][1], k: it.k, i: it.c.i, at: it.c.at, given: it.given?.i ?? null, locked: it.locked, mark: it.last?.m ?? null })),
      cands: Object.fromEntries([...s.cands].map(([k, l]) => [k, l.map((c) => ({ i: c.i, at: c.at, name: this.places[c.i][1] }))])),
    };
  }

  // ---- Starting and stopping
  /** A puzzle: a scope and a mix (the last ones unless given), or the puzzle of the day. */
  async start(o: { scope?: string; mix?: Mix; daily?: boolean; seed?: number } = {}) {
    if (!(await this.load())) { this.shell.toast(L('Put it on the map needs its data; check your connection.', 'Ponlo en el mapa necesita sus datos; revisa tu conexión.')); return; }
    const st = onmapState(), set = st.settings;
    const day = o.daily ? dayKey() : null;
    let scope = o.scope ?? set.scope, mix: Mix = o.mix ?? set.mix;
    if (day) { scope = dailyScope(day, this.okCountries.get('all')!, this.okRegions.map((r) => `r:${r}`)) ?? 'MEX'; mix = 'all'; }
    let cands = this.candsOf(scope, mix);
    if (!playable(cands, mix)) { mix = 'all'; cands = this.candsOf(scope, mix); }
    if (!playable(cands, mix)) { scope = 'MEX'; cands = this.candsOf(scope, mix); }
    if (!day) { set.scope = scope; set.mix = mix; saveOnmap(); }
    const seed = day ? hash(`onmap:${day}:${scope}`) : (o.seed ?? (Date.now() ^ Math.floor(Math.random() * 1e9)));
    const pz = makePuzzle(cands, mix, rng(seed));
    if (!pz) return;
    await this.host.enter(this);
    this.s = {
      scope, mix, day, ids: this.members(scope), cands, span: spanOf(cands),
      items: pz.map((c) => ({ c, k: this.places[c.i][0], given: null, locked: false, last: null })),
      active: 0, changed: false, rows: [], done: false, solved: false, fold: false, list: false, note: '',
    };
    // No state or province names while playing (they would give places away).
    const r0 = this.app.renderer;
    if (this.regionsLabels == null) { this.regionsLabels = r0.regionLabels; r0.regionLabels = false; }
    this.frame();
    this.render();
  }
  async startDaily() { if (await this.load()) await this.start({ daily: true }); }

  async stop() {
    if (!this.s) return;
    this.s = null;
    this.putLabels();
    await this.host.leave(this);
  }
  drop() { this.s = null; this.putLabels(); }
  private putLabels() { if (this.regionsLabels != null) { this.app.renderer.regionLabels = this.regionsLabels; this.regionsLabels = null; } }

  /** Shows the whole scope. */
  private frame() {
    const s = this.s!;
    const pts = [...s.cands.values()].flat().map((c) => c.at);
    const meta = this.app.data.meta;
    for (const id of s.ids) { const m = meta[id]; if (m) pts.push([m.lx, m.ly]); }
    if (!pts.length) return;
    // The middle of its places, and a zoom at which the farthest two fit across the map.
    let x = 0, y = 0, z = 0;
    for (const [a, b] of pts) { const p = (a * Math.PI) / 180, q = (b * Math.PI) / 180; x += Math.cos(q) * Math.cos(p); y += Math.cos(q) * Math.sin(p); z += Math.sin(q); }
    const lon = (Math.atan2(y, x) * 180) / Math.PI, lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    const span = (s.span / 6371) * (180 / Math.PI);
    let zoom = Math.max(1.05, Math.min(14, 210 / Math.max(3, span * 1.15)));
    if (this.app.renderer.view.current.kind === 'flat') zoom = Math.max(1, zoom * 0.7);
    this.app.renderer.view.flyTo({ lon, lat, zoom });
  }

  // ---- Playing
  /** Picks a name to place (the tests call it too). */
  pick(n: number | null) {
    const s = this.s;
    if (!s || s.done) return;
    if (n != null && s.items[n]?.locked) return;
    s.active = n;
    s.list = false;
    this.render();
    this.app.renderer.requestRender();
  }
  /** Puts the picked name on a place of its kind (the tests call it with a place's index). */
  place(i: number) {
    const s = this.s;
    if (!s || s.done || s.active == null) return;
    const it = s.items[s.active];
    const c = s.cands.get(it.k)?.find((x) => x.i === i);
    if (!c) return;
    // A place already given to another name of the same kind: the two swap.
    const other = s.items.find((x) => x !== it && !x.locked && x.given?.i === i);
    if (other) { other.given = it.given; other.last = null; }
    it.given = c;
    it.last = null; // moved: its last mark no longer says anything
    s.changed = true;
    s.note = '';
    // The next name still to place, else none.
    const next = s.items.findIndex((x, j) => j > s.active! && !x.locked && !x.given);
    const any = s.items.findIndex((x) => !x.locked && !x.given);
    s.active = next >= 0 ? next : any >= 0 ? any : null;
    this.render();
    this.app.renderer.requestRender();
  }

  tap(g: [number, number] | null): boolean {
    const s = this.s;
    if (!s || this.host.current !== this) return false;
    if (s.done || !g) return true;
    if (s.active != null) {
      const c = this.candAt(g, s.items[s.active].k);
      if (c) this.place(c.i);
      return true;
    }
    // Nothing picked: a tap on a placed name picks it again, to move it.
    const n = this.placedAt(g);
    if (n != null) this.pick(n);
    return true;
  }

  /** The place of a kind nearest a tap (within reach on the screen; inside an area counts). */
  private candAt(g: [number, number], k: Kind): Cand | null {
    const s = this.s!, view = this.app.renderer.view;
    const tp = view.project(g[0], g[1]);
    if (!tp) return null;
    let best: Cand | null = null, bd = 34;
    for (const c of s.cands.get(k) ?? []) {
      const d = this.screenDist(c, k, tp, g);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  private placedAt(g: [number, number]): number | null {
    const s = this.s!, view = this.app.renderer.view;
    const tp = view.project(g[0], g[1]);
    if (!tp) return null;
    let best: number | null = null, bd = 30;
    s.items.forEach((it, n) => {
      if (it.locked || !it.given) return;
      const d = this.screenDist(it.given, it.k, tp, g);
      if (d < bd) { bd = d; best = n; }
    });
    return best;
  }
  /** How far a place is from a tap on the screen: its point, its line, or its area (0 inside). */
  private screenDist(c: Cand, k: Kind, tp: [number, number], g: [number, number]): number {
    const view = this.app.renderer.view;
    const shape = SHAPED.includes(k) ? this.shapes.get(this.places[c.i][6]) : null;
    if (!shape) { const p = view.project(c.at[0], c.at[1]); return p ? Math.hypot(p[0] - tp[0], p[1] - tp[1]) : Infinity; }
    if (!shape.line && geoContains(shape.f, g)) return k === 'lake' ? 0 : 6; // a lake inside a range is the lake
    let best = Infinity;
    if (k === 'lake') { const p = view.project(c.at[0], c.at[1]); if (p) best = Math.hypot(p[0] - tp[0], p[1] - tp[1]); }
    const walk = (line: number[][]) => {
      let prev: [number, number] | null = null;
      for (const q of line) {
        const p = view.project(q[0], q[1]);
        if (p && prev) best = Math.min(best, segDist(tp, prev, p));
        else if (p) best = Math.min(best, Math.hypot(p[0] - tp[0], p[1] - tp[1]));
        prev = p;
      }
    };
    const geom = shape.f.geometry;
    if (geom.type === 'LineString') walk(geom.coordinates);
    else if (geom.type === 'MultiLineString') geom.coordinates.forEach(walk);
    else if (geom.type === 'Polygon') walk(geom.coordinates[0]);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach((p) => walk(p[0]));
    return best;
  }

  /** Checks the names placed: the greens stay, the others show how far off they are. */
  check() {
    const s = this.s;
    if (!s || s.done || !s.changed || s.items.some((it) => !it.locked && !it.given)) return;
    const row: Mark[] = [];
    for (const it of s.items) {
      if (it.locked) { row.push('g'); continue; }
      it.last = mark(it.c, it.given!, s.span);
      if (it.last.m === 'g') it.locked = true;
      row.push(it.last.m);
    }
    s.rows.push(row);
    s.changed = false;
    s.solved = row.every((m) => m === 'g');
    if (s.solved || s.rows.length >= TRIES) this.finish();
    else {
      const left = s.items.filter((it) => !it.locked).length;
      s.note = L('{0} right. Move the others and check again.', '{0} bien. Mueve los demás y vuelve a comprobar.', ITEMS - left);
      s.active = s.items.findIndex((it) => !it.locked);
      s.list = true; // the colours first, then a name to move
    }
    this.render();
    this.app.renderer.requestRender();
  }

  /** Shows the answers (the tests and "I give up" use it). */
  reveal() {
    const s = this.s;
    if (!s || s.done) return;
    this.finish();
    this.render();
    this.app.renderer.requestRender();
  }

  private finish() {
    const s = this.s!;
    s.done = true; s.active = null;
    const st = onmapState();
    st.played++;
    if (s.solved) { st.solved++; if (s.rows.length === 1) st.first++; }
    if (s.day && !st.dailies[s.day]) st.dailies[s.day] = { scope: s.scope, tries: s.rows.length, solved: s.solved, grid: grid(s.rows) };
    saveOnmap();
    const got: Badge[] = [];
    if (s.solved) got.push(...recordFeat('onmap-solve'));
    if (s.solved && s.rows.length === 1) got.push(...recordFeat('onmap-first'));
    if (Object.values(st.dailies).filter((d) => d.solved).length >= 7) got.push(...recordFeat('onmap-week'));
    if (got.length) this.shell.toast(`${got[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? got[0].es : got[0].en}`, 4000);
  }

  // ---- The card
  render() {
    const s = this.s;
    const card = this.host.card;
    clear(card);
    if (!s) return;
    const title = `${s.day ? '🗓️' : '📍'} ${s.day ? L('Puzzle of the day', 'Reto del día') : L('Put it on the map', 'Ponlo en el mapa')} · ${this.scopeName(s.scope)}`;
    card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    const greens = s.items.filter((it) => it.locked).length;
    card.append(h('div', { class: 'hop-stats', 'data-onmap': 'status' }, `${MIX_TEXT[s.mix].icon} ${tx(MIX_TEXT[s.mix])} · ${L('Check', 'Comprobación')} ${Math.min(s.rows.length + (s.done ? 0 : 1), TRIES)}/${TRIES} · ✅ ${greens}/${ITEMS}`));
    if (s.done) { this.renderDone(); return; }
    if (s.active != null && narrow() && !s.list && !s.fold) { this.renderPlacing(); return; }
    const prompt = s.active != null
      ? L('Where is {0}? Tap one of the grey {1}.', '¿Dónde está {0}? Toca uno de los grises.', this.name(s.items[s.active].c.i), this.kindPlural(s.items[s.active].k))
      : L('All placed: check them, or tap one to move it.', 'Todo en su sitio: compruébalo, o toca uno para moverlo.');
    card.append(h('div', { class: 'quiz-q onmap-prompt', 'data-onmap': 'prompt' }, prompt));
    if (s.fold) return;
    card.append(this.itemList());
    if (s.note) card.append(h('div', { class: 'tool-hint', 'data-onmap': 'note' }, s.note));
    const ready = s.changed && s.items.every((it) => it.locked || it.given);
    const check = h('button', { type: 'button', class: 'pill sm primary', 'data-onmap': 'check', disabled: !ready }, icon(CheckIcon, 15), L('Check', 'Comprobar'));
    check.addEventListener('click', () => this.check());
    const give = h('button', { type: 'button', class: 'pill sm', 'data-onmap': 'reveal' }, L('Show me', 'Muéstramelo'));
    give.addEventListener('click', () => this.reveal());
    card.append(h('div', { class: 'hop-actions' }, check, give));
    if (!s.rows.length) card.append(h('div', { class: 'tool-hint muted small' }, L('Green is right; yellow is close, red is far off. Five checks; the greens stay.', 'Verde es correcto; amarillo, cerca; rojo, lejos. Cinco comprobaciones; los verdes se quedan.')));
  }
  /** On a phone: only the name being placed, so the map has the room. */
  private renderPlacing() {
    const s = this.s!, card = this.host.card, it = s.items[s.active!];
    const placed = s.items.filter((x) => x.locked || x.given).length;
    const list = h('button', { type: 'button', class: 'pill sm', 'data-onmap': 'list' }, L('All six ({0}/{1})', 'Los seis ({0}/{1})', placed, ITEMS));
    list.addEventListener('click', () => { s.list = true; this.render(); });
    // The whole name (on two lines if it needs them), and under it what it is and what to do.
    card.append(h('div', { class: 'onmap-placing', 'data-onmap': 'placing' },
      h('span', { class: 'onmap-item on' }, h('span', { class: 'onmap-kind' }, KIND[it.k].icon), h('span', { class: 'onmap-name', 'data-onmap': 'placing-name' }, this.name(it.c.i))),
      h('div', { class: 'onmap-placing-row' },
        h('span', { class: 'muted small' }, `${es() ? KIND[it.k].es : KIND[it.k].en} · ${L('tap its place among the grey ones', 'toca su lugar entre los grises')}`), list)));
  }
  private kindPlural(k: Kind) {
    const en: Record<Kind, string> = { river: 'rivers', lake: 'lakes', range: 'ranges', desert: 'deserts', peak: 'peaks', city: 'cities', built: 'places', park: 'parks' };
    return en[k];
  }

  /** The six names: tap one to place it; a check colours them. On a computer one can be dragged onto the map. */
  private itemList(): HTMLElement {
    const s = this.s!;
    const list = h('div', { class: 'onmap-items', 'data-onmap': 'items' });
    s.items.forEach((it, n) => {
      const cls = ['onmap-item', it.locked ? 'g' : it.last ? it.last.m : '', s.active === n ? 'on' : '', it.given && !it.locked ? 'placed' : ''].filter(Boolean).join(' ');
      const b = h('button', { type: 'button', class: cls, 'data-item': String(n), disabled: it.locked || s.done, title: es() ? KIND[it.k].es : KIND[it.k].en },
        h('span', { class: 'onmap-kind' }, KIND[it.k].icon), h('span', { class: 'onmap-name' }, this.name(it.c.i)),
        it.locked ? h('span', { class: 'onmap-mark' }, '✓') : it.last ? h('span', { class: 'onmap-mark' }, `${Math.round(it.last.km)} km`) : null);
      b.addEventListener('click', () => { if (!this.dragged) this.pick(s.active === n ? null : n); this.dragged = false; });
      this.dragFrom(b, n);
      list.append(b);
    });
    return list;
  }

  /** Dragging a name onto the map with a mouse: it lands on the nearest place of its kind. */
  private dragged = false;
  private dragFrom(el: HTMLElement, n: number) {
    el.addEventListener('pointerdown', (e) => {
      const s = this.s;
      if (e.pointerType !== 'mouse' || !s || s.done || s.items[n].locked) return;
      const x0 = e.clientX, y0 = e.clientY;
      let ghost: HTMLElement | null = null;
      const move = (ev: PointerEvent) => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!ghost) { ghost = h('div', { class: 'onmap-ghost' }, `${KIND[s.items[n].k].icon} ${this.name(s.items[n].c.i)}`); document.body.append(ghost); this.dragged = true; }
        ghost.style.left = `${ev.clientX + 10}px`; ghost.style.top = `${ev.clientY + 10}px`;
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
        if (!ghost) return;
        ghost.remove();
        // Dropped on the map (not back on the card or a panel).
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        if (!this.s || !(under instanceof HTMLCanvasElement)) return;
        const r = this.app.renderer.canvasRect();
        const g = this.app.renderer.view.invert(ev.clientX - r.left, ev.clientY - r.top);
        if (!g) return;
        this.s.active = n;
        const c = this.candAt(g as [number, number], this.s.items[n].k);
        if (c) this.place(c.i); else this.render();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  private renderDone() {
    const s = this.s!, card = this.host.card;
    const missed = s.items.filter((it) => !it.locked);
    // Stars like the other games: three for one or two checks, two for three or four, one for five; none unsolved.
    const res = resultCard({ stars: s.solved ? (s.rows.length <= 2 ? 3 : s.rows.length <= 4 ? 2 : 1) : 0,
      headline: s.solved
        ? L('All six on the map in {0, plural, one {# check} other {# checks}}!', '¡Los seis en el mapa en {0, plural, one {# comprobación} other {# comprobaciones}}!', s.rows.length)
        : L('The right places are on the map, in green.', 'Los lugares correctos están en el mapa, en verde.'),
      extra: [s.rows.length ? h('pre', { class: 'onmap-grid', 'data-onmap': 'grid' }, grid(s.rows)) : null,
        missed.length ? h('div', { class: 'tool-hint' }, missed.map((it) => `${KIND[it.k].icon} ${this.name(it.c.i)}`).join(' · ')) : null] });
    res.querySelector('.result-headline')?.setAttribute('data-onmap', 'done');
    card.append(res);
    const actions = h('div', { class: 'result-actions' });
    const add = (label: string, fn: () => void, primary = false, attr = '', ic?: Parameters<typeof icon>[0]) => {
      const b = h('button', { type: 'button', class: `pill${primary ? ' primary' : ''}`, 'data-onmap': attr }, ...(ic ? [icon(ic, 16)] : []), label);
      b.addEventListener('click', fn);
      actions.append(b);
    };
    add(L('Share', 'Compartir'), () => void this.share(), true, 'share', Share2);
    add(L('Another country', 'Otro país'), () => void this.start({ scope: this.randomCountry(s.mix, s.scope), mix: s.mix }), false, 'another', Shuffle);
    add(L('Menu', 'Menú'), () => { void this.stop(); void this.openPanel(); }, false, 'menu');
    res.append(actions);
  }

  /** The share text: the puzzle, the checks, and the grid (a line of six squares per check). */
  shareLine(): string {
    const s = this.s!;
    const head = `📍 ${L('Put it on the map', 'Ponlo en el mapa')}${s.day ? ` ${s.day}` : ''} · ${this.scopeName(s.scope)} ${s.solved ? s.rows.length : 'X'}/${TRIES}`;
    return `${head}\n${grid(s.rows)}\n${location.origin}${location.pathname}`;
  }
  async share() { if (this.s) await shareText(this.shell, this.shareLine()); }

  private randomCountry(mix: Mix, not?: string): string {
    const list = (this.okCountries.get(mix) ?? []).filter((c) => c !== not);
    return list.length ? list[Math.floor(Math.random() * list.length)] : 'MEX';
  }

  // ---- The globe
  draw(rc: RenderCtx) {
    const s = this.s;
    if (!s) return;
    const { ctx } = rc;
    const dark = rc.theme.dark;
    rc.fillCountries(this.outside(s), dark ? 'rgba(4,8,16,0.6)' : 'rgba(255,255,255,0.66)');
    const grey = dark ? 'rgba(205,214,228,0.85)' : 'rgba(70,80,96,0.75)';
    // The grey places of the picked name's kind.
    const act = s.active != null ? s.items[s.active] : null;
    if (act) for (const c of s.cands.get(act.k) ?? []) {
      const taken = s.items.some((it) => it.given?.i === c.i);
      if (!taken) this.drawPlace(rc, act.k, c, grey, 1);
    }
    // The names placed: blue until checked, then green, or yellow to red by how far off.
    const now = performance.now();
    s.items.forEach((it, n) => {
      const at = s.done ? it.c : it.given;
      if (!at) return;
      const col = s.done || it.locked ? GREEN : it.last ? missColor(it.last.off) : PLACED;
      const pulse = s.active === n ? 1 + 0.25 * Math.sin(now / 180) : 1;
      // After the end, a miss: a line from where it was put to where it is.
      if (s.done && !it.locked && it.given) {
        const a = rc.project(it.given.at[0], it.given.at[1]), b = rc.project(it.c.at[0], it.c.at[1]);
        if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(235,87,87,0.9)'; ctx.stroke(); ctx.setLineDash([]); }
        this.drawPlace(rc, it.k, it.given, 'rgba(235,87,87,0.9)', 1);
      }
      this.drawPlace(rc, it.k, at, col, pulse);
      const p = rc.project(at.at[0], at.at[1]);
      if (p) rc.labels.add({ text: `${KIND[it.k].icon} ${this.name(it.c.i)}`, x: p[0], y: p[1] - 14, priority: 3000 + n, size: 12, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    });
    if (s.active != null) requestAnimationFrame(() => this.app.renderer.requestRender());
  }

  /** A place on the map: its line, its area, or a marker for its kind. */
  private drawPlace(rc: RenderCtx, k: Kind, c: Cand, color: string, scale: number) {
    const { ctx } = rc;
    const shape = SHAPED.includes(k) ? this.shapes.get(this.places[c.i][6]) : null;
    if (shape) {
      ctx.beginPath();
      rc.path(shape.f as never);
      if (shape.line) { ctx.lineWidth = 3.2 * scale; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); return; }
      ctx.globalAlpha = k === 'lake' ? 0.55 : 0.3; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 1.6 * scale; ctx.strokeStyle = color; ctx.stroke();
      if (k !== 'lake') return;
    }
    const p = rc.project(c.at[0], c.at[1]);
    if (!p) return;
    const r = 6.5 * scale;
    ctx.beginPath();
    if (k === 'peak') { ctx.moveTo(p[0], p[1] - r * 1.2); ctx.lineTo(p[0] + r, p[1] + r * 0.8); ctx.lineTo(p[0] - r, p[1] + r * 0.8); ctx.closePath(); }
    else if (k === 'built') { ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath(); }
    else if (k === 'park') ctx.rect(p[0] - r * 0.85, p[1] - r * 0.85, r * 1.7, r * 1.7);
    else ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = rc.theme.dark ? 'rgba(10,16,28,0.9)' : '#fff'; ctx.stroke();
  }
  private outside(s: Session): string[] {
    const key = s.scope;
    let o = this.others.get(key);
    if (!o) { const ins = new Set(s.ids); o = Object.keys(this.app.data.meta).filter((k) => !ins.has(k)); this.others.set(key, o); }
    return o;
  }

  // ---- The panel
  async openPanel() {
    if (!(await this.load())) { this.shell.toast(L('Put it on the map needs its data; check your connection.', 'Ponlo en el mapa necesita sus datos; revisa tu conexión.')); return; }
    const root = h('div', { class: 'onmap-panel' });
    const draw = () => { clear(root); root.append(...this.panel(draw)); };
    draw();
    this.shell.openPanel('onmap', L('Put it on the map', 'Ponlo en el mapa'), root);
  }

  private panel(redraw: () => void): HTMLElement[] {
    const st = onmapState(), set = st.settings;
    const out: HTMLElement[] = [];
    out.push(h('p', { class: 'muted small' }, L('Six places from a country or a region: tap a name, then its place among the grey ones. Green is right; yellow to red, how far off. Five checks.', 'Seis lugares de un país o una región: toca un nombre y luego su lugar entre los grises. Verde es correcto; de amarillo a rojo, qué tan lejos. Cinco comprobaciones.')));
    out.push(this.dailyCard());
    const rb = bell('onmap');
    if (rb) out.push(rb);
    // The mix.
    const mixes = h('div', { class: 'chip-row', 'data-onmap': 'mixes' });
    for (const m of MIXES) {
      const b = h('button', { type: 'button', class: `chip${m === set.mix ? ' on' : ''}`, 'data-mix': m }, `${MIX_TEXT[m].icon} ${tx(MIX_TEXT[m])}`);
      b.addEventListener('click', () => { set.mix = m; saveOnmap(); redraw(); });
      mixes.append(b);
    }
    out.push(h('h3', { class: 'sec-title' }, L('What to place', 'Qué colocar')), mixes);
    // A country: the ones with enough for this mix, by continent.
    const ok = new Set(this.okCountries.get(set.mix) ?? []);
    const sel = h('select', { class: 'select', 'data-onmap': 'country', 'aria-label': L('Country', 'País') }) as HTMLSelectElement;
    const lang = dataLang();
    for (const ct of CONTS) {
      const ids = this.deck.filter((c) => ok.has(c.id) && this.members(ct).includes(c.id)).map((c) => c.id).sort((a, b) => this.countryName(a).localeCompare(this.countryName(b), lang));
      if (!ids.length) continue;
      const grp = h('optgroup', { label: t(`cont.${ct}`) });
      for (const id of ids) grp.append(h('option', { value: id, selected: id === set.scope }, this.countryName(id)));
      sel.append(grp);
    }
    const play = h('button', { type: 'button', class: 'pill sm primary', 'data-onmap': 'play' }, L('Play', 'Jugar'));
    play.addEventListener('click', () => void this.start({ scope: sel.value, mix: set.mix }));
    const rnd = h('button', { type: 'button', class: 'pill sm', 'data-onmap': 'random' }, icon(Shuffle, 15), L('Any country', 'Un país al azar'));
    rnd.addEventListener('click', () => void this.start({ scope: this.randomCountry(set.mix), mix: set.mix }));
    out.push(h('h3', { class: 'sec-title' }, L('A country ({0})', 'Un país ({0})', ok.size)), h('div', { class: 'onmap-row' }, sel, play, rnd));
    // A region or a continent (Everything).
    const regs = h('div', { class: 'chip-row onmap-regions', 'data-onmap': 'regions' });
    const seen = new Set<string>();
    const scopes = [...CONTS.map((c) => c as string), ...this.okRegions.map((r) => `r:${r}`)].filter((sc) => { const n = this.scopeName(sc); if (seen.has(n)) return false; seen.add(n); return true; });
    for (const sc of scopes) {
      if (!playable(this.candsOf(sc, set.mix), set.mix)) continue;
      const b = h('button', { type: 'button', class: 'chip', 'data-scope': sc }, this.scopeName(sc));
      b.addEventListener('click', () => void this.start({ scope: sc, mix: set.mix }));
      regs.append(b);
    }
    out.push(h('h3', { class: 'sec-title' }, L('A continent or a region', 'Un continente o una región')), regs);
    out.push(h('p', { class: 'muted small', 'data-onmap': 'stats' }, L('Played {0} · solved {1} · at the first check {2}', 'Jugados {0} · resueltos {1} · a la primera {2}', st.played, st.solved, st.first)));
    return out;
  }

  /** A day's puzzle, for its reminder (v0.37.1): where, or null before the data is here. */
  dayScope(day: string): string | null {
    const scope = this.loaded ? dailyScope(day, this.okCountries.get('all') ?? [], this.okRegions.map((r) => `r:${r}`)) : null;
    return scope ? this.scopeName(scope) : null;
  }

  dailyCard(): HTMLElement {
    const day = dayKey();
    const scope = this.loaded ? dailyScope(day, this.okCountries.get('all') ?? [], this.okRegions.map((r) => `r:${r}`)) : null;
    const done = onmapState().dailies[day];
    const where = scope ? this.scopeName(scope) : '';
    const b = h('button', { type: 'button', class: `mode-card daily-card${done ? ' done' : ''}`, 'data-onmap': 'daily' }, ftile('onmap'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, L('Put it on the map: today', 'Ponlo en el mapa: hoy')),
        h('span', { class: 'mode-desc' }, done ? `${L('Done', 'Hecho')}: ${done.solved ? done.tries : 'X'}/${TRIES} · ${where}` : `${where} · ${L('the same for everyone today', 'el mismo para todos hoy')}`)));
    b.addEventListener('click', () => void this.startDaily());
    return b;
  }
}

/** Distance from a point to a segment, on the screen. */
function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  const u = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(a[0] + u * dx - p[0], a[1] + u * dy - p[1]);
}

