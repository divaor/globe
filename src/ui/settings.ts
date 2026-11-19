// Settings and About/credits panels.
import { Download } from 'lucide';
import { h, icon, toggle, segmented, slider, fillSelect } from './dom';
import { canSpeak, narrationOn, setNarrationOn, voicesFor, voiceFor, setVoice, voiceRate, setVoiceRate, voiceRegion, speak, onNarration } from './narrator';
import { t, tx, LANGS, fmtNumber, appLocale, localeFromPhone, displayName, type Lang, L } from '../app/i18n';
import type { App } from '../app/app';
import { terrainSettings } from './terrain';
import { backupSettings } from '../app/backup';
import { ambientNamesField } from './playlists';

declare const __APP_VERSION__: string;

export interface InstallPrompt { prompt: () => Promise<void>; userChoice?: Promise<unknown> }
let deferredInstall: InstallPrompt | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e as unknown as InstallPrompt; });

export function canInstall() { return !!deferredInstall; }
export async function install() {
  if (!deferredInstall) return false;
  await deferredInstall.prompt();
  deferredInstall = null;
  return true;
}

/** More sections, added by main.ts (Reminders, v0.37.1): a title and its controls, before the backup. */
export const settingsExtras: { title: () => string; body: () => HTMLElement }[] = [];

const field = (label: string, control: HTMLElement, hint?: string) =>
  h('div', { class: 'field' }, h('div', { class: 'field-label' }, label, hint ? h('span', { class: 'field-hint' }, hint) : null), control);

