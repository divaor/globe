// The camera and the current d3 projection, including smooth morphs between projections and
// animated "fly to" moves. The same parameters drive the WebGL raster renderer (see uniforms()).
import {
  geoProjectionMutator, geoClipAntimeridian, geoClipCircle, geoDistance, geoRotation,
  type GeoProjection, type GeoRawProjection, type GeoStream,
} from 'd3-geo';
import { PROJECTIONS, fitScale, type ProjectionDef, type ProjectionId } from './projections';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export interface Camera { lon: number; lat: number; zoom: number }

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function morphRaw(a: GeoRawProjection, b: GeoRawProjection, t: number, fa: number, fb: number): GeoRawProjection {
  const raw = ((l: number, p: number) => {
    if (t <= 0) { const r = a(l, p); return [r[0] * fa, r[1] * fa]; }
    if (t >= 1) { const r = b(l, p); return [r[0] * fb, r[1] * fb]; }
    const ra = a(l, p), rb = b(l, p);
    return [(1 - t) * fa * ra[0] + t * fb * rb[0], (1 - t) * fa * ra[1] + t * fb * rb[1]];
  }) as GeoRawProjection;
  if (t >= 1 && b.invert) raw.invert = (x, y) => b.invert!(x / fb, y / fb);
  else if (t <= 0 && a.invert) raw.invert = (x, y) => a.invert!(x / fa, y / fa);
  return raw;
}

/** Horizontal stretch of a raw projection at the equator (raw x per radian of longitude). */
function xFactor(def: ProjectionDef): number {
  const e = 1e-4;
  return def.raw(e, 0)[0] / e;
}

export class View {
  w = 800; h = 600; dpr = 1;
  lon = 0; lat = 18; zoom = 1;
  minZoom = 0.6; maxZoom = 400;

  /** Morph state: from `a` to `b`; t = 1 means the view is fully `b`. */
  a: ProjectionDef = PROJECTIONS.globe;
  b: ProjectionDef = PROJECTIONS.globe;
  t = 1;
  morph: { start: number; duration: number } | null = null;
  private fly: { from: Camera; to: Camera; start: number; duration: number; arc: number } | null = null;
  private onDone: (() => void) | null = null;

  readonly projection: GeoProjection;
  private mutate: (...args: unknown[]) => GeoProjection;

  // Derived each update()
  fa = 1; fb = 1;
  rotate: [number, number, number] = [0, 0, 0];
  translate: [number, number] = [0, 0];
  clipAngle = 90; // degrees; 180 = no small-circle clip
  antimeridian = false;
  private lastKey = '';
  private c: [number, number] = [0, 0];
  private cx = 1; private cy = 0; private cz = 0; private cosClip = 0;

  constructor() {
    this.mutate = geoProjectionMutator(morphRaw as never) as unknown as (...args: unknown[]) => GeoProjection;
    this.projection = this.mutate(this.a.raw, this.b.raw, 1, 1, 1);
    this.projection.precision(0.6);
  }

  get current(): ProjectionDef { return this.b; }
  get animating(): boolean { return !!this.morph || !!this.fly; }
  get morphing(): boolean { return !!this.morph && this.t < 1; }

