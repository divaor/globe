// Art and architecture on the map (v0.27.0), from public/data/artguide (Wikidata):
// - Art museums: the museums of the art guide, sized by visitors a year.
// - Masterpieces: the best-known works where they hang, one dot a museum with how many there are, by kind and period.
// - Architectural styles: notable buildings with their architects, coloured by style.
// A tap opens the museum's, the work's or the building's card, which links to the city's guide. Close up, dots that
// overlap move apart, each with a line to its place (layers/crowd.ts), so every one can be tapped.
import { lang, fmtCompact, L } from '../../app/i18n';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { LayerDef, LayerHit, LayerInstance, RenderCtx } from '../types';
import { crowdOf, type Placed } from '../crowd';
import { loadArt, loadArch, nm, KINDS, PERIODS, type ArtData, type ArchData, type Work, type Museum, type Building } from '../../artguide/data';
import { museumCard, buildingCard, workCard } from '../../artguide/cards';

const es = () => lang() === 'es';
let APP: App | null = null;
let art: ArtData | null = null;
let arch: ArchData | null = null;
const cityName = (id: string | null) => (id ? (window.atlas?.guide.cityLabel(id) ?? null) : null);
const openCity = (tab: string) => (city: string) => APP?.emit('open-guide', city, tab);

// ---- Art museums ------------------------------------------------------------------------------------------------
const museumR = (m: Museum, z: number) => Math.max(4, Math.min(18, (m.visitors ? 3 + Math.sqrt(m.visitors / 1e6) * 5 : 4) * Math.min(1.6, 0.8 + z * 0.08)));
/** The zoom from which a city's museums move apart (and the buildings, which are many more: closer). */
const MUSEUMS_APART = 6, BUILDINGS_APART = 8.5;
/** This frame's museum dots. */
const museumDots = (rc: RenderCtx, inst: LayerInstance): Placed<Museum>[] =>
  crowdOf<Museum>(inst, MUSEUMS_APART).place(rc, () => art?.museums ?? [], (m) => m.at, (m) => museumR(m, rc.webZoom));
