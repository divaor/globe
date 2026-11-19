// Your progress: right answers, quizzes played and day streaks for each subject, the daily challenge's streak,
// finished tours, and the badges they earn. Kept only in this browser.
import { h } from '../ui/dom';
import { lang } from '../app/i18n';
import { TOURS } from './tours';
import { GAMES } from '../play/logic';
import { appLocale } from '../app/i18n';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
const KEY = 'atlas-globe:progress';

export type Subject = 'geo' | 'history' | 'culture' | 'languages' | 'science' | 'sport';
/** The subjects and their quizzes (the daily challenge counts each question for its own quiz's subject). */
export const SUBJECTS: Record<Subject, { icon: string; en: string; es: string; quizzes: string[] }> = {
  geo: { icon: '🗺️', en: 'Geography', es: 'Geografía', quizzes: ['find', 'flag', 'capital', 'region', 'hop', 'where', 'link'] },
  history: { icon: '🏛️', en: 'History', es: 'Historia', quizzes: ['when', 'order', 'detective', 'era', 'civ', 'journey'] },
  culture: { icon: '🎨', en: 'Arts and culture', es: 'Arte y cultura', quizzes: ['dish', 'faith', 'listen', 'opening', 'artist', 'site', 'museum'] },
  languages: { icon: '🗣️', en: 'Languages', es: 'Lenguas', quizzes: ['script', 'family'] },
  science: { icon: '🔬', en: 'Science and nature', es: 'Ciencia y naturaleza', quizzes: ['period', 'plague', 'disaster', 'inventor', 'world', 'landed', 'constellation', 'element', 'habitat', 'lives', 'grows', 'season'] },
  sport: { icon: '🏅', en: 'Sport', es: 'Deporte', quizzes: ['champion'] },
};
export const subjectOf = (kind: string): Subject | null => (Object.keys(SUBJECTS) as Subject[]).find((s) => SUBJECTS[s].quizzes.includes(kind)) ?? null;

interface Streak { last: string; streak: number; best: number }
export interface Progress {
  right: Partial<Record<Subject, number>>;
  played: Partial<Record<Subject, number>>;
  perfect: Partial<Record<Subject, number>>;
  /** The quizzes played at least once. */
  kinds: string[];
  days: Partial<Record<Subject, Streak>>;
  daily: Streak & { results: Record<string, { s: number; n: number; m: string }> };
  /** Tours seen to their last stop (by English name). */
  tours: string[];
  /** Badges earned, with the day. */
  badges: Record<string, string>;
  /** Map games (v0.24.0): routes finished, three-star routes, the best score of each goal, the knowledge rounds
   * finished, perfect least-people routes, routes across three continents, and the daily route. */
  play: {
    rounds: number; perfect: number; light: number; continents3: number;
    best: Record<string, number>; knowledge: string[];
    daily: Streak & { results: Record<string, { score: number; stars: number }> };
    /** v0.25.0: times each map game was played, today's puzzles played (by day, by game), and feats done once. */
    games: Record<string, number>;
    dailies: Record<string, Record<string, { score: number; stars: number }>>;
    feats: string[];
    /** v0.29.0: the most stars each map game has given. */
    stars: Record<string, number>;
  };
  /** v0.29.0: things seen around the app (masterpieces opened, lives followed to the end) and done once (a trip across
   * three continents). */
  seen: { works: string[]; lives: string[]; animals: string[]; plants: string[] };
  feats: string[];
  /** v0.34.0 Master the world: the best run of days the daily goal was reached, and countries relearned after they
   * were forgotten (the rest of its badges are feats: a continent's capitals, every capital, the look-alike flags...). */
  master?: { days: number; comebacks: number };
}

const emptyPlay = (): Progress['play'] => ({ rounds: 0, perfect: 0, light: 0, continents3: 0, best: {}, knowledge: [], daily: { last: '', streak: 0, best: 0, results: {} }, games: {}, dailies: {}, feats: [], stars: {} });
const empty = (): Progress => ({ right: {}, played: {}, perfect: {}, kinds: [], days: {}, daily: { last: '', streak: 0, best: 0, results: {} }, tours: [], badges: {}, play: emptyPlay(), seen: { works: [], lives: [], animals: [], plants: [] }, feats: [] });
let cache: Progress | null = null;
export function progress(): Progress {
  if (cache) return cache;
  try { cache = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { cache = empty(); }
  cache!.play = { ...emptyPlay(), ...cache!.play };
  cache!.seen = { works: cache!.seen?.works ?? [], lives: cache!.seen?.lives ?? [], animals: cache!.seen?.animals ?? [], plants: cache!.seen?.plants ?? [] };
  cache!.feats ??= [];
  return cache!;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(progress())); } catch { /* private mode: kept for this visit */ } }

