// Fill the map (v0.35.0): a world map coloured in country by country. Pick what to fill it with (countries,
// capitals, flags, the most people or the largest first, clues, languages) and where (the world, a continent or a
// region); each country you find is painted in its own colour with its name, and the map is kept, one per category.
// Three tries for each, with a hint after each miss (its neighbours, then a circle where it is; for clues, an easier
// clue); after three it is shown in orange. Every answer counts toward Master the world's daily goal, and for
// countries, capitals and flags in its decks too. A region of the day, the same for everyone, is in the Map games
// panel.
import { PaintBucket, Share2, SkipForward, ChevronRight, RotateCcw, Play } from 'lucide';
import { geoEqualEarth, geoPath } from 'd3-geo';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { ftile } from '../ui/features';
import { h, icon, clear, segmented } from '../ui/dom';
import { fmtNumber, appLocale, subregion, t, dataLang, tx } from '../app/i18n';
import { dataUrl, loadJSON } from '../data/store';
import { L, es, type PlayHost, type HostGame } from '../play/host';
import { shareText } from '../play/pin';
import { recordFeat, dayKey, onReset, type Badge } from '../learn/progress';
import { loadDeck } from '../master/data';
import { master } from '../master/store';
import type { Master } from '../master/master';
import type { DeckId } from '../master/srs';
import type { Country } from '../master/decks';
import { CATS, CONTS, TRIES, THEMES, continentOf, dailyPick, hash, inScope, ladder, langPrompt, nextRegion, order, regionsOf, rng, starsFor, type Clue, type FillCat, type Region, type Theme, type Unit } from './logic';
import { fillState, saveFill, resetFill, resetFillMap } from './store';
import { pickCountry, isTiny } from '../play/pick';
import { bell } from '../today/reminders';
import { FillStates } from './states';

/** A sentence starts with a capital ("the world" → "The world"). */
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

const CAT_TEXT: Record<FillCat, { icon: string; en: string; es: string }> = {
  countries: { icon: '🗺️', en: 'Countries', es: 'Países' },
  capitals: { icon: '🏛️', en: 'Capitals', es: 'Capitales' },
  flags: { icon: '🏳️', en: 'Flags', es: 'Banderas' },
  people: { icon: '👥', en: 'Most people first', es: 'Más poblados primero' },
  area: { icon: '📐', en: 'Largest first', es: 'Más grandes primero' },
  clues: { icon: '🔎', en: 'Clues', es: 'Pistas' },
  languages: { icon: '🗣️', en: 'Languages', es: 'Lenguas' },
};
const THEME_TEXT: Record<Theme, { en: string; es: string }> = { all: { en: 'All', es: 'Todas' }, nature: { en: 'Nature', es: 'Naturaleza' }, culture: { en: 'Culture', es: 'Cultura' }, people: { en: 'People', es: 'Personas' } };
/** The Master the world deck a category asks the same as. */
const DECK_OF: Partial<Record<FillCat, DeckId>> = { countries: 'countries', capitals: 'capitals', flags: 'flags' };

interface Cur {
  /** The country asked (for Languages: the one shown if missed; any of ids is right). */
  id: string; ids?: string[]; lang?: string;
  misses: number; clues: Clue[];
}
interface Answer { ok: boolean; id: string; given?: string; stars: number; at: number }
interface Session {
  cat: FillCat; scope: string; theme: Theme; daily: string | null;
  ids: string[]; queue: string[]; i: number;
  /** The countries filled in this session (the region of the day keeps its own, apart from the saved map). */
  got: Map<string, number>;
  cur: Cur | null; ans: Answer | null;
  flash: { id: string; at: number } | null; note: string;
  stats: { stars: number; firsts: number; asked: number; shown: string[] };
  done: boolean; fold: boolean; timer: number; r: () => number;
  /** "Try the ones shown again": these count as empty in this session until answered (their orange stays saved). */
  again: Set<string>;
}

export class FillMap implements HostGame {
  private s: Session | null = null;
  private units: Unit[] = [];
  private unitBy = new Map<string, Unit>();
  private deck = new Map<string, Country>();
  private clues: Record<string, Clue[]> = {};
  private langNames: Record<string, { en: string; es: string }> = {};
  private regions: Region[] = [];
  private others = new Map<string, string[]>();
  private regionsLabels: boolean | null = null;
  private loaded: Promise<boolean> | null = null;
  /** Opens Master the world's panel (main.ts). */
  openMaster: (() => void) | null = null;
  /** Fill the states (v0.38.0): Fill the map inside a country. */
  readonly states: FillStates;

  constructor(private app: App, private shell: Shell, private host: PlayHost, private mw: Master) {
    this.states = new FillStates(app, shell, host, mw);
    this.states.openPanel = () => void this.openPanel();
    shell.addMenu({ id: 'fill', icon: PaintBucket, label: () => L('Fill the map', 'Llena el mapa'), order: 28.5, group: 'play', onClick: () => void this.openPanel() });
    onReset.push(() => resetFill());
  }

