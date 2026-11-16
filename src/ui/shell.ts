// The app chrome: brand + search (top left), ambient/fullscreen (top right), zoom controls, the
// active-filter chips and the dock (bottom), plus sheets, legend, card, tooltip and toasts.
import { Layers, Layers2, Globe, Map as MapIcon, Ellipsis, Search, Maximize, Minimize, Plus, Minus, LocateFixed, MonitorPlay, Share2, Settings, Info, X, Mountain } from 'lucide';
import { terrainActions } from '../layers/terrainActions';
import { h, icon, button, clear, add } from './dom';
import { t, tx } from '../app/i18n';
import { Sheet } from './sheet';
import { filtersPanel } from './filters';
import { projectionsPanel } from './projections';
import { CountryCard } from './card';
import { clipMini } from './audio';
import { LegendCard } from './legend';
import { SearchBox } from './search';
import { Ambient } from './ambient';
import { screensaverPanel } from './playlists';
import { settingsPanel, aboutPanel } from './settings';
import { MapStyleMenu } from './mapstyle';
import { mapView } from '../engine/style';
import { regionAt, regionType } from '../engine/regions';
import { regionView } from './search';
import { ring } from './ring';
import type { LayerDef, LayerHit, LayerInstance } from '../layers/types';
import type { App } from '../app/app';
import type { IconNode } from 'lucide';

export interface DockItem { id: string; icon: IconNode; label: () => string; onClick: () => void; order: number }
export interface MenuItem { id: string; icon: IconNode; label: () => string; onClick: () => void; order: number }

export class Shell {
  readonly sheet: Sheet;
  readonly card: CountryCard;
  readonly legend: LegendCard;
  readonly search: SearchBox;
  readonly ambient: Ambient;
  readonly mapStyle: MapStyleMenu;
  private dock: HTMLElement;
  private chips: HTMLElement;
  private tooltip: HTMLElement;
  private toastEl: HTMLElement;
  private dockItems: DockItem[] = [];
  private menuItems: MenuItem[] = [];
  private menu: HTMLElement;
  private top: HTMLElement;
  private toastTimer = 0;
  private hoverId: string | null = null;