  resize(w: number, h: number, dpr: number) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.lastKey = '';
    this.update(performance.now());
  }

  /** Pixels per radian at the centre of the view (for zoom levels and dragging). */
  get pxPerRadian(): number {
    const fa = this.fa * xFactor(this.a), fb = this.fb * xFactor(this.b);
    return this.zoom * lerp(fa, fb, this.t);
  }

  /** Equivalent web-map zoom level (0 = whole world in 256 px), used for label and detail thresholds. */
  get webZoom(): number {
    return Math.log2((2 * Math.PI * this.pxPerRadian) / 256);
  }

  setProjection(id: ProjectionId, animate = true, duration = 1400): void {
    const target = PROJECTIONS[id];
    if (target === this.b && !this.morph) return;
    if (!animate) {
      this.a = this.b = target; this.t = 1; this.morph = null;
    } else {
      // If a morph is running, continue from where it is (start from the projection we are closest to).
      this.a = this.t < 0.5 && this.morph ? this.a : this.b;
      this.b = target; this.t = 0;
      this.morph = { start: performance.now(), duration };
    }
    if (target.kind === 'flat') this.zoom = Math.max(1, Math.min(this.zoom, 3));
    this.lastKey = '';
  }

  flyTo(to: Partial<Camera>, duration = 1600, onDone?: () => void): void {
    const from = { lon: this.lon, lat: this.lat, zoom: this.zoom };
    const target: Camera = { lon: to.lon ?? this.lon, lat: to.lat ?? this.lat, zoom: to.zoom ?? this.zoom };
    // Take the short way round in longitude.
    let dl = wrapLon(target.lon - from.lon);
    target.lon = from.lon + dl;
    const dist = geoDistance([from.lon, from.lat], [target.lon, target.lat]);
    // Zoom out a little mid-flight for long jumps (globe only).
    const arc = this.b.kind === 'flat' ? 0 : Math.min(0.6, dist / Math.PI);
    this.fly = { from, to: target, start: performance.now(), duration, arc };
    this.onDone = onDone ?? null;
  }

  stopAnimations(): void { this.fly = null; }

  /** Advance animations; returns true if something is still animating. */
  update(now: number): boolean {
    let busy = false;
    if (this.morph) {
      const p = Math.min(1, (now - this.morph.start) / this.morph.duration);
      this.t = easeInOut(p);
      if (p >= 1) { this.morph = null; this.t = 1; this.a = this.b; }
      busy = true;
    }
    if (this.fly) {
      const f = this.fly;
      const p = Math.min(1, (now - f.start) / f.duration);
      const e = easeInOut(p);
      this.lon = lerp(f.from.lon, f.to.lon, e);
      this.lat = lerp(f.from.lat, f.to.lat, e);
      const z = Math.exp(lerp(Math.log(f.from.zoom), Math.log(f.to.zoom), e));
      this.zoom = z * (1 - f.arc * Math.sin(Math.PI * p));
      if (p >= 1) { this.fly = null; const cb = this.onDone; this.onDone = null; cb?.(); }
      busy = true;
    }
    this.lon = wrapLon(this.lon);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    this.clampLat();
    this.build();
    return busy;
  }

  private phi0For(def: ProjectionDef): number {
    return def.kind === 'flat' ? 0 : -this.lat;
  }

  private build(): void {
    const { a, b, t } = this;
    this.fa = fitScale(a, this.w, this.h);
    this.fb = fitScale(b, this.w, this.h);
    const phi0 = lerp(this.phi0For(a), this.phi0For(b), t);
    this.rotate = [-this.lon, phi0, 0];
    const raw = morphRaw(a.raw, b.raw, t, this.fa, this.fb);
    const p0 = (this.lat + phi0) * RAD;
    const yc = raw(0, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, p0)))[1];
    this.translate = [this.w / 2, this.h / 2 + this.zoom * yc];

    const ca = a.kind === 'flat' ? 180 : a.clipAngle ?? 180;
    const cb = b.kind === 'flat' ? 180 : b.clipAngle ?? 180;
    this.clipAngle = lerp(ca, cb, t);
    const flatInvolved = (a.kind === 'flat' && t < 1) || b.kind === 'flat';
    this.antimeridian = flatInvolved;

    const key = `${a.id}|${b.id}|${t}|${this.fa}|${this.fb}`;
    if (key !== this.lastKey) {
      this.mutate(a.raw, b.raw, t, this.fa, this.fb);
      this.lastKey = key;
    }
    const proj = this.projection;
    proj.rotate(this.rotate).scale(this.zoom).translate(this.translate);
    const c = geoRotation(this.rotate).invert([0, 0]);
    this.c = [c[0], c[1]];
    this.cx = Math.cos(c[1] * RAD) * Math.cos(c[0] * RAD);
    this.cy = Math.cos(c[1] * RAD) * Math.sin(c[0] * RAD);
    this.cz = Math.sin(c[1] * RAD);
    this.cosClip = Math.cos(Math.min(this.clipAngle, 180) * RAD);

    const circle = this.clipAngle < 179.4 ? geoClipCircle(Math.min(this.clipAngle, 179.4) * RAD) : null;
    if (this.antimeridian && circle) {
      // Morph between a globe and a flat map: cut at the antimeridian first, nudge the two sides
      // of the cut apart (they would otherwise share points and confuse the circle clip), then
      // clip the small cap around the antipode that is not unrolled yet.
      proj.preclip((s: GeoStream) => geoClipAntimeridian(nudgeSeam(circle(s))));
    } else if (this.antimeridian) {
      proj.preclip(geoClipAntimeridian);
    } else if (circle) {
      proj.preclip(circle);
    } else {
      proj.preclip(geoClipCircle(179.4 * RAD));
    }
  }

  /** Keep flat maps from scrolling past their top/bottom edges, and globes from flipping over the pole. */
  private clampLat(): void {
    const def = this.b;
    if (def.kind !== 'flat') {
      this.lat = Math.max(-89, Math.min(89, this.lat));
      return;
    }
    const f = fitScale(def, this.w, this.h);
    const half = this.h / (2 * this.zoom * f);
    const [, y0, , y1] = def.bounds;
    if ((y1 - y0) / 2 <= half) {
      // Whole map fits vertically: keep it centred.
      this.lat = invertY(def, (y0 + y1) / 2);
      return;
    }
    const y = def.raw(0, this.lat * RAD)[1];
    const yc = Math.max(y0 + half, Math.min(y1 - half, y));
    if (yc !== y) this.lat = invertY(def, yc);
  }

  /** Pan by a screen delta (pixels). */
  panBy(dx: number, dy: number): void {
    const def = this.b;
    if (def.kind === 'flat') {
      const f = fitScale(def, this.w, this.h) * this.zoom;
      this.lon -= (dx / (f * xFactor(def))) * DEG;
      const y = def.raw(0, this.lat * RAD)[1] + dy / f;
      this.lat = invertY(def, y);
    } else {
      const k = this.pxPerRadian;
      this.lon -= (dx / k) * DEG;
      this.lat += (dy / k) * DEG;
    }
    this.update(performance.now());
  }

  /** Zoom by `factor` keeping the geographic point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.invert(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    this.update(performance.now());
    if (!before) return;
    for (let i = 0; i < 2; i++) {
      const after = this.invert(sx, sy);
      if (!after) break;
      this.lon += wrapLon(before[0] - after[0]);
      this.lat += before[1] - after[1];
      this.update(performance.now());
    }
  }

  invert(sx: number, sy: number): [number, number] | null {
    if (this.morphing) return null;
    const p = this.projection.invert?.([sx, sy]);
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) return null;
    if (!this.isVisible(p[0], p[1])) return null;
    // Orthographic invert returns points for the whole disc only; reject outside the globe.
    const back = this.projection(p);
    if (!back || Math.hypot(back[0] - sx, back[1] - sy) > 1) return null;
    return p as [number, number];
  }

  /** Whether a geographic point is on the visible part of the map (front of the globe etc). */
  isVisible(lon: number, lat: number): boolean {
    if (this.clipAngle >= 179.4) return true;
    const l = lon * RAD, p = lat * RAD, cp = Math.cos(p);
    return cp * Math.cos(l) * this.cx + cp * Math.sin(l) * this.cy + Math.sin(p) * this.cz > this.cosClip;
  }

  /** The geographic point at the centre of the rotation (what the globe faces). */
  center(): [number, number] {
    return this.c;
  }

  /** Screen position of a point, or null when hidden. */
  project(lon: number, lat: number): [number, number] | null {
    if (!this.isVisible(lon, lat)) return null;
    const p = this.projection([lon, lat]);
    return p ? [p[0], p[1]] : null;
  }

  /** Angular radius (radians) around the centre that can be on screen — used for culling. */
  visibleRadius(): number {
    const halfDiag = Math.hypot(this.w, this.h) / 2;
    const r = halfDiag / this.pxPerRadian;
    if (this.b.kind === 'flat' || this.morphing) return Math.min(Math.PI, r * 1.6 + 0.05);
    if (r >= 1) return (this.clipAngle * RAD);
    return Math.min(this.clipAngle * RAD, Math.asin(r) + 0.02);
  }

  camera(): Camera { return { lon: this.lon, lat: this.lat, zoom: this.zoom }; }

  /** Parameters for the WebGL raster renderer (see gl.ts). */
  uniforms() {
    const rot = geoRotation(this.rotate);
    const cols: number[] = [];
    for (const [l, p] of [[0, 0], [90, 0], [0, 90]] as const) {
      const g = rot.invert([l, p]);
      const lam = g[0] * RAD, phi = g[1] * RAD;
      cols.push(Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi));
    }
    return {
      pa: this.a.gl, pb: this.b.gl, t: this.t, fa: this.fa, fb: this.fb, zoom: this.zoom,
      translate: this.translate, inv: cols, clip: Math.min(this.clipAngle, 180) * RAD,
      w: this.w, h: this.h,
    };
  }
}

/** Moves points lying exactly on the ±180° cut 1e-6 rad inwards, so both sides stay distinct. */
function nudgeSeam(sink: GeoStream): GeoStream {
  const E = 1e-6, L = Math.PI - 1e-9;
  return {
    point(x, y) { sink.point(x >= L ? x - E : x <= -L ? x + E : x, y); },
    lineStart() { sink.lineStart(); },
    lineEnd() { sink.lineEnd(); },
    polygonStart() { sink.polygonStart(); },
    polygonEnd() { sink.polygonEnd(); },
    sphere() { sink.sphere?.(); },
  };
}

function invertY(def: ProjectionDef, y: number): number {
  // Bisection on the central meridian: raw y is monotonic in latitude for all flat projections.
  let lo = -Math.PI / 2, hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (def.raw(0, mid)[1] < y) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * DEG;
}
