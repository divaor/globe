// Climate, weather, vegetation and population-intensity filters.
import { geoContains } from 'd3-geo';
import type { Topology } from 'topojson-specification';
import { loadJSON, shapesFrom, type Shape } from '../../data/store';
import { lang, tx } from '../../app/i18n';
import { paletteRaster, setDayNightProbe } from '../rasterdata';
import type { App } from '../../app/app';
import type { LayerDef, RenderCtx } from '../types';

interface KClass { color: string; group: string; en: string; es: string; desc_en: string; desc_es: string; biome: string }
interface Biome { color: string; en: string; es: string; desc_en: string; desc_es: string; emoji: string }

let kShapes: Shape<{ k: string }>[] = [];
let kClasses: Record<string, KClass> = {};
let biomes: Record<string, Biome> = {};

async function loadKoppen() {
  if (kShapes.length) return;
  const [topo, cls] = await Promise.all([
    loadJSON<Topology>('layers/koppen.json'),
    loadJSON<Record<string, unknown>>('layers/koppen-classes.json'),
  ]);
  biomes = (cls.biomes ?? {}) as Record<string, Biome>;
  kClasses = Object.fromEntries(Object.entries(cls).filter(([k]) => k !== 'biomes')) as Record<string, KClass>;
  kShapes = shapesFrom<{ k: string }>(topo, 'koppen');
}

function drawClasses(rc: RenderCtx, color: (k: string) => string | null) {
  const { ctx, path } = rc;
  const by = new Map<string, Shape<{ k: string }>[]>();
  for (const s of kShapes) {
    const c = color(s.feature.properties.k);
    if (!c) continue;
    let g = by.get(c); if (!g) by.set(c, (g = [])); g.push(s);
  }
  for (const [c, list] of by) {
    ctx.beginPath();
    for (const s of list) path(s.feature as never);
    ctx.fillStyle = c; ctx.fill();
  }
}

function kAt(lon: number, lat: number): string | null {
  for (const s of kShapes) if (geoContains(s.feature as never, [lon, lat])) return s.feature.properties.k;
  return null;
}

const GROUPS: Record<string, { en: string; es: string }> = {
  A: { en: 'Tropical', es: 'Tropical' }, B: { en: 'Dry', es: 'Seco' }, C: { en: 'Temperate', es: 'Templado' },
  D: { en: 'Continental', es: 'Continental' }, E: { en: 'Polar', es: 'Polar' },
};

const koppen: LayerDef = {
  id: 'koppen', category: 'climate', icon: '🌦️', kind: 'fill', defaultOpacity: 0.9,
  name: { en: 'Climate zones (Köppen)', es: 'Zonas climáticas (Köppen)' },
  desc: { en: 'The 30 Köppen–Geiger climate types, from rainforest to ice cap.', es: 'Los 30 tipos de clima de Köppen-Geiger, de la selva al casquete polar.' },
  keywords: 'koppen geiger climate tropical desert temperate polar clima desierto templado',
  credit: 'Köppen–Geiger 1986–2010 after Kottek et al. (2006) and Rubel et al. (2017); colours after Beck et al. (2018)',
  load: loadKoppen,
  drawFill(rc) { drawClasses(rc, (k) => kClasses[k]?.color ?? null); },
  legend() {
    const es = lang() === 'es';
    const items = Object.entries(kClasses).filter(([k]) => kShapes.some((s) => s.feature.properties.k === k)).map(([k, c]) => ({
      color: c.color, label: `${k} · ${es ? c.es : c.en}`,
    }));
    return { kind: 'categories', title: es ? 'Tipos de clima' : 'Climate types', items, note: es ? 'A tropical · B seco · C templado · D continental · E polar' : 'A tropical · B dry · C temperate · D continental · E polar' };
  },
  pick(lon, lat) {
    const k = kAt(lon, lat);
    if (!k) return null;
    const c = kClasses[k];
    const es = lang() === 'es';
    return [
      { label: es ? 'Clima' : 'Climate', value: `${k} · ${es ? c.es : c.en}`, icon: '🌦️' },
      { label: GROUPS[c.group] ? tx(GROUPS[c.group]) : c.group, value: es ? c.desc_es : c.desc_en },
    ];
  },
};

