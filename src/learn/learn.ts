// Learn and play: quizzes (find the country, flags, capitals...), the games Put them in order and Time detective,
// the daily challenge, your progress (streaks and badges), guided tours, and "On this day".
import { GraduationCap, Compass, CalendarDays, Medal, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Play, Pause, RotateCcw, Map as MapIcon, Share2, Volume2, VolumeX } from 'lucide';
import { keepAwake } from '../ui/wake';
import { geoDistance, geoInterpolate } from 'd3-geo';
import { resultCard } from '../ui/result';
import { ftile } from '../ui/features';
import { h, icon, clear, add } from '../ui/dom';
import { t, tx, lang, flagEmoji, fmtNumber, L, dataLang, Lc } from '../app/i18n';
import { dataUrl, loadJSON } from '../data/store';
import { zoomable } from '../ui/zoom';
import { fmtWhen, itemWhen, itemThumb, sampleEl, quoteEl, type CollectionItem, type StoryKind } from '../modes/stories';
import { clipEl, stopClip } from '../ui/audio';
import { canSpeak, narrationOn, setNarrationOn, speak, stopSpeaking, sentences } from '../ui/narrator';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { TimeTravel } from '../modes';
import type { RenderSettings } from '../engine/renderer';
import { TOURS, type Tour, type TourStep } from './tours';
import type { Unit } from '../modes/paleo';
import { regionCountries, loadRegions, frameRegions, regionAt, regionThumb, drawRegions, type Region, type RegionMark } from './regions';
import * as CM from '../compare/model';
import { drawScatter } from '../compare/chart';
import { direction, strengthWords, fmtR } from '../compare/compare';
import { strength } from '../compare/stats';
import { DETECTIVE_YEARS, detectiveQuestions, type DetData, type DetQuestion } from './detective';
import { orderRounds } from './order';
import { WORLDS, worldById, tr, trIn, loadFacts } from '../space/worlds';
import { loadLandings, type Landing } from '../space/surface';
import { thumbUrl, type Space } from '../space/space';
import type { Sky } from '../sky/sky';
import { ORIGINS, originName, mainOrigin, type Elements, type Element } from '../sky/elements';
import { Borders, type BorderData } from '../play/route';
import { loadWild, cellAt, cellCenter, livesIn, type WildData, type Animal } from '../wild/data';
import { drawAnimalRange, rangeKm, focusAnimal } from '../layers/packs/wild';
import { loadGreen, loadCalendar, monthName as greenMonth, tt, type GreenData, type Plant, type Spectacle } from '../green/data';
import { drawPlantRange, plantRangeKm, focusPlant } from '../layers/packs/green';
import { monthsText } from '../green/cards';
import { loadArt, nm as artName, yearText, commons as commonsUrl, type ArtData } from '../artguide/data';
import type { RenderCtx } from '../layers/types';
import type { Master } from '../master/master';
import { loadDeck, deckCapital } from '../master/data';
import { recordAnswer, recordQuiz, recordDaily, recordDailySubjects, recordTour, dailyResult, dayKey, current, progress, progressPanel, BADGES, type Badge } from './progress';
import { appLocale } from '../app/i18n';
import { bell } from '../today/reminders';

const es = () => lang() === 'es';
/** Where chance comes from: Math.random, or a seeded source while the daily challenge picks its questions. */
let rand: () => number = Math.random;
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
/** mulberry32: a small seeded random source. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
/** FNV-1a: a number from a string (the day). */
const hash = (str: string) => { let x = 0x811c9dc5; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193); } return x >>> 0; };

type QuizKind = 'seafeature' | 'zone' | 'find' | 'flag' | 'capital' | 'where' | 'when' | 'dish' | 'era' | 'civ' | 'period' | 'region' | 'champion' | 'link' | 'journey' | 'faith' | 'script' | 'family' | 'plague' | 'disaster' | 'listen' | 'opening' | 'artist' | 'site' | 'inventor' | 'order' | 'detective' | 'daily' | 'world' | 'landed' | 'constellation' | 'element' | 'hop' | 'museum' | 'habitat' | 'lives' | 'grows' | 'season' | 'deep' | 'layers';
/** An item of a story collection, tagged with its collection. */
interface QItem extends CollectionItem { kind: StoryKind; pop?: number }
/** A site of data/layers/heritage.json (scripts/data/world-heritage/build.py). */
interface WhSite { ref: number; n: [string, string]; at: [number, number]; c: 'c' | 'n' | 'm'; y: number; cc: string[]; w: [string, string]; img: string; pop: number; x?: number; merged?: number }
/** A question; once answered, whether it was right and what the player answered. `kind`: its quiz, in a daily challenge. */
interface Q {
  /** v0.33.0, the sea: Name the sea feature (a pin where it is) and Which ocean zone? (an animal). */
  sea?: { at?: [number, number]; prompt: string; item?: string; labels: Record<string, string>; note?: string };
  id: string; kind?: QuizKind; options?: string[]; item?: QItem; ok?: boolean; given?: string; pick?: string; link?: Link; lang?: string;
  /** Put them in order: the things in the order shown, and the player's order so far (their keys). */
  set?: QItem[]; picked?: string[];
  /** Time detective: the region and the year (`id`), with the years to choose from (`options`). */
  det?: DetQuestion;
  /** Which world is this? and Who landed here?: the world shown, and the landing's place. */
  space?: { world: string; at?: [number, number] };
  /** Which constellation? (the constellation drawn alone) and Where was this element made? (its symbol). */
  sky?: { con?: string; el?: string };
  /** Which country in between?: the two countries that do not touch (the answer, `id`, is the one between them). */
  hop?: { a: string; b: string };
  /** Which museum is it in?: the work shown (the answer, `id`, is its museum). */
  art?: { work: string };
  /** Who lives here? (v0.30.0): the place shown (the answer, `id`, is an animal that lives there). */
  wild?: { at: [number, number] };
  /** When is it? (v0.31.0): the spectacle shown (the answer, `id`, is its best month, 1–12). */
  green?: { spectacle: string };
  /** How deep? (v0.32.0): which of two goes deeper (the answer, `id`, is the deeper one). */
  deep?: { a: string; b: string };
  /** Down to the core (v0.32.0): four things at their depths, and the player's order so far (their ids). */
  down?: DownThing[]; downPicked?: string[];
  /** v0.34.0: the Daily challenge's review question, a capital due in Master the world (it is not in the shared score). */
  review?: boolean;
}
/** Something at a depth below our feet (a layer's top, a mine, a cave, the deepest quake…). */
interface DownThing { id: string; e: string; name: [string, string]; place: [string, string]; m: number; below: 'ground' | 'sea' }
/** On this day: a story step or item with a full date: story key ("wars/ww1"), step (from 0), date, icon, title. */
type OtdEntry = [string, number, string, string, string, string];
interface OtdMonth { stories: Record<string, [string, string, string]>; days: Record<string, OtdEntry[]> }
/** "Guess the link": two country facts, their correlation and how many countries have both. */
interface Link { a: string; b: string; rho: number; n: number }
const ITEM_QUIZZES: QuizKind[] = ['where', 'when', 'dish', 'era', 'civ', 'period', 'champion', 'journey', 'faith', 'script', 'plague', 'disaster', 'listen', 'opening', 'artist', 'site', 'inventor'];
/** The quizzes whose question is a clip, a line or a picture, its name hidden until the answer: what are you hearing,
 * which book is it from, who made it. */
const HIDDEN_NAME: QuizKind[] = ['listen', 'opening', 'artist', 'site'];
/** "Who made it?" leaves out works by unknown or many hands, and makers' names too long for a button. */
const ANONYMOUS = /unknown|anonymous|traditional|workshop|artists|craftsmen|makers|people|desconocid|anónim/i;
/** "What are you hearing?": the wrong answers are of the same kind (instruments with instruments, styles with dances). */
const soundKind = (ty?: string) => (ty === 'instrument' ? 'instrument' : ty === 'work' ? 'work' : ty === 'genre' ? 'genre' : 'other');
/** "Which faith?" asks about the faith stories, not the time tour of them all. */
const FAITH_TOURS = ['faiths-through-time'];
/**
 * "Which epidemic?" and "Which disaster?": an item and four stories of its collection. They ask about the stories
 * of one epidemic or one disaster, not the time tours, nor the stories of germs and vaccines (their people and
 * discoveries belong to every epidemic).
 */
const STORY_QUIZ: Partial<Record<QuizKind, { kind: StoryKind; skip: string[] }>> = {
  plague: { kind: 'plagues', skip: ['medicine-through-time', 'microbe-hunters', 'vaccines'] },
  disaster: { kind: 'disasters', skip: ['earthquakes-through-time', 'volcanoes-through-time'] },
};
/** "Which language family?" leaves out languages whose name gives their family away (Japanese is Japonic). */
const FAMILY_SKIP = new Set(['jpn', 'kor', 'mon', 'que', 'aym', 'hgm', 'khi', 'tur', 'zho']);
/** "A, B and C" (Spanish "y", or "e" before an i sound). */
function joinList(names: string[]): string {
  if (names.length < 2) return names[0] ?? '';
  const last = names[names.length - 1];
  const and = !es() ? 'and' : /^(i|hi)(?![aeiouáéíóú])/i.test(last) ? 'e' : 'y';
  return `${names.slice(0, -1).join(', ')} ${and} ${last}`;
}
const lower1 = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
/** The civilization stories of Peoples and civilizations: the answers of "Which civilization?". */
const CIV_STORIES = ['mesopotamia', 'ancient-egypt', 'indus-valley', 'persia', 'kush-aksum', 'ancient-china', 'khmer', 'west-african-empires', 'great-zimbabwe-swahili', 'olmecs-maya', 'andes'];
const COLLECTION_DIR: Record<StoryKind, string> = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life', games: 'games', journeys: 'journeys', beliefs: 'beliefs', writing: 'writing', plagues: 'plagues', disasters: 'disasters', music: 'music', books: 'books', art: 'art', inventions: 'inventions', heritage: 'heritage', space: 'space', lives: 'lives' };
const yearOf = (d: string) => Number(/^-?\d+/.exec(d)?.[0] ?? 0);
/** An item's key: the same thing can be in two collections. */
const itemKey = (x: QItem) => x.id ?? x.name.en;
/** The quizzes whose answer is a tap on the map (the map's names are hidden), and Time detective's old borders. */
/** Which country in between? leaves out the borders that only an exclave makes. */
const HOP_SKIP = ['kaliningrad', 'nakhchivan', 'cabinda'];
const MAP_QUIZZES: QuizKind[] = ['find', 'where', 'region', 'detective', 'hop', 'habitat', 'grows'];

/** The daily challenge: the same eight questions for everyone on a day (by the local date); the eighth's quiz changes daily. */
const DAILY_FIRST = Date.UTC(2026, 10, 13);
export const dailyNumber = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - DAILY_FIRST) / 864e5) + 1; };
const DAILY_ROTATE: QuizKind[] = ['site', 'inventor', 'artist', 'habitat', 'dish', 'champion', 'era', 'civ', 'lives', 'journey', 'faith', 'plague', 'disaster', 'habitat', 'script', 'opening', 'period', 'lives', 'grows', 'season'];
const marksOf = (qs: { ok?: boolean; review?: boolean }[]) => qs.filter((x) => !x.review).map((x) => (x.ok ? '🟩' : '🟥')).join('');
/** The questions everyone gets (the Daily challenge's review question is the reader's own). */
const shared = <T extends { review?: boolean }>(qs: T[]) => qs.filter((x) => !x.review);
/** "1 day in a row", "3 días seguidos". */
const inARow = (n: number) => L('{0, plural, one {# day} other {# days}} in a row', '{0, plural, one {# día seguido} other {# días seguidos}}', n);

/** Four years to choose from: the right one and three plausible others (no year 0, none in the future). */
function yearOptions(y: number): number[] {
  const age = Math.max(60, 2026 - y);
  const step = age > 3000 ? 500 : age > 1000 ? 100 : age > 300 ? 50 : age > 120 ? 10 : 5;
  const opts = new Set([y]);
  for (let guard = 0; opts.size < 4 && guard < 200; guard++) {
    const f = (0.15 + rand() * 0.65) * (rand() < 0.5 ? -1 : 1);
    let o = Math.round((y + f * age) / step) * step;
    if (o > 2024) o = 2024 - step * (1 + Math.floor(rand() * 3));
    if (o === 0) o = -1;
    if ([...opts].every((x) => Math.abs(x - o) >= step)) opts.add(o);
  }
  return [...opts].sort((a, b) => a - b);
}

/**
 * "Guess the link": pairs of country facts whose correlation teaches something: strong links (wealth
 * and life expectancy), opposite ones (median age and children per woman), weak ones and none at all.
 */
const LINK_PAIRS: [string, string][] = [
  ['gdp_per_capita', 'life_expectancy'], ['gdp_per_capita', 'happiness'], ['gdp_per_capita', 'co2_per_capita'], ['gdp_per_capita', 'height_male_cm'],
  ['median_age', 'happiness'], ['alcohol_litres', 'median_age'], ['urban_pct', 'gdp_per_capita'], ['electricity_access_pct', 'life_expectancy'],
  ['urban_pct', 'happiness'], ['alcohol_litres', 'happiness'], ['internet_users_pct', 'mobile_per_100'], ['gdp_per_capita', 'obesity_pct'],
  ['median_age', 'fertility_rate'], ['internet_users_pct', 'fertility_rate'], ['literacy_pct', 'fertility_rate'], ['gdp_per_capita', 'fertility_rate'],
  ['happiness', 'fertility_rate'], ['avg_temperature', 'olympic_medals'], ['alcohol_litres', 'fertility_rate'], ['avg_temperature', 'height_male_cm'],
  ['avg_temperature', 'hdi'], ['life_expectancy', 'fertility_rate'],
  ['avg_temperature', 'gdp_per_capita'], ['tobacco_pct', 'life_expectancy'], ['gini', 'happiness'], ['area_km2', 'gdp_per_capita'],
  ['pop_density', 'life_expectancy'], ['gini', 'life_expectancy'], ['agricultural_land_pct', 'forest_pct'], ['nuclear_share_elec', 'co2_per_capita'],
  ['renewables_share_elec', 'co2_per_capita'], ['tobacco_pct', 'gdp_per_capita'], ['gini', 'avg_temperature'], ['highest_point_m', 'avg_temperature'],
  ['population', 'gdp_per_capita'], ['independence_year', 'gdp_per_capita'],
  ['forest_pct', 'life_expectancy'], ['renewables_share_elec', 'hdi'], ['forest_pct', 'gdp_per_capita'], ['pop_density', 'happiness'],
  ['alcohol_litres', 'pop_density'], ['unemployment_pct', 'median_age'], ['unemployment_pct', 'gdp_per_capita'], ['pop_density', 'co2_per_capita'],
  ['area_km2', 'forest_pct'], ['voting_age', 'happiness'], ['population', 'gini'],
];
/** The four answers: a strong link either way, a weak one, or none. */
const LINK_ANSWERS = ['up', 'weak', 'none', 'down'] as const;
/** Which answer a correlation is: strong from |rho| = 0.45, none below 0.15. */
const linkBucket = (rho: number) => (rho >= 0.45 ? 'up' : rho <= -0.45 ? 'down' : Math.abs(rho) < 0.15 ? 'none' : 'weak');
/** A pair too close to a boundary would be unfair to guess. */
const linkClear = (rho: number) => Math.abs(Math.abs(rho) - 0.15) >= 0.04 && Math.abs(Math.abs(rho) - 0.45) >= 0.04;
/** A word on the pairs where a third factor is the whole story. */
const LINK_WHY: Record<string, { en: string; es: string }> = {
  'tobacco_pct|life_expectancy': {
    en: 'Smoking does not lengthen life: in richer countries, where people live longer, more adults also smoke. A third factor, wealth, links the two.',
    es: 'Fumar no alarga la vida: en los países más ricos, donde se vive más, también fuman más adultos. Un tercer factor, la riqueza, une a ambos.',
  },
};

/** A quiz's stars, like the map games': 3 for 90 % right, 2 for 60 %, else 1. */
const quizStars = (score: number, n: number) => (n && score / n >= 0.9 ? 3 : n && score / n >= 0.6 ? 2 : 1);

export class Learn {
  private card: HTMLElement;
  /** `peek`: the card is folded to one line so the map can be seen; `done`: the result is up. */
  /** `region`: the continent of a country quiz, or the country of a States and provinces quiz (`all`: every region, not ten). */
  /** `run`: right answers in a row; `day`: the daily challenge's date. */
  private quiz: { kind: QuizKind; region: string; qs: Q[]; i: number; score: number; answered: boolean; savedLabels: RenderSettings['labels']; peek: boolean; fb?: { ok: boolean; text: string }; done?: boolean; best?: number; all?: boolean; run?: number; day?: string } | null = null;
  /** The tour being taken: its stops, the one shown, auto-play, the card folded, and the voice reading the stop
   * (`voice`: not reading, reading, or read to the end; `after` waits after the voice before the next stop). */
  private tour: { name: string; steps: TourStep[]; i: number; auto: boolean; timer: number; fold: boolean; voice: 'off' | 'reading' | 'done'; after: number; at: number } | null = null;
  private pin: { lon: number; lat: number; text: string } | null = null;
  /** Where you tapped in Where in the world? (v0.41.1): a line from it to the place shows how far you were. */
  private guess: [number, number] | null = null;
  private guessKm = 0;
  /** Several numbered pins (Put them in order's answer). */
  private pins: { lon: number; lat: number; text: string }[] = [];
  /** Time detective: its regions and how their maps differ, and the maps' years with their labels. */
  private det: DetData | null = null;
  private detLabels = new Map<number, { en: string; es: string }>();
  private items: Partial<Record<StoryKind, CollectionItem[]>> = {};
  private eras = new Map<string, { name: { en: string; es: string }; icon: string }>();
  private civs = new Map<string, { name: { en: string; es: string }; icon: string }>();
  /** Journeys and trade routes: the stories "Which journey?" asks about. */
  private journeys = new Map<string, { name: { en: string; es: string }; icon: string }>();
  /** Religions and philosophies: the stories "Which faith?" asks about. */
  private faiths = new Map<string, { name: { en: string; es: string }; icon: string }>();
  /** The stories "Which epidemic?" and "Which disaster?" ask about. */
  private storySets = new Map<QuizKind, Map<string, { name: { en: string; es: string }; icon: string }>>();
  /** "Which script?": the scripts' names, by item id. */
  private scriptNames = new Map<string, { en: string; es: string }>();
  /** What are you hearing, which book is it from, who made it: the answers' names, by id. */
  private optNames = new Map<string, { en: string; es: string }>();
  /** "Which language family?": the languages and families of the country facts, and where each language is official. */
  private famData: { langs: Record<string, { en: string; es: string; family?: string; branch?: string }>; fams: Record<string, { en: string; es: string }>; where: Map<string, string[]> } | null = null;
  /** The geologic periods of the last 1000 million years, oldest first (the answers of "Which period?"). */
  private periods: Unit[] = [];
  /** States and provinces: the country's regions, and the one picked in the result. */
  private regions: { a3: string; list: Region[] } | null = null;
  private focusRegion: string | null = null;

  /** Beyond Earth (set in main.ts): the quizzes about other worlds show them on the globe, and tours visit them. */
  space: Space | null = null;
  /** The sky view and the elements table (sky/), for their quizzes and tours. */
  sky: Sky | null = null;
  elements: Elements | null = null;
  /** Inside the Earth (v0.32.0): the globe cut open at a tour's stop. */
  inside: { showCut(o: { peel?: number; focus?: string; lon?: number }): void; hideCut(): void } | null = null;
  /** Master the world (v0.34.0): its panel, and the Daily challenge's review question. */
  master: Master | null = null;
  orrery: { show: (jd: number, scale?: 'inner' | 'planets' | 'outer', speed?: number) => void } | null = null;
  /** Called before a quiz or a tour starts, so a map game (play/hop.ts, set in main.ts) leaves the map to it. */
  beforeStart: (() => void) | null = null;
  /** Closes the quiz or tour on screen (a map game is starting). */
  async closeAll() { this.stopTour(); await this.stopQuiz(); }

  /** The filters on the map before a quiz began, put away while it is on (their names and dots would give answers
   * away: World Heritage's "Acropolis, Athens" on "Where is Greece?") and put back when it ends, as the games do. */
  private savedStack: string[] | null = null;
  private visibleStack() { return this.app.layers.filter((l) => !l.def.hidden).map((l) => l.def.id); }
  private async clearFilters() {
    const now = this.visibleStack();
    this.savedStack ??= now;
    if (now.some((id) => id !== 'political')) await this.app.setStack(['political']);
  }
  private async restoreFilters() {
    const saved = this.savedStack;
    this.savedStack = null;
    if (saved && saved.join() !== this.visibleStack().join()) await this.app.setStack(saved.length ? saved : ['political']);
  }

