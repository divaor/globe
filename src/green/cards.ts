// Green planet (v0.31.0): the cards of a plant, a botanical garden, a famous tree, an ecoregion, a spectacle of
// nature's calendar and a first crop. A plant's card has its picture (live from Wikimedia Commons, with its licence and
// author), what it is, its Red List status, height and lifespan, the countries it grows in, when it flowers (live from
// iNaturalist), and buttons for where it grows, the best places to see it, its relatives and its crop's story.
import { h } from '../ui/dom';
import { lang, fmtCompact } from '../app/i18n';
import { recordSeen } from '../learn/progress';
import { commons, wikiOf } from '../artguide/data';
import { creditEl } from '../artguide/cards';
import { planLink } from '../guide/plan';
import { STATUS, statusName } from '../wild/data';
import { floweringEl } from '../wild/inat';
import type { InfoRow } from '../layers/types';
import type { CardFn } from '../wild/cards';
import {
  PLANT_GROUPS, plantGroupName, plantFacts, nm, tt, monthName, yearText, biomeName, realmName, PROTECTION, BIOMES,
  type Plant, type Garden, type FamousTree, type Spectacle, type Crop, type GreenData,
} from './data';
import { appLocale } from '../app/i18n';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
type Link = { label: string; href?: string; onClick?: () => void };

/** What the cards' buttons do (layers/packs/green.ts gives them). */
export interface GreenLinks {
  showRange(p: Plant): void;
  bestPlaces(p: Plant): void;
  relatives(p: Plant): void;
  openPlant(p: Plant): void;
  plantById(id: string): Plant | null;
  openCrop(id: string): void;
  openStory(collection: string, id: string, step: number): void;
  openAnimal(sci: string): boolean;
  countryName(id: string): string;
  planTrip(at: [number, number], label: string): void;
  toast(msg: string): void;
}

/** The Red List badge of a plant. */
export function plantStatusBadge(p: Plant): HTMLElement | null {
  if (!p.st) return null;
  const s = STATUS[p.st];
  return h('span', { class: 'wild-status', style: `background:${s.color};color:${s.ink}`, 'data-status': p.st }, statusName(p.st));
}

/** Source links ("Source 1: kew.org"). */
function sourceLinks(urls: string[] | undefined, max = 3): Link[] {
  const out: Link[] = [];
  (urls ?? []).slice(0, max).forEach((u, i) => { try { out.push({ label: `${L('Source', 'Fuente')} ${i + 1}: ${new URL(u).hostname.replace(/^www\./, '')}`, href: u }); } catch { /* not a link */ } });
  return out;
}

function chips(items: { e: string; name: string; attr: Record<string, string>; on: () => void }[]): HTMLElement {
  const list = h('div', { class: 'wild-chips' });
  for (const it of items) {
    const b = h('button', { type: 'button', class: 'chip', ...it.attr }, `${it.e} ${it.name}`);
    b.addEventListener('click', it.on);
    list.append(b);
  }
  return list;
}

export function plantCard(card: CardFn, p: Plant, x: GreenLinks) {
  const got = recordSeen('plants', p.id);
  if (got.length) x.toast(`${got[0].icon} ${es() ? `Nueva insignia: ${got[0].es}` : `New badge: ${got[0].en}`}`);
  const rows: InfoRow[] = [{ label: L('Group', 'Grupo'), value: `${plantGroupName(p.g)}${p.fam ? ` · ${p.fam}` : ''}`, icon: PLANT_GROUPS[p.g].icon }];
  rows.push(...plantFacts(p));
  if (p.cc.length) {
    const names = p.cc.map((c) => x.countryName(c)).filter(Boolean).sort((a, b) => a.localeCompare(b, lang()));
    const shown = names.slice(0, 10).join(', ');
    rows.push({ label: L('Grows wild in', 'Crece silvestre en'), value: names.length > 10 ? L(`${shown} and ${names.length - 10} more`, `${shown} y ${names.length - 10} más`) : shown, icon: '🌍' });
  }
  const links: Link[] = [{ label: L('Show where it grows', 'Mostrar dónde crece'), onClick: () => x.showRange(p) }];
  if (p.best.length) links.push({ label: L('Best places to see it', 'Mejores lugares para verla'), onClick: () => x.bestPlaces(p) });
  links.push({ label: L('Its relatives', 'Sus parientes'), onClick: () => x.relatives(p) });
  if (p.crop) links.push({ label: L('Where it was first grown', 'Dónde se cultivó por primera vez'), onClick: () => x.openCrop(p.crop!) });
  links.push({ label: 'Wikipedia', href: wikiOf(p.q) });
  const extra = h('div', { class: 'wild-card-extra', 'data-plant': p.id });
  const badge = plantStatusBadge(p);
  if (badge) extra.append(h('p', { class: 'wild-status-row' }, h('span', { class: 'muted small' }, L('Red List: ', 'Lista Roja: ')), badge));
  extra.append(h('div', { class: 'wild-sound-title' }, `🌼 ${L('When it flowers', 'Cuándo florece')}`), floweringEl(p.sci));
  const credit = creditEl(p.img ?? null);
  if (credit) extra.append(credit);
  card(p.e, nm(p), p.sci, rows, links, [], p.img ? Promise.resolve(commons(p.img, 480)) : undefined, extra);
}