export function settingsPanel(app: App, reopen: () => void, toast: (m: string) => void = () => {}): HTMLElement {
  const s = app.renderer.settings;
  const save = () => { app.renderer.requestRender(); app.save(); };
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone;
  const installBtn = h('button', { type: 'button', class: 'pill primary' }, icon(Download, 16), standalone ? t('installed') : t('install')) as HTMLButtonElement;
  installBtn.disabled = !!standalone;
  installBtn.addEventListener('click', async () => {
    if (!(await install())) {
      alert(L('To install: in Chrome use the ⋮ menu → "Install app" / "Add to Home screen". On iPhone: Share → "Add to Home Screen".', 'Para instalar: en Chrome usa el menú ⋮ → «Instalar app» / «Añadir a pantalla de inicio». En iPhone: Compartir → «Añadir a pantalla de inicio».'));
    }
  });

  // Like the phone (v0.35.0), English, and the two Spanishes; numbers and dates are written the phone's way.
  type Choice = Lang | 'es-ES' | 'auto';
  const es = app.lang === 'es';
  const langPicker = segmented<Choice>(!app.langPicked ? 'auto' : app.lang === 'es' && app.spanish === 'spain' ? 'es-ES' : app.lang, [
    { value: 'auto', label: L('📱 Like my phone', '📱 Como mi teléfono') },
    ...LANGS.filter((l) => l.id !== 'es').map((l) => ({ value: l.id as Choice, label: l.name })),
    { value: 'es', label: 'Español (Latinoamérica)' },
    { value: 'es-ES', label: 'Español (España)' },
  ], (v) => { if (v === 'auto') app.setLang(null); else app.setLang(v === 'es-ES' ? 'es' : v, v === 'es-ES' ? 'spain' : v === 'es' ? 'latam' : app.spanish); reopen(); });
  langPicker.classList.add('seg-wrap');
  const sample = `${fmtNumber(10935.5, 1)} · ${new Date(2026, 4, 3).toLocaleDateString(appLocale(), { day: 'numeric', month: 'long' })} · ${new Date(2026, 4, 3, 17, 30).toLocaleTimeString(appLocale(), { hour: 'numeric', minute: '2-digit' })}`;
  const phone = localeFromPhone();
  const numbers = h('p', { class: 'tool-hint', 'data-settings': 'formats' }, phone ? L('Numbers and dates as on your phone: {0}', 'Números y fechas como en tu teléfono: {0}', sample) : L('Numbers and dates: {0}', 'Números y fechas: {0}', sample));
  return h('div', { class: 'settings' },
    // English, and the two Spanishes: the texts as written (Latin America) or with Spain's words.
    field(t('language'), h('div', null, langPicker, numbers)),
    // Like the phone (v0.40.0), as for the language: the theme follows its dark mode.
    field(t('theme'), segmented<'auto' | 'dark' | 'light'>(app.themeAuto ? 'auto' : app.themeId, [{ value: 'auto', label: L('📱 Like my phone', '📱 Como mi teléfono') }, { value: 'dark', label: t('themeDark') }, { value: 'light', label: t('themeLight') }], (v) => app.setTheme(v))),
    h('h3', { class: 'sec-title' }, t('labels')),
    h('div', { class: 'toggles' },
      toggle(s.labels.countries, (v) => { s.labels.countries = v; save(); }, t('labelCountries')),
      toggle(s.labels.capitals, (v) => { s.labels.capitals = v; save(); }, t('labelCapitals')),
      toggle(s.labels.cities, (v) => { s.labels.cities = v; save(); }, t('labelCities')),
      toggle(s.labels.seas, (v) => { s.labels.seas = v; save(); }, t('labelSeas')),
      toggle(s.labels.values, (v) => { s.labels.values = v; save(); }, t('labelValues'))),
    field(t('labelSize'), slider(s.labelScale, 0.8, 1.5, 0.05, (v) => { s.labelScale = v; save(); })),
    h('h3', { class: 'sec-title' }, t('settings')),
    h('div', { class: 'toggles' },
      toggle(s.graticule, (v) => { s.graticule = v; save(); }, t('graticule')),
      toggle(s.shading, (v) => { s.shading = v; save(); }, t('shading'))),
    field(t('quality'), segmented<'auto' | 'high' | 'low'>(s.quality, [
      { value: 'auto', label: t('qualityAuto') }, { value: 'high', label: t('qualityHigh') }, { value: 'low', label: t('qualityLow') },
    ], (v) => { s.quality = v; app.renderer.resize(app.renderer.view.w, app.renderer.view.h); save(); })),
    ...(app.renderer.gl ? [h('div', { class: 'toggles' }, toggle(s.gpuMotion, (v) => { s.gpuMotion = v; app.renderer.requestRender(); save(); }, t('gpuMotion')))] : []),
    h('h3', { class: 'sec-title' }, L('Detailed terrain', 'Relieve detallado')),
    terrainSettings(app, reopen),
    h('h3', { class: 'sec-title' }, L('Reading aloud', 'Lectura en voz alta')),
    voiceSettings(app),
    h('h3', { class: 'sec-title' }, t('ambient')),
    field(t('ambientSpeed'), slider(app.ambient.speed, 0.25, 4, 0.25, (v) => { app.ambient.speed = v; app.save(); })),
    h('div', { class: 'toggles' },
      // Off unless turned on (here, in Explore → Ambient mode, or with the button shown on a tap while a playlist plays).
      ...(canSpeak() ? [toggle(app.ambient.narrate, (v) => { app.ambient.narrate = v; app.save(); }, L('Read each ambient view aloud', 'Leer cada vista del modo ambiente en voz alta'))] : []),
      toggle(app.ambient.clock, (v) => { app.ambient.clock = v; app.save(); }, t('ambientClock'))),
    ambientNamesField(app),
    h('p', { class: 'muted small' }, L('The screensaver’s playlists are in Explore → Ambient mode.', 'Las listas de reproducción del salvapantallas están en Explorar → Modo ambiente.')),
    ...settingsExtras.flatMap((x) => [h('h3', { class: 'sec-title' }, x.title()), x.body()]),
    // Your data on another device (v0.31.2): a backup to bring everything back on a phone or another computer.
    h('h3', { class: 'sec-title', 'data-section': 'backup' }, L('Your data on another device', 'Tus datos en otro dispositivo')),
    backupSettings(toast),
    h('div', { class: 'settings-actions' }, installBtn),
    h('p', { class: 'muted small' }, `${t('version')} ${__APP_VERSION__}`),
  );
}

