// Learn and play: quizzes (find the country, flags, capitals), guided tours, and "On this day".
import { GraduationCap, Compass, CalendarDays, X, ChevronLeft, ChevronRight, Play, Pause } from 'lucide';
import { geoDistance } from 'd3-geo';
import { h, icon, clear, add } from '../ui/dom';
import { t, lang, flagEmoji } from '../app/i18n';
import { dataUrl } from '../data/store';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { ProjectionId } from '../engine/projections';
import type { TimeTravel } from '../modes';
import type { RenderSettings } from '../engine/renderer';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

type QuizKind = 'find' | 'flag' | 'capital';
interface Q { id: string; options?: string[] }

export class Learn {
  private card: HTMLElement;
  private quiz: { kind: QuizKind; region: string; qs: Q[]; i: number; score: number; answered: boolean; savedLabels: RenderSettings['labels'] } | null = null;
  private tour: { steps: TourStep[]; i: number; auto: boolean; timer: number } | null = null;
  private pin: { lon: number; lat: number; text: string } | null = null;

  constructor(private app: App, private shell: Shell, private time: TimeTravel) {
    this.card = h('section', { class: 'learn-card glass', hidden: true });
    app.root.append(this.card);
    shell.addMenu({ id: 'quiz', icon: GraduationCap, label: () => L('Quiz', 'Concurso'), order: 30, onClick: () => this.openQuizMenu() });
    shell.addMenu({ id: 'tours', icon: Compass, label: () => L('Guided tours', 'Visitas guiadas'), order: 31, onClick: () => this.openTours() });
    shell.addMenu({ id: 'onthisday', icon: CalendarDays, label: () => L('On this day', 'Tal día como hoy'), order: 32, onClick: () => void this.openOnThisDay() });
    shell.tapHandlers.unshift((_x, _y, g) => {
      if (!this.quiz || this.quiz.kind !== 'find' || this.quiz.answered) return false;
      if (g) this.answerFind(app.renderer.countryAt(g[0], g[1]));
      return true;
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
    ];
    const list = h('div', { class: 'mode-list' });
    for (const [k, ic, title, desc] of kinds) {
      const best = localStorage.getItem(`atlas-quiz-best:${k}`);
      const c = h('button', { type: 'button', class: 'mode-card' }, h('span', { class: 'mode-icon' }, ic),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, `${desc}${best ? ` · ${L('Best', 'Récord')}: ${best}/10` : ''}`)));
      c.addEventListener('click', () => this.startQuiz(k, region));
      list.append(c);
    }
    this.shell.openPanel('quiz', L('Quiz', 'Concurso'), h('div', null, h('h3', { class: 'sec-title' }, L('Region', 'Región')), regionRow, h('h3', { class: 'sec-title' }, L('Game', 'Juego')), list));
  }

  private startQuiz(kind: QuizKind, region: string) {
    this.stopTour();
    this.shell.sheet.close();
    const pool = this.pool(region);
    const ids = shuffle(pool.slice()).slice(0, 10);
    const qs: Q[] = ids.map((id) => {
      if (kind === 'find') return { id };
      const others = shuffle(pool.filter((x) => x !== id)).slice(0, 3);
      return { id, options: shuffle([id, ...others]) };
    });
    const labels = { ...this.app.renderer.settings.labels };
    if (kind === 'find') Object.assign(this.app.renderer.settings.labels, { countries: false, capitals: false, cities: false });
    this.quiz = { kind, region, qs, i: 0, score: 0, answered: false, savedLabels: labels };
    this.app.select(null);
    if (this.app.renderer.view.current.kind !== 'globe' && kind === 'find') this.app.setProjection('globe');
    this.renderQuiz();
  }

  private capital(id: string) {
    const c = this.app.data.cities.find((x) => x.country === id && x.capital === 2 && !(x.flags & 4));
    return c ? (es() && c.es ? c.es : c.name) : '?';
  }

  private renderQuiz(feedback?: { ok: boolean; text: string }) {
    const q = this.quiz!;
    const cur = q.qs[q.i];
    clear(this.card);
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stopQuiz());
    add(this.card, h('div', { class: 'tool-head' }, h('strong', null, `${L('Question', 'Pregunta')} ${q.i + 1}/${q.qs.length}`), h('span', { class: 'quiz-score' }, `⭐ ${q.score}`), close));
    if (!cur) return;
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
        if (q.answered) { b.disabled = true; if (o === cur.id) b.classList.add('ok'); }
        b.addEventListener('click', () => this.answerOption(o, b));
        opts.append(b);
      }
      add(this.card, opts);
    } else if (!q.answered) {
      const skip = h('button', { type: 'button', class: 'pill sm' }, L('Show me', 'Muéstramelo'));
      skip.addEventListener('click', () => this.answerFind(null));
      add(this.card, h('div', { class: 'tool-hint' }, L('Tap the country on the globe.', 'Toca el país en el globo.')), h('div', { class: 'tool-actions' }, skip));
    }
    if (feedback) {
      const next = h('button', { type: 'button', class: 'pill primary sm' }, q.i + 1 < q.qs.length ? L('Next', 'Siguiente') : L('See result', 'Ver resultado'));
      next.addEventListener('click', () => this.nextQuestion());
      add(this.card, h('div', { class: `quiz-fb ${feedback.ok ? 'ok' : 'bad'}` }, feedback.text), h('div', { class: 'tool-actions' }, next));
    }
    this.card.hidden = false;
  }

  private answerOption(o: string, b: HTMLButtonElement) {
    const q = this.quiz!;
    if (q.answered) return;
    const cur = q.qs[q.i];
    q.answered = true;
    const ok = o === cur.id;
    if (ok) q.score++;
    b.classList.add(ok ? 'ok' : 'bad');
    this.app.flyToCountry(cur.id);
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
    this.app.flyToCountry(cur.id);
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
    q.i++; q.answered = false;
    if (q.i >= q.qs.length) { this.finishQuiz(); return; }
    this.renderQuiz();
  }

  private finishQuiz() {
    const q = this.quiz!;
    const key = `atlas-quiz-best:${q.kind}`;
    const best = Number(localStorage.getItem(key) ?? 0);
    try { if (q.score > best) localStorage.setItem(key, String(q.score)); } catch { /* ignore */ }
    clear(this.card);
    const again = h('button', { type: 'button', class: 'pill primary sm' }, L('Play again', 'Jugar otra vez'));
    again.addEventListener('click', () => this.startQuiz(q.kind, q.region));
    const done = h('button', { type: 'button', class: 'pill sm' }, L('Done', 'Terminar'));
    done.addEventListener('click', () => this.stopQuiz());
    const msg = q.score >= 9 ? L('Geography master! 🏆', '¡Maestro de la geografía! 🏆') : q.score >= 6 ? L('Great job! 🌍', '¡Muy bien! 🌍') : L('Keep exploring! 🧭', '¡Sigue explorando! 🧭');
    add(this.card, h('div', { class: 'quiz-q' }, `${q.score}/10 · ${msg}`), q.score > best ? h('div', { class: 'tool-hint' }, L('New personal best!', '¡Nuevo récord personal!')) : null, h('div', { class: 'tool-actions' }, again, done));
  }

  private stopQuiz() {
    if (!this.quiz) return;
    this.app.renderer.settings.labels = { ...this.quiz.savedLabels };
    this.quiz = null;
    this.card.hidden = true;
    this.app.select(null);
    this.app.renderer.requestRender();
  }

  // ---- Tours ----------------------------------------------------------------------------------
  private openTours() {
    const list = h('div', { class: 'mode-list' });
    for (const tour of TOURS) {
      const c = h('button', { type: 'button', class: 'mode-card' }, h('span', { class: 'mode-icon' }, tour.icon),
        h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, es() ? tour.es : tour.en), h('span', { class: 'mode-desc' }, `${tour.steps.length} ${L('stops', 'paradas')}`)));
      c.addEventListener('click', () => void this.startTour(tour));
      list.append(c);
    }
    this.shell.openPanel('tours', L('Guided tours', 'Visitas guiadas'), list);
  }

  private async startTour(tour: Tour) {
    this.stopQuiz();
    this.shell.sheet.close();
    if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
    this.tour = { steps: tour.steps, i: 0, auto: false, timer: 0 };
    await this.showStep();
  }

  private async showStep() {
    const tr = this.tour!;
    const s = tr.steps[tr.i];
    if (s.mode) { await this.time.enter(s.mode); }
    else {
      if (this.app.mode) await this.time.modes.find((m) => m.id === this.app.mode)?.exit();
      if (s.projection && this.app.projection !== s.projection) this.app.setProjection(s.projection);
      if (s.stack) await this.app.setStack(s.stack);
    }
    if (s.fly) this.app.renderer.view.flyTo({ lon: s.fly[0], lat: s.fly[1], zoom: s.fly[2] }, 2200);
    this.app.renderer.requestRender();
    clear(this.card);
    const prev = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Previous' }, icon(ChevronLeft, 18));
    prev.addEventListener('click', () => { if (tr.i > 0) { tr.i--; void this.showStep(); } });
    const next = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Next' }, icon(ChevronRight, 18));
    next.addEventListener('click', () => this.nextStep());
    const auto = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Auto' }, icon(tr.auto ? Pause : Play, 16));
    auto.addEventListener('click', () => { tr.auto = !tr.auto; this.armAuto(); void this.showStep(); });
    const close = h('button', { type: 'button', class: 'icon-btn sm', 'aria-label': t('close') }, icon(X, 16));
    close.addEventListener('click', () => this.stopTour());
    add(this.card,
      h('div', { class: 'tool-head' }, h('strong', null, `${s.icon ?? '🧭'} ${es() ? s.title_es : s.title_en}`), h('span', { class: 'tour-tools' }, prev, h('span', { class: 'small muted' }, `${tr.i + 1}/${tr.steps.length}`), next, auto, close)),
      h('div', { class: 'tour-text' }, es() ? s.es : s.en));
    this.card.hidden = false;
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

// ---- Tour content ----------------------------------------------------------------------------
interface TourStep { title_en: string; title_es: string; en: string; es: string; icon?: string; fly?: [number, number, number]; projection?: ProjectionId; stack?: string[]; mode?: string }
interface Tour { icon: string; en: string; es: string; steps: TourStep[] }

const TOURS: Tour[] = [
  { icon: '🌋', en: 'The Ring of Fire', es: 'El Cinturón de Fuego', steps: [
    { title_en: 'The Ring of Fire', title_es: 'El Cinturón de Fuego', projection: 'globe', stack: ['plates', 'volcanoes'], fly: [-170, 10, 1], en: 'Three quarters of the world’s active volcanoes ring the Pacific Ocean, where ocean plates dive under their neighbours (blue lines).', es: 'Tres cuartas partes de los volcanes activos rodean el Pacífico, donde las placas oceánicas se hunden bajo sus vecinas (líneas azules).' },
    { title_en: 'Japan', title_es: 'Japón', fly: [139, 36, 4], en: 'Four plates meet under Japan. Mount Fuji last erupted in 1707; Sakurajima erupts almost every day.', es: 'Cuatro placas se encuentran bajo Japón. El Fuji entró en erupción por última vez en 1707; el Sakurajima lo hace casi a diario.' },
    { title_en: 'Indonesia', title_es: 'Indonesia', fly: [115, -6, 4], en: 'Tambora (1815) was the largest eruption in recorded history; the next year Europe had a "year without a summer".', es: 'El Tambora (1815) fue la mayor erupción de la historia registrada; al año siguiente Europa tuvo un «año sin verano».' },
    { title_en: 'The Andes', title_es: 'Los Andes', fly: [-72, -20, 2.6], en: 'The Nazca plate sinks under South America, lifting the Andes and feeding volcanoes like Cotopaxi and Ojos del Salado, the highest on Earth.', es: 'La placa de Nazca se hunde bajo Sudamérica, levanta los Andes y alimenta volcanes como el Cotopaxi y el Ojos del Salado, el más alto del mundo.' },
    { title_en: 'Alaska and the Cascades', title_es: 'Alaska y las Cascadas', fly: [-140, 52, 2.4], en: 'From the Aleutians to Mount St. Helens (1980), the northern Pacific rim is just as restless.', es: 'De las Aleutianas al Monte Santa Helena (1980), el borde norte del Pacífico es igual de inquieto.' },
  ] },
  { icon: '🌦️', en: 'Climates of the world', es: 'Los climas del mundo', steps: [
    { title_en: 'Köppen climate zones', title_es: 'Zonas climáticas de Köppen', projection: 'equalEarth', stack: ['koppen'], fly: [0, 0, 1], en: 'Five letters, five families: A tropical, B dry, C temperate, D continental, E polar. They follow latitude, oceans and mountains.', es: 'Cinco letras, cinco familias: A tropical, B seco, C templado, D continental, E polar. Siguen la latitud, los océanos y las montañas.' },
    { title_en: 'The Amazon (Af)', title_es: 'La Amazonía (Af)', fly: [-62, -4, 3], en: 'Rain every month and 27 °C all year: the largest rainforest on Earth.', es: 'Lluvia todos los meses y 27 °C todo el año: la mayor selva del planeta.' },
    { title_en: 'The Sahara (BWh)', title_es: 'El Sáhara (BWh)', fly: [10, 23, 3], en: 'The largest hot desert: some places get rain only once in years.', es: 'El mayor desierto cálido: en algunos lugares solo llueve una vez en varios años.' },
    { title_en: 'The Mediterranean (Cs)', title_es: 'El Mediterráneo (Cs)', fly: [15, 39, 4], en: 'Dry, hot summers and mild, wet winters, shared with California, central Chile, the Cape and south-west Australia.', es: 'Veranos secos y cálidos e inviernos suaves y húmedos, como en California, Chile central, El Cabo y el suroeste de Australia.' },
    { title_en: 'Siberia (Dfc, Dfd)', title_es: 'Siberia (Dfc, Dfd)', fly: [120, 62, 2.6], en: 'The most extreme seasons: Verkhoyansk has recorded −68 °C and +38 °C.', es: 'Las estaciones más extremas: en Verjoyansk se han medido −68 °C y +38 °C.' },
  ] },
  { icon: '🌃', en: 'Earth at night', es: 'La Tierra de noche', steps: [
    { title_en: 'Day and night, live', title_es: 'Día y noche, en vivo', projection: 'globe', stack: ['satellite', 'daynight', 'citylights'], fly: [20, 20, 1], en: 'The shadow line is where the sun is setting or rising right now. City lights glow on the night side.', es: 'La línea de sombra es donde el sol se pone o sale ahora mismo. Las luces de las ciudades brillan en el lado nocturno.' },
    { title_en: 'Europe', title_es: 'Europa', fly: [10, 50, 3.5], en: 'A dense web of cities: the Po valley, the Rhine and the Ruhr, London and Paris.', es: 'Una densa red de ciudades: el valle del Po, el Rin y el Ruhr, Londres y París.' },
    { title_en: 'The Nile', title_es: 'El Nilo', fly: [31, 27, 4], en: 'Almost all of Egypt’s 110 million people live along a thin green river line in the desert.', es: 'Casi todos los 110 millones de egipcios viven en una fina línea verde junto al río, en pleno desierto.' },
    { title_en: 'India', title_es: 'India', fly: [80, 22, 3.2], en: 'The Ganges plain is one of the most densely populated places on Earth.', es: 'La llanura del Ganges es uno de los lugares más poblados de la Tierra.' },
  ] },
  { icon: '📐', en: 'Why maps lie about size', es: 'Por qué los mapas mienten sobre el tamaño', steps: [
    { title_en: 'Mercator', title_es: 'Mercator', projection: 'mercator', stack: ['political'], fly: [0, 30, 1], en: 'On the Mercator map, Greenland looks as big as Africa.', es: 'En el mapa de Mercator, Groenlandia parece tan grande como África.' },
    { title_en: 'The truth', title_es: 'La verdad', projection: 'equalEarth', fly: [0, 20, 1], en: 'On an equal-area map you see the truth: Africa is 14 times larger than Greenland. Try "True size" in the More menu.', es: 'En un mapa de áreas iguales se ve la verdad: África es 14 veces mayor que Groenlandia. Prueba «Tamaño real» en el menú Más.' },
    { title_en: 'The globe', title_es: 'El globo', projection: 'globe', fly: [-30, 40, 1], en: 'Only a globe shows sizes, shapes and distances all at once.', es: 'Solo un globo muestra a la vez tamaños, formas y distancias.' },
  ] },
  { icon: '🦕', en: 'From Pangea to today', es: 'De Pangea a hoy', steps: [
    { title_en: 'Pangea', title_es: 'Pangea', mode: 'pangea', en: 'Press play on the timeline: 250 million years of drifting continents. Africa and South America fit like puzzle pieces.', es: 'Pulsa reproducir en la línea de tiempo: 250 millones de años de continentes a la deriva. África y Sudamérica encajan como piezas de puzle.' },
  ] },
];