/** The local date as 2026-11-13. */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const yesterday = (d = new Date()) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
/** A streak still counts if its last day is today or yesterday. */
export const current = (s?: Streak) => (s && (s.last === dayKey() || s.last === yesterday()) ? s.streak : 0);
function bump(s: Streak | undefined): Streak {
  const today = dayKey();
  if (s?.last === today) return s;
  const streak = s?.last === yesterday() ? s.streak + 1 : 1;
  return { last: today, streak, best: Math.max(s?.best ?? 0, streak) };
}

export interface Badge { id: string; icon: string; en: string; es: string; how: { en: string; es: string }; goal: number; have: (p: Progress) => number; subject?: Subject }

const CITY_TOURS = TOURS.filter((x) => x.group === 'cities').map((x) => x.en);
/** Border hop's knowledge rounds (play/route.ts RULES). */
const KNOWLEDGE_ROUNDS = 8;
export const BADGES: Badge[] = [
  ...(Object.keys(SUBJECTS) as Subject[]).flatMap((s): Badge[] => {
    const S = SUBJECTS[s];
    return [
      { id: `${s}-1`, subject: s, icon: '🥉', en: `${S.en}: bronze`, es: `${S.es}: bronce`, how: { en: '25 right answers', es: '25 respuestas correctas' }, goal: 25, have: (p) => p.right[s] ?? 0 },
      { id: `${s}-2`, subject: s, icon: '🥈', en: `${S.en}: silver`, es: `${S.es}: plata`, how: { en: '100 right answers', es: '100 respuestas correctas' }, goal: 100, have: (p) => p.right[s] ?? 0 },
      { id: `${s}-3`, subject: s, icon: '🥇', en: `${S.en}: gold`, es: `${S.es}: oro`, how: { en: '300 right answers', es: '300 respuestas correctas' }, goal: 300, have: (p) => p.right[s] ?? 0 },
      { id: `${s}-perfect`, subject: s, icon: '⭐', en: `${S.en}: a perfect score`, es: `${S.es}: puntuación perfecta`, how: { en: 'Every answer right in one of its quizzes', es: 'Todas las respuestas bien en uno de sus concursos' }, goal: 1, have: (p) => p.perfect[s] ?? 0 },
      ...(S.quizzes.length > 1 ? [{ id: `${s}-all`, subject: s, icon: '🧭', en: `${S.en}: every quiz`, es: `${S.es}: todos los concursos`, how: { en: `Play its ${S.quizzes.length} quizzes`, es: `Juega sus ${S.quizzes.length} concursos` }, goal: S.quizzes.length, have: (p: Progress) => S.quizzes.filter((k) => p.kinds.includes(k)).length }] : []),
      { id: `${s}-week`, subject: s, icon: '🔥', en: `${S.en}: a week in a row`, es: `${S.es}: una semana seguida`, how: { en: 'Play one of its quizzes 7 days in a row', es: 'Juega uno de sus concursos 7 días seguidos' }, goal: 7, have: (p) => p.days[s]?.best ?? 0 },
    ];
  }),
  { id: 'daily-1', icon: '🗓️', en: 'First daily challenge', es: 'Primer reto del día', how: { en: 'Play a daily challenge', es: 'Juega un reto del día' }, goal: 1, have: (p) => Object.keys(p.daily.results).length },
  { id: 'daily-3', icon: '🔥', en: 'Three days in a row', es: 'Tres días seguidos', how: { en: 'Play the daily challenge 3 days in a row', es: 'Juega el reto del día 3 días seguidos' }, goal: 3, have: (p) => p.daily.best },
  { id: 'daily-7', icon: '🔥', en: 'A week in a row', es: 'Una semana seguida', how: { en: 'Play the daily challenge 7 days in a row', es: 'Juega el reto del día 7 días seguidos' }, goal: 7, have: (p) => p.daily.best },
  { id: 'daily-30', icon: '🏆', en: 'A month in a row', es: 'Un mes seguido', how: { en: 'Play the daily challenge 30 days in a row', es: 'Juega el reto del día 30 días seguidos' }, goal: 30, have: (p) => p.daily.best },
  { id: 'daily-perfect', icon: '💯', en: 'A perfect day', es: 'Un día perfecto', how: { en: 'Every answer of a daily challenge right', es: 'Todas las respuestas de un reto del día bien' }, goal: 1, have: (p) => Object.values(p.daily.results).filter((r) => r.s === r.n).length },
  { id: 'tours-5', icon: '🧭', en: 'Five tours', es: 'Cinco visitas', how: { en: 'Follow 5 guided tours to their last stop', es: 'Sigue 5 visitas guiadas hasta su última parada' }, goal: 5, have: (p) => p.tours.length },
  { id: 'tours-cities', icon: '🏙️', en: 'Every city', es: 'Todas las ciudades', how: { en: `Follow all ${CITY_TOURS.length} city tours to the end`, es: `Sigue las ${CITY_TOURS.length} visitas de ciudades hasta el final` }, goal: CITY_TOURS.length, have: (p) => CITY_TOURS.filter((x) => p.tours.includes(x)).length },
  { id: 'play-1', icon: '🧭', en: 'First route', es: 'Primera ruta', how: { en: 'Finish a Border hop route', es: 'Termina una ruta de Salto de fronteras' }, goal: 1, have: (p) => p.play.rounds },
  { id: 'play-pathfinder', icon: '⭐', en: 'Pathfinder', es: 'Explorador', how: { en: '10 three-star routes', es: '10 rutas de tres estrellas' }, goal: 10, have: (p) => p.play.perfect },
  { id: 'play-light', icon: '🪶', en: 'Light traveller', es: 'Viajero ligero', how: { en: 'A perfect fewest-people route', es: 'Una ruta perfecta de menos gente' }, goal: 1, have: (p) => p.play.light },
  { id: 'play-3cont', icon: '🌐', en: 'Three continents', es: 'Tres continentes', how: { en: 'One route across three continents', es: 'Una ruta por tres continentes' }, goal: 1, have: (p) => p.play.continents3 },
  { id: 'play-knowledge', icon: '🎓', en: 'Know the map', es: 'Conoces el mapa', how: { en: 'Finish every knowledge round', es: 'Termina todas las rondas de conocimiento' }, goal: KNOWLEDGE_ROUNDS, have: (p) => p.play.knowledge.length },
  { id: 'play-sharp', icon: '🎯', en: 'Sharpshooter', es: 'Puntería', how: { en: 'A Pin it pin within 25 km', es: 'Un pin de Pon el pin a menos de 25 km' }, goal: 1, have: (p) => Number(p.play.feats.includes('pin-25km')) },
  { id: 'play-hilo', icon: '📈', en: 'Ten in a row', es: 'Diez seguidas', how: { en: '10 right in a row in Higher or lower', es: '10 aciertos seguidos en Más o menos' }, goal: 1, have: (p) => Number(p.play.feats.includes('hilo-10')) },
  { id: 'play-tour', icon: '🧳', en: 'Perfect tour', es: 'Viaje perfecto', how: { en: 'A Grand tour in the best order', es: 'Una gran vuelta en el mejor orden' }, goal: 1, have: (p) => Number(p.play.feats.includes('tour-par')) },
  { id: 'play-names', icon: '📝', en: 'Name them all', es: 'Todos nombrados', how: { en: 'Every country of a continent, named', es: 'Todos los países de un continente, nombrados' }, goal: 1, have: (p) => Number(p.play.feats.includes('names-all')) },
  { id: 'play-chain', icon: '⛓️', en: 'Long chain', es: 'Cadena larga', how: { en: 'A Border chain of 15 countries', es: 'Una cadena de fronteras de 15 países' }, goal: 1, have: (p) => Number(p.play.feats.includes('chain-15')) },
  { id: 'play-outline', icon: '🖼️', en: 'Sharp eye', es: 'Buen ojo', how: { en: 'Five outlines, each at the first try', es: 'Cinco siluetas, cada una al primer intento' }, goal: 1, have: (p) => Number(p.play.feats.includes('outline-5')) },
  { id: 'play-every', icon: '🗺️', en: 'Every map game', es: 'Todos los juegos', how: { en: `Play all ${GAMES.length} map games`, es: `Juega los ${GAMES.length} juegos en el mapa` }, goal: GAMES.length, have: (p) => GAMES.filter((g) => p.play.games[g] || (g === 'hop' && p.play.rounds > 0)).length }, // (routes finished before v0.25.0 count for Border hop)
  // v0.29.0: the games with the guide, the journeys, the sun and the lives.
  { id: 'play-museum', icon: '🏛️', en: 'Art lover', es: 'Amante del arte', how: { en: 'A Museum hop in the best order', es: 'Un De museo en museo en el mejor orden' }, goal: 1, have: (p) => Number(p.play.feats.includes('museum-par')) },
  { id: 'play-climate', icon: '🌡️', en: 'Weather wise', es: 'Experto en clima', how: { en: 'Four climate zones right in one Climate detective', es: 'Cuatro zonas climáticas acertadas en un Detective del clima' }, goal: 1, have: (p) => Number(p.play.feats.includes('climate-zones')) },
  { id: 'play-explorer', icon: '🧭', en: 'Navigator', es: 'Navegante', how: { en: 'Every stop of an Explorer’s log within 500 km', es: 'Todas las paradas de una Bitácora a menos de 500 km' }, goal: 1, have: (p) => Number(p.play.feats.includes('explorer-500')) },
  { id: 'play-sunrise', icon: '🌅', en: 'Dawn chaser', es: 'Cazador del alba', how: { en: 'The sunrise within 100 km', es: 'El amanecer a menos de 100 km' }, goal: 1, have: (p) => Number(p.play.feats.includes('sunrise-100')) },
  { id: 'play-lives', icon: '👤', en: 'Know them by their places', es: 'Por sus lugares los conocerás', how: { en: 'A life guessed from its first place', es: 'Una vida adivinada con su primer lugar' }, goal: 1, have: (p) => Number(p.play.feats.includes('life-first')) },
  { id: 'play-cartographer', icon: '🏅', en: 'Cartographer', es: 'Cartógrafo', how: { en: 'Three stars in every map game', es: 'Tres estrellas en todos los juegos en el mapa' }, goal: GAMES.length, have: (p) => GAMES.filter((g) => (p.play.stars[g] ?? 0) >= 3 || (g === 'hop' && p.play.perfect > 0)).length },
  // Around the app.
  { id: 'app-trip', icon: '🧳', en: 'Three-continent trip', es: 'Viaje por tres continentes', how: { en: 'A travel guide trip across three continents', es: 'Un viaje de la guía por tres continentes' }, goal: 1, have: (p) => Number(p.feats.includes('trip-3cont')) },
  { id: 'app-curator', icon: '🖼️', en: 'Curator', es: 'Curador', how: { en: 'Open 50 masterpieces', es: 'Abre 50 obras maestras' }, goal: 50, have: (p) => p.seen.works.length },
  { id: 'app-biographer', icon: '📖', en: 'Biographer', es: 'Biógrafo', how: { en: 'Follow 10 lives to their last step', es: 'Sigue 10 vidas hasta su último paso' }, goal: 10, have: (p) => p.seen.lives.length },
  // v0.30.0: animals found (an animal's card opened, from the map, the finder or a park).
  { id: 'app-naturalist', icon: '🔭', en: 'Naturalist', es: 'Naturalista', how: { en: 'Find 25 animals', es: 'Encuentra 25 animales' }, goal: 25, have: (p) => p.seen.animals.length },
  // v0.31.0: plants found (a plant's card opened, from the map, the finder, a garden or a famous tree).
  { id: 'app-botanist', icon: '🌿', en: 'Botanist', es: 'Botánico', how: { en: 'Find 25 plants', es: 'Encuentra 25 plantas' }, goal: 25, have: (p) => p.seen.plants?.length ?? 0 },
  // v0.33.0: a dive below 6,000 m (Into the deep).
  { id: 'app-diver', icon: '🤿', en: 'Diver', es: 'Buzo', how: { en: 'Dive below 6,000 m', es: 'Bucea a más de 6 000 m' }, goal: 1, have: (p) => Number(p.feats.includes('dive-6000')) },
  // v0.34.0 Master the world.
  ...(['EU', 'AS', 'AF', 'NA', 'SA', 'OC'] as const).map((ct): Badge => {
    const n = { EU: ['Europe', 'Europa'], AS: ['Asia', 'Asia'], AF: ['Africa', 'África'], NA: ['North and Central America', 'Norte y Centroamérica'], SA: ['South America', 'Sudamérica'], OC: ['Oceania', 'Oceanía'] }[ct];
    return { id: `master-cap-${ct}`, icon: '🏛️', en: `Capitals of ${n[0]}`, es: `Capitales de ${n[1]}`, how: { en: `Master every capital of ${n[0]}`, es: `Domina todas las capitales de ${n[1]}` }, goal: 1, have: (p) => Number(p.feats.includes(`master-cap-${ct}`)) };
  }),
  { id: 'master-cap-all', icon: '👑', en: 'Every capital', es: 'Todas las capitales', how: { en: 'Master every capital of the world', es: 'Domina todas las capitales del mundo' }, goal: 1, have: (p) => Number(p.feats.includes('master-cap-all')) },
  // v0.38.1 Master the world's State capitals: each country's, then all twelve.
  ...([
    ['MEX', '🇲🇽', "Mexico's states", 'los estados de México'], ['USA', '🇺🇸', 'the US states', 'los estados de Estados Unidos'],
    ['BRA', '🇧🇷', "Brazil's states", 'los estados de Brasil'], ['ARG', '🇦🇷', "Argentina's provinces", 'las provincias de Argentina'],
    ['COL', '🇨🇴', "Colombia's departments", 'los departamentos de Colombia'], ['CHL', '🇨🇱', "Chile's regions", 'las regiones de Chile'],
    ['PER', '🇵🇪', "Peru's regions", 'las regiones del Perú'], ['ESP', '🇪🇸', "Spain's communities", 'las comunidades de España'],
    ['CAN', '🇨🇦', "Canada's provinces and territories", 'las provincias y territorios de Canadá'], ['AUS', '🇦🇺', "Australia's states and territories", 'los estados y territorios de Australia'],
    ['DEU', '🇩🇪', "Germany's states", 'los estados de Alemania'], ['IND', '🇮🇳', "India's states and territories", 'los estados y territorios de la India'],
  ] as const).map(([a3, icon, en, es]): Badge => ({ id: `master-states-${a3}`, icon, en: `Capitals of ${en}`, es: `Capitales de ${es}`, how: { en: `Master every capital of ${en}`, es: `Domina todas las capitales de ${es}` }, goal: 1, have: (p) => Number(p.feats.includes(`master-states-${a3}`)) })),
  { id: 'master-states-all', icon: '🎓', en: 'Every state capital', es: 'Todas las capitales de estados', how: { en: 'Master the state capitals of all twelve countries', es: 'Domina las capitales de los estados de los doce países' }, goal: 1, have: (p) => Number(p.feats.includes('master-states-all')) },
  // v0.39.0: each new deck mastered.
  { id: 'master-outlines-all', icon: '🖼️', en: 'Every outline', es: 'Todas las siluetas', how: { en: 'Master every country by its outline', es: 'Domina cada país por su silueta' }, goal: 1, have: (p) => Number(p.feats.includes('master-outlines-all')) },
  { id: 'master-cities-all', icon: '🏙️', en: 'Every big city', es: 'Todas las grandes ciudades', how: { en: 'Master all 250 big cities on the map', es: 'Domina las 250 grandes ciudades en el mapa' }, goal: 1, have: (p) => Number(p.feats.includes('master-cities-all')) },
  { id: 'master-landmarks-all', icon: '🏰', en: 'Every landmark', es: 'Todas las maravillas', how: { en: 'Master all 300 landmarks', es: 'Domina las 300 maravillas' }, goal: 1, have: (p) => Number(p.feats.includes('master-landmarks-all')) },
  { id: 'master-nature-all', icon: '🏞️', en: 'Rivers, mountains and seas', es: 'Ríos, montañas y mares', how: { en: 'Master every river, mountain and sea of the deck', es: 'Domina cada río, montaña y mar del mazo' }, goal: 1, have: (p) => Number(p.feats.includes('master-nature-all')) },
  { id: 'master-flags', icon: '🏳️', en: 'Flag spotter', es: 'Ojo para las banderas', how: { en: 'Tell every look-alike flag apart', es: 'Distingue todas las banderas parecidas' }, goal: 1, have: (p) => Number(p.feats.includes('master-flags')) },
  { id: 'master-neighbours', icon: '🤝', en: 'Good neighbour', es: 'Buen vecino', how: { en: 'Master every country among its neighbours', es: 'Domina todos los países entre sus vecinos' }, goal: 1, have: (p) => Number(p.feats.includes('master-neighbours')) },
  { id: 'master-marathon', icon: '🏃', en: 'Marathon', es: 'Maratón', how: { en: 'The whole world in a marathon, without a mistake', es: 'El mundo entero en un maratón, sin un error' }, goal: 1, have: (p) => Number(p.feats.includes('master-marathon')) },
  { id: 'master-7', icon: '🔥', en: 'A week of learning', es: 'Una semana aprendiendo', how: { en: 'Reach the daily goal 7 days in a row', es: 'Cumple la meta diaria 7 días seguidos' }, goal: 7, have: (p) => p.master?.days ?? 0 },
  { id: 'master-30', icon: '📚', en: 'A month of learning', es: 'Un mes aprendiendo', how: { en: 'Reach the daily goal 30 days in a row', es: 'Cumple la meta diaria 30 días seguidos' }, goal: 30, have: (p) => p.master?.days ?? 0 },
  // v0.35.0 Fill the map.
  { id: 'fill-continent', icon: '🖍️', en: 'Continent filled', es: 'Continente coloreado', how: { en: 'Fill a whole continent in Fill the map', es: 'Colorea un continente entero en Llena el mapa' }, goal: 1, have: (p) => Number(p.feats.includes('fill-continent')) },
  { id: 'fill-perfect', icon: '🌟', en: 'Perfect continent', es: 'Continente perfecto', how: { en: 'Fill a continent with every country right at the first try', es: 'Colorea un continente acertando cada país a la primera' }, goal: 1, have: (p) => Number(p.feats.includes('fill-perfect')) },
  { id: 'fill-world', icon: '🌍', en: 'The world filled', es: 'El mundo coloreado', how: { en: 'Fill the whole world in one category of Fill the map', es: 'Colorea el mundo entero en una categoría de Llena el mapa' }, goal: 1, have: (p) => Number(p.feats.includes('fill-world')) },
  { id: 'fill-every', icon: '🗺️', en: 'Every map', es: 'Todos los mapas', how: { en: 'Fill the whole world in every category of Fill the map', es: 'Colorea el mundo entero en cada categoría de Llena el mapa' }, goal: 1, have: (p) => Number(p.feats.includes('fill-every')) },
  // Fill the states (v0.38.0).
  { id: 'states-country', icon: '🧩', en: 'A country filled', es: 'Un país coloreado', how: { en: 'Fill every state or province of a country in Fill the states', es: 'Colorea cada estado o provincia de un país en Llena los estados' }, goal: 1, have: (p) => Number(p.feats.includes('states-country')) },
  { id: 'states-capitals', icon: '🏛️', en: 'State capitals', es: 'Capitales de estados', how: { en: 'Fill a country by its states\' capitals', es: 'Colorea un país por las capitales de sus estados' }, goal: 1, have: (p) => Number(p.feats.includes('states-capitals')) },
  { id: 'states-perfect', icon: '💯', en: 'Perfect country', es: 'País perfecto', how: { en: 'Fill a country with every state right at the first try', es: 'Colorea un país acertando cada estado a la primera' }, goal: 1, have: (p) => Number(p.feats.includes('states-perfect')) },
  { id: 'states-twelve', icon: '🌎', en: 'Twelve countries', es: 'Doce países', how: { en: 'Fill all twelve countries by their states\' capitals', es: 'Colorea los doce países por las capitales de sus estados' }, goal: 1, have: (p) => Number(p.feats.includes('states-twelve')) },
  { id: 'onmap-solve', icon: '📍', en: 'On the map', es: 'En el mapa', how: { en: 'Solve a Put it on the map puzzle', es: 'Resuelve un reto de Ponlo en el mapa' }, goal: 1, have: (p) => Number(p.feats.includes('onmap-solve')) },
  { id: 'onmap-first', icon: '🎯', en: 'At the first check', es: 'A la primera', how: { en: 'Put all six on the map at the first check', es: 'Coloca los seis en el mapa a la primera' }, goal: 1, have: (p) => Number(p.feats.includes('onmap-first')) },
  { id: 'onmap-week', icon: '🗓️', en: 'A week on the map', es: 'Una semana en el mapa', how: { en: 'Solve seven puzzles of the day in Put it on the map', es: 'Resuelve siete retos del día en Ponlo en el mapa' }, goal: 1, have: (p) => Number(p.feats.includes('onmap-week')) },
  { id: 'master-comeback', icon: '🔄', en: 'Comeback', es: 'Remontada', how: { en: 'Relearn 20 countries you had forgotten', es: 'Vuelve a aprender 20 países que habías olvidado' }, goal: 20, have: (p) => p.master?.comebacks ?? 0 },
  { id: 'play-daily-7', icon: '🔥', en: 'A week of routes', es: 'Una semana de rutas', how: { en: 'The daily route 7 days in a row', es: 'La ruta del día 7 días seguidos' }, goal: 7, have: (p) => p.play.daily.best },
  { id: 'tours-all', icon: '🌍', en: 'Globetrotter', es: 'Trotamundos', how: { en: `Follow all ${TOURS.length} tours to the end`, es: `Sigue las ${TOURS.length} visitas hasta el final` }, goal: TOURS.length, have: (p) => p.tours.length },
];

