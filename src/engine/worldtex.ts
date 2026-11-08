// The map's vector content (land, filter colours, legend highlight, lakes, borders and coasts)
// painted once into a plate carrée (equirectangular) canvas. Uploaded as a WebGL texture, the GPU
// can then reproject it at any projection every frame, which is far cheaper than projecting and
// filling thousands of polygons on the CPU. The renderer uses it while the map moves and goes back
// to sharp vectors as soon as it stops. With data grids (rainfall, imagery...) in the stack it is
// painted in two parts, one under the grids (land) and one over them (lakes, borders...).
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { BaseLevel, Shape } from '../data/store';
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
}

/** Paints the world into `canvas` (2:1, e.g. 4096×2048). */
export function paintWorld(canvas: HTMLCanvasElement, o: WorldPaint) {
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.3);
  const path = geoPath(proj, ctx);
  const fill = (shapes: Shape[], style: string) => {
    ctx.beginPath();
    for (const s of shapes) path(s.feature as never);
    ctx.fillStyle = style;
    ctx.fill();
  };
  const th = o.theme;
  const countries = o.level.countries;
  if (o.landBase) fill(countries, th.land);
  // A view-independent context for filters that draw their own fills (layer.bakeable).
  const flat: RenderCtx = {
    ...o.rc, ctx, path, lod: o.level.lod, level: o.level, moving: false, webZoom: 3,
    visibleShapes: (shapes) => shapes, visibleLines: (lines) => lines,
    project: (lon, lat) => proj([lon, lat]) as [number, number] | null,
    fillCountry: (id, color) => { const s = o.level.byId.get(id); if (!s) return; ctx.beginPath(); path(s.feature as never); ctx.fillStyle = color; ctx.fill(); },
    fillCountries: (ids, color) => { ctx.beginPath(); for (const id of ids) { const s = o.level.byId.get(id); if (s) path(s.feature as never); } ctx.fillStyle = color; ctx.fill(); },
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
  if (!o.top) return;
  if (o.highlight && o.highlight.size) fill(countries.filter((s) => !o.highlight!.has(s.id)), th.dark ? 'rgba(4,10,24,0.62)' : 'rgba(255,255,255,0.65)');
  if (o.lakes.length) {
    ctx.beginPath();
    for (const s of o.lakes) path(s.feature as never);
    if (o.lakeFill) { ctx.fillStyle = o.lakeFill; ctx.fill(); }
    ctx.lineWidth = 0.8; ctx.strokeStyle = th.coast; ctx.stroke();
  }
  const lw = Math.max(1, W / 3600);
  ctx.beginPath();
  for (const l of o.level.coast) path(l.geometry);
  ctx.strokeStyle = th.coast; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath();
  for (const l of o.level.borders) path(l.geometry);
  ctx.strokeStyle = th.border; ctx.lineWidth = lw * 1.1; ctx.stroke();
}
