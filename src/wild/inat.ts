// iNaturalist (live, in the browser): a species' id by its Latin name, and its checked sightings by month, worldwide or
// near a place. For plants, "flowering" counts only the sightings people marked as in flower (iNaturalist's Plant
// Phenology annotation, term 12, value 13). Used by the animal and plant finders (v0.30.0, v0.31.0) and the plant card.
import { h } from '../ui/dom';
import { lang, fmtCompact, L, tx, txs, monthName as calMonth, fileLang } from '../app/i18n';

const MONTHS = { en: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'], es: ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] };
const MONTH_NAMES = { en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'] };

/** iNaturalist's id for a species (for its months), by its Latin name. */
const inatIds = new Map<string, Promise<number | null>>();
export function inatId(sci: string): Promise<number | null> {
  if (!inatIds.has(sci)) inatIds.set(sci, fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(sci)}&rank=species,subspecies&per_page=5`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { results?: { id: number; name: string }[] } | null) => j?.results?.find((t) => t.name.toLowerCase() === sci.toLowerCase())?.id ?? j?.results?.[0]?.id ?? null)
    .catch(() => { inatIds.delete(sci); return null; }));
  return inatIds.get(sci)!;
}

/** Checked sightings by month (January first), worldwide or within `km` of a place; `flowering`: in flower only. */
export async function months(sci: string, at?: [number, number], km = 60, flowering = false): Promise<number[] | null> {
  const id = await inatId(sci);
  if (!id) return null;
  const where = at ? `&lat=${at[1]}&lng=${at[0]}&radius=${km}` : '';
  const flower = flowering ? '&term_id=12&term_value_id=13' : '';
  const r = await fetch(`https://api.inaturalist.org/v1/observations/histogram?taxon_id=${id}&date_field=observed&interval=month_of_year&quality_grade=research${where}${flower}`).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json()) as { results?: { month_of_year?: Record<string, number> } };
  const m = j.results?.month_of_year;
  return m ? Array.from({ length: 12 }, (_, i) => m[String(i + 1)] ?? 0) : null;
}

/** The months with the most (the top three and any tied with them). */
export function bestMonths(v: number[]): number[] {
  const top = [...v].sort((a, b) => b - a)[2] ?? 0;
  return v.map((n, i) => [n, i] as const).filter(([n]) => n >= top && n > 0).map(([, i]) => i);
}
export const monthLong = (i: number) => (txs(MONTH_NAMES))[i];

/** Twelve bars, the best months highlighted; `what` says what is counted. */
export function monthBars(v: number[], what: 'sightings' | 'flowering' = 'sightings'): HTMLElement {
  const max = Math.max(1, ...v), total = v.reduce((a, b) => a + b, 0);
  const best = new Set(bestMonths(v));
  const bars = h('div', { class: 'wild-months', role: 'img', 'aria-label': what === 'flowering' ? L('Flowering by month', 'Floración por mes') : L('Sightings by month', 'Avistamientos por mes') });
  v.forEach((n, i) => {
    bars.append(h('div', { class: `wild-month${best.has(i) ? ' best' : ''}${what === 'flowering' ? ' bloom' : ''}`, title: `${monthLong(i)}: ${fmtCompact(n)}` },
      h('div', { class: 'wild-month-bar', style: `height:${Math.round((n / max) * 100)}%` }), h('div', { class: 'wild-month-lab' }, fileLang() ? calMonth(i).charAt(0) : txs(MONTHS)[i])));
  });
  const names = [...best].map(monthLong).join(', ');
  const text = what === 'flowering'
    ? (total ? L('{0} sightings in flower on iNaturalist. Most in {1}.', '{0} avistamientos en flor en iNaturalist. La mayoría en {1}.', fmtCompact(total), names)
      : L('No sightings marked in flower on iNaturalist here yet.', 'Aún no hay avistamientos marcados en flor en iNaturalist aquí.'))
    : (total ? L('{0} checked sightings on iNaturalist. Most in {1}.', '{0} avistamientos verificados en iNaturalist. La mayoría en {1}.', fmtCompact(total), names)
      : L('No checked sightings on iNaturalist here yet.', 'Aún no hay avistamientos verificados en iNaturalist aquí.'));
  return h('div', {}, bars, h('p', { class: 'muted small' }, text));
}

/**
 * When a plant flowers, in an element that fills itself in: the sightings people marked in flower, by month; when
 * there are too few of those, every checked sighting by month (which follows the flowers for most plants).
 */
export function floweringEl(sci: string, at?: [number, number]): HTMLElement {
  const el = h('div', { class: 'wild-when', 'data-green': 'flowering' }, h('p', { class: 'muted small' }, L('Asking iNaturalist…', 'Preguntando a iNaturalist…')));
  void months(sci, at, 80, true).then(async (v) => {
    el.replaceChildren();
    if (!v) { el.append(h('p', { class: 'muted small' }, L('When it flowers needs the internet (iNaturalist).', 'Cuándo florece necesita internet (iNaturalist).'))); return; }
    if (v.reduce((a, b) => a + b, 0) >= 12) { el.append(monthBars(v, 'flowering')); return; }
    const all = await months(sci, at, 80);
    if (all && all.some((n) => n > 0)) {
      el.append(monthBars(all), h('p', { class: 'muted small' }, L('Few sightings are marked in flower, so these are all of them: people see it most when it is in flower or fruit.', 'Pocos avistamientos están marcados en flor, así que estos son todos: la gente lo ve más cuando está en flor o con fruto.')));
    } else el.append(monthBars(v, 'flowering'));
  });
  return el;
}