/** Marks the badges just reached as earned and returns them. */
function award(): Badge[] {
  const p = progress();
  const now: Badge[] = [];
  for (const b of BADGES) if (!p.badges[b.id] && b.have(p) >= b.goal) { p.badges[b.id] = dayKey(); now.push(b); }
  save();
  return now;
}

/** A question answered in a quiz of `kind`. */
export function recordAnswer(kind: string, ok: boolean): Badge[] {
  const s = subjectOf(kind);
  if (!s || !ok) return [];
  const p = progress();
  p.right[s] = (p.right[s] ?? 0) + 1;
  return award();
}

/** A quiz played to its result. */
export function recordQuiz(kind: string, score: number, n: number): Badge[] {
  const s = subjectOf(kind);
  const p = progress();
  if (!p.kinds.includes(kind)) p.kinds.push(kind);
  if (s) {
    p.played[s] = (p.played[s] ?? 0) + 1;
    if (n >= 5 && score === n) p.perfect[s] = (p.perfect[s] ?? 0) + 1;
    p.days[s] = bump(p.days[s]);
  }
  return award();
}

/** The daily challenge keeps the day streak of each subject its questions touch (not a quiz played). */
export function recordDailySubjects(kinds: string[]): Badge[] {
  const p = progress();
  for (const s of new Set(kinds.map(subjectOf))) if (s) p.days[s] = bump(p.days[s]);
  return award();
}

