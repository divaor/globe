// Outline (v0.25.0): guess a country from its shape alone. Each wrong try shows one of its neighbours around it
// (or, for an island, a clue: its continent, then its first letter); fewer tries score more. Five countries a
// game; in hard mode the shapes are turned.
import { geoPath, geoAzimuthalEqualArea, geoCentroid, geoArea, geoBounds } from 'd3-geo';
import { Share2, RotateCcw, SkipForward, Send } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, dataLang, tx } from '../app/i18n';
import { loadJSON } from '../data/store';
import { Borders, seeded, type BorderData } from './route';
import { starText } from './score';
import { OUTLINE_ROUNDS, outlinePoints, outlineStars, sample } from './logic';
import { countryIndex, type CountryIndex } from '../mydata/parse';
import { saveRun, loadRun, endRun } from './runs';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, type PlayHost, type HostGame } from './host';

const CONT: Record<string, { en: string; es: string }> = { AF: { en: 'Africa', es: 'África' }, AS: { en: 'Asia', es: 'Asia' }, EU: { en: 'Europe', es: 'Europa' }, NA: { en: 'North or Central America', es: 'Norte o Centroamérica' }, SA: { en: 'South America', es: 'América del Sur' }, OC: { en: 'Oceania', es: 'Oceanía' } };

interface Attrs { data: Record<string, { un_member?: boolean; area_km2?: number }> }
/** Today's round as far as it went: the shapes answered, and the tries and clues on the one shown. */
interface OutlineRun { results: State['results']; tries: number; shown: string[]; clues: string[] }
interface State {
  hard: boolean; day?: string; ids: string[]; i: number; tries: number; shown: string[]; clues: string[];
  results: { id: string; tries: number; pts: number }[]; answered: 'ok' | 'skip' | null; spin: number;
  done: { score: number; stars: 1 | 2 | 3; badges: Badge[] } | null; fold: boolean; miss: string | null;
}

/** The part of a country the Outline frames: its largest piece and the pieces near it. Far-off islands (the
 *  Netherlands' Caribbean, France's overseas departments, the Azores) stay drawn but out of the frame; framing them
 *  shrank the country to a speck. Near means within half the largest piece's size (at least 3°) of its bounds. */
