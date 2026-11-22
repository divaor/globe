// What every map game shares (v0.25.0): the game card, the map put back as it was after a game (names, filters),
// the map moved down below the card on narrow screens, the card folded to a line, and the map's taps and drawing
// sent to the game on screen. One game at a time: starting one ends the other, and a quiz or tour ends both
// (main.ts wires beforeStart and Learn's own hook).
import { X, ChevronDown, Map as MapIcon } from 'lucide';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { h, icon, clear } from '../ui/dom';
import { lang, t, L } from '../app/i18n';

export { L };

/** A map game, as the host sees it. */
export interface HostGame {
  /** Draws the game's card (into host.card), called again when the language changes. */
  render(): void;
  /** A tap on the map while the game is on screen; true when the game used it. */
  tap(lonlat: [number, number] | null): boolean;
  /** Draws on the map, over the countries. */
  draw(rc: RenderCtx): void;
  /** Ends the game because another one starts (the host keeps the saved map). */
  drop(): void;
  /** Frames the question again: the free map area changed (the phone's keyboard opened or closed, v0.43.3). */
  refit?(): void;
}

type Labels = App['renderer']['settings']['labels'];

export class PlayHost {
  readonly card: HTMLElement;
  current: HostGame | null = null;
  private saved: { labels: Labels; stack: string[] } | null = null;
  /** Called before a game starts (main.ts closes a quiz or tour then). */
  beforeStart: (() => Promise<void> | void) | null = null;
  /** Leaves a Time travel story (main.ts), so the game has the map to itself. */
  exitMode: (() => Promise<void>) | null = null;

