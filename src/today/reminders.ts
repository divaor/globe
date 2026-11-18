// Reminders (v0.37.1): one gentle nudge a day, chosen in the game. A 🔔 switch in each daily game (and in Master
// the world, one per deck) turns its reminder on; the first time, it asks at what time (19:00 at first). At most one
// notification a day, only if something chosen is not done yet, about one of them, taking turns; it replaces
// yesterday's, makes no sound, and opens Today.
//
// Atlas has no server, so it uses what the phone offers. Where Atlas is installed and the browser can wake it in
// the background (Chrome on Android), the service worker (public/reminders-sw.js) shows the notification around
// the time, reading what the page left in Cache Storage: what is chosen, the day each was last done, and the words
// for the days ahead. Elsewhere (iPhone, computers) the switch offers a daily calendar reminder at the exact time
// instead: an .ics file the calendar adds once. Today shows the reminders and Settings turns them all off.
import type { Shell } from '../ui/shell';
import { h, clear, toggle } from '../ui/dom';
import { L } from '../play/host';
import { appLocale } from '../app/i18n';
import { current, progress } from '../learn/progress';
import { DEFAULT_TIME, ics, nextDays, normTime } from './remind-logic';

export const REMIND_KEY = 'atlas-globe:reminders';
/** What the service worker reads (public/reminders-sw.js), and its periodic sync's tag. */
const CACHE = 'atlas-reminders', STATE = 'reminders.json', TAG = 'atlas-daily';

interface RemindState {
  /** The reminders turned on, in the order turned on. */
  chosen: string[];
  /** "HH:MM", 24 h. */
  time: string;
  /** The time was asked (the first switch turned on asks it). */
  asked: boolean;
  /** Settings' switch: all off (the choices are kept). */
  off: boolean;
  /** The time last put in the calendar ('' never). */
  cal: string;
}
const fresh = (): RemindState => ({ chosen: [], time: DEFAULT_TIME, asked: false, off: false, cal: '' });

/** A game that can remind: its names, whether it is done today, and its reminder's words for a day. */
export interface RemindSource {
  id: string;
  order: number;
  icon: string;
  /** Short, for lists: "Capitals", "Daily challenge". */
  name(): string;
  /** The switch: "Remind me to practise capitals". */
  label(): string;
  done(): boolean;
  /** The notification's title and text for a day (today: true for today), or null for the plain ones. */
  words(day: string, today: boolean): { t: string; b: string } | null;
  /** Loads what its words need (once, and only when it is on). */
  prepare?(): Promise<unknown>;
}

/** How a reminder reaches you here: the service worker's notification, or a calendar event. */
export type Route = 'push' | 'cal';

let inst: Reminders | null = null;
/** A game's 🔔 switch (null until Reminders is set up, or for a game that cannot remind). */
export function bell(id: string): HTMLElement | null { return inst?.bell(id) ?? null; }

