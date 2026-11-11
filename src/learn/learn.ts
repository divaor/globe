// Learn and play: quizzes (find the country, flags, capitals), guided tours, and "On this day".
import { GraduationCap, Compass, CalendarDays, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Play, Pause, Map as MapIcon } from 'lucide';
import { geoDistance } from 'd3-geo';
import { h, icon, clear, add } from '../ui/dom';
import { t, tx, lang, flagEmoji } from '../app/i18n';
import { dataUrl, loadJSON } from '../data/store';
import { fmtWhen, itemWhen, itemThumb, sampleEl, type CollectionItem, type StoryKind } from '../modes/stories';
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

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

type QuizKind = 'find' | 'flag' | 'capital' | 'where' | 'when' | 'dish' | 'era' | 'civ' | 'period' | 'region' | 'champion' | 'link' | 'journey' | 'faith' | 'script' | 'family';
/** An item of a story collection, tagged with its collection. */
interface QItem extends CollectionItem { kind: StoryKind }
/** A question; once answered, whether it was right and what the player answered. */
interface Q { id: string; options?: string[]; item?: QItem; ok?: boolean; given?: string; pick?: string; link?: Link; lang?: string }
/** "Guess the link": two country facts, their correlation and how many countries have both. */
interface Link { a: string; b: string; rho: number; n: number }
const ITEM_QUIZZES: QuizKind[] = ['where', 'when', 'dish', 'era', 'civ', 'period', 'champion', 'journey', 'faith', 'script'];
/** "Which faith?" asks about the faith stories, not the time tour of them all. */
const FAITH_TOURS = ['faiths-through-time'];
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
const COLLECTION_DIR: Record<StoryKind, string> = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life', games: 'games', journeys: 'journeys', beliefs: 'beliefs', writing: 'writing' };
const yearOf = (d: string) => Number(/^-?\d+/.exec(d)?.[0] ?? 0);

