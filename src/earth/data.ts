// Inside the Earth (v0.32.0): the data files of public/data/earth, loaded once when first needed.
import { loadJSON } from '../data/store';

export interface T2 { en: string; es: string }

/** Something real at a depth: a metro station, a cave, a mine, the deepest hole… */
export interface Marker {
  id: string; depth_m: number; below: 'ground' | 'sea'; kind: string;
  name: T2; place: T2; lon: number; lat: number; year?: number; text: T2; src?: string;
}
/** A layer's facts, from the curated file (by the layer's id in model.ts). */
export interface LayerFacts {
  id: string; temp_c: [number, number]; pressure_gpa: [number, number]; density: [number, number];
  state: T2; made: T2; know: T2; fact: T2; src?: string[];
}
export interface Inside {
  layers: LayerFacts[]; markers: Marker[]; moho?: T2; lehmann?: T2;
  fall_through?: { minutes: number; en: string; es: string; src?: string };
}

let inside: Promise<Inside> | null = null;
export const loadInside = () => (inside ??= loadJSON<Inside>('earth/inside.json').catch(() => ({ layers: [], markers: [] })));

/** CRUST1.0: the crust's thickness (km) on a 1° grid. */
let crust: Promise<Uint8Array | null> | null = null;
export const loadCrust = () => (crust ??= loadJSON<{ km: string }>('earth/crust.json').then((j) => Uint8Array.from(atob(j.km), (c) => c.charCodeAt(0))).catch(() => null));
/** How thick the crust is under a point (km): the cell of CRUST1.0's grid it falls in. */
export function crustAt(grid: Uint8Array | null, lon: number, lat: number): number {
  if (!grid) return 35;
  const col = Math.max(0, Math.min(359, Math.floor(((((lon + 180) % 360) + 360) % 360))));
  const row = Math.max(0, Math.min(179, Math.floor(90 - lat)));
  return grid[row * 360 + col] || 35;
}
