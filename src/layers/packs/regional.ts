// Regional languages: first-level regions (provinces, states) coloured by the language spoken there,
// so languages without national status show on the map: Catalan, Basque, Cantonese, Maya, Quechua...
// Countries with no regional entries are coloured by their main language. Data:
// public/data/attributes/regional-languages.json (see SOURCES.md), regions from base/admin1.json.
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { mesh } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { MultiLineString } from 'geojson';
import { loadJSON, shapesFrom, chunkLines, type Shape, type Line } from '../../data/store';
import { oklch } from '../../engine/colors';
import { lang } from '../../app/i18n';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { InfoRow, LayerDef, LegendItem, RenderCtx } from '../types';

interface LangInfo { en: string; es: string; family?: string; speakers?: number }
interface RLData {
  source?: string; license?: string; languages: Record<string, LangInfo>; regions: Record<string, string[]>;
  notes?: Record<string, string>; countryNotes?: Record<string, string>;
}
interface AP { n: string; es?: string; a: string; lx: number; ly: number }
// first: the language most people speak at home; also: a regional language also widely spoken (stripes).
type Region = Shape<AP> & { langs: string[]; first: string; also: string | null; area: number };

let D: RLData = { languages: {}, regions: {} };
let regions: Region[] = [];
const byCountry = new Set<string>(); // countries drawn region by region
const mainOf: Record<string, string> = {}; // country id -> main language code
let names: Record<string, { en: string; es: string }> = {};
let edges: Line[] = []; // borders between regions shown in different languages
let anchors: { code: string; lon: number; lat: number; area: number }[] = [];
const areaOf = new Map<string, number>(); // language -> area shown (legend order)

const es = () => lang() === 'es';
const nameOf = (code: string) => {
  const n = D.languages[code] ?? names[code];
  return n ? (es() ? n.es : n.en) : code;
};
const colours = new Map<string, string>();
// Hand-picked hues for the most widespread languages and their usual neighbours, so that languages
// sharing a border get clearly different colours (Spanish / Portuguese / Catalan / Basque / Galician,
// English / French in Canada, Mandarin / Cantonese / Min / Wu...). Others get a hue from their code.
const HUES: Record<string, number> = {
  eng: 350, spa: 45, por: 140, fra: 255, rus: 15, ara: 88, zho: 290, deu: 200, ita: 170, hin: 25,
  cat: 325, eus: 185, glg: 105, yue: 345, nan: 190, wuu: 125, hak: 65, bod: 225, uig: 160, mon: 215,
  yua: 280, quc: 300, que: 230, aym: 120, grn: 175, nah: 320, kaz: 60, tur: 0, fas: 110, urd: 300,
  ben: 160, tam: 330, tel: 195, ind: 270, jav: 20, sun: 150, swa: 75, amh: 300, hau: 230, yor: 330,
};
/** A stable colour per language (the same language has the same colour in every country). */
function colourOf(code: string) {
  let c = colours.get(code);
  if (!c) {
    let h = 2166136261;
    for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    c = HUES[code] !== undefined
      ? oklch(0.7, 0.14, HUES[code])
      : oklch(0.64 + ((h >>> 9) % 4) * 0.04, 0.11 + ((h >>> 13) % 3) * 0.02, h % 360);
    colours.set(code, c);
  }
  return c;
}
/** A regional language also widely spoken in a region (not its first, not the national language). */
const alsoLang = (langs: string[], main: string | undefined) => langs.slice(1).find((l) => l !== main && l !== langs[0]) ?? null;

/** Diagonal stripes in a language's colour, drawn at device resolution. */
const patterns = new Map<string, CanvasPattern | null>();
function stripes(ctx: CanvasRenderingContext2D, colour: string, scale: number): CanvasPattern | null {
  const key = `${colour}@${scale}`;
  if (patterns.has(key)) return patterns.get(key)!;
  const n = Math.max(4, Math.round(8 * scale));
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  g.strokeStyle = colour;
  g.lineWidth = Math.max(1.5, 2.6 * scale);
  g.beginPath();
  for (const o of [-n, 0, n]) { g.moveTo(o, n); g.lineTo(o + n, 0); }
  g.stroke();
  const p = ctx.createPattern(c, 'repeat');
  p?.setTransform(new DOMMatrix().scale(1 / scale));
  patterns.set(key, p);
  return p;
}

