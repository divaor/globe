// "Your data": the panel that reads a table (a file, a drop, a paste or a sample), says what it found, and puts it
// on the map; and the list of tables kept on this device.
import { Upload, Trash2, MapPin } from 'lucide';
import { h, icon, fillSelect } from '../ui/dom';
import { lang } from '../app/i18n';
import { SEQUENTIAL } from '../engine/colors';
import { loadJSON, dataUrl } from '../data/store';
import type { App } from '../app/app';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { parseTable, planTable, buildData, countryIndex, regionIndex, type RegionMeta, type CountryMeta, type Built } from './parse';
import { PALETTES, layerId, describe, type MyData, type MySet } from './mydata';

const L = (en: string, es: string) => (lang() === 'es' ? es : en);

export const SAMPLES: { file: string; icon: string; name: { en: string; es: string } }[] = [
  { file: 'life-expectancy.csv', icon: '❤️', name: { en: 'Life expectancy, 1950–2023 (a row per country and year)', es: 'Esperanza de vida, 1950-2023 (una fila por país y año)' } },
  { file: 'latin-america-cities.csv', icon: '🏙️', name: { en: 'The biggest cities of Latin America (points)', es: 'Las ciudades más grandes de América Latina (puntos)' } },
  { file: 'mexico-world-heritage.csv', icon: '🏛️', name: { en: 'World Heritage sites in each Mexican state (regions)', es: 'Sitios del Patrimonio Mundial en cada estado de México (regiones)' } },
  { file: 'my-travels.csv', icon: '✈️', name: { en: 'An example of travels (categories)', es: 'Un ejemplo de viajes (categorías)' } },
];

let regionsLoading: Promise<RegionMeta[]> | null = null;
function regionList(): Promise<RegionMeta[]> {
  regionsLoading ??= loadJSON<Topology>('base/admin1.json').then((t) => (t.objects.admin1 as GeometryCollection).geometries.map((g) => g.properties as unknown as RegionMeta).filter((p) => p?.n));
  regionsLoading.catch(() => { regionsLoading = null; });
  return regionsLoading;
}

/** Reads a table's text into what the map needs (or a reason it cannot). */
export async function readTable(app: App, text: string): Promise<{ built: Built; header: string[] } | { error: string }> {
  const t = parseTable(text);
  if (!t.rows.length) return { error: L('This file has no rows.', 'Este archivo no tiene filas.') };
  const countries = countryIndex(app.data.meta as unknown as Record<string, CountryMeta>);
  let regions = null;
  try { regions = regionIndex(await regionList()); } catch { /* offline: countries and points still work */ }
  const p = planTable(t, countries, regions);
  if ('error' in p) {
    return { error: p.error === 'empty'
      ? L('This table needs at least two columns and one row.', 'La tabla necesita al menos dos columnas y una fila.')
      : L('No countries, regions or coordinates found. Use a column of country names (in English or Spanish) or ISO codes; region names with a column for their country; or columns called latitude and longitude.',
        'No encontré países, regiones ni coordenadas. Usa una columna con nombres de países (en español o inglés) o sus códigos ISO; nombres de regiones con una columna para su país; o columnas llamadas latitud y longitud.') };
  }
  const built = buildData(t, p, countries, regions);
  if (!built.matched) return { error: L('None of the places in this table were found on the map.', 'Ninguno de los lugares de esta tabla está en el mapa.') };
  if (!built.columns.length && built.geo !== 'points') return { error: L('This table has no column of numbers or categories to show.', 'Esta tabla no tiene una columna de números o categorías para mostrar.') };
  return { built, header: t.header };
}

