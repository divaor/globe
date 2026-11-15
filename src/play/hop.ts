// Border hop (v0.24.0): get from one country to a far one across land borders, tapping the countries one by
// one on the map (their names hidden). The same pair plays differently with each goal: the fewest countries, the
// fewest people, the smallest area or the shortest distance from capital to capital. Knowledge rounds limit the
// way (only Spanish-speaking countries, driving on the left, no NATO...). The app knows the best route (par):
// a route scores 1,000 × par ÷ yours, with up to three stars; hints cost points. A daily route, the same for
// everyone; Blitz, five routes against the clock; and a link that lets a friend play the same round.
// The routes and the scoring are in route.ts and score.ts (checked by scripts/test/play.mjs).
import { geoDistance, geoInterpolate } from 'd3-geo';
import { Undo2, Lightbulb, Flag, Share2, Link2, RotateCcw, Play, ChevronDown, ChevronUp, ChevronLeft } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, clear, toggle } from '../ui/dom';
import { lang, fmtCompact, fmtNumber } from '../app/i18n';
import type { PlayHost, HostGame } from './host';
import { loadJSON } from '../data/store';
import { Borders, GOALS, RULES, makeRound, dailyRound, seeded, type BorderData, type Goal, type Level, type Round, type Rule } from './route';
import { scoreOf, starText, challengeHash, readChallenge, hopNumber, HINT_COST, type Hint } from './score';
import { recordHop, hopDaily, dayKey, progress, type Badge } from '../learn/progress';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

const GOAL_TEXT: Record<Goal, { icon: string; en: string; es: string; desc: { en: string; es: string } }> = {
  count: { icon: '🔢', en: 'Fewest countries', es: 'Menos países', desc: { en: 'Cross as few countries as you can.', es: 'Cruza la menor cantidad de países.' } },
  people: { icon: '👥', en: 'Fewest people', es: 'Menos gente', desc: { en: 'Cross the countries with the fewest people, added up.', es: 'Cruza los países con menos habitantes en total.' } },
  area: { icon: '📐', en: 'Smallest area', es: 'Menor superficie', desc: { en: 'Cross the smallest countries, added up.', es: 'Cruza los países más pequeños en total.' } },
  km: { icon: '📏', en: 'Shortest distance', es: 'Menor distancia', desc: { en: 'The shortest way from capital to capital.', es: 'El camino más corto de capital a capital.' } },
};
/** The filter a hint turns on for a goal (the fewest countries has none; the distance shows the capitals). */
const GOAL_LAYER: Partial<Record<Goal, string>> = { people: 'fact-population', area: 'fact-area_km2' };
const CONTINENTS: [string, { en: string; es: string }][] = [['', { en: 'World', es: 'Mundo' }], ['AF', { en: 'Africa', es: 'África' }], ['AS', { en: 'Asia', es: 'Asia' }], ['EU', { en: 'Europe', es: 'Europa' }], ['NA', { en: 'North America', es: 'Norteamérica' }], ['SA', { en: 'South America', es: 'Sudamérica' }]];
const LEVELS: [Level, { en: string; es: string }][] = [['easy', { en: 'Easy', es: 'Fácil' }], ['medium', { en: 'Medium', es: 'Media' }], ['hard', { en: 'Hard', es: 'Difícil' }]];
const BLITZ_ROUNDS = 5;
/** Blitz: up to this many bonus points a route, two for each second under two minutes. */
const blitzBonus = (secs: number) => Math.max(0, Math.round((120 - secs) * 2));

const COLORS = { from: '#2ecc71', to: '#ff6b6b', path: '#5dade2', best: '#f5c542', wrong: '#e67e22', allowed: 'rgba(245,197,66,0.35)' };

type Mode = 'practice' | 'daily' | 'blitz' | 'challenge';
interface Finished { yours: number; par: number; score: number; stars: 1 | 2 | 3; best: string[]; gaveUp: boolean; bonus: number; badges: Badge[] }
interface State {
  round: Round; rule: Rule | null; mode: Mode; level: Level; continent: string;
  g: Borders; path: string[]; hints: Hint[]; t0: number;
  msg: { ok: boolean; text: string } | null;
  flash: { id: string; until: number } | null;
  done: Finished | null;
  day?: string; beat?: number;
  blitz?: { i: number; total: number; results: { score: number; stars: number }[] };
  /** The card folded to a line (the map in view); the hints shown; the best routes of the other goals shown. */
  fold: boolean; showHints: boolean; showOthers: boolean;
}