const vegetation: LayerDef = {
  id: 'vegetation', category: 'flora', icon: '🌳', kind: 'fill', defaultOpacity: 0.9,
  name: { en: 'Vegetation zones (biomes)', es: 'Zonas de vegetación (biomas)' },
  desc: { en: 'Rainforest, savanna, desert, steppe, forests, taiga, tundra and ice, from climate.', es: 'Selva, sabana, desierto, estepa, bosques, taiga, tundra y hielo, según el clima.' },
  keywords: 'biome forest rainforest savanna taiga tundra bioma bosque selva sabana flora plants plantas',
  credit: 'Biomes derived from Köppen–Geiger climate types (approximate)',
  load: loadKoppen,
  drawFill(rc) { drawClasses(rc, (k) => biomes[kClasses[k]?.biome]?.color ?? null); },
  legend() {
    const es = lang() === 'es';
    return {
      kind: 'categories', title: es ? 'Biomas' : 'Biomes',
      items: Object.values(biomes).map((b) => ({ color: b.color, label: es ? b.es : b.en, icon: b.emoji })),
      note: es ? 'Vegetación natural potencial según el clima; no muestra cultivos ni ciudades.' : 'Natural vegetation expected from the climate; farms and cities are not shown.',
    };
  },
  pick(lon, lat) {
    const k = kAt(lon, lat);
    const b = k ? biomes[kClasses[k]?.biome] : null;
    if (!b) return null;
    const es = lang() === 'es';
    return [{ label: es ? 'Bioma' : 'Biome', value: `${b.emoji} ${es ? b.es : b.en}`, icon: '🌳' }, { label: '', value: es ? b.desc_es : b.desc_en }];
  },
};

const THERMAL = ['#2c0a5e', '#3b4cc0', '#5f9de0', '#9fd3ee', '#e9f2c4', '#fdd36f', '#f98e3c', '#d7301f', '#7f0000'];
const RAIN = ['#f3e4c6', '#d8e7a6', '#93cf87', '#4fb08a', '#2a8a9f', '#2160a8', '#2b2f8c', '#3d0d6b'];
const stops = (cols: string[], alpha0 = 1): [number, string][] => cols.map((c, i) => [i / (cols.length - 1), i === 0 && alpha0 < 1 ? c + Math.round(alpha0 * 255).toString(16).padStart(2, '0') : c]);

const temperature = paletteRaster({
  id: 'temperature', category: 'climate', icon: '🌡️', file: 'temperature.png',
  name: { en: 'Air temperature (yearly mean)', es: 'Temperatura del aire (media anual)' },
  desc: { en: 'Average near-surface temperature over a year, land and sea.', es: 'Temperatura media del aire cerca de la superficie en un año.' },
  keywords: 'temperature heat cold warm temperatura calor frio',
  credit: 'ECMWF ERA-Interim 2 m temperature, 2005 annual mean (contains modified ECMWF data)',
  // Stops placed at real temperatures (−53…32 °C) so warm regions are not all one red.
  stops: [[0, '#2c0a5e'], [0.27, '#3b4cc0'], [0.45, '#5f9de0'], [0.6, '#bfe6f2'], [0.67, '#e9f2c4'], [0.75, '#c7e07a'],
    [0.83, '#fdd36f'], [0.9, '#f98e3c'], [0.955, '#d7301f'], [1, '#7f0000']],
  legendStops: ['#2c0a5e', '#3b4cc0', '#5f9de0', '#bfe6f2', '#e9f2c4', '#c7e07a', '#fdd36f', '#f98e3c', '#d7301f', '#7f0000'],
  min: '−50 °C', mid: '10 °C', max: '+30 °C',
  encoding: { kind: 'linear', min: -52.9, max: 31.8 }, unit: '°C', pickLabel: { en: 'Mean temperature', es: 'Temperatura media' },
  note: { en: 'Annual mean of 2005 (ERA-Interim).', es: 'Media anual de 2005 (ERA-Interim).' },
});

