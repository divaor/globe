// Short clips of free recordings on Wikimedia Commons. A story card plays its item's clip when tapped, and with
// music on (♪ in the story bar; off unless the reader turns it on) each step of a story or a tour plays the clip of
// the first item it shows that has one. One clip plays at a time, on one audio element: phones that only let sound
// start from a tap let it play later clips on its own once a tap has started it. The recordings are streamed by
// the reader's browser from Commons (its MP3 copy, else the original file), only when they are asked for.
import { Play, Pause } from 'lucide';
import { h, icon, clear } from './dom';
import { lang, tx } from '../app/i18n';

/** A clip as the data gives it: the MP3 copy and the original file on Commons, its page, the seconds to play,
 * who made the recording and its licence. */
export interface Clip { src: string; orig: string; page: string; start: number; end: number; by: { en: string; es: string }; license: string }
type State = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

const KEY = 'atlas-music';
/** Music with the stories: off unless the reader turned it on. */
export function musicOn(): boolean { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } }
export function setMusicOn(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* not kept */ } }

/** The last second and a half of a clip fades out. */
const FADE_OUT = 1.5;

/** A fiftieth of a second of silence, played from a tap so that later clips may start on their own. */
const SILENCE = (() => {
  const n = 160, b = new Uint8Array(44 + n).fill(0x80);
  const v = new DataView(b.buffer);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
})();

let el: HTMLAudioElement | null = null;
let cur: Clip | null = null;
let state: State = 'idle';
/** Where the clip playing was started: a card's play button, or a step with music on. */
let origin: 'card' | 'step' = 'card';
let failed: Clip | null = null;
let tries: string[] = [];
let target = 1;
let fade = 0;
let fadingOut = false;
/** The player was sent to the clip's start once (when the address's #t= was not honoured). */
let jumped = false;
let unlocked = false;
/** Music is turned down while the narrator speaks. */
let ducked = false;
const level = () => target * (ducked ? 0.3 : 1);
const subs = new Set<() => void>();

const same = (a: Clip | null, b: Clip | null) => !!a && !!b && a.src === b.src && a.start === b.start;
function set(s: State) { state = s; for (const f of [...subs]) f(); }

function audio(): HTMLAudioElement {
  if (el) return el;
  const a = (el = new Audio());
  a.preload = 'none';
  a.addEventListener('playing', () => { if (!cur) return; unlocked = true; set('playing'); });
  a.addEventListener('waiting', () => { if (cur && state === 'playing') set('loading'); });
  a.addEventListener('pause', () => { if (cur && state === 'playing') set('paused'); });
  // The MP3 copy failed (Commons had not made one): the original file next, then give up.
  a.addEventListener('error', () => { if (cur && a.getAttribute('src') !== SILENCE) next(); });
  a.addEventListener('ended', () => { if (cur) reset(); });
  a.addEventListener('timeupdate', () => {
    if (!cur || state !== 'playing') return;
    // The address's start time (#t=) was not honoured: go there, if the server lets the player jump (else it plays
    // from the beginning).
    if (a.currentTime < cur.start - 1 && !jumped) {
      jumped = true;
      const sk = a.seekable;
      if (sk.length && sk.end(sk.length - 1) >= cur.start) { a.currentTime = cur.start; return; }
    }
    const left = cur.end - a.currentTime;
    if (left <= 0.05) { reset(); return; }
    if (left < FADE_OUT && !fadingOut) { fadingOut = true; fadeTo(0, left * 1000); }
  });
  return a;
}

/** Plays the next address of the clip, or marks it as failed. */
function next() {
  const a = audio(), c = cur;
  const u = tries.shift();
  if (!c || !u) { failed = c; cur = null; set('error'); return; }
  jumped = false;
  a.src = `${u}#t=${c.start}`;
  set('loading');
  // A browser that blocks sound until a tap: the clip waits for the reader to press play.
  void a.play().catch((e: DOMException) => { if (e?.name === 'NotAllowedError' && same(cur, c)) { cur = null; set('idle'); } });
}

function fadeTo(v: number, ms: number, then?: () => void) {
  clearInterval(fade); fade = 0;
  const a = audio(), from = a.volume, t0 = performance.now();
  // Phones that fix the volume (iPhones) just wait for the fade's time.
  if (ms <= 0) { a.volume = v; then?.(); return; }
  fade = window.setInterval(() => {
    const p = Math.min(1, (performance.now() - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (v - from) * p));
    if (p >= 1) { clearInterval(fade); fade = 0; then?.(); }
  }, 40);
}

/** Stops the clip and forgets it. */
function reset() {
  clearInterval(fade); fade = 0;
  const a = audio();
  cur = null; fadingOut = false;
  a.pause();
  a.removeAttribute('src');
  a.load();
  set('idle');
}

/**
 * Plays a clip (`fadeIn`: from silence, after the clip playing fades out). The same clip playing goes on; paused, it
 * resumes. `title` names it on the phone's lock screen.
 */
