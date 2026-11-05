// Live layers: data fetched by the browser from free public APIs (no keys).
// - Earthquakes: USGS GeoJSON feeds          https://earthquake.usgs.gov/earthquakes/feed/
// - Weather: Open-Meteo current conditions    https://open-meteo.com/
// - Yesterday's satellite view: NASA GIBS WMS https://gibs.earthdata.nasa.gov/
// - The International Space Station:          https://wheretheiss.at/
import { geoCircle, geoDistance } from 'd3-geo';
import { lang, fmtNumber } from '../../app/i18n';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { LayerDef, LayerInstance, RenderCtx } from '../types';
import type { RasterTexture } from '../../engine/gl';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);

async function fetchJSON<T>(url: string, ms = 15000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally { clearTimeout(timer); }
}

const ago = (ms: number) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return L(`${m} min ago`, `hace ${m} min`);
  const h = Math.round(m / 60);
  if (h < 48) return L(`${h} h ago`, `hace ${h} h`);
  return L(`${Math.round(h / 24)} days ago`, `hace ${Math.round(h / 24)} días`);
};

function statusNote(inst: LayerInstance): string | undefined {
  const err = inst.state.error as string | undefined;
  const at = inst.state.updated as number | undefined;
  if (err) return L(`Live data unavailable (${err}). Retrying…`, `Datos en vivo no disponibles (${err}). Reintentando…`);
  if (at) return L(`Updated ${new Date(at).toLocaleTimeString()}`, `Actualizado ${new Date(at).toLocaleTimeString('es-ES')}`);
  return L('Loading live data…', 'Cargando datos en vivo…');
}

function poll(inst: LayerInstance, every: number, fn: () => Promise<void>) {
  const run = async () => {
    try { await fn(); inst.state.error = undefined; inst.state.updated = Date.now(); }
    catch (e) { inst.state.error = (e as Error).name === 'AbortError' ? 'timeout' : String((e as Error).message ?? e); }
    LC.requestRender();
    LC.notify?.();
  };
  void run();
  const id = window.setInterval(() => { if (!document.hidden) void run(); }, every);
  inst.state.timer = id;
}

// ---- Earthquakes -----------------------------------------------------------------------------
interface Quake { lon: number; lat: number; depth: number; mag: number; place: string; time: number; url: string; tsunami: number }

const depthColor = (d: number) => (d < 35 ? '#ff4d4f' : d < 70 ? '#ff922b' : d < 150 ? '#fcc419' : d < 300 ? '#51cf66' : '#4dabf7');