const precipitation = paletteRaster({
  id: 'precipitation', category: 'climate', icon: '🌧️', file: 'precipitation.png',
  name: { en: 'Rainfall (yearly total)', es: 'Lluvia (total anual)' },
  desc: { en: 'How much rain and snow falls in a year, 1981–2010 average.', es: 'Cuánta lluvia y nieve cae en un año, media 1981-2010.' },
  keywords: 'rain precipitation wet dry lluvia precipitacion humedo seco',
  credit: 'GPCP v2.2, NASA GSFC (1981–2010 mean)',
  stops: stops(RAIN), legendStops: RAIN, min: '3 mm', mid: '120 mm', max: '4900 mm',
  encoding: { kind: 'log', min: 3, max: 4900 }, unit: 'mm', pickLabel: { en: 'Rain per year', es: 'Lluvia al año' },
});

const SST = ['#0b1d51', '#1f4e9c', '#2f8fce', '#5ec7c8', '#b7e6a1', '#fbe58a', '#f9a64a', '#e8582f', '#a3162f'];
const sst = paletteRaster({
  id: 'sst', category: 'climate', icon: '🌊', file: 'sst.png', defaultOpacity: 0.9,
  name: { en: 'Sea temperature', es: 'Temperatura del mar' },
  desc: { en: 'Average sea-surface temperature, 1991–2020.', es: 'Temperatura media de la superficie del mar, 1991-2020.' },
  keywords: 'ocean sea surface temperature sst currents mar oceano temperatura',
  credit: 'NOAA ERSST v5 (public domain)',
  stops: stops(SST), legendStops: SST, min: '−2 °C', mid: '14 °C', max: '30 °C',
  encoding: { kind: 'linear', min: -1.8, max: 29.8 }, unit: '°C', pickLabel: { en: 'Sea temperature', es: 'Temperatura del mar' },
});

const POP = ['#00000000', '#3b0f70aa', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];
const population = paletteRaster({
  id: 'popdensity', category: 'people', icon: '🔥', file: 'population.png', defaultOpacity: 0.95,
  name: { en: 'Population intensity', es: 'Intensidad de población' },
  desc: { en: 'Where people live: a glowing density map of 235,000 towns and cities.', es: 'Dónde vive la gente: un mapa de densidad luminoso de 235 000 pueblos y ciudades.' },
  keywords: 'population density people crowded densidad poblacion gente',
  credit: 'Population © GeoNames (CC BY 4.0), kernel density',
  stops: POP.map((c, i) => [i / (POP.length - 1), c]), legendStops: POP.map((c) => c.slice(0, 7)), min: '3/km²', mid: '100/km²', max: '3000/km²',
  encoding: { kind: 'log', min: 3, max: 3000 }, unit: '/km²', pickLabel: { en: 'People per km²', es: 'Personas por km²' },
  note: { en: 'Modelled from settlements, not a census grid.', es: 'Modelado a partir de localidades, no de un censo.' },
});

