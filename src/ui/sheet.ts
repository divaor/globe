// A panel that is a bottom sheet on phones and a floating side panel on wider screens.
import { X } from 'lucide';
import { h, button, clear } from './dom';
import { t } from '../app/i18n';

export class Sheet {
  readonly el: HTMLElement;
  private body: HTMLElement;
  /** Stays put under the header while the body scrolls (the filters' search box). */
  private bar: HTMLElement;
  private titleEl: HTMLElement;
  private onCloseCb: (() => void) | null = null;
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
    // Swipe down on the grip/header closes the sheet on phones.
    let y0 = -1;
    const head = this.el.querySelector('.sheet-head') as HTMLElement;
    for (const el of [grip, head]) {
      el.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
      el.addEventListener('pointerup', (e) => { if (y0 >= 0 && e.clientY - y0 > 60) this.close(); y0 = -1; });
    }
  }

  /** Shows `content` in the sheet; `bar` (a search box...) sits above it, outside the scrolling part. */
  open(id: string, title: string, content: HTMLElement, onClose?: () => void, bar?: HTMLElement) {
    if (this.current && this.current !== id) this.onCloseCb?.();
    this.current = id;
    this.titleEl.textContent = title;
    clear(this.body);
    clear(this.bar);
    if (bar) this.bar.append(bar);
    this.bar.hidden = !bar;
    this.body.append(content);
    this.el.hidden = false;
    this.el.dataset.sheet = id;
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.onCloseCb = onClose ?? null;
  }

  isOpen(id?: string) { return !this.el.hidden && (!id || this.current === id); }

  setTitle(title: string) { this.titleEl.textContent = title; }

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
