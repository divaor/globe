// Three games of pins on the map, five rounds or so each (v0.29.0), on the same card and scoring as Pin it:
// - Climate detective: a mystery city's temperature and rain month by month (the travel guide's weather); pin where it
//   is, with a bonus for its own climate zone (the Köppen filter's zones).
// - Explorer's log: follow Magellan, Ibn Battuta, Cook… by pinning each next stop of their journey (from the Journeys
//   stories); the story's step is told after each pin.
// - Sunrise race: where is the sun rising right now? Setting? Where is it noon, or midnight, and where is the sun
//   straight overhead? Scored by the distance to the line, with the day and night drawn after each pin.
import { geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { Share2, RotateCcw, MapPin } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, tx, nm, nm as nameIn } from '../app/i18n';
import { loadJSON } from '../data/store';
import { seeded } from './route';
import { starText } from './score';
import { PIN_MAX, pinPoints, km, sample, nearestKm, sunLine, climateBonus, climateStars, roundStars, CLIMATE_ROUNDS, type SunGoal } from './logic';
import { subsolarPoint } from '../layers/sun';
import { saveRun, loadRun, endRun } from './runs';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, type PlayHost, type HostGame } from './host';

/** A round: what is asked, where the answer is (a point, or a line where its nearest point counts), what is told after. */
interface Round {
  ask: string;
  /** Under the question: a chart, a clue. */
  extra?: () => HTMLElement | null;
  at: [number, number][];
  /** The answer's name, and what is told after the pin. */
  name: string;
  note?: string;
  /** Points over the distance's (the right climate zone), with what they are for. */
  bonus?: (pin: [number, number]) => { pts: number; text: string } | null;
}
interface Result { km: number; pts: number; bonus: number; bonusText: string | null }
interface State {
  day?: string; rounds: Round[]; i: number; pin: [number, number] | null; results: Result[];
  answered: boolean; done: { score: number; stars: 1 | 2 | 3; badges: Badge[] } | null; fold: boolean;
  /** Explorer's log: the journey's stops so far, drawn as a trail. */
  trail?: [number, number][];
  head?: string;
}

abstract class PinRounds implements HostGame {
  protected st: State | null = null;
  back: (() => void) | null = null;
  abstract readonly id: 'climate' | 'explorer' | 'sunrise';
  abstract readonly icon: string;
  abstract title(daily: boolean): string;
  /** The game's rounds (null: no data). */
  protected abstract make(rand: () => number, day?: string): Promise<{ rounds: Round[]; head?: string; trail?: [number, number][] } | null>;
  /** Stars for a game's points. */
  protected abstract stars(total: number, rounds: number): 1 | 2 | 3;
  /** Feats for the badges, from the results. */
  protected feats(_r: Result[]): string[] { return []; }
  /** The most a round can score. */
  protected max() { return PIN_MAX; }
  /** Where the map starts each round. */
  protected view(): { lon: number; lat: number; zoom: number } { return { lon: 10, lat: 20, zoom: 1.05 }; }
  /** After a pin: anything else on the map (the day and night). */
  protected async answered(): Promise<void> {}
  /** Before the next question: put away what answered the last one. */
  protected async asking(): Promise<void> {}