export function mainBody(f: GeoJSON.Feature): GeoJSON.Feature {
  const g = f.geometry;
  if (!g || g.type !== 'MultiPolygon' || g.coordinates.length < 2) return f;
  const parts = g.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }) as GeoJSON.Polygon);
  const big = parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  const [[w, s], [e, n]] = geoBounds(big);
  const width = e >= w ? e - w : e + 360 - w;
  const mid = w + width / 2, margin = Math.max(3, Math.max(width, n - s) / 2);
  const wrap = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
  const near = parts.filter((p) => {
    const [lon, lat] = geoCentroid(p);
    return Math.abs(wrap(lon - mid)) <= width / 2 + margin && lat >= s - margin && lat <= n + margin;
  });
  return near.length === parts.length ? f : { ...f, geometry: { type: 'MultiPolygon', coordinates: near.map((p) => p.coordinates) } };
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
    // Today's round left mid-way: the shapes answered, and the tries and clues on the one shown (v0.43.3).
    const run = o.day ? loadRun<OutlineRun>('outline', o.day) : null;
    if (run?.results.length || run?.tries) {
      const s = this.st;
      s.results = run.results.slice(0, s.ids.length);
      if (s.results.length >= s.ids.length) { s.i = s.ids.length - 1; s.answered = 'skip'; this.next(); return; }
      s.i = s.results.length; s.tries = run.tries; s.shown = run.shown; s.clues = run.clues;
    }
    this.render();
  }
  /** Today's round as far as it went (v0.43.3): kept after every guess. */
  private keep() {
    const s = this.st;
    if (!s?.day || s.done) return;
    const open = !s.answered;
    saveRun('outline', s.day, { results: s.results, tries: open ? s.tries : 0, shown: open ? s.shown : [], clues: open ? s.clues : [] } satisfies OutlineRun);
  }

  async stop() { if (!this.st) return; this.st = null; await this.host.leave(this); }
  drop() { this.st = null; }
  tap(): boolean { return !!this.st && !this.st.done && !this.st.answered; }

  private name(id: string) { return this.app.data.name(id, dataLang()); }

  /** A guess (a typed name, in English or Spanish). */
  guess(text: string) {
    const s = this.st;
    if (!s || s.answered || s.done || !text.trim()) return;
    const id = this.idx!.match(text);
    const target = s.ids[s.i];
    if (id === target) { this.solve('ok'); return; }
    s.tries++;
    s.miss = typeof id === 'string' ? L('Not {0}.', 'No es {0}.', this.name(id)) : L('That is not a country name we know.', 'No conocemos ese nombre de país.');
    if (s.tries >= 5) { this.solve('skip'); return; }
    // A clue: one more neighbour around the shape, or for an island its continent, then its first letter.
    const next = this.g!.neighbours(target).find((n) => !s.shown.includes(n) && this.app.data.best('50m').byId.get(n));
    if (next) s.shown.push(next);
    else if (!s.clues.length) s.clues.push(L('It is in {0}.', 'Está en {0}.', CONT[this.app.data.meta[target].ct] ? tx(CONT[this.app.data.meta[target].ct]) : '…'));
    else s.clues.push(L('Its name begins with {0}.', 'Su nombre empieza por {0}.', this.name(target)[0]));
    this.keep();
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
    this.keep();
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
    if (s.day) endRun('outline');
    const badges = recordGame('outline', { score, stars, feats: s.results.every((r) => r.tries === 1) ? ['outline-5'] : [], day: s.day });
    s.done = { score, stars, badges };
    this.render();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${tx(badges[0])}`, 4000);
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
    const body = mainBody(f as GeoJSON.Feature);
    const c = geoCentroid(body as never);
    const proj = geoAzimuthalEqualArea().rotate([-c[0], -c[1], spin]).fitExtent([[12, 12], [w - 12, hh - 12]], body as never);
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
      const res = resultCard({ stars: s.done.stars, score: fmtNumber(s.done.score), unit: L('points', 'puntos'),
        rows: s.results.map((r) => ({ name: this.name(r.id), detail: r.tries ? L('at try {0}', 'al intento {0}', r.tries) : L('not guessed', 'sin adivinar'), value: fmtNumber(r.pts), mark: !r.tries ? 'miss' : r.tries === 1 ? 'ok' : 'near' })) });
      this.card.append(res);
      const share = h('button', { type: 'button', class: 'pill', 'data-game': 'share' }, icon(Share2, 16), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `🖼️ ${L('Outline', 'Silueta')}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.results.map((r) => ['🟥', '🟩', '🟨', '🟧', '🟧', '🟧'][r.tries] ?? '🟥').join('')}`));
      const again = h('button', { type: 'button', class: 'pill primary', 'data-game': 'again' }, icon(RotateCcw, 16), s.day ? L('More games', 'Más juegos') : L('Play again', 'Jugar otra vez'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start({ hard: s.hard }); });
      res.append(h('div', { class: 'result-actions' }, share, again));
      return;
    }
    const id = s.ids[s.i];
    this.card.append(h('div', { class: 'quiz-q' }, s.answered ? `${s.answered === 'ok' ? '✅' : '👀'} ${this.name(id)}` : L('Which country is this?', '¿Qué país es este?')));
    if (s.fold) return;
    this.card.append(this.shape(id, s.answered ? this.g!.neighbours(id) : s.shown, s.answered ? 0 : s.spin, Math.min(360, window.innerWidth - 60)));
    for (const c of s.clues) this.card.append(h('div', { class: 'hop-stats' }, `💡 ${c}`));
    if (s.answered) {
      const r = s.results[s.results.length - 1];
      this.card.append(h('div', { class: `quiz-fb ${r.pts ? 'ok' : 'bad'}` }, r.pts ? L('Right, at try {0}: {1} points.', '¡Bien, al intento {0}! {1} puntos.', r.tries, fmtNumber(r.pts)) : L('It was {0}.', 'Era {0}.', this.name(id))));
      const next = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'next' }, s.i + 1 < s.ids.length ? L('Next shape', 'Siguiente silueta') : L('See the result', 'Ver el resultado'));
      next.addEventListener('click', () => this.next());
      this.card.append(h('div', { class: 'hop-actions' }, next));
      return;
    }
    if (s.miss) this.card.append(h('div', { class: 'quiz-fb bad' }, `${s.miss} ${L('Try {0} of 5.', 'Intento {0} de 5.', s.tries + 1)}`));
    const list = h('datalist', { id: 'outline-names' }, ...Object.keys(this.app.data.meta).map((k) => h('option', { value: this.name(k) })));
    const input = h('input', { type: 'text', class: 'names-input', list: 'outline-names', autocomplete: 'off', 'aria-label': L('Country name', 'Nombre del país'), placeholder: L('Type the country…', 'Escribe el país…') }) as HTMLInputElement;
    const go = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'guess' }, icon(Send, 15), L('Guess', 'Adivinar'));
    go.addEventListener('click', () => this.guess(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.guess(input.value); });
    const skip = h('button', { type: 'button', class: 'pill sm', 'data-game': 'skip' }, icon(SkipForward, 15), L('Show the answer', 'Ver la respuesta'));
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
