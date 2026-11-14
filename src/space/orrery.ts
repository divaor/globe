// The solar system on any date (an orrery): the Sun, the planets, the dwarf planets and Halley's Comet on their real
// orbits, seen from above. Play it at a day to ten years a second, pick a date (3000 BC to AD 3000), zoom from the
// inner planets out to Eris, and tap a world for its facts and a visit on the globe.
import { X, Play, Pause } from 'lucide';
import { h, icon, clear } from '../ui/dom';
import { tr, L, worldById, loadFacts } from './worlds';
import { thumbUrl, type Space } from './space';
import { julian, positionOf, orbitPath, dist, BODY_IDS } from './orbits';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { InfoRow } from '../layers/types';

interface Body { id: string; color: string; r: number; name: { en: string; es: string }; small?: boolean }
const BODIES: Body[] = [
  { id: 'mercury', color: '#b3aca4', r: 4, name: { en: 'Mercury', es: 'Mercurio' } },
  { id: 'venus', color: '#e8cda2', r: 6, name: { en: 'Venus', es: 'Venus' } },
  { id: 'earth', color: '#4f8fe6', r: 6.5, name: { en: 'Earth', es: 'Tierra' } },
  { id: 'mars', color: '#d1603d', r: 5, name: { en: 'Mars', es: 'Marte' } },
  { id: 'ceres', color: '#a9a39b', r: 3, name: { en: 'Ceres', es: 'Ceres' }, small: true },
  { id: 'jupiter', color: '#d8b48c', r: 11, name: { en: 'Jupiter', es: 'Júpiter' } },
  { id: 'saturn', color: '#e3cf98', r: 9.5, name: { en: 'Saturn', es: 'Saturno' } },
  { id: 'uranus', color: '#9fe3ea', r: 7.5, name: { en: 'Uranus', es: 'Urano' } },
  { id: 'neptune', color: '#4b70dd', r: 7.5, name: { en: 'Neptune', es: 'Neptuno' } },
  { id: 'pluto', color: '#c9b49a', r: 3.5, name: { en: 'Pluto', es: 'Plutón' }, small: true },
  { id: 'haumea', color: '#c8c8c8', r: 3, name: { en: 'Haumea', es: 'Haumea' }, small: true },
  { id: 'makemake', color: '#c99a7a', r: 3, name: { en: 'Makemake', es: 'Makemake' }, small: true },
  { id: 'eris', color: '#dedede', r: 3, name: { en: 'Eris', es: 'Eris' }, small: true },
  { id: 'halley', color: '#ffffff', r: 2.5, name: { en: "Halley's Comet", es: 'Cometa Halley' }, small: true },
];
type Scale = 'inner' | 'planets' | 'outer';
const SCALES: Record<Scale, { au: number; sqrt: boolean; label: { en: string; es: string } }> = {
  inner: { au: 2.0, sqrt: false, label: { en: 'Inner planets', es: 'Planetas interiores' } },
  planets: { au: 31, sqrt: true, label: { en: 'All the planets', es: 'Todos los planetas' } },
  outer: { au: 100, sqrt: true, label: { en: 'Out to Eris', es: 'Hasta Eris' } },
};
const SPEEDS: { days: number; label: { en: string; es: string } }[] = [
  { days: 1, label: { en: '1 day/s', es: '1 día/s' } },
  { days: 7, label: { en: '1 week/s', es: '1 semana/s' } },
  { days: 30.44, label: { en: '1 month/s', es: '1 mes/s' } },
  { days: 365.25, label: { en: '1 year/s', es: '1 año/s' } },
  { days: 3652.5, label: { en: '10 years/s', es: '10 años/s' } },
];
// From 3000 BC to AD 3000, the range of the planets' elements.
const JD_MIN = 625673.5, JD_MAX = 2816787.5;
const AU = 149.6; // million km

