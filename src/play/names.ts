// Name them all (v0.25.0): type every country of a continent, every capital of one, or every neighbour of a
// country, against the clock. Answers in English or Spanish, with the usual other names (Your data's name matcher,
// mydata/parse.ts). Each name lights its country on the map; at the end the missing ones are shown.
import { Share2, RotateCcw, Flag } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { resultCard } from '../ui/result';
import { h, icon, clear } from '../ui/dom';
import { fmtNumber, dataLang, tx, nm } from '../app/i18n';
import { loadJSON } from '../data/store';
import { Borders, seeded, type BorderData } from './route';
import { starText } from './score';
import { namesTime, namesScore, capitalNames, sample } from './logic';
import { countryIndex, norm, type CountryIndex } from '../mydata/parse';
import { saveRun, loadRun, endRun } from './runs';
import { recordGame, type Badge } from '../learn/progress';
import { shareText } from './pin';
import { L, type PlayHost, type HostGame } from './host';

export type NameList = 'countries' | 'capitals' | 'neighbours';
export const NAME_LISTS: [NameList, { en: string; es: string }][] = [['countries', { en: 'Countries', es: 'Países' }], ['capitals', { en: 'Capitals', es: 'Capitales' }], ['neighbours', { en: 'Neighbours of a country', es: 'Vecinos de un país' }]];
export const CONTINENTS: [string, { en: string; es: string }][] = [['EU', { en: 'Europe', es: 'Europa' }], ['SA', { en: 'South America', es: 'América del Sur' }], ['NA', { en: 'North and Central America', es: 'Norte y Centroamérica' }], ['AF', { en: 'Africa', es: 'África' }], ['AS', { en: 'Asia', es: 'Asia' }], ['OC', { en: 'Oceania', es: 'Oceanía' }]];
/** Not UN members, but countries on the map most people would name. */
const ALSO = ['TWN', 'XKX', 'PSE', 'VAT'];

interface Attrs { data: Record<string, { un_member?: boolean; capital?: string }> }
interface State {
  list: NameList; area: string; of?: string; day?: string;
  ids: string[]; found: string[]; t0: number; secs: number;
  done: { score: number; stars: 1 | 2 | 3; badges: Badge[] } | null;
  fold: boolean; timer: number;
}

export class NameThemAll implements HostGame {
  private attrs: Attrs | null = null;
  private idx: CountryIndex | null = null;
  private capitals = new Map<string, string>();
  private st: State | null = null;
  private ui: { input: HTMLInputElement; clock: HTMLElement; count: HTMLElement; recent: HTMLElement } | null = null;
  pick = { list: 'countries' as NameList, area: 'SA' };
  back: (() => void) | null = null;
  borders: (() => Promise<BorderData | null>) | null = null;

  constructor(private app: App, private shell: Shell, private host: PlayHost) {}
  private get card() { return this.host.card; }
  get info() { const s = this.st; return s ? { list: s.list, area: s.area, of: s.of, ids: [...s.ids], found: [...s.found], done: s.done ? { ...s.done, badges: s.done.badges.map((b) => b.id) } : null } : null; }

  private async load() {
    if (!this.attrs) { try { this.attrs = await loadJSON<Attrs>('attributes/countries.json'); } catch { return false; } }
    if (!this.idx) this.idx = countryIndex(this.app.data.meta as never);
    if (!this.capitals.size) {
      // Each capital's names: the one the country facts give, and the app's capital cities (English and Spanish).
      for (const [id, d] of Object.entries(this.attrs.data)) for (const n of capitalNames([d.capital], norm)) if (n) this.capitals.set(n, id);
      for (const c of this.app.data.cities) if (c.capital === 2) for (const n of capitalNames([c.name, c.es, nm(c.name, c.es)], norm)) if (n && !this.capitals.has(n)) this.capitals.set(n, c.country);
    }
    return true;
  }

  /** The countries of a continent (UN members, and a few more). */
  private countriesOf(ct: string): string[] {
    const m = this.app.data.meta;
    return Object.keys(m).filter((id) => m[id].ct === ct && (this.attrs!.data[id]?.un_member || ALSO.includes(id))).sort();
  }

