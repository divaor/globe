// Draws one frame: space background + ocean (bg canvas), imagery (WebGL canvas), then vector
// filters, base map lines, overlays, globe shading and labels (fg canvas).
import { geoPath, geoGraticule10, type GeoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry } from 'geojson';
import { View } from './view';
import { GLRaster, type RasterDraw } from './gl';
import { LabelEngine } from './labels';
import { bboxNear, loadJSON, shapesFrom, type BaseLevel, type DataStore, type LOD, type Line, type Shape } from '../data/store';
import type { LayerInstance, RenderCtx } from '../layers/types';
import { THEMES, type Theme } from '../app/theme';
import type { Lang } from '../app/i18n';
import { sunVector } from '../layers/sun';

export interface RenderSettings {
  labels: { countries: boolean; capitals: boolean; cities: boolean; seas: boolean };
  labelScale: number;
  graticule: boolean;
  rivers: boolean;
  shading: boolean;
  quality: 'auto' | 'high' | 'low';
}

interface Physical { lakes: Shape[]; rivers: Shape<{ sr: number }>[]; glaciers: Shape[]; iceshelves: Shape[] }
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
    labels: { countries: true, capitals: true, cities: true, seas: true },
    labelScale: 1, graticule: true, rivers: false, shading: true, quality: 'auto',
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

  resize(w: number, h: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.settings.quality === 'low' ? 1 : 2);
    for (const c of [this.bgCanvas, this.fgCanvas, ...(this.fxCanvas ? [this.fxCanvas] : [])]) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      c.style.width = `${w}px`; c.style.height = `${h}px`;
    }
    this.glCanvas.style.width = `${w}px`; this.glCanvas.style.height = `${h}px`;
    this.view.resize(w, h, dpr);
    this.stars = null;
    this.requestRender();
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
    if (wz >= 5.3) return '10m';
    if (wz >= 3.7) return '50m';
    if (q === 'high') return '50m';
    return busy ? '110m' : '50m';
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
        ctx.beginPath(); path(s.feature as never); ctx.fillStyle = color; ctx.fill();
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
    const countries = rc.visibleShapes(level.countries);
    const ready = this.layers.filter((l) => l.ready);
    const bottom = ready[0];
    const opaqueBase = !!bottom && bottom.def.kind === 'raster' && bottom.def.group === 'imagery' && bottom.opacity > 0.9 && !!this.gl;

    if (!opaqueBase && this.baseMap) {
      ctx.beginPath();
      for (const s of countries) path(s.feature as never);
      ctx.fillStyle = th.land;
      ctx.fill();
    }

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
    for (const l of ready) {
      if (l.def.kind === 'raster') {
        const d = l.def.raster?.(rc, l);
        if (d) pending.push(...d);
        continue;
      }
      if (l.def.kind !== 'fill') continue;
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
        for (const [color, list] of groups) {
          ctx.beginPath();
          for (const s of list) path(s.feature as never);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
      ctx.restore();
    }
    flushRasters();

    // Highlight from the legend (dim everything else).
    if (this.highlight && this.highlight.size) {
      ctx.beginPath();
      for (const s of countries) if (!this.highlight.has(s.id)) path(s.feature as never);
      ctx.fillStyle = th.dark ? 'rgba(4,10,24,0.62)' : 'rgba(255,255,255,0.65)';
      ctx.fill();
    }

    // ---- water bodies and ice on top of fills
    const physLod = level.lod === '10m' ? '10m' : '50m';
    this.ensurePhysical('50m');
    if (physLod === '10m') this.ensurePhysical('10m');
    const phys = this.baseMap ? this.physical[physLod] ?? this.physical['50m'] : undefined;
    if (phys) {
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
    if (this.baseMap) {
    ctx.beginPath();
    for (const l of rc.visibleLines(level.coast)) path(l.geometry);
    ctx.strokeStyle = th.coast; ctx.lineWidth = bw * 0.9; ctx.stroke();
    ctx.beginPath();
    for (const l of rc.visibleLines(level.borders)) path(l.geometry);
    ctx.strokeStyle = th.border; ctx.lineWidth = bw; ctx.stroke();
    }

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
      ctx.save();
      ctx.beginPath(); path(s.feature as never);
      if (strong) {
        ctx.shadowColor = th.selection; ctx.shadowBlur = 12;
        ctx.strokeStyle = th.selection; ctx.lineWidth = 2.2;
      } else {
        ctx.fillStyle = th.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'; ctx.fill();
        ctx.strokeStyle = th.dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2;
      }
      ctx.stroke();
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
    this.labels.scale = this.settings.labelScale;
    this.labels.begin(w, h);
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
      for (const s of rc.visibleShapes(rc.level.countries)) {
        const m = meta[s.id];
        if (!m || wz < m.ml - 0.9) continue;
        const p = rc.project(m.lx, m.ly);
        if (!p) continue;
        const big = m.lr <= 3;
        const size = Math.max(9.5, Math.min(20, 15.5 - m.lr * 1.3 + (wz - 3) * 1.6));
        labels.add({
          text: es ? m.ses ?? m.es : m.sn ?? m.n, x: p[0], y: p[1], priority: 900 - m.lr * 40 + (s.id === this.selection ? 500 : 0),
          size, weight: big ? 700 : 600, color: th.label, halo: th.labelHalo, caps: big && wz < 5.5,
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
