// The trip to take anywhere (v0.31.2): its details (all optional, kept on this device), and the plan written out as
// Markdown with a request for an AI assistant (copied, or downloaded as .md), or as JSON for other apps. Nothing is
// sent anywhere by the app: the reader copies, downloads or shares it. The share link carries the places, packed.
import { ClipboardCopy, Download, FileJson } from 'lucide';
import { h, icon } from '../ui/dom';
import { lang, L, nm as nameIn, tx } from '../app/i18n';
import { tripDetails, setTripDetails, PLACE_ICONS, type Place, type PlaceKind, type TripDetails } from './plan';
import { appLocale } from '../app/i18n';


export interface TripOut {
  cities: { id: string; name: string; country: string; at: [number, number]; wiki?: string; places: Place[]; km?: number }[];
  link: string;
  places: Record<string, Place[]>;
}

const KIND_NAMES: Record<PlaceKind, { en: string; es: string }> = {
  whs: { en: 'World Heritage site', es: 'Sitio del Patrimonio Mundial' }, sight: { en: 'Sight', es: 'Lugar' }, museum: { en: 'Museum', es: 'Museo' }, building: { en: 'Building', es: 'Edificio' },
  park: { en: 'Park or reserve', es: 'Parque o reserva' }, zoo: { en: 'Zoo or aquarium', es: 'Zoológico o acuario' }, garden: { en: 'Botanical garden', es: 'Jardín botánico' },
  tree: { en: 'Famous tree', es: 'Árbol famoso' }, dish: { en: 'Dish to try', es: 'Plato para probar' }, spectacle: { en: 'Nature spectacle', es: 'Espectáculo natural' },
};
const PACES: [TripDetails['pace'], { en: string; es: string }][] = [['', { en: '—', es: '—' }], ['relaxed', { en: 'Relaxed', es: 'Tranquilo' }], ['normal', { en: 'Normal', es: 'Normal' }], ['packed', { en: 'Packed', es: 'Intenso' }]];
const BUDGETS: [TripDetails['budget'], { en: string; es: string }][] = [['', { en: '—', es: '—' }], ['low', { en: 'Low', es: 'Bajo' }], ['mid', { en: 'Mid-range', es: 'Medio' }], ['high', { en: 'High', es: 'Alto' }]];

// ---- The plan, written out ---------------------------------------------------------------------------------------

const nm = (p: Place) => (nameIn(p.n[0], p.n[1]));
const why = (p: Place) => (p.why ?? []).map((w) => (nameIn(w.t[0], w.t[1])));
const fix = (x: number) => x.toFixed(4).replace(/\.?0+$/, '');

