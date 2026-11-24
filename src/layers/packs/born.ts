// Who was born here? (v0.28.0): the birthplaces of about 35,000 well-known people, from Wikidata (public/data/born):
// the world's best known and everyone the app features first, each country's own after them, in the background.
// A dot is a place, coloured by its best-known person's field and bigger the more people were born there; a tap
// lists them. By field, by when they were born, and by birth or death.
// A person with a life in Lives on the map opens it; living people appear by birthplace only.
import { lang, fmtCompact, L, dataLang, lower } from '../../app/i18n';
import { h } from '../../ui/dom';
import { LC } from '../context';
import type { App } from '../../app/app';
import type { Shell } from '../../ui/shell';
import type { LayerDef, LayerHit, LayerInstance, LayerTapUi, RenderCtx } from '../types';
import { crowdOf, type Placed } from '../crowd';
import { loadBorn, loadBornAll, onBornMore, loadLives, personCard, FIELDS, fieldName, nm, years, what, type BornData, type BornPlace, type Person, type PersonLinks } from '../../lives/born';
import { creditEl } from '../../artguide/cards';
import { regionAt, regionType, regionName } from '../../engine/regions';

let APP: App | null = null;
let SHELL: Shell | null = null;
let data: BornData | null = null;

const PERIODS: [string, { en: string; es: string }, number, number][] = [
  ['all', { en: 'Any time', es: 'Cualquier época' }, -Infinity, Infinity],
  ['ancient', { en: 'Before 500', es: 'Antes de 500' }, -Infinity, 500],
  ['medieval', { en: '500–1500', es: '500–1500' }, 500, 1500],
  ['early', { en: '1500–1800', es: '1500–1800' }, 1500, 1800],
  ['1800s', { en: '1800–1900', es: '1800–1900' }, 1800, 1900],
  ['1900s', { en: '1900–1950', es: '1900–1950' }, 1900, 1950],
  ['now', { en: 'Since 1950', es: 'Desde 1950' }, 1950, Infinity],
];

/** What the cards link to: a city's guide (its People tab), a life, a city's name. */
export function personLinks(): PersonLinks {
  return {
    openCity: (city) => APP?.emit('open-guide', city, 'people'),
    openLife: (id) => { SHELL?.sheet.close(); SHELL?.card.hide(); APP?.emit('open-story', 'lives', id, 0); },
    cityName: (id) => window.atlas?.guide.cityLabel(id) ?? null,
    credit: creditEl,
  };
}

let memo: { key: string; places: Map<BornPlace, Person[]>; dots: [BornPlace, Person[]][] } | null = null;
/** The places on the map with the filter's options: each with its people, the best known first. */
function shown(inst: LayerInstance): Map<BornPlace, Person[]> {
  const field = String(inst.options.field ?? 'all'), per = PERIODS.find((p) => p[0] === inst.options.period) ?? PERIODS[0], died = inst.options.show === 'died';
  // (The second file's people join after the first's: a new version of the lists.)
  const key = `${field}|${per[0]}|${died}|${data?.version ?? 0}`;
  if (memo?.key === key) return memo.places;
  const places = new Map<BornPlace, Person[]>();
  for (const p of data?.people ?? []) {
    if (field !== 'all' && p.field !== field) continue;
    if (per[0] !== 'all' && (p.born < per[2] || p.born >= per[3])) continue;
    const pl = died ? p.diedAt : p.place;
    if (!pl) continue;
    (places.get(pl) ?? places.set(pl, []).get(pl)!).push(p);
  }
  memo = { key, places, dots: [...places] };
  return places;
}
/** Zoomed out, only the places of the very best known; more as the map comes closer. */
const least = (z: number) => (z < 1.8 ? 120 : z < 2.6 ? 95 : z < 3.6 ? 78 : z < 4.8 ? 64 : z < 6 ? 54 : 0);
const radius = (n: number, z: number) => Math.min(13, (2.6 + Math.sqrt(n) * 1.5) * Math.min(1.5, 0.85 + z * 0.07));
/** The zoom from which places that overlap move apart (layers/crowd.ts): a district and its city, a palace and its town. */
const APART = 9;
type Dot = [BornPlace, Person[]];
/** This frame's dots: the places shown at this zoom, each with its people. The place of the better-known person keeps its spot. */
function dots(rc: RenderCtx, inst: LayerInstance): Placed<Dot>[] {
  const min = least(rc.webZoom);
  shown(inst);
  return crowdOf<Dot>(inst, APART).place(rc, () => memo!.dots.filter((d) => d[1][0].sl >= min),
    (d) => d[0].at, (d) => radius(d[1].length, rc.webZoom), (d) => 1 + d[1][0].sl, memo!.key);
}

