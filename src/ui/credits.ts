// The credits (v0.47.0): every source Mundora draws on, grouped (maps, nature, the Earth, space, history, words,
// pictures, what is read live, the code), each with what it gives the app in plain words, who made it, and its licence,
// in the app's language. The list is data/credits/credits.json; scripts/test/credits.mjs checks that every source the
// data and the code use is in it.
import { h } from './dom';
import { L } from '../app/i18n';
import { loadJSON } from '../data/store';
import type { App } from '../app/app';

interface Item { id: string; name: string; by?: string; what: Record<string, string>; licence: string; licenceUrl?: string; url: string }
interface Credits { app: { licence: string; url: string }; groups: { id: string; items: Item[] }[] }

const GROUPS: Record<string, () => string> = {
  maps: () => L('Maps and country facts', 'Mapas y datos de los países'),
  nature: () => L('Nature', 'Naturaleza'),
  earth: () => L('The Earth: inside, climate and deep time', 'La Tierra: por dentro, el clima y el tiempo profundo'),
  space: () => L('Space and the sky', 'El espacio y el cielo'),
  history: () => L('History', 'Historia'),
  words: () => L('Names, languages and people', 'Nombres, idiomas y población'),
  pictures: () => L('Pictures', 'Imágenes'),
  live: () => L('Read live while you use it', 'Se consulta en vivo mientras la usas'),
  code: () => L('The code and fonts it is built with', 'El código y las tipografías con que está hecha'),
};

/** Licences given in words (the others are names such as CC BY 4.0 or MIT, the same in every language). */
const LICENCES: Record<string, () => string> = {
  'Public domain': () => L('Public domain', 'Dominio público'),
  'Public domain and CC BY-SA 4.0': () => L('Public domain and CC BY-SA 4.0', 'Dominio público y CC BY-SA 4.0'),
  'CC0 and CC BY 4.0': () => L('CC0 and CC BY 4.0', 'CC0 y CC BY 4.0'),
  'Free to use': () => L('Free to use', 'De uso libre'),
  'Free to use with attribution': () => L('Free to use with attribution', 'De uso libre citando la fuente'),
  'Free to use with citation': () => L('Free to use with citation', 'De uso libre con cita'),
  'Cited as a source': () => L('Cited as a source', 'Citado como fuente'),
  'Each file’s own licence': () => L('Each file’s own licence', 'La licencia de cada archivo'),
  'Each photo’s own licence': () => L('Each photo’s own licence', 'La licencia de cada foto'),
};

let data: Promise<Credits> | null = null;

/** The credits, grouped, in the app's language; filled in once the list has loaded. */
export function creditsList(app: App): HTMLElement {
  const box = h('div', { class: 'cr', 'data-credits': '' }, h('p', { class: 'muted small' }, L('Loading…', 'Cargando…')));
  data ??= loadJSON<Credits>('credits/credits.json');
  data.then((c) => {
    const lang = app.lang;
    const sections = c.groups.map((g) => h('section', { class: 'cr-group', id: `cr-${g.id}`, 'data-credit-group': g.id },
      h('h4', { class: 'cr-title' }, GROUPS[g.id]?.() ?? g.id),
      ...g.items.map((it) => h('article', { class: 'cr-item', 'data-credit': it.id },
        h('div', { class: 'cr-head' },
          h('a', { class: 'cr-name', href: it.url, target: '_blank', rel: 'noopener' }, it.name),
          it.licenceUrl
            ? h('a', { class: 'cr-lic', href: it.licenceUrl, target: '_blank', rel: 'noopener' }, LICENCES[it.licence]?.() ?? it.licence)
            : h('span', { class: 'cr-lic' }, LICENCES[it.licence]?.() ?? it.licence)),
        h('p', { class: 'cr-what' }, it.what[lang] ?? it.what.en),
        it.by ? h('p', { class: 'cr-by' }, it.by) : null))));
    const nav = h('nav', { class: 'cr-nav', 'aria-label': L('Credit groups', 'Grupos de créditos') }, c.groups.map((g) => {
      const b = h('button', { type: 'button', class: 'chip' }, GROUPS[g.id]?.() ?? g.id);
      b.addEventListener('click', () => box.querySelector(`#cr-${g.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return b;
    }));
    const n = c.groups.reduce((s, g) => s + g.items.length, 0);
    box.replaceChildren(
      h('p', null, L('Mundora is made from the work of many people and organisations. Here are all {0} sources: what each gives the app, who made it, and its licence.', 'Mundora está hecha con el trabajo de muchas personas y organizaciones. Aquí están las {0} fuentes: qué le da cada una a la app, quién la hizo y su licencia.', n)),
      nav, ...sections);
  }).catch(() => {
    data = null;
    box.replaceChildren(h('p', { class: 'muted small' }, L('The credits could not load. Try again with a connection.', 'No se pudieron cargar los créditos. Vuelve a intentarlo con conexión.')));
  });
  return box;
}
