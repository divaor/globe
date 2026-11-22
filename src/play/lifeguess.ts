// Whose life is this? (v0.29.0): the places of a life from Lives on the map appear one at a time on the map, with their
// years; tap the person they belong to among four. 1,000 points at the first place, 200 less for each place more,
// nothing for a wrong name. Five lives a game.
import { Share2, RotateCcw, Plus } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, tx } from '../app/i18n';
import { loadJSON } from '../data/store';
import { seeded } from './route';
import { starText } from './score';
import { LIFE_ROUNDS, lifePoints, lifeStars, sample, km } from './logic';
import { saveRun, loadRun, endRun } from './runs';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, type PlayHost, type HostGame } from './host';

type T = { en: string; es: string };
interface Entry { id: string; name: T; icon: string; region: T; life?: { field: string; born: string; died: string | null } }
interface Place { at: [number, number]; year: string; label: string }
interface Round { who: Entry; choices: Entry[]; places: Place[]; shown: number; answer: string | null }
/** Today's round as far as it went: the points so far, and each round's places shown and answer. */
interface LivesRun { pts: number[]; rounds: [number, string | null][] }
interface State { day?: string; rounds: Round[]; i: number; pts: number[]; done: { score: number; stars: 1 | 2 | 3; badges: Badge[] } | null; fold: boolean }


