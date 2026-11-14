// 3D terrain: the area on screen as a WebGL landscape on the curved Earth, from the same heights as the detailed
// relief (Terrain Tiles), draped with satellite pictures (Sentinel-2 cloudless) or with the relief or elevation
// colours. A slider raises the mountains and deepens the valleys. Drag to turn, pinch or scroll to zoom.
import { X } from 'lucide';
import { h, icon, clear } from './dom';
import { tiles, TERRAIN, SENTINEL, mayDownload, prefs, tileRange, lonToX, latToY, type TileSource, type Want } from '../engine/tiles';
import { ELEVATION, RELIEF } from '../layers/imagery';
import { terrainActions } from '../layers/terrainActions';
import { lang } from '../app/i18n';
import type { App } from '../app/app';
import type { Shell } from './shell';
import type { TerrainUI } from './terrain';

const es = () => lang() === 'es';
const L = (en: string, sp: string) => (es() ? sp : en);
const R = 6371; // km
const RAD = Math.PI / 180;
type Drape = 'satellite' | 'relief' | 'elevation';

const VS = `#version 300 es
in vec3 a_pos;
in vec3 a_nrm;
in vec2 a_merc;
uniform mat4 u_mvp;
uniform vec3 u_cam;
uniform vec4 u_tr;   // the drape's tiles: x0, y0, nx, ny at zoom u_tn = 2^z
uniform float u_tn;
out vec3 v_nrm;
out vec2 v_uv;
out float v_dist;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_nrm = a_nrm;
  vec2 t = a_merc * u_tn;
  v_uv = vec2(mod(t.x - u_tr.x, u_tn) / u_tr.z, (t.y - u_tr.y) / u_tr.w);
  v_dist = distance(a_pos, u_cam);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 v_nrm;
in vec2 v_uv;
in float v_dist;
uniform sampler2D u_tex;
uniform vec3 u_light;
uniform float u_fog;
uniform vec3 u_sky;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  float d = max(dot(normalize(v_nrm), u_light), 0.0);
  vec3 lit = c * (0.42 + 0.72 * d);
  float f = 1.0 - exp(-v_dist / u_fog);
  o = vec4(mix(lit, u_sky, clamp(f, 0.0, 0.85)), 1.0);
}`;

// ---- small matrix helpers (column-major, as WebGL wants) ----
type M4 = Float32Array;
function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function lookAt(e: number[], t: number[], up: number[]): M4 {
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(e, t)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}

