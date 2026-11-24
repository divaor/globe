// Legacies of past civilizations (v0.44.0): Explore → Legacies. What the Sumerians, Egyptians, Greeks, Mexica,
// Incas and others gave the world that people still use: words, writing, numbers, calendars, science, buildings,
// tools, foods, money, laws, ideas, arts, games and everyday things. For each, where it began, the line of its
// journey to today, and the countries that use it now, darker where it is strongest. Browse by civilization, by
// category, or from a country ("What did Mexico borrow from the past?"): lines from every civilization it borrowed
// from. Links into the time-travel stories, the search box, the country card, "Who gave us this?" (Learn) and two
// badges. Data: scripts/data/legacies/ (README.md), built by build-legacies.mjs into public/data/legacies/.
import { Landmark, Share2, Search } from 'lucide';
import { geoContains, geoDistance, geoInterpolate } from 'd3-geo';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, clear, icon, englishNote } from '../ui/dom';
import { L, tx, lang, flagEmoji, fmtNumber, appLocale } from '../app/i18n';
import { matcher } from '../ui/match';
import { loadJSON, shapesFrom, type Shape } from '../data/store';
import { fmtWhen, itemThumb, seaSafe, legacyHook } from '../modes/stories';
import { recordSeen } from '../learn/progress';
import { shareText } from '../play/pin';
import type { Topology } from 'topojson-specification';
import {
  members, usersOf, borrowed, reach, segments, findLegacies, everywhere, ofTheDay, wordsByType, wordIn, type WordType,
  type LegacyIndex, type CivMeta, type Civ, type Legacy, type Brief, type Cat, type Tx,
} from './logic';

type Pt = [number, number];
/** What the panel and the map show. */
type View =
  | { v: 'home' }
  | { v: 'civ'; civ: string; cat?: string }
  | { v: 'item'; civ: string; id: string }
  | { v: 'country'; iso: string }
  | { v: 'cat'; cat: string };

/** How each civilization gave a thing, in words. */
const HOW_TEXT: Record<string, () => string> = {
  invented: () => L('Invented', 'Inventado'),
  developed: () => L('Developed', 'Desarrollado'),
  spread: () => L('Spread', 'Difundido'),
  named: () => L('Named', 'Nombrado'),
  tamed: () => L('Tamed', 'Domesticado'),
  kept: () => L('Kept alive', 'Preservado'),
};
/** The subjects (their names are the app's, so every language has them). */
const CAT_TEXT: Record<string, () => string> = {
  words: () => L('Words and names', 'Palabras y nombres'),
  writing: () => L('Writing and books', 'Escritura y libros'),
  numbers: () => L('Numbers and maths', 'Números y matemáticas'),
  time: () => L('Time and calendars', 'Tiempo y calendarios'),
  science: () => L('Science and medicine', 'Ciencia y medicina'),
  build: () => L('Buildings and cities', 'Edificios y ciudades'),
  tech: () => L('Tools and technology', 'Herramientas y técnica'),
  food: () => L('Food and farming', 'Comida y agricultura'),
  money: () => L('Money and trade', 'Dinero y comercio'),
  law: () => L('Law and government', 'Leyes y gobierno'),
  ideas: () => L('Ideas and beliefs', 'Ideas y creencias'),
  arts: () => L('Arts and music', 'Artes y música'),
  play: () => L('Games and sport', 'Juegos y deportes'),
  daily: () => L('Daily life', 'Vida cotidiana'),
};
/** The kinds of words, with an icon, the row's label and how the opening sentence says them. */
const WORD_TEXT: Record<WordType, { icon: string; label: () => string; like: (list: string) => string }> = {
  word: { icon: '🗣️', label: () => L('Words', 'Palabras'), like: (x) => L('words like {0}', 'palabras como {0}', x) },
  name: { icon: '👤', label: () => L('Names', 'Nombres'), like: (x) => L('names like {0}', 'nombres como {0}', x) },
  place: { icon: '📍', label: () => L('Places', 'Lugares'), like: (x) => L('place names like {0}', 'nombres de lugares como {0}', x) },
  calendar: { icon: '📅', label: () => L('Days and months', 'Días y meses'), like: (x) => L('the names of days and months like {0}', 'nombres de días y meses como {0}', x) },
  sky: { icon: '✨', label: () => L('Stars and planets', 'Estrellas y planetas'), like: (x) => L('names of stars and planets like {0}', 'nombres de estrellas y planetas como {0}', x) },
};
const andList = (xs: string[]) => new Intl.ListFormat(appLocale(), { type: 'conjunction' }).format(xs);
const SURE_TEXT: Record<string, () => string> = {
  likely: () => L('Likely', 'Probable'),
  debated: () => L('Debated', 'Debatido'),
};

