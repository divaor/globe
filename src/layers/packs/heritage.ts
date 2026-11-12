// World Heritage and inventions on the map.
// - World Heritage sites: every site on UNESCO's World Heritage List (data/layers/heritage.json, made by
//   scripts/data/world-heritage/build.py from Wikipedia and Wikidata), as dots by category, with the sites in danger
//   ringed in red and the three removed from the list. "Watch the list grow" plays the years from the first 12 sites
//   of 1978 to today. A tap on a site opens its card: its picture, what Wikipedia says about it, when it was listed,
//   and UNESCO's page.
// - Inventions: every item of the Inventions collection (data/inventions/items.json) where it was invented, by
//   field and age; a tap opens its card, which can open the story it comes from.
import { lang, fmtNumber } from '../../app/i18n';
import { samplePalette, SEQUENTIAL } from '../../engine/colors';
import { loadJSON } from '../../data/store';
import { h } from '../../ui/dom';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { InfoRow, LayerDef, LayerInstance, LayerTapUi, Legend, RenderCtx } from '../types';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
let APP: App | null = null;

// ---- Shared: pictures and Wikipedia summaries ---------------------------------------------------------------------
const commons = (file: string, w = 330) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${w}`;
const summaries = new Map<string, Promise<{ extract: string; thumb: string | null } | null>>();
/** An article's summary in the reader's language (else English): its first lines and its picture. */
function summary(titles: { en: string; es: string }) {
  const l = es() && titles.es ? 'es' : 'en';
  const title = titles[l] || titles.en;
  if (!title) return Promise.resolve(null);
  const key = `${l}:${title}`;
  let p = summaries.get(key);
  if (!p) {
    p = fetch(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { extract?: string; thumbnail?: { source: string } } | null) => (j ? { extract: j.extract ?? '', thumb: j.thumbnail?.source ?? null } : null))
      .catch(() => null);
    summaries.set(key, p);
  }
  return p;
}
const wikiHref = (titles: { en: string; es: string }) => {
  const l = es() && titles.es ? 'es' : 'en';
  return `https://${l}.wikipedia.org/wiki/${encodeURIComponent((titles[l] || titles.en).replace(/ /g, '_'))}`;
};
/** The first sentences of a summary, at most about 420 characters. */
function shorten(s: string, max = 420): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'));
  return end > 120 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
}
/** A paragraph that fills itself with the summary when it arrives. */
function summaryEl(titles: { en: string; es: string }): HTMLElement | null {
  if (!titles.en && !titles.es) return null;
  const p = h('p', { class: 'card-note card-summary' });
  void summary(titles).then((s) => { if (s?.extract) p.textContent = shorten(s.extract); else p.remove(); });
  return p;
}
/** The nearest marker drawn within 18 px of a tap. */
function nearest<T>(list: T[], at: (x: T) => [number, number], ui: LayerTapUi): T | null {
  let best: T | null = null, bd = 18 * 18;
  for (const x of list) {
    const [lon, lat] = at(x);
    const p = ui.project(lon, lat);
    if (!p) continue;
    const d = (p[0] - ui.x) ** 2 + (p[1] - ui.y) ** 2;
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}
const countryName = (id: string) => { const m = LC.data.meta[id]; return m ? (es() ? m.es : m.n) : id; };

// ---- World Heritage sites -----------------------------------------------------------------------------------------
interface Site {
  ref: number; n: [string, string]; at: [number, number]; c: 'c' | 'n' | 'm'; y: number; cc: string[]; cr: number[];
  w: [string, string]; img: string; pop: number; d?: [number, number | null][]; x?: number; merged?: number; into?: number;
}
interface HeritageDoc { asOf: string; count: number; counts: Record<'c' | 'n' | 'm', number>; danger: number; sites: Site[] }
let doc: HeritageDoc | null = null;
let byPop: Site[] = [];
const FIRST = 1978;
const LAST = 2026;
const CAT_COLOR = { c: '#f2a93b', n: '#2fbf71', m: '#4fc3f7' } as const;
const DANGER = '#ff3b30';
const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const catName = (c: Site['c'], plural = false) => c === 'n' ? L(plural ? 'Natural' : 'Natural site', plural ? 'Naturales' : 'Sitio natural')
  : c === 'm' ? L(plural ? 'Mixed (cultural and natural)' : 'Cultural and natural site', plural ? 'Mixtos (culturales y naturales)' : 'Sitio cultural y natural')
  : L(plural ? 'Cultural' : 'Cultural site', plural ? 'Culturales' : 'Sitio cultural');
/** The year a site left the list (removed, or merged into another site), if it did. */
const gone = (s: Site) => s.x ?? s.merged ?? null;
/** In danger in a given year (today when no year). */
function inDanger(s: Site, year = LAST): boolean {
  return !!s.d?.some(([a, b]) => a <= year && (b == null || b > year));
}
const siteName = (s: Site) => (es() ? s.n[1] || s.n[0] : s.n[0]);

/** The year shown while "Watch the list grow" plays, else null. */
function playYear(inst: LayerInstance): number | null {
  const st = inst.state as { playing?: boolean; t0?: number };
  if (!st.playing || st.t0 == null) return null;
  return Math.min(LAST, FIRST + Math.floor((performance.now() - st.t0) / 280));
}
/** The sites shown now: by the "Show" choice, and up to the year playing. */
function visible(inst: LayerInstance): Site[] {
  if (!doc) return [];
  const show = String(inst.options.show ?? 'all');
  const year = playYear(inst);
  return byPop.filter((s) => {
    const left = gone(s);
    if (year != null) return s.y <= year && (left == null || left > year) && (show === 'all' || show === s.c || (show === 'danger' && inDanger(s, year)));
    if (show === 'removed') return left != null;
    if (left != null) return false;
    return show === 'all' || show === s.c || (show === 'danger' && inDanger(s));
  });
}
const yearColor = (y: number) => samplePalette(SEQUENTIAL.plasma.slice(1), (y - FIRST) / (LAST - FIRST));

function togglePlay(inst: LayerInstance) {
  const st = inst.state as { playing?: boolean; t0?: number; last?: number };
  st.playing = !st.playing;
  st.t0 = performance.now();
  st.last = -1;
  LC.requestRender();
  LC.notify?.();
}

export const heritage: LayerDef = {
  id: 'heritage', category: 'culture', icon: '🏛️', kind: 'overlay', stackOrder: 4,
  name: { en: 'World Heritage sites', es: 'Patrimonio de la Humanidad' },
  desc: { en: 'Every site on UNESCO’s World Heritage List, by category and year listed, with the sites in danger.', es: 'Todos los sitios de la Lista del Patrimonio Mundial de la UNESCO, por tipo y año de inscripción, con los sitios en peligro.' },
  keywords: 'unesco world heritage site sites monuments wonders danger patrimonio humanidad mundial sitios monumentos peligro unesco',
  credit: 'UNESCO World Heritage List (July 2026), via Wikipedia and Wikidata (CC0)',
  options: [
    { id: 'show', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'all', choices: [
      { value: 'all', label: { en: 'All sites', es: 'Todos los sitios' }, icon: '🏛️' },
      { value: 'c', label: { en: 'Cultural', es: 'Culturales' }, icon: '🏰' },
      { value: 'n', label: { en: 'Natural', es: 'Naturales' }, icon: '🌿' },
      { value: 'm', label: { en: 'Mixed', es: 'Mixtos' }, icon: '⛰️' },
      { value: 'danger', label: { en: 'In danger', es: 'En peligro' }, icon: '⚠️' },
      { value: 'removed', label: { en: 'Removed from the list', es: 'Retirados de la lista' }, icon: '✖️' },
    ] },
    { id: 'colour', label: { en: 'Colour by', es: 'Colorear por' }, type: 'select', default: 'cat', choices: [
      { value: 'cat', label: { en: 'Category', es: 'Tipo' } },
      { value: 'year', label: { en: 'Year listed', es: 'Año de inscripción' } },
    ] },
  ],
  animated: (inst) => !!(inst.state as { playing?: boolean }).playing,
  async load() {
    if (doc) return;
    doc = await loadJSON<HeritageDoc>('layers/heritage.json');
    byPop = doc.sites.slice().sort((a, b) => a.pop - b.pop);
  },
  onOptionsChanged() { LC.requestRender(); },
  onDeactivate(inst) { (inst.state as { playing?: boolean }).playing = false; },
  drawOverlay(rc: RenderCtx, inst) {
    if (!doc) return;
    const { ctx } = rc;
    const st = inst.state as { playing?: boolean; t0?: number; last?: number };
    const year = playYear(inst);
    if (year != null && year !== st.last) {
      st.last = year;
      LC.notify?.();
      // Hold the last year a moment, then stop.
      if (year >= LAST) setTimeout(() => { if (st.playing && playYear(inst) === LAST) { st.playing = false; LC.notify?.(); LC.requestRender(); } }, 1600);
    }
    const byYear = inst.options.colour === 'year';
    const r = Math.max(2.4, Math.min(7, 1.6 + rc.webZoom * 1.1));
    const edge = rc.theme.dark ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.95)';
    const sites = visible(inst);
    const danger: [number, number][] = [];
    for (const s of sites) {
      const p = rc.project(s.at[0], s.at[1]);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      if (gone(s) != null && year == null) {
        ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 2; ctx.stroke();
        continue;
      }
      ctx.fillStyle = byYear ? yearColor(s.y) : CAT_COLOR[s.c];
      ctx.fill();
      ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke();
      if (inDanger(s, year ?? LAST)) danger.push(p);
    }
    ctx.strokeStyle = DANGER; ctx.lineWidth = 1.8;
    for (const p of danger) { ctx.beginPath(); ctx.arc(p[0], p[1], r + 2.6, 0, Math.PI * 2); ctx.stroke(); }
  },
  labels(rc, inst) {
    if (!doc || rc.webZoom < 4) return;
    const color = rc.theme.dark ? '#ffe3b3' : '#7a4a00';
    for (const s of visible(inst)) {
      const p = rc.project(s.at[0], s.at[1]);
      if (!p) continue;
      rc.labels.add({ text: siteName(s), x: p[0] + 7, y: p[1], align: 'left', priority: 520 + Math.min(300, s.pop), size: 10.5, weight: 650, color, halo: rc.theme.labelHalo });
    }
  },
  legend(inst): Legend | null {
    if (!doc) return null;
    const year = playYear(inst);
    const sites = visible(inst);
    const count = (f: (s: Site) => boolean) => sites.filter(f).length;
    const playing = !!(inst.state as { playing?: boolean }).playing;
    const actions = [{ label: playing ? L('⏸ Stop', '⏸ Detener') : L('▶ Watch the list grow', '▶ Ver crecer la lista'), onClick: () => togglePlay(inst), primary: !playing }];
    const title = year != null
      ? L(`${year}: ${fmtNumber(sites.length)} sites`, `${year}: ${fmtNumber(sites.length)} sitios`)
      : String(inst.options.show) === 'removed' ? L('Removed from the list', 'Retirados de la lista')
      : L(`${fmtNumber(sites.length)} World Heritage sites`, `${fmtNumber(sites.length)} sitios del Patrimonio Mundial`);
    const note = year != null ? L('Each year, the sites on the list.', 'Cada año, los sitios de la lista.')
      : L('UNESCO’s list after its July 2026 session. Ringed in red: in danger. Tap a site for its card.', 'La lista de la UNESCO tras su sesión de julio de 2026. Con anillo rojo: en peligro. Toca un sitio para ver su ficha.');
    if (inst.options.colour === 'year') {
      return { kind: 'gradient', title, stops: SEQUENTIAL.plasma.slice(1), min: String(FIRST), max: String(LAST), note, actions };
    }
    if (String(inst.options.show) === 'removed' && year == null) {
      return { kind: 'categories', title, items: sites.map((s) => ({ color: '#9aa0a6', label: `${siteName(s)} (${s.y}–${gone(s)})`, shape: 'dot' as const })), note: L('Sites taken off the list, and the years they were on it.', 'Sitios retirados de la lista y los años en que estuvieron en ella.'), actions };
    }
    return {
      kind: 'categories', title, note, actions,
      items: [
        { color: CAT_COLOR.c, label: `${catName('c', true)}: ${fmtNumber(count((s) => s.c === 'c'))}`, shape: 'dot' },
        { color: CAT_COLOR.n, label: `${catName('n', true)}: ${fmtNumber(count((s) => s.c === 'n'))}`, shape: 'dot' },
        { color: CAT_COLOR.m, label: `${catName('m', true)}: ${fmtNumber(count((s) => s.c === 'm'))}`, shape: 'dot' },
        { color: DANGER, label: `${L('In danger', 'En peligro')}: ${fmtNumber(count((s) => inDanger(s, year ?? LAST)))}`, shape: 'dash' },
      ],
    };
  },
  info(countryId) {
    if (!doc) return null;
    const mine = doc.sites.filter((s) => gone(s) == null && s.cc.includes(countryId));
    if (!mine.length) return [{ label: L('World Heritage sites', 'Sitios del Patrimonio Mundial'), value: '0', icon: '🏛️' }];
    const by = (c: Site['c']) => mine.filter((s) => s.c === c).length;
    const parts = (['c', 'n', 'm'] as const).filter((c) => by(c)).map((c) => `${by(c)} ${catName(c, true).toLowerCase().replace(/ \(.*\)/, '')}`);
    const rows: InfoRow[] = [{ label: L('World Heritage sites', 'Sitios del Patrimonio Mundial'), value: `${mine.length} (${parts.join(', ')})`, icon: '🏛️' }];
    const dz = mine.filter((s) => inDanger(s));
    if (dz.length) rows.push({ label: L('In danger', 'En peligro'), value: dz.map(siteName).join(', '), icon: '⚠️' });
    return rows;
  },
  tap(_lon, _lat, inst, ui) {
    const s = nearest(visible(inst), (x) => x.at, ui);
    if (!s) return false;
    const rows: InfoRow[] = [];
    const left = gone(s);
    rows.push({ label: L('Listed', 'Inscrito'), value: left != null ? (s.x ? L(`${s.y}; removed from the list in ${s.x}`, `${s.y}; retirado de la lista en ${s.x}`) : L(`${s.y}; part of another site since ${left}`, `${s.y}; parte de otro sitio desde ${left}`)) : String(s.y), icon: '📅' });
    rows.push({ label: L('Category', 'Tipo'), value: catName(s.c), icon: s.c === 'n' ? '🌿' : s.c === 'm' ? '⛰️' : '🏰' });
    if (s.cc.length) rows.push({ label: s.cc.length > 1 ? L('Countries', 'Países') : L('Country', 'País'), value: s.cc.map(countryName).join(', '), icon: '📍' });
    if (s.cr.length) rows.push({ label: L('Criteria', 'Criterios'), value: s.cr.map((c) => `(${ROMAN[c]})`).join(' '), icon: '📜' });
    if (s.d?.length) {
      const now = inDanger(s);
      const spans = s.d.map(([a, b]) => (b == null ? L(`since ${a}`, `desde ${a}`) : `${a}–${b}`)).join(', ');
      rows.push({ label: now ? L('In danger', 'En peligro') : L('Was in danger', 'Estuvo en peligro'), value: spans, icon: '⚠️' });
    }
    const titles = { en: s.w[0], es: s.w[1] };
    const links: { label: string; href?: string }[] = [];
    if (s.w[0] || s.w[1]) links.push({ label: 'Wikipedia', href: wikiHref(titles) });
    links.push({ label: 'UNESCO', href: `https://whc.unesco.org/${es() ? 'es' : 'en'}/list/${s.ref}` });
    const image = s.img ? Promise.resolve(commons(s.img)) : summary(titles).then((x) => x?.thumb ?? null);
    const name = siteName(s);
    const sub = [L('World Heritage', 'Patrimonio de la Humanidad'), s.cc.length === 1 ? countryName(s.cc[0]) : ''].filter(Boolean).join(' · ');
    ui.card(s.c === 'n' ? '🌿' : s.c === 'm' ? '⛰️' : '🏛️', name, sub, rows, links, [], image, summaryEl(titles));
    return true;
  },
};