export function gardenCard(card: CardFn, g: Garden, d: GreenData | null, x: GreenLinks) {
  const arb = g.k === 'arb';
  const rows: InfoRow[] = [{ label: L('Kind', 'Tipo'), value: arb ? L('Arboretum', 'Arboreto') : L('Botanical garden', 'Jardín botánico'), icon: arb ? '🌳' : '🌺' }];
  if (g.cc) rows.push({ label: L('Country', 'País'), value: x.countryName(g.cc), icon: '📍' });
  if (g.since) rows.push({ label: L('Founded', 'Fundado'), value: yearText(g.since), icon: '📅' });
  const extra = h('div', { class: 'wild-card-extra' });
  const plants = d ? g.f.map((id) => d.byId.get(id)).filter((p): p is Plant => !!p) : [];
  if (plants.length) {
    extra.append(h('p', { class: 'muted small' }, L('Near where these grow wild:', 'Cerca de donde crecen silvestres:')),
      chips(plants.map((p) => ({ e: p.e, name: nm(p), attr: { 'data-plant': p.id }, on: () => x.openPlant(p) }))));
  }
  const credit = creditEl(g.img ?? null);
  if (credit) extra.append(credit);
  const links: Link[] = [
    { label: L('Plan a trip', 'Planear un viaje'), onClick: () => x.planTrip(g.at, nm(g)) },
    planLink({ id: `garden:${g.id}`, kind: 'garden', n: g.n, at: g.at, url: wikiOf(g.id) }),
    { label: 'Wikipedia', href: wikiOf(g.id) },
  ];
  card(arb ? '🌳' : '🌺', nm(g), g.cc ? x.countryName(g.cc) : '', rows, links, [], g.img ? Promise.resolve(commons(g.img, 480)) : undefined, extra);
}

