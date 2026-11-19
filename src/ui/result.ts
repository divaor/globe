// The result card (v0.40.0): how a game went, the same in every game. The stars and the score (or a headline, for
// games without points), a line under them, what each round was, and the actions (share, play again, next).
import { Share2, RotateCcw } from 'lucide';
import { h, icon } from './dom';

export interface ResultRow {
  /** An emoji or a flag before the name. */
  icon?: string;
  name: string;
  /** A second line in small type (how far, the right answer…). */
  detail?: string;
  /** On the right: points, a time, ✓… */
  value?: string;
  /** right, close or wrong: a coloured mark at the start of the row; cur: the row of the reader's own answer. */
  mark?: 'ok' | 'near' | 'miss' | 'cur' | null;
}

export interface ResultOpts {
  /** 0–3. */
  stars?: number;
  score?: string;
  /** "points", "/ 10"… */
  unit?: string;
  /** Instead of a score: "Solved in 3 checks", "Well done". */
  headline?: string;
  /** A line under the score. */
  sub?: string;
  rowsTitle?: string;
  rows?: ResultRow[];
  /** More under the rows (a chart, a note). */
  extra?: (HTMLElement | null)[];
  actions?: (HTMLElement | null)[];
}

export function resultCard(o: ResultOpts): HTMLElement {
  const top = h('div', { class: 'result-top' },
    o.stars !== undefined ? h('div', { class: 'result-stars', role: 'img', 'aria-label': `${o.stars} / 3` },
      ...[0, 1, 2].map((i) => h('span', { class: i < o.stars! ? 'on' : '' }, '★'))) : null,
    o.score !== undefined ? h('div', { class: 'result-score' }, h('strong', null, o.score), o.unit ? h('span', null, ` ${o.unit}`) : null) : null,
    o.headline ? h('div', { class: 'result-headline' }, o.headline) : null,
    o.sub ? h('div', { class: 'result-sub' }, o.sub) : null);
  const rows = o.rows?.length ? h('div', { class: 'result-rows' },
    o.rowsTitle ? h('div', { class: 'result-rows-title' }, o.rowsTitle) : null,
    ...o.rows.map((r) => h('div', { class: `result-row${r.mark ? ` ${r.mark}` : ''}` },
      h('span', { class: 'result-mark', 'aria-hidden': 'true' }),
      r.icon ? h('span', { class: 'result-icon' }, r.icon) : null,
      h('span', { class: 'result-text' }, h('span', { class: 'result-name' }, r.name), r.detail ? h('span', { class: 'result-detail' }, r.detail) : null),
      r.value ? h('span', { class: 'result-value' }, r.value) : null))) : null;
  const actions = o.actions?.filter(Boolean).length ? h('div', { class: 'result-actions' }, ...o.actions.filter(Boolean) as HTMLElement[]) : null;
  return h('div', { class: 'result', 'data-result': '' }, top, rows, ...(o.extra ?? []).filter(Boolean) as HTMLElement[], actions);
}

/** The Share button of a result. */
export function shareBtn(label: string, onClick: () => void, attrs: Record<string, string> = { 'data-game': 'share' }): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'pill', ...attrs }, icon(Share2, 16), label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

/** The main button of a result: play again, more games, next. */
export function mainBtn(label: string, onClick: () => void, attrs: Record<string, string> = { 'data-game': 'again' }, ic = RotateCcw): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'pill primary', ...attrs }, icon(ic, 16), label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}
