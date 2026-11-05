// Earth science: tectonic plates, famous volcanoes and the major ocean currents.
import { geoCentroid, geoContains, geoInterpolate, geoDistance } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { loadJSON, shapesFrom, type Shape } from '../../data/store';
import { oklch } from '../../engine/colors';
import { lang, fmtNumber } from '../../app/i18n';
import type { App } from '../../app/app';
import type { LayerDef, RenderCtx } from '../types';

// ---- Tectonic plates -------------------------------------------------------------------------
interface PlateP { c: string; n: string }
interface BoundP { k: string; v: number; b: string }
let plates: (Shape<PlateP> & { lp: [number, number] })[] = [];
let bounds: Shape<BoundP>[] = [];

const BOUND: Record<string, { color: string; en: string; es: string; dash?: number[] }> = {
  OSR: { color: '#ff5a36', en: 'Ocean ridge (spreading)', es: 'Dorsal oceánica (divergente)' },
  CRB: { color: '#ffa94d', en: 'Continental rift', es: 'Rift continental', dash: [5, 3] },
  SUB: { color: '#4dabf7', en: 'Subduction zone', es: 'Zona de subducción' },
  OCB: { color: '#74c0fc', en: 'Ocean convergent', es: 'Convergente oceánica', dash: [5, 3] },
  CCB: { color: '#b197fc', en: 'Continental collision', es: 'Colisión continental' },
  OTF: { color: '#69db7c', en: 'Ocean transform fault', es: 'Falla transformante oceánica' },
  CTF: { color: '#38d9a9', en: 'Continental transform fault', es: 'Falla transformante continental', dash: [5, 3] },
};