export const artMuseums: LayerDef = {
  id: 'art-museums', category: 'culture', icon: '🏛️', kind: 'overlay', stackOrder: 4,
  name: { en: 'Art museums', es: 'Museos de arte' },
  desc: { en: 'The museums of the art guide, sized by visitors a year; a tap shows their best-known works.', es: 'Los museos de la guía de arte, por visitantes al año; un toque muestra sus obras más conocidas.' },
  keywords: 'museum museums art gallery louvre prado visitors museos arte galería',
  credit: 'Wikidata (CC0)',
  async load() { art ??= await loadArt(); },
  drawOverlay(rc, inst) {
    if (!art) return;
    const { ctx } = rc;
    const crowd = crowdOf<Museum>(inst, MUSEUMS_APART);
    const dots = museumDots(rc, inst);
    crowd.leaders(rc, () => '#7c5cff');
    for (const p of dots) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.it.visitors ? 'rgba(124,92,255,0.75)' : 'rgba(124,92,255,0.45)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  },
  labels(rc, inst) {
    if (!art || rc.webZoom < 2.5) return;
    const crowd = crowdOf<Museum>(inst, MUSEUMS_APART);
    for (const p of museumDots(rc, inst)) {
      crowd.name(rc, p, { text: nm(p.it), priority: 500 + Math.min(300, p.it.sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend() {
    return { kind: 'categories', title: L('{0} art museums', '{0} museos de arte', art?.museums.length ?? ''),
      items: [{ color: 'rgba(124,92,255,0.75)', label: L('Bigger: more visitors a year', 'Más grande: más visitantes al año') }, { color: 'rgba(124,92,255,0.45)', label: L('Visitors not known', 'Visitantes desconocidos') }],
      note: L('Tap one for its best-known works and the city’s art guide. Close up, museums that overlap move apart.', 'Toca uno para ver sus obras más conocidas y la guía de arte de la ciudad. De cerca, los museos que se enciman se separan.') };
  },
  tap(_lon, _lat, inst, ui) {
    const m = crowdOf<Museum>(inst, MUSEUMS_APART).pick(ui);
    if (!m || !art) return false;
    museumCard(ui.card, m, art.byMuseum.get(m.id) ?? [], cityName(m.city), openCity('art'));
    return true;
  },
  searchHint: { en: 'museums', es: 'museos' },
  async searchLoad() { art ??= await loadArt(); },
  search(match) {
    const out: LayerHit[] = [];
    for (const m of art?.museums ?? []) {
      const s = Math.max(match(m.name[0]), match(m.name[1]));
      if (s <= 0) continue;
      const works = art!.byMuseum.get(m.id) ?? [];
      out.push({ label: nm(m), sub: [cityName(m.city), m.visitors ? L('{0} visitors a year', '{0} visitantes al año', fmtCompact(m.visitors)) : null, works.length ? L('{0} works', '{0} obras', works.length) : null].filter(Boolean).join(' · '),
        icon: '🏛️', lon: m.at[0], lat: m.at[1], score: s + Math.min(10, m.sl / 30), wz: 13, dot: m,
        open: (ui) => museumCard(ui.card, m, works, cityName(m.city), openCity('art')) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  },
};

// ---- Masterpieces ---------------------------------------------------------------------------------------------------
let worksMemo: { key: string; list: [Museum, Work[]][] } | null = null;
const worksKey = (inst: LayerInstance) => `${inst.options.kind ?? 'all'}|${inst.options.period ?? 'all'}`;
/** The museums with works of the kind and period chosen, each with those works (the same list until the choice changes). */
function shownWorks(inst: LayerInstance): [Museum, Work[]][] {
  if (!art) return [];
  const key = worksKey(inst);
  if (worksMemo?.key === key) return worksMemo.list;
  const out = new Map<Museum, Work[]>();
  const kind = String(inst.options.kind ?? 'all'), per = PERIODS.find((p) => p[0] === inst.options.period) ?? PERIODS[0];
  for (const w of art.works) {
    if (kind !== 'all' && w.kind !== kind) continue;
    if (per[0] !== 'all' && (w.year == null || w.year < per[2] || w.year >= per[3])) continue;
    (out.get(w.museum) ?? out.set(w.museum, []).get(w.museum)!).push(w);
  }
  worksMemo = { key, list: [...out] };
  return worksMemo.list;
}
/** This frame's dots: a museum and its works that the filter shows. */
const workDots = (rc: RenderCtx, inst: LayerInstance): Placed<[Museum, Work[]]>[] =>
  crowdOf<[Museum, Work[]]>(inst, MUSEUMS_APART).place(rc, () => shownWorks(inst), (x) => x[0].at, (x) => Math.max(7, Math.min(16, 5 + Math.sqrt(x[1].length) * 2.4)), undefined, worksKey(inst));
export const masterpieces: LayerDef = {
  id: 'masterpieces', category: 'culture', icon: '🖼️', kind: 'overlay', stackOrder: 4,
  name: { en: 'Masterpieces', es: 'Obras maestras' },
  desc: { en: 'The world’s best-known paintings, sculptures and treasures where they hang today, by kind and period.', es: 'Las pinturas, esculturas y tesoros más conocidos del mundo donde se exhiben hoy, por tipo y época.' },
  keywords: 'masterpieces paintings sculpture art works mona lisa where museum obras maestras pinturas escultura',
  credit: 'Wikidata (CC0)',
  options: [
    { id: 'kind', label: { en: 'Kind', es: 'Tipo' }, type: 'select', default: 'all', choices: KINDS.map(([value, label, icon]) => ({ value, label, icon })) },
    { id: 'period', label: { en: 'Period', es: 'Época' }, type: 'select', default: 'all', choices: PERIODS.map(([value, label]) => ({ value, label })) },
  ],
  async load() { art ??= await loadArt(); },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc, inst) {
    const { ctx } = rc;
    const crowd = crowdOf<[Museum, Work[]]>(inst, MUSEUMS_APART);
    const dots = workDots(rc, inst);
    crowd.leaders(rc, () => '#f5c542');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const p of dots) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#f5c542'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
      ctx.fillStyle = '#1b1b1b'; ctx.font = '800 10.5px system-ui, sans-serif'; ctx.fillText(String(p.it[1].length), p.x, p.y + 0.5);
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 2.5) return;
    const crowd = crowdOf<[Museum, Work[]]>(inst, MUSEUMS_APART);
    for (const p of workDots(rc, inst)) {
      const [m, ws] = p.it;
      crowd.name(rc, p, { text: nm(ws[0]), sub: nm(m), priority: 400 + Math.min(300, ws[0].sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const n = shownWorks(inst).reduce((s, x) => s + x[1].length, 0);
    return { kind: 'categories', title: L('{0} masterpieces', '{0} obras maestras', n), items: [{ color: '#f5c542', label: L('A museum: how many of them it holds', 'Un museo: cuántas tiene') }],
      note: L('Each with the best-known work there. Tap one for its works.', 'Cada uno con la obra más conocida que tiene. Toca uno para ver sus obras.') };
  },
  tap(_lon, _lat, inst, ui) {
    const hit = crowdOf<[Museum, Work[]]>(inst, MUSEUMS_APART).pick(ui);
    if (!hit) return false;
    museumCard(ui.card, hit[0], hit[1], cityName(hit[0].city), openCity('art'));
    return true;
  },
  // Works by their title ("Las Meninas", "girl pearl earring") and artists ("Velázquez": their trail).
  searchHint: { en: 'works and artists', es: 'obras y artistas' },
  async searchLoad() { art ??= await loadArt(); },
  search(match) {
    if (!art) return [];
    const out: LayerHit[] = [];
    for (const w of art.works) {
      const s = Math.max(match(w.name[0]), match(w.name[1]));
      if (s <= 0) continue;
      out.push({ label: nm(w), sub: [w.artist ? nm(w.artist) : null, w.year != null ? String(w.year) : null, `${nm(w.museum)}${cityName(w.museum.city) ? `, ${cityName(w.museum.city)}` : ''}`].filter(Boolean).join(' · '),
        icon: '🖼️', lon: w.museum.at[0], lat: w.museum.at[1], score: s + Math.min(18, w.sl / 8), wz: 13, dot: w.museum,
        prepare: (i) => { if (!shownWorks(i).some((x) => x[1].includes(w))) { APP?.setOption(i.def.id, 'kind', 'all'); APP?.setOption(i.def.id, 'period', 'all'); } },
        open: (ui) => workCard(ui.card, w, cityName(w.museum.city), openCity('art')) });
    }
    for (const a of art.artists) {
      const s = Math.max(match(a.name[0]), match(a.name[1]));
      if (s <= 0) continue;
      const ws = art.byArtist.get(a.id) ?? [];
      if (!ws.length) continue;
      const top = ws[0].museum, ms = new Set(ws.map((w) => w.museum.id)).size;
      out.push({ label: nm(a), sub: L('{0} works in {1} museums: the trail', '{0} obras en {1} museos: el recorrido', ws.length, ms), icon: '🧑‍🎨',
        lon: top.at[0], lat: top.at[1], score: s + 4 + Math.min(10, a.sl / 15), wz: 5, dot: top,
        open: () => void window.atlas?.art?.openArtist(a.id) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
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
/** This frame's building dots; the better-known building keeps its place. */
function buildingDots(rc: RenderCtx, inst: LayerInstance): Placed<Building>[] {
  const r = Math.max(3, Math.min(7, 2 + rc.webZoom * 0.6));
  return crowdOf<Building>(inst, BUILDINGS_APART).place(rc, () => shownBuildings(inst), (b) => b.at, () => r, (b) => 1 + b.sl, String(inst.options.style ?? 'all'));
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
    const crowd = crowdOf<Building>(inst, BUILDINGS_APART);
    const dots = buildingDots(rc, inst);
    crowd.leaders(rc, (b) => b.style!.color);
    for (const p of dots) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.it.style!.color; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.stroke();
    }
  },
  labels(rc, inst) {
    if (rc.webZoom < 4) return;
    const crowd = crowdOf<Building>(inst, BUILDINGS_APART);
    for (const p of buildingDots(rc, inst)) {
      const b = p.it;
      crowd.name(rc, p, { text: nm(b), sub: b.architects[0] ? nm(b.architects[0]) : undefined, priority: 300 + Math.min(300, b.sl), size: 10, weight: 650, color: rc.theme.label, halo: rc.theme.labelHalo }, p.r + 7);
    }
  },
  legend(inst) {
    const shown = shownBuildings(inst);
    const used = (arch?.styles ?? []).filter((s) => shown.some((b) => b.style?.key === s.key));
    return { kind: 'categories', title: L('{0} buildings by style', '{0} edificios por estilo', shown.length),
      items: used.map((s) => ({ color: s.color, label: `${nm(s)} (${fmtCompact(shown.filter((b) => b.style?.key === s.key).length)})` })),
      note: L('Buildings Wikidata gives a style for. Tap one for its architect.', 'Edificios con un estilo en Wikidata. Toca uno para ver su arquitecto.') };
  },
  tap(_lon, _lat, inst, ui) {
    const b = crowdOf<Building>(inst, BUILDINGS_APART).pick(ui, 14);
    if (!b) return false;
    buildingCard(ui.card, b, cityName(b.city), openCity('buildings'));
    return true;
  },
  // Buildings by their name ("Sagrada Família") and architects ("Gaudí": their trail).
  searchHint: { en: 'buildings and architects', es: 'edificios y arquitectos' },
  async searchLoad() { arch ??= await loadArch(); },
  search(match) {
    if (!arch) return [];
    const out: LayerHit[] = [];
    for (const b of arch.buildings) {
      if (!b.style) continue;
      const s = Math.max(match(b.name[0]), match(b.name[1]));
      if (s <= 0) continue;
      out.push({ label: nm(b), sub: [b.architects[0] ? nm(b.architects[0]) : null, b.style ? nm(b.style) : null, cityName(b.city)].filter(Boolean).join(' · '),
        icon: '📐', lon: b.at[0], lat: b.at[1], score: s + Math.min(18, b.sl / 8), wz: 14, dot: b,
        prepare: (i) => { if (i.options.style !== 'all' && i.options.style !== b.style?.key) APP?.setOption(i.def.id, 'style', 'all'); },
        open: (ui) => buildingCard(ui.card, b, cityName(b.city), openCity('buildings')) });
    }
    for (const a of arch.architects) {
      const s = Math.max(match(a.name[0]), match(a.name[1]));
      if (s <= 0) continue;
      const bs = (arch.byArchitect.get(a.id) ?? []).filter((b) => b.style);
      if (!bs.length) continue;
      out.push({ label: nm(a), sub: L('{0} buildings: the trail', '{0} edificios: el recorrido', bs.length), icon: '👷',
        lon: bs[0].at[0], lat: bs[0].at[1], score: s + 2 + Math.min(10, a.sl / 15), wz: 6, dot: bs[0],
        open: () => void window.atlas?.art?.openArchitect(a.id) });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  },
};

export default function register(app: App) {
  APP = app;
  app.register([artMuseums, masterpieces, architecture]);
}