  constructor(readonly app: App) {
    const root = app.root;
    this.top = h('header', { class: 'topbar' });
    this.chips = h('div', { class: 'chips', role: 'toolbar' });
    this.dock = h('nav', { class: 'dock glass', 'aria-label': 'Main' });
    this.menu = h('div', { class: 'menu glass', hidden: true, role: 'menu' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.toastEl = h('div', { class: 'toast glass', hidden: true, role: 'status' });
    const zoom = h('div', { class: 'zoombar glass' },
      button({ icon: Plus, title: t('zoomIn'), cls: 'icon-btn', onClick: () => app.interaction.animateZoom(1.8) }),
      button({ icon: Minus, title: t('zoomOut'), cls: 'icon-btn', onClick: () => app.interaction.animateZoom(1 / 1.8) }),
      button({ icon: LocateFixed, title: t('resetView'), cls: 'icon-btn', onClick: () => app.resetView() }),
      button({ icon: Mountain, title: app.lang === 'es' ? 'Relieve en 3D' : '3D terrain', cls: 'icon-btn zoom-3d', onClick: () => terrainActions.view3d() }));
    // The map style under every filter (Atlas, Map, Satellite) and the states and provinces.
    const styleBtn = button({ icon: Layers2, title: app.lang === 'es' ? 'Estilo del mapa y estados' : 'Map style and states', cls: 'icon-btn zoom-style', onClick: () => this.mapStyle.toggle(styleBtn) });
    styleBtn.setAttribute('aria-haspopup', 'dialog');
    styleBtn.setAttribute('aria-expanded', 'false');
    zoom.append(styleBtn);
    root.append(this.top, zoom, this.chips, this.dock, this.menu, this.tooltip, this.toastEl);
    this.mapStyle = new MapStyleMenu(app, root);

    this.sheet = new Sheet(root);
    this.legend = new LegendCard(app, root);
    this.card = new CountryCard(app, root);
    this.search = new SearchBox(app);
    root.append(this.search.el);
    this.search.onLayerHit = (def, inst, hit) => void this.goToHit(def, inst, hit);
    this.search.onLegendItem = (inst, it) => {
      this.legend.highlightItem(inst, it);
      this.flyToCountries(it.ids ?? []);
    };
    this.search.onRegion = (r) => {
      const v = regionView(r);
      const flat = app.renderer.view.current.kind === 'flat';
      app.flyTo(v.lon, v.lat, Math.max(2, Math.min(200, 120 / Math.max(0.3, v.span))) * (flat ? 0.6 : 1));
      app.select(app.data.meta[r.country] ? r.country : app.renderer.countryAt(r.lon, r.lat));
      ring(app, { shape: r.shape.feature, ms: 5000 });
    };
    this.ambient = new Ambient(app, root);

    this.addDock({ id: 'filters', icon: Layers, label: () => t('filters'), order: 10, onClick: () => this.openFilters() });
    this.addDock({ id: 'projection', icon: Globe, label: () => t(`proj.${app.projection}`), order: 20, onClick: () => void this.openProjections() });
    this.addDock({ id: 'more', icon: Ellipsis, label: () => t('more'), order: 90, onClick: () => this.toggleMenu() });
    this.addMenu({ id: 'ambient', icon: MonitorPlay, label: () => t('ambient'), order: 10, onClick: () => this.openScreensaver() });
    this.addMenu({ id: 'share', icon: Share2, label: () => t('share'), order: 80, onClick: () => void this.share() });
    this.addMenu({ id: 'settings', icon: Settings, label: () => t('settings'), order: 90, onClick: () => this.openSettings() });
    this.addMenu({ id: 'about', icon: Info, label: () => t('about'), order: 95, onClick: () => this.openAbout() });

    this.renderTop();
    this.renderChips();
    app.on('layers', () => { this.renderChips(); this.renderDock(); });
    app.on('projection', () => this.renderDock());
    app.on('lang', () => { this.renderTop(); this.renderDock(); this.renderChips(); this.reopenSheet(); });
    app.on('ambient', () => this.legend.render());
    app.on('mapview', () => this.legend.render());
    app.on('tap', (x, y) => this.onTap(x as number, y as number));
    app.on('hover', (x, y) => this.onHover(x as number, y as number));
    app.on('interact', () => { this.menu.hidden = true; this.tooltip.hidden = true; });
    document.addEventListener('click', (e) => {
      if (!this.menu.hidden && !this.menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-dock="more"]')) this.menu.hidden = true;
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (app.ambient.on) this.ambient.stop(); else if (this.sheet.isOpen()) this.sheet.close(); else app.select(null); }
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !(e.target as HTMLElement)?.closest('input,textarea')) { e.preventDefault(); this.search.open(); }
    });
    document.addEventListener('fullscreenchange', () => this.renderTop());
  }

  addDock(item: DockItem) { this.dockItems.push(item); this.dockItems.sort((a, b) => a.order - b.order); this.renderDock(); }
  addMenu(item: MenuItem) { this.menuItems.push(item); this.menuItems.sort((a, b) => a.order - b.order); }

