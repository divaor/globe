// Grand tour (v0.25.0): visit six cities from a start city in the shortest total distance, tapping them in order.
// The app knows the best order (par). By air (great circles), by land (the fewest borders crossed, from the
// border graph), or in the footsteps of a journey from the stories (Marco Polo's or Ibn Battuta's stops: after the
// game, the order the traveller took).
import { geoDistance, geoInterpolate } from 'd3-geo';
import { Share2, RotateCcw, Undo2, Flag } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { loadJSON } from '../data/store';
import { Borders, seeded, type BorderData } from './route';
import { starText, scoreOf } from './score';
import { bestTour, tourCost, km, sample } from './logic';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, es, type PlayHost, type HostGame } from './host';

export type TourMode = 'air' | 'land' | 'history';
export const TOUR_MODES: [TourMode, { en: string; es: string }][] = [['air', { en: 'By air', es: 'En avión' }], ['land', { en: 'By land', es: 'Por tierra' }], ['history', { en: 'A journey from history', es: 'Un viaje de la historia' }]];
export const REGIONS: [string, { en: string; es: string }][] = [['', { en: 'Anywhere', es: 'Cualquier lugar' }], ['EU', { en: 'Europe', es: 'Europa' }], ['AS', { en: 'Asia', es: 'Asia' }], ['AF', { en: 'Africa', es: 'África' }], ['NA', { en: 'North America', es: 'Norteamérica' }], ['SA', { en: 'South America', es: 'Sudamérica' }]];
const JOURNEYS = ['silk-road', 'marco-polo', 'ibn-battuta', 'xuanzang', 'zheng-he', 'magellan-elcano', 'cook', 'lewis-and-clark', 'trans-saharan', 'incense-and-spices'];
const STOPS = 6;

interface Stop { en: string; es: string; at: [number, number]; country?: string }
interface State {
  mode: TourMode; region: string; day?: string;
  stops: Stop[]; order: number[];
  story?: { en: string; es: string; icon: string };
  done: { yours: number; par: number; best: number[]; score: number; stars: 1 | 2 | 3; badges: Badge[]; gaveUp: boolean } | null;
  fold: boolean; msg: string | null;
}

