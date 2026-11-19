// Into the deep (v0.33.0): the oceans. The sea floor by depth zone; drain the oceans (and the sea rising); the
// undersea mountains and trenches (GEBCO's names); hydrothermal vents; shipwrecks; the living ocean month by month
// (plankton and sea ice); mangroves and kelp forests; the great garbage patches.
import type { Topology } from 'topojson-specification';
import { geoContains, geoDistance } from 'd3-geo';
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { LayerDef, LayerHit, LayerInstance, LayerTapUi, RenderCtx } from '../types';
import type { RasterTexture } from '../../engine/gl';
import { loadJSON, shapesFrom, dataUrl, type Shape } from '../../data/store';
import { fmtNumber, lang } from '../../app/i18n';
import { L } from '../../play/host';
import { LC } from '../context';
import { loadDepths, heightAt, seaDepthAt, zoneOf, ZONES, oceanAt, OCEAN_NAMES, depths, type Depths } from '../../ocean/depth';

let APP: App | null = null;
let GL: import('../../engine/gl').GLRaster | null = null;
let seaZoom = 0;
let SHELL: Shell | null = null;
const es = () => lang() === 'es';
const T = (x?: { en: string; es: string } | null) => (x ? (es() ? x.es : x.en) : '');
const m = (v: number) => `${fmtNumber(Math.round(v))} m`;
const MONTHS = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] };
const monthName = (i: number) => (es() ? MONTHS.es : MONTHS.en)[((i % 12) + 12) % 12];

