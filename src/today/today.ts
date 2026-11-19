// Today (v0.37.0): every daily thing in one place. A button in the bottom bar (with a dot while something is left
// today) opens one list: the Daily challenge, Master the world's goal, Fill the map's region of the day, Put it on
// the map's puzzle of the day, the map games' puzzles as tiles, and On this day. Each game adds itself (main.ts), so
// a new daily game is one more `add`; each keeps its own card in its own panel too: Today is a shortcut, not a move.
// "Share my day" puts all of today's results in one message.
import { CalendarCheck, Share2, Check, ChevronRight } from 'lucide';
import { FEATURES, ftile } from '../ui/features';
import type { Shell } from '../ui/shell';
import { h, icon, clear } from '../ui/dom';
import { appLocale } from '../app/i18n';
import { L } from '../play/host';
import { shareText } from '../play/pin';
import { current, progress, dayKey } from '../learn/progress';

export interface TodayItem {
  id: string;
  /** Its place in the list. */
  order: number;
  /** A line of the list ('main'), or a tile among the map games ('games'). */
  section: 'main' | 'games';
  /** Played (or reached) today; the button's dot counts the ones that are not. */
  done(): boolean;
  /** Its line or tile (it opens the game). */
  card(): Promise<HTMLElement | null> | HTMLElement | null;
  /** Its line in "Share my day", once done. */
  share?(): string | null;
}
/** Something to read today (On this day): not a challenge, so not counted. */
export interface TodayRead { id: string; order: number; card(): HTMLElement | null }

/** Today's lines and their features (the games make their own cards; Today gives them the feature's tile). */
const TODAY_FEATURE: Record<string, string> = { daily: 'daily', master: 'master', fill: 'fill', states: 'fill', onmap: 'onmap', onthisday: 'onthisday' };

/** The panel's sheet id. */
const ID = 'today';

export class Today {
  private items: TodayItem[] = [];
  private reads: TodayRead[] = [];
  /** Opens Your progress (Learn's panel of badges and streaks). */
  openProgress: (() => void) | null = null;
  /** The reminders' line (v0.37.1). */
  remindLine: (() => HTMLElement) | null = null;

