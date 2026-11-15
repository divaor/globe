// Outline (v0.25.0): guess a country from its shape alone. Each wrong try shows one of its neighbours around it
// (or, for an island, a clue: its continent, then its first letter); fewer tries score more. Five countries a
// game; in hard mode the shapes are turned.
import { geoPath, geoAzimuthalEqualArea, geoCentroid } from 'd3-geo';
import { Share2, RotateCcw, SkipForward, Send } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { loadJSON } from '../data/store';
import { Borders, seeded, type BorderData } from './route';
import { starText } from './score';
import { OUTLINE_ROUNDS, outlinePoints, outlineStars, sample } from './logic';
import { countryIndex, type CountryIndex } from '../mydata/parse';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, es, type PlayHost, type HostGame } from './host';

const CONT: Record<string, { en: string; es: string }> = { AF: { en: 'Africa', es: 'África' }, AS: { en: 'Asia', es: 'Asia' }, EU: { en: 'Europe', es: 'Europa' }, NA: { en: 'North or Central America', es: 'Norte o Centroamérica' }, SA: { en: 'South America', es: 'Sudamérica' }, OC: { en: 'Oceania', es: 'Oceanía' } };

interface Attrs { data: Record<string, { un_member?: boolean; area_km2?: number }> }
interface State {
  hard: boolean; day?: string; ids: string[]; i: number; tries: number; shown: string[]; clues: string[];
  results: { id: string; tries: number; pts: number }[]; answered: 'ok' | 'skip' | null; spin: number;
  done: { score: number; stars: 1 | 2 | 3; badges: Badge[] } | null; fold: boolean; miss: string | null;
}

