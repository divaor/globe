// Learn and play: quizzes (find the country, flags, capitals), guided tours, and "On this day".
import { GraduationCap, Compass, CalendarDays, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Play, Pause, Map as MapIcon } from 'lucide';
import { geoDistance } from 'd3-geo';
import { h, icon, clear, add } from '../ui/dom';
import { t, tx, lang, flagEmoji } from '../app/i18n';
import { dataUrl, loadJSON } from '../data/store';
import { fmtWhen, itemWhen, itemThumb, type CollectionItem, type StoryKind } from '../modes/stories';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { TimeTravel } from '../modes';
import type { RenderSettings } from '../engine/renderer';
import { TOURS, type Tour, type TourStep } from './tours';
import type { Unit } from '../modes/paleo';
import { regionCountries, loadRegions, frameRegions, regionAt, regionThumb, drawRegions, type Region, type RegionMark } from './regions';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

type QuizKind = 'find' | 'flag' | 'capital' | 'where' | 'when' | 'dish' | 'era' | 'civ' | 'period' | 'region';
/** An item of a story collection, tagged with its collection. */
interface QItem extends CollectionItem { kind: StoryKind }
/** A question; once answered, whether it was right and what the player answered. */
interface Q { id: string; options?: string[]; item?: QItem; ok?: boolean; given?: string; pick?: string }
const ITEM_QUIZZES: QuizKind[] = ['where', 'when', 'dish', 'era', 'civ', 'period'];
/** The civilization stories of Peoples and civilizations: the answers of "Which civilization?". */
const CIV_STORIES = ['mesopotamia', 'ancient-egypt', 'indus-valley', 'persia', 'kush-aksum', 'ancient-china', 'khmer', 'west-african-empires', 'great-zimbabwe-swahili', 'olmecs-maya', 'andes'];
const COLLECTION_DIR: Record<StoryKind, string> = { wars: 'conflicts', eras: 'eras', food: 'food', structures: 'structures', people: 'people', life: 'life' };
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
      h('h3', { class: 'sec-title' }, L('History, art, food and life', 'Historia, arte, comida y vida')), list2));
  }

  private async startQuiz(kind: QuizKind, region: string) {
    this.stopTour();
    this.shell.sheet.close();
    if (kind === 'region') { await this.startRegionQuiz(region, false); return; }
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
    if (kinds.includes('people') && !this.civs.size) {
      for (const st of (await loadJSON<{ stories: { id: string; name: { en: string; es: string }; icon: string }[] }>('people/index.json')).stories) if (CIV_STORIES.includes(st.id)) this.civs.set(st.id, st);
    }
  }

  /** The quizzes about the story collections: their items make the questions. */
  private async startItemQuiz(kind: QuizKind) {
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    const needs: StoryKind[] = kind === 'dish' ? ['food'] : kind === 'era' ? ['eras'] : kind === 'civ' ? ['people'] : kind === 'period' ? ['life'] : kind === 'where' ? ['structures', 'eras', 'food', 'people', 'life'] : ['structures', 'eras', 'food'];
    try { await this.loadItems(needs); } catch { /* offline: the pool stays small */ }
    const tag = (k: StoryKind): QItem[] => (this.items[k] ?? []).map((it) => ({ ...it, kind: k }));
    const is = (it: QItem, ...types: string[]) => !!it.type && types.includes(it.type);
    let pool: QItem[] = [];
    if (kind === 'where') pool = [...tag('structures'), ...tag('eras').filter((it) => !is(it, 'person')), ...tag('food').filter((it) => is(it, 'dish', 'site')), ...tag('people').filter((it) => is(it, 'site', 'structure', 'fossil', 'work', 'culture')), ...tag('life').filter((it) => is(it, 'fossil', 'site', 'species', 'animal'))];
    if (kind === 'when') pool = [...tag('structures'), ...tag('eras').filter((it) => is(it, 'work', 'invention', 'structure', 'event', 'institution')), ...tag('food').filter((it) => is(it, 'dish'))];
    if (kind === 'dish') pool = tag('food').filter((it) => is(it, 'dish') && !!it.country && !!this.app.data.meta[it.country]);
    if (kind === 'era') pool = tag('eras').filter((it) => is(it, 'person', 'work', 'invention') && this.eras.has(it.story));
    if (kind === 'civ') pool = tag('people').filter((it) => is(it, 'person', 'work', 'structure', 'site', 'invention') && this.civs.has(it.story));
    if (kind === 'period') pool = tag('life').filter((it) => is(it, 'species', 'fossil', 'site') && this.periodOf(it) != null);
    if (pool.length < 10 || (kind === 'era' && this.eras.size < 4) || (kind === 'civ' && this.civs.size < 4) || (kind === 'period' && this.periods.length < 4)) {
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
      if (kind === 'era') return { id: it.story, item: it, options: shuffle([it.story, ...shuffle([...this.eras.keys()].filter((x) => x !== it.story)).slice(0, 3)]) };
      if (kind === 'civ') return { id: it.story, item: it, options: shuffle([it.story, ...shuffle([...this.civs.keys()].filter((x) => x !== it.story)).slice(0, 3)]) };
      if (kind === 'period') return { id: this.periodOf(it)!, item: it, options: this.periodOptions(this.periodOf(it)!) };
      return { id: it.story, item: it };
    });
    const labels = { ...this.app.renderer.settings.labels };
    if (kind === 'where') Object.assign(this.app.renderer.settings.labels, { countries: false, capitals: false, cities: false });
    this.quiz = { kind, region: 'world', qs, i: 0, score: 0, answered: false, savedLabels: labels, peek: false };
    this.app.select(null);
    if (kind === 'where' && this.app.renderer.view.current.kind !== 'globe') this.app.setProjection('globe');
    this.renderQuiz();
  }

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
    if (kind === 'where') return ty === 'dish' ? L('Where does this dish come from?', '¿De dónde es este plato?') : ty === 'fossil' || ty === 'species' ? L('Where was this found?', '¿Dónde se encontró?') : ty === 'culture' ? L('Where was this civilization centred?', '¿Dónde tenía su centro esta civilización?') : ty === 'work' ? L('Where was this made?', '¿Dónde se hizo?') : ty === 'invention' ? L('Where was this invented?', '¿Dónde se inventó?') : ty === 'event' ? L('Where did this happen?', '¿Dónde ocurrió?') : L('Where in the world is this?', '¿Dónde está?');
    if (kind === 'when') return it.end ? L('When was it completed?', '¿Cuándo se terminó?') : ty === 'dish' ? L('When was it first recorded?', '¿Cuándo aparece por primera vez?') : ty === 'work' ? L('When was it made?', '¿Cuándo se hizo?') : ty === 'invention' ? L('When was it invented?', '¿Cuándo se inventó?') : ty === 'event' ? L('When did it happen?', '¿Cuándo ocurrió?') : L('When was it built?', '¿Cuándo se construyó?');
    if (kind === 'dish') return L('Which country does this dish come from?', '¿De qué país es este plato?');
    if (kind === 'civ') return L('Which civilization does this belong to?', '¿A qué civilización pertenece?');
    return L('Which era does this belong to?', '¿A qué época pertenece?');
  }

  private optionLabel(kind: QuizKind, o: string, q: Q): string {
    if (kind === 'when') return fmtWhen(o, Math.min(...(q.options ?? [o]).map(Number)));
    if (kind === 'dish') return `${flagEmoji(this.app.data.meta[o]?.a2)} ${this.app.data.name(o, lang())}`;
    if (kind === 'era') { const e = this.eras.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'civ') { const e = this.civs.get(o); return e ? `${e.icon} ${tx(e.name)}` : o; }
    if (kind === 'period') return this.periodLabel(o);
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
    add(this.card, h('div', { class: 'quiz-q' }, this.itemQuestion(kind, it)), h('div', { class: 'quiz-item' }, `${it.icon} ${tx(it.name)}`), img);
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
    if (cur.item) {
      const it = cur.item;
      this.showItem(it);
      const right = q.kind === 'when' ? itemWhen(it, Math.min(...(cur.options ?? [cur.id]).map(Number))) : this.optionLabel(q.kind, cur.id, cur);
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
    const top = ITEM_QUIZZES.includes(q.kind) ? L('History master! 🏆', '¡Maestro de la historia! 🏆') : L('Geography master! 🏆', '¡Maestro de la geografía! 🏆');
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
    const groups: [Tour['group'], string][] = [[undefined, L('Our planet', 'Nuestro planeta')], ['cities', L('Cities through time', 'Ciudades a través del tiempo')], ['history', L('History and culture', 'Historia y cultura')], ['life', L('Life through time', 'La vida en el tiempo')]];
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
