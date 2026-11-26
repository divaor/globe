// Around the globe (v0.50.0): the solar system, to explore by tapping, once you zoom all the way out. Then the zoom goes
// on past its usual end until the world's whole neighbourhood fits: its moons on their real orbits where they are now,
// for a moon its planet at its real size and distance (so you see how big it is next to it), and the Sun, always, the
// way its light comes from. Everything is in the world's own frame: turn the globe and they turn with it. A planet in
// front of the world you look at turns see-through where it covers it. Tap a moon or a planet to go there, the Sun for
// the solar system. Saturn wears its rings at any zoom. Things behind the globe are drawn on the background (the
// renderer's underlays), things in front over the map.
import { julian, type V3 } from '../sky/astro';
import { loadTex, drawDisc, renderWorld, type Tex } from '../sky/tonight-draw';
import { systemOf, axesOf, BODIES, inFrame, AU_KM, type System } from './system';
import { worldById, tr, L } from './worlds';
import type { Space } from './space';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { fmtNumber } from '../app/i18n';

type G = { w: number; h: number; cx: number; cy: number; R: number; lon: number; lat: number; top: number; bottom: number; zoom: number; fb: number; moving: boolean };
interface Spot { id: string; x: number; y: number; r: number; hole?: number; go: () => void }
interface Shown { id: string; x: number; y: number; z: number; r: number; on: boolean; seeThrough: boolean }