const earthquakes: LayerDef = {
  id: 'quakes', category: 'live', icon: '🫨', kind: 'overlay', stackOrder: 6, animated: true,
  name: { en: 'Earthquakes (live)', es: 'Terremotos (en vivo)' },
  desc: { en: 'Every earthquake of the last day or week from the USGS, updated every 5 minutes.', es: 'Todos los terremotos del último día o semana del USGS, cada 5 minutos.' },
  keywords: 'earthquake quake seismic usgs live terremoto sismo en vivo',
  credit: 'U.S. Geological Survey earthquake feeds (public domain)',
  options: [{ id: 'feed', type: 'select', label: { en: 'Show', es: 'Mostrar' }, default: '2.5_week', choices: [
    { value: 'all_day', label: { en: 'All, past day', es: 'Todos, último día' } },
    { value: '2.5_day', label: { en: 'M2.5+, past day', es: 'M2.5+, último día' } },
    { value: '2.5_week', label: { en: 'M2.5+, past week', es: 'M2.5+, última semana' } },
    { value: '4.5_month', label: { en: 'M4.5+, past month', es: 'M4.5+, último mes' } },
    { value: 'significant_month', label: { en: 'Significant, past month', es: 'Importantes, último mes' } }] }],
  async load(_ctx, inst) {
    inst.state.quakes = [];
    poll(inst, 5 * 60_000, async () => {
      const j = await fetchJSON<{ features: { geometry: { coordinates: number[] }; properties: { mag: number; place: string; time: number; url: string; tsunami: number } }[] }>(
        `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${inst.options.feed}.geojson`);
      inst.state.quakes = j.features.filter((f) => f.geometry && f.properties.mag !== null).map((f) => ({
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2] ?? 0,
        mag: f.properties.mag, place: f.properties.place, time: f.properties.time, url: f.properties.url, tsunami: f.properties.tsunami,
      })).sort((a, b) => a.mag - b.mag) as Quake[];
    });
  },
  onOptionsChanged(inst) { clearInterval(inst.state.timer as number); void earthquakes.load!(LC, inst); },

  drawOverlay(rc, inst) {
    const { ctx } = rc;
    for (const q of (inst.state.quakes as Quake[]) ?? []) {
      const p = rc.project(q.lon, q.lat);
      if (!p) continue;
      const r = Math.max(2, Math.pow(1.75, q.mag) * 0.9);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = depthColor(q.depth) + 'aa'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = rc.theme.dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)'; ctx.stroke();
    }
  },
  drawFx(rc, inst) {
    // Ripples on quakes of the last 6 hours.
    const { ctx } = rc;
    const now = Date.now();
    for (const q of (inst.state.quakes as Quake[]) ?? []) {
      const age = now - q.time;
      if (age > 6 * 3600_000 || q.mag < 3) continue;
      const p = rc.project(q.lon, q.lat);
      if (!p) continue;
      const ph = ((rc.now / 1800) + q.time % 1000 / 1000) % 1;
      const r = Math.pow(1.75, q.mag) * (1 + ph * 2.2);
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,80,80,${(1 - ph) * 0.8})`; ctx.lineWidth = 2; ctx.stroke();
    }
  },
  labels(rc, inst) {
    for (const q of ((inst.state.quakes as Quake[]) ?? []).filter((x) => x.mag >= 5.5)) {
      const p = rc.project(q.lon, q.lat);
      if (p) rc.labels.add({ text: `M${q.mag.toFixed(1)}`, sub: ago(Date.now() - q.time), x: p[0] + 8, y: p[1], align: 'left', priority: 970 + q.mag, size: 11, weight: 800, color: '#ffd8d8', halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const n = ((inst.state.quakes as Quake[]) ?? []).length;
    return {
      kind: 'categories', title: L(`Earthquakes: ${n}`, `Terremotos: ${n}`),
      items: [
        { color: '#ff4d4f', label: L('0–35 km deep', '0–35 km de profundidad'), shape: 'dot' }, { color: '#ff922b', label: '35–70 km', shape: 'dot' },
        { color: '#fcc419', label: '70–150 km', shape: 'dot' }, { color: '#51cf66', label: '150–300 km', shape: 'dot' }, { color: '#4dabf7', label: '> 300 km', shape: 'dot' },
      ],
      note: `${L('Size = magnitude. Ripples = last 6 h.', 'Tamaño = magnitud. Ondas = últimas 6 h.')} ${statusNote(inst) ?? ''}`,
    };
  },
  pick(lon, lat, inst) {
    let best: Quake | null = null, bd = 0.05;
    for (const q of (inst.state.quakes as Quake[]) ?? []) { const d = geoDistance([lon, lat], [q.lon, q.lat]); if (d < bd) { bd = d; best = q; } }
    if (!best) return null;
    return [
      { label: L('Earthquake', 'Terremoto'), value: `M${best.mag.toFixed(1)} · ${best.place}`, icon: '🫨' },
      { label: L('When', 'Cuándo'), value: `${ago(Date.now() - best.time)} (${new Date(best.time).toLocaleString(es() ? 'es-ES' : 'en-GB')})` },
      { label: L('Depth', 'Profundidad'), value: `${fmtNumber(best.depth, 0)} km` },
      ...(best.tsunami ? [{ label: L('Tsunami', 'Tsunami'), value: L('warning issued', 'alerta emitida'), icon: '🌊' }] : []),
    ];
  },
};

// ---- Weather ---------------------------------------------------------------------------------
interface Wx { lon: number; lat: number; name: string; t: number; code: number; wind: number; day: number }
const WMO: Record<number, [string, string, string]> = {
  0: ['☀️', 'Clear', 'Despejado'], 1: ['🌤️', 'Mainly clear', 'Casi despejado'], 2: ['⛅', 'Partly cloudy', 'Parcialmente nublado'], 3: ['☁️', 'Overcast', 'Cubierto'],
  45: ['🌫️', 'Fog', 'Niebla'], 48: ['🌫️', 'Rime fog', 'Niebla helada'], 51: ['🌦️', 'Light drizzle', 'Llovizna débil'], 53: ['🌦️', 'Drizzle', 'Llovizna'], 55: ['🌧️', 'Heavy drizzle', 'Llovizna intensa'],
  61: ['🌦️', 'Light rain', 'Lluvia débil'], 63: ['🌧️', 'Rain', 'Lluvia'], 65: ['🌧️', 'Heavy rain', 'Lluvia intensa'], 66: ['🌧️', 'Freezing rain', 'Lluvia helada'], 67: ['🌧️', 'Freezing rain', 'Lluvia helada'],
  71: ['🌨️', 'Light snow', 'Nieve débil'], 73: ['🌨️', 'Snow', 'Nieve'], 75: ['❄️', 'Heavy snow', 'Nevada intensa'], 77: ['🌨️', 'Snow grains', 'Granos de nieve'],
  80: ['🌦️', 'Showers', 'Chubascos'], 81: ['🌧️', 'Showers', 'Chubascos'], 82: ['⛈️', 'Violent showers', 'Chubascos fuertes'], 85: ['🌨️', 'Snow showers', 'Chubascos de nieve'], 86: ['🌨️', 'Snow showers', 'Chubascos de nieve'],
  95: ['⛈️', 'Thunderstorm', 'Tormenta'], 96: ['⛈️', 'Thunderstorm, hail', 'Tormenta con granizo'], 99: ['⛈️', 'Thunderstorm, hail', 'Tormenta con granizo'],
};
const tempColor = (t: number) => {
  const stops: [number, string][] = [[-30, '#7048e8'], [-10, '#4dabf7'], [0, '#a5d8ff'], [10, '#b2f2bb'], [20, '#ffe066'], [28, '#ff922b'], [36, '#e03131']];
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return stops[i - 1][1];
  return stops[stops.length - 1][1];
};

const weather: LayerDef = {
  id: 'weather', category: 'live', icon: '⛅', kind: 'overlay', stackOrder: 6,
  name: { en: 'Weather now (live)', es: 'El tiempo ahora (en vivo)' },
  desc: { en: 'Current temperature, sky and wind in about 120 capitals and big cities.', es: 'Temperatura, cielo y viento actuales en unas 120 capitales y grandes ciudades.' },
  keywords: 'weather temperature rain live forecast tiempo temperatura lluvia en vivo',
  credit: 'Weather data by Open-Meteo.com (CC BY 4.0)',
  async load(_ctx, inst) {
    inst.state.wx = [];
    poll(inst, 15 * 60_000, async () => {
      const cities = LC.data.cities.filter((c) => c.capital === 2 && !(c.flags & 4)).sort((a, b) => b.pop - a.pop).slice(0, 90)
        .concat(LC.data.cities.filter((c) => c.capital !== 2 && c.pop > 6e6).slice(0, 30));
      const out: Wx[] = [];
      for (let i = 0; i < cities.length; i += 60) {
        const batch = cities.slice(i, i + 60);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${batch.map((c) => c.lat.toFixed(3)).join(',')}&longitude=${batch.map((c) => c.lon.toFixed(3)).join(',')}&current=temperature_2m,weather_code,wind_speed_10m,is_day`;
        const j = await fetchJSON<{ current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; is_day: number } }[] | { current: { temperature_2m: number; weather_code: number; wind_speed_10m: number; is_day: number } }>(url);
        const arr = Array.isArray(j) ? j : [j];
        arr.forEach((r, k) => {
          const c = batch[k];
          if (!c || !r?.current) return;
          out.push({ lon: c.lon, lat: c.lat, name: es() && c.es ? c.es : c.name, t: r.current.temperature_2m, code: r.current.weather_code, wind: r.current.wind_speed_10m, day: r.current.is_day });
        });
      }
      inst.state.wx = out;
    });
  },
  drawOverlay() { /* drawn as labels so they never overlap */ },
  labels(rc, inst) {
    for (const w of (inst.state.wx as Wx[]) ?? []) {
      const p = rc.project(w.lon, w.lat);
      if (!p) continue;
      const icon = (WMO[w.code] ?? ['🌡️'])[0];
      rc.labels.add({
        text: `${w.day ? icon : icon.replace('☀️', '🌙').replace('🌤️', '🌙')} ${Math.round(w.t)}°`, x: p[0], y: p[1] - 12, priority: 990,
        size: 13, weight: 800, color: tempColor(w.t), halo: rc.theme.dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)',
      });
    }
  },
  legend(inst) {
    return {
      kind: 'gradient', title: L('Temperature now', 'Temperatura ahora'),
      stops: ['#7048e8', '#4dabf7', '#a5d8ff', '#b2f2bb', '#ffe066', '#ff922b', '#e03131'], min: '−30 °C', mid: '10 °C', max: '36 °C',
      note: statusNote(inst),
    };
  },
  pick(lon, lat, inst) {
    let best: Wx | null = null, bd = 0.04;
    for (const w of (inst.state.wx as Wx[]) ?? []) { const d = geoDistance([lon, lat], [w.lon, w.lat]); if (d < bd) { bd = d; best = w; } }
    if (!best) return null;
    const c = WMO[best.code] ?? ['🌡️', '', ''];
    return [{ label: best.name, value: `${c[0]} ${es() ? c[2] : c[1]}, ${fmtNumber(best.t, 1)} °C`, icon: '⛅' }, { label: L('Wind', 'Viento'), value: `${fmtNumber(best.wind, 0)} km/h`, icon: '💨' }];
  },
};