  // ---- Data
  private load(): Promise<boolean> {
    this.loaded ??= (async () => {
      const [deck, clues, attrs] = await Promise.all([
        loadDeck(),
        loadJSON<{ clues: Record<string, Clue[]> }>('fill/clues.json').catch(() => null),
        loadJSON<{ data: Record<string, { population?: number; area_km2?: number; languages?: string[] }>; fields: Record<string, { categories?: Record<string, { en: string; es: string }> }> }>('attributes/countries.json').catch(() => null),
      ]);
      if (!deck) { this.loaded = null; return false; }
      this.clues = clues?.clues ?? {};
      this.langNames = attrs?.fields.languages?.categories ?? {};
      const meta = this.app.data.meta;
      this.deck = new Map(deck.countries.map((c) => [c.id, c]));
      this.allUnits = deck.countries.filter((c) => meta[c.id]).map((c) => {
        const a = attrs?.data[c.id] ?? {}, m = meta[c.id];
        return { id: c.id, ct: c.ct, sr: m.sr ?? '', pop: a.population ?? m.pop ?? c.pop ?? 0, area: a.area_km2 ?? 0, langs: a.languages ?? [], at: [m.lx, m.ly] as [number, number], land: c.land, t: !!c.t };
      });
      return true;
    })();
    return this.loaded;
  }
  private allUnits: (Unit & { t: boolean })[] = [];
  /** The countries in play: Master the world's (its territories setting too). */
  private refreshUnits() {
    const terr = master().settings.territories;
    this.units = this.allUnits.filter((u) => terr || !u.t);
    this.unitBy = new Map(this.units.map((u) => [u.id, u]));
    this.regions = regionsOf(this.units);
  }
  /** The countries a category can ask (a capital, a size, a language to ask about). */
  private eligible(cat: FillCat): Unit[] {
    return this.units.filter((u) => {
      if (cat === 'capitals') { const c = this.deck.get(u.id); return !!c?.cap && c.skip !== 'capitals'; }
      if (cat === 'people') return u.pop > 0;
      if (cat === 'area') return u.area > 0;
      if (cat === 'languages') return u.langs.length > 0;
      if (cat === 'clues') return (this.clues[u.id]?.length ?? 0) >= 3;
      return true;
    });
  }
  private scopeIds(cat: FillCat, scope: string) { return inScope(this.eligible(cat), scope); }
  private name(id: string) { return this.app.data.name(id, dataLang()); }
  private scopeName(scope: string) {
    if (scope === 'world') return L('the world', 'el mundo');
    if (scope.startsWith('r:')) return es() ? subregion(scope.slice(2)) : scope.slice(2);
    return t(`cont.${scope}`);
  }
  private catName(cat: FillCat) { return es() ? CAT_TEXT[cat].es : CAT_TEXT[cat].en; }
  private flag(id: string) { const a2 = this.deck.get(id)?.a2 ?? this.app.data.meta[id]?.a2 ?? ''; return dataUrl(`../flags/${a2.toLowerCase()}.svg`); }
  private map(cat: FillCat) { return fillState().maps[cat]; }

  /** What the tests read. */
  get info() {
    const s = this.s;
    if (!s) return null;
    return {
      cat: s.cat, scope: s.scope, daily: s.daily, ids: [...s.ids], queue: s.queue.slice(s.i), done: s.done,
      cur: s.cur ? { id: s.cur.id, ids: s.cur.ids ?? null, lang: s.cur.lang ?? null, misses: s.cur.misses, clues: s.cur.clues.map((c) => c.en) } : null,
      ans: s.ans ? { ...s.ans } : null, got: Object.fromEntries(s.got), stats: { ...s.stats, shown: [...s.stats.shown] }, note: s.note,
    };
  }