  constructor(protected app: App, protected shell: Shell, protected host: PlayHost) {}
  protected get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { i: s.i, n: s.rounds.length, pin: s.pin, answered: s.answered, results: [...s.results], done: s.done ? { score: s.done.score, stars: s.done.stars, badges: s.done.badges.map((b) => b.id) } : null, ask: s.rounds[s.i]?.ask, name: s.rounds[s.i]?.name, at: s.rounds[s.i]?.at } : null; }

  async start(o: { day?: string } = {}) {
    const rand = seeded(o.day ? `${this.id}:${o.day}` : `${Date.now()}:${Math.random()}`);
    const made = await this.make(rand, o.day).catch(() => null);
    if (!made || !made.rounds.length) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
    await this.host.enter(this, { labels: { seas: true } });
    this.st = { day: o.day, rounds: made.rounds, i: 0, pin: null, results: [], answered: false, done: null, fold: false, trail: made.trail, head: made.head };
    this.app.renderer.view.flyTo(this.view());
    // Today's round left mid-way: the answers given stay (and the trail they drew), v0.43.3.
    const run = o.day ? loadRun<{ results: Result[] }>(this.id, o.day) : null;
    if (run?.results.length) {
      const s = this.st, n = Math.min(run.results.length, s.rounds.length);
      s.results = run.results.slice(0, n);
      for (let k = 0; k < n - 1; k++) if (s.trail && s.rounds[k].at.length === 1) s.trail.push(s.rounds[k].at[0]);
      s.i = n - 1; s.answered = true;
      this.next();
      return;
    }
    this.render();
  }

  async stop() { if (!this.st) return; this.st = null; await this.host.leave(this); }
  drop() { this.st = null; }

  tap(g: [number, number] | null): boolean {
    const s = this.st;
    if (!s || s.done) return false;
    if (s.answered || !g) return true;
    s.pin = [g[0], g[1]];
    this.render();
    this.app.renderer.requestRender();
    return true;
  }

  confirm() {
    const s = this.st;
    if (!s || !s.pin || s.answered) return;
    const r = s.rounds[s.i];
    const d = nearestKm(s.pin, r.at);
    const b = r.bonus?.(s.pin) ?? null;
    s.results.push({ km: d, pts: pinPoints(d), bonus: b?.pts ?? 0, bonusText: b?.text ?? null });
    s.answered = true;
    if (s.day) saveRun(this.id, s.day, { results: s.results });
    // The pin and the nearest point of the answer, both on screen.
    let near = r.at[0];
    for (const q of r.at) if (km(s.pin, q) < km(s.pin, near)) near = q;
    this.host.fit([s.pin, near], 7);
    void this.answered();
    this.render();
    this.app.renderer.requestRender();
  }

  next() {
    const s = this.st;
    if (!s || !s.answered) return;
    const r = s.rounds[s.i];
    if (s.trail && r.at.length === 1) s.trail.push(r.at[0]);
    if (s.i + 1 < s.rounds.length) {
      s.i++; s.pin = null; s.answered = false;
      void this.asking();
      this.app.renderer.view.flyTo(this.view());
      this.render();
      this.app.renderer.requestRender();
      return;
    }
    const score = s.results.reduce((a, x) => a + x.pts + x.bonus, 0);
    const stars = this.stars(score, s.rounds.length);
    if (s.day) endRun(this.id);
    const badges = recordGame(this.id, { score, stars, feats: this.feats(s.results), day: s.day });
    s.done = { score, stars, badges };
    this.render();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${tx(badges[0])}`, 4000);
  }

  protected dist(d: number) { return d < 10 ? `${d.toFixed(1)} km` : `${fmtNumber(Math.round(d))} km`; }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const title = `${this.icon} ${this.title(!!s.day)} · ${s.done ? L('Result', 'Resultado') : `${s.i + 1}/${s.rounds.length}`}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    const total = s.results.reduce((a, r) => a + r.pts + r.bonus, 0);
    if (s.done) {
      const most = s.rounds.length * this.max();
      const res = resultCard({ stars: s.done.stars, score: fmtNumber(s.done.score), unit: L('points', 'puntos'), sub: L('Out of {0}', 'De {0}', fmtNumber(most)),
        rows: s.rounds.map((r, i) => ({ name: r.name, detail: this.dist(s.results[i].km), value: fmtNumber(s.results[i].pts + s.results[i].bonus), mark: s.results[i].km <= 100 ? 'ok' : s.results[i].km <= 1500 ? 'near' : 'miss' })) });
      this.card.append(res);
      const share = h('button', { type: 'button', class: 'pill', 'data-game': 'share' }, icon(Share2, 16), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `${this.icon} ${this.title(false)}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.results.map((r) => (r.km <= 100 ? '🎯' : r.km <= 500 ? '🟩' : r.km <= 1500 ? '🟨' : '🟥')).join('')}`));
      const again = h('button', { type: 'button', class: 'pill primary', 'data-game': 'again' }, icon(RotateCcw, 16), s.day ? L('More games', 'Más juegos') : L('Play again', 'Jugar otra vez'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start(); });
      res.append(h('div', { class: 'result-actions' }, share, again));
      return;
    }
    const r = s.rounds[s.i];
    if (s.head) this.card.append(h('div', { class: 'hop-stats' }, s.head));
    this.card.append(h('div', { class: 'quiz-q', 'data-game': 'ask' }, r.ask));
    if (s.fold) return;
    const extra = r.extra?.();
    if (extra) this.card.append(extra);
    if (!s.answered) {
      this.card.append(h('div', { class: 'hop-stats' }, s.pin ? L('Move it with another tap, or pin it here.', 'Muévelo con otro toque, o ponlo aquí.') : L('Tap the map where you think it is.', 'Toca el mapa donde crees que está.')));
      const ok = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'confirm' }, icon(MapPin, 15), L('Pin it here', 'Ponlo aquí'));
      ok.disabled = !s.pin;
      ok.addEventListener('click', () => this.confirm());
      this.card.append(h('div', { class: 'hop-actions' }, ok), h('div', { class: 'hop-stats' }, `${L('Score', 'Puntos')}: ${fmtNumber(total)}`));
      return;
    }
    const res = s.results[s.results.length - 1];
    this.card.append(h('div', { class: `quiz-fb ${res.km <= 500 ? 'ok' : 'bad'}` }, `${r.name}: ${this.dist(res.km)} ${L('away', 'de distancia')}, ${fmtNumber(res.pts)} ${L('points', 'puntos')}`));
    if (res.bonusText) this.card.append(h('div', { class: 'hop-stats' }, res.bonusText));
    if (r.note) this.card.append(h('div', { class: 'hop-stats game-note' }, r.note));
    const next = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'next' }, s.i + 1 < s.rounds.length ? L('Next', 'Siguiente') : L('See the result', 'Ver el resultado'));
    next.addEventListener('click', () => this.next());
    this.card.append(h('div', { class: 'hop-actions' }, next), h('div', { class: 'hop-stats' }, `${L('Score', 'Puntos')}: ${fmtNumber(total)}`));
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s) return;
    const { ctx } = rc;
    const dot = (at: [number, number], color: string, r: number, label?: string) => {
      const q = rc.project(at[0], at[1]);
      if (!q) return;
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      if (label) rc.labels.add({ text: label, x: q[0] + r + 5, y: q[1], align: 'left', priority: 3000, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    };
    const path = (pts: [number, number][], color: string, w: number, dash: number[] = []) => {
      ctx.save(); ctx.setLineDash(dash); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const [lw, col] of [[w + 3, 'rgba(0,0,0,0.5)'], [w, color]] as const) {
        ctx.beginPath(); rc.path({ type: 'LineString', coordinates: pts });
        ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke();
      }
      ctx.restore();
    };
    // Explorer's log: the journey so far.
    if (s.trail?.length) {
      if (s.trail.length > 1) path(s.trail, '#c39bd3', 2.5, [6, 5]);
      s.trail.forEach((p, i) => dot(p, '#c39bd3', 5, i === s.trail!.length - 1 && !s.answered ? L('Last stop', 'Última parada') : undefined));
    }
    const shown = s.done ? s.rounds.map((r, i) => ({ r, i })) : s.answered ? [{ r: s.rounds[s.i], i: s.i }] : [];
    for (const { r } of shown) {
      if (r.at.length > 1) path(r.at, '#ffd43b', 3);
      else dot(r.at[0], '#2ecc71', 7, r.name);
    }
    if (s.pin && !s.done) {
      if (s.answered) {
        const r = s.rounds[s.i];
        let near = r.at[0];
        for (const q of r.at) if (km(s.pin, q) < km(s.pin, near)) near = q;
        path([s.pin, near], '#ffffff', 2, [6, 5]);
      }
      dot(s.pin, '#ff6b6b', 8);
    }
  }
}