/** The usual end of zooming out; past it the neighbourhood shows. */
const NORMAL_MIN = 0.6;
// Saturn's rings in its radii, and how much light they stop: C, B, the Cassini Division, A.
const RINGS: [number, number, string][] = [[1.24, 1.53, 'rgba(170,152,124,0.28)'], [1.53, 1.95, 'rgba(226,208,170,0.92)'], [1.95, 2.03, 'rgba(90,80,64,0.18)'], [2.03, 2.27, 'rgba(208,190,154,0.72)']];
const GIANT = new Set(['jupiter', 'saturn']);
const DOT: Record<string, string> = { earth: '#7fb3ff', moon: '#d8d6cf', jupiter: '#e8cfa8', saturn: '#ead9a6', neptune: '#7ea6ff', pluto: '#d9c4a8' };
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Around {
  private spots: Spot[] = [];
  private g: G | null = null;
  private sys: System | null = null;
  private alpha = 0;
  private tex = new Map<string, Tex | null>();
  private discs = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
  private big: { key: string; canvas: HTMLCanvasElement } | null = null;
  private wasOn = false;
  /** Off during a game, a quiz, a tour, ambient mode or Tonight's sky (set by the features). */
  enabled: () => boolean = () => true;
  /** For the smoke test: what is drawn and where. */
  info = { world: '' as string, on: false, minZoom: NORMAL_MIN, sun: null as null | { x: number; y: number }, members: [] as Shown[], orbits: 0, rings: 0, frames: 0 };

  constructor(private app: App, private shell: Shell, private space: Space) {
    app.renderer.underlays.add((bg, g) => this.behind(bg, g));
    app.renderer.overlays.add((rc) => this.front(rc));
    shell.tapHandlers.unshift((x, y) => this.tap(x, y));
  }

  /** The world on the globe now: the Earth, another world, or none (a story, a game, a flat map). */
  private world(): string | null {
    if (!this.enabled()) return null;
    if (!this.app.mode) return 'earth';
    if (this.app.mode === 'world') return this.space.surface.id ?? null;
    return null;
  }

  private texture(id: string): Tex | null {
    if (!this.tex.has(id)) {
      this.tex.set(id, null);
      void loadTex(id, GIANT.has(id)).then((t) => { this.tex.set(id, t); this.discs.clear(); this.big = null; this.app.renderer.requestRender(); });
    }
    return this.tex.get(id) ?? null;
  }

  // ---- the camera --------------------------------------------------------------------------------------------------

  /** The camera's axes in the world's frame: toward us, the screen's right, the screen's up. */
  private cam(g: G) {
    const lo = (g.lon * Math.PI) / 180, la = (g.lat * Math.PI) / 180;
    return {
      c: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)] as V3,
      e: [-Math.sin(lo), Math.cos(lo), 0] as V3,
      n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)] as V3,
    };
  }
  /** A point in the world's frame (in its radii) on the screen, and how far toward us (z > 0: in front). */
  private screen(g: G, q: V3) {
    const { c, e, n } = this.cam(g);
    return { x: g.cx + g.R * dot3(q, e), y: g.cy - g.R * dot3(q, n), z: dot3(q, c) };
  }
  /** A direction in the world's frame as a J2000 vector. */
  private toJ2000(v: V3): V3 {
    const a = this.sys!.axes;
    return [0, 1, 2].map((k) => v[0] * a.X[k] + v[1] * a.Y[k] + v[2] * a.pole[k]) as V3;
  }

  // ---- what is shown -----------------------------------------------------------------------------------------------

  /** Works out, each frame, whether the neighbourhood shows and how far the zoom may go out. */
  private update(g: G) {
    const id = this.world();
    const view = this.app.renderer.view;
    this.sys = id ? systemOf(id, julian(new Date())) : null;
    // How far out the zoom may go: until the farthest orbit or planet fits on the screen.
    let min = NORMAL_MIN;
    if (this.sys && (this.sys.members.length || this.sys.orbits.length)) {
      let far = 0;
      for (const m of this.sys.members) far = Math.max(far, Math.hypot(...m.pos) + m.r);
      for (const o of this.sys.orbits) for (const p of o.pts) far = Math.max(far, Math.hypot(...p));
      const room = Math.max(60, Math.min(g.w / 2, (g.bottom - g.top) / 2) - 26);
      min = Math.min(NORMAL_MIN, room / ((far / this.sys.R) * g.fb));
    }
    if (Math.abs(view.minZoom - min) > 1e-9) {
      view.minZoom = min;
      // Out past the usual end with nothing to show any more (a game began): back to it. Not while the camera flies
      // somewhere (going to another world, the flight goes to its own zoom).
      if (view.zoom < min * 0.999 && !view.animating) view.flyTo({ zoom: Math.max(min, Math.min(NORMAL_MIN, view.zoom)) }, 400);
    }
    // It shows once the zoom has gone all the way out (fading in over the last stretch).
    this.alpha = this.sys ? Math.max(0, Math.min(1, (NORMAL_MIN * 1.12 - g.zoom) / (NORMAL_MIN * 0.12))) : 0;
    Object.assign(this.info, { world: id ?? '', on: this.alpha > 0, minZoom: min, sun: null, members: [] });
  }

  private behind(bg: CanvasRenderingContext2D, g: G) {
    this.g = g;
    this.spots = [];
    this.boxes = [];
    this.update(g);
    if (this.info.world === 'saturn') this.rings(bg, g, false);
    if (!this.alpha || !this.sys) { this.wasOn = false; return; }
    bg.globalAlpha = this.alpha;
    this.orbits(bg, g, false);
    this.members(bg, g, false);
    bg.globalAlpha = 1;
  }

  private front(rc: RenderCtx) {
    const g = this.g;
    if (!g || !this.info.world || rc.view.current.kind !== 'globe' || rc.view.morphing) return;
    const ctx = rc.ctx;
    if (this.info.world === 'saturn') this.rings(ctx, g, true);
    if (this.alpha && this.sys) {
      this.ui = this.app.renderer.boxesOf(document.querySelectorAll('.topbar .brand, .topbar .search-btn, .topbar .me-btn, .zoombar, .chips .fchip, .legend'), 12);
      ctx.save();
      ctx.globalAlpha = this.alpha;
      // The Sun first, so the names near it make room for its own.
      this.sun(ctx, g);
      this.orbits(ctx, g, true);
      this.members(ctx, g, true);
      ctx.restore();
      if (!this.wasOn) { this.wasOn = true; this.hint(); }
    }
    this.info.frames++;
  }

  /** The first time the neighbourhood shows: how to see more of it. */
  private hinted = false;
  private hint() {
    if (this.hinted) return;
    this.hinted = true;
    this.shell.toast(L('Keep zooming out to see the moons on their real orbits; tap one to go there.', 'Sigue alejándote para ver las lunas en sus órbitas reales; toca una para ir allí.'), 3200);
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------

  /** The moons' orbits: the stretches behind the globe on the background, the rest over the map. */
  private orbits(ctx: CanvasRenderingContext2D, g: G, near: boolean) {
    const sys = this.sys!;
    ctx.lineWidth = 1.2;
    let n = 0;
    for (const o of sys.orbits) {
      const pts = o.pts.map((p) => this.screen(g, inFrame(sys.axes, p).map((x) => x / sys.R) as V3));
      ctx.strokeStyle = o.id === sys.me ? 'rgba(255,214,120,0.55)' : 'rgba(190,210,255,0.38)';
      ctx.beginPath();
      let pen = false;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        if ((a.z + b.z >= 0) !== near) { pen = false; continue; }
        if (!pen) { ctx.moveTo(a.x, a.y); pen = true; }
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      n++;
    }
    this.info.orbits = n;
  }

  /** The planet and the moons: real size and place; a dot when too small to see; see-through when in front of the
   *  world looked at and over it. */
  private members(ctx: CanvasRenderingContext2D, g: G, near: boolean) {
    const sys = this.sys!;
    for (const m of sys.members) {
      const q = inFrame(sys.axes, m.pos).map((x) => x / sys.R) as V3;
      const p = this.screen(g, q);
      if ((p.z >= 0) !== near) continue;
      const r = (m.r / sys.R) * g.R;
      const over = p.z > 0 && Math.hypot(p.x - g.cx, p.y - g.cy) < g.R + r;
      const on = p.x + r > 0 && p.x - r < g.w && p.y + r > g.top && p.y - r < g.bottom;
      const name = this.name(m.id);
      this.info.members.push({ id: m.id, x: p.x, y: p.y, z: p.z, r, on, seeThrough: over });
      const go = () => (m.id === 'earth' ? void this.space.exit() : void this.space.enter(m.id));
      if (!on) { this.edge(ctx, g, p.x, p.y, name, m.id, go); continue; }
      const a0 = ctx.globalAlpha;
      if (over) ctx.globalAlpha = a0 * 0.32;
      if (r < 3) {
        const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
        gl.addColorStop(0, DOT[m.id] ?? '#cfd3da'); gl.addColorStop(0.3, DOT[m.id] ?? '#cfd3da'); gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, Math.PI * 2); ctx.fill();
      } else if (r <= 280) this.sphere(ctx, g, m.id, p.x, p.y, r);
      else this.giant(ctx, g, m.id, p.x, p.y, r);
      ctx.globalAlpha = a0;
      // See-through, its edge stays: its night side alone would hardly show.
      if (over && r >= 3) { ctx.strokeStyle = 'rgba(214,226,255,0.32)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke(); }
      // The name under it, and for the planet how far it is.
      const far = m.id === BODIES[sys.me].parent ? ` · ${this.km(Math.hypot(...m.pos))}` : '';
      if (r < 140) this.label(ctx, name + far, p.x, Math.min(g.bottom - 10, p.y + Math.max(r, 6) + 5));
      this.spots.push({ id: m.id, x: p.x, y: p.y, r: Math.max(r, 18), hole: r > g.R ? g.R : undefined, go });
    }
  }

  /** A world's disc with its own map, lit by the Sun, turned as it really is (and Saturn's rings). */
  private sphere(ctx: CanvasRenderingContext2D, g: G, id: string, x: number, y: number, r: number) {
    const sat = id === 'saturn';
    const size = Math.ceil(r * (sat ? 2.4 : 1.04) * 2);
    const key = `${Math.round(g.lon)}|${Math.round(g.lat)}|${Math.round(r)}|${this.tex.get(id) ? 1 : 0}`;
    let d = this.discs.get(id);
    if (!d || d.key !== key) {
      const canvas = d?.canvas ?? document.createElement('canvas');
      drawDisc(canvas, size, size, this.view(g, id), (2 * r) / size);
      d = { key, canvas };
      this.discs.set(id, d);
    }
    ctx.drawImage(d.canvas, x - size / 2, y - size / 2, size, size);
  }

  /** A planet too big for a picture of its own (a moon's planet up close): drawn into the screen's pixels, at half
   *  the resolution while the globe moves. */
  private giant(ctx: CanvasRenderingContext2D, g: G, id: string, x: number, y: number, r: number) {
    const k = (g.moving ? 0.4 : 0.75) * Math.min(1.5, devicePixelRatio || 1);
    const key = `${id}|${Math.round(x)}|${Math.round(y)}|${Math.round(r)}|${k}|${Math.round(g.lon * 2)}|${Math.round(g.lat * 2)}|${this.tex.get(id) ? 1 : 0}`;
    if (this.big?.key !== key) {
      const c = this.big?.canvas ?? document.createElement('canvas');
      c.width = Math.max(1, Math.round(g.w * k)); c.height = Math.max(1, Math.round(g.h * k));
      const cx = c.getContext('2d')!;
      const img = cx.createImageData(c.width, c.height);
      renderWorld(img, x * k, y * k, r * k, this.view(g, id));
      cx.putImageData(img, 0, 0);
      this.big = { key, canvas: c };
    }
    ctx.drawImage(this.big.canvas, 0, 0, g.w, g.h);
  }

  /** How a member looks from here: its map and axes, the Sun's side, the camera's way up. */
  private view(g: G, id: string) {
    const { c, n } = this.cam(g);
    const fwd = this.toJ2000([-c[0], -c[1], -c[2]]), up = this.toJ2000(n);
    return {
      dir: fwd, up, sunward: this.sys!.sun, axes: axesOf(id, julian(new Date())), tex: this.texture(id), color: [200, 200, 200] as [number, number, number],
      flat: id === 'saturn' ? 0.098 : id === 'jupiter' ? 0.065 : 0, rings: id === 'saturn', limb: GIANT.has(id) ? 0.4 : 0.1, earthshine: 0.04,
    };
  }

  /** The Sun: always there, the way its light comes from, at the screen's edge. */
  private sun(ctx: CanvasRenderingContext2D, g: G) {
    const sys = this.sys!;
    const q = inFrame(sys.axes, sys.sun);
    const { e, n } = this.cam(g);
    let dx = dot3(q, e), dy = -dot3(q, n);
    if (Math.hypot(dx, dy) < 0.15) { dx = -0.6; dy = -0.8; }
    const at = this.toEdge(g, dx, dy, 30);
    const [x, y] = at;
    const gl = ctx.createRadialGradient(x, y, 0, x, y, 44);
    gl.addColorStop(0, 'rgba(255,250,225,1)'); gl.addColorStop(0.24, 'rgba(255,226,140,0.95)'); gl.addColorStop(0.5, 'rgba(255,190,80,0.28)'); gl.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    this.label(ctx, `${L('The Sun', 'El Sol')} · ${this.km(sys.sunKm)}`, x, Math.min(g.bottom - 10, y + 16));
    this.info.sun = { x, y };
    this.spots.push({ id: 'sun', x, y, r: 26, go: () => this.space.openOrrery?.() });
  }

  /** Something off the screen: an arrow at the edge the way it is, with its name. */
  private edge(ctx: CanvasRenderingContext2D, g: G, px: number, py: number, name: string, id: string, go: () => void) {
    const [x, y] = this.toEdge(g, px - g.cx, py - g.cy, 26);
    const a = Math.atan2(py - g.cy, px - g.cx);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(225,232,250,0.9)';
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    this.label(ctx, name, x, y + 9);
    this.spots.push({ id, x, y, r: 22, go });
  }

  /** The buttons and chips over the map this frame (markers at the edge keep out from under them). */
  private ui: [number, number, number, number][] = [];
  /** The point at the screen's edge (inside `pad`) the way of a direction from the globe's centre, moved in toward the
   *  centre while a button or a chip is over it. */
  private toEdge(g: G, dx: number, dy: number, pad: number): [number, number] {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const tx = ux > 0 ? (g.w - pad - g.cx) / ux : ux < 0 ? (pad - g.cx) / ux : Infinity;
    const ty = uy > 0 ? (g.bottom - pad - g.cy) / uy : uy < 0 ? (g.top + pad + 40 - g.cy) / uy : Infinity;
    let t = Math.min(tx, ty);
    // The marker and its name under it.
    const under = (x: number, y: number) => this.ui.some((b) => x > b[0] && x < b[2] && y + 22 > b[1] && y < b[3]);
    while (t > 0 && under(g.cx + ux * t, g.cy + uy * t)) t -= 6;
    return [g.cx + ux * Math.max(0, t), g.cy + uy * Math.max(0, t)];
  }

  private name(id: string) { return id === 'earth' ? L('The Earth', 'La Tierra') : tr(worldById(id)?.name); }
  private km(v: number) {
    return v >= 1e8 ? L('{0} million km', '{0} millones de km', fmtNumber(Math.round(v / 1e6))) : v >= 1e6 ? L('{0} million km', '{0} millones de km', fmtNumber(v / 1e6, 1)) : L('{0} km', '{0} km', fmtNumber(Math.round(v / 1000) * 1000));
  }
  private boxes: [number, number, number, number][] = [];
  private label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number) {
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textBaseline = 'top';
    const half = ctx.measureText(s).width / 2 + 4;
    const g = this.g!;
    const cx = Math.max(half, Math.min(g.w - half, x));
    // One name per spot: a second one that would overlap goes under it, else is left out.
    let ty = y;
    const hit = (t: number) => this.boxes.some((b) => cx - half < b[2] && cx + half > b[0] && t < b[3] && t + 14 > b[1]);
    if (hit(ty)) { ty = y + 14; if (hit(ty)) return; }
    this.boxes.push([cx - half, ty, cx + half, ty + 14]);
    y = ty;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,6,18,0.85)'; ctx.strokeText(s, cx, y);
    ctx.fillStyle = 'rgba(238,242,252,0.95)'; ctx.fillText(s, cx, y);
  }

  /** Saturn's rings around its globe: the far half behind it, the near half in front. */
  private rings(ctx: CanvasRenderingContext2D, g: G, near: boolean) {
    const sl = Math.sin((g.lat * Math.PI) / 180), sq = Math.max(0.004, Math.abs(sl));
    ctx.save();
    ctx.beginPath();
    // Seen from above the north side, the near half is below the centre.
    const below = (sl >= 0) === near;
    if (below) ctx.rect(0, g.cy, g.w, g.h - g.cy); else ctx.rect(0, 0, g.w, g.cy);
    ctx.clip();
    for (const [a, b, col] of RINGS) {
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, b * g.R, b * g.R * sq, 0, 0, Math.PI * 2);
      ctx.ellipse(g.cx, g.cy, a * g.R, a * g.R * sq, 0, Math.PI * 2, 0, true);
      ctx.fillStyle = col; ctx.fill('evenodd');
    }
    ctx.restore();
    if (near) this.info.rings++;
  }

  // ---- taps --------------------------------------------------------------------------------------------------------

  private tap(x: number, y: number): boolean {
    const g = this.g;
    if (!g || !this.alpha || !this.world()) return false;
    // The small ones first: a moon in front of its planet before the planet.
    for (const s of [...this.spots].sort((a, b) => a.r - b.r)) {
      if (Math.hypot(s.x - x, s.y - y) > s.r) continue;
      // A planet bigger than the world looked at: not through that world's own globe.
      if (s.hole && Math.hypot(x - g.cx, y - g.cy) < s.hole) continue;
      this.shell.card.hide();
      s.go();
      return true;
    }
    return false;
  }
}

export { AU_KM };