export class Outline implements HostGame {
  private st: State | null = null;
  private attrs: Attrs | null = null;
  private idx: CountryIndex | null = null;
  private g: Borders | null = null;
  pick = { hard: false };
  back: (() => void) | null = null;
  borders: (() => Promise<BorderData | null>) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { ids: [...s.ids], i: s.i, tries: s.tries, shown: [...s.shown], results: [...s.results], answered: s.answered, done: s.done ? { ...s.done, badges: s.done.badges.map((b) => b.id) } : null } : null; }

  async start(o: { hard?: boolean; day?: string } = {}) {
    const data = await this.borders?.();
    if (!this.attrs) { try { this.attrs = await loadJSON<Attrs>('attributes/countries.json'); } catch { /* below */ } }
    if (!data || !this.attrs) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
    this.g = new Borders(data);
    this.idx ??= countryIndex(this.app.data.meta as never);
    const rand = seeded(o.day ? `outline:${o.day}` : `${Date.now()}:${Math.random()}`);
    // Countries big enough to have a shape (20,000 km² or more), drawn on the detailed map.
    const level = this.app.data.best('50m');
    const pool = Object.keys(this.app.data.meta).filter((id) => this.attrs!.data[id]?.un_member && (this.attrs!.data[id]?.area_km2 ?? 0) >= 20000 && level.byId.get(id)).sort();
    const hard = o.day ? false : o.hard ?? this.pick.hard;
    await this.host.enter(this);
    this.st = { hard, day: o.day, ids: sample(rand, pool, OUTLINE_ROUNDS), i: 0, tries: 0, shown: [], clues: [], results: [], answered: null, spin: hard ? 40 + Math.floor(rand() * 280) : 0, done: null, fold: false, miss: null };
    this.render();
  }

  async stop() { if (!this.st) return; this.st = null; await this.host.leave(this); }
  drop() { this.st = null; }
  tap(): boolean { return !!this.st && !this.st.done && !this.st.answered; }

  private name(id: string) { return this.app.data.name(id, es() ? 'es' : 'en'); }

  /** A guess (a typed name, in English or Spanish). */
  guess(text: string) {
    const s = this.st;
    if (!s || s.answered || s.done || !text.trim()) return;
    const id = this.idx!.match(text);
    const target = s.ids[s.i];
    if (id === target) { this.solve('ok'); return; }
    s.tries++;
    s.miss = typeof id === 'string' ? L(`Not ${this.name(id)}.`, `No es ${this.name(id)}.`) : L('That is not a country name we know.', 'No conocemos ese nombre de país.');
    if (s.tries >= 5) { this.solve('skip'); return; }
    // A clue: one more neighbour around the shape, or for an island its continent, then its first letter.
    const next = this.g!.neighbours(target).find((n) => !s.shown.includes(n) && this.app.data.best('50m').byId.get(n));
    if (next) s.shown.push(next);
    else if (!s.clues.length) s.clues.push(L(`It is in ${CONT[this.app.data.meta[target].ct]?.en ?? '…'}.`, `Está en ${CONT[this.app.data.meta[target].ct]?.es ?? '…'}.`));
    else s.clues.push(L(`Its name begins with ${this.name(target)[0]}.`, `Su nombre empieza por ${this.name(target)[0]}.`));
    this.render();
  }

  solve(how: 'ok' | 'skip') {
    const s = this.st;
    if (!s || s.answered) return;
    const id = s.ids[s.i];
    const pts = how === 'ok' ? outlinePoints(s.tries + 1) : 0;
    s.results.push({ id, tries: how === 'ok' ? s.tries + 1 : 0, pts });
    s.answered = how;
    s.miss = null;
    this.app.flyToCountry(id, false);
    this.render();
    this.app.renderer.requestRender();
  }

  next() {
    const s = this.st;
    if (!s || !s.answered) return;
    if (s.i + 1 < s.ids.length) {
      s.i++; s.tries = 0; s.shown = []; s.clues = []; s.answered = null;
      if (s.hard) s.spin = 40 + Math.floor(Math.random() * 280);
      this.render();
      this.app.renderer.requestRender();
      return;
    }
    const score = s.results.reduce((a, r) => a + r.pts, 0);
    const stars = outlineStars(score);
    const badges = recordGame('outline', { score, stars, feats: s.results.every((r) => r.tries === 1) ? ['outline-5'] : [], day: s.day });
    s.done = { score, stars, badges };
    this.render();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? badges[0].es : badges[0].en}`, 4000);
  }

  /** The shape (and the neighbours shown) on a small canvas. */
  private shape(id: string, shown: string[], spin: number, size: number): HTMLCanvasElement {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cv = h('canvas', { class: 'outline-canvas', width: String(size * dpr), height: String(Math.round(size * 0.75) * dpr), style: `width:${size}px;height:${Math.round(size * 0.75)}px` }) as HTMLCanvasElement;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const level = this.app.data.best('50m');
    const f = level.byId.get(id)?.feature;
    if (!f) return cv;
    const w = size, hh = Math.round(size * 0.75);
    const c = geoCentroid(f as never);
    const proj = geoAzimuthalEqualArea().rotate([-c[0], -c[1], spin]).fitExtent([[12, 12], [w - 12, hh - 12]], f as never);
    // With neighbours shown, the view widens a little to hold them.
    if (shown.length) proj.scale(proj.scale() * 0.72).translate([w / 2, hh / 2]);
    const path = geoPath(proj, ctx);
    for (const n of shown) {
      const nf = level.byId.get(n)?.feature;
      if (!nf) continue;
      ctx.beginPath(); path(nf as never); ctx.fillStyle = 'rgba(160,170,185,0.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(220,225,235,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.beginPath(); path(f as never); ctx.fillStyle = '#5dade2'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const n of shown) {
      const nf = level.byId.get(n)?.feature;
      const p = nf && proj(geoCentroid(nf as never));
      if (!p || p[0] < 0 || p[0] > w || p[1] < 0 || p[1] > hh) continue;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(this.name(n), p[0], p[1]);
      ctx.fillStyle = '#fff'; ctx.fillText(this.name(n), p[0], p[1]);
    }
    return cv;
  }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const title = `🖼️ ${s.day ? L('Daily Outline', 'Silueta del día') : L('Outline', 'Silueta')} · ${s.done ? L('Result', 'Resultado') : `${s.i + 1}/${s.ids.length}`}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    if (s.done) {
      this.card.append(
        h('div', { class: 'hop-score' }, h('span', { class: 'hop-stars' }, starText(s.done.stars)), h('span', null, `${fmtNumber(s.done.score)} ${L('points', 'puntos')}`)),
        h('div', { class: 'hop-others' }, ...s.results.map((r) => h('div', { class: 'hop-other' }, h('span', { class: 'hop-other-goal' }, `${this.name(r.id)}: ${fmtNumber(r.pts)}`), h('span', { class: 'hop-other-path' }, r.tries ? L(`at try ${r.tries}`, `al intento ${r.tries}`) : L('not guessed', 'sin adivinar'))))));
      const share = h('button', { type: 'button', class: 'pill sm', 'data-game': 'share' }, icon(Share2, 15), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `🖼️ ${L('Outline', 'Silueta')}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.results.map((r) => ['🟥', '🟩', '🟨', '🟧', '🟧', '🟧'][r.tries] ?? '🟥').join('')}`));
      const again = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'again' }, icon(RotateCcw, 15), s.day ? L('More games', 'Más juegos') : L('Play again', 'Otra partida'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start({ hard: s.hard }); });
      this.card.append(h('div', { class: 'hop-actions' }, share, again));
      return;
    }
    const id = s.ids[s.i];
    this.card.append(h('div', { class: 'quiz-q' }, s.answered ? `${s.answered === 'ok' ? '✅' : '👀'} ${this.name(id)}` : L('Which country is this?', '¿Qué país es este?')));
    if (s.fold) return;
    this.card.append(this.shape(id, s.answered ? this.g!.neighbours(id) : s.shown, s.answered ? 0 : s.spin, Math.min(360, window.innerWidth - 60)));
    for (const c of s.clues) this.card.append(h('div', { class: 'hop-stats' }, `💡 ${c}`));
    if (s.answered) {
      const r = s.results[s.results.length - 1];
      this.card.append(h('div', { class: `quiz-fb ${r.pts ? 'ok' : 'bad'}` }, r.pts ? L(`Right, at try ${r.tries}: ${fmtNumber(r.pts)} points.`, `¡Bien, al intento ${r.tries}! ${fmtNumber(r.pts)} puntos.`) : L(`It was ${this.name(id)}.`, `Era ${this.name(id)}.`)));
      const next = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'next' }, s.i + 1 < s.ids.length ? L('Next shape', 'Siguiente silueta') : L('See the result', 'Ver el resultado'));
      next.addEventListener('click', () => this.next());
      this.card.append(h('div', { class: 'hop-actions' }, next));
      return;
    }
    if (s.miss) this.card.append(h('div', { class: 'quiz-fb bad' }, `${s.miss} ${L(`Try ${s.tries + 1} of 5.`, `Intento ${s.tries + 1} de 5.`)}`));
    const list = h('datalist', { id: 'outline-names' }, ...Object.keys(this.app.data.meta).map((k) => h('option', { value: this.name(k) })));
    const input = h('input', { type: 'text', class: 'names-input', list: 'outline-names', autocomplete: 'off', 'aria-label': L('Country name', 'Nombre del país'), placeholder: L('Type the country…', 'Escribe el país…') }) as HTMLInputElement;
    const go = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'guess' }, icon(Send, 15), L('Guess', 'Adivinar'));
    go.addEventListener('click', () => this.guess(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.guess(input.value); });
    const skip = h('button', { type: 'button', class: 'pill sm', 'data-game': 'skip' }, icon(SkipForward, 15), L('Show me', 'Ver la respuesta'));
    skip.addEventListener('click', () => this.solve('skip'));
    this.card.append(list, input, h('div', { class: 'hop-actions' }, go, skip));
    setTimeout(() => input.focus(), 50);
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s || !s.answered) return;
    const { ctx } = rc;
    ctx.save(); ctx.globalAlpha = 0.85;
    rc.fillCountry(s.ids[s.i], s.answered === 'ok' ? '#2ecc71' : '#e67e22');
    ctx.restore();
  }
}