/** The people of a place, as a list; a tap opens each one's card. */
export function peopleList(people: Person[], onPick: (p: Person) => void, max = 60): HTMLElement {
  const list = h('div', { class: 'guide-list born-list' });
  for (const p of people.slice(0, max)) {
    const f = FIELDS[p.field] ?? FIELDS.other;
    const row = h('button', { type: 'button', class: 'guide-item', 'data-person': p.id },
      h('span', { class: 'guide-item-ic' }, f.icon),
      h('span', { class: 'guide-item-text' }, h('span', { class: 'guide-item-title' }, nm(p)), h('span', { class: 'guide-item-sub' }, `${years(p)} · ${what(p)}`)));
    row.addEventListener('click', () => onPick(p));
    list.append(row);
  }
  if (people.length > max) list.append(h('p', { class: 'muted small' }, L('…and {0} more.', '…y {0} más.', people.length - max)));
  return list;
}

export const bornHere: LayerDef = {
  id: 'born-here', category: 'culture', icon: '👶', kind: 'overlay', stackOrder: 4,
  name: { en: 'Who was born here?', es: '¿Quién nació aquí?' },
  desc: { en: 'Where 35,000 well-known people were born, the world’s best known and each country’s own: scientists, writers, artists, musicians, leaders and athletes. Tap a place for its people.', es: 'Dónde nacieron 35 000 personas conocidas, las más conocidas del mundo y las de cada país: científicos, escritores, artistas, músicos, líderes y deportistas. Toca un lugar para ver a su gente.' },
  keywords: 'born birthplace people famous who lives biography died nacio nacimiento personas famosos quien vidas biografia murio',
  credit: 'Wikidata (CC0)',
  options: [
    { id: 'field', label: { en: 'Field', es: 'Campo' }, type: 'select', default: 'all', choices: [{ value: 'all', label: { en: 'Everyone', es: 'Todos' } }, ...Object.entries(FIELDS).map(([value, f]) => ({ value, label: f.name, icon: f.icon }))] },
    { id: 'period', label: { en: 'Born', es: 'Nacidos', ctx: 'a filter: when people were born' }, type: 'select', default: 'all', choices: PERIODS.map(([value, label]) => ({ value, label })) },
    { id: 'show', label: { en: 'Show', es: 'Mostrar' }, type: 'select', default: 'born', choices: [{ value: 'born', label: { en: 'Where they were born', es: 'Dónde nacieron' } }, { value: 'died', label: { en: 'Where they died', es: 'Dónde murieron' } }] },
  ],
  async load() { data ??= await loadBorn(); void loadLives(); void loadBornAll(); },
  onOptionsChanged() { LC.requestRender(); },
  drawOverlay(rc, inst) {
    if (!data) return;
    const { ctx } = rc;
    const colour = (d: Dot) => (FIELDS[d[1][0].field] ?? FIELDS.other).color;
    const list = dots(rc, inst);
    crowdOf<Dot>(inst, APART).leaders(rc, colour);
    const alpha = ctx.globalAlpha;
    for (const p of list) {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = colour(p.it); ctx.globalAlpha = alpha * 0.88; ctx.fill();
      ctx.globalAlpha = alpha; ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    }
  },
  labels(rc, inst) {
    if (!data || rc.webZoom < 1.6) return;
    const crowd = crowdOf<Dot>(inst, APART);
    for (const p of dots(rc, inst)) {
      const [pl, people] = p.it;
      crowd.name(rc, p, { text: nm(people[0]), sub: people.length > 1 ? `${nm(pl)} +${people.length - 1}` : nm(pl), priority: 300 + Math.min(400, people[0].sl), size: 10.5, weight: 700, color: rc.theme.label, halo: rc.theme.labelHalo });
    }
  },
  legend(inst) {
    const places = shown(inst);
    const n = new Map<string, number>();
    let total = 0;
    for (const people of places.values()) for (const p of people) { n.set(p.field, (n.get(p.field) ?? 0) + 1); total++; }
    const died = inst.options.show === 'died';
    return {
      kind: 'categories', title: died ? L('Where {0} people died', 'Dónde murieron {0} personas', fmtCompact(total)) : L('Where {0} people were born', 'Dónde nacieron {0} personas', fmtCompact(total)),
      items: Object.keys(FIELDS).filter((f) => n.get(f)).map((f) => ({ color: FIELDS[f].color, label: `${FIELDS[f].icon} ${fieldName(f)} (${fmtCompact(n.get(f)!)})`, shape: 'dot' as const })),
      note: L('A dot is a place, in the colour of its best-known person; bigger, more people. Zoom in for more places, and tap one for its people. The world’s best known (articles in 48 Wikipedias or more), each country’s own (8 or more) and everyone the app features elsewhere.', 'Un punto es un lugar, del color de su persona más conocida; más grande, más personas. Acerca el mapa para ver más lugares, y toca uno para ver a su gente. Las más conocidas del mundo (con artículos en 48 Wikipedias o más), las de cada país (8 o más) y todas las que la app presenta en otras partes.'),
    };
  },
  tap(_lon, _lat, inst, ui: LayerTapUi) {
    if (!data) return false;
    const hit = crowdOf<Dot>(inst, APART).pick(ui);
    if (!hit) return false;
    openPlace(hit[0], hit[1], inst, ui);
    return true;
  },
  // The search box finds the people (Rafael Nadal, "rafa nadal", "nadl") and their places, and takes you to the dot.
  searchHint: { en: 'people born there', es: 'personas nacidas allí' },
  async searchLoad() { data ??= await loadBornAll(); },
  search(match, inst) {
    if (!data) return [];
    const died = inst.options.show === 'died';
    const out: LayerHit[] = [];
    for (const p of data.people) {
      const s = Math.max(match(p.name[0]), match(p.name[1]));
      if (s <= 0) continue;
      const pl = (died ? p.diedAt : p.place) ?? p.place;
      out.push({
        label: nm(p), sub: `${years(p)} · ${what(p)} · ${nm(pl)}`, icon: (FIELDS[p.field] ?? FIELDS.other).icon,
        lon: pl.at[0], lat: pl.at[1], score: s + Math.min(12, p.sl / 15), wz: 9, dot: pl,
        // Shown whatever the filter's options: back to everyone, at any time, where they were born if they have no death place.
        prepare: (i) => {
          const want: Record<string, string> = {};
          if (i.options.field !== 'all' && i.options.field !== p.field) want.field = 'all';
          const per = PERIODS.find((x) => x[0] === i.options.period);
          if (per && per[0] !== 'all' && (p.born < per[2] || p.born >= per[3])) want.period = 'all';
          if (i.options.show === 'died' && !p.diedAt) want.show = 'born';
          for (const [k, v] of Object.entries(want)) APP?.setOption(i.def.id, k, v);
        },
        open: (ui) => void personCard(ui.card, p, personLinks()),
      });
    }
    // Places by their name ("Manacor"): their people, as a tap on the dot shows them.
    const places = shown(inst);
    for (const [pl, people] of places) {
      const s = Math.max(match(pl.name[0]), match(pl.name[1]));
      if (s < 60) continue;
      out.push({
        label: nm(pl), sub: L('{0, plural, one {# well-known person} other {# well-known people}}: {1}', '{0, plural, one {# persona conocida} other {# personas conocidas}}: {1}', people.length, `${people.slice(0, 2).map(nm).join(', ')}${people.length > 2 ? '…' : ''}`),
        icon: '👶', lon: pl.at[0], lat: pl.at[1], score: s - 4 + Math.min(10, people.length), wz: 9, dot: pl,
        open: (ui) => openPlace(pl, people, inst, ui),
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 10);
  },
};

/** A place's people: one person's card, or the list of them. */
function openPlace(best: BornPlace, people: Person[], inst: LayerInstance, ui: LayerTapUi) {
    const x = personLinks();
    if (people.length === 1) { void personCard(ui.card, people[0], x); return; }
    const died = inst.options.show === 'died';
    const title = died ? L('Died in {0}', 'Murieron en {0}', nm(best)) : L('Born in {0}', 'Nacieron en {0}', nm(best));
    // Which state or province and country the place is in (when the states are shown, their shapes are loaded).
    const rg = regionAt(best.at[0], best.at[1]);
    const cid = APP?.renderer.countryAt(best.at[0], best.at[1]);
    const where = [rg ? `${regionName(rg)}${regionType(rg) ? ` (${lower(regionType(rg)!)})` : ''}` : null, cid ? APP!.data.name(cid, APP!.lang) : null].filter(Boolean).join(', ');
    const body = h('div', { class: 'guide born-panel', 'data-place': best.name[0] },
      where ? h('p', { class: 'born-where' }, `📍 ${where}`) : null,
      h('p', { class: 'muted small' }, L('{0} well-known people, the best known first. Tap one for their card.', '{0} personas conocidas, las más conocidas primero. Toca una para ver su ficha.', people.length)),
      peopleList(people, (p) => { SHELL?.sheet.close(); void personCard((...a) => SHELL!.card.showCustom(...a), p, x); }, 200));
    if (best.city) {
      const city = best.city;
      const b = h('button', { type: 'button', class: 'pill sm', 'data-born': 'guide' }, L('{0}: the guide', '{0}: la guía', x.cityName(city) ?? nm(best)));
      b.addEventListener('click', () => x.openCity?.(city));
      body.append(b);
    }
    // (After the tap is over: on a phone, a tap on a filter's marker closes the open panel.)
    setTimeout(() => SHELL?.openPanel('born-here', `👶 ${title}`, body), 0);
}

export default function register(app: App, shell: Shell) {
  APP = app; SHELL = shell;
  // Each country's own people, once they arrive: new dots, a new count in the legend.
  onBornMore((d) => { data = d; memo = null; LC.requestRender(); LC.notify?.(); });
  app.register([bornHere]);
}
