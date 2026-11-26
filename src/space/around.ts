// Around the globe (v0.49.0): the solar system to explore by tapping. Beside the Earth, the Moon where it really is
// now (lit by the Sun as it is) and the Sun in its direction: tap the Moon to go there, the Sun for the solar system.
// Around a planet, its moons on their orbits (tap one to go there) and Saturn's rings; behind a moon, its planet to
// scale, to see how much bigger it is (tap it to go there). Things behind the globe are drawn on the background
// (the renderer's underlays), things in front over the map.
import { julian, type V3 } from '../sky/astro';
import * as A from '../sky/tonight-astro';
import { loadTex, drawDisc, renderWorld, type Tex } from '../sky/tonight-draw';
import { WORLDS, worldById, tr, L } from './worlds';
import { thumbUrl, type Space } from './space';
import type { App } from '../app/app';
import type { Shell } from '../ui/shell';
import type { RenderCtx } from '../layers/types';

type G = { w: number; h: number; cx: number; cy: number; R: number; lon: number; lat: number; top: number; bottom: number };
interface Spot { id: string; x: number; y: number; r: number; hole?: number; go: () => void }
interface Thing { id: string; x: number; y: number; z: number; r: number; label: string; draw: (ctx: CanvasRenderingContext2D) => void; go: () => void }

const EARTH_KM = 6371;
// The moons' orbits: period (days; Triton goes round backwards), a starting angle, and their distance in their
// planet's radii (for the order only: they are drawn much closer, to fit on the screen).
const ORBIT: Record<string, { P: number; u0: number; a: number }> = {
  io: { P: 1.769138, u0: 163.8, a: 5.9 }, europa: { P: 3.551181, u0: 358.4, a: 9.4 }, ganymede: { P: 7.154553, u0: 5.7, a: 15 }, callisto: { P: 16.689018, u0: 224.8, a: 26.4 },
  enceladus: { P: 1.370218, u0: 300, a: 3.95 }, titan: { P: 15.945421, u0: 120, a: 20.3 }, triton: { P: -5.876854, u0: 40, a: 14.3 }, charon: { P: 6.38723, u0: 210, a: 16.5 },
};
// Saturn's rings in its radii, and how much light they stop: C, B, the Cassini Division, A.
const RINGS: [number, number, string][] = [[1.24, 1.53, 'rgba(170,152,124,0.28)'], [1.53, 1.95, 'rgba(226,208,170,0.92)'], [1.95, 2.03, 'rgba(90,80,64,0.18)'], [2.03, 2.27, 'rgba(208,190,154,0.72)']];

