// Around the globe (v0.50.0): the solar system, to explore by tapping, once you zoom all the way out. Then the zoom goes
// on past its usual end until the world's whole neighbourhood fits: its moons on their real orbits where they are now,
// for a moon its planet at its real size and distance (so you see how big it is next to it), and the Sun, always, the
// way its light comes from. Everything is in the world's own frame: turn the globe and they turn with it. A planet in
// front of the world you look at turns see-through where it covers it. Tap a moon or a planet to go there, the Sun for
// the solar system. Saturn wears its rings at any zoom. Things behind the globe are drawn on the background (the
// renderer's underlays), things in front over the map.
//
// v0.51.0: zooming on out shows the world's own orbit round the Sun, with the Sun at its real place (a dot with its name
// when it is small). A button on the zoom controls locks the view: to the orbit (its pole stays up and the camera stays
// put in space while the world turns under it), or following the world's planet or the Sun (which then stay put on the
// screen, so a moon's phases or a planet's seasons go by in front of you). A play bar runs time at a chosen speed.
import { geoRotation } from 'd3-geo';
import { Orbit, Play, Pause, RotateCcw, Check } from 'lucide';
import { julian, type V3 } from '../sky/astro';
import { loadTex, drawDisc, renderWorld, type Tex } from '../sky/tonight-draw';
import { systemOf, axesOf, BODIES, inFrame, helio, sunOrbit, lockFrame, lockCamera, lockAngles, AU_KM, SUN_KM, type System, type Lock } from './system';
import { worldById, tr, L } from './worlds';
import type { Space } from './space';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';
import { fmtNumber, appLocale, Lc } from '../app/i18n';
import { h, icon, clear } from '../ui/dom';

type G = { w: number; h: number; cx: number; cy: number; R: number; lon: number; lat: number; top: number; bottom: number; zoom: number; fb: number; moving: boolean };
interface Spot { id: string; x: number; y: number; r: number; hole?: number; go: () => void }
interface Shown { id: string; x: number; y: number; z: number; r: number; on: boolean; seeThrough: boolean }