  private renderTop() {
    clear(this.top);
    const fs = !!document.fullscreenElement;
    const brand = h('button', { type: 'button', class: 'brand', title: t('about') }, h('span', { class: 'brand-logo', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'Atlas'));
    brand.addEventListener('click', () => this.openAbout());
    const searchBtn = h('button', { type: 'button', class: 'search-btn glass' }, icon(Search, 18), h('span', { class: 'search-btn-label' }, t('search')));
    searchBtn.addEventListener('click', () => this.search.open());
    this.top.append(
      h('div', { class: 'top-left' }, brand, searchBtn),
      // A clip from a card that goes on after its card closed, with its stop button (ui/audio.ts).
      clipMini(),
      h('div', { class: 'top-right glass' },
        button({ icon: MonitorPlay, title: t('ambient'), cls: 'icon-btn', onClick: () => void this.ambient.start() }),
        button({ icon: fs ? Minimize : Maximize, title: t('fullscreen'), cls: 'icon-btn', onClick: () => this.toggleFullscreen() })),
    );
  }

  private renderDock() {
    clear(this.dock);
    const active = this.app.layers.length;
    for (const it of this.dockItems) {
      const ic = it.id === 'projection' ? (this.app.renderer.view.current.kind === 'globe' ? Globe : MapIcon) : it.icon;
      const b = h('button', { type: 'button', class: `dock-btn${this.sheet.current === it.id ? ' on' : ''}`, 'data-dock': it.id },
        icon(ic, 22), h('span', { class: 'dock-label' }, it.label()),
        it.id === 'filters' && active ? h('span', { class: 'dock-badge' }, String(active)) : null);
      b.addEventListener('click', (e) => { e.stopPropagation(); it.onClick(); });
      this.dock.append(b);
    }
  }

  private renderChips() {
    clear(this.chips);
    for (const inst of [...this.app.layers].reverse()) {
      if (inst.def.hidden) continue;
      const chip = h('div', { class: `fchip glass${inst.ready ? '' : ' loading'}${inst.error ? ' error' : ''}` },
        h('button', { type: 'button', class: 'fchip-main', title: tx(inst.def.desc) }, h('span', { class: 'fchip-icon' }, inst.def.icon), h('span', { class: 'fchip-name' }, tx(inst.def.name))),
        h('button', { type: 'button', class: 'fchip-x', 'aria-label': t('remove'), title: t('remove') }, icon(X, 14)));
      chip.querySelector('.fchip-main')!.addEventListener('click', () => this.openFilters());
      chip.querySelector('.fchip-x')!.addEventListener('click', () => this.app.deactivate(inst.def.id));
      this.chips.append(chip);
    }
    const add = h('button', { type: 'button', class: 'fchip add glass' }, icon(Plus, 15), h('span', null, t('addFilter')));
    add.addEventListener('click', () => this.openFilters());
    this.chips.append(add);
  }

  private toggleMenu() {
    if (!this.menu.hidden) { this.menu.hidden = true; return; }
    clear(this.menu);
    for (const it of this.menuItems) {
      const b = h('button', { type: 'button', class: 'menu-item', role: 'menuitem' }, icon(it.icon, 18), h('span', null, it.label()));
      b.addEventListener('click', () => { this.menu.hidden = true; it.onClick(); });
      this.menu.append(b);
    }
    this.menu.hidden = false;
  }

  private reopenSheet() {
    const id = this.sheet.current;
    if (!id) return;
    if (id === 'filters') this.openFilters(true);
    else if (id === 'projection') void this.openProjections(true);
    else if (id === 'settings') this.openSettings(true);
    else if (id === 'about') this.openAbout(true);
  }

  openFilters(force = false) {
    if (!force && this.sheet.isOpen('filters')) { this.sheet.close(); this.renderDock(); return; }
    const panel = filtersPanel(this.app);
    this.sheet.open('filters', t('filters'), panel, () => { panel.dispose(); this.renderDock(); }, panel.bar);
    this.renderDock();
  }

  async openProjections(force = false) {
    if (!force && this.sheet.isOpen('projection')) { this.sheet.close(); this.renderDock(); return; }
    this.sheet.open('projection', t('projections'), await projectionsPanel(this.app), () => this.renderDock());
    this.renderDock();
  }

  openSettings(force = false) {
    if (!force && this.sheet.isOpen('settings')) { this.sheet.close(); return; }
    this.sheet.open('settings', t('settings'), settingsPanel(this.app, () => this.openSettings(true), (m) => this.toast(m, 4000)));
  }

  openAbout(force = false) {
    if (!force && this.sheet.isOpen('about')) { this.sheet.close(); return; }
    this.sheet.open('about', t('about'), aboutPanel(this.app));
  }

  /** Ambient mode's panel: its playlists, the reader's own, and its settings. */
  openScreensaver() {
    const el = screensaverPanel(this.app, (id) => { this.sheet.close(); void this.ambient.start(id); }, (m) => this.toast(m, 2200));
    this.openPanel('screensaver', t('ambient'), el);
  }

  openPanel(id: string, title: string, el: HTMLElement, onClose?: () => void, bar?: HTMLElement) {
    this.sheet.open(id, title, el, () => { onClose?.(); this.renderDock(); }, bar);
    this.renderDock();
  }

  private toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  private async share() {
    const url = this.app.shareUrl();
    try {
      if (navigator.share) { await navigator.share({ title: 'Atlas Globe', url }); return; }
    } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(url); this.toast(t('linkCopied')); } catch { prompt('URL', url); }
  }