const unit = (lon: number, lat: number): V3 => { const a = (lon * Math.PI) / 180, b = (lat * Math.PI) / 180; return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)]; };
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class Around {
  private spots: Spot[] = [];
  private things: Thing[] = [];
  private g: G | null = null;
  private thumbs = new Map<string, HTMLImageElement>();
  private tex = new Map<string, Tex | null>();
  private parentCache: { key: string; canvas: HTMLCanvasElement } | null = null;
  private moonCanvas = document.createElement('canvas');
  private moonKey = '';
  /** Off during a game, a quiz, a tour, ambient mode or Tonight's sky (set by the features). */
  enabled: () => boolean = () => true;
  /** For the smoke test: what is drawn and where. */
  info = { world: '' as string, sun: null as null | { x: number; y: number }, moon: null as null | { x: number; y: number; z: number }, moons: [] as { id: string; x: number; y: number }[], parent: null as null | { id: string; x: number; y: number; r: number }, rings: 0, frames: 0 };

  constructor(private app: App, private shell: Shell, private space: Space) {
    app.renderer.underlays.add((bg, g) => this.behind(bg, g));
    app.renderer.overlays.add((rc) => this.front(rc));
    shell.tapHandlers.unshift((x, y) => this.tap(x, y));
    // The moons' pictures and the maps for the Moon and the planets behind moons, when first needed.
    app.on('world', () => this.app.renderer.requestRender());
  }

  /** The world on the globe now: the Earth, another world, or none (a story, a game, a flat map). */
  private world(): string | null {
    if (!this.enabled()) return null;
    if (!this.app.mode) return 'earth';
    if (this.app.mode === 'world') return this.space.surface.id ?? null;
    return null;
  }

  private thumb(id: string): HTMLImageElement | null {
    let im = this.thumbs.get(id);
    if (!im) {
      im = new Image();
      im.onload = () => this.app.renderer.requestRender();
      im.src = thumbUrl(id);
      this.thumbs.set(id, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  private texture(id: string, zonal = false): Tex | null {
    if (!this.tex.has(id)) {
      this.tex.set(id, null);
      void loadTex(id, zonal).then((t) => { this.tex.set(id, t); this.parentCache = null; this.app.renderer.requestRender(); });
    }
    return this.tex.get(id) ?? null;
  }

  // ---- layout -----------------------------------------------------------------------------------------------------

  /** Screen position of a point given in the world's own frame, in its radii: x, y and toward us (z > 0 in front). */
  private screen(g: G, q: V3): { x: number; y: number; z: number } {
    const lo = (g.lon * Math.PI) / 180, la = (g.lat * Math.PI) / 180;
    const c: V3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
    const e: V3 = [-Math.sin(lo), Math.cos(lo), 0];
    const n: V3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
    return { x: g.cx + g.R * dot(q, e), y: g.cy - g.R * dot(q, n), z: dot(q, c) };
  }

  /** Pulls a point toward the globe's centre until it (and `r` around it) is on the screen, but never onto the globe. */
  private fit(g: G, x: number, y: number, r: number): [number, number] | null {
    const dx = x - g.cx, dy = y - g.cy, L = Math.hypot(dx, dy);
    if (L < 1) return [x, y];
    const ux = dx / L, uy = dy / L;
    const pad = r + 6;
    const roomX = ux > 0 ? (g.w - pad - g.cx) / ux : ux < 0 ? (pad - g.cx) / ux : Infinity;
    const roomY = uy > 0 ? (g.bottom - pad - g.cy) / uy : uy < 0 ? (g.top + pad - g.cy) / uy : Infinity;
    const room = Math.min(roomX, roomY);
    if (L <= room) return [x, y];
    if (room < g.R * 0.7) return null; // zoomed in: no room on the screen
    return [g.cx + ux * room, g.cy + uy * room];
  }

  /** Moves a point out from the globe along its own direction (or `fx`, `fy` when it is right in front or behind)
   *  until it clears the globe's edge and fits on the screen; on a narrow phone it swings up or down to find room. */
  private beside(g: G, x: number, y: number, r: number, fx: number, fy: number): [number, number] | null {
    let dx = x - g.cx, dy = y - g.cy, len = Math.hypot(dx, dy);
    if (len < g.R * 0.08) { dx = fx; dy = fy; len = Math.hypot(dx, dy); }
    const base = Math.atan2(dy, dx), want = Math.max(len, g.R + r + 10);
    for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
      const a = base + (step * 15 * Math.PI) / 180;
      const f = this.fit(g, g.cx + Math.cos(a) * want, g.cy + Math.sin(a) * want, r);
      if (f && Math.hypot(f[0] - g.cx, f[1] - g.cy) >= g.R + r * 0.6) return f;
    }
    return null;
  }

  private layout(g: G) {
    const id = this.world();
    this.things = []; this.spots = [];
    Object.assign(this.info, { world: id ?? '', sun: null, moon: null, moons: [], parent: null });
    if (!id) return;
    const jd = julian(new Date());
    if (id === 'earth') this.earth(g, jd);
    const w = worldById(id);
    // A planet's moons: on their orbits when there is room (a wide screen), else in an arc above the planet.
    const moons = WORLDS.filter((m) => m.parent === id && ORBIT[m.id]);
    if (moons.length && w) {
      const order = [...moons].sort((a, b) => ORBIT[a.id].a - ORBIT[b.id].a);
      const start = id === 'saturn' ? 2.45 : 1.38;
      const rs = order.map((m) => Math.max(5, g.R * (m.radius / w.radius)));
      const at = order.map((m, i) => {
        const o = ORBIT[m.id];
        const k = start + 0.3 * i + (m.radius / w.radius) * 1.1;
        const u = ((o.u0 + (360 * (jd - 2451545)) / o.P) % 360) * (Math.PI / 180);
        const p = this.screen(g, [k * Math.cos(u), k * Math.sin(u), 0]);
        const f = this.fit(g, p.x, p.y, rs[i]);
        // Not pulled in more than a little, and clear of the planet.
        return f && Math.hypot(f[0] - p.x, f[1] - p.y) < g.R * 0.25 && (p.z > 0 || Math.hypot(f[0] - g.cx, f[1] - g.cy) > g.R + rs[i]) ? { x: f[0], y: f[1], z: p.z } : null;
      });
      const ok = at.every((a, i) => a && at.every((b, j) => j <= i || (b && Math.hypot(a.x - b.x, a.y - b.y) > rs[i] + rs[j] + 34)));
      const pos = ok ? at as { x: number; y: number; z: number }[] : (() => {
        const rr = Math.max(...rs), n = order.length;
        const rad = g.R * (id === 'saturn' ? 1.12 : 1) + rr + 34;
        const above = g.cy - rad - rr - 6 > g.top;
        const span = Math.min(Math.PI * 0.75, (n - 1) * 0.45);
        return order.map((_, i) => {
          const a = (above ? -Math.PI / 2 : Math.PI / 2) + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span) * (above ? 1 : -1);
          return { x: g.cx + Math.cos(a) * rad, y: g.cy + Math.sin(a) * rad, z: 1 };
        });
      })();
      order.forEach((m, i) => {
        const { x, y, z } = pos[i], r = rs[i];
        this.things.push({ id: m.id, x, y, z, r, label: tr(m.name), go: () => void this.space.enter(m.id),
          draw: (ctx) => { const im = this.thumb(m.id); if (im) ctx.drawImage(im, x - r, y - r, 2 * r, 2 * r); else { ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); } } });
        this.info.moons.push({ id: m.id, x, y });
      });
      this.orbits = ok;
    }
    // A moon's planet, to scale, behind it.
    if (w && w.kind === 'moon') {
      const pid = w.parent;
      const pr = pid === 'earth' ? EARTH_KM : worldById(pid)?.radius;
      if (pr) {
        const ratio = pr / w.radius;
        // Toward the screen's top right corner, its near edge a little beyond the moon. A giant planet is flattened
        // (and Saturn seen a little from above): its outline is an ellipse, nearer in that direction.
        const ux = g.w - g.cx, uy = g.top - g.cy, len = Math.hypot(ux, uy) || 1;
        const b = pid === 'saturn' ? 0.914 : pid === 'jupiter' ? 0.935 : 1;
        const along = 1 / Math.sqrt((ux / len) ** 2 + (uy / len) ** 2 / (b * b));
        const D = (ratio * along + 1.15) * g.R;
        const x = g.cx + (ux / len) * D, y = g.cy + (uy / len) * D, r = ratio * g.R;
        const name = pid === 'earth' ? L('The Earth', 'La Tierra') : tr(worldById(pid)!.name);
        this.info.parent = { id: pid, x, y, r };
        this.spots.push({ id: pid, x, y, r, hole: g.R, go: () => (pid === 'earth' ? void this.space.exit() : void this.space.enter(pid)) });
        // Its name where it shows, with how much bigger it is.
        const ex = g.cx + (ux / len) * (1.15 * g.R + 40), ey = g.cy + (uy / len) * (1.15 * g.R + 40);
        const k = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
        const lines = [name, L('{0} times as wide as {1}', '{0} veces más ancho que {1}', k.toLocaleString(), w.id === 'moon' ? L('the Moon', 'la Luna') : tr(w.name))];
        this.parentLabel = { x: ex, y: Math.max(g.top + 30, Math.min(g.bottom - 30, ey)), lines };
      }
    } else this.parentLabel = null;
    for (const t of this.things) this.spots.push({ id: t.id, x: t.x, y: t.y, r: Math.max(t.r, 16), go: t.go });
    // The small ones first: a tap on a moon in front of its planet goes to the moon.
    this.spots.sort((a, b) => a.r - b.r);
  }
  private parentLabel: { x: number; y: number; lines: string[] } | null = null;
  /** The moons are on their orbits (else in an arc: no orbit lines). */
  private orbits = false;

  /** Beside the Earth: the Moon where it is now, lit as it is, and the Sun the way its light comes from. */
  private earth(g: G, jd: number) {
    const m = A.moonGeo(jd), sun = A.sunDir(jd).dir;
    const [mlon, mlat] = A.subPoint(jd, m), [slon, slat] = A.subPoint(jd, sun);
    const mq = unit(mlon, mlat), sq = unit(slon, slat);
    // The Moon: about a quarter of the Earth's width, drawn closer than it is (60 Earth radii) to fit.
    const mr = g.R * (1737.4 / EARTH_KM);
    const p = this.screen(g, [mq[0] * 1.62, mq[1] * 1.62, mq[2] * 1.62]);
    const at = this.beside(g, p.x, p.y, mr, -0.9, -1);
    if (at) {
      const [x, y] = at;
      const tex = this.texture('moon');
      const lo = (g.lon * Math.PI) / 180, la = (g.lat * Math.PI) / 180;
      const c: V3 = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
      const n: V3 = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
      // The near side faces the Earth.
      const X: V3 = [-mq[0], -mq[1], -mq[2]];
      const pk = X[2];
      const pole0: V3 = [-pk * X[0], -pk * X[1], 1 - pk * X[2]];
      const pl = Math.hypot(...pole0) || 1;
      const pole: V3 = [pole0[0] / pl, pole0[1] / pl, pole0[2] / pl];
      const Y: V3 = [pole[1] * X[2] - pole[2] * X[1], pole[2] * X[0] - pole[0] * X[2], pole[0] * X[1] - pole[1] * X[0]];
      const size = Math.max(8, Math.round(mr * 2 + 2));
      this.things.push({ id: 'moon', x, y, z: p.z, r: mr, label: L('The Moon', 'La Luna'), go: () => void this.space.enter('moon'),
        draw: (ctx) => {
          // Drawn again only when the view turns or zooms enough to show (a drag redraws the map every frame).
          const key = `${Math.round(g.lon * 2)},${Math.round(g.lat * 2)},${size},${tex ? 1 : 0},${Math.round(jd * 288)}`;
          if (key !== this.moonKey) {
            this.moonKey = key;
            drawDisc(this.moonCanvas, size, size, { dir: [-c[0], -c[1], -c[2]], up: n, sunward: sq, axes: { pole, X, Y }, tex, color: [170, 170, 165], earthshine: 0.2 }, (2 * mr) / size);
          }
          ctx.drawImage(this.moonCanvas, x - size / 2, y - size / 2, size, size);
        } });
      this.info.moon = { x, y, z: p.z };
    }
    // The Sun: the way its light comes from, near the edge of the screen.
    const ps = this.screen(g, sq);
    let ux = ps.x - g.cx, uy = ps.y - g.cy;
    let len = Math.hypot(ux, uy);
    if (len < g.R * 0.2) { ux = -1; uy = -1.4; len = Math.hypot(ux, uy); }
    const far = this.fit(g, g.cx + (ux / len) * g.R * 2.6, g.cy + (uy / len) * g.R * 2.6, 22);
    if (far) {
      const [x, y] = far;
      this.things.push({ id: 'sun', x, y, z: -1, r: 14, label: L('The Sun', 'El Sol'), go: () => this.space.openOrrery?.(),
        draw: (ctx) => {
          const gl = ctx.createRadialGradient(x, y, 0, x, y, 46);
          gl.addColorStop(0, 'rgba(255,250,225,1)'); gl.addColorStop(0.22, 'rgba(255,226,140,0.95)'); gl.addColorStop(0.5, 'rgba(255,190,80,0.28)'); gl.addColorStop(1, 'rgba(255,170,60,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fffbea'; ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill();
        } });
      this.info.sun = { x, y };
    }
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------

  private behind(bg: CanvasRenderingContext2D, g: G) {
    this.g = g;
    this.layout(g);
    const id = this.info.world;
    if (!id) return;
    // A moon's planet, to scale.
    const par = this.info.parent;
    if (par) this.drawParent(bg, g, par);
    // Orbits, faint.
    const w = worldById(id);
    if (w && this.info.moons.length && this.orbits) {
      const s = Math.abs(Math.sin((g.lat * Math.PI) / 180));
      bg.strokeStyle = 'rgba(200,215,255,0.16)'; bg.lineWidth = 1;
      for (const t of this.things) {
        const d = Math.hypot(t.x - g.cx, (t.y - g.cy) / Math.max(0.05, s));
        bg.beginPath(); bg.ellipse(g.cx, g.cy, d, Math.max(0.5, d * s), 0, 0, Math.PI * 2); bg.stroke();
      }
    }
    if (id === 'saturn') this.rings(bg, g, false);
    for (const t of this.things) if (t.z <= 0) { t.draw(bg); this.label(bg, t); }
  }

  private front(rc: RenderCtx) {
    const g = this.g;
    if (!g || !this.info.world || rc.view.current.kind !== 'globe' || rc.view.morphing) return;
    const ctx = rc.ctx;
    if (this.info.world === 'saturn') this.rings(ctx, g, true);
    for (const t of this.things) if (t.z > 0) { t.draw(ctx); this.label(ctx, t); }
    if (this.parentLabel) {
      const { y, lines } = this.parentLabel;
      ctx.font = '500 11px system-ui, sans-serif';
      const half = Math.max(...lines.map((l) => ctx.measureText(l).width)) / 2 + 8;
      const x = Math.max(half, Math.min(g.w - half, this.parentLabel.x));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 13px system-ui, sans-serif'; this.text(ctx, lines[0], x, y - 9);
      ctx.font = '500 11px system-ui, sans-serif'; this.text(ctx, lines[1], x, y + 8);
    }
    this.info.frames++;
  }

  private label(ctx: CanvasRenderingContext2D, t: Thing) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.font = '600 11px system-ui, sans-serif';
    this.text(ctx, t.label, t.x, t.y + Math.max(t.r, 10) + 4);
  }
  private text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number) {
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,6,18,0.85)'; ctx.strokeText(s, x, y);
    ctx.fillStyle = 'rgba(238,242,252,0.95)'; ctx.fillText(s, x, y);
  }

  /** Saturn's rings around its globe: the far half behind it, the near half in front. */
  private rings(ctx: CanvasRenderingContext2D, g: G, near: boolean) {
    const sl = Math.sin((g.lat * Math.PI) / 180), s = Math.max(0.004, Math.abs(sl));
    ctx.save();
    ctx.beginPath();
    // Seen from above the north side, the near half is below the centre.
    const below = (sl >= 0) === near;
    if (below) ctx.rect(0, g.cy, g.w, g.h - g.cy); else ctx.rect(0, 0, g.w, g.cy);
    ctx.clip();
    for (const [a, b, col] of RINGS) {
      ctx.beginPath();
      ctx.ellipse(g.cx, g.cy, b * g.R, b * g.R * s, 0, 0, Math.PI * 2);
      ctx.ellipse(g.cx, g.cy, a * g.R, a * g.R * s, 0, Math.PI * 2, 0, true);
      ctx.fillStyle = col; ctx.fill('evenodd');
    }
    ctx.restore();
    if (near) this.info.rings++;
  }

  /** The planet behind its moon, to scale (a giant shows as a wall of cloud bands at the screen's corner). */
  private drawParent(bg: CanvasRenderingContext2D, g: G, par: { id: string; x: number; y: number; r: number }) {
    const zonal = par.id === 'jupiter' || par.id === 'saturn';
    const tex = this.texture(par.id, zonal);
    const key = `${par.id}|${Math.round(g.R)}|${Math.round(g.w)}|${Math.round(g.h)}|${Math.round(g.cy)}|${tex ? 1 : 0}`;
    if (this.parentCache?.key !== key) {
      const c = this.parentCache?.canvas ?? document.createElement('canvas');
      // Half the screen's pixels on phones: it is behind, and big.
      const k = Math.min(1.5, (devicePixelRatio || 1)) * (g.w < 700 ? 0.75 : 1);
      c.width = Math.max(1, Math.round(g.w * k)); c.height = Math.max(1, Math.round(g.h * k));
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(c.width, c.height);
      // Seen from the side its moon goes round, lit from the upper left, its north up; Saturn with its rings open.
      const dir: V3 = [-1, 0, 0];
      const pole: V3 = par.id === 'saturn' ? [0.34, 0, 0.94] : [0, 0, 1];
      const X: V3 = [1, 0, 0];
      const pl = dot(pole, X); const Xp: V3 = [X[0] - pl * pole[0], X[1] - pl * pole[1], X[2] - pl * pole[2]];
      const xl = Math.hypot(...Xp); const Xn: V3 = [Xp[0] / xl, Xp[1] / xl, Xp[2] / xl];
      const Y: V3 = [pole[1] * Xn[2] - pole[2] * Xn[1], pole[2] * Xn[0] - pole[0] * Xn[2], pole[0] * Xn[1] - pole[1] * Xn[0]];
      renderWorld(img, par.x * k, par.y * k, par.r * k, {
        dir, up: [0, 0, 1], sunward: this.light(g, par), axes: { pole, X: Xn, Y }, tex,
        color: par.id === 'earth' ? [70, 120, 200] : [200, 190, 170], flat: par.id === 'saturn' ? 0.098 : par.id === 'jupiter' ? 0.065 : 0,
        rings: par.id === 'saturn', limb: zonal ? 0.4 : 0.15, earthshine: 0.03,
      });
      ctx.putImageData(img, 0, 0);
      this.parentCache = { key, canvas: c };
    }
    bg.drawImage(this.parentCache.canvas, 0, 0, g.w, g.h);
  }

  /** Lit on the side toward its moon (the part that shows), and a little from the front. */
  private light(g: G, par: { x: number; y: number }): V3 {
    const dx = g.cx - par.x, dy = g.cy - par.y, l = Math.hypot(dx, dy) || 1;
    // The picture's right is +y, its up +z, toward us +x.
    const v: V3 = [0.55, (dx / l) * 0.8, (-dy / l) * 0.8];
    const n = Math.hypot(...v);
    return [v[0] / n, v[1] / n, v[2] / n];
  }

  // ---- taps ---------------------------------------------------------------------------------------------------------

  private tap(x: number, y: number): boolean {
    const g = this.g;
    if (!g || !this.world()) return false;
    for (const s of this.spots) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d > s.r) continue;
      // A planet behind its moon: not through the moon itself.
      if (s.hole && Math.hypot(x - g.cx, y - g.cy) < s.hole) continue;
      this.shell.card.hide();
      s.go();
      return true;
    }
    return false;
  }
}