  constructor(readonly app: App, readonly shell: Shell) {
    this.card = h('section', { class: 'learn-card play-card glass', hidden: true, 'aria-live': 'polite' });
    app.root.append(this.card);
    new ResizeObserver(() => this.syncInset()).observe(this.card);
    shell.tapHandlers.unshift((_x, _y, g) => (this.current ? this.current.tap(g as [number, number] | null) : false));
    app.renderer.overlays.add((rc) => this.current?.draw(rc));
    app.on('lang', () => this.current?.render());
    // The phone's keyboard (v0.43.3): while it is open the free map area ends above it, and the game frames its
    // question again, so what is asked about is in view between the card and the keyboard.
    const vv = window.visualViewport;
    let timer = 0;
    const keyboard = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const v = this.app.renderer.view;
        const covered = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
        const kb = covered > 80 ? covered : 0;
        if (kb === v.keyboard) return;
        v.keyboard = kb;
        this.current?.refit?.();
        this.app.renderer.requestRender();
      }, 150);
    };
    vv?.addEventListener('resize', keyboard);
    // (Where the page itself shrinks for the keyboard, the map does too: the question is framed again all the same.)
    let resized = 0;
    addEventListener('resize', () => { clearTimeout(resized); resized = window.setTimeout(() => this.current?.refit?.(), 200); });
  }

  /**
   * A game takes the map: the other game (if any) ends, the map's names are hidden as the game asks, and other
   * filters are put away (only the political map, unless the game keeps them). What was there is kept to put back.
   */
  async enter(game: HostGame, o: { labels?: Partial<Labels>; keepStack?: boolean } = {}) {
    if (this.current && this.current !== game) { const old = this.current; this.current = null; old.drop(); }
    await this.beforeStart?.();
    this.shell.sheet.close();
    this.app.select(null);
    if (this.app.mode) await this.exitMode?.();
    const r = this.app.renderer;
    if (!this.saved) {
      this.saved = { labels: { ...r.settings.labels }, stack: this.visibleStack() };
      // Saved as they were while the game plays (v0.43.2), in case the app is left mid-game.
      this.app.lend(this, { labels: { ...this.saved.labels }, active: this.app.activeNow() });
    }
    r.settings.labels = { ...this.saved.labels, countries: false, capitals: false, cities: false, ...o.labels };
    if (!o.keepStack && this.visibleStack().some((id) => id !== 'political')) await this.app.setStack(['political']);
    this.current = game;
    this.card.hidden = false;
    r.requestRender();
  }

  /** The game is over and closed: the card goes, and the map is put back. */
  async leave(game: HostGame) {
    if (this.current !== game) return;
    this.current = null;
    this.card.hidden = true;
    clear(this.card);
    const r = this.app.renderer;
    if (this.saved) {
      r.settings.labels = { ...this.saved.labels };
      const stack = this.saved.stack;
      this.saved = null;
      if (stack.join() !== this.visibleStack().join()) await this.app.setStack(stack.length ? stack : ['political']);
    }
    this.app.giveBack(this);
    this.syncInset();
    r.requestRender();
  }

  /** Ends whatever game is on screen (a quiz or tour is starting). */
  async close() {
    const g = this.current;
    if (!g) return;
    g.drop();
    await this.leave(g);
  }

  /** Shows a filter while a game is on (a hint, or Higher or lower's answer). */
  async showLayer(id: string | null) {
    if (id && !this.app.registry.has(id)) return;
    await this.app.setStack(id ? ['political', id] : ['political']);
  }

  private visibleStack() { return this.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id); }

  /** The card's top line: the title, the fold button (Map / Game) and the close button. */
  head(title: string, o: { fold: boolean; onFold: () => void; onClose: () => void }): HTMLElement {
    const label = o.fold ? L('Back to the game', 'Volver al juego') : L('See the map', 'Ver el mapa');
    const fold = h('button', { type: 'button', class: `pill sm quiz-peek${o.fold ? ' on' : ''}`, title: label, 'aria-label': label, 'aria-expanded': String(!o.fold), 'data-hop': 'fold' },
      icon(o.fold ? ChevronDown : MapIcon, 15), o.fold ? L('Game', 'Juego') : L('Map', 'Mapa'));
    fold.addEventListener('click', o.onFold);
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close'), 'data-game': 'close' }, icon(X, 16));
    close.addEventListener('click', o.onClose);
    this.card.classList.toggle('peek', o.fold);
    return h('div', { class: 'tool-head' }, h('strong', null, title), fold, close);
  }

  syncInset() {
    const v = this.app.renderer.view;
    const shown = !this.card.hidden && !!this.current;
    document.documentElement.classList.toggle('has-game', shown);
    // On a wide screen the card is beside the globe (top left), so the globe keeps the whole window.
    const r = shown && window.innerWidth < 1000 ? this.card.getBoundingClientRect() : null;
    v.insetTop = r && r.height ? Math.round(r.bottom + 8) : 0;
    this.app.renderer.requestRender();
  }

  /** Flies to show two or more points together. */
  fit(points: [number, number][], max = 6) {
    if (!points.length) return;
    let lon = 0, lat = 0, x = 0, y = 0, z = 0;
    for (const [a, b] of points) { const p = (a * Math.PI) / 180, q = (b * Math.PI) / 180; x += Math.cos(q) * Math.cos(p); y += Math.cos(q) * Math.sin(p); z += Math.sin(q); }
    lon = (Math.atan2(y, x) * 180) / Math.PI; lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    let span = 0;
    for (const p of points) for (const q of points) span = Math.max(span, dist(p, q));
    let zoom = Math.max(1.05, Math.min(max, 140 / Math.max(6, span * 1.5)));
    if (this.app.renderer.view.current.kind === 'flat') zoom = Math.max(1, zoom * 0.7);
    if (window.innerWidth < 600) zoom *= 0.85;
    zoom = Math.max(1.05, Math.min(zoom, this.app.renderer.view.fitZoom(span, span)));
    this.app.renderer.view.flyTo({ lon, lat, zoom });
  }
}

/** Angular distance in degrees. */
function dist(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const s = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[0] - a[0]) * r) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(s))) * 180) / Math.PI;
}
