// Ambient mode: full-screen, slowly rotating globe with the current filters as an always-on
// background. Keeps the screen awake, hides the controls, and can cycle through filters.
import { h } from './dom';
import { t, tx } from '../app/i18n';
import type { App } from '../app/app';
import type { Ticker } from '../engine/renderer';

const CYCLE: string[][] = [
  ['political'], ['satellite', 'daynight'], ['timezones'], ['koppen'], ['relief', 'landforms'], ['population'],
];

export class Ambient {
  private ticker: Ticker | null = null;
  private wake: { release: () => Promise<void> } | null = null;
  private clockEl: HTMLElement;
  private hintEl: HTMLElement;
  private overlay: HTMLElement;
  private clockTimer = 0;
  private cycleTimer = 0;
  private cycleIdx = 0;
  private savedStack: string[] = [];
  private hintTimer = 0;

  constructor(private app: App, root: HTMLElement) {
    this.clockEl = h('div', { class: 'amb-clock' });
    this.hintEl = h('div', { class: 'amb-hint glass' }, t('ambientExit'));
    this.overlay = h('div', { class: 'amb-overlay', hidden: true }, this.clockEl, this.hintEl);
    this.overlay.addEventListener('click', () => this.onTap());
    root.append(this.overlay);
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.app.ambient.on) this.stop(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.app.ambient.on) void this.lock(); });
  }

  private onTap() {
    if (this.hintEl.classList.contains('show')) { this.stop(); return; }
    this.hintEl.textContent = t('ambientExit');
    this.hintEl.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('show'), 2600);
  }

  private async lock() {
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } };
      this.wake = (await nav.wakeLock?.request('screen')) ?? null;
    } catch { this.wake = null; }
  }

  async start() {
    const app = this.app;
    if (app.ambient.on) return;
    app.ambient.on = true;
    app.select(null);
    document.documentElement.classList.add('ambient');
    this.overlay.hidden = false;
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions); } catch { /* not allowed: still run windowed */ }
    await this.lock();
    const view = app.renderer.view;
    if (view.current.kind !== 'globe') app.setProjection('globe');
    view.flyTo({ zoom: 1, lat: 18 }, 1500);
    this.ticker = (dt) => {
      if (!view.animating) view.lon += (dt / 1000) * 4 * app.ambient.speed;
      return true;
    };
    app.renderer.tickers.add(this.ticker);
    app.interaction.enabled = false;
    this.updateClock();
    this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
    if (app.ambient.cycle) {
      this.savedStack = app.layers.map((l) => l.def.id);
      this.cycleIdx = 0;
      this.cycleTimer = window.setInterval(() => this.nextCycle(), 40_000);
    }
    app.renderer.requestRender();
    app.emit('ambient', true);
  }

  private nextCycle() {
    const available = CYCLE.filter((ids) => ids.every((id) => this.app.registry.has(id)));
    if (!available.length) return;
    this.cycleIdx = (this.cycleIdx + 1) % available.length;
    void this.app.setStack(available[this.cycleIdx]);
  }

  private updateClock() {
    if (!this.app.ambient.clock) { this.clockEl.hidden = true; return; }
    this.clockEl.hidden = false;
    const now = new Date();
    const loc = this.app.lang === 'es' ? 'es-ES' : 'en-US';
    const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(now);
    const date = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    const top = [...this.app.layers].reverse().find((l) => l.ready);
    this.clockEl.replaceChildren(h('div', { class: 'amb-time' }, time), h('div', { class: 'amb-date' }, date), top ? h('div', { class: 'amb-layer' }, `${top.def.icon} ${tx(top.def.name)}`) : '');
  }

  stop() {
    const app = this.app;
    if (!app.ambient.on) return;
    app.ambient.on = false;
    if (this.ticker) app.renderer.tickers.delete(this.ticker);
    this.ticker = null;
    clearInterval(this.clockTimer);
    clearInterval(this.cycleTimer);
    if (app.ambient.cycle && this.savedStack.length) void app.setStack(this.savedStack);
    app.interaction.enabled = true;
    document.documentElement.classList.remove('ambient');
    this.overlay.hidden = true;
    this.hintEl.classList.remove('show');
    void this.wake?.release().catch(() => {});
    this.wake = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    app.renderer.requestRender();
    app.emit('ambient', false);
  }
}