/** A Julian Day as a date in words: "14 November 2026", "1 March 300 BC". */
function fmtJd(jd: number, short = false): string {
  const d = new Date((jd - 2440587.5) * 86400000);
  const y = d.getUTCFullYear();
  const month = short ? 'short' : 'long';
  if (y > 0) return d.toLocaleDateString(L('en-GB', 'es-ES'), { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' });
  const md = d.toLocaleDateString(L('en-GB', 'es-ES'), { day: 'numeric', month, timeZone: 'UTC' });
  return `${md} ${1 - y} ${L('BC', 'a. C.')}`;
}

export class Orrery {
  private el: HTMLElement | null = null;
  private raf = 0;
  private jd = julian(new Date());
  private playing = false;
  private speed = 2;
  private scale: Scale = 'planets';
  private zoom = 1;
  private pan: [number, number] = [0, 0];
  private imgs = new Map<string, HTMLImageElement>();
  private spots: { id: string; x: number; y: number; r: number }[] = [];
  /** For tests: what is drawn. */
  info = { open: false, frames: 0, jd: 0, scale: 'planets' as Scale, playing: false };

  constructor(private app: App, private shell: Shell, private space: Space) {
    space.openOrrery = () => this.open();
    space.closeOrrery = () => this.close();
    space.closers.push({ owner: this, close: () => this.close() });
  }

  get isOpen() { return !!this.el; }

  open(jd?: number) {
    if (this.el) return;
    this.space.closeOverlays(this);
    this.shell.sheet.close();
    this.shell.card.hide();
    if (jd != null) this.jd = jd; else this.jd = julian(new Date());
    this.zoom = 1; this.pan = [0, 0];
    for (const b of BODIES) if (worldById(b.id) || b.id === 'earth') {
      const img = new Image(); img.src = thumbUrl(b.id); img.onload = () => this.dirty(); this.imgs.set(b.id, img);
    }
    const canvas = h('canvas', { class: 'orr-canvas' }) as HTMLCanvasElement;
    const date = h('div', { class: 'orr-date' });
    const close = h('button', { type: 'button', class: 'icon-btn orr-close', 'aria-label': L('Close the solar system', 'Cerrar el sistema solar') }, icon(X, 20));
    close.addEventListener('click', () => this.close());
    const play = h('button', { type: 'button', class: 'tb-play orr-play', 'aria-label': 'Play' }) as HTMLButtonElement;
    play.addEventListener('click', () => { this.playing = !this.playing; this.renderFoot(); this.dirty(); });
    const speeds = h('div', { class: 'chip-row orr-speeds' });
    const scales = h('div', { class: 'chip-row orr-scales' });
    const input = h('input', { type: 'date', class: 'orr-input', min: '0001-01-01', max: '2999-12-31', 'aria-label': L('Date', 'Fecha') }) as HTMLInputElement;
    input.addEventListener('change', () => {
      const [y, m, d] = input.value.split('-').map(Number);
      if (!y) return;
      const t = new Date(Date.UTC(2000, m - 1, d)); t.setUTCFullYear(y);
      this.jd = Math.max(JD_MIN, Math.min(JD_MAX, julian(t)));
      this.playing = false; this.renderFoot(); this.dirty();
    });
    const today = h('button', { type: 'button', class: 'chip orr-today' }, L('Today', 'Hoy'));
    today.addEventListener('click', () => { this.jd = julian(new Date()); this.playing = false; this.renderFoot(); this.dirty(); });
    const el = h('div', { class: 'orr', role: 'dialog', 'aria-label': L('The solar system', 'El sistema solar') }, canvas,
      h('div', { class: 'orr-head glass' }, h('strong', null, `☀️ ${L('The solar system', 'El sistema solar')}`), date, close),
      h('div', { class: 'orr-foot glass' },
        h('div', { class: 'orr-row' }, play, input, today),
        speeds, scales,
        h('div', { class: 'muted small' }, L('Sizes are not to scale. Tap a world for its facts · pinch or scroll to zoom · drag to move.', 'Los tamaños no están a escala. Toca un mundo para ver sus datos · pellizca o usa la rueda para acercar · arrastra para moverte.'))));
    this.el = el;
    this.ui = { canvas, date, play, speeds, scales, input };
    document.documentElement.classList.add('orrery-open');
    this.app.root.append(el);
    this.renderFoot();
    this.bind(canvas);
    this.info.open = true;
    this.dirty();
  }

  private ui: { canvas: HTMLCanvasElement; date: HTMLElement; play: HTMLButtonElement; speeds: HTMLElement; scales: HTMLElement; input: HTMLInputElement } | null = null;
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };

  close() {
    if (!this.el) return;
    cancelAnimationFrame(this.raf); this.raf = 0;
    this.el.remove(); this.el = null; this.ui = null;
    this.playing = false;
    this.info.open = false;
    document.documentElement.classList.remove('orrery-open');
    window.removeEventListener('keydown', this.onKey);
    this.shell.card.hide();
  }

  /** Plays from a date at a speed in days a second, the nearest of the speeds offered (tours use it). */
  show(jd: number, scale: Scale = 'planets', days?: number) {
    if (!this.el) this.open(jd); else this.jd = jd;
    this.scale = scale; this.zoom = 1; this.pan = [0, 0];
    if (days != null) {
      let k = 0;
      SPEEDS.forEach((s, i) => { if (Math.abs(Math.log(s.days / days)) < Math.abs(Math.log(SPEEDS[k].days / days))) k = i; });
      this.speed = k; this.playing = true;
    }
    this.renderFoot(); this.dirty();
  }

  private renderFoot() {
    const ui = this.ui;
    if (!ui) return;
    clear(ui.play); ui.play.append(icon(this.playing ? Pause : Play, 22));
    ui.play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    clear(ui.speeds);
    SPEEDS.forEach((s, k) => {
      const b = h('button', { type: 'button', class: `chip${this.speed === k ? ' on' : ''}`, 'data-speed': String(k) }, tr(s.label));
      b.addEventListener('click', () => { this.speed = k; this.playing = true; this.renderFoot(); this.dirty(); });
      ui.speeds.append(b);
    });
    clear(ui.scales);
    for (const k of Object.keys(SCALES) as Scale[]) {
      const b = h('button', { type: 'button', class: `chip${this.scale === k ? ' on' : ''}`, 'data-scale': k }, tr(SCALES[k].label));
      b.addEventListener('click', () => { this.scale = k; this.zoom = 1; this.pan = [0, 0]; this.renderFoot(); this.dirty(); });
      ui.scales.append(b);
    }
    this.info.scale = this.scale; this.info.playing = this.playing;
  }

  private last = 0;
  private dirty() { if (!this.raf && this.el) this.raf = requestAnimationFrame((t) => this.frame(t)); }

  private frame(t: number) {
    this.raf = 0;
    if (!this.el || !this.ui) return;
    const dt = this.last ? Math.min(0.1, (t - this.last) / 1000) : 0;
    this.last = t;
    if (this.playing) {
      this.jd += SPEEDS[this.speed].days * dt;
      if (this.jd > JD_MAX || this.jd < JD_MIN) { this.jd = Math.max(JD_MIN, Math.min(JD_MAX, this.jd)); this.playing = false; this.renderFoot(); }
    }
    this.draw();
    if (this.playing) this.dirty(); else this.last = 0;
  }

  /** Screen position of a heliocentric point (au), seen from above the ecliptic. */
  private toScreen(p: number[], cx: number, cy: number, R: number): [number, number] {
    const sc = SCALES[this.scale];
    const r = Math.hypot(p[0], p[1]);
    const rr = sc.sqrt ? Math.sqrt(r / sc.au) * R : (r / sc.au) * R;
    const k = r > 0 ? rr / r : 0;
    return [cx + p[0] * k, cy - p[1] * k];
  }

  private draw() {
    const ui = this.ui!, c = ui.canvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // The space between the head and the foot.
    const head = this.el!.querySelector('.orr-head')!.getBoundingClientRect(), foot = this.el!.querySelector('.orr-foot')!.getBoundingClientRect();
    // A tour's card at the top (the tour shows the solar system) takes some of the room.
    const tourCard = document.querySelector<HTMLElement>('.learn-card:not([hidden])')?.getBoundingClientRect();
    const top = Math.max(head.bottom, tourCard && tourCard.height ? tourCard.bottom : 0) + 8, bottom = foot.top - 8;
    const cx = W / 2 + this.pan[0], cy = (top + bottom) / 2 + this.pan[1];
    const R = (Math.min(W, bottom - top) / 2 - 18) * this.zoom;
    const jd = this.jd;
    ui.date.textContent = fmtJd(jd, W < 520);
    const d = new Date((jd - 2440587.5) * 86400000);
    if (d.getUTCFullYear() > 0 && d.getUTCFullYear() < 10000 && document.activeElement !== ui.input) ui.input.value = d.toISOString().slice(0, 10);
    // Orbits.
    ctx.lineWidth = 1;
    for (const b of BODIES) {
      const pts = orbitPath(b.id, jd, b.id === 'halley' ? 360 : 180);
      ctx.beginPath();
      pts.forEach((p, k) => { const [x, y] = this.toScreen(p, cx, cy, R); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = b.small ? 'rgba(200,210,230,0.18)' : 'rgba(170,200,255,0.28)';
      ctx.setLineDash(b.small ? [3, 4] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // The Sun.
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
    g.addColorStop(0, '#fff6d0'); g.addColorStop(0.35, '#ffd25a'); g.addColorStop(1, 'rgba(255,170,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.fill();
    this.spots = [{ id: 'sun', x: cx, y: cy, r: 12 }];
    const placed: [number, number, number, number][] = [[cx - 14, cy - 14, cx + 14, cy + 14]];
    // The bodies, with their names.
    ctx.font = '600 11.5px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const b of BODIES) {
      const p = positionOf(b.id, jd);
      if (!p) continue;
      const [x, y] = this.toScreen(p, cx, cy, R);
      if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
      if (b.id === 'halley') {
        // A tail pointing away from the Sun, longer near it.
        const r = Math.hypot(p[0], p[1]);
        if (r < 6) {
          const len = Math.min(60, 26 / Math.max(0.4, r));
          const ux = (x - cx) / Math.max(1, Math.hypot(x - cx, y - cy)), uy = (y - cy) / Math.max(1, Math.hypot(x - cx, y - cy));
          const tg = ctx.createLinearGradient(x, y, x + ux * len, y + uy * len);
          tg.addColorStop(0, 'rgba(200,230,255,0.85)'); tg.addColorStop(1, 'rgba(200,230,255,0)');
          ctx.strokeStyle = tg; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * len, y + uy * len); ctx.stroke(); ctx.lineWidth = 1;
        }
      }
      if (b.id === 'saturn') {
        ctx.strokeStyle = 'rgba(230,215,170,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y, b.r * 2, b.r * 0.7, -0.35, 0, Math.PI * 2); ctx.stroke(); ctx.lineWidth = 1;
      }
      const img = this.imgs.get(b.id);
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, x - b.r, y - b.r, b.r * 2, b.r * 2);
      else { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.fill(); }
      // A name where it doesn't cover another (the inner planets crowd the Sun when zoomed out).
      const name = tr(b.name), tw = ctx.measureText(name).width;
      const box: [number, number, number, number] = [x - tw / 2 - 2, y + b.r + 2, x + tw / 2 + 2, y + b.r + 17];
      if (!placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1])) {
        placed.push(box);
        ctx.fillStyle = b.small ? 'rgba(220,226,238,0.8)' : '#eef3ff';
        ctx.fillText(name, x, y + b.r + 3);
      }
      this.spots.push({ id: b.id, x, y, r: Math.max(b.r, 10) });
    }
    this.info.frames++; this.info.jd = jd;
  }

  private bind(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKey);
    const pts = new Map<number, { x: number; y: number; x0: number; y0: number }>();
    let pinch0 = 0, zoom0 = 1;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = this.zoom; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) { this.pan[0] += e.clientX - p.x; this.pan[1] += e.clientY - p.y; }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && pinch0 > 0) { const [a, b] = [...pts.values()]; this.zoom = Math.max(0.5, Math.min(20, (zoom0 * Math.hypot(a.x - b.x, a.y - b.y)) / pinch0)); }
      this.dirty();
    });
    const up = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId); pinch0 = 0;
      // A tap (not a drag): the world under it.
      if (p && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && e.type === 'pointerup') {
        const r = canvas.getBoundingClientRect();
        this.tap(e.clientX - r.left, e.clientY - r.top);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(20, this.zoom * Math.exp(-e.deltaY * 0.0015))); this.dirty(); }, { passive: false });
    canvas.addEventListener('dblclick', () => { this.zoom = 1; this.pan = [0, 0]; this.dirty(); });
    new ResizeObserver(() => this.dirty()).observe(canvas);
  }

  /** The facts card of the world under a point, with where it is now. */
  tap(x: number, y: number): string | null {
    let best: string | null = null, bd = Infinity;
    for (const s of this.spots) { const d = Math.hypot(s.x - x, s.y - y); if (d < s.r + 8 && d < bd) { bd = d; best = s.id; } }
    if (!best) { this.shell.card.hide(); return null; }
    void this.card(best);
    return best;
  }

  async card(id: string) {
    const p = positionOf(id, this.jd), e = positionOf('earth', this.jd);
    const n = (v: number, dd = 2) => v.toLocaleString(L('en-GB', 'es-ES'), { maximumFractionDigits: dd });
    const rows: InfoRow[] = [];
    if (p) {
      const r = Math.hypot(...p);
      rows.push({ icon: '☀️', label: L('From the Sun on this date', 'Del Sol en esta fecha'), value: `${n(r)} ${L('au', 'ua')} (${n(r * AU, 0)} ${L('million km', 'millones de km')})` });
      if (e && id !== 'earth') rows.push({ icon: '🌍', label: L('From the Earth', 'De la Tierra'), value: `${n(dist(p, e))} ${L('au', 'ua')}` });
    }
    await this.space.factsCard(id, rows);
  }
}

export { BODY_IDS };
