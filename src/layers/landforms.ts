// Landforms (mountain ranges, deserts, plateaus...), peaks and volcanoes, rivers and lakes.
import { geoCentroid, geoArea, geoContains } from 'd3-geo';
import { loadJSON, shapesFrom, type Shape } from '../data/store';
import { lang, fmtNumber } from '../app/i18n';
import type { Topology } from 'topojson-specification';
import type { LayerDef } from './types';

interface RP { n: string; es?: string; k: string; sr: number; ml: number }
interface Region extends Shape<RP> { c: [number, number]; area: number }

const KINDS: Record<string, { color: string; en: string; es: string; icon: string }> = {
  'Range/mtn': { color: '#a0522d', en: 'Mountain range', es: 'Cordillera', icon: '⛰️' },
  Plateau: { color: '#c08a4b', en: 'Plateau', es: 'Meseta', icon: '🟫' },
  Desert: { color: '#f2c94c', en: 'Desert', es: 'Desierto', icon: '🏜️' },
  Plain: { color: '#9bd17a', en: 'Plain', es: 'Llanura', icon: '🌾' },
  Lowland: { color: '#b9e3a1', en: 'Lowland', es: 'Tierras bajas', icon: '🌿' },
  Basin: { color: '#5fbfb0', en: 'Basin', es: 'Cuenca', icon: '🥣' },
  Delta: { color: '#3fae6a', en: 'Delta', es: 'Delta', icon: '🔱' },
  Valley: { color: '#7aa95c', en: 'Valley', es: 'Valle', icon: '🏞️' },
  Tundra: { color: '#a7c7c9', en: 'Tundra', es: 'Tundra', icon: '❄️' },
  Wetlands: { color: '#3b9c9c', en: 'Wetlands', es: 'Humedales', icon: '🦆' },
  Depression: { color: '#6e8fb3', en: 'Depression', es: 'Depresión', icon: '⬇️' },
  Foothills: { color: '#c3a17a', en: 'Foothills', es: 'Piedemonte', icon: '🏔️' },
  Gorge: { color: '#8d5a3b', en: 'Gorge', es: 'Garganta', icon: '🪨' },
};
const LABEL_ONLY = new Set(['Peninsula', 'Pen/cape', 'Isthmus', 'Island group', 'Island', 'Coast', 'Geoarea']);

let regions: Region[] = [];
let peaks: { lon: number; lat: number; name: string; es: string | null; elev: number; kind: string; mz: number }[] = [];

async function ensure() {
  if (regions.length) return;
  const [topo, pk] = await Promise.all([
    loadJSON<Topology>('layers/landforms.json'),
    loadJSON<{ rows: unknown[][] }>('layers/peaks.json'),
  ]);
  regions = shapesFrom<RP>(topo, 'regions').map((s) => ({ ...s, c: geoCentroid(s.feature as never) as [number, number], area: geoArea(s.feature as never) }));
  peaks = pk.rows.map((r) => ({ lon: r[0] as number, lat: r[1] as number, name: r[2] as string, es: (r[3] as string) || null, elev: r[4] as number, kind: r[5] as string, mz: r[6] as number }));
}

export const landforms: LayerDef = {
  id: 'landforms', category: 'nature', icon: '🏔️', kind: 'fill', defaultOpacity: 0.7,
  name: { en: 'Landforms', es: 'Formas del relieve' },
  desc: { en: 'Mountain ranges, deserts, plateaus, plains, basins, peaks and volcanoes.', es: 'Cordilleras, desiertos, mesetas, llanuras, cuencas, picos y volcanes.' },
  keywords: 'mountains desert plateau plain peak volcano montañas desierto meseta llanura pico volcan',
  credit: 'Natural Earth geography regions and elevation points (public domain)',
  load: ensure,
  drawFill(rc) {
    const { ctx, path } = rc;
    const by = new Map<string, Region[]>();
    for (const s of rc.visibleShapes(regions)) {
      const k = s.feature.properties.k;
      if (!KINDS[k]) continue;
      let g = by.get(k); if (!g) by.set(k, (g = [])); g.push(s);
    }
    for (const [k, list] of by) {
      ctx.beginPath();
      for (const s of list) path(s.feature as never);
      ctx.fillStyle = KINDS[k].color; ctx.fill();
    }
  },
  drawOverlay(rc) {
    const { ctx } = rc;
    const wz = rc.webZoom;
    for (const p of peaks) {
      if (p.mz > wz + 2.2) continue;
      const pt = rc.project(p.lon, p.lat);
      if (!pt) continue;
      const volcano = /volcan/i.test(p.kind);
      const r = 3.2 + Math.min(2.5, p.elev / 3500);
      ctx.beginPath();
      ctx.moveTo(pt[0], pt[1] - r * 1.2); ctx.lineTo(pt[0] + r, pt[1] + r * 0.8); ctx.lineTo(pt[0] - r, pt[1] + r * 0.8); ctx.closePath();
      ctx.fillStyle = volcano ? '#ff6b3d' : (rc.theme.dark ? '#f5e6d3' : '#6b4226');
      ctx.strokeStyle = rc.theme.dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1; ctx.fill(); ctx.stroke();
    }
  },
  labels(rc) {
    const wz = rc.webZoom;
    const es = lang() === 'es';
    const pxPerRad = rc.view.pxPerRadian;
    for (const s of rc.visibleShapes(regions)) {
      const p = s.feature.properties;
      if (wz < p.ml - 1.2) continue;
      // Label only if the region is reasonably large on screen.
      const px = Math.sqrt(s.area) * pxPerRad;
      if (px < 28 && !LABEL_ONLY.has(p.k)) continue;
      if (LABEL_ONLY.has(p.k) && wz < p.ml) continue;
      const pt = rc.project(s.c[0], s.c[1]);
      if (!pt) continue;
      const kind = KINDS[p.k];
      rc.labels.add({
        text: es && p.es ? p.es : p.n, x: pt[0], y: pt[1], priority: 520 - p.sr * 25,
        size: 10.5 + Math.min(4, px / 120), weight: 600, italic: true, caps: px > 140,
        color: rc.theme.dark ? (kind ? '#fff1d6' : '#d7e7ff') : (kind ? '#5a3418' : '#1f3b63'), halo: rc.theme.labelHalo,
      });
    }
    for (const p of peaks) {
      if (p.mz > wz + 1.2) continue;
      const pt = rc.project(p.lon, p.lat);
      if (!pt) continue;
      rc.labels.add({
        text: es && p.es ? p.es : p.name, sub: `${fmtNumber(p.elev)} m`, x: pt[0] + 4, y: pt[1], align: 'left',
        priority: 450 + p.elev / 100, size: 10, weight: 600, color: rc.theme.dark ? '#ffe9cf' : '#4a2a12', halo: rc.theme.labelHalo,
      });
    }
  },
  legend() {
    const es = lang() === 'es';
    return {
      kind: 'categories', title: es ? 'Formas del relieve' : 'Landforms',
      items: [
        ...Object.values(KINDS).slice(0, 10).map((k) => ({ color: k.color, label: es ? k.es : k.en })),
        { color: '#f5e6d3', label: es ? 'Pico' : 'Peak', shape: 'dot' as const },
        { color: '#ff6b3d', label: es ? 'Volcán' : 'Volcano', shape: 'dot' as const },
      ],
      note: es ? 'Consejo: combínalo con «Relieve sombreado».' : 'Tip: combine with "Shaded relief".',
    };
  },
  pick(lon, lat) {
    const es = lang() === 'es';
    const hits = regions.filter((s) => KINDS[s.feature.properties.k] && geoContains(s.feature as never, [lon, lat]));
    if (!hits.length) return null;
    return hits.slice(0, 3).map((s) => {
      const p = s.feature.properties; const k = KINDS[p.k];
      return { label: es ? k.es : k.en, value: es && p.es ? p.es : p.n, icon: k.icon };
    });
  },
};

