// The cosmos chapter's scene (v0.46.0): from the Big Bang to the Earth and the Moon, drawn over the globe and driven
// by the time bar. The Big Bang's flash, the glowing fog of the first 380,000 years (its colour set by how hot the
// universe was) with its particles (quarks, then protons and neutrons, then the first helium nuclei), the oldest
// light as an oval like the Planck map, the dark ages with the cosmic web, the first stars lighting up along it and
// exploding as supernovae, galaxies growing into spirals, the zoom into the Milky Way with the place the Sun will
// form, a cloud collapsing into the Sun, the disc of dust with the planets growing, and the young Earth hit by Theia,
// with the Moon gathering from the debris. Things that have a card are spots to tap.
import { spaceTemp, sinceBang, maOfT, EARTH_MA } from './logic';

export interface Spot { id: string; x: number; y: number; r: number }

const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** 0 before `a`, 1 after `b`, smooth in between. */
const ramp = (v: number, a: number, b: number) => smooth((v - a) / (b - a));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** The colour of something this hot (log₁₀ of kelvin): orange at 2,500 K, white at millions, bluish at billions. */
function heatColour(logT: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [[3.3, [255, 96, 30]], [3.6, [255, 140, 50]], [4.2, [255, 190, 90]], [5.5, [255, 222, 150]], [8, [255, 244, 214]], [10, [246, 240, 255]], [14, [226, 228, 255]]];
  if (logT <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (logT <= stops[i][0]) {
    const f = (logT - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
    return [0, 1, 2].map((k) => Math.round(lerp(stops[i - 1][1][k], stops[i][1][k], f))) as [number, number, number];
  }
  return stops[stops.length - 1][1];
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Ages the scene is tied to (years after the Big Bang). */
const T = {
  atoms: 380000,
  starsOn: sinceBang(13660), starsAll: sinceBang(13560),
  galaxiesOn: sinceBang(13520), spirals: sinceBang(12000),
  zoomFrom: sinceBang(10400), zoomTo: sinceBang(8800),
  sunHere: sinceBang(6500),
  nebulaFrom: sinceBang(4640), nebulaFull: sinceBang(4605), collapse: sinceBang(4569.5),
  sun: sinceBang(4568), discEnd: sinceBang(4542),
  closeUp: sinceBang(4541), theiaFrom: sinceBang(4530), impact: sinceBang(4510), moon: sinceBang(4506), end: sinceBang(4500),
};

/** The planets growing in the disc: distance (share of the disc's radius), size, colour, when they appear (Ma). */
const PLANETS: { id: string; a: number; r: number; c: string; from: number; ring?: true }[] = [
  { id: 'mercury', a: 0.13, r: 1.6, c: '#b0a79d', from: 4556 },
  { id: 'venus', a: 0.2, r: 2.6, c: '#e6c58f', from: 4552 },
  { id: 'earth', a: 0.27, r: 2.8, c: '#ff7a3d', from: 4560 },
  { id: 'mars', a: 0.36, r: 2, c: '#d1603d', from: 4564 },
  { id: 'jupiter', a: 0.55, r: 6.5, c: '#d8b48a', from: 4567 },
  { id: 'saturn', a: 0.7, r: 5.4, c: '#e8d29e', from: 4566, ring: true },
  { id: 'uranus', a: 0.84, r: 3.6, c: '#9fd8e0', from: 4562 },
  { id: 'neptune', a: 0.96, r: 3.5, c: '#5b7fe0', from: 4561 },
];

export class CosmosScene {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private t = 0;
  private shown = false;
  private raf = 0;
  private last = 0;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** The spots drawn on the last frame. */
  spots: Spot[] = [];
  /** A spot to point at (the story's beat). */
  focus: string | null = null;
  /** The part of the screen the scene has to itself: below the top line, above the bar (CSS px). */
  inset = { top: 0, bottom: 0 };
  private noise: HTMLCanvasElement | null = null;
  private cmb: HTMLCanvasElement | null = null;
  private galaxy: HTMLCanvasElement | null = null;
  private field: { x: number; y: number; b: number }[] = [];
  private nodes: { x: number; y: number; m: number; at: number; spiral: boolean; rot: number }[] = [];
  private edges: [number, number][] = [];
  private home = 0;
  private parts: { x: number; y: number; k: number; ph: number }[] = [];
  private flashes: { i: number; t0: number }[] = [];

  /**
   * `has(id)`: whether an event exists (only those get a spot); `name(key)`: the words for a label (an event's name,
   * or "jupiter", "earth", "theia", "moon", "sun-here"), or null for none; `tap(id)`: a spot tapped.
   */
  constructor(private has: (id: string) => boolean, private name: (key: string) => string | null, private tap: (id: string) => void) {
    this.el = document.createElement('canvas');
    this.el.className = 'dt-scene';
    this.el.dataset.deeptime = 'scene';
    this.ctx = this.el.getContext('2d')!;
    let down: { x: number; y: number } | null = null;
    this.el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) { down = null; return; }
      down = null;
      const b = this.el.getBoundingClientRect();
      const hit = this.hit(e.clientX - b.left, e.clientY - b.top);
      if (hit) this.tap(hit.id);
    });
    this.el.addEventListener('pointermove', (e) => {
      const b = this.el.getBoundingClientRect();
      this.el.style.cursor = this.hit(e.clientX - b.left, e.clientY - b.top) ? 'pointer' : '';
    });
  }

  /** The nearest spot under a point (CSS px), smallest first so a planet wins over the disc around it. */
  hit(x: number, y: number): Spot | null {
    const under = this.spots.filter((s) => Math.hypot(s.x - x, s.y - y) <= s.r + 14);
    return under.sort((a, b) => a.r - b.r)[0] ?? null;
  }

  get visible() { return this.shown; }

  show(on: boolean) {
    if (on === this.shown) return;
    this.shown = on;
    this.el.classList.toggle('on', on);
    if (on) { this.build(); this.raf = requestAnimationFrame(this.loop); } else { cancelAnimationFrame(this.raf); this.spots = []; }
  }

  setTime(t: number) {
    this.t = t;
    if (this.shown) this.draw(performance.now());
  }

  destroy() { this.show(false); this.el.remove(); }

  private loop = (now: number) => {
    if (!this.shown) return;
    // About 30 frames a second is plenty for drifting fog and turning galaxies.
    if (now - this.last >= 33) { this.last = now; this.draw(now); }
    this.raf = requestAnimationFrame(this.loop);
  };

  // ---- Things made once ------------------------------------------------------------------------------------------

  private build() {
    if (this.noise) return;
    const r = seeded(13787);
    // Smooth noise: four octaves of value noise, wrapping, as an alpha mask.
    const N = 256;
    const val = new Float32Array(N * N);
    for (const [cells, amp] of [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]] as const) {
      const g = Array.from({ length: cells * cells }, () => r());
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = (x / N) * cells, fy = (y / N) * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy), sx = smooth(fx - x0), sy = smooth(fy - y0);
        const at = (i: number, j: number) => g[((j % cells) * cells) + (i % cells)];
        const top = lerp(at(x0, y0), at(x0 + 1, y0), sx), bot = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx);
        val[y * N + x] += lerp(top, bot, sy) * amp;
      }
    }
    const mk = (paint: (v: number) => [number, number, number, number]) => {
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d')!;
      const img = g.createImageData(N, N);
      for (let i = 0; i < N * N; i++) { const p = paint(val[i]); img.data.set(p, i * 4); }
      g.putImageData(img, 0, 0);
      return c;
    };
    this.noise = mk((v) => [255, 255, 255, Math.round(Math.max(0, Math.min(1, (v - 0.25) * 1.8)) * 255)]);
    // The oldest light: tiny differences in temperature, coloured like the Planck map (blue colder, red warmer).
    this.cmb = mk((v) => {
      const f = Math.max(0, Math.min(1, (v - 0.3) * 2.5));
      const c = f < 0.5 ? [lerp(30, 120, f * 2), lerp(60, 200, f * 2), lerp(200, 230, f * 2)] : [lerp(120, 250, (f - 0.5) * 2), lerp(200, 120, (f - 0.5) * 2), lerp(230, 40, (f - 0.5) * 2)];
      return [c[0], c[1], c[2], 255];
    });
    // A spiral galaxy: two arms of stars along logarithmic spirals, a yellowish bulge, bluish arms.
    const G = 512, gc = document.createElement('canvas');
    gc.width = gc.height = G;
    const g = gc.getContext('2d')!;
    const glow = g.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
    glow.addColorStop(0, 'rgba(255,236,190,0.95)'); glow.addColorStop(0.12, 'rgba(255,214,150,0.55)'); glow.addColorStop(0.45, 'rgba(150,160,255,0.12)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, G, G);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9000; i++) {
      const arm = i % 2, u = r();
      const rad = 0.06 + Math.pow(u, 0.7) * 0.9;
      const th = arm * Math.PI + Math.log(rad / 0.06) * 2.3 + (r() - 0.5) * (0.55 - rad * 0.25);
      const x = G / 2 + Math.cos(th) * rad * G * 0.48, y = G / 2 + Math.sin(th) * rad * G * 0.48;
      const warm = rad < 0.22;
      g.fillStyle = warm ? `rgba(255,220,170,${0.25 + r() * 0.3})` : r() < 0.08 ? `rgba(255,140,170,${0.3 + r() * 0.3})` : `rgba(170,190,255,${0.15 + r() * 0.35})`;
      const s = r() < 0.03 ? 2.2 : 1.1;
      g.fillRect(x, y, s, s);
    }
    this.galaxy = gc;
    // A field of background stars, and the cosmic web: knots joined to their nearest neighbours.
    this.field = Array.from({ length: 260 }, () => ({ x: r(), y: r(), b: 0.3 + r() * 0.7 }));
    const n = 64;
    for (let i = 0; i < n; i++) {
      const cl = r() < 0.6;
      const x = cl ? (r() - 0.5) * 0.9 + (i % 3 - 1) * 0.35 : (r() - 0.5) * 2.2, y = cl ? (r() - 0.5) * 0.7 + ((i >> 2) % 3 - 1) * 0.3 : (r() - 0.5) * 1.6;
      this.nodes.push({ x, y, m: 0.4 + r() * 0.6, at: r(), spiral: r() < 0.45, rot: r() * Math.PI * 2 });
    }
    for (let i = 0; i < n; i++) {
      const near = this.nodes.map((p, j) => ({ j, d: Math.hypot(p.x - this.nodes[i].x, p.y - this.nodes[i].y) })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d).slice(0, 3);
      for (const o of near) if (o.j > i || !near.some(() => false)) this.edges.push([i, o.j]);
    }
    // Home: the knot nearest the middle becomes the Milky Way.
    this.home = this.nodes.map((p, i) => ({ i, d: Math.hypot(p.x - 0.05, p.y + 0.02) })).sort((a, b) => a.d - b.d)[0].i;
    this.nodes[this.home].spiral = true;
    this.nodes[this.home].m = 1;
    // Particles of the first minutes: positions and a kind (0–2 quarks, 3 proton, 4 neutron, 5 helium).
    this.parts = Array.from({ length: 180 }, () => ({ x: r() * 2 - 1, y: r() * 2 - 1, k: Math.floor(r() * 6), ph: r() * Math.PI * 2 }));
  }

  // ---- Drawing ---------------------------------------------------------------------------------------------------

  private size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (w !== this.w || h !== this.h || dpr !== this.dpr) {
      this.w = w; this.h = h; this.dpr = dpr;
      this.el.width = Math.round(w * dpr); this.el.height = Math.round(h * dpr);
    }
  }

  private draw(now: number) {
    this.size();
    const { ctx, w, h } = this;
    if (!w || !h || !this.noise) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#03030a';
    ctx.fillRect(0, 0, w, h);
    this.spots = [];
    const t = this.t;
    const lt = t > 0 ? Math.log10(t) : -50;
    const top = Math.min(this.inset.top, h * 0.45), bottom = Math.min(this.inset.bottom, h * 0.45);
    const cx = w / 2, cy = top + (h - top - bottom) / 2;
    // The stage: wide things (the disc, the web) may use the width even when the height is short.
    const R = Math.max(60, Math.min(w * 0.45, (h - top - bottom) * 0.6));
    const live = this.still ? 0 : now;
    const S = { cx, cy, R, w, h, lt, t, live };

    if (t < 2e6) this.drawFire(S);
    if (lt > 5.45 && lt < 7.6) this.drawOldestLight(S);
    if (t > 6e5 && t < T.nebulaFull) this.drawWeb(S);
    if (t >= T.zoomFrom && t < T.discEnd) this.drawMilkyWay(S);
    if (t >= T.nebulaFrom && t < T.closeUp + 2e6) this.drawNebulaAndDisc(S);
    if (t >= T.closeUp - 1e6) this.drawEarthAndMoon(S);
    // The spot the story points at pulses.
    if (this.focus) {
      const s = this.spots.find((x) => x.id === this.focus);
      if (s && s.r < R * 0.9) {
        const k = 0.5 + 0.5 * Math.sin(now / 300);
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.45 * k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r + 8 + k * 6, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }

  private label(text: string | null, x: number, y: number, align: CanvasTextAlign = 'center') {
    if (!text) return;
    const { ctx } = this;
    ctx.save();
    ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(3,3,10,0.85)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = 'rgba(240,244,255,0.95)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private spot(id: string, x: number, y: number, r: number) { if (this.has(id)) this.spots.push({ id, x, y, r }); }

  /** The Big Bang, then the glowing fog of the first 380,000 years with its particles. */
  private drawFire(S: { cx: number; cy: number; R: number; w: number; h: number; lt: number; t: number; live: number }) {
    const { ctx, w, h } = this;
    const { cx, cy, R, lt, t, live } = S;
    if (t <= 0) {
      // The very moment: a point of light.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 40);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,250,230,0.9)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.fill();
      this.spot('big-bang', cx, cy, 40);
      this.label(this.name('big-bang'), cx, cy + 60);
      return;
    }
    // The fog clears as the first atoms form (380,000 years: log 5.58), showing the oldest light.
    const fog = 1 - ramp(lt, 5.5, 5.6);
    if (fog <= 0) return;
    const colour = heatColour(Math.log10(Math.max(1, spaceTemp(t))));
    // Inflation: the fog bursts out from the point and fills everything.
    const reach = lerp(8, Math.hypot(w, h), ramp(lt, -39.5, -35.5));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
    g.addColorStop(0, rgba(colour, fog)); g.addColorStop(0.8, rgba(colour, fog * 0.92)); g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // The fog boils.
    ctx.save();
    ctx.globalAlpha = fog * 0.42;
    ctx.globalCompositeOperation = 'multiply';
    const k = 3 * Math.max(w, h) / 256, ox = (live * 0.012) % 256, oy = (live * 0.007) % 256;
    for (let x = -1; x < Math.ceil(w / (256 * k)) + 1; x++) for (let y = -1; y < Math.ceil(h / (256 * k)) + 1; y++) ctx.drawImage(this.noise!, (x * 256 - ox) * k, (y * 256 - oy) * k, 256 * k, 256 * k);
    ctx.restore();
    // Particles: quarks, then protons and neutrons, then some joined into helium nuclei.
    const pa = ramp(lt, -16, -14) * (1 - ramp(lt, 4.5, 5.6)) * fog;
    if (pa > 0.02) {
      ctx.save();
      const quarks = lt < -12.5, helium = lt >= -5.3;
      for (const [i, p] of this.parts.entries()) {
        const jig = live / 400 + p.ph;
        const x = cx + p.x * R * 1.4 + Math.cos(jig) * 3, y = cy + p.y * R * 1.1 + Math.sin(jig * 1.3) * 3;
        if (quarks) {
          ctx.fillStyle = rgba([[255, 70, 70], [70, 200, 90], [80, 120, 255]][p.k % 3] as [number, number, number], pa * 0.9);
          ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
        } else if (helium && i % 12 === 0) {
          for (const [dx, dy, c] of [[-2.2, -2.2, 0], [2.2, -2.2, 1], [-2.2, 2.2, 1], [2.2, 2.2, 0]] as const) {
            ctx.fillStyle = rgba(c ? [150, 150, 160] : [235, 80, 60], pa); ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.4, 0, Math.PI * 2); ctx.fill();
          }
        } else {
          ctx.fillStyle = rgba(p.k % 2 ? [150, 150, 160] : [235, 80, 60], pa * 0.85);
          ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }
    // The whole fog is the thing to tap: what is happening now.
    const now = lt < -35.5 ? 'inflation' : lt < -7 ? 'first-protons' : lt < 3 ? 'first-nuclei' : 'first-atoms';
    this.spot(now, cx, cy, R);
  }

  /** The oldest light, set free when the first atoms formed: an oval like the Planck map, fading into the dark. */
  private drawOldestLight(S: { cx: number; cy: number; R: number; lt: number }) {
    const { ctx } = this;
    const a = ramp(S.lt, 5.52, 5.6) * (1 - ramp(S.lt, 6.7, 7.5));
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.ellipse(S.cx, S.cy, S.R * 1.05, S.R * 0.54, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(this.cmb!, S.cx - S.R * 1.05, S.cy - S.R * 0.54, S.R * 2.1, S.R * 1.08);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = a * 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(S.cx, S.cy, S.R * 1.05, S.R * 0.54, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    this.spot('first-atoms', S.cx, S.cy, S.R * 0.6);
    if (a > 0.5) this.label(this.name('first-atoms'), S.cx, S.cy + S.R * 0.54 + 18);
  }

  /** Where a knot of the cosmic web is on screen, with the camera zooming into the home knot (the Milky Way). */
  private nodeAt(i: number, S: { cx: number; cy: number; R: number; t: number }, zoom: number): [number, number] {
    const p = this.nodes[i], hp = this.nodes[this.home];
    const k = S.R * 1.05 * (1 + zoom * 30);
    return [S.cx + (p.x - hp.x * zoom) * k - hp.x * (1 - zoom) * 0, S.cy + (p.y - hp.y * zoom) * k];
  }

  /** The dark ages, the cosmic web, the first stars and their supernovae, galaxies growing into spirals. */
  private drawWeb(S: { cx: number; cy: number; R: number; w: number; h: number; lt: number; t: number; live: number }) {
    const { ctx } = this;
    const { t, lt, live } = S;
    const zoom = ramp(t, T.zoomFrom, T.zoomTo);
    const fade = 1 - ramp(t, T.zoomFrom + (T.zoomTo - T.zoomFrom) * 0.4, T.zoomTo);
    if (fade <= 0.01) return;
    // Faint background stars once galaxies are about.
    const fieldA = ramp(t, T.galaxiesOn, T.spirals) * fade;
    if (fieldA > 0.02) for (const s of this.field) { ctx.fillStyle = `rgba(220,225,255,${s.b * 0.5 * fieldA})`; ctx.fillRect(s.x * S.w, s.y * S.h, 1.2, 1.2); }
    // The web of dark matter (and the gas along it) gathering in the dark.
    const webA = ramp(lt, 6.6, 8.1) * fade;
    ctx.save();
    ctx.strokeStyle = `rgba(120,100,190,${0.32 * webA})`;
    ctx.lineWidth = 1.2 + zoom * 6;
    ctx.beginPath();
    for (const [a, b] of this.edges) { const p = this.nodeAt(a, S, zoom), q = this.nodeAt(b, S, zoom); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
    ctx.restore();
    if (t < T.atoms) return;
    if (lt < 8) this.spot('dark-ages', S.cx, S.cy, S.R);
    // The first stars light up along the web, knot after knot, then galaxies grow where they were.
    const lit = (i: number) => t > lerp(T.starsOn, T.starsAll, this.nodes[i].at);
    const gal = ramp(t, T.galaxiesOn, T.spirals);
    let firstStar: [number, number] | null = null, firstGalaxy: [number, number] | null = null;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.nodes.length; i++) {
      if (!lit(i)) continue;
      const n = this.nodes[i];
      const [x, y] = this.nodeAt(i, S, zoom);
      if (x < -60 || y < -60 || x > S.w + 60 || y > S.h + 60) continue;
      if (i === this.home && zoom > 0.05) continue;
      const big = 1.6 + n.m * 2.2 + gal * n.m * 4.5 * (1 + zoom * 6);
      if (gal > 0.05 && n.spiral && t > T.spirals) {
        ctx.save();
        ctx.globalAlpha = fade * Math.min(1, gal * 1.4);
        ctx.translate(x, y); ctx.rotate(n.rot + live * 0.00004);
        ctx.drawImage(this.galaxy!, -big * 1.6, -big * 0.9, big * 3.2, big * 1.8);
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(x, y, 0, x, y, big * 1.7);
        const blue = gal < 0.3;
        g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
        g.addColorStop(0.3, blue ? `rgba(150,180,255,${0.55 * fade})` : `rgba(255,225,190,${0.4 * fade})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, big * 1.7, 0, Math.PI * 2); ctx.fill();
      }
      const d = Math.hypot(x - S.cx, y - S.cy);
      if (!firstStar || d < Math.hypot(firstStar[0] - S.cx, firstStar[1] - S.cy)) firstStar = [x, y];
      if (gal > 0.1 && (!firstGalaxy || d < Math.hypot(firstGalaxy[0] - S.cx, firstGalaxy[1] - S.cy))) firstGalaxy = [x, y];
    }
    // Supernovae: now and then one of the first giant stars explodes.
    if (t > T.starsOn && t < T.spirals && live) {
      if (!this.flashes.length || live - this.flashes[this.flashes.length - 1].t0 > 900) {
        const on = this.nodes.map((_, i) => i).filter(lit);
        if (on.length) this.flashes.push({ i: on[Math.floor(Math.random() * on.length)], t0: live });
      }
      this.flashes = this.flashes.filter((f) => live - f.t0 < 1200);
      for (const f of this.flashes) {
        const [x, y] = this.nodeAt(f.i, S, zoom), k = (live - f.t0) / 1200;
        ctx.strokeStyle = `rgba(255,240,220,${(1 - k) * 0.8 * fade})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 4 + k * 26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${(1 - k) * fade})`; ctx.beginPath(); ctx.arc(x, y, 3 + (1 - k) * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
    if (firstStar && gal < 0.1) { this.spot('first-stars', firstStar[0], firstStar[1], 18); this.label(this.name('first-stars'), firstStar[0], firstStar[1] - 26); }
    if (firstGalaxy && gal >= 0.1 && zoom < 0.2) { this.spot('first-galaxies', firstGalaxy[0], firstGalaxy[1], 24); if (t < T.spirals) this.label(this.name('first-galaxies'), firstGalaxy[0], firstGalaxy[1] - 30); }
  }

  /** The Milky Way: zoomed into from the web, turning, with the place the Sun will form; then the zoom into it. */
  private drawMilkyWay(S: { cx: number; cy: number; R: number; w: number; h: number; t: number; live: number }) {
    const { ctx } = this;
    const { t, live } = S;
    const zoom = ramp(t, T.zoomFrom, T.zoomTo);
    const [hx, hy] = this.nodeAt(this.home, S, zoom);
    const size = lerp(S.R * 0.12, S.R * 2.1, smooth(zoom));
    // Into the Sun's neighbourhood: the galaxy grows past the screen and fades.
    const into = ramp(t, T.nebulaFrom, T.nebulaFull);
    const x = lerp(hx, S.cx, zoom), y = lerp(hy, S.cy, zoom);
    // It turns: about once every 230 million years (slowed down), and gently while you watch.
    const ang = -(t / 2.3e8) * Math.PI * 2 * 0.08 - live * 0.00003;
    const sunR = 0.55 * size / 2;
    const sx = x + Math.cos(-0.75) * sunR, sy = y + Math.sin(-0.75) * sunR * 0.55;
    const grow = 1 + into * 9, gx = lerp(x, x - (sx - x) * 9, into), gy = lerp(y, y - (sy - y) * 9, into);
    ctx.save();
    ctx.globalAlpha = Math.min(1, zoom * 2) * (1 - into);
    ctx.translate(gx, gy); ctx.scale(1, 0.55); ctx.rotate(ang);
    ctx.drawImage(this.galaxy!, -size * grow / 2, -size * grow / 2, size * grow, size * grow);
    ctx.restore();
    if (zoom > 0.6 && into < 0.2) {
      this.spot('milky-way-forms', x, y, size * 0.25);
      this.label(this.name('milky-way-forms'), x, y - size * 0.32);
      if (t > T.sunHere) {
        ctx.save();
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,230,120,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        this.label(this.name('sun-here'), sx + 14, sy, 'left');
      }
    }
  }

  /** A cloud collapses into the Sun; the disc of dust around it; the planets growing in it. */
  private drawNebulaAndDisc(S: { cx: number; cy: number; R: number; w: number; h: number; t: number; live: number }) {
    const { ctx } = this;
    const { cx, cy, R, t, live } = S;
    const cloudIn = ramp(t, T.nebulaFrom, T.nebulaFull), squeeze = ramp(t, T.nebulaFull, T.collapse);
    const cloudA = cloudIn * (1 - ramp(t, T.sun, sinceBang(4566)));
    const close = 1 - ramp(t, T.closeUp - 1e6, T.closeUp + 1e6);
    if (cloudA > 0.01) {
      // The cloud: dusty and red-brown, shrinking and flattening as it collapses.
      const cr = lerp(R * 1.8, R * 0.55, squeeze);
      ctx.save();
      ctx.globalAlpha = cloudA * 0.85;
      ctx.translate(cx, cy); ctx.scale(1, lerp(1, 0.45, squeeze)); ctx.rotate(live * 0.00002 + squeeze * 2);
      ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.clip();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, cr);
      g.addColorStop(0, 'rgba(255,170,110,0.9)'); g.addColorStop(0.4, 'rgba(160,70,60,0.75)'); g.addColorStop(1, 'rgba(60,20,40,0)');
      ctx.fillStyle = g; ctx.fillRect(-cr, -cr, cr * 2, cr * 2);
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(this.noise!, -cr, -cr, cr * 2, cr * 2);
      ctx.restore();
      // A nearby star explodes; its shock wave sweeps through the cloud (a trigger many think likely).
      const sn = ramp(t, sinceBang(4590), sinceBang(4572));
      if (sn > 0 && sn < 1) {
        const ox = cx - R * 1.4, oy = cy - R * 0.4;
        ctx.save();
        ctx.strokeStyle = `rgba(255,230,200,${(1 - sn) * 0.7})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(ox, oy, sn * R * 2.2, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      this.spot('solar-nebula', cx, cy, cr * 0.6);
      if (t < T.collapse) this.label(this.name('solar-nebula'), cx, cy - cr * 0.55);
    }
    if (t < T.collapse - 3e5) return;
    // The Sun lights up, with a flash when it starts to shine.
    const sunA = ramp(t, T.collapse, T.sun) * close;
    const flash = Math.max(0, 1 - Math.abs(t - T.sun) / 4e5);
    const sr = R * (0.07 + flash * 0.1) * (1 - 0.5 * (1 - close));
    // The disc of dust, thinning as the planets sweep it up.
    const discA = ramp(t, T.collapse, T.sun + 3e5) * (1 - ramp(t, sinceBang(4555), T.discEnd) * 0.65) * close;
    if (discA > 0.01) {
      ctx.save();
      ctx.translate(cx, cy); ctx.scale(1, 0.34);
      const g = ctx.createRadialGradient(0, 0, sr, 0, 0, R * 1.05);
      g.addColorStop(0, `rgba(255,210,150,${0.7 * discA})`); g.addColorStop(0.35, `rgba(200,130,80,${0.45 * discA})`); g.addColorStop(1, 'rgba(80,40,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.05, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (const gap of [0.31, 0.47, 0.63]) { ctx.strokeStyle = `rgba(0,0,0,${0.35 * discA})`; ctx.lineWidth = R * 0.025; ctx.beginPath(); ctx.arc(0, 0, R * gap, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      this.spot('first-solids', cx + R * 0.8, cy, R * 0.2);
    }
    if (sunA > 0.01) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr * 3.5);
      g.addColorStop(0, `rgba(255,255,240,${sunA})`); g.addColorStop(0.3, `rgba(255,220,120,${sunA})`); g.addColorStop(1, 'rgba(255,160,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, sr * 3.5, 0, Math.PI * 2); ctx.fill();
      this.spot('sun-forms', cx, cy, Math.max(16, sr * 1.2));
      this.label(this.name('sun-forms'), cx, cy - sr * 3.5 - 8);
    }
    // The planets: each grows from dust, going round (faster nearer the Sun).
    const ma = maOfT(t);
    for (const p of PLANETS) {
      const grown = ramp(-ma, -p.from, -p.from + (p.id === 'earth' ? 20 : p.id === 'jupiter' ? 1.5 : 4));
      if (grown <= 0 || close <= 0.01) continue;
      const ang = -(t / 1e5) * Math.pow(p.a, -1.5) * 0.004 - live * 0.00025 * Math.pow(p.a, -1.5) + p.a * 9;
      const x = cx + Math.cos(ang) * R * p.a, y = cy + Math.sin(ang) * R * p.a * 0.34;
      const r = p.r * (R / 160) * (0.35 + 0.65 * grown);
      ctx.save();
      ctx.globalAlpha = close;
      if (p.ring) { ctx.strokeStyle = 'rgba(232,210,158,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, r * 2, r * 0.7, -0.3, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, r), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (p.id === 'jupiter') { this.spot('jupiter-forms', x, y, Math.max(12, r * 1.6)); this.label(this.name('jupiter'), x, y - r - 12); }
      if (p.id === 'earth' && ma <= EARTH_MA + 12) { this.spot('earth-forms', x, y, 14); this.label(this.name('earth'), x, y - r - 12); }
    }
  }

  /** The young Earth, glowing; Theia comes in and hits it; the debris rings it; the Moon gathers. */
  private drawEarthAndMoon(S: { cx: number; cy: number; R: number; w: number; h: number; t: number; live: number }) {
    const { ctx } = this;
    const { cx, cy, R, t, live } = S;
    const a = ramp(t, T.closeUp - 1e6, T.closeUp + 1e6);
    if (a <= 0.01) return;
    const er = R * 0.42;
    const ex = cx + R * 0.15, ey = cy + R * 0.05;
    const hit = Math.max(0, 1 - Math.abs(t - T.impact) / 1.2e6);
    ctx.save();
    ctx.globalAlpha = a;
    // The Earth: molten, with a dark skin breaking up over it.
    const g = ctx.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
    g.addColorStop(0, '#ffd27a'); g.addColorStop(0.45, '#ff7a2a'); g.addColorStop(1, '#8a1d0a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = a * 0.55;
    ctx.globalCompositeOperation = 'multiply';
    const off = (live * 0.004) % (er * 2);
    ctx.drawImage(this.noise!, ex - er * 2 + off, ey - er, er * 2, er * 2);
    ctx.drawImage(this.noise!, ex + off, ey - er, er * 2, er * 2);
    ctx.restore();
    this.spot('earth-forms', ex, ey, er * 0.8);
    if (t < T.theiaFrom) this.label(this.name('earth'), ex, ey - er - 16);
    // Theia, about the size of Mars, closes in.
    const tr = er * 0.53;
    if (t >= T.theiaFrom && t < T.impact + 2e5) {
      const f = smooth(ramp(t, T.theiaFrom, T.impact));
      const tx = lerp(ex - R * 1.9, ex - er * 0.95, f), ty = lerp(ey - R * 1.1, ey - er * 0.55, f);
      const tg = ctx.createRadialGradient(tx - tr * 0.3, ty - tr * 0.3, tr * 0.1, tx, ty, tr);
      tg.addColorStop(0, '#d9c2a0'); tg.addColorStop(1, '#5a4a3a');
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
      this.spot('theia-impact', tx, ty, tr);
      this.label(this.name('theia'), tx, ty - tr - 14);
    }
    // The blow: a flash, then a ring of molten debris round the Earth.
    if (hit > 0) {
      const fg = ctx.createRadialGradient(ex - er * 0.8, ey - er * 0.5, 0, ex - er * 0.8, ey - er * 0.5, er * 2.2 * hit + 1);
      fg.addColorStop(0, `rgba(255,255,240,${hit})`); fg.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(ex - er * 0.8, ey - er * 0.5, er * 2.2 * hit + 1, 0, Math.PI * 2); ctx.fill();
    }
    const ring = ramp(t, T.impact, T.impact + 1.5e6) * (1 - ramp(t, T.moon, T.end));
    if (ring > 0.01) {
      ctx.save();
      for (const [i, p] of this.parts.entries()) {
        const ang = p.ph + (t / 2e5) * 0.3 + live * 0.0004 * (1 + (i % 3) * 0.2);
        const rr = er * (1.35 + (p.x + 1) * 0.35);
        const x = ex + Math.cos(ang) * rr, y = ey + Math.sin(ang) * rr * 0.28;
        ctx.fillStyle = `rgba(255,${150 + (i % 5) * 15},90,${ring * 0.85})`;
        ctx.fillRect(x, y, 2, 2);
      }
      ctx.restore();
      this.spot('theia-impact', ex, ey + er * 0.2, er * 1.6);
    }
    // The Moon gathers from the ring, close and huge in the young Earth's sky.
    const moon = ramp(t, T.moon - 1.5e6, T.end);
    if (moon > 0.01) {
      const mr = er * 0.27 * (0.4 + 0.6 * moon);
      // Off to the side of the Earth, close and huge in its sky, drifting slowly round.
      const ang = -0.45 + (t - T.moon) / 2.5e7;
      const mx = ex + Math.cos(ang) * er * 2.05, my = ey + Math.sin(ang) * er * 0.35;
      const mg = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
      mg.addColorStop(0, `rgba(255,190,120,${moon})`); mg.addColorStop(1, `rgba(120,60,40,${moon})`);
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
      this.spot('theia-impact', mx, my, Math.max(14, mr * 1.3));
      if (moon > 0.5) this.label(this.name('moon'), mx, my - mr - 14);
    }
    ctx.restore();
  }
}