/** Today's daily challenge, played: its score and marks ("yyny..."). Only the first play of a day counts. */
export function recordDaily(score: number, n: number, marks: string): Badge[] {
  const p = progress();
  const today = dayKey();
  if (p.daily.results[today]) return [];
  p.daily.results[today] = { s: score, n, m: marks };
  const { last, streak, best } = bump(p.daily);
  Object.assign(p.daily, { last, streak, best });
  return award();
}
export const dailyResult = (day = dayKey()) => progress().daily.results[day];

export function recordTour(name: string): Badge[] {
  const p = progress();
  if (p.tours.includes(name)) return [];
  p.tours.push(name);
  return award();
}

/** A Border hop route finished (not given up): its goal, score, stars, knowledge round, continents, and the day if it was the daily route. */
export function recordHop(o: { goal: string; score: number; stars: number; rule: string | null; continents: number; day?: string }): Badge[] {
  const p = progress(), g = p.play;
  g.rounds++;
  g.games.hop = (g.games.hop ?? 0) + 1;
  if (o.stars === 3) g.perfect++;
  if (o.stars === 3 && o.goal === 'people') g.light++;
  if (o.continents >= 3) g.continents3++;
  if (o.rule && !g.knowledge.includes(o.rule)) g.knowledge.push(o.rule);
  const k = o.rule ? `rule:${o.rule}` : o.goal;
  g.best[k] = Math.max(g.best[k] ?? 0, o.score);
  if (o.day && !g.daily.results[o.day]) {
    g.daily.results[o.day] = { score: o.score, stars: o.stars };
    const { last, streak, best } = bump(g.daily);
    Object.assign(g.daily, { last, streak, best });
  }
  return award();
}
export const hopDaily = (day = dayKey()) => progress().play.daily.results[day];

