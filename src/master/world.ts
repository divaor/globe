// Your world (v0.34.0): a filter that paints what you know from Master the world. Each country in the colour of how
// well you know it in a deck (or the least known of the three): still learning, known, mastered; the ones not yet
// met in grey, so what you know stands out. The legend counts them.
import type { LayerDef, LayerInstance, Legend } from '../layers/types';
import type { App } from '../app/app';
import { DECKS, type CountryDeck, type Level } from './srs';
import { loadDeck, deckNow, deckCountry, levelOf, LEVEL_COLORS } from './data';
import { inScope } from './decks';
import { master } from './store';

export const WORLD_ID = 'master-world';
const NEW_DARK = '#4a5262', NEW_LIGHT = '#c9ced6';
const DECK_NAMES: Record<CountryDeck | 'all', { en: string; es: string }> = {
  all: { en: 'All three', es: 'Los tres' },
  capitals: { en: 'Capitals', es: 'Capitales' },
  flags: { en: 'Flags', es: 'Banderas' },
  countries: { en: 'Countries', es: 'Países' },
};
const LEVEL_NAMES: Record<Exclude<Level, 'new'>, { en: string; es: string }> = {
  learning: { en: 'Learning', es: 'Aprendiendo' },
  known: { en: 'Known', es: 'Conocido' },
  mastered: { en: 'Mastered (right on 3 days)', es: 'Dominado (bien en 3 días)' },
};

export function yourWorldLayer(): LayerDef {
  const deckOf = (inst: LayerInstance) => String(inst.options.deck ?? 'all') as CountryDeck | 'all';
  return {
    id: WORLD_ID, category: 'fun', icon: '🎓', kind: 'fill', defaultOpacity: 1,
    name: { en: 'Your world', es: 'Tu mundo' },
    desc: { en: 'What you know, from Master the world: each country by how well you know its capital, its flag or where it is.', es: 'Lo que sabes, según Domina el mundo: cada país según lo bien que conoces su capital, su bandera o dónde está.' },
    keywords: 'master learn know progress capitals flags countries dominar aprender saber progreso capitales banderas paises',
    options: [{ id: 'deck', type: 'select', label: { en: 'Deck', es: 'Mazo' }, default: 'all', choices: (['all', ...DECKS] as (CountryDeck | 'all')[]).map((d) => ({ value: d, label: DECK_NAMES[d] })) }],
    async load() { await loadDeck(); },
    countryColor(id, inst, rc) {
      const l = levelOf(deckOf(inst), id);
      if (l !== 'new') return LEVEL_COLORS[l];
      // Not met yet (in the deck): grey; what is not in it (a territory with that setting off) keeps the map's colours.
      const c = deckCountry(id);
      if (!c || (c.t && !master().settings.territories)) return null;
      return rc?.theme?.dark === false ? NEW_LIGHT : NEW_DARK;
    },
    legend(inst, lang): Legend {
      const d = deckOf(inst);
      const data = deckNow();
      const st = master().settings;
      const ids = data ? inScope(data, d === 'all' ? 'flags' : d, 'world', st.territories).map((c) => c.id) : [];
      const by: Record<Level, string[]> = { new: [], learning: [], known: [], mastered: [] };
      for (const id of ids) by[levelOf(d, id)].push(id);
      const tx = (x: { en: string; es: string }) => (lang === 'es' ? x.es : x.en);
      return {
        kind: 'categories', title: `${tx({ en: 'Your world', es: 'Tu mundo' })} · ${tx(DECK_NAMES[d])}`,
        items: [...(['mastered', 'known', 'learning'] as const).map((l) => ({ color: LEVEL_COLORS[l], label: `${tx(LEVEL_NAMES[l])}: ${by[l].length}`, ids: by[l] })),
          { color: NEW_DARK, label: `${tx({ en: 'Still to meet', es: 'Por conocer' })}: ${by.new.length}`, ids: by.new }],
        note: lang === 'es' ? `De ${ids.length} países` : `Of ${ids.length} countries`,
      };
    },
    info(id, inst, lang) {
      const l = levelOf(deckOf(inst), id);
      const tx = (x: { en: string; es: string }) => (lang === 'es' ? x.es : x.en);
      return [{ label: tx({ en: 'Your world', es: 'Tu mundo' }), value: l === 'new' ? tx({ en: 'Not met yet', es: 'Aún sin ver' }) : tx(LEVEL_NAMES[l]) }];
    },
  };
}

/** Repaints Your world after an answer (its baked map is keyed by its options, so a change of `rev` repaints it). */
export function refreshYourWorld(app: App) {
  const inst = app.layers.find((l) => l.def.id === WORLD_ID);
  if (!inst) return;
  inst.options.rev = String(Date.now());
  app.emit('layers');
  app.renderer.requestRender();
}
