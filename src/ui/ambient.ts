// Ambient mode (the screensaver): full-screen, slowly turning globe, the controls hidden and the screen kept awake.
// It shows the filters on the map, or plays a playlist (ui/playlists.ts): one view after another, each with its
// title and a line about it (read aloud when that is on), turning the globe or swaying gently around a place.
import { h } from './dom';
import { t, tx } from '../app/i18n';
import type { App } from '../app/app';
import type { Ticker } from '../engine/renderer';
import { playlist, itemTitle, itemWords, type PlayItem, type Playlist } from './playlists';
import { canSpeak, speak, stopSpeaking } from './narrator';
import type { ProjectionId } from '../engine/projections';

export class Ambient {
  private ticker: Ticker | null = null;
  private wake: { release: () => Promise<void> } | null = null;
  private clockEl: HTMLElement;
  private hintEl: HTMLElement;
  private captionEl: HTMLElement;
  private overlay: HTMLElement;
  private clockTimer = 0;
  private nextTimer = 0;
  private hintTimer = 0;
  /** What was on the map before: filters with their options, projection and place, put back on exit. */
  private saved: { stack: { id: string; options: Record<string, string | boolean> }[]; projection: ProjectionId; camera: { lon: number; lat: number; zoom: number } } | null = null;
  /** The playlist playing, and where in it. */
  private list: Playlist | null = null;
  private idx = 0;
  private run = 0;
  /** The place the globe sways around (a playlist view of a place), and when the sway started. */
  private place: { lon: number; lat: number; zoom: number; t0: number } | null = null;
  /** For tests: the playlist and the view shown, and what was read aloud. */
  info = { playlist: '', index: -1, title: '', words: '', views: 0 };

