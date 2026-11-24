// Who was born here? (v0.28.0): the best-known people of Wikidata and where they were born (public/data/born,
// built by scripts/data/born/build-born.mjs). The map filter, the travel guide's People tab and a person's card
// use it. A person with a life in Lives on the map opens it; everyone else gets a short card and their Wikipedia
// article. Living people appear by birthplace only.
// Two files: people.json, the world's best known and everyone the app features, comes first; more.json,
// each country's own best known, follows in the background and joins the same lists (onBornMore says when).
import { loadJSON } from '../data/store';
import { lang, L, tx, nm as nameIn } from '../app/i18n';
import type { InfoRow } from '../layers/types';
import { outside } from '../data/outside';

export type CardFn = (icon: string, title: string, sub: string, rows: InfoRow[], links?: { label: string; href?: string; onClick?: () => void }[], notes?: string[], image?: Promise<string | null>, extra?: HTMLElement | null) => void;

export interface BornPlace { i: number; name: [string, string]; at: [number, number]; city: string | null }
export interface Person { id: string; name: [string, string]; born: number; died: number | null; place: BornPlace; field: string; sl: number; diedAt: BornPlace | null;
  /** What they were, in a few words ("Brazilian footballer"), from Wikidata; empty when it says nothing. */
  what: [string, string] }
export interface BornData {
  fields: string[]; people: Person[]; places: BornPlace[];
  /** The people born in each place, and in each travel-guide city, the best known first. */
  byPlace: Map<number, Person[]>; byCity: Map<string, Person[]>; byId: Map<string, Person>;
  /** Goes up each time people join the lists (the second file): for anything worked out from them. */
  version: number;
  /** The second file's people have joined. */
  complete: boolean;
}

/** The fields, as the filter and the cards name them. */
export const FIELDS: Record<string, { icon: string; color: string; name: { en: string; es: string } }> = {
  leaders: { icon: '👑', color: '#e03131', name: { en: 'Leaders and public life', es: 'Líderes y vida pública' } },
  science: { icon: '🔬', color: '#339af0', name: { en: 'Science and learning', es: 'Ciencia y saber' } },
  letters: { icon: '✍️', color: '#f08c00', name: { en: 'Writers', es: 'Escritores' } },
  arts: { icon: '🎨', color: '#e64980', name: { en: 'Art and architecture', es: 'Arte y arquitectura' } },
  music: { icon: '🎵', color: '#7950f2', name: { en: 'Music', es: 'Música' } },
  screen: { icon: '🎬', color: '#f76707', name: { en: 'Film and stage', es: 'Cine y teatro' } },
  sport: { icon: '🏅', color: '#0ca678', name: { en: 'Sport', es: 'Deporte' } },
  thought: { icon: '💭', color: '#5c7cfa', name: { en: 'Thought and religion', es: 'Pensamiento y religión' } },
  explore: { icon: '🧭', color: '#1098ad', name: { en: 'Explorers', es: 'Exploradores' } },
  other: { icon: '👤', color: '#868e96', name: { en: 'Others', es: 'Otros' } },
};
export const fieldName = (f: string) => (FIELDS[f] ? tx(FIELDS[f].name) : f);
export const nm = (x: { name: [string, string] }) => (nameIn(x.name[0], x.name[1]));
/** "Brazilian footballer" ("futbolista brasileño"), or the field when Wikidata says nothing. */
export const what = (p: Person) => { const w = nameIn(p.what[0], p.what[1]); return w ? w.charAt(0).toUpperCase() + w.slice(1) : fieldName(p.field); };

/** A file as built: people.json or more.json (each with places and guide cities of its own). */
interface BornFile { fields: string[]; cities: string[]; places: [string, string | 0, number, number, number][]; people: [string, string, string | 0, number, number | null, number, number, number, number, string | 0, string | 0][] }

/** Adds a file's people to the lists: its places join those already there with the same name and point. */
function join(born: BornData, d: BornFile) {
  const key = (name: string, at: [number, number]) => `${name}@${at[0]},${at[1]}`;
  const known = new Map(born.places.map((p) => [key(p.name[0], p.at), p]));
  const places = d.places.map((r) => {
    const at: [number, number] = [r[2], r[3]];
    let pl = known.get(key(r[0], at));
    if (!pl) { pl = { i: born.places.length, name: [r[0], r[1] || r[0]], at, city: r[4] >= 0 ? d.cities[r[4]] : null }; born.places.push(pl); known.set(key(r[0], at), pl); }
    return pl;
  });
  const fresh: Person[] = d.people.filter((r) => !born.byId.has(r[0])).map((r) => ({ id: r[0], name: [r[1], r[2] || r[1]], born: r[3], died: r[4], place: places[r[5]], field: d.fields[r[6]], sl: r[7], diedAt: r[8] >= 0 ? places[r[8]] : null, what: [r[9] || '', r[10] || r[9] || ''] }));
  // The best known first (a stable sort: the first file's order holds among equals).
  born.people = born.people.length ? [...born.people, ...fresh].sort((a, b) => b.sl - a.sl) : fresh;
  born.byPlace.clear(); born.byCity.clear();
  for (const p of born.people) {
    (born.byPlace.get(p.place.i) ?? born.byPlace.set(p.place.i, []).get(p.place.i)!).push(p);
    if (p.place.city) (born.byCity.get(p.place.city) ?? born.byCity.set(p.place.city, []).get(p.place.city)!).push(p);
    born.byId.set(p.id, p);
  }
  born.version++;
}

