// A panel that is a bottom sheet on phones and a floating side panel on wider screens.
import { X } from 'lucide';
import { ftile, featureOfSheet } from './features';
import { h, button, clear } from './dom';
import { t } from '../app/i18n';

const HEIGHTS = 'atlas-globe:sheet-heights';

export class Sheet {
  readonly el: HTMLElement;
  private body: HTMLElement;
  /** Stays put under the header while the body scrolls (the filters' search box). */
  private bar: HTMLElement;
  private titleEl: HTMLElement;
  private onCloseCb: (() => void) | null = null;
  /** How far each panel was scrolled when last seen. */
  private scrolls = new Map<string, number>();
  current: string | null = null;

  constructor(root: HTMLElement) {
    this.titleEl = h('h2', { class: 'sheet-title' });
    this.body = h('div', { class: 'sheet-body' });
    this.bar = h('div', { class: 'sheet-bar', hidden: true });
    const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
    this.el = h('section', { class: 'sheet glass', role: 'dialog', 'aria-modal': 'false', hidden: true },
      grip,
      h('header', { class: 'sheet-head' }, this.titleEl, button({ icon: X, title: t('close'), cls: 'icon-btn', onClick: () => this.close() })),
      this.bar,
      this.body);
    root.append(this.el);
    // How tall the sheet stands (on phones, from the bottom), for what sits just above it (a card over the globe).
    const publish = () => {
      if (this.el.hidden) document.documentElement.style.removeProperty('--sheet-hpx');
      else document.documentElement.style.setProperty('--sheet-hpx', `${this.el.offsetHeight}px`);
    };
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(publish).observe(this.el);
    window.addEventListener('resize', publish);
    // Remember where each panel was scrolled to, so it opens again at the same place.
    this.body.addEventListener('scroll', () => { if (this.current && !this.el.hidden) this.scrolls.set(this.current, this.body.scrollTop); }, { passive: true });
    // On a phone, dragging the grip or the header up or down makes the sheet taller or shorter (each panel keeps its
    // height); dragged nearly to the bottom, it closes.
    let y0 = -1, h0 = 0, moved = false;
    const head = this.el.querySelector('.sheet-head') as HTMLElement;
    const phone = () => matchMedia('(max-width: 720px)').matches;
    const end = (e: PointerEvent, cancel = false) => {
      if (y0 < 0) return;
      const dy = e.clientY - y0;
      y0 = -1;
      this.el.style.transition = '';
      if (cancel) return;
      if (!moved) { if (dy > 60) this.close(); return; }
      const hNow = this.el.getBoundingClientRect().height;
      if (hNow < window.innerHeight * 0.24) { this.size(null); this.close(); return; }
      if (this.current) { this.heights[this.current] = Math.round((hNow / window.innerHeight) * 1000) / 1000; try { localStorage.setItem(HEIGHTS, JSON.stringify(this.heights)); } catch { /* private window */ } }
      document.dispatchEvent(new CustomEvent('sheet-resized'));
    };
    for (const el of [grip, head]) {
      el.addEventListener('pointerdown', (e) => {
        if (!phone() || (e.target as Element).closest('button')) return;
        y0 = e.clientY; h0 = this.el.getBoundingClientRect().height; moved = false;
        el.setPointerCapture?.(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (y0 < 0) return;
        const dy = e.clientY - y0;
        if (!moved && Math.abs(dy) < 8) return;
        moved = true;
        this.el.style.transition = 'none';
        this.size(`${Math.round(Math.max(90, Math.min(window.innerHeight * 0.92, h0 - dy)))}px`);
      });
      el.addEventListener('pointerup', (e) => end(e));
      el.addEventListener('pointercancel', (e) => end(e, true));
    }
  }

  /** A height the reader gave the sheet (only phones use it: wider screens keep their side panel), or none. */
  private size(height: string | null) {
    this.el.classList.toggle('sized', !!height);
    if (height) this.el.style.setProperty('--sheet-h', height); else this.el.style.removeProperty('--sheet-h');
  }

  /** The heights the reader gave each panel on a phone (shares of the screen's height). */
  private heights: Record<string, number> = (() => { try { return JSON.parse(localStorage.getItem(HEIGHTS) || '{}'); } catch { return {}; } })();

  /** Shows `content` in the sheet; `bar` (a search box...) sits above it, outside the scrolling part. */
  open(id: string, title: string, content: HTMLElement, onClose?: () => void, bar?: HTMLElement) {
    if (this.current && this.current !== id) this.onCloseCb?.();
    this.current = id;
    this.setTitle(title);
    clear(this.body);
    clear(this.bar);
    if (bar) this.bar.append(bar);
    this.bar.hidden = !bar;
    this.body.append(content);
    this.el.hidden = false;
    this.el.dataset.sheet = id;
    // The height the reader last gave this panel, else its own (CSS).
    const hh = this.heights[id];
    this.size(hh ? `${Math.round(hh * 1000) / 10}vh` : null);
    this.body.scrollTop = this.scrolls.get(id) ?? 0;
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.onCloseCb = onClose ?? null;
  }

  isOpen(id?: string) { return !this.el.hidden && (!id || this.current === id); }

  /** The title, after its feature's tile (v0.40.0; a panel of no feature has none). */
  setTitle(title: string) {
    const f = this.current ? featureOfSheet(this.current) : null;
    this.titleEl.replaceChildren(...(f ? [ftile(f, 'lg')] : []), h('span', { class: 'sheet-title-text' }, title));
  }

  close() {
    if (this.el.hidden) return;
    this.el.classList.remove('open');
    this.el.hidden = true;
    const cb = this.onCloseCb;
    this.onCloseCb = null;
    this.current = null;
    cb?.();
    document.dispatchEvent(new CustomEvent('sheet-closed'));
  }
}