export function treeCard(card: CardFn, t: FamousTree, x: GreenLinks) {
  const rows: InfoRow[] = [];
  if (t.sp) rows.push({ label: L('Species', 'Especie'), value: `${es() ? t.sp[1] : t.sp[0]} · ${t.sp[2]}`, icon: '🌳' });
  if (t.rec) rows.push({ label: L('Record', 'Récord'), value: tt(t.rec), icon: '🏆' });
  if (t.age) rows.push({ label: L('Age', 'Edad'), value: tt(t.age), icon: '⏳' });
  if (t.h) rows.push({ label: L('Height', 'Altura'), value: `${t.h.toLocaleString(appLocale(), { maximumFractionDigits: 1 })} m`, icon: '📏' });
  if (t.since && !t.age) rows.push({ label: L('Planted', 'Plantado'), value: yearText(t.since), icon: '📅' });
  if (t.place) rows.push({ label: L('Where', 'Dónde'), value: tt(t.place), icon: '📍' });
  else if (t.cc) rows.push({ label: L('Country', 'País'), value: x.countryName(t.cc), icon: '📍' });
  if (t.status === 'gone' || t.status === 'fallen') rows.push({ label: L('Today', 'Hoy'), value: t.status === 'fallen' ? L('Fallen', 'Caído') : L('Gone', 'Ya no existe'), icon: '🕯️' });
  const notes: string[] = [];
  if (t.text) notes.push(tt(t.text));
  if (t.secret) notes.push(L('Where it stands is kept secret to protect it, so the map shows its park instead.', 'Dónde está se mantiene en secreto para protegerlo, así que el mapa muestra su parque.'));
  const links: Link[] = [];
  const plant = t.plant ? x.plantById(t.plant) : null;
  if (plant) links.push({ label: L(`${nm(plant)}: its card`, `${nm(plant)}: su ficha`), onClick: () => x.openPlant(plant) });
  if (!t.secret) links.push({ label: L('Plan a trip', 'Planear un viaje'), onClick: () => x.planTrip(t.at, nm(t)) }, planLink({ id: `tree:${t.id}`, kind: 'tree', n: t.n, at: t.at, ...(t.q ? { url: wikiOf(t.q) } : {}), ...(t.rec ? { why: [{ t: [t.rec.en, t.rec.es] }] } : {}) }));
  if (t.q) links.push({ label: 'Wikipedia', href: wikiOf(t.q) });
  links.push(...sourceLinks(t.src, 2));
  const icon = t.rec ? '🏆' : '🌳';
  card(icon, nm(t), t.sp ? t.sp[2] : '', rows, links, notes, t.img ? Promise.resolve(commons(t.img, 480)) : undefined, creditEl(t.img ?? null));
}

/** An ecoregion: its biome, realm and protection, and the plants and animals of ours that live in it. */
export function ecoCard(card: CardFn, e: { i: number; n: string; es?: string; b: number; r: string; h: number }, km2: number, plants: Plant[], animals: { e: string; n: [string, string]; sci: string }[], x: GreenLinks) {
  const rows: InfoRow[] = [
    { label: L('Biome', 'Bioma'), value: biomeName(e.b), icon: '🌿' },
    { label: L('Realm', 'Región biogeográfica'), value: realmName(e.r), icon: '🧭' },
  ];
  if (km2 > 0) rows.push({ label: L('Area', 'Superficie'), value: `${fmtCompact(Math.round(km2))} km²`, icon: '📐' });
  const prot = PROTECTION[e.h];
  if (prot) rows.push({ label: L('Protected', 'Protección'), value: tt(prot), icon: '🛡️' });
  const extra = h('div', { class: 'wild-card-extra', 'data-eco': String(e.i) });
  if (plants.length) extra.append(h('p', { class: 'muted small' }, L('Plants of ours that grow here:', 'Plantas nuestras que crecen aquí:')),
    chips(plants.slice(0, 10).map((p) => ({ e: p.e, name: nm(p), attr: { 'data-plant': p.id }, on: () => x.openPlant(p) }))));
  if (animals.length) extra.append(h('p', { class: 'muted small' }, L('Animals of ours that live here:', 'Animales nuestros que viven aquí:')),
    chips(animals.slice(0, 10).map((a) => ({ e: a.e, name: es() ? a.n[1] : a.n[0], attr: { 'data-animal-sci': a.sci }, on: () => { x.openAnimal(a.sci); } }))));
  const name = es() && e.es ? e.es : e.n;
  const notes = [L('One of 846 ecoregions: areas with their own mix of plants and animals, drawn by 49 scientists (RESOLVE Ecoregions 2017, CC BY 4.0).', 'Una de 846 ecorregiones: zonas con su propia mezcla de plantas y animales, trazadas por 49 científicos (RESOLVE Ecoregions 2017, CC BY 4.0).')];
  card('🌿', name, biomeName(e.b), rows, [], notes, undefined, extra);
}
export const biomeColor = (b: number) => BIOMES[b]?.color ?? '#dee2e6';

const KIND_LABEL: Record<Spectacle['kind'], { icon: string; en: string; es: string }> = {
  bloom: { icon: '🌸', en: 'In bloom', es: 'En flor' },
  autumn: { icon: '🍁', en: 'Autumn colours', es: 'Colores de otoño' },
  green: { icon: '🌱', en: 'Green and growing', es: 'Verde y creciendo' },
  animal: { icon: '🐾', en: 'Animals', es: 'Animales' },
};
export const spectacleKind = (k: Spectacle['kind']) => KIND_LABEL[k];

