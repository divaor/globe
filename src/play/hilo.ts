// Higher or lower (v0.25.0): two countries light up; which has more people, a longer coast, more Olympic medals...?
// The facts are the app's country facts (60+ filters); after each answer the map colours by that fact, so you learn
// as you play. Close calls are worth more, the run of right answers multiplies the points, and the game ends at
// the first miss.
import { Share2, RotateCcw } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, fmtCompact, dataLang, tx, nm } from '../app/i18n';
import { loadJSON } from '../data/store';
import { seeded } from './route';
import { starText } from './score';
import { hiloPair, hiloPoints, hiloStars } from './logic';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, type PlayHost, type HostGame } from './host';

/** The facts asked about, with the question each one makes. */
const FACTS: { key: string; en: string; es: string }[] = [
  { key: 'population', en: 'Which has more people?', es: '¿Cuál tiene más habitantes?' },
  { key: 'area_km2', en: 'Which is bigger?', es: '¿Cuál es más grande?' },
  { key: 'gdp_usd', en: 'Which has the bigger economy (GDP)?', es: '¿Cuál tiene la economía más grande (PIB)?' },
  { key: 'gdp_per_capita', en: 'Which is richer per person (GDP per person)?', es: '¿Cuál es más rico por persona (PIB per cápita)?' },
  { key: 'life_expectancy', en: 'Where do people live longer?', es: '¿Dónde se vive más años?' },
  { key: 'median_age', en: 'Which has the older population?', es: '¿Cuál tiene la población más vieja?' },
  { key: 'fertility_rate', en: 'Where do women have more children?', es: '¿Dónde tienen más hijos las mujeres?' },
  { key: 'olympic_medals', en: 'Which has won more Olympic medals?', es: '¿Cuál ha ganado más medallas olímpicas?' },
  { key: 'unesco_sites', en: 'Which has more World Heritage sites?', es: '¿Cuál tiene más sitios del Patrimonio Mundial?' },
  { key: 'forest_pct', en: 'Which has more of its land in forest?', es: '¿Cuál tiene más bosque, en proporción?' },
  { key: 'coastline_km', en: 'Which has the longer coastline?', es: '¿Cuál tiene más costa?' },
  { key: 'highest_point_m', en: 'Which has the higher mountain?', es: '¿Cuál tiene la montaña más alta?' },
  { key: 'avg_temperature', en: 'Which is warmer on average?', es: '¿Cuál es más cálido en promedio?' },
  { key: 'internet_users_pct', en: 'Where do more people use the internet?', es: '¿Dónde usa internet más gente?' },
  { key: 'co2_per_capita', en: 'Which emits more CO₂ per person?', es: '¿Cuál emite más CO₂ por persona?' },
  { key: 'height_male_cm', en: 'Where are men taller on average?', es: '¿Dónde son más altos los hombres?' },
  { key: 'urban_pct', en: 'Where do more people live in cities?', es: '¿Dónde vive más gente en ciudades?' },
  { key: 'pop_density', en: 'Which is more crowded (people per km²)?', es: '¿Cuál está más poblado (personas por km²)?' },
  { key: 'happiness', en: 'Where are people happier with their lives?', es: '¿Dónde está la gente más satisfecha con su vida?' },
  { key: 'railways_km', en: 'Which has more railway?', es: '¿Cuál tiene más vías de tren?' },
];

interface Attrs { fields: Record<string, { unit?: string; unit_es?: string; year?: number }>; data: Record<string, Record<string, unknown>> }
interface Q { fact: string; a: string; b: string; va: number; vb: number }
interface State {
  day?: string; rand: () => number; q: Q; run: number; score: number;
  answered: string | null; ok: boolean; history: { fact: string; ok: boolean }[];
  done: { score: number; stars: 1 | 2 | 3; run: number; badges: Badge[] } | null; fold: boolean;
}