export class WhoseLife implements HostGame {
  private st: State | null = null;
  back: (() => void) | null = null;
  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { i: s.i, pts: [...s.pts], done: s.done ? { score: s.done.score, stars: s.done.stars, badges: s.done.badges.map((b) => b.id) } : null, round: s.rounds[s.i] ? { who: s.rounds[s.i].who.id, choices: s.rounds[s.i].choices.map((c) => c.id), shown: s.rounds[s.i].shown, answer: s.rounds[s.i].answer, places: s.rounds[s.i].places.length } : null } : null; }

  /** A life's places in order, a place once (50 km apart), the year of the step that first comes there. */
  private async places(id: string): Promise<Place[]> {
    const c = await loadJSON<{ steps: { at?: [number, number]; date?: string; label?: T; place?: T; aftermath?: boolean; away?: boolean }[] }>(`lives/${id}.json`);
    const out: Place[] = [];
    for (const st of c.steps) {
      if (!st.at || st.aftermath || st.away) continue;
      if (out.some((p) => km(p.at, st.at!) < 50)) continue;
      const lab = st.label ?? st.place;
      out.push({ at: st.at, year: (st.date ?? '').replace(/^-0*/, '-').slice(0, 5).replace(/-$/, '').replace(/^(\d{4}).*/, '$1'), label: lab ? tx(lab).split(',')[0] : '' });
    }
    return out;
  }

  async start(o: { day?: string } = {}) {
    const rand = seeded(o.day ? `lives:${o.day}` : `${Date.now()}:${Math.random()}`);
    let all: Entry[] = [];
    try { all = (await loadJSON<{ stories: Entry[] }>('lives/index.json')).stories.filter((e) => e.life); } catch { /* offline */ }
    if (all.length < 8) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
    const rounds: Round[] = [];
    for (const who of sample(rand, all, all.length)) {
      if (rounds.length === LIFE_ROUNDS) break;
      if (rounds.some((r) => r.who.id === who.id)) continue;
      let places: Place[] = [];
      try { places = await this.places(who.id); } catch { continue; }
      if (places.length < 4) continue;
      // Three others, of the same field when there are enough.
      const same = all.filter((e) => e.id !== who.id && e.life?.field === who.life?.field);
      const others = sample(rand, same.length >= 3 ? same : all.filter((e) => e.id !== who.id), 3);
      const choices = sample(rand, [who, ...others], 4);
      rounds.push({ who, choices, places, shown: 1, answer: null });
    }
    if (rounds.length < LIFE_ROUNDS) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
    await this.host.enter(this, { labels: { seas: true, countries: true } });
    this.st = { day: o.day, rounds, i: 0, pts: [], done: null, fold: false };
    // Today's round left mid-way: the places shown and the answers given stay (v0.43.3).
    const run = o.day ? loadRun<LivesRun>('lives', o.day) : null;
    if (run && run.rounds.length === rounds.length) {
      const s = this.st;
      run.rounds.forEach(([shown, answer], k) => { rounds[k].shown = shown; rounds[k].answer = answer; });
      s.pts = run.pts;
      const open = rounds.findIndex((r) => !r.answer);
      s.i = open >= 0 ? open : rounds.length - 1;
      if (open < 0) { this.next(); return; }
    }
    this.frame();
    this.render();
  }
  /** Today's round as far as it went (v0.43.3): each place shown and each answer, kept as they happen. */
  private keep() {
    const s = this.st;
    if (s?.day && !s.done) saveRun('lives', s.day, { pts: s.pts, rounds: s.rounds.map((r) => [r.shown, r.answer]) } satisfies LivesRun);
  }

  async stop() { if (!this.st) return; this.st = null; await this.host.leave(this); }
  drop() { this.st = null; }
  tap(): boolean { return !!this.st && !this.st.done; }

  /** The map shows the places shown so far. */
  private frame() {
    const r = this.st?.rounds[this.st.i];
    if (!r) return;
    const pts = r.places.slice(0, r.answer ? r.places.length : r.shown).map((p) => p.at);
    this.host.fit(pts.length > 1 ? pts : [pts[0], [pts[0][0] + 6, pts[0][1] + 4]], 6);
  }

  more() {
    const s = this.st;
    const r = s?.rounds[s.i];
    if (!s || !r || r.answer || r.shown >= r.places.length) return;
    r.shown++;
    this.keep();
    this.frame();
    this.render();
    this.app.renderer.requestRender();
  }

  guess(id: string) {
    const s = this.st;
    const r = s?.rounds[s.i];
    if (!s || !r || r.answer) return;
    r.answer = id;
    s.pts.push(lifePoints(r.shown, id === r.who.id));
    this.keep();
    this.frame();
    this.render();
    this.app.renderer.requestRender();
  }

  next() {
    const s = this.st;
    if (!s || !s.rounds[s.i].answer) return;
    if (s.i + 1 < s.rounds.length) { s.i++; this.frame(); this.render(); this.app.renderer.requestRender(); return; }
    const score = s.pts.reduce((a, b) => a + b, 0);
    const stars = lifeStars(score);
    const feats = s.rounds.some((r) => r.answer === r.who.id && r.shown === 1) ? ['life-first'] : [];
    if (s.day) endRun('lives');
    const badges = recordGame('lives', { score, stars, feats, day: s.day });
    s.done = { score, stars, badges };
    this.render();
    this.app.renderer.requestRender();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${tx(badges[0])}`, 4000);
  }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const title = `👤 ${s.day ? L('Daily Whose life is this?', '¿De quién es esta vida? del día') : L('Whose life is this?', '¿De quién es esta vida?')} · ${s.done ? L('Result', 'Resultado') : `${s.i + 1}/${s.rounds.length}`}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    const total = s.pts.reduce((a, b) => a + b, 0);
    if (s.done) {
      const res = resultCard({ stars: s.done.stars, score: fmtNumber(s.done.score), unit: L('points', 'puntos'), sub: L('Out of {0}', 'De {0}', fmtNumber(1000 * LIFE_ROUNDS)),
        rows: s.rounds.map((r, i) => ({ icon: r.who.icon, name: tx(r.who.name), value: fmtNumber(s.pts[i]), mark: r.answer === r.who.id ? (r.shown <= 2 ? 'ok' : 'near') : 'miss',
          detail: r.answer === r.who.id ? L('after {0, plural, one {# place} other {# places}}', 'con {0, plural, one {# lugar} other {# lugares}}', r.shown) : L('missed', 'fallada') })) });
      this.card.append(res);
      const share = h('button', { type: 'button', class: 'pill', 'data-game': 'share' }, icon(Share2, 16), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `👤 ${L('Whose life is this?', '¿De quién es esta vida?')}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.rounds.map((r) => (r.answer !== r.who.id ? '🟥' : r.shown === 1 ? '🎯' : r.shown <= 2 ? '🟩' : '🟨')).join('')}`));
      const again = h('button', { type: 'button', class: 'pill primary', 'data-game': 'again' }, icon(RotateCcw, 16), s.day ? L('More games', 'Más juegos') : L('Play again', 'Jugar otra vez'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start(); });
      res.append(h('div', { class: 'result-actions' }, share, again));
      return;
    }
    const r = s.rounds[s.i];
    this.card.append(h('div', { class: 'quiz-q' }, r.answer ? `${r.who.icon} ${tx(r.who.name)}` : L('Whose life passed through these places?', '¿Por estos lugares pasó la vida de quién?')));
    if (s.fold) return;
    const shown = r.places.slice(0, r.answer ? r.places.length : r.shown);
    this.card.append(h('div', { class: 'hop-path life-places' }, ...shown.map((p, k) => h('span', { class: `hop-step${k === 0 ? ' from' : ''}` }, `${k + 1}. ${p.year ? `${p.year} · ` : ''}${p.label}`))));
    if (!r.answer) {
      const choices = h('div', { class: 'quiz-opts' }, ...r.choices.map((c) => {
        const b = h('button', { type: 'button', class: 'pill quiz-opt', 'data-life': c.id }, `${c.icon} ${tx(c.name)}`);
        b.addEventListener('click', () => this.guess(c.id));
        return b;
      }));
      const more = h('button', { type: 'button', class: 'pill sm', 'data-game': 'more' }, icon(Plus, 15), L('Another place ({0} left)', 'Otro lugar (quedan {0})', fmtNumber(Math.max(200, 1000 - 200 * r.shown))));
      more.disabled = r.shown >= r.places.length;
      more.addEventListener('click', () => this.more());
      this.card.append(choices, h('div', { class: 'hop-actions' }, more), h('div', { class: 'hop-stats' }, `${L('Score', 'Puntos')}: ${fmtNumber(total)}`));
      return;
    }
    const right = r.answer === r.who.id;
    this.card.append(h('div', { class: `quiz-fb ${right ? 'ok' : 'bad'}` }, right ? L('Right: {0} points.', '¡Correcto! {0} puntos.', fmtNumber(s.pts[s.i])) : L('It was {0}.', 'Era {0}.', tx(r.who.name))),
      h('div', { class: 'hop-stats' }, tx(r.who.region)));
    const open = h('button', { type: 'button', class: 'pill sm', 'data-game': 'open-life' }, L('Follow this life', 'Seguir esta vida'));
    open.addEventListener('click', () => { const id = r.who.id; void this.stop().then(() => this.app.emit('open-story', 'lives', id, 0)); });
    const next = h('button', { type: 'button', class: 'pill sm primary', 'data-game': 'next' }, s.i + 1 < s.rounds.length ? L('Next life', 'Siguiente vida') : L('See the result', 'Ver el resultado'));
    next.addEventListener('click', () => this.next());
    this.card.append(h('div', { class: 'hop-actions' }, open, next), h('div', { class: 'hop-stats' }, `${L('Score', 'Puntos')}: ${fmtNumber(total)}`));
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    const r = s?.rounds[s.i];
    if (!s || !r || s.done) return;
    const { ctx } = rc;
    const shown = r.places.slice(0, r.answer ? r.places.length : r.shown);
    if (shown.length > 1) {
      ctx.save(); ctx.setLineDash([6, 5]);
      for (const [w, c] of [[5, 'rgba(0,0,0,0.5)'], [2.5, '#c39bd3']] as const) { ctx.beginPath(); rc.path({ type: 'LineString', coordinates: shown.map((p) => p.at) }); ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); }
      ctx.restore();
    }
    shown.forEach((p, k) => {
      const q = rc.project(p.at[0], p.at[1]);
      if (!q) return;
      ctx.beginPath(); ctx.arc(q[0], q[1], 9, 0, Math.PI * 2); ctx.fillStyle = k === shown.length - 1 && !r.answer ? '#ffd43b' : '#c39bd3'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), q[0], q[1] + 0.5);
      rc.labels.add({ text: `${p.year ? `${p.year} · ` : ''}${p.label}`, x: q[0] + 13, y: q[1], align: 'left', priority: 3000 - k, size: 12, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    });
  }
}
