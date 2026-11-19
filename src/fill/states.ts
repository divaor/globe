// Fill the states (v0.38.0): Fill the map inside one country, its states, provinces or regions coloured in as you
// get them. By name for all 48 countries of the States and provinces quiz; by capital and biggest first (people,
// area) for the twelve with those facts. A map kept per country and category, three tries with hints (where in the
// country it is, then a circle), stars, the next country when one is full, and a country of the day in Today.
import { ChevronRight, SkipForward, RotateCcw, Share2, Play } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { ftile } from '../ui/features';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, appLocale, flagEmoji, dataLang } from '../app/i18n';
import { loadJSON } from '../data/store';
import { L, es, type PlayHost, type HostGame } from '../play/host';
import { shareText } from '../play/pin';
import { recordFeat, dayKey, type Badge } from '../learn/progress';
import type { Master } from '../master/master';
import { regionCountries, loadRegions, frameRegions, regionAt, type Region, type RegionCountry } from '../learn/regions';
import { hash, rng, starsFor, TRIES } from './logic';
import { WITH_FACTS, WORD, DIR_TEXT, catsOf, eligible, stateOrder, direction, dailyCountry, nextCountry, type StateCat, type StatesData } from './states-logic';
import { fillState, saveFill } from './store';
import { bell } from '../today/reminders';

export const STATE_CAT_TEXT: Record<StateCat, { icon: string; en: string; es: string }> = {
  names: { icon: '🗺️', en: 'Names', es: 'Nombres' },
  capitals: { icon: '🏛️', en: 'Capitals', es: 'Capitales' },
  people: { icon: '👥', en: 'Most people first', es: 'Más poblados primero' },
  area: { icon: '📐', en: 'Largest first', es: 'Más grandes primero' },
};

interface Cur { id: string; misses: number }
interface Answer { ok: boolean; id: string; given?: string; stars: number; at: number }
interface Session {
  a3: string; cat: StateCat; daily: string | null;
  list: Region[]; ids: string[]; queue: string[]; i: number;
  got: Map<string, number>; again: Set<string>;
  cur: Cur | null; ans: Answer | null;
  flash: { id: string; at: number } | null; note: string;
  stats: { stars: number; firsts: number; asked: number; shown: string[] };
  done: boolean; fold: boolean; timer: number; r: () => number;
}