async function load() {
  if (regions.length) return;
  const [rl, facts, topo] = await Promise.all([
    loadJSON<RLData>('attributes/regional-languages.json'),
    loadJSON<{ fields: Record<string, { categories?: Record<string, { en: string; es: string }> }>; data: Record<string, Record<string, unknown>> }>('attributes/countries.json'),
    loadJSON<Topology>('base/admin1.json'),
  ]);
  D = rl;
  names = facts.fields.languages?.categories ?? {};
  for (const [id, d] of Object.entries(facts.data)) {
    const l = (d.languages as string[] | undefined)?.[0];
    if (l) mainOf[id] = l;
  }
  for (const [id, m] of Object.entries(LC.data.meta)) if (!mainOf[id] && m.iso && mainOf[m.iso]) mainOf[id] = mainOf[m.iso];
  for (const key of Object.keys(D.regions)) byCountry.add(key.split('|')[0]);
  const langsOf = (p: AP): string[] => D.regions[`${p.a}|${p.n}`] ?? (mainOf[p.a] ? [mainOf[p.a]] : []);
  regions = shapesFrom<AP>(topo, 'admin1').filter((s) => byCountry.has(s.feature.properties.a)).map((s) => {
    const langs = langsOf(s.feature.properties);
    const main = mainOf[s.feature.properties.a];
    return { ...s, langs, first: langs[0] ?? main ?? '', also: alsoLang(langs, main), area: geoArea(s.feature as never) };
  });
  // Dashed lines where the language most people speak changes between neighbouring regions.
  const obj = topo.objects.admin1 as GeometryCollection;
  const firstOf = (g: unknown) => {
    const p = (g as { properties?: AP }).properties;
    return p && byCountry.has(p.a) ? langsOf(p)[0] ?? null : null;
  };
  edges = chunkLines(mesh(topo, obj, (a, b) => a !== b && firstOf(a) !== null && firstOf(b) !== null && firstOf(a) !== firstOf(b)) as MultiLineString);
  // One name per regional language and country: at its largest region where it is spoken most,
  // else where it is also widely spoken.
  const best = new Map<string, Region>();
  const total = new Map<string, number>();
  for (const r of regions) {
    areaOf.set(r.first, (areaOf.get(r.first) ?? 0) + r.area);
    const main = mainOf[r.feature.properties.a];
    for (const [code, rank] of [[r.first, 0], [r.also, 1]] as const) {
      if (!code || code === main) continue;
      const k = `${r.feature.properties.a}|${code}`;
      total.set(k, (total.get(k) ?? 0) + r.area);
      const cur = best.get(k);
      const curRank = cur ? (cur.first === code ? 0 : 1) : 2;
      if (rank < curRank || (rank === curRank && cur!.area < r.area)) best.set(k, r);
    }
  }
  anchors = [...best].map(([k, r]) => ({ code: k.split('|')[1], lon: r.feature.properties.lx, lat: r.feature.properties.ly, area: total.get(k)! }));
  for (const s of LC.data.best('110m').countries) {
    if (byCountry.has(s.id) || !mainOf[s.id]) continue;
    areaOf.set(mainOf[s.id], (areaOf.get(mainOf[s.id]) ?? 0) + geoArea(s.feature as never));
  }
}

function regionAt(lon: number, lat: number): Region | null {
  for (const r of regions) {
    const [[w, s], [e, n]] = geoBounds(r.feature as never);
    if (lat < s || lat > n || (w <= e ? lon < w || lon > e : lon < w && lon > e)) continue;
    if (geoContains(r.feature as never, [lon, lat])) return r;
  }
  return null;
}