const LIGHTS = ['#00000000', '#ffb34733', '#ffc96b99', '#ffe3a6', '#ffffff'];
const cityLights = paletteRaster({
  id: 'citylights', category: 'people', icon: '✨', file: 'citylights.png', defaultOpacity: 1,
  name: { en: 'City lights', es: 'Luces de las ciudades' },
  desc: { en: 'Earth at night; with “Day and night” on, lights only shine on the dark side.', es: 'La Tierra de noche; con «Día y noche», las luces solo brillan en el lado oscuro.' },
  keywords: 'night lights cities noche luces ciudades',
  credit: 'Population © GeoNames (CC BY 4.0), modelled night lights',
  stops: LIGHTS.map((c, i) => [i / (LIGHTS.length - 1), c]), legendStops: ['#000000', '#ffb347', '#ffe3a6', '#ffffff'], min: '', max: '',
  encoding: { kind: 'log', min: 3, max: 3000 }, unit: '', pickLabel: { en: 'Lights', es: 'Luces' }, nightAware: true, stackOrder: 5,
  note: { en: 'Combine with “Day and night” and “Satellite” for a live night view.', es: 'Combínalo con «Día y noche» y «Satélite» para ver la noche en vivo.' },
});

// ---- Animated winds --------------------------------------------------------------------------
interface WindField { nx: number; ny: number; lon0: number; lat0: number; dx: number; dy: number; u: Float32Array; v: Float32Array }
let windData: { months: Record<string, { u: number[]; v: number[] }>; nx: number; ny: number; lon0: number; lat0: number; dx: number; dy: number } | null = null;

function field(month: string): WindField | null {
  if (!windData) return null;
  const m = windData.months[month] ?? Object.values(windData.months)[0];
  return { nx: windData.nx, ny: windData.ny, lon0: windData.lon0, lat0: windData.lat0, dx: windData.dx, dy: windData.dy, u: Float32Array.from(m.u), v: Float32Array.from(m.v) };
}

function windAt(f: WindField, lon: number, lat: number): [number, number] {
  const x = (((lon - f.lon0) % 360) + 360) % 360 / f.dx;
  const y = (f.lat0 - lat) / f.dy;
  const i0 = Math.floor(x), j0 = Math.max(0, Math.min(f.ny - 2, Math.floor(y)));
  const i1 = (i0 + 1) % f.nx, fx = x - i0, fy = Math.max(0, Math.min(1, y - j0));
  const idx = (i: number, j: number) => j * f.nx + (i % f.nx);
  const bl = (a: Float32Array) =>
    a[idx(i0, j0)] * (1 - fx) * (1 - fy) + a[idx(i1, j0)] * fx * (1 - fy) + a[idx(i0, j0 + 1)] * (1 - fx) * fy + a[idx(i1, j0 + 1)] * fx * fy;
  return [bl(f.u), bl(f.v)];
}

const SPEED_COLORS = ['#8ecbff', '#7ff0d0', '#d9f07a', '#ffc04d', '#ff6a3d', '#ff2d6f'];

interface Particle { lon: number; lat: number; age: number; trail: number[] }

