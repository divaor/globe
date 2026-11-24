// Timeline bar shared by the time-travel modes: a track with coloured bands and ticks, start/end
// handles for the animation range, the current position, play/pause, speed, and an exit button.
import { Play, Pause, X, SkipBack, ListOrdered } from 'lucide';
import { h, icon, clear } from './dom';
import { t } from '../app/i18n';
import { keepAwake } from './wake';

export interface TimeBarOptions {
  title: string;
  subtitle?: string;
  /** Number of discrete steps (positions snap to i/(steps-1) when released); omit for continuous. */
  steps?: number;
  format: (pos: number) => string;
  /** The start and end under the track ("From … to …"), when they need a shorter form than the big label. */
  rangeFormat?: (f: number) => string;
  /** Second line under the big label (e.g. geological period and events); default: title. */
  caption?: (pos: number) => string;
  bands?: { from: number; to: number; color: string; label?: string }[];
  ticks?: { at: number; label: string }[];
  start: number;
  end: number;
  pos: number;
  /** Fraction of the track per second at speed 1. */
  rate: number;
  onPos: (pos: number) => void;
  onExit: () => void;
  onList?: () => void;
  listLabel?: string;
  /**
   * A play clock (v0.46.1): playing moves evenly in its seconds (`rate` is then in seconds a second, usually 1), so the
   * owner can make quiet stretches go fast and busy ones slow.
   */
  warp?: { to: (pos: number) => number; from: (c: number) => number };
  /** The speeds to choose from (default 0.5×, 1×, 2×, 4×), the one to start with, and a call when it changes. */
  speeds?: number[];
  speed?: number;
  onSpeed?: (s: number) => void;
  /** The play button pressed: return true when the owner plays something of its own (a narrated story) instead. */
  onPlay?: () => boolean;
  /** Whether the owner's own play is running (the button then shows Pause). */
  busy?: () => boolean;
  /** The reader moved the bar by hand. */
  onScrub?: () => void;
}

export class TimeBar {
  readonly el: HTMLElement;
  private track: HTMLElement;
  private range: HTMLElement;
  private thumb: HTMLElement;
  private hStart: HTMLElement;
  private hEnd: HTMLElement;
  private yearEl: HTMLElement;
  private subEl: HTMLElement;
  private rangeLabel: HTMLElement;
  private playBtn: HTMLButtonElement;
  private speedSel: HTMLSelectElement;
  private raf = 0;
  private last = 0;
  playing = false;
  speed = 1;
  private decluttered = false;
  start: number;
  end: number;
  pos: number;