  // ---- Starting and stopping
  /** Fills a scope (the one in the settings unless given); `retry` asks again the ones shown after three misses. */
  async start(o: { cat?: FillCat; scope?: string; theme?: Theme; retry?: boolean; daily?: boolean } = {}) {
    if (!(await this.load())) { this.shell.toast(L('Fill the map needs its data; check your connection.', 'Llena el mapa necesita sus datos; revisa tu conexión.')); return; }
    this.refreshUnits();
    const st = fillState(), set = st.settings;
    let cat = o.cat ?? set.cat, scope = o.scope ?? set.scope;
    const theme = o.theme ?? set.theme;
    const day = o.daily ? dayKey() : null;
    if (day) {
      const pick = dailyPick(day, this.regions);
      if (!pick) return;
      ({ cat, scope } = pick);
    } else { set.cat = cat; set.scope = scope; set.theme = theme; saveFill(); }
    const ids = this.scopeIds(cat, scope);
    const r = rng(day ? hash(`fill:${day}:order`) : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    const map = this.map(cat);
    const todo = day ? ids : o.retry ? ids.filter((id) => map[id] === 0) : ids.filter((id) => map[id] == null);
    this.clearTimer();
    await this.host.enter(this);
    const r0 = this.app.renderer;
    if (this.regionsLabels == null) { this.regionsLabels = r0.regionLabels; r0.regionLabels = false; }
    this.s = {
      cat, scope, theme, daily: day, ids, queue: order(cat, todo, this.unitBy, r), i: 0, got: new Map(),
      cur: null, ans: null, flash: null, note: '', stats: { stars: 0, firsts: 0, asked: 0, shown: [] },
      done: false, fold: false, timer: 0, r, again: new Set(o.retry && !day ? todo : []),
    };
    this.frameScope();
    if (!todo.length) { this.s.done = true; this.render(); return; }
    this.ask();
  }

  async stop() {
    if (!this.s) return;
    this.clearTimer();
    this.s = null;
    this.putLabels();
    await this.host.leave(this);
  }
  drop() { this.clearTimer(); this.s = null; this.putLabels(); }
  private putLabels() { if (this.regionsLabels != null) { this.app.renderer.regionLabels = this.regionsLabels; this.regionsLabels = null; } }
  private clearTimer() { if (this.s?.timer) { clearTimeout(this.s.timer); this.s.timer = 0; } }

  /** Shows the whole scope. */
  private frameScope() {
    const s = this.s!;
    if (s.scope === 'world') { this.app.resetView(); return; }
    const pts = s.ids.map((id) => this.unitBy.get(id)?.at).filter((p): p is [number, number] => !!p);
    this.host.fit(pts, 8);
  }

  // ---- Asking
  /** The filled countries, in this session's map. */
  private filled(id: string): number | undefined {
    const s = this.s!;
    return s.daily || s.again.has(id) ? s.got.get(id) : this.map(s.cat)[id] ?? s.got.get(id);
  }
  private ask() {
    const s = this.s!;
    s.ans = null; s.flash = null; s.note = '';
    if (s.cat === 'languages') {
      const left = s.queue.filter((id) => this.filled(id) == null);
      const p = langPrompt(left, this.unitBy, s.r);
      if (!p) { this.finish(); return; }
      const biggest = p.ids.slice().sort((a, b) => (this.unitBy.get(b)?.area ?? 0) - (this.unitBy.get(a)?.area ?? 0))[0];
      s.cur = { id: biggest, ids: p.ids, lang: p.lang, misses: 0, clues: [] };
    } else {
      while (s.i < s.queue.length && this.filled(s.queue[s.i]) != null && !s.daily) s.i++;
      if (s.i >= s.queue.length) { this.finish(); return; }
      const id = s.queue[s.i];
      s.cur = { id, misses: 0, clues: s.cat === 'clues' ? ladder(this.clues[id] ?? [], s.theme, s.r) : [] };
    }
    s.stats.asked++;
    this.render();
    this.app.renderer.requestRender();
  }

  tap(g: [number, number] | null): boolean {
    const s = this.s;
    if (!s || this.host.current !== this) return false;
    if (s.done) return true;
    if (s.ans) { this.next(); return true; }
    if (!s.cur || !g) return true;
    const id = this.pickAt(g);
    if (!id) return true;
    this.answer(id);
    return true;
  }

  /** The country a tap means: a tiny one still to fill near it first (Vatican City in Rome, an island). */
  private pickAt(g: [number, number]): string | null {
    const s = this.s!;
    return pickCountry(this.app, g, s.ids, (id) => this.filled(id) == null);
  }

  /** A tap on a country (the tests call it too). */
  answer(id: string) {
    const s = this.s;
    if (!s?.cur || s.ans || s.done) return;
    const cur = s.cur;
    const right = cur.ids ? cur.ids.includes(id) : id === cur.id;
    if (!right && this.filled(id) != null && s.ids.includes(id)) {
      // Already coloured in: no harm done.
      s.note = L('{0} is already filled in.', '{0} ya tiene color.', this.name(id));
      s.flash = { id, at: performance.now() };
      this.render();
      this.app.renderer.requestRender();
      return;
    }
    if (right) { this.fillIn(id, starsFor(cur.misses), cur.misses === 0); return; }
    cur.misses++;
    s.flash = { id, at: performance.now() };
    s.note = L('That is {0}.', 'Ese es {0}.', this.name(id));
    if (cur.misses >= TRIES) { this.reveal(id); return; }
    this.render();
    this.app.renderer.requestRender();
    setTimeout(() => this.app.renderer.requestRender(), 1700);
  }

  /** "Show me": the country is shown and filled with no stars. */
  giveUp() { const s = this.s; if (s?.cur && !s.ans && !s.done) this.reveal(''); }

  private reveal(given: string) {
    const s = this.s!, cur = s.cur!;
    cur.misses = TRIES;
    this.fillIn(cur.id, 0, false, given);
    this.app.flyToCountry(cur.id, false);
  }

  /** Paints a country in: the stars kept (the best), the answer counted toward Master the world, the badges. */
  private fillIn(id: string, stars: number, first: boolean, given?: string) {
    const s = this.s!;
    const map = this.map(s.cat);
    s.got.set(id, stars);
    map[id] = Math.max(map[id] ?? 0, stars);
    s.stats.stars += stars;
    if (first) s.stats.firsts++;
    if (!stars) s.stats.shown.push(id);
    s.ans = { ok: stars > 0, id, given, stars, at: performance.now() };
    if (stars > 0) s.flash = null;
    saveFill();
    const badges = this.feats(s.cat);
    void this.mw.external(DECK_OF[s.cat] ?? null, id, first).then((b) => this.toastBadges([...badges, ...b]));
    if (s.cat !== 'languages') s.i++;
    this.schedule(stars > 0 ? 1300 : 3200);
    this.render();
    this.app.renderer.requestRender();
  }

  private toastBadges(b: Badge[]) { if (b.length) this.shell.toast(`${b[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? b[0].es : b[0].en}`, 4000); }

  /** A continent, the world, a perfect continent, every category: the badges. */
  private feats(cat: FillCat): Badge[] {
    const got: Badge[] = [];
    const map = this.map(cat);
    const all = this.eligible(cat);
    const full = (us: Unit[]) => us.length > 0 && us.every((u) => map[u.id] != null);
    for (const ct of CONTS) {
      const us = all.filter((u) => continentOf(u) === ct);
      if (full(us)) { got.push(...recordFeat('fill-continent')); if (us.every((u) => map[u.id] === 3)) got.push(...recordFeat('fill-perfect')); }
    }
    if (full(all)) got.push(...recordFeat('fill-world'));
    if (CATS.every((c) => { const us = this.eligible(c), m = this.map(c); return us.length > 0 && us.every((u) => m[u.id] != null); })) got.push(...recordFeat('fill-every'));
    return got;
  }

  private schedule(ms: number) { this.clearTimer(); this.s!.timer = window.setTimeout(() => this.next(), ms); }

  next() {
    const s = this.s;
    if (!s || s.done) return;
    this.clearTimer();
    if (!s.ans) return;
    this.ask();
  }

  private finish() {
    const s = this.s!;
    s.done = true; s.cur = null; s.ans = null;
    if (s.daily) {
      const st = fillState();
      if (!st.dailies[s.daily]) {
        st.dailies[s.daily] = { s: s.stats.stars, n: s.ids.length * 3, m: s.ids.map((id) => String(s.got.get(id) ?? 0)).join(''), scope: s.scope, cat: s.cat };
        saveFill();
      }
    }
    this.frameScope();
    this.render();
    this.app.renderer.requestRender();
  }

  // ---- The card
  render() {
    const s = this.s;
    const card = this.host.card;
    clear(card);
    if (!s) return;
    const title = `${s.daily ? '🗓️' : CAT_TEXT[s.cat].icon} ${s.daily ? L('Region of the day', 'Región del día') : this.catName(s.cat)} · ${this.scopeName(s.scope)}`;
    card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    card.append(h('div', { class: 'hop-stats', 'data-fill': 'status' }, this.status()));
    if (s.done) { this.renderDone(); return; }
    const cur = s.cur;
    if (!cur) return;
    card.append(h('div', { class: 'quiz-q', 'data-fill': 'prompt' }, this.prompt(cur)));
    if (s.fold) return;
    if (s.cat === 'flags') card.append(h('img', { class: 'quiz-flag fill-flag', src: this.flag(cur.id), alt: L('A flag', 'Una bandera') }));
    if (s.cat === 'clues') {
      const shown = s.ans ? cur.clues : cur.clues.slice(0, Math.min(cur.clues.length, cur.misses + 1));
      card.append(h('ul', { class: 'fill-clues', 'data-fill': 'clues' }, ...shown.map((c) => h('li', null, `${c.i} ${this.clueText(c)}`))));
    }
    if (s.ans) {
      const a = s.ans;
      const extra = this.valueOf(a.id);
      card.append(h('div', { class: `quiz-fb ${a.ok ? 'ok' : 'bad'}`, 'data-fill': 'feedback' }, a.ok
        ? `✅ ${this.name(a.id)} ${'★'.repeat(a.stars)}${'☆'.repeat(3 - a.stars)}${extra ? ` · ${extra}` : ''}`
        : `👀 ${L('It is {0}', 'Es {0}', this.name(a.id))}${extra ? ` · ${extra}` : ''}`));
      if (s.cat === 'languages' && cur.ids && cur.lang) {
        const more = cur.ids.filter((x) => x !== a.id);
        if (more.length) card.append(h('div', { class: 'tool-hint' }, L('Also spoken in: {0}', 'También se habla en: {0}', more.map((x) => this.name(x)).join(', '))));
      }
      const next = h('button', { type: 'button', class: 'pill sm primary', 'data-fill': 'next' }, L('Next', 'Siguiente'), icon(ChevronRight, 15));
      next.addEventListener('click', () => this.next());
      card.append(h('div', { class: 'hop-actions' }, next));
      return;
    }
    if (s.note) card.append(h('div', { class: 'quiz-fb bad', 'data-fill': 'miss' }, s.note));
    const hint = this.hint(cur);
    if (hint) card.append(h('div', { class: 'tool-hint fill-hint', 'data-fill': 'hint' }, `💡 ${hint}`));
    const tries = h('span', { class: 'fill-tries' }, `${L('Tries', 'Intentos')}: ${'●'.repeat(TRIES - cur.misses)}${'○'.repeat(cur.misses)}`);
    const show = h('button', { type: 'button', class: 'pill sm', 'data-fill': 'giveup' }, icon(SkipForward, 15), L('Show me', 'Muéstramelo'));
    show.addEventListener('click', () => this.giveUp());
    card.append(h('div', { class: 'hop-actions' }, tries, show));
  }

  private status(): string {
    const s = this.s!;
    if (s.daily) return `${Math.min(s.got.size, s.ids.length)}/${s.ids.length} · ★ ${s.stats.stars}`;
    const map = this.map(s.cat);
    const n = s.ids.filter((id) => map[id] != null).length;
    const stars = s.ids.reduce((a, id) => a + (map[id] ?? 0), 0);
    return `${L('Filled', 'Coloreados')} ${n}/${s.ids.length} · ★ ${stars}/${s.ids.length * 3}`;
  }

  private prompt(cur: Cur): string {
    const s = this.s!, n = this.name(cur.id);
    switch (s.cat) {
      case 'countries': return L('Tap {0}', 'Toca {0}', n);
      case 'capitals': { const c = this.deck.get(cur.id)!.cap!; return L('Tap the country whose capital is {0}', 'Toca el país cuya capital es {0}', tx(c)); }
      case 'flags': return L('Tap the country of this flag', 'Toca el país de esta bandera');
      case 'people': return L('Tap the country with the most people left', 'Toca el país más poblado que queda');
      case 'area': return L('Tap the largest country left', 'Toca el país más grande que queda');
      case 'clues': return L('Which country is it? Tap it', '¿Qué país es? Tócalo');
      case 'languages': { const l = this.langNames[cur.lang ?? '']; const nm = l ? tx(l) : cur.lang ?? ''; return L('Tap a country where {0} is spoken', 'Toca un país donde se hable {1}', nm, nm.toLowerCase()); }
    }
  }

  private clueText(c: Clue) { const txt = es() ? c.es : c.en; return c.m != null ? txt.replace('{m}', fmtNumber(c.m)) : txt; }

  /** After a miss: its neighbours (or its region), then a circle where it is; for clues, the next clue. */
  private hint(cur: Cur): string {
    const s = this.s!;
    if (!cur.misses) return '';
    if (s.cat === 'clues') return cur.misses >= 2 ? L('Look inside the circle.', 'Mira dentro del círculo.') : '';
    if (cur.misses >= 2) return L('It is inside the circle.', 'Está dentro del círculo.');
    if (s.cat === 'languages') { const u = this.unitBy.get(cur.id); return u ? L('One of them is in {0}.', 'Uno de ellos está en {0}.', t(`cont.${continentOf(u)}`)) : ''; }
    const all = (this.deck.get(cur.id)?.land ?? []).filter((x) => this.app.data.meta[x])
      .sort((a, b) => (this.unitBy.get(b)?.area ?? 0) - (this.unitBy.get(a)?.area ?? 0));
    if (all.length) {
      const land = all.slice(0, all.length > 4 ? 3 : 4).map((x) => this.name(x));
      if (all.length > land.length) land.push(L('{0} more', '{0} más', all.length - land.length));
      const list = new Intl.ListFormat(appLocale(), { type: 'conjunction' }).format(land);
      return L('It borders {0}.', 'Limita con {0}.', list);
    }
    const u = this.unitBy.get(cur.id);
    return u?.sr ? L('It is in {0}.', 'Está en {0}.', subregion(u.sr)) : '';
  }

  /** Its number, for the categories by size. */
  private valueOf(id: string): string {
    const s = this.s!, u = this.unitBy.get(id);
    if (!u) return '';
    if (s.cat === 'people') return u.pop >= 1e6 ? L('{0} million people', '{0} millones de personas', (u.pop / 1e6).toLocaleString(appLocale(), { maximumFractionDigits: 1 })) : L('{0} people', '{0} personas', fmtNumber(u.pop));
    if (s.cat === 'area') return `${fmtNumber(u.area)} km²`;
    if (s.cat === 'capitals') { const c = this.deck.get(id)?.cap; return c ? (es() ? c.es : c.en) : ''; }
    return '';
  }

  private renderDone() {
    const s = this.s!, card = this.host.card;
    const map = this.map(s.cat);
    const missed = s.ids.filter((id) => (s.daily ? s.got.get(id) : map[id]) === 0);
    const head = s.daily
      ? L('Done: ★ {0} of {1}', 'Hecho: ★ {0} de {1}', s.stats.stars, s.ids.length * 3)
      : L('{0} is filled in!', '¡Terminaste de colorear {1}!', cap(this.scopeName(s.scope)), this.scopeName(s.scope));
    const res = resultCard({ stars: s.ids.length ? Math.round((3 * s.stats.stars) / (s.ids.length * 3)) : undefined, headline: head,
      sub: s.stats.asked ? L('{0} of {1} right at the first try', '{0} de {1} acertados a la primera', s.stats.firsts, s.stats.asked) : undefined });
    res.querySelector('.result-headline')?.setAttribute('data-fill', 'done');
    card.append(res);
    if (missed.length) res.append(h('div', { class: 'tool-hint' }, L('Shown: {0}', 'Mostrados: {0}', missed.map((x) => this.name(x)).join(', '))));
    const actions = h('div', { class: 'result-actions' });
    const add = (label: string, fn: () => void, primary = false, attr = '') => {
      const b = h('button', { type: 'button', class: `pill${primary ? ' primary' : ''}`, 'data-fill': attr }, label);
      b.addEventListener('click', fn);
      actions.append(b);
    };
    if (!s.daily) {
      const nx = nextRegion(this.regions, s.scope.startsWith('r:') ? s.scope : '', (r) => this.scopeIds(s.cat, r.id).every((id) => map[id] != null), (id) => this.unitBy.get(id)?.at);
      if (nx) add(L('Next: {0}', 'Siguiente: {0}', es() ? subregion(nx.name) : nx.name), () => void this.start({ scope: nx.id }), true, 'next-region');
      if (missed.length) {
        const one = missed.length === 1 ? this.name(missed[0]) : '';
        add(one ? L('Try {0} again', 'Repetir {0}', one) : L('Try the {0} shown again', 'Repetir los {0} mostrados', missed.length), () => void this.start({ retry: true }), !nx, 'retry');
      }
    }
    add(L('Share', 'Compartir'), () => void this.share(s.cat), false, 'share');
    add(L('Menu', 'Menú'), () => { void this.stop(); void this.openPanel(); }, false, 'menu');
    res.append(actions);
  }

  // ---- The globe
  draw(rc: RenderCtx) {
    const s = this.s;
    if (!s) return;
    const { ctx } = rc;
    const dark = rc.theme.dark;
    const now = performance.now();
    const inScope = new Set(s.ids);
    // Outside the scope: dimmed. Inside: grey until filled; filled ones keep their colour (orange when shown).
    rc.fillCountries(this.outside(s), dark ? 'rgba(4,8,16,0.62)' : 'rgba(255,255,255,0.68)');
    const empty: string[] = [], shown: string[] = [];
    for (const id of s.ids) { const f = this.filled(id); if (f == null) empty.push(id); else if (f === 0) shown.push(id); }
    rc.fillCountries(empty, dark ? '#3a4250' : '#cfd4da');
    if (shown.length) rc.fillCountries(shown, 'rgba(242,153,74,0.8)');
    // A wrong tap: red for a moment.
    if (s.flash && now - s.flash.at < 1600) {
      rc.fillCountry(s.flash.id, 'rgba(235,87,87,0.75)');
      const m = this.app.data.meta[s.flash.id];
      const p = m && rc.project(m.lx, m.ly);
      if (p) rc.labels.add({ text: this.name(s.flash.id), x: p[0], y: p[1], priority: 3500, size: 13, weight: 800, color: '#fff', halo: 'rgba(120,0,0,0.9)' });
      requestAnimationFrame(() => this.app.renderer.requestRender());
    }
    // Just found: a green outline.
    if (s.ans && s.ans.ok) rc.strokeCountry(s.ans.id, '#2ecc71', 2.6);
    if (s.ans && !s.ans.ok) rc.strokeCountry(s.ans.id, '#f2994a', 2.6);
    // Tiny countries not yet filled: a ring to tap.
    const level = this.app.data.best('50m');
    for (const id of empty) {
      const u = this.unitBy.get(id);
      if (!u || !isTiny(this.app, id)) continue;
      const p = rc.project(u.at[0], u.at[1]);
      if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = dark ? 'rgba(200,210,225,0.85)' : 'rgba(60,70,90,0.8)'; ctx.stroke(); }
    }
    // The second hint: a circle around it.
    const cur = s.cur;
    if (cur && !s.ans && cur.misses >= 2) {
      const u = this.unitBy.get(cur.id), shape = level.byId.get(cur.id);
      const p = u && rc.project(u.at[0], u.at[1]);
      if (p && u) {
        const span = shape ? Math.max(shape.bbox[2] - shape.bbox[0], shape.bbox[3] - shape.bbox[1]) : 2;
        const q = rc.project(u.at[0] + Math.min(40, span * 1.6 + 3), u.at[1]);
        const rad = Math.max(42, q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : 42);
        // Off-centre, so the circle does not point at it exactly.
        const off = (hash(cur.id) % 360) * (Math.PI / 180);
        const cx = p[0] + Math.cos(off) * rad * 0.35, cy = p[1] + Math.sin(off) * rad * 0.35;
        ctx.beginPath(); ctx.arc(cx, cy, rad * (1 + 0.04 * Math.sin(now / 250)), 0, Math.PI * 2);
        ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ffd34d'; ctx.stroke(); ctx.setLineDash([]);
        requestAnimationFrame(() => this.app.renderer.requestRender());
      }
    }
    // The names of the filled countries.
    for (const id of s.ids) {
      if (this.filled(id) == null || !inScope.has(id)) continue;
      const u = this.unitBy.get(id);
      const p = u && rc.project(u.at[0], u.at[1]);
      if (p) rc.labels.add({ text: this.name(id), x: p[0], y: p[1], priority: s.ans?.id === id ? 3400 : 1200, size: s.ans?.id === id ? 13 : 11, weight: 700, color: '#fff', halo: 'rgba(0,0,0,0.8)' });
    }
  }
  private outside(s: Session): string[] {
    const key = `${s.cat}|${s.scope}|${this.units.length}`;
    let o = this.others.get(key);
    if (!o) { const ins = new Set(s.ids); o = Object.keys(this.app.data.meta).filter((k) => !ins.has(k)); this.others.set(key, o); }
    return o;
  }