/** A height palette as a function: colour of a height (sea below 10 m). */
function paletteFn(stops: [number, string][]) {
  const rgb = stops.map(([v, c]) => [v, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
  return (hgt: number): [number, number, number] => {
    const v = hgt > -10 ? Math.max(0, hgt) : hgt;
    let i = 0;
    while (i < rgb.length - 2 && rgb[i + 1][0] < v) i++;
    const a = rgb[i], b = rgb[i + 1];
    const t = Math.max(0, Math.min(1, (v - a[0]) / Math.max(1e-6, b[0] - a[0])));
    return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  };
}

/** The largest zoom (up to the source's) at which a box takes at most `lim` × `lim` tiles. */
function zoomFor(box: [number, number, number, number], src: TileSource, lim: number) {
  let z = src.maxZoom;
  for (; z > 0; z--) { const r = tileRange(box, z); if (r.nx <= lim && r.ny <= lim) break; }
  return z;
}
const listOf = (box: [number, number, number, number], src: TileSource, z: number): Want[] => {
  const r = tileRange(box, z);
  const out: Want[] = [];
  for (let j = 0; j < r.ny; j++) for (let i = 0; i < r.nx; i++) out.push({ src, z, x: (r.x0 + i) % r.n, y: r.y0 + j });
  return out;
};

export class Terrain3D {
  private el: HTMLElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private raf = 0;
  /** For tests: what the view holds. */
  info = { tiles: 0, heights: 0, k: 1, maxK: 1, drape: 'relief' as Drape, ready: false, frames: 0, top: 0 };

  constructor(private app: App, private shell: Shell, private ui: TerrainUI) {
    terrainActions.view3d = () => void this.open();
  }

  get isOpen() { return !!this.el; }

  async open() {
    if (this.el) return;
    const v = this.app.renderer.view;
    const full = this.ui.screenBox();
    if (!full) { this.shell.toast(L('Turn the map so that land is on screen.', 'Gira el mapa para que se vea tierra.')); return; }
    this.shell.sheet.close();
    // The area: what is on screen, at most 1,500 km each way from the centre.
    const lon0 = v.lon, lat0 = Math.max(-80, Math.min(80, v.lat));
    const [fw, fs, fe, fn] = full;
    const spanLon = ((fe - fw + 360) % 360) || 360;
    const maxDeg = 1500 / 111;
    const halfLat = Math.min((fn - fs) / 2, maxDeg), halfLon = Math.min(spanLon / 2, maxDeg / Math.cos(lat0 * RAD));
    const box: [number, number, number, number] = [((lon0 - halfLon + 540) % 360) - 180, Math.max(-84, lat0 - halfLat), ((lon0 + halfLon + 540) % 360) - 180, Math.min(84, lat0 + halfLat)];
    const halfKm = Math.max(halfLat * 111, halfLon * 111 * Math.cos(lat0 * RAD));
    const name = this.ui.areaName(box);

    // ---- the overlay
    const canvas = h('canvas', { class: 't3d-canvas' }) as HTMLCanvasElement;
    const status = h('div', { class: 't3d-status' }, L('Loading the heights…', 'Cargando las alturas…'));
    const close = h('button', { type: 'button', class: 'icon-btn t3d-close', 'aria-label': L('Close the 3D view', 'Cerrar la vista 3D') }, icon(X, 20));
    close.addEventListener('click', () => this.close());
    const kLabel = h('span', { class: 't3d-k' });
    const slider = h('input', { type: 'range', class: 't3d-slider', min: '1', max: '10', step: '0.1', 'aria-label': L('Height exaggeration', 'Exageración del relieve') }) as HTMLInputElement;
    const drapes = h('div', { class: 'chip-row t3d-drapes' });
    const labels = h('div', { class: 't3d-labels' });
    const el = h('div', { class: 't3d', role: 'dialog', 'aria-label': L('3D terrain', 'Relieve en 3D') }, canvas, labels,
      h('div', { class: 't3d-head glass' }, h('strong', null, `⛰️ ${L('3D terrain', 'Relieve en 3D')}`), h('span', { class: 't3d-name' }, es() ? name.es : name.en), close),
      h('div', { class: 't3d-foot glass' },
        h('label', { class: 't3d-row' }, h('span', null, L('Raise the mountains', 'Elevar las montañas')), slider, kLabel),
        drapes, status,
        h('div', { class: 'muted small t3d-hint' }, L('Drag to turn · pinch or scroll to zoom · double-tap to start again', 'Arrastra para girar · pellizca o usa la rueda para acercar · toca dos veces para volver al inicio'))));
    this.el = el;
    document.documentElement.classList.add('t3d-open');
    this.app.root.append(el);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.close(); };
    window.addEventListener('keydown', onKey);
    this.cleanup = [() => window.removeEventListener('keydown', onKey)];

    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) { status.textContent = L('This device cannot draw 3D (WebGL 2 is needed).', 'Este dispositivo no puede dibujar en 3D (hace falta WebGL 2).'); return; }
    this.gl = gl;

    // ---- the heights: at most 6 × 6 terrain tiles over the area
    if (!prefs.detail) { status.textContent = L('Turn on detailed terrain in Settings to see the area in 3D.', 'Activa el relieve detallado en Ajustes para ver la zona en 3D.'); return; }
    const zh = zoomFor(box, TERRAIN, 6);
    const hList = listOf(box, TERRAIN, zh);
    const got = await tiles.loadAll(hList, '3d', (n) => { status.textContent = L(`Loading the heights… ${n} of ${hList.length}`, `Cargando las alturas… ${n} de ${hList.length}`); });
    if (this.el !== el) return;
    if (!got) {
      status.textContent = !mayDownload()
        ? L('The heights need a connection (or a saved area); check "Only on Wi-Fi" in Settings.', 'Las alturas necesitan conexión (o una zona guardada); revisa «Solo con wifi» en Ajustes.')
        : L('The heights could not be loaded; try again in a moment.', 'No se pudieron cargar las alturas; vuelve a intentarlo en un momento.');
      return;
    }
    const hr = tileRange(box, zh);
    const HW = hr.nx * 256, HH = hr.ny * 256;
    const heights = new Float32Array(HW * HH);
    const scratch = document.createElement('canvas');
    scratch.width = 256; scratch.height = 256;
    const sctx = scratch.getContext('2d', { willReadFrequently: true })!;
    for (let j = 0; j < hr.ny; j++) for (let i = 0; i < hr.nx; i++) {
      const bmp = tiles.get(TERRAIN, zh, (hr.x0 + i) % hr.n, hr.y0 + j);
      if (!bmp) continue;
      sctx.clearRect(0, 0, 256, 256);
      sctx.drawImage(bmp, 0, 0);
      const d = sctx.getImageData(0, 0, 256, 256).data;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const o = (y * 256 + x) * 4;
        heights[(j * 256 + y) * HW + i * 256 + x] = d[o] * 256 + d[o + 1] + d[o + 2] / 256 - 32768;
      }
    }
    // Height at a place: bilinear between the four nearest height pixels.
    const hAt = (lon: number, lat: number) => {
      const px = ((((lonToX(lon, zh) - hr.x0) % hr.n) + hr.n) % hr.n) * 256 - 0.5;
      const py = (latToY(lat, zh) - hr.y0) * 256 - 0.5;
      const x0 = Math.max(0, Math.min(HW - 2, Math.floor(px))), y0 = Math.max(0, Math.min(HH - 2, Math.floor(py)));
      const fx = Math.max(0, Math.min(1, px - x0)), fy = Math.max(0, Math.min(1, py - y0));
      const a = heights[y0 * HW + x0], b = heights[y0 * HW + x0 + 1], c = heights[(y0 + 1) * HW + x0], d = heights[(y0 + 1) * HW + x0 + 1];
      return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    };

    // ---- the mesh: a (G+1) × (G+1) grid over the area, on the sphere, in km around the centre (x east, y up, z south)
    const G = Math.min(screen.width, screen.height) < 500 ? 160 : 220;
    const N = (G + 1) * (G + 1);
    const hg = new Float32Array(N), unit = new Float64Array(N * 3), merc = new Float32Array(N * 2);
    const [w, s, , nb] = box;
    for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
      const k = j * (G + 1) + i;
      const lon = w + (spanLon >= 360 ? 360 : 2 * halfLon) * (i / G), lat = nb - (nb - s) * (j / G);
      hg[k] = hAt(((lon + 540) % 360) - 180, lat);
      const cl = Math.cos(lat * RAD);
      unit[k * 3] = cl * Math.cos(lon * RAD); unit[k * 3 + 1] = cl * Math.sin(lon * RAD); unit[k * 3 + 2] = Math.sin(lat * RAD);
      merc[k * 2] = (lon + 180) / 360; merc[k * 2 + 1] = latToY(lat, 0);
    }
    const c0 = [Math.cos(lat0 * RAD) * Math.cos(lon0 * RAD), Math.cos(lat0 * RAD) * Math.sin(lon0 * RAD), Math.sin(lat0 * RAD)];
    const E = [-Math.sin(lon0 * RAD), Math.cos(lon0 * RAD), 0];
    const Nn = [-Math.sin(lat0 * RAD) * Math.cos(lon0 * RAD), -Math.sin(lat0 * RAD) * Math.sin(lon0 * RAD), Math.cos(lat0 * RAD)];
    const pos = new Float32Array(N * 3), nrm = new Float32Array(N * 3);
    const build = (kx: number) => {
      for (let k = 0; k < N; k++) {
        const r = R + (hg[k] * kx) / 1000;
        const dx = unit[k * 3] * r - c0[0] * R, dy = unit[k * 3 + 1] * r - c0[1] * R, dz = unit[k * 3 + 2] * r - c0[2] * R;
        pos[k * 3] = dx * E[0] + dy * E[1] + dz * E[2];
        pos[k * 3 + 1] = dx * c0[0] + dy * c0[1] + dz * c0[2];
        pos[k * 3 + 2] = -(dx * Nn[0] + dy * Nn[1] + dz * Nn[2]);
      }
      for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
        const k = j * (G + 1) + i;
        const a = j * (G + 1) + Math.min(G, i + 1), b = j * (G + 1) + Math.max(0, i - 1);
        const c = Math.min(G, j + 1) * (G + 1) + i, d = Math.max(0, j - 1) * (G + 1) + i;
        const ux = pos[a * 3] - pos[b * 3], uy = pos[a * 3 + 1] - pos[b * 3 + 1], uz = pos[a * 3 + 2] - pos[b * 3 + 2];
        const vx = pos[d * 3] - pos[c * 3], vy = pos[d * 3 + 1] - pos[c * 3 + 1], vz = pos[d * 3 + 2] - pos[c * 3 + 2];
        // East × north is up.
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
      }
    };
    const idx = new Uint32Array(G * G * 6);
    let o = 0;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const a = j * (G + 1) + i, b = a + 1, c = a + G + 1, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }

    // ---- GL setup
    const sh = (type: number, src: string) => { const x = gl.createShader(type)!; gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x) ?? 'shader'); return x; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'a_pos'); gl.bindAttribLocation(prog, 1, 'a_nrm'); gl.bindAttribLocation(prog, 2, 'a_merc');
    gl.linkProgram(prog);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = (data: ArrayBufferView, loc: number, size: number, usage: number) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data as BufferSource, usage);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return b;
    };
    // A small area looks right at ×1.5; a mountain range needs more, a continent much more.
    const maxK = Math.max(4, Math.min(25, halfKm / 20));
    let kx = Math.max(1.5, Math.min(10, halfKm / 60));
    build(kx);
    const pbuf = buf(pos, 0, 3, gl.DYNAMIC_DRAW), nbuf = buf(nrm, 1, 3, gl.DYNAMIC_DRAW);
    buf(merc, 2, 2, gl.STATIC_DRAW);
    const ib = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    // ---- the drape: a texture in the tiles' own (Web Mercator) space
    const tex = gl.createTexture()!;
    let drapeRange = { z: zh, x0: hr.x0, y0: hr.y0, nx: hr.nx, ny: hr.ny, n: hr.n };
    const upload = (c: HTMLCanvasElement) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    /** Relief or elevation colours from the heights (the 3D light does the shading). */
    const colourDrape = (d: 'relief' | 'elevation') => {
      const step = Math.max(1, Math.ceil(Math.max(HW, HH) / 2048));
      const c = document.createElement('canvas');
      c.width = Math.ceil(HW / step); c.height = Math.ceil(HH / step);
      const img = c.getContext('2d')!.createImageData(c.width, c.height);
      const pal = paletteFn(d === 'elevation' ? ELEVATION : RELIEF);
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const [r, g, b] = pal(heights[y * step * HW + x * step]);
        const q = (y * c.width + x) * 4;
        img.data[q] = r; img.data[q + 1] = g; img.data[q + 2] = b; img.data[q + 3] = 255;
      }
      c.getContext('2d')!.putImageData(img, 0, 0);
      drapeRange = { z: zh, x0: hr.x0, y0: hr.y0, nx: hr.nx, ny: hr.ny, n: hr.n };
      upload(c);
    };
    let drapeToken = 0;
    const satelliteDrape = async () => {
      const token = ++drapeToken;
      const zs = zoomFor(box, SENTINEL, 8);
      const list = listOf(box, SENTINEL, zs);
      const r = tileRange(box, zs);
      const c = document.createElement('canvas');
      c.width = r.nx * 256; c.height = r.ny * 256;
      const ctx = c.getContext('2d')!;
      // The relief colours first, under the pictures still on their way.
      ctx.fillStyle = '#8fa38f'; ctx.fillRect(0, 0, c.width, c.height);
      const drawn = new Set<string>();
      const paint = () => {
        if (token !== drapeToken) return;
        let any = false;
        for (const t of list) {
          const key = `${t.x}/${t.y}`;
          if (drawn.has(key)) continue;
          const bmp = tiles.get(SENTINEL, zs, t.x, t.y);
          if (!bmp) continue;
          ctx.drawImage(bmp, ((t.x - r.x0 + r.n) % r.n) * 256, (t.y - r.y0) * 256);
          drawn.add(key); any = true;
        }
        if (any) { drapeRange = { z: zs, x0: r.x0, y0: r.y0, nx: r.nx, ny: r.ny, n: r.n }; upload(c); this.info.tiles = drawn.size; dirty(); }
      };
      paint();
      await tiles.loadAll(list, '3d', () => paint());
      paint();
      if (!drawn.size && token === drapeToken) { colourDrape('relief'); dirty(); }
    };
    const setDrape = (d: Drape) => {
      this.info.drape = d;
      clear(drapes);
      for (const [id, label] of [['satellite', L('Satellite', 'Satélite')], ['relief', L('Relief', 'Relieve')], ['elevation', L('Elevation', 'Altitud')]] as [Drape, string][]) {
        const b = h('button', { type: 'button', class: `chip${d === id ? ' on' : ''}`, 'data-drape': id }, label);
        b.addEventListener('click', () => setDrape(id));
        drapes.append(b);
      }
      if (d === 'satellite') void satelliteDrape(); else { drapeToken++; colourDrape(d); }
      dirty();
    };

    // ---- camera: turning around the centre of the area
    let heading = 0, pitch = 35 * RAD;
    const dist0 = halfKm * 2.3;
    let dist = dist0;
    const centreH = () => (hAt(lon0, lat0) * kx) / 1000;
    // City names (the largest in the area).
    const [bw, bs, be, bn] = box;
    const inLon = (lon: number) => (bw <= be ? lon >= bw && lon <= be : lon >= bw || lon <= be);
    const cities = this.app.data.cities.filter((c) => c.lat >= bs && c.lat <= bn && inLon(c.lon)).sort((a, b) => b.pop - a.pop).slice(0, 12)
      .map((c) => ({ el: h('div', { class: 't3d-label' }, es() && c.es ? c.es : c.name), lon: c.lon, lat: c.lat, h: hAt(c.lon, c.lat) }));
    for (const c of cities) labels.append(c.el);
    const local = (lon: number, lat: number, hh: number) => {
      const cl = Math.cos(lat * RAD), r = R + (hh * kx) / 1000;
      const dx = cl * Math.cos(lon * RAD) * r - c0[0] * R, dy = cl * Math.sin(lon * RAD) * r - c0[1] * R, dz = Math.sin(lat * RAD) * r - c0[2] * R;
      return [dx * E[0] + dy * E[1] + dz * E[2], dx * c0[0] + dy * c0[1] + dz * c0[2], -(dx * Nn[0] + dy * Nn[1] + dz * Nn[2])];
    };

    let pending = false;
    const dirty = () => { if (!pending) { pending = true; this.raf = requestAnimationFrame(draw); } };
    const draw = () => {
      pending = false;
      if (!this.el) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const target = [0, centreH(), 0];
      const eye = [target[0] + dist * Math.sin(heading) * Math.cos(pitch), target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(heading) * Math.cos(pitch)];
      const proj = perspective(45 * RAD, W / Math.max(1, H), dist * 0.01, dist * 30);
      const mvp = mul(proj, lookAt(eye, target, [0, 1, 0]));
      gl.useProgram(prog);
      gl.uniformMatrix4fv(U('u_mvp'), false, mvp);
      gl.uniform3f(U('u_cam'), eye[0], eye[1], eye[2]);
      gl.uniform4f(U('u_tr'), drapeRange.x0, drapeRange.y0, drapeRange.nx, drapeRange.ny);
      gl.uniform1f(U('u_tn'), drapeRange.n);
      const ln = Math.hypot(1, 1.3, 1);
      gl.uniform3f(U('u_light'), -1 / ln, 1.3 / ln, -1 / ln);
      gl.uniform1f(U('u_fog'), dist * 3.5);
      gl.uniform3f(U('u_sky'), 0.80, 0.87, 0.93);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U('u_tex'), 0);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      // Labels: each city at its place on the landscape.
      for (const c of cities) {
        const p = local(c.lon, c.lat, c.h);
        const x = mvp[0] * p[0] + mvp[4] * p[1] + mvp[8] * p[2] + mvp[12], y = mvp[1] * p[0] + mvp[5] * p[1] + mvp[9] * p[2] + mvp[13];
        const ww = mvp[3] * p[0] + mvp[7] * p[1] + mvp[11] * p[2] + mvp[15];
        const show = ww > 0 && Math.abs(x / ww) < 1 && Math.abs(y / ww) < 1;
        c.el.hidden = !show;
        if (show) c.el.style.transform = `translate(${((x / ww + 1) / 2) * canvas.clientWidth}px, ${((1 - y / ww) / 2) * canvas.clientHeight}px)`;
      }
      this.info.frames++;
    };
    let top = -Infinity;
    for (const x of hg) if (x > top) top = x;
    this.info = { tiles: 0, heights: got, k: kx, maxK, drape: 'relief', ready: true, frames: 0, top };

    // ---- the slider and the drape
    slider.max = String(Math.round(maxK * 10) / 10);
    slider.value = String(kx);
    const showK = () => { kLabel.textContent = `×${kx.toLocaleString(es() ? 'es-ES' : 'en-GB', { maximumFractionDigits: 1 })}`; };
    showK();
    slider.addEventListener('input', () => {
      kx = Number(slider.value);
      this.info.k = kx;
      build(kx);
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, nbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, nrm);
      showK(); dirty();
    });
    const active = this.app.layers.map((l) => l.def.id);
    setDrape(active.includes('satellite') ? 'satellite' : active.includes('elevation') ? 'elevation' : 'relief');
    status.textContent = '';

    // ---- turning and zooming
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0, dist1 = dist;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist1 = dist; } });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        heading -= (e.clientX - p.x) * 0.006;
        pitch = Math.max(8 * RAD, Math.min(89 * RAD, pitch + (e.clientY - p.y) * 0.005));
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) dist = Math.max(dist0 * 0.08, Math.min(dist0 * 4, (dist1 * pinch0) / Math.max(1, d))); }
      dirty();
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); pinch0 = 0; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.max(dist0 * 0.08, Math.min(dist0 * 4, dist * Math.exp(e.deltaY * 0.0015))); dirty(); }, { passive: false });
    canvas.addEventListener('dblclick', () => { heading = 0; pitch = 35 * RAD; dist = dist0; dirty(); });
    const ro = new ResizeObserver(() => dirty());
    ro.observe(canvas);
    this.cleanup.push(() => ro.disconnect(), () => { gl.deleteTexture(tex); gl.deleteProgram(prog); gl.getExtension('WEBGL_lose_context')?.loseContext(); });
    dirty();
  }

  private cleanup: (() => void)[] = [];

  close() {
    if (!this.el) return;
    cancelAnimationFrame(this.raf);
    for (const f of this.cleanup) { try { f(); } catch { /* gone */ } }
    this.cleanup = [];
    this.el.remove();
    this.el = null;
    this.gl = null;
    this.info.ready = false;
    document.documentElement.classList.remove('t3d-open');
    tiles.want([], '3d');
    this.app.renderer.requestRender();
  }
}