// ---- Rivers and lakes ------------------------------------------------------------------------
interface WP { n?: string; es?: string; sr: number }
const water: Partial<Record<'50m' | '10m', { rivers: (Shape<WP> & { c: [number, number] })[]; lakes: (Shape<WP> & { c: [number, number] })[] }>> = {};
async function ensureWater(lod: '50m' | '10m') {
  if (water[lod]) return water[lod]!;
  const topo = await loadJSON<Topology>(`layers/physical-${lod}.json`);
  const wc = (s: Shape<WP>) => ({ ...s, c: geoCentroid(s.feature as never) as [number, number] });
  water[lod] = { rivers: shapesFrom<WP>(topo, 'rivers').map(wc), lakes: shapesFrom<WP>(topo, 'lakes').map(wc) };
  return water[lod]!;
}

export const rivers: LayerDef = {
  id: 'rivers', category: 'nature', icon: '🏞️', kind: 'overlay',
  name: { en: 'Rivers and lakes', es: 'Ríos y lagos' },
  desc: { en: 'Major rivers and lakes, with more detail as you zoom.', es: 'Ríos y lagos principales, con más detalle al acercarte.' },
  keywords: 'water river lake agua rio lago',
  credit: 'Natural Earth (public domain)',
  async load(ctx) { await ensureWater('50m'); void ensureWater('10m').then(() => ctx.requestRender()); },
  drawOverlay(rc) {
    const set = (rc.lod === '10m' && water['10m']) || water['50m'];
    if (!set) return;
    const { ctx, path } = rc;
    const wz = rc.webZoom;
    const maxRank = wz < 3 ? 3 : wz < 4 ? 5 : wz < 5 ? 7 : 12;
    for (const rank of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      if (rank > maxRank) break;
      ctx.beginPath();
      let any = false;
      for (const s of set.rivers) if (s.feature.properties.sr === rank && rc.visibleShapes([s]).length) { path(s.feature as never); any = true; }
      if (!any) continue;
      ctx.strokeStyle = rc.theme.dark ? '#6ec3ff' : '#2f7fc8';
      ctx.lineWidth = Math.max(0.6, (2.6 - rank * 0.22) * Math.min(1.6, 0.6 + wz * 0.15));
      ctx.stroke();
    }
  },
  labels(rc) {
    const set = (rc.lod === '10m' && water['10m']) || water['50m'];
    if (!set) return;
    const wz = rc.webZoom;
    const es = lang() === 'es';
    for (const s of [...set.rivers, ...set.lakes]) {
      const p = s.feature.properties;
      if (!p.n || p.sr > wz * 1.6 - 2.5) continue;
      const pt = rc.project(s.c[0], s.c[1]);
      if (!pt) continue;
      rc.labels.add({ text: es && p.es ? p.es : p.n, x: pt[0], y: pt[1], priority: 360 - p.sr * 20, size: 10, italic: true, weight: 600, color: rc.theme.dark ? '#9fd8ff' : '#1f5f99', halo: rc.theme.labelHalo });
    }
  },
  legend() {
    const es = lang() === 'es';
    return { kind: 'categories', items: [{ color: '#6ec3ff', label: es ? 'Ríos' : 'Rivers', shape: 'line' }, { color: '#16518a', label: es ? 'Lagos' : 'Lakes' }] };
  },
};
