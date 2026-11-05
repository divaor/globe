// Gridded data drawn by WebGL with a colour palette (temperature, rain, population...), plus CPU
// sampling of the same grid for the tap-to-inspect values.
import { dataUrl } from '../data/store';
import { tx, fmtNumber } from '../app/i18n';
import type { CategoryId, I18nText, LayerDef, LayerInstance } from './types';
import type { RasterPalette, RasterTexture } from '../engine/gl';
import { LC } from './context';

export interface GridSample { w: number; h: number; data: Uint8Array }

const samples = new Map<string, Promise<GridSample>>();

/** Loads an 8-bit grid image into memory (red channel) for point queries. */
export function loadGrid(file: string): Promise<GridSample> {
  let p = samples.get(file);
  if (!p) {
    p = (async () => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = dataUrl(`raster/${file}`);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
      const data = new Uint8Array(c.width * c.height);
      for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4];
      return { w: c.width, h: c.height, data };
    })();
    samples.set(file, p);
  }
  return p;
}

export function sampleGrid(g: GridSample, lon: number, lat: number): number {
  const x = Math.min(g.w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * g.w)));
  const y = Math.min(g.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * g.h)));
  return g.data[y * g.w + x];
}

export interface PaletteRasterSpec {
  id: string;
  category: CategoryId;
  icon: string;
  name: I18nText;
  desc: I18nText;
  keywords?: string;
  credit: string;
  file: string;
  /** Colour stops for gray values 0..1 (value 0 is always transparent). */
  stops: [number, string][];
  legendStops: string[];
  min: string; max: string; mid?: string;
  note?: I18nText;
  encoding: { kind: 'linear' | 'log'; min: number; max: number };
  unit: string;
  digits?: number;
  pickLabel: I18nText;
  defaultOpacity?: number;
  /** Only draw on the night side when the live day/night filter is on. */
  nightAware?: boolean;
  stackOrder?: number;
}

export function decode(v: number, e: PaletteRasterSpec['encoding']): number {
  const t = (v - 1) / 254;
  if (e.kind === 'log') return Math.pow(10, Math.log10(e.min) + t * (Math.log10(e.max) - Math.log10(e.min)));
  return e.min + t * (e.max - e.min);
}

export function paletteRaster(s: PaletteRasterSpec): LayerDef {
  return {
    id: s.id, category: s.category, icon: s.icon, name: s.name, desc: s.desc, keywords: s.keywords,
    credit: s.credit, kind: 'raster', defaultOpacity: s.defaultOpacity ?? 0.85, stackOrder: s.stackOrder,
    async load(ctx, inst) {
      if (!ctx.gl) throw new Error('WebGL2 is needed for this filter');
      inst.state.tex = await ctx.gl.load(dataUrl(`raster/${s.file}`));
      inst.state.pal = ctx.gl.palette(s.stops);
      void loadGrid(s.file).then((g) => { inst.state.grid = g; });
    },
    raster(_rc, inst: LayerInstance) {
      const tex = inst.state.tex as RasterTexture | undefined;
      if (!tex) return null;
      const night = s.nightAware && LC.data && isDayNightOn();
      return [{ texture: tex, opacity: inst.opacity, mode: night ? 2 : 1, palette: inst.state.pal as RasterPalette }];
    },
    legend() {
      return { kind: 'gradient', title: tx(s.name), stops: s.legendStops, min: s.min, max: s.max, mid: s.mid, note: s.note ? tx(s.note) : undefined };
    },
    pick(lon, lat, inst) {
      const g = inst.state.grid as GridSample | undefined;
      if (!g) return null;
      const v = sampleGrid(g, lon, lat);
      if (!v) return null;
      const val = decode(v, s.encoding);
      return [{ label: tx(s.pickLabel), value: `${fmtNumber(val, s.digits ?? (Math.abs(val) < 10 ? 1 : 0))} ${s.unit}`, icon: s.icon }];
    },
  };
}

let dayNightProbe: (() => boolean) | null = null;
export function setDayNightProbe(fn: () => boolean) { dayNightProbe = fn; }
export function isDayNightOn(): boolean { return dayNightProbe?.() ?? false; }
