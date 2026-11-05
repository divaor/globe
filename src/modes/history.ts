// Political map through time: world borders from 123,000 BC to today (54 historical snapshots plus
// a present-day map built from the current borders). A timeline
// bar picks the start and end; playing crossfades from snapshot to snapshot, and the "What changed"
// panel lists what appeared, disappeared, grew or shrank.
import { geoArea, geoCentroid, geoContains } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, MultiLineString, Polygon } from 'geojson';
import { loadJSON, shapesFrom, chunkLines, type Shape, type Line } from '../data/store';
import { oklch } from '../engine/colors';
import { t, lang, fmtNumber } from '../app/i18n';
import { h, clear } from '../ui/dom';
import { TimeBar } from '../ui/timebar';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { LayerDef, RenderCtx } from '../layers/types';

interface Snap { year: number; file: string; label_en: string; label_es: string; features: number }
// d / ds: current English / Spanish name (present-day map, where the entity's name is the 2010 one),
// rn: name before an official rename since the previous map.
interface HP { n?: string; s?: string; p?: string; pr: number; c?: number; d?: string; ds?: string; rn?: string; rns?: string }
interface HShape extends Shape<HP> { area: number; lp: [number, number] }
interface Loaded { shapes: HShape[]; borders: Line[]; coast: Line[] }
interface Change { from: number; to: number; appeared: string[]; disappeared: string[]; grew: [string, number][]; shrank: [string, number][]; renamed?: string[][] }

/** The name to show for a polity: today's name on the present-day map, else the historical one. */
const nameOf = (p: HP) => (lang() === 'es' ? p.ds : undefined) ?? p.d ?? p.n ?? '';
interface Entity { c: number; first: number; last: number; n: number }

const COLORS = Array.from({ length: 24 }, (_, i) => oklch([0.74, 0.64, 0.82][i % 3], [0.12, 0.14, 0.1][i % 3], (i * 137.508 + 20) % 360));
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const ERAS: { from: number; to: number; en: string; es: string; color: string }[] = [
  { from: -200000, to: -3000, en: 'Prehistory', es: 'Prehistoria', color: '#5b4a8b' },
  { from: -3000, to: 500, en: 'Ancient', es: 'Antigüedad', color: '#8b5a2b' },
  { from: 500, to: 1500, en: 'Middle Ages', es: 'Edad Media', color: '#2b6f8b' },
  { from: 1500, to: 1800, en: 'Early modern', es: 'Edad Moderna', color: '#2b8b5a' },
  { from: 1800, to: 3000, en: 'Modern', es: 'Edad Contemporánea', color: '#8b2b4f' },
];

export class HistoryMode {
  private snaps: Snap[] = [];
  private entities: Record<string, Entity> = {};
  private changes: Change[] = [];
  private loaded = new Map<number, Loaded>();
  private loading = new Map<number, Promise<Loaded>>();
  private bar: TimeBar | null = null;
  private pos = 0; // continuous snapshot index
  private savedStack: string[] = [];
  private savedProjection: string | null = null;
  readonly layer: LayerDef;

  constructor(private app: App, private shell: Shell) {
    const self = this;
    this.layer = {
      id: 'history', category: 'political', icon: '🏛️', kind: 'fill', hidden: true,
      name: { en: 'Borders through time', es: 'Fronteras en el tiempo' },
      desc: { en: 'Historical political borders.', es: 'Fronteras políticas históricas.' },
      credit: 'Historical borders: aourednik/historical-basemaps (GPL-3.0)',
      drawFill(rc) { self.draw(rc); },
      labels(rc) { self.labels(rc); },
      legend() {
        const es = lang() === 'es';
        return {
          kind: 'html', title: es ? 'Fronteras históricas' : 'Historical borders',
          html: `<div class="lg-row">${es ? 'Cada color es una entidad política; los colores se mantienen en el tiempo.' : 'Each colour is one polity; colours stay the same over time.'}</div>
                 <div class="lg-row muted">${es ? 'Las fronteras antiguas son aproximadas.' : 'Older borders are approximate.'}</div>`,
        };
      },
    };
    app.register([this.layer]);
  }

  get active() { return this.app.mode === 'history'; }

  private async ensureIndex() {
    if (this.snaps.length) return;
    const [idx, ent, ch] = await Promise.all([
      loadJSON<{ snapshots: Snap[] }>('history/index.json'),
      loadJSON<Record<string, Entity>>('history/entities.json'),
      loadJSON<Change[]>('history/changes.json'),
    ]);
    this.snaps = idx.snapshots;
    this.entities = ent;
    this.changes = ch;
  }

