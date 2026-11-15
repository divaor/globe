// The map's look under every filter, chosen in the zoom controls: Atlas (every country its own colour, the
// Political map filter), Map (a plain road-map look without the roads: one land colour, a light sea, clear borders
// and more cities, sized by how many people live there) or Satellite (NASA's Blue Marble, Sentinel-2 when zoomed
// in). States and provinces, and their names, can be shown in any of them.
import type { Theme } from '../app/theme';

export type MapStyle = 'atlas' | 'map' | 'satellite';

export const mapView: { style: MapStyle; regions: boolean; regionNames: boolean } = {
  style: 'atlas', regions: true, regionNames: true,
};

export const MAP_STYLES: MapStyle[] = ['atlas', 'map', 'satellite'];

/** The Map style's colours: a light road map without the roads, whatever the app's theme (the panels keep it). */
const MAP: Partial<Theme> = {
  dark: false,
  ocean: ['#b6dcf6', '#aad3f1', '#9ecae9'],
  land: '#f2f0e9',
  border: 'rgba(96,100,110,0.8)',
  borderWidth: 0.8,
  coast: 'rgba(110,160,205,0.75)',
  graticule: 'rgba(40,80,130,0.07)',
  lake: '#aad3f1',
  river: 'rgba(110,165,220,0.9)',
  ice: '#ffffff',
  label: '#33383f',
  labelHalo: 'rgba(255,255,255,0.92)',
  labelMuted: '#5f6368',
  sea: 'rgba(40,95,155,0.72)',
  city: '#33383f',
  capital: '#c5221f',
  region: 'rgba(110,114,124,0.7)',
  regionLabel: '#7b8087',
  selection: '#e8590c',
  shade: 0.1,
};

/** Over a satellite picture: white lines and names with a dark halo, whatever the app's theme. */
const SATELLITE: Partial<Theme> = {
  dark: true,
  border: 'rgba(255,255,255,0.78)',
  coast: 'rgba(255,255,255,0.22)',
  label: '#ffffff',
  labelHalo: 'rgba(0,0,0,0.72)',
  labelMuted: '#e8eef6',
  sea: 'rgba(205,228,255,0.78)',
  city: '#ffffff',
  capital: '#ff5a5f',
  region: 'rgba(255,255,255,0.5)',
  regionLabel: 'rgba(255,255,255,0.88)',
};

/** The theme the map is drawn with: the app's theme in the chosen style. */
export function styledTheme(base: Theme, style: MapStyle): Theme {
  if (style === 'map') return { ...base, ...MAP };
  if (style === 'satellite') return { ...base, ...SATELLITE };
  return base;
}
