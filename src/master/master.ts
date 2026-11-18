// Master the world (v0.34.0): learn every capital, flag and country for good. Three decks (capitals, flags,
// countries) and three ways to play them: Learn (spaced repetition: the countries due today and a few new ones),
// Run (three hearts, a combo, a power-up every 10 in a row) and Marathon (the whole deck; a miss starts it over).
// Each question is asked on the globe: the country outlined with the rest dimmed, four of its cities as dots with
// no names, flags among their look-alikes, a country to find on a map with no names. Every answer counts toward the
// daily goal (20), whose streak is the Daily challenge's too; Your world (world.ts) paints what you know.
import { Earth, Share2, Send, SkipForward, Pause, Play, Map as MapIcon, ChevronRight } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, clear, toggle, segmented } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { dataUrl } from '../data/store';
import { L, es, type PlayHost, type HostGame } from '../play/host';
import { shareText } from '../play/pin';
import { countryIndex, type CountryIndex } from '../mydata/parse';
import { recordMaster, recordFeat, dayKey, onReset, type Badge } from '../learn/progress';
import { DECKS, ORDERS, addDays, grade, step as stepOf, ordered, learnQueue, requeue, rng, shuffle, newRun, runAnswer, multiplier, marathonList, SKIP_AFTER, type DeckId, type Order, type Run, type Power, type Level } from './srs';
import { inScope, question, flagNote, neighbours, typedRight, SCOPES, type Country, type DeckData, type Question, type Scope, type Place } from './decks';
import { master, saveMaster, resetMaster, GOAL, type Speed } from './store';
import { loadDeck, levelOf, LEVEL_COLORS } from './data';
import { yourWorldLayer, refreshYourWorld, WORLD_ID } from './world';
import { appLocale } from '../app/i18n';
import { pickCountry } from '../play/pick';

type Mode = 'learn' | 'run' | 'marathon';
type Done = 'end' | 'empty' | 'over' | 'miss' | 'won';

const DECK_TEXT: Record<DeckId, { icon: string; en: string; es: string }> = {
  capitals: { icon: '🏛️', en: 'Capitals', es: 'Capitales' },
  flags: { icon: '🏳️', en: 'Flags', es: 'Banderas' },
  countries: { icon: '🗺️', en: 'Countries', es: 'Países' },
};
const MODE_TEXT: Record<Mode, { icon: string; en: string; es: string }> = {
  learn: { icon: '📚', en: 'Learn', es: 'Aprender' },
  run: { icon: '❤️', en: 'Run', es: 'Racha' },
  marathon: { icon: '🏃', en: 'Marathon', es: 'Maratón' },
};
const SCOPE_TEXT: Record<Scope, [string, string]> = {
  world: ['World', 'Mundo'], EU: ['Europe', 'Europa'], AS: ['Asia', 'Asia'], AF: ['Africa', 'África'],
  NA: ['North and Central America', 'Norte y Centroamérica'], SA: ['South America', 'Sudamérica'], OC: ['Oceania', 'Oceanía'],
};
const ORDER_TEXT: Record<Order, [string, string]> = {
  balanced: ['Balanced: the best known first, a lesser known every fourth', 'Equilibrado: los más conocidos primero, uno menos conocido cada cuatro'],
  known: ['The best known first', 'Los más conocidos primero'],
  people: ['The most people first', 'Los más poblados primero'],
  continent: ['Continent by continent', 'Continente por continente'],
  fixed: ['A to Z', 'De la A a la Z'],
  random: ['Random', 'Al azar'],
};
const SPEED_TEXT: Record<Speed, [string, string]> = { fast: ['Fast', 'Rápido'], normal: ['Normal', 'Normal'], slow: ['Slow', 'Lento'] };
/** How long the answer stays before the next question: right, and missed (a tap moves on sooner). */
const SPEED_MS: Record<Speed, { ok: number; bad: number }> = { fast: { ok: 1500, bad: 4000 }, normal: { ok: 2500, bad: 5000 }, slow: { ok: 4000, bad: 8000 } };
const LEVEL_TEXT: Record<Level, [string, string]> = { new: ['to meet', 'por conocer'], learning: ['learning', 'aprendiendo'], known: ['known', 'conocidos'], mastered: ['mastered', 'dominados'] };
const POWER_TEXT: Record<Power, { icon: string; en: string; es: string }> = {
  half: { icon: '✂️', en: 'Fifty-fifty', es: 'Cincuenta y cincuenta' },
  heart: { icon: '❤️', en: 'A heart', es: 'Un corazón' },
  peek: { icon: '👀', en: 'Peek', es: 'Espiar' },
};

interface Answer {
  ok: boolean; at: number;
  /** What was picked, tapped or typed: an option's value, a country id, the typed text. */
  given?: string;
  /** Seen with a power-up: not graded, the combo kept. */
  peek?: boolean;
  /** A run's points for it and the power-up it won. */
  gained?: number; power?: Power | null;
  /** The country was just mastered, or relearned (a comeback). */
  mastered?: boolean; comeback?: boolean;
}
interface Session {
  mode: Mode; deck: DeckId; scope: Scope;
  allowed: Map<string, Country>; order: string[];
  queue: string[]; i: number; again: Record<string, number>;
  q: Question | null; hidden: string[]; ans: Answer | null;
  run: Run | null; count: number;
  stats: { asked: number; right: number; mastered: string[] };
  done: Done | null; fold: boolean; paused: boolean; held: boolean;
  timer: number; due: number; left: number; total: number;
  r: () => number;
  /** Asked the other way round always or never (the tests), instead of now and then. */
  rev: boolean | null;
}

