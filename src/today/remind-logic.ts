// Reminders (v0.37.1): the parts with no browser code (scripts/test/reminders.mjs checks them with Node). The daily
// calendar reminder (an .ics file the phone's calendar adds once and then rings every day at the time chosen), the
// time, and the days ahead the page writes words for (the service worker reads them when the page is closed).

/** A time as "HH:MM" (24 h), or null. */
export function parseTime(s: string | null | undefined): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  return h < 24 && mm < 60 ? { h, m: mm } : null;
}
export const DEFAULT_TIME = '19:00';
export const normTime = (s: string | null | undefined) => { const t = parseTime(s); return t ? `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}` : DEFAULT_TIME; };

/** The local day (2026-11-18) of a date, and the days from `from` on. */
export const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function nextDays(from: Date, n: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < n; k++) out.push(dayOf(new Date(from.getFullYear(), from.getMonth(), from.getDate() + k)));
  return out;
}

/** Text in a calendar line: backslashes, commas, semicolons and new lines escaped. */
export const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
/** A calendar line folded at 75 bytes (the next ones start with a space), never inside a character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * The daily calendar reminder: an event every day at the time (the phone's own time zone: a "floating" time), ten
 * minutes long, with an alert when it starts and a link to Today. One UID, so adding it again at a new time can
 * replace the old one in calendars that match by it.
 */
export function ics(o: { time: string; title: string; desc: string; url: string; start: Date; stamp?: Date }): string {
  const t = parseTime(o.time) ?? { h: 19, m: 0 };
  const p = (n: number) => String(n).padStart(2, '0');
  const d = o.start;
  const start = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(t.h)}${p(t.m)}00`;
  const s = o.stamp ?? new Date();
  const stamp = `${s.getUTCFullYear()}${p(s.getUTCMonth() + 1)}${p(s.getUTCDate())}T${p(s.getUTCHours())}${p(s.getUTCMinutes())}${p(s.getUTCSeconds())}Z`;
  const desc = `${o.desc}\n${o.url}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mundora//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:atlas-daily-reminder@atlas-globe', `DTSTAMP:${stamp}`, `DTSTART:${start}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    `SUMMARY:${icsText(o.title)}`, `DESCRIPTION:${icsText(desc)}`, `URL:${o.url}`, 'TRANSP:TRANSPARENT',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(o.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