  // ---- The panel
  async openPanel() {
    if (!(await this.load())) { this.shell.toast(L('Fill the map needs its data; check your connection.', 'Llena el mapa necesita sus datos; revisa tu conexión.')); return; }
    this.refreshUnits();
    if (fillState().settings.mode === 'states') await this.states.prepare(fillState().settings.a3);
    const root = h('div', { class: 'fill-panel' });
    const draw = () => { clear(root); root.append(...this.panel(draw)); };
    draw();
    this.shell.openPanel('fill', L('Fill the map', 'Llena el mapa'), root);
  }

  /** How full a set of countries is in a category: filled, stars, right first time. */
  private tally(cat: FillCat, ids: string[]) {
    const map = this.map(cat);
    let n = 0, stars = 0, three = 0, zero = 0;
    for (const id of ids) { const v = map[id]; if (v == null) continue; n++; stars += v; if (v === 3) three++; if (v === 0) zero++; }
    return { n, total: ids.length, stars, three, zero };
  }
  private bar(x: { n: number; total: number; three: number; zero: number }) {
    const w = (k: number) => `${x.total ? (100 * k) / x.total : 0}%`;
    return h('div', { class: 'mw-levels fill-bar' }, h('span', { class: 'mw-seg mw-mastered', style: `width:${w(x.three)}` }), h('span', { class: 'mw-seg fill-some', style: `width:${w(x.n - x.three - x.zero)}` }), h('span', { class: 'mw-seg mw-learning', style: `width:${w(x.zero)}` }));
  }

