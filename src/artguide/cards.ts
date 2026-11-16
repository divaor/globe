// Cards for a work of art and a building (v0.27.0), shown by the map filters, the trails and the travel guide: the
// picture from Wikimedia Commons with its licence and author (read live from Commons), what it is, where it is now,
// and links to its Wikipedia article and to the guide of its city.
import { recordSeen } from '../learn/progress';
import { h } from '../ui/dom';
import { lang, fmtCompact } from '../app/i18n';
import type { InfoRow } from '../layers/types';
import { nm, yearText, commons, commonsPage, commonsCredit, wikiOf, kindIcon, KINDS, type Work, type Building, type Museum } from './data';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
export type CardFn = (icon: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>, extra?: HTMLElement | null) => void;

/** A line under a picture: its licence and author, once Commons answers. */
export function creditEl(file: string | null): HTMLElement | null {
  if (!file) return null;
  const p = h('p', { class: 'card-note art-credit', 'data-credit': file }, h('a', { href: commonsPage(file), target: '_blank', rel: 'noopener' }, L('Picture: Wikimedia Commons', 'Imagen: Wikimedia Commons')));
  void commonsCredit(file).then((c) => {
    if (!c || !p.isConnected) return;
    p.firstChild!.textContent = L(`Picture: ${c.licence}${c.author ? ` · ${c.author}` : ''} · Wikimedia Commons`, `Imagen: ${c.licence}${c.author ? ` · ${c.author}` : ''} · Wikimedia Commons`);
  });
  return p;
}

export function workCard(card: CardFn, w: Work, cityName: string | null, openCity: ((city: string) => void) | null, showOnMap?: () => void) {
  // Each masterpiece opened counts once for the Curator badge.
  const got = recordSeen('works', w.id);
  if (got.length) window.atlas?.shell.toast(`${got[0].icon} ${es() ? `Nueva insignia: ${got[0].es}` : `New badge: ${got[0].en}`}`, 4000);
  const kind = KINDS.find((k) => k[0] === w.kind)?.[1];
  const rows: InfoRow[] = [];
  if (w.artist) rows.push({ label: L('By', 'De'), value: nm(w.artist), icon: '🧑‍🎨' });
  if (w.year != null) rows.push({ label: L('Made', 'Hecha'), value: yearText(w.year), icon: '📅' });
  rows.push({ label: L('Now in', 'Hoy en'), value: `${nm(w.museum)}${cityName ? `, ${cityName}` : ''}`, icon: '🏛️' });
  if (kind) rows.push({ label: L('Kind', 'Tipo'), value: es() ? kind.es : kind.en, icon: kindIcon(w.kind) });
  const links: { label: string; href?: string; onClick?: () => void }[] = [{ label: 'Wikipedia', href: wikiOf(w.id) }];
  if (showOnMap) links.unshift({ label: L('Show on the map', 'Ver en el mapa'), onClick: showOnMap });
  if (openCity) links.push({ label: L('The city’s art guide', 'Guía de arte de la ciudad'), onClick: () => openCity(w.museum.city) });
  card(kindIcon(w.kind), nm(w), [w.artist ? nm(w.artist) : '', yearText(w.year)].filter(Boolean).join(' · '), rows, links, [], w.img ? Promise.resolve(commons(w.img, 480)) : undefined, creditEl(w.img));
}

export function museumCard(card: CardFn, m: Museum, works: Work[], cityName: string | null, openCity: ((city: string) => void) | null, showOnMap?: () => void) {
  const rows: InfoRow[] = [];
  if (cityName) rows.push({ label: L('City', 'Ciudad'), value: cityName, icon: '📍' });
  if (m.visitors) rows.push({ label: L('Visitors', 'Visitantes'), value: L(`${fmtCompact(m.visitors)} a year`, `${fmtCompact(m.visitors)} al año`), icon: '👥' });
  rows.push({ label: L('Best-known works here', 'Obras más conocidas aquí'), value: String(works.length), icon: '🖼️' });
  const links: { label: string; href?: string; onClick?: () => void }[] = [{ label: 'Wikipedia', href: wikiOf(m.id) }];
  if (showOnMap) links.unshift({ label: L('Show on the map', 'Ver en el mapa'), onClick: showOnMap });
  if (m.web) links.push({ label: L('Official site', 'Sitio oficial'), href: m.web });
  if (openCity) links.push({ label: L('The city’s art guide', 'Guía de arte de la ciudad'), onClick: () => openCity(m.city) });
  const top = works.slice(0, 6).map((w) => `${kindIcon(w.kind)} ${nm(w)}${w.artist ? ` (${nm(w.artist)})` : ''}`);
  const img = works.find((w) => w.img)?.img ?? null;
  card('🏛️', nm(m), cityName ?? '', rows, links, top.length ? [`${L('Among them', 'Entre ellas')}: ${top.join(' · ')}`] : [], img ? Promise.resolve(commons(img, 480)) : undefined, creditEl(img));
}

export function buildingCard(card: CardFn, b: Building, cityName: string | null, openCity: ((city: string) => void) | null, showOnMap?: () => void) {
  const rows: InfoRow[] = [];
  if (b.architects.length) rows.push({ label: b.architects.length > 1 ? L('Architects', 'Arquitectos') : L('Architect', 'Arquitecto'), value: b.architects.map(nm).join(', '), icon: '📐' });
  if (b.style) rows.push({ label: L('Style', 'Estilo'), value: nm(b.style), icon: '🏛️' });
  if (b.year != null) rows.push({ label: L('Built', 'Construido'), value: yearText(b.year), icon: '📅' });
  if (cityName) rows.push({ label: L('City', 'Ciudad'), value: cityName, icon: '📍' });
  const links: { label: string; href?: string; onClick?: () => void }[] = [{ label: 'Wikipedia', href: wikiOf(b.id) }];
  if (showOnMap) links.unshift({ label: L('Show on the map', 'Ver en el mapa'), onClick: showOnMap });
  if (openCity && b.city) links.push({ label: L('The city’s guide', 'Guía de la ciudad'), onClick: () => openCity(b.city!) });
  card('🏛️', nm(b), [b.style ? nm(b.style) : '', yearText(b.year)].filter(Boolean).join(' · '), rows, links, [], b.img ? Promise.resolve(commons(b.img, 480)) : undefined, creditEl(b.img));
}