// ---- Climate detective ----------------------------------------------------------------------------------------------
const MONTHS = { en: 'JFMAMJJASOND', es: 'EFMAMJJASOND' };
type GuideRow = [string, string, string, number, number, string, number, number, string, string, string, string, string, string, string, { t: number[]; p: number[] } | null, string];
interface KoppenClass { group: string; en: string; es: string; color: string }

/** The climate zones (the Köppen filter's polygons), to say which one a point is in. */
let zones: Promise<{ k: string; f: GeoJSON.Feature }[]> | null = null;
const loadZones = () => (zones ??= loadJSON<Topology>('layers/koppen.json').then((t) =>
  (feature(t, t.objects.koppen as GeometryCollection) as unknown as GeoJSON.FeatureCollection).features.map((f) => ({ k: (f.properties as { k: string }).k, f }))));
/**
 * The zone a point is in. A city on the coast (Rio, Lagos, Stockholm, Dubai…) is often just outside the zones'
 * simplified shores: then the zone of the nearest land within about 50 km, so a pin on it scores its zone.
 */
const zoneAt = (zs: { k: string; f: GeoJSON.Feature }[], p: [number, number]) => {
  const at = (q: [number, number]) => zs.find((z) => geoContains(z.f, q))?.k ?? null;
  const here = at(p);
  if (here) return here;
  const c = Math.max(0.2, Math.cos((p[1] * Math.PI) / 180));
  for (const r of [0.1, 0.2, 0.35, 0.5]) for (let a = 0; a < 360; a += 45) {
    const k = at([p[0] + (r * Math.cos((a * Math.PI) / 180)) / c, p[1] + r * Math.sin((a * Math.PI) / 180)]);
    if (k) return k;
  }
  return null;
};

