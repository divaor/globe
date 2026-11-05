// Pointer, touch, wheel and keyboard navigation: drag to rotate/pan with fling inertia, pinch and
// wheel zoom around the fingers/cursor, double-tap zoom, tap to select.
import type { Renderer, Ticker } from './renderer';

export interface InteractionHandlers {
  onTap(sx: number, sy: number): void;
  onHover(sx: number, sy: number): void;
  onStart(): void;
  onEnd(): void;
}

interface Pt { x: number; y: number }

export class Interaction {
  private pointers = new Map<number, Pt>();
  private down: { x: number; y: number; t: number; moved: boolean } | null = null;
  private last: Pt | null = null;
  private samples: { x: number; y: number; t: number }[] = [];
  private pinch: { d: number; mid: Pt } | null = null;
  private inertia: Ticker | null = null;
  private zoomAnim: Ticker | null = null;
  private lastTap = 0;
  private hoverRaf = 0;
  enabled = true;

  constructor(private el: HTMLElement, private r: Renderer, private h: InteractionHandlers) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onUp);
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.pointers.size) this.h.onHover(-1, -1); });
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKey);
  }

  private pos(e: PointerEvent | WheelEvent): Pt {
    const b = this.el.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  }

  private stopInertia() {
    if (this.inertia) { this.r.tickers.delete(this.inertia); this.inertia = null; }
    if (this.zoomAnim) { this.r.tickers.delete(this.zoomAnim); this.zoomAnim = null; }
  }

  private begin() {
    this.stopInertia();
    this.r.view.stopAnimations();
    this.r.moving = true;
    this.h.onStart();
  }

  private finish() {
    this.r.moving = false;
    this.r.requestRender();
    this.h.onEnd();
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.el.setPointerCapture(e.pointerId);
    const p = this.pos(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 1) {
      this.begin();
      this.down = { x: p.x, y: p.y, t: performance.now(), moved: false };
      this.last = p;
      this.samples = [{ ...p, t: performance.now() }];
    } else if (this.pointers.size === 2) {
      this.pinch = this.pinchState();
      if (this.down) this.down.moved = true;
    }
  };

  private pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  private onMove = (e: PointerEvent) => {
    const p = this.pos(e);
    if (!this.pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && !this.hoverRaf) {
        this.hoverRaf = requestAnimationFrame(() => { this.hoverRaf = 0; this.h.onHover(p.x, p.y); });
      }
      return;
    }
    this.pointers.set(e.pointerId, p);
    const view = this.r.view;
    if (this.pointers.size >= 2 && this.pinch) {
      const s = this.pinchState();
      if (this.pinch.d > 0 && s.d > 0) view.zoomAt(s.d / this.pinch.d, s.mid.x, s.mid.y);
      view.panBy(s.mid.x - this.pinch.mid.x, s.mid.y - this.pinch.mid.y);
      this.pinch = s;
      this.r.requestRender();
      return;
    }
    if (!this.down || !this.last) return;
    if (!this.down.moved && Math.hypot(p.x - this.down.x, p.y - this.down.y) > 5) this.down.moved = true;
    if (this.down.moved) {
      view.panBy(p.x - this.last.x, p.y - this.last.y);
      this.r.requestRender();
    }
    this.last = p;
    const now = performance.now();
    this.samples.push({ ...p, t: now });
    while (this.samples.length > 2 && now - this.samples[0].t > 90) this.samples.shift();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size === 1) {
      // Back from pinch to a one-finger drag.
      this.pinch = null;
      const p = [...this.pointers.values()][0];
      this.last = p; this.samples = [{ ...p, t: performance.now() }];
      return;
    }
    if (this.pointers.size > 0) return;
    this.pinch = null;
    const d = this.down;
    this.down = null;
    const now = performance.now();
    if (d && !d.moved && now - d.t < 500) {
      const p = this.pos(e);
      if (now - this.lastTap < 320) {
        this.lastTap = 0;
        this.animateZoom(2, p.x, p.y);
        this.finish();
        return;
      }
      this.lastTap = now;
      this.h.onTap(p.x, p.y);
      this.finish();
      return;
    }
    // Fling.
    const s = this.samples;
    if (s.length >= 2) {
      const a = s[0], b = s[s.length - 1];
      const dt = Math.max(1, b.t - a.t);
      let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      const speed = Math.hypot(vx, vy);
      if (speed > 0.15 && now - b.t < 80) {
        const view = this.r.view;
        this.inertia = (ms) => {
          const decay = Math.exp(-ms / 420);
          vx *= decay; vy *= decay;
          view.panBy(vx * ms, vy * ms);
          if (Math.hypot(vx, vy) < 0.02) { this.r.tickers.delete(this.inertia!); this.inertia = null; this.finish(); return false; }
          return true;
        };
        this.r.tickers.add(this.inertia);
        this.r.requestRender();
        return;
      }
    }
    this.finish();
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    this.stopInertia();
    const p = this.pos(e);
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
    const k = e.ctrlKey ? 0.012 : 0.0019;
    const factor = Math.exp(-e.deltaY * unit * k);
    this.r.moving = true;
    this.r.view.zoomAt(factor, p.x, p.y);
    this.r.requestRender();
    this.h.onStart();
    clearTimeout(this.wheelTimer);
    this.wheelTimer = window.setTimeout(() => this.finish(), 180);
  };
  private wheelTimer = 0;

  animateZoom(factor: number, sx?: number, sy?: number, ms = 320) {
    this.stopInertia();
    const view = this.r.view;
    const x = sx ?? view.w / 2, y = sy ?? view.h / 2;
    let done = 0;
    const total = Math.log(factor);
    this.r.moving = true;
    this.zoomAnim = (dt) => {
      const step = Math.min(dt, ms - done);
      done += step;
      const e0 = easeOut((done - step) / ms), e1 = easeOut(done / ms);
      view.zoomAt(Math.exp(total * (e1 - e0)), x, y);
      if (done >= ms) { this.r.tickers.delete(this.zoomAnim!); this.zoomAnim = null; this.r.moving = false; return false; }
      return true;
    };
    this.r.tickers.add(this.zoomAnim);
    this.r.requestRender();
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const view = this.r.view;
    const step = 60;
    switch (e.key) {
      case 'ArrowLeft': view.panBy(step, 0); break;
      case 'ArrowRight': view.panBy(-step, 0); break;
      case 'ArrowUp': view.panBy(0, step); break;
      case 'ArrowDown': view.panBy(0, -step); break;
      case '+': case '=': this.animateZoom(1.6); return;
      case '-': case '_': this.animateZoom(1 / 1.6); return;
      default: return;
    }
    e.preventDefault();
    this.r.requestRender();
  };
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