  constructor(private shell: Shell) {
    shell.addDock({ id: ID, icon: CalendarCheck, label: () => L('Today', 'Hoy'), order: 25, onClick: () => void this.toggle(), dot: () => this.left() > 0 });
    // The dot follows the day: games played elsewhere, a new day at midnight, the app back in front.
    setInterval(() => this.shell.refreshDock(), 20_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.shell.refreshDock(); });
  }

  add(item: TodayItem) { this.items.push(item); this.items.sort((a, b) => a.order - b.order); this.shell.refreshDock(); }
  addRead(read: TodayRead) { this.reads.push(read); this.reads.sort((a, b) => a.order - b.order); }

  /** What is left today. */
  left(): number { return this.items.filter((it) => !safe(() => it.done(), true)).length; }
  /** Done today, of how many. */
  tally() { const n = this.items.length; return { done: n - this.left(), total: n }; }

  async toggle() {
    if (this.shell.sheet.isOpen(ID)) { this.shell.sheet.close(); return; }
    await this.openPanel();
  }

  async openPanel() {
    const body = h('div', { class: 'today-panel' });
    await this.fill(body);
    this.shell.openPanel(ID, L('Today', 'Hoy'), body);
  }

  /** The panel: your day (done of all, the streak, share and badges), the challenges, the map games, a read. */
  private async fill(body: HTMLElement) {
    clear(body);
    const { done, total } = this.tally();
    const streak = current(progress().daily);
    const d0 = new Date().toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const date = d0.charAt(0).toUpperCase() + d0.slice(1); // "Miércoles, 18 de noviembre", not every word
    const bar = h('div', { class: 'mw-levels today-bar' }, h('span', { class: 'mw-seg mw-mastered', style: `width:${total ? (100 * done) / total : 0}%` }));
    const share = h('button', { type: 'button', class: 'pill sm primary', 'data-today': 'share', disabled: !done }, icon(Share2, 15), L('Share my day', 'Compartir mi día'));
    share.addEventListener('click', () => void this.share());
    const prog = h('button', { type: 'button', class: 'pill sm', 'data-today': 'progress' }, '🏅 ', L('Your progress', 'Tu progreso'));
    prog.addEventListener('click', () => this.openProgress?.());
    body.append(h('div', { class: 'today-head', 'data-today': 'head' },
      h('div', { class: 'today-date' }, date),
      h('div', { class: 'today-count' }, h('strong', null, L(`${done} of ${total} done`, `${done} de ${total} hechos`)),
        streak ? h('span', null, ` · 🔥 ${L(`${streak} ${streak === 1 ? 'day' : 'days'} in a row`, `${streak} ${streak === 1 ? 'día' : 'días'} seguidos`)}`) : null),
      bar, h('div', { class: 'hop-actions' }, share, prog),
      this.remindLine ? safe(() => this.remindLine!(), null) : null));
    // The challenges.
    const main = h('div', { class: 'mode-list', 'data-today': 'main' });
    for (const it of this.items.filter((x) => x.section === 'main')) {
      const el = await Promise.resolve(safe(() => it.card(), null)).catch(() => null);
      if (el) { el.dataset.todayItem = it.id; main.append(this.dress(el, it.id, safe(() => it.done(), false))); }
    }
    body.append(h('h3', { class: 'sec-title' }, L('Today’s challenges', 'Los retos de hoy')), main);
    // The map games, as tiles.
    const games = this.items.filter((x) => x.section === 'games');
    if (games.length) {
      const grid = h('div', { class: 'today-tiles', 'data-today': 'games' });
      for (const it of games) {
        const el = await Promise.resolve(safe(() => it.card(), null)).catch(() => null);
        if (el) { el.dataset.todayItem = it.id; grid.append(el); }
      }
      const n = games.filter((x) => safe(() => x.done(), false)).length;
      body.append(h('h3', { class: 'sec-title' }, `${L('Map games', 'Juegos en el mapa')} · ${n}/${games.length}`), grid);
    }
    // Something to read.
    for (const r of this.reads) {
      const el = safe(() => r.card(), null);
      if (el) { el.dataset.todayItem = r.id; body.append(h('h3', { class: 'sec-title' }, L('To read', 'Para leer')), this.dress(el, r.id, false)); }
    }
  }

  /** "Share my day": the date, how many are done, the streak, and a line for each done. */
  shareText(): string {
    const { done, total } = this.tally();
    const streak = current(progress().daily);
    const date = new Date().toLocaleDateString(appLocale(), { day: 'numeric', month: 'long' });
    const lines: string[] = [];
    const games: string[] = [];
    for (const it of this.items) {
      const l = safe(() => it.share?.() ?? null, null);
      if (!l) continue;
      if (it.section === 'games') games.push(l); else lines.push(l);
    }
    if (games.length) lines.push(`🎮 ${games.join(' · ')}`);
    return `🌍 ${L('My day on Atlas', 'Mi día en Atlas')} · ${date} · ${done}/${total}${streak ? ` · 🔥 ${streak}` : ''}\n${lines.join('\n')}\n${location.origin}${location.pathname}`;
  }
  async share() { await shareText(this.shell, this.shareText()); }

  /** A line of the list: the feature's icon (ui/features.ts, or an emoji), a title and what it is (or how it went),
   *  done or not; it opens the game. */
  line(id: string, icon_: string, title: string, desc: string, done: boolean, open: () => void): HTMLElement {
    const b = h('button', { type: 'button', class: `mode-card${done ? ' daily-card done' : ''}`, 'data-today-item': id },
      FEATURES[icon_] ? ftile(icon_) : h('span', { class: 'mode-icon' }, icon_),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, desc)));
    b.addEventListener('click', () => open());
    return b;
  }

  /** Every line of Today looks the same (v0.40.0), whichever game made it: its feature's tile first, and at the end a
   *  ✓ once done today, else a chevron. */
  private dress(el: HTMLElement, id: string, done: boolean): HTMLElement {
    const f = TODAY_FEATURE[id];
    const old = el.querySelector(':scope > .mode-icon');
    if (f && old) old.replaceWith(ftile(f));
    el.querySelector(':scope > .mode-end')?.remove();
    el.classList.toggle('done', done);
    el.append(h('span', { class: 'mode-end', 'aria-label': done ? L('Done today', 'Hecho hoy') : undefined }, icon(done ? Check : ChevronRight, done ? 16 : 18)));
    return el;
  }
  /** A map game's tile: its icon and name, and ✓ with today's score once played. */
  tile(id: string, icon_: string, name: string, result: string | null, open: () => void): HTMLElement {
    const b = h('button', { type: 'button', class: `today-tile${result ? ' done' : ''}`, 'data-today-item': id, title: name },
      h('span', { class: 'today-tile-icon' }, icon_), h('span', { class: 'today-tile-name' }, name),
      h('span', { class: 'today-tile-mark' }, result ? `✓ ${result}` : L('Play', 'Jugar')));
    b.addEventListener('click', () => open());
    return b;
  }
}

/** A game that throws (its data not there yet) is just not counted. */
function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }
