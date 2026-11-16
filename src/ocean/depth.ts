// Into the deep (v0.33.0): how deep the sea is anywhere, from NOAA's ETOPO 2022 read at 0.25° (public/data/ocean/
// depth.png: red and green hold a cell's mean height, metres + 11 000; blue how much deeper its deepest point is, in
// 20 m steps, so a narrow trench keeps its depth). The depth zones, which ocean a point is in, and what the light,
// the cold and the pressure are like on the way down.
import { dataUrl } from '../data/store';
import { L } from '../play/host';

export interface Depths { w: number; h: number; mean: Int16Array; deep: Int16Array }
let loading: Promise<Depths> | null = null;
export let depths: Depths | null = null;

export function loadDepths(): Promise<Depths> {
  return (loading ??= (async () => {
    const r = await fetch(dataUrl('ocean/depth.png'));
    if (!r.ok) throw new Error(`depth.png: ${r.status}`);
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    const n = c.width * c.height, mean = new Int16Array(n), deep = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const m = ((px[i * 4] << 8) | px[i * 4 + 1]) - 11000;
      mean[i] = m; deep[i] = m - px[i * 4 + 2] * 20;
    }
    depths = { w: c.width, h: c.height, mean, deep };
    return depths;
  })());
}

/** The cell under a point: its mean height (m, negative under the sea) and its deepest point. */
export function heightAt(d: Depths, lon: number, lat: number): { mean: number; deep: number } {
  const x = Math.min(d.w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * d.w)));
  const y = Math.min(d.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * d.h)));
  const i = y * d.w + x;
  return { mean: d.mean[i], deep: d.deep[i] };
}

/** The sea floor where a reader taps: the deepest point of the cell when it is in the sea, so a trench reads true. */
export function seaDepthAt(d: Depths, lon: number, lat: number): number {
  const c = heightAt(d, lon, lat);
  return c.mean < 0 ? -c.deep : c.deep < -200 ? -c.deep : 0;
}

export interface Zone { id: string; top: number; bottom: number; color: string; name: () => string }
export const ZONES: Zone[] = [
  { id: 'sunlit', top: 0, bottom: 200, color: '#4dabf7', name: () => L('Sunlit zone', 'Zona iluminada') },
  { id: 'twilight', top: 200, bottom: 1000, color: '#1c7ed6', name: () => L('Twilight zone', 'Zona de penumbra') },
  { id: 'midnight', top: 1000, bottom: 4000, color: '#1b3a8a', name: () => L('Midnight zone', 'Zona de medianoche') },
  { id: 'abyss', top: 4000, bottom: 6000, color: '#2b1d63', name: () => L('Abyss', 'Zona abisal') },
  { id: 'hadal', top: 6000, bottom: 11000, color: '#140b33', name: () => L('Hadal zone (the trenches)', 'Zona hadal (las fosas)') },
];
export const zoneOf = (m: number): Zone => ZONES.find((z) => m < z.bottom) ?? ZONES[ZONES.length - 1];

export type Ocean = 'atlantic' | 'pacific' | 'indian' | 'southern' | 'arctic';
/** Which ocean a point at sea is in, roughly (the Mediterranean and the Caribbean count as the Atlantic). */
export function oceanAt(lon: number, lat: number): Ocean {
  if (lat <= -60) return 'southern';
  if (lat >= 66 && !(lon > -30 && lon < 40 && lat < 72)) return 'arctic';
  if (lon >= 20 && lon < 147 && lat < 30) {
    if (lat < -30) return 'indian';
    if (lon < 100) return 'indian';
    if (lat < -8 && lon < 130) return 'indian';
    return 'pacific';
  }
  if (lon >= 20 && lon < 42 && lat >= 30 && lat < 47) return 'atlantic'; // the Mediterranean and the Black Sea
  const west = lat >= 31 ? -100 : lat >= 17 ? -98 : lat >= 7 ? -84 : -70;
  if (lon > west && lon < 20) return 'atlantic';
  return 'pacific';
}
export const OCEAN_NAMES: Record<Ocean, () => string> = {
  atlantic: () => L('the Atlantic', 'el Atlántico'), pacific: () => L('the Pacific', 'el Pacífico'), indian: () => L('the Indian Ocean', 'el océano Índico'),
  southern: () => L('the Southern Ocean', 'el océano Austral'), arctic: () => L('the Arctic Ocean', 'el océano Ártico'),
};

/** Pressure (atmospheres) at a depth (m) in sea water: one for the air, one more every 10 m. */
export const pressureAtm = (m: number) => 1 + m / 10.06;
/** The share of the surface's sunlight left at a depth, in clear open water (about 1 % by 150 m). */
export const lightAt = (m: number) => Math.exp(-m / 32);
/** A typical temperature (°C) at a depth: warm at the top in the tropics, near freezing in the deep everywhere. */
export function tempAt(m: number, lat: number): number {
  const top = Math.max(-1.8, 28 - 0.42 * Math.abs(lat)), deep = Math.abs(lat) > 60 ? -0.5 : 2;
  return deep + (top - deep) * Math.exp(-m / 350);
}
