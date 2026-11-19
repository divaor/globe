// Journey to the centre of the Earth (v0.32.0): earthquakes by depth (with a slice across them), mantle hotspots and
// the island chains they built, the magnetic Earth (the poles' wander, where a compass points), and underground
// wonders (caves, geysers and hot springs, impact craters, mines).
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { LayerDef, LayerHit, LayerInstance, LayerTapUi, RenderCtx } from '../types';
import { loadJSON } from '../../data/store';
import { fmtNumber, lang, Lc, tx, nm } from '../../app/i18n';
import { L } from '../../play/host';
import { h } from '../../ui/dom';
import { geoDistance, geoInterpolate } from 'd3-geo';
import { declination, type WMM } from '../../earth/wmm';
import { appLocale } from '../../app/i18n';

const T = (o: { en: string; es: string } | undefined) => (o ? (tx(o)) : '');
/** The item nearest the tap, within `r` px. */
function nearest<T>(items: T[], at: (t: T) => [number, number], ui: LayerTapUi, r = 16): T | null {
  let best: T | null = null, bd = r * r;
  for (const it of items) {
    const [lon, lat] = at(it); const p = ui.project(lon, lat);
    if (!p) continue;
    const d = (p[0] - ui.x) ** 2 + (p[1] - ui.y) ** 2;
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}
let APP: App | null = null;
let SHELL: Shell | null = null;

// ---- Earthquakes by depth --------------------------------------------------------------------------------------
interface Quakes { n: number; lon: number[]; lat: number[]; d: number[]; m: number[]; t: number[]; big: Record<string, string> }
let quakes: Quakes | null = null;
let qLoad: Promise<Quakes | null> | null = null;
const loadQuakes = () => (qLoad ??= loadJSON<Quakes>('earth/quakes.json').then((q) => (quakes = q)).catch(() => null));
const DEPTHS = [
  { id: 'shallow', color: '#ff6b4a', en: 'Shallow (0–70 km)', es: 'Someros (0–70 km)' },
  { id: 'mid', color: '#ffd43b', en: 'Intermediate (70–300 km)', es: 'Intermedios (70–300 km)' },
  { id: 'deep', color: '#4dabf7', en: 'Deep (300–700 km)', es: 'Profundos (300–700 km)' },
];
const classOf = (km: number) => (km < 70 ? 0 : km < 300 ? 1 : 2);
const SHADES = ['#ff6b4a', '#ffa94d', '#ffd43b', '#74c0fc', '#4dabf7', '#9775fa'];
const shadeOf = (km: number) => (km < 70 ? 0 : km < 150 ? 1 : km < 300 ? 2 : km < 450 ? 3 : km < 600 ? 4 : 5);
const dayText = (day: number) => new Date(day * 86400000).toLocaleDateString(appLocale(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
/** The slice: two ends, drawn on the map; its cross-section opens in a panel. */
let slice: { a: [number, number] | null; b: [number, number] | null; picking: boolean } = { a: null, b: null, picking: false };

const okQuake = (q: Quakes, i: number, inst: LayerInstance) => {
  const want = String(inst.options.depth ?? 'all'), minM = Number(inst.options.mag ?? 5.5) * 10 - 0.01;
  const cls = want === 'all' ? -1 : DEPTHS.findIndex((d) => d.id === want);
  return q.m[i] >= minM && (cls < 0 || classOf(q.d[i]) === cls);
};

export const quakeDepths: LayerDef = {
  id: 'quake-depths', category: 'earth', icon: '💥', kind: 'overlay', stackOrder: 5,
  name: { en: 'Earthquakes by depth', es: 'Terremotos por profundidad' },
  desc: { en: 'Every earthquake of magnitude 5.5 or more since 1970, about 27,000, coloured by how deep it started: shallow under ridges and faults, down to 700 km under the trenches. Draw a slice to see them from the side.', es: 'Todos los terremotos de magnitud 5,5 o más desde 1970, unos 27 000, coloreados según la profundidad a la que empezaron: someros bajo dorsales y fallas, hasta 700 km bajo las fosas. Traza un corte para verlos de lado.' },
  keywords: 'earthquake depth deep slab subduction seismic usgs since 1970 terremoto sismo profundidad profundo subduccion',
  credit: 'U.S. Geological Survey, ANSS Comprehensive Catalog (public domain)',
  options: [
    { id: 'depth', label: { en: 'Depth', es: 'Profundidad' }, type: 'select', default: 'all', choices: [{ value: 'all', label: { en: 'All depths', es: 'Todas' } }, ...DEPTHS.map((d) => ({ value: d.id, label: { en: d.en, es: d.es } }))] },
    { id: 'mag', label: { en: 'Magnitude', es: 'Magnitud' }, type: 'select', default: '5.5', choices: [
      { value: '5.5', label: { en: '5.5 and more', es: '5,5 o más' } }, { value: '6.5', label: { en: '6.5 and more', es: '6,5 o más' } }, { value: '7.5', label: { en: '7.5 and more', es: '7,5 o más' } },
    ] },
  ],
  load: async () => { await loadQuakes(); },
  onDeactivate() { slice = { a: null, b: null, picking: false }; },
  drawOverlay(rc: RenderCtx, inst: LayerInstance) {
    const q = quakes;
    if (!q) return;
    const { ctx } = rc;
    const scale = Math.min(1.8, 0.7 + rc.webZoom * 0.18);
    const bins: number[][] = SHADES.map(() => []);
    for (let i = 0; i < q.n; i++) {
      if (!okQuake(q, i, inst)) continue;
      const p = rc.project(q.lon[i] / 100, q.lat[i] / 100);
      if (!p) continue;
      bins[shadeOf(q.d[i])].push(p[0], p[1], (1.1 + (q.m[i] - 55) * 0.16) * scale);
    }
    // Shallow first, deep on top: the deep are fewer, and the point of the map.
    bins.forEach((b, k) => {
      if (!b.length) return;
      ctx.beginPath();
      for (let j = 0; j < b.length; j += 3) { ctx.moveTo(b[j] + b[j + 2], b[j + 1]); ctx.arc(b[j], b[j + 1], b[j + 2], 0, Math.PI * 2); }
      ctx.globalAlpha = 0.85; ctx.fillStyle = SHADES[k]; ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = 0.5; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    });
    // The slice line.
    if (slice.a) {
      const pa = rc.project(slice.a[0], slice.a[1]);
      if (pa) { ctx.beginPath(); ctx.arc(pa[0], pa[1], 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      if (slice.b) {
        const ip = geoInterpolate(slice.a, slice.b);
        ctx.beginPath(); let on = false;
        for (let k = 0; k <= 60; k++) { const p = rc.project(...(ip(k / 60) as [number, number])); if (!p) { on = false; continue; } if (on) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); on = true; }
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
        const pb = rc.project(slice.b[0], slice.b[1]);
        if (pb) { ctx.beginPath(); ctx.arc(pb[0], pb[1], 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      }
    }
  },
  labels(rc, inst) {
    const q = quakes;
    if (!q) return;
    const minM = Math.max(80, Number(inst.options.mag ?? 5.5) * 10);
    for (let i = 0; i < q.n; i++) {
      if (q.m[i] < minM || !okQuake(q, i, inst)) continue;
      const p = rc.project(q.lon[i] / 100, q.lat[i] / 100);
      if (!p) continue;
      rc.labels.add({ text: `${new Date(q.t[i] * 86400000).getUTCFullYear()} · M${fmtNumber(q.m[i] / 10, 1)}`, x: p[0], y: p[1], gap: 6, priority: 300 + q.m[i], size: 10, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const q = quakes;
    const minM = Number(inst.options.mag ?? 5.5) * 10 - 0.01;
    const count = (k: number) => (q ? q.d.reduce((a, d, i) => a + (q.m[i] >= minM && classOf(d) === k ? 1 : 0), 0) : 0);
    return {
      kind: 'categories', title: L('Earthquakes since 1970, by depth', 'Terremotos desde 1970, por profundidad'),
      items: DEPTHS.map((d, k) => ({ color: d.color, label: `${tx(d)} · ${fmtNumber(count(k))}`, shape: 'dot' as const })),
      note: L('The deepest start about 700 km down, inside plates that sink into the mantle under Tonga, Japan and South America. The bigger the dot, the stronger the quake.',
        'Los más profundos empiezan a unos 700 km, dentro de placas que se hunden en el manto bajo Tonga, Japón y Sudamérica. Cuanto más grande el punto, más fuerte el sismo.'),
      actions: [{ label: L('Draw a slice', 'Trazar un corte'), icon: '✂️', primary: true, onClick: () => startSlice() }],
    };
  },
  tap(_lon, _lat, inst, ui) {
    const q = quakes;
    if (!q) return false;
    const idx = Array.from({ length: q.n }, (_, i) => i).filter((i) => okQuake(q, i, inst));
    const i = nearest(idx, (k) => [q.lon[k] / 100, q.lat[k] / 100], ui, 12);
    if (i == null) return false;
    const d = q.d[i];
    ui.card('💥', `M${fmtNumber(q.m[i] / 10, 1)} · ${dayText(q.t[i])}`, q.big[i] ?? `${fmtNumber(Math.abs(q.lat[i] / 100), 1)}°${q.lat[i] >= 0 ? 'N' : 'S'}, ${fmtNumber(Math.abs(q.lon[i] / 100), 1)}°${q.lon[i] >= 0 ? 'E' : L('W', 'O')}`, [
      { label: L('Depth', 'Profundidad'), value: `${fmtNumber(d)} km · ${tx(DEPTHS[classOf(d)])}`, icon: '⬇️' },
      { label: L('Magnitude', 'Magnitud'), value: fmtNumber(q.m[i] / 10, 1), icon: '📈' },
    ], [{ label: 'USGS', href: `https://earthquake.usgs.gov/earthquakes/search/` }],
    [d >= 300 ? L('This deep, rock should be too hot to break: deep earthquakes happen inside cold plates sinking into the mantle.', 'A esta profundidad la roca debería estar demasiado caliente para romperse: los sismos profundos ocurren dentro de placas frías que se hunden en el manto.')
      : d >= 70 ? L('An intermediate-depth quake: inside a plate going down under another one.', 'Un sismo de profundidad intermedia: dentro de una placa que se hunde bajo otra.')
        : L('A shallow quake, in the crust or the top of the mantle: the kind that does most damage.', 'Un sismo somero, en la corteza o en lo alto del manto: el tipo que más daños causa.')]);
    return true;
  },
};

/** Draw a slice: two taps on the map, then the quakes within 150 km of the line, from the side. */
function startSlice() {
  slice = { a: null, b: null, picking: true };
  SHELL?.toast(L('Tap where the slice starts, then where it ends (across Japan, the Andes or Tonga).', 'Toca donde empieza el corte y luego donde termina (a través de Japón, los Andes o Tonga).'), 4000);
  APP?.renderer.requestRender();
}
export function setSlice(a: [number, number], b: [number, number]) { slice = { a, b, picking: false }; SHELL?.hideToast(); openSlice(); APP?.renderer.requestRender(); }
export const sliceInfo = () => ({ ...slice });
function openSlice() {
  const q = quakes, inst = APP?.instance('quake-depths');
  if (!q || !slice.a || !slice.b || !SHELL || !inst) return;
  const total = geoDistance(slice.a, slice.b) * 6371;
  const pts: [number, number, number, number][] = [];
  const toRad = Math.PI / 180;
  // Distance from the line (km) and along it (km), on the sphere.
  const a = slice.a, b = slice.b;
  const v = (lon: number, lat: number) => [Math.cos(lat * toRad) * Math.cos(lon * toRad), Math.cos(lat * toRad) * Math.sin(lon * toRad), Math.sin(lat * toRad)];
  const A = v(a[0], a[1]), B = v(b[0], b[1]);
  const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  for (let i = 0; i < q.n; i++) {
    if (!okQuake(q, i, inst)) continue;
    const P = v(q.lon[i] / 100, q.lat[i] / 100);
    const off = Math.abs(Math.asin((P[0] * n[0] + P[1] * n[1] + P[2] * n[2]) / nl)) * 6371;
    if (off > 150) continue;
    const along = geoDistance(a, [q.lon[i] / 100, q.lat[i] / 100]) * 6371, back = geoDistance(b, [q.lon[i] / 100, q.lat[i] / 100]) * 6371;
    if (along > total + 150 || back > total + 150) continue;
    pts.push([Math.min(total, Math.max(0, along)), q.d[i], q.m[i], i]);
  }
  const W = 340, H = 230, maxD = 700;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'slice-svg');
  const X = (km: number) => 34 + (km / Math.max(1, total)) * (W - 44), Y = (d: number) => 14 + (d / maxD) * (H - 34);
  const add = (tag: string, attrs: Record<string, string | number>, text?: string) => { const e = document.createElementNS(NS, tag); for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val)); if (text) e.textContent = text; svg.append(e); return e; };
  for (const d of [0, 100, 200, 300, 400, 500, 600, 700]) { add('line', { x1: 34, x2: W - 10, y1: Y(d), y2: Y(d), class: 'slice-grid' }); add('text', { x: 30, y: Y(d) + 3, 'text-anchor': 'end', class: 'slice-tick' }, `${d}`); }
  add('text', { x: 4, y: 10, class: 'slice-tick' }, 'km');
  add('text', { x: W - 10, y: H - 4, 'text-anchor': 'end', class: 'slice-tick' }, `${fmtNumber(Math.round(total))} km`);
  for (const [x, d, m] of pts.sort((p, q2) => p[2] - q2[2])) add('circle', { cx: X(x), cy: Y(d), r: 1.4 + (m - 55) * 0.18, fill: SHADES[shadeOf(d)], 'fill-opacity': 0.85, stroke: 'rgba(0,0,0,.4)', 'stroke-width': 0.5 });
  const deep = pts.filter((p) => p[1] >= 300).length;
  SHELL.openPanel('slice', L('A slice through the Earth', 'Un corte de la Tierra'), h('div', { class: 'slice' },
    h('p', { class: 'small' }, `${L('{0} earthquakes within 150 km of your line, seen from the side, down to 700 km.', '{0} terremotos a menos de 150 km de tu línea, vistos de lado, hasta 700 km.', fmtNumber(pts.length))}${deep ? ` ${L('{0} are deeper than 300 km: they trace a plate sinking into the mantle.', '{0} están a más de 300 km: dibujan una placa que se hunde en el manto.', fmtNumber(deep))}` : ''}`),
    svg as unknown as HTMLElement,
    h('p', { class: 'muted small' }, L('Left: where you started the line. Down: depth. Dots: the earthquakes, coloured by depth, bigger when stronger.', 'Izquierda: donde empezaste la línea. Abajo: profundidad. Puntos: los terremotos, coloreados por profundidad, más grandes cuanto más fuertes.'))));
}

// ---- Hotspots ----------------------------------------------------------------------------------------------------
interface Hotspot { id: string; name: { en: string; es: string }; lon: number; lat: number; text: { en: string; es: string }; chain: { name: { en: string; es: string }; lon: number; lat: number; age_ma: number }[] }
let hotspots: Hotspot[] = [];
export const hotspotsLayer: LayerDef = {
  id: 'hotspots-mantle', category: 'earth', icon: '🔥', kind: 'overlay', stackOrder: 5,
  name: { en: 'Hotspots and island chains', es: 'Puntos calientes y cadenas de islas' },
  desc: { en: 'Plumes of hot rock rising through the mantle, and the chains of volcanoes they built as the plates slid over them: Hawaii, Yellowstone, Iceland, Réunion, the Galápagos. The older the volcano, the farther from the hotspot.', es: 'Columnas de roca caliente que suben por el manto, y las cadenas de volcanes que formaron mientras las placas se deslizaban encima: Hawái, Yellowstone, Islandia, Reunión, Galápagos. Cuanto más viejo el volcán, más lejos del punto caliente.' },
  keywords: 'hotspot plume mantle hawaii yellowstone iceland reunion galapagos island chain punto caliente pluma manto cadena islas',
  credit: 'Ages from dated rocks (see scripts/data/earth/curated/hotspots.json)',
  async load() { if (!hotspots.length) hotspots = (await loadJSON<{ hotspots: Hotspot[] }>('earth/hotspots.json')).hotspots; },
  drawOverlay(rc) {
    const { ctx } = rc;
    for (const s of hotspots) {
      const pts = [...s.chain].sort((a, b) => a.age_ma - b.age_ma).map((c) => ({ c, p: rc.project(c.lon, c.lat) }));
      ctx.beginPath(); let on = false;
      for (const { p } of pts) { if (!p) { on = false; continue; } if (on) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); on = true; }
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,169,77,0.8)'; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      for (const { c, p } of pts) { if (!p) continue; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2); ctx.fillStyle = `hsl(${Math.max(0, 40 - c.age_ma * 0.4)},90%,${Math.max(35, 65 - c.age_ma * 0.25)}%)`; ctx.fill(); }
      const p = rc.project(s.lon, s.lat);
      if (p) { const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16); g.addColorStop(0, 'rgba(255,90,40,0.95)'); g.addColorStop(1, 'rgba(255,90,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  labels(rc) {
    for (const s of hotspots) {
      const p = rc.project(s.lon, s.lat);
      if (p) rc.labels.add({ text: T(s.name), x: p[0], y: p[1], gap: 10, priority: 700, size: 11, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
      if (rc.webZoom < 3) continue;
      for (const c of s.chain) {
        const q = rc.project(c.lon, c.lat);
        if (q && c.age_ma > 0.05) rc.labels.add({ text: `${T(c.name)} · ${fmtNumber(c.age_ma, c.age_ma < 10 ? 1 : 0)} Ma`, x: q[0], y: q[1], gap: 5, priority: 300 - c.age_ma, size: 10, weight: 600, color: rc.theme.label, halo: rc.theme.labelHalo });
      }
    }
  },
  legend() {
    return {
      kind: 'categories', title: L('Hotspots and the chains they built', 'Puntos calientes y las cadenas que formaron'),
      items: [{ color: '#ff5a28', label: L('A hotspot today', 'Un punto caliente hoy'), shape: 'dot' }, { color: '#ffa94d', label: L('Its volcanoes, older and older (Ma: millions of years)', 'Sus volcanes, cada vez más viejos (Ma: millones de años)'), shape: 'dash' }],
      note: L('The plate moves over the plume like paper over a candle: a line of burns, the oldest farthest away. Zoom in for the ages.', 'La placa se mueve sobre la pluma como un papel sobre una vela: una línea de quemaduras, la más vieja la más lejana. Acércate para ver las edades.'),
    };
  },
  tap(_lon, _lat, _inst, ui) {
    const s = nearest(hotspots, (x) => [x.lon, x.lat], ui, 22);
    if (!s) return false;
    const oldest = s.chain.reduce((a, c) => (c.age_ma > a.age_ma ? c : a), s.chain[0]);
    ui.card('🔥', T(s.name), L('Mantle hotspot', 'Punto caliente del manto'),
      [{ label: L('Oldest dated volcano of its chain', 'Volcán fechado más viejo de su cadena'), value: `${T(oldest.name)} · ${fmtNumber(oldest.age_ma)} ${L('million years', 'millones de años')}`, icon: '⏳' }],
      [], [T(s.text)]);
    return true;
  },
};

// ---- The magnetic Earth ------------------------------------------------------------------------------------------
interface Magnetic { north: [number, number, number][]; south: [number, number, number][]; wmm: WMM }
let mag: Magnetic | null = null;
export const magneticLayer: LayerDef = {
  id: 'magnetic', category: 'earth', icon: '🧭', kind: 'overlay', stackOrder: 6,
  name: { en: 'The magnetic Earth', es: 'La Tierra magnética' },
  desc: { en: 'Where a compass points (the World Magnetic Model 2025), and how the magnetic poles have wandered since 1590: the north pole has crossed the Arctic from Canada towards Siberia.', es: 'Hacia dónde apunta una brújula (el Modelo Magnético Mundial 2025) y cómo se han movido los polos magnéticos desde 1590: el polo norte cruzó el Ártico de Canadá hacia Siberia.' },
  keywords: 'magnetic compass declination pole north wander wmm brujula magnetico declinacion polo norte',
  credit: 'NOAA NCEI: World Magnetic Model 2025; pole positions from gufm1 and IGRF (public domain)',
  async load() { mag ??= await loadJSON<Magnetic>('earth/magnetic.json'); },
  drawOverlay(rc) {
    if (!mag) return;
    const { ctx } = rc;
    // Compass needles on a grid: they point to magnetic north; red where it is east of true north, blue where west.
    const step = rc.webZoom < 2.5 ? 15 : rc.webZoom < 4 ? 7.5 : 3;
    const year = new Date().getUTCFullYear() + new Date().getUTCMonth() / 12;
    for (let lat = -75; lat <= 75; lat += step) for (let lon = -180 + step / 2; lon < 180; lon += step) {
      const p = rc.project(lon, lat); if (!p) continue;
      const north = rc.project(lon, Math.min(89.9, lat + 0.5)); if (!north) continue;
      const d = declination(mag.wmm, lon, lat, year);
      const up = Math.atan2(north[0] - p[0], -(north[1] - p[1])); // screen angle of true north
      const ang = up + (d * Math.PI) / 180, len = 9;
      const dx = Math.sin(ang) * len, dy = -Math.cos(ang) * len;
      ctx.beginPath(); ctx.moveTo(p[0] - dx, p[1] - dy); ctx.lineTo(p[0] + dx, p[1] + dy);
      ctx.lineWidth = 2; ctx.strokeStyle = Math.abs(d) < 2 ? 'rgba(255,255,255,0.75)' : d > 0 ? 'rgba(255,107,107,0.9)' : 'rgba(77,171,247,0.9)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0] + dx, p[1] + dy, 2.2, 0, Math.PI * 2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
    // The poles' paths, and where they are now.
    for (const track of [mag.north, mag.south]) {
      ctx.beginPath(); let on = false;
      for (const [, lon, lat] of track) { const p = rc.project(lon, lat); if (!p) { on = false; continue; } if (on) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); on = true; }
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#fcc419'; ctx.stroke();
      const [, lon, lat] = track[track.length - 1]; const p = rc.project(lon, lat);
      if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fillStyle = '#fcc419'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1b1b1b'; ctx.stroke(); }
    }
  },
  labels(rc) {
    if (!mag) return;
    for (const [track, n] of [[mag.north, L('North magnetic pole', 'Polo norte magnético')], [mag.south, L('South magnetic pole', 'Polo sur magnético')]] as const) {
      for (const [y, lon, lat] of track) {
        if (y % 50 !== 0 && y !== track[track.length - 1][0]) continue;
        const p = rc.project(lon, lat); if (!p) continue;
        rc.labels.add({ text: y === track[track.length - 1][0] ? `${n} · ${y}` : String(y), x: p[0], y: p[1], gap: 7, priority: y === track[track.length - 1][0] ? 900 : 400 + y / 10, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
      }
    }
  },
  legend() {
    return {
      kind: 'categories', title: L('Where a compass points', 'Hacia dónde apunta una brújula'),
      items: [
        { color: '#ff6b6b', label: L('East of true north', 'Al este del norte verdadero'), shape: 'dash' },
        { color: '#4dabf7', label: L('West of true north', 'Al oeste del norte verdadero'), shape: 'dash' },
        { color: '#ffffff', label: L('Within 2° of true north', 'A menos de 2° del norte verdadero'), shape: 'dash' },
        { color: '#fcc419', label: L('The magnetic poles since 1590', 'Los polos magnéticos desde 1590'), shape: 'dash' },
      ],
      note: L('Tap anywhere for how far a compass there points from true north.', 'Toca cualquier lugar para ver cuánto se aparta una brújula del norte verdadero.'),
    };
  },
  tap(lon, lat, _inst, ui) {
    if (!mag) return false;
    const year = new Date().getUTCFullYear() + new Date().getUTCMonth() / 12;
    const d = declination(mag.wmm, lon, lat, year);
    const side = d >= 0 ? Lc('direction: to the east', 'east', 'al este') : Lc('direction: to the west', 'west', 'al oeste');
    ui.card('🧭', L('Where a compass points', 'Hacia dónde apunta una brújula'), `${fmtNumber(Math.abs(lat), 1)}°${lat >= 0 ? 'N' : 'S'}, ${fmtNumber(Math.abs(lon), 1)}°${lon >= 0 ? 'E' : L('W', 'O')}`,
      [{ label: L('Magnetic declination', 'Declinación magnética'), value: L('{0}° {1} of true north', '{0}° {1} del norte verdadero', fmtNumber(Math.abs(d), 1), side), icon: '🧭' }],
      [{ label: 'NOAA WMM', href: 'https://www.ncei.noaa.gov/products/world-magnetic-model' }],
      [L('The magnetic field changes every year; this is the World Magnetic Model for today.', 'El campo magnético cambia cada año; este es el Modelo Magnético Mundial para hoy.')]);
    return true;
  },
};

// ---- Underground wonders -----------------------------------------------------------------------------------------
interface Wonder { id: string; k: 'cave' | 'geyser' | 'spring' | 'crater' | 'mine'; n: [string, string]; at: [number, number]; place?: [string, string]; text?: [string, string]; facts?: Record<string, number | string>; top?: 1; sl?: number; len?: number; dep?: number; dia?: number }
let wonders: Wonder[] = [];
const KIND = {
  cave: { e: '🕳️', color: '#a9e34b', en: 'Caves', es: 'Cuevas' },
  geyser: { e: '♨️', color: '#66d9e8', en: 'Geysers', es: 'Géiseres' },
  spring: { e: '💧', color: '#4dabf7', en: 'Hot springs', es: 'Aguas termales' },
  crater: { e: '☄️', color: '#ffa94d', en: 'Impact craters', es: 'Cráteres de impacto' },
  mine: { e: '⛏️', color: '#ced4da', en: 'Mines', es: 'Minas' },
} as const;
export const undergroundLayer: LayerDef = {
  id: 'underground', category: 'earth', icon: '🕳️', kind: 'overlay', stackOrder: 5,
  name: { en: 'Underground wonders', es: 'Maravillas subterráneas' },
  desc: { en: 'The longest and deepest caves, geysers and hot springs, the craters left by asteroids (Chicxulub, Vredefort, Meteor Crater) and famous mines from Wieliczka to Mponeng.', es: 'Las cuevas más largas y profundas, géiseres y aguas termales, los cráteres que dejaron asteroides (Chicxulub, Vredefort, el Cráter del Meteoro) y minas famosas, de Wieliczka a Mponeng.' },
  keywords: 'cave geyser hot spring crater impact meteorite mine cueva geiser aguas termales crater impacto meteorito mina',
  credit: 'Curated from sources (Earth Impact Database, NPS, USGS, operators); others from Wikidata (CC0)',
  options: [{ id: 'show', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [
    { value: 'all', label: { en: 'Everything', es: 'Todo' } },
    ...(Object.keys(KIND) as (keyof typeof KIND)[]).map((k) => ({ value: k, label: { en: KIND[k].en, es: KIND[k].es }, icon: KIND[k].e })),
  ] }],
  async load() { if (!wonders.length) wonders = (await loadJSON<{ wonders: Wonder[] }>('earth/wonders.json')).wonders; },
  drawOverlay(rc, inst) {
    const { ctx } = rc;
    const show = String(inst.options.show ?? 'all');
    for (const w of wonders) {
      if (show !== 'all' && w.k !== show) continue;
      if (!w.top && rc.webZoom < 3.2) continue;
      const p = rc.project(w.at[0], w.at[1]); if (!p) continue;
      const r = w.top ? 7 : 4;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = KIND[w.k].color; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    }
  },
  labels(rc, inst) {
    const show = String(inst.options.show ?? 'all');
    for (const w of wonders) {
      if (show !== 'all' && w.k !== show) continue;
      if (!w.top && rc.webZoom < 4) continue;
      const p = rc.project(w.at[0], w.at[1]); if (!p) continue;
      rc.labels.add({ text: `${KIND[w.k].e} ${nm(w.n[0], w.n[1])}`, x: p[0], y: p[1], gap: 8, priority: w.top ? 600 : 200 + Math.min(200, w.sl ?? 0), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const show = String(inst.options.show ?? 'all');
    return {
      kind: 'categories', title: L('Underground wonders', 'Maravillas subterráneas'),
      items: (Object.keys(KIND) as (keyof typeof KIND)[]).filter((k) => show === 'all' || k === show).map((k) => ({ color: KIND[k].color, icon: KIND[k].e, label: `${tx(KIND[k])} · ${fmtNumber(wonders.filter((w) => w.k === k).length)}`, shape: 'dot' as const })),
      note: L('The famous ones are bigger; zoom in for the rest.', 'Los famosos son más grandes; acércate para ver el resto.'),
    };
  },
  searchHint: { en: 'caves, geysers, craters and mines', es: 'cuevas, géiseres, cráteres y minas' },
  async searchLoad() { if (!wonders.length) wonders = (await loadJSON<{ wonders: Wonder[] }>('earth/wonders.json')).wonders; },
  search(match) {
    const out: LayerHit[] = [];
    for (const w of wonders) {
      const sc = Math.max(match(w.n[0]), match(w.n[1]));
      if (sc < 50) continue;
      out.push({ label: nm(w.n[0], w.n[1]), sub: `${KIND[w.k].e} ${tx(KIND[w.k])}${w.place ? ` · ${nm(w.place[0], w.place[1])}` : ''}`, icon: KIND[w.k].e, lon: w.at[0], lat: w.at[1], score: sc + (w.top ? 8 : 0), wz: 8 });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6);
  },
  tap(_lon, _lat, inst, ui) {
    const show = String(inst.options.show ?? 'all');
    const w = nearest(wonders.filter((x) => (show === 'all' || x.k === show) && (x.top || ui.project(x.at[0], x.at[1]))), (x) => x.at, ui, 14);
    if (!w) return false;
    const rows: { label: string; value: string; icon?: string }[] = [];
    const f = { ...(w.facts ?? {}), ...(w.len ? { length_km: w.len } : {}), ...(w.dep ? { depth_m: w.dep } : {}), ...(w.dia ? { diameter_km: w.dia } : {}) } as Record<string, number | string>;
    const num = (v: number | string) => (typeof v === 'number' ? fmtNumber(v, v < 10 ? 1 : 0) : v);
    if (f.length_km != null) rows.push({ label: L('Length', 'Longitud'), value: `${num(f.length_km)} km`, icon: '↔️' });
    if (f.depth_m != null) rows.push({ label: L('Depth', 'Profundidad'), value: `${num(f.depth_m)} m`, icon: '⬇️' });
    if (f.height_m != null) rows.push({ label: L('Height', 'Altura'), value: `${num(f.height_m)} m`, icon: '⬆️' });
    if (f.diameter_km != null) rows.push({ label: L('Diameter', 'Diámetro'), value: `${num(f.diameter_km)} km`, icon: '⭕' });
    if (f.age_ma != null) rows.push({ label: L('Age', 'Edad'), value: `${num(f.age_ma)} ${L('million years', 'millones de años')}`, icon: '⏳' });
    if (f.interval_min != null) rows.push({ label: L('Erupts about every', 'Erupciona más o menos cada'), value: `${num(f.interval_min)} min`, icon: '⏱️' });
    ui.card(KIND[w.k].e, nm(w.n[0], w.n[1]), w.place ? (nm(w.place[0], w.place[1])) : (tx(KIND[w.k])), rows, [], w.text ? [nm(w.text[0], w.text[1])] : []);
    return true;
  },
};

export default function register(app: App, shell: Shell) {
  APP = app; SHELL = shell;
  app.register([quakeDepths, hotspotsLayer, magneticLayer, undergroundLayer]);
  // Drawing a slice: the next two taps on the map are its ends.
  shell.tapHandlers.unshift((_x, _y, g) => {
    if (!slice.picking || !g) return false;
    if (!slice.a) { slice.a = g; app.renderer.requestRender(); return true; }
    setSlice(slice.a, g);
    return true;
  });
}