/** Four years to choose from: the right one and three plausible others (no year 0, none in the future). */
function yearOptions(y: number): number[] {
  const age = Math.max(60, 2026 - y);
  const step = age > 3000 ? 500 : age > 1000 ? 100 : age > 300 ? 50 : age > 120 ? 10 : 5;
  const opts = new Set([y]);
  for (let guard = 0; opts.size < 4 && guard < 200; guard++) {
    const f = (0.15 + Math.random() * 0.65) * (Math.random() < 0.5 ? -1 : 1);
    let o = Math.round((y + f * age) / step) * step;
    if (o > 2024) o = 2024 - step * (1 + Math.floor(Math.random() * 3));
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

export class Learn {
  private card: HTMLElement;
  /** `peek`: the card is folded to one line so the map can be seen; `done`: the result is up. */
  /** `region`: the continent of a country quiz, or the country of a States and provinces quiz (`all`: every region, not ten). */
  private quiz: { kind: QuizKind; region: string; qs: Q[]; i: number; score: number; answered: boolean; savedLabels: RenderSettings['labels']; peek: boolean; fb?: { ok: boolean; text: string }; done?: boolean; best?: number; all?: boolean } | null = null;
  private tour: { steps: TourStep[]; i: number; auto: boolean; timer: number; fold: boolean } | null = null;
  private pin: { lon: number; lat: number; text: string } | null = null;
  private items: Partial<Record<StoryKind, CollectionItem[]>> = {};
  private eras = new Map<string, { name: { en: string; es: string }; icon: string }>();
  private civs = new Map<string, { name: { en: string; es: string }; icon: string }>();
  /** Journeys and trade routes: the stories "Which journey?" asks about. */
  private journeys = new Map<string, { name: { en: string; es: string }; icon: string }>();
  /** Religions and philosophies: the stories "Which faith?" asks about. */
  private faiths = new Map<string, { name: { en: string; es: string }; icon: string }>();
  /** "Which script?": the scripts' names, by item id. */
  private scriptNames = new Map<string, { en: string; es: string }>();
  /** "Which language family?": the languages and families of the country facts, and where each language is official. */
  private famData: { langs: Record<string, { en: string; es: string; family?: string; branch?: string }>; fams: Record<string, { en: string; es: string }>; where: Map<string, string[]> } | null = null;
  /** The geologic periods of the last 1000 million years, oldest first (the answers of "Which period?"). */
  private periods: Unit[] = [];
  /** States and provinces: the country's regions, and the one picked in the result. */
  private regions: { a3: string; list: Region[] } | null = null;
  private focusRegion: string | null = null;

  constructor(private app: App, private shell: Shell, private time: TimeTravel) {
    this.card = h('section', { class: 'learn-card glass', hidden: true });
    app.root.append(this.card);
    // The map centres below the card, so what a tour or an answer shows is not behind it.
    new ResizeObserver(() => this.syncInset()).observe(this.card);
    shell.addMenu({ id: 'quiz', icon: GraduationCap, label: () => L('Quiz', 'Concurso'), order: 30, onClick: () => this.openQuizMenu() });
    shell.addMenu({ id: 'tours', icon: Compass, label: () => L('Guided tours', 'Visitas guiadas'), order: 31, onClick: () => this.openTours() });
    shell.addMenu({ id: 'onthisday', icon: CalendarDays, label: () => L('On this day', 'Tal día como hoy'), order: 32, onClick: () => void this.openOnThisDay() });
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.quiz || this.quiz.answered || this.quiz.done || !['find', 'where', 'region'].includes(this.quiz.kind)) return false;
      if (g && this.quiz.kind === 'find') this.answerFind(app.renderer.countryAt(g[0], g[1]));
      if (g && this.quiz.kind === 'where') this.answerWhere(g as [number, number]);
      if (g && this.quiz.kind === 'region' && this.regions) {
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
    app.renderer.overlays.add((rc) => {
      if (!this.pin) return;
      const p = rc.project(this.pin.lon, this.pin.lat);
      if (!p) return;
      const { ctx } = rc;
      ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, Math.PI * 2); ctx.fillStyle = '#ff6b6b'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
      rc.labels.add({ text: this.pin.text, x: p[0] + 14, y: p[1], align: 'left', priority: 3000, size: 13, weight: 800, color: '#fff', halo: 'rgba(0,0,0,0.85)' });
    });
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

  private openQuizMenu() {
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
    const kinds: [QuizKind, string, string, string][] = [
      ['find', '📍', L('Find the country', 'Encuentra el país'), L('Tap it on the globe (labels hidden).', 'Tócalo en el globo (sin etiquetas).')],
      ['flag', '🏳️', L('Flags', 'Banderas'), L('Which country has this flag?', '¿De qué país es esta bandera?')],
      ['capital', '🏛️', L('Capitals', 'Capitales'), L('Pick the right capital city.', 'Elige la capital correcta.')],
      ['region', '🗺️', L('States and provinces', 'Estados y provincias'), L('Tap the state or province in the United States, Mexico, Canada and 45 more countries.', 'Toca el estado o la provincia en Estados Unidos, México, Canadá y 45 países más.')],
    ];
    const list = h('div', { class: 'mode-list' });
    for (const [k, ic, title, desc] of kinds) {
      const best = k === 'region' ? null : localStorage.getItem(`atlas-quiz-best:${k}`);
      const c = h('button', { type: 'button', class: 'mode-card', 'data-quiz': k }, h('span', { class: 'mode-icon' }, ic),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, `${desc}${best ? ` · ${L('Best', 'Récord')}: ${best}/10` : ''}`)));
      c.addEventListener('click', () => void (k === 'region' ? this.openRegionPicker(region) : this.startQuiz(k, region)));
      list.append(c);
    }
    const more: [QuizKind, string, string, string][] = [
      ['where', '📍', L('Where in the world?', '¿Dónde está?'), L('Tap on the globe where a monument, a work, a dish or a fossil comes from.', 'Toca en el globo de dónde es un monumento, una obra, un plato o un fósil.')],
      ['when', '⏳', L('When was it?', '¿Cuándo fue?'), L('Pick the year it was built, made or first recorded.', 'Elige el año en que se construyó, se hizo o aparece por primera vez.')],
      ['dish', '🍲', L('Dishes of the world', 'Platos del mundo'), L('Which country does this dish come from?', '¿De qué país es este plato?')],
      ['era', '🎨', L('Which era?', '¿Qué época?'), L('Match people, works and inventions to their era.', 'Relaciona personas, obras e inventos con su época.')],
      ['civ', '🏺', L('Which civilization?', '¿Qué civilización?'), L('Match finds, works and rulers to their civilization.', 'Relaciona hallazgos, obras y gobernantes con su civilización.')],
      ['period', '🦕', L('Which period?', '¿Qué periodo?'), L('Match fossils and ancient animals to their geologic period.', 'Relaciona fósiles y animales antiguos con su periodo geológico.')],
      ['champion', '🏆', L('Who won?', '¿Quién ganó?'), L('World Cup champions, and the countries that topped each Olympics\u2019 medal table.', 'Los campeones del Mundial y los países que encabezaron el medallero de cada Olimpiada.')],
      ['journey', '🧭', L('Which journey?', '¿Qué viaje?'), L('Match places, people and goods to the great journey or trade route they belong to.', 'Relaciona lugares, personas y mercancías con el gran viaje o la ruta comercial a la que pertenecen.')],
      ['faith', '🛐', L('Which faith?', '¿Qué religión?'), L('Match sacred places, texts and teachers to the faith or school of thought they belong to.', 'Relaciona lugares sagrados, textos y maestros con la religión o la escuela de pensamiento a la que pertenecen.')],
      ['script', '✍️', L('Which script?', '¿Qué escritura?'), L('A word or a few letters in one of the world\u2019s scripts: which script is it?', 'Una palabra o unas letras en una de las escrituras del mundo: ¿cuál es?')],
      ['family', '🗣️', L('Which language family?', '¿Qué familia de lenguas?'), L('Hungarian, Swahili, Malagasy...: which family does each language belong to?', 'Húngaro, suajili, malgache...: ¿a qué familia pertenece cada lengua?')],
      ['link', '📈', L('Guess the link', 'Adivina la relación'), L('Do two facts about countries go together? Guess, then see the scatter plot.', '¿Van juntos dos datos de los países? Adivina y luego mira el diagrama de dispersión.')],
    ];
    const list2 = h('div', { class: 'mode-list' });
    for (const [k, ic, title, desc] of more) {
      const best = localStorage.getItem(`atlas-quiz-best:${k}`);
      const c = h('button', { type: 'button', class: 'mode-card', 'data-quiz': k }, h('span', { class: 'mode-icon' }, ic),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, `${desc}${best ? ` · ${L('Best', 'Récord')}: ${best}/10` : ''}`)));
      c.addEventListener('click', () => void this.startQuiz(k, region));
      list2.append(c);
    }
    this.shell.openPanel('quiz', L('Quiz', 'Concurso'), h('div', null, h('h3', { class: 'sec-title' }, L('Region', 'Región')), regionRow, h('h3', { class: 'sec-title' }, L('Game', 'Juego')), list,
      h('h3', { class: 'sec-title' }, L('History, culture, life, sport and travel', 'Historia, cultura, vida, deporte y viajes')), list2));
  }

  private async startQuiz(kind: QuizKind, region: string) {
    this.stopTour();
    this.shell.sheet.close();
    if (kind === 'region') { await this.startRegionQuiz(region, false); return; }
    if (kind === 'link') { await this.startLinkQuiz(); return; }
    if (kind === 'family') { await this.startFamilyQuiz(); return; }
    if (ITEM_QUIZZES.includes(kind)) { await this.startItemQuiz(kind); return; }
    const pool = this.pool(region);
    const ids = shuffle(pool.slice()).slice(0, 10);
    const qs: Q[] = ids.map((id) => {
      if (kind === 'find') return { id };
      const others = shuffle(pool.filter((x) => x !== id)).slice(0, 3);
      return { id, options: shuffle([id, ...others]) };
    });
    const labels = { ...this.app.renderer.settings.labels };
    if (kind === 'find') Object.assign(this.app.renderer.settings.labels, { countries: false, capitals: false, cities: false });
    this.quiz = { kind, region, qs, i: 0, score: 0, answered: false, savedLabels: labels, peek: false };
    this.app.select(null);
    if (this.app.renderer.view.current.kind !== 'globe' && kind === 'find') this.app.setProjection('globe');
    this.renderQuiz();
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
    this.stopTour();
    this.shell.sheet.close();
    let list: Region[];
    try { list = await loadRegions(a3); } catch {
      this.shell.toast(L('This quiz needs its map data; check your connection.', 'Este concurso necesita sus datos de mapa; revisa tu conexión.'));
      return;
    }
    if (this.quiz) this.stopQuiz();
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
      v.flyTo(frameRegions(v, list, m ? [m.lx, m.ly] : list[0].at, mapH), 1400);
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
    if (ok) q.score++;
    cur.ok = ok; cur.pick = id ?? undefined;
    const right = rg.list.find((r) => r.id === cur.id)!, tapped = id ? rg.list.find((r) => r.id === id) : undefined;
    const name = this.regionName(right);
    cur.given = tapped ? this.regionName(tapped) : L('no answer', 'sin respuesta');
    let text = ok ? L(`Correct! That's ${name}.`, `¡Correcto! Es ${name}.`) : L(`${name} is in yellow.`, `${name} está en amarillo.`);
    if (!ok && tapped) {
      const km = Math.round(geoDistance(tapped.at, right.at) * 6371);
      text = L(`You tapped ${cur.given}. ${name} is in yellow, ${km.toLocaleString('en-GB')} km away.`, `Tocaste ${cur.given}. ${name} está en amarillo, a ${km.toLocaleString('es-ES')} km.`);
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
    add(this.card, h('div', { class: 'quiz-q' }, L(`Where is ${this.regionName(r)}?`, `¿Dónde está ${this.regionName(r)}?`)),
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
    if (kinds.includes('people') && !this.civs.size) {
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>('people/index.json')).stories) if (CIV_STORIES.includes(st.id)) this.civs.set(st.id, st);
    }
  }

  /** The quizzes about the story collections: their items make the questions. */
  private async startItemQuiz(kind: QuizKind) {
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    const needs: StoryKind[] = kind === 'dish' ? ['food'] : kind === 'era' ? ['eras'] : kind === 'civ' ? ['people'] : kind === 'period' ? ['life'] : kind === 'champion' ? ['games'] : kind === 'journey' ? ['journeys'] : kind === 'faith' ? ['beliefs'] : kind === 'script' ? ['writing'] : kind === 'where' ? ['structures', 'eras', 'food', 'people', 'life', 'games', 'journeys', 'beliefs', 'writing'] : ['structures', 'eras', 'food', 'writing'];
    try { await this.loadItems(needs); } catch { /* offline: the pool stays small */ }
    const tag = (k: StoryKind): QItem[] => (this.items[k] ?? []).map((it) => ({ ...it, kind: k }));
    const is = (it: QItem, ...types: string[]) => !!it.type && types.includes(it.type);
    let pool: QItem[] = [];
    if (kind === 'where') pool = [...tag('structures'), ...tag('eras').filter((it) => !is(it, 'person')), ...tag('food').filter((it) => is(it, 'dish', 'site')), ...tag('people').filter((it) => is(it, 'site', 'structure', 'fossil', 'work', 'culture')), ...tag('life').filter((it) => is(it, 'fossil', 'site', 'species', 'animal')), ...tag('games').filter((it) => is(it, 'games')), ...tag('journeys').filter((it) => is(it, 'place', 'site') && it.cat !== 'slavery'), ...tag('beliefs').filter((it) => is(it, 'site', 'structure')), ...tag('writing').filter((it) => is(it, 'site', 'work', 'structure'))];
    if (kind === 'champion') pool = tag('games').filter((it) => is(it, 'games') && (it.podium?.length ?? 0) >= 4);
    if (kind === 'when') pool = [...tag('structures'), ...tag('eras').filter((it) => is(it, 'work', 'invention', 'structure', 'event', 'institution')), ...tag('food').filter((it) => is(it, 'dish')), ...tag('writing').filter((it) => is(it, 'script', 'work', 'invention'))];
    if (kind === 'dish') pool = tag('food').filter((it) => is(it, 'dish') && !!it.country && !!this.app.data.meta[it.country]);
    if (kind === 'era') pool = tag('eras').filter((it) => is(it, 'person', 'work', 'invention') && this.eras.has(it.story));
    if (kind === 'civ') pool = tag('people').filter((it) => is(it, 'person', 'work', 'structure', 'site', 'invention') && this.civs.has(it.story));
    if (kind === 'period') pool = tag('life').filter((it) => is(it, 'species', 'fossil', 'site') && this.periodOf(it) != null);
    // Not the travellers themselves (Marco Polo is in "Marco Polo's travels"), and nothing told by most of the stories.
    if (kind === 'journey') pool = tag('journeys').filter((it) => it.cat !== 'traveller' && this.journeys.has(it.story) && (it.also?.length ?? 0) < this.journeys.size - 4);
    // Enough faiths left for three wrong answers (Jerusalem is told by three of them).
    if (kind === 'faith') pool = tag('beliefs').filter((it) => !!this.faithOf(it) && this.faiths.size - [it.story, ...(it.also ?? [])].filter((x) => this.faiths.has(x)).length >= 3);
    // Scripts with a sample in letters other than Latin (an "ABC" would give the answer away).
    if (kind === 'script') {
      pool = tag('writing').filter((it) => is(it, 'script') && !!it.sample && /[^\u0000-\u024f\s\u2000-\u206f]/u.test(it.sample.text));
      this.scriptNames = new Map(pool.map((x) => [x.id ?? tx(x.name), x.name]));
    }
    if (pool.length < 10 || (kind === 'era' && this.eras.size < 4) || (kind === 'civ' && this.civs.size < 4) || (kind === 'period' && this.periods.length < 4) || (kind === 'journey' && this.journeys.size < 4) || (kind === 'faith' && this.faiths.size < 4)) {
      clear(this.card);
      const close = h('button', { type: 'button', class: 'pill sm' }, t('close'));
      close.addEventListener('click', () => { this.card.hidden = true; });
      add(this.card, h('div', { class: 'tool-hint' }, L('This quiz needs the story collections; check your connection.', 'Este concurso necesita las colecciones de historias; revisa tu conexión.')), h('div', { class: 'tool-actions' }, close));
      this.card.hidden = false;
      return;
    }
    const picks = shuffle(pool.slice()).slice(0, 10);
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
      if (kind === 'script') { const id = it.id ?? tx(it.name); return { id, item: it, options: shuffle([id, ...shuffle([...this.scriptNames.keys()].filter((x) => x !== id)).slice(0, 3)]) }; }
      if (kind === 'period') return { id: this.periodOf(it)!, item: it, options: this.periodOptions(this.periodOf(it)!) };
      // "Who won?": the winner and the next three of the same Games.
      if (kind === 'champion') return { id: it.podium![0].c, item: it, options: shuffle(it.podium!.slice(0, 4).map((p) => p.c)) };
      return { id: it.story, item: it };
    });
    const labels = { ...this.app.renderer.settings.labels };
    if (kind === 'where') Object.assign(this.app.renderer.settings.labels, { countries: false, capitals: false, cities: false });
    this.quiz = { kind, region: 'world', qs, i: 0, score: 0, answered: false, savedLabels: labels, peek: false };
    this.app.select(null);
    if (kind === 'where' && this.app.renderer.view.current.kind !== 'globe') this.app.setProjection('globe');
    this.renderQuiz();
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
    const f = (x: number) => (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10).replace('.', es() ? ',' : '.'));
    const when = u.end <= 0 ? L(`since ${f(u.start)} million years ago`, `desde hace ${f(u.start)} millones de años`) : L(`${f(u.start)}–${f(u.end)} million years ago`, `hace ${f(u.start)}–${f(u.end)} millones de años`);
    return `${es() ? u.name_es : u.name_en} (${when})`;
  }

  /** The question for an item. */
  private itemQuestion(kind: QuizKind, it: QItem): string {
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
    if (kind === 'where') return ty === 'dish' ? L('Where does this dish come from?', '¿De dónde es este plato?') : ty === 'fossil' || ty === 'species' ? L('Where was this found?', '¿Dónde se encontró?') : ty === 'culture' ? L('Where was this civilization centred?', '¿Dónde tenía su centro esta civilización?') : ty === 'work' ? L('Where was this made?', '¿Dónde se hizo?') : ty === 'invention' ? L('Where was this invented?', '¿Dónde se inventó?') : ty === 'event' ? L('Where did this happen?', '¿Dónde ocurrió?') : L('Where in the world is this?', '¿Dónde está?');
    if (kind === 'when') return it.end ? L('When was it completed?', '¿Cuándo se terminó?') : ty === 'dish' ? L('When was it first recorded?', '¿Cuándo aparece por primera vez?') : ty === 'work' ? L('When was it made?', '¿Cuándo se hizo?') : ty === 'invention' ? L('When was it invented?', '¿Cuándo se inventó?') : ty === 'event' ? L('When did it happen?', '¿Cuándo ocurrió?') : L('When was it built?', '¿Cuándo se construyó?');
    if (kind === 'dish') return L('Which country does this dish come from?', '¿De qué país es este plato?');
    if (kind === 'civ') return L('Which civilization does this belong to?', '¿A qué civilización pertenece?');
    if (kind === 'journey') return L('Which journey or trade route is it from?', '¿De qué viaje o ruta comercial es?');
    if (kind === 'faith') return L('Which faith or school of thought does it belong to?', '¿A qué religión o escuela de pensamiento pertenece?');
    if (kind === 'script') return L('Which script is this?', '¿Qué escritura es esta?');
    return L('Which era does this belong to?', '¿A qué época pertenece?');
  }

  private optionLabel(kind: QuizKind, o: string, q: Q): string {
    if (kind === 'when') return fmtWhen(o, Math.min(...(q.options ?? [o]).map(Number)));
    if (kind === 'dish') return `${flagEmoji(this.app.data.meta[o]?.a2)} ${this.app.data.name(o, lang())}`;
    if (kind === 'era') { const e = this.eras.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'civ') { const e = this.civs.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'journey') { const e = this.journeys.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'faith') { const e = this.faiths.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'script') { const n = this.scriptNames.get(o); return n ? tx(n) : o; }
    if (kind === 'period') return this.periodLabel(o);
    if (kind === 'champion') { const p = q.item?.podium?.find((x) => x.c === o); return p ? `${p.a2 ? `${flagEmoji(p.a2)} ` : ''}${tx(p.n)}` : o; }
    return kind === 'capital' ? this.capital(o) : `${this.app.data.name(o, lang())}`;
  }

  /** "Where in the world?": the answer is where the player tapped. */
  private answerWhere(g: [number, number] | null) {
    const q = this.quiz!;
    const it = q.qs[q.i].item!;
    q.answered = true;
    const km = g ? Math.round(geoDistance(g, it.at) * 6371) : null;
    const ok = km != null && km <= 500;
    if (ok) q.score++;
    const cur = q.qs[q.i];
    cur.ok = ok;
    cur.given = km == null ? L('no answer', 'sin respuesta') : L(`${km.toLocaleString('en-GB')} km away`, `a ${km.toLocaleString('es-ES')} km`);
    this.showItem(it);
    const where = it.place ? tx(it.place) : '';
    const dist = km == null ? '' : L(`${km.toLocaleString('en-GB')} km away. `, `A ${km.toLocaleString('es-ES')} km. `);
    this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${dist}${tx(it.name)}${where ? `: ${where}` : ''}.` });
  }

  /** Puts a pin on the item and flies there. */
  private showItem(it: QItem) {
    this.pin = { lon: it.at[0], lat: it.at[1], text: tx(it.name) };
    this.app.flyTo(it.at[0], it.at[1], Math.max(3, this.app.renderer.view.zoom));
    this.app.renderer.requestRender();
  }

  private capital(id: string) {
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
    if (feedback) q.fb = feedback;
    feedback = q.answered ? q.fb : undefined;
    const cur = q.qs[q.i];
    clear(this.card);
    this.card.classList.toggle('peek', q.peek);
    this.card.hidden = false;
    requestAnimationFrame(() => this.syncInset());
    if (q.done) { this.renderResult(); return; }
    add(this.card, this.quizHead(`${L('Question', 'Pregunta')} ${q.i + 1}/${q.qs.length}`, `⭐ ${q.score}`));
    if (!cur) return;
    if (q.peek) {
      // Folded: the map is in view. What to find (the tap quizzes are answered on it), or the answer.
      if (feedback) add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, this.nextButton()));
      else if (q.kind === 'find') add(this.card, h('div', { class: 'quiz-peek-q' }, L(`Where is ${this.app.data.name(cur.id, lang())}?`, `¿Dónde está ${this.app.data.name(cur.id, lang())}?`)));
      else if (q.kind === 'where' && cur.item) add(this.card, h('div', { class: 'quiz-peek-q' }, `${cur.item.icon} ${tx(cur.item.name)}`));
      else if (q.kind === 'region') { const r = this.regions?.list.find((x) => x.id === cur.id); if (r) add(this.card, h('div', { class: 'quiz-peek-q' }, L(`Where is ${this.regionName(r)}?`, `¿Dónde está ${this.regionName(r)}?`))); }
      return;
    }
    if (cur.item) { this.renderItemQuestion(q.kind, cur, feedback); return; }
    if (q.kind === 'region') { this.renderRegionQuestion(cur, feedback); return; }
    if (q.kind === 'link') { this.renderLinkQuestion(cur, feedback); return; }
    if (q.kind === 'family') { this.renderFamilyQuestion(cur, feedback); return; }
    const name = this.app.data.name(cur.id, lang());
    if (q.kind === 'find') add(this.card, h('div', { class: 'quiz-q' }, L(`Where is ${name}?`, `¿Dónde está ${name}?`)));
    if (q.kind === 'flag') add(this.card, h('div', { class: 'quiz-q' }, L('Which country has this flag?', '¿De qué país es esta bandera?')),
      h('img', { class: 'quiz-flag', src: dataUrl(`../flags/${(this.app.data.meta[cur.id].a2 ?? '').toLowerCase()}.svg`), alt: '' }));
    if (q.kind === 'capital') add(this.card, h('div', { class: 'quiz-q' }, L(`What is the capital of ${name}?`, `¿Cuál es la capital de ${name}?`)));
    if (cur.options) {
      const opts = h('div', { class: 'quiz-opts' });
      for (const o of cur.options) {
        const label = q.kind === 'capital' ? this.capital(o) : `${this.app.data.name(o, lang())}`;
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
    const what = script ? sampleEl(q.answered ? it.sample! : { text: it.sample!.text }) : h('div', { class: 'quiz-item' }, `${it.icon} ${tx(it.name)}`);
    add(this.card, h('div', { class: 'quiz-q' }, this.itemQuestion(kind, it)), what, script && !q.answered ? null : img);
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
      add(this.card, h('div', { class: 'tool-hint' }, L('Tap the place on the globe (within 500 km to score).', 'Toca el lugar en el globo (a menos de 500 km para puntuar).')), h('div', { class: 'tool-actions' }, skip));
    }
    if (feedback) {
      const story = h('button', { type: 'button', class: 'pill sm' }, L('See it in the story', 'Verlo en la historia'));
      story.addEventListener('click', () => {
        this.stopQuiz();
        void this.time.stories[it.kind].open(it.story, it.step, { name: tx(it.name), at: it.at });
      });
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, story, this.nextButton()));
    }
  }

  private answerOption(o: string, b: HTMLButtonElement) {
    const q = this.quiz!;
    if (q.answered) return;
    const cur = q.qs[q.i];
    q.answered = true;
    const ok = o === cur.id;
    if (ok) q.score++;
    cur.ok = ok; cur.pick = o;
    cur.given = cur.item ? this.optionLabel(q.kind, o, cur) : q.kind === 'capital' ? this.capital(o) : this.app.data.name(o, lang());
    b.classList.add(ok ? 'ok' : 'bad');
    if (cur.lang) {
      cur.given = this.famName(o);
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${this.familySentence(cur.lang, cur.id)}` });
      return;
    }
    if (cur.link) {
      cur.given = this.linkLabel(o);
      const k = cur.link;
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L(`It was: ${this.linkLabel(cur.id)}. `, `Era: ${this.linkLabel(cur.id)}. `)}ρ = ${fmtR(k.rho)}, ${strengthWords(strength(k.rho))}.` });
      return;
    }
    if (cur.item) {
      const it = cur.item;
      this.showItem(it);
      const right = q.kind === 'when' ? itemWhen(it, Math.min(...(cur.options ?? [cur.id]).map(Number))) : this.optionLabel(q.kind, cur.id, cur);
      if (q.kind === 'script') { this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : L('It is: ', 'Es: ')}${tx(it.name)}${it.place ? ` · ${tx(it.place)}` : ''}` }); return; }
      this.renderQuiz({ ok, text: `${ok ? L('Correct! ', '¡Correcto! ') : ''}${tx(it.name)}: ${right}.` });
      return;
    }
    this.showCountry(cur.id);
    const name = this.app.data.name(cur.id, lang());
    this.renderQuiz({ ok, text: ok ? L(`Correct! ${flagEmoji(this.app.data.meta[cur.id].a2)} ${name}`, `¡Correcto! ${flagEmoji(this.app.data.meta[cur.id].a2)} ${name}`)
      : q.kind === 'capital' ? L(`The capital of ${name} is ${this.capital(cur.id)}.`, `La capital de ${name} es ${this.capital(cur.id)}.`) : L(`It was ${name}.`, `Era ${name}.`) });
  }

  private answerFind(id: string | null) {
    const q = this.quiz!;
    const cur = q.qs[q.i];
    q.answered = true;
    const ok = id === cur.id;
    if (ok) q.score++;
    cur.ok = ok;
    cur.given = id ? this.app.data.name(id, lang()) : L('no answer', 'sin respuesta');
    this.showCountry(cur.id);
    const name = this.app.data.name(cur.id, lang());
    let text = ok ? L(`Correct! That's ${name}.`, `¡Correcto! Es ${name}.`) : L(`Here is ${name}.`, `Aquí está ${name}.`);
    if (!ok && id) {
      const a = this.app.data.meta[id], b = this.app.data.meta[cur.id];
      const km = Math.round(geoDistance([a.lx, a.ly], [b.lx, b.ly]) * 6371);
      text = L(`You tapped ${this.app.data.name(id, lang())}, ${km.toLocaleString()} km away.`, `Tocaste ${this.app.data.name(id, lang())}, a ${km.toLocaleString('es-ES')} km.`);
    }
    this.renderQuiz({ ok, text });
  }

  private nextQuestion() {
    const q = this.quiz!;
    this.app.select(null);
    this.pin = null;
    q.i++; q.answered = false; q.peek = false; q.fb = undefined;
    if (q.i >= q.qs.length) { this.finishQuiz(); return; }
    this.renderQuiz();
  }

  private finishQuiz() {
    const q = this.quiz!;
    const key = q.kind === 'region' ? `atlas-quiz-best:region-${q.region}${q.all ? '-all' : ''}` : `atlas-quiz-best:${q.kind}`;
    let best = 0;
    try { best = Number(localStorage.getItem(key) ?? 0); if (q.score > best) localStorage.setItem(key, String(q.score)); } catch { /* ignore */ }
    q.done = true; q.best = best; q.peek = false;
    this.renderQuiz();
  }

  /** The result: the score, then every question, right or wrong, with a small picture; a tap shows it on the map. */
  private renderResult() {
    const q = this.quiz!;
    const top = q.kind === 'champion' ? L('Sports master! 🏆', '¡Maestro del deporte! 🏆') : q.kind === 'family' || q.kind === 'script' ? L('Language master! 🗣️', '¡Maestro de las lenguas! 🗣️') : q.kind === 'link' ? L('Data master! 📊', '¡Maestro de los datos! 📊') : ITEM_QUIZZES.includes(q.kind) ? L('History master! 🏆', '¡Maestro de la historia! 🏆') : L('Geography master! 🏆', '¡Maestro de la geografía! 🏆');
    const msg = q.score >= 9 ? top : q.score >= 6 ? L('Great job! 🌍', '¡Muy bien! 🌍') : L('Keep exploring! 🧭', '¡Sigue explorando! 🧭');
    add(this.card, this.quizHead(`${L('Result', 'Resultado')} ${q.score}/${q.qs.length}`, ''));
    if (q.peek) return;
    const again = h('button', { type: 'button', class: 'pill primary sm' }, L('Play again', 'Jugar otra vez'));
    again.addEventListener('click', () => void (q.kind === 'region' ? this.startRegionQuiz(q.region, !!q.all) : this.startQuiz(q.kind, q.region)));
    const done = h('button', { type: 'button', class: 'pill sm' }, L('Done', 'Terminar'));
    done.addEventListener('click', () => this.stopQuiz());
    const list = h('div', { class: 'quiz-sum', role: 'list' });
    for (const cur of q.qs) list.append(this.resultRow(q.kind, cur));
    add(this.card, h('div', { class: 'quiz-q' }, msg),
      q.score > (q.best ?? 0) ? h('div', { class: 'tool-hint' }, L('New personal best!', '¡Nuevo récord personal!')) : null,
      list, h('div', { class: 'tool-actions' }, again, done));
  }

  /** One question in the result: picture, what it was, the right answer and, if wrong, yours. */
  private resultRow(kind: QuizKind, cur: Q): HTMLElement {
    if (kind === 'region') return this.regionRow(cur);
    if (kind === 'link') return this.linkRow(cur);
    if (kind === 'family') return this.familyRow(cur);
    const it = cur.item;
    const name = it ? tx(it.name) : this.app.data.name(cur.id, lang());
    const right = it
      ? (kind === 'where' ? (it.place ? tx(it.place) : '') : kind === 'when' ? itemWhen(it, Math.min(...(cur.options ?? [cur.id]).map(Number))) : this.optionLabel(kind, cur.id, cur))
      : kind === 'capital' ? this.capital(cur.id) : '';
    const yours = cur.ok ? '' : kind === 'where' || kind === 'find' ? (cur.given ?? '') : cur.given ? L(`you said ${cur.given}`, `dijiste ${cur.given}`) : L('no answer', 'sin respuesta');
    const pic = h('span', { class: 'quiz-thumb' }, it ? it.icon : '');
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
      if (it) this.showItem(it);
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
      see.addEventListener('click', () => { this.stopQuiz(); this.app.emit('compare', k.a, k.b); });
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
        h('span', { class: 'quiz-sum-ans' }, [`${this.linkLabel(cur.id)} (ρ = ${fmtR(k.rho)})`, cur.ok ? '' : cur.given ? L(`you said ${cur.given}`, `dijiste ${cur.given}`) : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => { this.stopQuiz(); this.app.emit('compare', k.a, k.b); });
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
    this.quiz = { kind: 'family', region: 'world', qs, i: 0, score: 0, answered: false, savedLabels: { ...this.app.renderer.settings.labels }, peek: false };
    this.app.select(null);
    this.renderQuiz();
  }

  private langName(code: string) { const c = this.famData?.langs[code]; return c ? (es() ? c.es : c.en) : code; }
  private famName(f: string) { const c = this.famData?.fams[f]; return c ? (es() ? c.es : c.en) : f; }

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
    if (names.length > 4) return L(`Official in ${names.slice(0, 3).join(', ')} and ${names.length - 3} more`, `Oficial en ${names.slice(0, 3).join(', ')} y ${names.length - 3} más`);
    return L(`Official in ${joinList(names)}`, `Oficial en ${joinList(names)}`);
  }

  /** The Languages filter by family, with the language's (first) country selected. */
  private showFamilies(code: string) {
    this.stopQuiz();
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
      see.addEventListener('click', () => this.showFamilies(code));
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, see, this.nextButton()));
    }
  }

  /** A language in the result: its family and, if missed, your answer; a tap shows the families on the map. */
  private familyRow(cur: Q): HTMLElement {
    const row = h('button', { type: 'button', class: `quiz-sum-row ${cur.ok ? 'ok' : 'bad'}`, role: 'listitem' }, h('span', { class: 'quiz-thumb' }, '🗣️'),
      h('span', { class: 'quiz-sum-text' }, h('span', { class: 'quiz-sum-name' }, this.langName(cur.lang!)),
        h('span', { class: 'quiz-sum-ans' }, [this.famName(cur.id), cur.ok ? '' : cur.given ? L(`you said ${cur.given}`, `dijiste ${cur.given}`) : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'quiz-sum-mark', 'aria-label': cur.ok ? L('right', 'correcto') : L('wrong', 'incorrecto') }, cur.ok ? '✓' : '✗'));
    row.addEventListener('click', () => this.showFamilies(cur.lang!));
    return row;
  }

  private stopQuiz() {
    if (!this.quiz) return;
    this.app.renderer.settings.labels = { ...this.quiz.savedLabels };
    this.quiz = null;
    this.pin = null;
    this.regions = null;
    this.focusRegion = null;
    this.card.hidden = true;
    this.card.classList.remove('peek');
    this.app.select(null);
    this.app.renderer.requestRender();
  }

  // ---- Tours ----------------------------------------------------------------------------------
  private openTours() {
    const body = h('div');
    const groups: [Tour['group'], string][] = [[undefined, L('Our planet', 'Nuestro planeta')], ['cities', L('Cities through time', 'Ciudades a través del tiempo')], ['history', L('History and culture', 'Historia y cultura')], ['life', L('Life through time', 'La vida en el tiempo')], ['games', L('Games of the world', 'Juegos del mundo')], ['journeys', L('Journeys and trade routes', 'Viajes y rutas comerciales')]];
    for (const [group, title] of groups) {
      const list = h('div', { class: 'mode-list' });
      for (const tour of TOURS.filter((x) => x.group === group)) {
        const c = h('button', { type: 'button', class: 'mode-card', 'data-tour': tour.en }, h('span', { class: 'mode-icon' }, tour.icon),
          h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, es() ? tour.es : tour.en), h('span', { class: 'mode-desc' }, `${tour.steps.length} ${L('stops', 'paradas')}`)));
        c.addEventListener('click', () => void this.startTour(tour));
        list.append(c);
      }
      body.append(h('h3', { class: 'sec-title' }, title), list);
    }
    this.shell.openPanel('tours', L('Guided tours', 'Visitas guiadas'), body);
  }

  private async startTour(tour: Tour) {
    this.stopQuiz();
    this.shell.sheet.close();
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    this.tour = { steps: tour.steps, i: 0, auto: false, timer: 0, fold: false };
    await this.showStep();
  }

  private async showStep() {
    const tr = this.tour!;
    const s = tr.steps[tr.i];
    if (s.story) {
      const [kind, id, step] = s.story;
      if (this.app.mode && this.app.mode !== kind) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      try { await this.time.stories[kind].show(id, step - 1); } catch { /* offline */ }
    } else if (s.mode) { await this.time.enter(s.mode); }
    else {
      if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      if (s.projection && this.app.projection !== s.projection) this.app.setProjection(s.projection);
      if (s.stack) await this.app.setStack(s.stack);
    }
    if (s.fly) this.app.renderer.view.flyTo({ lon: s.fly[0], lat: s.fly[1], zoom: s.fly[2] }, 2200);
    this.app.renderer.requestRender();
    this.renderTour();
  }

  /** The tour card: the stop, its controls and its text (folded away to see more of the map). */
  private renderTour() {
    const tr = this.tour;
    if (!tr) return;
    const s = tr.steps[tr.i];
    clear(this.card);
    const prev = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Previous' }, icon(ChevronLeft, 18));
    prev.addEventListener('click', () => { if (tr.i > 0) { tr.i--; void this.showStep(); } });
    const next = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Next' }, icon(ChevronRight, 18));
    next.addEventListener('click', () => this.nextStep());
    const auto = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Auto' }, icon(tr.auto ? Pause : Play, 16));
    auto.addEventListener('click', () => { tr.auto = !tr.auto; this.armAuto(); this.renderTour(); });
    const foldLabel = tr.fold ? L('Show the text', 'Mostrar el texto') : L('Hide the text', 'Ocultar el texto');
    const fold = h('button', { type: 'button', class: 'icon-btn sm tour-fold', title: foldLabel, 'aria-label': foldLabel, 'aria-expanded': String(!tr.fold) }, icon(tr.fold ? ChevronDown : ChevronUp, 16));
    fold.addEventListener('click', () => { tr.fold = !tr.fold; this.renderTour(); });
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stopTour());
    add(this.card,
      h('div', { class: 'tool-head' }, h('strong', null, `${s.icon ?? '🧭'} ${es() ? s.title_es : s.title_en}`), h('span', { class: 'tour-tools' }, prev, h('span', { class: 'small muted' }, `${tr.i + 1}/${tr.steps.length}`), next, auto, fold, close)),
      tr.fold ? null : h('div', { class: 'tour-text' }, es() ? s.es : s.en));
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
    else if (tr.auto) { tr.i = 0; void this.showStep(); }
  }

  private armAuto() {
    const tr = this.tour;
    if (!tr) return;
    clearInterval(tr.timer);
    if (tr.auto) tr.timer = window.setInterval(() => this.nextStep(), 9000);
  }

  private stopTour() {
    if (!this.tour) return;
    clearInterval(this.tour.timer);
    this.tour = null;
    this.card.hidden = true;
    this.card.classList.remove('peek');
  }

  // ---- On this day ----------------------------------------------------------------------------
  private async openOnThisDay() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
    const body = h('div', { class: 'otd' }, h('p', { class: 'muted' }, t('dataLoading')));
    this.shell.openPanel('onthisday', `${L('On this day', 'Tal día como hoy')} · ${now.toLocaleDateString(es() ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long' })}`, body, () => { this.pin = null; this.app.renderer.requestRender(); });
    try {
      const r = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/${es() ? 'es' : 'en'}/onthisday/selected/${mm}/${dd}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { selected?: { text: string; year: number; pages?: { title: string; normalizedtitle?: string; coordinates?: { lat: number; lon: number } }[] }[] };
      clear(body);
      const events = (j.selected ?? []).sort((a, b) => b.year - a.year);
      if (!events.length) body.append(h('p', { class: 'muted' }, t('noResults')));
      for (const ev of events) {
        const place = this.locate(ev.text, ev.pages ?? []);
        const item = h('button', { type: 'button', class: `otd-item${place ? '' : ' noplace'}` },
          h('span', { class: 'otd-year' }, String(ev.year)), h('span', { class: 'otd-text' }, ev.text), place ? h('span', { class: 'otd-go' }, '📍') : null);
        if (place) item.addEventListener('click', () => {
          this.pin = { lon: place.lon, lat: place.lat, text: String(ev.year) };
          this.app.flyTo(place.lon, place.lat, Math.max(2.5, this.app.renderer.view.zoom));
          if (matchMedia('(max-width: 720px)').matches) this.shell.sheet.close();
        });
        body.append(item);
      }
      body.append(h('p', { class: 'muted small' }, L('Events from Wikipedia (CC BY-SA).', 'Acontecimientos de Wikipedia (CC BY-SA).')));
    } catch (e) {
      clear(body);
      body.append(h('p', { class: 'muted' }, L(`Needs an internet connection (${(e as Error).message}).`, `Necesita conexión a internet (${(e as Error).message}).`)));
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
