// Legend card: the legends of the active filters, top of the stack first. A filter's choices
// (which organisation, resource, month...) can be changed right here, and tapping a category
// highlights its countries on the map.
import { ChevronDown, ChevronUp, X } from 'lucide';
import { h, icon, clear, add } from './dom';
import { t, tx } from '../app/i18n';
import type { App } from '../app/app';
import type { Legend, LayerInstance, LegendItem } from '../layers/types';

export class LegendCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private collapsed: boolean;
  private toggleBtn: HTMLButtonElement;
  /** The highlighted legend item, as "layerId:label". */
  private activeItem: string | null = null;
  /** Shows the highlighted category's full name on the map, with a button to clear it. */
  private banner: HTMLElement;

  constructor(private app: App, root: HTMLElement) {
    this.collapsed = matchMedia('(max-width: 720px)').matches;
    this.body = h('div', { class: 'legend-body' });
    this.toggleBtn = h('button', { type: 'button', class: 'legend-toggle' }) as HTMLButtonElement;
    this.toggleBtn.addEventListener('click', () => { this.collapsed = !this.collapsed; this.render(); });
    this.el = h('aside', { class: 'legend glass' }, this.toggleBtn, this.body);
    this.banner = h('div', { class: 'lg-banner glass', hidden: true, role: 'status' });
    root.append(this.el, this.banner);
    app.on('layers', () => this.render());
    app.on('lang', () => this.render());
    app.on('theme', () => this.render());
    app.on('legend', () => this.render());
    // Time travel replaces today's map, so a highlight from today's filters would make no sense.
    app.on('mode', () => this.clearHighlight());
    this.render();
  }

  render() {
    const layers = [...this.app.layers].reverse().filter((l) => l.ready && l.def.legend);
    this.el.hidden = !layers.length || this.app.ambient.on;
    const legends = layers.map((inst) => ({ inst, lg: inst.def.legend!(inst, this.app.lang) }));
    this.syncHighlight(legends);
    clear(this.toggleBtn);
    const top = layers[0];
    add(this.toggleBtn,
      h('span', { class: 'legend-title' }, top ? `${top.def.icon} ${tx(top.def.name)}` : t('legend')),
      layers.length > 1 ? h('span', { class: 'legend-more' }, `+${layers.length - 1}`) : null,
      icon(this.collapsed ? ChevronUp : ChevronDown, 16));
    clear(this.body);
    this.body.hidden = this.collapsed;
    if (this.collapsed) return;
    for (const { inst, lg } of legends) {
      if (!lg) continue;
      const sec = h('section', { class: 'lg' });
      const name = tx(inst.def.name);
      // With one filter its name is already in the header; repeat it only to tell several apart.
      if (layers.length > 1 || (lg.title && lg.title !== name)) sec.append(h('div', { class: 'lg-title' }, `${inst.def.icon} ${lg.title ?? name}`));
      const pickers = this.optionPickers(inst);
      if (pickers.length) sec.append(h('div', { class: 'lg-opts' }, pickers));
      sec.append(this.renderLegend(lg, inst.def.id, inst));
      if (lg.note) sec.append(h('div', { class: 'lg-note' }, lg.note));
      this.body.append(sec);
    }
  }

  /**
   * Keeps the highlight in step with what the legend shows: when its item is gone (another filter,
   * other options) the highlight goes too; when the item's countries changed, it follows them.
   */
  private syncHighlight(legends: { inst: LayerInstance; lg: Legend | null }[]) {
    if (!this.activeItem) return;
    for (const { inst, lg } of legends) {
      if (lg?.kind !== 'categories') continue;
      const it = lg.items.find((x) => `${inst.def.id}:${x.label}` === this.activeItem);
      if (it?.ids?.length) {
        const cur = this.app.renderer.highlight;
        if (!cur || cur.size !== it.ids.length || it.ids.some((id) => !cur.has(id))) {
          this.app.renderer.highlight = new Set(it.ids);
          this.app.renderer.requestRender();
        }
        this.showBanner(inst, it);
        return;
      }
    }
    this.clearHighlight();
  }

  /** A filter's select options (organisation, resource, month...) as compact pickers. */
  private optionPickers(inst: LayerInstance): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const o of inst.def.options ?? []) {
      if (o.type !== 'select' || o.choices.length < 2) continue;
      const sel = h('select', { class: 'lg-select', 'aria-label': tx(o.label) }) as HTMLSelectElement;
      for (const c of o.choices) sel.append(h('option', { value: c.value }, `${c.icon ? c.icon + ' ' : ''}${tx(c.label)}`));
      sel.value = String(inst.options[o.id] ?? o.default);
      sel.addEventListener('change', () => this.app.setOption(inst.def.id, o.id, sel.value));
      out.push(h('label', { class: 'lg-opt' }, h('span', { class: 'lg-opt-label' }, tx(o.label)), sel));
    }
    return out;
  }

  private showBanner(inst: LayerInstance, it: LegendItem) {
    const n = it.ids?.length ?? 0;
    const es = this.app.lang === 'es';
    const close = h('button', { type: 'button', class: 'lg-banner-x', title: t('close'), 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.clearHighlight());
    clear(this.banner);
    add(this.banner,
      h('span', { class: 'lg-sw', style: { background: it.color, borderColor: it.color } }),
      h('span', { class: 'lg-banner-text' }, h('strong', null, it.label),
        h('span', { class: 'lg-banner-sub' }, `${inst.def.icon} ${tx(inst.def.name)} · ${n} ${es ? (n === 1 ? 'país' : 'países') : n === 1 ? 'country' : 'countries'}`)),
      close);
    this.banner.hidden = this.app.ambient.on;
  }

  private renderLegend(lg: Legend, layerId: string, inst: LayerInstance): HTMLElement {
    if (lg.kind === 'gradient') {
      return h('div', { class: 'lg-grad' },
        h('div', { class: 'lg-bar', style: { background: `linear-gradient(90deg, ${lg.stops.join(',')})` } }),
        h('div', { class: 'lg-ticks' }, h('span', null, lg.min), lg.mid ? h('span', null, lg.mid) : null, h('span', null, lg.max)));
    }
    if (lg.kind === 'html') return h('div', { class: 'lg-html', html: lg.html });
    // Long names get a line each instead of being cut off (sooner on phones, where columns are narrow).
    const limit = matchMedia('(max-width: 720px)').matches ? 12 : 16;
    const oneCol = lg.items.some((it) => it.label.length > limit);
    const list = h('div', { class: `lg-items${oneCol ? ' one-col' : ''}` });
    for (const it of lg.items) {
      const key = `${layerId}:${it.label}`;
      const sw = it.shape === 'emoji' || (it.icon && !it.color)
        ? h('span', { class: 'lg-emoji' }, it.icon ?? '')
        : h('span', { class: `lg-sw ${it.shape ?? 'square'}`, style: { background: it.shape === 'line' ? 'transparent' : it.color, borderColor: it.color } });
      const item = h('button', { type: 'button', class: `lg-item${this.activeItem === key ? ' on' : ''}`, disabled: !it.ids?.length, 'aria-pressed': this.activeItem === key ? 'true' : 'false' }, sw,
        it.icon && it.shape !== 'emoji' ? h('span', { class: 'lg-icon' }, it.icon) : null, h('span', { class: 'lg-label' }, it.label));
      if (it.ids?.length) {
        item.addEventListener('click', () => {
          const on = this.activeItem === key;
          this.activeItem = on ? null : key;
          this.app.renderer.highlight = on ? null : new Set(it.ids);
          this.app.renderer.requestRender();
          list.querySelectorAll('.lg-item').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
          if (!on) { item.classList.add('on'); item.setAttribute('aria-pressed', 'true'); this.showBanner(inst, it); }
          else this.banner.hidden = true;
        });
      }
      list.append(item);
    }
    return list;
  }

  clearHighlight() {
    this.banner.hidden = true;
    if (!this.activeItem && !this.app.renderer.highlight) return;
    this.activeItem = null;
    this.app.renderer.highlight = null;
    this.app.renderer.requestRender();
    this.body.querySelectorAll('.lg-item.on').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
  }
}
