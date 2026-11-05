// Plate tectonics from 1 billion years ago to today (Merdith et al. 2021 full-plate model).
// Every piece of present-day coastline belongs to a plate; its position at time t is its
// present-day position rotated by that plate's interpolated rotation (unit quaternions, slerp).
import { geoArea, geoCentroid, geoContains, type GeoStream } from 'd3-geo';
import { feature as topoFeature, mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, MultiLineString, Polygon } from 'geojson';
import { loadJSON } from '../data/store';
import { continentSwatch, mix } from '../engine/colors';
import { t, lang, fmtNumber } from '../app/i18n';
import { TimeBar } from '../ui/timebar';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef, RenderCtx } from '../layers/types';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;

interface Rotations { times: number[]; plates: Record<string, number[]>; citation: string }
interface Unit { rank: string; name_en: string; name_es: string; start: number; end: number; color: string }
interface Ev { ma: number; en: string; es: string }
interface Piece {
  p: string; b: number; e: number;
  rings: Float64Array[][];      // polygons → rings → xyz triples (closing point dropped)
  lines: Float64Array[];        // outline polylines (xyz)
  geom: Geometry;               // present-day geometry (for taps)
  cont: string;                 // continent today
  c: [number, number, number];  // present-day centroid (xyz)
  area: number;
}

const toXYZ = (coords: number[][], close: boolean) => {
  const n = close ? coords.length - 1 : coords.length;
  const a = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const l = coords[i][0] * RAD, p = coords[i][1] * RAD, cp = Math.cos(p);
    a[i * 3] = cp * Math.cos(l); a[i * 3 + 1] = cp * Math.sin(l); a[i * 3 + 2] = Math.sin(p);
  }
  return a;
};

function quatAt(rot: Rotations, p: string, t: number): number[] | null {
  const T = rot.times, q = rot.plates[p];
  if (!q) return null;
  const n = T.length;
  if (t <= T[0]) return q.slice(0, 4);
  if (t >= T[n - 1]) return q.slice(4 * n - 4);
  let i = 0, j = n - 1;
  while (j - i > 1) { const m = (i + j) >> 1; if (T[m] <= t) i = m; else j = m; }
  const f = (t - T[i]) / (T[j] - T[i]);
  const a = q.slice(4 * i, 4 * i + 4), b = q.slice(4 * j, 4 * j + 4);
  const d = Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  const th = Math.acos(d), s = Math.sin(th);
  const wa = s < 1e-9 ? 1 - f : Math.sin((1 - f) * th) / s, wb = s < 1e-9 ? f : Math.sin(f * th) / s;
  const r = a.map((v, k) => wa * v + wb * b[k]);
  const len = Math.hypot(r[0], r[1], r[2], r[3]);
  return r.map((v) => v / len);
}