// ---- Inventions map -----------------------------------------------------------------------------------------------
interface Invention {
  id?: string; name: { en: string; es: string }; at: [number, number]; cat: string; icon: string; date: string; t: number;
  type?: string; place?: { en: string; es: string }; text: { en: string; es: string }; details?: { en: string; es: string };
  by?: { en: string; es: string }; wiki?: { en: string; es: string }; img?: string; story: string; step: number;
  whs?: { ref: number; y: number };
}
interface Cat { id: string; name: { en: string; es: string }; icon: string; color: string }
let inventions: Invention[] = [];
let invCats = new Map<string, Cat>();
const AGES: { value: string; label: { en: string; es: string }; from: number; to: number }[] = [
  { value: 'all', label: { en: 'All ages', es: 'Todas las épocas' }, from: -Infinity, to: Infinity },
  { value: 'ancient', label: { en: 'Before 500', es: 'Antes de 500' }, from: -Infinity, to: 500 },
  { value: 'medieval', label: { en: '500–1500', es: '500–1500' }, from: 500, to: 1500 },
  { value: 'early', label: { en: '1500–1800', es: '1500–1800' }, from: 1500, to: 1800 },
  { value: '1800s', label: { en: '1800–1900', es: '1800–1900' }, from: 1800, to: 1900 },
  { value: '1900s', label: { en: '1900–2000', es: '1900–2000' }, from: 1900, to: 2000 },
  { value: 'now', label: { en: 'Since 2000', es: 'Desde 2000' }, from: 2000, to: Infinity },
];
const tx2 = (x?: { en: string; es: string }) => (x ? (es() ? x.es || x.en : x.en) : '');
/** Years of a date string, for "12,000 years ago" or "1876". */
function when(it: Invention): string {
  if (it.t < -10000) return L(`${fmtNumber(-it.t)} years ago`, `hace ${fmtNumber(-it.t)} años`);
  if (it.t < 0) return L(`${-it.t} BC`, `${-it.t} a. C.`);
  return String(Math.floor(it.t));
}
function shownInventions(inst: LayerInstance): Invention[] {
  const age = AGES.find((a) => a.value === inst.options.age) ?? AGES[0];
  const cat = String(inst.options.field ?? 'all');
  return inventions.filter((it) => (it.type === 'invention' || it.type == null) && it.cat !== 'inventor' && it.cat !== 'lab' && it.cat !== 'event'
    && it.t >= age.from && it.t < age.to && (cat === 'all' || it.cat === cat));
}

