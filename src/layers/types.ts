// The filter ("layer") plug-in interface. A filter is one object implementing some of these
// hooks; register it in layers/index.ts and it shows up in the Filters panel. Country-colouring
// filters usually only need `countryColor`, `legend` and `info` (see layers/choropleth.ts).
import type { GeoPath } from 'd3-geo';
import type { View } from '../engine/view';
import type { GLRaster, RasterDraw } from '../engine/gl';
import type { LabelEngine } from '../engine/labels';
import type { BaseLevel, BBox, DataStore, LOD, Line } from '../data/store';
import type { Theme } from '../app/theme';
import type { Lang } from '../app/i18n';

export type CategoryId =
  | 'political' | 'people' | 'nature' | 'climate' | 'earth' | 'economy' | 'culture' | 'flora' | 'fauna'
  | 'imagery' | 'live' | 'fun';

export interface I18nText { en: string; es: string }

export type LayerKind = 'raster' | 'fill' | 'overlay';

export interface LegendItem {
  color: string;
  label: string;
  icon?: string;
  shape?: 'square' | 'line' | 'dot' | 'dash' | 'emoji' | 'hatch';
  /** Country ids this item covers (for highlight on hover). */
  ids?: string[];
  /** How many countries it counts, when `ids` also holds territories drawn as their own shapes. */
  count?: number;
}

/** A button under a legend (open a chart, swap two filters...). */
export interface LegendAction { label: string; icon?: string; onClick: () => void; primary?: boolean }

interface LegendBase { title?: string; note?: string; actions?: LegendAction[] }

export type Legend = LegendBase & (
  | { kind: 'categories'; items: LegendItem[] }
  | { kind: 'gradient'; stops: string[]; min: string; max: string; mid?: string }
  | { kind: 'html'; html: string }
  /**
   * Two filters at once: a 3 × 3 grid, filter A across (low to high) and filter B up. `cells[a + 3 * b]`
   * is the square for A's third `a` and B's third `b` (0 low, 1 middle, 2 high); `count` shows inside it.
   */
  | { kind: 'bivariate'; cells: LegendItem[]; x: string; y: string });

export interface InfoRow { label: string; value: string; icon?: string }

export type LayerOptionDef =
  | { id: string; label: I18nText; type: 'select'; choices: { value: string; label: I18nText; icon?: string; group?: I18nText }[]; default: string }
  | { id: string; label: I18nText; type: 'toggle'; default: boolean };

export interface LayerContext {
  data: DataStore;
  gl: GLRaster | null;
  lang: () => Lang;
  requestRender: () => void;
  /** Tell the UI that a filter's data changed (legend, card). */
  notify?: () => void;
}

export interface RenderCtx {
  ctx: CanvasRenderingContext2D;
  path: GeoPath;
  view: View;
  theme: Theme;
  lang: Lang;
  now: number;
  lod: LOD;
  level: BaseLevel;
  moving: boolean;
  labels: LabelEngine;
  dpr: number;
  webZoom: number;
  center: [number, number];
  radius: number;
  visibleShapes<T extends { bbox: BBox }>(shapes: T[]): T[];
  visibleLines(lines: Line[]): Line[];
  /** Screen position of a point, or null when on the hidden side. */
  project(lon: number, lat: number): [number, number] | null;
  /** Fills a country (current LOD) with a colour. */
  fillCountry(id: string, color: string): void;
  /** Fills several countries (current LOD) with one colour in one go; their outlines are projected once per frame. */
  fillCountries(ids: Iterable<string>, color: string): void;
}

/** What a filter gets when the reader taps the map (see LayerDef.tap). */
export interface LayerTapUi {
  /** Opens a card, as ui/card.ts showCustom does: icon, title, subtitle, rows, links, paragraphs, picture, extra. */
  card(icon: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>, extra?: HTMLElement | null): void;
  /** Screen position of a point, or null when it is hidden; `x`, `y` is where the reader tapped. */
  project(lon: number, lat: number): [number, number] | null;
  x: number;
  y: number;
}

export interface LayerInstance {
  def: LayerDef;
  opacity: number;
  options: Record<string, string | boolean>;
  ready: boolean;
  error?: string;
  // Per-instance runtime state for the layer's own use.
  state: Record<string, unknown>;
}

export interface LayerDef {
  id: string;
  category: CategoryId;
  icon: string;
  name: I18nText;
  desc: I18nText;
  kind: LayerKind;
  defaultOpacity?: number;
  options?: LayerOptionDef[];
  credit?: string;
  /** Needs a new frame every animation tick (winds, live clocks...). */
  animated?: boolean | ((inst: LayerInstance) => boolean);
  /** Higher values stay above lower ones in the filter stack when turned on (default 0). */
  stackOrder?: number;
  /** Filters in the same group replace each other when turned on (e.g. imagery bases). */
  group?: string;
  /** Internal layers used by modes (not listed in the Filters panel, not saved). */
  hidden?: boolean;
  /** Paints every country opaquely, so the plain land underneath need not be drawn. */
  coversLand?: boolean;
  /** drawFill only uses rc.ctx / rc.path / rc.visibleShapes (no view-dependent logic), so it can be
   *  painted into the GPU world texture. */
  bakeable?: boolean;
  /** Keywords for search in the Filters panel. */
  keywords?: string;
  /** The country-facts field this filter shows: its legend offers "Compare with…". */
  compareKey?: string;
  /** Listed first in the Filters panel, in a section of its own. */
  featured?: boolean;
  load?(ctx: LayerContext, inst: LayerInstance): Promise<void>;
  raster?(rc: RenderCtx, inst: LayerInstance): RasterDraw[] | null;
  countryColor?(id: string, inst: LayerInstance, rc: RenderCtx): string | null | undefined;
  drawFill?(rc: RenderCtx, inst: LayerInstance): void;
  drawOverlay?(rc: RenderCtx, inst: LayerInstance): void;
  /** Animated effects drawn every frame on their own canvas (winds, pulses); the map underneath is not redrawn. */
  drawFx?(rc: RenderCtx, inst: LayerInstance, dt: number): void;
  labels?(rc: RenderCtx, inst: LayerInstance): void;
  legend?(inst: LayerInstance, lang: Lang): Legend | null;
  /** Short value shown under a country's name on the map (the top filter that has one is used). */
  valueLabel?(countryId: string, inst: LayerInstance): string | null;
  info?(countryId: string, inst: LayerInstance, lang: Lang): InfoRow[] | null;
  pick?(lon: number, lat: number, inst: LayerInstance, lang: Lang): InfoRow[] | null;
  /** A tap on something the filter draws (a site, a marker): open its card and return true; else false. */
  tap?(lon: number, lat: number, inst: LayerInstance, ui: LayerTapUi): boolean;
  onOptionsChanged?(inst: LayerInstance): void;
  /** Called when the filter is turned off (stop timers, polling...). */
  onDeactivate?(inst: LayerInstance): void;
}
