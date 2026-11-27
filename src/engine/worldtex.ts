// The map's vector content (land, filter colours, legend highlight, lakes, borders and coasts)
// painted once into a plate carrée (equirectangular) canvas. Uploaded as a WebGL texture, the GPU
// can then reproject it at any projection every frame, which is far cheaper than projecting and
// filling thousands of polygons on the CPU. The renderer uses it while the map moves and goes back
// to sharp vectors as soon as it stops. With data grids (rainfall, imagery...) in the stack it is
// painted in two parts, one under the grids (land) and one over them (lakes, borders...).
// Zoomed in, the whole world at that sharpness would not fit on the GPU: a close-up (v0.55.0) is the same picture of
// the area around the view only, at the screen's own sharpness, with the map's line widths, stripes, and states and
// provinces (see Renderer.closeFit).
import { geoEquirectangular, geoPath } from 'd3-geo';
import { bboxNear, type BaseLevel, type Line, type Shape } from '../data/store';
import type { LayerInstance, RenderCtx } from '../layers/types';
import type { Theme } from '../app/theme';

export interface WorldPaint {
  level: BaseLevel;
  layers: LayerInstance[]; // the fill layers to paint, bottom to top
  rc: RenderCtx; // passed to countryColor (theme, zoom...)
  theme: Theme;
  landBase: boolean; // draw plain land under the filters
  top: boolean; // the legend highlight, lakes, coasts and borders (what goes over data grids)
  lakeFill: string | null; // null: lake shores only (over satellite imagery)
  highlight: Set<string> | null;
  lakes: Shape[];
  /** Only the area around the view, at the screen's sharpness (a close-up); the whole world when absent. */
  area?: CloseArea;
  /** Only these rows of the picture (a close-up is painted in strips, a few at a time, so a touch never waits long). */
  rows?: [number, number];
}

/** The part of the world a close-up holds, and how it is drawn (see Renderer.closeFit). */
export interface CloseArea {
  /** The middle of the view (degrees) and the angular radius around it (radians) that the picture covers. */
  center: [number, number];
  R: number;
  /** The longitude in the picture's middle, the latitudes of its top and bottom edges (degrees). */
  lonC: number; lat1: number;
  /** The map's own pixels per radian (CSS px), and picture pixels per map pixel. */
  pxPerRadian: number; k: number;
  webZoom: number;
  /** The still map's border width (CSS px). */
  borderWidth: number;
  /** States and provinces (solid, as the moving map draws them); null when they are not shown. */
  regions: { lines: Line[]; style: string } | null;
}

/** Paints the world into `canvas` (2:1, e.g. 4096×2048). */
export function paintWorld(canvas: HTMLCanvasElement, o: WorldPaint) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  const [y0, y1] = o.rows ?? [0, H];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, y0, W, y1 - y0);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const a = o.area;
  // A close-up draws in the map's own pixels (k picture pixels each), so widths, stripes and dashes match the map's.
  if (a) ctx.setTransform(a.k, 0, 0, a.k, 0, 0);
  if (o.rows) { const k = a ? a.k : 1; ctx.beginPath(); ctx.rect(0, y0 / k, W / k, (y1 - y0) / k); ctx.clip(); }
  // The latitudes of those rows (with a little room for line widths), for a close-up's strips.
  const deg = a ? 180 / Math.PI / (a.pxPerRadian * a.k) : 0;
  const north = a ? a.lat1 - (y0 - 8) * deg : 90, south = a ? a.lat1 - (y1 + 8) * deg : -90;
  const proj = a
    ? geoEquirectangular().rotate([-a.lonC, 0]).scale(a.pxPerRadian).translate([W / a.k / 2, (a.lat1 * Math.PI / 180) * a.pxPerRadian])
      .clipExtent([[-4, -4], [W / a.k + 4, H / a.k + 4]]).precision(0.3)
    : geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.3);
  const path = geoPath(proj, ctx);
  // A close-up only draws what is near its area.
  const near = <T extends { bbox: Shape['bbox'] }>(xs: T[]): T[] => (a ? xs.filter((x) => x.bbox[3] >= south && x.bbox[1] <= north && bboxNear(x.bbox, a.center, a.R)) : xs);
  const fill = (shapes: Shape[], style: string) => {
    ctx.beginPath();
    for (const s of shapes) path(s.feature as never);
    ctx.fillStyle = style;
    ctx.fill();
  };
  const th = o.theme;
  const countries = near(o.level.countries);
  if (o.landBase) fill(countries, th.land);
  // A view-independent context for filters that draw their own fills (layer.bakeable).
  const flat: RenderCtx = {
    ...o.rc, ctx, path, lod: o.level.lod, level: o.level, moving: false, webZoom: a ? a.webZoom : 3,
    visibleShapes: (shapes) => near(shapes), visibleLines: (lines) => near(lines),
    project: (lon, lat) => proj([lon, lat]) as [number, number] | null,
    fillCountry: (id, color) => { const s = o.level.byId.get(id); if (!s) return; ctx.beginPath(); path(s.feature as never); ctx.fillStyle = color; ctx.fill(); },
    fillCountries: (ids, color) => { ctx.beginPath(); for (const id of ids) { const s = o.level.byId.get(id); if (s) path(s.feature as never); } ctx.fillStyle = color; ctx.fill(); },
    strokeCountry: (id, color, width) => { const s = o.level.byId.get(id); if (!s) return; ctx.beginPath(); path(s.feature as never); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); },
  };
  for (const l of o.layers) {
    if (l.def.drawFill) {
      ctx.save(); ctx.globalAlpha = l.opacity; l.def.drawFill(flat, l); ctx.restore();
      continue;
    }
    if (!l.def.countryColor) continue;
    const groups = new Map<string, Shape[]>();
    for (const s of countries) {
      const c = l.def.countryColor(s.id, l, o.rc);
      if (!c) continue;
      let g = groups.get(c);
      if (!g) groups.set(c, (g = []));
      g.push(s);
    }
    ctx.globalAlpha = l.opacity;
    for (const [color, list] of groups) fill(list, color);
    ctx.globalAlpha = 1;
  }
  if (!o.top) { ctx.restore(); return; }
  if (o.highlight && o.highlight.size) fill(countries.filter((s) => !o.highlight!.has(s.id)), th.dark ? 'rgba(4,10,24,0.62)' : 'rgba(255,255,255,0.65)');
  const lakes = near(o.lakes);
  if (lakes.length) {
    ctx.beginPath();
    for (const s of lakes) path(s.feature as never);
    if (o.lakeFill) { ctx.fillStyle = o.lakeFill; ctx.fill(); }
    ctx.lineWidth = a ? 0.5 : 0.8; ctx.strokeStyle = th.coast; ctx.stroke();
  }
  // The still map's widths in a close-up; in the whole world, a pixel or a little more.
  const lw = a ? a.borderWidth * 0.9 : Math.max(1, W / 3600), bw = a ? a.borderWidth : lw * 1.1;
  ctx.beginPath();
  for (const l of near(o.level.coast)) path(l.geometry);
  ctx.strokeStyle = th.coast; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath();
  for (const l of near(o.level.borders)) path(l.geometry);
  ctx.strokeStyle = th.border; ctx.lineWidth = bw; ctx.stroke();
  // States and provinces, solid as the moving map has always drawn them (Renderer.makeCtx): thin dashes fade away at
  // the moving map's sharpness.
  if (a?.regions) {
    ctx.save();
    ctx.beginPath();
    for (const l of near(a.regions.lines)) path(l.geometry);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = a.regions.style; ctx.lineWidth = Math.max(0.7, a.borderWidth * 0.9); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