/** "March–May (best in April)". */
export function monthsText(s: Spectacle): string {
  const ms = [...s.months].sort((a, b) => a - b);
  // Runs of months, a run across the new year joined ("November–February").
  const runs: number[][] = [];
  for (const m of ms) { const r = runs[runs.length - 1]; if (r && r[r.length - 1] === m - 1) r.push(m); else runs.push([m]); }
  if (runs.length > 1 && runs[0][0] === 1 && runs[runs.length - 1].at(-1) === 12) runs[0] = [...runs.pop()!, ...runs[0]];
  const span = runs.map((r) => (r.length === 1 ? monthName(r[0] - 1) : `${monthName(r[0] - 1)}–${monthName(r[r.length - 1] - 1)}`)).join(', ');
  const cap = span.charAt(0).toUpperCase() + span.slice(1);
  return s.months.length > 1 ? L(`${cap} (best in ${monthName(s.peak - 1)})`, `${cap} (mejor en ${monthName(s.peak - 1)})`) : cap;
}

export function spectacleCard(card: CardFn, s: Spectacle, x: GreenLinks, plantOf: (sci: string) => Plant | null) {
  const k = KIND_LABEL[s.kind];
  const rows: InfoRow[] = [
    { label: L('When', 'Cuándo'), value: monthsText(s), icon: '📅' },
    { label: L('Where', 'Dónde'), value: tt(s.place), icon: '📍' },
  ];
  const notes = [tt(s.text)];
  if (s.how) notes.push(`${L('How to see it', 'Cómo verlo')}: ${tt(s.how)}`);
  const links: Link[] = [];
  const plant = s.sci ? plantOf(s.sci) : null;
  if (plant) links.push({ label: L(`${nm(plant)}: its card`, `${nm(plant)}: su ficha`), onClick: () => x.openPlant(plant) });
  else if (s.sci && s.kind === 'animal') links.push({ label: L('The animal’s card', 'La ficha del animal'), onClick: () => { if (!x.openAnimal(s.sci!)) x.toast(L('Not one of our animals.', 'No es uno de nuestros animales.')); } });
  links.push({ label: L('Plan a trip', 'Planear un viaje'), onClick: () => x.planTrip(s.at, tt(s.n)) },
    planLink({ id: `spectacle:${s.id}`, kind: 'spectacle', n: [s.n.en, s.n.es], at: s.at, why: [{ t: [`${monthsText(s)} · ${s.place.en}`, `${monthsText(s)} · ${s.place.es}`] }] }));
  links.push(...sourceLinks(s.src));
  card(s.e, tt(s.n), `${k.icon} ${es() ? k.es : k.en}`, rows, links, notes);
}

export function cropCard(card: CardFn, c: Crop, x: GreenLinks, show: () => void) {
  const rows: InfoRow[] = [
    { label: L('First grown', 'Primer cultivo'), value: `${L('about', 'hacia')} ${yearText(c.date)}`, icon: '📅' },
    { label: L('Where', 'Dónde'), value: tt(c.origin.place), icon: '📍' },
  ];
  if (c.spread.length) rows.push({ label: L('Then to', 'Luego a'), value: c.spread.slice(0, 4).map((s) => tt(s.label)).join(' · '), icon: '🧭' });
  const notes = [tt(c.text)];
  if (c.dateNote) notes.push(tt(c.dateNote));
  if (c.today) notes.push(`${L('Today', 'Hoy')}: ${tt(c.today)}`);
  const links: Link[] = [{ label: L('Show its journey', 'Mostrar su viaje'), onClick: show }];
  const plant = c.plant ? x.plantById(c.plant) : null;
  if (plant) links.push({ label: L(`Wild ${nm(plant).toLowerCase()}: its card`, `${nm(plant)} silvestre: su ficha`), onClick: () => x.openPlant(plant) });
  if (c.story) links.push({ label: L('Open its story', 'Abrir su historia'), onClick: () => x.openStory(c.story![0], c.story![1], c.story![2]) });
  links.push(...sourceLinks(c.src));
  card(c.e, tt(c.n), c.sci, rows, links, notes);
}