export function aboutPanel(app: App): HTMLElement {
  const es = app.lang === 'es';
  const credits = new Map<string, string[]>();
  for (const d of app.registry.values()) {
    if (!d.credit) continue;
    const list = credits.get(d.credit) ?? [];
    list.push(tx(d.name));
    credits.set(d.credit, list);
  }
  return h('div', { class: 'about' },
    // v0.41.0: what the app is, in three lines (the same words as the store listing).
    h('p', { class: 'about-lead' }, L('Atlas Globe is the world on one globe: its countries and cities, its nature, its history and its sky.', 'Atlas Globe es el mundo en un solo globo: sus países y ciudades, su naturaleza, su historia y su cielo.')),
    h('p', null, L('Explore {0} maps, travel through time with hundreds of stories, plan a trip with the travel guide, and learn every country, capital and flag with games and a challenge each day.', 'Explora {0} mapas, viaja en el tiempo con cientos de historias, planea un viaje con la guía y aprende todos los países, capitales y banderas con juegos y un reto cada día.', fmtNumber([...app.registry.values()].filter((d) => !d.hidden && d.category !== 'mine').length))),
    h('p', null, L('No account and no ads. What you do stays on this device; to take it to another, use Settings → Your data on another device.', 'Sin cuenta y sin anuncios. Lo que haces se queda en este dispositivo; para llevarlo a otro, usa Ajustes → Tus datos en otro dispositivo.')),
    h('h3', { class: 'sec-title' }, t('credits')),
    h('p', { class: 'about-by', 'data-about': 'by' }, L('Made by {0}.', 'Hecho por {0}.', 'Diego Valencia')),
    h('ul', { class: 'credits' }, [...credits].map(([c, names]) => h('li', null, h('strong', null, c), h('span', { class: 'muted' }, ` — ${names.join(', ')}`)))),
    h('p', { class: 'muted small' }, L('Open source (GPL-3.0). Every map and story names its sources; the data keep their own licences.', 'Código abierto (GPL-3.0). Cada mapa e historia nombra sus fuentes; los datos conservan sus propias licencias.')),
    h('p', { class: 'small' }, h('a', { href: 'https://github.com/divaor/globe', target: '_blank', rel: 'noopener' }, 'github.com/divaor/globe')),
  );
}

/** Reading aloud: on or off, the voice for the app's language (Latin American Spanish voices first), its speed, and
 * a sample. The voices are the device's own; some devices have none for a language. */
function voiceSettings(app: App): HTMLElement {
  const es = app.lang === 'es';
  const box = h('div', { class: 'voice-settings' });
  if (!canSpeak()) {
    box.append(h('p', { class: 'muted small' }, L('This browser cannot read aloud.', 'Este navegador no puede leer en voz alta.')));
    return box;
  }
  const render = () => {
    box.replaceChildren();
    const list = voicesFor(app.lang);
    const cur = voiceFor(app.lang);
    box.append(h('div', { class: 'toggles' }, toggle(narrationOn(), (v) => setNarrationOn(v), L('Read tours and stories aloud', 'Leer en voz alta las visitas guiadas y las historias'))));
    if (!list.length) {
      box.append(h('p', { class: 'muted small' }, L('This device has no voices in {0}. You can add one in the system’s text-to-speech settings.', 'Este dispositivo no tiene voces en {0}. Puedes agregar una en los ajustes de texto a voz del sistema.', displayName('language', app.lang))));
      return;
    }
    const sel = h('select', { class: 'select', 'aria-label': L('Voice', 'Voz') }) as HTMLSelectElement;
    fillSelect(sel, list.map((v) => ({ value: v.voiceURI, label: `${v.name}${voiceRegion(v, app.lang) ? ` · ${voiceRegion(v, app.lang)}` : ''}` })));
    if (cur) sel.value = cur.voiceURI;
    sel.addEventListener('change', () => setVoice(app.lang, sel.value));
    const sample = h('button', { type: 'button', class: 'pill' }, L('▶ Try the voice', '▶ Probar la voz'));
    sample.addEventListener('click', () => void speak(L('Hello. This is how the tours and stories will sound.', 'Hola. Así sonarán las visitas guiadas y las historias.'), { lang: app.lang }));
    box.append(
      field(L('Voice', 'Voz'), sel),
      field(L('Speed', 'Velocidad'), slider(voiceRate(), 0.7, 1.4, 0.05, (v) => setVoiceRate(v))),
      h('div', { class: 'settings-actions' }, sample),
      h('p', { class: 'muted small' }, L('One of your device’s own voices reads; the app records and sends nothing.', 'Lee una voz de tu dispositivo; la app no graba ni envía nada.')));
  };
  render();
  // The voices arrive a moment after the page loads on some browsers; the switch can change from a tour.
  const off = onNarration(() => { if (!box.isConnected) { off(); return; } if (!box.contains(document.activeElement)) render(); });
  return box;
}
