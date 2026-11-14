// Read aloud: tours, stories and the screensaver read by one of the device's own voices (the browser's speech
// synthesis; the app records nothing and sends nothing). Spanish prefers a Latin American voice (Mexico, the
// United States, Colombia, Argentina...) over a voice from Spain. A text is read a sentence at a time, which keeps
// long texts going on browsers that stop a long utterance, and lets the page show the sentence being read. While a
// voice reads, the stories' music is turned down. With Spain's Spanish chosen, a voice from Spain comes first, its
// own choice of voice is kept apart, and it reads Spain's words.
import { duckMusic } from './audio';
import { spainOn, type Lang } from '../app/i18n';
import { toSpain } from '../app/spain';

const KEY_ON = 'atlas-narrate';
const KEY_RATE = 'atlas-voice-rate';
const keyVoice = (l: Lang) => `atlas-voice-${l}${l === 'es' && spainOn() ? '-ES' : ''}`;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* not kept */ } };

/** Can this browser read aloud? */
export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

/** Reading aloud in tours and stories: off unless the reader turned it on. */
export function narrationOn(): boolean { return canSpeak() && get(KEY_ON) === '1'; }
export function setNarrationOn(on: boolean) {
  put(KEY_ON, on ? '1' : '0');
  if (!on) stopSpeaking();
  for (const f of [...subs]) f();
}
const subs = new Set<() => void>();
/** Called when reading aloud is turned on or off, or a voice starts or stops. */
export function onNarration(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); }

export function voiceRate(): number { const r = Number(get(KEY_RATE)); return r >= 0.5 && r <= 2 ? r : 1; }
export function setVoiceRate(r: number) { put(KEY_RATE, String(r)); }

// ---- Voices --------------------------------------------------------------------------------------
/** Spanish voices by region, Latin America first; Spain's last. */
const ES_ORDER = ['es-419', 'es-mx', 'es-us', 'es-co', 'es-ar', 'es-cl', 'es-pe', 'es-ve', 'es-ec', 'es-gt', 'es-cr', 'es-pa', 'es-do', 'es-uy', 'es-py', 'es-bo', 'es-sv', 'es-hn', 'es-ni', 'es-pr', 'es-cu', 'es'];
const EN_ORDER = ['en-us', 'en-gb', 'en-au', 'en-ca', 'en-ie', 'en-nz', 'en-za', 'en-in', 'en'];

let voiceList: SpeechSynthesisVoice[] = [];
function refreshVoices() { if (canSpeak()) voiceList = speechSynthesis.getVoices(); }
if (canSpeak()) {
  refreshVoices();
  speechSynthesis.addEventListener?.('voiceschanged', () => { refreshVoices(); for (const f of [...subs]) f(); });
}

const tag = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
function rank(v: SpeechSynthesisVoice, l: Lang): number {
  const order = l === 'es' ? ES_ORDER : EN_ORDER;
  const t = tag(v);
  let i = order.indexOf(t);
  if (i < 0) i = t.startsWith(`${l}-`) ? (l === 'es' && t === 'es-es' ? order.length + 1 : order.length - 1) : 99;
  if (l === 'es' && spainOn() && t === 'es-es') i = -1;
  // Within a region, the better voices first: the system's own (offline) voices and those named "enhanced",
  // "premium" or "natural".
  const good = /enhanced|premium|natural|neural/i.test(v.name) ? -0.4 : 0;
  return i + good + (v.localService ? -0.2 : 0);
}

/** The voices for a language, best first (Latin American Spanish before Spain's, unless Spain's Spanish is on). */
export function voicesFor(l: Lang): SpeechSynthesisVoice[] {
  if (!voiceList.length) refreshVoices();
  return voiceList.filter((v) => tag(v).startsWith(l)).sort((a, b) => rank(a, l) - rank(b, l));
}

/** The voice that reads a language: the reader's choice, else the best one there is. */
export function voiceFor(l: Lang): SpeechSynthesisVoice | null {
  const list = voicesFor(l);
  const chosen = get(keyVoice(l));
  return (chosen && list.find((v) => v.voiceURI === chosen)) || list[0] || null;
}
export function setVoice(l: Lang, uri: string | null) { put(keyVoice(l), uri); }

/** Where a voice speaks from, for the settings list: "Mexico", "United States"... */
export function voiceRegion(v: SpeechSynthesisVoice, l: Lang): string {
  const region = tag(v).split('-')[1]?.toUpperCase();
  if (!region) return '';
  if (region === '419') return l === 'es' ? 'Latinoamérica' : 'Latin America';
  try { return new Intl.DisplayNames([l], { type: 'region' }).of(region) ?? region; } catch { return region; }
}

