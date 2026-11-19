// The map-style panel, opened from the zoom controls: Atlas, Map or Satellite under every filter, and the states and
// provinces with their names (engine/style.ts).
import { h, toggle } from './dom';
import { mapView, MAP_STYLES, type MapStyle } from '../engine/style';
import type { App } from '../app/app';
import { L, tx } from '../app/i18n';

const NAMES: Record<MapStyle, { en: string; es: string; sub: { en: string; es: string } }> = {
  atlas: { en: 'Atlas', es: 'Atlas', sub: { en: 'A colour per country', es: 'Un color por país' } },
  map: { en: 'Map', es: 'Mapa', sub: { en: 'Simple, with cities', es: 'Sencillo, con ciudades' } },
  satellite: { en: 'Satellite', es: 'Satélite', sub: { en: 'From space', es: 'Desde el espacio' } },
};

export class MapStyleMenu {
  readonly el: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(private app: App, root: HTMLElement) {
    this.el = h('div', { class: 'mapstyle glass', hidden: true, role: 'dialog', 'aria-label': 'Map style' });
    root.append(this.el);
    document.addEventListener('pointerdown', (e) => {
      if (this.el.hidden) return;
      const t = e.target as Node;
      if (!this.el.contains(t) && !this.anchor?.contains(t)) this.close();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.el.hidden) this.close(); });
    app.on('interact', () => this.close());
    app.on('lang', () => { if (!this.el.hidden) this.render(); });
    app.on('mapview', () => { if (!this.el.hidden) this.render(); });
  }

  get isOpen() { return !this.el.hidden; }

  toggle(anchor: HTMLElement) {
    if (this.isOpen) { this.close(); return; }
    this.anchor = anchor;
    this.render();
    this.el.hidden = false;
    this.place();
    anchor.setAttribute('aria-expanded', 'true');
  }

  close() {
    this.el.hidden = true;
    this.anchor?.setAttribute('aria-expanded', 'false');
  }

  /** Beside the zoom controls (to their left), level with the button, inside the screen. */
  private place() {
    const a = this.anchor?.closest('.zoombar')?.getBoundingClientRect() ?? this.anchor?.getBoundingClientRect();
    const b = this.anchor?.getBoundingClientRect();
    if (!a || !b) return;
    const w = this.el.offsetWidth, ht = this.el.offsetHeight;
    const left = Math.max(8, a.left - w - 10);
    const top = Math.max(8, Math.min(innerHeight - ht - 8, b.top + b.height / 2 - ht / 2));
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  }

  private render() {
    const tiles = h('div', { class: 'ms-tiles', role: 'radiogroup', 'aria-label': L('Map style', 'Estilo del mapa') },
      MAP_STYLES.map((st) => {
        const on = mapView.style === st;
        const b = h('button', { type: 'button', class: `ms-tile${on ? ' on' : ''}`, role: 'radio', 'aria-checked': String(on), 'data-style': st },
          h('span', { class: `ms-swatch ms-${st}`, 'aria-hidden': 'true' }),
          h('span', { class: 'ms-name' }, tx(NAMES[st])),
          h('span', { class: 'ms-sub' }, tx(NAMES[st].sub)));
        b.addEventListener('click', () => this.app.setMapView({ style: st }));
        return b;
      }));
    const names = toggle(mapView.regionNames, (v) => this.app.setMapView({ regionNames: v }), L('Their names', 'Sus nombres'));
    names.classList.add('ms-sub-toggle');
    (names.querySelector('input') as HTMLInputElement).disabled = !mapView.regions;
    names.dataset.ms = 'names';
    const states = toggle(mapView.regions, (v) => this.app.setMapView({ regions: v }), L('States and provinces', 'Estados y provincias'));
    states.dataset.ms = 'regions';
    this.el.replaceChildren(
      h('div', { class: 'ms-title' }, L('Map style', 'Estilo del mapa')),
      tiles,
      h('div', { class: 'toggles ms-toggles' }, states, names),
      h('p', { class: 'muted small ms-note' }, mapView.style === 'atlas'
        ? L('Under every filter. States show when you zoom in to a country.', 'Debajo de cada filtro. Los estados aparecen al acercarte a un país.')
        : mapView.style === 'map'
          ? L('Under every filter: countries in one colour, and more cities, bigger the more people live there.', 'Debajo de cada filtro: los países en un solo color, y más ciudades, más grandes cuanta más gente vive en ellas.')
          : L('Under every filter: NASA’s Blue Marble, and Sentinel-2 when you zoom in.', 'Debajo de cada filtro: la Blue Marble de la NASA, y Sentinel-2 al acercarte.')),
    );
    if (!this.el.hidden) this.place();
  }
}
