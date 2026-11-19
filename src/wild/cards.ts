// Wild world (v0.30.0): the cards of an animal, a park and a zoo. An animal's card has its picture and call (live
// from Wikimedia Commons, with their licence and author), what it is, its Red List status, size, weight and lifespan,
// the countries it lives in, and three buttons: where it lives, the best places to see it, and its relatives.
import { h } from '../ui/dom';
import { clipEl, type Clip } from '../ui/audio';
import { planLink } from '../guide/plan';
import { lang, fmtCompact, L, tx } from '../app/i18n';
import { recordSeen } from '../learn/progress';
import { commons, commonsPage, commonsCredit, wikiOf } from '../artguide/data';
import { creditEl } from '../artguide/cards';
import type { InfoRow } from '../layers/types';
import { GROUPS, STATUS, factRows, groupName, nm, statusName, type Animal, type Park, type Zoo, type WildData } from './data';

const es = () => lang() === 'es';
export type CardFn = (icon: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>, extra?: HTMLElement | null) => void;

/** What the cards' buttons do (layers/packs/wild.ts gives them). */
export interface WildLinks {
  showRange(a: Animal): void;
  bestPlaces(a: Animal): void;
  relatives(a: Animal): void;
  openAnimal(a: Animal): void;
  openStory(step: number): void;
  countryName(id: string): string;
  planTrip(at: [number, number], label: string): void;
  toast(msg: string): void;
}

/** The Red List badge: its colour and name. */
export function statusBadge(a: Animal): HTMLElement | null {
  if (!a.st) return null;
  const s = STATUS[a.st];
  return h('span', { class: 'wild-status', style: `background:${s.color};color:${s.ink}`, 'data-status': a.st }, a.st === 'EX' && a.gone ? L('Extinct · {0}', 'Extinto · {0}', a.gone) : statusName(a.st));
}

/** An animal's call: played by the app's player (one sound at a time, the small player in the top bar to stop it once
 * its card is closed) from Commons' MP3 copy, which every phone plays and which comes down quickly, else from the
 * original recording (an Ogg, FLAC or WAV file), whole; with its licence and author once Commons answers. */
function soundEl(a: Animal): HTMLElement {
  const file = a.snd!;
  const name = (file.charAt(0).toUpperCase() + file.slice(1)).replace(/ /g, '_'), enc = encodeURIComponent(name);
  const orig = a.sndh ? `https://upload.wikimedia.org/wikipedia/commons/${a.sndh}/${enc}` : `https://commons.wikimedia.org/wiki/Special:FilePath/${enc}`;
  const src = a.sndh && !/\.mp3$/i.test(name) ? `https://upload.wikimedia.org/wikipedia/commons/transcoded/${a.sndh}/${enc}/${enc}.mp3` : orig;
  const clip: Clip = { src, orig, page: commonsPage(file), start: 0, end: 0, by: { en: '', es: '' }, license: '' };
  const player = clipEl(clip, { title: `${a.e} ${nm(a)}`, credit: false });
  player.querySelector('.clip-label')!.textContent = L('Listen to its call', 'Escucha su sonido');
  const credit = h('p', { class: 'card-note art-credit' }, h('a', { href: commonsPage(file), target: '_blank', rel: 'noopener' }, L('Sound: Wikimedia Commons', 'Sonido: Wikimedia Commons')));
  void commonsCredit(file).then((c) => {
    if (!c || !credit.isConnected) return;
    credit.firstChild!.textContent = L('Sound: {0}{1} · Wikimedia Commons', 'Sonido: {0}{1} · Wikimedia Commons', c.licence, c.author ? ` · ${c.author}` : '');
  });
  return h('div', { class: 'wild-sound' }, h('div', { class: 'wild-sound-title' }, `🔊 ${L('Its call', 'Su sonido')}`), player, credit);
}

export function animalCard(card: CardFn, a: Animal, x: WildLinks) {
  const got = recordSeen('animals', a.id);
  if (got.length) x.toast(`${got[0].icon} ${L('New badge: {0}', 'Nueva insignia: {0}', tx(got[0]))}`);
  const rows: InfoRow[] = [];
  rows.push({ label: L('Group', 'Grupo'), value: `${groupName(a.g)}${a.fam ? ` · ${a.fam}` : ''}`, icon: GROUPS[a.g].icon });
  if (a.gone) rows.push({ label: L('Last seen', 'Visto por última vez'), value: `${a.gone} · ${es() ? a.last?.es : a.last?.en}`, icon: '🕯️' });
  rows.push(...factRows(a));
  if (a.cc.length) {
    const names = a.cc.map((c) => x.countryName(c)).filter(Boolean).sort((p, q) => p.localeCompare(q, lang()));
    const shown = names.slice(0, 10).join(', ');
    rows.push({ label: a.gone ? L('Lived in', 'Vivía en') : L('Lives in', 'Vive en'), value: names.length > 10 ? L('{0} and {1} more', '{0} y {1} más', shown, names.length - 10) : shown, icon: '🌍' });
  }
  const links: { label: string; href?: string; onClick?: () => void }[] = [
    { label: a.gone ? L('Where it lived', 'Dónde vivía') : L('Show where it lives', 'Mostrar dónde vive'), onClick: () => x.showRange(a) },
  ];
  if (!a.gone && a.best.length) links.push({ label: L('Best places to see it', 'Mejores lugares para verlo'), onClick: () => x.bestPlaces(a) });
  links.push({ label: L('Its relatives', 'Sus parientes'), onClick: () => x.relatives(a) });
  if (a.story) links.push({ label: L('Open its story', 'Abrir su historia'), onClick: () => x.openStory(a.story!) });
  links.push({ label: 'Wikipedia', href: wikiOf(a.q) });
  const extra = h('div', { class: 'wild-card-extra' });
  const badge = statusBadge(a);
  if (badge) extra.append(h('p', { class: 'wild-status-row' }, h('span', { class: 'muted small' }, L('Red List: ', 'Lista Roja: ')), badge));
  const credit = creditEl(a.img ?? null);
  if (credit) extra.append(credit);
  if (a.snd) extra.append(soundEl(a));
  card(a.e, nm(a), a.sci, rows, links, [], a.img ? Promise.resolve(commons(a.img, 480)) : undefined, extra);
}