/** A map game played to its end (v0.25.0): its score and stars, the feats it did (badges), and the day if it was
 * today's puzzle (only the first play of a day counts for the day). */
export function recordGame(game: string, o: { score: number; stars: number; feats?: string[]; day?: string }): Badge[] {
  const g = progress().play;
  g.games[game] = (g.games[game] ?? 0) + 1;
  g.best[game] = Math.max(g.best[game] ?? 0, o.score);
  g.stars[game] = Math.max(g.stars[game] ?? 0, o.stars);
  for (const f of o.feats ?? []) if (!g.feats.includes(f)) g.feats.push(f);
  if (o.day) {
    const d = (g.dailies[o.day] ??= {});
    if (!d[game]) d[game] = { score: o.score, stars: o.stars };
  }
  return award();
}
/** Something seen around the app (a masterpiece's card, a life to its end): counted once. */
export function recordSeen(kind: 'works' | 'lives' | 'animals' | 'plants', id: string): Badge[] {
  const s = progress().seen;
  s[kind] ??= [];
  if (s[kind].includes(id)) return [];
  s[kind].push(id);
  return award();
}
/** Something done once around the app (a trip across three continents). */
/** Master the world (v0.34.0): the best run of days the daily goal was reached and the comebacks; a day the goal is
 * reached also keeps the daily challenge's streak going (one streak for both). */