/** The whole plan, in Markdown, ending with what to ask an assistant. */
export function tripMarkdown(t: TripOut, d: TripDetails = tripDetails()): string {
  const out: string[] = [];
  const route = t.cities.map((c) => c.name).join(' → ');
  out.push(`# ${L('My trip', 'Mi viaje')}: ${route}`, '');
  out.push(L('Planned with Atlas Globe\'s travel guide ({0}) on {1}.', 'Planeado con la guía de viaje de Atlas Globe ({0}) el {1}.', t.link, new Date().toISOString().slice(0, 10)), '');
  const det: string[] = [];
  if (d.start || d.end) det.push(`- ${L('Dates', 'Fechas')}: ${[d.start, d.end].filter(Boolean).join(L(' to ', ' al '))}`);
  if (d.from) det.push(`- ${L('Starting from', 'Saliendo de')}: ${d.from}`);
  if (d.passport) det.push(`- ${L('Passport', 'Pasaporte')}: ${d.passport}`);
  const pace = PACES.find((p) => p[0] === d.pace && p[0]), budget = BUDGETS.find((b) => b[0] === d.budget && b[0]);
  if (pace) det.push(`- ${L('Pace', 'Ritmo')}: ${tx(pace[1])}`);
  if (budget) det.push(`- ${L('Budget', 'Presupuesto')}: ${tx(budget[1])}`);
  if (d.interests) det.push(`- ${L('Interests', 'Intereses')}: ${d.interests}`);
  if (d.note) det.push(`- ${L('Note', 'Nota')}: ${d.note}`);
  if (det.length) out.push(`## ${L('Trip details', 'Datos del viaje')}`, ...det, '');
  t.cities.forEach((c, i) => {
    const days = d.days?.[c.id];
    out.push(`## ${i + 1}. ${c.name}, ${c.country}${days ? ` (${days} ${days === 1 ? L('day', 'día') : L('days', 'días')})` : ''}`);
    if (c.km) out.push(L('From {0}: about {1} km in a straight line.', 'Desde {0}: unos {1} km en línea recta.', t.cities[i - 1].name, c.km.toLocaleString(appLocale())));
    out.push(`${L('Where', 'Dónde')}: ${fix(c.at[1])}, ${fix(c.at[0])}${c.wiki ? ` · ${c.wiki}` : ''}`);
    if (c.places.length) {
      out.push('', `${L('Places I want to see', 'Lugares que quiero ver')}:`);
      for (const p of c.places) {
        const ws = why(p);
        const at = p.at ? ` (${fix(p.at[1])}, ${fix(p.at[0])})` : '';
        out.push(`- ${PLACE_ICONS[p.kind]} **${nm(p)}** · ${tx(KIND_NAMES[p.kind])}${at}${ws.length ? `: ${ws.join('; ')}` : ''}${p.url ? ` · ${p.url}` : ''}`);
      }
    } else out.push('', L('No places chosen yet: suggest the essentials.', 'Aún no elegí lugares: sugiere lo esencial.'));
    out.push('');
  });
  out.push(`## ${L('What I would like from you', 'Lo que te pido')}`, '');
  out.push(L('Please help me turn this plan into a complete trip, with real, current information:', 'Ayúdame a convertir este plan en un viaje completo, con información real y actual:'));
  const asks = [
    L('A day-by-day itinerary, in the order of the cities (change it if another works better), with each day\'s places grouped by how close they are.', 'Un itinerario día por día, en el orden de las ciudades (ajústalo si conviene otro), con los lugares de cada día agrupados por cercanía.'),
    L('How to get from each city to the next (train, flight, bus or car): how long, how often, a rough price and where to book.', 'Cómo ir de una ciudad a la siguiente (tren, avión, autobús o auto): duración, frecuencia, precio aproximado y dónde reservar.'),
    L('Entry and visa rules for my passport, and the documents I need.', 'Requisitos de entrada y visado para mi pasaporte, y los documentos que necesito.'),
    L('The days and hours each place is open, which need tickets booked ahead, and how long to give each one.', 'Días y horarios de apertura de cada lugar, cuáles requieren reservar entradas con anticipación y cuánto tiempo dedicar a cada uno.'),
    L('Where to stay in each city (which areas) and how to get around in it.', 'Dónde alojarse en cada ciudad (barrios) y cómo moverse dentro de ella.'),
    L('A rough budget, the weather, festivals or closures on my dates, and safety and health advice.', 'Un presupuesto aproximado, el clima, fiestas o cierres en mis fechas, y consejos de seguridad y salud.'),
    L('Say clearly what you are not sure of, and point me to the official sites to check it.', 'Di claramente de qué no estás seguro, y dame los sitios oficiales donde comprobarlo.'),
  ];
  out.push(...asks.map((a, i) => `${i + 1}. ${a}`), '');
  return out.join('\n');
}

/** The plan as JSON, for other apps. */
export function tripJson(t: TripOut, d: TripDetails = tripDetails()): string {
  return JSON.stringify({
    app: 'Atlas Globe', kind: 'trip', made: new Date().toISOString(), link: t.link, details: d,
    cities: t.cities.map((c) => ({ id: c.id, name: c.name, country: c.country, at: c.at, days: d.days?.[c.id] ?? null, kmFromPrevious: c.km ?? null, wiki: c.wiki ?? null,
      places: c.places.map((p) => ({ id: p.id, kind: p.kind, name: nm(p), at: p.at ?? null, why: why(p), url: p.url ?? null })) })),
  }, null, 2);
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name }) as HTMLAnchorElement;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const fileName = (t: TripOut, ext: string) => `${L('trip', 'viaje')}-${t.cities.map((c) => c.id).slice(0, 4).join('-')}.${ext}`;