  toast(msg: string, ms = 2600) {
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  /**
   * A filter's search result: the filter turned on if it was off, the map flown close to it (its dot apart from its
   * neighbours), its dot ringed wherever the crowd moved it, and its card opened, as a tap on it would.
   */
  private async goToHit(def: LayerDef, on: LayerInstance | null, hit: LayerHit) {
    const app = this.app;
    let inst = on;
    if (!inst) {
      await app.activate(def.id);
      inst = app.instance(def.id) ?? null;
      for (let i = 0; i < 100 && inst && !inst.ready && !inst.error; i++) await new Promise((r) => setTimeout(r, 100));
      if (!inst?.ready) return;
    }
    hit.prepare?.(inst);
    const v = app.renderer.view;
    const flat = v.current.kind === 'flat';
    const zoom = v.zoom * Math.pow(2, (hit.wz ?? 9) - v.webZoom) * (flat ? 0.8 : 1);
    v.flyTo({ lon: hit.lon, lat: hit.lat, zoom: Math.min(v.maxZoom, zoom) });
    app.renderer.requestRender();
    const crowd = () => (inst!.state.crowd as { placed?: { it: unknown; x: number; y: number }[] } | undefined)?.placed;
    ring(app, {
      at: () => {
        if (hit.dot !== undefined) {
          const p = crowd()?.find((x) => x.it === hit.dot || (Array.isArray(x.it) && x.it[0] === hit.dot) || (x.it as { p?: unknown })?.p === hit.dot);
          if (p) return [p.x, p.y];
        }
        return v.project(hit.lon, hit.lat);
      },
    });
    if (hit.open) {
      const p = v.project(hit.lon, hit.lat) ?? [0, 0];
      hit.open({ card: (...a: Parameters<CountryCard['showCustom']>) => { app.select(null); this.card.showCustom(...a); }, project: (lon, lat) => v.project(lon, lat), x: p[0], y: p[1] });
    }
  }

  /** Flies to show a set of countries (a legend entry found by the search). */
  private flyToCountries(ids: string[]) {
    if (ids.length === 1) { this.app.flyToCountry(ids[0], false); return; }
    const level = this.app.data.best('50m');
    let w = 180, s = 90, e = -180, n = -90, x = 0, y = 0, k = 0;
    for (const id of ids) {
      const sh = level.byId.get(id);
      const m = this.app.data.meta[id];
      if (!sh || !m) continue;
      w = Math.min(w, sh.bbox[0]); s = Math.min(s, sh.bbox[1]); e = Math.max(e, sh.bbox[2]); n = Math.max(n, sh.bbox[3]);
      x += m.lx; y += m.ly; k++;
    }
    if (!k) return;
    const span = Math.max(e - w, (n - s) * 1.4);
    this.app.flyTo(x / k, y / k, Math.max(1, Math.min(30, 140 / Math.max(2, span))));
  }

  /** Tools (ruler, true size...) can claim taps; return true to stop the default selection. */
  tapHandlers: ((x: number, y: number, lonlat: [number, number] | null) => boolean)[] = [];

  private onTap(x: number, y: number) {
    this.menu.hidden = true;
    const g = this.app.renderer.view.invert(x, y);
    for (const fn of this.tapHandlers) if (fn(x, y, g)) return;
    this.legend.clearHighlight();
    if (!g) { this.app.select(null); return; }
    // A filter's own markers (World Heritage sites, inventions) open their own card; the top filter first.
    const ui = {
      card: (...a: Parameters<CountryCard['showCustom']>) => { this.app.select(null); this.card.showCustom(...a); },
      project: (lon: number, lat: number) => this.app.renderer.view.project(lon, lat), x, y,
    };
    for (const l of [...this.app.layers].reverse()) {
      if (!l.ready || !l.def.tap) continue;
      if (l.def.tap(g[0], g[1], l, ui)) { if (this.sheet.isOpen() && matchMedia('(max-width: 720px)').matches) this.sheet.close(); return; }
    }
    const id = this.app.renderer.countryAt(g[0], g[1]);
    const picks = this.app.pickAt(g[0], g[1]).map((p) => ({ title: tx(p.def.name), rows: p.rows }));
    // With the states and provinces on, the card says which one was tapped.
    const rg = id && mapView.regions && this.app.renderer.baseMap ? regionAt(g[0], g[1]) : null;
    if (rg) {
      const es = this.app.lang === 'es';
      picks.unshift({ title: es ? 'Estado o provincia' : 'State or province', rows: [{ icon: '📍', label: regionType(rg, es) ?? (es ? 'Región' : 'Region'), value: es ? rg.es : rg.name }] });
    }
    this.card.setPicks(picks);
    if (this.sheet.isOpen() && matchMedia('(max-width: 720px)').matches) this.sheet.close();
    this.app.select(id);
    if (!id && picks.length) {
      // Ocean tap with point info (e.g. a time zone): show it as a toast.
      this.toast(picks.flatMap((p) => p.rows.map((r) => `${r.icon ?? ''} ${r.label}: ${r.value}`)).slice(0, 3).join(' · '), 4000);
    }
  }

  private onHover(x: number, y: number) {
    const r = this.app.renderer;
    // On another world (r.worldStyle) there are no countries to name or outline.
    if (x < 0 || r.moving || r.worldStyle) {
      this.tooltip.hidden = true;
      if (this.hoverId) { this.hoverId = null; r.hover = null; r.requestRender(); }
      return;
    }
    const id = r.pickCountry(x, y);
    if (id !== this.hoverId) { this.hoverId = id; r.hover = id; r.requestRender(); }
    if (!id) { this.tooltip.hidden = true; return; }
    const m = this.app.data.meta[id];
    const top = [...this.app.layers].reverse().find((l) => l.ready && l.def.info && l.def.id !== 'political');
    const extra = top?.def.info?.(id, top, this.app.lang)?.[0];
    clear(this.tooltip);
    // The state or province under the pointer, when they are shown.
    const g = mapView.regions && r.baseMap ? r.view.invert(x, y) : null;
    const rg = g ? regionAt(g[0], g[1]) : null;
    const es = this.app.lang === 'es';
    add(this.tooltip, h('strong', null, es ? m.es : m.n), rg ? h('span', { class: 'tt-sub' }, `📍 ${es ? rg.es : rg.name}`) : null, extra ? h('span', { class: 'tt-sub' }, `${extra.label}: ${extra.value}`) : null);
    this.tooltip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 12)}px)`;
    this.tooltip.hidden = false;
  }
}