export class BorderHop implements HostGame {
  private data: BorderData | null = null;
  private st: State | null = null;
  /** The choices of the menu, kept between games. */
  private pick = { goal: 'count' as Goal, level: 'medium' as Level, continent: '', overseas: false };
  /** Back to the Map games panel (menu.ts). */
  back: (() => void) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  /** The border graph, for the other map games (Border chain, Name them all, Grand tour by land). */
  async borders(): Promise<BorderData | null> { return this.load(); }

  get active() { return !!this.st; }
  /** For tests: the game on screen. */
  get info() {
    const s = this.st;
    return s ? { from: s.round.from, to: s.round.to, goal: s.round.goal, rule: s.round.rule, mode: s.mode, path: [...s.path], hints: [...s.hints], done: s.done ? { ...s.done, badges: s.done.badges.map((b) => b.id) } : null, blitz: s.blitz ? { ...s.blitz } : null } : null;
  }

  private async load(): Promise<BorderData | null> {
    if (!this.data) { try { this.data = await loadJSON<BorderData>('play/borders.json'); } catch { return null; } }
    return this.data;
  }
  private graph(overseas: boolean): Borders { return new Borders(this.data!, { overseas }); }
  private name(id: string) { return this.app.data.name(id, lang()); }

  // ---- The menu ----------------------------------------------------------------------------------------------
  async openMenu() {
    const data = await this.load();
    if (!data) { this.shell.toast(L('Map games need their data; check your connection.', 'Los juegos en el mapa necesitan sus datos; revisa tu conexión.')); return; }
    const p = this.pick;
    const body = h('div', { class: 'play-menu' });
    if (this.back) {
      const b = h('button', { type: 'button', class: 'pill sm', 'data-play': 'back' }, icon(ChevronLeft, 15), L('Map games', 'Juegos en el mapa'));
      b.addEventListener('click', () => this.back?.());
      body.append(b);
    }
    const chips = <T extends string>(list: [T, { en: string; es: string }][], cur: () => T, set: (v: T) => void) => {
      const row = h('div', { class: 'chip-row' });
      const draw = () => {
        clear(row);
        for (const [v, label] of list) {
          const b = h('button', { type: 'button', class: `chip${cur() === v ? ' on' : ''}`, 'data-v': v }, es() ? label.es : label.en);
          b.addEventListener('click', () => { set(v); draw(); });
          row.append(b);
        }
      };
      draw();
      return row;
    };
    // Today's route.
    const day = dayKey(), n = hopNumber(day), done = hopDaily(day);
    const dr = dailyRound(this.graph(false), day, n);
    const daily = h('button', { type: 'button', class: `mode-card daily-card${done ? ' done' : ''}`, 'data-play': 'daily' }, h('span', { class: 'mode-icon' }, '🗓️'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, `${L('Daily route', 'Ruta del día')} #${n}${dr ? ` · ${this.name(dr.from)} → ${this.name(dr.to)}` : ''}`),
        h('span', { class: 'mode-desc' }, done ? `${L('Done', 'Hecho')}: ${done.score} ${starText(done.stars)} · ${L('a new one tomorrow', 'mañana hay otra')}` : dr ? `${this.goalName(dr.goal, dr.rule)} · ${L('the same for everyone today', 'la misma para todos hoy')}` : '')));
    daily.addEventListener('click', () => { if (dr) void this.start(dr, 'daily', { day }); });
    const goals = h('div', { class: 'mode-list' }, ...GOALS.map((goal) => {
      const T = GOAL_TEXT[goal], best = progress().play.best[goal];
      const c = h('button', { type: 'button', class: `mode-card${p.goal === goal ? ' on' : ''}`, 'data-goal': goal }, h('span', { class: 'mode-icon' }, T.icon),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, es() ? T.es : T.en), h('span', { class: 'mode-desc' }, `${es() ? T.desc.es : T.desc.en}${best ? ` · ${L('Best', 'Récord')}: ${best}` : ''}`)));
      c.addEventListener('click', () => { p.goal = goal; void this.startPractice(); });
      return c;
    }));
    const rules = h('div', { class: 'mode-list' }, ...RULES.map((rule) => {
      const best = progress().play.best[`rule:${rule.id}`];
      const c = h('button', { type: 'button', class: 'mode-card', 'data-rule': rule.id }, h('span', { class: 'mode-icon' }, rule.icon),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, es() ? rule.es : rule.en), h('span', { class: 'mode-desc' }, `${es() ? rule.desc.es : rule.desc.en}${best ? ` · ${L('Best', 'Récord')}: ${best}` : ''}`)));
      c.addEventListener('click', () => void this.startPractice(rule));
      return c;
    }));
    const blitz = h('button', { type: 'button', class: 'mode-card', 'data-play': 'blitz' }, h('span', { class: 'mode-icon' }, '⏱️'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, L('Blitz', 'Contrarreloj')),
        h('span', { class: 'mode-desc' }, `${L(`${BLITZ_ROUNDS} routes against the clock: up to 240 extra points a route for speed.`, `${BLITZ_ROUNDS} rutas contra el reloj: hasta 240 puntos más por ruta por la rapidez.`)}${progress().play.best.blitz ? ` · ${L('Best', 'Récord')}: ${progress().play.best.blitz}` : ''}`)));
    blitz.addEventListener('click', () => void this.startBlitz());
    body.append(
      h('p', { class: 'muted small' }, L('Get from one country to another across land borders: tap the countries one by one. Their names are hidden, and the app knows the best route.', 'Llega de un país a otro cruzando fronteras terrestres: toca los países uno a uno. Sus nombres están ocultos, y la app conoce la mejor ruta.')),
      daily,
      h('h3', { class: 'sec-title' }, L('Level', 'Dificultad')), chips(LEVELS, () => p.level, (v) => { p.level = v; }),
      h('h3', { class: 'sec-title' }, L('Where', 'Dónde')), chips(CONTINENTS, () => p.continent, (v) => { p.continent = v; }),
      h('div', { class: 'toggles' }, toggle(p.overseas, (v) => { p.overseas = v; }, L('Overseas regions count (French Guiana, Ceuta and Melilla)', 'Cuentan las regiones de ultramar (Guayana Francesa, Ceuta y Melilla)'))),
      h('h3', { class: 'sec-title' }, L('Border hop: pick a goal', 'Salto de fronteras: elige un objetivo')), goals, blitz,
      h('h3', { class: 'sec-title' }, L('Knowledge rounds', 'Rondas de conocimiento')),
      h('p', { class: 'muted small' }, L('Only some countries may be crossed: you need to know which.', 'Solo se pueden cruzar algunos países: hay que saber cuáles.')), rules,
      h('p', { class: 'muted small' }, L('Scoring: the best route scores 1,000; yours scores 1,000 × best ÷ yours. ★★★ matches the best; ★★ is one country more (or within 15 %). Hints cost points and stars: names −150 and a map of the goal −200 leave at most ★★; each next step −300 leaves ★.', 'Puntuación: la mejor ruta vale 1.000; la tuya, 1.000 × la mejor ÷ la tuya. ★★★ iguala la mejor; ★★ es un país más (o hasta un 15 % más). Las pistas cuestan puntos y estrellas: nombres −150 y un mapa del objetivo −200 dejan como mucho ★★; cada siguiente paso −300 deja ★.')));
    this.shell.openPanel('play-hop', L('Border hop', 'Salto de fronteras'), body);
  }

  private goalName(goal: Goal, rule: string | null) {
    const r = rule ? RULES.find((x) => x.id === rule) : null;
    return r ? (es() ? r.es : r.en) : es() ? GOAL_TEXT[goal].es : GOAL_TEXT[goal].en;
  }

  // ---- Starting ----------------------------------------------------------------------------------------------
  async startPractice(rule: Rule | null = null) {
    if (!(await this.load())) return;
    const p = this.pick;
    const g = this.graph(p.overseas);
    const rand = seeded(`${Date.now()}:${Math.random()}`);
    const round = makeRound(g, rand, { goal: rule ? 'count' : p.goal, level: p.level, continent: rule ? undefined : p.continent || undefined, rule })
      ?? makeRound(g, rand, { goal: rule ? 'count' : p.goal, level: p.level, rule });
    if (!round) { this.shell.toast(L('No route found here; try another level or place.', 'No hay ruta aquí; prueba otra dificultad u otro lugar.')); return; }
    await this.start(round, 'practice');
  }

  /** Today's route (the same for everyone). */
  async startDaily() {
    if (!(await this.load())) return;
    const day = dayKey();
    const r = dailyRound(this.graph(false), day, hopNumber(day));
    if (r) await this.start(r, 'daily', { day });
  }
  /** Today's route, for the panel: its two countries and goal. */
  async today(): Promise<{ from: string; to: string; goal: string } | null> {
    if (!(await this.load())) return null;
    const day = dayKey();
    const r = dailyRound(this.graph(false), day, hopNumber(day));
    return r ? { from: this.name(r.from), to: this.name(r.to), goal: this.goalName(r.goal, r.rule) } : null;
  }

  async startBlitz() {
    if (!(await this.load())) return;
    const g = this.graph(this.pick.overseas);
    const round = makeRound(g, seeded(`${Date.now()}:blitz`), { goal: 'count', level: 'easy' });
    if (round) await this.start(round, 'blitz', { blitz: { i: 0, total: 0, results: [] } });
  }

  /** A round from a challenge link (#hop=ESP-CHN&goal=people&beat=870). */
  async startChallenge(hash: string): Promise<boolean> {
    const c = readChallenge(hash);
    if (!c || !(await this.load()) || !this.data!.countries[c.from] || !this.data!.countries[c.to]) return false;
    const goal = c.goal as Goal;
    await this.start({ from: c.from, to: c.to, goal, rule: c.rule && RULES.some((r) => r.id === c.rule) ? c.rule : null, overseas: c.overseas }, 'challenge', { beat: c.beat });
    return true;
  }

  async start(round: Round, mode: Mode, extra: { day?: string; beat?: number; blitz?: State['blitz'] } = {}) {
    if (!(await this.load())) return;
    const g = this.graph(round.overseas);
    const rule = round.rule ? RULES.find((r) => r.id === round.rule) ?? null : null;
    if (!g.best(round.from, round.to, round.goal, rule)) { this.shell.toast(L('These two countries are not joined by land.', 'Estos dos países no están unidos por tierra.')); return; }
    await this.host.enter(this);
    const r = this.app.renderer;
    this.st = { round, rule, mode, level: this.pick.level, continent: this.pick.continent, g, path: [round.from], hints: [], t0: Date.now(), msg: null, flash: null, done: null, fold: false, showHints: false, showOthers: !this.narrow(), ...extra };
    this.render();
    this.fit();
    r.requestRender();
  }

  private narrow() { return window.innerWidth < 720; }

  /** Folds the card to a line, or opens it. */
  toggleFold() { if (this.st) { this.st.fold = !this.st.fold; this.render(); } }

  /** Shows the start and the target together. */
  private fit() {
    const s = this.st;
    if (!s) return;
    const c = s.g.data.countries;
    const a = c[s.round.from].cap ?? [this.app.data.meta[s.round.from].lx, this.app.data.meta[s.round.from].ly];
    const b = c[s.round.to].cap ?? [this.app.data.meta[s.round.to].lx, this.app.data.meta[s.round.to].ly];
    this.host.fit([a, b]);
  }

  async stop() {
    if (!this.st) return;
    this.st = null;
    if (/[#&]hop=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
    await this.host.leave(this);
  }
  /** Another map game is starting. */
  drop() { this.st = null; }

  // ---- Playing -----------------------------------------------------------------------------------------------
  tap(g: [number, number] | null): boolean {
    const s = this.st;
    if (!s || s.done) return false;
    if (!g) return true;
    const id = this.app.renderer.countryAt(g[0], g[1]);
    if (!id || !s.g.data.countries[id]) return true;
    this.step(id);
    return true;
  }

  /** A country tapped (or picked by a hint): the next step, or back to a country already on the route. */
  step(id: string) {
    const s = this.st;
    if (!s || s.done) return;
    const last = s.path[s.path.length - 1];
    if (id === last) return;
    const at = s.path.indexOf(id);
    if (at >= 0) {
      s.path = s.path.slice(0, at + 1);
      s.msg = { ok: true, text: L(`Back to ${this.name(id)}.`, `De vuelta en ${this.name(id)}.`) };
    } else if (!s.g.borders(last, id)) {
      this.flash(id);
      s.msg = { ok: false, text: L(`${this.name(id)} does not border ${this.name(last)}.`, `${this.name(id)} no limita con ${this.name(last)}.`) };
    } else if (!s.g.allowed(s.rule, id)) {
      this.flash(id);
      const r = s.rule!;
      s.msg = { ok: false, text: (es() ? r.no.es : r.no.en).replace('{c}', this.name(id)) };
    } else {
      s.path.push(id);
      const note = s.g.note(last, id);
      const n = note ? s.g.data.notes[note] : null;
      s.msg = n ? { ok: true, text: es() ? n.es : n.en } : null;
      if (id === s.round.to) { this.finish(false); return; }
    }
    this.render();
    this.app.renderer.requestRender();
  }

  private flash(id: string) {
    const s = this.st!;
    s.flash = { id, until: performance.now() + 900 };
    this.app.renderer.requestRender();
    setTimeout(() => this.app.renderer.requestRender(), 950);
  }

  undo() {
    const s = this.st;
    if (!s || s.done || s.path.length < 2) return;
    s.path.pop();
    s.msg = null;
    this.render();
    this.app.renderer.requestRender();
  }

  /** A hint: the names on the map, the map of the goal (or of the countries allowed), or the next step of a best route. */
  async hint(k: Hint) {
    const s = this.st;
    if (!s || s.done) return;
    if (k !== 'step' && s.hints.includes(k)) return;
    s.hints.push(k);
    const r = this.app.renderer;
    if (k === 'names') r.settings.labels = { ...r.settings.labels, countries: true };
    if (k === 'filter') {
      const layer = !s.rule ? GOAL_LAYER[s.round.goal] : undefined;
      if (layer) await this.host.showLayer(layer);
      if (s.round.goal === 'km' && !s.rule) r.settings.labels = { ...r.settings.labels, capitals: true };
    }
    if (k === 'step') {
      const best = s.g.best(s.path[s.path.length - 1], s.round.to, s.round.goal, s.rule);
      if (best && best.path.length > 1) { this.step(best.path[1]); return; }
    }
    this.render();
    r.requestRender();
  }

  /** The route reached the target (or the player gave up): the score against par, and the best routes. */
  private finish(gaveUp: boolean) {
    const s = this.st!;
    const { g, round, rule } = s;
    const best = g.best(round.from, round.to, round.goal, rule)!;
    const yours = gaveUp ? Infinity : g.cost(s.path, round.goal);
    const sc = gaveUp ? { score: 0, stars: 1 as const, base: 0 } : scoreOf(best.cost, yours, s.hints, round.goal === 'count');
    const secs = (Date.now() - s.t0) / 1000;
    const bonus = s.mode === 'blitz' && !gaveUp ? blitzBonus(secs) : 0;
    let badges: Badge[] = [];
    if (!gaveUp) {
      const conts = new Set(s.path.map((x) => g.data.countries[x]?.ct).filter(Boolean)).size;
      badges = recordHop({ goal: round.goal, score: sc.score, stars: sc.stars, rule: round.rule, continents: conts, day: s.mode === 'daily' ? s.day : undefined });
    }
    s.done = { yours, par: best.cost, score: sc.score, stars: sc.stars, best: best.path, gaveUp, bonus, badges };
    if (s.blitz) { s.blitz.results.push({ score: sc.score + bonus, stars: sc.stars }); s.blitz.total += sc.score + bonus; }
    if (s.blitz && s.blitz.results.length === BLITZ_ROUNDS) {
      const p = progress().play;
      p.best.blitz = Math.max(p.best.blitz ?? 0, s.blitz.total);
      try { localStorage.setItem('atlas-globe:progress', JSON.stringify(progress())); } catch { /* kept for this visit */ }
    }
    s.msg = null;
    s.fold = false;
    this.render();
    this.fit();
    this.app.renderer.requestRender();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? badges[0].es : badges[0].en}`, 4000);
  }

  giveUp() { if (this.st && !this.st.done) this.finish(true); }

  async next() {
    const s = this.st;
    if (!s) return;
    if (s.blitz && s.blitz.results.length < BLITZ_ROUNDS) {
      const round = makeRound(s.g, seeded(`${Date.now()}:blitz:${s.blitz.results.length}`), { goal: 'count', level: s.blitz.results.length >= 3 ? 'medium' : 'easy' });
      if (round) { await this.start(round, 'blitz', { blitz: s.blitz }); return; }
    }
    if (s.mode === 'practice' && s.rule) { await this.startPractice(s.rule); return; }
    if (s.mode === 'practice') { this.pick.goal = s.round.goal; await this.startPractice(); return; }
    await this.stop();
    await this.openMenu();
  }

  // ---- Numbers -----------------------------------------------------------------------------------------------
  private amount(goal: Goal, v: number): string {
    if (goal === 'count') return v === 1 ? L('1 country in between', '1 país en medio') : L(`${v} countries in between`, `${v} países en medio`);
    if (goal === 'people') return `${fmtCompact(v)} ${L('people', 'personas')}`;
    if (goal === 'area') return `${fmtNumber(Math.round(v))} km²`;
    return `${fmtNumber(Math.round(v))} km`;
  }

  /** The share text: the round, the stars and score, a square per country in between (green: on a best route). */
  private shareText(): string {
    const s = this.st!, d = s.done!;
    const mid = s.path.slice(1, -1);
    const squares = mid.map((x) => (d.best.includes(x) ? '🟩' : '🟨')).join('') || '🟩';
    const head = s.mode === 'daily' ? `${L('Daily route', 'Ruta del día')} #${hopNumber(s.day!)}` : L('Border hop', 'Salto de fronteras');
    return `🌍 ${head} · ${this.name(s.round.from)} → ${this.name(s.round.to)}\n${this.goalName(s.round.goal, s.round.rule)} ${starText(d.stars)} ${d.score}\n${squares}`;
  }
  private challengeUrl(): string {
    const s = this.st!;
    return `${location.origin}${location.pathname}#${challengeHash({ ...s.round, beat: s.done?.score })}`;
  }
  private async share(withLink: boolean) {
    const text = withLink ? `${this.shareText()}\n${L('Can you beat it?', '¿Puedes superarlo?')} ${this.challengeUrl()}` : this.shareText();
    try {
      if (navigator.share) await navigator.share({ text });
      else { await navigator.clipboard.writeText(text); this.shell.toast(L('Copied: paste it anywhere.', 'Copiado: pégalo donde quieras.')); }
    } catch { /* cancelled */ }
  }

  // ---- The card ----------------------------------------------------------------------------------------------
  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const { round } = s;
    const T = GOAL_TEXT[round.goal];
    const tag = s.mode === 'daily' ? `${L('Daily route', 'Ruta del día')} #${hopNumber(s.day!)}` : s.mode === 'blitz' ? `${L('Blitz', 'Contrarreloj')} ${s.blitz!.results.length + (s.done ? 0 : 1)}/${BLITZ_ROUNDS}` : s.mode === 'challenge' ? L('Challenge', 'Desafío') : L('Border hop', 'Salto de fronteras');
    const head = this.host.head(`${s.rule ? s.rule.icon : T.icon} ${tag} · ${this.goalName(round.goal, round.rule)}`, { fold: s.fold, onFold: () => this.toggleFold(), onClose: () => void this.stop() });
    const dot = (c: string) => h('span', { class: 'hop-dot', style: `background:${c}` });
    const route = h('div', { class: 'hop-ends' }, dot(COLORS.from), h('strong', null, this.name(round.from)), ' → ', dot(COLORS.to), h('strong', null, this.name(round.to)));
    this.card.append(head, route);
    if (s.fold) {
      // Folded: the ends, and how it is going (or how it went).
      if (s.done) this.card.append(h('div', { class: 'hop-score' }, h('span', { class: 'hop-stars' }, starText(s.done.stars)), h('span', null, `${s.done.score} ${L('points', 'puntos')}`)));
      else {
        const so = s.g.cost([...s.path, round.to], round.goal);
        this.card.append(h('div', { class: 'hop-stats' }, s.path.length > 1 ? `${s.path.length - 1} ${L('tapped', 'tocados')} · ${L('So far', 'Por ahora')}: ${this.amount(round.goal, round.goal === 'count' ? s.path.length - 1 : so)}` : L('Tap a country that borders the green one.', 'Toca un país que limite con el verde.')));
        if (s.msg) this.card.append(h('div', { class: `quiz-fb ${s.msg.ok ? 'ok' : 'bad'}` }, s.msg.text));
      }
      return;
    }
    if (s.beat !== undefined && !s.done) this.card.append(h('div', { class: 'muted small' }, L(`A friend scored ${s.beat}. Can you beat it?`, `Un amigo hizo ${s.beat}. ¿Puedes superarlo?`)));
    if (s.rule && !s.done) this.card.append(h('div', { class: 'muted small' }, es() ? s.rule.desc.es : s.rule.desc.en));
    const mid = s.path.slice(1);
    const chain = h('div', { class: 'hop-path' }, ...s.path.map((id, i) => h('span', { class: `hop-step${i === 0 ? ' from' : ''}${id === round.to ? ' to' : ''}` }, this.name(id))));
    if (!s.done) {
      const so = s.g.cost([...s.path, round.to], round.goal);
      this.card.append(chain, h('div', { class: 'hop-stats' }, mid.length ? `${L('So far', 'Por ahora')}: ${this.amount(round.goal, round.goal === 'count' ? s.path.length - 1 : so)}` : L('Tap a country that borders the green one.', 'Toca un país que limite con el verde.')));
      if (s.msg) this.card.append(h('div', { class: `quiz-fb ${s.msg.ok ? 'ok' : 'bad'}` }, s.msg.text));
      const undo = h('button', { type: 'button', class: 'pill sm', 'data-hop': 'undo' }, icon(Undo2, 15), L('Back', 'Atrás'));
      undo.disabled = s.path.length < 2;
      undo.addEventListener('click', () => this.undo());
      const hint = (k: Hint, label: string) => {
        const b = h('button', { type: 'button', class: 'pill sm', 'data-hint': k }, icon(Lightbulb, 15), `${label} −${HINT_COST[k]}`);
        b.disabled = k !== 'step' && s.hints.includes(k);
        b.addEventListener('click', () => void this.hint(k));
        return b;
      };
      const hints = h('button', { type: 'button', class: `pill sm${s.showHints ? ' on' : ''}`, 'data-hop': 'hints', 'aria-expanded': String(s.showHints) }, icon(Lightbulb, 15), L('Hints', 'Pistas'), icon(s.showHints ? ChevronUp : ChevronDown, 14));
      hints.addEventListener('click', () => { s.showHints = !s.showHints; this.render(); });
      const hasMap = !!s.rule || round.goal !== 'count';
      const mapLabel = s.rule ? L('Allowed', 'Permitidos') : round.goal === 'km' ? L('Capitals', 'Capitales') : round.goal === 'people' ? L('Population', 'Población') : L('Area', 'Superficie');
      const giveUp = h('button', { type: 'button', class: 'pill sm', 'data-hop': 'giveup' }, icon(Flag, 15), L('Show me', 'Ver la ruta'));
      giveUp.addEventListener('click', () => this.giveUp());
      this.card.append(h('div', { class: 'hop-actions' }, undo, hints, giveUp));
      if (s.showHints) this.card.append(h('div', { class: 'hop-actions hop-hints' }, hint('names', L('Names', 'Nombres')), ...(hasMap ? [hint('filter', mapLabel)] : []), hint('step', L('Next step', 'Siguiente paso'))));
      return;
    }
    // The result.
    const d = s.done;
    const parLine = `${L('Best possible', 'Lo mejor posible')}: ${this.amount(round.goal, d.par)}`;
    const yoursLine = d.gaveUp ? L('You asked to see the route.', 'Pediste ver la ruta.') : `${L('Yours', 'La tuya')}: ${this.amount(round.goal, round.goal === 'count' ? s.path.length - 2 : d.yours)}`;
    this.card.append(
      h('div', { class: 'hop-score' }, h('span', { class: 'hop-stars' }, starText(d.stars)), h('span', null, `${d.score} ${L('points', 'puntos')}${d.bonus ? ` + ${d.bonus} ${L('for speed', 'por rapidez')}` : ''}`)),
      h('div', { class: 'hop-stats' }, `${yoursLine} · ${parLine}`),
      chain);
    if (s.beat !== undefined && !d.gaveUp) this.card.append(h('div', { class: `quiz-fb ${d.score >= s.beat ? 'ok' : 'bad'}` }, d.score > s.beat ? L(`You beat your friend's ${s.beat}!`, `¡Superaste los ${s.beat} de tu amigo!`) : d.score === s.beat ? L(`A tie with your friend's ${s.beat}.`, `Empate con los ${s.beat} de tu amigo.`) : L(`Your friend's ${s.beat} still stands.`, `Los ${s.beat} de tu amigo siguen en pie.`)));
    // The best route for each goal: the same two countries, other answers.
    const others = h('div', { class: 'hop-others' });
    for (const goal of s.rule ? (['count'] as Goal[]) : GOALS) {
      const b = s.g.best(round.from, round.to, goal, s.rule);
      if (!b) continue;
      others.append(h('div', { class: `hop-other${goal === round.goal ? ' cur' : ''}` }, h('span', { class: 'hop-other-goal' }, `${GOAL_TEXT[goal].icon} ${es() ? GOAL_TEXT[goal].es : GOAL_TEXT[goal].en}: ${this.amount(goal, b.cost)}`),
        h('span', { class: 'hop-other-path' }, b.path.slice(1, -1).map((x) => this.name(x)).join(' › ') || '—')));
    }
    const othersB = h('button', { type: 'button', class: 'hop-sub-btn', 'data-hop': 'others', 'aria-expanded': String(s.showOthers) },
      s.rule ? L('The best route', 'La mejor ruta') : L('The best route for each goal', 'La mejor ruta para cada objetivo'), icon(s.showOthers ? ChevronUp : ChevronDown, 15));
    othersB.addEventListener('click', () => { s.showOthers = !s.showOthers; this.render(); });
    this.card.append(othersB);
    if (s.showOthers) this.card.append(others);
    // The odd borders on the way, explained.
    const notes = new Set<string>();
    for (const p of [s.path, d.best]) for (let i = 1; i < p.length; i++) { const n = s.g.note(p[i - 1], p[i]); if (n) notes.add(n); }
    for (const n of notes) { const x = s.g.data.notes[n]; if (x) this.card.append(h('p', { class: 'hop-note' }, `💡 ${es() ? x.es : x.en}`)); }
    const shareB = h('button', { type: 'button', class: 'pill sm', 'data-hop': 'share' }, icon(Share2, 15), L('Share', 'Compartir'));
    shareB.addEventListener('click', () => void this.share(false));
    const chal = h('button', { type: 'button', class: 'pill sm', 'data-hop': 'challenge' }, icon(Link2, 15), L('Challenge a friend', 'Desafía a un amigo'));
    chal.addEventListener('click', () => void this.share(true));
    const blitzEnd = s.blitz && s.blitz.results.length === BLITZ_ROUNDS;
    const nextB = h('button', { type: 'button', class: 'pill sm primary', 'data-hop': 'next' }, icon(s.blitz && !blitzEnd ? Play : RotateCcw, 15),
      s.blitz && !blitzEnd ? L('Next route', 'Siguiente ruta') : s.mode === 'practice' ? L('Another route', 'Otra ruta') : L('More games', 'Más juegos'));
    nextB.addEventListener('click', () => void this.next());
    if (s.blitz) this.card.append(h('div', { class: 'hop-stats' }, `${L('Blitz total', 'Total de la contrarreloj')}: ${s.blitz.total} · ${s.blitz.results.map((x) => starText(x.stars)).join(' ')}${blitzEnd ? ` · ${L('Best', 'Récord')}: ${progress().play.best.blitz ?? s.blitz.total}` : ''}`));
    this.card.append(h('div', { class: 'hop-actions' }, ...(d.gaveUp || s.blitz ? [] : [shareB, chal]), nextB));
  }

  // ---- The map -----------------------------------------------------------------------------------------------
  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s) return;
    const { ctx } = rc;
    const c = s.g.data.countries;
    ctx.save();
    // The countries a knowledge round allows, when asked for (a hint).
    if (s.rule && s.hints.includes('filter') && !s.done) rc.fillCountries(Object.keys(c).filter((id) => s.g.allowed(s.rule, id)), COLORS.allowed);
    ctx.globalAlpha = 0.85;
    if (s.done) rc.fillCountries(s.done.best.filter((x) => !s.path.includes(x) && x !== s.round.from && x !== s.round.to), COLORS.best);
    rc.fillCountries(s.path.slice(1).filter((x) => x !== s.round.to), COLORS.path);
    rc.fillCountry(s.round.from, COLORS.from);
    rc.fillCountry(s.round.to, COLORS.to);
    if (s.flash && performance.now() < s.flash.until) rc.fillCountry(s.flash.id, COLORS.wrong);
    ctx.restore();
    // The route from capital to capital: yours, and after the end the best one, dashed.
    const pt = (id: string): [number, number] => c[id].cap ?? [this.app.data.meta[id].lx, this.app.data.meta[id].ly];
    const line = (ids: string[], color: string, dash: number[], width: number) => {
      if (ids.length < 2) return;
      ctx.save();
      ctx.setLineDash(dash);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [w, col] of [[width + 3, 'rgba(0,0,0,0.55)'], [width, color]] as const) {
        ctx.beginPath();
        let pen = false;
        for (let i = 1; i < ids.length; i++) {
          const f = geoInterpolate(pt(ids[i - 1]), pt(ids[i]));
          const n = Math.max(2, Math.ceil(geoDistance(pt(ids[i - 1]), pt(ids[i])) / 0.02));
          for (let k = 0; k <= n; k++) {
            const q = rc.project(...f(k / n));
            if (!q) { pen = false; continue; }
            if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
          }
        }
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
      }
      ctx.restore();
    };
    if (s.done) line(s.done.best, COLORS.best, [7, 6], 2.5);
    line(s.path, '#ffffff', [], 3);
    // The capitals on the route, and the names of the countries already known (the ends, the route).
    const named = new Set([s.round.from, s.round.to, ...s.path, ...(s.done ? s.done.best : [])]);
    for (const id of named) {
      const p = rc.project(...pt(id));
      if (!p) continue;
      const on = s.path.includes(id) || id === s.round.to || !!s.done;
      ctx.beginPath(); ctx.arc(p[0], p[1], id === s.round.from || id === s.round.to ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = id === s.round.from ? COLORS.from : id === s.round.to ? COLORS.to : on ? '#fff' : COLORS.best; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      rc.labels.add({ text: this.name(id), x: p[0] + 8, y: p[1], align: 'left', priority: id === s.round.from || id === s.round.to ? 3200 : 3000, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
  }
}
