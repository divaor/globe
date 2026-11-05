// Explore tools: measure distances, compare two countries, and move a country's true outline
// around the globe (to see how map projections distort sizes).
import { Ruler, Scale, Scaling, X, Undo2, RotateCcw } from 'lucide';
import { geoDistance, geoInterpolate, geoRotation, geoCentroid, geoArea } from 'd3-geo';
import type { Feature, Geometry, Position } from 'geojson';
import { h, icon, clear, add } from '../ui/dom';
import { t, lang, fmtNumber, fmtCompact, fmtMoney, flagEmoji } from '../app/i18n';
import { loadJSON } from '../data/store';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';

const R_KM = 6371.0088;
const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

interface Tool { id: string; start(): void; stop(): void; tap(lon: number, lat: number, countryId: string | null): void; overlay(rc: RenderCtx): void }

export class Tools {
  private active: Tool | null = null;
  private bar: HTMLElement;
  private tools: Record<string, Tool>;

  constructor(private app: App, private shell: Shell) {
    this.bar = h('div', { class: 'toolbar glass', hidden: true });
    app.root.append(this.bar);
    this.tools = { ruler: this.ruler(), compare: this.compare(), truesize: this.trueSize() };
    shell.addMenu({ id: 'ruler', icon: Ruler, label: () => L('Measure distance', 'Medir distancias'), order: 20, onClick: () => this.start('ruler') });
    shell.addMenu({ id: 'compare', icon: Scale, label: () => L('Compare countries', 'Comparar países'), order: 21, onClick: () => this.start('compare') });
    shell.addMenu({ id: 'truesize', icon: Scaling, label: () => L('True size of countries', 'Tamaño real de los países'), order: 22, onClick: () => this.start('truesize') });
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.active || app.mode) return false;
      if (g) this.active.tap(g[0], g[1], app.renderer.countryAt(g[0], g[1]));
      return true;
    });
    app.renderer.overlays.add((rc) => this.active?.overlay(rc));
    shell.card.actions.push((id) => {
      const b = h('button', { type: 'button', class: 'pill' }, icon(Scale, 16), L('Compare', 'Comparar'));
      b.addEventListener('click', () => { this.start('compare'); this.tools.compare.tap(0, 0, id); });
      return b;
    });
  }

  start(id: string) {
    this.stop();
    this.app.select(null);
    this.active = this.tools[id];
    this.active.start();
    this.bar.hidden = false;
    this.app.renderer.requestRender();
  }

  stop() {
    this.active?.stop();
    this.active = null;
    this.bar.hidden = true;
    this.app.renderer.requestRender();
  }

  private renderBar(title: string, hint: string, value: string, extra: HTMLElement[] = []) {
    clear(this.bar);
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close'), title: t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stop());
    add(this.bar,
      h('div', { class: 'tool-head' }, h('strong', null, title), close),
      value ? h('div', { class: 'tool-value' }, value) : null,
      h('div', { class: 'tool-hint' }, hint),
      extra.length ? h('div', { class: 'tool-actions' }, extra) : null,
    );
  }

  private btn(ic: Parameters<typeof icon>[0], label: string, fn: () => void) {
    const b = h('button', { type: 'button', class: 'pill sm' }, icon(ic, 15), label);
    b.addEventListener('click', fn);
    return b;
  }

  // ---- Ruler ----------------------------------------------------------------------------------
  private ruler(): Tool {
    const pts: [number, number][] = [];
    const total = () => pts.slice(1).reduce((s, p, i) => s + geoDistance(pts[i], p) * R_KM, 0);
    const update = () => {
      const km = total();
      const hours = km / 850 + 0.5;
      const value = pts.length < 2 ? '' : `${fmtNumber(km, 0)} km · ${fmtNumber(km * 0.621371, 0)} mi · ✈️ ${fmtNumber(Math.floor(hours))} h ${fmtNumber(Math.round((hours % 1) * 60))} min`;
      this.renderBar(L('Measure distance', 'Medir distancias'), pts.length < 2 ? L('Tap two or more places on the map.', 'Toca dos o más lugares del mapa.') : L('Shortest routes over the Earth (great circles).', 'Rutas más cortas sobre la Tierra (círculos máximos).'), value, [
        this.btn(Undo2, L('Undo', 'Deshacer'), () => { pts.pop(); update(); this.app.renderer.requestRender(); }),
        this.btn(RotateCcw, L('Clear', 'Borrar'), () => { pts.length = 0; update(); this.app.renderer.requestRender(); }),
      ]);
    };
    return {
      id: 'ruler',
      start: () => { pts.length = 0; update(); },
      stop: () => { pts.length = 0; },
      tap: (lon, lat) => { pts.push([lon, lat]); update(); this.app.renderer.requestRender(); },
      overlay: (rc) => {
        if (!pts.length) return;
        const { ctx, path } = rc;
        if (pts.length > 1) {
          ctx.beginPath(); path({ type: 'LineString', coordinates: pts });
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 5; ctx.stroke();
          ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 6]); ctx.stroke(); ctx.setLineDash([]);
        }
        pts.forEach((p, i) => {
          const s = rc.project(p[0], p[1]);
          if (!s) return;
          ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#ffd43b'; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = '#1b1b1b'; ctx.stroke();
          if (i > 0) {
            const m = geoInterpolate(pts[i - 1], p)(0.5);
            const ms = rc.project(m[0], m[1]);
            if (ms) rc.labels.add({ text: `${fmtNumber(geoDistance(pts[i - 1], p) * R_KM, 0)} km`, x: ms[0], y: ms[1] - 12, priority: 2000, size: 13, weight: 800, color: '#ffd43b', halo: 'rgba(0,0,0,0.8)' });
          }
        });
      },
    };
  }

  // ---- Compare --------------------------------------------------------------------------------
  private compare(): Tool {
    let ids: string[] = [];
    let facts: Record<string, Record<string, unknown>> | null = null;
    void loadJSON<{ data: Record<string, Record<string, unknown>> }>('attributes/countries.json').then((d) => { facts = d.data; }).catch(() => {});
    const COLORS = ['#3bc9db', '#f783ac'];
    const show = () => {
      const meta = this.app.data.meta;
      const names = ids.map((id) => `${flagEmoji(meta[id]?.a2)} ${this.app.data.name(id, lang())}`);
      this.renderBar(L('Compare countries', 'Comparar países'), ids.length < 2 ? L('Tap two countries on the map.', 'Toca dos países en el mapa.') : L('Tap another country to replace the second one.', 'Toca otro país para cambiar el segundo.'), names.join('  vs  '));
      if (ids.length === 2) this.shell.openPanel('compare', L('Compare', 'Comparar'), this.compareTable(ids, facts, COLORS));
    };
    return {
      id: 'compare',
      start: () => { ids = []; show(); },
      stop: () => { ids = []; if (this.shell.sheet.isOpen('compare')) this.shell.sheet.close(); },
      tap: (_lon, _lat, id) => {
        if (!id) return;
        if (ids.length < 2) { if (!ids.includes(id)) ids.push(id); } else ids = [ids[0], id];
        show();
        this.app.renderer.requestRender();
      },
      overlay: (rc) => {
        const { ctx, path } = rc;
        ids.forEach((id, i) => {
          const s = rc.level.byId.get(id);
          if (!s) return;
          ctx.beginPath(); path(s.feature as never);
          ctx.fillStyle = COLORS[i] + '88'; ctx.fill();
          ctx.strokeStyle = COLORS[i]; ctx.lineWidth = 2.5; ctx.stroke();
        });
      },
    };
  }

  private compareTable(ids: string[], facts: Record<string, Record<string, unknown>> | null, colors: string[]): HTMLElement {
    const meta = this.app.data.meta;
    const f = (id: string) => facts?.[id] ?? facts?.[meta[id]?.iso ?? ''] ?? {};
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    const rows: [string, string, (id: string) => number | null, (v: number) => string][] = [
      ['👥', L('Population', 'Población'), (id) => num(f(id).population) ?? meta[id]?.pop ?? null, (v) => fmtCompact(v)],
      ['📐', L('Area', 'Superficie'), (id) => num(f(id).area_km2), (v) => `${fmtCompact(v)} km²`],
      ['🏙️', L('People per km²', 'Personas por km²'), (id) => num(f(id).pop_density), (v) => fmtNumber(v, 0)],
      ['💰', L('GDP per person', 'PIB por persona'), (id) => num(f(id).gdp_per_capita), (v) => fmtMoney(v)],
      ['🏦', L('GDP', 'PIB'), (id) => num(f(id).gdp_usd), (v) => fmtMoney(v)],
      ['❤️', L('Life expectancy', 'Esperanza de vida'), (id) => num(f(id).life_expectancy), (v) => `${fmtNumber(v, 1)}`],
      ['🎂', L('Median age', 'Edad mediana'), (id) => num(f(id).median_age), (v) => fmtNumber(v, 1)],
      ['📈', L('Human development', 'Desarrollo humano'), (id) => num(f(id).hdi), (v) => fmtNumber(v, 3)],
      ['🌐', L('Internet users', 'Usuarios de internet'), (id) => num(f(id).internet_users_pct), (v) => `${fmtNumber(v, 0)}%`],
      ['🏭', L('CO₂ per person', 'CO₂ por persona'), (id) => num(f(id).co2_per_capita), (v) => `${fmtNumber(v, 1)} t`],
      ['♻️', L('Renewable electricity', 'Electricidad renovable'), (id) => num(f(id).renewables_share_elec), (v) => `${fmtNumber(v, 0)}%`],
      ['🏖️', L('Coastline', 'Costa'), (id) => num(f(id).coastline_km), (v) => `${fmtCompact(v)} km`],
      ['🏔️', L('Highest point', 'Punto más alto'), (id) => num(f(id).highest_point_m), (v) => `${fmtNumber(v)} m`],
      ['🏅', L('Olympic medals', 'Medallas olímpicas'), (id) => num(f(id).olympic_medals), (v) => fmtNumber(v)],
    ];
    const head = h('div', { class: 'cmp-head' }, h('span'), ...ids.map((id, i) => h('span', { class: 'cmp-name', style: { color: colors[i] } }, `${flagEmoji(meta[id]?.a2)} ${this.app.data.name(id, lang())}`)));
    const table = h('div', { class: 'cmp' }, head);
    for (const [ic, label, get, fmt] of rows) {
      const a = get(ids[0]), b = get(ids[1]);
      if (a === null && b === null) continue;
      const ratio = a && b ? (a >= b ? a / b : b / a) : null;
      table.append(h('div', { class: 'cmp-row' },
        h('span', { class: 'cmp-label' }, `${ic} ${label}`),
        h('span', { class: `cmp-val${a !== null && b !== null && a > b ? ' win' : ''}` }, a === null ? '—' : fmt(a)),
        h('span', { class: `cmp-val${a !== null && b !== null && b > a ? ' win' : ''}` }, b === null ? '—' : fmt(b)),
        ratio && ratio >= 1.05 ? h('span', { class: 'cmp-ratio' }, `×${fmtNumber(ratio, ratio < 10 ? 1 : 0)}`) : h('span')));
    }
    return table;
  }

  // ---- True size ------------------------------------------------------------------------------
  private trueSize(): Tool {
    let src: Feature<Geometry> | null = null, id: string | null = null, center: [number, number] = [0, 0], target: [number, number] | null = null;
    let moved: Feature<Geometry> | null = null;
    const move = () => {
      if (!src || !target) { moved = src; return; }
      const r1 = geoRotation([-center[0], -center[1]]);
      const r2 = geoRotation([-target[0], -target[1]]);
      const map = (c: Position): Position => r2.invert(r1([c[0], c[1]]) as [number, number]) as Position;
      const g = src.geometry;
      const coords = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      moved = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: coords.map((p) => p.map((ring) => ring.map(map))) } };
    };
    const update = () => {
      const name = id ? this.app.data.name(id, lang()) : '';
      const km2 = src ? geoArea(src as never) * R_KM * R_KM : 0;
      this.renderBar(L('True size', 'Tamaño real'), !src ? L('Tap a country to pick it up.', 'Toca un país para tomarlo.') : L('Tap anywhere to move it there. Sizes stay true; the map stretches them.', 'Toca cualquier lugar para moverlo. Su tamaño real se conserva; el mapa lo deforma.'),
        src ? `${name} · ${fmtCompact(km2)} km²` : '', [
          this.btn(RotateCcw, L('Pick another', 'Elegir otro'), () => { src = moved = null; id = null; target = null; update(); this.app.renderer.requestRender(); }),
          this.btn(Scaling, L('Switch to Mercator', 'Cambiar a Mercator'), () => this.app.setProjection('mercator')),
        ]);
    };
    return {
      id: 'truesize',
      start: () => { src = moved = null; id = null; target = null; update(); },
      stop: () => { src = moved = null; id = null; },
      tap: (lon, lat, cid) => {
        if (!src) {
          if (!cid) return;
          const s = this.app.data.best('50m').byId.get(cid);
          if (!s) return;
          src = s.feature as Feature<Geometry>; id = cid;
          center = geoCentroid(src as never) as [number, number];
          target = null;
        } else target = [lon, lat];
        move(); update(); this.app.renderer.requestRender();
      },
      overlay: (rc) => {
        if (!moved) return;
        const { ctx, path } = rc;
        ctx.beginPath(); path(moved as never);
        ctx.fillStyle = 'rgba(255,146,43,0.62)'; ctx.fill();
        ctx.strokeStyle = '#fff3bf'; ctx.lineWidth = 3; ctx.stroke();
        const c = geoCentroid(moved as never);
        const p = rc.project(c[0], c[1]);
        if (p && id) rc.labels.add({ text: this.app.data.name(id, lang()), x: p[0], y: p[1], priority: 2000, size: 14, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.8)' });
      },
    };
  }
}
