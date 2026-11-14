// What the detail filters' legends can open (set by the terrain UI at start-up, see ui/terrain.ts), and, on another
// world, what the 3D view shows there (set by space/space.ts).
import type { TileSource } from '../engine/tiles';

/** The 3D view on another world: its size, heights, drapes, names and sky. */
export interface Terrain3DContext {
  /** Radius in km. */
  R: number;
  heights: TileSource;
  /** Pictures to lay over the landscape (Trek tiles), or colours from the heights (`palette`). */
  drapes: { id: string; label: string; src?: TileSource; palette?: [number, string][] }[];
  drape: string;
  /** The biggest named places in a box [w, s, e, n]. */
  labels: (box: [number, number, number, number]) => { name: string; lon: number; lat: number }[];
  areaName: (box: [number, number, number, number]) => { en: string; es: string };
  /** How much to raise the land compared with the Earth (Mars's volcanoes and canyons are huge already). */
  kScale?: number;
  /** Fog and sky colours (0..1). */
  sky: [number, number, number];
  skyCss: string;
}

export const terrainActions = {
  view3d: () => {},
  save: () => {},
  settings: () => {},
  /** Another world's 3D view, or null on the Earth. */
  context: (): Terrain3DContext | null => null,
};