export function recordMaster(o: { days: number; comebacks: number; goalToday?: boolean }): Badge[] {
  const p = progress();
  p.master = { days: Math.max(p.master?.days ?? 0, o.days), comebacks: Math.max(p.master?.comebacks ?? 0, o.comebacks) };
  if (o.goalToday) p.daily = { ...bump(p.daily), results: p.daily.results };
  return award();
}

export function recordFeat(id: string): Badge[] {
  const p = progress();
  if (p.feats.includes(id)) return [];
  p.feats.push(id);
  return award();
}

/** Today's puzzle of a map game, if played. */
export const gameDaily = (game: string, day = dayKey()) => (game === 'hop' ? progress().play.daily.results[day] : progress().play.dailies[day]?.[game]);

/** Called when progress is reset (Master the world forgets what it knows too). */
export const onReset: (() => void)[] = [];
export function resetProgress() {
  cache = empty();
  save();
  for (const f of onReset) f();
}

const fmt = (n: number) => n.toLocaleString(appLocale());
/** "13 Nov 2026" from 2026-11-13. */
const fmtDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(appLocale(), { day: 'numeric', month: 'short', year: 'numeric' }); };

/** The progress panel: each subject with its level, right answers and day streak; the daily challenge; tours; badges. */
export function progressPanel(onReset: () => void): HTMLElement {
  const p = progress();
  const body = h('div', { class: 'progress' });
  const badge = (b: Badge) => {
    const got = !!p.badges[b.id];
    const have = Math.min(b.goal, b.have(p));
    return h('div', { class: `badge-chip${got ? ' got' : ''}`, title: es() ? b.how.es : b.how.en, 'data-badge': b.id },
      h('span', { class: 'badge-icon', 'aria-hidden': 'true' }, b.icon),
      h('span', { class: 'badge-text' }, h('span', { class: 'badge-name' }, es() ? b.es : b.en),
        h('span', { class: 'badge-how' }, got ? L(`Earned on ${fmtDay(p.badges[b.id])}`, `Obtenida el ${fmtDay(p.badges[b.id])}`) : `${es() ? b.how.es : b.how.en} · ${fmt(have)}/${fmt(b.goal)}`)));
  };
  // The daily challenge: streak, best, and the last 7 days.
  const days: HTMLElement[] = [];
  for (let k = 6; k >= 0; k--) {
    const d = new Date(); d.setDate(d.getDate() - k);
    const r = p.daily.results[dayKey(d)];
    days.push(h('span', { class: `day-dot${r ? (r.s === r.n ? ' perfect' : ' done') : ''}`, title: `${dayKey(d)}${r ? ` · ${r.s}/${r.n}` : ''}` }, d.toLocaleDateString(appLocale(), { weekday: 'narrow' })));
  }
  body.append(h('h3', { class: 'sec-title' }, `🗓️ ${L('Daily challenge', 'Reto del día')}`),
    h('div', { class: 'prog-row' }, h('span', null, `🔥 ${L('Streak', 'Racha')}: ${fmt(current(p.daily))} · ${L('best', 'mejor')}: ${fmt(p.daily.best)}`), h('span', { class: 'day-dots' }, ...days)),
    h('div', { class: 'badge-list' }, ...BADGES.filter((b) => b.id.startsWith('daily-')).map(badge)));
  for (const s of Object.keys(SUBJECTS) as Subject[]) {
    const S = SUBJECTS[s];
    const right = p.right[s] ?? 0;
    const lvl = right >= 300 ? '🥇' : right >= 100 ? '🥈' : right >= 25 ? '🥉' : '';
    const next = [25, 100, 300].find((x) => right < x);
    const bar = h('span', { class: 'prog-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(next ?? 300), 'aria-valuenow': String(right) },
      h('span', { style: `width:${Math.round(Math.min(1, right / (next ?? 300)) * 100)}%` }));
    body.append(h('h3', { class: 'sec-title', 'data-subject': s }, `${S.icon} ${es() ? S.es : S.en} ${lvl}`),
      h('div', { class: 'prog-row' }, h('span', null, `${fmt(right)} ${L('right answers', 'respuestas correctas')}${next ? ` · ${L('next medal at', 'próxima medalla con')} ${fmt(next)}` : ''}`), bar),
      h('div', { class: 'prog-row muted small' }, `${fmt(p.played[s] ?? 0)} ${(p.played[s] ?? 0) === 1 ? L('quiz played', 'concurso jugado') : L('quizzes played', 'concursos jugados')} · 🔥 ${fmt(current(p.days[s]))} ${current(p.days[s]) === 1 ? L('day in a row', 'día seguido') : L('days in a row', 'días seguidos')} (${L('best', 'mejor')} ${fmt(p.days[s]?.best ?? 0)})`),
      h('div', { class: 'badge-list' }, ...BADGES.filter((b) => b.subject === s).map(badge)));
  }
  const g = p.play;
  body.append(h('h3', { class: 'sec-title' }, `🗺️ ${L('Map games', 'Juegos en el mapa')}`),
    h('div', { class: 'prog-row' }, `${fmt(g.rounds)} ${g.rounds === 1 ? L('route finished', 'ruta terminada') : L('routes finished', 'rutas terminadas')} · ⭐ ${fmt(g.perfect)} · 🔥 ${L('daily route', 'ruta del día')}: ${fmt(current(g.daily))}`),
    h('div', { class: 'badge-list' }, ...BADGES.filter((b) => b.id.startsWith('play-')).map(badge)));
  body.append(h('h3', { class: 'sec-title' }, `🌍 ${L('Around the app', 'Por la app')}`),
    h('div', { class: 'prog-row' }, `🖼️ ${fmt(p.seen.works.length)} ${L('masterpieces opened', 'obras maestras abiertas')} · 📖 ${fmt(p.seen.lives.length)} ${L('lives followed to the end', 'vidas seguidas hasta el final')} · 🔭 ${fmt(p.seen.animals.length)} ${L('animals found', 'animales encontrados')}`),
    h('div', { class: 'badge-list' }, ...BADGES.filter((b) => b.id.startsWith('app-')).map(badge)));
  body.append(h('h3', { class: 'sec-title' }, `🧭 ${L('Guided tours', 'Visitas guiadas')}`),
    h('div', { class: 'prog-row' }, `${fmt(p.tours.length)} ${L('of', 'de')} ${fmt(TOURS.length)} ${L('followed to the end', 'seguidas hasta el final')}`),
    h('div', { class: 'badge-list' }, ...BADGES.filter((b) => b.id.startsWith('tours-')).map(badge)));
  const reset = h('button', { type: 'button', class: 'pill sm' }, L('Start again from zero', 'Empezar de cero'));
  reset.addEventListener('click', () => {
    if (!confirm(L('Delete your progress, streaks and badges on this device?', '¿Borrar tu progreso, tus rachas y tus insignias en este dispositivo?'))) return;
    resetProgress();
    onReset();
  });
  const earned = Object.keys(p.badges).length;
  body.prepend(h('p', { class: 'muted small' }, L(`${earned} of ${BADGES.length} badges. Saved only on this device.`, `${earned} de ${BADGES.length} insignias. Guardado solo en este dispositivo.`)));
  body.append(h('div', { class: 'tool-actions' }, reset));
  return body;
}