export class FillStates implements HostGame {
  private s: Session | null = null;
  private data: StatesData | null = null;
  private countries: RegionCountry[] = [];
  private loaded: Promise<boolean> | null = null;
  private dimmed = new Map<string, string[]>();
  /** Each country's regions once loaded (the panel's progress bars are drawn at once). */
  private regionsOf = new Map<string, Region[]>();
  /** The map's own state names, hidden while playing (they would give the answers away). */
  private regionsLabels: boolean | null = null;
  /** Opens Fill the map's panel (the Menu button). */
  openPanel: (() => void) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost, private mw: Master) {}

  /** The 48 countries and the twelve's facts. */
  load(): Promise<boolean> {
    this.loaded ??= (async () => {
      const [list, data] = await Promise.all([regionCountries().catch(() => null), loadJSON<{ countries: StatesData }>('states/states.json').catch(() => null)]);
      if (!list) { this.loaded = null; return false; }
      this.countries = list;
      this.data = data?.countries ?? null;
      return true;
    })();
    return this.loaded;
  }
  ready() { return this.load(); }

  /** The countries: the twelve with facts first (in their order), then the rest by name. */
  list(): RegionCountry[] {
    const twelve = WITH_FACTS.map((a3) => this.countries.find((c) => c.id === a3)).filter((c): c is RegionCountry => !!c);
    const rest = this.countries.filter((c) => !WITH_FACTS.includes(c.id)).sort((a, b) => this.cname(a.id).localeCompare(this.cname(b.id), appLocale()));
    return [...twelve, ...rest];
  }
  hasFacts(a3: string) { return !!this.data?.[a3]; }
  cats(a3: string): StateCat[] { return catsOf(a3, this.data); }
  cname(a3: string) { return this.app.data.name(a3, dataLang()); }
  catName(c: StateCat) { return es() ? STATE_CAT_TEXT[c].es : STATE_CAT_TEXT[c].en; }
  private word(a3: string) { const w = WORD[a3]; return w ? (es() ? w[1] : w[0]) : L('region', 'región'); }
  private rname(r: Region | undefined) { return r ? (es() ? r.es : r.n) : ''; }
  private facts(a3: string, id: string) { return this.data?.[a3]?.[id]; }
  private capName(a3: string, id: string) { const c = this.facts(a3, id)?.c; return c ? (es() && c[1] ? c[1] : c[0]) : ''; }
  /** A country's saved map in a category. */
  map(a3: string, cat: StateCat) { const st = fillState(); return (st.states[`${a3}:${cat}`] ??= {}); }

  /** Loads a country's regions for the panel. */
  async prepare(a3: string) {
    if (!(await this.load())) return false;
    if (!this.regionsOf.has(a3)) { try { this.regionsOf.set(a3, await loadRegions(a3)); } catch { return false; } }
    return true;
  }
  /** How full a country is in a category (its regions loaded: prepare). */
  tally(a3: string, cat: StateCat) {
    const list = this.regionsOf.get(a3) ?? [];
    const ids = eligible(cat, list.map((r) => r.id), this.data?.[a3]);
    const m = this.map(a3, cat);
    let n = 0, stars = 0;
    for (const id of ids) { const v = m[id]; if (v != null) { n++; stars += v; } }
    return { n, total: ids.length, stars };
  }

  get info() {
    const s = this.s;
    if (!s) return null;
    return {
      a3: s.a3, cat: s.cat, daily: s.daily, ids: [...s.ids], queue: s.queue.slice(s.i), done: s.done,
      cur: s.cur ? { ...s.cur, name: this.rname(s.list.find((r) => r.id === s.cur!.id)) } : null, ans: s.ans ? { ...s.ans } : null,
      got: Object.fromEntries(s.got), stats: { ...s.stats, shown: [...s.stats.shown] }, note: s.note, prompt: s.cur ? this.prompt(s.cur) : '',
      at: Object.fromEntries(s.list.map((r) => [r.id, r.at])),
    };
  }

  // ---- Starting and stopping
  /** Fills a country (the one in the settings unless given); `retry` asks again the ones shown after three misses;
   *  `daily` plays the country of the day. */
  async start(o: { a3?: string; cat?: StateCat; retry?: boolean; daily?: boolean } = {}) {
    if (!(await this.load())) { this.shell.toast(L('Fill the states needs its data; check your connection.', 'Llena los estados necesita sus datos; revisa tu conexión.')); return; }
    const st = fillState(), set = st.settings;
    let a3 = o.a3 ?? set.a3, cat = o.cat ?? set.scat;
    const day = o.daily ? dayKey() : null;
    if (day) ({ a3, cat } = dailyCountry(day));
    if (!this.cats(a3).includes(cat)) cat = 'names';
    if (!day) { set.a3 = a3; set.scat = cat; set.mode = 'states'; saveFill(); }
    let list: Region[];
    try { list = await loadRegions(a3); } catch { this.shell.toast(L('Fill the states needs its map; check your connection.', 'Llena los estados necesita su mapa; revisa tu conexión.')); return; }
    const ids = eligible(cat, list.map((r) => r.id), this.data?.[a3]);
    const r = rng(day ? hash(`states:${day}:order`) : (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    const map = this.map(a3, cat);
    const todo = day ? ids : o.retry ? ids.filter((id) => map[id] === 0) : ids.filter((id) => map[id] == null);
    this.clearTimer();
    await this.host.enter(this);
    this.app.select(null);
    const r0 = this.app.renderer;
    if (this.regionsLabels == null) { this.regionsLabels = r0.regionLabels; r0.regionLabels = false; }
    this.s = {
      a3, cat, daily: day, list, ids, queue: stateOrder(cat, todo, this.data?.[a3], r), i: 0, got: new Map(), again: new Set(o.retry && !day ? todo : []),
      cur: null, ans: null, flash: null, note: '', stats: { stars: 0, firsts: 0, asked: 0, shown: [] },
      done: false, fold: false, timer: 0, r,
    };
    // (The globe, not a flat map: the country is framed on it.)
    if (this.app.renderer.view.current.kind !== 'globe') this.app.setProjection('globe');
    setTimeout(() => this.frame(), 150);
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

  /** The whole country in the map below the card (and clear of the zoom buttons). */
  private frame() {
    const s = this.s;
    if (!s) return;
    this.host.syncInset();
    const v = this.app.renderer.view;
    const mapH = Math.max(200, v.h - v.insetTop - v.insetBottom);
    const zb = document.querySelector<HTMLElement>('.zoombar')?.getBoundingClientRect();
    const right = zb && zb.width > 0 && zb.left > v.w / 2 ? Math.max(22, v.w - zb.left + 8) : 22;
    const m = this.app.data.meta[s.a3];
    v.flyTo(frameRegions(v, s.list, m ? [m.lx, m.ly] : s.list[0].at, mapH, right), 1200);
    this.app.renderer.requestRender();
  }

  // ---- Asking
  private filled(id: string): number | undefined {
    const s = this.s!;
    return s.daily || s.again.has(id) ? s.got.get(id) : this.map(s.a3, s.cat)[id] ?? s.got.get(id);
  }
  private ask() {
    const s = this.s!;
    s.ans = null; s.flash = null; s.note = '';
    while (s.i < s.queue.length && this.filled(s.queue[s.i]) != null && !s.daily) s.i++;
    if (s.i >= s.queue.length) { this.finish(); return; }
    s.cur = { id: s.queue[s.i], misses: 0 };
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
    const r = regionAt(s.list, g[0], g[1], this.app.renderer.view);
    if (r) this.answer(r.id);
    return true;
  }

  /** A tap on a state (the tests call it too). */
  answer(id: string) {
    const s = this.s;
    if (!s?.cur || s.ans || s.done) return;
    const cur = s.cur;
    const name = this.rname(s.list.find((r) => r.id === id));
    if (id !== cur.id && this.filled(id) != null && s.ids.includes(id)) {
      s.note = L('{0} is already filled in.', '{0} ya tiene color.', name);
      s.flash = { id, at: performance.now() };
      this.render();
      this.app.renderer.requestRender();
      return;
    }
    if (id === cur.id) { this.fillIn(id, starsFor(cur.misses), cur.misses === 0); return; }
    cur.misses++;
    s.flash = { id, at: performance.now() };
    s.note = L('That is {0}.', 'Ese es {0}.', name);
    if (cur.misses >= TRIES) { this.reveal(id); return; }
    this.render();
    this.app.renderer.requestRender();
    setTimeout(() => this.app.renderer.requestRender(), 1700);
  }
  giveUp() { const s = this.s; if (s?.cur && !s.ans && !s.done) this.reveal(''); }
  private reveal(given: string) {
    const s = this.s!, cur = s.cur!;
    cur.misses = TRIES;
    this.fillIn(cur.id, 0, false, given);
  }

  private fillIn(id: string, stars: number, first: boolean, given?: string) {
    const s = this.s!;
    const map = this.map(s.a3, s.cat);
    s.got.set(id, stars);
    map[id] = Math.max(map[id] ?? 0, stars);
    s.stats.stars += stars;
    if (first) s.stats.firsts++;
    if (!stars) s.stats.shown.push(id);
    s.ans = { ok: stars > 0, id, given, stars, at: performance.now() };
    if (stars > 0) s.flash = null;
    saveFill();
    const badges = this.feats(s.a3, s.cat);
    // Every answer counts toward Master the world's daily goal; a capital, in its State capitals deck too (v0.38.1).
    void this.mw.external(s.cat === 'capitals' ? 'states' : null, `${s.a3}|${id}`, first).then((b) => this.toastBadges([...badges, ...b]));
    s.i++;
    this.schedule(stars > 0 ? 1300 : 3200);
    this.render();
    this.app.renderer.requestRender();
  }
  private toastBadges(b: Badge[]) { if (b.length) this.shell.toast(`${b[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? b[0].es : b[0].en}`, 4000); }

  /** A country filled, its capitals all, a perfect country, all twelve countries' capitals: the badges. */
  private feats(a3: string, cat: StateCat): Badge[] {
    const s = this.s!;
    const map = this.map(a3, cat);
    if (!s.ids.length || !s.ids.every((id) => map[id] != null)) return [];
    const got = [...recordFeat('states-country')];
    if (cat === 'capitals') got.push(...recordFeat('states-capitals'));
    if (s.ids.every((id) => map[id] === 3)) got.push(...recordFeat('states-perfect'));
    const st = fillState();
    if (WITH_FACTS.every((c) => { const m = st.states[`${c}:capitals`] ?? {}; const n = Object.keys(m).length; return n > 0 && n >= this.capitalCount(c); })) got.push(...recordFeat('states-twelve'));
    return got;
  }
  private capitalCount(a3: string) { return Object.values(this.data?.[a3] ?? {}).filter((x) => !x.s && x.c?.[0]).length; }

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
      if (!st.stateDailies[s.daily]) {
        st.stateDailies[s.daily] = { s: s.stats.stars, n: s.ids.length * 3, m: s.ids.map((id) => String(s.got.get(id) ?? 0)).join(''), a3: s.a3, cat: s.cat };
        saveFill();
      }
    }
    this.frame();
    this.render();
    this.app.renderer.requestRender();
  }

  // ---- The card
  render() {
    const s = this.s;
    const card = this.host.card;
    clear(card);
    if (!s) return;
    const title = `${s.daily ? '🗓️' : STATE_CAT_TEXT[s.cat].icon} ${s.daily ? L('Country of the day', 'País del día') : this.catName(s.cat)} · ${flagEmoji(this.app.data.meta[s.a3]?.a2)} ${this.cname(s.a3)}`;
    card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    card.append(h('div', { class: 'hop-stats', 'data-states': 'status' }, this.status()));
    if (s.done) { this.renderDone(); return; }
    const cur = s.cur;
    if (!cur) return;
    card.append(h('div', { class: 'quiz-q', 'data-states': 'prompt' }, this.prompt(cur)));
    if (s.fold) return;
    if (s.ans) {
      const a = s.ans, name = this.rname(s.list.find((r) => r.id === a.id));
      const extra = this.valueOf(a.id);
      card.append(h('div', { class: `quiz-fb ${a.ok ? 'ok' : 'bad'}`, 'data-states': 'feedback' }, a.ok
        ? `✅ ${name} ${'★'.repeat(a.stars)}${'☆'.repeat(3 - a.stars)}${extra ? ` · ${extra}` : ''}`
        : `👀 ${L('It is {0}', 'Es {0}', name)}${extra ? ` · ${extra}` : ''}`));
      const next = h('button', { type: 'button', class: 'pill sm primary', 'data-states': 'next' }, L('Next', 'Siguiente'), icon(ChevronRight, 15));
      next.addEventListener('click', () => this.next());
      card.append(h('div', { class: 'hop-actions' }, next));
      return;
    }
    if (s.note) card.append(h('div', { class: 'quiz-fb bad', 'data-states': 'miss' }, s.note));
    const hint = this.hint(cur);
    if (hint) card.append(h('div', { class: 'tool-hint fill-hint', 'data-states': 'hint' }, `💡 ${hint}`));
    const tries = h('span', { class: 'fill-tries' }, `${L('Tries', 'Intentos')}: ${'●'.repeat(TRIES - cur.misses)}${'○'.repeat(cur.misses)}`);
    const show = h('button', { type: 'button', class: 'pill sm', 'data-states': 'giveup' }, icon(SkipForward, 15), L('Show me', 'Muéstramelo'));
    show.addEventListener('click', () => this.giveUp());
    card.append(h('div', { class: 'hop-actions' }, tries, show));
  }

  private status(): string {
    const s = this.s!;
    if (s.daily) return `${Math.min(s.got.size, s.ids.length)}/${s.ids.length} · ★ ${s.stats.stars}`;
    const map = this.map(s.a3, s.cat);
    const n = s.ids.filter((id) => map[id] != null).length;
    const stars = s.ids.reduce((a, id) => a + (map[id] ?? 0), 0);
    return `${L('Filled', 'Coloreados')} ${n}/${s.ids.length} · ★ ${stars}/${s.ids.length * 3}`;
  }

  private prompt(cur: Cur): string {
    const s = this.s!, r = s.list.find((x) => x.id === cur.id), w = this.word(s.a3);
    switch (s.cat) {
      case 'names': return L('Tap {0}', 'Toca {0}', this.rname(r));
      case 'capitals': return L('Tap the {0} whose capital is {1}', 'Toca {2} {0} cuya capital es {1}', w, this.capName(s.a3, cur.id), this.esArticle(s.a3));
      case 'people': return L('Tap the {0} with the most people left', 'Toca {1} {0} {2, select, f {más poblada} other {más poblado}} que queda', w, this.esArticle(s.a3), this.esFem(s.a3) ? 'f' : 'm');
      case 'area': return L('Tap the largest {0} left', 'Toca {1} {0} más grande que queda', w, this.esArticle(s.a3));
    }
  }
  /** "la provincia", "el estado". */
  private esFem(a3: string) { return ['ARG', 'CAN', 'CHL', 'PER', 'ESP'].includes(a3); }
  private esArticle(a3: string) { return this.esFem(a3) ? 'la' : 'el'; }

  /** After a miss: where in the country it is; after two, a circle around it. */
  private hint(cur: Cur): string {
    const s = this.s!;
    if (!cur.misses) return '';
    if (cur.misses >= 2) return L('It is inside the circle.', 'Está dentro del círculo.');
    const r = s.list.find((x) => x.id === cur.id);
    if (!r) return '';
    const main = s.list.filter((x) => !x.far);
    let w = Infinity, so = Infinity, e = -Infinity, n = -Infinity;
    for (const x of main.length ? main : s.list) { w = Math.min(w, x.core[0][0]); so = Math.min(so, x.core[0][1]); e = Math.max(e, x.core[1][0]); n = Math.max(n, x.core[1][1]); }
    const d = DIR_TEXT[direction(r.at, [[w, so], [e, n]])];
    return r.far ? L('It lies apart from the rest.', 'Está apartado del resto.') : L('It is in {0} of {1}.', 'Está en {2} de {1}.', d[0], this.cname(s.a3), d[1]);
  }

  /** What the answer shows: its capital (and its biggest city when that is another), people or area. */
  private valueOf(id: string): string {
    const s = this.s!, f = this.facts(s.a3, id);
    if (!f) return '';
    if (s.cat === 'people') return f.p >= 1e6 ? L('{0} million people', '{0} millones de personas', (f.p / 1e6).toLocaleString(appLocale(), { maximumFractionDigits: 1 })) : L('{0} people', '{0} personas', fmtNumber(f.p));
    if (s.cat === 'area') return `${fmtNumber(f.a)} km²`;
    if (s.cat === 'capitals' || s.cat === 'names') {
      if (f.s) return '';
      const cap = this.capName(s.a3, id), note = f.c[5], big = f.b ? (es() && f.b[1] ? f.b[1] : f.b[0]) : '';
      return `🏛️ ${cap}${note ? ` (${es() ? note[1] : note[0]})` : ''}${big ? ` · ${L('{0} is the biggest', '{0} es la más grande', big)}` : ''}`;
    }
    return '';
  }

  private renderDone() {
    const s = this.s!, card = this.host.card;
    const map = this.map(s.a3, s.cat);
    const missed = s.ids.filter((id) => (s.daily ? s.got.get(id) : map[id]) === 0);
    const head = s.daily
      ? L('Done: ★ {0} of {1}', 'Hecho: ★ {0} de {1}', s.stats.stars, s.ids.length * 3)
      : L('{0} is filled in!', '¡Terminaste de colorear {0}!', this.cname(s.a3));
    const res = resultCard({ stars: s.ids.length ? Math.round((3 * s.stats.stars) / (s.ids.length * 3)) : undefined, headline: head,
      sub: s.stats.asked ? L('{0} of {1} right at the first try', '{0} de {1} acertados a la primera', s.stats.firsts, s.stats.asked) : undefined });
    res.querySelector('.result-headline')?.setAttribute('data-states', 'done');
    card.append(res);
    const name = (id: string) => this.rname(s.list.find((r) => r.id === id));
    if (missed.length) res.append(h('div', { class: 'tool-hint' }, L('Shown: {0}', 'Mostrados: {0}', missed.map(name).join(', '))));
    const actions = h('div', { class: 'result-actions' });
    const add = (label: string, fn: () => void, primary = false, attr = '') => {
      const b = h('button', { type: 'button', class: `pill${primary ? ' primary' : ''}`, 'data-states': attr }, label);
      b.addEventListener('click', fn);
      actions.append(b);
    };
    if (!s.daily) {
      const order = this.list().filter((c) => this.cats(c.id).includes(s.cat)).map((c) => c.id);
      const full = (a3: string) => { const m = fillState().states[`${a3}:${s.cat}`] ?? {}; const n = Object.keys(m).length; return n > 0 && n >= (this.countries.find((c) => c.id === a3)?.n ?? Infinity) - (s.cat === 'capitals' ? Object.values(this.data?.[a3] ?? {}).filter((x) => x.s).length : 0); };
      const nx = nextCountry(order, s.a3, full);
      if (nx) add(L('Next: {0}', 'Siguiente: {0}', this.cname(nx)), () => void this.start({ a3: nx }), true, 'next-country');
      if (missed.length) {
        const one = missed.length === 1 ? name(missed[0]) : '';
        add(one ? L('Try {0} again', 'Repetir {0}', one) : L('Try the {0} shown again', 'Repetir los {0} mostrados', missed.length), () => void this.start({ retry: true }), !nx, 'retry');
      }
    }
    add(L('Share', 'Compartir'), () => void this.share(), false, 'share');
    add(L('Menu', 'Menú'), () => { void this.stop(); this.openPanel?.(); }, false, 'menu');
    res.append(actions);
  }

  /** "Fill the states · 🇲🇽 Mexico · Capitals: 32/32 · ★ 90" and the link. */
  shareLine(): string {
    const s = this.s;
    if (!s) return '';
    const map = this.map(s.a3, s.cat);
    const n = s.ids.filter((id) => map[id] != null).length, stars = s.ids.reduce((a, id) => a + (map[id] ?? 0), 0);
    return `🖍️ ${L('Fill the states', 'Llena los estados')} · ${flagEmoji(this.app.data.meta[s.a3]?.a2)} ${this.cname(s.a3)} · ${this.catName(s.cat)}: ${n}/${s.ids.length} · ★ ${stars}`;
  }
  async share() { await shareText(this.shell, `${this.shareLine()}\n${location.origin}${location.pathname}`); }

  // ---- The map
  draw(rc: RenderCtx) {
    const s = this.s;
    if (!s) return;
    const { ctx, path } = rc;
    const dark = rc.theme.dark;
    const now = performance.now();
    // The rest of the world dimmed.
    let others = this.dimmed.get(s.a3);
    if (!others) { others = Object.keys(this.app.data.meta).filter((k) => k !== s.a3); this.dimmed.set(s.a3, others); }
    rc.fillCountries(others, dark ? 'rgba(4,8,16,0.62)' : 'rgba(255,255,255,0.68)');
    // Each state: grey while empty (and the ones not asked, a little darker), its own colour once filled, orange
    // when shown, red for a moment after a wrong tap.
    const asked = new Set(s.ids);
    for (const r of s.list) {
      const f = asked.has(r.id) ? this.filled(r.id) : undefined;
      let fill: string;
      if (!asked.has(r.id)) fill = dark ? '#2b313b' : '#e3e6ea';
      else if (f == null) fill = dark ? '#3a4250' : '#cfd4da';
      else if (f === 0) fill = 'rgba(242,153,74,0.85)';
      else { const hue = hash(r.id) % 360; fill = dark ? `hsl(${hue}, 45%, 46%)` : `hsl(${hue}, 60%, 72%)`; }
      if (s.flash?.id === r.id && now - s.flash.at < 1600) fill = 'rgba(235,87,87,0.8)';
      ctx.beginPath(); path(r.f as never); ctx.fillStyle = fill; ctx.fill();
    }
    ctx.beginPath();
    for (const r of s.list) path(r.f as never);
    ctx.strokeStyle = dark ? 'rgba(235,240,248,0.75)' : 'rgba(70,58,44,0.6)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    const outline = (id: string, color: string) => { const r = s.list.find((x) => x.id === id); if (!r) return; ctx.beginPath(); path(r.f as never); ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.stroke(); };
    if (s.ans) outline(s.ans.id, s.ans.ok ? '#2ecc71' : '#f2994a');
    if (s.flash && now - s.flash.at < 1600) {
      const r = s.list.find((x) => x.id === s.flash!.id);
      const p = r && rc.project(r.at[0], r.at[1]);
      if (p) rc.labels.add({ text: this.rname(r), x: p[0], y: p[1], priority: 3500, size: 13, weight: 800, color: '#fff', halo: 'rgba(120,0,0,0.9)' });
      requestAnimationFrame(() => this.app.renderer.requestRender());
    }
    // The second hint: a circle around it (off-centre, so it does not point at it exactly).
    const cur = s.cur;
    if (cur && !s.ans && cur.misses >= 2) {
      const r = s.list.find((x) => x.id === cur.id);
      const p = r && rc.project(r.at[0], r.at[1]);
      if (p && r) {
        const span = Math.max(r.core[1][0] - r.core[0][0], r.core[1][1] - r.core[0][1]);
        const q = rc.project(r.at[0] + Math.min(30, span * 1.4 + 1), r.at[1]);
        const rad = Math.max(40, q ? Math.hypot(q[0] - p[0], q[1] - p[1]) : 40);
        const off = (hash(cur.id) % 360) * (Math.PI / 180);
        ctx.beginPath(); ctx.arc(p[0] + Math.cos(off) * rad * 0.35, p[1] + Math.sin(off) * rad * 0.35, rad * (1 + 0.04 * Math.sin(now / 250)), 0, Math.PI * 2);
        ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ffd34d'; ctx.stroke(); ctx.setLineDash([]);
        requestAnimationFrame(() => this.app.renderer.requestRender());
      }
    }
    // The names of the filled ones (and, for capitals, the capital under it).
    for (const r of s.list) {
      if (!asked.has(r.id) || this.filled(r.id) == null) continue;
      const p = rc.project(r.at[0], r.at[1]);
      const big = s.ans?.id === r.id;
      if (p) rc.labels.add({ text: s.cat === 'capitals' ? `${this.rname(r)} · ${this.capName(s.a3, r.id)}` : this.rname(r), x: p[0], y: p[1], priority: big ? 3400 : 1200, size: big ? 13 : 11, weight: 700, color: '#fff', halo: 'rgba(0,0,0,0.8)' });
    }
  }

  // ---- The panel (in Fill the map's, under States)
  panel(redraw: () => void): HTMLElement[] {
    const set = fillState().settings;
    if (!this.cats(set.a3).includes(set.scat)) set.scat = 'names';
    const a3 = set.a3, cat = set.scat;
    const out: HTMLElement[] = [this.dailyCard()];
    const rb = bell('states');
    if (rb) out.push(rb);
    // The country: the twelve with capitals first.
    const sel = h('select', { class: 'select', 'data-states': 'country', 'aria-label': L('Country', 'País') }) as HTMLSelectElement;
    const group = (label: string, list: RegionCountry[]) => {
      const g = h('optgroup', { label });
      for (const c of list) g.append(h('option', { value: c.id, ...(c.id === a3 ? { selected: true } : {}) }, `${flagEmoji(this.app.data.meta[c.id]?.a2)} ${this.cname(c.id)} (${c.n})`));
      sel.append(g);
    };
    const all = this.list();
    group(L('Names, capitals and biggest first', 'Nombres, capitales y más grandes primero'), all.filter((c) => this.hasFacts(c.id)));
    group(L('Names', 'Nombres'), all.filter((c) => !this.hasFacts(c.id)));
    sel.addEventListener('change', () => { set.a3 = sel.value; fillState(); saveFill(); void this.prepare(sel.value).then(redraw); });
    const info = this.countries.find((c) => c.id === a3);
    out.push(h('h3', { class: 'sec-title' }, L('Country', 'País')), sel,
      ...(info ? [h('p', { class: 'tool-hint' }, es() ? info.what.es : info.what.en)] : []));
    // The categories, each with how full it is: tap one to fill it.
    const rows = h('div', { class: 'fill-scopes', 'data-states': 'cats' });
    for (const c of this.cats(a3)) {
      const x = this.tally(a3, c);
      const w = (k: number) => `${x.total ? (100 * k) / x.total : 0}%`;
      const b = h('button', { type: 'button', class: `fill-scope fill-cont${c === cat ? ' on' : ''}${x.n === x.total && x.total ? ' full' : ''}`, 'data-scat': c },
        h('span', { class: 'fill-scope-name' }, `${STATE_CAT_TEXT[c].icon} ${this.catName(c)}`),
        h('div', { class: 'mw-levels fill-bar' }, h('span', { class: 'mw-seg mw-mastered', style: `width:${w(x.n)}` })),
        h('span', { class: 'mw-cont-n' }, `${x.n}/${x.total}`));
      b.addEventListener('click', () => { set.scat = c; saveFill(); void this.start({ a3, cat: c }); });
      rows.append(b);
    }
    out.push(h('h3', { class: 'sec-title' }, L('Fill it with (tap to play)', 'Llénalo con (toca para jugar)')), rows);
    if (!this.hasFacts(a3)) out.push(h('p', { class: 'tool-hint' }, L('Capitals and biggest first are for the first twelve countries of the list.', 'Las capitales y los más grandes primero son para los doce primeros países de la lista.')));
    const x = this.tally(a3, cat);
    const play = h('button', { type: 'button', class: 'pill sm primary', 'data-states': 'start' }, icon(Play, 15), x.n && x.n < x.total ? L('Go on', 'Continuar') : L('Play', 'Jugar'));
    play.addEventListener('click', () => void this.start({ a3, cat }));
    const reset = h('button', { type: 'button', class: 'pill sm', 'data-states': 'reset' }, icon(RotateCcw, 15), L('Start over', 'Empezar de nuevo'));
    reset.addEventListener('click', () => {
      if (!x.n || confirm(L('Empty {0}\'s {1} map ({2} filled)?', '¿Vaciar el mapa de {1} de {0} ({2} coloreados)?', this.cname(a3), this.catName(cat), x.n))) { fillState().states[`${a3}:${cat}`] = {}; saveFill(); redraw(); }
    });
    const share = h('button', { type: 'button', class: 'pill sm', 'data-states': 'share' }, icon(Share2, 15), L('Share', 'Compartir'));
    share.addEventListener('click', () => void shareText(this.shell, `🖍️ ${L('Fill the states', 'Llena los estados')} · ${flagEmoji(this.app.data.meta[a3]?.a2)} ${this.cname(a3)} · ${this.catName(cat)}: ${x.n}/${x.total} · ★ ${x.stars}\n${location.origin}${location.pathname}`));
    out.push(h('div', { class: 'hop-actions mw-foot' }, play, reset, share),
      h('p', { class: 'tool-hint' }, L('Like Fill the map, inside a country: each state you find is coloured in, ★★★ at the first try; after three misses it is shown in orange. A hint after a miss says where in the country it is.', 'Como Llena el mapa, dentro de un país: cada estado que encuentras se colorea, ★★★ a la primera; tras tres fallos se muestra en naranja. Tras un fallo, una pista dice en qué parte del país está.')));
    return out;
  }

  // ---- The country of the day
  /** Its words for a day (the reminder) and the panel's card. */
  dayWhat(day: string): string { const d = dailyCountry(day); return `${this.cname(d.a3)} · ${this.catName(d.cat)}`; }
  dailyCard(): HTMLElement {
    const day = dayKey(), d = dailyCountry(day), done = fillState().stateDailies[day];
    const what = `${flagEmoji(this.app.data.meta[d.a3]?.a2)} ${this.cname(d.a3)} · ${this.catName(d.cat)}`;
    const b = h('button', { type: 'button', class: `mode-card daily-card${done ? ' done' : ''}`, 'data-states': 'daily' }, ftile('fill'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, L('Country of the day', 'País del día')),
        h('span', { class: 'mode-desc' }, done ? `${L('Done', 'Hecho')}: ★ ${done.s}/${done.n} · ${what}` : `${what} · ${L('the same for everyone today', 'el mismo para todos hoy')}`)));
    b.addEventListener('click', () => void this.start({ daily: true }));
    return b;
  }
  startDaily() { return this.start({ daily: true }); }
}