export function playClip(c: Clip, o: { volume?: number; fadeIn?: number; title?: string; from?: 'card' | 'step' } = {}) {
  const a = audio();
  target = o.volume ?? 1;
  if (same(cur, c) && (state === 'playing' || state === 'loading')) { origin = o.from ?? origin; if (!fadingOut) fadeTo(level(), 300); return; }
  if (same(cur, c) && state === 'paused') { origin = o.from ?? origin; void a.play().catch(() => { /* blocked */ }); fadeTo(level(), 200); return; }
  const begin = () => {
    cur = c; origin = o.from ?? 'card'; failed = null; fadingOut = false;
    tries = [c.src, ...(c.orig !== c.src ? [c.orig] : [])];
    a.volume = o.fadeIn ? 0 : level();
    next();
    if (o.fadeIn) fadeTo(level(), o.fadeIn);
    const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (ms && typeof MediaMetadata !== 'undefined' && o.title) {
      try { ms.metadata = new MediaMetadata({ title: o.title, artist: tx(c.by) }); } catch { /* not shown */ }
    }
  };
  if (cur && state === 'playing' && o.fadeIn) fadeTo(0, 350, begin);
  else begin();
}

/** Pauses the clip playing. */
export function pauseClip() {
  if (!cur) return;
  clearInterval(fade); fade = 0;
  audio().pause();
  set('paused');
}

/** Stops the clip playing, fading it out over `ms`; `only`: just a clip started that way. */
export function stopClip(ms = 0, only?: 'card' | 'step') {
  if (!cur || (only && origin !== only)) return;
  if (ms > 0 && state === 'playing') { const c = cur; fadeTo(0, ms, () => { if (same(cur, c)) reset(); }); }
  else reset();
}

/** Is a clip (or this one) playing, or about to? */
export function clipPlaying(c?: Clip): boolean { return (state === 'playing' || state === 'loading') && (!c || same(cur, c)); }

/** Calls `fn` when a clip starts, stops or fails; returns the way to stop listening. */
export function onClip(fn: () => void): () => void { subs.add(fn); return () => subs.delete(fn); }

/** Lets clips start later without a tap: plays a moment of silence. Called from a tap, while music is on. */
export function unlockAudio() {
  if (unlocked || cur) return;
  const a = audio();
  a.src = SILENCE;
  void a.play().then(() => { unlocked = true; if (!cur) a.pause(); }).catch(() => { /* the next tap tries again */ });
}
for (const ev of ['touchend', 'click'] as const) document.addEventListener(ev, () => { if (musicOn()) unlockAudio(); }, { capture: true, passive: true });

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A clip on a card: its play button, how far it has played, and who made the recording, with its licence and a
 * link to its page on Commons (`credit: false` leaves them out, for a quiz). */
export function clipEl(c: Clip, o: { title?: string; credit?: boolean } = {}): HTMLElement {
  const es = lang() === 'es';
  const btn = h('button', { type: 'button', class: 'clip-play' }) as HTMLButtonElement;
  const fill = h('i');
  const bar = h('div', { class: 'clip-bar' }, fill);
  const time = h('span', { class: 'clip-time' });
  const note = h('div', { class: 'clip-note', hidden: true }, es ? 'No se pudo reproducir esta grabación aquí; escúchala en Wikimedia Commons.' : 'This recording could not be played here; listen to it on Wikimedia Commons.');
  const credit = o.credit === false ? null : h('div', { class: 'clip-credit' }, `♪ ${tx(c.by)} · ${c.license} · `, h('a', { href: c.page, target: '_blank', rel: 'noopener' }, 'Wikimedia Commons'));
  const wrap = h('div', { class: 'item-clip' }, h('div', { class: 'clip-row' }, btn, h('div', { class: 'clip-main' }, h('div', { class: 'clip-label' }, es ? 'Escucha un fragmento' : 'Listen to a clip'), bar), time), note, credit);
  const len = Math.max(1, c.end - c.start);
  let raf = 0;
  // How far it has played, every frame while it plays (from the next frame on: the card is on the page by then).
  const progress = () => {
    raf = 0;
    const mine = same(cur, c);
    const at = mine && el ? Math.max(0, Math.min(len, el.currentTime - c.start)) : 0;
    fill.style.width = `${(at / len) * 100}%`;
    time.textContent = `${mmss(at)} / ${mmss(len)}`;
    if (mine && (state === 'playing' || state === 'loading')) raf = requestAnimationFrame(() => { if (wrap.isConnected) progress(); else off(); });
  };
  const paint = () => {
    const mine = same(cur, c);
    const on = mine && (state === 'playing' || state === 'loading');
    clear(btn);
    btn.append(icon(on ? Pause : Play, 20));
    btn.setAttribute('aria-label', on ? (es ? 'Pausa' : 'Pause') : (es ? 'Escuchar' : 'Listen'));
    wrap.classList.toggle('loading', mine && state === 'loading');
    wrap.classList.toggle('playing', mine && state === 'playing');
    if (o.credit === false) note.textContent = es ? 'No se pudo reproducir esta grabación aquí.' : 'This recording could not be played here.';
    note.hidden = !same(failed, c);
    cancelAnimationFrame(raf);
    progress();
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (clipPlaying(c)) pauseClip();
    else playClip(c, { title: o.title, from: 'card' });
    paint();
  });
  const off = onClip(() => { if (!wrap.isConnected) { off(); cancelAnimationFrame(raf); return; } paint(); });
  paint();
  return wrap;
}

/** Turns the music down while a voice reads (narration), and back up after. */
export function duckMusic(on: boolean) {
  if (ducked === on) return;
  ducked = on;
  if (el && cur && (state === 'playing' || state === 'loading') && !fadingOut) fadeTo(level(), 450);
}
