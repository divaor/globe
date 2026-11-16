// Pin it (v0.25.0): drop a pin where a place is, with the map's names hidden. Five places a game from a pack
// (capitals, World Heritage sites, great structures, battles, dishes' homes, inventions, museums, or a mix);
// up to 5,000 points a pin, falling with the distance. Hard mode hides the seas' names too.
import { Share2, RotateCcw, MapPin } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber } from '../app/i18n';
import { loadJSON } from '../data/store';
import { seeded } from './route';
import { starText } from './score';
import { PIN_ROUNDS, PIN_MAX, pinPoints, pinStars, sample, km } from './logic';
import { recordGame, dayKey, type Badge } from '../learn/progress';
import { L, es, type PlayHost, type HostGame } from './host';

export type Pack = 'mixed' | 'capitals' | 'heritage' | 'structures' | 'battles' | 'dishes' | 'inventions' | 'museums' | 'masterpieces' | 'animals' | 'trees';
export const PACKS: [Pack, { en: string; es: string }][] = [
  ['mixed', { en: 'A bit of everything', es: 'Un poco de todo' }], ['capitals', { en: 'Capitals', es: 'Capitales' }],
  ['heritage', { en: 'World Heritage', es: 'Patrimonio Mundial' }], ['structures', { en: 'Great structures', es: 'Grandes construcciones' }],
  ['battles', { en: 'Battles', es: 'Batallas' }], ['dishes', { en: 'Dishes', es: 'Platos' }],
  ['inventions', { en: 'Inventions', es: 'Inventos' }], ['museums', { en: 'Museums', es: 'Museos' }],
  ['masterpieces', { en: 'Masterpieces', es: 'Obras maestras' }],
  ['animals', { en: 'Animals (where best to see them)', es: 'Animales (dónde verlos mejor)' }],
  ['trees', { en: 'Famous trees', es: 'Árboles famosos' }],
];
/** [name, nombre, lon, lat, icon, note, nota] */
type Place = [string, string, number, number, string, string, string];

interface State {
  pack: Pack; hard: boolean; day?: string;
  places: Place[]; i: number;
  pin: [number, number] | null;
  results: { km: number; pts: number }[];
  answered: boolean; done: { score: number; stars: 1 | 2 | 3; badges: Badge[] } | null;
  fold: boolean;
}

