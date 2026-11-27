// The frame-rate meter (v0.54.3, Settings → Show the frame rate): how fast the map draws, the same on the website and
// in the apps, so the two can be compared on one phone. While the map moves: the full frames drawn in the last second,
// the time each took on the page's side, whether the GPU drew it from its world texture (GPU) or the 2D canvas did
// (2D), and the pixel ratio. When it is still, the last figures stay, dimmed.
import { h } from './dom';
import type { App } from '../app/app';

let el: HTMLElement | null = null;
let timer = 0;

export function setFpsMeter(app: App, on: boolean) {
  if (!on) {
    clearInterval(timer);
    timer = 0;
    el?.remove();
    el = null;
    return;
  }
  if (el) return;
  el = h('div', { class: 'fps-meter', 'aria-hidden': 'true' }, '—');
  document.body.append(el);
  timer = window.setInterval(() => {
    const s = app.renderer.frameStats();
    if (!el) return;
    el.classList.toggle('still', !s);
    if (s) el.textContent = `${s.fps} fps · ${s.ms.toFixed(s.ms < 10 ? 1 : 0)} ms · ${s.gpu ? 'GPU' : '2D'} · ×${+s.dpr.toFixed(2)}`;
  }, 250);
}