  constructor(private o: TimeBarOptions) {
    this.start = o.start; this.end = o.end; this.pos = o.pos;
    this.yearEl = h('div', { class: 'tb-year' });
    this.subEl = h('div', { class: 'tb-sub' }, o.title, o.subtitle ? ` · ${o.subtitle}` : '');
    this.rangeLabel = h('div', { class: 'tb-range' });
    this.playBtn = h('button', { type: 'button', class: 'tb-play', 'aria-label': 'Play' }) as HTMLButtonElement;
    this.playBtn.addEventListener('click', () => this.press());
    const restart = h('button', { type: 'button', class: 'icon-btn tb-restart', title: t('tbRestart'), 'aria-label': t('tbRestart') }, icon(SkipBack, 18));
    restart.addEventListener('click', () => { this.setPos(this.start, true); if (!this.playing && !o.busy?.()) this.press(); });
    const speed = h('select', { class: 'select tb-speed', 'aria-label': t('tbSpeed') }) as HTMLSelectElement;
    for (const s of o.speeds ?? [0.5, 1, 2, 4]) speed.append(h('option', { value: String(s) }, `${s}×`));
    this.speed = o.speed ?? 1;
    speed.value = String(this.speed);
    speed.addEventListener('change', () => { this.speed = Number(speed.value); o.onSpeed?.(this.speed); });
    this.speedSel = speed;
    const exit = h('button', { type: 'button', class: 'icon-btn', title: t('close'), 'aria-label': t('close') }, icon(X, 18));
    exit.addEventListener('click', () => o.onExit());
    const list = o.onList ? h('button', { type: 'button', class: 'pill sm', title: o.listLabel }, icon(ListOrdered, 16), h('span', { class: 'tb-list-label' }, o.listLabel ?? '')) : null;
    list?.addEventListener('click', () => o.onList!());

    this.track = h('div', { class: 'tb-track', role: 'slider', tabindex: '0', 'aria-label': o.title });
    this.range = h('div', { class: 'tb-sel' });
    this.thumb = h('div', { class: 'tb-thumb' });
    this.hStart = h('div', { class: 'tb-handle start', title: t('tbFrom') });
    this.hEnd = h('div', { class: 'tb-handle end', title: t('tbTo') });
    for (const b of o.bands ?? []) {
      this.track.append(h('div', { class: 'tb-band', title: b.label ?? '', style: { left: `${b.from * 100}%`, width: `${(b.to - b.from) * 100}%`, background: b.color } },
        b.label && b.to - b.from > 0.06 ? h('span', null, b.label) : null));
    }
    for (const tk of o.ticks ?? []) this.track.append(h('div', { class: 'tb-tick', style: { left: `${tk.at * 100}%` } }, h('span', null, tk.label)));
    if (o.steps && o.steps < 80) for (let i = 0; i < o.steps; i++) this.track.append(h('div', { class: 'tb-step', style: { left: `${(i / (o.steps - 1)) * 100}%` } }));
    this.track.append(this.range, this.hStart, this.hEnd, this.thumb);

    this.el = h('section', { class: 'timebar glass', 'aria-label': o.title },
      h('div', { class: 'tb-top' },
        this.playBtn,
        h('div', { class: 'tb-title' }, this.yearEl, this.subEl),
        h('div', { class: 'tb-tools' }, list, restart, speed, exit)),
      this.track, this.rangeLabel);

    this.bindDrag(this.thumb, (f) => this.setPos(f, true));
    this.bindDrag(this.hStart, (f) => { this.start = Math.min(f, this.end); this.render(); });
    this.bindDrag(this.hEnd, (f) => { this.end = Math.max(f, this.start); this.render(); });
    this.track.addEventListener('pointerdown', (e) => {
      if (e.target !== this.track && !(e.target as HTMLElement).classList.contains('tb-band') && !(e.target as HTMLElement).classList.contains('tb-step')) return;
      this.o.onScrub?.();
      this.setPos(this.fracAt(e.clientX), true);
      this.snap();
    });
    this.track.addEventListener('keydown', (e) => {
      const step = o.steps ? 1 / (o.steps - 1) : 0.01;
      if (e.key === 'ArrowRight') { this.setPos(Math.min(1, this.pos + step), true); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { this.setPos(Math.max(0, this.pos - step), true); e.preventDefault(); }
      if (e.key === ' ') { this.press(); e.preventDefault(); }
    });
    this.render();
    window.addEventListener('resize', () => this.declutter());
    requestAnimationFrame(() => requestAnimationFrame(() => this.declutter()));
  }

  private fracAt(clientX: number) {
    const b = this.track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - b.left) / b.width));
  }

  private bindDrag(el: HTMLElement, fn: (f: number) => void) {
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      if (this.playing) this.toggle();
      this.o.onScrub?.();
      const move = (ev: PointerEvent) => fn(this.fracAt(ev.clientX));
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); this.snap(); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }

  private snap() {
    if (!this.o.steps) return;
    const n = this.o.steps - 1;
    const r = (f: number) => Math.round(f * n) / n;
    this.start = r(this.start); this.end = r(this.end);
    this.setPos(r(this.pos), true);
  }

  setPos(f: number, user = false) {
    this.pos = Math.max(0, Math.min(1, f));
    if (user && this.playing && (this.pos < this.start || this.pos > this.end)) this.toggle();
    this.render();
    this.o.onPos(this.pos);
  }

  /** The play button: the owner's own play (a narrated story) when it takes it, else the bar's. */
  press() {
    if (!this.playing && this.o.onPlay?.()) { this.render(); return; }
    this.toggle();
  }

  /** Sets the speed from the owner's own control. */
  setSpeed(s: number) { this.speed = s; this.speedSel.value = String(s); }

  /** Redraws the play button (after the owner's own play starts, pauses or stops). */
  refresh() { this.render(); }

  toggle() {
    this.playing = !this.playing;
    if (this.playing) {
      if (this.pos >= this.end - 1e-6 || this.pos < this.start) this.setPos(this.start);
      this.last = performance.now();
      const w = this.o.warp;
      // On a play clock the bar keeps its clock reading between frames (positions alone lose it in flat stretches).
      let c = w ? w.to(this.pos) : 0;
      const tick = (now: number) => {
        if (!this.playing) return;
        const dt = Math.min(100, now - this.last) / 1000;
        this.last = now;
        let p: number;
        if (w) { if (Math.abs(w.to(this.pos) - c) > 0.05) c = w.to(this.pos); c += this.o.rate * this.speed * dt; p = w.from(c); } else p = this.pos + this.o.rate * this.speed * dt;
        if (p >= this.end) { p = this.end; this.playing = false; }
        this.setPos(p);
        if (this.playing) this.raf = requestAnimationFrame(tick);
        else this.render();
      };
      this.raf = requestAnimationFrame(tick);
    } else cancelAnimationFrame(this.raf);
    this.render();
  }

  /** An era's name under the thumb hides while the thumb is on it (v0.40.0), so neither covers the other. */
  private clearThumb() {
    const w = this.track.getBoundingClientRect().width;
    if (!w) return;
    const x = this.pos * w;
    const left = this.track.getBoundingClientRect().left;
    this.track.querySelectorAll<HTMLElement>('.tb-band span').forEach((el) => {
      if (el.style.visibility === 'hidden' && !el.dataset.under) return;
      const r = el.getBoundingClientRect();
      const under = x + 14 > r.left - left && x - 14 < r.right - left;
      el.style.opacity = under ? '0' : '';
      el.dataset.under = under ? '1' : '';
    });
  }

  /** Hide tick labels that would overlap (narrow phone screens). */
  private declutter() {
    const w = this.track.getBoundingClientRect().width;
    if (!w) return;
    let last = -1e9;
    this.track.querySelectorAll<HTMLElement>('.tb-tick').forEach((el, i, all) => {
      const x = (parseFloat(el.style.left) / 100) * w;
      const isLast = i === all.length - 1;
      const room = isLast ? 34 : 46;
      const show = x - last >= room;
      el.style.visibility = show ? 'visible' : 'hidden';
      // The first and last labels stay inside the track ("123000 BC" was cut at the left edge).
      el.style.transform = i === 0 ? 'translateX(-4px)' : isLast ? 'translateX(calc(-100% + 4px))' : '';
      if (show) last = x;
    });
    this.track.querySelectorAll<HTMLElement>('.tb-band span').forEach((el) => {
      const band = el.parentElement!.getBoundingClientRect().width;
      el.style.visibility = band > el.getBoundingClientRect().width + 10 ? 'visible' : 'hidden';
    });
  }

  render() {
    if (!this.decluttered && this.el.isConnected) { this.decluttered = true; requestAnimationFrame(() => this.declutter()); }
    const pct = (f: number) => `${f * 100}%`;
    this.thumb.style.left = pct(this.pos);
    this.clearThumb();
    this.hStart.style.left = pct(this.start);
    this.hEnd.style.left = pct(this.end);
    this.range.style.left = pct(this.start);
    this.range.style.width = pct(this.end - this.start);
    this.yearEl.textContent = this.o.format(this.pos);
    if (this.o.caption) this.subEl.textContent = this.o.caption(this.pos) || this.o.title;
    clear(this.rangeLabel);
    const rf = this.o.rangeFormat ?? this.o.format;
    this.rangeLabel.append(h('span', null, `${t('tbFrom')} ${rf(this.start)}`), h('span', null, `${t('tbTo')} ${rf(this.end)}`));
    // The screen stays on while the years play (borders through time, the moving continents).
    const on = this.playing || !!this.o.busy?.();
    keepAwake('timebar', on);
    clear(this.playBtn);
    this.playBtn.append(icon(on ? Pause : Play, 22));
    this.playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
    this.track.setAttribute('aria-valuetext', this.o.format(this.pos));
  }

  /** Height of the screen area covered by the bar (to keep the map above it). */
  coveredHeight(): number {
    const r = this.el.getBoundingClientRect();
    return r.height ? Math.max(0, window.innerHeight - r.top + 6) : 0;
  }

  destroy() {
    this.playing = false;
    keepAwake('timebar', false);
    cancelAnimationFrame(this.raf);
    this.el.remove();
  }
}