export class PinIt implements HostGame {
  private packs: Record<string, Place[]> | null = null;
  private st: State | null = null;
  pick = { pack: 'mixed' as Pack, hard: false };
  /** Back to the Map games panel (menu.ts). */
  back: (() => void) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { pack: s.pack, i: s.i, pin: s.pin, results: [...s.results], answered: s.answered, done: s.done ? { score: s.done.score, stars: s.done.stars, badges: s.done.badges.map((b) => b.id) } : null, place: s.places[s.i] } : null; }

  private async load() {
    if (!this.packs) { try { this.packs = (await loadJSON<{ packs: Record<string, Place[]> }>('play/pins.json')).packs; } catch { return null; } }
    return this.packs;
  }

  async start(o: { pack?: Pack; hard?: boolean; day?: string } = {}) {
    const packs = await this.load();
    if (!packs) { this.shell.toast(L('Pin it needs its places; check your connection.', 'Pon el pin necesita sus lugares; revisa tu conexión.')); return; }
    const pack = o.day ? 'mixed' : o.pack ?? this.pick.pack;
    const hard = o.day ? false : o.hard ?? this.pick.hard;
    const rand = seeded(o.day ? `pin:${o.day}` : `${Date.now()}:${Math.random()}`);
    const pool = pack === 'mixed' ? Object.values(packs).flat() : packs[pack] ?? [];
    // Places far enough apart that the game moves around the world.
    const places: Place[] = [];
    for (const p of sample(rand, pool, 60)) {
      if (places.every((q) => km([p[2], p[3]], [q[2], q[3]]) > 800)) places.push(p);
      if (places.length === PIN_ROUNDS) break;
    }
    await this.host.enter(this, { labels: hard ? { seas: false } : {} });
    this.st = { pack, hard, day: o.day, places, i: 0, pin: null, results: [], answered: false, done: null, fold: false };
    this.app.renderer.view.flyTo({ lon: 10, lat: 20, zoom: 1.05 });
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

  /** The pin is where it should be: the distance, the points, the place shown. */
  confirm() {
    const s = this.st;
    if (!s || !s.pin || s.answered) return;
    const p = s.places[s.i];
    const d = km(s.pin, [p[2], p[3]]);
    s.results.push({ km: d, pts: pinPoints(d) });
    s.answered = true;
    this.host.fit([s.pin, [p[2], p[3]]], 7);
    this.render();
    this.app.renderer.requestRender();
  }

  next() {
    const s = this.st;
    if (!s || !s.answered) return;
    if (s.i + 1 < s.places.length) {
      s.i++; s.pin = null; s.answered = false;
      this.app.renderer.view.flyTo({ lon: 10, lat: 20, zoom: 1.05 });
      this.render();
      return;
    }
    const score = s.results.reduce((a, r) => a + r.pts, 0);
    const stars = pinStars(score);
    const feats = s.results.some((r) => r.km <= 25) ? ['pin-25km'] : [];
    const badges = recordGame('pin', { score, stars, feats, day: s.day });
    s.done = { score, stars, badges };
    this.render();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${es() ? badges[0].es : badges[0].en}`, 4000);
  }

  private name(p: Place) { return es() ? p[1] : p[0]; }
  private note(p: Place) { return es() ? p[6] : p[5]; }
  private dist(d: number) { return d < 10 ? `${d.toFixed(1)} km` : `${fmtNumber(Math.round(d))} km`; }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const title = `📍 ${s.day ? L('Daily Pin it', 'Pon el pin del día') : L('Pin it', 'Pon el pin')} · ${s.done ? L('Result', 'Resultado') : `${s.i + 1}/${s.places.length}`}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    const total = s.results.reduce((a, r) => a + r.pts, 0);
    if (s.done) {
      this.card.append(
        h('div', { class: 'hop-score' }, h('span', { class: 'hop-stars' }, starText(s.done.stars)), h('span', null, `${fmtNumber(s.done.score)} ${L('points', 'puntos')}`)),
        h('div', { class: 'hop-stats' }, L(`Out of ${fmtNumber(PIN_MAX * PIN_ROUNDS)}.`, `De ${fmtNumber(PIN_MAX * PIN_ROUNDS)}.`)),
        h('div', { class: 'hop-others' }, ...s.places.map((p, i) => h('div', { class: 'hop-other' }, h('span', { class: 'hop-other-goal' }, `${p[4]} ${this.name(p)}: ${fmtNumber(s.results[i].pts)}`), h('span', { class: 'hop-other-path' }, `${this.dist(s.results[i].km)} · ${this.note(p)}`)))));
      const share = h('button', { type: 'button', class: 'pill sm', 'data-game': 'share' }, icon(Share2, 15), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `📍 ${L('Pin it', 'Pon el pin')}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.results.map((r) => (r.km <= 100 ? '🎯' : r.km <= 500 ? '🟩' : r.km <= 1500 ? '🟨' : '🟥')).join('')}`));
      const again = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'again' }, icon(RotateCcw, 15), s.day ? L('More games', 'Más juegos') : L('Play again', 'Otra partida'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start({ pack: s.pack, hard: s.hard }); });
      this.card.append(h('div', { class: 'hop-actions' }, share, again));
      return;
    }
    const p = s.places[s.i];
    this.card.append(h('div', { class: 'quiz-q' }, `${p[4]} ${L('Where is', '¿Dónde está')} ${this.name(p)}${es() ? '?' : '?'}`));
    if (s.fold) return;
    if (!s.answered) {
      this.card.append(h('div', { class: 'hop-stats' }, s.pin ? L('Move it with another tap, or pin it here.', 'Muévelo con otro toque, o ponlo aquí.') : L('Tap the map where you think it is.', 'Toca el mapa donde crees que está.')));
      const ok = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'confirm' }, icon(MapPin, 15), L('Pin it here', 'Ponlo aquí'));
      ok.disabled = !s.pin;
      ok.addEventListener('click', () => this.confirm());
      this.card.append(h('div', { class: 'hop-actions' }, ok), h('div', { class: 'hop-stats' }, `${L('Score', 'Puntos')}: ${fmtNumber(total)}`));
      return;
    }
    const r = s.results[s.results.length - 1];
    this.card.append(
      h('div', { class: `quiz-fb ${r.km <= 500 ? 'ok' : 'bad'}` }, `${this.dist(r.km)} ${L('away', 'de distancia')}: ${fmtNumber(r.pts)} ${L('points', 'puntos')}`),
      h('div', { class: 'hop-stats' }, this.note(p)));
    const next = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'next' }, s.i + 1 < s.places.length ? L('Next place', 'Siguiente lugar') : L('See the result', 'Ver el resultado'));
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
    const shown = s.done ? s.places.map((p, i) => ({ p, i })) : s.answered ? [{ p: s.places[s.i], i: s.i }] : [];
    for (const { p } of shown) {
      const a: [number, number] = [p[2], p[3]];
      if (s.pin && !s.done) {
        const q1 = rc.project(s.pin[0], s.pin[1]), q2 = rc.project(a[0], a[1]);
        if (q1 && q2) { ctx.save(); ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore(); }
      }
      dot(a, '#2ecc71', 7, `${p[4]} ${this.name(p)}`);
    }
    if (s.pin && !s.done) dot(s.pin, '#ff6b6b', 8);
  }
}

/** Shares a result (the phone's share sheet, or the clipboard). */
export async function shareText(shell: Shell, text: string) {
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); shell.toast(L('Copied: paste it anywhere.', 'Copiado: pégalo donde quieras.')); }
  } catch { /* cancelled */ }
}
export const today = () => dayKey();
