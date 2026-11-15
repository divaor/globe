// Art and architecture on the map (v0.27.0), from public/data/artguide (Wikidata):
// - Art museums: the museums of the art guide, sized by visitors a year.
// - Masterpieces: the best-known works where they hang, one dot a museum with how many there are, by kind and period.
// - Architectural styles: notable buildings with their architects, coloured by style.
// A tap opens the museum's, the work's or the building's card, which links to the city's guide.
import { lang, fmtCompact } from '../../app/i18n';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { LayerDef, LayerInstance, LayerTapUi, RenderCtx } from '../types';
import { loadArt, loadArch, nm, KINDS, PERIODS, type ArtData, type ArchData, type Work, type Museum } from '../../artguide/data';
import { museumCard, buildingCard } from '../../artguide/cards';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
let APP: App | null = null;
let art: ArtData | null = null;
let arch: ArchData | null = null;
const cityName = (id: string | null) => (id ? (window.atlas?.guide.cityLabel(id) ?? null) : null);
const openCity = (tab: string) => (city: string) => APP?.emit('open-guide', city, tab);

function nearest<T>(list: T[], at: (x: T) => [number, number], ui: LayerTapUi, px = 18): T | null {
  let best: T | null = null, bd = px * px;
  for (const x of list) {
    const p = ui.project(...at(x));
    if (!p) continue;
    const d = (p[0] - ui.x) ** 2 + (p[1] - ui.y) ** 2;
    if (d < bd) { bd = d; best = x; }
  }
  return best;
}