// ---- The trip panel's part: details and export ----------------------------------------------------------------------

/** The trip's details (folded until opened) and the buttons that write the plan out. */
export function tripPanelExtras(t: TripOut, toast: (msg: string) => void): HTMLElement {
  const d: TripDetails = { ...tripDetails() };
  const save = () => setTripDetails(d);
  const field = (label: string, el: HTMLElement) => h('label', { class: 'trip-field' }, h('span', { class: 'trip-field-label' }, label), el);
  const input = (key: 'start' | 'end' | 'from' | 'passport' | 'interests', type: string, ph = '') => {
    const i = h('input', { type, class: 'trip-input', value: d[key] ?? '', placeholder: ph, 'data-trip-detail': key }) as HTMLInputElement;
    i.addEventListener('change', () => { d[key] = i.value.trim() || undefined; save(); });
    return i;
  };
  const select = <K extends 'pace' | 'budget'>(key: K, list: [TripDetails[K], { en: string; es: string }][]) => {
    const s = h('select', { class: 'trip-input', 'data-trip-detail': key }, ...list.map(([v, label]) => h('option', { value: v ?? '', selected: (d[key] ?? '') === v }, tx(label)))) as HTMLSelectElement;
    s.addEventListener('change', () => { d[key] = (s.value || undefined) as TripDetails[K]; save(); });
    return s;
  };
  const note = h('textarea', { class: 'trip-input', rows: '2', 'data-trip-detail': 'note', placeholder: L('Anything else: who is coming, what to avoid…', 'Algo más: quién viaja, qué evitar…') }, d.note ?? '') as HTMLTextAreaElement;
  note.addEventListener('change', () => { d.note = note.value.trim() || undefined; save(); });
  const days = h('div', { class: 'trip-days' }, ...t.cities.map((c) => {
    const i = h('input', { type: 'number', min: '0', max: '60', class: 'trip-input trip-day', value: d.days?.[c.id] ? String(d.days[c.id]) : '', 'aria-label': L('Days in {0}', 'Días en {0}', c.name), 'data-trip-days': c.id }) as HTMLInputElement;
    i.addEventListener('change', () => { const n = Math.round(Number(i.value)); d.days = { ...(d.days ?? {}) }; if (n > 0) d.days[c.id] = n; else delete d.days[c.id]; save(); });
    return h('label', { class: 'trip-day-row' }, h('span', null, c.name), i);
  }));
  const filled = !!(d.start || d.end || d.from || d.passport || d.pace || d.budget || d.interests || d.note || Object.keys(d.days ?? {}).length);
  const details = h('details', { class: 'trip-details', 'data-guide': 'details', open: filled ? '' : null },
    h('summary', null, L('Trip details (optional)', 'Datos del viaje (opcional)')),
    h('p', { class: 'muted small' }, L('They go into the plan you copy or download, for an assistant to plan around them. Kept on this device.', 'Van en el plan que copias o descargas, para que un asistente planee con ellos. Se guardan en este dispositivo.')),
    h('div', { class: 'trip-grid' },
      field(L('From', 'Desde'), input('start', 'date')), field(L('To', 'Hasta'), input('end', 'date')),
      field(L('Starting from', 'Saliendo de'), input('from', 'text', L('Your city', 'Tu ciudad'))), field(L('Passport', 'Pasaporte'), input('passport', 'text', L('Country', 'País'))),
      field(L('Pace', 'Ritmo'), select('pace', PACES)), field(L('Budget', 'Presupuesto'), select('budget', BUDGETS))),
    field(L('Interests', 'Intereses'), input('interests', 'text', L('Art, food, hiking…', 'Arte, comida, caminatas…'))),
    h('div', { class: 'trip-field' }, h('span', { class: 'trip-field-label' }, L('Days in each city', 'Días en cada ciudad')), days),
    field(L('Note', 'Nota'), note));
  const act = (ic: Parameters<typeof icon>[0], label: string, attr: string, fn: () => void, primary = false) => {
    const b = h('button', { type: 'button', class: `pill sm${primary ? ' primary' : ''}`, 'data-export': attr }, icon(ic, 15), label);
    b.addEventListener('click', fn);
    return b;
  };
  const copy = async () => {
    const md = tripMarkdown(t);
    try { await navigator.clipboard.writeText(md); toast(L('The plan is copied: paste it into the assistant you use.', 'El plan está copiado: pégalo en el asistente que uses.')); }
    catch { download(fileName(t, 'md'), md, 'text/markdown'); }
  };
  return h('div', { class: 'trip-export' }, details,
    h('h3', { class: 'sec-title' }, L('Take the plan anywhere', 'Lleva el plan a donde quieras')),
    h('p', { class: 'muted small' }, L('Your cities and places with what you chose them for, ready for an AI assistant to add travel, visas, opening hours, tickets and the rest. Nothing is sent anywhere: you copy or download it.', 'Tus ciudades y lugares con el porqué de cada uno, listos para que un asistente de IA agregue traslados, visados, horarios, entradas y lo demás. No se envía nada: tú lo copias o lo descargas.')),
    h('div', { class: 'tool-actions' },
      act(ClipboardCopy, L('Copy for an AI assistant', 'Copiar para un asistente de IA'), 'copy', () => void copy(), true),
      act(Download, L('Download (.md)', 'Descargar (.md)'), 'md', () => download(fileName(t, 'md'), tripMarkdown(t), 'text/markdown')),
      act(FileJson, L('Download (.json)', 'Descargar (.json)'), 'json', () => download(fileName(t, 'json'), tripJson(t), 'application/json'))));
}