export const inventionsMap: LayerDef = {
  id: 'inventions', category: 'culture', icon: '💡', kind: 'overlay', stackOrder: 4,
  name: { en: 'Where things were invented', es: 'Dónde se inventaron las cosas' },
  desc: { en: 'Inventions where they were made, from stone tools to the smartphone, by field and age.', es: 'Los inventos donde se hicieron, de las herramientas de piedra al teléfono inteligente, por campo y época.' },
  keywords: 'inventions inventors invention technology history inventos inventores tecnologia historia',
  credit: 'The Inventions stories of Time travel (Wikipedia)',
  options: [
    { id: 'age', label: { en: 'Age', es: 'Época' }, type: 'select', default: 'all', choices: AGES.map((a) => ({ value: a.value, label: a.label })) },
    { id: 'field', label: { en: 'Field', es: 'Campo' }, type: 'select', default: 'all', choices: [
      { value: 'all', label: { en: 'All fields', es: 'Todos los campos' }, icon: '💡' },
      ...[['tools', '🪓', 'Tools and materials', 'Herramientas y materiales'], ['farming', '🌾', 'Farming and food', 'Agricultura y alimentos'],
        ['transport', '🚲', 'Getting around', 'Transporte'], ['flight', '✈️', 'Flight', 'Vuelo'], ['print', '📜', 'Paper and printing', 'Papel e imprenta'],
        ['communication', '📡', 'Messages and media', 'Mensajes y medios'], ['time', '⏱️', 'Time and measurement', 'Tiempo y medición'],
        ['optics', '🔭', 'Lenses and images', 'Lentes e imágenes'], ['energy', '⚡', 'Power and energy', 'Energía'], ['computing', '💻', 'Computing', 'Computación'],
        ['home', '🏠', 'Everyday things', 'Cosas de todos los días'], ['medicine', '💊', 'Medicine', 'Medicina'], ['weapons', '💥', 'Gunpowder and weapons', 'Pólvora y armas']]
        .map(([value, icon, en, sp]) => ({ value, icon, label: { en, es: sp } })),
    ] },
  ],
  async load() {
    if (inventions.length) return;
    const [items, index] = await Promise.all([
      loadJSON<{ items: Invention[] }>('inventions/items.json'),
      loadJSON<{ categories?: Cat[] }>('inventions/index.json').catch(() => ({ categories: [] as Cat[] })),
    ]);
    inventions = items.items;
    invCats = new Map((index.categories ?? []).map((c) => [c.id, c]));
  },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc, inst) {
    const { ctx } = rc;
    const size = Math.max(15, Math.min(30, 11 + rc.webZoom * 3));
    ctx.font = `${size * 0.72}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const it of shownInventions(inst)) {
      const p = rc.project(it.at[0], it.at[1]);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], size * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = rc.theme.dark ? 'rgba(10,20,40,0.72)' : 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.strokeStyle = invCats.get(it.cat)?.color ?? '#f39c12'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillText(it.icon, p[0], p[1] + 1);
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 3) return;
    const size = Math.max(15, Math.min(30, 11 + rc.webZoom * 3));
    for (const it of shownInventions(inst)) {
      const p = rc.project(it.at[0], it.at[1]);
      if (p) rc.labels.add({ text: tx2(it.name), sub: when(it), x: p[0], y: p[1] + size * 0.8, priority: 600, size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const n = shownInventions(inst).length;
    const used = [...new Set(shownInventions(inst).map((it) => it.cat))].map((c) => invCats.get(c)).filter((c): c is Cat => !!c);
    return {
      kind: 'categories', title: L(`${n} inventions`, `${n} inventos`),
      items: used.map((c) => ({ color: c.color, label: tx2(c.name), icon: c.icon, shape: 'emoji' as const })),
      note: L('Where each was made or first shown. Tap one for its card and its story.', 'Dónde se hizo o se mostró cada uno. Toca uno para ver su ficha y su historia.'),
    };
  },
  tap(_lon, _lat, inst, ui) {
    const it = nearest(shownInventions(inst), (x) => x.at, ui);
    if (!it) return false;
    const rows: InfoRow[] = [{ label: L('When', 'Cuándo'), value: when(it), icon: '📅' }];
    if (it.place) rows.push({ label: L('Where', 'Dónde'), value: tx2(it.place), icon: '📍' });
    if (it.by) rows.push({ label: L('Invented by', 'Inventado por'), value: tx2(it.by), icon: '🧑‍🔬' });
    if (it.whs) rows.push({ label: L('World Heritage', 'Patrimonio de la Humanidad'), value: L(`Since ${it.whs.y}`, `Desde ${it.whs.y}`), icon: '🏛️' });
    const notes = [tx2(it.text), it.details ? tx2(it.details) : ''].filter(Boolean);
    const links: { label: string; href?: string; onClick?: () => void }[] = [];
    if (it.wiki) links.push({ label: 'Wikipedia', href: wikiHref(it.wiki) });
    links.push({ label: L('Open its story', 'Abrir su historia'), onClick: () => APP?.emit('open-story', 'inventions', it.story, it.step) });
    const image = it.img ? Promise.resolve(commons(it.img)) : it.wiki ? summary(it.wiki).then((x) => x?.thumb ?? null) : undefined;
    const cat = invCats.get(it.cat);
    ui.card(it.icon, tx2(it.name), [cat ? `${cat.icon} ${tx2(cat.name)}` : '', L('Inventions', 'Inventos')].filter(Boolean).join(' · '), rows, links, notes, image);
    return true;
  },
};

export default function register(app: App) {
  APP = app;
  app.register([heritage, inventionsMap]);
}
