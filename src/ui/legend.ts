// Legend card: the legends of the active filters, top of the stack first. A filter's choices
// (which organisation, resource, month...) can be changed right here, and tapping a category
// highlights its countries on the map.
import { ChevronDown, ChevronUp, X } from 'lucide';
import { h, icon, clear, add, fillSelect } from './dom';
import { t, tx, L, Lc } from '../app/i18n';
import type { App } from '../app/app';
import type { Legend, LayerInstance, LegendItem, LegendPlayer } from '../layers/types';

/** A legend's timeline controls (layers/types.ts LegendPlayer), kept from one drawing of the legend to the next. */
interface PlayerUi { el: HTMLElement; play: HTMLButtonElement; seek: HTMLInputElement; now: HTMLElement; speed: HTMLInputElement; pace: HTMLElement; p: LegendPlayer }

export class LegendCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private collapsed: boolean;
  private toggleBtn: HTMLButtonElement;
  /** The highlighted legend item, as "layerId:label". */
  private activeItem: string | null = null;
  /** Shows the highlighted category's full name on the map, with a button to clear it. */
  private banner: HTMLElement;
  /** The timelines' controls, by filter. */
  private players = new Map<string, PlayerUi>();
  /** A timeline's slider is held: the legend waits to be drawn again until it is let go (drawing it would end the drag). */
  private holding = false;
  private dirty = false;
  /** Called when the legend opens or folds (the shell redraws the filter's chip, which carries its ⌃, v0.41.1). */
  onToggle: (() => void) | null = null;
  /** There is a legend to show (a filter with one is on). */
  hasContent = false;

  constructor(private app: App, root: HTMLElement) {
    this.collapsed = matchMedia('(max-width: 720px)').matches;
    this.body = h('div', { class: 'legend-body' });
    this.toggleBtn = h('button', { type: 'button', class: 'legend-toggle' }) as HTMLButtonElement;
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.el = h('aside', { class: 'legend glass' }, this.toggleBtn, this.body);
    this.banner = h('div', { class: 'lg-banner glass', hidden: true, role: 'status' });
    root.append(this.el, this.banner);
    // Its height, for panels that share its side of the screen (the country card beside Compare's).
    new ResizeObserver(() => document.documentElement.style.setProperty('--legend-h', `${this.el.offsetHeight}px`)).observe(this.el);
    app.on('layers', () => this.render());
    app.on('lang', () => this.render());
    app.on('theme', () => this.render());
    app.on('legend', () => this.render());
    // Time travel replaces today's map, so a highlight from today's filters would make no sense.
    app.on('mode', () => this.clearHighlight());
    const release = () => { if (!this.holding) return; this.holding = false; if (this.dirty) { this.dirty = false; this.render(); } };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    this.render();
  }

  /** Open or fold the legend (its header, or the ⌃ on its filter's chip). */
  toggle(open = this.collapsed) {
    this.collapsed = !open;
    this.render();
    this.onToggle?.();
  }

  get open() { return !this.collapsed; }

  render() {
    if (this.holding) { this.dirty = true; return; }
    const focused = document.activeElement;
    const layers = [...this.app.layers].reverse().filter((l) => l.ready && l.def.legend);
    this.el.hidden = !layers.length || this.app.ambient.on;
    this.hasContent = layers.length > 0;
    // Folded, the legend is its filter's chip (one bar above the map, v0.41.1); its own header shows where the chips
    // are hidden (time travel, a quiz, the compact strip on a phone).
    this.el.classList.toggle('collapsed', this.collapsed);
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
      if (lg.player) sec.append(this.player(inst.def.id, lg.player));
      if (lg.note) sec.append(h('div', { class: 'lg-note' }, lg.note));
      const acts = [...(lg.actions ?? [])];
      // A country-facts filter can be compared with another one (Compare two filters).
      if (inst.def.compareKey && this.app.registry.has('compare') && !this.app.mode) {
        acts.push({ icon: '⇄', label: L('Compare with…', 'Comparar con…'), onClick: () => this.app.emit('compare', inst.def.compareKey) });
      }
      if (acts.length) {
        sec.append(h('div', { class: 'lg-actions' }, acts.map((a) => {
          const b = h('button', { type: 'button', class: `pill sm lg-act${a.primary ? ' primary' : ''}` }, a.icon ? h('span', { class: 'lg-act-icon', 'aria-hidden': 'true' }, a.icon) : null, a.label);
          b.addEventListener('click', a.onClick);
          return b;
        })));
      }
      this.body.append(sec);
    }
    for (const id of [...this.players.keys()]) if (!legends.some(({ inst, lg }) => inst.def.id === id && lg?.player)) this.players.delete(id);
    // A timeline's button or slider keeps the keyboard's focus as the legend is drawn again.
    if (focused instanceof HTMLElement && focused !== document.activeElement && this.body.contains(focused)) focused.focus({ preventScroll: true });
  }

  /** A timeline: play and pause, the slider through the years and the one for its speed (the same elements each time). */
  private player(id: string, p: LegendPlayer): HTMLElement {
    const es = this.app.lang === 'es';
    let ui = this.players.get(id);
    if (!ui) {
      const play = h('button', { type: 'button', class: 'lg-play' }) as HTMLButtonElement;
      const seek = h('input', { type: 'range', class: 'slider lg-seek', step: '1' }) as HTMLInputElement;
      const now = h('span', { class: 'lg-play-now' });
      const speed = h('input', { type: 'range', class: 'slider lg-speed', min: '0', step: '1' }) as HTMLInputElement;
      const pace = h('span', { class: 'lg-pace' });
      const el = h('div', { class: 'lg-player' },
        h('div', { class: 'lg-play-row' }, play, seek, now),
        h('div', { class: 'lg-play-row lg-speed-row' }, h('span', { class: 'lg-speed-end', 'aria-hidden': 'true' }, '🐢'), speed, h('span', { class: 'lg-speed-end', 'aria-hidden': 'true' }, '🐇'), pace));
      const u: PlayerUi = { el, play, seek, now, speed, pace, p };
      play.addEventListener('click', () => u.p.onToggle());
      seek.addEventListener('input', () => { const v = Number(seek.value); now.textContent = u.p.label(v); u.p.onSeek(v); });
      speed.addEventListener('input', () => { const v = u.p.speeds[Number(speed.value)] ?? u.p.speed; pace.textContent = u.p.speedLabel(v); u.p.onSpeed(v); });
      for (const s of [seek, speed]) s.addEventListener('pointerdown', () => { this.holding = true; });
      this.players.set(id, (ui = u));
    }
    ui.p = p;
    ui.play.textContent = p.playing ? '⏸' : '▶';
    ui.play.title = p.playing ? (L('Pause', 'Pausa')) : (Lc('to play a recording or an animation', 'Play', 'Reproducir'));
    ui.play.setAttribute('aria-label', ui.play.title);
    ui.play.classList.toggle('on', p.playing);
    ui.seek.min = String(p.min); ui.seek.max = String(p.max);
    ui.seek.value = String(Math.round(p.value));
    ui.seek.setAttribute('aria-label', L('Year', 'Año'));
    ui.seek.setAttribute('aria-valuetext', p.label(p.value));
    ui.now.textContent = p.label(p.value);
    let k = 0;
    p.speeds.forEach((v, i) => { if (Math.abs(v - p.speed) < Math.abs(p.speeds[k] - p.speed)) k = i; });
    ui.speed.max = String(p.speeds.length - 1);
    ui.speed.value = String(k);
    ui.speed.setAttribute('aria-label', L('Speed', 'Velocidad'));
    ui.speed.setAttribute('aria-valuetext', p.speedLabel(p.speeds[k]));
    ui.pace.textContent = p.speedLabel(p.speeds[k]);
    return ui.el;
  }

  /**
   * Keeps the highlight in step with what the legend shows: when its item is gone (another filter,
   * other options) the highlight goes too; when the item's countries changed, it follows them.
   */
  private syncHighlight(legends: { inst: LayerInstance; lg: Legend | null }[]) {
    if (!this.activeItem) return;
    for (const { inst, lg } of legends) {
      const items = lg?.kind === 'categories' ? lg.items : lg?.kind === 'bivariate' ? lg.cells : null;
      if (!items) continue;
      const it = items.find((x) => `${inst.def.id}:${x.label}` === this.activeItem);
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
      fillSelect(sel, o.choices.map((c) => ({ value: c.value, label: `${c.icon ? c.icon + ' ' : ''}${tx(c.label)}`, group: c.group ? tx(c.group) : undefined })));
      sel.value = String(inst.options[o.id] ?? o.default);
      sel.addEventListener('change', () => this.app.setOption(inst.def.id, o.id, sel.value));
      out.push(h('label', { class: 'lg-opt' }, h('span', { class: 'lg-opt-label' }, tx(o.label)), sel));
    }
    return out;
  }

  private showBanner(inst: LayerInstance, it: LegendItem) {
    const n = it.count ?? it.ids?.length ?? 0;
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
    if (lg.kind === 'bivariate') return this.renderGrid(lg, layerId, inst);
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
      if (it.ids?.length) item.addEventListener('click', () => this.toggleItem(key, it, inst, item, list));
      list.append(item);
    }
    return list;
  }

  /** Highlights an item's countries (or clears it when it was on), marking it in its legend. */
  private toggleItem(key: string, it: LegendItem, inst: LayerInstance, el: HTMLElement, container: HTMLElement) {
    const on = this.activeItem === key;
    this.activeItem = on ? null : key;
    this.app.renderer.highlight = on ? null : new Set(it.ids);
    this.app.renderer.requestRender();
    container.querySelectorAll('.on[aria-pressed]').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
    if (!on) { el.classList.add('on'); el.setAttribute('aria-pressed', 'true'); this.showBanner(inst, it); }
    else this.banner.hidden = true;
    this.app.emit('highlight');
  }

  /** Two filters at once: a 3 × 3 grid of squares (A across, B up), each tappable, with its count. */
  private renderGrid(lg: Extract<Legend, { kind: 'bivariate' }>, layerId: string, inst: LayerInstance): HTMLElement {
    const grid = h('div', { class: 'lg-bi-grid', role: 'group', 'aria-label': `${lg.x} × ${lg.y}` });
    for (let b = 2; b >= 0; b--) {
      for (let a = 0; a < 3; a++) {
        const it = lg.cells[a + 3 * b];
        if (!it) continue;
        const key = `${layerId}:${it.label}`;
        const on = this.activeItem === key;
        const [r, g, bl] = [1, 3, 5].map((i) => parseInt(it.color.slice(i, i + 2), 16));
        const dark = 0.299 * r + 0.587 * g + 0.114 * bl < 140;
        const cell = h('button', {
          type: 'button', class: `lg-bi-cell${on ? ' on' : ''}${dark ? ' dark' : ''}`, style: { background: it.color },
          title: it.label, 'aria-label': `${it.label}${it.count != null ? ` (${it.count})` : ''}`, 'aria-pressed': on ? 'true' : 'false', disabled: !it.ids?.length,
        }, it.count != null ? h('span', { class: 'lg-bi-n' }, String(it.count)) : null);
        if (it.ids?.length) cell.addEventListener('click', () => this.toggleItem(key, it, inst, cell, grid));
        grid.append(cell);
      }
    }
    return h('div', { class: 'lg-bi' },
      h('div', { class: 'lg-bi-y' }, `↑ ${lg.y}`),
      grid,
      h('div', { class: 'lg-bi-x' }, `→ ${lg.x}`));
  }

  /** Highlights a legend entry's countries, as a tap on it would (the search box). */
  highlightItem(inst: LayerInstance, it: LegendItem) {
    const key = `${inst.def.id}:${it.label}`;
    this.activeItem = key;
    this.app.renderer.highlight = new Set(it.ids);
    this.app.renderer.requestRender();
    this.render();
    this.showBanner(inst, it);
    this.app.emit('highlight');
  }

  clearHighlight() {
    this.banner.hidden = true;
    if (!this.activeItem && !this.app.renderer.highlight) return;
    this.activeItem = null;
    this.app.renderer.highlight = null;
    this.app.renderer.requestRender();
    this.body.querySelectorAll('.on[aria-pressed]').forEach((x) => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
    this.app.emit('highlight');
  }
}
