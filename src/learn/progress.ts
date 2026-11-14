// Your progress: right answers, quizzes played and day streaks for each subject, the daily challenge's streak,
// finished tours, and the badges they earn. Kept only in this browser.
import { h } from '../ui/dom';
import { lang } from '../app/i18n';
import { TOURS } from './tours';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
const KEY = 'atlas-globe:progress';

export type Subject = 'geo' | 'history' | 'culture' | 'languages' | 'science' | 'sport';
/** The subjects and their quizzes (the daily challenge counts each question for its own quiz's subject). */
export const SUBJECTS: Record<Subject, { icon: string; en: string; es: string; quizzes: string[] }> = {
  geo: { icon: '🗺️', en: 'Geography', es: 'Geografía', quizzes: ['find', 'flag', 'capital', 'region', 'where', 'link'] },
  history: { icon: '🏛️', en: 'History', es: 'Historia', quizzes: ['when', 'order', 'detective', 'era', 'civ', 'journey'] },
  culture: { icon: '🎨', en: 'Arts and culture', es: 'Arte y cultura', quizzes: ['dish', 'faith', 'listen', 'opening', 'artist', 'site'] },
  languages: { icon: '🗣️', en: 'Languages', es: 'Lenguas', quizzes: ['script', 'family'] },
  science: { icon: '🔬', en: 'Science and nature', es: 'Ciencia y naturaleza', quizzes: ['period', 'plague', 'disaster', 'inventor', 'world', 'landed'] },
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
}

const empty = (): Progress => ({ right: {}, played: {}, perfect: {}, kinds: [], days: {}, daily: { last: '', streak: 0, best: 0, results: {} }, tours: [], badges: {} });
let cache: Progress | null = null;
export function progress(): Progress {
  if (cache) return cache;
  try { cache = { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { cache = empty(); }
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

export function resetProgress() {
  cache = empty();
  save();
}

const fmt = (n: number) => n.toLocaleString(es() ? 'es-ES' : 'en-GB');
/** "13 Nov 2026" from 2026-11-13. */
const fmtDay = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(es() ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

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
    days.push(h('span', { class: `day-dot${r ? (r.s === r.n ? ' perfect' : ' done') : ''}`, title: `${dayKey(d)}${r ? ` · ${r.s}/${r.n}` : ''}` }, d.toLocaleDateString(es() ? 'es-ES' : 'en-GB', { weekday: 'narrow' })));
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