/** The item nearest a tap among those drawn on screen, within `px` pixels. */
function pickNear<X>(items: X[], at: (x: X) => [number, number], ui: LayerTapUi, px = 14): X | null {
  let best: X | null = null, bd = px;
  for (const it of items) {
    const g = at(it), p = ui.project(g[0], g[1]);
    if (!p) continue;
    const d = Math.hypot(p[0] - ui.x, p[1] - ui.y);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}


/** How strongly a search asks for "the deepest" (0: it does not): the best of the phrases it starts or matches. */
function deepestAsked(match: (s: string) => number, phrases: string[]): number {
  // Not for the start of a word ("deep", "más"): only once it says "deepest", "más prof…".
  if (['d', 'de', 'dee', 'deep', 'deepe', 'm', 'ma', 'mas', 'el', 'el mas', 'lo', 'lo mas', 'b', 'ba', 'p', 'pe', 'n', 'na'].some((x) => match(x) === 100)) return 0;
  const best = Math.max(...phrases.map((p) => match(p)));
  return best >= 75 ? best : 0;
}

// ---- The depth grid as pictures: a canvas the GPU draws, made again when the water level changes ---------------
const W = 1440, H = 720;
function paint(d: Depths, colour: (mean: number, i: number) => number | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < W * H; i++) { const v = colour(d.mean[i], i); if (v != null) px[i] = v; }
  g.putImageData(img, 0, 0);
  return c;
}
/** An ABGR word (the order ImageData's bytes have on little-endian machines) from "#rrggbb" and an alpha 0–255. */
const abgr = (hex: string, a = 255) => { const n = parseInt(hex.slice(1), 16); return ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const mix = (a: string, b: string, t: number, al = 255) => {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
  return ((al << 24) | (c(0) << 16) | (c(8) << 8) | c(16)) >>> 0;
};

// ---- The sea floor by depth zone ----------------------------------------------------------------------------------
let floorTex: RasterTexture | null = null, floorKey = '';
export const seaFloor: LayerDef = {
  id: 'seafloor', category: 'earth', icon: '🌊', kind: 'raster', defaultOpacity: 0.92,
  name: { en: 'The sea floor by depth', es: 'El fondo del mar por profundidad' },
  desc: { en: 'The oceans coloured by how deep they are: the sunlit shelves, the twilight and midnight zones, the abyss and the trenches. Tap the sea for its depth. From NOAA’s ETOPO 2022.', es: 'Los océanos coloreados según su profundidad: las plataformas iluminadas, las zonas de penumbra y de medianoche, el abismo y las fosas. Toca el mar para ver su profundidad. Del ETOPO 2022 de la NOAA.' },
  keywords: 'ocean depth bathymetry sea floor abyss trench zones etopo oceano profundidad batimetria fondo marino abismo fosa zonas',
  credit: 'NOAA NCEI: ETOPO 2022 (public domain)',
  options: [{ id: 'show', label: { en: 'Colour', es: 'Color' }, type: 'select', default: 'zones', choices: [
    { value: 'zones', label: { en: 'By zone', es: 'Por zona' } }, { value: 'depth', label: { en: 'By depth', es: 'Por profundidad' } },
  ] }],
  async load(ctx) { if (!ctx.gl) throw new Error('WebGL2 is needed for this filter'); GL = ctx.gl; await loadDepths(); },
  onOptionsChanged() { LC.requestRender(); },
  raster(rc, inst) {
    if (!depths || !GL) return null;
    const key = String(inst.options.show ?? 'zones');
    if (key !== floorKey || !floorTex) {
      const zones = ZONES.map((z) => abgr(z.color, 235));
      const canvas = paint(depths, (mean) => {
        if (mean >= 0) return null;
        const d = -mean;
        if (key === 'zones') return zones[ZONES.indexOf(zoneOf(d))];
        const t = Math.min(1, Math.log1p(d / 100) / Math.log1p(110));
        return mix('#a5d8ff', '#0b1446', t, 240);
      });
      floorTex = GL.upload(canvas, floorTex);
      floorKey = key;
    }
    return floorTex ? [{ texture: floorTex, opacity: inst.opacity }] : null;
  },
  tap(lon, lat, _inst, ui) {
    if (!depths) return false;
    const c = heightAt(depths, lon, lat);
    if (c.mean >= 0 && c.deep >= -200) return false;
    const deepest = seaDepthAt(depths, lon, lat), z = zoneOf(-Math.min(c.mean, 0));
    ui.card('🌊', L('{0} deep', '{0} de profundidad', m(-c.mean)), `${OCEAN_NAMES[oceanAt(lon, lat)]()} · ${fmtNumber(Math.abs(lat), 1)}°${lat >= 0 ? 'N' : 'S'}, ${fmtNumber(Math.abs(lon), 1)}°${lon >= 0 ? 'E' : L('W', 'O')}`, [
      { label: L('Zone', 'Zona'), value: z.name(), icon: '🔷' },
      ...(deepest + c.mean > 300 ? [{ label: L('Deepest point near here', 'Lo más hondo cerca de aquí'), value: m(deepest), icon: '⬇️' }] : []),
    ], [{ label: L('🤿 Dive here', '🤿 Bucear aquí'), onClick: () => void window.atlas?.deep.diveAt(lon, lat) }]);
    return true;
  },
  legend(inst) {
    const zones = String(inst.options.show ?? 'zones') === 'zones';
    const note = L('Only about a quarter of the sea floor has been mapped in detail by ships (Seabed 2030); the rest is known from satellites, a few kilometres at a time.',
      'Solo cerca de una cuarta parte del fondo marino se ha cartografiado en detalle con barcos (Seabed 2030); el resto se conoce por satélites, unos kilómetros a la vez.');
    if (!zones) return { kind: 'gradient', title: L('The sea floor by depth', 'El fondo del mar por profundidad'), stops: ['#a5d8ff', '#4c8fd6', '#1f3f8f', '#0b1446'], min: '0 m', max: '11 000 m', note };
    return { kind: 'categories', title: L('The sea floor by zone', 'El fondo del mar por zona'), items: ZONES.map((z) => ({ color: z.color, label: `${z.name()} · ${m(z.top)}–${m(z.bottom)}` })), note };
  },
};

// ---- Drain the oceans, and the sea rising -----------------------------------------------------------------------
export const LEVELS = [70, 25, 10, 5, 2, 1, 0, -50, -120, -200, -500, -1000, -2000, -3000, -4000, -5000, -6000, -8000, -11000];
const levelOfT = (t: number) => { const i = Math.max(0, Math.min(LEVELS.length - 1, t)), a = Math.floor(i), b = Math.min(LEVELS.length - 1, a + 1); return LEVELS[a] + (LEVELS[b] - LEVELS[a]) * (i - a); };
const tOfLevel = (lv: number) => { for (let i = 1; i < LEVELS.length; i++) if (lv >= LEVELS[i]) return i - 1 + (LEVELS[i - 1] - lv) / (LEVELS[i - 1] - LEVELS[i]); return LEVELS.length - 1; };
interface Rise { id: string; name: { en: string; es: string }; lon: number; lat: number; elev_m: number }
interface Places { kelp: { id: string; name: { en: string; es: string }; lon: number; lat: number; text: { en: string; es: string } }[]; patches: { id: string; name: { en: string; es: string }; ring: [number, number][]; text: { en: string; es: string } }[]; rise: Rise[] }
let places: Places | null = null;
const loadPlaces = async () => (places ??= await loadJSON<Places>('ocean/places.json'));
const BRIDGES: [string, string, number, number][] = [['Beringia', 'Beringia', -168, 65], ['Doggerland', 'Doggerland', 3, 54.5], ['Sundaland', 'Sondalandia', 110, 2], ['Sahul', 'Sahul', 140, -10]];
function levelWords(lv: number): string {
  if (lv > 0.5) return L('The sea {0} higher: the land that low goes under. Elevation only, not a flood forecast.', 'El mar {0} más alto: la tierra así de baja queda bajo el agua. Solo la altura, no un pronóstico de inundación.', m(lv));
  if (lv > -0.5) return L('The sea where it is today.', 'El mar donde está hoy.');
  if (lv > -130) return L('The sea {0} lower. At about −120 m, as in the last Ice Age, Asia and America join at Beringia, Britain at Doggerland, Borneo and Java at Sundaland, Australia and New Guinea at Sahul.', 'El mar {0} más bajo. A unos −120 m, como en la última glaciación, Asia y América se unen en Beringia, Gran Bretaña en Doggerland, Borneo y Java en Sondalandia, Australia y Nueva Guinea en Sahul.', m(-lv));
  if (lv > -2500) return L('The sea {0} lower: the continental shelves are dry; the oceans shrink to their basins.', 'El mar {0} más bajo: las plataformas continentales quedan secas; los océanos se encogen a sus cuencas.', m(-lv));
  if (lv > -6000) return L('The sea {0} lower: the mid-ocean ridges rise out of the water like mountain ranges.', 'El mar {0} más bajo: las dorsales oceánicas salen del agua como cordilleras.', m(-lv));
  return L('The sea {0} lower: only the trenches still hold water.', 'El mar {0} más bajo: solo las fosas conservan agua.', m(-lv));
}
let levelTex: RasterTexture | null = null, levelDrawn = NaN, levelAt = 0;
export const drainOceans: LayerDef = {
  id: 'sealevel', category: 'earth', icon: '🫗', kind: 'raster', defaultOpacity: 1,
  animated: (inst) => !!inst.state.playing,
  name: { en: 'Drain the oceans', es: 'Vaciar los océanos' },
  desc: { en: 'Let the water go: the continental shelves, the Ice Age land bridges at −120 m, the mid-ocean ridges and at last the trenches. Or raise the sea up to +70 m, if all the ice melted.', es: 'Deja ir el agua: las plataformas continentales, los puentes de tierra de la Edad de Hielo a −120 m, las dorsales oceánicas y al final las fosas. O sube el mar hasta +70 m, si se derritiera todo el hielo.' },
  keywords: 'drain oceans sea level rise ice age land bridge beringia doggerland flood vaciar oceanos nivel del mar glaciacion puente de tierra inundacion',
  credit: 'NOAA NCEI: ETOPO 2022 (public domain); city heights from their surveys (scripts/data/ocean/curated/places.json)',
  options: [{ id: 'level', label: { en: 'Sea level', es: 'Nivel del mar' }, type: 'select', default: '-120', choices: LEVELS.map((v) => ({ value: String(v), label: { en: `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNumber(Math.abs(v))} m`, es: `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNumber(Math.abs(v))} m` } })) }],
  async load(ctx, inst) {
    if (!ctx.gl) throw new Error('WebGL2 is needed for this filter');
    GL = ctx.gl;
    await Promise.all([loadDepths(), loadPlaces().catch(() => null)]);
    inst.state.t = tOfLevel(Number(inst.options.level ?? -120));
  },
  onOptionsChanged(inst) { inst.state.playing = false; inst.state.t = tOfLevel(Number(inst.options.level ?? -120)); LC.requestRender(); LC.notify?.(); },
  raster(rc, inst) {
    if (!depths || !GL) return null;
    const now = rc.now;
    if (inst.state.playing) {
      const last = (inst.state.last as number) ?? now;
      inst.state.t = Math.min(LEVELS.length - 1, (inst.state.t as number) + ((now - last) / 1000) * ((inst.state.speed as number) ?? 1));
      if ((inst.state.t as number) >= LEVELS.length - 1) { inst.state.playing = false; LC.notify?.(); }
    }
    inst.state.last = now;
    const lv = levelOfT(inst.state.t as number ?? 8);
    inst.state.level = lv;
    // A new picture when the level has moved enough (at most ten times a second while it plays).
    if (!levelTex || (Math.abs(lv - levelDrawn) > Math.max(1, Math.abs(lv) * 0.01) && now - levelAt > 90)) {
      const sea = '#1c5fb3', sand = '#d9c48b', deep = '#6b5a3a';
      const canvas = paint(depths, (mean) => {
        if (lv < 0) {
          if (mean >= 0 || mean < lv) return null;
          // Newly dry sea floor: sandy near the old shore, darker where it was deep.
          return mix(sand, deep, Math.min(1, Math.log1p(-mean / 50) / Math.log1p(220)));
        }
        return mean >= 0 && mean < lv ? abgr(sea, 215) : null;
      });
      levelTex = GL.upload(canvas, levelTex);
      levelDrawn = lv; levelAt = now;
      LC.notify?.();
    }
    return levelTex ? [{ texture: levelTex, opacity: inst.opacity }] : null;
  },
  labels(rc, inst) {
    const lv = (inst.state.level as number) ?? -120;
    if (lv <= -100 && lv > -1500) for (const [en, es2, lon, lat] of BRIDGES) {
      const p = rc.project(lon, lat);
      if (p) rc.labels.add({ text: es() ? es2 : en, x: p[0], y: p[1], priority: 900, size: 12, weight: 700, italic: true, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
    if (lv > 0.5) for (const c of places?.rise ?? []) {
      if (c.elev_m >= lv) continue;
      const p = rc.project(c.lon, c.lat);
      if (p) rc.labels.add({ text: `🌊 ${T(c.name)}`, x: p[0], y: p[1], priority: 700 - c.elev_m, size: 11, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const t = (inst.state.t as number) ?? tOfLevel(Number(inst.options.level ?? -120));
    const lv = levelOfT(t);
    const under = lv > 0.5 ? (places?.rise ?? []).filter((c) => c.elev_m < lv).length : 0;
    return {
      kind: 'categories', title: L('Sea level {0}{1}', 'Nivel del mar {0}{1}', lv > 0 ? '+' : lv < 0 ? '−' : '', m(Math.abs(lv))),
      items: lv < 0 ? [{ color: '#d9c48b', label: L('Sea floor left dry', 'Fondo marino que queda seco') }] : lv > 0 ? [{ color: '#1c5fb3', label: (under ? L('Land under the sea · {0} big cities', 'Tierra bajo el mar · {0} grandes ciudades', under) : L('Land under the sea', 'Tierra bajo el mar')) }] : [],
      note: levelWords(lv),
      player: {
        min: 0, max: LEVELS.length - 1, value: t, playing: !!inst.state.playing, speeds: [0.5, 1, 2], speed: (inst.state.speed as number) ?? 1,
        label: (v) => { const x = levelOfT(v); return `${x > 0 ? '+' : x < 0 ? '−' : ''}${m(Math.abs(x))}`; },
        speedLabel: (v) => L('{0}× speed', 'velocidad {0}×', v),
        onToggle: () => { if (!inst.state.playing && (inst.state.t as number) >= LEVELS.length - 1) inst.state.t = 6; inst.state.playing = !inst.state.playing; inst.state.last = performance.now(); LC.requestRender(); LC.notify?.(); },
        onSeek: (v) => { inst.state.t = v; inst.state.playing = false; LC.requestRender(); LC.notify?.(); },
        onSpeed: (v) => { inst.state.speed = v; LC.notify?.(); },
      },
    };
  },
};

// ---- Undersea mountains and trenches: GEBCO's names, the famous ones first -----------------------------------------
interface Famous { id: string; name: { en: string; es: string }; kind: string; lon: number; lat: number; line?: [number, number][]; depth_m?: number; rank: number; text: { en: string; es: string } }
interface Features { types: string[]; generic: Record<string, string>; rows: [number, string, number, number, number][]; famous: Famous[] }
let feats: Features | null = null;
let notes: Record<string, [number | null, string | null]> | null = null;
const loadFeatures = async () => (feats ??= await loadJSON<Features>('ocean/features.json'));
/** A GEBCO name with its generic term, which the gazetteer keeps apart: "Ake-No-Myojo Seamount", "Monte submarino Ake-No-Myojo". */
function featureName(name: string, type: string): string {
  if (!type || type === 'UNKNOWN') return name;
  if (es()) { const g = feats?.generic[type]; return g ? `${g} ${name}` : `${name} ${type}`; }
  return new RegExp(`\\b${type}\\b`, 'i').test(name) ? name : `${name} ${type}`;
}
const KIND_COLOUR: Record<string, string> = { trench: '#9775fa', ridge: '#ff922b', seamount: '#ffd43b', guyot: '#ffd43b', plain: '#74c0fc', canyon: '#63e6be', plateau: '#a9e34b', basin: '#74c0fc', fracture: '#adb5bd', rise: '#ffa94d', other: '#dee2e6' };
export const seaFeatures: LayerDef = {
  id: 'sea-features', category: 'earth', icon: '⛰️', kind: 'overlay', stackOrder: 2,
  name: { en: 'Undersea mountains and trenches', es: 'Montañas y fosas submarinas' },
  desc: { en: 'The names of the sea floor: the Mariana Trench, the Mid-Atlantic Ridge, the Emperor Seamounts and 5,000 more, from GEBCO’s gazetteer of undersea feature names.', es: 'Los nombres del fondo del mar: la fosa de las Marianas, la dorsal mesoatlántica, los montes submarinos del Emperador y 5 000 más, del nomenclátor de formas submarinas de GEBCO.' },
  keywords: 'undersea feature seamount trench ridge guyot canyon abyssal plain gebco names fosa dorsal monte submarino cañon llanura abisal nombres',
  credit: 'IHO-IOC GEBCO Gazetteer of Undersea Feature Names (NOAA NCEI)',
  async load() { await loadFeatures(); },
  drawOverlay(rc) {
    if (!feats) return;
    const { ctx } = rc;
    for (const f of feats.famous) {
      if (!f.line || f.line.length < 2) continue;
      ctx.beginPath(); let on = false;
      for (const [lon, lat] of f.line) { const p = rc.project(lon, lat); if (!p) { on = false; continue; } if (on) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); on = true; }
      ctx.lineWidth = f.rank === 1 ? 2.2 : 1.4; ctx.strokeStyle = KIND_COLOUR[f.kind] ?? '#dee2e6'; ctx.globalAlpha = 0.75; ctx.setLineDash(f.kind === 'trench' ? [5, 3] : []); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
  },
  labels(rc) {
    if (!feats) return;
    const z = rc.webZoom;
    seaZoom = z;
    for (const f of feats.famous) {
      if (f.rank > (z < 2.5 ? 1 : z < 3.5 ? 2 : 3)) continue;
      const p = rc.project(f.lon, f.lat);
      if (p) rc.labels.add({ text: T(f.name), x: p[0], y: p[1], priority: 820 - f.rank * 60, size: f.rank === 1 ? 11.5 : 10.5, weight: 650, italic: true, color: rc.theme.dark ? '#c5d8ff' : '#1d3a7a', halo: rc.theme.labelHalo });
    }
    if (z < 3.5) return;
    for (const r of feats.rows) {
      const p = rc.project(r[3], r[4]);
      if (!p || p[0] < 0 || p[1] < 0 || p[0] > rc.view.w || p[1] > rc.view.h) continue;
      const type = feats.types[r[2]];
      const big = /Trench|Ridge|Basin|Plain|Plateau|Rise|Fracture|Canyon/.test(type);
      rc.labels.add({ text: featureName(r[1], type), x: p[0], y: p[1], priority: big ? 360 : 240, size: 9.5, weight: 600, italic: true, color: rc.theme.dark ? '#b8c8ee' : '#2b4a8a', halo: rc.theme.labelHalo });
    }
  },
  tap(_lon, _lat, _inst, ui) {
    if (!feats) return false;
    const f = pickNear(feats.famous, (x) => [x.lon, x.lat], ui, 18);
    if (f) {
      ui.card(f.kind === 'trench' ? '🕳️' : f.kind === 'ridge' ? '🏔️' : '⛰️', T(f.name), L('Undersea feature', 'Forma submarina'), [
        ...(f.depth_m ? [{ label: L('Depth', 'Profundidad'), value: m(f.depth_m), icon: '⬇️' }] : []),
      ], [{ label: L('🤿 Dive here', '🤿 Bucear aquí'), onClick: () => void window.atlas?.deep.diveAt(f.lon, f.lat) }], [T(f.text)]);
      return true;
    }
    if (rcZoom() < 3.5) return false;
    const r = pickNear(feats.rows, (x) => [x[3], x[4]], ui, 14);
    if (!r) return false;
    const type = feats.types[r[2]];
    const show = (nt: [number | null, string | null] | undefined) => {
      const d = depths ? seaDepthAt(depths, r[3], r[4]) : 0;
      ui.card('⛰️', featureName(r[1], type), es() ? (feats!.generic[type] ?? type) : type, [
        ...(d > 0 ? [{ label: L('Sea floor here', 'Fondo aquí'), value: m(d), icon: '⬇️' }] : []),
        ...(nt?.[0] ? [{ label: L('Discovered', 'Descubrimiento'), value: String(nt[0]), icon: '🔭' }] : []),
      ], [{ label: L('🤿 Dive here', '🤿 Bucear aquí'), onClick: () => void window.atlas?.deep.diveAt(r[3], r[4]) }], nt?.[1] ? [L('How it got its name: {0}', 'Cómo recibió su nombre (en inglés): {0}', nt[1])] : []);
    };
    if (notes) show(notes[String(r[0])]);
    else void loadJSON<Record<string, [number | null, string | null]>>('ocean/features-notes.json').then((n) => { notes = n; show(n[String(r[0])]); }).catch(() => show(undefined));
    return true;
  },
  searchHint: { en: 'undersea features', es: 'formas submarinas' },
  async searchLoad() { await loadFeatures(); },
  search(match) {
    const out: LayerHit[] = [];
    // "Deepest" (and "lo más hondo"...) finds the deepest place in the ocean (v0.33.2).
    const deep = deepestAsked(match, ['deepest point', 'deepest place', 'deepest trench', 'deepest ocean', 'deepest sea', 'punto mas profundo', 'lugar mas profundo', 'fosa mas profunda', 'lo mas hondo', 'lo mas profundo']);
    const bottom = deep ? [...(feats?.famous ?? [])].filter((f) => f.depth_m).sort((a, b) => (b.depth_m ?? 0) - (a.depth_m ?? 0))[0] : null;
    if (bottom) out.push({ label: T(bottom.name), sub: L('⬇️ The deepest place in the ocean: {0} m', '⬇️ El lugar más profundo del océano: {0} m', fmtNumber(bottom.depth_m!)), icon: '⛰️', lon: bottom.lon, lat: bottom.lat, score: deep + 15, wz: 4 });
    for (const f of feats?.famous ?? []) {
      const sc = Math.max(match(f.name.en), match(f.name.es));
      if (sc >= 50) out.push({ label: T(f.name), sub: L('Undersea feature', 'Forma submarina'), icon: '⛰️', lon: f.lon, lat: f.lat, score: sc + 10, wz: 4 });
    }
    for (const r of feats?.rows ?? []) {
      const sc = match(r[1]);
      if (sc >= 60) out.push({ label: featureName(r[1], feats!.types[r[2]]), sub: feats!.types[r[2]], icon: '⛰️', lon: r[3], lat: r[4], score: sc, wz: 6 });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 6);
  },
};
const rcZoom = () => seaZoom;

// ---- Hydrothermal vents ---------------------------------------------------------------------------------------------
interface Vent { id: string; name: { en: string; es: string }; kind: string; lon: number; lat: number; depth_m: number; year?: number; text: { en: string; es: string } }
let vents: Vent[] = [];
export const ventsLayer: LayerDef = {
  id: 'vents', category: 'earth', icon: '♨️', kind: 'overlay', stackOrder: 3,
  name: { en: 'Hydrothermal vents', es: 'Fuentes hidrotermales' },
  desc: { en: 'Hot springs on the sea floor: black smokers at 400 °C, Lost City’s white towers, cold seeps, and the life that lives on their chemistry instead of sunlight.', es: 'Manantiales calientes en el fondo del mar: fumarolas negras a 400 °C, las torres blancas de la Ciudad Perdida, emanaciones frías y la vida que se alimenta de su química en lugar de la luz del sol.' },
  keywords: 'hydrothermal vent black smoker lost city seep chemosynthesis fuente hidrotermal fumarola negra ciudad perdida quimiosintesis',
  credit: 'Curated from sources (scripts/data/ocean/curated/deep.json)',
  async load() { if (!vents.length) vents = (await loadJSON<{ vents: Vent[] }>('ocean/deep.json')).vents; },
  drawOverlay(rc) {
    const { ctx } = rc;
    for (const v of vents) {
      const p = rc.project(v.lon, v.lat);
      if (!p) continue;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 9);
      g.addColorStop(0, v.kind === 'seep' ? 'rgba(130,200,255,0.95)' : v.kind === 'alkaline' ? 'rgba(240,240,240,0.95)' : 'rgba(255,120,40,0.95)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fill();
    }
  },
  labels(rc) {
    if (rc.webZoom < 2.5) return;
    for (const v of vents) { const p = rc.project(v.lon, v.lat); if (p) rc.labels.add({ text: T(v.name), x: p[0], y: p[1], gap: 8, priority: 520, size: 10, weight: 650, color: rc.theme.label, halo: rc.theme.labelHalo }); }
  },
  tap(_lon, _lat, _inst, ui) {
    const v = pickNear(vents, (x) => [x.lon, x.lat], ui, 14);
    if (!v) return false;
    ui.card('♨️', T(v.name), L('Hydrothermal vent', 'Fuente hidrotermal'), [
      { label: L('Depth', 'Profundidad'), value: m(v.depth_m), icon: '⬇️' },
      ...(v.year ? [{ label: L('Discovered', 'Descubrimiento'), value: String(v.year), icon: '🔭' }] : []),
    ], [{ label: L('🤿 Dive here', '🤿 Bucear aquí'), onClick: () => void window.atlas?.deep.diveAt(v.lon, v.lat) }], [T(v.text)]);
    return true;
  },
  legend() {
    return { kind: 'categories', items: [
      { color: '#ff7828', label: L('Black and white smokers', 'Fumarolas negras y blancas'), shape: 'dot' }, { color: '#f0f0f0', label: L('Alkaline (Lost City)', 'Alcalinas (Ciudad Perdida)'), shape: 'dot' }, { color: '#82c8ff', label: L('Cold seeps', 'Emanaciones frías'), shape: 'dot' },
    ], note: L('{0} vent fields. Tap one for how deep it is and what lives there.', '{0} campos de fuentes. Toca uno para ver su profundidad y qué vive allí.', vents.length) };
  },
};

// ---- Shipwrecks ---------------------------------------------------------------------------------------------------
type Era = 'ancient' | 'sail' | 'steam' | 'ww1' | 'ww2' | 'modern';
interface Wreck { id: string; name: { en: string; es: string }; lon: number; lat: number; depth_m: number; year: number; found?: number; era: Era; kind: string; place: { en: string; es: string }; text: { en: string; es: string } }
interface More { id: string; n: [string, string]; at: [number, number]; dep?: number; y?: number }
let wrecks: Wreck[] = [], moreWrecks: More[] = [];
const ERAS: { id: Era; en: string; es: string; color: string }[] = [
  { id: 'ancient', en: 'Ancient (before 1500)', es: 'Antiguos (antes de 1500)', color: '#e599f7' },
  { id: 'sail', en: 'Age of sail (1500–1850)', es: 'Era de la vela (1500–1850)', color: '#ffd43b' },
  { id: 'steam', en: 'Steam (1850–1914)', es: 'Vapor (1850–1914)', color: '#ffa94d' },
  { id: 'ww1', en: 'First World War', es: 'Primera Guerra Mundial', color: '#ff6b6b' },
  { id: 'ww2', en: 'Second World War', es: 'Segunda Guerra Mundial', color: '#f03e3e' },
  { id: 'modern', en: 'Since 1946', es: 'Desde 1946', color: '#74c0fc' },
];
const eraOfYear = (y?: number): Era | null => (y == null ? null : y < 1500 ? 'ancient' : y < 1850 ? 'sail' : y < 1914 ? 'steam' : y < 1919 ? 'ww1' : y < 1939 ? 'steam' : y < 1946 ? 'ww2' : 'modern');
function wreckCard(ui: { card: LayerTapUi['card'] }, w: Wreck) {
  ui.card('⚓', T(w.name), T(w.place), [
    { label: L('Sank', 'Se hundió'), value: w.year < 0 ? L('{0} BCE', '{0} a. C.', fmtNumber(-w.year)) : String(w.year), icon: '📅' },
    { label: L('Depth', 'Profundidad'), value: w.depth_m > 0 ? m(w.depth_m) : L('On the shore', 'En la costa'), icon: '⬇️' },
    ...(w.found ? [{ label: L('Found', 'Hallado'), value: String(w.found), icon: '🔭' }] : []),
  ], w.depth_m > 30 ? [{ label: L('🤿 Dive to it', '🤿 Bucear hasta él'), onClick: () => void window.atlas?.deep.diveAt(w.lon, w.lat) }] : [], [T(w.text)]);
}
export const wrecksLayer: LayerDef = {
  id: 'wrecks', category: 'culture', icon: '⚓', kind: 'overlay', stackOrder: 4,
  name: { en: 'Shipwrecks', es: 'Naufragios' },
  desc: { en: 'About 1,000 shipwrecks: the Titanic, the Endurance, the Mary Rose, the Antikythera wreck, the San José, and the deepest ever found, 6,865 m down.', es: 'Cerca de 1 000 naufragios: el Titanic, el Endurance, el Mary Rose, el naufragio de Anticitera, el San José y el más profundo jamás hallado, a 6 865 m.' },
  keywords: 'shipwreck wreck titanic endurance galleon sunk ship naufragio pecio galeon barco hundido',
  credit: 'Famous wrecks curated from sources (scripts/data/ocean/curated/wrecks.json); others from Wikidata (CC0)',
  options: [{ id: 'era', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [{ value: 'all', label: { en: 'All wrecks', es: 'Todos' } }, { value: 'famous', label: { en: 'The famous ones', es: 'Los famosos' } }, ...ERAS.map((e) => ({ value: e.id, label: { en: e.en, es: e.es } }))] }],
  async load() { if (!wrecks.length) { const j = await loadJSON<{ wrecks: Wreck[]; more: More[] }>('ocean/wrecks.json'); wrecks = j.wrecks; moreWrecks = j.more; } },
  onOptionsChanged() { LC.requestRender(); LC.notify?.(); },
  drawOverlay(rc, inst) {
    const want = String(inst.options.era ?? 'all'), { ctx } = rc;
    if (want === 'all' && rc.webZoom >= 2.5) for (const w of moreWrecks) {
      const p = rc.project(w.at[0], w.at[1]);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(200,210,230,0.8)'; ctx.fill();
    }
    for (const w of wrecks) {
      if (want !== 'all' && want !== 'famous' && w.era !== want) continue;
      const p = rc.project(w.lon, w.lat);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
      ctx.fillStyle = ERAS.find((e) => e.id === w.era)?.color ?? '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
    }
  },
  labels(rc, inst) {
    const want = String(inst.options.era ?? 'all');
    for (const w of wrecks) {
      if (want !== 'all' && want !== 'famous' && w.era !== want) continue;
      const p = rc.project(w.lon, w.lat);
      if (p) rc.labels.add({ text: `⚓ ${T(w.name)}`, x: p[0], y: p[1], gap: 7, priority: 560 + Math.min(200, w.depth_m / 40), size: 10.5, weight: 650, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
    if (want === 'all' && rc.webZoom >= 5) for (const w of moreWrecks) {
      const p = rc.project(w.at[0], w.at[1]);
      if (p) rc.labels.add({ text: es() ? w.n[1] : w.n[0], x: p[0], y: p[1], gap: 5, priority: 200, size: 9.5, weight: 600, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  tap(_lon, _lat, inst, ui) {
    const want = String(inst.options.era ?? 'all');
    const w = pickNear(wrecks.filter((x) => want === 'all' || want === 'famous' || x.era === want), (x) => [x.lon, x.lat], ui, 14);
    if (w) { wreckCard(ui, w); return true; }
    if (want !== 'all') return false;
    const o = pickNear(moreWrecks, (x) => x.at, ui, 10);
    if (!o) return false;
    ui.card('⚓', es() ? o.n[1] : o.n[0], L('Shipwreck', 'Naufragio'), [
      ...(o.y ? [{ label: L('Sank', 'Se hundió'), value: String(o.y), icon: '📅' }] : []),
      ...(o.dep ? [{ label: L('Depth', 'Profundidad'), value: m(o.dep), icon: '⬇️' }] : []),
    ], [], [L('From Wikidata.', 'De Wikidata.')]);
    return true;
  },
  legend(inst) {
    const want = String(inst.options.era ?? 'all');
    const deepest = [...wrecks].sort((a, b) => b.depth_m - a.depth_m)[0];
    return {
      kind: 'categories', items: ERAS.map((e) => ({ color: e.color, label: `${es() ? e.es : e.en} · ${wrecks.filter((w) => w.era === e.id).length}`, shape: 'dot' as const })),
      note: want === 'all' ? L('{0} famous wrecks with their stories, and {1} more from Wikidata (the grey dots).', '{0} naufragios famosos con su historia y {1} más de Wikidata (los puntos grises).', wrecks.length, fmtNumber(moreWrecks.length)) : undefined,
      actions: deepest ? [{ label: L('The deepest: {0}', 'El más profundo: {0}', T(deepest.name)), icon: '⬇️', onClick: () => { APP?.flyTo(deepest.lon, deepest.lat, 6); wreckCard({ card: (...a) => SHELL?.card.showCustom(...a) }, deepest); } }] : [],
    };
  },
  searchHint: { en: 'shipwrecks', es: 'naufragios' },
  async searchLoad() { await wrecksLayer.load!({} as never, {} as never); },
  search(match) {
    const out: LayerHit[] = [];
    // "Deepest" (and "el más profundo"...) finds the deepest wrecks found (v0.33.2), the deepest first.
    const deep = deepestAsked(match, ['deepest shipwreck', 'deepest wreck', 'deepest ship', 'naufragio mas profundo', 'barco mas profundo', 'pecio mas profundo', 'el mas profundo', 'mas profundo']);
    if (deep) [...wrecks].sort((a, b) => b.depth_m - a.depth_m).slice(0, 3).forEach((w, i) => out.push({ label: T(w.name), sub: i === 0 ? L('⚓ The deepest wreck found: {0} m', '⚓ El naufragio más profundo hallado: {0} m', fmtNumber(w.depth_m)) : L('⚓ {0} m down', '⚓ A {0} m', fmtNumber(w.depth_m)), icon: '⚓', lon: w.lon, lat: w.lat, score: deep + 25 - i, wz: 6, open: (ui) => wreckCard(ui, w) }));
    for (const w of wrecks) { const sc = Math.max(match(w.name.en), match(w.name.es)); if (sc >= 50) out.push({ label: T(w.name), sub: `⚓ ${T(w.place)}`, icon: '⚓', lon: w.lon, lat: w.lat, score: sc + 10, wz: 6, open: (ui) => wreckCard(ui, w) }); }
    for (const w of moreWrecks) { const sc = Math.max(match(w.n[0]), match(w.n[1])); if (sc >= 60) out.push({ label: es() ? w.n[1] : w.n[0], sub: L('⚓ Shipwreck', '⚓ Naufragio'), icon: '⚓', lon: w.at[0], lat: w.at[1], score: sc, wz: 7 }); }
    return out.sort((a, b) => b.score - a.score).slice(0, 6);
  },
};

// ---- The living ocean: plankton and sea ice, month by month --------------------------------------------------------
const frames: Record<string, (RasterTexture | null)[]> = { plankton: [], ice: [] };
const oceanMonthOf = (inst: LayerInstance, now: number) => { const o = String(inst.options.month ?? 'play'); return o === 'play' ? (now / 2000) % 12 : Number(o) - 1; };
export const livingOcean: LayerDef = {
  id: 'living-ocean', category: 'climate', icon: '🦠', kind: 'raster', defaultOpacity: 0.95,
  animated: (inst) => String(inst.options.month ?? 'play') === 'play',
  name: { en: 'The living ocean', es: 'El océano vivo' },
  desc: { en: 'Plankton, the start of the sea’s food chain, blooming month by month from NASA’s satellites: the North Atlantic’s spring bloom, the upwelling off Peru and Namibia that feeds the whales. And the sea ice growing and melting through the year.', es: 'El plancton, el inicio de la cadena alimentaria del mar, floreciendo mes a mes según los satélites de la NASA: la floración de primavera del Atlántico Norte, el afloramiento frente a Perú y Namibia que alimenta a las ballenas. Y el hielo marino creciendo y derritiéndose a lo largo del año.' },
  keywords: 'plankton chlorophyll bloom upwelling sea ice months satellite nasa plancton clorofila floracion afloramiento hielo marino meses satelite',
  credit: 'NASA GIBS: MODIS Aqua chlorophyll a (each month made from every other day of 2024) and AMSR2 sea ice concentration (the 15th of each month of 2024), public domain',
  options: [
    { id: 'show', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'plankton', choices: [{ value: 'plankton', label: { en: 'Plankton (chlorophyll)', es: 'Plancton (clorofila)' } }, { value: 'ice', label: { en: 'Sea ice', es: 'Hielo marino' } }] },
    { id: 'month', label: { en: 'Month', es: 'Mes' }, type: 'select', default: 'play', choices: [{ value: 'play', label: { en: 'All year (playing)', es: 'Todo el año (en marcha)' }, icon: '▶️' }, ...MONTHS.en.map((en, i) => ({ value: String(i + 1), label: { en, es: MONTHS.es[i].charAt(0).toUpperCase() + MONTHS.es[i].slice(1) } }))] },
  ],
  async load(ctx, inst) {
    if (!ctx.gl) throw new Error('WebGL2 is needed for this filter');
    const gl = ctx.gl;
    const kind = String(inst.options.show ?? 'plankton');
    const want = (k: string, i: number) => (frames[k][i] ? Promise.resolve() : gl.load(dataUrl(`ocean/${k}/${String(i + 1).padStart(2, '0')}.webp`)).then((t) => { frames[k][i] = t; ctx.requestRender(); }));
    const m0 = Math.floor(oceanMonthOf(inst, performance.now()));
    await want(kind, m0);
    void (async () => { for (let k = 1; k < 12; k++) await want(kind, (m0 + k) % 12).catch(() => undefined); })();
    inst.state.want = want;
  },
  onOptionsChanged(inst) {
    const want = inst.state.want as ((k: string, i: number) => Promise<void>) | undefined;
    const kind = String(inst.options.show ?? 'plankton');
    if (want) void (async () => { for (let i = 0; i < 12; i++) await want(kind, i).catch(() => undefined); })();
    LC.requestRender(); LC.notify?.();
  },
  raster(rc, inst) {
    const kind = String(inst.options.show ?? 'plankton');
    const t = oceanMonthOf(inst, rc.now), i = Math.floor(t) % 12, j = (i + 1) % 12, f = t - Math.floor(t);
    const a = frames[kind][i], b = frames[kind][j];
    if (!a) return null;
    if (String(inst.options.month ?? 'play') === 'play' && inst.state.shownMonth !== i) { inst.state.shownMonth = i; LC.notify?.(); }
    return b && f > 0.5 ? [{ texture: a, opacity: inst.opacity }, { texture: b, opacity: inst.opacity * Math.min(1, (f - 0.5) * 2) }] : [{ texture: a, opacity: inst.opacity }];
  },
  legend(inst) {
    const kind = String(inst.options.show ?? 'plankton'), playing = String(inst.options.month ?? 'play') === 'play';
    const mo = Math.floor(oceanMonthOf(inst, performance.now()));
    const step = (by: number) => window.atlas?.app.setOption('living-ocean', 'month', String(((mo + by + 12) % 12) + 1));
    const ice = kind === 'ice';
    return {
      kind: 'gradient', title: `${ice ? L('Sea ice', 'Hielo marino') : L('Plankton', 'Plancton')} · ${monthName(mo)}`,
      stops: ice ? ['#1f3f8f', '#7fb3e6', '#ffffff'] : ['#3b0f70', '#2c7fb8', '#41b6c4', '#a1dab4', '#ffff8c', '#f03b20'],
      min: ice ? L('Open water', 'Agua abierta') : L('Clear, poor water', 'Agua clara y pobre'), max: ice ? L('Solid ice', 'Hielo compacto') : L('Rich in plankton', 'Rica en plancton'),
      note: ice ? L('The Arctic ice is smallest in September and largest in March; the Antarctic’s the other way round (2024).', 'El hielo del Ártico es mínimo en septiembre y máximo en marzo; el de la Antártida, al revés (2024).')
        : L('Greener and redder: more plankton, from the chlorophyll NASA’s MODIS sees (2024). Blank: cloud, sea ice or the polar night.', 'Más verde y rojo: más plancton, según la clorofila que ve MODIS de la NASA (2024). En blanco: nubes, hielo marino o la noche polar.'),
      actions: [
        { label: '◀', onClick: () => step(-1) }, { label: '▶', onClick: () => step(1) },
        ...(playing ? [] : [{ label: L('▶ Play the year', '▶ Reproducir el año'), onClick: () => window.atlas?.app.setOption('living-ocean', 'month', 'play'), primary: true }]),
      ],
    };
  },
};

// ---- Mangroves and kelp forests -----------------------------------------------------------------------------------
let mangroves: Shape<{ i: number; n: string; es?: string; b: number }>[] = [];
export const kelpLayer: LayerDef = {
  id: 'coastal-forests', category: 'flora', icon: '🌿', kind: 'overlay', stackOrder: 2,
  name: { en: 'Mangroves and kelp forests', es: 'Manglares y bosques de kelp' },
  desc: { en: 'The forests of the coast: mangroves in warm shallow seas, and the great kelp forests of cold rich water, from California to Tasmania.', es: 'Los bosques de la costa: los manglares en mares cálidos y poco profundos, y los grandes bosques de kelp de aguas frías y ricas, de California a Tasmania.' },
  keywords: 'mangrove kelp forest seaweed coast manglar kelp bosque alga costa sargazo',
  credit: 'Mangroves: RESOLVE Ecoregions 2017 (CC BY 4.0); kelp forests curated from sources (scripts/data/ocean/curated/places.json)',
  async load() {
    await loadPlaces().catch(() => null);
    if (!mangroves.length) {
      const topo = await loadJSON<Topology>('green/ecoregions.json');
      mangroves = shapesFrom<{ i: number; n: string; es?: string; b: number }>(topo, 'eco', (p) => String(p.i)).filter((s) => s.feature.properties.b === 14);
    }
  },
  drawOverlay(rc) {
    const { ctx } = rc;
    ctx.fillStyle = 'rgba(47,158,68,0.85)'; ctx.strokeStyle = 'rgba(20,90,40,0.9)'; ctx.lineWidth = 1;
    for (const s of mangroves) { ctx.beginPath(); rc.path(s.feature as never); ctx.fill(); ctx.stroke(); }
    for (const k of places?.kelp ?? []) {
      const p = rc.project(k.lon, k.lat);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(148,120,40,0.95)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#2b2b10'; ctx.stroke();
    }
  },
  labels(rc) {
    for (const k of places?.kelp ?? []) { const p = rc.project(k.lon, k.lat); if (p) rc.labels.add({ text: `🌿 ${T(k.name)}`, x: p[0], y: p[1], gap: 8, priority: 480, size: 10, weight: 650, color: rc.theme.label, halo: rc.theme.labelHalo }); }
  },
  tap(lon, lat, _inst, ui) {
    const k = pickNear(places?.kelp ?? [], (x) => [x.lon, x.lat], ui, 14);
    if (k) { ui.card('🌿', T(k.name), L('Kelp forest', 'Bosque de kelp'), [], [], [T(k.text)]); return true; }
    const s = mangroves.find((x) => lat >= x.bbox[1] && lat <= x.bbox[3] && lon >= x.bbox[0] && lon <= x.bbox[2] && geoContainsSafe(x, lon, lat));
    if (!s) return false;
    ui.card('🌳', es() ? s.feature.properties.es ?? s.feature.properties.n : s.feature.properties.n, L('Mangroves', 'Manglares'), [], [], [L('Mangroves grow where the sea meets the land in the warm tropics: their roots shelter young fish and hold the coast against storms.', 'Los manglares crecen donde el mar se encuentra con la tierra en los trópicos cálidos: sus raíces protegen a los peces jóvenes y sostienen la costa ante las tormentas.')]);
    return true;
  },
  legend() {
    return { kind: 'categories', items: [{ color: '#2f9e44', label: L('Mangroves · {0} ecoregions', 'Manglares · {0} ecorregiones', mangroves.length) }, { color: '#947828', label: L('Kelp forests · {0}', 'Bosques de kelp · {0}', places?.kelp.length ?? 0), shape: 'dot' }] };
  },
};
const geoContainsSafe = (s: Shape<unknown>, lon: number, lat: number) => { try { return geoContains(s.feature as never, [lon, lat]); } catch { return false; } };

// ---- The great garbage patches ------------------------------------------------------------------------------------
export const garbageLayer: LayerDef = {
  id: 'garbage-patches', category: 'climate', icon: '🧴', kind: 'overlay', stackOrder: 2,
  name: { en: 'Ocean garbage patches', es: 'Islas de basura del océano' },
  desc: { en: 'Where the ocean’s currents gather floating plastic, in the five great gyres. Not islands: mostly tiny pieces spread through the water, over areas known only roughly.', es: 'Donde las corrientes del océano juntan el plástico flotante, en los cinco grandes giros. No son islas: sobre todo pedacitos repartidos en el agua, en zonas que se conocen solo a grandes rasgos.' },
  keywords: 'garbage patch plastic gyre pollution great pacific isla de basura plastico giro contaminacion',
  credit: 'Approximate areas from published studies (scripts/data/ocean/curated/places.json)',
  async load() { await loadPlaces(); },
  drawOverlay(rc) {
    const { ctx } = rc;
    for (const p of places?.patches ?? []) {
      ctx.beginPath(); rc.path({ type: 'Polygon', coordinates: [[...p.ring, p.ring[0]]] } as never);
      ctx.fillStyle = 'rgba(255,212,59,0.22)'; ctx.fill(); ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,212,59,0.85)'; ctx.stroke(); ctx.setLineDash([]);
    }
  },
  labels(rc) {
    for (const p of places?.patches ?? []) {
      const c = p.ring.reduce((a, q) => [a[0] + q[0] / p.ring.length, a[1] + q[1] / p.ring.length], [0, 0]);
      const q = rc.project(c[0], c[1]);
      if (q) rc.labels.add({ text: T(p.name), x: q[0], y: q[1], priority: 600, size: 11, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  tap(lon, lat, _inst, ui) {
    const p = (places?.patches ?? []).find((x) => geoContains({ type: 'Polygon', coordinates: [[...x.ring, x.ring[0]]] } as never, [lon, lat]));
    if (!p) return false;
    ui.card('🧴', T(p.name), L('Garbage patch (approximate area)', 'Isla de basura (zona aproximada)'), [], [], [T(p.text)]);
    return true;
  },
  legend() { return { kind: 'categories', items: [{ color: '#ffd43b', label: L('Where floating plastic gathers (approximate)', 'Donde se junta el plástico flotante (aproximado)') }] }; },
};

export default function register(app: App, shell: Shell) {
  APP = app; SHELL = shell;
  app.register([seaFloor, drainOceans, seaFeatures, ventsLayer, wrecksLayer, livingOcean, kelpLayer, garbageLayer]);
}
// For tests.
export const oceanInfo = () => ({ wrecks: wrecks.length, more: moreWrecks.length, vents: vents.length, features: feats?.rows.length ?? 0, famous: feats?.famous.length ?? 0, geoDistance });