  constructor(private app: App, private shell: Shell, private time: TimeTravel) {
    this.card = h('section', { class: 'learn-card glass', hidden: true });
    app.root.append(this.card);
    // The map centres below the card, so what a tour or an answer shows is not behind it.
    new ResizeObserver(() => this.syncInset()).observe(this.card);
    shell.addMenu({ id: 'quiz', icon: GraduationCap, label: () => L('Quiz', 'Concurso'), order: 30, group: 'learn', onClick: () => this.openQuizMenu() });
    shell.addMenu({ id: 'tours', icon: Compass, label: () => L('Guided tours', 'Visitas guiadas'), order: 31, group: 'learn', onClick: () => this.openTours() });
    shell.addMenu({ id: 'onthisday', icon: CalendarDays, label: () => L('On this day', 'Tal día como hoy'), order: 32, group: 'learn', onClick: () => void this.openOnThisDay() });
    // v0.41.1: Your progress has its own place in Learn (it was only reachable from inside the Quiz panel).
    shell.addMenu({ id: 'progress', icon: Medal, label: () => L('Your progress', 'Tu progreso'), order: 33, group: 'learn', onClick: () => this.openProgress() });
    shell.tapHandlers.unshift((_x, _y, g) => {
      const q = this.quiz;
      if (!q || q.done) return false;
      const kind = this.qk();
      // Time detective: no names before the answer; after it, a tap names the state or empire.
      if (kind === 'detective') { if (q.answered && g) this.time.history.tap(g[0], g[1]); return true; }
      // While a quiz runs, the map's taps are the quiz's: a country's card would open under the question (v0.41.1).
      if (q.answered || !['find', 'where', 'region', 'habitat', 'grows'].includes(kind)) return true;
      if (g && kind === 'find') this.answerFind(app.renderer.countryAt(g[0], g[1]));
      if (g && (kind === 'where' || kind === 'habitat' || kind === 'grows')) this.answerWhere(g as [number, number]);
      if (g && kind === 'region' && this.regions) {
        // A tap outside the country is not an answer.
        const r = regionAt(this.regions.list, g[0], g[1], app.renderer.view);
        if (r) this.answerRegion(r.id);
      }
      return true;
    });
    app.renderer.overlays.add((rc) => {
      const q = this.quiz, rg = this.regions;
      if (!q || q.kind !== 'region' || !rg) return;
      drawRegions(rc, rg.list, (r) => this.regionMark(r), (r) => this.regionName(r));
    });
    app.renderer.overlays.add((rc) => this.drawHop(rc));
    // Where does it live? and Who lives here?: the animal's range once answered.
    app.renderer.overlays.add((rc) => { if (this.quiz && this.wildShow) drawAnimalRange(rc, this.wildShow); });
    // Where does it grow?: the plant's range once answered.
    app.renderer.overlays.add((rc) => { if (this.quiz && this.greenShow) drawPlantRange(rc, this.greenShow); });
    app.renderer.overlays.add((rc) => {
      const { ctx } = rc;
      // Where in the world?: a dashed line along the great circle from your tap to the place, and your tap's dot.
      if (this.guess && this.pin && this.quiz) {
        const along = geoInterpolate(this.guess, [this.pin.lon, this.pin.lat]);
        ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3;
        ctx.beginPath();
        let open = false;
        for (let k = 0; k <= 48; k++) {
          const p = rc.project(...along(k / 48));
          if (!p) { open = false; continue; }
          if (open) ctx.lineTo(p[0], p[1]); else { ctx.moveTo(p[0], p[1]); open = true; }
        }
        ctx.stroke(); ctx.restore();
        const g = rc.project(this.guess[0], this.guess[1]);
        if (g) { ctx.beginPath(); ctx.arc(g[0], g[1], 7, 0, Math.PI * 2); ctx.fillStyle = '#4dabf7'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        // How far, halfway along the line.
        const mid = rc.project(...along(0.5));
        if (mid && this.guessKm > 0) rc.labels.add({ text: L('{0} km', '{0} km', fmtNumber(this.guessKm)), x: mid[0] + 8, y: mid[1], align: 'left', priority: 2900, size: 12.5, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
      }
      for (const [pin, r] of [...this.pins.map((x) => [x, 7] as const), ...(this.pin ? [[this.pin, 9] as const] : [])]) {
        const p = rc.project(pin.lon, pin.lat);
        if (!p) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2); ctx.fillStyle = '#ff6b6b'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        rc.labels.add({ text: pin.text, x: p[0] + r + 5, y: p[1], align: 'left', priority: 3000, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
      }
    });
  }

  /** The kind of the question on screen (a daily challenge mixes them). */
  private qk(): QuizKind {
    const q = this.quiz;
    return q ? q.qs[q.i]?.kind ?? q.kind : 'find';
  }

  /** Counts an answer: the score, right answers in a row, and the subject's progress (a toast for a new badge). */
  private scored(ok: boolean) {
    const q = this.quiz!;
    if (q.qs[q.i]?.review) return;
    if (ok) { q.score++; q.run = (q.run ?? 0) + 1; } else q.run = 0;
    this.badgeToast(recordAnswer(this.qk(), ok));
  }

  private badgeToast(got: Badge[]) {
    if (got.length) this.shell.toast(`${L('New badge', 'Nueva insignia')}: ${got.map((b) => `${b.icon} ${tx(b)}`).join(' · ')}`, 4500);
  }

  // ---- Quiz -----------------------------------------------------------------------------------
  private pool(region: string): string[] {
    const meta = this.app.data.meta;
    const caps = new Set(this.app.data.cities.filter((c) => c.capital === 2).map((c) => c.country));
    return Object.keys(meta).filter((id) => {
      const m = meta[id];
      return (m.type === 'Sovereign country' || m.type === 'Country') && m.pop > 150_000 && m.a2 && caps.has(id) && (region === 'world' || m.ct === region);
    });
  }

  /** Every quiz: its icon, name and what it asks (the menu, and the label of a daily challenge's question). */
  private quizTable(): [QuizKind, string, string, string][] {
    return [
      ['find', '📍', L('Find the country', 'Encuentra el país'), L('Tap it on the globe (labels hidden).', 'Tócalo en el globo (sin etiquetas).')],
      ['flag', '🏳️', L('Flags', 'Banderas'), L('Which country has this flag?', '¿De qué país es esta bandera?')],
      ['capital', '🏛️', L('Capitals', 'Capitales'), L('Pick the right capital city.', 'Elige la capital correcta.')],
      ['region', '🗺️', L('States and provinces', 'Estados y provincias'), L('Tap the state or province in the United States, Mexico, Canada and 45 more countries.', 'Toca el estado o la provincia en Estados Unidos, México, Canadá y 45 países más.')],
      ['hop', '🧭', L('Which country in between?', '¿Qué país hay en medio?'), L('Two countries that do not touch, and one country between them: which one do you cross?', 'Dos países que no se tocan y un país entre ellos: ¿cuál cruzas?')],
      ['order', '🔢', L('Put them in order', 'Ordénalos en el tiempo'), L('Four things from the stories, such as a temple, an invention and a painting: put them in time, oldest first.', 'Cuatro cosas de las historias, como un templo, un invento y una pintura: ordénalas en el tiempo, de la más antigua a la más reciente.')],
      ['detective', '🕵️', L('Time detective', 'Detective del tiempo'), L('A map of old borders with no names on it: when is it from?', 'Un mapa de fronteras antiguas sin nombres: ¿de cuándo es?')],
      ['where', '📍', L('Where in the world?', '¿Dónde está?'), L('Tap on the globe where a monument, a work, a dish or a fossil comes from.', 'Toca en el globo de dónde es un monumento, una obra, un plato o un fósil.')],
      ['when', '⏳', L('When was it?', '¿Cuándo fue?'), L('Pick the year it was built, made or first recorded.', 'Elige el año en que se construyó, se hizo o aparece por primera vez.')],
      ['dish', '🍲', L('Dishes of the world', 'Platos del mundo'), L('Which country does this dish come from?', '¿De qué país es este plato?')],
      ['era', '🎨', L('Which era?', '¿Qué época?'), L('Match people, works and inventions to their era.', 'Relaciona personas, obras e inventos con su época.')],
      ['civ', '🏺', L('Which civilization?', '¿Qué civilización?'), L('Match finds, works and rulers to their civilization.', 'Relaciona hallazgos, obras y gobernantes con su civilización.')],
      ['period', '🦕', L('Which period?', '¿Qué periodo?'), L('Match fossils and ancient animals to their geologic period.', 'Relaciona fósiles y animales antiguos con su periodo geológico.')],
      ['champion', '🏆', L('Who won?', '¿Quién ganó?'), L('World Cup champions, and the countries that topped each Olympics\u2019 medal table.', 'Los campeones del Mundial y los países que encabezaron el medallero de cada Olimpiada.')],
      ['journey', '🧭', L('Which journey?', '¿Qué viaje?'), L('Match places, people and goods to the great journey or trade route they belong to.', 'Relaciona lugares, personas y mercancías con el gran viaje o la ruta comercial a la que pertenecen.')],
      ['faith', '🛐', L('Which faith?', '¿Qué religión?'), L('Match sacred places, texts and teachers to the faith or school of thought they belong to.', 'Relaciona lugares sagrados, textos y maestros con la religión o la escuela de pensamiento a la que pertenecen.')],
      ['plague', '🦠', L('Which epidemic?', '¿Qué epidemia?'), L('Match places, people and discoveries to the epidemic they belong to: the Black Death, smallpox, cholera, the 1918 flu...', 'Relaciona lugares, personas y descubrimientos con la epidemia a la que pertenecen: la peste negra, la viruela, el cólera, la gripe de 1918...')],
      ['disaster', '🌋', L('Which disaster?', '¿Qué desastre?'), L('Match towns, witnesses and discoveries to the eruption, earthquake or tsunami they belong to.', 'Relaciona pueblos, testigos y descubrimientos con la erupción, el terremoto o el tsunami al que pertenecen.')],
      ['script', '✍️', L('Which script?', '¿Qué escritura?'), L('A word or a few letters in one of the world\u2019s scripts: which script is it?', 'Una palabra o unas letras en una de las escrituras del mundo: ¿cuál es?')],
      ['family', '🗣️', L('Which language family?', '¿Qué familia de lenguas?'), L('Hungarian, Swahili, Malagasy...: which family does each language belong to?', 'Húngaro, suajili, malgache...: ¿a qué familia pertenece cada lengua?')],
      ['listen', '🎧', L('What are you hearing?', '¿Qué estás oyendo?'), L('Listen to a short clip of an instrument, a piece or a style of music, and name it.', 'Escucha un fragmento de un instrumento, una obra o un estilo musical, y di cuál es.')],
      ['opening', '📖', L('Which book is it from?', '¿De qué libro es?'), L('A famous line in its own language: which book or poem is it from?', 'Una frase famosa en su propia lengua: ¿de qué libro o poema es?')],
      ['artist', '🎨', L('Who made it?', '¿Quién lo hizo?'), L('Look at a masterpiece and pick the artist who made it.', 'Mira una obra maestra y elige al artista que la hizo.')],
      ['site', '🏛️', L('Which World Heritage site?', '¿Qué sitio del Patrimonio Mundial?'), L('Look at a picture of a World Heritage site and name it.', 'Mira la foto de un sitio del Patrimonio Mundial y di cuál es.')],
      ['museum', '🖼️', L('Which museum is it in?', '¿En qué museo está?'), L('A masterpiece: which museum holds it today?', 'Una obra maestra: ¿qué museo la tiene hoy?')],
      ['habitat', '🐾', L('Where does it live?', '¿Dónde vive?'), L('A photo of an animal: tap a place on the globe where it lives in the wild.', 'La foto de un animal: toca en el globo un lugar donde vive en libertad.')],
      ['lives', '🔭', L('Who lives here?', '¿Quién vive aquí?'), L('The globe flies to a place: which of four animals lives there?', 'El globo vuela a un lugar: ¿cuál de cuatro animales vive allí?')],
      ['grows', '🌿', L('Where does it grow?', '¿Dónde crece?'), L('A photo of a plant: tap a place on the globe where it grows wild.', 'La foto de una planta: toca en el globo un lugar donde crece silvestre.')],
      ['deep', '⛏️', L('How deep?', '¿Qué tan hondo?'), L('A cave, a mine, a trench, a wreck, a dive: which of two goes deeper?', 'Una cueva, una mina, una fosa, un naufragio, un buceo: ¿cuál de dos llega más hondo?')],
      ['layers', '🌍', L('Down to the core', 'Hasta el núcleo'), L('Four things under our feet, from a metro station to the inner core: put them in order, shallowest first.', 'Cuatro cosas bajo nuestros pies, de una estación de metro al núcleo interno: ordénalas de la menos a la más profunda.')],
      ['season', '📅', L('When is it?', '¿Cuándo es?'), L('Cherry blossom in Kyoto, the wildebeest crossing the Mara…: pick the best month to see it.', 'Los cerezos en flor de Kioto, los ñus cruzando el Mara…: elige el mejor mes para verlo.')],
      ['seafeature', '🕳️', L('Name the sea feature', 'Nombra la forma submarina'), L('A pin under the sea: is it the Mariana Trench, the Mid-Atlantic Ridge or the Hawaiian–Emperor chain?', 'Un alfiler bajo el mar: ¿es la fosa de las Marianas, la dorsal mesoatlántica o la cadena Hawái-Emperador?')],
      ['zone', '🐙', L('Which ocean zone?', '¿Qué zona del océano?'), L('An animal of the sea: does it live in the sunlit zone, the twilight, the midnight zone, the abyss or the trenches?', 'Un animal del mar: ¿vive en la zona iluminada, la penumbra, la zona de medianoche, el abismo o las fosas?')],
      ['inventor', '💡', L('Who invented it?', '¿Quién lo inventó?'), L('The telephone, paper, the World Wide Web...: pick who invented it.', 'El teléfono, el papel, la World Wide Web...: elige quién lo inventó.')],
      ['world', '🪐', L('Which world is this?', '¿Qué mundo es este?'), L('A planet, a moon or a dwarf planet turns on the globe, with no names: which one is it?', 'Un planeta, una luna o un planeta enano gira en el globo, sin nombres: ¿cuál es?')],
      ['landed', '🚀', L('Who landed here?', '¿Quién aterrizó aquí?'), L('A spot on the Moon or Mars: which mission landed there?', 'Un punto en la Luna o en Marte: ¿qué misión aterrizó allí?')],
      ['constellation', '✳️', L('Which constellation?', '¿Qué constelación?'), L('A constellation\u2019s stars and figure, with no names: which one is it?', 'Las estrellas y la figura de una constelación, sin nombres: ¿cuál es?')],
      ['element', '⚗️', L('Where was this element made?', '¿Dónde se formó este elemento?'), L('Gold, carbon, iron...: which cosmic process made most of it?', 'El oro, el carbono, el hierro...: ¿qué proceso del cosmos formó la mayor parte?')],
      ['link', '📈', L('Guess the link', 'Adivina la relación'), L('Do two facts about countries go together? Guess, then see the scatter plot.', '¿Van juntos dos datos de los países? Adivina y luego mira el diagrama de dispersión.')],
    ];
  }

  /** "🏳️ Flags": a quiz's icon and name. */
  private quizName(kind: QuizKind): string {
    const r = this.quizTable().find((x) => x[0] === kind);
    return r ? `${r[1]} ${r[2]}` : kind;
  }

  openQuizMenu() {
    const regions: [string, string][] = [['world', L('World', 'Mundo')], ['AF', t('cont.AF')], ['AS', t('cont.AS')], ['EU', t('cont.EU')], ['NA', t('cont.NA')], ['SA', t('cont.SA')], ['OC', t('cont.OC')]];
    let region = 'world';
    const regionRow = h('div', { class: 'chip-row' });
    const drawRegions = () => {
      clear(regionRow);
      for (const [id, label] of regions) {
        const b = h('button', { type: 'button', class: `chip${region === id ? ' on' : ''}` }, label);
        b.addEventListener('click', () => { region = id; drawRegions(); });
        regionRow.append(b);
      }
    };
    drawRegions();
    const card = ([k, ic, title, desc]: [QuizKind, string, string, string]) => {
      const best = k === 'region' ? null : localStorage.getItem(`atlas-quiz-best:${k}`);
      const c = h('button', { type: 'button', class: 'mode-card', 'data-quiz': k }, h('span', { class: 'mode-icon' }, ic),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, `${desc}${best ? ` · ${L('Best', 'Récord')}: ${best}/10` : ''}`)));
      c.addEventListener('click', () => void (k === 'region' ? this.openRegionPicker(region) : this.startQuiz(k, region)));
      return c;
    };
    const table = this.quizTable();
    const list = h('div', { class: 'mode-list' }, ...table.slice(0, 5).map(card));
    const games = h('div', { class: 'mode-list' }, ...table.filter(([k]) => k === 'order' || k === 'detective').map(card));
    const list2 = h('div', { class: 'mode-list' }, ...table.slice(7).map(card));
    this.shell.openPanel('quiz', L('Quiz', 'Concurso'), h('div', null, this.dailyCards(), h('h3', { class: 'sec-title' }, L('Region', 'Región')), regionRow, h('h3', { class: 'sec-title' }, L('Game', 'Juego')), list,
      h('h3', { class: 'sec-title' }, L('Games of time', 'Juegos del tiempo')), games,
      h('h3', { class: 'sec-title' }, L('History, culture, life, sport and travel', 'Historia, cultura, vida, deporte y viajes')), list2));
  }

  /** The top of the Quiz panel: today's challenge (or how it went) and your progress. */
  private dailyCards(): HTMLElement {
    const day = dayKey();
    const done = dailyResult(day);
    const p = progress();
    const streak = current(p.daily);
    const date = new Date().toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
    const daily = h('button', { type: 'button', class: `mode-card daily-card${done ? ' done' : ''}`, 'data-quiz': 'daily' }, ftile('daily'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, `${L('Daily challenge', 'Reto del día')} #${dailyNumber(day)} · ${date}`),
        h('span', { class: 'mode-desc' }, done
          ? `${L('Done', 'Hecho')}: ${done.s}/${done.n} ${done.m.replace(/y/g, '🟩').replace(/n/g, '🟥')}${streak ? ` · 🔥 ${streak}` : ''} · ${L('a new one tomorrow', 'mañana hay otro')}`
          : `${L('Eight questions, the same for everyone today', 'Ocho preguntas, las mismas para todos hoy')}${streak ? ` · 🔥 ${inARow(streak)}` : ''}`)));
    daily.addEventListener('click', () => void (done ? this.showDailyDone() : this.startQuiz('daily', 'world')));
    const earned = Object.keys(p.badges).length;
    const prog = h('button', { type: 'button', class: 'mode-card', 'data-panel': 'progress' }, ftile('progress'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, L('Your progress', 'Tu progreso')),
        h('span', { class: 'mode-desc' }, L('Streaks and badges for each subject · {0} of {1} badges', 'Rachas e insignias por tema · {0} de {1} insignias', earned, BADGES.length))));
    prog.addEventListener('click', () => this.openProgress());
    const mw = h('button', { type: 'button', class: 'mode-card', 'data-panel': 'master' }, ftile('master'),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, L('Master the world', 'Domina el mundo')),
        h('span', { class: 'mode-desc' }, L('Countries, capitals, flags, cities, landmarks and more, learned for good: a little each day', 'Países, capitales, banderas, ciudades, monumentos y más, aprendidos para siempre: un poco cada día'))));
    mw.addEventListener('click', () => void this.master?.openPanel());
    return h('div', { class: 'mode-list' }, daily, bell('daily'), ...(this.master ? [mw] : []), prog);
  }

  /** Today (v0.37.0): the Daily challenge as one line: done or not, its result, how to start it, its share line. */
  todayDaily(): { done: boolean; title: string; desc: string; line: string | null; open: () => void } {
    const day = dayKey(), done = dailyResult(day), n = dailyNumber(day);
    const marks = done ? done.m.replace(/y/g, '🟩').replace(/n/g, '🟥') : '';
    return {
      done: !!done,
      title: `${L('Daily challenge', 'Reto del día')} #${n}`,
      desc: done ? `${L('Done', 'Hecho')}: ${done.s}/${done.n} ${marks}` : L('Eight questions, the same for everyone today', 'Ocho preguntas, las mismas para todos hoy'),
      line: done ? `🗓️ ${L('Daily challenge', 'Reto del día')} #${n}: ${done.s}/${done.n} ${marks}` : null,
      open: () => void (done ? this.showDailyDone() : this.startQuiz('daily', 'world')),
    };
  }

  openProgress() {
    this.shell.openPanel('progress', L('Your progress', 'Tu progreso'), progressPanel(() => this.openProgress()));
  }

  private async startQuiz(kind: QuizKind, region: string) {
    this.beforeStart?.();
    this.stopTour();
    this.shell.sheet.close();
    if (kind === 'region') { await this.startRegionQuiz(region, false); return; }
    if (kind === 'link') { await this.startLinkQuiz(); return; }
    if (kind === 'family') { await this.startFamilyQuiz(); return; }
    if (kind === 'capital' || kind === 'daily') await loadDeck();
    if (kind === 'daily') { await this.startDaily(); return; }
    const qs = kind === 'world' ? await this.worldQs(10) : kind === 'landed' ? await this.landedQs(10) : kind === 'constellation' ? await this.constellationQs(10) : kind === 'element' ? await this.elementQs(10) : kind === 'order' ? await this.orderQs(10) : kind === 'detective' ? await this.detectiveQs(10) : kind === 'hop' ? await this.hopQs(10, region) : kind === 'museum' ? await this.museumQs(10) : kind === 'habitat' ? await this.habitatQs(10) : kind === 'lives' ? await this.livesQs(10) : kind === 'grows' ? await this.growsQs(10) : kind === 'season' ? await this.seasonQs(10) : kind === 'seafeature' ? await this.seaFeatureQs(10) : kind === 'zone' ? await this.zoneQs(10) : kind === 'deep' ? await this.deepQs(10) : kind === 'layers' ? await this.downQs(8) : ITEM_QUIZZES.includes(kind) ? await this.itemQs(kind, 10) : this.countryQs(kind, region, 10);
    if (!qs?.length) { this.needsData(kind === 'detective' ? L('This game needs its maps; check your connection.', 'Este juego necesita sus mapas; revisa tu conexión.') : kind === 'hop' ? L('This quiz needs the border data; check your connection.', 'Este concurso necesita los datos de fronteras; revisa tu conexión.') : kind === 'museum' ? L('This quiz needs the art guide; check your connection.', 'Este concurso necesita la guía de arte; revisa tu conexión.') : kind === 'habitat' || kind === 'lives' ? L('This quiz needs the animal data; check your connection.', 'Este concurso necesita los datos de animales; revisa tu conexión.') : kind === 'grows' || kind === 'season' ? L('This quiz needs the plant data; check your connection.', 'Este concurso necesita los datos de plantas; revisa tu conexión.') : undefined); return; }
    await this.begin(kind, region, qs);
  }

  /** Starts a quiz with its questions (any Time travel story is closed first). */
  private async begin(kind: QuizKind, region: string, qs: Q[], day?: string) {
    if (this.quiz) await this.stopQuiz(false);
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    await this.clearFilters();
    this.quiz = { kind, region, qs, i: 0, score: 0, answered: false, savedLabels: { ...this.app.renderer.settings.labels }, peek: false, run: 0, day };
    this.app.select(null);
    this.renderQuiz();
    await this.prepareQuestion();
  }

  /** The map for the question on screen: names hidden and the globe for the map quizzes, Time detective's old borders. */
  private async prepareQuestion() {
    const q = this.quiz;
    if (!q) return;
    const kind = this.qk(), cur = q.qs[q.i];
    this.wildShow = null;
    this.greenShow = null;
    // When is it?: the place of the spectacle, with a pin and its name.
    if (cur?.green) {
      const sp = this.calQuiz?.find((x) => x.id === cur.green!.spectacle);
      if (this.space?.active) await this.space.exit();
      await this.time.history.quizMap(null);
      this.app.renderer.settings.labels = { ...q.savedLabels };
      if (sp) { this.pin = { lon: sp.at[0], lat: sp.at[1], text: sp.e }; this.app.renderer.view.flyTo({ lon: sp.at[0], lat: sp.at[1], zoom: Math.max(3, Math.min(6, this.app.renderer.view.zoom)) }, 1400); }
      this.app.renderer.requestRender();
      return;
    }
    // Name the sea feature: the place, with a pin.
    if (cur?.sea?.at) {
      if (this.space?.active) await this.space.exit();
      await this.time.history.quizMap(null);
      this.app.renderer.settings.labels = { ...q.savedLabels };
      this.pin = { lon: cur.sea.at[0], lat: cur.sea.at[1], text: '?' };
      this.app.renderer.view.flyTo({ lon: cur.sea.at[0], lat: cur.sea.at[1], zoom: 2.2 }, 1400);
      this.app.renderer.requestRender();
      return;
    }
    // Who lives here?: the place, with a pin.
    if (cur?.wild) {
      if (this.space?.active) await this.space.exit();
      await this.time.history.quizMap(null);
      this.app.renderer.settings.labels = { ...q.savedLabels };
      this.pin = { lon: cur.wild.at[0], lat: cur.wild.at[1], text: '?' };
      this.app.renderer.view.flyTo({ lon: cur.wild.at[0], lat: cur.wild.at[1], zoom: Math.max(4, Math.min(8, this.app.renderer.view.zoom)) }, 1400);
      this.app.renderer.requestRender();
      return;
    }
    // The sky, with one constellation drawn and no names (Which constellation?).
    if (cur?.sky?.con && this.sky) {
      if (this.space?.active) await this.space.exit();
      await this.sky.show({ frame: 'celestial', target: cur.sky.con, bare: true, focus: cur.sky.con });
      this.skyQuiz = true;
      return;
    }
    if (this.skyQuiz) { this.sky?.close(); this.skyQuiz = false; }
    if (cur?.sky) return;
    // Another world, with no names (Which world is this?, Who landed here?); the Earth for every other question.
    if (cur?.space && this.space) {
      await this.space.quizShow(cur.space.world, cur.space.at);
      this.pin = cur.space.at ? { lon: cur.space.at[0], lat: cur.space.at[1], text: '?' } : null;
      this.app.renderer.requestRender();
      return;
    }
    if (this.space?.active) await this.space.exit();
    const hide = MAP_QUIZZES.includes(kind);
    this.app.renderer.settings.labels = hide ? { ...q.savedLabels, countries: false, capitals: false, cities: false } : { ...q.savedLabels };
    if (hide && this.app.renderer.view.current.kind !== 'globe') this.app.setProjection('globe');
    if (kind === 'detective' && cur?.det) {
      await this.time.history.quizMap(cur.det.year, false);
      const r = this.det?.regions.find((x) => x.id === cur.det!.region);
      if (r && this.quiz === q) this.app.renderer.view.flyTo({ lon: r.cam[0], lat: r.cam[1], zoom: r.cam[2] }, 1400);
    } else await this.time.history.quizMap(null);
    this.hopShow = kind === 'hop' && cur?.hop ? cur : null;
    if (this.hopShow && this.quiz === q) this.fitCountries([cur.hop!.a, cur.hop!.b, cur.id]);
    this.app.renderer.requestRender();
  }

  /** Ten countries of a region: find them on the globe, or their flag or capital among four. */
  private countryQs(kind: QuizKind, region: string, n: number): Q[] {
    const pool = this.pool(region);
    return shuffle(pool.slice()).slice(0, n).map((id) => {
      if (kind === 'find') return { id, kind };
      const others = shuffle(pool.filter((x) => x !== id)).slice(0, 3);
      return { id, kind, options: shuffle([id, ...others]) };
    });
  }

  /** A quiz whose data could not be loaded says so on its card. */
  private needsData(msg = L('This quiz needs the story collections; check your connection.', 'Este concurso necesita las colecciones de historias; revisa tu conexión.')) {
    clear(this.card);
    const close = h('button', { type: 'button', class: 'pill sm' }, t('close'));
    close.addEventListener('click', () => { this.card.hidden = true; });
    add(this.card, h('div', { class: 'tool-hint' }, msg), h('div', { class: 'tool-actions' }, close));
    this.card.hidden = false;
  }

  // ---- States and provinces

  private regionName(r: Region) { return es() ? r.es : r.n; }

  /** The best score of a States and provinces quiz, "8/10" (`all`: of every region). */
  private regionBest(a3: string, all: boolean, n: number): string | null {
    let v: string | null = null;
    try { v = localStorage.getItem(`atlas-quiz-best:region-${a3}${all ? '-all' : ''}`); } catch { /* ignore */ }
    return v ? `${v}/${all ? n : Math.min(10, n)}` : null;
  }

  /** Picks a country (and ten questions or all of its regions). */
  private async openRegionPicker(continent = 'world') {
    let countries;
    try { countries = await regionCountries(); } catch {
      this.shell.toast(L('This quiz needs its map data; check your connection.', 'Este concurso necesita sus datos de mapa; revisa tu conexión.'));
      return;
    }
    let all = false;
    const countRow = h('div', { class: 'chip-row' });
    const body = h('div', null,
      h('p', { class: 'muted small' }, L('The names are hidden: tap each state or province on the map. You can move and zoom the map.', 'Los nombres están ocultos: toca cada estado o provincia en el mapa. Puedes mover y acercar el mapa.')),
      countRow);
    const meta = this.app.data.meta;
    const cards: { el: HTMLElement; id: string; n: number }[] = [];
    const drawBest = () => { for (const c of cards) { const d = c.el.querySelector('.mode-best'); if (d) d.textContent = (() => { const b = this.regionBest(c.id, all, c.n); return b ? ` · ${L('Best', 'Récord')}: ${b}` : ''; })(); } };
    const drawCount = () => {
      clear(countRow);
      for (const [v, label] of [[false, L('10 questions', '10 preguntas')], [true, L('All of them', 'Todos')]] as const) {
        const b = h('button', { type: 'button', class: `chip${all === v ? ' on' : ''}`, 'data-count': v ? 'all' : '10' }, label);
        b.addEventListener('click', () => { all = v; drawCount(); drawBest(); });
        countRow.append(b);
      }
    };
    drawCount();
    const groups: [string, string][] = [['NA', t('cont.NA')], ['SA', t('cont.SA')], ['EU', t('cont.EU')], ['AS', t('cont.AS')], ['AF', t('cont.AF')], ['OC', t('cont.OC')]];
    const order = [...groups.filter(([c]) => c === continent), ...groups.filter(([c]) => c !== continent)];
    for (const [ct, label] of order) {
      const items = countries.filter((c) => (meta[c.id]?.ct ?? 'SS') === ct)
        .sort((a, b) => this.app.data.name(a.id, lang()).localeCompare(this.app.data.name(b.id, lang()), lang()));
      if (!items.length) continue;
      const grid = h('div', { class: 'mode-list' });
      for (const c of items) {
        const a2 = (meta[c.id]?.a2 ?? '').toLowerCase();
        const card = h('button', { type: 'button', class: 'mode-card', 'data-region': c.id },
          h('span', { class: 'mode-icon' }, a2 ? h('img', { class: 'quiz-pick-flag', src: dataUrl(`../flags/${a2}.svg`), alt: '' }) : '🗺️'),
          h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, this.app.data.name(c.id, lang())),
            h('span', { class: 'mode-desc' }, tx(c.what), h('span', { class: 'mode-best' }))));
        card.addEventListener('click', () => void this.startRegionQuiz(c.id, all));
        cards.push({ el: card, id: c.id, n: c.n });
        grid.append(card);
      }
      body.append(h('h3', { class: 'sec-title' }, label), grid);
    }
    drawBest();
    this.shell.openPanel('quiz-regions', L('States and provinces', 'Estados y provincias'), body);
  }

  /** Ten regions of a country (or all of them) to find on the map, with the country framed below the card. */
  private async startRegionQuiz(a3: string, all: boolean) {
    this.beforeStart?.();
    this.stopTour();
    this.shell.sheet.close();
    let list: Region[];
    try { list = await loadRegions(a3); } catch {
      this.shell.toast(L('This quiz needs its map data; check your connection.', 'Este concurso necesita sus datos de mapa; revisa tu conexión.'));
      return;
    }
    if (this.quiz) await this.stopQuiz(false);
    await this.clearFilters();
    const pick = shuffle(list.slice());
    const qs: Q[] = (all ? pick : pick.slice(0, 10)).map((r) => ({ id: r.id }));
    const labels = { ...this.app.renderer.settings.labels };
    Object.assign(this.app.renderer.settings.labels, { countries: false, capitals: false, cities: false });
    this.regions = { a3, list };
    this.focusRegion = null;
    this.quiz = { kind: 'region', region: a3, qs, i: 0, score: 0, answered: false, savedLabels: labels, peek: false, all };
    this.app.select(null);
    const flat = this.app.renderer.view.current.kind !== 'globe';
    if (flat) this.app.setProjection('globe');
    this.renderQuiz();
    // Once the card is up (and the globe back), the country is framed in the map left below it.
    setTimeout(() => {
      if (this.quiz?.kind !== 'region' || this.regions?.a3 !== a3) return;
      const m = this.app.data.meta[a3];
      const v = this.app.renderer.view;
      // The map's height once the card's inset has settled (it eases in).
      this.syncInset();
      const mapH = Math.max(200, v.h - this.insetGoal - (this.app.mode ? v.insetBottom : this.bottomGoal));
      // Room on the right for the zoom buttons, so no region sits under them (Campeche on a phone).
      const zb = document.querySelector<HTMLElement>('.zoombar')?.getBoundingClientRect();
      const right = zb && zb.width > 0 && zb.left > v.w / 2 ? Math.max(22, v.w - zb.left + 8) : 22;
      v.flyTo(frameRegions(v, list, m ? [m.lx, m.ly] : list[0].at, mapH, right), 1400);
      this.app.renderer.requestRender();
    }, flat ? 900 : 120);
  }

  /** How a region is drawn now (see RegionMark). */
  private regionMark(r: Region): RegionMark {
    const q = this.quiz!;
    if (this.focusRegion === r.id) return 'focus';
    if (q.done) { const x = q.qs.find((c) => c.id === r.id); return x ? (x.ok ? 'found' : 'lost') : undefined; }
    const cur = q.qs[q.i];
    if (q.answered && cur) {
      if (r.id === cur.id) return cur.ok ? 'ok' : 'answer';
      if (r.id === cur.pick) return 'wrong';
    }
    for (let k = 0; k < q.i; k++) if (q.qs[k].id === r.id) return q.qs[k].ok ? 'found' : 'lost';
    return undefined;
  }

  /** Brings a region into view when it is off the map (Alaska, the Canaries...). */
  private bringIntoView(r: Region) {
    const v = this.app.renderer.view;
    const p = v.project(r.at[0], r.at[1]);
    const inView = p && p[0] > 16 && p[0] < v.w - 16 && p[1] > v.insetTop + 16 && p[1] < v.h - v.insetBottom - 16;
    if (!inView) { v.flyTo({ lon: r.at[0], lat: r.at[1], zoom: v.zoom }, 1000); this.app.renderer.requestRender(); }
  }

  /** The player tapped a region (or asked to be shown, `null`). */
  private answerRegion(id: string | null) {
    const q = this.quiz, rg = this.regions;
    const cur = q?.qs[q.i];
    if (!q || !rg || !cur || q.answered) return;
    q.answered = true;
    const ok = id === cur.id;
    this.scored(ok);
    cur.ok = ok; cur.pick = id ?? undefined;
    const right = rg.list.find((r) => r.id === cur.id)!, tapped = id ? rg.list.find((r) => r.id === id) : undefined;
    const name = this.regionName(right);
    cur.given = tapped ? this.regionName(tapped) : L('no answer', 'sin respuesta');
    let text = ok ? L('Correct! That\'s {0}.', '¡Correcto! Es {0}.', name) : L('{0} is in yellow.', '{0} está en amarillo.', name);
    if (!ok && tapped) {
      const km = Math.round(geoDistance(tapped.at, right.at) * 6371);
      text = L('You tapped {0}. {1} is in yellow, {2} km away.', 'Tocaste {0}. {1} está en amarillo, a {2} km.', cur.given, name, km.toLocaleString(appLocale()));
    }
    this.bringIntoView(right);
    this.renderQuiz({ ok, text });
    this.app.renderer.requestRender();
  }

  /** "Where is Jalisco?", the country, and how to answer. */
  private renderRegionQuestion(cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!, rg = this.regions;
    const r = rg?.list.find((x) => x.id === cur.id);
    if (!rg || !r) return;
    add(this.card, h('div', { class: 'quiz-q' }, L('Where is {0}?', '¿Dónde está {0}?', this.regionName(r))),
      h('div', { class: 'quiz-item' }, `${flagEmoji(this.app.data.meta[rg.a3]?.a2)} ${this.app.data.name(rg.a3, lang())}`));
    if (!q.answered) {
      const skip = h('button', { type: 'button', class: 'pill sm' }, L('Show me', 'Muéstramelo'));
      skip.addEventListener('click', () => this.answerRegion(null));
      add(this.card, h('div', { class: 'tool-hint' }, L('Tap it on the map. You can move and zoom the map.', 'Tócalo en el mapa. Puedes mover y acercar el mapa.')), h('div', { class: 'tool-actions' }, skip));
    }
    if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
  }

  /** A region in the result: its shape, its name and, if missed, what was tapped; a tap shows it on the map. */
  private regionRow(cur: Q): HTMLElement {
    const r = this.regions?.list.find((x) => x.id === cur.id);
    const name = r ? this.regionName(r) : cur.id;
    const pic = h('span', { class: 'quiz-thumb' }, r ? h('img', { alt: '', src: regionThumb(r, cur.ok ? '#2e9e5b' : '#d9534f') }) : '🗺️');
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, pic,
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, name),
        h('span', { class: 'quiz-sum-ans' }, cur.ok ? '' : (cur.given ?? ''))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => {
      const q = this.quiz;
      if (!q || !r) return;
      this.focusRegion = r.id;
      this.bringIntoView(r);
      q.peek = true;
      this.renderQuiz();
      this.app.renderer.requestRender();
    });
    return row;
  }

  private async loadItems(kinds: StoryKind[]) {
    // A collection that can't be loaded (offline, not cached) is left out of the questions.
    await Promise.all(kinds.map(async (k) => {
      if (!this.items[k]) { try { this.items[k] = (await loadJSON<{ items: CollectionItem[] }>(`${COLLECTION_DIR[k]}/items.json`)).items; } catch { /* left out */ } }
    }));
    if (kinds.includes('eras') && !this.eras.size) {
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>('eras/index.json')).stories) this.eras.set(st.id, st);
    }
    if (kinds.includes('life') && !this.periods.length) {
      try { this.periods = (await loadJSON<{ units: Unit[] }>('paleo/timescale.json')).units.filter((u) => u.rank === 'period' && u.start <= 1000).sort((a, b) => b.start - a.start); } catch { /* "Which period?" says it needs the data */ }
    }
    if (kinds.includes('journeys') && !this.journeys.size) {
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>('journeys/index.json')).stories) this.journeys.set(st.id, st);
    }
    if (kinds.includes('beliefs') && !this.faiths.size) {
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>('beliefs/index.json')).stories) if (!FAITH_TOURS.includes(st.id)) this.faiths.set(st.id, st);
    }
    for (const [q, sq] of Object.entries(STORY_QUIZ) as [QuizKind, { kind: StoryKind; skip: string[] }][]) {
      if (!kinds.includes(sq.kind) || this.storySets.get(q)?.size) continue;
      const set = new Map<string, { name: { en: string; es: string }; icon: string }>();
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>(`${COLLECTION_DIR[sq.kind]}/index.json`)).stories) if (!sq.skip.includes(st.id)) set.set(st.id, st);
      this.storySets.set(q, set);
    }
    if (kinds.includes('people') && !this.civs.size) {
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>('people/index.json')).stories) if (CIV_STORIES.includes(st.id)) this.civs.set(st.id, st);
    }
  }

  /** The questions of the quizzes about the story collections (their items), or null without enough of them. */
  private async itemQs(kind: QuizKind, n: number): Promise<Q[] | null> {
    const needs: StoryKind[] = kind === 'dish' ? ['food'] : kind === 'era' ? ['eras'] : kind === 'civ' ? ['people'] : kind === 'period' ? ['life'] : kind === 'champion' ? ['games'] : kind === 'journey' ? ['journeys'] : kind === 'faith' ? ['beliefs'] : kind === 'script' ? ['writing'] : kind === 'plague' ? ['plagues'] : kind === 'disaster' ? ['disasters'] : kind === 'listen' ? ['music'] : kind === 'opening' ? ['books'] : kind === 'artist' ? ['art'] : kind === 'inventor' ? ['inventions'] : kind === 'site' ? [] : kind === 'where' ? ['structures', 'eras', 'food', 'people', 'life', 'games', 'journeys', 'beliefs', 'writing', 'plagues', 'disasters', 'music', 'art', 'inventions', 'heritage'] : ['structures', 'eras', 'food', 'writing', 'plagues', 'disasters', 'books', 'art', 'inventions'];
    try { await this.loadItems(needs); } catch { /* offline: the pool stays small */ }
    const tag = (k: StoryKind): QItem[] => (this.items[k] ?? []).map((it) => ({ ...it, kind: k }));
    const is = (it: QItem, ...types: string[]) => !!it.type && types.includes(it.type);
    let pool: QItem[] = [];
    if (kind === 'where') pool = [...tag('structures'), ...tag('eras').filter((it) => !is(it, 'person')), ...tag('food').filter((it) => is(it, 'dish', 'site')), ...tag('people').filter((it) => is(it, 'site', 'structure', 'fossil', 'work', 'culture')), ...tag('life').filter((it) => is(it, 'fossil', 'site', 'species', 'animal')), ...tag('games').filter((it) => is(it, 'games')), ...tag('journeys').filter((it) => is(it, 'place', 'site') && it.cat !== 'slavery'), ...tag('beliefs').filter((it) => is(it, 'site', 'structure')), ...tag('writing').filter((it) => is(it, 'site', 'work', 'structure')), ...tag('plagues').filter((it) => is(it, 'site', 'structure')), ...tag('disasters').filter((it) => is(it, 'site', 'event')), ...tag('music').filter((it) => is(it, 'genre', 'instrument')), ...tag('art').filter((it) => is(it, 'work')), ...tag('inventions').filter((it) => is(it, 'invention')), ...tag('heritage').filter((it) => is(it, 'site'))];
    if (kind === 'champion') pool = tag('games').filter((it) => is(it, 'games') && (it.podium?.length ?? 0) >= 4);
    if (kind === 'when') pool = [...tag('structures'), ...tag('eras').filter((it) => is(it, 'work', 'invention', 'structure', 'event', 'institution')), ...tag('food').filter((it) => is(it, 'dish')), ...tag('writing').filter((it) => is(it, 'script', 'work', 'invention')), ...tag('plagues').filter((it) => is(it, 'invention', 'work')), ...tag('disasters').filter((it) => is(it, 'event')), ...tag('books').filter((it) => is(it, 'work')), ...tag('art').filter((it) => is(it, 'work')), ...tag('inventions').filter((it) => is(it, 'invention'))];
    if (kind === 'dish') pool = tag('food').filter((it) => is(it, 'dish') && !!it.country && !!this.app.data.meta[it.country]);
    if (kind === 'era') pool = tag('eras').filter((it) => is(it, 'person', 'work', 'invention') && this.eras.has(it.story));
    if (kind === 'civ') pool = tag('people').filter((it) => is(it, 'person', 'work', 'structure', 'site', 'invention') && this.civs.has(it.story));
    if (kind === 'period') pool = tag('life').filter((it) => is(it, 'species', 'fossil', 'site') && this.periodOf(it) != null);
    // Not the travellers themselves (Marco Polo is in "Marco Polo's travels"), and nothing told by most of the stories.
    if (kind === 'journey') pool = tag('journeys').filter((it) => it.cat !== 'traveller' && this.journeys.has(it.story) && (it.also?.length ?? 0) < this.journeys.size - 4);
    // Enough faiths left for three wrong answers (Jerusalem is told by three of them).
    if (kind === 'faith') pool = tag('beliefs').filter((it) => !!this.faithOf(it) && this.faiths.size - [it.story, ...(it.also ?? [])].filter((x) => this.faiths.has(x)).length >= 3);
    // An item of an epidemic or a disaster, with three other stories left for the wrong answers, but not the
    // disease itself, nor an item whose name gives its story away (Krakatoa in "Krakatoa, 1883").
    const sq = STORY_QUIZ[kind], set = this.storySets.get(kind);
    if (sq && set) {
      pool = tag(sq.kind).filter((it) => {
        const told = [it.story, ...(it.also ?? [])].filter((x) => set.has(x));
        const n = tx(it.name).toLowerCase();
        return told.length > 0 && set.size - told.length >= 3 && !is(it, 'disease') && !told.some((x) => tx(set.get(x)!.name).toLowerCase().includes(n));
      });
    }
    // Scripts with a sample in letters other than Latin (an "ABC" would give the answer away).
    if (kind === 'script') {
      pool = tag('writing').filter((it) => is(it, 'script') && !!it.sample && /[^\u0000-\u024f\s\u2000-\u206f]/u.test(it.sample.text));
      this.scriptNames = new Map(pool.map((x) => [x.id ?? tx(x.name), x.name]));
    }
    // A clip, a line or a work's picture is the question; the answers are names of the same kind.
    if (kind === 'listen') pool = tag('music').filter((it) => !!it.audio);
    // Lines from books and poems (a writer's own card, with a line of theirs, is not "which book is it from?").
    if (kind === 'opening') pool = tag('books').filter((it) => is(it, 'work') && !!it.quote && it.quote.text.length >= 12);
    if (kind === 'artist') pool = tag('art').filter((it) => is(it, 'work') && !!it.by && !!(it.img || it.wiki) && tx(it.by).length <= 40 && !ANONYMOUS.test(it.by.en));
    // Who invented it?: inventions with a named inventor (not "unknown" or a whole people).
    if (kind === 'inventor') pool = tag('inventions').filter((it) => is(it, 'invention') && !!it.by && tx(it.by).length <= 40 && !ANONYMOUS.test(it.by.en) && !/many other|Department of/i.test(it.by.en));
    // Which World Heritage site?: the better-known sites on the list (in many Wikipedias) that have a picture.
    if (kind === 'site') pool = await this.heritagePool();
    if (HIDDEN_NAME.includes(kind) || kind === 'inventor') {
      this.optNames = new Map(pool.map((x) => kind === 'artist' || kind === 'inventor' ? [x.by!.en, x.by!] : [x.id ?? x.name.en, x.name]));
    }
    if (pool.length < 10 || (HIDDEN_NAME.includes(kind) && this.optNames.size < 4) || (kind === 'era' && this.eras.size < 4) || (kind === 'civ' && this.civs.size < 4) || (kind === 'period' && this.periods.length < 4) || (kind === 'journey' && this.journeys.size < 4) || (kind === 'faith' && this.faiths.size < 4) || (!!sq && (set?.size ?? 0) < 4)) return null;
    const picks = shuffle(pool.slice()).slice(0, n);
    const countries = [...new Set(pool.map((x) => x.country).filter((c): c is string => !!c))];
    const qs: Q[] = picks.map((it) => {
      if (kind === 'when') { const y = yearOf(it.end ?? it.date); return { id: String(y), item: it, options: yearOptions(y).map(String) }; }
      if (kind === 'dish') return { id: it.country!, item: it, options: shuffle([it.country!, ...shuffle(countries.filter((c) => c !== it.country)).slice(0, 3)]) };
      // The wrong answers leave out the other stories that tell the same item (`also`).
      const others = (keys: Iterable<string>) => shuffle([...keys].filter((x) => x !== it.story && !it.also?.includes(x))).slice(0, 3);
      if (kind === 'era') return { id: it.story, item: it, options: shuffle([it.story, ...others(this.eras.keys())]) };
      if (kind === 'civ') return { id: it.story, item: it, options: shuffle([it.story, ...others(this.civs.keys())]) };
      if (kind === 'journey') return { id: it.story, item: it, options: shuffle([it.story, ...others(this.journeys.keys())]) };
      if (kind === 'faith') { const f = this.faithOf(it)!; return { id: f, item: it, options: shuffle([f, ...others(this.faiths.keys())]) }; }
      if (sq && set) { const f = [it.story, ...(it.also ?? [])].find((x) => set.has(x))!; return { id: f, item: it, options: shuffle([f, ...others(set.keys())]) }; }
      if (kind === 'script') { const id = it.id ?? tx(it.name); return { id, item: it, options: shuffle([id, ...shuffle([...this.scriptNames.keys()].filter((x) => x !== id)).slice(0, 3)]) }; }
      if (kind === 'listen' || kind === 'opening') {
        const id = it.id ?? it.name.en;
        // Instruments with instruments, pieces with pieces, styles with styles (any other clip when there are too few).
        const like = pool.filter((x) => (x.id ?? x.name.en) !== id && (kind === 'opening' || soundKind(x.type) === soundKind(it.type)));
        const rest = like.length >= 3 ? like : pool.filter((x) => (x.id ?? x.name.en) !== id);
        return { id, item: it, options: shuffle([id, ...shuffle([...new Set(rest.map((x) => x.id ?? x.name.en))]).slice(0, 3)]) };
      }
      if (kind === 'site') {
        // Three other sites of the same continent, of about the same fame.
        const id = it.id!;
        const cont = (x: QItem) => this.app.data.meta[x.country ?? '']?.ct;
        const same = pool.filter((x) => x.id !== id && cont(x) === cont(it));
        const near = (same.length >= 6 ? same : pool.filter((x) => x.id !== id)).map((x) => [x.id!, Math.abs((x.pop ?? 0) - (it.pop ?? 0))] as const)
          .sort((a, b) => a[1] - b[1]).slice(0, 10).map(([n]) => n);
        return { id, item: it, options: shuffle([id, ...shuffle(near).slice(0, 3)]) };
      }
      if (kind === 'artist' || kind === 'inventor') {
        // Three other artists, from the closest in time of the eight nearest (Monet with Renoir, not with the Lascaux painters).
        const id = it.by!.en;
        const near = [...new Map(pool.filter((x) => x.by!.en !== id).map((x) => [x.by!.en, Math.abs(x.t - it.t)] as const)).entries()]
          .sort((a, b) => a[1] - b[1]).slice(0, 8).map(([n]) => n);
        return { id, item: it, options: shuffle([id, ...shuffle(near).slice(0, 3)]) };
      }
      if (kind === 'period') return { id: this.periodOf(it)!, item: it, options: this.periodOptions(this.periodOf(it)!) };
      // "Who won?": the winner and the next three of the same Games.
      if (kind === 'champion') return { id: it.podium![0].c, item: it, options: shuffle(it.podium!.slice(0, 4).map((p) => p.c)) };
      return { id: it.story, item: it };
    });
    return qs.map((x) => ({ ...x, kind }));
  }

  // ---- Beyond Earth: Which world is this? and Who landed here?

  /** Ten worlds, each turned to a random side, and four names to choose from. */
  private async worldQs(n: number): Promise<Q[]> {
    const ids = WORLDS.map((w) => w.id);
    return shuffle(ids.slice()).slice(0, n).map((id) => ({ id, kind: 'world' as QuizKind, options: shuffle([id, ...shuffle(ids.filter((x) => x !== id)).slice(0, 3)]), space: { world: id } }));
  }

  /** Ten landing sites on the Moon and Mars (not the crashes), each with three other missions to the same world. */
  private async landedQs(n: number): Promise<Q[] | null> {
    this.landings = await loadLandings();
    // Not the crashes and impacts, nor Ingenuity (it landed with Perseverance: two right answers).
    const pool = this.landings.filter((l) => (l.world === 'moon' || l.world === 'mars') && l.kind !== 'crash' && l.kind !== 'impact' && l.kind !== 'helicopter');
    if (pool.length < 8) return null;
    return shuffle(pool.slice()).slice(0, n).map((l) => {
      const same = pool.filter((x) => x.world === l.world && x.id !== l.id && tr(x.name) !== tr(l.name));
      return { id: l.id, kind: 'landed' as QuizKind, options: shuffle([l.id, ...shuffle(same).slice(0, 3).map((x) => x.id)]), space: { world: l.world, at: l.at } };
    });
  }
  private landings: Landing[] = [];

  private renderSpaceQuestion(kind: QuizKind, cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const w = worldById(cur.space!.world);
    const question = kind === 'world' ? L('Which world is this?', '¿Qué mundo es este?')
      : L('Who landed here, on {0}?', '¿Quién aterrizó aquí, en {0}?', w ? trIn(w.name) : '');
    add(this.card, h('div', { class: 'quiz-q' }, question));
    if (kind === 'world' && !q.answered) add(this.card, h('div', { class: 'tool-hint' }, L('Turn the globe to look around.', 'Gira el globo para mirar.')));
    const opts = h('div', { class: 'quiz-opts' });
    for (const o of cur.options ?? []) {
      const b = h('button', { type: 'button', class: 'pill quiz-opt', 'data-opt': o }, this.optionLabel(kind, o, cur)) as HTMLButtonElement;
      if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
      b.addEventListener('click', () => this.answerOption(o, b));
      opts.append(b);
    }
    add(this.card, opts);
    if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
  }

  private answerSpace(kind: QuizKind, cur: Q, ok: boolean) {
    const right = this.optionLabel(kind, cur.id, cur);
    // The names (and the landings) come out on the map.
    this.space?.quizReveal();
    if (kind === 'world') {
      void loadFacts().then((f) => {
        const x = f.get(cur.id);
        const wow = x?.wow ? ` ${tr(x.wow)}` : '';
        const name = ok ? right : (worldById(cur.id) ? trIn(worldById(cur.id)!.name) : right);
        this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It was ', 'Era ')}${name}.${wow}` });
      });
      return;
    }
    const l = this.landings.find((x) => x.id === cur.id);
    this.pin = null;
    const when = l ? new Date(`${l.date}T00:00:00Z`).toLocaleDateString(appLocale(), { year: 'numeric', month: 'long', day: l.date.length > 7 ? 'numeric' : undefined, timeZone: 'UTC' }) : '';
    this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It was ', 'Era ')}${right}${l ? ` · ${when}${l.site ? ` · ${tr(l.site)}` : ''}` : ''}.` });
  }

  private spaceRow(kind: QuizKind, cur: Q): HTMLElement {
    const right = this.optionLabel(kind, cur.id, cur);
    const yours = cur.ok ? '' : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : L('no answer', 'sin respuesta');
    const pic = h('span', { class: 'quiz-thumb' }, h('img', { src: thumbUrl(cur.space!.world), alt: '' }));
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, pic,
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, right), h('span', { class: 'quiz-sum-ans' }, yours)),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => {
      const q = this.quiz;
      if (!q || !this.space) return;
      void this.space.quizShow(cur.space!.world, cur.space!.at).then(() => this.space?.quizReveal());
      q.peek = true;
      this.renderQuiz();
    });
    return row;
  }

  // ---- The stars: Which constellation? and Where was this element made?

  /** Ten constellations with a bright star to find them by, each with three others to choose from. */
  private async constellationQs(n: number): Promise<Q[] | null> {
    const d = await this.sky?.load();
    if (!d) return null;
    const pool = d.cons.filter((c) => c.lines.length && c.brightest != null && (d.byHip.get(c.brightest)?.mag ?? 9) < 3.2);
    if (pool.length < 8) return null;
    return shuffle(pool.slice()).slice(0, n).map((c) => ({ id: c.id, kind: 'constellation' as QuizKind, options: shuffle([c.id, ...shuffle(pool.filter((x) => x.id !== c.id)).slice(0, 3).map((x) => x.id)]), sky: { con: c.id } }));
  }

  /** The quiz opened the sky (it closes it when it ends). */
  private skyQuiz = false;
  private els: Element[] = [];
  /** Ten elements made mostly (60 % or more) one way; the answer is that way, among four. */
  private async elementQs(n: number): Promise<Q[] | null> {
    this.els = (await this.elements?.load().catch(() => null)) ?? [];
    const pool = this.els.filter((e) => { const m = mainOrigin(e); return m !== 'none' && (e.origin[m] ?? 0) >= 0.6; });
    if (pool.length < 8) return null;
    return shuffle(pool.slice()).slice(0, n).map((e) => {
      const right = mainOrigin(e);
      const others = shuffle(ORIGINS.map((o) => o.id).filter((x) => x !== right && x !== 'none')).slice(0, 3);
      return { id: right, kind: 'element' as QuizKind, options: shuffle([right, ...others]), sky: { el: e.symbol } };
    });
  }
  private elementOf(cur: Q): Element | undefined { return this.els.find((e) => e.symbol === cur.sky?.el); }

  private renderSkyQuestion(kind: QuizKind, cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    if (kind === 'constellation') {
      add(this.card, h('div', { class: 'quiz-q' }, L('Which constellation is this?', '¿Qué constelación es esta?')));
      if (!q.answered) add(this.card, h('div', { class: 'tool-hint' }, L('Drag the sky to look around it.', 'Arrastra el cielo para mirar alrededor.')));
    } else {
      const e = this.elementOf(cur);
      add(this.card, h('div', { class: 'quiz-q' }, L('Where was most of this element made?', '¿Dónde se formó la mayor parte de este elemento?')));
      if (e) add(this.card, h('div', { class: 'quiz-element' }, h('span', { class: 'quiz-el-sym' }, e.symbol), h('span', { class: 'quiz-el-name' }, `${tr(e.name)} · ${L('atomic number', 'número atómico')} ${e.z}`)));
    }
    const opts = h('div', { class: 'quiz-opts' });
    for (const o of cur.options ?? []) {
      const b = h('button', { type: 'button', class: 'pill quiz-opt', 'data-opt': o }, this.optionLabel(kind, o, cur)) as HTMLButtonElement;
      if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
      b.addEventListener('click', () => this.answerOption(o, b));
      opts.append(b);
    }
    add(this.card, opts);
    if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
  }

  private answerSky(kind: QuizKind, cur: Q, ok: boolean) {
    const right = this.optionLabel(kind, cur.id, cur);
    if (kind === 'constellation') {
      // The names come out.
      this.sky?.setFocus(cur.id, false);
      const c = this.sky?.loaded?.cons.find((x) => x.id === cur.id);
      const extra = c?.meaning ? ` (${tr(c.meaning).replace(/^(The|El|La|Los|Las) /, (m) => m.toLowerCase())})` : '';
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It was ', 'Era ')}${right}${extra}.` });
      return;
    }
    const e = this.elementOf(cur);
    const shares = e ? Object.entries(e.origin).filter(([, f]) => f >= 0.05).sort((a, b) => b[1] - a[1]).map(([id, f]) => `${Math.round(f * 100)} % ${originName(id).toLowerCase()}`).join(', ') : right;
    this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('Not quite. ', 'No exactamente. ')}${e ? `${tr(e.name)}: ` : ''}${shares}.${e?.made ? ` ${tr(e.made)}` : ''}` });
  }

  private skyRow(kind: QuizKind, cur: Q): HTMLElement {
    const right = this.optionLabel(kind, cur.id, cur);
    const e = kind === 'element' ? this.elementOf(cur) : undefined;
    const yours = cur.ok ? '' : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : L('no answer', 'sin respuesta');
    const pic = h('span', { class: 'quiz-thumb quiz-el-thumb' }, e ? e.symbol : '✳️');
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, pic,
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, e ? `${tr(e.name)}: ${right}` : right), h('span', { class: 'quiz-sum-ans' }, yours)),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => {
      if (e) { void this.elements?.card(e); return; }
      void this.sky?.show({ frame: 'celestial', target: cur.id, bare: false, focus: cur.id });
    });
    return row;
  }

  // ---- Put them in order

  /** Things from the stories with a date a person can place: buildings, works, inventions and dishes (not those
   *  built or made over more than 50 years, whose date would be unclear). */
  private async orderPool(): Promise<QItem[]> {
    try { await this.loadItems(['structures', 'eras', 'food', 'writing', 'plagues', 'disasters', 'books', 'art', 'inventions']); } catch { /* offline: fewer */ }
    const tag = (k: StoryKind): QItem[] => (this.items[k] ?? []).map((it) => ({ ...it, kind: k }));
    const is = (it: QItem, ...types: string[]) => !!it.type && types.includes(it.type);
    const all = [...tag('structures'), ...tag('eras').filter((it) => is(it, 'work', 'invention', 'structure')), ...tag('food').filter((it) => is(it, 'dish')), ...tag('writing').filter((it) => is(it, 'script', 'work', 'invention')), ...tag('plagues').filter((it) => is(it, 'invention', 'work')), ...tag('books').filter((it) => is(it, 'work')), ...tag('art').filter((it) => is(it, 'work')), ...tag('inventions').filter((it) => is(it, 'invention'))];
    const seen = new Set<string>();
    // Not a name that gives its year away ("Paris 1924").
    const dated = (it: QItem) => /\b\d{3,4}\b/.test(`${it.name.en} ${it.name.es}`);
    return all.filter((it) => {
      const k = itemKey(it);
      if (seen.has(k) || !Number.isFinite(it.t) || dated(it) || (it.end && yearOf(it.end) - it.t > 50)) return false;
      seen.add(k);
      return true;
    });
  }

  private async orderQs(n: number): Promise<Q[] | null> {
    const pool = await this.orderPool();
    if (pool.length < 40) return null;
    return orderRounds(pool, n, 4, rand, itemKey).map((set) => ({ id: 'order', kind: 'order' as QuizKind, set, picked: [] }));
  }

  // ---- Time detective

  private async loadDetective(): Promise<boolean> {
    if (this.det && this.detLabels.size) return true;
    try {
      const [d, ys] = await Promise.all([loadJSON<DetData>('history/detective.json'), this.time.history.years()]);
      this.det = d;
      for (const y of ys) this.detLabels.set(y.year, { en: y.en, es: y.es });
      return true;
    } catch { return false; }
  }

  private async detectiveQs(n: number): Promise<Q[] | null> {
    if (!(await this.loadDetective())) return null;
    const qs = detectiveQuestions(this.det!, n, rand);
    return qs.length ? qs.map((d) => ({ id: String(d.year), kind: 'detective' as QuizKind, options: d.options.map(String), det: d })) : null;
  }

  /** "1815", "AD 200", "500 BC" (as on the borders timeline). */
  private yearLabel(y: number | string): string {
    const l = this.detLabels.get(Number(y));
    return l ? (tx(l)) : String(y);
  }

  // ---- Which country in between? (a Border hop of one country, from the Map games' border data)

  private hopGraph: Borders | null | undefined;
  private hopList: [string, string, string][] | null = null;
  private hopShow: Q | null = null;
  /** Two countries that do not touch, no more than 2,500 km apart, with just one neighbour in common by land ([a, between,
   *  b]). Borders that only an exclave makes (Kaliningrad, Nakhchivan, Cabinda) are left out: from Germany to Russia is
   *  not via Poland. */
  private async hopPairs(): Promise<[string, string, string][]> {
    if (this.hopList) return this.hopList;
    if (this.hopGraph === undefined) {
      try {
        const data = await loadJSON<BorderData>('play/borders.json');
        this.hopGraph = new Borders({ ...data, links: [], land: data.land.filter((x) => !HOP_SKIP.includes(x[2] ?? '')) });
      } catch { this.hopGraph = null; }
    }
    const g = this.hopGraph;
    if (!g) return [];
    const ok = new Set(this.pool('world'));
    const out: [string, string, string][] = [];
    for (const a of [...ok].sort()) {
      const na = new Set(g.neighbours(a));
      for (const m of na) {
        if (!this.app.data.meta[m]) continue;
        for (const b of g.neighbours(m)) {
          if (b <= a || !ok.has(b) || na.has(b)) continue;
          const common = g.neighbours(b).filter((x) => na.has(x));
          // Near enough to be a question about a region, not "Mongolia to Norway through Russia".
          const pa = this.app.data.meta[a], pb = this.app.data.meta[b];
          if (common.length === 1 && geoDistance([pa.lx, pa.ly], [pb.lx, pb.ly]) * 6371 <= 2500) out.push([a, m, b]);
        }
      }
    }
    this.hopList = out.sort((x, y) => x.join().localeCompare(y.join()));
    return this.hopList;
  }

  /** Questions: the country between two others, among four (the wrong ones border one of the two, never both). */
  private async hopQs(n: number, region = 'world'): Promise<Q[]> {
    const all = await this.hopPairs();
    const g = this.hopGraph;
    if (!g || !n) return [];
    const meta = this.app.data.meta;
    // A continent's pairs first; when it has too few (South America, Oceania), others make up the ten.
    const here = (x: [string, string, string]) => region === 'world' || meta[x[0]]?.ct === region || meta[x[2]]?.ct === region;
    const mine = shuffle(all.filter(here)).slice(0, n);
    const list = [...mine, ...shuffle(all.filter((x) => !here(x))).slice(0, n - mine.length)];
    const pool = this.pool('world');
    return list.map(([a, m, b]) => {
      const near = [...new Set([...g.neighbours(a), ...g.neighbours(b)])].filter((x) => x !== m && x !== a && x !== b && meta[x]).sort();
      const wrong = shuffle(near).slice(0, 3);
      if (wrong.length < 3) wrong.push(...shuffle(pool.filter((x) => meta[x].ct === meta[m].ct && ![m, a, b, ...wrong].includes(x)).sort()).slice(0, 3 - wrong.length));
      const [x, y] = rand() < 0.5 ? [a, b] : [b, a];
      return { id: m, kind: 'hop' as QuizKind, options: shuffle([m, ...wrong]), hop: { a: x, b: y } };
    });
  }

  private hopQuestion(hp: { a: string; b: string }): string {
    const A = this.app.data.name(hp.a, lang()), B = this.app.data.name(hp.b, lang());
    return L('Which country do you cross from {0} to {1}?', '¿Qué país cruzas para ir de {0} a {1}?', A, B);
  }

  /** "Peru → Bolivia → Paraguay". */
  private hopWay(cur: Q): string {
    return [cur.hop!.a, cur.id, cur.hop!.b].map((x) => this.app.data.name(x, lang())).join(' → ');
  }

  /** Frames a few countries on the globe. */
  private fitCountries(ids: string[]) {
    const pts = ids.map((id) => this.app.data.meta[id]).filter(Boolean).map((m) => [m.lx, m.ly] as [number, number]);
    if (!pts.length) return;
    let x = 0, y = 0, z = 0;
    for (const [lo, la] of pts) { const p = (lo * Math.PI) / 180, q = (la * Math.PI) / 180; x += Math.cos(q) * Math.cos(p); y += Math.cos(q) * Math.sin(p); z += Math.sin(q); }
    const lon = (Math.atan2(y, x) * 180) / Math.PI, lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    let span = 0;
    for (const p of pts) for (const q of pts) span = Math.max(span, (geoDistance(p, q) * 180) / Math.PI);
    const zoom = Math.max(1.1, Math.min(6.5, 140 / Math.max(8, span * 1.6))) * (window.innerWidth < 600 ? 0.85 : 1);
    this.app.renderer.view.flyTo({ lon, lat, zoom });
  }

  /** The two countries (green and gold), and once answered the one between them (magenta, outlined), with their names. */
  private drawHop(rc: RenderCtx) {
    const q = this.quiz, cur = this.hopShow;
    if (!q || !cur?.hop) return;
    const reveal = q.done || (q.answered && q.qs[q.i] === cur);
    const { ctx } = rc;
    ctx.save(); ctx.globalAlpha = 0.85;
    rc.fillCountry(cur.hop.a, '#2ecc71');
    rc.fillCountry(cur.hop.b, '#f5c542');
    // Magenta: unlike a blue, it stands out among the political map's colours (Poland among Europe's blues).
    if (reveal) rc.fillCountry(cur.id, '#e84393');
    ctx.restore();
    for (const id of reveal ? [cur.hop.a, cur.id, cur.hop.b] : [cur.hop.a, cur.hop.b]) {
      const m = this.app.data.meta[id], p = m && rc.project(m.lx, m.ly);
      // The answer's name first, so it is the one kept when the names would overlap.
      if (p) rc.labels.add({ text: this.app.data.name(id, lang()), x: p[0], y: p[1], align: 'center', priority: id === cur.id ? 3200 : 3000, size: 12.5, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    }
  }

  // ---- Which museum is it in? (the art guide, v0.27.0)

  private artData: ArtData | null = null;
  /** Questions: a well-known work with its picture; its museum among four. */
  private async museumQs(n: number): Promise<Q[]> {
    const art = (this.artData ??= await loadArt());
    if (!art || !n) return [];
    const pool = art.works.filter((w) => w.img && w.sl >= 20).sort((a, b) => b.sl - a.sl || a.id.localeCompare(b.id));
    const museums = art.museums.slice(0, 120).map((m) => m.id);
    const used = new Set<string>();
    const out: Q[] = [];
    for (const w of shuffle(pool.slice())) {
      if (out.length >= n || used.has(w.museum.id)) continue;
      used.add(w.museum.id);
      const wrong = shuffle(museums.filter((m) => m !== w.museum.id && art.museumById.get(m)!.city !== w.museum.city)).slice(0, 3);
      out.push({ id: w.museum.id, kind: 'museum', options: shuffle([w.museum.id, ...wrong]), art: { work: w.id } });
    }
    return out;
  }
  /** "Louvre, Paris". */
  private museumLabel(id: string): string {
    const m = this.artData?.museumById.get(id);
    if (!m) return id;
    const city = (window as { atlas?: { guide: { cityLabel(id: string): string | null } } }).atlas?.guide.cityLabel(m.city);
    return `${artName(m)}${city ? `, ${city}` : ''}`;
  }
  /** "Mona Lisa (Leonardo da Vinci, 1503)". */
  private workTitle(id: string): string {
    const w = this.artData?.works.find((x) => x.id === id);
    if (!w) return id;
    const by = [w.artist ? artName(w.artist) : '', yearText(w.year)].filter(Boolean).join(', ');
    return `${artName(w)}${by ? ` (${by})` : ''}`;
  }
  private museumQuestion(cur: Q) {
    const w = this.artData?.works.find((x) => x.id === cur.art!.work);
    if (!w) return;
    const img = h('img', { class: 'quiz-img', alt: '', src: commonsUrl(w.img!, 480) }) as HTMLImageElement;
    add(this.card, h('div', { class: 'quiz-q' }, L('Which museum is it in?', '¿En qué museo está?')), h('div', { class: 'quiz-item' }, `🖼️ ${this.workTitle(w.id)}`), zoomable(img));
  }

  // ---- Where does it live? and Who lives here? (Wild world, v0.30.0)

  private wildQuiz: WildData | null = null;
  private wildShow: Animal | null = null;
  private async loadWildQuiz() { this.wildQuiz ??= await loadWild(); return this.wildQuiz; }
  /** The best-known animals with a picture, not gone, each kind of animal once (one big cat, one penguin). */
  private wildPool(d: WildData): Animal[] {
    return d.animals.filter((a) => !a.gone && a.img && a.cells.length >= 3 && a.sl >= 40).sort((a, b) => b.sl - a.sl || a.id.localeCompare(b.id)).slice(0, 220);
  }
  /** Questions: an animal with its photo; tap where it lives. */
  private async habitatQs(n: number): Promise<Q[]> {
    const d = await this.loadWildQuiz();
    if (!d || !n) return [];
    const out: Q[] = [];
    const fams = new Set<string>();
    for (const a of shuffle(this.wildPool(d).slice())) {
      if (out.length >= n || fams.has(a.fam ?? a.id)) continue;
      fams.add(a.fam ?? a.id);
      const top = a.cells[a.counts.indexOf(Math.max(...a.counts))] ?? a.cells[0];
      const names = (l: 'en' | 'es') => a.cc.slice(0, 3).map((c) => this.app.data.name(c, l)).join(', ');
      const item = { id: a.id, name: { en: a.n[0], es: a.n[1] }, at: cellCenter(top), icon: a.e, img: a.img, type: 'species', kind: 'life', cat: 'mammal', text: { en: '', es: '' }, story: '', step: 0, place: { en: names('en'), es: names('es') } } as unknown as QItem;
      out.push({ id: a.id, kind: 'habitat', item });
    }
    return out;
  }
  /** Questions: a place where an animal lives (where it is seen most); it and three that don't live near there. */
  private async livesQs(n: number): Promise<Q[]> {
    const d = await this.loadWildQuiz();
    if (!d || !n) return [];
    const pool = this.wildPool(d);
    const out: Q[] = [];
    const used = new Set<string>();
    for (const a of shuffle(pool.slice())) {
      if (out.length >= n || used.has(a.fam ?? a.id)) continue;
      // A square where it is seen often, away from the edges of its range.
      const strong = Array.from(a.cells).filter((_, i) => a.counts[i] >= Math.max(...a.counts) - 2);
      const c = strong[Math.floor(rand() * strong.length)] ?? a.cells[0];
      const at = cellCenter(c);
      const near = new Set<number>();
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) near.add(cellAt(at[0] + dx * 1.40625, at[1] + dy * 1.40625));
      const wrong = shuffle(pool.filter((b) => b !== a && b.g === a.g && b.fam !== a.fam && ![...near].some((k) => livesIn(b, k)))).slice(0, 3);
      if (wrong.length < 3) continue;
      used.add(a.fam ?? a.id);
      out.push({ id: a.id, kind: 'lives', options: shuffle([a.id, ...wrong.map((b) => b.id)]), wild: { at } });
    }
    return out;
  }
  /** "🐆 Jaguar". */
  private animalLabel(id: string): string {
    const a = this.wildQuiz?.byId.get(id);
    return a ? `${a.e} ${es() ? a.n[1] : a.n[0]}` : id;
  }

  // ---- Where does it grow? and When is it? (Green planet, v0.31.0)

  private greenQuiz: GreenData | null = null;
  private greenShow: Plant | null = null;
  private calQuiz: Spectacle[] | null = null;
  private async loadGreenQuiz() { [this.greenQuiz, this.calQuiz] = await Promise.all([this.greenQuiz ?? loadGreen(), this.calQuiz ?? loadCalendar()]); return this.greenQuiz; }
  /** Questions: a plant with its photo; tap where it grows wild (the best known, one of each family). */
  private async growsQs(n: number): Promise<Q[]> {
    const d = await this.loadGreenQuiz();
    if (!d || !n) return [];
    const out: Q[] = [];
    const fams = new Set<string>();
    const pool = d.plants.filter((p) => p.img && p.cells.length >= 2 && p.sl >= 25).sort((a, b) => b.sl - a.sl || a.id.localeCompare(b.id)).slice(0, 200);
    for (const p of shuffle(pool)) {
      if (out.length >= n || fams.has(p.fam ?? p.id)) continue;
      fams.add(p.fam ?? p.id);
      const top = p.cells[p.counts.indexOf(Math.max(...p.counts))] ?? p.cells[0];
      const names = (l: 'en' | 'es') => p.cc.slice(0, 3).map((c) => this.app.data.name(c, l)).join(', ');
      const item = { id: p.id, name: { en: p.n[0], es: p.n[1] }, at: cellCenter(top), icon: p.e, img: p.img, type: 'species', kind: 'life', cat: 'plant', text: { en: '', es: '' }, story: '', step: 0, place: { en: names('en'), es: names('es') } } as unknown as QItem;
      out.push({ id: p.id, kind: 'grows', item });
    }
    return out;
  }
  /** Questions: one of nature's spectacles and four months, one its best, three when it doesn't happen at all. */
  private async seasonQs(n: number): Promise<Q[]> {
    await this.loadGreenQuiz();
    const cal = this.calQuiz;
    if (!cal?.length || !n) return [];
    const out: Q[] = [];
    for (const s of shuffle(cal.filter((x) => x.months.length <= 5).slice().sort((a, b) => a.id.localeCompare(b.id)))) {
      if (out.length >= n) break;
      // Wrong months a month away from its season at least, so none is nearly right.
      const off = (m: number) => !s.months.some((k) => Math.min(Math.abs(k - m), 12 - Math.abs(k - m)) <= 1);
      const wrong = shuffle(Array.from({ length: 12 }, (_, i) => i + 1).filter(off)).slice(0, 3);
      if (wrong.length < 3) continue;
      out.push({ id: String(s.peak), kind: 'season', options: shuffle([String(s.peak), ...wrong.map(String)]), green: { spectacle: s.id } });
    }
    return out;
  }
  // ---- How deep? and Down to the core (v0.32.0)
  private deepItems: DownThing[] | null = null;
  private async loadDeep(): Promise<DownThing[]> {
    if (this.deepItems) return this.deepItems;
    type Raw = { id: string; depth_m: number; below: 'ground' | 'sea'; kind: string; name: { en: string; es: string }; place: { en: string; es: string } };
    const icon: Record<string, string> = { metro: '🚇', basement: '🏢', cave: '🕳️', mine: '⛏️', borehole: '🛢️', tunnel: '🚄', lake: '🏞️', trench: '🌊', wreck: '🚢', dive: '🤿', life: '🦠', quake: '💥', moho: '🪨', canyon: '🏜️', other: '📍' };
    const conv = (x: Raw): DownThing => ({ id: x.id, e: x.kind === 'life' && /fish/.test(x.id) ? '🐟' : icon[x.kind] ?? '📍', name: [x.name.en, x.name.es], place: [x.place.en, x.place.es], m: x.depth_m, below: x.below });
    const [hd, ins] = await Promise.all([loadJSON<{ items: Raw[] }>('earth/howdeep.json').catch(() => ({ items: [] })), loadJSON<{ markers: Raw[] }>('earth/inside.json').catch(() => ({ markers: [] }))]);
    const by = new Map<string, DownThing>();
    for (const x of [...hd.items, ...ins.markers]) if (x.depth_m > 0 && !by.has(x.id)) by.set(x.id, conv(x));
    // v0.33.0: sea animals at the deepest they go, and wrecks.
    type SA = { id: string; e: string; name: { en: string; es: string }; depth: [number, number] };
    type WR = { id: string; name: { en: string; es: string }; place: { en: string; es: string }; depth_m: number };
    const [sa, wr] = await Promise.all([loadJSON<{ animals: SA[] }>('ocean/animals.json').catch(() => ({ animals: [] as SA[] })), loadJSON<{ wrecks: WR[] }>('ocean/wrecks.json').catch(() => ({ wrecks: [] as WR[] }))]);
    for (const a of sa.animals) if (a.depth[1] >= 50) by.set(`sea-${a.id}`, { id: `sea-${a.id}`, e: a.e, name: [`${a.name.en}, at its deepest`, `${a.name.es}, a su mayor profundidad`], place: ['Ocean', 'Océano'], m: a.depth[1], below: 'sea' });
    for (const w of wr.wrecks) if (w.depth_m >= 50) by.set(`wreck-${w.id}`, { id: `wreck-${w.id}`, e: '⚓', name: [w.name.en, w.name.es], place: [w.place.en, w.place.es], m: w.depth_m, below: 'sea' });
    this.deepItems = [...by.values()];
    return this.deepItems;
  }
  private deepLabel(id: string, withDepth = false): string {
    const x = this.deepItems?.find((d) => d.id === id);
    if (!x) return id;
    return `${x.e} ${es() ? x.name[1] : x.name[0]}${withDepth ? `: ${this.depthLabel(x)}` : ''}`;
  }
  private depthLabel(x: DownThing): string {
    const v = x.m >= 10000 ? `${fmtNumber(Math.round(x.m / 1000))} km` : `${fmtNumber(Math.round(x.m))} m`;
    return x.below === 'sea' ? L('{0} below sea level', '{0} bajo el nivel del mar', v) : v;
  }
  /** Which of two goes deeper: pairs far enough apart (one at least a third deeper) to be fair. */
  /** Name the sea feature (v0.33.0): a famous undersea feature under a pin; its name among four. */
  private async seaFeatureQs(n: number): Promise<Q[]> {
    type F = { id: string; name: { en: string; es: string }; kind: string; lon: number; lat: number; rank: number; text: { en: string; es: string } };
    const fs = (await loadJSON<{ famous: F[] }>('ocean/features.json').catch(() => ({ famous: [] as F[] }))).famous.filter((f) => f.rank <= 2);
    if (fs.length < 4) return [];
    const labels = Object.fromEntries(fs.map((f) => [f.id, tx(f.name)]));
    return shuffle(fs.slice()).slice(0, n).map((f) => {
      // Wrong answers: far enough away that the pin tells them apart, of the same kind first.
      const far = fs.filter((g) => g.id !== f.id && Math.hypot(g.lon - f.lon, g.lat - f.lat) > 12);
      const wrong = [...shuffle(far.filter((g) => g.kind === f.kind)), ...shuffle(far.filter((g) => g.kind !== f.kind))].slice(0, 3).map((g) => g.id);
      return { id: f.id, kind: 'seafeature' as QuizKind, options: shuffle([f.id, ...wrong]), sea: { at: [f.lon, f.lat] as [number, number], prompt: L('What is under the pin?', '¿Qué hay bajo el alfiler?'), labels, note: tx(f.text) } };
    });
  }
  /** Which ocean zone? (v0.33.0): a sea animal; the zone it lives in most often. */
  private async zoneQs(n: number): Promise<Q[]> {
    type A = { id: string; e: string; name: { en: string; es: string }; depth: [number, number]; usual: number; text: { en: string; es: string } };
    const as = (await loadJSON<{ animals: A[] }>('ocean/animals.json').catch(() => ({ animals: [] as A[] }))).animals;
    if (as.length < 4) return [];
    const zones: [string, number, string][] = [['sunlit', 200, L('Sunlit zone (0–200 m)', 'Zona iluminada (0–200 m)')], ['twilight', 1000, L('Twilight zone (200–1 000 m)', 'Penumbra (200–1 000 m)')], ['midnight', 4000, L('Midnight zone (1 000–4 000 m)', 'Zona de medianoche (1 000–4 000 m)')], ['abyss', 6000, L('Abyss (4 000–6 000 m)', 'Abismo (4 000–6 000 m)')], ['hadal', 1e9, L('The trenches (below 6 000 m)', 'Las fosas (más de 6 000 m)')]];
    const zoneOf = (m: number) => zones.find((z) => m < z[1])![0];
    const labels = Object.fromEntries(zones.map((z) => [z[0], z[2]]));
    // Every zone gets its turn, the deep ones too.
    const byZone = new Map<string, A[]>();
    for (const a of shuffle(as.slice())) { const z = zoneOf(a.usual); byZone.set(z, [...(byZone.get(z) ?? []), a]); }
    const pick: A[] = [];
    while (pick.length < n && [...byZone.values()].some((l) => l.length)) for (const l of byZone.values()) if (l.length && pick.length < n) pick.push(l.shift()!);
    return shuffle(pick).map((a) => {
      const z = zoneOf(a.usual);
      const wrong = shuffle(zones.map((x) => x[0]).filter((x) => x !== z)).slice(0, 3);
      const fmt = (v: number) => `${fmtNumber(Math.round(v))} m`;
      return { id: z, kind: 'zone' as QuizKind, options: [...zones.map((x) => x[0])].filter((x) => x === z || wrong.includes(x)), sea: { prompt: L('Where does it live most often?', '¿Dónde vive más a menudo?'), item: `${a.e} ${tx(a.name)}`, labels,
        note: L('{0}: most often about {1} down, from {2} to {3}. {4}', '{0}: casi siempre a unos {1}, de {2} a {3}. {4}', tx(a.name), fmt(a.usual), fmt(a.depth[0]), fmt(a.depth[1]), tx(a.text)) } };
    });
  }
  private async deepQs(n: number): Promise<Q[]> {
    const pool = (await this.loadDeep()).filter((x) => x.m < 20000);
    const out: Q[] = [];
    const used = new Set<string>();
    for (const a of shuffle(pool.slice().sort((x, y) => x.id.localeCompare(y.id)))) {
      if (out.length >= n || used.has(a.id)) continue;
      const b = shuffle(pool.filter((x) => !used.has(x.id) && x.id !== a.id && Math.max(x.m, a.m) / Math.max(1, Math.min(x.m, a.m)) >= 1.35))[0];
      if (!b) continue;
      used.add(a.id); used.add(b.id);
      const deeper = a.m > b.m ? a : b;
      out.push({ id: deeper.id, kind: 'deep', options: shuffle([a.id, b.id]), deep: { a: a.id, b: b.id } });
    }
    return out;
  }
  /** Rounds of four, each at least half again deeper than the one above it, layers included. */
  private async downQs(n: number): Promise<Q[]> {
    const things = await this.loadDeep();
    const layers: DownThing[] = [
      { id: 'L-moho', e: '🪨', name: ['The Moho, the bottom of the crust', 'El Moho, el fondo de la corteza'], place: ['Under the continents', 'Bajo los continentes'], m: 35000, below: 'ground' },
      { id: 'L-tz', e: '🟠', name: ['The transition zone of the mantle', 'La zona de transición del manto'], place: ['Everywhere below', 'En todas partes, abajo'], m: 410000, below: 'ground' },
      { id: 'L-lower', e: '🔴', name: ['The lower mantle', 'El manto inferior'], place: ['Everywhere below', 'En todas partes, abajo'], m: 660000, below: 'ground' },
      { id: 'L-outer', e: '🟡', name: ['The liquid outer core', 'El núcleo externo líquido'], place: ['Everywhere below', 'En todas partes, abajo'], m: 2891000, below: 'ground' },
      { id: 'L-inner', e: '⚪', name: ['The solid inner core', 'El núcleo interno sólido'], place: ['At the centre', 'En el centro'], m: 5150000, below: 'ground' },
    ];
    const pool = [...things, ...layers];
    const out: Q[] = [];
    for (let k = 0; k < n * 6 && out.length < n; k++) {
      // One of the Earth's layers in every round (the sea animals and wrecks would crowd them out), then three more.
      const pick: DownThing[] = [shuffle(layers.slice())[0]];
      for (const x of shuffle(pool)) {
        if (pick.every((p) => Math.max(p.m, x.m) / Math.max(1, Math.min(p.m, x.m)) >= 1.5)) pick.push(x);
        if (pick.length === 4) break;
      }
      if (pick.length < 4 || !pick.some((x) => x.id.startsWith('L-'))) continue;
      out.push({ id: 'layers', kind: 'layers', down: pick, downPicked: [] });
    }
    return out;
  }
  private renderDownQuestion(cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const set = cur.down!, picked = cur.downPicked ?? [];
    const right = set.slice().sort((a, b) => a.m - b.m);
    add(this.card, h('div', { class: 'quiz-q' }, q.answered ? L('Shallowest first:', 'De la menos a la más profunda:') : L('Put them in order: tap the shallowest first.', 'Ordénalas: toca primero la menos profunda.')));
    const list = h('div', { class: 'order-list', role: 'list' });
    for (const it of q.answered ? right : set) {
      const mine = picked.indexOf(it.id), at = right.indexOf(it);
      const row = h('button', { type: 'button', role: 'listitem', class: `order-row${mine >= 0 ? ' picked' : ''}${q.answered ? (mine === at ? ' ok' : ' bad') : ''}`, 'data-down': it.id },
        h('span', { class: 'order-num' }, q.answered ? String(at + 1) : mine >= 0 ? String(mine + 1) : ''),
        h('span', { class: 'quiz-thumb' }, it.e),
        h('span', { class: 'order-text' }, h('span', { class: 'order-name' }, es() ? it.name[1] : it.name[0]),
          h('span', { class: 'order-sub' }, [q.answered ? this.depthLabel(it) : '', es() ? it.place[1] : it.place[0]].filter(Boolean).join(' · '))),
        q.answered && mine !== at ? h('span', { class: 'order-yours' }, L('you: {0}', 'tú: {0}', mine + 1)) : null);
      row.addEventListener('click', () => {
        if (q.answered) return;
        const i = picked.indexOf(it.id);
        cur.downPicked = i >= 0 ? picked.slice(0, i) : [...picked, it.id];
        if (cur.downPicked.length === set.length - 1) cur.downPicked.push(set.find((x) => !cur.downPicked!.includes(x.id))!.id);
        this.renderQuiz();
      });
      list.append(row);
    }
    add(this.card, list);
    if (!q.answered && picked.length === set.length) {
      const again = h('button', { type: 'button', class: 'pill sm' }, L('Start over', 'Empezar de nuevo'));
      again.addEventListener('click', () => { cur.downPicked = []; this.renderQuiz(); });
      const check = h('button', { type: 'button', class: 'pill primary sm', 'data-check': '' }, L('Check', 'Comprobar'));
      check.addEventListener('click', () => {
        if (q.answered) return;
        q.answered = true;
        const placed = right.filter((x, i) => x.id === cur.downPicked![i]).length;
        const ok = placed === right.length;
        cur.ok = ok;
        cur.given = cur.downPicked!.map((k) => { const x = set.find((y) => y.id === k)!; return es() ? x.name[1] : x.name[0]; }).join(' → ');
        this.scored(ok);
        this.renderQuiz({ ok, text: ok ? Lc('four sea creatures by depth', 'Correct! All four in order.', '¡Correcto! Las cuatro en orden.') : L('{0} of {1} in the right place.', '{0} de {1} en su lugar.', placed, right.length) });
      });
      add(this.card, h('div', { class: 'tool-actions' }, again, check));
    } else if (!q.answered && picked.length) add(this.card, h('div', { class: 'tool-hint' }, L('Tap a numbered one to take it back.', 'Toca uno con número para quitarlo.')));
    if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
  }

  /** "April". */
  private monthLabel(m: string): string {
    const name = greenMonth(Number(m) - 1);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // ---- Daily challenge

  /** Eight questions, the same for everyone today: a country, a flag, the country in between two others, where, when,
   *  an order, a map's year, and one more whose quiz changes each day. Everything is loaded before the seeded choices,
   *  so they don't depend on it. */
  private async startDaily() {
    const day = dayKey();
    if (dailyResult(day)) { this.showDailyDone(); return; }
    const num = dailyNumber(day);
    const last = DAILY_ROTATE[((num % DAILY_ROTATE.length) + DAILY_ROTATE.length) % DAILY_ROTATE.length];
    const wildDay = last === 'habitat' || last === 'lives', greenDay = last === 'grows' || last === 'season';
    await Promise.all([this.orderPool(), this.loadDetective(), this.hopPairs(), this.itemQs('where', 0), this.itemQs('when', 0), wildDay ? this.loadWildQuiz() : greenDay ? this.loadGreenQuiz() : this.itemQs(last, 0)]);
    rand = seeded(hash(`atlas-daily:${day}`));
    let qs: Q[] = [];
    try {
      const parts = [this.countryQs('find', 'world', 1), this.countryQs('flag', 'world', 1), await this.hopQs(1), await this.itemQs('where', 1), await this.itemQs('when', 1), await this.orderQs(1), await this.detectiveQs(1), last === 'habitat' ? await this.habitatQs(1) : last === 'lives' ? await this.livesQs(1) : last === 'grows' ? await this.growsQs(1) : last === 'season' ? await this.seasonQs(1) : await this.itemQs(last, 1)];
      qs = parts.flatMap((x) => x ?? []);
    } finally { rand = Math.random; }
    if (qs.length < 5) { this.needsData(); return; }
    const rv = await this.master?.reviewQuestion().catch(() => null);
    if (rv) qs.push({ id: rv.id, kind: 'capital', options: rv.options, review: true });
    await this.begin('daily', 'world', qs, day);
  }

  /** Today's challenge is done: how it went, the streak, and the result to share. */
  private showDailyDone() {
    const day = dayKey(), r = dailyResult(day);
    if (!r) return;
    this.shell.sheet.close();
    this.stopTour();
    if (this.quiz) void this.stopQuiz();
    const marks = r.m.replace(/y/g, '🟩').replace(/n/g, '🟥');
    clear(this.card);
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => { this.card.hidden = true; this.syncInset(); });
    add(this.card, h('div', { class: 'tool-head' }, h('strong', null, `🗓️ ${L('Daily challenge', 'Reto del día')} #${dailyNumber(day)}`), close),
      h('div', { class: 'quiz-q' }, `${r.s}/${r.n} ${marks}`),
      h('div', { class: 'tool-hint' }, `🔥 ${inARow(current(progress().daily))} · ${L('A new challenge tomorrow.', 'Mañana hay un reto nuevo.')}`),
      h('div', { class: 'tool-actions' }, this.shareButton(day, r.s, r.n, marks)));
    this.card.classList.remove('peek');
    this.card.hidden = false;
    requestAnimationFrame(() => this.syncInset());
  }

  private shareButton(day: string, score: number, n: number, marks: string): HTMLElement {
    const b = h('button', { type: 'button', class: 'pill primary sm', 'data-share': '' }, icon(Share2, 15), L('Share', 'Compartir'));
    b.addEventListener('click', () => void (async () => {
      const text = `${L('Atlas Globe · Daily challenge', 'Atlas Globe · Reto del día')} #${dailyNumber(day)}: ${score}/${n}\n${marks}\n${location.origin}${location.pathname}`;
      if (navigator.share) {
        try { await navigator.share({ text }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(text); this.shell.toast(L('Copied: paste it anywhere', 'Copiado: pégalo donde quieras')); } catch { prompt('', text); }
    })());
    return b;
  }

  private heritageSites: QItem[] | null = null;
  /** "Which World Heritage site?": the sites on the list with a picture that many Wikipedias have an article on. */
  private async heritagePool(): Promise<QItem[]> {
    if (!this.heritageSites) {
      try {
        const doc = await loadJSON<{ sites: WhSite[] }>('layers/heritage.json');
        const meta = this.app.data.meta;
        const names = (ids: string[], l: 'en' | 'es') => ids.map((c) => (meta[c] ? (l === 'es' ? meta[c].es : meta[c].n) : c)).join(', ');
        this.heritageSites = doc.sites.filter((x) => !x.x && !x.merged && !!x.img && x.pop >= 45).map((x) => ({
          id: `whs-${x.ref}`, name: { en: x.n[0], es: x.n[1] || x.n[0] }, at: x.at, cat: x.c, icon: x.c === 'n' ? '🌿' : x.c === 'm' ? '⛰️' : '🏛️',
          date: String(x.y), t: x.y, type: 'site', img: x.img, wiki: x.w[0] ? { en: x.w[0], es: x.w[1] } : undefined,
          place: { en: names(x.cc, 'en'), es: names(x.cc, 'es') }, country: x.cc[0], text: { en: '', es: '' }, story: '', step: 0, kind: 'heritage', pop: x.pop,
        }) as unknown as QItem);
      } catch { this.heritageSites = []; }
    }
    return this.heritageSites;
  }

  /** "Which faith?": the faith story that tells an item (the time tour may tell it first). */
  private faithOf(it: QItem): string | undefined { return [it.story, ...(it.also ?? [])].find((x) => this.faiths.has(x)); }

  /**
   * "Which period?": the geologic period an item belongs to, by its date. Left out: species that
   * lived across several periods, and what lies near a boundary (the extinctions that end periods).
   */
  private periodOf(it: QItem): string | null {
    // A species still alive belongs to no single period.
    if (it.type === 'species' && it.tu == null) return null;
    const ma = -it.t / 1e6, end = it.tu != null ? -it.tu / 1e6 : ma;
    const u = this.periods.find((p) => ma <= p.start && ma > p.end);
    if (!u || end < u.end || Math.min(u.start - ma, ma - u.end) < (u.start - u.end) * 0.02) return null;
    return u.name_en;
  }

  /** The right period and three others near it in time, oldest first. */
  private periodOptions(id: string): string[] {
    const i = this.periods.findIndex((p) => p.name_en === id);
    const near = this.periods.map((p, k) => [p.name_en, Math.abs(k - i)] as const).filter(([n, d]) => n !== id && d <= 3).map(([n]) => n);
    const pick = new Set([id, ...shuffle(near).slice(0, 3)]);
    return this.periods.map((p) => p.name_en).filter((n) => pick.has(n));
  }

  /** "Jurassic (201–143 million years ago)". */
  private periodLabel(id: string): string {
    const u = this.periods.find((p) => p.name_en === id);
    if (!u) return id;
    const f = (x: number) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10).replace('.', L('.', ',')));
    const when = u.end <= 0 ? L('since {0} million years ago', 'desde hace {0} millones de años', f(u.start)) : L('{0}–{1} million years ago', 'hace {0}–{1} millones de años', f(u.start), f(u.end));
    return `${es() ? u.name_es : u.name_en} (${when})`;
  }

  /** The question for an item. */
  private itemQuestion(kind: QuizKind, it: QItem): string {
    if (kind === 'habitat') return L('Where does this animal live in the wild?', '¿Dónde vive este animal en libertad?');
    if (kind === 'grows') return L('Where does this plant grow wild?', '¿Dónde crece silvestre esta planta?');
    const ty = it.type ?? '';
    // The dish catalogue has drinks, spices and sauces too.
    const drink = it.cat === 'drink', spice = it.cat === 'spice';
    if (kind === 'where' && ty === 'dish' && drink) return L('Where does this drink come from?', '¿De dónde es esta bebida?');
    if (kind === 'where' && ty === 'dish' && spice) return L('Where does this spice or sauce come from?', '¿De dónde es esta especia o salsa?');
    if (kind === 'dish' && drink) return L('Which country does this drink come from?', '¿De qué país es esta bebida?');
    if (kind === 'dish' && spice) return L('Which country does this spice or sauce come from?', '¿De qué país es esta especia o salsa?');
    if (kind === 'where' && ty === 'animal') return L('Where was this animal first tamed?', '¿Dónde se domesticó primero este animal?');
    if (kind === 'period') return ty === 'site' ? L('From which period are its fossils?', '¿De qué periodo son sus fósiles?') : L('In which period did it live?', '¿En qué periodo vivió?');
    const football = it.cat === 'football';
    if (kind === 'champion') return football ? L('Who won this World Cup?', '¿Quién ganó este Mundial?') : L('Which nation topped the medal table?', '¿Qué país encabezó el medallero?');
    if (kind === 'where' && ty === 'games') return football ? L('Where was this World Cup\u2019s final played?', '¿Dónde se jugó la final de este Mundial?') : L('Where were these Games held?', '¿Dónde se celebraron estos Juegos?');
    if (kind === 'where' && ty === 'genre') return L('Where was this style born?', '¿Dónde nació este estilo?');
    if (kind === 'where' && ty === 'instrument') return L('Where does this instrument come from?', '¿De dónde es este instrumento?');
    if (kind === 'when' && it.kind === 'books' && !it.end) return L('When was it written?', '¿Cuándo se escribió?');
    if (kind === 'where') return ty === 'dish' ? L('Where does this dish come from?', '¿De dónde es este plato?') : ty === 'fossil' || ty === 'species' ? L('Where was this found?', '¿Dónde se encontró?') : ty === 'culture' ? L('Where was this civilization centred?', '¿Dónde tenía su centro esta civilización?') : ty === 'work' ? L('Where was this made?', '¿Dónde se hizo?') : ty === 'invention' ? L('Where was this invented?', '¿Dónde se inventó?') : ty === 'event' ? L('Where did this happen?', '¿Dónde ocurrió?') : L('Where in the world is this?', '¿Dónde está?');
    if (kind === 'when') return it.end ? L('When was it completed?', '¿Cuándo se terminó?') : ty === 'dish' ? L('When was it first recorded?', '¿Cuándo aparece por primera vez?') : ty === 'work' ? L('When was it made?', '¿Cuándo se hizo?') : ty === 'invention' ? L('When was it invented?', '¿Cuándo se inventó?') : ty === 'event' ? L('When did it happen?', '¿Cuándo ocurrió?') : L('When was it built?', '¿Cuándo se construyó?');
    if (kind === 'dish') return L('Which country does this dish come from?', '¿De qué país es este plato?');
    if (kind === 'civ') return L('Which civilization does this belong to?', '¿A qué civilización pertenece?');
    if (kind === 'journey') return L('Which journey or trade route is it from?', '¿De qué viaje o ruta comercial es?');
    if (kind === 'faith') return L('Which faith or school of thought does it belong to?', '¿A qué religión o escuela de pensamiento pertenece?');
    if (kind === 'plague') return L('Which epidemic is it part of?', '¿De qué epidemia forma parte?');
    if (kind === 'disaster') return L('Which disaster is it part of?', '¿De qué desastre forma parte?');
    if (kind === 'script') return L('Which script is this?', '¿Qué escritura es esta?');
    if (kind === 'listen') return ty === 'instrument' ? L('Which instrument are you hearing?', '¿Qué instrumento estás oyendo?') : ty === 'work' ? L('Which piece are you hearing?', '¿Qué obra estás oyendo?') : ty === 'genre' ? L('Which style of music is this?', '¿Qué estilo de música es este?') : L('What are you hearing?', '¿Qué estás oyendo?');
    if (kind === 'opening') return L('Which book or poem is this line from?', '¿De qué libro o poema es esta frase?');
    if (kind === 'artist') return L('Who made this?', '¿Quién hizo esta obra?');
    if (kind === 'site') return L('Which World Heritage site is this?', '¿Qué sitio del Patrimonio Mundial es este?');
    if (kind === 'inventor') return L('Who invented it?', '¿Quién lo inventó?');
    return L('Which era does this belong to?', '¿A qué época pertenece?');
  }

  private optionLabel(kind: QuizKind, o: string, q: Q): string {
    if (kind === 'world') { const w = worldById(o); return w ? tr(w.name) : o; }
    if (kind === 'landed') { const l = this.landings.find((x) => x.id === o); return l ? tr(l.name) : o; }
    if (kind === 'constellation') { const c = this.sky?.loaded?.cons.find((x) => x.id === o); return c ? tr(c.name) : o; }
    if (kind === 'element') return originName(o);
    if (kind === 'when') return fmtWhen(o, Math.min(...(q.options ?? [o]).map(Number)));
    if (kind === 'dish') return `${flagEmoji(this.app.data.meta[o]?.a2)} ${this.app.data.name(o, lang())}`;
    if (kind === 'era') { const e = this.eras.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'civ') { const e = this.civs.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'journey') { const e = this.journeys.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'faith') { const e = this.faiths.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (STORY_QUIZ[kind]) { const e = this.storySets.get(kind)?.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'script') { const n = this.scriptNames.get(o); return n ? tx(n) : o; }
    if (HIDDEN_NAME.includes(kind) || kind === 'inventor') { const n = this.optNames.get(o); return n ? tx(n) : o; }
    if (kind === 'period') return this.periodLabel(o);
    if (kind === 'champion') { const p = q.item?.podium?.find((x) => x.c === o); return p ? `${p.a2 ? `${flagEmoji(p.a2)} ` : ''}${tx(p.n)}` : o; }
    return kind === 'capital' ? this.capital(o) : `${this.app.data.name(o, lang())}`;
  }

  /** "Where in the world?": the answer is where the player tapped. */
  private answerWhere(g: [number, number] | null) {
    const q = this.quiz!;
    const it = q.qs[q.i].item!;
    q.answered = true;
    // Where does it live?: how far the tap is from the nearest square where it lives (none, inside its range).
    const animal = this.qk() === 'habitat' ? this.wildQuiz?.byId.get(it.id ?? '') ?? null : null;
    const plant = this.qk() === 'grows' ? this.greenQuiz?.byId.get(it.id ?? '') ?? null : null;
    const km = g ? Math.round(animal ? rangeKm(animal, g) : plant ? plantRangeKm(plant, g) : geoDistance(g, it.at) * 6371) : null;
    const ok = km != null && km <= (animal || plant ? 300 : 500);
    this.guess = g && !animal && !plant ? g : null;
    this.guessKm = km ?? 0;
    if (animal) { this.wildShow = animal; this.app.renderer.requestRender(); }
    if (plant) { this.greenShow = plant; this.app.renderer.requestRender(); }
    this.scored(ok);
    const cur = q.qs[q.i];
    cur.ok = ok;
    cur.given = km == null ? L('no answer', 'sin respuesta') : L('{0} km away', 'a {0} km', km.toLocaleString(appLocale()));
    this.showItem(it);
    const where = it.place ? tx(it.place) : '';
    const dist = km == null ? '' : L('{0} km away. ', 'A {0} km. ', km.toLocaleString(appLocale()));
    if (plant) {
      const near = km === 0 ? L('Right where it grows! ', '¡Justo donde crece! ') : km != null ? L('{0} km from where it grows. ', 'A {0} km de donde crece. ', km.toLocaleString(appLocale())) : '';
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${near}${tx(it.name)}: ${L('it grows wild in the green squares', 'crece silvestre en los cuadros verdes')}${where ? ` (${where})` : ''}.` });
      return;
    }
    if (animal) {
      const near = km === 0 ? L('Right where it lives! ', '¡Justo donde vive! ') : km != null ? L('{0} km from where it lives. ', 'A {0} km de donde vive. ', km.toLocaleString(appLocale())) : '';
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${near}${tx(it.name)}: ${L('it lives in the orange squares', 'vive en los cuadros naranjas')}${where ? ` (${where})` : ''}.` });
      return;
    }
    this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${dist}${tx(it.name)}${where ? `: ${where}` : ''}.` });
  }

  /** Puts a pin on the item and flies there. */
  private showItem(it: QItem) {
    this.pin = { lon: it.at[0], lat: it.at[1], text: tx(it.name) };
    this.app.flyTo(it.at[0], it.at[1], Math.max(3, this.app.renderer.view.zoom));
    this.app.renderer.requestRender();
  }

  private capital(id: string) {
    const d = deckCapital(id, lang());
    if (d) return d;
    const c = this.app.data.cities.find((x) => x.country === id && x.capital === 2 && !(x.flags & 4));
    return c ? (es() && c.es ? c.es : c.name) : '?';
  }

  /** The quiz card's top line: where you are, the score, the map button and close. */
  private quizHead(title: string, score: string) {
    const q = this.quiz!;
    const label = q.peek ? L('Back to the quiz', 'Volver al concurso') : L('See the map', 'Ver el mapa');
    const peek = h('button', { type: 'button', class: `pill sm quiz-peek${q.peek ? ' on' : ''}`, title: label, 'aria-label': label, 'aria-expanded': String(!q.peek) },
      icon(q.peek ? ChevronDown : MapIcon, 15), q.peek ? L('Quiz', 'Concurso') : L('Map', 'Mapa'));
    peek.addEventListener('click', () => { q.peek = !q.peek; this.renderQuiz(); });
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stopQuiz());
    return h('div', { class: 'tool-head' }, h('strong', null, title), h('span', { class: 'quiz-score' }, score), peek, close);
  }

  private nextButton() {
    const q = this.quiz!;
    const next = h('button', { type: 'button', class: 'pill primary sm' }, q.i + 1 < q.qs.length ? L('Next', 'Siguiente') : L('See result', 'Ver resultado'));
    next.addEventListener('click', () => this.nextQuestion());
    return next;
  }

  private renderQuiz(feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    // No questions (the data it needs is missing): say so instead of "Question 1/0".
    if (!q.qs.length) {
      this.stopQuiz();
      this.shell.toast(L('This quiz could not load its questions; try again in a moment.', 'Este concurso no pudo cargar sus preguntas; vuelve a intentarlo en un momento.'));
      return;
    }
    if (feedback) q.fb = feedback;
    feedback = q.answered ? q.fb : undefined;
    const cur = q.qs[q.i];
    clear(this.card);
    this.card.classList.toggle('peek', q.peek);
    this.card.hidden = false;
    requestAnimationFrame(() => this.syncInset());
    if (q.done) { this.renderResult(); return; }
    const kind = this.qk();
    add(this.card, this.quizHead(`${q.kind === 'daily' ? '🗓️ ' : ''}${L('Question', 'Pregunta')} ${q.i + 1}/${q.qs.length}`, `⭐ ${q.score}${(q.run ?? 0) >= 3 ? ` · 🔥 ${q.run}` : ''}`));
    if (!cur) return;
    if (q.peek) {
      // Folded: the map is in view. What to find (the tap quizzes are answered on it), or the answer.
      if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
      else if (kind === 'find') add(this.card, h('div', { class: 'quiz-peek-q' }, L('Where is {0}?', '¿Dónde está {0}?', this.app.data.name(cur.id, lang()))));
      else if ((kind === 'where' || kind === 'habitat' || kind === 'grows') && cur.item) add(this.card, h('div', { class: 'quiz-peek-q' }, `${cur.item.icon} ${tx(cur.item.name)}`));
      else if (kind === 'season' && cur.green) { const sp = this.calQuiz?.find((x) => x.id === cur.green!.spectacle); if (sp) add(this.card, h('div', { class: 'quiz-peek-q' }, `${sp.e} ${tt(sp.n)}`)); }
      else if (kind === 'region') { const r = this.regions?.list.find((x) => x.id === cur.id); if (r) add(this.card, h('div', { class: 'quiz-peek-q' }, L('Where is {0}?', '¿Dónde está {0}?', this.regionName(r)))); }
      else if (kind === 'detective') add(this.card, h('div', { class: 'quiz-peek-q' }, `🕵️ ${L('When is this map from?', '¿De cuándo es este mapa?')}`));
      else if (kind === 'hop' && cur.hop) add(this.card, h('div', { class: 'quiz-peek-q' }, this.hopQuestion(cur.hop)));
      return;
    }
    // In a daily challenge, each question says which quiz it is from.
    if (q.kind === 'daily') add(this.card, h('div', { class: 'quiz-kind' }, cur.review ? `🔁 ${L('Your review · Master the world', 'Tu repaso · Domina el mundo')}` : this.quizName(kind)));
    if (cur.space) { this.renderSpaceQuestion(kind, cur, feedback); return; }
    if (cur.sky) { this.renderSkyQuestion(kind, cur, feedback); return; }
    if (cur.item) { this.renderItemQuestion(kind, cur, feedback); return; }
    if (cur.down) { this.renderDownQuestion(cur, feedback); return; }
    if (kind === 'order') { this.renderOrderQuestion(cur, feedback); return; }
    if (kind === 'detective') { this.renderDetectiveQuestion(cur, feedback); return; }
    if (kind === 'region') { this.renderRegionQuestion(cur, feedback); return; }
    if (kind === 'link') { this.renderLinkQuestion(cur, feedback); return; }
    if (kind === 'family') { this.renderFamilyQuestion(cur, feedback); return; }
    const name = this.app.data.name(cur.id, lang());
    if (kind === 'find') add(this.card, h('div', { class: 'quiz-q' }, L('Where is {0}?', '¿Dónde está {0}?', name)));
    if (kind === 'flag') add(this.card, h('div', { class: 'quiz-q' }, L('Which country has this flag?', '¿De qué país es esta bandera?')),
      h('img', { class: 'quiz-flag', src: dataUrl(`../flags/${(this.app.data.meta[cur.id].a2 ?? '').toLowerCase()}.svg`), alt: '' }));
    if (kind === 'capital') add(this.card, h('div', { class: 'quiz-q' }, L('What is the capital of {0}?', '¿Cuál es la capital de {0}?', name)));
    if (kind === 'hop' && cur.hop) add(this.card, h('div', { class: 'quiz-q' }, this.hopQuestion(cur.hop)));
    if (kind === 'museum' && cur.art) this.museumQuestion(cur);
    if (kind === 'lives' && cur.wild) add(this.card, h('div', { class: 'quiz-q' }, L('Which of these animals lives here, in the wild?', '¿Cuál de estos animales vive aquí, en libertad?')), h('div', { class: 'tool-hint' }, L('The globe shows the place.', 'El globo muestra el lugar.')));
    if (kind === 'deep' && cur.deep) add(this.card, h('div', { class: 'quiz-q' }, L('Which goes deeper?', '¿Cuál llega más hondo?')), h('div', { class: 'tool-hint' }, L('Measured down from the ground, or from the sea’s surface for trenches, wrecks and dives.', 'Medido desde el suelo, o desde la superficie del mar para fosas, naufragios y buceos.')));
    if (cur.sea) { add(this.card, h('div', { class: 'quiz-q' }, cur.sea.prompt)); if (cur.sea.item) add(this.card, h('div', { class: 'quiz-item' }, cur.sea.item)); }
    if (kind === 'season' && cur.green) {
      const sp = this.calQuiz?.find((x) => x.id === cur.green!.spectacle);
      if (sp) add(this.card, h('div', { class: 'quiz-q' }, L('When is the best month to see it?', '¿Cuál es el mejor mes para verlo?')), h('div', { class: 'quiz-item' }, `${sp.e} ${tt(sp.n)}`), h('div', { class: 'tool-hint' }, tt(sp.place)));
    }
    if (cur.options) {
      const opts = h('div', { class: 'quiz-opts' });
      for (const o of cur.options) {
        const label = kind === 'capital' ? this.capital(o) : kind === 'museum' ? this.museumLabel(o) : kind === 'lives' ? this.animalLabel(o) : kind === 'season' ? this.monthLabel(o) : kind === 'deep' ? this.deepLabel(o) : cur.sea ? cur.sea.labels[o] ?? o : `${this.app.data.name(o, lang())}`;
        const b = h('button', { type: 'button', class: 'pill quiz-opt' }, label) as HTMLButtonElement;
        if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
        b.addEventListener('click', () => this.answerOption(o, b));
        opts.append(b);
      }
      add(this.card, opts);
    } else if (!q.answered) {
      const skip = h('button', { type: 'button', class: 'pill sm' }, L('Show me', 'Muéstramelo'));
      skip.addEventListener('click', () => this.answerFind(null));
      add(this.card, h('div', { class: 'tool-hint' }, L('Tap the country on the globe.', 'Toca el país en el globo.')), h('div', { class: 'tool-actions' }, skip));
    }
    if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
  }

  /** A question about an item: its picture, the options or the globe, and what the answer was. */
  private renderItemQuestion(kind: QuizKind, cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const it = cur.item!;
    const img = h('img', { class: 'quiz-img', alt: '', hidden: true }) as HTMLImageElement;
    img.addEventListener('load', () => { img.hidden = false; });
    void itemThumb(it).then((src) => { if (src && img.isConnected) img.src = src; });
    // "Which script?": the sample is the question; its name, its reading and the picture wait for the answer.
    const script = kind === 'script' && !!it.sample;
    const named = h('div', { class: 'quiz-item' }, `${it.icon} ${tx(it.name)}`);
    let what: HTMLElement | null = script ? sampleEl(q.answered ? it.sample! : { text: it.sample!.text }) : named;
    let pic = script && !q.answered ? null : zoomable(img);
    // A clip, a line or a work's picture: its name (and the recording's credit, the line's source) wait for the answer.
    if (kind === 'listen') { what = h('div', null, q.answered ? named : null, clipEl(it.audio!, { title: q.answered ? tx(it.name) : '', credit: q.answered })); if (!q.answered) pic = null; }
    if (kind === 'opening') { what = h('div', null, q.answered ? named : null, quoteEl(q.answered ? it.quote! : { ...it.quote!, from: undefined })); if (!q.answered) pic = null; }
    if (kind === 'artist' || kind === 'site') what = q.answered ? named : null;
    add(this.card, h('div', { class: 'quiz-q' }, this.itemQuestion(kind, it)), what, pic);
    if (cur.options) {
      const opts = h('div', { class: 'quiz-opts' });
      for (const o of cur.options) {
        const b = h('button', { type: 'button', class: 'pill quiz-opt' }, this.optionLabel(kind, o, cur)) as HTMLButtonElement;
        if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
        b.addEventListener('click', () => this.answerOption(o, b));
        opts.append(b);
      }
      add(this.card, opts);
    } else if (!q.answered) {
      const skip = h('button', { type: 'button', class: 'pill sm' }, L('Show me', 'Muéstramelo'));
      skip.addEventListener('click', () => this.answerWhere(null));
      add(this.card, h('div', { class: 'tool-hint' }, kind === 'habitat' ? L('Tap a place where it lives (within 300 km of its range to score).', 'Toca un lugar donde vive (a menos de 300 km de su área para puntuar).') : kind === 'grows' ? L('Tap a place where it grows wild (within 300 km of its range to score).', 'Toca un lugar donde crece silvestre (a menos de 300 km de su área para puntuar).') : L('Tap the place on the globe (within 500 km to score).', 'Toca el lugar en el globo (a menos de 500 km para puntuar).')), h('div', { class: 'tool-actions' }, skip));
    }
    if (feedback) {
      // Not in a daily challenge, which would end there.
      const story = q.kind === 'daily' || !it.story ? null : h('button', { type: 'button', class: 'pill sm' }, L('See it in the story', 'Verlo en la historia'));
      story?.addEventListener('click', () => {
        void this.stopQuiz().then(() => this.time.stories[it.kind].open(it.story, it.step, { name: tx(it.name), at: it.at }));
      });
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, story, this.nextButton()));
    }
  }

  private answerOption(o: string, b: HTMLButtonElement) {
    const q = this.quiz!;
    if (q.answered) return;
    const cur = q.qs[q.i];
    const kind = this.qk();
    q.answered = true;
    const ok = o === cur.id;
    this.scored(ok);
    cur.ok = ok; cur.pick = o;
    if (cur.review && this.master) this.badgeToast(this.master.review(cur.id, ok));
    cur.given = cur.item || cur.space || cur.sky ? this.optionLabel(kind, o, cur) : kind === 'capital' ? this.capital(o) : kind === 'museum' ? this.museumLabel(o) : kind === 'lives' ? this.animalLabel(o) : kind === 'season' ? this.monthLabel(o) : this.app.data.name(o, lang());
    b.classList.add(ok ? 'ok' : 'bad');
    if (cur.sea) {
      cur.given = cur.sea.labels[o] ?? o;
      if (cur.sea.at) { this.pin = { lon: cur.sea.at[0], lat: cur.sea.at[1], text: cur.sea.labels[cur.id] ?? '' }; this.app.renderer.requestRender(); }
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It is: {0}. ', 'Es: {0}. ', cur.sea.labels[cur.id])}${cur.sea.note ?? ''}` });
      return;
    }
    if (cur.deep) {
      cur.given = this.deepLabel(o);
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${this.deepLabel(cur.deep.a, true)} · ${this.deepLabel(cur.deep.b, true)}` });
      return;
    }
    if (cur.space) { this.answerSpace(kind, cur, ok); return; }
    if (cur.sky) { this.answerSky(kind, cur, ok); return; }
    if (cur.det) {
      // Time detective: the names come out on the map.
      cur.given = this.yearLabel(o);
      void this.time.history.quizMap(cur.det.year, true);
      const right = this.yearLabel(cur.id);
      this.renderQuiz({ ok, text: ok ? L('Correct! {0}.', '¡Correcto! {0}.', right) : L('It was {0}.', 'Era {0}.', right) });
      return;
    }
    if (cur.lang) {
      cur.given = this.famName(o);
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${this.familySentence(cur.lang, cur.id)}` });
      return;
    }
    if (cur.link) {
      cur.given = this.linkLabel(o);
      const k = cur.link;
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It was: {0}. ', 'Era: {0}. ', this.linkLabel(cur.id))}ρ = ${fmtR(k.rho)}, ${strengthWords(strength(k.rho))}.` });
      return;
    }
    if (cur.item) {
      const it = cur.item;
      this.showItem(it);
      const right = kind === 'when' ? itemWhen(it, Math.min(...(cur.options ?? [cur.id]).map(Number))) : this.optionLabel(kind, cur.id, cur);
      if (kind === 'script') { this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It is: ', 'Es: ')}${tx(it.name)}${it.place ? ` · ${tx(it.place)}` : ''}` }); return; }
      if (kind === 'listen' || kind === 'opening') { this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It was: ', 'Era: ')}${tx(it.name)}${it.by ? ` (${tx(it.by)})` : ''}${it.place ? ` · ${tx(it.place)}` : ''}` }); return; }
      if (kind === 'site') { this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It was: ', 'Era: ')}${tx(it.name)}${it.place ? ` · ${tx(it.place)}` : ''} · ${L('on the list since {0}', 'en la lista desde {0}', it.t)}` }); return; }
      if (kind === 'inventor') { this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${tx(it.name)}: ${tx(it.by!)} (${itemWhen(it, it.t)}${it.place ? `, ${tx(it.place)}` : ''})` }); return; }
      if (kind === 'artist') { this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${tx(it.name)}: ${tx(it.by!)}${it.status ? ` · ${tx(it.status)}` : ''}` }); return; }
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${tx(it.name)}: ${right}.` });
      return;
    }
    if (cur.green) {
      // Its months, and where it is.
      const sp = this.calQuiz?.find((x) => x.id === cur.green!.spectacle);
      if (sp) this.pin = { lon: sp.at[0], lat: sp.at[1], text: tt(sp.n) };
      this.app.renderer.requestRender();
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It is best in {0}. ', 'Su mejor mes es {1}. ', this.monthLabel(cur.id), this.monthLabel(cur.id).toLowerCase())}${sp ? `${tt(sp.n)}: ${monthsText(sp)}. ${tt(sp.text)}` : ''}` });
      return;
    }
    if (cur.wild) {
      // Its range comes out on the map.
      const a = this.wildQuiz?.byId.get(cur.id);
      if (a) { this.wildShow = a; this.app.renderer.requestRender(); }
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${L('{0} lives here: its range is in orange.', '{0} vive aquí: su área está en naranja.', this.animalLabel(cur.id))}` });
      return;
    }
    if (cur.art) {
      // The museum comes out on the map.
      const m = this.artData?.museumById.get(cur.id);
      if (m) { this.pin = { lon: m.at[0], lat: m.at[1], text: artName(m) }; this.app.renderer.view.flyTo({ lon: m.at[0], lat: m.at[1], zoom: 6 }); }
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${L('It is in {0}.', 'Está en {0}.', this.museumLabel(cur.id))}` });
      return;
    }
    if (cur.hop) {
      // The way across comes out on the map: the country between them is filled in and outlined.
      this.app.renderer.selection = cur.id;
      this.app.renderer.requestRender();
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${this.hopWay(cur)}` });
      return;
    }
    this.showCountry(cur.id);
    const name = this.app.data.name(cur.id, lang());
    this.renderQuiz({ ok, text: ok ? L('Correct! {0} {1}', '¡Correcto! {0} {1}', flagEmoji(this.app.data.meta[cur.id].a2), name)
      : kind === 'capital' ? L('The capital of {0} is {1}.', 'La capital de {0} es {1}.', name, this.capital(cur.id)) : L('It was {0}.', 'Era {0}.', name) });
  }

  private answerFind(id: string | null) {
    const q = this.quiz!;
    const cur = q.qs[q.i];
    q.answered = true;
    const ok = id === cur.id;
    this.scored(ok);
    cur.ok = ok;
    cur.given = id ? this.app.data.name(id, lang()) : L('no answer', 'sin respuesta');
    this.showCountry(cur.id);
    const name = this.app.data.name(cur.id, lang());
    let text = ok ? L('Correct! That\'s {0}.', '¡Correcto! Es {0}.', name) : L('Here is {0}.', 'Aquí está {0}.', name);
    if (!ok && id) {
      const a = this.app.data.meta[id], b = this.app.data.meta[cur.id];
      const km = Math.round(geoDistance([a.lx, a.ly], [b.lx, b.ly]) * 6371);
      text = L('You tapped {0}, {1} km away.', 'Tocaste {0}, a {1} km.', this.app.data.name(id, lang()), km.toLocaleString(appLocale()));
    }
    this.renderQuiz({ ok, text });
  }

  private nextQuestion() {
    const q = this.quiz!;
    stopClip(200, 'card');
    this.app.select(null);
    this.pin = null;
    this.guess = null;
    this.pins = [];
    q.i++; q.answered = false; q.peek = false; q.fb = undefined;
    if (q.i >= q.qs.length) { this.finishQuiz(); return; }
    this.renderQuiz();
    void this.prepareQuestion();
  }

  private finishQuiz() {
    const q = this.quiz!;
    let best = 0;
    if (q.kind === 'daily') {
      // The streaks of the subjects it touched, then the challenge itself (only the day's first play counts).
      this.badgeToast([...recordDailySubjects(shared(q.qs).map((x) => x.kind ?? 'daily')), ...recordDaily(q.score, shared(q.qs).length, shared(q.qs).map((x) => (x.ok ? 'y' : 'n')).join(''))]);
    } else {
      const key = q.kind === 'region' ? `atlas-quiz-best:region-${q.region}${q.all ? '-all' : ''}` : `atlas-quiz-best:${q.kind}`;
      try { best = Number(localStorage.getItem(key) ?? 0); if (q.score > best) localStorage.setItem(key, String(q.score)); } catch { /* ignore */ }
      this.badgeToast(recordQuiz(q.kind, q.score, q.qs.length));
    }
    q.done = true; q.best = best; q.peek = false;
    this.renderQuiz();
  }

  /** The result: the score, then every question, right or wrong, with a small picture; a tap shows it on the map. */
  private renderResult() {
    const q = this.quiz!;
    const top = q.kind === 'seafeature' || q.kind === 'zone' ? L('Ocean explorer! 🌊', '¡Explorador del océano! 🌊') : q.kind === 'deep' || q.kind === 'layers' ? L('Deep digger! ⛏️', '¡Gran excavador! ⛏️') : q.kind === 'habitat' || q.kind === 'lives' ? L('Nature expert! 🐾', '¡Experto en naturaleza! 🐾') : q.kind === 'grows' || q.kind === 'season' ? L('Green thumb! 🌿', '¡Mano verde! 🌿') : q.kind === 'order' ? L('Time keeper! ⏳', '¡Guardián del tiempo! ⏳') : q.kind === 'detective' ? L('Master detective! 🕵️', '¡Gran detective! 🕵️') : q.kind === 'site' ? L('Heritage explorer! 🏛️', '¡Explorador del patrimonio! 🏛️') : q.kind === 'world' || q.kind === 'landed' ? L('Space explorer! 🚀', '¡Explorador del espacio! 🚀') : q.kind === 'constellation' || q.kind === 'element' ? L('Star gazer! ✨', '¡Observador de estrellas! ✨') : q.kind === 'inventor' ? L('Inventive mind! 💡', '¡Mente inventiva! 💡') : q.kind === 'champion' ? L('Sports master! 🏆', '¡Maestro del deporte! 🏆') : q.kind === 'family' || q.kind === 'script' ? L('Language master! 🗣️', '¡Maestro de las lenguas! 🗣️') : q.kind === 'link' ? L('Data master! 📊', '¡Maestro de los datos! 📊') : q.kind === 'plague' ? L('Disease detective! 🔬', '¡Detective de epidemias! 🔬') : q.kind === 'disaster' ? L('Disaster expert! 🌋', '¡Experto en desastres! 🌋') : q.kind === 'listen' ? L('Golden ears! 🎧', '¡Oído de oro! 🎧') : q.kind === 'opening' ? L('Bookworm! 📚', '¡Ratón de biblioteca! 📚') : q.kind === 'artist' ? L('Art expert! 🎨', '¡Experto en arte! 🎨') : ITEM_QUIZZES.includes(q.kind) ? L('History master! 🏆', '¡Maestro de la historia! 🏆') : L('Geography master! 🏆', '¡Maestro de la geografía! 🏆');
    const msg = q.score >= 9 ? top : q.score >= 6 ? L('Great job! 🌍', '¡Muy bien! 🌍') : L('Keep exploring! 🧭', '¡Sigue explorando! 🧭');
    if (q.kind === 'daily') { this.renderDailyResult(); return; }
    add(this.card, this.quizHead(`${L('Result', 'Resultado')} ${q.score}/${q.qs.length}`, ''));
    if (q.peek) return;
    const again = h('button', { type: 'button', class: 'pill primary' }, icon(RotateCcw, 16), L('Play again', 'Jugar otra vez'));
    again.addEventListener('click', () => void (q.kind === 'region' ? this.startRegionQuiz(q.region, !!q.all) : this.startQuiz(q.kind, q.region)));
    const done = h('button', { type: 'button', class: 'pill' }, Lc('a button: finish', 'Done', 'Terminar'));
    done.addEventListener('click', () => this.stopQuiz());
    const list = h('div', { class: 'quiz-sum', role: 'list' });
    for (const cur of q.qs) list.append(this.resultRow(cur.kind ?? q.kind, cur));
    add(this.card, resultCard({ stars: quizStars(q.score, q.qs.length), score: `${q.score}`, unit: `/ ${q.qs.length}`, headline: msg,
      sub: q.score > (q.best ?? 0) ? L('New personal best!', '¡Nuevo récord personal!') : undefined, extra: [list], actions: [done, again] }));
  }

  /** The daily challenge's result: the score, its squares to share, the streak, and every question. */
  private renderDailyResult() {
    const q = this.quiz!;
    const day = q.day ?? dayKey();
    const n = shared(q.qs).length;
    add(this.card, this.quizHead(`🗓️ ${L('Daily challenge', 'Reto del día')} #${dailyNumber(day)}`, `${q.score}/${n}`));
    if (q.peek) return;
    const marks = marksOf(q.qs);
    const done = h('button', { type: 'button', class: 'pill' }, Lc('a button: finish', 'Done', 'Terminar'));
    done.addEventListener('click', () => void this.stopQuiz());
    const list = h('div', { class: 'quiz-sum', role: 'list' });
    for (const cur of q.qs) list.append(this.resultRow(cur.kind ?? q.kind, cur));
    const streak = current(progress().daily);
    const share = this.shareButton(day, q.score, n, marks);
    share.classList.remove('sm'); share.classList.add('primary');
    add(this.card, resultCard({ stars: quizStars(q.score, n), score: `${q.score}`, unit: `/ ${n}`, headline: marks,
      sub: `🔥 ${inARow(streak)} · ${L('A new challenge tomorrow', 'Mañana hay un reto nuevo')}`, extra: [list], actions: [done, share] }));
  }

  /** One question in the result: picture, what it was, the right answer and, if wrong, yours. */
  private resultRow(kind: QuizKind, cur: Q): HTMLElement {
    if (cur.space) return this.spaceRow(kind, cur);
    if (cur.sky) return this.skyRow(kind, cur);
    if (kind === 'order') return this.orderRow(cur);
    if (kind === 'detective') return this.detectiveRow(cur);
    if (kind === 'region') return this.regionRow(cur);
    if (kind === 'link') return this.linkRow(cur);
    if (kind === 'family') return this.familyRow(cur);
    const it = cur.item;
    const sp = cur.green ? this.calQuiz?.find((x) => x.id === cur.green!.spectacle) : null;
    if (cur.down) {
      const right = cur.down.slice().sort((a, b) => a.m - b.m);
      return h('div', { class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, h('span', { class: 'quiz-thumb' }, '🌍'),
        h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, right.map((x) => (es() ? x.name[1] : x.name[0])).join(' → ')),
          h('span', { class: 'quiz-sum-ans' }, cur.ok ? right.map((x) => this.depthLabel(x)).join(' · ') : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : L('no answer', 'sin respuesta'))),
        h('span', { class: 'quiz-sum-mark' }, cur.ok ? '✓' : '✗'));
    }
    const name = it ? tx(it.name) : sp ? tt(sp.n) : cur.hop ? this.hopWay(cur) : cur.art ? this.workTitle(cur.art.work) : cur.deep ? L('Which goes deeper?', '¿Cuál llega más hondo?') : this.app.data.name(cur.id, lang());
    const right = it
      ? (kind === 'where' ? (it.place ? tx(it.place) : '') : kind === 'when' ? itemWhen(it, Math.min(...(cur.options ?? [cur.id]).map(Number))) : this.optionLabel(kind, cur.id, cur))
      : kind === 'capital' ? this.capital(cur.id) : kind === 'museum' ? this.museumLabel(cur.id) : kind === 'lives' ? this.animalLabel(cur.id) : kind === 'season' ? this.monthLabel(cur.id) : kind === 'deep' ? this.deepLabel(cur.id, true) : cur.sea ? cur.sea.labels[cur.id] ?? '' : '';
    const yours = cur.ok ? '' : kind === 'where' || kind === 'find' ? (cur.given ?? '') : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : L('no answer', 'sin respuesta');
    const pic = h('span', { class: 'quiz-thumb' }, it ? it.icon : sp ? sp.e : '');
    if (it) {
      void itemThumb(it).then((src) => {
        if (!src || !pic.isConnected) return;
        const img = h('img', { alt: '' }) as HTMLImageElement;
        img.addEventListener('load', () => { clear(pic); pic.append(img); });
        img.src = src;
      });
    } else {
      const a2 = (this.app.data.meta[cur.id]?.a2 ?? '').toLowerCase();
      if (a2) pic.append(h('img', { class: 'quiz-thumb-flag', src: dataUrl(`../flags/${a2}.svg`), alt: '' }));
    }
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, pic,
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, name),
        h('span', { class: 'quiz-sum-ans' }, [right, yours].filter(Boolean).join(' · '))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    // Shows it on the map, with the card folded; "Quiz" brings the result back.
    row.addEventListener('click', () => {
      const q = this.quiz;
      if (!q) return;
      // Back to today's map from a Time detective map.
      void this.time.history.quizMap(null);
      this.pins = [];
      if (it) this.showItem(it);
      else if (cur.hop) { this.pin = null; this.hopShow = cur; this.app.renderer.selection = cur.id; this.fitCountries([cur.hop.a, cur.hop.b, cur.id]); }
      else {
        const m = this.app.data.meta[cur.id];
        this.pin = m ? { lon: m.lx, lat: m.ly, text: name } : null;
        this.showCountry(cur.id);
      }
      q.peek = true;
      this.renderQuiz();
    });
    return row;
  }

  // ---- Put them in order: the question, the taps, the answer

  /** The four things, numbered as the player taps them; after the check, in order with their dates. */
  private renderOrderQuestion(cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const set = cur.set!, picked = cur.picked ?? [];
    const right = set.slice().sort((a, b) => a.t - b.t);
    const from = Math.min(...set.map((x) => x.t));
    add(this.card, h('div', { class: 'quiz-q' }, q.answered ? L('Oldest first:', 'Del más antiguo al más reciente:') : L('Put them in order: tap the oldest first.', 'Ordénalos: toca primero el más antiguo.')));
    const list = h('div', { class: 'order-list', role: 'list' });
    for (const it of q.answered ? right : set) {
      const k = itemKey(it);
      const mine = picked.indexOf(k), at = right.indexOf(it);
      const pic = h('span', { class: 'quiz-thumb' }, it.icon);
      void itemThumb(it).then((src) => {
        if (!src || !pic.isConnected) return;
        const img = h('img', { alt: '' }) as HTMLImageElement;
        img.addEventListener('load', () => { clear(pic); pic.append(img); });
        img.src = src;
      });
      const row = h('button', { type: 'button', role: 'listitem', class: `order-row${mine >= 0 ? ' picked' : ''}${q.answered ? (mine === at ? ' ok' : ' bad') : ''}`, 'data-order': k },
        h('span', { class: 'order-num' }, q.answered ? String(at + 1) : mine >= 0 ? String(mine + 1) : ''),
        pic,
        h('span', { class: 'order-text' }, h('span', { class: 'order-name' }, tx(it.name)),
          h('span', { class: 'order-sub' }, [q.answered ? itemWhen(it, from) : '', it.place ? tx(it.place) : ''].filter(Boolean).join(' · '))),
        q.answered && mine !== at ? h('span', { class: 'order-yours' }, L('you: {0}', 'tú: {0}', mine + 1)) : null);
      row.addEventListener('click', () => (q.answered ? this.showItem(it) : this.pickOrder(k)));
      list.append(row);
    }
    add(this.card, list);
    if (!q.answered && picked.length === set.length) {
      const again = h('button', { type: 'button', class: 'pill sm' }, L('Start over', 'Empezar de nuevo'));
      again.addEventListener('click', () => { cur.picked = []; this.renderQuiz(); });
      const check = h('button', { type: 'button', class: 'pill primary sm', 'data-check': '' }, L('Check', 'Comprobar'));
      check.addEventListener('click', () => this.answerOrder());
      add(this.card, h('div', { class: 'tool-actions' }, again, check));
    } else if (!q.answered && picked.length) add(this.card, h('div', { class: 'tool-hint' }, L('Tap a numbered one to take it back.', 'Toca uno con número para quitarlo.')));
    if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
  }

  /** A tap numbers a thing (the last one numbers itself); a tap on a numbered one takes it and those after it back. */
  private pickOrder(k: string) {
    const q = this.quiz!, cur = q.qs[q.i];
    if (q.answered || !cur.set) return;
    const picked = cur.picked ?? [];
    const at = picked.indexOf(k);
    if (at >= 0) cur.picked = picked.slice(0, at);
    else {
      picked.push(k);
      if (picked.length === cur.set.length - 1) picked.push(itemKey(cur.set.find((x) => !picked.includes(itemKey(x)))!));
      cur.picked = picked;
    }
    this.renderQuiz();
  }

  private answerOrder() {
    const q = this.quiz!, cur = q.qs[q.i];
    if (q.answered || !cur.set || !cur.picked) return;
    q.answered = true;
    const right = cur.set.slice().sort((a, b) => a.t - b.t);
    const placed = right.filter((x, i) => itemKey(x) === cur.picked![i]).length;
    const ok = placed === right.length;
    cur.ok = ok;
    cur.given = cur.picked.map((k) => tx(cur.set!.find((x) => itemKey(x) === k)!.name)).join(' → ');
    this.scored(ok);
    this.showSet(right);
    this.renderQuiz({ ok, text: ok ? L('Correct! All four in order.', '¡Correcto! Los cuatro en orden.') : L('{0} of {1} in the right place.', '{0} de {1} en su lugar.', placed, right.length) });
  }

  /** Numbered pins on a round's things, oldest first, with the map turned to see them all. */
  private showSet(right: QItem[]) {
    this.pin = null;
    this.pins = right.map((it, i) => ({ lon: it.at[0], lat: it.at[1], text: `${i + 1}. ${tx(it.name)}` }));
    const rad = Math.PI / 180;
    const v = right.map((it) => [Math.cos(it.at[1] * rad) * Math.cos(it.at[0] * rad), Math.cos(it.at[1] * rad) * Math.sin(it.at[0] * rad), Math.sin(it.at[1] * rad)]);
    const m = [0, 1, 2].map((k) => v.reduce((a, x) => a + x[k], 0));
    const lon = Math.atan2(m[1], m[0]) / rad, lat = Math.atan2(m[2], Math.hypot(m[0], m[1])) / rad;
    const far = Math.max(...right.map((it) => geoDistance([lon, lat], it.at))) * 6371;
    this.app.renderer.view.flyTo({ lon, lat, zoom: far < 400 ? 4 : far < 1200 ? 3 : far < 3000 ? 2 : 1 }, 1400);
    this.app.renderer.requestRender();
  }

  /** A round in the result: the four in order with their dates and, if missed, the player's order. */
  private orderRow(cur: Q): HTMLElement {
    const right = cur.set!.slice().sort((a, b) => a.t - b.t);
    const from = Math.min(...right.map((x) => x.t));
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, h('span', { class: 'quiz-thumb' }, '🔢'),
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, right.map((x) => tx(x.name)).join(' → ')),
        h('span', { class: 'quiz-sum-ans' }, [right.map((x) => itemWhen(x, from)).join(' · '), cur.ok ? '' : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : L('no answer', 'sin respuesta')].filter(Boolean).join(' · '))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => {
      const q = this.quiz;
      if (!q) return;
      void this.time.history.quizMap(null);
      this.showSet(right);
      q.peek = true;
      this.renderQuiz();
    });
    return row;
  }

  // ---- Time detective: the question and the answer

  private detRegion(id: string) { return this.det?.regions.find((x) => x.id === id); }

  /** "When is this map from?", the region, and four years; after the answer, the names and a line on that time. */
  private renderDetectiveQuestion(cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const d = cur.det!;
    const r = this.detRegion(d.region);
    add(this.card, h('div', { class: 'quiz-q' }, L('When is this map from?', '¿De cuándo es este mapa?')),
      h('div', { class: 'quiz-item' }, `🕵️ ${r ? (tx(r)) : ''}`),
      q.answered ? null : h('div', { class: 'tool-hint' }, L('Each colour is a state, an empire or a people of the time. Their names appear when you answer.', 'Cada color es un Estado, un imperio o un pueblo de la época. Sus nombres aparecen cuando respondes.')));
    const opts = h('div', { class: 'quiz-opts' });
    for (const o of cur.options ?? []) {
      const b = h('button', { type: 'button', class: 'pill quiz-opt' }, this.yearLabel(o)) as HTMLButtonElement;
      if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
      b.addEventListener('click', () => this.answerOption(o, b));
      opts.append(b);
    }
    add(this.card, opts);
    if (feedback) {
      const cap = DETECTIVE_YEARS[d.year];
      // Not in a daily challenge, which would end there.
      const timeline = q.kind === 'daily' ? null : h('button', { type: 'button', class: 'pill sm' }, L('See it on the timeline', 'Verlo en la línea de tiempo'));
      timeline?.addEventListener('click', () => void (async () => {
        await this.stopQuiz();
        this.shell.sheet.close();
        await this.time.history.enter(d.year);
      })());
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text),
        cap ? h('div', { class: 'quiz-caption' }, `${L('The world in {0}', 'El mundo en {0}', this.yearLabel(d.year))}: ${tx(cap)}`) : null,
        h('div', { class: 'tool-hint' }, L('Tap a colour on the map to see its name.', 'Toca un color en el mapa para ver su nombre.')),
        h('div', { class: 'tool-actions' }, timeline, this.nextButton()));
    }
  }

  /** A map in the result: the region and its year and, if missed, the player's year; a tap shows it again, named. */
  private detectiveRow(cur: Q): HTMLElement {
    const d = cur.det!;
    const r = this.detRegion(d.region);
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, h('span', { class: 'quiz-thumb' }, '🕵️'),
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, `${r ? (tx(r)) : ''} · ${this.yearLabel(d.year)}`),
        h('span', { class: 'quiz-sum-ans' }, cur.ok ? '' : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : L('no answer', 'sin respuesta'))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => void (async () => {
      const q = this.quiz;
      if (!q) return;
      this.pins = [];
      await this.time.history.quizMap(d.year, true);
      if (r) this.app.renderer.view.flyTo({ lon: r.cam[0], lat: r.cam[1], zoom: r.cam[2] }, 1400);
      q.peek = true;
      this.renderQuiz();
    })());
    return row;
  }

  // ---- Guess the link

  /** Ten pairs of country facts, a few of each kind of link, each clearly one of the four answers. */
  private async startLinkQuiz() {
    try { await CM.loadFacts(); } catch {
      this.shell.toast(L('This quiz needs the country data; check your connection.', 'Este concurso necesita los datos de los países; revisa tu conexión.'));
      return;
    }
    const pairs: Link[] = [];
    for (const [a, b] of LINK_PAIRS) {
      const an = CM.analyse(a, b, 'both');
      if (an?.kind === 'nn' && linkClear(an.rho)) pairs.push({ a, b, rho: an.rho, n: an.n });
    }
    // Three strong links, three opposite, two weak and two with none, when there are enough.
    const want: Record<string, number> = { up: 3, down: 3, weak: 2, none: 2 };
    const picks: Link[] = [];
    for (const [k, n] of Object.entries(want)) picks.push(...shuffle(pairs.filter((p) => linkBucket(p.rho) === k)).slice(0, n));
    for (const p of shuffle(pairs.filter((x) => !picks.includes(x)))) if (picks.length < 10) picks.push(p);
    // Either way round: sometimes A across, sometimes B.
    const qs: Q[] = shuffle(picks).slice(0, 10).map((p) => {
      const l = Math.random() < 0.5 ? p : { ...p, a: p.b, b: p.a };
      return { id: linkBucket(l.rho), options: [...LINK_ANSWERS], link: l };
    });
    if (this.quiz) await this.stopQuiz(false);
    await this.clearFilters();
    this.quiz = { kind: 'link', region: 'world', qs, i: 0, score: 0, answered: false, savedLabels: { ...this.app.renderer.settings.labels }, peek: false };
    this.app.select(null);
    this.renderQuiz();
  }

  private linkLabel(k: string): string {
    return ({
      up: L('Strong: they rise together', 'Fuerte: suben juntos'),
      weak: L('A weak link', 'Una relación débil'),
      none: L('Little or no link', 'Casi ninguna relación'),
      down: L('Strong: one rises, the other falls', 'Fuerte: uno sube y el otro baja'),
    } as Record<string, string>)[k] ?? k;
  }

  private linkName(key: string) { return `${CM.fieldIcon(key)} ${tx(CM.fieldName(key))}`; }

  /** A small scatter plot of a pair, for the answer and the result. */
  private linkPlot(k: Link, w: number, hgt: number): HTMLCanvasElement {
    const c = h('canvas', { class: 'quiz-plot', role: 'img', 'aria-label': `${tx(CM.fieldName(k.a))} × ${tx(CM.fieldName(k.b))}: ρ = ${fmtR(k.rho)}` }) as HTMLCanvasElement;
    const an = CM.analyse(k.a, k.b, 'both');
    if (an?.kind === 'nn') {
      drawScatter(c, {
        w, h: hgt, dark: this.app.themeId === 'dark', mini: true, line: an.line,
        dots: an.pts.map((p) => ({ iso: p.iso, x: p.x, y: p.y, r: w < 80 ? 1.6 : 2.6, color: '#4dabf7' })),
        ax: { t: an.tx, fmt: String }, ay: { t: an.ty, fmt: String },
      });
    }
    return c;
  }

  /** "How are these two linked?": A, B and the four answers; then the scatter plot. */
  private renderLinkQuestion(cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const k = cur.link!;
    add(this.card, h('div', { class: 'quiz-q' }, L('Across the countries of the world, how are these two linked?', 'En los países del mundo, ¿cómo se relacionan estos dos?')),
      h('div', { class: 'quiz-link' }, h('span', null, this.linkName(k.a)), h('span', { class: 'quiz-link-x' }, '×'), h('span', null, this.linkName(k.b))));
    const opts = h('div', { class: 'quiz-opts' });
    for (const o of cur.options ?? []) {
      const b = h('button', { type: 'button', class: 'pill quiz-opt' }, this.linkLabel(o)) as HTMLButtonElement;
      if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
      b.addEventListener('click', () => this.answerOption(o, b));
      opts.append(b);
    }
    add(this.card, opts);
    if (feedback) {
      const w = Math.min(520, window.innerWidth - 24) - 28;
      const why = LINK_WHY[`${k.a}|${k.b}`] ?? LINK_WHY[`${k.b}|${k.a}`];
      const see = h('button', { type: 'button', class: 'pill sm' }, L('See it on the map', 'Verlo en el mapa'));
      see.addEventListener('click', () => void this.stopQuiz().then(() => this.app.emit('compare', k.a, k.b)));
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text),
        h('div', { class: 'quiz-link-dir' }, direction(k.a, k.b, k.rho)),
        this.linkPlot(k, w, 120),
        h('div', { class: 'quiz-link-axes' }, `→ ${tx(CM.fieldName(k.a))} · ↑ ${tx(CM.fieldName(k.b))} · ${k.n} ${L('countries', 'países')}`),
        why ? h('div', { class: 'tool-hint' }, tx(why)) : null,
        h('div', { class: 'tool-actions' }, see, this.nextButton()));
    }
  }

  /** A pair in the result: its small plot, the right answer and, if missed, yours; a tap opens it on the map. */
  private linkRow(cur: Q): HTMLElement {
    const k = cur.link!;
    const pic = h('span', { class: 'quiz-thumb' }, this.linkPlot(k, 48, 48));
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, pic,
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, `${tx(CM.fieldName(k.a))} × ${tx(CM.fieldName(k.b))}`),
        h('span', { class: 'quiz-sum-ans' }, [`${this.linkLabel(cur.id)} (ρ = ${fmtR(k.rho)})`, cur.ok ? '' : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => void this.stopQuiz().then(() => this.app.emit('compare', k.a, k.b)));
    return row;
  }

  // ---- Which language family?

  /** Ten languages from the country facts, at most three of one family; the wrong answers come first from the
   *  families spoken on the same continents (Hungarian: Indo-European, Turkic...). */
  private async startFamilyQuiz() {
    let ds: CM.Dataset;
    try { ds = await CM.loadFacts(); } catch {
      this.shell.toast(L('This quiz needs the country data; check your connection.', 'Este concurso necesita los datos de los países; revisa tu conexión.'));
      return;
    }
    const langs = (ds.fields.languages?.categories ?? {}) as Record<string, { en: string; es: string; family?: string; branch?: string }>;
    const fams = (ds.fields.language_family?.categories ?? {}) as Record<string, { en: string; es: string }>;
    const where = new Map<string, string[]>();
    for (const [iso, d] of Object.entries(ds.data)) for (const c of (d.languages as string[] | undefined) ?? []) where.set(c, [...(where.get(c) ?? []), iso]);
    const famOf = (code: string) => langs[code]?.family ?? '';
    const real = (code: string) => !!fams[famOf(code)] && !['creole', 'sign-language'].includes(famOf(code)) && !!where.get(code)?.length;
    const byCont = new Map<string, Set<string>>();
    for (const code of Object.keys(langs).filter(real)) {
      for (const iso of where.get(code)!) {
        const k = String(ds.data[iso]?.continent ?? '');
        if (!byCont.has(k)) byCont.set(k, new Set());
        byCont.get(k)!.add(famOf(code));
      }
    }
    const pool = Object.keys(langs).filter((c) => real(c) && !FAMILY_SKIP.has(c));
    const allFams = [...new Set(pool.map(famOf))];
    // Mostly languages that are a country's main one (Hungarian, Thai, Swahili), some smaller ones (Kalanga, Lozi).
    const main = new Set(Object.values(ds.data).map((d) => (d.languages as string[] | undefined)?.[0]).filter((c): c is string => !!c));
    const order = [...shuffle(pool.filter((c) => main.has(c))).slice(0, 7), ...shuffle(pool)];
    const per = new Map<string, number>();
    const picks: string[] = [];
    for (const code of order) {
      if (picks.includes(code)) continue;
      const f = famOf(code);
      if ((per.get(f) ?? 0) >= 3) continue;
      per.set(f, (per.get(f) ?? 0) + 1);
      picks.push(code);
      if (picks.length === 10) break;
    }
    const qs: Q[] = picks.map((code) => {
      const f = famOf(code);
      const near = new Set<string>();
      for (const iso of where.get(code)!) for (const x of byCont.get(String(ds.data[iso]?.continent ?? '')) ?? []) if (x !== f) near.add(x);
      const wrong = [...shuffle([...near]), ...shuffle(allFams.filter((x) => x !== f && !near.has(x)))].slice(0, 3);
      return { id: f, lang: code, options: shuffle([f, ...wrong]) };
    });
    this.famData = { langs, fams, where };
    if (this.quiz) await this.stopQuiz(false);
    await this.clearFilters();
    this.quiz = { kind: 'family', region: 'world', qs, i: 0, score: 0, answered: false, savedLabels: { ...this.app.renderer.settings.labels }, peek: false };
    this.app.select(null);
    this.renderQuiz();
  }

  private langName(code: string) { const c = this.famData?.langs[code]; return c ? (tx(c)) : code; }
  private famName(f: string) { const c = this.famData?.fams[f]; return c ? (tx(c)) : f; }

  /** "Hungarian is a Uralic language, like Finnish and Estonian." */
  private familySentence(code: string, f: string): string {
    const d = this.famData!;
    const official = (c: string) => d.where.get(c)?.length ?? 0;
    // Close relatives first: Polish is like Czech and Russian (Slavic), then the family's big languages.
    const br = d.langs[code].branch;
    const like = Object.keys(d.langs).filter((c) => c !== code && d.langs[c].family === f && official(c) > 0)
      .sort((a, b) => Number(d.langs[b].branch === br) - Number(d.langs[a].branch === br) || official(b) - official(a) || a.localeCompare(b)).slice(0, 2);
    const fam = d.fams[f];
    if (!es()) {
      const a = /^[AEIOU]/.test(fam.en) ? 'an' : 'a';
      return `${d.langs[code].en} is ${a} ${fam.en} language${like.length ? `, like ${joinList(like.map((c) => d.langs[c].en))}` : ''}.`;
    }
    return `El ${lower1(d.langs[code].es)} es una lengua ${lower1(fam.es)}${like.length ? `, como ${joinList(like.map((c) => `el ${lower1(d.langs[c].es)}`))}` : ''}.`;
  }

  /** Where a language is official: "Official in Hungary", "Official in Spain, Mexico, Colombia and 18 more". */
  private officialIn(code: string): string {
    const names = (this.famData?.where.get(code) ?? []).map((iso) => this.app.data.name(iso, lang())).sort((a, b) => a.localeCompare(b));
    if (names.length > 4) return L('Official in {0} and {1} more', 'Oficial en {0} y {1} más', names.slice(0, 3).join(', '), names.length - 3);
    return L('Official in {0}', 'Oficial en {0}', joinList(names));
  }

  /** The Languages filter by family, with the language's (first) country selected. */
  private async showFamilies(code: string) {
    await this.stopQuiz();
    if (this.app.isActive('languages')) this.app.setOption('languages', 'view', 'family');
    else void this.app.activate('languages', { options: { view: 'family' } });
    const iso = this.famData?.where.get(code)?.[0];
    if (iso) this.showCountry(iso);
  }

  private renderFamilyQuestion(cur: Q, feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const code = cur.lang!;
    add(this.card, h('div', { class: 'quiz-q' }, L('Which language family does it belong to?', '¿A qué familia de lenguas pertenece?')),
      h('div', { class: 'quiz-item' }, `🗣️ ${this.langName(code)}`), h('div', { class: 'tool-hint' }, this.officialIn(code)));
    const opts = h('div', { class: 'quiz-opts' });
    for (const o of cur.options ?? []) {
      const b = h('button', { type: 'button', class: 'pill quiz-opt' }, this.famName(o)) as HTMLButtonElement;
      if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); else if (o === cur.pick) b.classList.add('bad'); }
      b.addEventListener('click', () => this.answerOption(o, b));
      opts.append(b);
    }
    add(this.card, opts);
    if (feedback) {
      const see = h('button', { type: 'button', class: 'pill sm' }, L('See the families on the map', 'Ver las familias en el mapa'));
      see.addEventListener('click', () => void this.showFamilies(code));
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, see, this.nextButton()));
    }
  }

  /** A language in the result: its family and, if missed, your answer; a tap shows the families on the map. */
  private familyRow(cur: Q): HTMLElement {
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, h('span', { class: 'quiz-thumb' }, '🗣️'),
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, this.langName(cur.lang!)),
        h('span', { class: 'quiz-sum-ans' }, [this.famName(cur.id), cur.ok ? '' : cur.given ? L('you said {0}', 'dijiste {0}', cur.given) : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => void this.showFamilies(cur.lang!));
    return row;
  }

  /** Ends the quiz on screen and puts the map back as it was (`restore` false: another quiz is starting and keeps the
   * filters put away). */
  private async stopQuiz(restore = true): Promise<void> {
    if (!this.quiz) return;
    stopClip(250, 'card');
    this.app.renderer.settings.labels = { ...this.quiz.savedLabels };
    this.quiz = null;
    this.hopShow = null;
    this.wildShow = null;
    this.greenShow = null;
    this.pin = null;
    this.guess = null;
    this.pins = [];
    this.regions = null;
    this.focusRegion = null;
    this.card.hidden = true;
    this.card.classList.remove('peek');
    this.app.select(null);
    this.app.renderer.requestRender();
    if (this.space?.active) await this.space.exit();
    if (this.skyQuiz) { this.sky?.close(); this.skyQuiz = false; }
    await this.time.history.quizMap(null);
    if (restore) await this.restoreFilters();
  }

  // ---- Tours ----------------------------------------------------------------------------------
  private openTours() {
    const body = h('div');
    const groups: [Tour['group'], string][] = [[undefined, L('Our planet', 'Nuestro planeta')], ['cities', L('Cities through time', 'Ciudades a través del tiempo')], ['history', L('History and culture', 'Historia y cultura')], ['life', L('Life through time', 'La vida en el tiempo')], ['games', L('Games of the world', 'Juegos del mundo')], ['journeys', L('Journeys and trade routes', 'Viajes y rutas comerciales')], ['beliefs', L('Religions and philosophies', 'Religiones y filosofías')], ['writing', L('Writing and languages', 'Escritura y lenguas')], ['plagues', L('Plagues and cures', 'Epidemias y curas')], ['disasters', L('Natural disasters', 'Desastres naturales')], ['music', L('Music and dance', 'Música y baile')], ['books', L('Books and writers', 'Libros y escritores')], ['art', L('Art of the world', 'Arte del mundo')], ['inventions', L('Inventions', 'Inventos')], ['heritage', L('World Heritage', 'Patrimonio de la Humanidad')], ['space', L('Beyond Earth', 'Más allá de la Tierra')], ['nature', L('Wild world', 'Mundo salvaje')]];
    for (const [group, title] of groups) {
      const list = h('div', { class: 'mode-list' });
      const tours = TOURS.filter((x) => x.group === group);
      if (!tours.length) continue;
      for (const tour of tours) {
        const c = h('button', { type: 'button', class: 'mode-card', 'data-tour': tour.en }, h('span', { class: 'mode-icon' }, tour.icon),
          h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, tx(tour)), h('span', { class: 'mode-desc' }, `${tour.steps.length} ${L('stops', 'paradas')}`)));
        c.addEventListener('click', () => void this.startTour(tour));
        list.append(c);
      }
      body.append(h('h3', { class: 'sec-title' }, title), list);
    }
    this.shell.openPanel('tours', L('Guided tours', 'Visitas guiadas'), body);
  }

  /** Starts a guided tour (also from the travel guide's city tours). */
  async startTour(tour: Tour) {
    this.beforeStart?.();
    await this.stopQuiz();
    this.shell.sheet.close();
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    // It plays from the start by itself (the pause button stops it), and stops at its last stop.
    this.tour = { name: tour.en, steps: tour.steps, i: 0, auto: true, timer: 0, fold: false, voice: 'off', after: 0, at: 0 };
    await this.showStep();
  }

  private async showStep() {
    const tr = this.tour!;
    const i = tr.i;
    tr.voice = 'off';
    clearTimeout(tr.after);
    if (narrationOn()) stopSpeaking();
    await this.showStop();
    // Read aloud once the stop is shown (unless the reader has moved on meanwhile).
    if (this.tour === tr && tr.i === i) this.narrateStep();
  }

  private async showStop() {
    const tr = this.tour!;
    const s = tr.steps[tr.i];
    // The full-screen views (solar system, sky, galaxy, elements) close at any stop that isn't theirs.
    const done = () => { this.renderTour(); if (this.tour === tr && tr.i === tr.steps.length - 1) this.badgeToast(recordTour(tr.name)); };
    if (!s.orrery && !s.sky && !s.galaxy && !s.elements) this.space?.closeOverlays();
    if (s.sky && this.sky) {
      if (this.space?.active) await this.space.exit();
      if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      await this.sky.show({ fov: 90, ...s.sky });
      done();
      return;
    }
    if (s.galaxy && this.space?.openGalaxy) {
      if (this.space.active) await this.space.exit();
      this.space.openGalaxy(s.galaxy);
      done();
      return;
    }
    if (s.elements && this.elements) {
      if (this.space?.active) await this.space.exit();
      await this.elements.show(s.elements.origin ?? null, s.elements.mark ?? null);
      done();
      return;
    }
    if (s.orrery && this.space?.openOrrery) {
      const [y, m, d] = s.orrery.date.split('-').map(Number);
      const jd = Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;
      this.orrery?.show(jd, s.orrery.scale ?? 'planets', s.orrery.speed);
      this.renderTour();
      if (this.tour === tr && tr.i === tr.steps.length - 1) this.badgeToast(recordTour(tr.name));
      return;
    }
    if (s.world && this.space) {
      await this.space.enter(s.world, { map: s.map ?? 'photo', camera: s.fly ? { lon: s.fly[0], lat: s.fly[1], zoom: s.fly[2] } : undefined });
      this.renderTour();
      if (this.tour === tr && tr.i === tr.steps.length - 1) this.badgeToast(recordTour(tr.name));
      return;
    }
    if (this.space?.active && !s.story) await this.space.exit();
    if (s.story) {
      const [kind, id, step] = s.story;
      if (this.app.mode && this.app.mode !== kind) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      try { await this.time.stories[kind].show(id, step - 1); } catch { /* offline */ }
    } else if (s.mode) { await this.time.enter(s.mode); }
    else {
      if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      if (s.projection && this.app.projection !== s.projection) this.app.setProjection(s.projection);
      if (s.stack) await this.app.setStack(s.stack);
      for (const [id, o] of Object.entries(s.options ?? {})) for (const [k, v] of Object.entries(o)) this.app.setOption(id, k, v);
      // Wild world: one animal's range at this stop, or every animal again.
      if (s.wild || this.app.isActive('wild')) await focusAnimal(s.wild ?? null);
      // Green planet: one plant's range at this stop, or every plant again.
      if (s.green || this.app.isActive('plants')) await focusPlant(s.green ?? null);
    }
    // Inside the Earth: the globe cut open at this stop (centred where it flies to), or closed again.
    if (s.cut) this.inside?.showCut({ ...s.cut, lon: s.fly?.[0] });
    else this.inside?.hideCut();
    if (s.fly) this.app.renderer.view.flyTo({ lon: s.fly[0], lat: s.fly[1], zoom: s.fly[2] }, 2200);
    this.app.renderer.requestRender();
    this.renderTour();
    // A tour followed to its last stop counts for the tour badges.
    if (this.tour === tr && tr.i === tr.steps.length - 1) this.badgeToast(recordTour(tr.name));
  }

  /** The tour card: the stop, its controls and its text (folded away to see more of the map). */
  private renderTour() {
    const tr = this.tour;
    if (!tr) return;
    // The screen stays on while the tour plays by itself or reads aloud.
    keepAwake('tour', tr.auto || narrationOn());
    const s = tr.steps[tr.i];
    clear(this.card);
    const prev = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Previous' }, icon(ChevronLeft, 18));
    prev.addEventListener('click', () => { if (tr.i > 0) { tr.i--; void this.showStep(); } });
    const next = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Next' }, icon(ChevronRight, 18));
    next.addEventListener('click', () => this.nextStep());
    // At the last stop, once it has played through, ▶ becomes ↺: play it again from the start.
    const again = !tr.auto && tr.i === tr.steps.length - 1;
    const autoLabel = tr.auto ? L('Pause', 'Pausa') : again ? L('Start again', 'Empezar de nuevo') : Lc('to play a recording or an animation', 'Play', 'Reproducir');
    const auto = h('button', { type: 'button', class: 'icon-btn sm tour-auto', 'aria-label': 'Auto', title: autoLabel, 'aria-pressed': String(tr.auto), 'data-state': tr.auto ? 'playing' : again ? 'again' : 'paused' }, icon(tr.auto ? Pause : again ? RotateCcw : Play, 16));
    auto.addEventListener('click', () => {
      if (again) { tr.auto = true; tr.i = 0; void this.showStep(); this.renderTour(); return; }
      tr.auto = !tr.auto; this.armAuto(); this.renderTour();
    });
    const foldLabel = tr.fold ? L('Show the text', 'Mostrar el texto') : L('Hide the text', 'Ocultar el texto');
    const fold = h('button', { type: 'button', class: 'icon-btn sm tour-fold', title: foldLabel, 'aria-label': foldLabel, 'aria-expanded': String(!tr.fold) }, icon(tr.fold ? ChevronDown : ChevronUp, 16));
    fold.addEventListener('click', () => { tr.fold = !tr.fold; this.renderTour(); });
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stopTour());
    // Read aloud: on or off for tours and stories alike (kept for the next visit).
    let voice: HTMLElement | null = null;
    if (canSpeak()) {
      const on = narrationOn();
      const vLabel = on ? L('Stop reading aloud', 'Dejar de leer en voz alta') : L('Read aloud', 'Leer en voz alta');
      voice = h('button', { type: 'button', class: `icon-btn sm tour-voice${on ? ' on' : ''}`, title: vLabel, 'aria-label': vLabel, 'aria-pressed': String(on) }, icon(on ? Volume2 : VolumeX, 16));
      voice.addEventListener('click', () => {
        setNarrationOn(!narrationOn());
        if (narrationOn()) this.narrateStep(); else { tr.voice = 'off'; this.armAuto(); }
        this.renderTour();
      });
    }
    const body = tx(s);
    add(this.card,
      h('div', { class: 'tool-head' }, h('strong', null, `${s.icon ?? '🧭'} ${es() ? s.title_es : s.title_en}`), h('span', { class: 'tour-tools' }, prev, h('span', { class: 'small muted' }, `${tr.i + 1}/${tr.steps.length}`), next, auto, voice, fold, close)),
      tr.fold ? null : h('div', { class: 'tour-text' }, ...sentences(body).map((x, k) => h('span', { class: 'tour-s', 'data-s': String(k) }, `${x} `))));
    this.card.classList.toggle('peek', tr.fold);
    this.card.hidden = false;
    requestAnimationFrame(() => this.syncInset());
  }

  /**
   * The map centres between the card and what covers the bottom of the screen: on a phone, outside
   * Time travel (whose bars set the bottom themselves), the dock and the chips and legend over it.
   * The insets ease there, so the map glides rather than jumps.
   */
  private insetGoal = 0;
  private bottomGoal = 0;
  private insetRaf = 0;
  private syncInset() {
    const shown = !this.card.hidden;
    const r = shown ? this.card.getBoundingClientRect() : null;
    this.insetGoal = r && r.height ? Math.round(r.bottom + 8) : 0;
    document.documentElement.classList.toggle('has-quiz', shown && !!this.quiz);
    let bottom = 0;
    if (shown && matchMedia('(max-width: 720px)').matches) {
      const tops = ['.dock', '.chips', '.legend'].map((q) => document.querySelector<HTMLElement>(q)?.getBoundingClientRect())
        .filter((b): b is DOMRect => !!b && b.height > 0).map((b) => b.top);
      if (tops.length) bottom = Math.max(0, Math.round(window.innerHeight - Math.min(...tops) + 6));
    }
    this.bottomGoal = bottom;
    if (!this.insetRaf) this.insetRaf = requestAnimationFrame(this.easeInset);
  }
  private easeInset = () => {
    const v = this.app.renderer.view;
    const ease = (from: number, to: number) => (Math.abs(to - from) < 1 ? to : from + (to - from) * 0.3);
    v.insetTop = ease(v.insetTop, this.insetGoal);
    let done = v.insetTop === this.insetGoal;
    if (!this.app.mode) { v.insetBottom = ease(v.insetBottom, this.bottomGoal); done &&= v.insetBottom === this.bottomGoal; }
    this.app.renderer.requestRender();
    this.insetRaf = done ? 0 : requestAnimationFrame(this.easeInset);
  };

  /** Flies to a country and outlines it, without opening its card (it would cover the map). */
  private showCountry(id: string) {
    this.app.flyToCountry(id, false);
    this.app.renderer.selection = id;
    this.app.renderer.requestRender();
  }

  private nextStep() {
    const tr = this.tour;
    if (!tr) return;
    if (tr.i + 1 < tr.steps.length) { tr.i++; void this.showStep(); }
    else if (tr.auto) {
      // The end: it stays at the last stop (↺ plays it again).
      tr.auto = false;
      clearInterval(tr.timer);
      clearTimeout(tr.after);
      this.renderTour();
    }
  }

  /** The words a stop reads aloud: its title, then its text. */
  private stopWords(s: TourStep): string {
    const title = es() ? s.title_es : s.title_en;
    return `${/[.!?…]$/.test(title) ? title : `${title}.`} ${tx(s)}`;
  }

  /** Reads the stop aloud (when reading aloud is on); auto-play then goes on when the voice is done. */
  private narrateStep() {
    const tr = this.tour;
    if (!tr) return;
    clearTimeout(tr.after);
    if (!narrationOn()) { tr.voice = 'off'; this.armAuto(); return; }
    clearInterval(tr.timer);
    const s = tr.steps[tr.i], i = tr.i;
    const titleParts = sentences(/[.!?…]$/.test(es() ? s.title_es : s.title_en) ? (es() ? s.title_es : s.title_en) : `${es() ? s.title_es : s.title_en}.`).length;
    tr.voice = 'reading';
    tr.at = performance.now();
    void speak(this.stopWords(s), { lang: dataLang(), onSentence: (k) => this.readingSentence(k - titleParts) }).then((done) => {
      if (this.tour !== tr || tr.i !== i) return;
      this.readingSentence(-1);
      tr.voice = done ? 'done' : 'off';
      if (done && tr.auto) this.afterVoice();
    });
  }

  /** Marks the sentence being read in the tour card (-1: none). */
  private readingSentence(k: number) {
    this.card.querySelectorAll<HTMLElement>('.tour-s').forEach((el) => el.classList.toggle('reading', Number(el.dataset.s) === k));
  }

  /** After the voice, a moment to look at the map, then the next stop (at least six seconds a stop). */
  private afterVoice() {
    const tr = this.tour;
    if (!tr) return;
    clearTimeout(tr.after);
    tr.after = window.setTimeout(() => { if (this.tour === tr && tr.auto) this.nextStep(); }, Math.max(1500, 6000 - (performance.now() - tr.at)));
  }

  private armAuto() {
    const tr = this.tour;
    if (!tr) return;
    clearInterval(tr.timer);
    clearTimeout(tr.after);
    if (!tr.auto) return;
    // Reading aloud: the voice sets the pace.
    if (narrationOn()) {
      if (tr.voice === 'done') this.afterVoice();
      else if (tr.voice === 'off') this.narrateStep();
      return;
    }
    tr.timer = window.setInterval(() => this.nextStep(), 9000);
  }

  private stopTour() {
    if (!this.tour) return;
    // A story the tour showed gets its own controls back.
    for (const st of Object.values(this.time.stories)) st.unguide();
    clearInterval(this.tour.timer);
    clearTimeout(this.tour.after);
    if (this.tour.voice !== 'off') stopSpeaking();
    // A tour that went beyond the Earth comes back to it.
    if (this.tour.steps.some((x) => x.world || x.orrery || x.sky || x.galaxy || x.elements)) { this.space?.closeOverlays(); if (this.space?.active) void this.space.exit(); }
    this.tour = null;
    this.inside?.hideCut();
    keepAwake('tour', false);
    this.card.hidden = true;
    this.card.classList.remove('peek');
  }

  // ---- On this day ----------------------------------------------------------------------------
  /** The stories' dated steps and items, a month at a time (data/onthisday/MM.json, scripts/data/build-onthisday.mjs). */
  private otdMonths = new Map<number, OtdMonth>();
  /** The day On this day shows, to go back to it from a story. */
  private otdDay = new Date();

  private async otdMonth(m: number): Promise<OtdMonth | null> {
    if (!this.otdMonths.has(m)) {
      try { this.otdMonths.set(m, await loadJSON<OtdMonth>(`onthisday/${String(m).padStart(2, '0')}.json`)); } catch { return null; }
    }
    return this.otdMonths.get(m)!;
  }

  /** A day of the year (today by default): what the stories tell of it, each opening its step, then Wikipedia's
   *  selection of events, with a link to the story that tells the same event. Arrows go to the day before or after. */
  async openOnThisDay(day = new Date()) {
    this.otdDay = day;
    const loc = appLocale();
    const label = day.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
    const go = (k: number) => { const d = new Date(day.getFullYear(), day.getMonth(), day.getDate() + k); void this.openOnThisDay(d); };
    const prev = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': L('The day before', 'El día anterior'), 'data-otd': 'prev' }, icon(ChevronLeft, 18));
    prev.addEventListener('click', () => go(-1));
    const next = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': L('The day after', 'El día siguiente'), 'data-otd': 'next' }, icon(ChevronRight, 18));
    next.addEventListener('click', () => go(1));
    const today = dayKey(day) === dayKey() ? null : h('button', { type: 'button', class: 'pill sm', 'data-otd': 'today' }, L('Today', 'Hoy'));
    today?.addEventListener('click', () => void this.openOnThisDay());
    const stories = h('div', { class: 'otd otd-stories' }, h('p', { class: 'muted small' }, t('dataLoading')));
    const wiki = h('div', { class: 'otd otd-wiki' }, h('p', { class: 'muted small' }, t('dataLoading')));
    const body = h('div', null, h('div', { class: 'otd-nav' }, prev, h('strong', { class: 'otd-date' }, label), next, today),
      h('h3', { class: 'sec-title' }, `📖 ${L('In the stories', 'En las historias')}`), stories,
      h('h3', { class: 'sec-title' }, `🌐 ${L('Chosen by Wikipedia', 'Elegidos por Wikipedia')}`), wiki);
    this.shell.openPanel('onthisday', L('On this day', 'Tal día como hoy'), body, () => { this.pin = null; this.app.renderer.requestRender(); });
    const mm = day.getMonth() + 1, dd = day.getDate();
    const month = await this.otdMonth(mm);
    const entries = month?.days[String(dd)] ?? [];
    this.fillOtdStories(stories, month, entries);
    await this.fillOtdWiki(wiki, mm, dd, month, entries);
  }

  /** "1918", "44 BC". */
  private otdYear(date: string): string {
    const y = Number(/^-?\d+/.exec(date)?.[0] ?? 0);
    return y < 0 ? `${-y} ${L('BC', 'a. C.')}` : String(y);
  }

  private fillOtdStories(el: HTMLElement, month: OtdMonth | null, entries: OtdEntry[]) {
    clear(el);
    if (!month) { el.append(h('p', { class: 'muted small' }, L('The stories need a connection the first time.', 'Las historias necesitan conexión la primera vez.'))); return; }
    if (!entries.length) { el.append(h('p', { class: 'muted small' }, L('The stories tell nothing of this day yet.', 'Las historias aún no cuentan nada de este día.'))); return; }
    // Newest first, as Wikipedia's list.
    for (const e of entries.slice().reverse()) {
      const [key, step, date, ic, en, sp] = e;
      const st = month.stories[key];
      const row = h('button', { type: 'button', class: 'otd-item otd-story', 'data-story': `${key}#${step}` },
        h('span', { class: 'otd-year' }, this.otdYear(date)),
        h('span', { class: 'otd-text' }, h('span', { class: 'otd-title' }, `${ic} ${es() ? sp : en}`), h('span', { class: 'otd-from' }, st ? `${st[0]} ${es() ? st[2] : st[1]}` : '')),
        h('span', { class: 'otd-go' }, '📖'));
      row.addEventListener('click', () => void this.openStoryStep(key, step));
      el.append(row);
    }
  }

  /** Opens a story at a step (from On this day), closing any quiz or tour; the story's X comes back to the day. */
  private async openStoryStep(key: string, step: number) {
    const [kind, id] = key.split('/') as [StoryKind, string];
    const day = this.otdDay;
    this.stopTour();
    await this.stopQuiz();
    this.app.emit('open-story', kind, id, step, () => void this.openOnThisDay(day));
  }

  private async fillOtdWiki(el: HTMLElement, mm: number, dd: number, month: OtdMonth | null, entries: OtdEntry[]) {
    try {
      const r = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/${dataLang()}/onthisday/selected/${String(mm).padStart(2, '0')}/${String(dd).padStart(2, '0')}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { selected?: { text: string; year: number; pages?: { title: string; normalizedtitle?: string; coordinates?: { lat: number; lon: number } }[] }[] };
      if (!el.isConnected) return;
      clear(el);
      const events = (j.selected ?? []).sort((a, b) => b.year - a.year);
      if (!events.length) el.append(h('p', { class: 'muted' }, t('noResults')));
      for (const ev of events) {
        const place = this.locate(ev.text, ev.pages ?? []);
        const item = h('button', { type: 'button', class: `otd-item${place ? '' : ' noplace'}` },
          h('span', { class: 'otd-year' }, String(ev.year)), h('span', { class: 'otd-text' }, ev.text), place ? h('span', { class: 'otd-go' }, '📍') : null);
        if (place) item.addEventListener('click', () => {
          this.pin = { lon: place.lon, lat: place.lat, text: String(ev.year) };
          this.app.flyTo(place.lon, place.lat, Math.max(2.5, this.app.renderer.view.zoom));
          if (matchMedia('(max-width: 720px)').matches) this.shell.sheet.close();
        });
        // The same year in the stories: most likely the same event; a link opens its step.
        const same = entries.find((e) => Number(/^-?\d+/.exec(e[2])?.[0]) === ev.year);
        const story = same && month ? h('button', { type: 'button', class: 'pill sm otd-link', 'data-story': `${same[0]}#${same[1]}` }, `📖 ${es() ? month.stories[same[0]]?.[2] : month.stories[same[0]]?.[1]}`) : null;
        story?.addEventListener('click', () => void this.openStoryStep(same![0], same![1]));
        el.append(h('div', { class: 'otd-row' }, item, story));
      }
      el.append(h('p', { class: 'muted small' }, L('Events from Wikipedia (CC BY-SA).', 'Acontecimientos de Wikipedia (CC BY-SA).')));
    } catch (e) {
      clear(el);
      el.append(h('p', { class: 'muted' }, L('Needs an internet connection ({0}).', 'Necesita conexión a internet ({0}).', (e as Error).message)));
    }
  }

  /** A place for an event: page coordinates, else a country or city named in the text. */
  private locate(text: string, pages: { title: string; normalizedtitle?: string; coordinates?: { lat: number; lon: number } }[]) {
    for (const p of pages) if (p.coordinates) return { lon: p.coordinates.lon, lat: p.coordinates.lat };
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const hay = norm(`${text} ${pages.map((p) => p.normalizedtitle ?? p.title).join(' ')}`);
    let best: { lon: number; lat: number; len: number } | null = null;
    for (const [, m] of Object.entries(this.app.data.meta)) {
      for (const n of [m.n, m.es, m.sn, m.ses].filter(Boolean) as string[]) {
        if (n.length < 4) continue;
        const re = new RegExp(`\\b${norm(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(hay) && (!best || n.length > best.len)) best = { lon: m.lx, lat: m.ly, len: n.length };
      }
    }
    if (best) return best;
    for (const c of this.app.data.cities.slice(0, 1500)) {
      if (c.name.length >= 5 && new RegExp(`\\b${norm(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) return { lon: c.lon, lat: c.lat };
    }
    return null;
  }
}
