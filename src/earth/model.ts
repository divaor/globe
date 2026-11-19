// Inside the Earth (v0.32.0): the layers, to scale, and how hot, how squeezed and how dense it is at each depth.
// Depths and pressures follow PREM (Dziewonski & Anderson 1981); temperatures are today's usual estimates (the
// deeper, the less certain: the facts in public/data/earth/inside.json give their ranges and sources).
import { es } from '../play/host';
import { fmtNumber, tx } from '../app/i18n';

export const EARTH_KM = 6371;

export interface Layer {
  id: 'crust' | 'upper-mantle' | 'transition-zone' | 'lower-mantle' | 'outer-core' | 'inner-core';
  /** Depth of its top and bottom (km). */
  top: number; bottom: number;
  color: string;
  en: string; es: string;
}

/** Outermost first. The crust is ~35 km under continents and ~7 km under the oceans; 35 here. */
export const LAYERS: Layer[] = [
  { id: 'crust', top: 0, bottom: 35, color: '#a1785c', en: 'Crust', es: 'Corteza' },
  { id: 'upper-mantle', top: 35, bottom: 410, color: '#e8590c', en: 'Upper mantle', es: 'Manto superior' },
  { id: 'transition-zone', top: 410, bottom: 660, color: '#d9480f', en: 'Transition zone', es: 'Zona de transición' },
  { id: 'lower-mantle', top: 660, bottom: 2891, color: '#b8321d', en: 'Lower mantle', es: 'Manto inferior' },
  { id: 'outer-core', top: 2891, bottom: 5150, color: '#f59f00', en: 'Outer core (liquid)', es: 'Núcleo externo (líquido)' },
  { id: 'inner-core', top: 5150, bottom: 6371, color: '#ffd43b', en: 'Inner core (solid)', es: 'Núcleo interno (sólido)' },
];
export const layerName = (l: Layer) => (tx(l));
export const layerAt = (depthKm: number): Layer => LAYERS.find((l) => depthKm < l.bottom) ?? LAYERS[LAYERS.length - 1];

/** Piecewise-linear profile: [depth km, value]. */
const PRESSURE: [number, number][] = [[0, 0], [24.4, 0.6], [80, 2.45], [220, 7.11], [400, 13.35], [670, 23.83], [1000, 38.5], [2000, 88.5], [2891, 135.75], [3500, 190], [4500, 285], [5150, 328.85], [6371, 363.85]];
const DENSITY: [number, number][] = [[0, 2.6], [35, 2.9], [35.01, 3.38], [400, 3.54], [410, 3.72], [660, 3.99], [670, 4.38], [2891, 5.57], [2891.01, 9.9], [5150, 12.17], [5150.01, 12.76], [6371, 13.09]];
const TEMPERATURE: [number, number][] = [[0, 15], [35, 550], [100, 1300], [410, 1500], [660, 1600], [2700, 2500], [2891, 3700], [5150, 5300], [6371, 5500]];
const lerpProfile = (p: [number, number][], d: number) => {
  if (d <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (d <= p[i][0]) { const [d0, v0] = p[i - 1], [d1, v1] = p[i]; return v0 + ((v1 - v0) * (d - d0)) / Math.max(1e-9, d1 - d0); }
  return p[p.length - 1][1];
};
/** Pressure (GPa), density (g/cm³) and temperature (°C) at a depth (km). */
export const pressureAt = (d: number) => lerpProfile(PRESSURE, d);
export const densityAt = (d: number) => lerpProfile(DENSITY, d);
export const temperatureAt = (d: number) => lerpProfile(TEMPERATURE, d);

/** Near the top in atmospheres; deeper in gigapascals with the atmospheres beside (1 GPa is about 9,869 atm). */
export function pressureText(gpa: number): string {
  const atm = gpa * 9869.2;
  if (gpa < 1) return `${fmtNumber(Math.round(atm))} atm`;
  return `${fmtNumber(gpa, gpa < 10 ? 1 : 0)} GPa (${fmtNumber(Math.round(atm / 1000) * 1000)} atm)`;
}