  async start(o: { list?: NameList; area?: string; day?: string } = {}) {
    if (!(await this.load())) { this.shell.toast(L('This game needs its data; check your connection.', 'Este juego necesita sus datos; revisa tu conexión.')); return; }
    const rand = seeded(o.day ? `names:${o.day}` : `${Date.now()}:${Math.random()}`);
    const list = o.day ? (['countries', 'capitals', 'neighbours'] as NameList[])[Math.floor(rand() * 3)] : o.list ?? this.pick.list;
    let area = o.day ? CONTINENTS[Math.floor(rand() * 3)][0] : o.area ?? this.pick.area;
    let ids: string[] = [], of: string | undefined;
    if (list === 'neighbours') {
      const data = await this.borders?.();
      if (!data) return;
      const g = new Borders(data);
      // A country with five land neighbours or more.
      const many = Object.keys(data.countries).filter((id) => g.neighbours(id).length >= 5 && this.app.data.meta[id]).sort();
      of = sample(rand, many, 1)[0];
      ids = g.neighbours(of).sort();
      area = this.app.data.meta[of].ct;
    } else ids = this.countriesOf(area);
    if (!ids.length) return;
    await this.host.enter(this);
    const secs = namesTime(ids.length);
    this.st = { list, area, of, day: o.day, ids, found: [], t0: Date.now(), secs, done: null, fold: false, timer: 0 };
    // Today's round left mid-way (v0.43.3): the names found stay, and the clock kept running meanwhile (leaving is no
    // pause to look names up); if it ran out, the round ends with what was found.
    const run = o.day ? loadRun<{ found: string[]; t0: number }>('names', o.day) : null;
    if (run) { this.st.found = run.found.filter((id) => ids.includes(id)); this.st.t0 = run.t0; }
    else if (o.day) saveRun('names', o.day, { found: [], t0: this.st.t0 });
    this.refit();
    this.render();
    this.st.timer = window.setInterval(() => this.tick(), 250);
  }

  /** The countries to name, all in view (again when the keyboard opens or closes, v0.43.3). */
  refit() {
    const s = this.st, m = this.app.data.meta;
    if (s && !s.done) this.host.fit([...s.ids, ...(s.of ? [s.of] : [])].map((id) => [m[id].lx, m[id].ly] as [number, number]), 5);
  }

  async stop() { if (!this.st) return; clearInterval(this.st.timer); this.st = null; this.ui = null; await this.host.leave(this); }
  drop() { if (this.st) clearInterval(this.st.timer); this.st = null; this.ui = null; }
  tap(): boolean { return !!this.st && !this.st.done; }