export class HigherLower implements HostGame {
  private attrs: Attrs | null = null;
  private st: State | null = null;
  back: (() => void) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { q: { ...s.q }, run: s.run, score: s.score, answered: s.answered, ok: s.ok, done: s.done ? { ...s.done, badges: s.done.badges.map((b) => b.id) } : null } : null; }

  private async load() {
    if (!this.attrs) { try { this.attrs = await loadJSON<Attrs>('attributes/countries.json'); } catch { return null; } }
    return this.attrs;
  }

  /** The countries with a value for a fact: well-known ones (a million people or more) on the map. */
  private values(fact: string): [string, number][] {
    const out: [string, number][] = [];
    for (const [id, d] of Object.entries(this.attrs!.data)) {
      const v = d[fact], pop = d.population;
      if (typeof v === 'number' && Number.isFinite(v) && typeof pop === 'number' && pop >= 1e6 && this.app.data.meta[id]) out.push([id, v]);
    }
    return out;
  }

  private question(rand: () => number, run: number, last?: string): Q | null {
    for (let tries = 0; tries < 20; tries++) {
      const f = FACTS[Math.floor(rand() * FACTS.length)];
      if (f.key === last) continue;
      const vals = this.values(f.key);
      const pair = hiloPair(rand, vals, run);
      if (!pair) continue;
      const v = new Map(vals);
      return { fact: f.key, a: pair[0], b: pair[1], va: v.get(pair[0])!, vb: v.get(pair[1])! };
    }
    return null;
  }

  async start(o: { day?: string } = {}) {
    if (!(await this.load())) { this.shell.toast(L('This game needs the country facts; check your connection.', 'Este juego necesita los datos de los países; revisa tu conexión.')); return; }
    const rand = seeded(o.day ? `hilo:${o.day}` : `${Date.now()}:${Math.random()}`);
    const q = this.question(rand, 0);
    if (!q) return;
    await this.host.enter(this);
    this.st = { day: o.day, rand, q, run: 0, score: 0, answered: null, ok: false, history: [], done: null, fold: false };
    this.show();
  }

  async stop() { if (!this.st) return; this.st = null; await this.host.leave(this); }
  drop() { this.st = null; }
  tap(): boolean { return !!this.st && !this.st.done; }

  /** The two countries in view, and the map of the fact once answered. */
  private show() {
    const s = this.st!;
    const m = this.app.data.meta;
    this.host.fit([[m[s.q.a].lx, m[s.q.a].ly], [m[s.q.b].lx, m[s.q.b].ly]], 4.5);
    void this.host.showLayer(s.answered ? `fact-${s.q.fact}` : null);
    this.render();
  }

  answer(id: string) {
    const s = this.st;
    if (!s || s.answered || s.done) return;
    const right = s.q.va >= s.q.vb ? s.q.a : s.q.b;
    s.answered = id;
    s.ok = id === right;
    s.history.push({ fact: s.q.fact, ok: s.ok });
    if (s.ok) { s.score += hiloPoints(s.q.va, s.q.vb, s.run); s.run++; }
    this.show();
  }

  next() {
    const s = this.st;
    if (!s || !s.answered) return;
    if (!s.ok) {
      const stars = hiloStars(s.run);
      const badges = recordGame('hilo', { score: s.score, stars, feats: s.run >= 10 ? ['hilo-10'] : [], day: s.day });
      s.done = { score: s.score, stars, run: s.run, badges };
      void this.host.showLayer(null);
      this.render();
      if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${tx(badges[0])}`, 4000);
      return;
    }
    const q = this.question(s.rand, s.run, s.q.fact);
    if (!q) return;
    s.q = q; s.answered = null; s.ok = false;
    this.show();
  }

  private fmt(fact: string, v: number): string {
    const f = this.attrs!.fields[fact] ?? {};
    const unit = f.unit ? nm(f.unit, f.unit_es) : '';
    const n = Math.abs(v) >= 1e6 ? fmtCompact(v) : fmtNumber(v, Math.abs(v) < 100 && !Number.isInteger(v) ? 1 : 0);
    return `${n}${unit && unit.length < 16 ? ` ${unit}` : ''}`;
  }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const name = (id: string) => this.app.data.name(id, dataLang());
    const title = `⚖️ ${s.day ? L('Daily Higher or lower', 'Más o menos del día') : L('Higher or lower', 'Más o menos')} · ${s.done ? L('Result', 'Resultado') : `${L('Run', 'Racha')} ${s.run}`}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    if (s.done) {
      const res = resultCard({ stars: s.done.stars, score: fmtNumber(s.done.score), unit: L('points', 'puntos'), sub: L('{0} right in a row', '{0} aciertos seguidos', s.done.run) });
      this.card.append(res);
      const share = h('button', { type: 'button', class: 'pill', 'data-game': 'share' }, icon(Share2, 16), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `⚖️ ${L('Higher or lower', 'Más o menos')}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.history.map((x) => (x.ok ? '🟩' : '🟥')).join('')}`));
      const again = h('button', { type: 'button', class: 'pill primary', 'data-game': 'again' }, icon(RotateCcw, 16), s.day ? L('More games', 'Más juegos') : L('Play again', 'Jugar otra vez'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start(); });
      res.append(h('div', { class: 'result-actions' }, share, again));
      return;
    }
    const f = FACTS.find((x) => x.key === s.q.fact)!;
    this.card.append(h('div', { class: 'quiz-q' }, tx(f)));
    if (s.fold) return;
    const opts = h('div', { class: 'quiz-opts' });
    for (const [id, v, color] of [[s.q.a, s.q.va, '#e67e22'], [s.q.b, s.q.vb, '#9b59b6']] as const) {
      const right = (id === s.q.a ? s.q.va >= s.q.vb : s.q.vb > s.q.va);
      const b = h('button', { type: 'button', class: `pill quiz-opt hilo-opt${s.answered ? (right ? ' ok' : id === s.answered ? ' bad' : '') : ''}`, 'data-hilo': id },
        h('span', { class: 'hop-dot', style: `background:${color}` }), h('span', null, name(id)), ...(s.answered ? [h('span', { class: 'hilo-val' }, this.fmt(s.q.fact, v))] : []));
      b.addEventListener('click', () => this.answer(id));
      opts.append(b);
    }
    this.card.append(opts);
    if (s.answered) {
      const yr = this.attrs!.fields[s.q.fact]?.year;
      this.card.append(h('div', { class: `quiz-fb ${s.ok ? 'ok' : 'bad'}` }, s.ok ? `${L('Right!', '¡Bien!')} +${fmtNumber(hiloPoints(s.q.va, s.q.vb, s.run - 1))}` : L('Not this time: the run ends here.', 'Esta vez no: aquí termina la racha.')),
        h('div', { class: 'hop-stats' }, `${L('The map shows it for every country', 'El mapa lo muestra para todos los países')}${yr ? ` (${yr})` : ''}.`));
      const next = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'next' }, s.ok ? L('Next pair', 'Siguiente par') : L('See the result', 'Ver el resultado'));
      next.addEventListener('click', () => this.next());
      this.card.append(h('div', { class: 'hop-actions' }, next));
    }
    this.card.append(h('div', { class: 'hop-stats' }, `${L('Score', 'Puntos')}: ${fmtNumber(s.score)}`));
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s || s.done) return;
    const { ctx } = rc;
    ctx.save();
    ctx.globalAlpha = s.answered ? 0.35 : 0.85;
    rc.fillCountry(s.q.a, '#e67e22');
    rc.fillCountry(s.q.b, '#9b59b6');
    ctx.restore();
    const m = this.app.data.meta;
    for (const id of [s.q.a, s.q.b]) {
      const p = rc.project(m[id].lx, m[id].ly);
      if (p) rc.labels.add({ text: this.app.data.name(id, dataLang()), x: p[0], y: p[1], align: 'center', priority: 3200, size: 14, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
  }
}
