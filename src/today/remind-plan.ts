// Reminders in the apps (v0.43.0): the phone shows them at the time chosen, so the app schedules them ahead, one a
// day for the next eight days, with the same words the website's background worker picks (public/reminders-sw.js):
// one of the games chosen that is not done yet, taking turns day by day, "+2 more" when others are waiting too.
// Today's is left out when everything chosen is done already (or its time has passed). Each time the state changes
// (a game played, the time changed, a new day) the plan is made again and replaces the scheduled ones.
// scripts/test/reminders.mjs checks it with Node.

/** What Reminders.sync() writes (the same snapshot the background worker reads). */
export interface RemindSnapshot {
  off: boolean;
  time: string;
  chosen: string[];
  /** The day each was done, when it is today. */
  done: Record<string, string>;
  /** day → id → words. */
  days: Record<string, Record<string, { t: string; b: string }>>;
  generic: Record<string, { t: string; b: string }>;
  more: string;
}

export interface PlannedReminder { id: number; day: string; at: Date; source: string; title: string; body: string }

/** The ids the app's reminders use (the next eight days); anything else scheduled is not the app's. */
export const REMIND_IDS = Array.from({ length: 8 }, (_, k) => 4300 + k);

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function planReminders(snap: RemindSnapshot | null, now: Date): PlannedReminder[] {
  if (!snap || snap.off || !snap.chosen.length) return [];
  const m = /^(\d{1,2}):(\d{2})$/.exec(snap.time || '19:00');
  const hh = m ? Number(m[1]) : 19, mm = m ? Number(m[2]) : 0;
  const out: PlannedReminder[] = [];
  let prev: string | null = null;
  for (let k = 0; k < REMIND_IDS.length; k++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + k, hh, mm, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    const day = dayKey(at);
    const left = snap.chosen.filter((id) => snap.done[id] !== day);
    if (!left.length) continue;
    // Taking turns: the next one chosen after the previous day's, among those not done.
    const from: number = prev ? snap.chosen.indexOf(prev) + 1 : 0;
    const source: string = [...snap.chosen.slice(from), ...snap.chosen.slice(0, from)].find((id) => left.includes(id))!;
    prev = source;
    const words = snap.days[day]?.[source] ?? snap.generic[source] ?? { t: '🌍 Mundora', b: '' };
    const more = left.length - 1;
    const body = more > 0 && snap.more ? `${words.b}${words.b ? ' · ' : ''}${snap.more.replace('{n}', String(more))}` : words.b;
    out.push({ id: REMIND_IDS[k], day, at, source, title: words.t, body });
  }
  return out;
}