  private left() { const s = this.st!; return Math.max(0, s.secs - (Date.now() - s.t0) / 1000); }
  private tick() {
    const s = this.st;
    if (!s || s.done) return;
    const left = this.left();
    if (this.ui) this.ui.clock.textContent = `⏱️ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
    if (left <= 0) this.finish();
  }

  /** What is typed: a name of the list not named yet is taken, and the box is cleared. */
  try(text: string): boolean {
    const s = this.st;
    if (!s || s.done) return false;
    const id = s.list === 'capitals' ? this.capitals.get(norm(text)) : this.idx!.match(text);
    if (!id || typeof id !== 'string' || !s.ids.includes(id) || s.found.includes(id)) return false;
    s.found.push(id);
    if (s.day) saveRun('names', s.day, { found: s.found, t0: s.t0 });
    if (this.ui) {
      this.ui.input.value = '';
      this.ui.count.textContent = `${s.found.length}/${s.ids.length}`;
      this.ui.recent.prepend(h('span', { class: 'hop-step' }, s.list === 'capitals' ? `${text.trim()} (${this.name(id)})` : this.name(id)));
    }
    this.app.renderer.requestRender();
    if (s.found.length === s.ids.length) this.finish();
    return true;
  }

  finish() {
    const s = this.st;
    if (!s || s.done) return;
    clearInterval(s.timer);
    const { score, stars } = namesScore(s.found.length, s.ids.length, this.left());
    const feats = s.list === 'countries' && s.found.length === s.ids.length ? ['names-all'] : [];
    if (s.day) endRun('names');
    const badges = recordGame('names', { score, stars, feats, day: s.day });
    s.done = { score, stars, badges };
    this.ui = null;
    this.render();
    this.app.renderer.requestRender();
    if (badges.length) this.shell.toast(`${badges[0].icon} ${L('New badge', 'Nueva insignia')}: ${tx(badges[0])}`, 4000);
  }

  private name(id: string) { return this.app.data.name(id, dataLang()); }
  private capitalOf(id: string) {
    const caps = this.app.data.cities.filter((x) => x.country === id && x.capital === 2);
    const c = caps.find((x) => x.name === this.attrs!.data[id]?.capital) ?? caps[0];
    return c ? nm(c.name, c.es) : this.attrs!.data[id]?.capital ?? '';
  }
  private prompt(): string {
    const s = this.st!;
    const area = CONTINENTS.find((c) => c[0] === s.area)?.[1];
    const where = area ? (tx(area)) : '';
    if (s.list === 'neighbours') return L('Name every country that borders {0}', 'Nombra todos los países que limitan con {0}', this.name(s.of!));
    if (s.list === 'capitals') return L('Name the capital of every country of {0}', 'Nombra la capital de todos los países de {0}', where);
    return L('Name every country of {0}', 'Nombra todos los países de {0}', where);
  }

  render() {
    const s = this.st;
    clear(this.card);
    if (!s) return;
    const title = `📝 ${s.day ? L('Daily Name them all', 'Nómbralos del día') : L('Name them all', 'Nómbralos todos')}`;
    this.card.append(this.host.head(title, { fold: s.fold, onFold: () => { s.fold = !s.fold; this.render(); }, onClose: () => void this.stop() }));
    this.card.append(h('div', { class: 'quiz-q' }, this.prompt()));
    if (s.done) {
      const missing = s.ids.filter((id) => !s.found.includes(id));
      const res = resultCard({ stars: s.done.stars, score: fmtNumber(s.done.score), unit: L('points', 'puntos'), sub: `${s.found.length}/${s.ids.length} ${L('named', 'nombrados')}` });
      this.card.append(res);
      if (missing.length && !s.fold) res.append(h('h4', { class: 'result-rows-title' }, L('Missing', 'Faltaron')), h('div', { class: 'hop-path' }, ...missing.map((id) => h('span', { class: 'hop-step to' }, s.list === 'capitals' ? `${this.capitalOf(id)} (${this.name(id)})` : this.name(id)))));
      const share = h('button', { type: 'button', class: 'pill', 'data-game': 'share' }, icon(Share2, 16), L('Share', 'Compartir'));
      share.addEventListener('click', () => void shareText(this.shell, `📝 ${L('Name them all', 'Nómbralos todos')}${s.day ? ` ${s.day}` : ''}: ${this.prompt()}\n${s.found.length}/${s.ids.length} ${starText(s.done!.stars)} ${fmtNumber(s.done!.score)}`));
      const again = h('button', { type: 'button', class: 'pill primary', 'data-game': 'again' }, icon(RotateCcw, 16), s.day ? L('More games', 'Más juegos') : L('Play again', 'Jugar otra vez'));
      again.addEventListener('click', () => { if (s.day) { void this.stop(); this.back?.(); } else void this.start({ list: s.list, area: s.area }); });
      res.append(h('div', { class: 'result-actions' }, share, again));
      return;
    }
    const clock = h('span', { class: 'names-clock' }, '⏱️');
    const count = h('span', { class: 'names-count' }, `${s.found.length}/${s.ids.length}`);
    const input = h('input', { type: 'text', class: 'names-input', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', 'aria-label': L('Type a name', 'Escribe un nombre'), placeholder: L('Type a name…', 'Escribe un nombre…') }) as HTMLInputElement;
    input.addEventListener('input', () => { this.try(input.value); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (!this.try(input.value)) input.classList.add('miss'); setTimeout(() => input.classList.remove('miss'), 400); } });
    const recent = h('div', { class: 'hop-path names-recent' }, ...[...s.found].reverse().map((id) => h('span', { class: 'hop-step' }, this.name(id))));
    const giveUp = h('button', { type: 'button', class: 'pill sm', 'data-game': 'giveup' }, icon(Flag, 15), L('Show me', 'Muéstramelo'));
    giveUp.addEventListener('click', () => this.finish());
    this.card.append(h('div', { class: 'names-bar' }, clock, count), input);
    if (!s.fold) this.card.append(recent, h('div', { class: 'hop-actions' }, giveUp));
    this.ui = { input, clock, count, recent };
    this.tick();
    setTimeout(() => input.focus(), 50);
  }

  draw(rc: RenderCtx) {
    const s = this.st;
    if (!s) return;
    const { ctx } = rc;
    ctx.save(); ctx.globalAlpha = 0.85;
    if (s.of) rc.fillCountry(s.of, '#2ecc71');
    rc.fillCountries(s.found, '#5dade2');
    if (s.done) rc.fillCountries(s.ids.filter((id) => !s.found.includes(id)), '#e67e22');
    ctx.restore();
    const m = this.app.data.meta;
    const named = s.done ? s.ids : s.found;
    for (const id of [...named, ...(s.of ? [s.of] : [])]) {
      const p = rc.project(m[id].lx, m[id].ly);
      if (p) rc.labels.add({ text: s.list === 'capitals' && id !== s.of ? this.capitalOf(id) : this.name(id), x: p[0], y: p[1], align: 'center', priority: id === s.of ? 3300 : 3000, size: 12.5, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
  }
}
