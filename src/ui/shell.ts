// The app chrome: brand + search (top left), the button for you (top right: settings, sharing, your data, about),
// zoom and locate, the one bar of filters above the map, and the five tabs (bottom: Map, Explore, Today, Learn,
// Play, v0.41.1), plus sheets, legend, card, tooltip and toasts.
import { Layers, Layers2, Globe, Map as MapIcon, Search, Maximize, Minimize, Plus, Minus, LocateFixed, MonitorPlay, Settings, Info, X, Mountain, Telescope, Gamepad2, GraduationCap, Link, ChevronUp, ChevronDown, CircleUserRound, HardDriveDownload, Heart } from 'lucide';
import { terrainActions } from '../layers/terrainActions';
import { FEATURES, ftile, featureOfSheet } from './features';
import { h, icon, button, clear, add } from './dom';
import { t, tx, L, nm } from '../app/i18n';
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
import { donateUrl } from './donate';
import { MapStyleMenu } from './mapstyle';
import { mapView } from '../engine/style';
import { regionAt, regionType, regionName } from '../engine/regions';
import { regionView } from './search';
import { ring } from './ring';
import type { LayerDef, LayerHit, LayerInstance } from '../layers/types';
import type { App } from '../app/app';
import type { IconNode } from 'lucide';
import { closeZoom, zoomOpen } from './zoom';

/** `dot`: a small dot on the button (v0.37.0: Today, while something is left today). */
export interface DockItem { id: string; icon: IconNode; label: () => string; onClick: () => void; order: number; dot?: () => boolean }
/**
 * Where a menu entry lives (v0.41.1): a tab's list (Map, Explore, Learn, Play) or the button for you, top right
 * (settings, sharing, your data, about). `sub`: a second line in small type (the filters on, the projection…).
 */