export class Master implements HostGame {
  private s: Session | null = null;
  private data: DeckData | null = null;
  private idx: CountryIndex | null = null;
  private others = new Map<string, string[]>();
  private ac: AudioContext | null = null;
  private bar: HTMLElement | null = null;
  /** Opens the Learn menu's Quiz panel (main.ts), from the panel's link. */
  openQuiz: (() => void) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {
    app.register([yourWorldLayer()]);
    shell.addMenu({ id: 'master', icon: Earth, label: () => L('Master the world', 'Domina el mundo'), order: 28, group: 'learn', onClick: () => void this.openPanel() });
    onReset.push(() => { resetMaster(); refreshYourWorld(app); });
    // Press and hold the card to keep the answer on screen.
    const card = host.card;
    card.addEventListener('pointerdown', (e) => {
      const s = this.s;
      if (this.host.current !== this || !s?.ans || s.done || (e.target as HTMLElement).closest('button, input, a')) return;
      s.held = true; this.pause();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) card.addEventListener(ev, () => { const s = this.s; if (s?.held) { s.held = false; this.resume(); } });
    document.addEventListener('keydown', (e) => this.key(e));
  }

  // ---- Data
  private async load(): Promise<DeckData | null> {
    this.data ??= await loadDeck();
    this.idx ??= countryIndex(this.app.data.meta as never);
    return this.data;
  }
  private name(id: string) { return this.app.data.name(id, es() ? 'es' : 'en'); }
  private nm(p: { en: string; es: string }) { return es() ? p.es : p.en; }
  private today() { return dayKey(); }

  /** Today (v0.37.0): today's answers toward the goal (every deck counts), the cards due, the streak. */
  todayGoal(): { n: number; goal: number; due: number; streak: number } {
    const st = master(), today = this.today();
    const n = st.goal.day === today ? Math.min(st.goal.n, GOAL) : 0;
    let due = 0;
    for (const cards of Object.values(st.cards)) for (const c of Object.values(cards ?? {})) if (c && c.seen > 0 && c.due <= today) due++;
    const streak = st.days.streak && st.days.last >= addDays(today, -1) ? st.days.streak : 0;
    return { n, goal: GOAL, due, streak };
  }
  private country(id: string) { return this.s?.allowed.get(id) ?? this.data?.countries.find((c) => c.id === id); }

  /** What the tests read. */
  get info() {
    const s = this.s;
    if (!s) return null;
    const q = s.q;
    return {
      mode: s.mode, deck: s.deck, scope: s.scope, i: s.i, n: s.queue.length, done: s.done, paused: s.paused,
      q: q ? { id: q.id, step: q.step, reverse: q.reverse, options: q.options ?? null, order: q.order ?? null, places: q.places?.map((p) => ({ en: p.en, es: p.es, at: p.at })) ?? null } : null,
      right: q ? this.rightValue(q) : null, hidden: [...s.hidden],
      answered: !!s.ans, ok: s.ans?.ok ?? null, run: s.run ? { ...s.run } : null, count: s.count, stats: { ...s.stats },
      goal: { ...master().goal }, card: q ? master().cards[s.deck][q.id] ?? null : null,
    };
  }

  // ---- Starting and stopping
  /** Starts a mode on the deck and region in the settings (or those given). */
  async start(mode: Mode, o: { deck?: DeckId; scope?: Scope; more?: boolean; reverse?: boolean } = {}) {
    const data = await this.load();
    if (!data) { this.shell.toast(L('Master the world needs its data; check your connection.', 'Domina el mundo necesita sus datos; revisa tu conexión.')); return; }
    const st = master(), set = st.settings;
    if (o.deck) set.deck = o.deck;
    if (o.scope) set.scope = o.scope;
    saveMaster();
    const deck = set.deck, scope = set.scope;
    const list = inScope(data, deck, scope, set.territories);
    const allowed = new Map(list.map((c) => [c.id, c]));
    const r = rng((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    const order = ordered(list.map((c) => ({ id: c.id, name: this.name(c.id), ct: c.ct, fame: c.fame, pop: c.pop })), set.order, Math.floor(Date.now() / 864e5));
    const cards = st.cards[deck];
    let queue: string[];
    if (mode === 'learn') {
      queue = learnQueue(order, cards, this.today()).queue;
      // Nothing due and nothing new: the shakiest ones (the soonest due) to practise.
      if (!queue.length && o.more) queue = order.filter((id) => cards[id]?.seen).sort((a, b) => cards[a]!.due.localeCompare(cards[b]!.due)).slice(0, 10);
    } else if (mode === 'run') queue = shuffle(order, r);
    else queue = marathonList(order, st.marathon[deck].inRow);
    // A game already on: its timer and run end here.
    this.clearTimer();
    if (this.s?.run && !this.s.done) this.endRun();
    await this.host.enter(this);
    // State and province names would give countries away (Alaska, Ontario).
    const r0 = this.app.renderer;
    if (this.regions == null) { this.regions = r0.regionLabels; r0.regionLabels = false; }
    this.s = {
      mode, deck, scope, allowed, order, queue, i: 0, again: {}, q: null, hidden: [], ans: null,
      run: mode === 'run' ? newRun() : null, count: 0, stats: { asked: 0, right: 0, mastered: [] },
      done: queue.length ? null : 'empty', fold: false, paused: false, held: false, timer: 0, due: 0, left: 0, total: 0, r, rev: o.reverse ?? null,
    };
    if (queue.length) this.ask(); else this.render();
  }

  async stop() {
    const s = this.s;
    if (!s) return;
    this.clearTimer();
    if (s.run && !s.done) this.endRun();
    this.s = null;
    this.card.classList.remove('mw-card', 'mw-paused');
    this.putRegions();
    await this.host.leave(this);
  }
  drop() { this.clearTimer(); if (this.s?.run && !this.s.done) this.endRun(); this.s = null; this.card.classList.remove('mw-card', 'mw-paused'); this.putRegions(); }
  /** The state names as they were before the game. */
  private regions: boolean | null = null;
  private putRegions() { if (this.regions != null) { this.app.renderer.regionLabels = this.regions; this.regions = null; } }

  // ---- Asking
  private ask() {
    const s = this.s!;
    const id = s.queue[s.i];
    const c = s.allowed.get(id)!;
    const set = master().settings;
    const card = master().cards[s.deck][id];
    let st = stepOf(card, set.typing);
    // Four dots too close together to tap apart (a city-state): picked from the list instead.
    if (s.deck === 'capitals' && st === 'tap' && spread([c.cap!.at, ...c.cities.map((x) => x.at)]) < 0.25) st = 'pick';
    const known = (card?.days.length ?? 0) >= 1;
    let reverse = false;
    if (s.deck === 'capitals' && known && st !== 'type') reverse = s.r() < 0.3;
    if (s.deck === 'flags' && st === 'tap') reverse = s.r() < 0.35;
    if (s.rev != null && ((s.deck === 'capitals' && known && st !== 'type') || (s.deck === 'flags' && st === 'tap'))) reverse = s.rev;
    s.q = question(s.deck, c, st, reverse, s.allowed, s.r);
    s.ans = null; s.hidden = [];
    this.frame();
    this.render();
    this.app.renderer.requestRender();
  }

  /** Moves the globe to the question. */
  private frame() {
    const s = this.s!, q = s.q!, c = s.allowed.get(q.id)!;
    const meta = this.app.data.meta;
    const at = (id: string): [number, number] | null => (meta[id] ? [meta[id].lx, meta[id].ly] : null);
    if (s.deck === 'capitals' && !q.reverse) { this.fit([c.cap!.at, ...c.cities.map((x) => x.at)]); return; }
    if (s.deck === 'capitals') { this.fit([c.cap!.at, ...(q.options ?? []).map(at).filter((x): x is [number, number] => !!x)], 8); return; }
    if (s.deck === 'flags' && q.reverse) return;
    if (s.deck === 'countries' && q.step === 'tap') {
      const near = [...c.land, ...c.near].slice(0, 4).map(at).filter((x): x is [number, number] => !!x);
      this.fit([at(q.id)!, ...near], 8);
      return;
    }
    this.app.flyToCountry(q.id, false);
  }

  /** Flies to show some points together, closer than the host's fit allows (a city-state's four places). */
  private fit(points: [number, number][], max = 60) {
    if (!points.length) return;
    let x = 0, y = 0, z = 0;
    for (const [a, b] of points) { const p = (a * Math.PI) / 180, t = (b * Math.PI) / 180; x += Math.cos(t) * Math.cos(p); y += Math.cos(t) * Math.sin(p); z += Math.sin(t); }
    const lon = (Math.atan2(y, x) * 180) / Math.PI, lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    let zoom = Math.max(1.05, Math.min(max, 140 / Math.max(0.35, spread(points) * 1.7)));
    if (this.app.renderer.view.current.kind === 'flat') zoom = Math.max(1, zoom * 0.7);
    if (window.innerWidth < 600) zoom *= 0.85;
    this.app.renderer.view.flyTo({ lon, lat, zoom });
  }

  /** The value of the right answer: the capital's place (index 0) or the country. */
  private rightValue(q: Question): string { return q.deck === 'capitals' && !q.reverse ? '0' : q.id; }
  /** The options as values, in the order shown (for the keys 1 to 4). */
  private optionValues(): string[] {
    const q = this.s?.q;
    if (!q) return [];
    if (q.deck === 'capitals' && !q.reverse) return q.step === 'pick' ? q.order!.map(String).filter((v) => !this.s!.hidden.includes(v)) : [];
    if (q.step === 'type' || (q.deck === 'countries' && q.step === 'tap')) return [];
    return (q.options ?? []).filter((v) => !this.s!.hidden.includes(v));
  }

  // ---- Answering
  /** An option picked (a place's index for a capital, else a country). */
  choose(value: string) {
    const s = this.s;
    if (!s?.q || s.ans || s.done) return;
    this.settle(value === this.rightValue(s.q), value);
  }

  /** A typed answer. */
  typeAnswer(text: string) {
    const s = this.s;
    if (!s?.q || s.ans || s.done || !text.trim()) return;
    const q = s.q, c = s.allowed.get(q.id)!;
    let ok: boolean;
    if (q.deck === 'capitals') ok = typedRight(text, [c.cap!.en, c.cap!.es]);
    else { const m = this.idx!.match(text); ok = m === q.id || typedRight(text, [this.app.data.meta[q.id]?.n ?? '', this.app.data.meta[q.id]?.es ?? '']); }
    this.settle(ok, text.trim());
  }

  /** "Show me": counts as a miss. */
  giveUp() { const s = this.s; if (s?.q && !s.ans && !s.done) this.settle(false, ''); }

  tap(g: [number, number] | null): boolean {
    const s = this.s;
    if (!s || this.host.current !== this) return false;
    if (s.done) return true;
    if (s.ans) { this.next(); return true; }
    const q = s.q;
    if (!q || !g) return true;
    const view = this.app.renderer.view;
    const tp = view.project(g[0], g[1]);
    if (q.deck === 'capitals' && !q.reverse && q.step !== 'type' && tp) {
      // The nearest dot within reach of the finger.
      let best = -1, bd = 34;
      q.places!.forEach((p, i) => {
        if (s.hidden.includes(String(i))) return;
        const pp = view.project(p.at[0], p.at[1]);
        const d = pp ? Math.hypot(pp[0] - tp[0], pp[1] - tp[1]) : Infinity;
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) this.choose(String(best));
      return true;
    }
    if (q.deck === 'countries' && q.step === 'tap') {
      // A tiny country near the tap first (Vatican City in Rome, an island in the ocean), then the one under it.
      const id = pickCountry(this.app, g, s.allowed.keys());
      if (id) this.settle(id === q.id, id);
      return true;
    }
    return true;
  }

  /** Uses a power-up won in a run. */
  usePower(p: Power) {
    const s = this.s;
    if (!s?.q || !s.run || s.ans || s.done) return;
    const k = s.run.powers.indexOf(p);
    if (k < 0) return;
    if (p === 'half') {
      const right = this.rightValue(s.q);
      const wrong = (s.q.deck === 'capitals' && !s.q.reverse ? s.q.order!.map(String) : s.q.options ?? []).filter((v) => v !== right && !s.hidden.includes(v));
      if (wrong.length < 2) return;
      s.hidden.push(...shuffle(wrong, s.r).slice(0, 2));
      s.run.powers.splice(k, 1);
      this.render();
      this.app.renderer.requestRender();
      return;
    }
    if (p === 'peek') {
      s.run.powers.splice(k, 1);
      s.ans = { ok: true, at: performance.now(), peek: true };
      this.afterAnswer(true);
    }
  }

  /** Grades an answer, counts it, and shows it. */
  private settle(ok: boolean, given: string) {
    const s = this.s!, q = s.q!, st = master();
    const today = this.today();
    const g = grade(st.cards[s.deck][q.id], ok, today);
    st.cards[s.deck][q.id] = g.card;
    const ans: Answer = { ok, at: performance.now(), given, mastered: g.mastered, comeback: g.comeback };
    s.stats.asked++;
    if (ok) s.stats.right++;
    if (g.mastered) s.stats.mastered.push(q.id);
    const badges: Badge[] = [];
    if (g.comeback) { st.comebacks++; badges.push(...recordMaster({ days: st.days.best, comebacks: st.comebacks })); }
    if (g.mastered) badges.push(...this.feats(s.deck, q.id));
    if (ok && s.deck === 'flags') badges.push(...this.pairs(q));
    // The mode's own count.
    if (s.mode === 'learn' && !ok && (s.again[q.id] ?? 0) < 2) { s.queue = requeue(s.queue, s.i, q.id); s.again[q.id] = (s.again[q.id] ?? 0) + 1; }
    if (s.run) { const r = runAnswer(s.run, ok, s.r); s.run = r.run; ans.gained = r.gained; ans.power = r.power; }
    if (s.mode === 'marathon') {
      const m = st.marathon[s.deck];
      m.inRow[q.id] = ok ? (m.inRow[q.id] ?? 0) + 1 : 0;
      if (ok) s.count++;
      m.record = Math.max(m.record, s.count);
    }
    badges.push(...this.tally());
    saveMaster();
    refreshYourWorld(this.app);
    s.ans = ans;
    this.sound(g.mastered ? 'star' : ok ? 'ok' : 'bad');
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? badges[0].es : badges[0].en}`, 4000);
    this.afterAnswer(ok);
  }

  private afterAnswer(ok: boolean) {
    const s = this.s!, q = s.q!;
    // The country asked from its flag, or its capital, is shown once it is known.
    if (q.deck === 'flags' && q.reverse) this.app.flyToCountry(q.id, false);
    const ms = SPEED_MS[master().settings.speed];
    this.schedule(ok ? ms.ok : ms.bad);
    this.render();
    this.app.renderer.requestRender();
  }

  /** Today's answers toward the daily goal; reaching it keeps the streak (the Daily challenge's too). */
  private tally(): Badge[] {
    const st = master(), today = this.today();
    if (st.goal.day !== today) st.goal = { day: today, n: 0 };
    st.goal.n++;
    if (st.goal.n !== GOAL) return [];
    if (st.days.last !== today) {
      st.days.streak = st.days.last === addDays(today, -1) ? st.days.streak + 1 : 1;
      st.days.last = today;
      st.days.best = Math.max(st.days.best, st.days.streak);
    }
    setTimeout(() => this.shell.toast(`🎯 ${L(`Daily goal reached: ${GOAL} answers`, `Meta diaria cumplida: ${GOAL} respuestas`)} · 🔥 ${st.days.streak}`, 3500), 600);
    return recordMaster({ days: st.days.best, comebacks: st.comebacks, goalToday: true });
  }

  /** Badges for a deck's continent, or all of it, mastered. */
  private feats(deck: DeckId, id: string): Badge[] {
    const data = this.data!, cards = master().cards[deck];
    const all = inScope(data, deck, 'world', false);
    const m = (c: Country) => !!cards[c.id]?.mastered;
    const got: Badge[] = [];
    if (deck === 'capitals') {
      const ct = data.countries.find((c) => c.id === id)?.ct;
      if (ct && all.filter((c) => c.ct === ct).every(m)) got.push(...recordFeat(`master-cap-${ct}`));
      if (all.every(m)) got.push(...recordFeat('master-cap-all'));
    }
    if (deck === 'countries' && all.every(m)) got.push(...recordFeat('master-neighbours'));
    return got;
  }

  /** Look-alike flags told apart: the right flag picked with its look-alike among the options. */
  private pairs(q: Question): Badge[] {
    const st = master(), data = this.data!;
    for (const o of q.options ?? []) {
      if (o === q.id || !flagNote(data, o, q.id)) continue;
      const key = o < q.id ? `${o}|${q.id}` : `${q.id}|${o}`;
      if (!st.pairs.includes(key)) st.pairs.push(key);
    }
    const territory = new Set(data.countries.filter((c) => c.t).map((c) => c.id));
    const all = Object.keys(data.flagNotes).filter((k) => k.split('|').every((x) => !territory.has(x)));
    return all.every((k) => st.pairs.includes(k)) ? recordFeat('master-flags') : [];
  }

  // ---- Moving on
  private schedule(ms: number) {
    const s = this.s!;
    this.clearTimer();
    s.total = ms; s.left = ms; s.paused = false;
    s.due = performance.now() + ms;
    s.timer = window.setTimeout(() => this.next(), ms);
  }
  private clearTimer() { const s = this.s; if (s?.timer) { clearTimeout(s.timer); s.timer = 0; } }
  pause() {
    const s = this.s;
    if (!s?.ans || s.paused || s.done) return;
    s.left = Math.max(0, s.due - performance.now());
    this.clearTimer();
    s.paused = true;
    this.syncBar();
    this.card.classList.add('mw-paused');
  }
  resume() {
    const s = this.s;
    if (!s?.ans || !s.paused || s.done) return;
    s.paused = false;
    s.due = performance.now() + s.left;
    s.timer = window.setTimeout(() => this.next(), s.left);
    this.syncBar();
    this.card.classList.remove('mw-paused');
  }
  private get card() { return this.host.card; }

  /** The bar that empties until the next question. */
  private syncBar() {
    const s = this.s, b = this.bar;
    if (!s || !b) return;
    const fill = b.firstElementChild as HTMLElement;
    const frac = s.total ? (s.paused ? s.left : Math.max(0, s.due - performance.now())) / s.total : 0;
    fill.style.transition = 'none';
    fill.style.width = `${(frac * 100).toFixed(1)}%`;
    if (s.paused) return;
    void fill.offsetWidth;
    fill.style.transition = `width ${Math.max(0, s.due - performance.now())}ms linear`;
    fill.style.width = '0%';
  }

  next() {
    const s = this.s;
    if (!s || !s.ans || s.done) return;
    this.clearTimer();
    this.card.classList.remove('mw-paused');
    if (s.run && s.run.hearts <= 0) { this.finish('over'); return; }
    if (s.mode === 'marathon' && !s.ans.ok) { this.finish('miss'); return; }
    s.i++;
    if (s.i >= s.queue.length) {
      if (s.mode === 'run') { s.queue = shuffle(s.order, s.r); s.i = 0; }
      else { this.finish(s.mode === 'learn' ? 'end' : 'won'); return; }
    }
    this.ask();
  }

  private endRun() {
    const s = this.s!, st = master();
    if (!s.run) return;
    const r = st.runs[s.deck];
    r.best = Math.max(r.best, s.run.score);
    r.combo = Math.max(r.combo, s.run.best);
    saveMaster();
  }

  private finish(how: Done) {
    const s = this.s!, st = master();
    s.done = how;
    s.ans = null;
    if (s.run) this.endRun();
    if (how === 'won') {
      const m = st.marathon[s.deck];
      m.record = Math.max(m.record, s.count);
      m.won = (m.won ?? 0) + 1;
      saveMaster();
      if (s.scope === 'world') { const b = recordFeat('master-marathon'); if (b.length) this.shell.toast(`${b[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? b[0].es : b[0].en}`, 4000); }
    }
    this.sound(how === 'won' || how === 'end' ? 'star' : 'bad');
    this.render();
    this.app.renderer.requestRender();
  }

  // ---- Sounds and buzz
  private sound(kind: 'ok' | 'bad' | 'star') {
    if (!master().settings.sound) return;
    if (kind === 'bad') { try { navigator.vibrate?.(90); } catch { /* no buzz here */ } }
    try {
      this.ac ??= new AudioContext();
      const ac = this.ac, t0 = ac.currentTime;
      const notes = kind === 'ok' ? [660, 880] : kind === 'star' ? [660, 880, 1320] : [220, 196];
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * 0.09;
        o.type = kind === 'bad' ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.22);
      });
    } catch { /* no sound here */ }
  }

  private key(e: KeyboardEvent) {
    const s = this.s;
    if (!s || this.host.current !== this || s.fold || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (s.ans && !s.done && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.next(); return; }
    const n = Number(e.key);
    if (!s.ans && !s.done && n >= 1 && n <= 4) { const v = this.optionValues()[n - 1]; if (v != null) { e.preventDefault(); this.choose(v); } }
  }

  // ---- The card
  render() {
    const s = this.s;
    clear(this.card);
    this.bar = null;
    if (!s) return;
    const dt = DECK_TEXT[s.deck], mt = MODE_TEXT[s.mode];
    const title = `${dt.icon} ${this.nm(dt)} · ${this.nm(mt)}`;
    this.card.classList.add('mw-card');
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    if (s.done) { this.renderDone(); return; }
    const q = s.q!, c = s.allowed.get(q.id)!;
    this.card.append(this.status());
    this.card.append(h('div', { class: 'quiz-q', 'data-master': 'question' }, this.prompt(q, c)));
    if (s.fold) return;
    if (q.deck === 'flags' && q.reverse) this.card.append(h('img', { class: 'quiz-flag mw-flag-big', src: this.flag(q.id), alt: L('A flag', 'Una bandera') }));
    if (s.ans) { this.renderAnswer(q, c); return; }
    const opts = this.optionValues();
    if (q.step === 'type') {
      const list = h('datalist', { id: 'mw-names' }, ...(q.deck === 'capitals' ? [] : [...s.allowed.keys()].map((k) => h('option', { value: this.name(k) }))));
      const input = h('input', { type: 'text', class: 'names-input', list: 'mw-names', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': L('Your answer', 'Tu respuesta'), placeholder: q.deck === 'capitals' ? L('Type the capital…', 'Escribe la capital…') : L('Type the country…', 'Escribe el país…'), 'data-master': 'type' }) as HTMLInputElement;
      const go = h('button', { type: 'button', class: 'pill sm primary', 'data-master': 'check' }, icon(Send, 15), L('Check', 'Comprobar'));
      go.addEventListener('click', () => this.typeAnswer(input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.typeAnswer(input.value); });
      this.card.append(list, input, h('div', { class: 'hop-actions' }, go, this.showMe()));
      setTimeout(() => input.focus(), 60);
    } else if (opts.length) {
      const grid = h('div', { class: `quiz-opts${q.deck === 'flags' && !q.reverse ? ' mw-flags' : ''}` });
      opts.forEach((v, n) => {
        const b = h('button', { type: 'button', class: 'pill quiz-opt', 'data-master': 'opt', 'data-value': v, 'aria-keyshortcuts': String(n + 1) }) as HTMLButtonElement;
        if (q.deck === 'flags' && !q.reverse) { b.append(h('img', { class: 'mw-flag', src: this.flag(v), alt: '' })); b.setAttribute('aria-label', `${L('Flag', 'Bandera')} ${n + 1}`); }
        else b.append(this.optionLabel(q, v));
        b.addEventListener('click', () => this.choose(v));
        grid.append(b);
      });
      this.card.append(grid);
    } else {
      this.card.append(h('div', { class: 'tool-hint' }, q.deck === 'capitals' ? L('Tap its dot on the map.', 'Toca su punto en el mapa.') : L('Tap it on the map.', 'Tócalo en el mapa.')), h('div', { class: 'hop-actions' }, this.showMe()));
    }
    if (s.run?.powers.length) this.card.append(this.powers());
  }

  private showMe() {
    const b = h('button', { type: 'button', class: 'pill sm', 'data-master': 'giveup' }, icon(SkipForward, 15), L('Show me', 'Muéstramelo'));
    b.addEventListener('click', () => this.giveUp());
    return b;
  }

  private powers() {
    const s = this.s!, q = s.q!;
    const row = h('div', { class: 'mw-powers' });
    const counts = new Map<Power, number>();
    for (const p of s.run!.powers) counts.set(p, (counts.get(p) ?? 0) + 1);
    for (const [p, n] of counts) {
      const usable = p !== 'half' || (q.step !== 'type' && !(q.deck === 'countries' && q.step === 'tap'));
      const b = h('button', { type: 'button', class: 'pill sm', 'data-power': p, disabled: !usable }, `${POWER_TEXT[p].icon} ${this.nm(POWER_TEXT[p])}${n > 1 ? ` ×${n}` : ''}`) as HTMLButtonElement;
      b.addEventListener('click', () => this.usePower(p));
      row.append(b);
    }
    return row;
  }

  private status(): HTMLElement {
    const s = this.s!, st = master();
    const goal = st.goal.day === this.today() ? st.goal.n : 0;
    const bits: string[] = [];
    if (s.mode === 'learn') bits.push(`${Math.min(s.i + 1, s.queue.length)}/${s.queue.length}`);
    if (s.run) bits.push(`${'❤️'.repeat(Math.max(0, s.run.hearts))}${'🤍'.repeat(Math.max(0, 3 - s.run.hearts))}`, `⭐ ${fmtNumber(s.run.score)}`, ...(s.run.combo >= 2 ? [`🔥 ${s.run.combo} ×${multiplier(s.run.combo)}`] : []));
    if (s.mode === 'marathon') bits.push(L(`${s.count} in a row of ${s.queue.length}`, `${s.count} seguidos de ${s.queue.length}`), `🏆 ${st.marathon[s.deck].record}`);
    bits.push(`🎯 ${Math.min(goal, GOAL)}/${GOAL}`);
    return h('div', { class: 'hop-stats mw-status', 'data-master': 'status' }, bits.join(' · '));
  }

  private prompt(q: Question, c: Country): string {
    const n = this.name(q.id);
    if (q.deck === 'capitals' && q.reverse) return L(`${this.nm(c.cap!)} is the capital of…`, `${this.nm(c.cap!)} es la capital de…`);
    if (q.deck === 'capitals') return q.step === 'tap' ? L(`Tap the capital of ${n}`, `Toca la capital de ${n}`) : q.step === 'type' ? L(`Type the capital of ${n}`, `Escribe la capital de ${n}`) : L(`What is the capital of ${n}?`, `¿Cuál es la capital de ${n}?`);
    if (q.deck === 'flags') return q.reverse ? (q.step === 'type' ? L('Whose flag is this? Type the country.', '¿De quién es esta bandera? Escribe el país.') : L('Whose flag is this?', '¿De quién es esta bandera?')) : L(`Which is the flag of ${n}?`, `¿Cuál es la bandera de ${n}?`);
    return q.step === 'tap' ? L(`Tap ${n}`, `Toca ${n}`) : q.step === 'type' ? L('Which country is this? Type its name.', '¿Qué país es este? Escribe su nombre.') : L('Which country is this?', '¿Qué país es este?');
  }

  private optionLabel(q: Question, v: string): string {
    if (q.deck === 'capitals' && !q.reverse) return this.nm(q.places![Number(v)]);
    return this.name(v);
  }
  private flag(id: string) { const a2 = this.country(id)?.a2 ?? this.app.data.meta[id]?.a2 ?? ''; return dataUrl(`../flags/${a2.toLowerCase()}.svg`); }

  /** The answer: right or not, what it was, the note, the two look-alike flags, and the bar to the next. */
  private renderAnswer(q: Question, c: Country) {
    const s = this.s!, a = s.ans!;
    const n = this.name(q.id);
    // The options as they were, the right one and the one picked marked.
    const opts = q.step === 'type' ? [] : q.deck === 'capitals' && !q.reverse ? (q.step === 'pick' ? q.order!.map(String) : []) : q.deck === 'countries' && q.step === 'tap' ? [] : q.options ?? [];
    if (opts.length) {
      const grid = h('div', { class: `quiz-opts${q.deck === 'flags' && !q.reverse ? ' mw-flags' : ''}` });
      for (const v of opts) {
        const b = h('button', { type: 'button', class: 'pill quiz-opt', disabled: true, 'data-value': v }) as HTMLButtonElement;
        if (q.deck === 'flags' && !q.reverse) b.append(h('img', { class: 'mw-flag', src: this.flag(v), alt: '' }), h('span', { class: 'mw-flag-name' }, this.name(v)));
        else b.append(this.optionLabel(q, v));
        if (v === this.rightValue(q)) b.classList.add('ok'); else if (v === a.given) b.classList.add('bad');
        if (s.hidden.includes(v)) b.classList.add('mw-gone');
        grid.append(b);
      }
      this.card.append(grid);
    }
    let text: string;
    const cap = c.cap ? this.nm(c.cap) : '';
    if (a.peek) text = `👀 ${q.deck === 'capitals' ? L(`${cap}, the capital of ${n}.`, `${cap}, la capital de ${n}.`) : n}`;
    else if (q.deck === 'capitals') text = a.ok ? `✅ ${L(`${cap} · the capital of ${n}`, `${cap} · la capital de ${n}`)}` : `❌ ${q.reverse ? L(`It is the capital of ${n}.`, `Es la capital de ${n}.`) : L(`It is ${cap}.`, `Es ${cap}.`)}${q.step === 'type' && a.given ? ` ${L(`You wrote “${a.given}”.`, `Escribiste «${a.given}».`)}` : ''}`;
    else if (q.deck === 'flags') text = a.ok ? `✅ ${L(`The flag of ${n}`, `La bandera de ${n}`)}` : `❌ ${!q.reverse && a.given ? L(`That is the flag of ${this.name(a.given)}.`, `Esa es la bandera de ${this.name(a.given)}.`) : L(`It is the flag of ${n}.`, `Es la bandera de ${n}.`)}`;
    else text = a.ok ? `✅ ${n}` : `❌ ${q.step === 'tap' && a.given ? L(`That is ${this.name(a.given)}. ${n} is outlined.`, `Ese es ${this.name(a.given)}. ${n} está marcado.`) : L(`It is ${n}.`, `Es ${n}.`)}`;
    const extra: string[] = [];
    if (a.mastered) extra.push(a.comeback ? L('🔄 Back again: mastered once more!', '🔄 ¡De vuelta: dominado otra vez!') : L('⭐ Mastered: right on three different days.', '⭐ Dominado: bien en tres días distintos.'));
    if (a.gained) extra.push(`+${a.gained}${a.power ? ` · ${POWER_TEXT[a.power].icon} ${this.nm(POWER_TEXT[a.power])}!` : ''}`);
    this.card.append(h('div', { class: `quiz-fb ${a.ok ? 'ok' : 'bad'}`, 'data-master': 'feedback' }, text), ...extra.map((x) => h('div', { class: 'hop-stats' }, x)));
    // What there is to know: the biggest of the four cities, the other seat of government.
    if (q.deck === 'capitals') {
      const places = [c.cap!, ...c.cities];
      const big = places.reduce((x, y) => ((y.pop ?? 0) > (x.pop ?? 0) ? y : x));
      const line = !q.reverse && big.pop ? (big === c.cap ? L('It is also the biggest of the four.', 'También es la más grande de las cuatro.') : L(`${this.nm(big)} is the biggest of the four.`, `${this.nm(big)} es la más grande de las cuatro.`)) : '';
      if (line) this.card.append(h('div', { class: 'tool-hint' }, line));
      if (c.note) this.card.append(h('div', { class: 'mw-note', 'data-master': 'note' }, `ℹ️ ${this.nm(c.note)}`));
    }
    // Two flags that look alike: side by side, with how to tell them apart.
    if (q.deck === 'flags') {
      const other = !a.ok && a.given && a.given !== q.id && this.country(a.given) ? a.given : a.ok ? (q.options ?? []).find((o) => o !== q.id && !!flagNote(this.data!, o, q.id)) : undefined;
      if (other) {
        const note = flagNote(this.data!, q.id, other);
        this.card.append(h('div', { class: 'mw-pair', 'data-master': 'pair' },
          h('figure', null, h('img', { src: this.flag(q.id), alt: '' }), h('figcaption', null, n)),
          h('figure', null, h('img', { src: this.flag(other), alt: '' }), h('figcaption', null, this.name(other)))),
          ...(note ? [h('div', { class: 'mw-note' }, `💡 ${this.nm(note)}`)] : []));
      }
    }
    // The bar to the next question; press and hold the card to keep it.
    this.bar = h('div', { class: 'mw-bar', 'aria-hidden': 'true' }, h('span'));
    const next = h('button', { type: 'button', class: 'pill sm primary', 'data-master': 'next' }, L('Next', 'Siguiente'), icon(ChevronRight, 15));
    next.addEventListener('click', () => this.next());
    const hold = h('button', { type: 'button', class: 'pill sm', 'data-master': 'pause', 'aria-label': s.paused ? L('Go on', 'Seguir') : L('Pause', 'Pausa') }, icon(s.paused ? Play : Pause, 15));
    hold.addEventListener('click', () => { if (s.paused) this.resume(); else this.pause(); this.render(); });
    this.card.append(this.bar, h('div', { class: 'hop-actions' }, next, hold), h('div', { class: 'mw-hold' }, L('Press and hold the card to pause.', 'Mantén pulsada la tarjeta para pausar.')));
    requestAnimationFrame(() => this.syncBar());
  }

  /** How a session ended: what was learned, what comes next. */
  private renderDone() {
    const s = this.s!, st = master();
    const deckName = this.nm(DECK_TEXT[s.deck]);
    const actions = h('div', { class: 'hop-actions' });
    const add = (label: string, fn: () => void, primary = false, attr = '') => {
      const b = h('button', { type: 'button', class: `pill sm${primary ? ' primary' : ''}`, 'data-master': attr }, label);
      b.addEventListener('click', fn);
      actions.append(b);
    };
    const lines: string[] = [];
    let head = '';
    if (s.done === 'empty') {
      head = L('Nothing due today 🎉', 'Nada pendiente hoy 🎉');
      lines.push(L('Every country you have met is resting until its next day. Come back tomorrow, or practise the shakiest ones now.', 'Cada país que has visto descansa hasta su próximo día. Vuelve mañana o practica ahora los menos seguros.'));
      add(L('Practise', 'Practicar'), () => void this.start('learn', { more: true }), true, 'more');
    } else if (s.done === 'end') {
      head = L(`Done: ${s.stats.right} of ${s.stats.asked} right`, `Hecho: ${s.stats.right} de ${s.stats.asked} bien`);
      const tomorrow = addDays(this.today(), 1);
      const dueTomorrow = Object.values(st.cards[s.deck]).filter((c) => c && c.seen && c.due <= tomorrow).length;
      if (s.stats.mastered.length) lines.push(`⭐ ${L(`Mastered today: ${s.stats.mastered.map((id) => this.name(id)).join(', ')}`, `Dominados hoy: ${s.stats.mastered.map((id) => this.name(id)).join(', ')}`)}`);
      lines.push(L(`${dueTomorrow} will be back tomorrow.`, `${dueTomorrow} volverán mañana.`));
      add(L('Five more', 'Cinco más'), () => void this.start('learn', { more: true }), true, 'more');
    } else if (s.done === 'over') {
      head = L(`Out of hearts: ${fmtNumber(s.run!.score)} points`, `Sin corazones: ${fmtNumber(s.run!.score)} puntos`);
      lines.push(L(`Best combo ${s.run!.best} · ${s.run!.asked} questions · your best run ${fmtNumber(st.runs[s.deck].best)}`, `Mejor combo ${s.run!.best} · ${s.run!.asked} preguntas · tu mejor racha ${fmtNumber(st.runs[s.deck].best)}`));
      add(L('Play again', 'Otra vez'), () => void this.start('run'), true, 'again');
    } else if (s.done === 'miss') {
      head = L(`${s.count} in a row: back to the start`, `${s.count} seguidos: vuelta al principio`);
      lines.push(L(`Your record: ${st.marathon[s.deck].record} of ${s.queue.length}. Countries right ${SKIP_AFTER} times in a row are skipped next time.`, `Tu récord: ${st.marathon[s.deck].record} de ${s.queue.length}. Los países acertados ${SKIP_AFTER} veces seguidas se saltan la próxima vez.`));
      add(L('Start over', 'Empezar de nuevo'), () => void this.start('marathon'), true, 'again');
    } else {
      head = L(`The whole deck, no mistake! 🏆`, `¡El mazo entero, sin un error! 🏆`);
      lines.push(L(`${s.count} in a row.`, `${s.count} seguidos.`));
      add(L('Again', 'Otra vez'), () => void this.start('marathon'), true, 'again');
    }
    this.card.append(h('div', { class: 'quiz-q', 'data-master': 'done' }, head), ...lines.map((x) => h('div', { class: 'tool-hint' }, x)));
    const goal = st.goal.day === this.today() ? st.goal.n : 0;
    this.card.append(h('div', { class: 'hop-stats' }, `🎯 ${Math.min(goal, GOAL)}/${GOAL} ${L('today', 'hoy')}${st.days.streak && st.days.last >= addDays(this.today(), -1) ? ` · 🔥 ${st.days.streak}` : ''} · ${deckName}: ${this.counts(s.deck, 'world').mastered} ${L('mastered', 'dominados')}`));
    add(L('Share', 'Compartir'), () => void this.share(), false, 'share');
    add(L('Your world', 'Tu mundo'), () => void this.showWorld(s.deck), false, 'world');
    add(L('Menu', 'Menú'), () => { void this.stop(); void this.openPanel(); }, false, 'menu');
    this.card.append(actions);
  }

  // ---- The globe
  draw(rc: RenderCtx) {
    const s = this.s;
    if (!s || !s.q || s.done) return;
    const q = s.q, c = s.allowed.get(q.id)!, a = s.ans;
    const { ctx } = rc;
    const focus = (q.deck === 'capitals' && !q.reverse) || (q.deck === 'flags' && !q.reverse) || (q.deck === 'countries' && q.step !== 'tap') || !!a;
    if (focus) {
      rc.fillCountries(this.othersOf(q.id), rc.theme.dark ? 'rgba(4,8,16,0.55)' : 'rgba(255,255,255,0.6)');
      rc.fillCountry(q.id, a ? (a.ok ? 'rgba(46,204,113,0.5)' : 'rgba(255,196,60,0.45)') : 'rgba(255,214,90,0.42)');
      rc.strokeCountry(q.id, a && a.ok ? '#2ecc71' : '#ffc83c', 2.4);
      // A country too small to see: a ring around it.
      const shape = this.app.data.best('50m').byId.get(q.id) ?? this.app.data.best('110m').byId.get(q.id);
      const m = this.app.data.meta[q.id];
      if (m && (!shape || Math.max(shape.bbox[2] - shape.bbox[0], shape.bbox[3] - shape.bbox[1]) < 1.2)) {
        const p = rc.project(m.lx, m.ly);
        if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffc83c'; ctx.stroke(); }
      }
    }
    if (q.deck === 'countries' && q.step === 'tap' && a && !a.ok && a.given && a.given !== q.id) rc.fillCountry(a.given, 'rgba(255,107,107,0.55)');
    if (q.deck === 'capitals') this.drawPlaces(rc, q, c, a);
  }

  /** The four cities as dots with no names; once answered, their names, and the capital's star and ring. */
  private drawPlaces(rc: RenderCtx, q: Question, c: Country, a: Answer | null) {
    const s = this.s!, { ctx } = rc;
    const places: { p: Place; i: number }[] = q.reverse ? [{ p: c.cap!, i: 0 }] : q.places!.map((p, i) => ({ p, i })).filter(({ i }) => !s.hidden.includes(String(i)));
    for (const { p, i } of places) {
      const pt = rc.project(p.at[0], p.at[1]);
      if (!pt) continue;
      const isCap = i === 0;
      if (a && isCap) {
        // The capital: a pulsing ring and a gold star.
        const t = (rc.now - a.at) / 1000;
        const pulse = 10 + 6 * (0.5 + 0.5 * Math.sin(t * 5));
        ctx.beginPath(); ctx.arc(pt[0], pt[1], pulse, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,211,77,0.85)'; ctx.stroke();
        star(ctx, pt[0], pt[1], 9);
        if (t < 6) requestAnimationFrame(() => this.app.renderer.requestRender());
      } else {
        const picked = a && a.given === String(i) && !a.ok;
        ctx.beginPath(); ctx.arc(pt[0], pt[1], 6.5, 0, Math.PI * 2);
        ctx.fillStyle = picked ? '#ff6b6b' : q.reverse ? '#ffd34d' : '#ffffff'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(10,20,35,0.9)'; ctx.stroke();
      }
      if (a) rc.labels.add({ text: this.nm(p), x: pt[0] + 13, y: pt[1], align: 'left', priority: isCap ? 3200 : 3000, size: isCap ? 14 : 12, weight: isCap ? 800 : 650, color: isCap ? '#ffd34d' : '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
  }

  private othersOf(id: string): string[] {
    let o = this.others.get(id);
    if (!o) { o = Object.keys(this.app.data.meta).filter((k) => k !== id); this.others.set(id, o); }
    return o;
  }

  // ---- Progress
  /** How many countries of a deck, in a region, are at each level. */
  counts(deck: DeckId, scope: Scope): Record<Level, number> & { total: number } {
    const set = master().settings;
    const list = this.data ? inScope(this.data, deck, scope, set.territories) : [];
    const out = { new: 0, learning: 0, known: 0, mastered: 0, total: list.length };
    for (const c of list) out[levelOf(deck, c.id)]++;
    return out;
  }

  private levelBar(c: Record<Level, number> & { total: number }) {
    const seg = (l: Level) => h('span', { class: `mw-seg mw-${l}`, style: `width:${c.total ? (100 * c[l]) / c.total : 0}%` });
    return h('div', { class: 'mw-levels', role: 'img', 'aria-label': (['mastered', 'known', 'learning', 'new'] as Level[]).map((l) => `${c[l]} ${L(LEVEL_TEXT[l][0], LEVEL_TEXT[l][1])}`).join(', ') }, seg('mastered'), seg('known'), seg('learning'));
  }

  /** Turns Your world on, showing a deck. */
  async showWorld(deck: DeckId | 'all') {
    if (this.s) await this.stop();
    this.shell.sheet.close();
    if (!this.app.layers.some((l) => l.def.id === WORLD_ID)) await this.app.activate(WORLD_ID, { options: { deck } });
    else this.app.setOption(WORLD_ID, 'deck', deck);
    this.app.resetView();
  }

  // ---- The panel
  async openPanel() {
    const data = await this.load();
    if (!data) { this.shell.toast(L('Master the world needs its data; check your connection.', 'Domina el mundo necesita sus datos; revisa tu conexión.')); return; }
    const root = h('div', { class: 'mw-panel' });
    const draw = () => { clear(root); root.append(...this.panel(draw)); };
    draw();
    this.shell.openPanel('master', L('Master the world', 'Domina el mundo'), root);
    this.warmFlags();
  }

  private warmed = false;
  /** Fetches every flag of the deck once, a few at a time, so the flags deck works offline (the flags are kept once
   *  fetched). */
  private warmFlags() {
    if (this.warmed || !this.data || !navigator.onLine) return;
    this.warmed = true;
    const urls = this.data.countries.map((c) => this.flag(c.id));
    const go = async () => { for (let u = urls.shift(); u; u = urls.shift()) { try { await fetch(u); } catch { /* offline: later */ } } };
    setTimeout(() => { for (let k = 0; k < 3; k++) void go(); }, 3000);
  }

  private panel(redraw: () => void): HTMLElement[] {
    const st = master(), set = st.settings, deck = set.deck, today = this.today();
    const save = () => { saveMaster(); redraw(); };
    const out: HTMLElement[] = [];
    // Today: the goal ring and the streak.
    const n = st.goal.day === today ? Math.min(st.goal.n, GOAL) : 0;
    const live = st.days.last >= addDays(today, -1) ? st.days.streak : 0;
    const ring = h('span', { class: 'mw-ring', 'aria-hidden': 'true' });
    const C = 2 * Math.PI * 22;
    ring.innerHTML = `<svg viewBox="0 0 52 52" width="52" height="52"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--line-strong)" stroke-width="6"/><circle cx="26" cy="26" r="22" fill="none" stroke="${n >= GOAL ? '#27ae60' : 'var(--accent)'}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${((C * n) / GOAL).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 26 26)"/></svg><b>${n >= GOAL ? '✓' : n}</b>`;
    out.push(h('div', { class: 'mw-today', 'data-master': 'today' }, ring,
      h('div', { class: 'mw-today-text' },
        h('strong', null, n >= GOAL ? L('Daily goal reached 🎯', 'Meta diaria cumplida 🎯') : L(`Today: ${n} of ${GOAL} answers`, `Hoy: ${n} de ${GOAL} respuestas`)),
        h('span', null, live ? `🔥 ${L(`${live} ${live === 1 ? 'day' : 'days'} in a row`, `${live} ${live === 1 ? 'día' : 'días'} seguidos`)}${st.days.best > live ? ` · ${L('best', 'récord')} ${st.days.best}` : ''}` : L('Reach the goal to start a streak (it keeps the Daily challenge’s too).', 'Cumple la meta para empezar una racha (también cuenta para el Reto del día).')))));
    // The deck.
    const decks = segmented(deck, DECKS.map((d) => ({ value: d, label: `${DECK_TEXT[d].icon} ${this.nm(DECK_TEXT[d])}` })), (v) => { set.deck = v; save(); });
    decks.dataset.master = 'deck';
    out.push(h('h3', { class: 'sec-title' }, L('Deck', 'Mazo')), decks);
    // Progress: the world, then each continent.
    const all = this.counts(deck, 'world');
    out.push(h('div', { class: 'mw-progress', 'data-master': 'progress' }, this.levelBar(all),
      h('div', { class: 'mw-legend' }, ...(['mastered', 'known', 'learning', 'new'] as Level[]).map((l) => h('span', null, h('i', { class: `mw-dot mw-${l}` }), `${all[l]} ${L(LEVEL_TEXT[l][0], LEVEL_TEXT[l][1])}`)))));
    const conts = h('div', { class: 'mw-conts' });
    for (const sc of SCOPES.filter((x) => x !== 'world')) {
      const c = this.counts(deck, sc);
      if (!c.total) continue;
      conts.append(h('div', { class: 'mw-cont' }, h('span', { class: 'mw-cont-name' }, L(SCOPE_TEXT[sc][0], SCOPE_TEXT[sc][1])), this.levelBar(c), h('span', { class: 'mw-cont-n' }, `${c.mastered}/${c.total}`)));
    }
    out.push(conts);
    // The modes.
    const ids = this.data ? inScope(this.data, deck, set.scope, set.territories).map((c) => c.id) : [];
    const lq = learnQueue(ids, st.cards[deck], today);
    const mode = (m: Mode, desc: string) => {
      const b = h('button', { type: 'button', class: 'mode-card', 'data-master': `mode-${m}` }, h('span', { class: 'mode-icon' }, MODE_TEXT[m].icon),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, this.nm(MODE_TEXT[m])), h('span', { class: 'mode-desc' }, desc)));
      b.addEventListener('click', () => void this.start(m));
      return b;
    };
    const mar = st.marathon[deck];
    const left = marathonList(ids, mar.inRow).length;
    out.push(h('h3', { class: 'sec-title' }, L('Play', 'Jugar')), h('div', { class: 'mode-list' },
      mode('learn', lq.queue.length ? L(`${lq.due.length} due today · ${lq.fresh.length} new. Each comes back just before you would forget it; right on 3 different days and it is mastered.`, `${lq.due.length} para hoy · ${lq.fresh.length} nuevos. Cada uno vuelve justo antes de que lo olvides; bien en 3 días distintos y queda dominado.`) : L('Nothing due today: practise the shakiest ones.', 'Nada para hoy: practica los menos seguros.')),
      mode('run', L(`Three hearts, a combo, a power-up every 10 in a row · best ${fmtNumber(st.runs[deck].best)}`, `Tres corazones, un combo y un poder cada 10 seguidos · récord ${fmtNumber(st.runs[deck].best)}`)),
      mode('marathon', L(`All ${left} in a row; a miss starts over · record ${mar.record}${left < ids.length ? ` · ${ids.length - left} skipped (right ${SKIP_AFTER} times running)` : ''}`, `Los ${left} seguidos; un error y vuelta a empezar · récord ${mar.record}${left < ids.length ? ` · ${ids.length - left} saltados (bien ${SKIP_AFTER} veces seguidas)` : ''}`))));
    // The region.
    const chips = h('div', { class: 'chip-row', 'data-master': 'scope' });
    for (const sc of SCOPES) {
      const b = h('button', { type: 'button', class: `chip${set.scope === sc ? ' on' : ''}`, 'data-scope': sc }, L(SCOPE_TEXT[sc][0], SCOPE_TEXT[sc][1]));
      b.addEventListener('click', () => { set.scope = sc; save(); });
      chips.append(b);
    }
    out.push(h('h3', { class: 'sec-title' }, L('Region', 'Región')), chips);
    // Your world.
    const on = this.app.layers.some((l) => l.def.id === WORLD_ID);
    out.push(h('h3', { class: 'sec-title' }, L('On the map', 'En el mapa')),
      h('div', { class: 'mw-row' }, toggle(on, (v) => { if (v) void this.showWorld(deck); else { this.app.deactivate(WORLD_ID); redraw(); } }, L('Your world: each country coloured by how well you know it', 'Tu mundo: cada país coloreado según lo bien que lo conoces'))));
    // Settings.
    const order = h('select', { class: 'select mw-select', 'aria-label': L('Order', 'Orden'), 'data-master': 'order' }) as HTMLSelectElement;
    for (const o of ORDERS) order.append(h('option', { value: o, selected: set.order === o }, L(ORDER_TEXT[o][0], ORDER_TEXT[o][1])));
    order.addEventListener('change', () => { set.order = order.value as Order; save(); });
    out.push(h('h3', { class: 'sec-title' }, L('Settings', 'Ajustes')),
      h('label', { class: 'mw-field' }, h('span', null, L('New countries come in this order', 'Los países nuevos llegan en este orden')), order),
      h('div', { class: 'mw-field' }, h('span', null, L('Pace after an answer', 'Ritmo tras responder')), segmented(set.speed, (['fast', 'normal', 'slow'] as Speed[]).map((v) => ({ value: v, label: L(SPEED_TEXT[v][0], SPEED_TEXT[v][1]) })), (v) => { set.speed = v; saveMaster(); })),
      h('div', { class: 'mw-row' }, toggle(set.typing, (v) => { set.typing = v; saveMaster(); }, L('Type the answer once a country is well known', 'Escribir la respuesta cuando un país ya se conoce bien'))),
      h('div', { class: 'mw-row' }, toggle(set.territories, (v) => { set.territories = v; save(); }, L('Add territories (Greenland, Puerto Rico, Hong Kong…)', 'Añadir territorios (Groenlandia, Puerto Rico, Hong Kong…)'))),
      h('div', { class: 'mw-row' }, toggle(set.sound, (v) => { set.sound = v; saveMaster(); }, L('Sounds and buzz', 'Sonidos y vibración'))));
    // Share, and the other quizzes.
    const share = h('button', { type: 'button', class: 'pill sm', 'data-master': 'share' }, icon(Share2, 15), L('Share your progress', 'Compartir tu progreso'));
    share.addEventListener('click', () => void this.share());
    const quiz = h('button', { type: 'button', class: 'pill sm' }, icon(MapIcon, 15), L('More quizzes', 'Más concursos'));
    quiz.addEventListener('click', () => this.openQuiz?.());
    out.push(h('div', { class: 'hop-actions mw-foot' }, share, ...(this.openQuiz ? [quiz] : [])),
      h('p', { class: 'tool-hint' }, L('The 193 UN members plus Vatican City and Palestine. Where a country has two seats of government, the official capital is the answer and the other is explained.', 'Los 193 miembros de la ONU más Ciudad del Vaticano y Palestina. Si un país tiene dos sedes de gobierno, la respuesta es la capital oficial y se explica la otra.')));
    return out;
  }

  // ---- Sharing
  /** A picture of your progress (or its words, where pictures can't be shared). */
  async share() {
    await this.load();
    const st = master();
    const rows = DECKS.map((d) => ({ d, c: this.counts(d, 'world') }));
    const live = st.days.last >= addDays(this.today(), -1) ? st.days.streak : 0;
    const text = `🌍 ${L('Master the world', 'Domina el mundo')}\n${rows.map(({ d, c }) => `${DECK_TEXT[d].icon} ${this.nm(DECK_TEXT[d])}: ${c.mastered}/${c.total} ${bar(c)}`).join('\n')}${live ? `\n🔥 ${L(`${live} days in a row`, `${live} días seguidos`)}` : ''}\n${location.origin}${location.pathname}`;
    const blob = await this.picture(rows, live).catch(() => null);
    const file = blob ? new File([blob], 'master-the-world.png', { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    await shareText(this.shell, text);
  }

  private async picture(rows: { d: DeckId; c: Record<Level, number> & { total: number } }[], live: number): Promise<Blob | null> {
    const W = 1080, H = 1080;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    if (!g) return null;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b1d33'); bg.addColorStop(1, '#14425f');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.font = '800 72px system-ui, sans-serif';
    g.fillText(`🌍 ${L('Master the world', 'Domina el mundo')}`, 80, 170);
    g.font = '500 34px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText(new Date().toLocaleDateString(appLocale(), { day: 'numeric', month: 'long', year: 'numeric' }), 80, 230);
    rows.forEach(({ d, c }, i) => {
      const y = 360 + i * 190;
      g.fillStyle = '#fff'; g.font = '700 46px system-ui, sans-serif';
      g.fillText(`${DECK_TEXT[d].icon} ${this.nm(DECK_TEXT[d])}`, 80, y);
      g.font = '600 40px system-ui, sans-serif'; g.textAlign = 'right';
      g.fillText(`${c.mastered} / ${c.total}`, W - 80, y); g.textAlign = 'left';
      const x0 = 80, w = W - 160, bh = 34, by = y + 30;
      g.fillStyle = 'rgba(255,255,255,0.14)'; roundRect(g, x0, by, w, bh, 17); g.fill();
      let x = x0;
      for (const l of ['mastered', 'known', 'learning'] as Level[]) {
        const ww = c.total ? (w * c[l]) / c.total : 0;
        if (ww <= 0) continue;
        g.save(); roundRect(g, x0, by, w, bh, 17); g.clip();
        g.fillStyle = LEVEL_COLORS[l]; g.fillRect(x, by, ww, bh); g.restore();
        x += ww;
      }
    });
    g.fillStyle = '#fff'; g.font = '700 44px system-ui, sans-serif';
    if (live) g.fillText(`🔥 ${L(`${live} days in a row`, `${live} días seguidos`)}`, 80, 960);
    g.font = '500 30px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.textAlign = 'right';
    g.fillText('Atlas Globe', W - 80, 1010);
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  }

  // ---- Other games' answers (Fill the map, v0.35.0)
  /** An answer from another game: toward the daily goal, and graded in a deck when it asks what a deck does. */
  async external(deck: DeckId | null, id: string, ok: boolean): Promise<Badge[]> {
    await this.load();
    const st = master(), badges: Badge[] = [];
    if (deck && this.data?.countries.some((c) => c.id === id)) {
      const g = grade(st.cards[deck][id], ok, this.today());
      st.cards[deck][id] = g.card;
      if (g.comeback) { st.comebacks++; badges.push(...recordMaster({ days: st.days.best, comebacks: st.comebacks })); }
      if (g.mastered) badges.push(...this.feats(deck, id));
    }
    badges.push(...this.tally());
    saveMaster();
    refreshYourWorld(this.app);
    return badges;
  }

  // ---- The Daily challenge's review question (learn.ts)
  /** One capital due for review today, with three neighbours' capitals to pick from; null when none is due. */
  async reviewQuestion(r: () => number = Math.random): Promise<{ id: string; options: string[] } | null> {
    const data = await this.load();
    if (!data) return null;
    const st = master(), today = this.today();
    const list = inScope(data, 'capitals', 'world', st.settings.territories);
    const due = list.filter((c) => { const k = st.cards.capitals[c.id]; return !!k?.seen && k.due <= today; });
    if (!due.length) return null;
    const c = due.sort((a, b) => st.cards.capitals[a.id]!.due.localeCompare(st.cards.capitals[b.id]!.due))[0];
    const allowed = new Map(list.map((x) => [x.id, x]));
    return { id: c.id, options: shuffle([c.id, ...neighbours(c, allowed, 3, r)], r) };
  }
  /** The review question answered: graded into Master the world. */
  review(id: string, ok: boolean) {
    const st = master();
    const g = grade(st.cards.capitals[id], ok, this.today());
    st.cards.capitals[id] = g.card;
    if (g.comeback) { st.comebacks++; recordMaster({ days: st.days.best, comebacks: st.comebacks }); }
    const badges = [...(g.mastered && this.data ? this.feats('capitals', id) : []), ...this.tally()];
    saveMaster();
    refreshYourWorld(this.app);
    return badges;
  }
}

/** How far apart some points are, in degrees (the largest gap). */
function spread(points: [number, number][]): number {
  let m = 0;
  for (const a of points) for (const b of points) {
    const r = Math.PI / 180;
    const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
    m = Math.max(m, (2 * Math.asin(Math.min(1, Math.sqrt(s))) * 180) / Math.PI);
  }
  return m;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = '#ffd34d'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#5a3d00'; ctx.stroke();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Ten squares: mastered, known, learning, still to meet. */
function bar(c: Record<Level, number> & { total: number }): string {
  if (!c.total) return '';
  const k = (n: number) => Math.round((10 * n) / c.total);
  const m = k(c.mastered), kn = k(c.known), le = Math.min(10 - m - kn, k(c.learning));
  return '🟩'.repeat(m) + '🟨'.repeat(kn) + '🟧'.repeat(Math.max(0, le)) + '⬜'.repeat(Math.max(0, 10 - m - kn - Math.max(0, le)));
}