/** Rotation matrix (row-major) of a unit quaternion [w, x, y, z]. */
function matrix(q: number[]): number[] {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

const easeLabel = (ma: number) => {
  const es = lang() === 'es';
  if (ma < 0.05) return es ? 'Hoy' : 'Today';
  const v = ma < 10 ? fmtNumber(ma, 1) : fmtNumber(Math.round(ma));
  return es ? `Hace ${v} millones de años` : `${v} million years ago`;
};

export class PangeaMode {
  private pieces: Piece[] = [];
  private shelves: Piece[] = [];
  private rot: Rotations | null = null;
  private units: Unit[] = [];
  private events: Ev[] = [];
  private bar: TimeBar | null = null;
  private ma = 250;
  private savedStack: string[] = [];
  private savedProjection: string | null = null;
  private loading: Promise<void> | null = null;
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell) {
    const self = this;
    this.layer = {
      id: 'pangea', category: 'earth', icon: '🌋', kind: 'fill', hidden: true,
      name: { en: 'Plate tectonics', es: 'Tectónica de placas' },
      desc: { en: 'Continents through deep time.', es: 'Continentes a lo largo del tiempo profundo.' },
      credit: 'Plate model: Merdith et al. (2021), Earth-Science Reviews (CC BY 4.0)',
      drawFill(rc) { self.draw(rc); },
      labels(rc) { self.labels(rc); },
      legend() {
        const es = lang() === 'es';
        return {
          kind: 'categories', title: es ? 'Tierra de hoy' : 'Land of today',
          items: ['AF', 'SA', 'NA', 'EU', 'AS', 'OC', 'AN'].map((c) => ({ color: continentSwatch(c), label: t(`cont.${c}`) })),
          note: es ? 'Colores según el continente actual. Las costas son las de hoy, desplazadas con su placa.' : 'Coloured by today’s continent. Coastlines are today’s, moved with their plate.',
        };
      },
    };
    app.register([this.layer]);
  }

  get active() { return this.app.mode === 'pangea'; }

  private ensure(): Promise<void> {
    if (!this.loading) this.loading = this.load();
    return this.loading;
  }

  private async load() {
    const [coast, shelf, rot, ts] = await Promise.all([
      loadJSON<Topology>('paleo/paleo-coastlines.json'),
      loadJSON<Topology>('paleo/paleo-continents.json'),
      loadJSON<Rotations>('paleo/paleo-rotations.json'),
      loadJSON<{ units: Unit[]; events: Ev[] }>('paleo/timescale.json'),
      this.app.data.ensure('50m'),
    ]);
    this.rot = rot;
    this.units = ts.units;
    this.events = ts.events.sort((a, b) => b.ma - a.ma);
    this.pieces = this.build(coast, 'coastlines', true);
    this.shelves = this.build(shelf, 'continents', false);
  }

  private build(topo: Topology, name: string, withLines: boolean): Piece[] {
    const obj = topo.objects[name] as GeometryCollection;
    const feats = (topoFeature(topo, obj) as unknown as { features: Feature<Geometry, { p: number | string; b: number; e: number }>[] }).features;
    return feats.map((f, i) => {
      const g = f.geometry;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      let lines: Float64Array[] = [];
      if (withLines) {
        const geomObj = obj.geometries[i];
        const m = mesh(topo, obj, (a, b) => a === b && a === geomObj) as MultiLineString;
        lines = m.coordinates.map((c) => toXYZ(c, false));
      }
      // Present-day continent of the largest part.
      let best = polys[0], bestA = -1;
      for (const pc of polys) { const a = geoArea({ type: 'Polygon', coordinates: pc } as Polygon); if (a > bestA) { bestA = a; best = pc; } }
      const cen = best ? geoCentroid({ type: 'Polygon', coordinates: best } as Polygon) : [0, 0];
      const id = this.app.renderer.countryAt(cen[0], cen[1]);
      const cont = id ? this.app.data.meta[id]?.ct ?? 'SS' : 'SS';
      return {
        p: String(f.properties.p), b: f.properties.b, e: f.properties.e,
        rings: polys.map((poly) => poly.map((ring) => toXYZ(ring, true))),
        lines, geom: g, cont, c: toXYZ([cen as number[]], false) as unknown as [number, number, number],
        area: geoArea(f as never),
      };
    });
  }

  async enter() {
    if (this.active) return;
    this.shell.toast(t('dataLoading'), 1500);
    await this.ensure();
    const app = this.app;
    this.savedStack = app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id);
    this.savedProjection = app.projection;
    app.mode = 'pangea';
    document.documentElement.classList.add('mode-time');
    app.select(null);
    app.renderer.baseMap = false;
    await app.setStack(['pangea']);
    const es = lang() === 'es';
    const periods = this.units.filter((u) => u.rank === 'period');
    this.ma = 250;
    this.bar = new TimeBar({
      title: t('pangeaTitle'),
      format: (f) => easeLabel((1 - f) * 1000),
      caption: (f) => this.caption((1 - f) * 1000),
      bands: periods.map((u) => ({ from: 1 - u.start / 1000, to: 1 - u.end / 1000, color: u.color, label: es ? u.name_es : u.name_en })),
      ticks: [1000, 750, 500, 250, 66, 0].map((m) => ({ at: 1 - m / 1000, label: m ? `${m} Ma` : (es ? 'Hoy' : 'Today') })),
      start: 0.75, end: 1, pos: 0.75,
      rate: 0.01,
      onPos: (f) => { this.ma = Math.max(0, (1 - f) * 1000); app.renderer.requestRender(); },
      onExit: () => this.exit(),
    });
    app.root.append(this.bar.el);
    requestAnimationFrame(() => { if (this.bar) { app.renderer.view.insetBottom = this.bar.coveredHeight(); app.renderer.requestRender(); } });
    if (app.renderer.view.current.kind === 'globe') app.renderer.view.flyTo({ lon: 15, lat: 10, zoom: 1 }, 1200);
    app.emit('mode', 'pangea');
    app.renderer.requestRender();
  }

  private caption(ma: number): string {
    const es = lang() === 'es';
    const per = this.units.find((u) => u.rank === 'period' && ma <= u.start && ma >= u.end);
    const era = this.units.find((u) => u.rank === 'era' && ma <= u.start && ma >= u.end);
    const ev = this.events.find((e) => e.ma >= ma - 0.01 && e.ma - ma < 30);
    const parts = [per ? (es ? per.name_es : per.name_en) : '', era ? (es ? era.name_es : era.name_en) : ''].filter(Boolean).join(' · ');
    return ev ? `${parts} — ${es ? ev.es : ev.en}` : parts;
  }

  async exit() {
    if (!this.active) return;
    const app = this.app;
    this.bar?.destroy();
    this.bar = null;
    app.renderer.view.insetBottom = 0;
    app.mode = null;
    document.documentElement.classList.remove('mode-time');
    app.renderer.baseMap = true;
    this.shell.card.hide();
    await app.setStack(this.savedStack.length ? this.savedStack : ['political']);
    if (this.savedProjection && this.savedProjection !== app.projection) app.setProjection(this.savedProjection as never);
    app.emit('mode', null);
    app.save();
  }

  private visible(p: Piece) { return this.ma <= p.b + 1e-6 && this.ma >= p.e - 1e-6; }

  /** Streams rotated geometry straight into the projection (no per-frame GeoJSON objects). */
  private streamPiece(stream: GeoStream, m: number[], piece: Piece, polygons: boolean) {
    const emit = (a: Float64Array) => {
      for (let i = 0; i < a.length; i += 3) {
        const x = a[i], y = a[i + 1], z = a[i + 2];
        const X = m[0] * x + m[1] * y + m[2] * z, Y = m[3] * x + m[4] * y + m[5] * z, Z = m[6] * x + m[7] * y + m[8] * z;
        stream.point(Math.atan2(Y, X) * DEG, Math.asin(Math.max(-1, Math.min(1, Z))) * DEG);
      }
    };
    if (polygons) {
      for (const poly of piece.rings) {
        stream.polygonStart();
        for (const ring of poly) { stream.lineStart(); emit(ring); stream.lineEnd(); }
        stream.polygonEnd();
      }
    } else {
      for (const line of piece.lines) { stream.lineStart(); emit(line); stream.lineEnd(); }
    }
  }

  private draw(rc: RenderCtx) {
    if (!this.rot) return;
    const { ctx, view } = rc;
    const mats = new Map<string, number[] | null>();
    const mat = (p: string) => {
      if (!mats.has(p)) { const q = quatAt(this.rot!, p, this.ma); mats.set(p, q ? matrix(q) : null); }
      return mats.get(p)!;
    };
    const stream = view.projection.stream(canvasStream(ctx));
    // Continental shelves (the crust that fits together), then land by today's continent.
    ctx.beginPath();
    for (const s of this.shelves) { if (!this.visible(s)) continue; const m = mat(s.p); if (m) this.streamPiece(stream, m, s, true); }
    ctx.fillStyle = rc.theme.dark ? '#24597a' : '#a9d0e6';
    ctx.fill();
    const groups = new Map<string, Piece[]>();
    for (const s of this.pieces) { if (!this.visible(s)) continue; let g = groups.get(s.cont); if (!g) groups.set(s.cont, (g = [])); g.push(s); }
    for (const [cont, list] of groups) {
      ctx.beginPath();
      for (const s of list) { const m = mat(s.p); if (m) this.streamPiece(stream, m, s, true); }
      ctx.fillStyle = cont === 'SS' ? (rc.theme.dark ? '#9fb3c4' : '#cdd6de') : mix(continentSwatch(cont), rc.theme.dark ? '#ffffff' : '#000000', 0.04);
      ctx.fill();
    }
    ctx.beginPath();
    for (const s of this.pieces) { if (!this.visible(s)) continue; const m = mat(s.p); if (m) this.streamPiece(stream, m, s, false); }
    ctx.strokeStyle = rc.theme.dark ? 'rgba(10,25,45,0.75)' : 'rgba(40,50,70,0.6)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  private centroidOf(conts: string[]): [number, number] | null {
    if (!this.rot) return null;
    let X = 0, Y = 0, Z = 0;
    for (const s of this.pieces) {
      if (!conts.includes(s.cont) || !this.visible(s) || s.area < 1e-4) continue;
      const q = quatAt(this.rot, s.p, this.ma);
      if (!q) continue;
      const m = matrix(q), [x, y, z] = s.c;
      X += (m[0] * x + m[1] * y + m[2] * z) * s.area; Y += (m[3] * x + m[4] * y + m[5] * z) * s.area; Z += (m[6] * x + m[7] * y + m[8] * z) * s.area;
    }
    const len = Math.hypot(X, Y, Z);
    if (len < 1e-9) return null;
    return [Math.atan2(Y, X) * DEG, Math.asin(Z / len) * DEG];
  }

  private labels(rc: RenderCtx) {
    const es = lang() === 'es';
    const big = (text: string, pos: [number, number] | null, pr = 990, size = 22) => {
      if (!pos) return;
      const pt = rc.project(pos[0], pos[1]);
      if (pt) rc.labels.add({ text, x: pt[0], y: pt[1], priority: pr, size, weight: 800, caps: true, color: '#ffffff', halo: 'rgba(0,0,0,0.55)' });
    };
    const all = ['AF', 'SA', 'NA', 'EU', 'AS', 'OC', 'AN'];
    const ma = this.ma;
    if (ma >= 335 && ma <= 1000 && ma >= 750) big('Rodinia', this.centroidOf(all));
    if (ma <= 335 && ma >= 175) {
      const c = this.centroidOf(all);
      big('Pangea', c);
      if (c) big(es ? 'Panthalassa' : 'Panthalassa', [c[0] + 180 > 180 ? c[0] - 180 : c[0] + 180, -c[1]], 600, 16);
    }
    if (ma < 175 && ma >= 100) {
      big('Laurasia', this.centroidOf(['NA', 'EU', 'AS']), 990, 18);
      big('Gondwana', this.centroidOf(['SA', 'AF', 'AN', 'OC']), 990, 18);
    }
    for (const cont of all) {
      const c = this.centroidOf([cont]);
      if (!c) continue;
      const pt = rc.project(c[0], c[1]);
      if (pt) rc.labels.add({ text: t(`cont.${cont}`), x: pt[0], y: pt[1] + 18, priority: 700, size: 12, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  }

  tap(lon: number, lat: number): boolean {
    if (!this.rot) return true;
    const es = lang() === 'es';
    // Take the tapped point back to the present day with each visible plate's inverse rotation.
    const l = lon * RAD, p = lat * RAD;
    const v = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
    for (const s of this.pieces) {
      if (!this.visible(s)) continue;
      const q = quatAt(this.rot, s.p, this.ma);
      if (!q) continue;
      const m = matrix(q); // inverse = transpose
      const x = m[0] * v[0] + m[3] * v[1] + m[6] * v[2], y = m[1] * v[0] + m[4] * v[1] + m[7] * v[2], z = m[2] * v[0] + m[5] * v[1] + m[8] * v[2];
      const p0: [number, number] = [Math.atan2(y, x) * DEG, Math.asin(Math.max(-1, Math.min(1, z))) * DEG];
      if (!geoContains(s.geom as never, p0)) continue;
      const id = this.app.renderer.countryAt(p0[0], p0[1]);
      const m0 = id ? this.app.data.meta[id] : null;
      const rows = [
        { label: es ? 'Hoy es' : 'Today it is', value: m0 ? `${es ? m0.es : m0.n}` : (es ? 'una isla o meseta oceánica' : 'an island or ocean plateau'), icon: '📍' },
        { label: es ? 'Continente actual' : 'Continent today', value: t(`cont.${s.cont}`), icon: '🌍' },
        { label: es ? 'Posición entonces' : 'Position then', value: `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`, icon: '🧭' },
        { label: es ? 'Hoy está en' : 'Today it lies at', value: `${Math.abs(p0[1]).toFixed(0)}°${p0[1] >= 0 ? 'N' : 'S'}, ${Math.abs(p0[0]).toFixed(0)}°${p0[0] >= 0 ? 'E' : 'W'}`, icon: '🗺️' },
      ];
      this.shell.card.showCustom('🌋', easeLabel(this.ma), this.caption(this.ma), rows);
      return true;
    }
    this.shell.card.hide();
    return true;
  }
}

/** Minimal canvas sink for d3 projection streams (moveTo/lineTo; closes polygon rings). */
function canvasStream(ctx: CanvasRenderingContext2D): GeoStream {
  let first = true, poly = false;
  return {
    point(x, y) { if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); },
    lineStart() { first = true; },
    lineEnd() { if (poly) ctx.closePath(); },
    polygonStart() { poly = true; },
    polygonEnd() { poly = false; },
    sphere() { /* not used */ },
  };
}