export type MenuGroup = 'map' | 'explore' | 'learn' | 'play' | 'me';
export interface MenuItem { id: string; icon: IconNode; label: () => string; onClick: () => void; order: number; group: MenuGroup; sub?: () => string }
/** The tabs that open a list (Today, between them, opens its own panel). */
const TABS: { id: MenuGroup; icon: IconNode; label: () => string; order: number }[] = [
  { id: 'map', icon: MapIcon, label: () => L('Map', 'Mapa'), order: 10 },
  { id: 'explore', icon: Telescope, label: () => t('menuExplore'), order: 20 },
  { id: 'learn', icon: GraduationCap, label: () => t('menuLearn'), order: 30 },
  { id: 'play', icon: Gamepad2, label: () => t('menuPlay'), order: 40 },
];
/** A heading inside a list, before the first entry from this order on. */
const SECTIONS: Partial<Record<MenuGroup, { from: number; label: () => string }[]>> = {
  map: [{ from: 20, label: () => t('menuTools') }],
};

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
  /** The list open (a tab's, or the one for you), or null. */
  private menuGroup: MenuGroup | null = null;
  private top: HTMLElement;
  private toastTimer = 0;
  private hoverId: string | null = null;

  constructor(readonly app: App) {
    const root = app.root;
    this.top = h('header', { class: 'topbar' });
    // The map runs under the top bar: its names keep off the brand, the search button and the button for you.
    app.renderer.keepOut.add(() => app.renderer.boxesOf(root.querySelectorAll('.topbar .brand, .topbar .search-btn, .topbar .me-btn, .zoombar')));
    this.chips = h('div', { class: 'chips', role: 'toolbar' });
    this.dock = h('nav', { class: 'dock glass', 'aria-label': L('Main', 'Principal') });
    this.menu = h('div', { class: 'menu glass', hidden: true, role: 'menu' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.toastEl = h('div', { class: 'toast glass', hidden: true, role: 'status' });
    // Zoom and locate only (v0.41.1); the 3D terrain and the map style are in the Map tab.
    const zoom = h('div', { class: 'zoombar glass' },
      button({ icon: Plus, title: t('zoomIn'), cls: 'icon-btn', onClick: () => app.interaction.animateZoom(1.8) }),
      button({ icon: Minus, title: t('zoomOut'), cls: 'icon-btn', onClick: () => app.interaction.animateZoom(1 / 1.8) }),
      button({ icon: LocateFixed, title: t('resetView'), cls: 'icon-btn', onClick: () => app.resetView() }));
    root.append(this.top, zoom, this.chips, this.dock, this.menu, this.tooltip, this.toastEl);
    this.mapStyle = new MapStyleMenu(app, root);

    this.sheet = new Sheet(root);
    this.legend = new LegendCard(app, root);
    this.legend.onToggle = () => this.renderChips();
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

    for (const tab of TABS) this.addDock({ id: tab.id, icon: tab.icon, label: tab.label, order: tab.order, onClick: () => this.openTab(tab.id) });
    // Map: what the map shows and how, then the tools.
    const onFilters = () => this.app.layers.filter((l) => !l.def.hidden).map((l) => tx(l.def.name)).join(' · ');
    this.addMenu({ id: 'filters', icon: Layers, label: () => t('filters'), sub: onFilters, order: 5, group: 'map', onClick: () => this.openFilters() });
    this.addMenu({ id: 'projection', icon: Globe, label: () => t('projections'), sub: () => t(`proj.${app.projection}`), order: 6, group: 'map', onClick: () => void this.openProjections() });
    this.addMenu({ id: 'mapstyle', icon: Layers2, label: () => L('Map style and states', 'Estilo del mapa y estados'), order: 7, group: 'map', onClick: () => this.mapStyle.toggle(this.dockButton('map') ?? this.dock) });
    this.addMenu({ id: 'terrain3d', icon: Mountain, label: () => L('3D terrain', 'Relieve en 3D'), order: 8, group: 'map', onClick: () => terrainActions.view3d() });
    this.addMenu({ id: 'search', icon: Search, label: () => t('search'), order: 9, group: 'map', onClick: () => this.search.open() });
    this.addMenu({ id: 'ambient', icon: MonitorPlay, label: () => t('ambient'), order: 40, group: 'explore', onClick: () => this.openScreensaver() });
    // You: settings, your data, sharing, about.
    this.addMenu({ id: 'settings', icon: Settings, label: () => t('settings'), order: 10, group: 'me', onClick: () => this.openSettings() });
    this.addMenu({ id: 'backup', icon: HardDriveDownload, label: () => L('Your data on another device', 'Tus datos en otro dispositivo'), order: 20, group: 'me', onClick: () => this.openSettings(false, 'backup') });
    this.addMenu({ id: 'share', icon: Link, label: () => t('share'), order: 30, group: 'me', onClick: () => void this.share() });
    // Full screen, where a page can be (a browser, not an installed app).
    if (document.fullscreenEnabled && !matchMedia('(display-mode: standalone)').matches) {
      this.addMenu({ id: 'fullscreen', icon: Maximize, label: () => (document.fullscreenElement ? L('Leave full screen', 'Salir de pantalla completa') : t('fullscreen')), order: 50, group: 'me', onClick: () => this.toggleFullscreen() });
    }
    // Supporting Mundora (v0.48.0): on the website only, once there is a Ko-fi page; it opens About at that part.
    if (donateUrl()) this.addMenu({ id: 'donate', icon: Heart, label: () => L('Support Mundora', 'Apoya a Mundora'), order: 85, group: 'me', onClick: () => this.openAbout(true, 'donate') });
    this.addMenu({ id: 'about', icon: Info, label: () => t('about'), order: 90, group: 'me', onClick: () => this.openAbout() });

    this.renderTop();
    this.renderChips();
    app.on('layers', () => { this.renderChips(); this.renderDock(); });
    app.on('legend', () => this.renderChips());
    app.on('projection', () => this.renderDock());
    app.on('lang', () => { this.renderTop(); this.renderDock(); this.renderChips(); this.reopenSheet(); });
    app.on('ambient', () => this.legend.render());
    app.on('mapview', () => this.legend.render());
    app.on('tap', (x, y) => this.onTap(x as number, y as number));
    app.on('hover', (x, y) => this.onHover(x as number, y as number));
    app.on('interact', () => { this.closeMenu(); this.tooltip.hidden = true; });
    // A country's card opening: the hover label goes, so it never sits over the card's title (v0.40.0).
    app.on('select', () => { this.tooltip.hidden = true; });
    document.addEventListener('click', (e) => {
      // (By the path at the time of the click: opening a group redraws the menu, so its row is gone by now.)
      if (!this.menu.hidden && !e.composedPath().includes(this.menu) && !(e.target as HTMLElement).closest('[data-tab]')) this.closeMenu();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menu.hidden) { this.closeMenu(); return; }
      if (e.key === 'Escape') { if (app.ambient.on) this.ambient.stop(); else if (this.sheet.isOpen()) this.sheet.close(); else app.select(null); }
      if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && !(e.target as HTMLElement)?.closest('input,textarea')) { e.preventDefault(); this.search.open(); }
    });
    addEventListener('resize', () => { if (!this.menu.hidden) this.placeMenu(); });
  }

  /** Android's back button (v0.43.0): what else can close (a game, a quiz, a story), last added first; `open` says
   * whether it is open now (the website's back gesture counts what is open, v0.43.2). */
  private backs: { close: () => boolean; open: () => boolean }[] = [];
  onBack(close: () => boolean, open: () => boolean) { this.backs.push({ close, open }); }
  /**
   * Closes what is on top, as the back button does: a picture full screen, the welcome, the bottom bar's list, the
   * search, ambient mode, a panel, then a game, quiz or story (onBack), then a country's card. False when there was
   * nothing to close.
   */
  back(): boolean {
    if (closeZoom()) return true;
    const welcome = document.querySelector('[data-welcome]');
    if (welcome) { welcome.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; }
    if (!this.menu.hidden) { this.closeMenu(); return true; }
    if (this.search.isOpen) { this.search.close(); return true; }
    if (this.app.ambient.on) { this.ambient.stop(); return true; }
    if (this.sheet.isOpen()) { this.sheet.close(); this.renderDock(); return true; }
    for (const b of [...this.backs].reverse()) if (b.close()) return true;
    if (this.app.selection) { this.app.select(null); return true; }
    return false;
  }
  /** How many things back() would close, one after another. */
  openCount(): number {
    return [zoomOpen(), !!document.querySelector('[data-welcome]'), !this.menu.hidden, this.search.isOpen, this.app.ambient.on, this.sheet.isOpen(),
      ...this.backs.map((b) => b.open()), !!this.app.selection].filter(Boolean).length;
  }

  addDock(item: DockItem) { this.dockItems.push(item); this.dockItems.sort((a, b) => a.order - b.order); this.renderDock(); }
  addMenu(item: MenuItem) { this.menuItems.push(item); this.menuItems.sort((a, b) => a.order - b.order); }

  private renderTop() {
    clear(this.top);
    const brand = h('button', { type: 'button', class: 'brand', title: t('about') }, h('span', { class: 'brand-logo', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'Mundora'));
    brand.addEventListener('click', () => this.openAbout());
    const searchBtn = h('button', { type: 'button', class: 'search-btn glass', 'aria-label': t('search') }, icon(Search, 18), h('span', { class: 'search-btn-label' }, t('search')));
    searchBtn.addEventListener('click', () => this.search.open());
    this.top.append(
      h('div', { class: 'top-left' }, brand, searchBtn),
      // A clip from a card that goes on after its card closed, with its stop button (ui/audio.ts).
      clipMini(),
      this.meButton(),
    );
  }

  /** The button for you, top right: settings, your data, sharing, about. */
  private meButton(): HTMLElement {
    const b = h('button', { type: 'button', class: 'me-btn glass', 'data-tab': 'me', 'aria-haspopup': 'menu', 'aria-expanded': String(this.menuGroup === 'me' && !this.menu.hidden), 'aria-label': L('Settings and more', 'Ajustes y más'), title: L('Settings and more', 'Ajustes y más') }, icon(CircleUserRound, 22));
    b.addEventListener('click', (e) => { e.stopPropagation(); this.openTab('me'); });
    return b;
  }

  private dockButton(id: string): HTMLElement | null { return this.dock.querySelector(`[data-dock="${id}"]`); }

  /** Draws the bottom bar again (a dot that changed). */
  refreshDock() { this.renderDock(); }

  private renderDock() {
    clear(this.dock);
    const active = this.app.layers.filter((l) => !l.def.hidden).length;
    // A tab is lit while its list is open, or one of its panels.
    const panel = this.sheet.current;
    const f = panel ? featureOfSheet(panel) : null;
    const owner = panel === 'today' ? 'today' : panel ? this.menuItems.find((m) => m.id === panel || m.id === f || (f === 'games' && m.id === 'play'))?.group ?? null : null;
    const lit = !this.menu.hidden && this.menuGroup ? this.menuGroup : owner;
    for (const it of this.dockItems) {
      const tab = TABS.some((x) => x.id === it.id);
      const b = h('button', { type: 'button', class: `dock-btn${lit === it.id ? ' on' : ''}`, 'data-dock': it.id, ...(tab ? { 'data-tab': it.id, 'aria-haspopup': 'menu', 'aria-expanded': String(!this.menu.hidden && this.menuGroup === it.id) } : {}) },
        icon(it.icon, 22), h('span', { class: 'dock-label' }, it.label()),
        it.id === 'map' && active > 1 ? h('span', { class: 'dock-badge' }, String(active)) : null,
        it.dot?.() ? h('span', { class: 'dock-dot', 'aria-hidden': 'true' }) : null);
      b.addEventListener('click', (e) => { e.stopPropagation(); it.onClick(); });
      this.dock.append(b);
    }
  }

  /**
   * The one bar above the map (v0.41.1): a chip per filter on, the top one with a legend carrying the legend's ⌃ (its
   * name opens and folds the legend; the others' open the Filters panel), and + Add filters.
   */
  private renderChips() {
    clear(this.chips);
    let lgChip = false;
    for (const inst of [...this.app.layers].reverse()) {
      if (inst.def.hidden) continue;
      const withLegend = !lgChip && inst.ready && !!inst.def.legend && this.legend.hasContent;
      if (withLegend) lgChip = true;
      const open = this.legend.open;
      const main = h('button', { type: 'button', class: 'fchip-main', title: withLegend ? (open ? L('Fold the legend', 'Ocultar la leyenda') : L('Show the legend', 'Mostrar la leyenda')) : tx(inst.def.desc), 'aria-expanded': withLegend ? String(open) : undefined, 'data-legend': withLegend ? '' : undefined },
        h('span', { class: 'fchip-icon' }, inst.def.icon), h('span', { class: 'fchip-name' }, tx(inst.def.name)),
        withLegend ? h('span', { class: 'fchip-lg', 'aria-hidden': 'true' }, icon(open ? ChevronDown : ChevronUp, 15)) : null);
      const chip = h('div', { class: `fchip glass${inst.ready ? '' : ' loading'}${inst.error ? ' error' : ''}${withLegend && open ? ' on' : ''}` },
        main, h('button', { type: 'button', class: 'fchip-x', 'aria-label': t('remove'), title: t('remove') }, icon(X, 14)));
      main.addEventListener('click', () => (withLegend ? this.legend.toggle() : this.openFilters()));
      chip.querySelector('.fchip-x')!.addEventListener('click', () => this.app.deactivate(inst.def.id));
      this.chips.append(chip);
    }
    const add = h('button', { type: 'button', class: 'fchip add glass' }, icon(Plus, 15), h('span', null, t('addFilter')));
    add.addEventListener('click', () => this.openFilters());
    this.chips.append(add);
  }

  /**
   * Whether everything the tabs list has arrived (v0.47.0: the globe shows first, the rest is built behind it). A tab
   * tapped before then opens as soon as it has.
   */
  private ready = false;
  private waiting: MenuGroup | null = null;
  markReady() {
    this.ready = true;
    const g = this.waiting;
    this.waiting = null;
    if (g) this.openTab(g);
  }

  /** A tab's list (or the one for you), opened above its button; the same tab again closes it. */
  openTab(g: MenuGroup) {
    if (!this.ready) { this.waiting = g; this.toast(L('Loading…', 'Cargando…'), 1500); return; }
    if (!this.menu.hidden && this.menuGroup === g) { this.closeMenu(); return; }
    this.mapStyle.close();
    this.menuGroup = g;
    this.renderMenu();
    this.menu.hidden = false;
    this.placeMenu();
    this.renderDock();
    this.renderTop();
    (this.menu.querySelector('.menu-item') as HTMLElement | null)?.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  }

  closeMenu() {
    if (this.menu.hidden) return;
    this.menu.hidden = true;
    this.renderDock();
    this.renderTop();
  }

  /** Kept for the checks written for v0.33.1's More menu: a group is now a tab. */
  openMenuGroup(g: MenuGroup | null) { if (g) this.openTab(g); else this.closeMenu(); }

  /** Above its tab (centred on it, inside the screen), or under the button for you. */
  private placeMenu() {
    const g = this.menuGroup;
    const a = g === 'me' ? this.top.querySelector('[data-tab="me"]') : this.dockButton(g ?? '');
    this.menu.classList.toggle('menu-top', g === 'me');
    if (!a) return;
    const r = a.getBoundingClientRect(), w = this.menu.offsetWidth;
    const left = Math.max(10, Math.min(innerWidth - w - 10, g === 'me' ? r.right - w : r.left + r.width / 2 - w / 2));
    this.menu.style.left = `${Math.round(left)}px`;
    if (g === 'me') { this.menu.style.top = `${Math.round(r.bottom + 8)}px`; this.menu.style.bottom = ''; }
    else { this.menu.style.top = ''; this.menu.style.bottom = `${Math.round(innerHeight - this.dock.getBoundingClientRect().top + 8)}px`; }
  }

  /** The open list's entries, with a heading before each section (the Map tab's tools). */
  private renderMenu() {
    clear(this.menu);
    const g = this.menuGroup;
    this.menu.dataset.tab = g ?? '';
    this.menu.setAttribute('aria-label', g === 'me' ? L('Settings and more', 'Ajustes y más') : TABS.find((x) => x.id === g)?.label() ?? '');
    const secs = [...(SECTIONS[g!] ?? [])];
    for (const it of this.menuItems.filter((m) => m.group === g)) {
      while (secs.length && it.order >= secs[0].from) this.menu.append(h('div', { class: 'menu-sep', role: 'presentation' }, secs.shift()!.label()));
      const sub = it.sub?.();
      const b = h('button', { type: 'button', class: 'menu-item', role: 'menuitem', 'data-menu': it.id }, menuTile(it.id, it.icon),
        h('span', { class: 'menu-text' }, h('span', null, it.label()), sub ? h('small', { class: 'menu-sub' }, sub) : null));
      b.addEventListener('click', () => { this.closeMenu(); it.onClick(); });
      this.menu.append(b);
    }
    this.menu.scrollTop = 0;
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

  /** Settings; `section`: scrolled to one of its parts (backup: your data on another device). */
  openSettings(force = false, section?: string) {
    if (!force && !section && this.sheet.isOpen('settings')) { this.sheet.close(); return; }
    this.sheet.open('settings', t('settings'), settingsPanel(this.app, () => this.openSettings(true), (m) => this.toast(m, 4000)), () => this.renderDock());
    this.renderDock();
    if (section) requestAnimationFrame(() => document.querySelector(`.sheet [data-section="${section}"]`)?.scrollIntoView({ block: 'start' }));
  }

  /** About and credits; `section`: scrolled to one of its parts (donate: supporting Mundora). */
  openAbout(force = false, section?: string) {
    if (!force && this.sheet.isOpen('about')) { this.sheet.close(); return; }
    this.sheet.open('about', t('about'), aboutPanel(this.app), () => this.renderDock());
    this.renderDock();
    if (section) requestAnimationFrame(() => document.querySelector(`.sheet [data-section="${section}"]`)?.scrollIntoView({ block: 'start' }));
  }

  /** Ambient mode's panel: its playlists, the reader's own, and its settings. */
  openScreensaver() {
    const el = screensaverPanel(this.app, (id) => { this.sheet.close(); void this.ambient.start(id); }, (m) => this.toast(m, 2200), this.ambient.tourPanel);
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
      if (navigator.share) { await navigator.share({ title: 'Mundora', url }); return; }
    } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(url); this.toast(t('linkCopied')); } catch { prompt('URL', url); }
  }

  toast(msg: string, ms = 2600) {
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), ms);
  }

  /** Takes a toast away before its time (what it asked for is done). */
  hideToast() { clearTimeout(this.toastTimer); this.toastEl.hidden = true; }

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
    this.closeMenu();
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
      picks.unshift({ title: L('State or province', 'Estado o provincia'), rows: [{ icon: '📍', label: regionType(rg) ?? (L('Region', 'Región')), value: regionName(rg) }] });
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
    // On another world (r.worldStyle) there are no countries to name or outline; during a map game the names
    // under the pointer would give the answers away.
    if (x < 0 || r.moving || r.worldStyle || document.documentElement.classList.contains('has-game')) {
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
    add(this.tooltip, h('strong', null, nm(m.n, m.es)), rg ? h('span', { class: 'tt-sub' }, `📍 ${regionName(rg)}`) : null, extra ? h('span', { class: 'tt-sub' }, `${extra.label}: ${extra.value}`) : null);
    this.tooltip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 12)}px)`;
    this.tooltip.hidden = false;
  }
}

/** A menu row's tile: its feature's (ui/features.ts), else its own icon on a plain tile. */
const MENU_FEATURE: Record<string, string> = { play: 'games', share: 'link', projection: 'projection' };
function menuTile(id: string, ic: Parameters<typeof icon>[0]): HTMLElement {
  const f = MENU_FEATURE[id] ?? id;
  return FEATURES[f] ? ftile(f, 'sm') : h('span', { class: 'ftile ftile-sm hue-me', 'aria-hidden': 'true' }, icon(ic, 16));
}
