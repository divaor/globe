// Checks Reminders (v0.37.1) with Node: the service worker's choice (public/reminders-sw.js: one a day at most,
// only around the time chosen, only if something chosen is not done, taking turns, with the day's words) and its
// notification, and the calendar reminder (src/today/remind-logic.ts: a daily event at the time, with an alert,
// folded and escaped as calendars want it).
// Usage: node scripts/test/reminders.mjs
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

// ---- The service worker, in a sandbox: its own `self`, Cache Storage and notifications.
const store = new Map();
const shownN = [];
const listeners = {};
const cacheObj = {
  async match(k) { const v = store.get(k); return v == null ? undefined : { json: async () => JSON.parse(v) }; },
  async put(k, res) { store.set(k, await res.text()); },
};
const self = {
  addEventListener: (t, f) => { listeners[t] = f; },
  registration: { showNotification: async (title, opts) => { shownN.push({ title, ...opts }); } },
  clients: { matchAll: async () => [], openWindow: async (u) => ({ url: u }) },
};
const sandbox = { self, caches: { open: async () => cacheObj }, Response: class { constructor(b) { this.b = b; } async text() { return this.b; } }, console };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/reminders-sw.js'), 'utf8'), sandbox);
const R = self.atlasReminders;
check(R && typeof R.choose === 'function' && listeners.periodicsync && listeners.notificationclick, 'the worker adds its choice, a periodic sync and a tap on the notification');

const at = (day, hh, mm = 0) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, hh, mm); };
const D = '2026-11-18', Y = '2026-11-17';
const base = () => ({
  off: false, time: '19:00', chosen: ['daily', 'master:capitals', 'fill'], done: {},
  days: { [D]: { daily: { t: '🗓️ Daily challenge #300', b: 'Eight questions' }, 'master:capitals': { t: '🏛️ Capitals', b: '6 capitals to review today' } } },
  generic: { daily: { t: '🗓️ Daily challenge', b: 'Still waiting' }, 'master:capitals': { t: '🏛️ Capitals', b: 'Still waiting' }, fill: { t: '🖍️ Region of the day', b: 'Still waiting' } },
  more: '+{n} more', url: 'https://example.org/#today=1',
});

check(R.choose(null, at(D, 19), null) === null && R.choose({ ...base(), off: true }, at(D, 19), null) === null && R.choose({ ...base(), chosen: [] }, at(D, 19), null) === null,
  'nothing when nothing is chosen, or reminders are off');
// The hours: from six hours before the time (never before 7:00) to 23:00.
const hours = [10, 12, 13, 19, 22, 23].map((hh) => !!R.choose(base(), at(D, hh), null));
check(hours.join() === 'false,false,true,true,true,false', `at 19:00, only from 13:00 to 23:00 (${[10, 12, 13, 19, 22, 23].map((hh, k) => `${hh}h ${hours[k] ? 'yes' : 'no'}`).join(', ')})`);
const early = { ...base(), time: '07:30' }, late = { ...base(), time: '23:30' };
check(!R.choose(early, at(D, 6, 59), null) && !!R.choose(early, at(D, 7), null) && !!R.choose(late, at(D, 23, 40), null) && !R.choose(late, at(D, 17, 0), null),
  'an early time starts at 7:00; a late one (23:30) runs to midnight, and not from the afternoon');
// Once a day.
check(R.choose(base(), at(D, 19), { day: D, id: 'daily' }) === null && !!R.choose(base(), at(D, 19), { day: Y, id: 'daily' }), 'once a day: not again today, again tomorrow');
// Only if not done.
const allDone = { ...base(), done: { daily: D, 'master:capitals': D, fill: D } };
const stale = { ...base(), done: { daily: Y, 'master:capitals': Y, fill: Y } };
check(R.choose(allDone, at(D, 19), null) === null && R.choose(stale, at(D, 19), null)?.id === 'daily', 'nothing when all is done today; done yesterday is not done today');
const two = { ...base(), done: { daily: D } };
check(R.choose(two, at(D, 19), null)?.id === 'master:capitals', 'the first chosen not done yet');
// Taking turns.
const turn = (last) => R.choose(base(), at(D, 19), { day: Y, id: last })?.id;
check(turn('daily') === 'master:capitals' && turn('master:capitals') === 'fill' && turn('fill') === 'daily' && turn('gone') === 'daily',
  'they take turns: after the Daily challenge, Capitals; after Capitals, the region; then back to the first');