const winds: LayerDef = {
  id: 'winds', category: 'climate', icon: '💨', kind: 'overlay', defaultOpacity: 0.9, stackOrder: 6,
  name: { en: 'Winds (animated)', es: 'Vientos (animados)' },
  desc: { en: 'Prevailing winds about 1.5 km up: trade winds, westerlies and monsoons.', es: 'Vientos dominantes a unos 1,5 km de altura: alisios, oestes y monzones.' },
  keywords: 'wind weather jet stream trade winds monsoon viento alisios monzon',
  credit: 'ECMWF ERA-Interim 850 hPa monthly mean winds (contains modified ECMWF data)',
  options: [{ id: 'month', type: 'select', label: { en: 'Month', es: 'Mes' }, default: 'jan', choices: [
    { value: 'jan', label: { en: 'January', es: 'Enero' } }, { value: 'jul', label: { en: 'July', es: 'Julio' } }] }],
  animated: true,
  async load(_ctx, inst) {
    if (!windData) windData = await loadJSON('layers/winds.json');
    inst.state.field = field(String(inst.options.month));
    inst.state.particles = [];
  },
  onOptionsChanged(inst) { inst.state.field = field(String(inst.options.month)); },
  drawFx(rc, inst, dt) {
    const f = inst.state.field as WindField | null;
    if (!f) return;
    const parts = inst.state.particles as Particle[];
    const target = Math.round(Math.min(2600, Math.max(700, (rc.view.w * rc.view.h) / 520)));
    const spawn = (): Particle => {
      // Spawn near the visible region.
      for (let tries = 0; tries < 12; tries++) {
        const lon = rc.center[0] + (Math.random() * 2 - 1) * Math.min(180, (rc.radius * 180) / Math.PI);
        const lat = Math.max(-80, Math.min(80, rc.center[1] + (Math.random() * 2 - 1) * Math.min(90, (rc.radius * 180) / Math.PI)));
        if (rc.view.isVisible(lon, lat)) return { lon, lat, age: Math.random() * 80, trail: [] };
      }
      return { lon: Math.random() * 360 - 180, lat: Math.random() * 160 - 80, age: Math.random() * 80, trail: [] };
    };
    while (parts.length < target) parts.push(spawn());
    if (parts.length > target) parts.length = target;
    const ctx = rc.ctx;
    const step = Math.min(50, dt) / 1000;
    const k = 0.9; // degrees per second per (m/s) — visual speed
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    const buckets: number[][][] = SPEED_COLORS.map(() => []);
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i];
      const [u, v] = windAt(f, p.lon, p.lat);
      const speed = Math.hypot(u, v);
      const cos = Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
      p.lon += (u * k * step) / cos;
      p.lat += v * k * step;
      if (p.lon > 180) p.lon -= 360; else if (p.lon < -180) p.lon += 360;
      p.age += 1;
      p.trail.push(p.lon, p.lat);
      if (p.trail.length > 16) p.trail.splice(0, 2);
      if (p.age > 110 || Math.abs(p.lat) > 82 || speed < 0.3) { parts[i] = spawn(); continue; }
      const pts: number[] = [];
      for (let j = 0; j < p.trail.length; j += 2) {
        const s = rc.project(p.trail[j], p.trail[j + 1]);
        if (!s) { pts.length = 0; continue; }
        if (pts.length >= 2 && Math.abs(s[0] - pts[pts.length - 2]) > 60) { pts.length = 0; }
        pts.push(s[0], s[1]);
      }
      if (pts.length >= 4) buckets[Math.min(SPEED_COLORS.length - 1, Math.floor(speed / 3.5))].push(pts);
    }
    buckets.forEach((lines, bi) => {
      if (!lines.length) return;
      ctx.strokeStyle = SPEED_COLORS[bi];
      ctx.beginPath();
      for (const pts of lines) {
        ctx.moveTo(pts[0], pts[1]);
        for (let j = 2; j < pts.length; j += 2) ctx.lineTo(pts[j], pts[j + 1]);
      }
      ctx.stroke();
    });
  },
  legend() {
    const es = lang() === 'es';
    return { kind: 'gradient', title: es ? 'Velocidad del viento' : 'Wind speed', stops: SPEED_COLORS, min: '0 m/s', mid: '9 m/s', max: '20+ m/s', note: es ? 'Media mensual a 850 hPa (≈1,5 km).' : 'Monthly mean at 850 hPa (≈1.5 km).' };
  },
  pick(lon, lat, inst) {
    const f = inst.state.field as WindField | null;
    if (!f) return null;
    const [u, v] = windAt(f, lon, lat);
    const speed = Math.hypot(u, v);
    const dirs = lang() === 'es' ? ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    // Wind comes FROM the opposite of its direction of travel.
    const from = (Math.atan2(-u, -v) * 180) / Math.PI;
    const d = dirs[Math.round(((from + 360) % 360) / 45) % 8];
    return [{ label: lang() === 'es' ? 'Viento' : 'Wind', value: `${speed.toFixed(1)} m/s · ${lang() === 'es' ? 'del' : 'from'} ${d}`, icon: '💨' }];
  },
};

export default function register(app: App) {
  app.register([koppen, vegetation, temperature, precipitation, sst, winds, population, cityLights]);
  setDayNightProbe(() => app.isActive('daynight'));
}