let data: Promise<BornData | null> | null = null;
let all: Promise<BornData | null> | null = null;
const joined = new Set<(d: BornData) => void>();
/** The first file: the world's best known and everyone the app features. The second follows in the background. */
export function loadBorn(): Promise<BornData | null> {
  data ??= loadJSON<BornFile>('born/people.json').then((d) => {
    const born: BornData = { fields: d.fields, people: [], places: [], byPlace: new Map(), byCity: new Map(), byId: new Map(), version: 0, complete: false };
    join(born, d);
    setTimeout(() => void loadBornAll(), 0);
    return born;
  }).catch(() => { data = null; return null; });
  return data;
}
/** Everyone: the first file, then the second (each country's own best known) joined to the same lists. */
export function loadBornAll(): Promise<BornData | null> {
  all ??= loadBorn().then(async (born) => {
    if (!born) { all = null; return null; }
    if (born.complete) return born;
    try {
      join(born, await loadJSON<BornFile>('born/more.json'));
      born.complete = true;
      for (const f of joined) f(born);
    } catch { all = null; /* asked again next time; the first file's people stay */ }
    return born;
  });
  return all;
}
/** Called once the second file's people have joined the lists. */
export function onBornMore(f: (d: BornData) => void) { joined.add(f); }

/** "1756–1791", "born 1985", "c. 470–399 BC". */
export function years(p: Person): string {
  const y = (n: number) => (n < 0 ? `${-n}` : String(n));
  const bc = (n: number) => (n < 0 ? L(' BC', ' a. C.') : '');
  if (p.died == null) return L('born {0}{1}', 'n. {0}{1}', y(p.born), bc(p.born));
  return p.born < 0 && p.died < 0 ? `${y(p.born)}–${y(p.died)}${bc(p.died)}` : `${y(p.born)}${bc(p.born)}–${y(p.died)}${bc(p.died)}`;
}

/** The lives written for Lives on the map, by Wikidata id (from the collection's list). */
let lives: Promise<Map<string, { id: string; name: { en: string; es: string } }>> | null = null;
export function loadLives() {
  lives ??= loadJSON<{ stories: { id: string; name: { en: string; es: string }; life?: { qid: string } }[] }>('lives/index.json')
    .then((d) => new Map(d.stories.filter((s) => s.life?.qid).map((s) => [s.life!.qid, { id: s.id, name: s.name }])))
    .catch(() => { lives = null; return new Map(); });
  return lives;
}

export const wikiOf = (qid: string) => `https://www.wikidata.org/wiki/Special:GoToLinkedPage/${lang()}wiki/${qid}`;
const pictures = new Map<string, Promise<string | null>>();
/** A person's portrait: the picture Wikidata gives (P18), from Wikimedia Commons, asked live. */
export function portrait(qid: string, width = 480): Promise<string | null> {
  if (!pictures.has(qid)) {
    pictures.set(qid, outside(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&origin=*&property=P18&entity=${qid}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { claims?: { P18?: { mainsnak?: { datavalue?: { value?: string } } }[] } } | null) => j?.claims?.P18?.[0]?.mainsnak?.datavalue?.value ?? null)
      .catch(() => null));
  }
  return pictures.get(qid)!.then((file) => (file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/ /g, '_'))}?width=${width}` : null));
}
/** The Commons file behind a portrait (for its credit line), once asked. */
export const portraitFile = (qid: string): Promise<string | null> => pictures.get(qid) ?? Promise.resolve(null);

export interface PersonLinks {
  /** Opens a city's travel guide. */
  openCity: ((city: string) => void) | null;
  /** Opens a life of Lives on the map. */
  openLife: (id: string) => void;
  cityName: (id: string) => string | null;
  /** A line under the picture with its licence and author. */
  credit?: (file: string | null) => HTMLElement | null;
}

/** A person's card: who, when, where born and (if they have died) where they died, their life or Wikipedia. */
export async function personCard(card: CardFn, p: Person, x: PersonLinks) {
  const f = FIELDS[p.field] ?? FIELDS.other;
  const life = (await loadLives()).get(p.id);
  const by = (n: number) => (n < 0 ? L('{0} BC', '{0} a. C.', -n) : String(n));
  const rows: InfoRow[] = [{ label: L('Born', 'Nació'), value: `${by(p.born)} · ${nm(p.place)}`, icon: '👶' }];
  if (p.died != null) rows.push({ label: L('Died', 'Murió'), value: p.diedAt ? `${by(p.died)} · ${nm(p.diedAt)}` : by(p.died), icon: '🕯️' });
  rows.push({ label: L('Field', 'Campo'), value: fieldName(p.field), icon: f.icon });
  const links: { label: string; href?: string; onClick?: () => void }[] = [];
  if (life) links.push({ label: L('Follow their life', 'Seguir su vida'), onClick: () => x.openLife(life.id) });
  links.push({ label: 'Wikipedia', href: wikiOf(p.id) });
  if (x.openCity && p.place.city) links.push({ label: L('{0}: the guide', '{0}: la guía', x.cityName(p.place.city) ?? nm(p.place)), onClick: () => x.openCity!(p.place.city!) });
  const img = portrait(p.id);
  const extra = x.credit ? document.createElement('div') : null;
  if (extra && x.credit) void img.then(() => portraitFile(p.id)).then((file) => { const el = x.credit!(file); if (el) extra.append(el); });
  card(f.icon, nm(p), `${years(p)} · ${what(p)}`, rows, links, [], img, extra);
}