  constructor(private app: App, root: HTMLElement) {
    this.clockEl = h('div', { class: 'amb-clock' });
    this.captionEl = h('div', { class: 'amb-caption', hidden: true });
    this.hintEl = h('div', { class: 'amb-hint glass' }, t('ambientExit'));
    this.overlay = h('div', { class: 'amb-overlay', hidden: true }, this.clockEl, this.captionEl, this.hintEl);
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

  /** Starts the screensaver with a playlist (by default the one last chosen; '' shows the filters on the map). */
  async start(id = this.app.ambient.playlist) {
    const app = this.app;
    if (app.ambient.on) return;
    app.ambient.on = true;
    app.ambient.playlist = id;
    app.save();
    app.select(null);
    document.documentElement.classList.add('ambient');
    this.overlay.hidden = false;
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' } as FullscreenOptions); } catch { /* not allowed: still run windowed */ }
    await this.lock();
    const view = app.renderer.view;
    this.list = id ? playlist(id) : null;
    if (this.list) {
      this.saved = { stack: app.layers.filter((l) => !l.def.hidden).map((l) => ({ id: l.def.id, options: { ...l.options } })), projection: app.projection, camera: view.camera() };
    } else {
      this.saved = null;
      if (view.current.kind !== 'globe') app.setProjection('globe');
      view.flyTo({ zoom: 1, lat: 18 }, 1500);
    }
    this.ticker = (dt) => {
      if (view.animating) return true;
      const p = this.place;
      // Around a place the globe sways gently, so the place stays in view; else it turns.
      if (p) view.lon = p.lon + (9 / p.zoom) * Math.sin((performance.now() - p.t0) / 7000);
      else view.lon += (dt / 1000) * 4 * app.ambient.speed;
      return true;
    };
    app.renderer.tickers.add(this.ticker);
    app.interaction.enabled = false;
    this.updateClock();
    this.clockTimer = window.setInterval(() => this.updateClock(), 1000);
    this.info = { playlist: id, index: -1, title: '', words: '', views: 0 };
    if (this.list) { this.idx = -1; void this.next(); }
    app.renderer.requestRender();
    app.emit('ambient', true);
  }

  /** Shows the playlist's next view, reads it aloud (when that is on), and waits its time. */
  private async next() {
    const list = this.list;
    if (!list || !this.app.ambient.on) return;
    const me = ++this.run;
    clearTimeout(this.nextTimer);
    // Views whose filters this app does not have are skipped.
    const ok = (it: PlayItem) => it.stack.every((sid) => this.app.registry.has(sid));
    let k = this.idx;
    for (let n = 0; n < list.items.length; n++) { k = (k + 1) % list.items.length; if (ok(list.items[k])) break; }
    if (!ok(list.items[k])) return;
    this.idx = k;
    const it = list.items[k];
    await this.show(it);
    if (me !== this.run || !this.app.ambient.on) return;
    const title = itemTitle(this.app, it), words = itemWords(this.app, it);
    this.info = { ...this.info, index: k, title, words, views: this.info.views + 1 };
    this.caption(title, words);
    const t0 = performance.now(), secs = this.app.ambient.secs * 1000;
    const wait = (ms: number) => { this.nextTimer = window.setTimeout(() => { if (me === this.run) void this.next(); }, Math.max(0, ms)); };
    if (this.app.ambient.narrate && canSpeak()) {
      // Let the map arrive, read the view, then look a while longer.
      await new Promise((r) => setTimeout(r, 1800));
      if (me !== this.run || !this.app.ambient.on) return;
      await speak(words, { lang: this.app.lang });
      if (me !== this.run || !this.app.ambient.on) return;
      wait(Math.max(secs - (performance.now() - t0), 6000));
    } else wait(secs);
  }

  /** Puts a view on the map: its filters and options, projection and place. */
  private async show(it: PlayItem) {
    const app = this.app, view = app.renderer.view;
    const proj = it.projection ?? 'globe';
    if (app.projection !== proj) app.setProjection(proj);
    await app.setStack(it.stack);
    for (const [lid, o] of Object.entries(it.options ?? {})) for (const [key, v] of Object.entries(o)) app.setOption(lid, key, v);
    if (it.fly) {
      const [lon, lat, zoom] = it.fly;
      view.flyTo({ lon, lat, zoom }, 2600);
      this.place = { lon, lat, zoom, t0: performance.now() + 2600 };
    } else {
      this.place = null;
      if (view.zoom > 1.05 || Math.abs(view.lat - 18) > 2) view.flyTo({ zoom: 1, lat: 18 }, 2200);
    }
  }

  /** The view's title and its line, at the bottom of the screen. */
  private caption(title: string, words: string) {
    this.captionEl.classList.remove('show');
    this.captionEl.replaceChildren(h('div', { class: 'amb-cap-title' }, title), words ? h('div', { class: 'amb-cap-words' }, words) : '');
    this.captionEl.hidden = false;
    requestAnimationFrame(() => this.captionEl.classList.add('show'));
    this.updateClock();
  }

  private updateClock() {
    if (!this.app.ambient.clock) { this.clockEl.hidden = true; return; }
    this.clockEl.hidden = false;
    const now = new Date();
    const loc = this.app.lang === 'es' ? 'es-MX' : 'en-US';
    const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(now);
    const d = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    // Only the first letter is a capital ("Sábado, 14 de noviembre").
    const date = d.charAt(0).toUpperCase() + d.slice(1);
    // With a playlist its caption names the view; without, the top filter's name shows under the clock.
    const top = this.list ? null : [...this.app.layers].reverse().find((l) => l.ready && !l.def.hidden);
    this.clockEl.replaceChildren(h('div', { class: 'amb-time' }, time), h('div', { class: 'amb-date' }, date),
      this.list ? h('div', { class: 'amb-layer' }, `${this.list.icon} ${tx(this.list.name)}`) : top ? h('div', { class: 'amb-layer' }, `${top.def.icon} ${tx(top.def.name)}`) : '');
  }

  stop() {
    const app = this.app;
    if (!app.ambient.on) return;
    app.ambient.on = false;
    this.run++;
    if (this.ticker) app.renderer.tickers.delete(this.ticker);
    this.ticker = null;
    this.place = null;
    clearInterval(this.clockTimer);
    clearTimeout(this.nextTimer);
    if (this.list) stopSpeaking();
    // A playlist changed the map: what was on it before comes back.
    if (this.saved) {
      const s = this.saved;
      if (app.projection !== s.projection) app.setProjection(s.projection);
      void app.setStack(s.stack.map((x) => x.id)).then(() => {
        for (const x of s.stack) for (const [k, v] of Object.entries(x.options)) if (app.instance(x.id)?.options[k] !== v) app.setOption(x.id, k, v);
      });
      app.renderer.view.flyTo(s.camera, 1200);
    }
    this.saved = null;
    this.list = null;
    this.captionEl.hidden = true;
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