/** A city's year: rain as blue bars, the temperature as a red line, month by month. */
function climateChart(t: number[], p: number[]): HTMLElement {
  const W = 300, H = 132, pad = 26, bw = (W - pad * 2) / 12;
  const tMin = Math.min(-10, ...t.map((x) => x / 10)), tMax = Math.max(30, ...t.map((x) => x / 10)), pMax = Math.max(100, ...p);
  const ty = (v: number) => H - 18 - ((v - tMin) / (tMax - tMin)) * (H - 30);
  const py = (v: number) => H - 18 - (v / pMax) * (H - 30);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'climate-chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', L('Temperature and rain by month', 'Temperatura y lluvia por mes'));
  const el = (name: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text) e.textContent = text;
    svg.append(e);
    return e;
  };
  const months = tx(MONTHS);
  p.forEach((v, i) => el('rect', { x: pad + i * bw + 2, y: py(v), width: bw - 4, height: Math.max(0, H - 18 - py(v)), fill: '#4dabf7', opacity: 0.8 }));
  el('polyline', { points: t.map((v, i) => `${pad + i * bw + bw / 2},${ty(v / 10)}`).join(' '), fill: 'none', stroke: '#ff6b6b', 'stroke-width': 2.5 });
  for (let i = 0; i < 12; i++) el('text', { x: pad + i * bw + bw / 2, y: H - 4, 'text-anchor': 'middle', 'font-size': 10, fill: 'currentColor' }, months[i]);
  el('text', { x: 2, y: ty(tMax) + 4, 'font-size': 10, fill: '#ff6b6b' }, `${Math.round(tMax)}°`);
  el('text', { x: 2, y: ty(Math.max(tMin, 0)) + 4, 'font-size': 10, fill: '#ff6b6b' }, '0°');
  el('text', { x: W - 2, y: py(pMax) + 4, 'font-size': 10, fill: '#4dabf7', 'text-anchor': 'end' }, `${pMax} mm`);
  const wrap = h('div', { class: 'climate-wrap' });
  wrap.append(svg, h('div', { class: 'climate-key muted small' }, h('span', { style: { color: '#ff6b6b' } }, `— ${L('temperature', 'temperatura')}`), ' ', h('span', { style: { color: '#4dabf7' } }, `▮ ${L('rain', 'lluvia')}`)));
  return wrap;
}

export class ClimateDetective extends PinRounds {
  readonly id = 'climate';
  readonly icon = '🌡️';
  title(daily: boolean) { return daily ? L('Daily Climate detective', 'Detective del clima del día') : L('Climate detective', 'Detective del clima'); }
  protected max() { return PIN_MAX + 1000; }
  protected stars(total: number) { return climateStars(total); }
  protected feats(r: Result[]) { return r.filter((x) => x.bonus >= 1000).length >= 4 ? ['climate-zones'] : []; }