const KIND = { np: { icon: '🏞️', en: 'National park', es: 'Parque nacional' }, res: { icon: '🌿', en: 'Nature reserve', es: 'Reserva natural' }, zoo: { icon: '🦓', en: 'Zoo', es: 'Zoológico' }, aq: { icon: '🐠', en: 'Aquarium', es: 'Acuario' } } as const;
export const placeIcon = (k: keyof typeof KIND) => KIND[k].icon;

export function parkCard(card: CardFn, p: Park, d: WildData | null, x: WildLinks) {
  const k = KIND[p.k];
  const rows: InfoRow[] = [{ label: L('Kind', 'Tipo'), value: es() ? k.es : k.en, icon: k.icon }];
  if (p.cc) rows.push({ label: L('Country', 'País'), value: x.countryName(p.cc), icon: '📍' });
  if (p.km2) rows.push({ label: L('Area', 'Superficie'), value: `${fmtCompact(p.km2)} km²`, icon: '📐' });
  if (p.whs) rows.push({ label: L('World Heritage', 'Patrimonio Mundial'), value: L('Yes', 'Sí'), icon: '🏛️' });
  const extra = h('div', { class: 'wild-card-extra' });
  const famous = (d ? p.f.map((id) => d.byId.get(id)).filter((a): a is Animal => !!a) : []);
  if (famous.length) {
    const list = h('div', { class: 'wild-chips', 'data-park-animals': p.id });
    for (const a of famous) {
      const b = h('button', { type: 'button', class: 'chip', 'data-animal': a.id }, `${a.e} ${nm(a)}`);
      b.addEventListener('click', () => x.openAnimal(a));
      list.append(b);
    }
    extra.append(h('p', { class: 'muted small' }, L('One of the best places to see:', 'Uno de los mejores lugares para ver:')), list);
  }
  const credit = creditEl(p.img ?? null);
  if (credit) extra.append(credit);
  const links: { label: string; href?: string; onClick?: () => void }[] = [
    { label: L('Plan a trip', 'Planear un viaje'), onClick: () => x.planTrip(p.at, nm(p)) },
    planLink({ id: `park:${p.id}`, kind: 'park', n: p.n, at: p.at, url: wikiOf(p.id), ...(famous.length ? { why: [{ t: [famous.slice(0, 4).map((a) => a.n[0]).join(', '), famous.slice(0, 4).map((a) => a.n[1]).join(', ')] }] } : {}) }),
    { label: 'Wikipedia', href: wikiOf(p.id) },
  ];
  card(k.icon, nm(p), p.cc ? x.countryName(p.cc) : '', rows, links, [], p.img ? Promise.resolve(commons(p.img, 480)) : undefined, extra);
}

export function zooCard(card: CardFn, z: Zoo, x: WildLinks) {
  const k = KIND[z.k];
  const rows: InfoRow[] = [{ label: L('Kind', 'Tipo'), value: es() ? k.es : k.en, icon: k.icon }];
  if (z.cc) rows.push({ label: L('Country', 'País'), value: x.countryName(z.cc), icon: '📍' });
  const links: { label: string; href?: string; onClick?: () => void }[] = [
    { label: L('Plan a trip', 'Planear un viaje'), onClick: () => x.planTrip(z.at, nm(z)) },
    planLink({ id: `zoo:${z.id}`, kind: 'zoo', n: z.n, at: z.at, url: wikiOf(z.id) }),
    { label: 'Wikipedia', href: wikiOf(z.id) },
  ];
  const notes = [L('Which animals each zoo keeps isn’t shared as open data, so the card doesn’t list them.', 'Qué animales tiene cada zoológico no se comparte como datos abiertos, así que la ficha no los enumera.')];
  card(k.icon, nm(z), z.cc ? x.countryName(z.cc) : '', rows, links, notes, z.img ? Promise.resolve(commons(z.img, 480)) : undefined, creditEl(z.img ?? null));
}