const tectonics: LayerDef = {
  id: 'plates', category: 'earth', icon: '🧩', kind: 'fill', defaultOpacity: 0.85,
  name: { en: 'Tectonic plates', es: 'Placas tectónicas' },
  desc: { en: 'The 54 plates of the Earth’s crust and how their edges move: ridges, trenches and faults.', es: 'Las 54 placas de la corteza y cómo se mueven sus bordes: dorsales, fosas y fallas.' },
  keywords: 'plates earthquakes ridge subduction fault placas terremotos dorsal falla',
  credit: 'PB2002 plate boundaries (Bird, 2003), via Hugo Ahlenius / Nordpil (ODC-By)',
  async load() {
    if (plates.length) return;
    const topo = await loadJSON<Topology>('layers/plates.json');
    plates = shapesFrom<PlateP>(topo, 'plates').map((s) => ({ ...s, lp: geoCentroid(s.feature as never) as [number, number] }));
    bounds = shapesFrom<BoundP>(topo, 'bounds');
  },
  drawFill(rc) {
    const { ctx, path } = rc;
    plates.forEach((s, i) => {
      ctx.beginPath(); path(s.feature as never);
      ctx.fillStyle = oklch(rc.theme.dark ? 0.6 : 0.82, 0.07, (i * 137.5) % 360, 0.55);
      ctx.fill();
    });
  },
  drawOverlay(rc) {
    const { ctx, path } = rc;
    const w = Math.max(1.4, Math.min(3, 0.8 + rc.webZoom * 0.4));
    for (const [k, st] of Object.entries(BOUND)) {
      ctx.beginPath();
      for (const s of rc.visibleShapes(bounds)) if (s.feature.properties.k === k) path(s.feature as never);
      ctx.setLineDash(st.dash ?? []);
      ctx.strokeStyle = st.color; ctx.lineWidth = w; ctx.stroke();
    }
    ctx.setLineDash([]);
  },
  labels(rc) {
    for (const s of plates) {
      const px = Math.sqrt(Math.abs(s.bbox[2] - s.bbox[0]) * Math.abs(s.bbox[3] - s.bbox[1])) * rc.view.pxPerRadian / 57.3;
      if (px < 60) continue;
      const pt = rc.project(s.lp[0], s.lp[1]);
      if (!pt) continue;
      rc.labels.add({ text: s.feature.properties.n, x: pt[0], y: pt[1], priority: 600 + Math.min(300, px / 4), size: 12, weight: 700, italic: true, caps: px > 220, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend() {
    const es = lang() === 'es';
    return { kind: 'categories', title: es ? 'Bordes de placa' : 'Plate boundaries', items: Object.values(BOUND).map((b) => ({ color: b.color, label: es ? b.es : b.en, shape: b.dash ? 'dash' as const : 'line' as const })) };
  },
  pick(lon, lat) {
    const es = lang() === 'es';
    const p = plates.find((s) => geoContains(s.feature as never, [lon, lat]));
    if (!p) return null;
    // Nearest boundary step and its speed.
    let best: Shape<BoundP> | null = null, bd = Infinity;
    for (const s of bounds) {
      const c = (s.feature.geometry as unknown as { coordinates: number[][] }).coordinates;
      for (const q of c) { const d = geoDistance([lon, lat], q as [number, number]); if (d < bd) { bd = d; best = s; } }
    }
    const rows = [{ label: es ? 'Placa' : 'Plate', value: p.feature.properties.n, icon: '🧩' }];
    if (best && bd < 0.08) {
      const b = BOUND[best.feature.properties.k];
      rows.push({ label: es ? 'Borde cercano' : 'Nearby boundary', value: `${es ? b.es : b.en} · ${best.feature.properties.v} mm/${es ? 'año' : 'yr'}`, icon: '↔️' });
    }
    return rows;
  },
};

// ---- Volcanoes -------------------------------------------------------------------------------
// [name, lon, lat, elevation m, country (en|es), last eruption or status (en|es)]
const VOLCANOES: [string, number, number, number, string, string][] = [
  ['Vesuvius|Vesubio', 14.426, 40.821, 1281, 'Italy|Italia', '1944'],
  ['Etna', 14.999, 37.751, 3357, 'Italy|Italia', 'active|activo'],
  ['Stromboli', 15.213, 38.789, 924, 'Italy|Italia', 'active|activo'],
  ['Mount Fuji|Monte Fuji', 138.731, 35.361, 3776, 'Japan|Japón', '1707'],
  ['Sakurajima', 130.657, 31.585, 1117, 'Japan|Japón', 'active|activo'],
  ['Mount Aso|Monte Aso', 131.104, 32.884, 1592, 'Japan|Japón', 'active|activo'],
  ['Kīlauea', -155.287, 19.421, 1247, 'USA (Hawaii)|EE. UU. (Hawái)', 'active|activo'],
  ['Mauna Loa', -155.608, 19.475, 4169, 'USA (Hawaii)|EE. UU. (Hawái)', '2022'],
  ['Mount St. Helens|Monte Santa Helena', -122.18, 46.2, 2549, 'USA|EE. UU.', '2008'],
  ['Mount Rainier|Monte Rainier', -121.758, 46.853, 4392, 'USA|EE. UU.', '~1450'],
  ['Yellowstone Caldera|Caldera de Yellowstone', -110.67, 44.43, 2805, 'USA|EE. UU.', 'supervolcano|supervolcán'],
  ['Novarupta (Katmai)', -155.16, 58.27, 841, 'USA (Alaska)|EE. UU. (Alaska)', '1912'],
  ['Popocatépetl', -98.622, 19.023, 5426, 'Mexico|México', 'active|activo'],
  ['Volcán de Colima', -103.62, 19.514, 3850, 'Mexico|México', '2017'],
  ['Paricutín', -102.251, 19.493, 3170, 'Mexico|México', '1952'],
  ['Volcán de Fuego', -90.88, 14.473, 3763, 'Guatemala', 'active|activo'],
  ['Masaya', -86.161, 11.984, 635, 'Nicaragua', 'active|activo'],
  ['Arenal', -84.703, 10.463, 1670, 'Costa Rica', '2010'],
  ['Mount Pelée|Monte Pelado', -61.168, 14.809, 1397, 'Martinique (France)|Martinica (Francia)', '1932'],
  ['Soufrière Hills', -62.18, 16.72, 915, 'Montserrat (UK)|Montserrat (R. U.)', '2013'],
  ['Nevado del Ruiz', -75.322, 4.892, 5321, 'Colombia', 'active|activo'],
  ['Cotopaxi', -78.436, -0.677, 5897, 'Ecuador', '2023'],
  ['Chimborazo', -78.817, -1.469, 6263, 'Ecuador', '~550'],
  ['Sabancaya', -71.857, -15.787, 5976, 'Peru|Perú', 'active|activo'],
  ['Láscar', -67.73, -23.37, 5592, 'Chile', 'active|activo'],
  ['Ojos del Salado', -68.54, -27.109, 6893, 'Chile / Argentina', '~750'],
  ['Villarrica', -71.93, -39.42, 2847, 'Chile', 'active|activo'],
  ['Hekla', -19.67, 63.98, 1491, 'Iceland|Islandia', '2000'],
  ['Eyjafjallajökull', -19.62, 63.63, 1651, 'Iceland|Islandia', '2010'],
  ['Reykjanes (Sundhnúkur)', -22.42, 63.89, 160, 'Iceland|Islandia', 'active|activo'],
  ['Teide', -16.642, 28.272, 3715, 'Spain (Canary Is.)|España (Canarias)', '1909'],
  ['Santorini', 25.396, 36.404, 367, 'Greece|Grecia', '1950'],
  ['Mount Ararat|Monte Ararat', 44.3, 39.702, 5137, 'Türkiye|Turquía', 'dormant|dormido'],
  ['Mount Elbrus|Monte Elbrús', 42.439, 43.355, 5642, 'Russia|Rusia', 'dormant|dormido'],
  ['Damavand', 52.109, 35.951, 5610, 'Iran|Irán', 'dormant|dormido'],
  ['Kilimanjaro', 37.355, -3.076, 5895, 'Tanzania', 'dormant|dormido'],
  ['Ol Doinyo Lengai', 35.902, -2.764, 2962, 'Tanzania', '2013'],
  ['Nyiragongo', 29.25, -1.52, 3470, 'DR Congo|R. D. del Congo', '2021'],
  ['Erta Ale', 40.67, 13.6, 613, 'Ethiopia|Etiopía', 'active|activo'],
  ['Mount Cameroon|Monte Camerún', 9.17, 4.203, 4040, 'Cameroon|Camerún', '2012'],
  ['Piton de la Fournaise', 55.713, -21.244, 2632, 'Réunion (France)|Reunión (Francia)', 'active|activo'],
  ['Krakatoa (Anak Krakatau)', 105.423, -6.102, 155, 'Indonesia', 'active|activo'],
  ['Tambora', 118.0, -8.25, 2850, 'Indonesia', '1815'],
  ['Merapi', 110.446, -7.541, 2930, 'Indonesia', 'active|activo'],
  ['Mount Agung|Monte Agung', 115.508, -8.343, 3031, 'Indonesia', '2019'],
  ['Mount Pinatubo|Monte Pinatubo', 120.35, 15.13, 1486, 'Philippines|Filipinas', '1991'],
  ['Mayon', 123.685, 13.257, 2462, 'Philippines|Filipinas', 'active|activo'],
  ['Taal', 120.993, 14.002, 311, 'Philippines|Filipinas', '2022'],
  ['Paektu (Changbai)', 128.08, 41.998, 2744, 'China / North Korea|China / Corea del Norte', '1903'],
  ['Klyuchevskaya Sopka', 160.642, 56.056, 4750, 'Russia (Kamchatka)|Rusia (Kamchatka)', 'active|activo'],
  ['Ruapehu', 175.57, -39.28, 2797, 'New Zealand|Nueva Zelanda', '2007'],
  ['Hunga Tonga', -175.38, -20.536, 114, 'Tonga', '2022'],
  ['Mount Erebus|Monte Erebus', 167.17, -77.53, 3794, 'Antarctica|Antártida', 'active|activo'],
];

const pick2 = (s: string) => { const [en, es] = s.split('|'); return lang() === 'es' ? es ?? en : en; };

const volcanoes: LayerDef = {
  id: 'volcanoes', category: 'earth', icon: '🌋', kind: 'overlay', stackOrder: 3,
  name: { en: 'Famous volcanoes', es: 'Volcanes famosos' },
  desc: { en: '53 well-known volcanoes, with height and last eruption.', es: '53 volcanes conocidos, con su altura y última erupción.' },
  keywords: 'volcano eruption lava ring of fire volcan erupcion anillo de fuego',
  credit: 'Compiled list (approximate positions)',
  drawOverlay(rc) {
    const { ctx } = rc;
    for (const v of VOLCANOES) {
      const pt = rc.project(v[1], v[2]);
      if (!pt) continue;
      const active = /active/.test(v[5]);
      const r = 4 + Math.min(3, v[3] / 2500);
      ctx.beginPath();
      ctx.moveTo(pt[0], pt[1] - r * 1.25); ctx.lineTo(pt[0] + r, pt[1] + r * 0.8); ctx.lineTo(pt[0] - r, pt[1] + r * 0.8); ctx.closePath();
      ctx.fillStyle = active ? '#ff4b2b' : '#ff9f68';
      ctx.strokeStyle = rc.theme.dark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.2; ctx.fill(); ctx.stroke();
      if (active) {
        const g = ctx.createRadialGradient(pt[0], pt[1] - r, 0, pt[0], pt[1] - r, r * 2.6);
        g.addColorStop(0, 'rgba(255,120,40,0.55)'); g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pt[0], pt[1] - r, r * 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  },
  labels(rc) {
    if (rc.webZoom < 3.4) return;
    for (const v of VOLCANOES) {
      const pt = rc.project(v[1], v[2]);
      if (!pt) continue;
      rc.labels.add({ text: pick2(v[0]), sub: `${fmtNumber(v[3])} m`, x: pt[0] + 6, y: pt[1], align: 'left', priority: 640 + v[3] / 100, size: 10.5, weight: 650, color: rc.theme.dark ? '#ffd8c2' : '#7a2e0e', halo: rc.theme.labelHalo });
    }
  },
  legend() {
    const es = lang() === 'es';
    return { kind: 'categories', items: [{ color: '#ff4b2b', label: es ? 'Activo' : 'Active', shape: 'dot' }, { color: '#ff9f68', label: es ? 'Dormido o histórico' : 'Dormant or historic', shape: 'dot' }], note: es ? 'Toca un volcán para ver su ficha.' : 'Tap a volcano for its details.' };
  },
  pick(lon, lat) {
    let best: (typeof VOLCANOES)[number] | null = null, bd = 0.035;
    for (const v of VOLCANOES) { const d = geoDistance([lon, lat], [v[1], v[2]]); if (d < bd) { bd = d; best = v; } }
    if (!best) return null;
    const es = lang() === 'es';
    return [
      { label: es ? 'Volcán' : 'Volcano', value: pick2(best[0]), icon: '🌋' },
      { label: es ? 'Altura' : 'Height', value: `${fmtNumber(best[3])} m` },
      { label: es ? 'País' : 'Country', value: pick2(best[4]) },
      { label: es ? 'Última erupción' : 'Last eruption', value: pick2(best[5]) },
    ];
  },
};

// ---- Ocean currents (schematic) --------------------------------------------------------------
// [name en|es, warm?, path]
const CURRENTS: [string, boolean, [number, number][]][] = [
  ['Gulf Stream|Corriente del Golfo', true, [[-80.5, 25.5], [-80, 28.5], [-78.5, 31.5], [-75.5, 35], [-70, 38], [-60, 40.5], [-50, 41.5], [-44, 44]]],
  ['North Atlantic Drift|Deriva Noratlántica', true, [[-44, 45], [-35, 48], [-25, 51.5], [-15, 55], [-8, 58.5], [0, 61.5], [5, 64.5], [12, 68], [18, 71]]],
  ['North Equatorial|Ecuatorial del Norte', true, [[-18, 14], [-30, 13.5], [-45, 13.5], [-58, 15], [-70, 17], [-80, 21]]],
  ['Caribbean|del Caribe', true, [[-62, 14], [-72, 15], [-82, 18], [-86.5, 21.5], [-84, 24.5], [-81, 25]]],
  ['South Equatorial|Ecuatorial del Sur', true, [[8, -1], [-5, -1.5], [-20, -2.5], [-32, -4.5]]],
  ['Brazil|de Brasil', true, [[-34, -7], [-37, -14], [-40, -22], [-46, -28], [-52, -36]]],
  ['Kuroshio', true, [[123, 20], [125, 25], [130, 30], [137, 33], [142, 35.5]]],
  ['North Pacific|del Pacífico Norte', true, [[143, 37], [155, 40], [175, 42], [-165, 43], [-145, 45], [-132, 46]]],
  ['Pacific North Equatorial|Ecuatorial del Norte (Pacífico)', true, [[-110, 13], [-130, 13], [-150, 13], [-175, 13], [160, 13], [140, 14], [125, 15]]],
  ['Pacific South Equatorial|Ecuatorial del Sur (Pacífico)', true, [[-82, -2], [-100, -3], [-130, -4], [-160, -6], [170, -9], [155, -11]]],
  ['Equatorial Counter Current|Contracorriente Ecuatorial', true, [[130, 6], [150, 6], [-170, 7], [-140, 7], [-110, 7], [-88, 7]]],
  ['East Australian|de Australia Oriental', true, [[155, -15], [154, -22], [154, -28], [153, -33], [151.5, -37]]],
  ['Agulhas', true, [[40, -15], [36, -24], [32, -30], [28, -34], [22, -37]]],
  ['Indian South Equatorial|Ecuatorial del Sur (Índico)', true, [[110, -12], [95, -11], [80, -11], [65, -12], [52, -12]]],
  ['Alaska|de Alaska', true, [[-135, 50], [-140, 56], [-148, 59], [-156, 57]]],
  ['Labrador|del Labrador', false, [[-60, 66], [-58, 60], [-55, 55], [-52, 50], [-50, 46], [-52, 43]]],
  ['East Greenland|de Groenlandia Oriental', false, [[-10, 78], [-17, 72], [-25, 67], [-33, 63], [-42, 60]]],
  ['Canary|de Canarias', false, [[-12, 40], [-14, 35], [-16, 30], [-18, 24], [-19, 18]]],
  ['Benguela', false, [[17, -34], [15, -30], [12, -24], [10, -18], [8, -12]]],
  ['Humboldt (Peru)|de Humboldt', false, [[-75, -44], [-74, -37], [-72, -30], [-71.5, -22], [-76, -14], [-81, -6]]],
  ['California|de California', false, [[-128, 48], [-126, 42], [-123, 36], [-119, 30], [-116, 25], [-112, 20]]],
  ['Oyashio', false, [[165, 58], [160, 52], [152, 46], [146, 42], [143, 39]]],
  ['West Australian|de Australia Occidental', false, [[115, -35], [113, -30], [112, -24], [110, -18]]],
  ['Falkland|de las Malvinas', false, [[-63, -55], [-60, -50], [-57, -44], [-55, -38]]],
  ['Antarctic Circumpolar|Circumpolar Antártica', false, [[-180, -58], [-150, -60], [-120, -58], [-90, -58], [-70, -58], [-60, -57], [-40, -53], [-20, -50], [0, -50], [20, -48], [40, -48], [60, -50], [80, -50], [100, -50], [120, -52], [140, -54], [160, -56], [179.9, -58]]],
];

interface Sampled { pts: [number, number][]; cum: number[]; len: number }
let sampled: Sampled[] | null = null;
function sampleCurrents(): Sampled[] {
  if (sampled) return sampled;
  sampled = CURRENTS.map(([, , path]) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const f = geoInterpolate(path[i], path[i + 1]);
      for (let k = 0; k < 8; k++) pts.push(f(k / 8) as [number, number]);
    }
    pts.push(path[path.length - 1]);
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + geoDistance(pts[i - 1], pts[i]));
    return { pts, cum, len: cum[cum.length - 1] };
  });
  return sampled;
}

const WARM = '#ff6b5b', COLD = '#4dabf7';

const currents: LayerDef = {
  id: 'currents', category: 'earth', icon: '🌊', kind: 'overlay', stackOrder: 3,
  name: { en: 'Ocean currents', es: 'Corrientes oceánicas' },
  desc: { en: 'The great warm and cold surface currents, flowing in real time.', es: 'Las grandes corrientes cálidas y frías de superficie, fluyendo en vivo.' },
  keywords: 'ocean current gulf stream sea corriente oceano mar',
  credit: 'Schematic, after standard oceanography atlases',
  animated: true,
  drawOverlay(rc) {
    const { ctx, path } = rc;
    CURRENTS.forEach(([, warm, p]) => {
      ctx.beginPath(); path({ type: 'LineString', coordinates: p });
      ctx.strokeStyle = warm ? 'rgba(255,107,91,0.45)' : 'rgba(77,171,247,0.45)';
      ctx.lineWidth = 5; ctx.stroke();
    });
  },
  drawFx(rc) {
    const { ctx } = rc;
    const s = sampleCurrents();
    const t = (rc.now / 1000) * 0.012; // radians per second along the path
    s.forEach((c, ci) => {
      const warm = CURRENTS[ci][1];
      ctx.fillStyle = warm ? WARM : COLD;
      const spacing = 0.09;
      for (let d = (t + ci * 0.037) % spacing; d < c.len; d += spacing) {
        let i = 1; while (i < c.cum.length && c.cum[i] < d) i++;
        if (i >= c.pts.length) break;
        const f = (d - c.cum[i - 1]) / Math.max(1e-9, c.cum[i] - c.cum[i - 1]);
        const a = c.pts[i - 1], b = c.pts[i];
        const p = geoInterpolate(a, b)(f) as [number, number];
        const q = geoInterpolate(a, b)(Math.min(1, f + 0.4)) as [number, number];
        const sp = rc.project(p[0], p[1]), sq = rc.project(q[0], q[1]);
        if (!sp || !sq) continue;
        const ang = Math.atan2(sq[1] - sp[1], sq[0] - sp[0]);
        ctx.save(); ctx.translate(sp[0], sp[1]); ctx.rotate(ang);
        ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 3.5); ctx.closePath();
        ctx.fill(); ctx.restore();
      }
    });
  },
  labels(rc) {
    if (rc.webZoom < 3) return;
    CURRENTS.forEach(([name, warm, p]) => {
      const mid = p[Math.floor(p.length / 2)];
      const pt = rc.project(mid[0], mid[1]);
      if (!pt) return;
      rc.labels.add({ text: pick2(name), x: pt[0], y: pt[1] - 10, priority: 420, size: 10.5, italic: true, weight: 650, color: warm ? '#ffb4a8' : '#a5d8ff', halo: rc.theme.labelHalo });
    });
  },
  legend() {
    const es = lang() === 'es';
    return { kind: 'categories', items: [{ color: WARM, label: es ? 'Corriente cálida' : 'Warm current', shape: 'line' }, { color: COLD, label: es ? 'Corriente fría' : 'Cold current', shape: 'line' }], note: es ? 'Trazado esquemático.' : 'Schematic paths.' };
  },
};

export default function register(app: App) {
  app.register([tectonics, volcanoes, currents]);
}

export type { RenderCtx };