const safe = <T>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export class Reminders {
  private sources = new Map<string, RemindSource>();
  private st: RemindState | null = null;
  private last = '';
  private prepared = new Set<string>();
  route: Route = 'cal';
  /** For the tests: what the last calendar file said. */
  lastIcs = '';

  constructor(private shell: Shell) {
    inst = this;
    // What the service worker reads follows the day: games played, midnight, the app put away.
    setInterval(() => void this.sync(), 30_000);
    document.addEventListener('visibilitychange', () => void this.sync());
  }

  add(s: RemindSource) { this.sources.set(s.id, s); }

  // ---- State
  state(): RemindState {
    if (this.st) return this.st;
    const f = fresh();
    try { const s = JSON.parse(localStorage.getItem(REMIND_KEY) || '{}') as Partial<RemindState>; this.st = { ...f, ...s, chosen: Array.isArray(s.chosen) ? s.chosen : [] }; } catch { this.st = f; }
    this.st!.time = normTime(this.st!.time);
    return this.st!;
  }
  private save() {
    try { localStorage.setItem(REMIND_KEY, JSON.stringify(this.state())); } catch { /* private mode: for this visit */ }
    void this.sync();
  }
  isOn(id: string) { const st = this.state(); return !st.off && st.chosen.includes(id); }
  /** The reminders on, as their sources, in the games' order. */
  on(): RemindSource[] {
    const st = this.state();
    if (st.off) return [];
    return st.chosen.map((id) => this.sources.get(id)).filter((s): s is RemindSource => !!s).sort((a, b) => a.order - b.order);
  }
  /** The time, written the phone's way (7:00 p.m. or 19:00). */
  timeText(time = this.state().time): string {
    const [hh, mm] = time.split(':').map(Number);
    return new Date(2026, 0, 1, hh, mm).toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' });
  }

  // ---- Setting up
  /** Finds the way here, keeps the background check registered while something is chosen, and writes the state. */
  async init() {
    this.route = await this.detect();
    if (this.route === 'push' && this.on().length && Notification.permission === 'granted') await this.register();
    await this.sync();
  }

  private async reg(): Promise<ServiceWorkerRegistration | undefined> {
    if (!('serviceWorker' in navigator)) return undefined;
    try {
      // The worker may still be starting on a first visit: wait for it a little.
      return (await navigator.serviceWorker.getRegistration()) ?? (await Promise.race([navigator.serviceWorker.ready, new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000))]));
    } catch { return undefined; }
  }
  /** The notification where the browser can wake an installed Atlas in the background; the calendar elsewhere. */
  private async detect(): Promise<Route> {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'cal';
    const reg = await this.reg();
    if (!reg || !('periodicSync' in reg)) return 'cal';
    try {
      const p = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
      if (p.state !== 'granted') return 'cal';
    } catch { return 'cal'; }
    return Notification.permission === 'denied' ? 'cal' : 'push';
  }
  private async register(): Promise<boolean> {
    const ps = (await this.reg() as unknown as { periodicSync?: { register(t: string, o: { minInterval: number }): Promise<void> } } | undefined)?.periodicSync;
    if (!ps) return false;
    // Asked hourly; the browser decides (about once or twice a day). The worker shows one a day at most.
    try { await ps.register(TAG, { minInterval: 60 * 60 * 1000 }); return true; } catch { return false; }
  }
  private async unregister() {
    const ps = (await this.reg() as unknown as { periodicSync?: { unregister(t: string): Promise<void> } } | undefined)?.periodicSync;
    try { await ps?.unregister(TAG); } catch { /* gone already */ }
  }
  /** Asks for notifications (once) and registers the background check; false when not allowed. */
  private async allow(): Promise<boolean> {
    if (this.route !== 'push') return false;
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission().catch(() => 'denied' as NotificationPermission);
    if (p !== 'granted') { this.route = 'cal'; return false; }
    return this.register();
  }

  /**
   * What the service worker reads: on or off, the time, what is chosen, the day each was done (today, if done), and
   * the words for the next eight days in the app's language. Written when it changes.
   */
  async sync() {
    const st = this.state();
    // Nothing ever chosen: nothing to write (and no cache made).
    if (!st.chosen.length && !this.last && !st.off) return;
    for (const s of this.on()) {
      if (!s.prepare || this.prepared.has(s.id)) continue;
      this.prepared.add(s.id);
      await s.prepare().catch(() => {});
    }
    const now = new Date(), days = nextDays(now, 8), d0 = days[0];
    const done: Record<string, string> = {};
    const words: Record<string, Record<string, { t: string; b: string }>> = {};
    const generic: Record<string, { t: string; b: string }> = {};
    const streak = current(progress().daily);
    const streakLast = progress().daily.last;
    for (const s of this.on()) {
      if (safe(() => s.done(), false)) done[s.id] = d0;
      generic[s.id] = { t: `${s.icon} ${s.name()}`, b: L('Still waiting for you today', 'Te espera hoy') };
      for (const d of days) {
        const w = safe(() => s.words(d, d === d0), null);
        if (!w) continue;
        // The streak: today (not lost yet), and tomorrow when today is already in it.
        const keep = streak && (d === d0 || (d === days[1] && streakLast === d0));
        (words[d] ??= {})[s.id] = keep ? { t: w.t, b: `${w.b} · 🔥 ${L(`keep your ${streak}-day streak`, `no pierdas tu racha de ${streak} ${streak === 1 ? 'día' : 'días'}`)}` } : w;
      }
    }
    const snap = {
      v: 1, off: st.off, time: st.time, chosen: this.on().map((s) => s.id), done, days: words, generic,
      more: L('+{n} more', '+{n} más'), url: `${location.origin}${location.pathname}#today=1`,
    };
    const json = JSON.stringify(snap);
    if (json === this.last) return;
    this.last = json;
    try {
      const c = await caches.open(CACHE);
      await c.put(STATE, new Response(json, { headers: { 'content-type': 'application/json' } }));
    } catch { /* no Cache Storage (private mode): the calendar still works */ }
  }

  // ---- Turning on and off
  private async turnOn(id: string, redraw: () => void) {
    const st = this.state();
    st.off = false;
    if (!st.chosen.includes(id)) st.chosen.push(id);
    st.asked = true;
    this.save();
    if (this.route === 'push') {
      const ok = await this.allow();
      if (ok) this.shell.toast(L(`🔔 One reminder around ${this.timeText()}, only if it’s not done yet.`, `🔔 Un recordatorio hacia las ${this.timeText()}, solo si aún no lo has hecho.`), 3600);
    }
    redraw();
    this.shell.refreshDock();
  }
  private async turnOff(id: string, redraw: () => void) {
    const st = this.state();
    st.chosen = st.chosen.filter((x) => x !== id);
    this.save();
    if (!this.on().length) {
      await this.unregister();
      if (st.cal) this.shell.toast(L('No reminders left: remove “Atlas” from your calendar too.', 'Ya no quedan recordatorios: quita también «Atlas» de tu calendario.'), 4000);
    }
    redraw();
  }
  /** Settings' one switch. */
  async setAllOff(off: boolean) {
    const st = this.state();
    st.off = off;
    this.save();
    if (off) await this.unregister();
    else if (this.route === 'push' && this.on().length && Notification.permission === 'granted') await this.register();
  }
  async setTime(time: string) {
    const st = this.state();
    st.time = normTime(time);
    st.asked = true;
    this.save();
  }

  /** The daily calendar reminder, downloaded as an .ics file (the calendar opens it and adds it). */
  addToCalendar() {
    const st = this.state();
    const names = this.on().map((s) => s.name());
    const title = `🌍 Atlas: ${L('today’s games', 'los juegos de hoy')}`;
    const desc = names.length ? names.join(' · ') : L('Your daily games', 'Tus juegos del día');
    const now = new Date();
    this.lastIcs = ics({ time: st.time, title, desc, url: `${location.origin}${location.pathname}#today=1`, start: now });
    const url = URL.createObjectURL(new Blob([this.lastIcs], { type: 'text/calendar;charset=utf-8' }));
    const a = h('a', { href: url, download: 'atlas-reminder.ics' }) as HTMLAnchorElement;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    st.cal = st.time;
    this.save();
  }

  // ---- The switches
  /** A game's 🔔 switch; the first one asks the time; on, it says when and how (or offers the calendar). In the
   *  reminders' panel (withHow false) the how is said once, under the list. */
  bell(id: string, withHow = true, onChange?: () => void): HTMLElement | null {
    const src = this.sources.get(id);
    if (!src) return null;
    const row = h('div', { class: 'remind-row', 'data-remind': id });
    const draw = () => {
      clear(row);
      const st = this.state();
      const on = this.isOn(id);
      const after = () => { draw(); onChange?.(); };
      const sw = toggle(on, (v) => {
        if (!v) { void this.turnOff(id, after); return; }
        if (!st.asked) { this.ask(row, () => void this.turnOn(id, after), draw); return; }
        void this.turnOn(id, after);
      }, `🔔 ${src.label()}`);
      row.append(sw);
      if (on && withHow) row.append(this.how(draw));
    };
    draw();
    return row;
  }

  /** The first time: at what time? */
  private ask(row: HTMLElement, ok: () => void, cancel: () => void) {
    const st = this.state();
    row.querySelector('.remind-ask')?.remove();
    const input = h('input', { type: 'time', class: 'select remind-time', value: st.time, 'data-remind': 'time', 'aria-label': L('Time', 'Hora') }) as HTMLInputElement;
    const yes = h('button', { type: 'button', class: 'pill sm primary', 'data-remind': 'ok' }, L('Remind me', 'Recuérdamelo'));
    const no = h('button', { type: 'button', class: 'pill sm', 'data-remind': 'cancel' }, L('Not now', 'Ahora no'));
    yes.addEventListener('click', () => { st.time = normTime(input.value); ok(); });
    no.addEventListener('click', () => cancel());
    row.append(h('div', { class: 'remind-ask' },
      h('label', { class: 'remind-ask-q' }, L('At what time?', '¿A qué hora?'), input),
      h('p', { class: 'tool-hint' }, L('One reminder a day at most, only if it’s not done yet, with no sound. You can change the time in Today or Settings.', 'Un recordatorio al día como mucho, solo si aún no lo has hecho, sin sonido. Puedes cambiar la hora en Hoy o en Configuración.')),
      h('div', { class: 'hop-actions' }, yes, no)));
    input.focus();
  }

  /** Under a switch that is on: when, and how it reaches you here. */
  private how(redraw: () => void, inPanel = false): HTMLElement {
    const st = this.state();
    const time = this.timeText();
    // (In the reminders' panel itself there is nothing to open: no "change".)
    const change = inPanel ? null : h('button', { type: 'button', class: 'remind-link', 'data-remind': 'change' }, L('change', 'cambiar'));
    change?.addEventListener('click', () => this.openPanel());
    const sep = (t: string) => (inPanel ? t.replace(/ · $/, '') : t);
    if (this.route === 'push' && Notification.permission === 'granted') {
      return h('p', { class: 'tool-hint remind-hint' }, sep(L(`Around ${time}, if it’s not done yet · `, `Hacia las ${time}, si aún no lo has hecho · `)), change);
    }
    if (this.route === 'push') {
      const allow = h('button', { type: 'button', class: 'pill sm primary', 'data-remind': 'allow' }, L('Allow notifications', 'Permitir notificaciones'));
      allow.addEventListener('click', () => void this.allow().then(redraw));
      return h('div', { class: 'remind-hint' }, allow, h('p', { class: 'tool-hint' }, sep(L(`Then one reminder around ${time} · `, `Después, un recordatorio hacia las ${time} · `)), change));
    }
    if (st.cal === st.time) {
      return h('p', { class: 'tool-hint remind-hint' }, sep(L(`📅 In your calendar, every day at ${time} · `, `📅 En tu calendario, cada día a las ${time} · `)), change);
    }
    const cal = h('button', { type: 'button', class: 'pill sm primary', 'data-remind': 'calendar' }, L(`📅 Add to my calendar (${time})`, `📅 Agregar a mi calendario (${time})`));
    cal.addEventListener('click', () => { this.addToCalendar(); redraw(); });
    return h('div', { class: 'remind-hint' }, cal, h('p', { class: 'tool-hint' },
      sep(st.cal
        ? L(`Your calendar still says ${this.timeText(st.cal)}: add the new time, and remove the old one if it stays. · `, `Tu calendario aún dice ${this.timeText(st.cal)}: agrega la nueva hora y quita la anterior si se queda. · `)
        : L(`Your phone’s calendar reminds you every day at ${time}; tapping it opens Today. (Notifications in the background need Atlas installed on Android.) · `, `El calendario de tu teléfono te avisa cada día a las ${time}; al tocarlo se abre Hoy. (Las notificaciones en segundo plano necesitan Atlas instalado en Android.) · `)),
      change));
  }

  // ---- Today's line, the panel and Settings
  /** Today: which reminders and when, or how to get one. */
  todayLine(): HTMLElement {
    const st = this.state();
    const on = this.on();
    const text = st.off
      ? L('🔕 Reminders are off', '🔕 Los recordatorios están apagados')
      : on.length
        ? `🔔 ${on.map((s) => s.name()).join(', ')} · ${this.timeText()}`
        : L('🔔 Want a reminder? Turn one on in any game', '🔔 ¿Quieres un recordatorio? Actívalo en cualquier juego');
    const b = h('button', { type: 'button', class: 'today-remind', 'data-today': 'reminders' }, h('span', null, text), h('span', { class: 'remind-link' }, on.length || st.off ? L('change', 'cambiar') : L('choose', 'elegir')));
    b.addEventListener('click', () => this.openPanel());
    return b;
  }

  /** All the reminders: the time, each switch, and how they reach you. */
  openPanel() {
    const body = h('div', { class: 'remind-panel' });
    const draw = () => {
      clear(body);
      const st = this.state();
      const time = h('input', { type: 'time', class: 'select remind-time', value: st.time, 'data-remind': 'panel-time', 'aria-label': L('Time', 'Hora') }) as HTMLInputElement;
      time.addEventListener('change', () => { void this.setTime(time.value).then(draw); });
      body.append(
        h('p', { class: 'muted small' }, L('One reminder a day at most, only if something you chose is not done yet; each day about a different one. It makes no sound and opens Today.', 'Un recordatorio al día como mucho, solo si algo que elegiste aún no está hecho; cada día sobre uno distinto. No suena y abre Hoy.')),
        h('div', { class: 'toggles' }, toggle(!st.off, (v) => { void this.setAllOff(!v).then(draw); }, L('Reminders on', 'Recordatorios activados'))),
        h('label', { class: 'remind-ask-q' }, L('At', 'A las'), time),
        h('h3', { class: 'sec-title' }, L('Remind me of', 'Recuérdame')));
      const list = h('div', { class: 'remind-list' });
      for (const s of [...this.sources.values()].sort((a, b) => a.order - b.order)) { const el = this.bell(s.id, false, draw); if (el) list.append(el); }
      body.append(list);
      // How they reach you: once for all (one calendar event, or the notification).
      if (this.on().length) body.append(h('div', { class: 'remind-how', 'data-remind': 'how' }, this.how(draw, true)));
      body.append(h('p', { class: 'tool-hint' }, this.route === 'push'
        ? L('This phone wakes Atlas in the background now and then, so the reminder comes around your time, as the phone decides.', 'Este teléfono despierta a Atlas en segundo plano de vez en cuando, así que el recordatorio llega hacia tu hora, cuando el teléfono decide.')
        : L('Here a reminder is a daily event in your calendar, at the exact time: add it once. Atlas has no server, so it cannot send notifications to this device by itself.', 'Aquí un recordatorio es un evento diario en tu calendario, a la hora exacta: agrégalo una vez. Atlas no tiene servidor, así que no puede enviar notificaciones a este dispositivo por sí solo.')));
    };
    draw();
    this.shell.openPanel('reminders', L('Reminders', 'Recordatorios'), body);
  }

  /** Settings: the one switch, the time, and the list. */
  settings(): HTMLElement {
    const box = h('div', { class: 'remind-settings', 'data-settings': 'reminders' });
    const draw = () => {
      clear(box);
      const st = this.state();
      const on = this.on();
      const time = h('input', { type: 'time', class: 'select remind-time', value: st.time, 'data-remind': 'settings-time', 'aria-label': L('Time', 'Hora') }) as HTMLInputElement;
      time.addEventListener('change', () => { void this.setTime(time.value).then(draw); });
      const pick = h('button', { type: 'button', class: 'pill sm', 'data-remind': 'settings-open' }, L('Choose…', 'Elegir…'));
      pick.addEventListener('click', () => this.openPanel());
      box.append(
        h('div', { class: 'toggles' }, toggle(!st.off, (v) => { void this.setAllOff(!v).then(draw); }, L('Reminders (🔔 in each game)', 'Recordatorios (🔔 en cada juego)'))),
        h('label', { class: 'remind-ask-q' }, L('At', 'A las'), time),
        h('p', { class: 'tool-hint' }, on.length ? `🔔 ${on.map((s) => s.name()).join(', ')}` : L('None chosen yet.', 'Aún no elegiste ninguno.')),
        h('div', { class: 'settings-actions' }, pick));
    };
    draw();
    return box;
  }
}