// ---- NASA GIBS: yesterday's true-colour Earth --------------------------------------------------
function yesterdayUTC(days = 1) {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 10);
}

// Satellites with a daily true-colour picture, best first. A satellite that sent nothing that day
// still gets an image from GIBS, an all-black one (Suomi NPP from 2 November 2026), so each is
// checked on a small preview before the full picture is loaded.
const GIBS_SATELLITES = [
  { layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', name: 'NOAA-20 (VIIRS)' },
  { layer: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', name: 'NOAA-21 (VIIRS)' },
  { layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', name: 'Suomi NPP (VIIRS)' },
  { layer: 'MODIS_Aqua_CorrectedReflectance_TrueColor', name: 'Aqua (MODIS)' },
  { layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', name: 'Terra (MODIS)' },
];

const gibsUrl = (layer: string, date: string, w: number) =>
  `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${layer}&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${w}&HEIGHT=${w / 2}&FORMAT=image/jpeg&TIME=${date}`;

/** Share of a small preview that shows something (not black): about 0.8 on a normal day. */
async function gibsCoverage(layer: string, date: string): Promise<number> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = gibsUrl(layer, date, 128);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
    return lit / (d.length / 4);
  } catch { return 0; }
}

const gibs: LayerDef = {
  id: 'gibs', category: 'imagery', icon: '🌍', kind: 'raster', group: 'imagery', defaultOpacity: 1,
  name: { en: 'Satellite: yesterday (NASA)', es: 'Satélite: ayer (NASA)' },
  desc: { en: 'Yesterday’s real Earth with clouds, storms and smoke (NASA VIIRS/MODIS).', es: 'La Tierra real de ayer, con nubes, tormentas y humo (NASA VIIRS/MODIS).' },
  keywords: 'satellite clouds today yesterday nasa live nubes satelite ayer',
  credit: 'NASA EOSDIS GIBS / Worldview (VIIRS and MODIS corrected reflectance)',
  async load(ctx, inst) {
    if (!ctx.gl) throw new Error('WebGL2 is needed');
    // The first satellite (in the order above) with a well-covered picture of yesterday, else of the
    // day before (yesterday's can still be filling in early in the day); failing both, the
    // best-covered picture found.
    type Pick = { sat: (typeof GIBS_SATELLITES)[number]; date: string; cover: number };
    let pick: Pick | null = null, best: Pick | null = null;
    for (const day of [1, 2]) {
      const date = yesterdayUTC(day);
      const covers = await Promise.all(GIBS_SATELLITES.map((s) => gibsCoverage(s.layer, date)));
      const i = covers.findIndex((c) => c >= 0.6);
      if (i >= 0) { pick = { sat: GIBS_SATELLITES[i], date, cover: covers[i] }; break; }
      for (let k = 0; k < covers.length; k++) if (!best || covers[k] > best.cover) best = { sat: GIBS_SATELLITES[k], date, cover: covers[k] };
    }
    pick ??= best;
    if (!pick || pick.cover < 0.05) throw new Error('No satellite picture for yesterday yet');
    inst.state.tex = await ctx.gl.load(gibsUrl(pick.sat.layer, pick.date, 4096));
    inst.state.date = pick.date;
    inst.state.sat = pick.sat.name;
  },
  raster(_rc, inst) {
    const tex = inst.state.tex as RasterTexture | undefined;
    return tex ? [{ texture: tex, opacity: inst.opacity }] : null;
  },
  legend(inst) {
    return { kind: 'html', title: L('NASA satellite view', 'Vista satelital de la NASA'), html: `<div class="lg-row">📅 ${inst.state.date ?? ''} (UTC)</div><div class="lg-row">🛰️ ${inst.state.sat ?? ''}</div><div class="lg-row muted">${L('Black areas are gaps between satellite passes and the polar night.', 'Las zonas negras son huecos entre pasadas del satélite y la noche polar.')}</div>` };
  },
};

// ---- International Space Station ---------------------------------------------------------------
const iss: LayerDef = {
  id: 'iss', category: 'live', icon: '🛰️', kind: 'overlay', stackOrder: 7, animated: true,
  name: { en: 'Space Station (live)', es: 'Estación Espacial (en vivo)' },
  desc: { en: 'Where the International Space Station is right now, its track and what it can see.', es: 'Dónde está ahora la Estación Espacial Internacional, su trayectoria y lo que ve.' },
  keywords: 'iss space station orbit astronauts estacion espacial orbita astronautas',
  credit: 'Where the ISS at? (wheretheiss.at)',
  async load(_ctx, inst) {
    inst.state.track = [] as [number, number][];
    poll(inst, 5000, async () => {
      const j = await fetchJSON<{ latitude: number; longitude: number; altitude: number; velocity: number; visibility: string }>('https://api.wheretheiss.at/v1/satellites/25544', 8000);
      const track = inst.state.track as [number, number][];
      track.push([j.longitude, j.latitude]);
      if (track.length > 360) track.shift();
      inst.state.now = j;
    });
  },
  drawOverlay(rc, inst) {
    const { ctx, path } = rc;
    const track = inst.state.track as [number, number][];
    if (track.length > 1) {
      ctx.beginPath(); path({ type: 'LineString', coordinates: track });
      ctx.strokeStyle = 'rgba(255,214,102,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    const n = inst.state.now as { latitude: number; longitude: number; altitude: number } | undefined;
    if (!n) return;
    // Area that can see the station above the horizon (~2,200 km radius at 420 km altitude).
    const radius = (Math.acos(6371 / (6371 + n.altitude)) * 180) / Math.PI;
    ctx.beginPath(); path(geoCircle().center([n.longitude, n.latitude]).radius(radius)());
    ctx.fillStyle = 'rgba(255,214,102,0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,214,102,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  },
  drawFx(rc, inst) {
    const n = inst.state.now as { latitude: number; longitude: number } | undefined;
    if (!n) return;
    const p = rc.project(n.longitude, n.latitude);
    if (!p) return;
    const { ctx } = rc;
    const pulse = 0.5 + 0.5 * Math.sin(rc.now / 300);
    ctx.beginPath(); ctx.arc(p[0], p[1], 16 + pulse * 8, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,214,102,${0.3 - pulse * 0.2})`; ctx.fill();
    // A small drawn station (solar wings + module) so it shows even without emoji fonts.
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-0.5);
    ctx.fillStyle = '#4dabf7'; ctx.strokeStyle = '#0b1a33'; ctx.lineWidth = 1;
    for (const s of [-1, 1]) { ctx.fillRect(s * 6 - (s < 0 ? 8 : 0), -5, 8, 10); ctx.strokeRect(s * 6 - (s < 0 ? 8 : 0), -5, 8, 10); }
    ctx.fillStyle = '#ffd666'; ctx.fillRect(-5, -2.5, 10, 5); ctx.strokeRect(-5, -2.5, 10, 5);
    ctx.restore();
    ctx.font = '700 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText('ISS', p[0] + 16, p[1]); ctx.fillStyle = '#ffd666'; ctx.fillText('ISS', p[0] + 16, p[1]);
  },
  legend(inst) {
    const n = inst.state.now as { latitude: number; longitude: number; altitude: number; velocity: number; visibility: string } | undefined;
    const html = n
      ? `<div class="lg-row">📍 ${Math.abs(n.latitude).toFixed(1)}°${n.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(n.longitude).toFixed(1)}°${n.longitude >= 0 ? 'E' : 'W'}</div>
         <div class="lg-row">🚀 ${fmtNumber(n.velocity, 0)} km/h · ${fmtNumber(n.altitude, 0)} km</div>
         <div class="lg-row muted">${n.visibility === 'daylight' ? L('In sunlight', 'Al sol') : L('In Earth’s shadow', 'En la sombra de la Tierra')}</div>`
      : `<div class="lg-row muted">${statusNote(inst) ?? ''}</div>`;
    return { kind: 'html', title: L('International Space Station', 'Estación Espacial Internacional'), html };
  },
};

export default function register(app: App) {
  app.register([earthquakes, weather, iss, gibs]);
}

export type { RenderCtx };