  private load(i: number): Promise<Loaded> {
    const have = this.loaded.get(i);
    if (have) return Promise.resolve(have);
    let p = this.loading.get(i);
    if (!p) {
      p = loadJSON<Topology>(`history/${this.snaps[i].file}`).then((topo) => {
        const shapes = shapesFrom<HP>(topo, 'world').map((s) => {
          const geom = s.feature.geometry;
          // Label point: centroid of the largest polygon part.
          let best: Feature<Polygon> | null = null, bestA = -1;
          if (geom.type === 'MultiPolygon') {
            for (const c of geom.coordinates) { const f: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: c } }; const a = geoArea(f); if (a > bestA) { bestA = a; best = f; } }
          }
          return { ...s, area: geoArea(s.feature as never), lp: geoCentroid((best ?? s.feature) as never) as [number, number] };
        });
        const obj = topo.objects.world as GeometryCollection;
        const borders = chunkLines(mesh(topo, obj, (a, b) => a !== b && (a.properties as HP)?.n !== (b.properties as HP)?.n) as MultiLineString);
        const coast = chunkLines(mesh(topo, obj, (a, b) => a === b) as MultiLineString);
        const l = { shapes, borders, coast };
        this.loaded.set(i, l);
        if (this.loaded.size > 12) { const first = this.loaded.keys().next().value; if (first !== undefined && Math.abs(first - this.pos) > 3) this.loaded.delete(first); }
        this.app.renderer.requestRender();
        return l;
      });
      this.loading.set(i, p);
      p.finally(() => this.loading.delete(i));
    }
    return p;
  }

  private label(i: number) {
    const s = this.snaps[Math.max(0, Math.min(this.snaps.length - 1, i))];
    return lang() === 'es' ? s.label_es : s.label_en;
  }

  /** Snapshot shown "mostly" at the current position. */
  private dominant() {
    const i0 = Math.floor(this.pos), f = this.pos - i0;
    return Math.min(this.snaps.length - 1, smooth(0.55, 1, f) > 0.5 ? i0 + 1 : i0);
  }

  private yearFrac(year: number) {
    // Position of a year on the snapshot-index scale (for bands and ticks).
    const ys = this.snaps.map((s) => s.year);
    if (year <= ys[0]) return 0;
    if (year >= ys[ys.length - 1]) return 1;
    let i = 0; while (ys[i + 1] < year) i++;
    return (i + (year - ys[i]) / (ys[i + 1] - ys[i])) / (ys.length - 1);
  }

  async enter() {
    if (this.active) return;
    await this.ensureIndex();
    const app = this.app;
    this.savedStack = app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id);
    this.savedProjection = app.projection;
    app.mode = 'history';
    document.documentElement.classList.add('mode-time');
    app.select(null);
    app.renderer.baseMap = false;
    await app.setStack(['history']);
    const n = this.snaps.length;
    const startIdx = Math.max(0, this.snaps.findIndex((s) => s.year >= 1000));
    this.pos = startIdx;
    void this.load(startIdx); void this.load(Math.min(n - 1, startIdx + 1));
    const es = lang() === 'es';
    this.bar = new TimeBar({
      title: es ? 'Fronteras en el tiempo' : 'Borders through time',
      subtitle: es ? `${n} mapas` : `${n} maps`,
      steps: n,
      format: (f) => this.label(Math.round(f * (n - 1))),
      bands: ERAS.map((e) => ({ from: this.yearFrac(e.from), to: this.yearFrac(e.to), color: e.color, label: es ? e.es : e.en })),
      ticks: [-123000, -3000, -500, 1, 1000, 1500, 1800, 1914, this.snaps[this.snaps.length - 1].year].map((y) => ({ at: this.yearFrac(y), label: y < 0 ? (es ? `${-y} a. C.` : `${-y} BC`) : String(y) })).filter((tk) => tk.at >= 0),
      start: startIdx / (n - 1), end: 1, pos: startIdx / (n - 1),
      rate: 1 / (n - 1) / 1.8,
      onPos: (f) => this.setPos(f * (n - 1)),
      onExit: () => this.exit(),
      onList: () => this.openChanges(),
      listLabel: t('whatChanged'),
    });
    app.root.append(this.bar.el);
    requestAnimationFrame(() => { if (this.bar) { app.renderer.view.insetBottom = this.bar.coveredHeight(); app.renderer.requestRender(); } });
    app.emit('mode', 'history');
    app.renderer.requestRender();
  }

  private setPos(p: number) {
    this.pos = p;
    const i0 = Math.floor(p);
    void this.load(i0);
    if (i0 + 1 < this.snaps.length) void this.load(i0 + 1);
    if (i0 + 2 < this.snaps.length) void this.load(i0 + 2);
    this.app.renderer.requestRender();
    if (this.shell.sheet.isOpen('changes')) this.openChanges(true);
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
    if (this.shell.sheet.isOpen('changes')) this.shell.sheet.close();
    app.select(null);
    this.shell.card.hide();
    await app.setStack(this.savedStack.length ? this.savedStack : ['political']);
    if (this.savedProjection && this.savedProjection !== app.projection) app.setProjection(this.savedProjection as never);
    app.emit('mode', null);
    app.save();
  }

  private draw(rc: RenderCtx) {
    const { ctx, path } = rc;
    const i0 = Math.floor(this.pos);
    const blend = smooth(0.55, 1, this.pos - i0);
    const layers: [number, number][] = [[i0, 1]];
    if (blend > 0 && i0 + 1 < this.snaps.length) layers.push([i0 + 1, blend]);
    const base = ctx.globalAlpha;
    const unclaimed = rc.theme.dark ? '#6b7682' : '#d9d2c3';
    for (const [i, a] of layers) {
      const l = this.loaded.get(i);
      if (!l) continue;
      ctx.globalAlpha = base * a;
      const by = new Map<string, HShape[]>();
      for (const s of rc.visibleShapes(l.shapes)) {
        const c = s.feature.properties.c;
        const col = s.feature.properties.n && c !== undefined ? COLORS[c % COLORS.length] : unclaimed;
        let g = by.get(col); if (!g) by.set(col, (g = [])); g.push(s);
      }
      for (const [col, list] of by) {
        ctx.beginPath();
        for (const s of list) path(s.feature as never);
        ctx.fillStyle = col; ctx.fill();
      }
      ctx.beginPath();
      for (const ln of rc.visibleLines(l.coast)) path(ln.geometry);
      ctx.strokeStyle = rc.theme.coast; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.beginPath();
      for (const ln of rc.visibleLines(l.borders)) path(ln.geometry);
      ctx.strokeStyle = rc.theme.border; ctx.lineWidth = 0.9; ctx.stroke();
    }
    ctx.globalAlpha = base;
  }

  private labels(rc: RenderCtx) {
    const l = this.loaded.get(this.dominant());
    if (!l) return;
    const pxr = rc.view.pxPerRadian;
    for (const s of l.shapes) {
      if (!s.feature.properties.n) continue;
      const n = nameOf(s.feature.properties);
      const px = Math.sqrt(s.area) * pxr;
      if (px < 34) continue;
      const pt = rc.project(s.lp[0], s.lp[1]);
      if (!pt) continue;
      rc.labels.add({
        text: n, x: pt[0], y: pt[1], priority: 500 + Math.min(400, px), size: Math.max(9.5, Math.min(17, 8 + px / 40)),
        weight: 700, caps: px > 160, color: rc.theme.label, halo: rc.theme.labelHalo,
      });
    }
  }

  /** Info about the polity under a tapped point (called by the shell in this mode). */
  tap(lon: number, lat: number): boolean {
    const l = this.loaded.get(this.dominant());
    if (!l) return true;
    const hit = l.shapes.find((s) => s.feature.properties.n && geoContains(s.feature as never, [lon, lat]));
    if (!hit) { this.shell.card.hide(); return true; }
    const p = hit.feature.properties;
    const es = lang() === 'es';
    const e = this.entities[p.n!];
    const yl = (y: number) => (y < 0 ? (es ? `${fmtNumber(-y)} a. C.` : `${fmtNumber(-y)} BC`) : String(y));
    const rows = [
      ...(p.rn ? [{ label: es ? 'Antes' : 'Formerly', value: (es ? p.rns : undefined) ?? p.rn, icon: '✏️' }] : []),
      ...(p.s ? [{ label: es ? 'Bajo' : 'Under', value: p.s, icon: '👑' }] : []),
      ...(p.p ? [{ label: es ? 'Parte de' : 'Part of', value: p.p, icon: '🧩' }] : []),
      ...(e ? [{ label: es ? 'En los mapas' : 'On the maps', value: `${yl(e.first)} – ${yl(e.last)}`, icon: '📅' }] : []),
      { label: es ? 'Superficie aprox.' : 'Approx. area', value: `${fmtNumber(Math.round(hit.area * 6371 * 6371 / 1000) * 1000)} km²`, icon: '📐' },
      { label: es ? 'Precisión de la frontera' : 'Border precision', value: [es ? 'aproximada' : 'approximate', es ? 'moderada' : 'moderate', es ? 'reconocida' : 'recognised'][Math.max(0, Math.min(2, (p.pr || 1) - 1))], icon: '📏' },
    ];
    const name = nameOf(p);
    const wiki = `https://${es ? 'es' : 'en'}.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(name)}`;
    this.shell.card.showCustom('🏛️', name, this.label(this.dominant()), rows, [{ label: t('wikipedia'), href: wiki }]);
    return true;
  }

  private openChanges(refresh = false) {
    if (!refresh && this.shell.sheet.isOpen('changes')) { this.shell.sheet.close(); return; }
    const di = this.dominant();
    const es = lang() === 'es';
    const ch = this.changes.find((c) => c.to === this.snaps[di].year);
    const body = h('div', { class: 'changes' });
    const title = `${t('whatChanged')}: ${this.label(Math.max(0, di - 1))} → ${this.label(di)}`;
    if (!ch) body.append(h('p', { class: 'muted' }, es ? 'Este es el primer mapa.' : 'This is the first map.'));
    else {
      // Names as shown on the map they belong to (today's names on the present-day map).
      const shown = (name: string, i: number) => {
        const sh = this.loaded.get(i)?.shapes.find((x) => x.feature.properties.n === name);
        return sh ? nameOf(sh.feature.properties) : name;
      };
      const section = (label: string, icon: string, items: (string | [string, number])[], at = di) => {
        if (!items.length) return;
        const list = h('div', { class: 'chip-row' });
        for (const it of items) {
          const name = Array.isArray(it) ? it[0] : it;
          const pct = Array.isArray(it) ? ` ${it[1] > 0 ? '+' : ''}${it[1]}%` : '';
          const b = h('button', { type: 'button', class: 'chip' }, `${shown(name, at)}${pct}`);
          b.addEventListener('click', () => this.locate(name));
          list.append(b);
        }
        body.append(h('h3', { class: 'sec-title' }, `${icon} ${label}`), list);
      };
      section(es ? 'Aparecen' : 'Appeared', '🟢', ch.appeared);
      section(es ? 'Desaparecen' : 'Disappeared', '⚫', ch.disappeared, Math.max(0, di - 1));
      section(es ? 'Crecen' : 'Grew', '📈', ch.grew);
      section(es ? 'Se reducen' : 'Shrank', '📉', ch.shrank);
      if (ch.renamed?.length) {
        const list = h('div', { class: 'chip-row' });
        for (const [from, to, fromEs, toEs] of ch.renamed) {
          const b = h('button', { type: 'button', class: 'chip' }, es ? `${fromEs ?? from} → ${toEs ?? to}` : `${from} → ${to}`);
          b.addEventListener('click', () => this.locate(from));
          list.append(b);
        }
        body.append(h('h3', { class: 'sec-title' }, `✏️ ${es ? 'Cambian de nombre' : 'Renamed'}`), list);
      }
      if (!body.childElementCount) body.append(h('p', { class: 'muted' }, es ? 'Sin cambios grandes.' : 'No big changes.'));
    }
    if (refresh) { const el = this.shell.sheet.el.querySelector('.sheet-body'); if (el) { clear(el); el.append(body); } this.shell.sheet.setTitle(title); }
    else this.shell.openPanel('changes', title, body);
  }

  private locate(name: string) {
    const l = this.loaded.get(this.dominant()) ?? this.loaded.get(Math.floor(this.pos));
    const s = l?.shapes.filter((x) => x.feature.properties.n === name).sort((a, b) => b.area - a.area)[0];
    if (!s) return;
    const span = Math.sqrt(s.area) * 57.3;
    this.app.flyTo(s.lp[0], s.lp[1], Math.max(1, Math.min(8, 60 / Math.max(5, span))));
  }
}

export default function register(app: App, shell: Shell) {
  return new HistoryMode(app, shell);
}