/** The panel. `done` closes it and says what happened. */
export function myDataPanel(app: App, my: MyData, done: (msg: string) => void): HTMLElement {
  const root = h('div', { class: 'md' });
  const preview = h('div', { class: 'md-preview' });
  const listEl = h('div', { class: 'md-list' });

  const read = async (text: string, file: string, title?: string) => {
    preview.replaceChildren(h('p', { class: 'muted small' }, L('Reading…', 'Leyendo…')));
    const r = await readTable(app, text);
    if ('error' in r) { preview.replaceChildren(h('p', { class: 'md-error' }, `⚠️ ${r.error}`)); return; }
    showPreview(r.built, r.header, file, title);
  };

  // A file: picked, or dropped on the box.
  const input = h('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain', hidden: true }) as HTMLInputElement;
  const readFile = (f: File) => {
    if (f.size > 15e6) { preview.replaceChildren(h('p', { class: 'md-error' }, L('⚠️ This file is too big (more than 15 MB).', '⚠️ Este archivo es demasiado grande (más de 15 MB).'))); return; }
    void f.text().then((txt) => read(txt, f.name));
  };
  input.addEventListener('change', () => { const f = input.files?.[0]; if (f) readFile(f); input.value = ''; });
  const drop = h('label', { class: 'md-drop' }, icon(Upload, 22),
    h('span', null, h('strong', null, L('Choose a CSV file', 'Elige un archivo CSV')), h('span', { class: 'muted small' }, L(' or drop it here', ' o suéltalo aquí'))), input);
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer?.files?.[0]; if (f) readFile(f); });

  // A table pasted from a spreadsheet.
  const area = h('textarea', { class: 'md-paste', rows: '5', placeholder: L('Country, Value\nMexico, 12\nPeru, 7', 'País, Valor\nMéxico, 12\nPerú, 7') }) as HTMLTextAreaElement;
  const readPaste = h('button', { type: 'button', class: 'pill' }, L('Read the table', 'Leer la tabla'));
  readPaste.addEventListener('click', () => { if (area.value.trim()) void read(area.value, L('pasted table', 'tabla pegada')); });

  // Samples.
  const samples = h('div', { class: 'md-samples' }, ...SAMPLES.map((s) => {
    const b = h('button', { type: 'button', class: 'md-sample', 'data-sample': s.file }, h('span', null, s.icon), h('span', null, lang() === 'es' ? s.name.es : s.name.en));
    b.addEventListener('click', async () => {
      try { const res = await fetch(dataUrl(`samples/${s.file}`)); await read(await res.text(), s.file, (lang() === 'es' ? s.name.es : s.name.en).replace(/ \(.*\)$/, '')); } catch { preview.replaceChildren(h('p', { class: 'md-error' }, L('⚠️ Could not load the sample (offline?).', '⚠️ No se pudo cargar el ejemplo (¿sin conexión?).'))); }
    });
    return b;
  }));

  function showPreview(b: Built, header: string[], file: string, title?: string) {
    const name = h('input', { class: 'search-input md-name', type: 'text', value: (title ?? (b.columns.length === 1 && b.columns[0].name !== 'Value' ? b.columns[0].name : file.replace(/\.(csv|tsv|txt)$/i, ''))).slice(0, 80), 'aria-label': L('Name', 'Nombre') }) as HTMLInputElement;
    const lines: (HTMLElement | null)[] = [];
    const what = b.geo === 'points' ? L(`📍 ${b.matched} places with coordinates`, `📍 ${b.matched} lugares con coordenadas`)
      : b.geo === 'region' ? L(`🗾 ${b.matched} regions found`, `🗾 ${b.matched} regiones encontradas`)
      : L(`🌍 ${b.matched} countries found`, `🌍 ${b.matched} países encontrados`);
    lines.push(h('li', null, what, h('span', { class: 'muted' }, L(` in ${b.rows} rows`, ` en ${b.rows} filas`))));
    if (b.years.length) lines.push(h('li', null, L(`📅 Years ${b.years[0]}–${b.years[b.years.length - 1]} (${b.years.length}); the map shows ${b.years[b.years.length - 1]}, and the legend plays them`, `📅 Años ${b.years[0]}-${b.years[b.years.length - 1]} (${b.years.length}); el mapa muestra ${b.years[b.years.length - 1]} y la leyenda los reproduce`)));
    if (b.groups.length) lines.push(h('li', { class: 'muted' }, L(`➖ ${b.groups.length} totals set aside (${b.groups.slice(0, 4).join(', ')}${b.groups.length > 4 ? '…' : ''})`, `➖ ${b.groups.length} totales apartados (${b.groups.slice(0, 4).join(', ')}${b.groups.length > 4 ? '…' : ''})`)));
    if (b.parts.length) lines.push(h('li', { class: 'muted' }, L(`➖ Drawn as part of another country on this map: ${b.parts.join(', ')}`, `➖ En este mapa forman parte de otro país: ${b.parts.join(', ')}`)));
    if (b.unmatched.length) lines.push(h('li', { class: 'md-warn' }, L(`❓ Not found (${b.unmatched.length}): ${b.unmatched.slice(0, 12).join(', ')}${b.unmatched.length > 12 ? '…' : ''}. Try the name in English or Spanish, or the ISO code.`, `❓ No encontrados (${b.unmatched.length}): ${b.unmatched.slice(0, 12).join(', ')}${b.unmatched.length > 12 ? '…' : ''}. Prueba el nombre en español o inglés, o el código ISO.`)));
    const cols = b.columns;
    if (cols.length) lines.push(h('li', null, L('📊 ', '📊 '), cols.map((c) => `${c.name} (${c.kind === 'number' ? L('numbers', 'números') : L('categories', 'categorías')})`).join(' · ')));
    // Colours for numbers.
    let palette = 'viridis';
    const swatches = h('div', { class: 'md-palettes' }, ...PALETTES.map((p) => {
      const sw = h('button', { type: 'button', class: `md-pal${p === palette ? ' on' : ''}`, title: p, 'aria-label': p, style: `background: linear-gradient(90deg, ${SEQUENTIAL[p].join(', ')})` });
      sw.addEventListener('click', () => { palette = p; swatches.querySelectorAll('.md-pal').forEach((x) => x.classList.toggle('on', x === sw)); });
      return sw;
    }));
    const scale = h('select', { class: 'select', 'aria-label': L('Scale', 'Escala') }) as HTMLSelectElement;
    fillSelect(scale, [
      { value: 'auto', label: L('Automatic', 'Automática') }, { value: 'linear', label: L('Even steps', 'Pasos iguales') },
      { value: 'log', label: L('Logarithmic (for very uneven numbers)', 'Logarítmica (para números muy desiguales)') }, { value: 'quantile', label: L('By rank (equal shares of places)', 'Por posición (partes iguales de lugares)') },
    ]);
    const hasNumbers = cols.some((c) => c.kind === 'number');
    const add = h('button', { type: 'button', class: 'pill primary md-add' }, icon(MapPin, 16), L('Put it on the map', 'Ponerlo en el mapa'));
    add.addEventListener('click', async () => {
      const set: MySet = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.value.trim() || file, file, created: Date.now(),
        geo: b.geo, columns: b.columns, years: b.years, values: b.values, points: b.points, header, labels: b.labels,
        palette, scale: scale.value as MySet['scale'],
        stats: { rows: b.rows, matched: b.matched, unmatched: b.unmatched, groups: b.groups.length, parts: b.parts },
      };
      add.setAttribute('disabled', '');
      await my.add(set);
      done(L(`“${set.name}” is on the map`, `«${set.name}» está en el mapa`));
    });
    preview.replaceChildren(h('div', { class: 'md-card' },
      h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Name', 'Nombre')), name),
      h('ul', { class: 'md-found' }, ...lines),
      hasNumbers ? h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Colours', 'Colores')), swatches) : null,
      hasNumbers ? h('div', { class: 'field' }, h('div', { class: 'field-label' }, L('Scale', 'Escala')), scale) : null,
      h('div', { class: 'settings-actions' }, add)));
    preview.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const renderList = () => {
    listEl.replaceChildren();
    if (!my.sets.length) return;
    listEl.append(h('h3', { class: 'sec-title' }, L('On this device', 'En este dispositivo')));
    for (const s of [...my.sets].reverse()) {
      const on = app.isActive(layerId(s));
      const show = h('button', { type: 'button', class: `pill${on ? ' on' : ''}` }, on ? L('On the map', 'En el mapa') : L('Show', 'Mostrar'));
      show.addEventListener('click', () => { app.toggle(layerId(s)); renderList(); });
      const del = h('button', { type: 'button', class: 'icon-btn sm', title: L('Delete', 'Borrar'), 'aria-label': L('Delete', 'Borrar') }, icon(Trash2, 15));
      del.addEventListener('click', async () => {
        if (!confirm(L(`Delete “${s.name}” from this device?`, `¿Borrar «${s.name}» de este dispositivo?`))) return;
        await my.remove(s.id);
        renderList();
      });
      listEl.append(h('div', { class: 'md-set' }, h('div', { class: 'md-set-text' }, h('strong', null, s.name), h('span', { class: 'muted small' }, describe(s, lang()))), show, del));
    }
  };
  renderList();

  root.append(
    h('p', { class: 'muted small' }, L('A table of countries, regions (states, provinces…) or places with coordinates becomes a map with a legend. It stays on this device: nothing is uploaded.',
      'Una tabla de países, regiones (estados, provincias…) o lugares con coordenadas se vuelve un mapa con leyenda. Se queda en este dispositivo: no se sube nada.')),
    drop,
    h('details', { class: 'md-paste-box' }, h('summary', null, L('Paste a table from a spreadsheet', 'Pegar una tabla de una hoja de cálculo')), area, h('div', { class: 'settings-actions' }, readPaste)),
    h('h3', { class: 'sec-title' }, L('Try an example', 'Prueba un ejemplo')), samples,
    preview, listEl);
  return root;
}
