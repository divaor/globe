// A picture shown full screen, to pinch, double-tap or scroll to zoom and drag to pan. The page itself cannot be
// zoomed (the globe takes those gestures), so the small pictures on quiz and story cards were hard to read on a phone.
import { X, ZoomIn } from 'lucide';
import { h, icon } from './dom';
import { lang } from '../app/i18n';

const MAX = 6;

/** Larger versions of a Wikimedia picture to try in turn. Commons answers a FilePath width with a thumbnail, or
 * with the original when that is smaller. A thumbnail's 1,280-pixel version fails when the original is smaller,
 * and the original (on upload.wikimedia.org) is then the next try. */
function sources(src: string): string[] {
  const fp = /^(.*\/Special:FilePath\/[^?]+)\?width=\d+$/.exec(src);
  if (fp) return [`${fp[1]}?width=1280`];
  const out: string[] = [];
  if (/\/\d+px-[^/]+$/.test(src)) out.push(src.replace(/\/\d+px-([^/]+)$/, '/1280px-$1'));
  const thumb = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/(.*)\/thumb\/(.+)\/[^/]+$/.exec(src);
  if (thumb) out.push(`https://upload.wikimedia.org/${thumb[1]}/${thumb[2]}`);
  return out;
}

let current: { close: () => void } | null = null;

/** Opens the picture full screen. A tap outside it, the X or Escape closes it. */
export function openZoom(src: string, alt = '') {
  current?.close();
  const es = lang() === 'es';
  const img = h('img', { class: 'zoom-img', src, alt, draggable: 'false' }) as HTMLImageElement;
  const btn = h('button', { type: 'button', class: 'zoom-close', 'aria-label': es ? 'Cerrar' : 'Close' }, icon(X, 22));
  const hint = h('div', { class: 'zoom-hint' }, es ? 'Pellizca o toca dos veces para acercar' : 'Pinch or double-tap to zoom');
  const view = h('div', { class: 'zoom-view', role: 'dialog', 'aria-modal': 'true', 'aria-label': alt || (es ? 'Imagen' : 'Picture') }, img, btn, hint);
  document.body.append(view);

  // A sharper picture, if Wikimedia has one; the small one stays until it has loaded.
  const tries = sources(src);
  const next = () => {
    const u = tries.shift();
    if (!u) return;
    const big = new Image();
    big.onload = () => { if (img.isConnected) img.src = u; };
    big.onerror = next;
    big.src = u;
  };
  next();

  // The picture's transform: scaled by s around its top-left corner, then moved by (tx, ty).
  let s = 1, tx = 0, ty = 0;
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
  const fit = () => {
    if (s <= 1) { s = 1; tx = 0; ty = 0; return; }
    const W = view.clientWidth, H = view.clientHeight, L = img.offsetLeft, T = img.offsetTop;
    const w = img.offsetWidth * s, hh = img.offsetHeight * s;
    tx = w <= W ? (W - w) / 2 - L : Math.min(-L, Math.max(W - L - w, tx));
    ty = hh <= H ? (H - hh) / 2 - T : Math.min(-T, Math.max(H - T - hh, ty));
  };
  /** Zooms to scale ns, keeping the point (px, py) of the screen where it is. */
  const zoomAt = (px: number, py: number, ns: number) => {
    ns = Math.min(MAX, Math.max(1, ns));
    const L = img.offsetLeft, T = img.offsetTop;
    const u = (px - L - tx) / s, v = (py - T - ty) / s;
    s = ns; tx = px - L - s * u; ty = py - T - s * v;
  };

  // The picture fills the screen as far as its shape allows; the small and the sharp version have the same shape,
  // so the swap keeps the zoom where it was.
  const size = () => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return;
    const k = Math.min(view.clientWidth / nw, view.clientHeight / nh);
    img.style.width = `${Math.round(nw * k)}px`;
    img.style.height = `${Math.round(nh * k)}px`;
    fit(); apply();
  };
  img.addEventListener('load', size);
  if (img.complete) size();

  const pts = new Map<number, { x: number; y: number }>();
  const pinch = () => {
    const [a, b] = [...pts.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  };
  let last: ReturnType<typeof pinch> | null = null;
  let moved = false, pinched = false, lastTap = 0, closeTimer = 0;
  view.addEventListener('pointerdown', (e) => {
    if (btn.contains(e.target as Node)) return;
    view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { moved = false; pinched = false; }
    if (pts.size === 2) { last = pinch(); pinched = true; }
    hint.classList.add('gone');
  });
  view.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2 && last) {
      const cur = pinch();
      zoomAt(cur.cx, cur.cy, s * (cur.d / last.d));
      tx += cur.cx - last.cx; ty += cur.cy - last.cy;
      last = cur;
    } else if (pts.size === 1 && s > 1) { tx += dx; ty += dy; } else return;
    fit(); apply();
  });
  const up = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    last = pts.size === 2 ? pinch() : null;
    if (pts.size || moved || pinched || e.type === 'pointercancel') return;
    // A tap: two in a row zoom in (or back out); one outside the picture closes it.
    const now = performance.now();
    if (now - lastTap < 320) {
      clearTimeout(closeTimer);
      lastTap = 0;
      if (s > 1) s = 1; else zoomAt(e.clientX, e.clientY, 2.5);
      fit();
      img.classList.add('anim'); apply();
      setTimeout(() => img.classList.remove('anim'), 220);
      return;
    }
    lastTap = now;
    const r = img.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside && s === 1) closeTimer = window.setTimeout(close, 330);
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', up);
  view.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, s * Math.exp(-e.deltaY * 0.002)); fit(); apply(); }, { passive: false });
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
  document.addEventListener('keydown', onKey, true);
  const onResize = () => size();
  window.addEventListener('resize', onResize);
  btn.addEventListener('click', () => close());

  function close() {
    clearTimeout(closeTimer);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    view.remove();
    if (current === handle) current = null;
  }
  const handle = { close };
  current = handle;
  btn.focus({ preventScroll: true });
}

/** Makes a card's picture open full screen when tapped, with a small zoom badge on its corner. Returns the
 * element to put in the card in place of the picture. */
export function zoomable(img: HTMLImageElement): HTMLElement {
  img.classList.add('zoomable');
  img.addEventListener('click', (e) => {
    if (!img.src) return;
    e.stopPropagation();
    openZoom(img.currentSrc || img.src, img.alt);
  });
  return h('span', { class: 'zoom-wrap' }, img, h('span', { class: 'zoom-badge', 'aria-hidden': 'true' }, icon(ZoomIn, 14)));
}
