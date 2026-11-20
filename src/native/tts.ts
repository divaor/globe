// Read aloud in the Android app (v0.43.0). Android's web view has no voices of its own, so the browser's speech
// (speechSynthesis, which src/ui/narrator.ts uses) is given the phone's text-to-speech engine instead, through
// @capacitor-community/text-to-speech: the same voices, sentences, rate and stop. (iOS's web view speaks with the
// phone's voices already.)
import { TextToSpeech } from '@capacitor-community/text-to-speech';

interface Voice { voiceURI: string; name: string; lang: string; localService: boolean; default: boolean }

/** An utterance as the narrator makes it: its text, language, voice, rate and events. */
class Utterance extends EventTarget {
  text: string; lang = ''; voice: Voice | null = null; rate = 1; pitch = 1; volume = 1;
  onstart: ((e: Event) => void) | null = null;
  onend: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(text = '') { super(); this.text = text; }
}

class Speech extends EventTarget {
  speaking = false;
  pending = false;
  paused = false;
  private voices: Voice[] = [];
  private queue: Utterance[] = [];
  private run = 0;
  onvoiceschanged: ((e: Event) => void) | null = null;

  async load() {
    try {
      const { voices } = await TextToSpeech.getSupportedVoices();
      this.voices = voices.map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService, default: v.default }));
    } catch { this.voices = []; }
    const e = new Event('voiceschanged');
    this.dispatchEvent(e);
    this.onvoiceschanged?.(e);
  }
  getVoices() { return this.voices; }
  speak(u: Utterance) {
    this.queue.push(u);
    this.pending = this.queue.length > 1 || this.speaking;
    if (!this.speaking) void this.next();
  }
  private async next() {
    const u = this.queue.shift();
    this.pending = this.queue.length > 0;
    if (!u) { this.speaking = false; return; }
    const me = this.run;
    this.speaking = true;
    const fire = (name: 'start' | 'end' | 'error') => { const e = new Event(name); u.dispatchEvent(e); u[`on${name}`]?.(e); };
    fire('start');
    try {
      const i = u.voice ? this.voices.findIndex((v) => v.voiceURI === u.voice!.voiceURI) : -1;
      await TextToSpeech.speak({ text: u.text, lang: u.voice?.lang ?? u.lang ?? 'en-US', rate: u.rate, pitch: u.pitch, volume: u.volume, ...(i >= 0 ? { voice: i } : {}), category: 'playback' });
      if (me === this.run) fire('end');
    } catch {
      if (me === this.run) fire('error');
    }
    if (me === this.run) void this.next();
  }
  cancel() {
    this.run++;
    this.queue = [];
    this.speaking = false;
    this.pending = false;
    void TextToSpeech.stop().catch(() => {});
  }
  pause() { /* the phone's engine has no pause: stop() is used */ }
  resume() { /* nothing paused */ }
}

/** Gives the page the phone's voices (Android). */
export function installSpeech() {
  const speech = new Speech();
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: speech });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, writable: true, value: Utterance });
  void speech.load();
}