// ---- The share link's places -----------------------------------------------------------------------------------------

type Packed = [string, PlaceKind, string, string, string, number | null, number | null, [string, string, string?][], string | null, 1 | 0];
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function squeeze(bytes: Uint8Array, how: 'compress' | 'decompress'): Promise<Uint8Array | null> {
  const CS = (globalThis as unknown as { CompressionStream?: new (f: string) => GenericTransformStream; DecompressionStream?: new (f: string) => GenericTransformStream });
  const T = how === 'compress' ? CS.CompressionStream : CS.DecompressionStream;
  if (!T) return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new T('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch { return null; }
}

/** The places, packed for the share link ("z…" deflated, "j…" plain where the browser cannot deflate). */
export async function packPlaces(places: Place[]): Promise<string> {
  const rows: Packed[] = places.map((p) => [p.id, p.kind, p.city, p.n[0], p.n[1], p.at ? +fix(p.at[0]) : null, p.at ? +fix(p.at[1]) : null,
    (p.why ?? []).map((w) => (w.k ? [w.t[0], w.t[1], w.k] : [w.t[0], w.t[1]]) as [string, string, string?]), p.url ?? null, p.self ? 1 : 0]);
  const raw = new TextEncoder().encode(JSON.stringify(rows));
  const z = await squeeze(raw, 'compress');
  return z ? `z${b64u(z)}` : `j${b64u(raw)}`;
}
/** The places from a share link, or null if it cannot be read. */
export async function unpackPlaces(s: string): Promise<Place[] | null> {
  try {
    const bytes = unb64u(s.slice(1));
    const raw = s[0] === 'z' ? await squeeze(bytes, 'decompress') : bytes;
    if (!raw) return null;
    const rows = JSON.parse(new TextDecoder().decode(raw)) as Packed[];
    if (!Array.isArray(rows)) return null;
    return rows.slice(0, 400).filter((r) => Array.isArray(r) && typeof r[0] === 'string' && r[1] in PLACE_ICONS && typeof r[2] === 'string').map((r) => ({
      id: r[0], kind: r[1], city: r[2], n: [String(r[3]), String(r[4])],
      ...(typeof r[5] === 'number' && typeof r[6] === 'number' ? { at: [r[5], r[6]] as [number, number] } : {}),
      ...(Array.isArray(r[7]) && r[7].length ? { why: r[7].map((w) => ({ t: [String(w[0]), String(w[1])] as [string, string], ...(w[2] ? { k: String(w[2]) } : {}) })) } : {}),
      ...(typeof r[8] === 'string' && /^https:\/\//.test(r[8]) ? { url: r[8] } : {}),
      ...(r[9] ? { self: true } : {}),
    }));
  } catch { return null; }
}