// The words.
const w = R.choose(base(), at(D, 19), { day: Y, id: 'daily' });
check(w.title === '🏛️ Capitals' && w.body === '6 capitals to review today · +2 more' && w.url === 'https://example.org/#today=1',
  `the day's words, and how many more are waiting: "${w.title}: ${w.body}"`);
const g = R.choose(base(), at(D, 19), { day: Y, id: 'master:capitals' });
check(g.title === '🖍️ Region of the day' && g.body === 'Still waiting · +2 more', 'a day without words: the plain ones');
const one = R.choose({ ...base(), chosen: ['fill'] }, at(D, 19), null);
check(one.body === 'Still waiting', 'one chosen: no "+n more"');

// The notification: shown once, quiet, replacing the last, then not again today.
store.set('reminders.json', JSON.stringify(base()));
const r1 = await R.remind(at(D, 19, 5));
const r2 = await R.remind(at(D, 20));
const n = shownN[0];
check(r1 && !r2 && shownN.length === 1 && n.tag === 'atlas-daily' && n.silent === true && n.renotify === false && n.data?.url === 'https://example.org/#today=1' && JSON.parse(store.get('reminders-shown.json')).day === D,
  `one quiet notification, tagged so it replaces yesterday's ("${n?.title}: ${n?.body}"), and not a second one today`);
const r3 = await R.remind(at('2026-11-19', 18));
check(r3 && r3.id === 'master:capitals' && shownN.length === 2, 'the next day, the next one');
// The tap opens Today (in a new window here: none is open).
let opened = null, closed = false;
await new Promise((res) => listeners.notificationclick({ notification: { close: () => { closed = true; }, data: { url: 'https://example.org/#today=1' } }, waitUntil: (p) => p.then((x) => { opened = x; res(); }) }));
check(closed && opened?.url === 'https://example.org/#today=1', 'a tap closes it and opens Today');

// ---- The calendar reminder.
const { rolldown } = await import('rolldown');
const bundle = await rolldown({ input: path.join(ROOT, 'src/today/remind-logic.ts'), platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm' });
const L = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

check(L.normTime('7:05') === '07:05' && L.normTime('19:00') === '19:00' && L.normTime('25:00') === '19:00' && L.normTime('x') === '19:00' && L.normTime(null) === '19:00', 'times: 7:05 → 07:05; anything else → 19:00');
check(L.nextDays(new Date(2026, 10, 29, 22), 4).join() === '2026-11-29,2026-11-30,2026-12-01,2026-12-02', 'the days ahead cross the month');
const desc = 'Capitals, Flags; the Daily challenge · Región del día · Ponlo en el mapa · Juegos en el mapa · and a long line to fold 🌍🌍🌍';
const text = L.ics({ time: '19:00', title: '🌍 Atlas: today’s games', desc, url: 'https://example.org/globe/#today=1', start: new Date(2026, 10, 18, 9), stamp: new Date(Date.UTC(2026, 10, 18, 12, 0, 0)) });
const lines = text.split('\r\n');
const unfolded = text.replace(/\r\n /g, '').split('\r\n');
const enc = new TextEncoder();
check(text.endsWith('\r\n') && !/[^\r]\n/.test(text) && lines.every((l) => enc.encode(l).length <= 75), 'the calendar file: CRLF lines, none over 75 bytes');
check(unfolded.includes('RRULE:FREQ=DAILY') && unfolded.includes('DTSTART:20261118T190000') && unfolded.includes('DTSTAMP:20261118T120000Z') && unfolded.includes('UID:atlas-daily-reminder@atlas-globe')
  && unfolded.includes('TRIGGER:PT0M') && unfolded.includes('URL:https://example.org/globe/#today=1'),
  'every day at 19:00 in the phone\'s own time zone, with an alert as it starts, one id, and the link to Today');
const d = unfolded.find((l) => l.startsWith('DESCRIPTION:Capitals'));
check(d === `DESCRIPTION:${desc.replace(/,/g, '\\,').replace(/;/g, '\\;')}\\nhttps://example.org/globe/#today=1`, 'its text escaped (commas, semicolons, new lines) and folded back whole, emoji included');
const folded = L.fold('X'.repeat(70) + '🌍🌍🌍🌍');
check(folded.split('\r\n ').every((p) => !p.includes('\uFFFD')) && folded.replace(/\r\n /g, '') === 'X'.repeat(70) + '🌍🌍🌍🌍', 'a fold never cuts a character');

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