// ---- Art museums ------------------------------------------------------------------------------------------------
const museumR = (m: Museum, z: number) => Math.max(4, Math.min(18, (m.visitors ? 3 + Math.sqrt(m.visitors / 1e6) * 5 : 4) * Math.min(1.6, 0.8 + z * 0.08)));
export const artMuseums: LayerDef = {
  id: 'art-museums', category: 'culture', icon: '🏛️', kind: 'overlay', stackOrder: 4,
  name: { en: 'Art museums', es: 'Museos de arte' },
  desc: { en: 'The museums of the art guide, sized by visitors a year; a tap shows their best-known works.', es: 'Los museos de la guía de arte, por visitantes al año; un toque muestra sus obras más conocidas.' },
  keywords: 'museum museums art gallery louvre prado visitors museos arte galería',
  credit: 'Wikidata (CC0)',
  async load() { art ??= await loadArt(); },
  drawOverlay(rc) {
    if (!art) return;
    const { ctx } = rc;
    for (const m of art.museums) {
      const p = rc.project(m.at[0], m.at[1]);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], museumR(m, rc.webZoom), 0, Math.PI * 2);
      ctx.fillStyle = m.visitors ? 'rgba(124,92,255,0.75)' : 'rgba(124,92,255,0.45)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  },
  labels(rc) {
    if (!art || rc.webZoom < 2.5) return;
    for (const m of art.museums) {
      const p = rc.project(m.at[0], m.at[1]);
      if (p) rc.labels.add({ text: nm(m), x: p[0], y: p[1] + museumR(m, rc.webZoom) + 8, priority: 500 + Math.min(300, m.sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend() {
    return { kind: 'categories', title: L(`${art?.museums.length ?? ''} art museums`, `${art?.museums.length ?? ''} museos de arte`),
      items: [{ color: 'rgba(124,92,255,0.75)', label: L('Bigger: more visitors a year', 'Más grande: más visitantes al año') }, { color: 'rgba(124,92,255,0.45)', label: L('Visitors not known', 'Visitantes desconocidos') }],
      note: L('Tap one for its best-known works and the city’s art guide.', 'Toca uno para ver sus obras más conocidas y la guía de arte de la ciudad.') };
  },
  tap(_lon, _lat, _inst, ui) {
    const m = art && nearest(art.museums, (x) => x.at, ui);
    if (!m || !art) return false;
    museumCard(ui.card, m, art.byMuseum.get(m.id) ?? [], cityName(m.city), openCity('art'));
    return true;
  },
};

// ---- Masterpieces ---------------------------------------------------------------------------------------------------
function shownWorks(inst: LayerInstance): Map<Museum, Work[]> {
  const out = new Map<Museum, Work[]>();
  if (!art) return out;
  const kind = String(inst.options.kind ?? 'all'), per = PERIODS.find((p) => p[0] === inst.options.period) ?? PERIODS[0];
  for (const w of art.works) {
    if (kind !== 'all' && w.kind !== kind) continue;
    if (per[0] !== 'all' && (w.year == null || w.year < per[2] || w.year >= per[3])) continue;
    (out.get(w.museum) ?? out.set(w.museum, []).get(w.museum)!).push(w);
  }
  return out;
}
export const masterpieces: LayerDef = {
  id: 'masterpieces', category: 'culture', icon: '🖼️', kind: 'overlay', stackOrder: 4,
  name: { en: 'Masterpieces', es: 'Obras maestras' },
  desc: { en: 'The world’s best-known paintings, sculptures and treasures where they hang today, by kind and period.', es: 'Las pinturas, esculturas y tesoros más conocidos del mundo donde se exhiben hoy, por tipo y época.' },
  keywords: 'masterpieces paintings sculpture art works mona lisa where museum obras maestras pinturas escultura',
  credit: 'Wikidata (CC0)',
  options: [
    { id: 'kind', label: { en: 'Kind', es: 'Tipo' }, type: 'select', default: 'all', choices: KINDS.map(([value, label, icon]) => ({ value, label, icon })) },
    { id: 'period', label: { en: 'Made', es: 'Época' }, type: 'select', default: 'all', choices: PERIODS.map(([value, label]) => ({ value, label })) },
  ],
  async load() { art ??= await loadArt(); },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc, inst) {
    const { ctx } = rc;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [m, ws] of shownWorks(inst)) {
      const p = rc.project(m.at[0], m.at[1]);
      if (!p) continue;
      const r = Math.max(7, Math.min(16, 5 + Math.sqrt(ws.length) * 2.4));
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c542'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; ctx.font = '800 10.5px system-ui, sans-serif'; ctx.fillText(String(ws.length), p[0], p[1] + 0.5);
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 2.5) return;
    for (const [m, ws] of shownWorks(inst)) {
      const p = rc.project(m.at[0], m.at[1]);
      if (p) rc.labels.add({ text: nm(ws[0]), sub: nm(m), x: p[0], y: p[1] + 22, priority: 400 + Math.min(300, ws[0].sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const n = [...shownWorks(inst).values()].reduce((s, l) => s + l.length, 0);
    return { kind: 'categories', title: L(`${n} masterpieces`, `${n} obras maestras`), items: [{ color: '#f5c542', label: L('A museum: how many of them it holds', 'Un museo: cuántas tiene') }],
      note: L('Each with the best-known work there. Tap one for its works.', 'Cada uno con la obra más conocida que tiene. Toca uno para ver sus obras.') };
  },
  tap(_lon, _lat, inst, ui) {
    const shown = shownWorks(inst);
    const m = nearest([...shown.keys()], (x) => x.at, ui);
    if (!m) return false;
    museumCard(ui.card, m, shown.get(m)!, cityName(m.city), openCity('art'));
    return true;
  },
};

// ---- Architectural styles ------------------------------------------------------------------------------------------
const STYLE_CHOICES = [['all', 'Every style', 'Todos los estilos'], ['ancient', 'Ancient', 'Antigua'], ['byzantine', 'Byzantine and Orthodox', 'Bizantina y ortodoxa'], ['islamic', 'Islamic', 'Islámica'],
  ['asian', 'Asian traditions', 'Tradiciones asiáticas'], ['romanesque', 'Romanesque', 'Románica'], ['gothic', 'Gothic', 'Gótica'], ['renaissance', 'Renaissance', 'Renacentista'], ['baroque', 'Baroque', 'Barroca'],
  ['neoclassical', 'Neoclassical', 'Neoclásica'], ['revival', 'Revivals and eclecticism', 'Historicismo y eclecticismo'], ['nouveau', 'Art Nouveau', 'Art nouveau y modernismo'], ['deco', 'Art Deco', 'Art déco'],
  ['modern', 'Modern', 'Moderna'], ['contemporary', 'Contemporary', 'Contemporánea']];
function shownBuildings(inst: LayerInstance) {
  const st = String(inst.options.style ?? 'all');
  return (arch?.buildings ?? []).filter((b) => b.style && (st === 'all' || b.style.key === st));
}
export const architecture: LayerDef = {
  id: 'architecture', category: 'culture', icon: '📐', kind: 'overlay', stackOrder: 4,
  name: { en: 'Architectural styles', es: 'Estilos arquitectónicos' },
  desc: { en: 'Notable buildings coloured by style, from Gothic cathedrals to Art Nouveau and today’s towers, with their architects.', es: 'Edificios destacados coloreados por estilo, de las catedrales góticas al art nouveau y las torres de hoy, con sus arquitectos.' },
  keywords: 'architecture architect buildings style gothic baroque art nouveau modern gaudi arquitectura arquitecto edificios estilo gotico barroco',
  credit: 'Wikidata (CC0)',
  options: [{ id: 'style', label: { en: 'Style', es: 'Estilo' }, type: 'select', default: 'all', choices: STYLE_CHOICES.map(([value, en, sp]) => ({ value, label: { en, es: sp } })) }],
  async load() { arch ??= await loadArch(); },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc: RenderCtx, inst) {
    const { ctx } = rc;
    const r = Math.max(3, Math.min(7, 2 + rc.webZoom * 0.6));
    for (const b of shownBuildings(inst)) {
      const p = rc.project(b.at[0], b.at[1]);
      if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fillStyle = b.style!.color; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 4) return;
    for (const b of shownBuildings(inst)) {
      const p = rc.project(b.at[0], b.at[1]);
      if (p) rc.labels.add({ text: nm(b), sub: b.architects[0] ? nm(b.architects[0]) : undefined, x: p[0], y: p[1] + 14, priority: 300 + Math.min(300, b.sl), size: 10, weight: 650, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const shown = shownBuildings(inst);
    const used = (arch?.styles ?? []).filter((s) => shown.some((b) => b.style?.key === s.key));
    return { kind: 'categories', title: L(`${shown.length} buildings by style`, `${shown.length} edificios por estilo`),
      items: used.map((s) => ({ color: s.color, label: `${nm(s)} (${fmtCompact(shown.filter((b) => b.style?.key === s.key).length)})` })),
      note: L('Buildings Wikidata gives a style for. Tap one for its architect.', 'Edificios con un estilo en Wikidata. Toca uno para ver su arquitecto.') };
  },
  tap(_lon, _lat, inst, ui) {
    const b = nearest(shownBuildings(inst), (x) => x.at, ui, 14);
    if (!b) return false;
    buildingCard(ui.card, b, cityName(b.city), openCity('buildings'));
    return true;
  },
};

export default function register(app: App) {
  APP = app;
  app.register([artMuseums, masterpieces, architecture]);
}