/** The usual end of zooming out; past it the neighbourhood shows. */
const NORMAL_MIN = 0.6;
// Saturn's rings in its radii, and how much light they stop: C, B, the Cassini Division, A.
const RINGS: [number, number, string][] = [[1.24, 1.53, 'rgba(170,152,124,0.28)'], [1.53, 1.95, 'rgba(226,208,170,0.92)'], [1.95, 2.03, 'rgba(90,80,64,0.18)'], [2.03, 2.27, 'rgba(208,190,154,0.72)']];
const GIANT = new Set(['jupiter', 'saturn']);
const DOT: Record<string, string> = {
  earth: '#7fb3ff', moon: '#d8d6cf', jupiter: '#e8cfa8', saturn: '#ead9a6', neptune: '#7ea6ff', pluto: '#d9c4a8', io: '#e8d27a', europa: '#e2d6bf',
  ganymede: '#bdb5a8', callisto: '#9a9388', enceladus: '#f2f4f8', titan: '#e3b468', triton: '#d9cbc2', charon: '#b9b2aa',
};
/** How fast time runs while playing (days a second). */
const SPEEDS: { days: number; label: () => string }[] = [
  { days: 1 / 24, label: () => L('1 hour/s', '1 hora/s') },
  { days: 1, label: () => L('1 day/s', '1 día/s') },
  { days: 7, label: () => L('1 week/s', '1 semana/s') },
  { days: 30.44, label: () => L('1 month/s', '1 mes/s') },
  { days: 365.25, label: () => L('1 year/s', '1 año/s') },
  { days: 3652.5, label: () => L('10 years/s', '10 años/s') },
];
// Time runs from 1900 to 2100 (the moons' orbits are fitted to 2024–2030 and drift slowly away from it).
const JD_MIN = 2415020.5, JD_MAX = 2488069.5;
// A locked view, seen from this far above the orbit (degrees); following, the planet or the Sun on the left.
const ORBIT_EL = 35, FOLLOW_EL = 20, FOLLOW_AZ = 90;
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const RAD = Math.PI / 180;
const vec = (p: [number, number]): V3 => [Math.cos(p[1] * RAD) * Math.cos(p[0] * RAD), Math.cos(p[1] * RAD) * Math.sin(p[0] * RAD), Math.sin(p[1] * RAD)];
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export class Around {
  private spots: Spot[] = [];
  private g: G | null = null;
  private sys: System | null = null;
  private alpha = 0;
  private tex = new Map<string, Tex | null>();
  private discs = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
  private big: { key: string; canvas: HTMLCanvasElement } | null = null;
  private wasOn = false;
  /** The camera's axes in the world's frame this frame (toward us, the screen's right, its up; roll included). */
  private camv = { c: [1, 0, 0] as V3, e: [0, 1, 0] as V3, n: [0, 0, 1] as V3 };
  /** Off during a game, a quiz, a tour, ambient mode or Tonight's sky (set by the features). */
  enabled: () => boolean = () => true;
  /** For the smoke test: what is drawn and where. */
  info = {
    world: '' as string, on: false, minZoom: NORMAL_MIN, fitMoons: NORMAL_MIN, sun: null as null | { x: number; y: number; real: boolean; r: number },
    me: null as null | { x: number; y: number }, members: [] as Shown[], orbits: 0, sunOrbit: false, rings: 0, frames: 0,
    lock: 'free' as Lock, az: 0, el: 0, playing: false, jd: 0, speed: 1, night: false,
  };

  // ---- time (v0.51.0): now, or a moment of its own while playing or paused --------------------------------------
  private sim: number | null = null;
  private playing = false;
  private speed = 1;
  private jd(): number { return this.sim ?? julian(new Date()); }

  // ---- the lock (v0.51.0) ----------------------------------------------------------------------------------------
  private lock: Lock = 'free';
  private az = 0;
  private el = ORBIT_EL;
  /** Where the lock last put the camera (a change since then is the reader's drag). */
  private set: { lon: number; lat: number } | null = null;
  /** Easing from where the camera was into a lock (0 → 1). */
  private ease: { from: { lon: number; lat: number; roll: number }; t0: number } | null = null;
  private lockWorld = '';

  constructor(private app: App, private shell: Shell, private space: Space) {
    app.renderer.underlays.add((bg, g) => this.behind(bg, g));
    app.renderer.overlays.add((rc) => this.front(rc));
    shell.tapHandlers.unshift((x, y) => this.tap(x, y));
    app.renderer.view.steer = (flying) => this.steer(flying);
    // The locate button: back to turning freely.
    const reset = app.resetView.bind(app);
    app.resetView = (...a: Parameters<App['resetView']>) => { this.setLock('free'); return reset(...a); };
    this.buildUi();
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

  /** The camera's axes in the world's frame: toward us, the screen's right, the screen's up (with the view's roll). */
  private cam() { return this.camv; }
  private readCam() {
    const rot = geoRotation(this.app.renderer.view.rotate);
    this.camv = { c: vec(rot.invert([0, 0]) as [number, number]), e: vec(rot.invert([90, 0]) as [number, number]), n: vec(rot.invert([0, 90]) as [number, number]) };
  }
  /** A point in the world's frame (in its radii) on the screen, and how far toward us (z > 0: in front). */
  private screen(g: G, q: V3) {
    const { c, e, n } = this.cam();
    return { x: g.cx + g.R * dot3(q, e), y: g.cy - g.R * dot3(q, n), z: dot3(q, c) };
  }
  /** A direction in the world's frame as a J2000 vector. */
  private toJ2000(v: V3): V3 {
    const a = this.sys!.axes;
    return [0, 1, 2].map((k) => v[0] * a.X[k] + v[1] * a.Y[k] + v[2] * a.pole[k]) as V3;
  }

  // ---- the lock --------------------------------------------------------------------------------------------------

  /** Locks the view (or frees it): to the orbit, following the world's planet, or following the Sun. */
  setLock(lock: Lock) {
    const view = this.app.renderer.view;
    const id = this.world();
    if (lock === 'planet' && !(id && BODIES[id]?.parent)) lock = 'orbit';
    if (!id || view.current.kind !== 'globe') lock = 'free';
    this.lock = lock;
    this.set = null;
    if (lock !== 'free' && id) {
      // Into the lock smoothly, from where the camera is now.
      const f = lockFrame(lock, id, this.jd());
      const ax = axesOf(id, this.jd());
      const c = vec([view.lon, view.lat]);
      const cj: V3 = [0, 1, 2].map((k) => c[0] * ax.X[k] + c[1] * ax.Y[k] + c[2] * ax.pole[k]) as V3;
      if (lock === 'orbit') { this.az = lockAngles(f, cj).az; this.el = ORBIT_EL; } else { this.az = FOLLOW_AZ; this.el = FOLLOW_EL; }
      this.ease = { from: { lon: view.lon, lat: view.lat, roll: view.roll }, t0: performance.now() };
      this.lockWorld = id;
    } else if (view.roll) {
      // Free again: the roll eases back to none, frame by frame until it has.
      this.app.renderer.tickers.add(this.unroll);
    }
    this.renderUi();
    this.app.renderer.requestRender();
  }
  private unroll = (dt: number): boolean => {
    const view = this.app.renderer.view;
    if (this.lock !== 'free' || !view.roll) { this.app.renderer.tickers.delete(this.unroll); return false; }
    const k = Math.pow(0.5, dt / 60);
    view.roll = Math.abs(view.roll) < 0.3 ? 0 : view.roll * k;
    return true;
  };

  /** Each update of the view: a locked camera keeps to its frame; a drag turns it round the orbit's pole and up or down. */
  private steer(flying: boolean) {
    const view = this.app.renderer.view;
    const id = this.world();
    if (this.lock !== 'free' && (!id || view.current.kind !== 'globe' || view.morphing)) { this.lock = 'free'; this.set = null; this.ease = null; this.renderUi(); }
    if (this.lock === 'free') {
      if (view.roll && !this.app.renderer.tickers.has(this.unroll)) this.app.renderer.tickers.add(this.unroll);
      return;
    }
    if (id !== this.lockWorld) {
      // Gone to another world: the lock goes along, from the start.
      this.lockWorld = id!;
      if (this.lock === 'planet' && !BODIES[id!]?.parent) this.lock = 'orbit';
      this.az = this.lock === 'orbit' ? 0 : FOLLOW_AZ; this.el = this.lock === 'orbit' ? ORBIT_EL : FOLLOW_EL;
      this.set = null;
      this.renderUi();
    }
    if (this.set && !flying && !this.ease) {
      const dl = wrap(view.lon - this.set.lon), dp = view.lat - this.set.lat;
      if (dl || dp) { this.az = wrap(this.az + dl); this.el = Math.max(-88, Math.min(88, this.el + dp)); }
    }
    const jd = this.jd();
    const { c, u } = lockCamera(lockFrame(this.lock as Exclude<Lock, 'free'>, id!, jd), this.az, this.el);
    const ax = axesOf(id!, jd);
    const cb = inFrame(ax, c), ub = inFrame(ax, u);
    const lon = Math.atan2(cb[1], cb[0]) / RAD, lat = Math.max(-89, Math.min(89, Math.asin(Math.max(-1, Math.min(1, cb[2]))) / RAD));
    const lo = lon * RAD, la = lat * RAD;
    const n0: V3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)], e0: V3 = [-Math.sin(lo), Math.cos(lo), 0];
    // The roll that puts the orbit's pole straight up (d3 turns the screen by +roll).
    const roll = Math.atan2(dot3(ub, e0), dot3(ub, n0)) / RAD;
    let to = { lon, lat, roll };
    if (this.ease) {
      const t = Math.min(1, (performance.now() - this.ease.t0) / 650), k = t * t * (3 - 2 * t), f = this.ease.from;
      to = { lon: wrap(f.lon + wrap(lon - f.lon) * k), lat: f.lat + (lat - f.lat) * k, roll: f.roll + wrap(roll - f.roll) * k };
      if (t >= 1) this.ease = null; else this.app.renderer.requestRender();
    }
    view.lon = to.lon; view.lat = to.lat; view.roll = to.roll;
    this.set = { lon: view.lon, lat: view.lat };
  }

  // ---- playing ---------------------------------------------------------------------------------------------------

  private tick = (dt: number): boolean => {
    if (!this.playing) return false;
    let jd = this.jd() + (SPEEDS[this.speed].days * dt) / 1000;
    if (jd > JD_MAX || jd < JD_MIN) { jd = Math.max(JD_MIN, Math.min(JD_MAX, jd)); this.pause(); }
    this.sim = jd;
    this.renderDate();
    return this.playing;
  };
  play(speed = this.speed) {
    this.speed = Math.max(0, Math.min(SPEEDS.length - 1, speed));
    if (this.sim == null) this.sim = julian(new Date());
    this.playing = true;
    this.app.renderer.tickers.add(this.tick);
    this.app.renderer.requestRender();
    this.renderUi();
  }
  pause() {
    this.playing = false;
    this.app.renderer.tickers.delete(this.tick);
    this.renderUi();
  }
  /** Back to now, live. */
  now() {
    this.pause();
    this.sim = null;
    this.renderUi();
    this.app.renderer.requestRender();
  }

  // ---- what is shown -----------------------------------------------------------------------------------------------

  /** Works out, each frame, whether the neighbourhood shows and how far the zoom may go out. */
  private update(g: G) {
    const id = this.world();
    const view = this.app.renderer.view;
    if (!id) { if (this.playing) this.pause(); if (this.lock !== 'free') this.setLock('free'); }
    const jd = this.jd();
    this.sys = id ? systemOf(id, jd) : null;
    this.readCam();
    // How far out the zoom may go: until the farthest orbit fits on the screen, then (v0.51.0) on until the world's
    // own orbit round the Sun does.
    let min = NORMAL_MIN, fitMoons = NORMAL_MIN;
    if (this.sys) {
      const room = Math.max(60, Math.min(g.w / 2, (g.bottom - g.top) / 2) - 26);
      let far = 0;
      for (const m of this.sys.members) far = Math.max(far, Math.hypot(...m.pos) + m.r);
      for (const o of this.sys.orbits) for (const p of o.pts) far = Math.max(far, Math.hypot(...p));
      if (far) fitMoons = Math.min(NORMAL_MIN, room / ((far / this.sys.R) * g.fb));
      const sunFar = 2.05 * this.sys.sunKm;
      min = Math.min(fitMoons, room / ((sunFar / this.sys.R) * g.fb));
    }
    if (Math.abs(view.minZoom - min) > 1e-12) {
      view.minZoom = min;
      // Out past the usual end with nothing to show any more (a game began): back to it. Not while the camera flies
      // somewhere (going to another world, the flight goes to its own zoom).
      if (view.zoom < min * 0.5 && !view.animating) view.flyTo({ zoom: Math.max(min, Math.min(NORMAL_MIN, view.zoom)) }, 400);
    }
    // It shows once the zoom has gone all the way out (fading in over the last stretch).
    this.alpha = this.sys ? Math.max(0, Math.min(1, (NORMAL_MIN * 1.12 - g.zoom) / (NORMAL_MIN * 0.12))) : 0;
    Object.assign(this.info, { world: id ?? '', on: this.alpha > 0, minZoom: min, fitMoons, sun: null, me: null, members: [], sunOrbit: false, night: false, lock: this.lock, az: this.az, el: this.el, playing: this.playing, jd, speed: this.speed });
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
    this.syncUi();
    if (!g || !this.info.world || rc.view.current.kind !== 'globe' || rc.view.morphing) return;
    const ctx = rc.ctx;
    if (this.info.world === 'saturn') this.rings(ctx, g, true);
    // Locked or playing but zoomed in: the night side still shows.
    if (!this.alpha && this.sys && (this.lock !== 'free' || this.playing)) this.night(ctx, g);
    if (this.alpha && this.sys) {
      this.ui = this.app.renderer.boxesOf(document.querySelectorAll('.topbar .brand, .topbar .search-btn, .topbar .me-btn, .zoombar, .chips .fchip, .legend, .dock, .worldbar, .around-bar:not([hidden]), .around-menu:not([hidden])'), 12);
      ctx.save();
      ctx.globalAlpha = this.alpha;
      this.night(ctx, g);
      // The Sun and the world itself first, so the names near them make room for their own.
      this.sun(ctx, g);
      this.self(ctx, g);
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

  /** The moons' orbits, and (zoomed out past them) the world's own orbit round the Sun: the stretches behind the globe
   *  on the background, the rest over the map. */
  private orbits(ctx: CanvasRenderingContext2D, g: G, near: boolean) {
    const sys = this.sys!;
    const path = (pts: { x: number; y: number; z: number }[]) => {
      ctx.beginPath();
      let pen = false;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        if ((a.z + b.z >= 0) !== near) { pen = false; continue; }
        if (!pen) { ctx.moveTo(a.x, a.y); pen = true; }
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    };
    ctx.lineWidth = 1.2;
    let n = 0;
    for (const o of sys.orbits) {
      ctx.strokeStyle = o.id === sys.me ? 'rgba(255,214,120,0.55)' : 'rgba(190,210,255,0.38)';
      path(o.pts.map((p) => this.screen(g, inFrame(sys.axes, p).map((x) => x / sys.R) as V3)));
      n++;
    }
    this.info.orbits = n;
    // Round the Sun: it fades in once the moons' orbits are all in view (nearer, it would be a line through the globe).
    const k = this.info.fitMoons > 0 ? Math.max(0, Math.min(1, Math.log(this.info.fitMoons / g.zoom) / Math.log(3))) : 0;
    if (k > 0) {
      const here = helio(sys.me, this.jd());
      const a0 = ctx.globalAlpha;
      ctx.globalAlpha = a0 * k;
      ctx.strokeStyle = 'rgba(255,196,110,0.6)';
      path(sunOrbit(sys.me, this.jd()).map((p) => this.screen(g, inFrame(sys.axes, [p[0] - here[0], p[1] - here[1], p[2] - here[2]]).map((x) => x / sys.R) as V3)));
      ctx.globalAlpha = a0;
      this.info.sunOrbit = true;
    }
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

  /** How things look at this moment (to the quarter of an hour). */
  private stamp() { return Math.round(this.jd() * 96); }

  /** A world's disc with its own map, lit by the Sun, turned as it really is (and Saturn's rings). */
  private sphere(ctx: CanvasRenderingContext2D, g: G, id: string, x: number, y: number, r: number) {
    const sat = id === 'saturn';
    const size = Math.ceil(r * (sat ? 2.4 : 1.04) * 2);
    const { c, n } = this.cam();
    const key = `${c.map((v) => v.toFixed(3)).join()}|${n.map((v) => v.toFixed(3)).join()}|${Math.round(r)}|${this.tex.get(id) ? 1 : 0}|${this.stamp()}`;
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
   *  the resolution while the globe moves or time runs. */
  private giant(ctx: CanvasRenderingContext2D, g: G, id: string, x: number, y: number, r: number) {
    const k = (g.moving || this.playing ? 0.4 : 0.75) * Math.min(1.5, devicePixelRatio || 1);
    const { c, n } = this.cam();
    const key = `${id}|${Math.round(x)}|${Math.round(y)}|${Math.round(r)}|${k}|${c.map((v) => v.toFixed(3)).join()}|${n.map((v) => v.toFixed(3)).join()}|${this.tex.get(id) ? 1 : 0}|${this.stamp()}`;
    if (this.big?.key !== key) {
      const cv = this.big?.canvas ?? document.createElement('canvas');
      cv.width = Math.max(1, Math.round(g.w * k)); cv.height = Math.max(1, Math.round(g.h * k));
      const cx = cv.getContext('2d')!;
      const img = cx.createImageData(cv.width, cv.height);
      renderWorld(img, x * k, y * k, r * k, this.view(g, id));
      cx.putImageData(img, 0, 0);
      this.big = { key, canvas: cv };
    }
    ctx.drawImage(this.big.canvas, 0, 0, g.w, g.h);
  }

  /** How a member looks from here: its map and axes, the Sun's side, the camera's way up. */
  private view(g: G, id: string) {
    const { c, n } = this.cam();
    const fwd = this.toJ2000([-c[0], -c[1], -c[2]]), up = this.toJ2000(n);
    return {
      dir: fwd, up, sunward: this.sys!.sun, axes: axesOf(id, this.jd()), tex: this.texture(id), color: [200, 200, 200] as [number, number, number],
      flat: id === 'saturn' ? 0.098 : id === 'jupiter' ? 0.065 : 0, rings: id === 'saturn', limb: GIANT.has(id) ? 0.4 : 0.1, earthshine: 0.04,
    };
  }

  /** The Sun: always there. At its real place when that is on the screen (zoomed far enough out): a disc, or a dot with
   *  its name when it is small; else at the screen's edge the way its light comes from. */
  private sun(ctx: CanvasRenderingContext2D, g: G) {
    const sys = this.sys!;
    const q = inFrame(sys.axes, sys.sun).map((x) => (x * sys.sunKm) / sys.R) as V3;
    const p = this.screen(g, q);
    const r = (SUN_KM / sys.R) * g.R;
    const label = `${L('The Sun', 'El Sol')} · ${this.km(sys.sunKm)}`;
    const go = () => this.space.openOrrery?.();
    const real = p.x + r > 0 && p.x - r < g.w && p.y + r > g.top && p.y - r < g.bottom;
    if (real) {
      // Hidden behind the world looked at (it would take an exact line-up, this far out).
      if (p.z < 0 && Math.hypot(p.x - g.cx, p.y - g.cy) < g.R - r) return;
      const glow = Math.max(12, r * 1.8);
      const gl = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      gl.addColorStop(0, 'rgba(255,250,225,1)'); gl.addColorStop(Math.min(0.9, Math.max(0.2, r / glow)), 'rgba(255,226,140,0.95)'); gl.addColorStop(1, 'rgba(255,170,60,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.x, p.y, glow, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(3.5, r), 0, Math.PI * 2); ctx.fill();
      if (r < 140) this.label(ctx, label, p.x, Math.min(g.bottom - 10, p.y + Math.max(r, 8) + 6));
      this.info.sun = { x: p.x, y: p.y, real: true, r };
      this.spots.push({ id: 'sun', x: p.x, y: p.y, r: Math.max(r, 22), go });
      return;
    }
    let dx = p.x - g.cx, dy = p.y - g.cy;
    if (Math.hypot(dx, dy) < 1e-9) { dx = -0.6; dy = -0.8; }
    const [x, y] = this.toEdge(g, dx, dy, 30);
    const gl = ctx.createRadialGradient(x, y, 0, x, y, 44);
    gl.addColorStop(0, 'rgba(255,250,225,1)'); gl.addColorStop(0.24, 'rgba(255,226,140,0.95)'); gl.addColorStop(0.5, 'rgba(255,190,80,0.28)'); gl.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill();
    this.label(ctx, label, x, Math.min(g.bottom - 10, y + 16));
    this.info.sun = { x, y, real: false, r };
    this.spots.push({ id: 'sun', x, y, r: 26, go });
  }

  /** The night side of the world looked at (v0.51.0): the half turned away from the Sun, darkened, so its day and night,
   *  a moon's phases and a planet's seasons show as time goes by. The line between them is a great circle: on the
   *  screen half the globe's rim and half an ellipse. */
  private night(ctx: CanvasRenderingContext2D, g: G) {
    if (g.R < 3) return;
    const sys = this.sys!;
    const s = inFrame(sys.axes, sys.sun);
    const { c, e, n } = this.cam();
    const sx = dot3(s, e), sy = dot3(s, n), sz = dot3(s, c);
    ctx.save();
    ctx.translate(g.cx, g.cy);
    // Turned so the Sun's way on the screen is +x; the night is on the left.
    ctx.rotate(Math.atan2(-sy, sx));
    ctx.beginPath();
    ctx.arc(0, 0, g.R, Math.PI / 2, (3 * Math.PI) / 2, false);
    ctx.ellipse(0, 0, Math.max(0.01, g.R * Math.abs(sz)), g.R, 0, (3 * Math.PI) / 2, Math.PI / 2, sz > 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(2,6,18,0.58)';
    ctx.fill();
    ctx.restore();
    this.info.night = true;
  }

  /** The world looked at, once zoomed out so far that its globe is a speck: a glow and its name, to find it by. */
  private self(ctx: CanvasRenderingContext2D, g: G) {
    if (g.R >= 5) return;
    const id = this.sys!.me, col = DOT[id] ?? '#cfd3da';
    const gl = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, 10);
    gl.addColorStop(0, col); gl.addColorStop(0.35, col); gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(g.cx, g.cy, 10, 0, Math.PI * 2); ctx.fill();
    this.label(ctx, this.name(id), g.cx, g.cy + 10);
    this.info.me = { x: g.cx, y: g.cy };
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
    // The marker and its name under it (a name is up to about 150 px wide).
    const under = (x: number, y: number) => this.ui.some((b) => x + 60 > b[0] && x - 60 < b[2] && y + 26 > b[1] && y - 12 < b[3]);
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

  /** Saturn's rings around its globe: the far half behind it, the near half in front (turned with the view's roll). */
  private rings(ctx: CanvasRenderingContext2D, g: G, near: boolean) {
    const { c, e, n } = this.cam();
    const sq = Math.max(0.004, Math.abs(c[2]));
    ctx.save();
    ctx.translate(g.cx, g.cy);
    // The rings' long axis lies across the pole's way on the screen.
    ctx.rotate(Math.atan2(e[2], n[2]));
    ctx.beginPath();
    // Seen from above the north side, the near half is below the centre.
    const below = (c[2] >= 0) === near;
    const big = Math.max(g.w, g.h) * 4;
    if (below) ctx.rect(-big, 0, 2 * big, big); else ctx.rect(-big, -big, 2 * big, big);
    ctx.clip();
    for (const [a, b, col] of RINGS) {
      ctx.beginPath();
      ctx.ellipse(0, 0, b * g.R, b * g.R * sq, 0, 0, Math.PI * 2);
      ctx.ellipse(0, 0, a * g.R, a * g.R * sq, 0, Math.PI * 2, 0, true);
      ctx.fillStyle = col; ctx.fill('evenodd');
    }
    ctx.restore();
    if (near) this.info.rings++;
  }

  // ---- the lock button and the play bar ----------------------------------------------------------------------------

  private lockBtn!: HTMLButtonElement;
  private menu!: HTMLElement;
  private bar!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private dateEl!: HTMLElement;
  private speedBtn!: HTMLButtonElement;
  private nowBtn!: HTMLButtonElement;
  private shown = false;

  private buildUi() {
    const zoombar = document.querySelector('.zoombar');
    const root = zoombar?.parentElement ?? document.body;
    this.lockBtn = h('button', { type: 'button', class: 'btn icon-btn around-lock', hidden: true, 'data-around': 'lock', 'aria-haspopup': 'menu', 'aria-label': L('Lock the view', 'Fijar la vista'), title: L('Lock the view', 'Fijar la vista') }, icon(Orbit, 20)) as HTMLButtonElement;
    this.lockBtn.addEventListener('click', () => { this.menu.hidden ? this.openMenu() : this.closeMenu(); });
    zoombar?.append(this.lockBtn);
    this.menu = h('div', { class: 'around-menu glass', hidden: true, role: 'menu', 'data-around': 'menu' });
    document.addEventListener('pointerdown', (e) => { if (!this.menu.hidden && !this.menu.contains(e.target as Node) && !this.lockBtn.contains(e.target as Node)) this.closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.menu.hidden) this.closeMenu(); });

    this.playBtn = h('button', { type: 'button', class: 'tb-play around-play', 'data-around': 'play' }) as HTMLButtonElement;
    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.dateEl = h('span', { class: 'around-date', 'data-around': 'date' });
    this.speedBtn = h('button', { type: 'button', class: 'chip around-speed', 'data-around': 'speed' }) as HTMLButtonElement;
    this.speedBtn.addEventListener('click', () => { this.speed = (this.speed + 1) % SPEEDS.length; if (!this.playing) this.play(); else this.renderUi(); });
    this.nowBtn = h('button', { type: 'button', class: 'chip around-now', 'data-around': 'now' }, icon(RotateCcw, 14), h('span', null, L('Now', 'Ahora'))) as HTMLButtonElement;
    this.nowBtn.addEventListener('click', () => this.now());
    this.bar = h('div', { class: 'around-bar glass', hidden: true, 'data-around': 'bar' }, this.playBtn, h('div', { class: 'around-mid' }, this.dateEl, this.speedBtn), this.nowBtn);
    root.append(this.menu, this.bar);
    this.renderUi();
  }

  private openMenu() {
    const id = this.world();
    if (!id) return;
    clear(this.menu);
    const parent = BODIES[id]?.parent;
    const items: [Lock, string][] = [
      ['free', L('Turn freely', 'Girar libremente')],
      ['orbit', L('Lock to the orbit', 'Fijar a la órbita')],
      ...(parent ? [['planet', parent === 'earth' ? L('Follow the Earth', 'Seguir a la Tierra') : L('Follow {0}', 'Seguir a {0}', this.name(parent))] as [Lock, string]] : []),
      ['sun', L('Follow the Sun', 'Seguir al Sol')],
    ];
    for (const [lock, text] of items) {
      const b = h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(this.lock === lock), class: this.lock === lock ? 'on' : '', 'data-lock': lock },
        h('span', { class: 'around-tick' }, this.lock === lock ? icon(Check, 16) : null), h('span', null, text));
      b.addEventListener('click', () => { this.setLock(lock); this.closeMenu(); });
      this.menu.append(b);
    }
    const r = this.lockBtn.getBoundingClientRect(), pr = (this.menu.parentElement ?? document.body).getBoundingClientRect();
    this.menu.style.right = `${pr.right - r.left + 8}px`;
    this.menu.style.bottom = `${pr.bottom - r.bottom}px`;
    this.menu.hidden = false;
    this.lockBtn.setAttribute('aria-expanded', 'true');
  }
  private closeMenu() { this.menu.hidden = true; this.lockBtn.setAttribute('aria-expanded', 'false'); }

  /** Shows the button and the bar while the neighbourhood shows (or while locked or playing). */
  private syncUi() {
    const show = !!this.world() && this.app.renderer.view.current.kind === 'globe' && (this.alpha > 0 || this.lock !== 'free' || this.playing);
    if (show === this.shown) return;
    this.shown = show;
    this.lockBtn.hidden = !show;
    this.bar.hidden = !show;
    if (!show) this.closeMenu();
  }

  private renderUi() {
    if (!this.playBtn) return;
    clear(this.playBtn);
    this.playBtn.append(icon(this.playing ? Pause : Play, 20));
    this.playBtn.setAttribute('aria-label', this.playing ? L('Pause', 'Pausa') : Lc('to play a recording or an animation', 'Play', 'Reproducir'));
    this.speedBtn.textContent = SPEEDS[this.speed].label();
    this.nowBtn.hidden = this.sim == null;
    this.lockBtn.classList.toggle('on', this.lock !== 'free');
    this.lockBtn.setAttribute('aria-pressed', String(this.lock !== 'free'));
    this.lastDate = '';
    this.renderDate();
  }
  private lastDate = '';
  private renderDate() {
    if (!this.dateEl) return;
    const d = new Date((this.jd() - 2440587.5) * 86400000);
    const withTime = SPEEDS[this.speed].days <= 1 || !this.playing;
    const s = this.sim == null ? L('Now', 'Ahora')
      : d.toLocaleString(appLocale(), withTime ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
    if (s !== this.lastDate) { this.lastDate = s; this.dateEl.textContent = s; }
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