export class GrandTour implements HostGame {
  private st: State | null = null;
  private g: Borders | null = null;
  pick = { mode: 'air' as TourMode, region: '' };
  back: (() => void) | null = null;
  /** The border graph (from Border hop's data). */
  borders: (() => Promise<BorderData | null>) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { mode: s.mode, stops: s.stops.map((x) => x.en), order: [...s.order], done: s.done ? { ...s.done, badges: s.done.badges.map((b) => b.id) } : null } : null; }

  /** Six big cities (a million people or more) more than 350 km apart; by land, each in another country (a tour
   *  inside one country crosses nothing). */
  private cities(rand: () => number, region: string, ok: (c: { country: string }) => boolean, oneEach = false): Stop[] {
    const meta = this.app.data.meta;
    const pool = this.app.data.cities.filter((c) => c.pop >= 1e6 && meta[c.country] && (!region || meta[c.country].ct === region) && ok(c));
    const out: Stop[] = [];
    for (const c of sample(rand, pool, pool.length)) {
      const at: [number, number] = [c.lon, c.lat];
      if (out.every((o) => km(o.at, at) > 350 && (!oneEach || o.country !== c.country))) out.push({ en: c.name, es: c.es ?? c.name, at, country: c.country });
      if (out.length === STOPS) break;
    }
    return out;
  }

  /** What a leg costs: kilometres, or for the land tour the borders crossed (with kilometres to break ties). */
  private legCost(mode: TourMode, stops: Stop[]) {
    return (i: number, j: number): number => {
      const d = km(stops[i].at, stops[j].at);
      if (mode !== 'land' || !this.g) return d;
      const a = stops[i].country!, b = stops[j].country!;
      const crossings = a === b ? 0 : (this.g.best(a, b, 'count')?.path.length ?? 99) - 1;
      return crossings * 1e6 + d;
    };
  }

  async start(o: { mode?: TourMode; region?: string; day?: string } = {}) {
    const mode = o.day ? (['air', 'land', 'history'] as TourMode[])[Math.abs([...o.day].reduce((a, c) => a + c.charCodeAt(0), 0)) % 3] : o.mode ?? this.pick.mode;
    const region = o.day ? '' : o.region ?? this.pick.region;
    const rand = seeded(o.day ? `tour:${o.day}` : `${Date.now()}:${Math.random()}`);
    let stops: Stop[] = [];
    let story: State['story'];
    if (mode === 'land') {
      const data = await this.borders?.();
      if (!data) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
      this.g = new Borders(data);
      // Cities joined by land to the first one.
      const first = this.cities(rand, region, (c) => !!data.countries[c.country] && this.g!.neighbours(c.country).length > 0, true)[0];
      if (first) {
        const reach = this.g.reach(first.country!);
        stops = [first, ...this.cities(rand, region || this.app.data.meta[first.country!].ct, (c) => reach.has(c.country) && c.country !== first.country, true).filter((s) => km(s.at, first.at) > 350)].slice(0, STOPS);
      }
    } else if (mode === 'history') {
      for (const id of sample(rand, JOURNEYS, JOURNEYS.length)) {
        try {
          const j = await loadJSON<{ name: { en: string; es: string }; icon: string; items: { name: { en: string; es: string }; at: [number, number]; type: string; t?: number }[] }>(`journeys/${id}.json`);
          // The journey's places in the order of their dates (the order the traveller came to them).
          const places = j.items.filter((x) => x.at && (x.type === 'place' || x.type === 'site' || x.type === 'structure') && x.t != null).sort((a, b) => a.t! - b.t!);
          const picked: Stop[] = [];
          for (const p of places) if (picked.every((q) => km(q.at, p.at) > 300)) picked.push({ en: p.name.en, es: p.name.es, at: p.at });
          if (picked.length < STOPS) continue;
          // Six stops spread along the journey, in the traveller's order.
          stops = Array.from({ length: STOPS }, (_, k) => picked[Math.round((k * (picked.length - 1)) / (STOPS - 1))]);
          story = { en: j.name.en, es: j.name.es, icon: j.icon };
          break;
        } catch { /* try another */ }
      }
    } else stops = this.cities(rand, region, () => true);
    if (stops.length < STOPS) { this.shell.toast(L('No tour found here; try another place.', 'No hay vuelta aquí; prueba otro lugar.')); return; }
    await this.host.enter(this, { labels: { seas: true } });
    this.st = { mode, region, day: o.day, stops, order: [0], story, done: null, fold: false, msg: null };
    this.host.fit(stops.map((x) => x.at), 6);
    this.render();
  }

  async stop() { if (!this.st) return; this.st = null; await this.host.leave(this); }
  drop() { this.st = null; }

  /** A tap near a city not yet visited (within 40 px on screen) visits it. */
  tap(g: [number, number] | null): boolean {
    const s = this.st;
    if (!s || s.done) return false;
    if (!g) return true;
    const view = this.app.renderer.view;
    const at = view.project(g[0], g[1]);
    if (!at) return true;
    let best = -1, bd = 40;
    s.stops.forEach((st, i) => {
      if (s.order.includes(i)) return;
      const p = view.project(st.at[0], st.at[1]);
      if (!p) return;
      const d = Math.hypot(p[0] - at[0], p[1] - at[1]);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) this.visit(best);
    else { s.msg = L('Tap one of the cities (the white dots).', 'Toca una de las ciudades (los puntos blancos).'); this.render(); }
    return true;
  }

  visit(i: number) {
    const s = this.st;
    if (!s || s.done || s.order.includes(i)) return;
    s.order.push(i);
    s.msg = null;
    if (s.order.length === s.stops.length) this.finish(false);
    else this.render();
    this.app.renderer.requestRender();
  }
  undo() { const s = this.st; if (s && !s.done && s.order.length > 1) { s.order.pop(); this.render(); this.app.renderer.requestRender(); } }

  giveUp() { if (this.st && !this.st.done) this.finish(true); }

  private finish(gaveUp: boolean) {
    const s = this.st!;
    const cost = this.legCost(s.mode, s.stops);
    const best = bestTour(s.stops.length, cost);
    const yours = gaveUp ? Infinity : tourCost(s.order, cost);
    // By land, the score counts borders (whole crossings); otherwise kilometres.
    const land = s.mode === 'land';
    const sc = gaveUp ? { score: 0, stars: 1 as const } : land ? scoreOf(Math.floor(best.cost / 1e6), Math.floor(yours / 1e6), [], true) : scoreOf(best.cost, yours);
    // Two land tours with the same borders: the shorter one still matters for three stars.
    const stars = land && !gaveUp && sc.stars === 3 && yours > best.cost * 1.0001 + 1 ? 2 : sc.stars;
    let badges: Badge[] = [];
    if (!gaveUp) badges = recordGame('tour', { score: sc.score, stars, feats: stars === 3 ? ['tour-par'] : [], day: s.day });
    s.done = { yours, par: best.cost, best: best.order, score: sc.score, stars, badges, gaveUp };
    this.render();
    this.app.renderer.requestRender();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? badges[0].es : badges[0].en}`, 4000);
  }

  private cost(v: number): string {
    const s = this.st!;
    if (s.mode !== 'land') return `${fmtNumber(Math.round(v))} km`;
    const c = Math.floor(v / 1e6), d = v - c * 1e6;
    return `${c === 1 ? L('1 border', '1 frontera') : L(`${c} borders`, `${c} fronteras`)} · ${fmtNumber(Math.round(d))} km`;
  }
  private nm(x: Stop) { return es() ? x.es : x.en; }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const mode = TOUR_MODES.find((m) => m[0] === s.mode)![1];
    const title = `🧳 ${s.day ? L('Daily Grand tour', 'Gran vuelta del día') : L('Grand tour', 'Gran vuelta')} · ${s.story ? `${s.story.icon} ${es() ? s.story.es : s.story.en}` : es() ? mode.es : mode.en}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    const chips = h('div', { class: 'hop-path' }, ...s.order.map((i, k) => h('span', { class: `hop-step${k === 0 ? ' from' : ''}` }, `${k + 1}. ${this.nm(s.stops[i])}`)),
      ...s.stops.map((x, i) => (s.order.includes(i) ? null : h('span', { class: 'hop-step left' }, this.nm(x)))).filter((x): x is HTMLElement => !!x));
    if (!s.done) {
      const cost = this.legCost(s.mode, s.stops);
      this.card.append(h('div', { class: 'hop-stats' }, s.mode === 'land'
        ? L('Visit every city from the green one, crossing as few borders as you can.', 'Visita todas las ciudades desde la verde, cruzando la menor cantidad de fronteras.')
        : L('Visit every city from the green one, in the shortest total distance.', 'Visita todas las ciudades desde la verde, con la menor distancia total.')));
      if (s.fold) return;
      this.card.append(chips, h('div', { class: 'hop-stats' }, `${L('So far', 'Por ahora')}: ${this.cost(tourCost(s.order, cost))}`));
      if (s.msg) this.card.append(h('div', { class: 'quiz-fb bad' }, s.msg));
      const undo = h('button', { type: 'button', class: 'pill sm', 'data-game': 'undo' }, icon(Undo2, 15), L('Back', 'Atrás'));
      undo.disabled = s.order.length < 2;
      undo.addEventListener('click', () => this.undo());
      const giveUp = h('button', { type: 'button', class: 'pill sm', 'data-game': 'giveup' }, icon(Flag, 15), L('Show me', 'Ver la mejor'));
      giveUp.addEventListener('click', () => this.giveUp());
      this.card.append(h('div', { class: 'hop-actions' }, undo, giveUp));
      return;
    }
    const d = s.done;
    this.card.append(
      h('div', { class: 'hop-score' }, h('span', { class: 'hop-stars' }, starText(d.stars)), h('span', null, `${d.score} ${L('points', 'puntos')}`)),
      h('div', { class: 'hop-stats' }, `${d.gaveUp ? L('You asked to see the best order.', 'Pediste ver el mejor orden.') : `${L('Yours', 'La tuya')}: ${this.cost(d.yours)}`} · ${L('Best possible', 'Lo mejor posible')}: ${this.cost(d.par)}`));
    if (s.fold) return;
    const others = h('div', { class: 'hop-others' },
      h('div', { class: 'hop-other cur' }, h('span', { class: 'hop-other-goal' }, `⭐ ${L('The best order', 'El mejor orden')}`), h('span', { class: 'hop-other-path' }, d.best.map((i) => this.nm(s.stops[i])).join(' › '))));
    if (s.story) {
      const cost = this.legCost(s.mode, s.stops);
      others.append(h('div', { class: 'hop-other' }, h('span', { class: 'hop-other-goal' }, `${s.story.icon} ${L('The traveller’s own order', 'El orden del viajero')}: ${this.cost(tourCost(s.stops.map((_, i) => i), cost))}`),
        h('span', { class: 'hop-other-path' }, s.stops.map((x) => this.nm(x)).join(' › '))));
    }
    this.card.append(chips, others);
    const share = h('button', { type: 'button', class: 'pill sm', 'data-game': 'share' }, icon(Share2, 15), L('Share', 'Compartir'));
    share.addEventListener('click', () => void shareText(this.shell, `🧳 ${L('Grand tour', 'Gran vuelta')}${s.day ? ` ${s.day}` : ''} ${starText(d.stars)} ${d.score}\n${s.order.map((i) => this.nm(s.stops[i])).join(' › ')}`));
    const again = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'again' }, icon(RotateCcw, 15), s.day ? L('More games', 'Más juegos') : L('Another tour', 'Otra vuelta'));
    again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start({ mode: s.mode, region: s.region }); });
    this.card.append(h('div', { class: 'hop-actions' }, ...(d.gaveUp ? [] : [share]), again));
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s) return;
    const { ctx } = rc;
    const line = (ids: number[], color: string, dash: number[], width: number) => {
      if (ids.length < 2) return;
      ctx.save(); ctx.setLineDash(dash); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [w, col] of [[width + 3, 'rgba(0,0,0,0.55)'], [width, color]] as const) {
        ctx.beginPath();
        let pen = false;
        for (let i = 1; i < ids.length; i++) {
          const a = s.stops[ids[i - 1]].at, b = s.stops[ids[i]].at;
          const f = geoInterpolate(a, b), n = Math.max(2, Math.ceil(geoDistance(a, b) / 0.02));
          for (let k = 0; k <= n; k++) { const q = rc.project(...f(k / n)); if (!q) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } }
        }
        ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
      }
      ctx.restore();
    };
    if (s.done && s.story) line(s.stops.map((_, i) => i), '#c39bd3', [3, 6], 2);
    if (s.done) line(s.done.best, '#f5c542', [7, 6], 2.5);
    line(s.order, '#ffffff', [], 3);
    s.stops.forEach((x, i) => {
      const p = rc.project(x.at[0], x.at[1]);
      if (!p) return;
      const k = s.order.indexOf(i);
      ctx.beginPath(); ctx.arc(p[0], p[1], i === 0 ? 8 : 7, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#2ecc71' : k >= 0 ? '#5dade2' : '#ffffff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.stroke();
      rc.labels.add({ text: `${k >= 0 ? `${k + 1}. ` : ''}${this.nm(x)}`, x: p[0] + 10, y: p[1], align: 'left', priority: 3200, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    });
  }
}