// ---- Text ----------------------------------------------------------------------------------------
/** Reads better aloud: no emoji or symbols, abbreviations spelt out. */
export function forSpeech(text: string, l: Lang): string {
  let s = text
    .replace(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu, '')
    .replace(/[•·→←↑↓★☆♪]/g, ' ')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/\s+/g, ' ');
  if (l === 'es') {
    s = s.replace(/\ba\.\s?C\./g, 'antes de Cristo').replace(/\bd\.\s?C\./g, 'después de Cristo')
      .replace(/\bc\.\s?(?=\d)/g, 'hacia ').replace(/\bkm²/g, 'kilómetros cuadrados').replace(/\bkm\b/g, 'kilómetros')
      .replace(/\bEE\.\s?UU\./g, 'Estados Unidos').replace(/\bp\. ej\./g, 'por ejemplo');
  } else {
    s = s.replace(/\bc\.\s?(?=\d)/g, 'around ').replace(/\bkm²/g, 'square kilometres').replace(/\bkm\b/g, 'kilometres')
      .replace(/\be\.g\./g, 'for example').replace(/\bi\.e\./g, 'that is');
  }
  return s.trim();
}

/** A text's sentences (a full stop, question or exclamation mark followed by a space and a capital). */
export function sentences(text: string): string[] {
  const out: string[] = [];
  // Abbreviations that end with a full stop but not a sentence.
  const re = /(?<!\b(?:[A-Z]|St|Dr|Mr|Mrs|Ms|Sr|Sra|Jr|vs|etc|a\. ?C|d\. ?C|c|p|EE\. ?UU|Nº))([.!?…]+["»”)]?)\s+(?=[«"“(¿¡]?[\p{Lu}\d])/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const end = m.index! + m[1].length;
    out.push(text.slice(last, end).trim());
    last = end;
  }
  if (last < text.length) out.push(text.slice(last).trim());
  return out.filter(Boolean);
}

// ---- Speaking ------------------------------------------------------------------------------------
export interface SpeakOptions {
  lang: Lang;
  /** Called with the index of the sentence that starts (the parts as `sentences()` cuts them). */
  onSentence?: (i: number) => void;
}

let run = 0;
let active = false;
let watch = 0;
/** Ends the text being read (resolving it false), even where cancelling sends no end event. */
let cancelCur: (() => void) | null = null;

/** Is a voice reading now? */
export function speaking(): boolean { return active; }

/**
 * Reads a text, a sentence at a time; resolves true when it has been read to the end, false when it was stopped
 * (by stopSpeaking or by another text). Without a voice it resolves at once.
 */
export function speak(text: string, o: SpeakOptions): Promise<boolean> {
  stopSpeaking();
  if (!canSpeak() || !text.trim()) return Promise.resolve(false);
  const me = ++run;
  const parts = sentences(text);
  const voice = voiceFor(o.lang);
  active = true;
  duckMusic(true);
  for (const f of [...subs]) f();
  return new Promise<boolean>((resolve) => {
    let i = 0;
    let settled = false;
    const finish = (done: boolean) => {
      if (settled) return;
      settled = true;
      if (cancelCur === cancel) cancelCur = null;
      if (me === run) { clearInterval(watch); active = false; duckMusic(false); for (const f of [...subs]) f(); }
      resolve(done);
    };
    const cancel = () => finish(false);
    cancelCur = cancel;
    const next = () => {
      clearInterval(watch);
      if (me !== run) { finish(false); return; }
      if (i >= parts.length) { finish(true); return; }
      const k = i++;
      const u = new SpeechSynthesisUtterance(forSpeech(o.lang === 'es' && spainOn() ? toSpain(parts[k]) : parts[k], o.lang));
      u.lang = voice?.lang ?? (o.lang === 'es' ? (spainOn() ? 'es-ES' : 'es-MX') : 'en-US');
      if (voice) u.voice = voice;
      u.rate = voiceRate();
      let ended = false;
      const end = () => { if (ended) return; ended = true; next(); };
      u.onend = end;
      u.onerror = end;
      u.onstart = () => o.onSentence?.(k);
      // Some browsers drop the end event (or never start without a voice): when the synthesizer has gone quiet
      // for a moment, the sentence is over.
      let quiet = 0;
      watch = window.setInterval(() => {
        if (me !== run) { clearInterval(watch); return; }
        if (speechSynthesis.speaking || speechSynthesis.pending) { quiet = 0; return; }
        if (++quiet >= 3) end();
      }, 400);
      speechSynthesis.speak(u);
    };
    next();
  });
}

/** Stops the voice (the text being read resolves false). */
export function stopSpeaking() {
  if (!canSpeak()) return;
  run++;
  clearInterval(watch);
  const c = cancelCur;
  cancelCur = null;
  c?.();
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  if (active) { active = false; duckMusic(false); for (const f of [...subs]) f(); }
}