  protected async make(rand: () => number) {
    const [idx, zs, classes] = await Promise.all([
      loadJSON<{ cities: GuideRow[] }>('guide/index.json'), loadZones(),
      loadJSON<Record<string, KoppenClass>>('layers/koppen-classes.json').catch(() => ({} as Record<string, KoppenClass>)),
    ]);
    // Big cities with their year's weather, far apart and in five different climate zones when possible.
    const pool = idx.cities.filter((c) => c[15]?.t?.length === 12 && c[6] >= 500000);
    const picked: { c: GuideRow; k: string | null }[] = [];
    for (const c of sample(rand, pool, pool.length)) {
      const at: [number, number] = [c[3], c[4]];
      if (picked.some((x) => km([x.c[3], x.c[4]], at) < 1500)) continue;
      const k = zoneAt(zs, at);
      if (picked.length < 4 && picked.some((x) => x.k && x.k === k)) continue;
      picked.push({ c, k });
      if (picked.length === CLIMATE_ROUNDS) break;
    }
    const cname = (k: string | null) => (k && classes[k] ? `${k}, ${tx(classes[k])}` : k ?? '');
    const rounds: Round[] = picked.map(({ c, k }) => ({
      ask: L('📈 Which city has this year of weather? Pin it.', '📈 ¿Qué ciudad tiene este clima a lo largo del año? Ponle un pin.'),
      extra: () => climateChart(c[15]!.t, c[15]!.p),
      at: [[c[3], c[4]]],
      name: `${nameIn(c[1], c[2])}, ${this.app.data.name(c[5], this.app.lang)}`,
      note: L('Its climate zone: {0}.', 'Su zona climática: {0}.', cname(k)),
      bonus: (pin) => {
        const mine = zoneAt(zs, pin);
        const pts = climateBonus(k, mine);
        return { pts, text: pts >= 1000 ? L('+1,000: the same climate zone ({0})', '+1000: la misma zona climática ({0})', cname(mine))
          : pts ? L('+400: the same kind of climate ({0})', '+400: el mismo tipo de clima ({0})', cname(mine))
          : L('Your pin is in another climate zone ({0}).', 'Tu pin está en otra zona climática ({0}).', cname(mine) || L('the sea', 'el mar')) };
      },
    }));
    return { rounds };
  }
}

// ---- Explorer's log --------------------------------------------------------------------------------------------------
/** The journeys of the Journeys stories, and two explorers' lives (Lives on the map). */
const VOYAGES = ['journeys/magellan-elcano', 'journeys/ibn-battuta', 'journeys/marco-polo', 'journeys/cook', 'journeys/zheng-he', 'journeys/lewis-and-clark', 'journeys/xuanzang', 'lives/humboldt', 'lives/charles-darwin'];
interface JStep { date: string; title: { en: string; es: string }; text: { en: string; es: string }; at?: [number, number]; camera?: { lon: number; lat: number }; moves?: { path: [number, number][] }[] }

export class ExplorersLog extends PinRounds {
  readonly id = 'explorer';
  readonly icon = '🧭';
  title(daily: boolean) { return daily ? L('Daily Explorer’s log', 'Bitácora del explorador del día') : L('Explorer’s log', 'Bitácora del explorador'); }
  protected stars(total: number, n: number) { return roundStars(total, n); }
  protected feats(r: Result[]) { return r.length >= 5 && r.every((x) => x.km <= 500) ? ['explorer-500'] : []; }
  protected view() {
    const t = this.st?.trail;
    const last = t?.[t.length - 1];
    return last ? { lon: last[0], lat: last[1], zoom: 1.6 } : { lon: 10, lat: 20, zoom: 1.05 };
  }

