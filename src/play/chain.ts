// Border chain (v0.25.0): from a country, tap a neighbour, then a neighbour of that one, never the same country
// twice: as long a chain as you can in 90 seconds. Crossing into another continent earns a bonus. The chain ends
// early at a dead end (no neighbour left that is not already in it).
import { Share2, RotateCcw, Flag } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, dataLang, tx } from '../app/i18n';
import { Borders, seeded, type BorderData } from './route';
import { starText } from './score';
import { CHAIN_SECS, chainScore, chainStars, sample } from './logic';
import { saveRun, loadRun, endRun } from './runs';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, type PlayHost, type HostGame } from './host';

interface State {
  day?: string; g: Borders; chain: string[]; t0: number; timer: number;
  msg: { ok: boolean; text: string } | null; flash: { id: string; until: number } | null;
  done: { score: number; stars: 1 | 2 | 3; why: 'time' | 'dead' | 'stop'; badges: Badge[] } | null;
  fold: boolean;
}

export class BorderChain implements HostGame {
  private st: State | null = null;
  private clock: HTMLElement | null = null;
  back: (() => void) | null = null;
  borders: (() => Promise<BorderData | null>) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { chain: [...s.chain], done: s.done ? { ...s.done, badges: s.done.badges.map((b) => b.id) } : null } : null; }

  async start(o: { day?: string } = {}) {
    const data = await this.borders?.();
    if (!data) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
    const g = new Borders(data);
    const rand = seeded(o.day ? `chain:${o.day}` : `${Date.now()}:${Math.random()}`);
    // A start with three neighbours or more, in Afro-Eurasia or the Americas.
    const starts = Object.keys(data.countries).filter((id) => g.neighbours(id).length >= 3 && this.app.data.meta[id] && g.reach(id).size > 20).sort();
    const first = sample(rand, starts, 1)[0];
    await this.host.enter(this);
    this.st = { day: o.day, g, chain: [first], t0: Date.now(), timer: 0, msg: null, flash: null, done: null, fold: false };
    // Today's chain left mid-way (v0.43.3): the chain stays, and the clock kept running meanwhile.
    const run = o.day ? loadRun<{ chain: string[]; t0: number }>('chain', o.day) : null;
    if (run && run.chain[0] === first) { this.st.chain = run.chain; this.st.t0 = run.t0; }
    else if (o.day) saveRun('chain', o.day, { chain: this.st.chain, t0: this.st.t0 });
    const m = this.app.data.meta[this.st.chain[this.st.chain.length - 1]];
    this.app.renderer.view.flyTo({ lon: m.lx, lat: m.ly, zoom: window.innerWidth < 600 ? 2.2 : 2.6 });
    this.render();
    this.st.timer = window.setInterval(() => this.tick(), 250);
  }

  async stop() { if (!this.st) return; clearInterval(this.st.timer); this.st = null; await this.host.leave(this); }
  drop() { if (this.st) clearInterval(this.st.timer); this.st = null; }

  private left() { return Math.max(0, CHAIN_SECS - (Date.now() - this.st!.t0) / 1000); }
  private tick() {
    const s = this.st;
    if (!s || s.done) return;
    const left = this.left();
    if (this.clock) this.clock.textContent = `⏱️ ${Math.ceil(left)} s`;
    if (left <= 0) this.finish('time');
  }

  tap(g: [number, number] | null): boolean {
    const s = this.st;
    if (!s || s.done) return false;
    if (!g) return true;
    const id = this.app.renderer.countryAt(g[0], g[1]);
    if (id && s.g.data.countries[id]) this.add(id);
    return true;
  }

  add(id: string) {
    const s = this.st;
    if (!s || s.done) return;
    const last = s.chain[s.chain.length - 1];
    const name = (x: string) => this.app.data.name(x, dataLang());
    if (s.chain.includes(id)) { s.msg = { ok: false, text: L('{0} is already in the chain.', '{0} ya está en la cadena.', name(id)) }; s.flash = { id, until: performance.now() + 900 }; }
    else if (!s.g.borders(last, id)) { s.msg = { ok: false, text: L('{0} does not border {1}.', '{0} no limita con {1}.', name(id), name(last)) }; s.flash = { id, until: performance.now() + 900 }; }
    else {
      s.chain.push(id);
      s.msg = null;
      if (s.day) saveRun('chain', s.day, { chain: s.chain, t0: s.t0 });
      // A dead end: no neighbour left that is not in the chain.
      if (!s.g.neighbours(id).some((n) => !s.chain.includes(n))) { this.finish('dead'); return; }
    }
    this.render();
    this.app.renderer.requestRender();
    setTimeout(() => this.app.renderer.requestRender(), 950);
  }

  finish(why: 'time' | 'dead' | 'stop') {
    const s = this.st;
    if (!s || s.done) return;
    clearInterval(s.timer);
    const conts = new Set(s.chain.map((x) => s.g.data.countries[x]?.ct)).size;
    const score = chainScore(s.chain.length, conts), stars = chainStars(s.chain.length);
    if (s.day) endRun('chain');
    const badges = recordGame('chain', { score, stars, feats: s.chain.length >= 15 ? ['chain-15'] : [], day: s.day });
    s.done = { score, stars, why, badges };
    this.clock = null;
    this.render();
    this.app.renderer.requestRender();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${tx(badges[0])}`, 4000);
  }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const name = (x: string) => this.app.data.name(x, dataLang());
    const title = `⛓️ ${s.day ? L('Daily Border chain', 'Cadena de fronteras del día') : L('Border chain', 'Cadena de fronteras')} · ${s.chain.length}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    const chain = h('div', { class: 'hop-path' }, ...s.chain.map((id, i) => h('span', { class: `hop-step${i === 0 ? ' from' : ''}` }, name(id))));
    if (s.done) {
      const why = s.done.why === 'dead' ? L('A dead end: every neighbour was already in the chain.', 'Un callejón sin salida: todos los vecinos ya estaban en la cadena.') : s.done.why === 'time' ? L('Time is up.', 'Se acabó el tiempo.') : '';
      const res = resultCard({ stars: s.done.stars, score: fmtNumber(s.done.score), unit: L('points', 'puntos'), sub: `${L('{0} countries', '{0} países', s.chain.length)}${why ? ` · ${why}` : ''}` });
      this.card.append(res);
      if (!s.fold) res.append(chain);
      const share = h('button', { type: 'button', class: 'pill', 'data-game': 'share' }, icon(Share2, 16), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `⛓️ ${L('Border chain', 'Cadena de fronteras')}${s.day ? ` ${s.day}` : ''} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}\n${s.chain.map(name).join(' › ')}`));
      const again = h('button', { type: 'button', class: 'pill primary', 'data-game': 'again' }, icon(RotateCcw, 16), s.day ? L('More games', 'Más juegos') : L('Play again', 'Jugar otra vez'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start(); });
      res.append(h('div', { class: 'result-actions' }, share, again));
      return;
    }
    const clock = h('span', { class: 'names-clock' }, '⏱️');
    this.clock = clock;
    this.card.append(h('div', { class: 'names-bar' }, clock, h('span', { class: 'names-count' }, L('Tap a neighbour of the last country.', 'Toca un vecino del último país.'))));
    if (s.fold) { this.tick(); return; }
    this.card.append(chain);
    if (s.msg) this.card.append(h('div', { class: `quiz-fb ${s.msg.ok ? 'ok' : 'bad'}` }, s.msg.text));
    const stop = h('button', { type: 'button', class: 'pill sm', 'data-game': 'giveup' }, icon(Flag, 15), L('Stop here', 'Parar aquí'));
    stop.addEventListener('click', () => this.finish('stop'));
    this.card.append(h('div', { class: 'hop-actions' }, stop));
    this.tick();
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s) return;
    const { ctx } = rc;
    ctx.save(); ctx.globalAlpha = 0.85;
    rc.fillCountries(s.chain.slice(1, -1), '#5dade2');
    rc.fillCountry(s.chain[0], '#2ecc71');
    if (s.chain.length > 1) rc.fillCountry(s.chain[s.chain.length - 1], '#f5c542');
    if (s.flash && performance.now() < s.flash.until) rc.fillCountry(s.flash.id, '#e67e22');
    ctx.restore();
    const c = s.g.data.countries, m = this.app.data.meta;
    const pt = (id: string): [number, number] => c[id]?.cap ?? [m[id].lx, m[id].ly];
    ctx.save(); ctx.lineJoin = 'round';
    for (const [w, col] of [[5, 'rgba(0,0,0,0.5)'], [2.5, '#fff']] as const) {
      ctx.beginPath();
      let pen = false;
      for (const id of s.chain) { const q = rc.project(...pt(id)); if (!q) { pen = false; continue; } if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; } }
      ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
    }
    ctx.restore();
    for (const id of s.chain) {
      const q = rc.project(...pt(id));
      if (q) rc.labels.add({ text: this.app.data.name(id, dataLang()), x: q[0] + 6, y: q[1], align: 'left', priority: 3000, size: 12.5, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
  }
}
