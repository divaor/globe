// Legend card: the legends of the active filters, top of the stack first. Tapping a category
// highlights its countries on the map.
import { ChevronDown, ChevronUp } from 'lucide';
import { h, icon, clear, add } from './dom';
import { t, tx } from '../app/i18n';
import type { App } from '../app/app';
import type { Legend } from '../layers/types';

export class LegendCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private collapsed: boolean;
  private toggleBtn: HTMLButtonElement;
  private activeItem: string | null = null;

  constructor(private app: App, root: HTMLElement) {
    this.collapsed = matchMedia('(max-width: 720px)').matches;
    this.body = h('div', { class: 'legend-body' });
    this.toggleBtn = h('button', { type: 'button', class: 'legend-toggle' }) as HTMLButtonElement;
    this.toggleBtn.addEventListener('click', () => { this.collapsed = !this.collapsed; this.render(); });
    this.el = h('aside', { class: 'legend glass' }, this.toggleBtn, this.body);
    root.append(this.el);
    app.on('layers', () => this.render());
    app.on('lang', () => this.render());
    app.on('theme', () => this.render());
    this.render();
  }

  render() {
    const layers = [...this.app.layers].reverse().filter((l) => l.ready && l.def.legend);
    this.el.hidden = !layers.length || this.app.ambient.on;
    clear(this.toggleBtn);
    const top = layers[0];
    add(this.toggleBtn,
      h('span', { class: 'legend-title' }, top ? `${top.def.icon} ${tx(top.def.name)}` : t('legend')),
      layers.length > 1 ? h('span', { class: 'legend-more' }, `+${layers.length - 1}`) : null,
      icon(this.collapsed ? ChevronUp : ChevronDown, 16));
    clear(this.body);
    this.body.hidden = this.collapsed;
    if (this.collapsed) return;
    for (const inst of layers) {
      const lg = inst.def.legend!(inst, this.app.lang);
      if (!lg) continue;
      const sec = h('section', { class: 'lg' });
      if (layers.length > 1 || lg.title) sec.append(h('div', { class: 'lg-title' }, `${inst.def.icon} ${lg.title ?? tx(inst.def.name)}`));
      sec.append(this.renderLegend(lg, inst.def.id));
      if (lg.note) sec.append(h('div', { class: 'lg-note' }, lg.note));
      this.body.append(sec);
    }
  }

  private renderLegend(lg: Legend, layerId: string): HTMLElement {
    if (lg.kind === 'gradient') {
      return h('div', { class: 'lg-grad' },
        h('div', { class: 'lg-bar', style: { background: `linear-gradient(90deg, ${lg.stops.join(',')})` } }),
        h('div', { class: 'lg-ticks' }, h('span', null, lg.min), lg.mid ? h('span', null, lg.mid) : null, h('span', null, lg.max)));
    }
    if (lg.kind === 'html') return h('div', { class: 'lg-html', html: lg.html });
    const list = h('div', { class: 'lg-items' });
    for (const it of lg.items) {
      const key = `${layerId}:${it.label}`;
      const sw = it.shape === 'emoji' || (it.icon && !it.color)
        ? h('span', { class: 'lg-emoji' }, it.icon ?? '')
        : h('span', { class: `lg-sw ${it.shape ?? 'square'}`, style: { background: it.shape === 'line' ? 'transparent' : it.color, borderColor: it.color } });
      const item = h('button', { type: 'button', class: `lg-item${this.activeItem === key ? ' on' : ''}`, disabled: !it.ids?.length }, sw,
        it.icon && it.shape !== 'emoji' ? h('span', { class: 'lg-icon' }, it.icon) : null, h('span', { class: 'lg-label' }, it.label));
      if (it.ids?.length) {
        item.addEventListener('click', () => {
          const on = this.activeItem === key;
          this.activeItem = on ? null : key;
          this.app.renderer.highlight = on ? null : new Set(it.ids);
          this.app.renderer.requestRender();
          list.querySelectorAll('.lg-item').forEach((x) => x.classList.remove('on'));
          if (!on) item.classList.add('on');
        });
      }
      list.append(item);
    }
    return list;
  }

  clearHighlight() {
    this.activeItem = null;
    this.app.renderer.highlight = null;
  }
}
