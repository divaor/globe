// Draws one frame: space background + ocean (bg canvas), imagery (WebGL canvas), then vector
// filters, base map lines, overlays, globe shading and labels (fg canvas).
import { geoPath, geoGraticule10, type GeoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import { View } from './view';
import { GLRaster, type RasterDraw, type RasterTexture } from './gl';
import { paintWorld } from './worldtex';
import { LabelEngine } from './labels';
import { bboxNear, loadJSON, shapesFrom, type BaseLevel, type DataStore, type LOD, type Line, type Shape } from '../data/store';
import type { LayerInstance, RenderCtx } from '../layers/types';
import { THEMES, type Theme } from '../app/theme';
import type { Lang } from '../app/i18n';
import { sunVector } from '../layers/sun';

export interface RenderSettings {
  labels: { countries: boolean; capitals: boolean; cities: boolean; seas: boolean; values: boolean };
  labelScale: number;
  graticule: boolean;
  rivers: boolean;
  shading: boolean;
  quality: 'auto' | 'high' | 'low';
  /** Draw fewer pixels while the map moves (sharp again when it stops). */
  motionResolution: boolean;
  /** While the map moves, let the GPU draw it from a pre-painted world texture. */
  gpuMotion: boolean;
}

interface Physical { lakes: Shape[]; rivers: Shape<{ sr: number }>[]; glaciers: Shape[]; iceshelves: Shape[] }

/** The two GPU world textures: under the data grids and over them (see Renderer.planWorld). */
type WorldSlot = 'under' | 'over';
/** What one world texture holds, and the key that says when it must be repainted. */
interface WorldPart { land: boolean; layers: LayerInstance[]; top: boolean; lakeFill: string | null; key: string }
type WorldPlan = { under: WorldPart | null; over: WorldPart };
interface Marine { lon: number; lat: number; name: string; es: string | null; kind: string; sr: number }

export type Ticker = (dt: number, now: number) => boolean;
export type Overlay = (rc: RenderCtx) => void;

export class Renderer {
  readonly view = new View();
  readonly labels = new LabelEngine();
  readonly gl: GLRaster | null;
  private bg: CanvasRenderingContext2D;
  private fg: CanvasRenderingContext2D;
  private fx: CanvasRenderingContext2D | null = null;
  private fxCanvas: HTMLCanvasElement | null = null;
  private fullDirty = true;
  private lastRc: RenderCtx | null = null;
  private fxPath: GeoPath | null = null;
  private path: GeoPath;
  private bgPath: GeoPath;
  private stars: HTMLCanvasElement | null = null;
  private graticule = geoGraticule10();
  private raf = 0;
  private lastFrame = 0;
  private physical: Partial<Record<'50m' | '10m', Physical>> = {};
  private physicalLoading = new Set<string>();
  private marine: Marine[] = [];

  theme: Theme = THEMES.dark;
  lang: Lang = 'en';
  layers: LayerInstance[] = [];
  selection: string | null = null;
  hover: string | null = null;
  highlight: Set<string> | null = null;
  /** Draw today's countries (land, borders, labels). Time-travel modes switch it off. */
  baseMap = true;
  moving = false;
  settings: RenderSettings = {
    labels: { countries: true, capitals: true, cities: true, seas: true, values: true },
    labelScale: 1, graticule: true, rivers: false, shading: true, quality: 'auto', motionResolution: true, gpuMotion: true,
  };
  tickers = new Set<Ticker>();
  overlays = new Set<Overlay>();
  /** Called after every frame (UI can sync zoom readouts, etc). */
  onFrame: (() => void) | null = null;
  fps = 60;

  constructor(
    readonly data: DataStore,
    private bgCanvas: HTMLCanvasElement,
    private glCanvas: HTMLCanvasElement,
    private fgCanvas: HTMLCanvasElement,
  ) {
    this.bg = bgCanvas.getContext('2d')!;
    this.fg = fgCanvas.getContext('2d')!;
    this.gl = GLRaster.create(glCanvas);
    glCanvas.style.display = 'none'; // offscreen target, composited into the map canvas
    this.path = geoPath(this.view.projection, this.fg);
    this.fxCanvas = document.getElementById('fx') as HTMLCanvasElement | null;
    this.fx = this.fxCanvas?.getContext('2d') ?? null;
    if (this.fx) this.fxPath = geoPath(this.view.projection, this.fx);
    this.bgPath = geoPath(this.view.projection, this.bg);
    loadJSON<{ rows: unknown[][] }>('layers/marine.json').then((m) => {
      this.marine = m.rows.map((r) => ({ lon: r[0] as number, lat: r[1] as number, name: r[2] as string, es: (r[3] as string) || null, kind: r[4] as string, sr: r[5] as number }));
    }).catch(() => {});
  }

  /** Device pixel ratio when the map is still; while it moves, frames may use fewer pixels. */
  private fullDpr = 1;
  private lowRes = false;
  private lastMotion = 0;
  private restoreTimer = 0;

  resize(w: number, h: number) {
    this.fullDpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === 'low' ? 1 : 2);
    this.applySize(w, h, this.lowRes ? this.motionDpr() : this.fullDpr);
  }

  private applySize(w: number, h: number, dpr: number) {
    for (const c of [this.bgCanvas, this.fgCanvas, ...(this.fxCanvas ? [this.fxCanvas] : [])]) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = `${w}px`; c.style.height = `${h}px`;
    }
    this.glCanvas.style.width = `${w}px`; this.glCanvas.style.height = `${h}px`;
    this.view.resize(w, h, dpr);
    this.stars = null;
    this.requestRender();
  }

  /** Pixel ratio for frames drawn while the map moves (a quarter of the pixels on a 2x screen). */
  private motionDpr() { return Math.min(this.fullDpr, 1); }

  /**
   * While you drag, pinch or fly, frames are drawn at a lower pixel ratio (sharp text is not needed
   * mid-motion and the fill rate drops 4x); the full resolution returns 180 ms after it stops.
   */
  private adaptResolution(now: number) {
    const moving = this.moving || this.view.animating;
    if (moving) this.lastMotion = now;
    const want = this.settings.motionResolution && this.fullDpr > 1.2 && (moving || now - this.lastMotion < 180);
    if (want !== this.lowRes) {
      this.lowRes = want;
      this.applySize(this.view.w, this.view.h, want ? this.motionDpr() : this.fullDpr);
    }
    if (this.lowRes && !moving && !this.restoreTimer) {
      this.restoreTimer = window.setTimeout(() => { this.restoreTimer = 0; this.requestRender(); }, 200);
    }
  }

  requestRender() {
    this.fullDirty = true;
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Schedule a frame that only redraws animated effects (the map stays as it is). */
  requestFx() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private hasFx(): boolean {
    return this.layers.some((l) => l.ready && l.def.drawFx);
  }

  private needsContinuous(): boolean {
    if (this.view.animating) return true;
    for (const l of this.layers) {
      const a = l.def.animated;
      if (l.ready && !l.def.drawFx && (typeof a === 'function' ? a(l) : a)) return true;
    }
    return false;
  }

  private frame(now: number) {
    this.raf = 0;
    this.adaptResolution(now);
    const dt = this.lastFrame ? Math.min(100, now - this.lastFrame) : 16;
    this.lastFrame = now;
    if (dt > 0) this.fps = this.fps * 0.9 + (1000 / dt) * 0.1;
    let busy = false;
    for (const t of this.tickers) if (t(dt, now)) busy = true;
    if (this.view.update(now)) busy = true;
    if (busy || this.fullDirty || !this.lastRc) {
      this.fullDirty = false;
      this.draw(now);
      this.onFrame?.();
    }
    const fx = this.hasFx();
    this.drawFx(now, dt, fx);
    if (busy || this.needsContinuous()) this.requestRender();
    else if (fx) this.requestFx();
    else this.lastFrame = 0;
  }

  private fxWasDrawn = false;
  private drawFx(now: number, dt: number, any: boolean) {
    const ctx = this.fx;
    if (!ctx || !this.fxPath) return;
    const { w, h, dpr } = this.view;
    if (!any) {
      if (this.fxWasDrawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); this.fxWasDrawn = false; }
      return;
    }
    const base = this.lastRc;
    if (!base) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const rc: RenderCtx = { ...base, ctx, path: this.fxPath, now, moving: this.moving || this.view.animating };
    for (const l of this.layers) {
      if (!l.ready || !l.def.drawFx) continue;
      ctx.save(); ctx.globalAlpha = l.opacity;
      l.def.drawFx(rc, l, dt);
      ctx.restore();
    }
    this.fxWasDrawn = true;
  }

  private wantLOD(): LOD {
    const wz = this.view.webZoom;
    const busy = this.moving || this.view.animating || this.tickers.size > 0;
    const q = this.settings.quality;
    if (q === 'low') return wz < 5 ? '110m' : '50m';
    const idle: LOD = wz >= 5.3 ? '10m' : '50m';
    if (!busy) return idle;
    // While the map moves, one level lighter: the full detail comes back as soon as it stops.
    // ("High" keeps the full level when zoomed in close, where the lighter one looks too coarse.)
    if (idle === '10m') return q === 'high' && wz >= 6.5 ? '10m' : '50m';
    return wz >= 3.7 && q === 'high' ? '50m' : '110m';
  }

  private ensurePhysical(lod: '50m' | '10m') {
    if (this.physical[lod] || this.physicalLoading.has(lod)) return;
    this.physicalLoading.add(lod);
    loadJSON<Topology>(`layers/physical-${lod}.json`).then((topo) => {
      const o = topo.objects;
      const get = <P>(n: string) => (o[n] ? shapesFrom<P>(topo, n) : []);
      this.physical[lod] = { lakes: get('lakes'), rivers: get<{ sr: number }>('rivers'), glaciers: get('glaciers'), iceshelves: get('iceshelves') };
      this.requestRender();
    }).catch((e) => console.warn('physical', e));
  }

  /** The loaded level of detail used in the last frame. */
  lod: LOD = '110m';
  /** Whether the last frame was drawn from the GPU world texture. */
  gpuFrame = false;

  /**
   * Each visible country projected once per frame into a Path2D, then reused for the land, every
   * fill filter, the legend highlight and hover/selection (projecting is most of a frame's cost).
   */
  private framePaths = new Map<string, Path2D>();
  private countryPath(s: Shape): Path2D {
    let p = this.framePaths.get(s.id);
    if (!p) {
      p = new Path2D();
      this.path.context(p as unknown as CanvasRenderingContext2D);
      this.path(s.feature as never);
      this.path.context(this.fg);
      this.framePaths.set(s.id, p);
    }
    return p;
  }
  // ---- GPU motion: the map painted into world textures that WebGL reprojects every frame.
  private worldCanvas: HTMLCanvasElement | null = null;
  /** 'under' goes below the data grids (plain land, and fills below the grids); 'over' on top. */
  private world: Record<WorldSlot, { tex: RasterTexture | null; key: string; wanted: string; timer: number }> = {
    under: { tex: null, key: '', wanted: '', timer: 0 },
    over: { tex: null, key: '', wanted: '', timer: 0 },
  };

  /** Fill layers that can be baked: contiguous in the stack, coloured per country, not animated. */
  private bakeableFills(ready: LayerInstance[]): LayerInstance[] | null {
    const idx = ready.map((l, i) => (l.def.kind === 'fill' ? i : -1)).filter((i) => i >= 0);
    if (idx.length && idx[idx.length - 1] - idx[0] !== idx.length - 1) return null;
    const fills = idx.map((i) => ready[i]);
    if (fills.some((l) => (l.def.drawFill ? !l.def.bakeable : !l.def.countryColor) || l.def.animated)) return null;
    return fills;
  }

  /**
   * What the world textures hold, so that a moving frame matches a still one. A still frame paints
   * the plain land first, then the stack (data grids such as rainfall or imagery, and fills), then
   * the legend highlight, lakes, coasts and borders. Without grids one texture holds it all; with
   * grids, the land (and fills below every grid) go in a texture under the grids, and the fills
   * above them plus the highlight, lakes, coasts and borders in one over them. Null when no
   * textures can match: fills that can't be baked, or grids between fills.
   */
  private planWorld(ready: LayerInstance[], landBase: boolean, opaqueBase: boolean): WorldPlan | null {
    const fills = this.bakeableFills(ready);
    if (!fills) return null;
    const grids = ready.flatMap((l, i) => (l.def.kind === 'raster' ? [i] : []));
    const level = this.data.best('50m');
    const part = (land: boolean, layers: LayerInstance[], top: boolean): WorldPart => ({
      land, layers, top, lakeFill: opaqueBase ? null : this.theme.lake,
      key: [
        land ? 'L' : '', top ? 'T' : '', layers.map((l) => `${l.def.id}~${l.opacity}~${JSON.stringify(l.options)}`).join('|'),
        this.theme.dark ? 'd' : 'l', level.lod, this.physical['50m'] ? 'k' : '', opaqueBase ? 'o' : '',
        top && this.highlight ? [...this.highlight].sort().join(',') : '',
      ].join('#'),
    });
    if (!grids.length) return { under: null, over: part(landBase, fills, true) };
    const first = ready.indexOf(fills[0]), last = first + fills.length - 1;
    const fillsUnder = fills.length > 0 && last < grids[0];
    const fillsOver = fills.length > 0 && first > grids[grids.length - 1];
    if (fills.length && !fillsUnder && !fillsOver) return null;
    return {
      under: landBase || fillsUnder ? part(landBase, fillsUnder ? fills : [], false) : null,
      over: part(false, fillsOver ? fills : [], true),
    };
  }

  /** Repaints and uploads a world texture soon (off the critical path of the current frame). */
  private scheduleWorld(slot: WorldSlot, p: WorldPart) {
    const w = this.world[slot];
    if (w.wanted === p.key) return;
    w.wanted = p.key;
    clearTimeout(w.timer);
    w.timer = window.setTimeout(() => {
      if (!this.gl || w.wanted !== p.key || !this.lastRc) return;
      const level = this.data.best('50m');
      // 4096×2048 (32 MB) is sharp up to continent zoom; low-memory phones get 2048×1024.
      const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
      const W = Math.min(mem !== undefined && mem <= 4 ? 2048 : 4096, this.gl.maxTextureSize);
      // One canvas to paint in; each texture keeps its own copy on the GPU.
      if (!this.worldCanvas) { this.worldCanvas = document.createElement('canvas'); this.worldCanvas.width = W; this.worldCanvas.height = W / 2; }
      paintWorld(this.worldCanvas, {
        level, layers: p.layers, rc: this.lastRc, theme: this.theme, landBase: p.land, top: p.top, lakeFill: p.lakeFill,
        highlight: this.highlight, lakes: this.physical['50m']?.lakes ?? [],
      });
      w.tex = this.gl.upload(this.worldCanvas, w.tex);
      w.key = p.key;
    }, 60);
  }

  private fillShapes(ctx: CanvasRenderingContext2D, shapes: Shape[], style: string) {
    const all = new Path2D();
    for (const s of shapes) all.addPath(this.countryPath(s));
    ctx.fillStyle = style;
    ctx.fill(all);
  }

  private makeCtx(now: number, level: BaseLevel): RenderCtx {
    const view = this.view;
    const center = view.center();
    const radius = view.visibleRadius();
    const path = this.path;
    const ctx = this.fg;
    return {
      ctx, path, view, theme: this.theme, lang: this.lang, now, lod: level.lod, level,
      moving: this.moving || view.animating, labels: this.labels, dpr: view.dpr, webZoom: view.webZoom,
      center, radius,
      visibleShapes: <T extends { bbox: [number, number, number, number] }>(shapes: T[]) => shapes.filter((s) => bboxNear(s.bbox, center, radius)),
      visibleLines: (lines: Line[]) => lines.filter((l) => bboxNear(l.bbox, center, radius)),
      project: (lon, lat) => view.project(lon, lat),
      fillCountry: (id, color) => {
        const s = level.byId.get(id);
        if (!s) return;
        ctx.fillStyle = color; ctx.fill(this.countryPath(s));
      },
      fillCountries: (ids, color) => {
        const shapes: Shape[] = [];
        for (const id of ids) { const s = level.byId.get(id); if (s && bboxNear(s.bbox, center, radius)) shapes.push(s); }
        if (shapes.length) this.fillShapes(ctx, shapes, color);
      },
    };
  }

  private draw(now: number) {
    const view = this.view;
    const { w, h, dpr } = view;
    let level: BaseLevel;
    try { level = this.data.best(this.wantLOD()); } catch {
      // Data not loaded yet: just the background.
      this.bg.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawSpace(this.bg, w, h);
      return;
    }
    this.lod = level.lod;
    const rc = this.makeCtx(now, level);
    this.lastRc = rc;
    if (this.gl) this.gl.sun = sunVector(new Date());
    const th = this.theme;
    const globe = view.current.kind !== 'flat' || view.morphing;

    // ---- background + ocean
    const bg = this.bg;
    bg.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawSpace(bg, w, h);
    const R = view.zoom * view.fb;
    const [cx, cy] = [w / 2, view.translate[1] - (view.current.kind === 'flat' ? 0 : 0)];
    const gy = view.translate[1];
    if (view.current.kind === 'globe' && !view.morphing) this.drawAtmosphere(bg, w / 2, gy, R);
    bg.beginPath();
    this.bgPath({ type: 'Sphere' });
    if (view.current.kind === 'flat' && !view.morphing) {
      bg.save();
      bg.shadowColor = th.dark ? 'rgba(0,0,0,0.6)' : 'rgba(60,50,30,0.25)';
      bg.shadowBlur = 24; bg.shadowOffsetY = 6;
      bg.fillStyle = th.ocean[1];
      bg.fill();
      bg.restore();
    }
    const og = globe
      ? bg.createRadialGradient(w / 2 - R * 0.35, gy - R * 0.4, R * 0.05, w / 2, gy, R * 1.02)
      : bg.createLinearGradient(0, cy - R * 1.5, 0, cy + R * 1.5);
    og.addColorStop(0, th.ocean[0]); og.addColorStop(0.55, th.ocean[1]); og.addColorStop(1, th.ocean[2]);
    bg.fillStyle = og;
    bg.fill();

    // ---- the filter stack, bottom to top: imagery and data grids are rendered by WebGL and
    // composited into the map canvas at their place in the stack, so a filter on top always
    // covers the ones below it.
    const ctx = this.fg;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = this.path;
    this.framePaths.clear();
    const countries = rc.visibleShapes(level.countries);
    const ready = this.layers.filter((l) => l.ready);
    const bottom = ready[0];
    const opaqueBase = !!bottom && bottom.def.kind === 'raster' && bottom.def.group === 'imagery' && bottom.opacity > 0.9 && !!this.gl;
    // The grey land is pointless under a filter that paints every country opaquely (political map).
    const coveredBase = !!bottom && bottom.def.coversLand === true && bottom.opacity > 0.99;
    const landBase = !opaqueBase && !coveredBase && this.baseMap;

    // GPU motion: while the map moves (zoomed out, where the textures are sharp enough), land, filter
    // colours, highlight, lakes and borders come from textures the GPU reprojects (see planWorld).
    const plan = this.settings.gpuMotion && this.gl && !this.gl.software && this.baseMap ? this.planWorld(ready, landBase, opaqueBase) : null;
    let gpu = false;
    if (plan) {
      let ready2 = true;
      for (const slot of ['under', 'over'] as const) {
        const p = plan[slot];
        if (!p) continue;
        const w = this.world[slot];
        if (p.key !== w.key) this.scheduleWorld(slot, p);
        if (!w.tex || w.key !== p.key) ready2 = false;
      }
      gpu = (this.moving || view.animating) && view.webZoom < 3.6 && ready2;
    }
    this.gpuFrame = gpu;

    if (landBase && !gpu) this.fillShapes(ctx, countries, th.land);

    let pending: RasterDraw[] = [];
    const flushRasters = () => {
      if (!pending.length || !this.gl) { pending = []; return; }
      this.gl.render(view, pending);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.glCanvas, 0, 0);
      ctx.restore();
      pending = [];
    };
    // In a GPU frame the fills are in the world textures: the 'under' one goes below every data
    // grid, the 'over' one above them all.
    if (gpu && plan?.under) pending.push({ texture: this.world.under.tex!, opacity: 1 });
    for (const l of ready) {
      if (l.def.kind === 'raster') {
        const d = l.def.raster?.(rc, l);
        if (d) pending.push(...d);
        continue;
      }
      if (l.def.kind !== 'fill' || gpu) continue;
      flushRasters();
      ctx.save();
      ctx.globalAlpha = l.opacity;
      if (l.def.drawFill) l.def.drawFill(rc, l);
      else if (l.def.countryColor) {
        const groups = new Map<string, Shape[]>();
        for (const s of countries) {
          const c = l.def.countryColor(s.id, l, rc);
          if (!c) continue;
          let g = groups.get(c);
          if (!g) groups.set(c, (g = []));
          g.push(s);
        }
        for (const [color, list] of groups) this.fillShapes(ctx, list, color);
      }
      ctx.restore();
    }
    if (gpu) pending.push({ texture: this.world.over.tex!, opacity: 1 });
    flushRasters();

    // Highlight from the legend (dim everything else).
    if (this.highlight && this.highlight.size && !gpu) {
      this.fillShapes(ctx, countries.filter((s) => !this.highlight!.has(s.id)), th.dark ? 'rgba(4,10,24,0.62)' : 'rgba(255,255,255,0.65)');
    }

    // ---- water bodies and ice on top of fills
    const physLod = level.lod === '10m' ? '10m' : '50m';
    this.ensurePhysical('50m');
    if (physLod === '10m') this.ensurePhysical('10m');
    const phys = this.baseMap ? this.physical[physLod] ?? this.physical['50m'] : undefined;
    if (phys && !gpu) {
      const lakes = rc.visibleShapes(phys.lakes);
      if (lakes.length) {
        ctx.beginPath();
        for (const s of lakes) path(s.feature as never);
        ctx.fillStyle = opaqueBase ? 'rgba(20,60,110,0.0)' : th.lake;
        ctx.fill();
        ctx.lineWidth = 0.5; ctx.strokeStyle = th.coast; ctx.stroke();
      }
      if (this.settings.rivers) {
        const maxRank = view.webZoom < 3 ? 2 : view.webZoom < 4 ? 4 : view.webZoom < 5 ? 6 : 12;
        ctx.beginPath();
        for (const s of rc.visibleShapes(phys.rivers)) if ((s.feature.properties?.sr ?? 9) <= maxRank) path(s.feature as never);
        ctx.strokeStyle = th.river; ctx.lineWidth = view.webZoom < 4 ? 0.7 : 1.1; ctx.stroke();
      }
    }

    // ---- graticule
    if (this.settings.graticule) {
      ctx.beginPath();
      path(this.graticule);
      ctx.strokeStyle = th.graticule; ctx.lineWidth = 0.6; ctx.stroke();
    }

    // ---- borders and coastlines
    const bw = th.borderWidth * Math.max(0.6, Math.min(1.8, 0.55 + view.webZoom * 0.14));
    if (this.baseMap && !gpu) {
    ctx.beginPath();
    for (const l of rc.visibleLines(level.coast)) path(l.geometry);
    ctx.strokeStyle = th.coast; ctx.lineWidth = bw * 0.9; ctx.stroke();
    ctx.beginPath();
    for (const l of rc.visibleLines(level.borders)) path(l.geometry);
    ctx.strokeStyle = th.border; ctx.lineWidth = bw; ctx.stroke();
    }

    // Labels are collected from here on (overlays add some: a quiz pin, measured distances), drawn last.
    this.labels.scale = this.settings.labelScale;
    this.labels.begin(w, h);

    // ---- overlays from filters and tools
    for (const l of this.layers) {
      if (!l.ready || !l.def.drawOverlay) continue;
      ctx.save(); ctx.globalAlpha = l.opacity;
      l.def.drawOverlay(rc, l);
      ctx.restore();
    }
    for (const o of this.overlays) { ctx.save(); o(rc); ctx.restore(); }

    // ---- selection
    for (const [id, strong] of [[this.hover, false], [this.selection, true]] as const) {
      if (!id) continue;
      const s = level.byId.get(id);
      if (!s) continue;
      const p = this.countryPath(s);
      ctx.save();
      if (strong) {
        ctx.shadowColor = th.selection; ctx.shadowBlur = 12;
        ctx.strokeStyle = th.selection; ctx.lineWidth = 2.2;
      } else {
        ctx.fillStyle = th.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'; ctx.fill(p);
        ctx.strokeStyle = th.dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2;
      }
      ctx.stroke(p);
      ctx.restore();
    }

    // ---- 3D shading of the globe
    if (this.settings.shading && view.current.kind === 'globe' && !view.morphing) {
      const g = ctx.createRadialGradient(w / 2 - R * 0.38, gy - R * 0.42, R * 0.1, w / 2, gy, R);
      g.addColorStop(0, th.dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.18)');
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(0.85, `rgba(0,8,25,${th.shade * 0.45})`);
      g.addColorStop(1, `rgba(0,8,25,${th.shade})`);
      ctx.beginPath(); path({ type: 'Sphere' });
      ctx.fillStyle = g; ctx.fill();
      // Thin bright rim.
      ctx.strokeStyle = th.dark ? 'rgba(140,200,255,0.35)' : 'rgba(80,120,170,0.35)';
      ctx.lineWidth = 1; ctx.stroke();
    } else if (view.current.kind !== 'globe' || view.morphing) {
      ctx.beginPath(); path({ type: 'Sphere' });
      ctx.strokeStyle = th.dark ? 'rgba(140,200,255,0.35)' : 'rgba(60,90,130,0.45)';
      ctx.lineWidth = 1; ctx.stroke();
    }

    // ---- labels
    if (this.baseMap) this.baseLabels(rc);
    for (const l of this.layers) if (l.ready && l.def.labels) l.def.labels(rc, l);
    this.labels.draw(ctx);
  }

  private drawSpace(bg: CanvasRenderingContext2D, w: number, h: number) {
    const th = this.theme;
    const g = bg.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 1.6);
    g.addColorStop(0, th.space[0]); g.addColorStop(1, th.space[1]);
    bg.fillStyle = g;
    bg.fillRect(0, 0, w, h);
    if (!th.stars) return;
    if (!this.stars || this.stars.width !== Math.round(w)) {
      const c = document.createElement('canvas');
      c.width = Math.round(w); c.height = Math.round(h);
      const s = c.getContext('2d')!;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const n = Math.round((w * h) / 2200);
      for (let i = 0; i < n; i++) {
        const x = rnd() * w, y = rnd() * h, m = rnd();
        const r = m > 0.985 ? 1.4 : m > 0.9 ? 0.9 : 0.55;
        s.globalAlpha = 0.25 + rnd() * 0.65;
        s.fillStyle = m > 0.97 ? (rnd() > 0.5 ? '#cfe1ff' : '#ffe9c7') : '#ffffff';
        s.beginPath(); s.arc(x, y, r, 0, Math.PI * 2); s.fill();
      }
      this.stars = c;
    }
    bg.globalAlpha = 0.9;
    bg.drawImage(this.stars, 0, 0, w, h);
    bg.globalAlpha = 1;
  }

  private drawAtmosphere(bg: CanvasRenderingContext2D, x: number, y: number, R: number) {
    const th = this.theme;
    const g = bg.createRadialGradient(x, y, R * 0.92, x, y, R * 1.22);
    g.addColorStop(0, th.dark ? 'rgba(95,180,255,0.55)' : 'rgba(120,170,220,0.45)');
    g.addColorStop(0.35, th.dark ? 'rgba(70,140,255,0.22)' : 'rgba(120,170,220,0.18)');
    g.addColorStop(1, 'rgba(60,120,255,0)');
    bg.fillStyle = g;
    bg.beginPath(); bg.arc(x, y, R * 1.25, 0, Math.PI * 2); bg.fill();
  }

  private baseLabels(rc: RenderCtx) {
    const { view, theme: th, labels } = rc;
    const wz = view.webZoom;
    const es = this.lang === 'es';
    const set = this.settings.labels;
    const meta = this.data.meta;
    if (set.countries) {
      // The top filter's value for each country goes under its name (fertility "4.5", "Spanish"...).
      const valueLayer = set.values ? [...this.layers].reverse().find((l) => l.ready && !l.def.hidden && l.def.valueLabel) : undefined;
      for (const s of rc.visibleShapes(rc.level.countries)) {
        const m = meta[s.id];
        if (!m || wz < m.ml - 0.9) continue;
        const p = rc.project(m.lx, m.ly);
        if (!p) continue;
        const big = m.lr <= 3;
        const size = Math.max(9.5, Math.min(20, 15.5 - m.lr * 1.3 + (wz - 3) * 1.6));
        const value = valueLayer ? valueLayer.def.valueLabel!(s.id, valueLayer) : null;
        labels.add({
          text: es ? m.ses ?? m.es : m.sn ?? m.n, x: p[0], y: p[1], priority: 900 - m.lr * 40 + (s.id === this.selection ? 500 : 0),
          size, weight: big ? 700 : 600, color: th.label, halo: th.labelHalo, caps: big && wz < 5.5,
          sub: value ?? undefined, subSize: Math.max(9.5, Math.min(13, size * 0.8)), subColor: th.label,
        });
      }
    }
    if (set.capitals || set.cities) {
      const cities = this.data.cities;
      let shown = 0;
      for (const c of cities) {
        if (c.minZoom > wz + 1.2) break;
        const isCap = c.capital === 2;
        if (isCap ? !set.capitals : !set.cities) continue;
        if (!isCap && c.minZoom > wz + 0.2) continue;
        if (isCap && c.minZoom > wz + 1.2) continue;
        const p = rc.project(c.lon, c.lat);
        if (!p) continue;
        const big = c.pop > 5e6 ? 2 : c.pop > 1e6 ? 1 : 0;
        labels.add({
          text: es && c.es ? c.es : c.name, x: p[0], y: p[1],
          priority: (isCap ? 700 : 400) + big * 60 - c.minZoom * 20,
          size: 10.5 + big * 1.2 + (isCap ? 0.6 : 0), weight: isCap ? 650 : 500,
          color: th.city, halo: th.labelHalo,
          marker: isCap ? { kind: 'capital', color: th.capital, r: 3.6, stroke: th.dark ? '#fff' : '#fff' }
            : { kind: 'dot', color: th.dark ? '#ffffff' : '#2b3548', r: 2 + big * 0.5, stroke: th.labelHalo },
          keepMarker: isCap,
        });
        if (++shown > 420) break;
      }
    }
    if (set.seas && this.marine.length) {
      for (const m of this.marine) {
        const need = m.kind === 'ocean' ? 0 : 1.2 + m.sr * 0.55;
        if (wz < need) continue;
        const p = rc.project(m.lon, m.lat);
        if (!p) continue;
        const ocean = m.kind === 'ocean';
        labels.add({
          text: es && m.es ? m.es : m.name, x: p[0], y: p[1], priority: 300 - m.sr * 10,
          size: ocean ? 13 : 10.5, weight: 500, italic: true, caps: ocean, color: th.sea, halo: th.labelHalo,
        });
      }
    }
  }

  /**
   * Renders the current view into a new canvas (map, imagery and effects; no UI). With a size, the
   * map is re-rendered at cssW×cssH CSS pixels and the given pixel ratio (e.g. 1920×1080 @2 = 4K).
   */
  snapshot(cssW?: number, cssH?: number, dpr = 2): HTMLCanvasElement {
    const view = this.view;
    const prev = { w: view.w, h: view.h };
    const custom = !!(cssW && cssH);
    const canvases = [this.bgCanvas, this.fgCanvas, ...(this.fxCanvas ? [this.fxCanvas] : [])];
    if (custom) {
      for (const c of canvases) { c.width = Math.round(cssW! * dpr); c.height = Math.round(cssH! * dpr); }
      view.resize(cssW!, cssH!, dpr);
      this.stars = null;
    }
    view.update(performance.now());
    this.draw(performance.now());
    this.drawFx(performance.now(), 16, this.hasFx());
    const out = document.createElement('canvas');
    out.width = this.bgCanvas.width; out.height = this.bgCanvas.height;
    const o = out.getContext('2d')!;
    for (const c of canvases) o.drawImage(c, 0, 0);
    if (custom) this.resize(prev.w, prev.h);
    return out;
  }

  /** Country under a screen point (uses the loaded geometry; tests the most detailed level first). */
  pickCountry(sx: number, sy: number): string | null {
    const g = this.view.invert(sx, sy);
    if (!g) return null;
    return this.countryAt(g[0], g[1]);
  }

  countryAt(lon: number, lat: number): string | null {
    const level = this.data.best(this.lod);
    for (const s of level.countries) {
      const [w, so, e, n] = s.bbox;
      if (lat < so || lat > n) continue;
      if (w <= e ? lon < w || lon > e : lon < w && lon > e) continue;
      if (geoContainsFast(s.feature, lon, lat)) return s.id;
    }
    return null;
  }
}

// d3.geoContains is exact on the sphere; fine for single clicks.
import { geoContains } from 'd3-geo';
function geoContainsFast(f: Feature<Geometry, unknown>, lon: number, lat: number): boolean {
  return geoContains(f as never, [lon, lat]);
}

export { feature as topoFeature };
export type { GeometryCollection };