  protected async make(rand: () => number) {
    for (const id of sample(rand, VOYAGES, VOYAGES.length)) {
      const j = await loadJSON<{ name: { en: string; es: string }; icon: string; steps: JStep[] }>(`${id}.json`).catch(() => null);
      if (!j) continue;
      // Each step's place: a life's own place, or where a journey's route ends (else its camera). Stops 200 km apart.
      const stops: { s: JStep; at: [number, number] }[] = [];
      for (const st of j.steps) {
        // (A life's last step, today's places to visit, and its "away" steps are not stops.)
        if ((st as { aftermath?: boolean; away?: boolean }).aftermath || (st as { away?: boolean }).away) continue;
        const mv = st.moves?.[st.moves.length - 1]?.path;
        const at = st.at ?? (mv?.length ? mv[mv.length - 1] : st.camera ? [st.camera.lon, st.camera.lat] as [number, number] : null);
        if (!at) continue;
        if (stops.length && km(stops[stops.length - 1].at, at) < 200) continue;
        stops.push({ s: st, at });
      }
      if (stops.length < 5) continue;
      const [first, ...rest] = stops;
      const go = rest.slice(0, 7);
      const year = (d: string) => d.slice(0, 4).replace(/^-/, '');
      const rounds: Round[] = go.map(({ s, at }) => ({
        ask: `📜 ${year(s.date)}: ${tx(s.title)}. ${L('Where did they go next?', '¿A dónde fueron después?')}`,
        at: [at], name: tx(s.title), note: tx(s.text),
      }));
      const nm = tx(j.name);
      return { rounds, trail: [first.at], head: `${j.icon} ${nm} · ${L('from', 'desde')} ${tx(first.s.title)} (${year(first.s.date)})` };
    }
    return null;
  }
}

// ---- Sunrise race ----------------------------------------------------------------------------------------------------
const SUN_ROUNDS: { goal: SunGoal; en: string; es: string; icon: string }[] = [
  { goal: 'rise', icon: '🌅', en: 'Where is the sun rising right now?', es: '¿Dónde está saliendo el sol ahora mismo?' },
  { goal: 'noon', icon: '☀️', en: 'Where is it noon right now?', es: '¿Dónde es mediodía ahora mismo?' },
  { goal: 'set', icon: '🌇', en: 'Where is the sun setting right now?', es: '¿Dónde se está poniendo el sol ahora mismo?' },
  { goal: 'midnight', icon: '🌙', en: 'Where is it midnight right now?', es: '¿Dónde es medianoche ahora mismo?' },
  { goal: 'overhead', icon: '🎯', en: 'Where is the sun straight overhead right now?', es: '¿Dónde está el sol justo encima ahora mismo?' },
];

export class SunriseRace extends PinRounds {
  readonly id = 'sunrise';
  readonly icon = '🌅';
  /** The time the game is played at (the sun moves on; the answers are for this moment). */
  private at = new Date();
  title(daily: boolean) { return daily ? L('Daily Sunrise race', 'Carrera del amanecer del día') : L('Sunrise race', 'Carrera del amanecer'); }
  protected stars(total: number, n: number) { return roundStars(total, n); }
  protected feats(r: Result[]) { return r.length && r[0].km <= 100 ? ['sunrise-100'] : []; }

  protected async make() {
    this.at = new Date();
    const sub = subsolarPoint(this.at);
    const hhmm = this.at.toISOString().slice(11, 16);
    const rounds: Round[] = SUN_ROUNDS.map((r) => ({
      ask: `${r.icon} ${tx(r)}`, at: sunLine(sub, r.goal),
      name: { rise: L('Sunrise', 'El amanecer'), noon: L('Noon', 'El mediodía'), set: L('Sunset', 'El atardecer'), midnight: L('Midnight', 'La medianoche'), overhead: L('The sun overhead', 'El sol encima') }[r.goal],
      note: L('At {0} UTC. The yellow line is where it is happening; day and night are shaded.', 'A las {0} UTC. La línea amarilla es donde está pasando; el día y la noche están sombreados.', hhmm),
    }));
    return { rounds, head: L('The sun right now ({0} UTC).', 'El sol ahora mismo ({0} UTC).', hhmm) };
  }
  /** After a pin, the day and night on the map (the Day and night filter); put away for the next question. */
  protected async answered() { if (!this.app.isActive('daynight')) await this.host.showLayer('daynight'); }
  protected async asking() { if (this.app.isActive('daynight')) await this.host.showLayer(null); }
}
