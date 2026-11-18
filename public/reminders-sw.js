// Reminders (v0.37.1), in the service worker (imported into the one vite-plugin-pwa writes). On a phone where Atlas
// is installed and the browser wakes it in the background now and then (periodic background sync: Chrome on
// Android), it shows one quiet notification a day at most, around the time chosen, about one of the games chosen
// (🔔 in the game) that is not done yet, taking turns. Atlas has no server: the page leaves what it knows in Cache
// Storage (what was chosen, the time, the day each was last done, and the words for the next days), and this reads
// it. Tapping the notification opens Today. scripts/test/reminders.mjs checks `choose` with Node.
/* eslint-disable no-restricted-globals */
(() => {
  const CACHE = 'atlas-reminders';
  const STATE = 'reminders.json';
  const SHOWN = 'reminders-shown.json';
  const TAG = 'atlas-daily';

  const pad = (n) => String(n).padStart(2, '0');
  /** The local day, as the page writes it (2026-11-18). */
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /**
   * The reminder to show now, or null: nothing chosen or all off; already shown today; outside the hours around
   * the time (from six hours before it, never before 7:00, to 23:00, or an hour after a late time); or everything
   * chosen done today. Among the ones not done, the next after the last shown, so they take turns.
   */
  function choose(state, now, shown) {
    if (!state || state.off || !Array.isArray(state.chosen) || !state.chosen.length) return null;
    const day = dayKey(now);
    if (shown && shown.day === day) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(state.time || '19:00');
    const at = m ? Number(m[1]) * 60 + Number(m[2]) : 19 * 60;
    const mins = now.getHours() * 60 + now.getMinutes();
    const from = Math.max(7 * 60, at - 6 * 60), to = Math.max(23 * 60, at + 60);
    if (mins < from || mins >= to) return null;
    const done = state.done || {};
    const left = state.chosen.filter((id) => done[id] !== day);
    if (!left.length) return null;
    const k = shown && shown.id ? state.chosen.indexOf(shown.id) + 1 : 0;
    const turn = [...state.chosen.slice(k), ...state.chosen.slice(0, k)].filter((id) => left.includes(id));
    const id = turn[0];
    const words = (state.days && state.days[day] && state.days[day][id]) || (state.generic && state.generic[id]) || { t: '🌍 Atlas', b: '' };
    const more = left.length - 1;
    const body = more > 0 && state.more ? `${words.b}${words.b ? ' · ' : ''}${state.more.replace('{n}', String(more))}` : words.b;
    return { id, day, title: words.t, body, url: state.url || './#today=1' };
  }

  async function read(cache, key) {
    try { const r = await cache.match(key); return r ? await r.json() : null; } catch { return null; }
  }

  /** Shows today's reminder if it is time (now: for the tests). Returns what was shown, or null. */
  async function remind(now = new Date()) {
    const cache = await caches.open(CACHE);
    const state = await read(cache, STATE);
    const shown = await read(cache, SHOWN);
    const r = choose(state, now, shown);
    if (!r) return null;
    await self.registration.showNotification(r.title, {
      body: r.body, tag: TAG, renotify: false, silent: true,
      icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: r.url, id: r.id },
    });
    await cache.put(SHOWN, new Response(JSON.stringify({ day: r.day, id: r.id }), { headers: { 'content-type': 'application/json' } }));
    return r;
  }

  self.addEventListener('periodicsync', (e) => { if (e.tag === TAG) e.waitUntil(remind()); });

  // A tap opens Today: in the app already open (it is told to), or in a new window.
  self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = (e.notification.data && e.notification.data.url) || './#today=1';
    e.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        c.postMessage({ type: 'atlas-open-today' });
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })());
  });

  self.atlasReminders = { choose, remind, dayKey, TAG };
})();