  private panel(redraw: () => void): HTMLElement[] {
    const st = fillState(), set = st.settings, cat = set.cat;
    const out: HTMLElement[] = [];
    // The world, or one country's states (v0.38.0).
    const mode = segmented<'world' | 'states'>(set.mode, [{ value: 'world', label: L('🌍 The world', '🌍 El mundo') }, { value: 'states', label: L('🧩 States', '🧩 Estados') }], (v) => {
      set.mode = v; saveFill();
      if (v === 'states') void this.states.prepare(set.a3).then(redraw); else redraw();
    });
    mode.dataset.fill = 'mode';
    out.push(mode);
    if (set.mode === 'states') { out.push(...this.states.panel(redraw)); return out; }
    out.push(this.dailyCard());
    const b = bell('fill');
    if (b) out.push(b);
    // The category.
    const chips = h('div', { class: 'chip-row', 'data-fill': 'cats' });
    for (const c of CATS) {
      const b = h('button', { type: 'button', class: `chip${c === cat ? ' on' : ''}`, 'data-cat': c }, `${CAT_TEXT[c].icon} ${this.catName(c)}`);
      b.addEventListener('click', () => { set.cat = c; saveFill(); redraw(); });
      chips.append(b);
    }
    out.push(h('h3', { class: 'sec-title' }, L('Fill it with', 'Llénalo con')), chips);
    if (cat === 'clues') {
      const th = h('div', { class: 'chip-row', 'data-fill': 'themes' });
      for (const x of THEMES) {
        const b = h('button', { type: 'button', class: `chip${x === set.theme ? ' on' : ''}`, 'data-theme': x }, tx(THEME_TEXT[x]));
        b.addEventListener('click', () => { set.theme = x; saveFill(); redraw(); });
        th.append(b);
      }
      out.push(th);
    }
    // The world, then each continent with its regions: tap one to fill it.
    const world = this.tally(cat, this.scopeIds(cat, 'world'));
    const first = world.n ? Math.round((100 * world.three) / world.n) : 0;
    out.push(h('div', { class: 'mw-progress', 'data-fill': 'world' }, this.bar(world),
      h('div', { class: 'mw-legend' }, h('span', null, L('{0} of {1} filled', '{0} de {1} coloreados', world.n, world.total)), h('span', null, `★ ${world.stars}/${world.total * 3}`), h('span', null, L('{0}% right first time', '{0} % a la primera', first)))));
    const scopeBtn = (scope: string, label: string, ids: string[], cls: string) => {
      const x = this.tally(cat, ids);
      const b = h('button', { type: 'button', class: `fill-scope ${cls}${x.n === x.total && x.total ? ' full' : ''}`, 'data-scope': scope },
        h('span', { class: 'fill-scope-name' }, label), this.bar(x), h('span', { class: 'mw-cont-n' }, `${x.n}/${x.total}`));
      b.addEventListener('click', () => { set.scope = scope; saveFill(); void this.start({ scope }); });
      return b;
    };
    const list = h('div', { class: 'fill-scopes' });
    list.append(scopeBtn('world', L('The whole world', 'El mundo entero'), this.scopeIds(cat, 'world'), 'fill-world'));
    for (const ct of CONTS) {
      const ids = this.scopeIds(cat, ct);
      if (!ids.length) continue;
      list.append(scopeBtn(ct, t(`cont.${ct}`), ids, 'fill-cont'));
      for (const r of this.regions.filter((x) => x.ct === ct)) {
        const rids = this.scopeIds(cat, r.id);
        if (rids.length) list.append(scopeBtn(r.id, es() ? subregion(r.name) : r.name, rids, 'fill-region'));
      }
    }
    out.push(h('h3', { class: 'sec-title' }, L('Where (tap to fill it)', 'Dónde (toca para llenarlo)')), list);
    // Share, start over, Master the world.
    const share = h('button', { type: 'button', class: 'pill sm', 'data-fill': 'share' }, icon(Share2, 15), L('Share this map', 'Compartir este mapa'));
    share.addEventListener('click', () => void this.share(cat));
    const reset = h('button', { type: 'button', class: 'pill sm', 'data-fill': 'reset' }, icon(RotateCcw, 15), L('Start this map over', 'Empezar este mapa de nuevo'));
    reset.addEventListener('click', () => {
      if (!world.n || confirm(L('Empty the {0} map ({1} filled)?', '¿Vaciar el mapa de {0} ({1} coloreados)?', this.catName(cat), world.n))) { resetFillMap(cat); redraw(); }
    });
    const mw = h('button', { type: 'button', class: 'pill sm' }, '🌍 ', L('Master the world', 'Domina el mundo'));
    mw.addEventListener('click', () => this.openMaster?.());
    out.push(h('div', { class: 'hop-actions mw-foot' }, share, reset, ...(this.openMaster ? [mw] : [])),
      h('p', { class: 'tool-hint' }, L('Each country you find is painted in with its name: right at the first try ★★★, the second ★★, the third ★; after three misses it is shown in orange. Every answer counts toward Master the world\'s daily goal.', 'Cada país que encuentras se colorea con su nombre: a la primera ★★★, a la segunda ★★, a la tercera ★; tras tres fallos se muestra en naranja. Cada respuesta cuenta para la meta diaria de Domina el mundo.')));
    return out;
  }