const halo = (dark: boolean) => (dark ? 'rgba(10,16,28,0.7)' : 'rgba(255,255,255,0.85)');
function darker(hex: string, f = 0.7): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export class Legacies {
  private idx: LegacyIndex | null = null;
  private civs = new Map<string, Civ>();
  private homes = new Map<string, Shape>();
  private view: View | null = null;
  private stack: View[] = [];
  /** Which opening of the panel is current: an older panel's close does not clear the map. */
  private token = 0;
  private animAt = 0;
  private hits: { x: number; y: number; r: number; go: () => void }[] = [];
  private arcCache = new Map<string, Pt[]>();
  /** Set by main.ts: leaves a time-travel story (the map is ours again), and starts "Who gave us this?". */
  leaveMode: () => Promise<void> = async () => {};
  startQuiz: () => void = () => {};
  /** For the smoke test: what is shown. */
  get info() { return { view: this.view, loaded: !!this.idx, civs: this.idx?.civs.length ?? 0, legacies: this.idx?.all.length ?? 0, hits: this.hits.length }; }

  constructor(private app: App, private shell: Shell) {
    shell.addMenu({ id: 'legacy', icon: Landmark, label: () => L('Legacies of the past', 'Legados del pasado'), order: 11, group: 'explore', onClick: () => void this.open({ v: 'home' }) });
    // A country's card: what it borrowed from the past.
    shell.card.actions.push((id) => {
      const b = h('button', { type: 'button', class: 'pill', 'data-legacy': 'card' }, icon(Landmark, 16), L('Borrowed from the past', 'Heredado del pasado'));
      b.addEventListener('click', () => { this.shell.card.hide(); void this.open({ v: 'country', iso: id }); });
      return b;
    });
    app.renderer.overlays.add((rc) => this.draw(rc));
    shell.tapHandlers.unshift((x, y, g) => this.tap(x, y, g));
    // The search box finds a legacy by its name or its words ("tomato", "algebra").
    shell.search.extra.push((q, score) => {
      if (!this.idx) { void this.load().catch(() => {}); return []; }
      const civ = new Map(this.idx.civs.map((c) => [c.id, c]));
      return findLegacies(q, this.idx, score, 8).map(({ b, s }) => ({
        kind: 'place' as const, lon: b.at[0], lat: b.at[1], label: tx(b.name), icon: b.icon, score: s + 6,
        sub: `${L('Legacy', 'Legado')} · ${tx(civ.get(b.c)?.name)}`, tag: `🏛️ ${L('Legacies of the past', 'Legados del pasado')}`,
        pick: () => void this.open({ v: 'item', civ: b.c, id: b.id }),
      }));
    });
    // A people story's details: what that civilization gave us.
    legacyHook.details = (kind, id) => this.storyLink(kind, id);
  }

  // ---- data ----------------------------------------------------------------------------------------------------

  async load(): Promise<LegacyIndex> {
    if (this.idx) return this.idx;
    const [idx, topo] = await Promise.all([loadJSON<LegacyIndex>('legacies/index.json'), loadJSON<Topology>('legacies/areas.json').catch(() => null)]);
    if (topo) for (const s of shapesFrom(topo, 'areas')) this.homes.set(s.id, s);
    this.idx = idx;
    return idx;
  }
  async civ(id: string): Promise<Civ | null> {
    let c = this.civs.get(id);
    if (!c) {
      try { c = await loadJSON<Civ>(`legacies/${id}.json`); } catch { return null; }
      this.civs.set(id, c);
    }
    return c;
  }
  private meta(id: string): CivMeta | undefined { return this.idx?.civs.find((c) => c.id === id); }
  private cat(id: string): Cat | undefined { return this.idx?.cats.find((c) => c.id === id); }
  private catName(id: string): string { return CAT_TEXT[id]?.() ?? tx(this.cat(id)?.name); }
  private civName(c: { name: Tx; short?: Tx } | undefined, short = false) { return c ? tx(short && c.short ? c.short : c.name) : ''; }
  private country(iso: string) { return this.app.data.name(iso, lang()) || iso; }
  private flag(iso: string) { return flagEmoji((this.app.data.meta[iso] as { a2?: string } | undefined)?.a2) || '🏳️'; }
  /** The years of a civilization: "3100–30 BC", "AD 750–1258". */
  private years(c: { from: string; to: string }) {
    const a = Number(c.from), b = Number(c.to);
    if (a < 0 && b < 0) return L('{0}–{1} BC', '{0}–{1} a. C.', -a, -b);
    if (a < 0) return L('{0} BC – AD {1}', '{0} a. C. – {1} d. C.', -a, b);
    return `${a}–${b}`;
  }
  /** When a legacy began: "about 2900 BC". */
  private when(l: { date: string; circa?: boolean }) {
    const d = fmtWhen(l.date, Number(l.date) < 0 ? 1 : -1);
    return l.circa ? L('about {0}', 'hacia {0}', d) : d;
  }
  /** The reader's country: the one selected, else the one of the phone's language settings ("es-MX"). */
  private home(): string | null {
    const sel = this.app.selection;
    if (sel && this.app.data.meta[sel]) return sel;
    const region = (navigator.language.split('-')[1] ?? '').toUpperCase();
    if (!region) return null;
    for (const [iso, m] of Object.entries(this.app.data.meta)) if ((m as { a2?: string }).a2 === region) return iso;
    return null;
  }

  // ---- panels --------------------------------------------------------------------------------------------------

  /** Opens a view: the panel and the map. */
  async open(v: View, push = true) {
    let idx: LegacyIndex;
    try { idx = await this.load(); } catch { this.shell.toast(L('Legacies need their data; check your connection.', 'Los legados necesitan sus datos; revisa tu conexión.')); return; }
    if (this.app.mode) await this.leaveMode();
    if (push && this.view && JSON.stringify(this.view) !== JSON.stringify(v)) this.stack.push(this.view);
    if (v.v === 'home') this.stack = [];
    let body: HTMLElement | null = null, title = L('Legacies of the past', 'Legados del pasado');
    if (v.v === 'home') body = this.homePanel(idx);
    else if (v.v === 'civ') {
      const c = await this.civ(v.civ);
      if (!c) { this.shell.toast(L('Legacies need their data; check your connection.', 'Los legados necesitan sus datos; revisa tu conexión.')); return; }
      body = this.civPanel(c, v.cat); title = `${c.icon} ${this.civName(c)}`;
    } else if (v.v === 'item') {
      const c = await this.civ(v.civ);
      const l = c?.legacies.find((x) => x.id === v.id);
      if (!c || !l) { this.shell.toast(L('Legacies need their data; check your connection.', 'Los legados necesitan sus datos; revisa tu conexión.')); return; }
      body = this.itemPanel(c, l); title = `${l.icon} ${tx(l.name)}`;
      const got = recordSeen('legacies', `${c.id}/${l.id}`);
      if (got.length) setTimeout(() => this.shell.toast(`${got[0].icon} ${L('New badge: {0}', 'Nueva insignia: {0}', tx(got[0]))}`), 600);
    } else if (v.v === 'country') { body = this.countryPanel(idx, v.iso); title = `${this.flag(v.iso)} ${this.country(v.iso)}`; }
    else if (v.v === 'cat') { const ct = this.cat(v.cat); body = this.catPanel(idx, v.cat); title = `${ct?.icon ?? ''} ${this.catName(v.cat)}`; }
    if (!body) return;
    this.view = v;
    this.animAt = performance.now();
    const my = ++this.token;
    this.shell.openPanel('legacy', title, body, () => { if (this.token === my) { this.view = null; this.stack = []; this.inset(false); } });
    const sb = this.shell.sheet.el.querySelector('.sheet-body');
    if (sb) sb.scrollTop = 0;
    this.inset(true);
    this.frame(v);
    this.app.renderer.requestRender();
  }

  private insetSet = false;
  /** On a phone the panel covers the lower part of the screen: the globe centres in the part above it. */
  private inset(on: boolean) {
    const v = this.app.renderer.view;
    if (on && !this.app.mode) {
      const r = document.querySelector('.sheet:not([hidden])')?.getBoundingClientRect();
      v.insetBottom = r && r.left < 40 && r.top > 80 ? Math.max(0, Math.round(window.innerHeight - r.top)) : 0;
      this.insetSet = true;
    } else if (!on && this.insetSet) { v.insetBottom = 0; this.insetSet = false; }
    this.app.renderer.requestRender();
  }

  /** The way back to the view before (or to the start). */
  private back(): HTMLElement {
    const prev = this.stack[this.stack.length - 1];
    const label = !prev || prev.v === 'home' ? L('Legacies', 'Legados') : prev.v === 'civ' ? this.civName(this.meta(prev.civ), true) : prev.v === 'country' ? this.country(prev.iso) : prev.v === 'cat' ? this.catName(prev.cat) : L('Back', 'Volver');
    const b = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'back' }, `‹ ${label}`);
    b.addEventListener('click', () => { const p = this.stack.pop(); void this.open(p ?? { v: 'home' }, false); });
    return b;
  }

  private row(ic: string, title: string, sub: string, onClick: () => void, attrs: Record<string, string> = {}, color?: string): HTMLElement {
    const r = h('button', { type: 'button', class: 'guide-item legacy-row', ...attrs },
      h('span', { class: 'guide-item-ic legacy-ic', style: color ? `box-shadow: inset 3px 0 0 ${color}` : '' }, ic),
      h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, title), sub ? h('span', { class: 'guide-item-sub' }, sub) : null));
    r.addEventListener('click', onClick);
    return r;
  }
  private briefRow(b: Brief, withCiv: boolean): HTMLElement {
    const c = this.meta(b.c), ct = this.cat(b.cat);
    const n = this.idx ? members(b.where, this.idx).size : 0;
    const sub = [withCiv ? `${c?.icon ?? ''} ${this.civName(c, true)}` : `${ct?.icon ?? ''} ${this.catName(b.cat)}`, HOW_TEXT[b.how]?.() ?? '',
      everywhere(b.where) ? L('used everywhere', 'se usa en todas partes') : L('{0, plural, one {used in # country} other {used in # countries}}', '{0, plural, one {se usa en # país} other {se usa en # países}}', n),
      b.sure ? SURE_TEXT[b.sure]?.() ?? '' : ''].filter(Boolean).join(' · ');
    return this.row(b.icon, tx(b.name), sub, () => void this.open({ v: 'item', civ: b.c, id: b.id }), { 'data-legacy-item': `${b.c}/${b.id}` }, c ? seaSafe(c.color, false) : undefined);
  }

  private homePanel(idx: LegacyIndex): HTMLElement {
    const body = h('div', { class: 'guide legacy', 'data-legacy': 'home' });
    body.append(h('p', { class: 'muted small' }, L('What past civilizations gave the world that we still use, how it travelled and who uses it today: {0} things from {1} civilizations.', 'Lo que las civilizaciones del pasado le dieron al mundo y que aún usamos, cómo viajó y quién lo usa hoy: {0} cosas de {1} civilizaciones.', fmtNumber(idx.all.length), idx.civs.length)));
    const note = englishNote();
    if (note) body.append(note);
    // Your country.
    const me = this.home();
    const mine = h('div', { class: 'chip-row' });
    if (me) {
      const b = h('button', { type: 'button', class: 'pill', 'data-legacy': 'mine' }, `${this.flag(me)} ${L('What did {0} borrow from the past?', '¿Qué heredó {0} del pasado?', this.country(me))}`);
      b.addEventListener('click', () => void this.open({ v: 'country', iso: me }));
      mine.append(b);
    }
    const pick = h('button', { type: 'button', class: 'pill', 'data-legacy': 'pick' }, `👆 ${L('Tap a country on the map', 'Toca un país en el mapa')}`);
    pick.addEventListener('click', () => this.shell.toast(L('Tap any country: what did it borrow from the past?', 'Toca cualquier país: ¿qué heredó del pasado?'), 3500));
    mine.append(pick);
    body.append(h('h3', { class: 'sec-title' }, L('Where you live', 'Donde vives')), mine);
    // Search.
    const input = h('input', { type: 'search', class: 'guide-search', 'data-legacy': 'find', placeholder: L('Find a legacy: tomato, algebra, the alphabet…', 'Busca un legado: tomate, álgebra, el alfabeto…'), 'aria-label': L('Find a legacy', 'Buscar un legado') }) as HTMLInputElement;
    const found = h('div', { class: 'guide-list', 'data-legacy': 'found' });
    input.addEventListener('input', () => {
      clear(found);
      const q = input.value.trim();
      if (!q) return;
      const hits = findLegacies(q, idx, matcher(q), 20);
      for (const { b } of hits) found.append(this.briefRow(b, true));
      if (!hits.length) found.append(h('p', { class: 'muted small' }, L('Nothing by that name yet.', 'Aún no hay nada con ese nombre.')));
    });
    body.append(input, found);
    // Categories.
    const cats = h('div', { class: 'chip-row', 'data-legacy': 'cats' });
    for (const ct of idx.cats) {
      const n = idx.all.filter((b) => b.cat === ct.id).length;
      if (!n) continue;
      const b = h('button', { type: 'button', class: 'chip', 'data-legacy-cat': ct.id }, `${ct.icon} ${this.catName(ct.id)} · ${n}`);
      b.addEventListener('click', () => void this.open({ v: 'cat', cat: ct.id }));
      cats.append(b);
    }
    body.append(h('h3', { class: 'sec-title' }, L('By subject', 'Por tema')), cats);
    // Civilizations, oldest first.
    const list = h('div', { class: 'guide-list', 'data-legacy': 'civs' });
    for (const c of idx.civs) {
      const top = Object.entries(c.cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => this.cat(k)?.icon ?? '').join('');
      list.append(this.row(c.icon, this.civName(c), `${this.years(c)} · ${L('{0, plural, one {# legacy} other {# legacies}}', '{0, plural, one {# legado} other {# legados}}', c.n)} · ${top}`,
        () => void this.open({ v: 'civ', civ: c.id }), { 'data-legacy-civ': c.id }, c.color));
    }
    body.append(h('h3', { class: 'sec-title' }, L('Civilizations', 'Civilizaciones')), list);
    // The quiz.
    const quiz = h('button', { type: 'button', class: 'pill', 'data-legacy': 'quiz' }, `🏺 ${L('Who gave us this?', '¿Quién nos dio esto?')}`);
    quiz.addEventListener('click', () => { this.shell.sheet.close(); this.startQuiz(); });
    body.append(h('h3', { class: 'sec-title' }, L('Test yourself', 'Ponte a prueba')), h('div', { class: 'chip-row' }, quiz));
    body.append(h('p', { class: 'muted small' }, L('On the map: each civilization’s homeland at its height. Tap one to open it, or tap any country to see what it borrowed.', 'En el mapa: la tierra de cada civilización en su apogeo. Toca una para abrirla, o toca cualquier país para ver lo que heredó.')));
    return body;
  }

  private civPanel(c: Civ, cat?: string): HTMLElement {
    const body = h('div', { class: 'guide legacy', 'data-legacy': 'civ', 'data-civ': c.id });
    body.append(this.back());
    body.append(h('p', { class: 'legacy-head' }, h('span', { class: 'legacy-years' }, this.years(c)), ' · ', L('{0, plural, one {# legacy} other {# legacies}}', '{0, plural, one {# legado} other {# legados}}', c.legacies.length)));
    body.append(h('p', null, tx(c.intro)));
    if (c.today) body.append(h('p', { class: 'muted' }, `🧬 ${tx(c.today)}`));
    const note = englishNote();
    if (note) body.append(note);
    const acts = h('div', { class: 'chip-row' });
    if (c.story) {
      const s = c.story;
      const b = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'story' }, `${s.i} ${L('Its story', 'Su historia')}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); this.app.emit('open-story', s.k, s.s, s.st ?? 0); });
      acts.append(b);
    }
    acts.append(this.shareButton(c.id));
    body.append(acts);
    // Words and names first: what most readers recognise at once.
    const words = this.wordsBlock(c);
    if (words) body.append(...words);
    // Categories as filters.
    const chips = h('div', { class: 'chip-row', 'data-legacy': 'civ-cats' });
    const list = h('div', { class: 'guide-list', 'data-legacy': 'list' });
    const counts = new Map<string, number>();
    for (const l of c.legacies) counts.set(l.cat, (counts.get(l.cat) ?? 0) + 1);
    let on = cat ?? '';
    const fill = () => {
      clear(list);
      for (const l of c.legacies) if (!on || l.cat === on) list.append(this.briefRow({ c: c.id, id: l.id, name: l.name, icon: l.icon, cat: l.cat, how: l.how, t: l.t, at: l.at, where: l.where, strong: l.strong, sure: l.sure }, false));
      for (const b of chips.querySelectorAll<HTMLElement>('[data-legacy-cat]')) b.classList.toggle('on', b.dataset.legacyCat === on);
      if (this.view?.v === 'civ') { this.view = { v: 'civ', civ: c.id, ...(on ? { cat: on } : {}) }; this.app.renderer.requestRender(); }
    };
    const all = h('button', { type: 'button', class: 'chip', 'data-legacy-cat': '' }, L('All · {0}', 'Todos · {0}', c.legacies.length));
    all.addEventListener('click', () => { on = ''; fill(); });
    chips.append(all);
    for (const ct of this.idx?.cats ?? []) {
      const n = counts.get(ct.id);
      if (!n) continue;
      const b = h('button', { type: 'button', class: 'chip', 'data-legacy-cat': ct.id }, `${ct.icon} ${this.catName(ct.id)} · ${n}`);
      b.addEventListener('click', () => { on = on === ct.id ? '' : ct.id; fill(); });
      chips.append(b);
    }
    body.append(h('h3', { class: 'sec-title' }, L('What they gave us', 'Lo que nos dieron')), chips, list);
    fill();
    body.append(h('p', { class: 'muted small' }, L('On the map: the countries that use what they gave, darker where more of it is used, and the lines of its journeys.', 'En el mapa: los países que usan lo que dejaron, más oscuros donde se usa más, y las líneas de sus viajes.')));
    this.sources(body, c);
    return body;
  }

  private itemPanel(c: Civ, l: Legacy): HTMLElement {
    const idx = this.idx!;
    const body = h('div', { class: 'guide legacy', 'data-legacy': 'item', 'data-item': `${c.id}/${l.id}` });
    body.append(this.back());
    const ct = this.cat(l.cat);
    const civBtn = h('button', { type: 'button', class: 'linklike', 'data-legacy': 'civ-link' }, `${c.icon} ${this.civName(c)}`);
    civBtn.addEventListener('click', () => void this.open({ v: 'civ', civ: c.id }));
    body.append(h('p', { class: 'legacy-head' }, civBtn, ' · ', this.when(l), ' · ', tx(l.place)));
    const tags = h('div', { class: 'legacy-tags' },
      h('span', { class: 'legacy-tag', style: `--tag: ${ct?.color ?? '#888'}` }, `${ct?.icon ?? ''} ${this.catName(l.cat)}`),
      h('span', { class: 'legacy-tag' }, HOW_TEXT[l.how]?.() ?? l.how),
      l.sure ? h('span', { class: `legacy-tag sure-${l.sure}` }, SURE_TEXT[l.sure]?.() ?? l.sure) : null);
    body.append(tags);
    const pic = h('div', { class: 'legacy-pic', hidden: true });
    body.append(pic);
    void itemThumb(l).then((src) => { if (src) { pic.append(h('img', { src, alt: '', loading: 'lazy' })); pic.hidden = false; } });
    body.append(h('p', { class: 'legacy-text' }, tx(l.text)));
    const note = englishNote();
    if (note) body.append(note);
    if (l.details || l.roots) {
      const more = h('div', { class: 'legacy-more', hidden: true },
        l.details ? h('p', null, tx(l.details)) : null,
        l.roots ? h('p', { class: 'muted' }, `🌱 ${L('Built on', 'Se basó en')}: ${tx(l.roots)}`) : null);
      const b = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'more' }, L('More', 'Más'));
      b.addEventListener('click', () => { more.hidden = !more.hidden; b.textContent = more.hidden ? L('More', 'Más') : L('Less', 'Menos'); });
      body.append(b, more);
    }
    // Who uses it today.
    const u = usersOf(l, idx);
    body.append(h('h3', { class: 'sec-title' }, L('Who uses it today', 'Quién lo usa hoy')), h('p', null, tx(l.note)));
    const me = this.home();
    if (me) body.append(h('p', { class: 'legacy-mine', 'data-legacy': 'mine-use' }, u.all.has(me) ? `✅ ${L('Used in {0}', 'Se usa en {0}', this.country(me))}` : `➖ ${L('Not in {0}', 'No en {0}', this.country(me))}`));
    if (!everywhere(l.where)) {
      const isos = [...u.all].sort((a, b) => Number(u.strong.has(b)) - Number(u.strong.has(a)) || this.country(a).localeCompare(this.country(b), lang()));
      const box = h('div', { class: 'legacy-countries', hidden: true });
      for (const iso of isos) {
        const b = h('button', { type: 'button', class: `chip sm${u.strong.has(iso) ? ' on' : ''}`, 'data-legacy-country': iso }, `${this.flag(iso)} ${this.country(iso)}`);
        b.addEventListener('click', () => void this.open({ v: 'country', iso }));
        box.append(b);
      }
      const t = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'countries' }, L('{0, plural, one {# country} other {# countries}}', '{0, plural, one {# país} other {# países}}', isos.length));
      t.addEventListener('click', () => { box.hidden = !box.hidden; });
      body.append(t, box);
    } else body.append(h('p', { class: 'muted small' }, `🌍 ${L('Used all over the world.', 'Se usa en todo el mundo.')}`));
    // Words.
    if (l.words?.length) {
      const es = lang() === 'es';
      const tbl = h('div', { class: 'legacy-words', 'data-legacy': 'words' });
      for (const w of l.words) {
        const today = es ? (w.es ?? w.en) : (w.en ?? w.es);
        const other = es ? (w.en && w.en !== w.es ? w.en : '') : (w.es && w.es !== w.en ? w.es : '');
        const kind = w.type && w.type !== 'word' ? WORD_TEXT[w.type] : null;
        tbl.append(h('div', { class: 'legacy-word', 'data-word-type': w.type ?? 'word' },
          h('span', { class: 'legacy-word-now' }, kind ? `${kind.icon} ` : '', today ?? '', other ? h('span', { class: 'muted small' }, ` · ${other}`) : null),
          h('span', { class: 'legacy-word-from' }, `← ${w.from}${w.means ? ` “${tx(w.means)}”` : ''}`)));
      }
      body.append(h('h3', { class: 'sec-title' }, L('The words', 'Las palabras')), tbl);
    }
    // How it travelled.
    if (l.path?.length) {
      const tl = h('ol', { class: 'legacy-path', 'data-legacy': 'path' });
      const first = h('li', null, h('button', { type: 'button', class: 'linklike' }, h('strong', null, this.when(l)), ` · ${tx(l.place)}`));
      first.addEventListener('click', () => this.app.flyTo(l.at[0], l.at[1], 5));
      tl.append(first);
      for (const p of l.path) {
        const li = h('li', null, h('button', { type: 'button', class: 'linklike' }, h('strong', null, this.when(p)), ` · ${tx(p.place)}${p.by ? ` · ${tx(p.by)}` : ''}`), p.note ? h('div', { class: 'muted small' }, tx(p.note)) : null);
        li.querySelector('button')!.addEventListener('click', () => this.app.flyTo(p.at[0], p.at[1], 5));
        tl.append(li);
      }
      body.append(h('h3', { class: 'sec-title' }, L('How it travelled', 'Cómo viajó')), tl);
    }
    // Links.
    const links = h('div', { class: 'chip-row' });
    for (const s of l.see ?? []) {
      const b = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'see' }, `${s.i} ${tx(s.n)}`);
      b.addEventListener('click', () => { this.shell.sheet.close(); this.app.emit('open-story', s.k, s.s, s.st ?? 0); });
      links.append(b);
    }
    if (l.wiki) links.append(h('a', { class: 'pill sm', href: `https://${lang() === 'es' && l.wiki.es ? 'es' : 'en'}.wikipedia.org/wiki/${encodeURIComponent((lang() === 'es' && l.wiki.es ? l.wiki.es : l.wiki.en).replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener' }, 'Wikipedia'));
    links.append(this.shareButton(`${c.id}/${l.id}`, tx(l.name)));
    body.append(h('h3', { class: 'sec-title' }, L('More', 'Más')), links);
    // More from this civilization, of the same subject.
    const same = c.legacies.filter((x) => x.cat === l.cat && x.id !== l.id).slice(0, 4);
    if (same.length) {
      const list = h('div', { class: 'guide-list' });
      for (const x of same) list.append(this.briefRow({ c: c.id, id: x.id, name: x.name, icon: x.icon, cat: x.cat, how: x.how, t: x.t, at: x.at, where: x.where, strong: x.strong, sure: x.sure }, false));
      body.append(h('h3', { class: 'sec-title' }, L('More from them', 'Más de ellos')), list);
    }
    return body;
  }

  private countryPanel(idx: LegacyIndex, iso: string): HTMLElement {
    const body = h('div', { class: 'guide legacy', 'data-legacy': 'country', 'data-iso': iso });
    body.append(this.back());
    const groups = borrowed(iso, idx);
    const total = groups.reduce((n, g) => n + g.own.length + g.world.length, 0);
    body.append(h('p', { class: 'legacy-text' }, L('{0} uses {1} things from {2} past civilizations.', '{0} usa {1} cosas de {2} civilizaciones del pasado.', this.country(iso), fmtNumber(total), groups.length)));
    body.append(h('p', { class: 'muted small' }, L('On the map: a line from every civilization it borrowed from, thicker for more.', 'En el mapa: una línea desde cada civilización de la que heredó, más gruesa cuanto más.')));
    const note = englishNote();
    if (note) body.append(note);
    for (const g of groups) {
      const sec = h('div', { class: 'legacy-civ-group', 'data-legacy-group': g.civ.id });
      const head = h('button', { type: 'button', class: 'sec-title legacy-group-head', style: `--civ: ${g.civ.color}` }, `${g.civ.icon} ${this.civName(g.civ)} · ${g.own.length + g.world.length}`);
      head.addEventListener('click', () => void this.open({ v: 'civ', civ: g.civ.id }));
      sec.append(head);
      // The words it took from them ("chocolate, tomate, aguacate…").
      const ws = [...new Set([...g.own, ...g.world].flatMap((b) => (b.w ?? []).map((w) => wordIn(w, lang()))).filter(Boolean))];
      if (ws.length) sec.append(h('p', { class: 'legacy-words-line', 'data-legacy': 'country-words' }, `🗣️ ${ws.length > 10 ? `${ws.slice(0, 10).join(', ')}…` : ws.join(', ')}`));
      const list = h('div', { class: 'guide-list' });
      for (const b of g.own) list.append(this.briefRow(b, false));
      sec.append(list);
      if (g.world.length) {
        const w = h('div', { class: 'guide-list', hidden: true });
        for (const b of g.world) w.append(this.briefRow(b, false));
        const t = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'world' }, `🌍 ${L('{0, plural, one {and # used everywhere} other {and # used everywhere}}', '{0, plural, one {y # que se usa en todas partes} other {y # que se usan en todas partes}}', g.world.length)}`);
        t.addEventListener('click', () => { w.hidden = !w.hidden; });
        sec.append(t, w);
      }
      body.append(sec);
    }
    if (!groups.length) body.append(h('p', { class: 'muted' }, L('Nothing recorded for this country yet.', 'Aún no hay nada registrado para este país.')));
    return body;
  }

  private catPanel(idx: LegacyIndex, cat: string): HTMLElement {
    const body = h('div', { class: 'guide legacy', 'data-legacy': 'cat', 'data-cat': cat });
    body.append(this.back());
    const list = h('div', { class: 'guide-list' });
    const items = idx.all.filter((b) => b.cat === cat).sort((a, b) => a.t - b.t);
    body.append(h('p', { class: 'muted small' }, L('{0, plural, one {# legacy, oldest first} other {# legacies, oldest first}}', '{0, plural, one {# legado, del más antiguo al más reciente} other {# legados, del más antiguo al más reciente}}', items.length)));
    for (const b of items) list.append(this.briefRow(b, true));
    body.append(list);
    return body;
  }

  /**
   * Words and names they gave us: a sentence ("They gave us words like paper, ebony and oasis; names like Susan.") and
   * a row for each kind, each word a chip that opens the legacy it is in.
   */
  private wordsBlock(c: Civ): HTMLElement[] | null {
    const by = wordsByType(c.legacies, lang());
    if (!by.size) return null;
    const parts = [...by].map(([t, list]) => WORD_TEXT[t].like(andList(list.slice(0, 4).map((x) => x.w))));
    const out: HTMLElement[] = [h('h3', { class: 'sec-title' }, L('Words and names they gave us', 'Palabras y nombres que nos dieron')),
      h('p', { class: 'legacy-words-lead', 'data-legacy': 'words-lead' }, L('They gave us {0}.', 'Nos dieron {0}.', parts.join('; ')))];
    const box = h('div', { class: 'legacy-word-rows', 'data-legacy': 'civ-words' });
    for (const [t, list] of by) {
      const chips = h('div', { class: 'chip-row' });
      const add = (from: number, to: number) => {
        for (const x of list.slice(from, to)) {
          const b = h('button', { type: 'button', class: 'chip sm', 'data-legacy-word': x.w }, x.w);
          b.addEventListener('click', () => void this.open({ v: 'item', civ: c.id, id: x.id }));
          chips.append(b);
        }
      };
      add(0, 12);
      if (list.length > 12) {
        const more = h('button', { type: 'button', class: 'chip sm', 'data-legacy': 'more-words' }, L('+{0} more', '+{0} más', list.length - 12));
        more.addEventListener('click', () => { more.remove(); add(12, list.length); });
        chips.append(more);
      }
      box.append(h('div', { class: 'legacy-word-row', 'data-word-type': t }, h('span', { class: 'legacy-word-label' }, `${WORD_TEXT[t].icon} ${WORD_TEXT[t].label()} · ${list.length}`), chips));
    }
    out.push(box);
    return out;
  }

  private sources(body: HTMLElement, c: Civ) {
    body.append(h('h3', { class: 'sec-title' }, `📚 ${L('Sources', 'Fuentes')}`),
      h('ul', { class: 'war-sources' }, c.sources.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title)))));
  }

  private shareButton(key: string, what?: string): HTMLElement {
    const b = h('button', { type: 'button', class: 'pill sm', 'data-legacy': 'share' }, icon(Share2, 14), L('Share', 'Compartir'));
    b.addEventListener('click', () => void shareText(this.shell, `🏛️ ${what ?? L('Legacies of the past', 'Legados del pasado')}\n${location.origin}${location.pathname}#legacy=${encodeURIComponent(key)}`));
    return b;
  }

  /** A people story's details: a link to what that civilization gave us. */
  private storyLink(kind: string, id: string): HTMLElement[] {
    const c = this.idx?.civs.find((x) => x.story?.k === kind && x.story.s === id);
    if (!this.idx) { void this.load().catch(() => {}); return []; }
    if (!c) return [];
    const b = h('button', { type: 'button', class: 'pill', 'data-legacy': 'from-story' }, icon(Landmark, 16), L('What they gave us: {0}', 'Lo que nos dieron: {0}', L('{0, plural, one {# legacy} other {# legacies}}', '{0, plural, one {# legado} other {# legados}}', c.n)));
    b.addEventListener('click', () => void this.open({ v: 'civ', civ: c.id }));
    return [b];
  }

  /** A link to Legacies (#legacy=egyptians, egyptians/365-day-year, @MEX, cat:words). */
  async openLink(s: string) {
    if (s.startsWith('@')) return this.open({ v: 'country', iso: s.slice(1) });
    if (s.startsWith('cat:')) return this.open({ v: 'cat', cat: s.slice(4) });
    const [civ, id] = s.split('/');
    if (id) return this.open({ v: 'item', civ, id });
    if (civ) return this.open({ v: 'civ', civ });
    return this.open({ v: 'home' });
  }

  // ---- the map -------------------------------------------------------------------------------------------------

  /** Where the map flies for a view. */
  private frame(v: View) {
    const flat = this.app.renderer.view.current.kind === 'flat';
    if (v.v === 'home') { this.app.flyTo(30, 22, flat ? 1 : 1.1); return; }
    if (v.v === 'civ') { const c = this.meta(v.civ); if (c) this.app.flyTo(c.at[0], c.at[1], (c.zoom ?? 3) * (flat ? 0.7 : 1)); return; }
    if (v.v === 'country') { const m = this.app.data.meta[v.iso]; if (m) this.app.flyTo(m.lx, m.ly, flat ? 1 : 1.15); return; }
    if (v.v === 'item') {
      const l = this.civs.get(v.civ)?.legacies.find((x) => x.id === v.id);
      if (!l) return;
      const pts: Pt[] = [l.at, ...(l.path ?? []).map((p) => p.at)];
      let far = 0;
      for (const p of pts) far = Math.max(far, geoDistance(l.at, p));
      const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length, lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const zoom = far < 0.05 ? 5 : Math.max(1, Math.min(6, 1.6 / far));
      this.app.flyTo(far > 1.6 ? 20 : lon, far > 1.6 ? 20 : lat, zoom * (flat ? 0.7 : 1));
    }
  }

  private arcPts(a: Pt, b: Pt): Pt[] {
    const key = `${a[0]},${a[1]}>${b[0]},${b[1]}`;
    let pts = this.arcCache.get(key);
    if (!pts) {
      const n = Math.max(6, Math.ceil(geoDistance(a, b) / 0.02));
      const f = geoInterpolate(a, b);
      pts = Array.from({ length: n + 1 }, (_, k) => f(k / n) as Pt);
      this.arcCache.set(key, pts);
    }
    return pts;
  }
  /** A great-circle line, drawn to `q` of its length, with an arrowhead when whole. */
  private arc(rc: RenderCtx, a: Pt, b: Pt, color: string, width: number, q = 1, arrow = false) {
    if (q <= 0) return;
    const pts = this.arcPts(a, b);
    const last = q * (pts.length - 1), n = Math.floor(last);
    const runs: Pt[][] = [];
    let run: Pt[] = [];
    const put = (g: Pt) => { const p = rc.project(g[0], g[1]); if (p) run.push(p); else if (run.length) { if (run.length > 1) runs.push(run); run = []; } };
    for (let k = 0; k <= n; k++) put(pts[k]);
    if (n < pts.length - 1 && last > n) { const f = last - n, x = pts[n], y = pts[n + 1]; put([x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f]); }
    if (run.length > 1) runs.push(run);
    if (!runs.length) return;
    const { ctx } = rc;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [w, s] of [[width + 2.4, halo(rc.theme.dark)], [width, color]] as const) {
      ctx.beginPath();
      for (const r of runs) { ctx.moveTo(r[0][0], r[0][1]); for (const p of r.slice(1)) ctx.lineTo(p[0], p[1]); }
      ctx.strokeStyle = s; ctx.lineWidth = w; ctx.stroke();
    }
    const end = runs[runs.length - 1];
    if (arrow && end.length >= 2) {
      const [x1, y1] = end[end.length - 1];
      let k = end.length - 2;
      while (k > 0 && Math.hypot(x1 - end[k][0], y1 - end[k][1]) < 6) k--;
      const ang = Math.atan2(y1 - end[k][1], x1 - end[k][0]);
      const s = 5 + width;
      ctx.beginPath();
      ctx.moveTo(x1 + Math.cos(ang) * s * 0.8, y1 + Math.sin(ang) * s * 0.8);
      ctx.lineTo(x1 + Math.cos(ang + 2.5) * s, y1 + Math.sin(ang + 2.5) * s);
      ctx.lineTo(x1 + Math.cos(ang - 2.5) * s, y1 + Math.sin(ang - 2.5) * s);
      ctx.closePath();
      ctx.fillStyle = color; ctx.strokeStyle = halo(rc.theme.dark); ctx.lineWidth = 1.4; ctx.stroke(); ctx.fill();
    }
    ctx.restore();
  }
  /** A civilization's homeland, filled and outlined. */
  private homeland(rc: RenderCtx, id: string, color: string, alpha: number) {
    const s = this.homes.get(id);
    if (!s || !rc.visibleShapes([s]).length) return;
    const { ctx, path } = rc;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath(); path(s.feature as never);
    ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha / alpha * Math.max(0.6, alpha * 1.6));
    ctx.strokeStyle = darker(color.startsWith('#') ? color : '#888888'); ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }
  /** Plain land under our colours (as the stories have): the filters' own colours would muddle them. */
  private base(rc: RenderCtx) {
    const ids = rc.visibleShapes(rc.level.countries).map((x) => x.id);
    rc.ctx.save(); rc.ctx.globalAlpha *= 0.9;
    rc.fillCountries(ids, rc.theme.dark ? '#4f545c' : rc.theme.land);
    rc.ctx.restore();
  }
  /** Countries shaded by a count: five steps, from a light wash to strong. */
  private shade(rc: RenderCtx, counts: Map<string, number>, color: string, max: number, top = 0.72) {
    const bins: string[][] = [[], [], [], [], []];
    for (const [iso, n] of counts) if (n > 0) bins[Math.min(4, Math.floor(((n - 1) / Math.max(1, max)) * 5))].push(iso);
    const { ctx } = rc;
    bins.forEach((ids, i) => {
      if (!ids.length) return;
      ctx.save(); ctx.globalAlpha *= 0.16 + (top - 0.16) * (i / 4);
      rc.fillCountries(ids, color);
      ctx.restore();
    });
  }
  /** A round marker with an emoji, tappable. */
  private dot(rc: RenderCtx, at: Pt, emoji: string, color: string, go: (() => void) | null, r = 11) {
    const p = rc.project(at[0], at[1]);
    if (!p) return null;
    const { ctx } = rc;
    ctx.save();
    ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fillStyle = rc.theme.dark ? 'rgba(20,28,44,0.92)' : 'rgba(255,255,255,0.95)'; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = color; ctx.stroke();
    ctx.font = `${Math.round(r * 1.15)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.fillText(emoji, p[0], p[1] + 0.5);
    ctx.restore();
    if (go) this.hits.push({ x: p[0], y: p[1], r: r + 6, go });
    return p;
  }
  private label(rc: RenderCtx, p: [number, number], text: string, dy = 18, bold = true) {
    const { ctx } = rc;
    ctx.save();
    ctx.font = `${bold ? 650 : 500} 12px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.strokeStyle = halo(rc.theme.dark); ctx.strokeText(text, p[0], p[1] + dy);
    ctx.fillStyle = rc.theme.dark ? '#f2f5fa' : '#1b2433'; ctx.fillText(text, p[0], p[1] + dy);
    ctx.restore();
  }

  private draw(rc: RenderCtx) {
    this.hits = [];
    const v = this.view, idx = this.idx;
    if (!v || !idx || this.app.mode) return;
    const dark = rc.theme.dark;
    const col = (c: { color: string }) => seaSafe(c.color, dark);
    const q = Math.min(1, (performance.now() - this.animAt) / 1600);
    if (q < 1) requestAnimationFrame(() => this.app.renderer.requestRender());
    this.base(rc);
    if (v.v === 'home') {
      for (const c of idx.civs) this.homeland(rc, c.id, col(c), 0.5);
      for (const c of idx.civs) {
        const p = this.dot(rc, c.at, c.icon, col(c), () => void this.open({ v: 'civ', civ: c.id }), 12);
        if (p && this.app.renderer.view.zoom >= 1.6) this.label(rc, p, this.civName(c, true));
      }
      return;
    }
    if (v.v === 'civ') {
      const c = this.meta(v.civ), full = this.civs.get(v.civ);
      if (!c) return;
      // Shaded by what is used in some countries and not others; what is used everywhere is a light wash.
      const mine = idx.all.filter((b) => b.c === c.id && (!v.cat || b.cat === v.cat));
      const counts = new Map<string, number>();
      for (const b of mine) if (!everywhere(b.where)) for (const iso of members(b.where, idx)) counts.set(iso, (counts.get(iso) ?? 0) + 1);
      if (mine.some((b) => everywhere(b.where))) { rc.ctx.save(); rc.ctx.globalAlpha *= 0.16; rc.fillCountries(idx.countries, col(c)); rc.ctx.restore(); }
      this.shade(rc, counts, col(c), Math.max(1, ...counts.values()));
      this.homeland(rc, c.id, col(c), 0.62);
      const ls = (full?.legacies ?? []).filter((l) => !v.cat || l.cat === v.cat);
      for (const l of ls) {
        const ct = this.cat(l.cat);
        for (const [a, b] of segments(l.at, l.path)) this.arc(rc, a, b, seaSafe(ct?.color ?? c.color, dark), 1.3, q);
      }
      for (const l of ls) this.dot(rc, l.at, l.icon, seaSafe(this.cat(l.cat)?.color ?? c.color, dark), () => void this.open({ v: 'item', civ: c.id, id: l.id }), 9);
      return;
    }
    if (v.v === 'item') {
      const c = this.civs.get(v.civ), l = c?.legacies.find((x) => x.id === v.id);
      if (!c || !l) return;
      const u = usersOf(l, idx);
      const color = col(c);
      if (everywhere(l.where)) { rc.ctx.save(); rc.ctx.globalAlpha *= 0.32; rc.fillCountries(idx.countries, color); rc.ctx.restore(); }
      else {
        // Where it is used, and darker where it is strongest.
        const weak = [...u.all].filter((iso) => !u.strong.has(iso));
        rc.ctx.save(); rc.ctx.globalAlpha *= u.strong.size ? 0.38 : 0.55; rc.fillCountries(weak, color); rc.ctx.restore();
        if (u.strong.size) { rc.ctx.save(); rc.ctx.globalAlpha *= 0.78; rc.fillCountries(u.strong, color); rc.ctx.restore(); }
      }
      this.homeland(rc, c.id, color, 0.28);
      const segs = segments(l.at, l.path);
      const ct = this.cat(l.cat);
      const line = seaSafe(ct?.color ?? c.color, dark);
      // Each line in turn, as the animation goes.
      segs.forEach(([a, b], i) => this.arc(rc, a, b, line, 2.6, Math.max(0, Math.min(1, q * segs.length - i)), true));
      // Each place once, with its dates ("Rome · 46 BC, 1582"): a place within a few pixels of another shares its label.
      const spots: { p: [number, number]; name: string; dates: string[] }[] = [];
      (l.path ?? []).forEach((p, i) => {
        if (q * segs.length < i + 0.6) return;
        const pp = rc.project(p.at[0], p.at[1]);
        if (!pp) return;
        rc.ctx.save(); rc.ctx.beginPath(); rc.ctx.arc(pp[0], pp[1], 4, 0, Math.PI * 2);
        rc.ctx.fillStyle = line; rc.ctx.fill(); rc.ctx.lineWidth = 1.5; rc.ctx.strokeStyle = halo(dark); rc.ctx.stroke(); rc.ctx.restore();
        const y = Number(/^-?\d+/.exec(p.date)?.[0]);
        const date = y < 0 ? L('{0} BC', '{0} a. C.', -y) : String(y);
        const near = spots.find((x) => Math.hypot(x.p[0] - pp[0], x.p[1] - pp[1]) < 26);
        if (near) { if (!near.dates.includes(date)) near.dates.push(date); } else spots.push({ p: pp, name: tx(p.place), dates: [date] });
        this.hits.push({ x: pp[0], y: pp[1], r: 14, go: () => this.app.flyTo(p.at[0], p.at[1], 5) });
      });
      for (const sp of spots) this.label(rc, sp.p, `${sp.name} · ${sp.dates.join(', ')}`, 13, false);
      const p0 = this.dot(rc, l.at, l.icon, color, null, 13);
      if (p0) this.label(rc, p0, tx(l.place), 22);
      return;
    }
    if (v.v === 'country') {
      const groups = borrowed(v.iso, idx);
      const m = this.app.data.meta[v.iso];
      if (!m) return;
      const to: Pt = [m.lx, m.ly];
      for (const g of groups) this.homeland(rc, g.civ.id, col(g.civ), 0.35);
      rc.ctx.save(); rc.ctx.globalAlpha *= 0.35; rc.fillCountries([v.iso], dark ? '#ffffff' : '#1b2433'); rc.ctx.restore();
      rc.strokeCountry(v.iso, dark ? '#ffffff' : '#1b2433', 2);
      const max = Math.max(1, ...groups.map((g) => g.own.length + g.world.length));
      for (const g of groups) {
        const n = g.own.length + g.world.length;
        this.arc(rc, g.civ.at, to, col(g.civ), 1 + 3.2 * Math.sqrt(n / max), q, true);
      }
      for (const g of groups) {
        const p = this.dot(rc, g.civ.at, g.civ.icon, col(g.civ), () => void this.open({ v: 'civ', civ: g.civ.id }), 11);
        if (p && this.app.renderer.view.zoom >= 1.4) this.label(rc, p, `${this.civName(g.civ, true)} · ${g.own.length + g.world.length}`);
      }
      return;
    }
    if (v.v === 'cat') {
      const ls = idx.all.filter((b) => b.cat === v.cat);
      for (const b of ls) { const c = this.meta(b.c); if (c) this.homeland(rc, c.id, col(c), 0.14); }
      for (const b of ls) {
        const c = this.meta(b.c);
        if (c) this.dot(rc, b.at, b.icon, col(c), () => void this.open({ v: 'item', civ: b.c, id: b.id }), 9);
      }
    }
  }

  private tap(x: number, y: number, g: [number, number] | null): boolean {
    if (!this.view || !this.idx || this.app.mode) return false;
    let best: (typeof this.hits)[number] | null = null, bd = Infinity;
    for (const ht of this.hits) { const d = Math.hypot(ht.x - x, ht.y - y); if (d <= ht.r && d < bd) { bd = d; best = ht; } }
    if (best) { best.go(); return true; }
    if (!g) return true;
    if (this.view.v === 'home') {
      for (const c of this.idx.civs) {
        const s = this.homes.get(c.id);
        if (s && geoContains(s.feature as never, g)) { void this.open({ v: 'civ', civ: c.id }); return true; }
      }
    }
    const iso = this.app.renderer.countryAt(g[0], g[1]);
    if (iso && this.app.data.meta[iso]) void this.open({ v: 'country', iso });
    return true;
  }

  /** Today's legacy (Today's panel): its line, once the list is here (it loads the first time it is asked). */
  dayLine(day: string): string | null {
    if (!this.idx) { void this.load().catch(() => {}); return null; }
    const b = ofTheDay(day, this.idx);
    return b ? `${b.icon} ${tx(b.name)} · ${this.civName(this.meta(b.c), true)}` : null;
  }
  async openOfTheDay(day: string) {
    const idx = await this.load().catch(() => null);
    const b = idx ? ofTheDay(day, idx) : null;
    if (b) await this.open({ v: 'item', civ: b.c, id: b.id });
    else this.shell.toast(L('Legacies need their data; check your connection.', 'Los legados necesitan sus datos; revisa tu conexión.'));
  }

  /** How many countries use something from each civilization (for the smoke test and the home panel). */
  reachOf() { return this.idx ? reach(this.idx) : null; }
}
