// Master the world (v0.34.0): the deck (public/data/master/deck.json), loaded once and shared by the game, the Your
// world filter, the Capitals quiz (its capital names) and the daily challenge's review question.
import { loadJSON } from '../data/store';
import type { DeckData, Country } from './decks';
import type { DeckId, Level } from './srs';
import { level } from './srs';
import { master } from './store';

let deck: DeckData | null = null;
let byId = new Map<string, Country>();
let pending: Promise<DeckData | null> | null = null;

export function loadDeck(): Promise<DeckData | null> {
  pending ??= loadJSON<DeckData>('master/deck.json').then((d) => {
    deck = d;
    byId = new Map(d.countries.map((c) => [c.id, c]));
    return d;
  }).catch(() => { pending = null; return null; });
  return pending;
}
export const deckNow = () => deck;
export const deckCountry = (id: string) => byId.get(id);

/** The capital's name from the deck (the official one for the countries with two seats), once it is loaded. */
export function deckCapital(id: string, lang: string): string | null {
  const c = byId.get(id);
  return c?.cap && c.skip !== 'capitals' ? (lang === 'es' ? c.cap.es : c.cap.en) : null;
}

/** How well a country is known in a deck; for all three decks, the least known of the three. */
export function levelOf(deckId: DeckId | 'all', id: string): Level {
  const cards = master().cards;
  if (deckId !== 'all') return level(cards[deckId][id]);
  const order: Level[] = ['new', 'learning', 'known', 'mastered'];
  const ls = (['capitals', 'flags', 'countries'] as DeckId[]).filter((d) => d !== 'capitals' || deckCapital(id, 'en')).map((d) => level(cards[d][id]));
  if (ls.every((l) => l === 'new')) return 'new';
  // Begun in one deck but not in another: still being learned.
  const least = ls.reduce((a, b) => (order.indexOf(b) < order.indexOf(a) ? b : a), 'mastered' as Level);
  return least === 'new' ? 'learning' : least;
}

export const LEVEL_COLORS: Record<Level, string> = { new: '', learning: '#e8833a', known: '#f2c94c', mastered: '#27ae60' };