const regional: LayerDef = {
  id: 'regional-languages', category: 'culture', icon: '💬', kind: 'fill', bakeable: true,
  name: { en: 'Regional languages', es: 'Lenguas regionales' },
  desc: {
    en: 'Languages by region, not by country: Catalan, Basque, Cantonese, Maya, Quechua, Kurdish, Tamil, Javanese and many more, where they are spoken.',
    es: 'Lenguas por región, no por país: catalán, euskera, cantonés, maya, quechua, kurdo, tamil, javanés y muchas más, donde se hablan.',
  },
  keywords: 'regional languages minority dialect catalan basque galician cantonese maya quechua lenguas regionales minoritarias catalan euskera gallego cantones',
  credit: 'Regional languages compiled from Wikipedia and national census figures (CC BY-SA 4.0); regions: Natural Earth',
  load: async () => { await load(); },
  drawFill(rc: RenderCtx) {
    const { ctx, path } = rc;
    const groups = new Map<string, Shape<unknown>[]>();
    const add = (key: string, s: Shape<unknown>) => {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(s);
    };
    for (const s of rc.visibleShapes(rc.level.countries)) {
      if (byCountry.has(s.id)) continue; // drawn region by region below
      const m = mainOf[s.id];
      if (m) add(m, s);
    }
    const visible = rc.visibleShapes(regions);
    for (const r of visible) if (r.first) add(r.first, r);
    for (const [code, list] of groups) {
      ctx.beginPath();
      for (const s of list) path(s.feature as never);
      ctx.fillStyle = colourOf(code);
      ctx.fill();
    }
    // Stripes: another language widely spoken there (Catalan in Barcelona, Maya in Yucatán...).
    const also = new Map<string, Shape<unknown>[]>();
    for (const r of visible) if (r.also) { let g = also.get(r.also); if (!g) also.set(r.also, (g = [])); g.push(r); }
    const scale = ctx.getTransform().a || 1;
    for (const [code, list] of also) {
      const pat = stripes(ctx, colourOf(code), scale);
      if (!pat) continue;
      ctx.beginPath();
      for (const s of list) path(s.feature as never);
      ctx.fillStyle = pat;
      ctx.fill();
    }
    ctx.beginPath();
    for (const l of rc.visibleLines(edges)) path(l.geometry);
    ctx.setLineDash([3, 2]);
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = rc.theme.dark ? 'rgba(255,255,255,0.6)' : 'rgba(20,20,30,0.5)';
    ctx.stroke();
    ctx.setLineDash([]);
  },
  labels(rc: RenderCtx) {
    const k = rc.view.pxPerRadian;
    for (const a of anchors) {
      const px = Math.sqrt(a.area) * k; // rough on-screen size of the language's area
      if (px < 16) continue;
      const p = rc.project(a.lon, a.lat);
      if (!p) continue;
      rc.labels.add({
        text: nameOf(a.code), x: p[0], y: p[1], priority: 950 + Math.min(200, px / 3),
        size: Math.max(10, Math.min(15, 9 + px / 45)), weight: 700, italic: true, color: rc.theme.label, halo: rc.theme.labelHalo,
      });
    }
  },
  legend() {
    const regionalCodes = new Set(anchors.map((a) => a.code));
    const codes = [...areaOf.keys()].sort((a, b) => Number(regionalCodes.has(b)) - Number(regionalCodes.has(a)) || areaOf.get(b)! - areaOf.get(a)!);
    const items: LegendItem[] = codes.slice(0, 15).map((c) => ({ color: colourOf(c), label: nameOf(c) }));
    items.push({ color: '#9aa4b2', label: es() ? 'Rayas: otra lengua muy hablada allí' : 'Stripes: another language widely spoken there', shape: 'hatch' });
    return {
      kind: 'categories', title: es() ? 'Lengua de cada región' : 'Language of each region', items,
      note: es()
        ? 'Color: la lengua que más se habla en casa en cada región; rayas: otra lengua regional muy hablada. Toca una región para ver sus lenguas.'
        : 'Colour: the language most people speak at home in each region; stripes: another regional language widely spoken there. Tap a region to see its languages.',
    };
  },
  pick(lon, lat) {
    const r = regionAt(lon, lat);
    if (!r) return null;
    const p = r.feature.properties;
    const note = D.notes?.[`${p.a}|${p.n}`];
    return [
      { icon: '📍', label: es() ? 'Región' : 'Region', value: es() && p.es ? p.es : p.n },
      { icon: '💬', label: es() ? 'Lenguas (la más hablada primero)' : 'Languages (most spoken first)', value: r.langs.map(nameOf).join(', ') },
      ...(note ? [{ icon: '📝', label: es() ? 'Nota' : 'Note', value: note }] : []),
    ];
  },
  info(id) {
    if (!byCountry.has(id)) return mainOf[id] ? [{ label: es() ? 'Lengua principal' : 'Main language', value: nameOf(mainOf[id]) }] : null;
    const counts = new Map<string, number>();
    for (const r of regions) {
      if (r.feature.properties.a !== id) continue;
      for (const c of [r.first, r.also]) if (c && c !== mainOf[id]) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const list = [...counts].sort((a, b) => b[1] - a[1]).map(([c]) => nameOf(c));
    const rows: InfoRow[] = [{ label: es() ? 'Lenguas regionales' : 'Regional languages', value: list.length ? list.join(', ') : es() ? 'Ninguna' : 'None' }];
    const note = D.countryNotes?.[id];
    if (note) rows.push({ label: es() ? 'Nota' : 'Note', value: note });
    return rows;
  },
};

export default function register(app: App) {
  app.register([regional]);
}