  /** A day's region and category, for its reminder (v0.37.1), or null before the data is here. */
  dayWhat(day: string): string | null {
    // (Its regions as the panel last made them: not remade under a game being played.)
    if (!this.regions.length && this.allUnits?.length) this.refreshUnits();
    if (!this.regions.length) return null;
    const pick = dailyPick(day, this.regions);
    return pick ? `${this.scopeName(pick.scope)} · ${this.catName(pick.cat)}` : null;
  }

  /** The region of the day (also in the Map games panel). */
  dailyCard(): HTMLElement {
    const day = dayKey();
    this.refreshUnits();
    const pick = dailyPick(day, this.regions);
    const done = fillState().dailies[day];
    const what = pick ? `${this.scopeName(pick.scope)} · ${this.catName(pick.cat)}` : '';
    const b = h('button', { type: 'button', class: `mode-card daily-card${done ? ' done' : ''}`, 'data-fill': 'daily' }, ftile('fill'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, L('Region of the day', 'Región del día')),
        h('span', { class: 'mode-desc' }, done ? `${L('Done', 'Hecho')}: ★ ${done.s}/${done.n} · ${what}` : `${what} · ${L('the same for everyone today', 'la misma para todos hoy')}`)));
    b.addEventListener('click', () => void this.startDaily());
    return b;
  }
  async startDaily() { if (await this.load()) await this.start({ daily: true }); }
  /** The data is here (the Map games panel waits for it before showing the region of the day). */
  ready() { return this.load(); }

  // ---- Sharing: a picture of the map
  async share(cat: FillCat) {
    await this.load();
    this.refreshUnits();
    const ids = this.scopeIds(cat, 'world');
    const x = this.tally(cat, ids);
    const first = x.n ? Math.round((100 * x.three) / x.n) : 0;
    const text = `🖍️ ${L('Fill the map', 'Llena el mapa')} · ${CAT_TEXT[cat].icon} ${this.catName(cat)}: ${x.n}/${x.total} · ★ ${x.stars} · ${L('{0}% first time', '{0} % a la primera', first)}\n${location.origin}${location.pathname}`;
    const blob = await this.picture(cat, x, first).catch(() => null);
    const file = blob ? new File([blob], 'fill-the-map.png', { type: 'image/png' }) : null;
    try { if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; } } catch (e) { if ((e as Error).name === 'AbortError') return; }
    await shareText(this.shell, text);
  }

  private async picture(cat: FillCat, x: { n: number; total: number; stars: number }, first: number): Promise<Blob | null> {
    const W = 1200, H = 760;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#0b1d33'; g.fillRect(0, 0, W, H);
    const proj = geoEqualEarth().fitExtent([[30, 130], [W - 30, H - 30]], { type: 'Sphere' } as never);
    const path = geoPath(proj, g);
    g.beginPath(); path({ type: 'Sphere' } as never); g.fillStyle = '#123c5a'; g.fill();
    const map = this.map(cat);
    const colour = (v: number | undefined, inPlay: boolean) => (!inPlay ? '#26303d' : v == null ? '#4a5262' : v === 3 ? '#27ae60' : v === 0 ? '#f2994a' : '#8fd19e');
    const playing = new Set(this.scopeIds(cat, 'world'));
    for (const sh of this.app.data.best('110m').countries) {
      g.beginPath(); path(sh.feature as never); g.fillStyle = colour(map[sh.id], playing.has(sh.id)); g.fill();
      g.lineWidth = 0.6; g.strokeStyle = 'rgba(11,29,51,0.8)'; g.stroke();
    }
    g.fillStyle = '#fff'; g.font = '800 46px system-ui, sans-serif';
    g.fillText(`🖍️ ${L('Fill the map', 'Llena el mapa')} · ${this.catName(cat)}`, 40, 70);
    g.font = '600 30px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillText(`${L('{0} of {1} filled', '{0} de {1} coloreados', x.n, x.total)} · ★ ${x.stars} · ${L('{0}% first time', '{0} % a la primera', first)}`, 40, 112);
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  }
}
