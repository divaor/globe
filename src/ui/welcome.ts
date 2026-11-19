// The first-run welcome (v0.41.1): three short cards for someone opening the app for the first time (not from a
// shared link, which already shows them something): how to move the globe and that the Map tab changes what it shows,
// in the language their phone speaks (changeable right there); that something new waits each day in Today; and a
// first pick (games, stories or the map). Notifications are asked for only when a reminder is turned on.
import { ChevronLeft, ChevronRight } from 'lucide';
import { h, icon, clear } from './dom';
import { L, LANGS } from '../app/i18n';
import type { App } from '../app/app';

export interface WelcomeActions { today: () => void; games: () => void; stories: () => void; map: () => void }

const KEY = 'atlas-globe:welcomed';

/** Whether to welcome: never seen the app on this device, and not opened from a link to somewhere. */
export function shouldWelcome(): boolean {
  try {
    if (localStorage.getItem(KEY) || localStorage.getItem('atlas-globe:hinted')) return false;
  } catch { return false; }
  return !location.hash.slice(1);
}

export function showWelcome(app: App, act: WelcomeActions): HTMLElement {
  let step = 0;
  const done = (then?: () => void) => {
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode: it shows again next time */ }
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 220);
    then?.();
  };
  const card = h('div', { class: 'welcome-card glass', role: 'dialog', 'aria-modal': 'true' });
  const el = h('div', { class: 'welcome', 'data-welcome': '' }, card);
  const langPicker = () => {
    const cur = !app.langPicked ? 'phone' : app.lang === 'en' ? 'en' : `es-${app.spanish}`;
    const opts: [string, string][] = [['en', 'English'], ['es-latam', 'Español (Latinoamérica)'], ['es-spain', 'Español (España)']];
    const sel = h('select', { class: 'select', 'aria-label': L('Language', 'Idioma'), 'data-welcome': 'lang' }) as HTMLSelectElement;
    sel.append(h('option', { value: 'phone' }, `📱 ${L('Like my phone', 'Como mi teléfono')} (${LANGS.find((x) => x.id === app.lang)?.name ?? app.lang})`));
    for (const [v, label] of opts) sel.append(h('option', { value: v }, label));
    sel.value = cur === 'en' || cur === 'es-latam' || cur === 'es-spain' ? cur : 'phone';
    sel.addEventListener('change', () => {
      const v = sel.value;
      if (v === 'phone') app.setLang(null);
      else app.setLang(v === 'en' ? 'en' : 'es', v === 'es-spain' ? 'spain' : 'latam');
      render();
    });
    return h('label', { class: 'welcome-lang' }, h('span', null, L('Language', 'Idioma')), sel);
  };
  const choice = (emoji: string, title: string, sub: string, id: string, go: () => void) => {
    const b = h('button', { type: 'button', class: 'mode-card', 'data-welcome': id }, h('span', { class: 'mode-icon' }, emoji),
      h('span', { class: 'mode-text' }, h('span', { class: 'mode-title' }, title), h('span', { class: 'mode-desc' }, sub)));
    b.addEventListener('click', () => done(go));
    return b;
  };
  const CARDS: (() => HTMLElement[])[] = [
    () => [
      h('div', { class: 'welcome-art', 'aria-hidden': 'true' }, '🌍'),
      h('h2', { class: 'welcome-title' }, L('Welcome to Atlas Globe', 'Te damos la bienvenida a Atlas Globe')),
      h('p', null, L('Drag to spin the globe, pinch to zoom, and tap a country to learn about it.', 'Arrastra para girar el globo, pellizca para acercarte y toca un país para conocerlo.')),
      h('p', { class: 'muted' }, L('The Map tab changes what the globe shows: languages, climate, animals, history and many more.', 'La pestaña Mapa cambia lo que muestra el globo: idiomas, clima, animales, historia y mucho más.')),
      langPicker(),
    ],
    () => [
      h('div', { class: 'welcome-art', 'aria-hidden': 'true' }, '📅'),
      h('h2', { class: 'welcome-title' }, L('Something new every day', 'Algo nuevo cada día')),
      h('p', null, L('Today, in the middle of the bottom bar, has the daily challenge, a map game and the country of the day: a few minutes, the same for everyone.', 'Hoy, en el centro de la barra de abajo, tiene el reto del día, un juego en el mapa y el país del día: unos minutos, lo mismo para todos.')),
      h('p', { class: 'muted' }, L('Keep a streak going, and turn on a reminder if you like (only then does the app ask to send notifications).', 'Mantén una racha y, si quieres, activa un recordatorio (solo entonces la app pide enviar notificaciones).')),
    ],
    () => [
      h('div', { class: 'welcome-art', 'aria-hidden': 'true' }, '✨'),
      h('h2', { class: 'welcome-title' }, L('Where would you like to start?', '¿Por dónde quieres empezar?')),
      h('div', { class: 'mode-list' },
        choice('🎮', L('Games', 'Juegos'), L('Map games, Fill the map, Put it on the map', 'Juegos en el mapa, Llena el mapa, Ponlo en el mapa'), 'games', act.games),
        choice('📜', L('Stories', 'Historias'), L('Travel through time: wars, empires, journeys, inventions', 'Viaja en el tiempo: guerras, imperios, viajes, inventos'), 'stories', act.stories),
        choice('🗺️', L('The map', 'El mapa'), L('Pick what the globe shows', 'Elige lo que muestra el globo'), 'map', act.map),
        choice('📅', L('Today', 'Hoy'), L('The daily challenge and more', 'El reto del día y más'), 'today', act.today)),
    ],
  ];
  const render = () => {
    clear(card);
    card.setAttribute('aria-label', L('Welcome', 'Bienvenida'));
    const last = step === CARDS.length - 1;
    const back = h('button', { type: 'button', class: 'pill sm', 'data-welcome': 'back', disabled: step === 0 }, icon(ChevronLeft, 15), L('Back', 'Volver'));
    back.addEventListener('click', () => { step = Math.max(0, step - 1); render(); });
    const next = h('button', { type: 'button', class: 'pill primary', 'data-welcome': last ? 'close' : 'next' }, last ? L('Just look around', 'Solo mirar') : L('Next', 'Siguiente'), last ? null : icon(ChevronRight, 16));
    next.addEventListener('click', () => { if (last) done(); else { step++; render(); } });
    const skip = h('button', { type: 'button', class: 'welcome-skip', 'data-welcome': 'skip' }, L('Skip', 'Omitir'));
    skip.addEventListener('click', () => done());
    if (!last) card.append(skip);
    card.append(
      h('div', { class: 'welcome-body' }, ...CARDS[step]()),
      h('div', { class: 'welcome-dots', 'aria-hidden': 'true' }, ...CARDS.map((_, i) => h('span', { class: i === step ? 'on' : '' }))),
      h('div', { class: 'welcome-actions' }, back, next));
    (card.querySelector('[data-welcome="next"], [data-welcome="close"]') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  render();
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(); });
  app.root.append(el);
  return el;
}
