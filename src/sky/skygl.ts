// The sky drawn by the GPU on an offscreen canvas: ESO's Milky Way panorama (galactic coordinates) behind the stars,
// the stars as points in their colours, and, seen from a place, the daylight or twilight and the ground. The globe's
// backdrop and the sky view both copy this canvas and draw their lines and names on top.
import { type V3, type M3, mmul, transpose, TO_GALACTIC, bvColor, vec } from './astro';
import { dataUrl } from '../data/store';

export interface SkyFrame {
  /** CSS size and pixel ratio of the picture. */
  w: number; h: number; dpr: number;
  /** stereographic (sky view) or gnomonic (a camera's view, behind the globe). */
  proj: 'stereo' | 'gnomonic';
  /** CSS pixels per unit of the projection plane, and the centre. */
  scale: number; cx: number; cy: number;
  /** The view: right, up and forward unit vectors, in equatorial coordinates of date. */
  right: V3; up: V3; fwd: V3;
  /** Precession from J2000 to the date. */
  prec: M3;
  /** Seen from a place: its zenith (equatorial of date), the Sun's direction and altitude (degrees). */
  zenith?: V3 | null; sun?: V3 | null; sunAlt?: number;
  /** Milky Way and star brightness (0..1+), and the faintest magnitude drawn. */
  mw: number; stars: number; magLimit: number;
}

const VS_QUAD = `attribute vec2 aPos; varying vec2 vPx; uniform vec2 uRes;
void main(){ vPx = (aPos * 0.5 + 0.5) * uRes; vPx.y = uRes.y - vPx.y; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS_BG = `#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vPx;
uniform vec2 uCenter; uniform float uScale; uniform int uProj;
uniform mat3 uBasis; uniform mat3 uToGal;
uniform sampler2D uMw; uniform float uMwK;
uniform vec3 uZenith; uniform float uGround; uniform vec3 uSun; uniform float uSunAlt;
vec3 dir(vec2 px){
  vec2 p = (px - uCenter) / uScale; p.y = -p.y;
  if (uProj == 0) { float r2 = dot(p, p); return vec3(4.0 * p.x, 4.0 * p.y, 4.0 - r2) / (4.0 + r2); }
  return normalize(vec3(p, 1.0));
}
void main(){
  vec3 w = uBasis * dir(vPx);
  vec3 g = uToGal * w;
  float l = atan(g.y, g.x), b = asin(clamp(g.z, -1.0, 1.0));
  // u from galactic longitude (increasing to the left; the texture repeats). u1 jumps at l = ±180°, u2 at l = 0: both
  // read the same texels, so take the one that is smooth here (else the mipmap level jumps and draws a seam).
  float u1 = 0.5 - l / 6.2831853;
  float u2 = 0.5 - (l < 0.0 ? l + 6.2831853 : l) / 6.2831853;
  #ifdef GL_OES_standard_derivatives
  float u = fwidth(u1) > fwidth(u2) ? u2 : u1;
  #else
  float u = abs(l) > 1.5707963 ? u2 : u1;
  #endif
  vec2 uv = vec2(u, 0.5 - b / 3.14159265);
  vec3 mw = texture2D(uMw, uv).rgb;
  // A gentle curve: lift the faint glow, keep the dark lanes.
  mw = pow(mw, vec3(0.85)) * uMwK;
  vec3 col = vec3(0.012, 0.016, 0.03) + mw;
  if (uGround > 0.5) {
    float a = dot(w, uZenith);
    float day = smoothstep(-6.0, 4.0, uSunAlt), twi = smoothstep(-18.0, -3.0, uSunAlt) * (1.0 - day);
    float toSun = max(dot(w, uSun), 0.0);
    // Daylight: pale at the horizon, deeper blue overhead, bright around the Sun.
    vec3 dayc = mix(vec3(0.66, 0.80, 0.95), vec3(0.20, 0.44, 0.80), clamp(a * 1.7, 0.0, 1.0)) + vec3(1.0, 0.95, 0.85) * pow(toSun, 48.0) * 0.8;
    // Twilight: orange low on the Sun's side, deep blue above.
    float az = max(dot(normalize(w - uZenith * a), normalize(uSun - uZenith * dot(uSun, uZenith))), 0.0);
    vec3 twic = mix(vec3(0.95, 0.52, 0.28) * (0.35 + 0.65 * az * az), vec3(0.07, 0.11, 0.26), clamp(a * 3.0, 0.0, 1.0));
    col = col * (1.0 - day) * (1.0 - 0.8 * twi) + dayc * day + twic * twi * 0.9;
    if (a < 0.0) {
      vec3 gnd = mix(vec3(0.030, 0.036, 0.030), vec3(0.20, 0.22, 0.16), day + 0.5 * twi);
      col = mix(gnd, gnd * 0.6, clamp(-a * 2.0, 0.0, 1.0));
    }
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const VS_STARS = `attribute vec3 aPos; attribute float aMag; attribute vec3 aCol;
uniform mat3 uView; uniform int uProj; uniform float uScale; uniform vec2 uCenter; uniform vec2 uRes; uniform float uDpr;
uniform float uMagLimit; uniform float uK; uniform vec3 uZenith; uniform float uGround; uniform float uDay;
varying vec4 vCol;
void main(){
  vec3 v = uView * aPos; // x right, y up, z forward (precession folded into uView)
  vec2 p; bool ok = true;
  if (uProj == 0) { ok = v.z > -0.85; p = v.xy * (2.0 / (1.0 + v.z)); }
  else { ok = v.z > 0.05; p = v.xy / v.z; }
  vec2 px = uCenter + vec2(p.x, -p.y) * uScale;
  vec2 clip = (px / uRes) * 2.0 - 1.0; clip.y = -clip.y;
  float m = uMagLimit - aMag;
  float a = clamp(0.18 + m * 0.24, 0.0, 1.0) * uK;
  if (uGround > 0.5) {
    // uZenith is given in the same frame as aPos (J2000), so the horizon is a plain dot product.
    float h = dot(aPos, uZenith);
    if (h < 0.0) ok = false;
    a *= smoothstep(-0.005, 0.12, h) * (1.0 - 0.985 * uDay);
  }
  if (m < 0.0 || !ok || a <= 0.004) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); return; }
  gl_Position = vec4(clip, 0.0, 1.0);
  gl_PointSize = clamp(1.2 + m * 0.62, 1.2, 9.0) * uDpr;
  vCol = vec4(aCol, a);
}`;

const FS_STARS = `precision mediump float; varying vec4 vCol;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float k = smoothstep(1.0, 0.15, d); gl_FragColor = vec4(vCol.rgb, vCol.a * k); }`;

function compile(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram | null {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  if (!v || !f) return null;
  const p = gl.createProgram()!;
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(p)); return null; }
  return p;
}

export interface StarRow { hip: number; ra: number; dec: number; mag: number; bv: number }

export class SkyGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private bg: WebGLProgram; private st: WebGLProgram;
  private quad: WebGLBuffer; private starBuf: WebGLBuffer | null = null; private nStars = 0;
  private tex: WebGLTexture | null = null; private texSize = 0;
  private loading: Promise<void> | null = null;
  /** Called when the Milky Way picture arrives (to redraw). */
  onReady: (() => void) | null = null;
  get ready() { return !!this.tex; }

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, bg: WebGLProgram, st: WebGLProgram) {
    this.canvas = canvas; this.gl = gl; this.bg = bg; this.st = st;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  private static one: SkyGL | null | undefined;
  /** The one sky renderer (null where WebGL is missing). */
  static get(): SkyGL | null {
    if (SkyGL.one !== undefined) return SkyGL.one;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false }) as WebGLRenderingContext | null);
    if (!gl) return (SkyGL.one = null);
    gl.getExtension('OES_standard_derivatives');
    const bg = compile(gl, VS_QUAD, FS_BG), st = compile(gl, VS_STARS, FS_STARS);
    SkyGL.one = bg && st ? new SkyGL(canvas, gl, bg, st) : null;
    return SkyGL.one;
  }

  /** The stars: J2000 positions, magnitudes and colours. */
  setStars(stars: StarRow[]) {
    const gl = this.gl, a = new Float32Array(stars.length * 7);
    stars.forEach((s, i) => { const v = vec(s.ra, s.dec), c = bvColor(s.bv); a.set([v[0], v[1], v[2], s.mag, c[0], c[1], c[2]], i * 7); });
    this.starBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW);
    this.nStars = stars.length;
  }

  /** Loads the Milky Way picture (2k; 4k for a sharp sky view on a big screen). */
  loadMilkyWay(size: 2 | 4 = 2): Promise<void> {
    if (this.texSize >= size) return Promise.resolve();
    if (this.loading) return this.loading.then(() => this.loadMilkyWay(size));
    this.loading = new Promise<void>((done) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const gl = this.gl;
        const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        if (img.naturalWidth > max) { this.loading = null; done(); return; }
        const t = this.tex ?? gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.tex = t; this.texSize = size; this.loading = null;
        done(); this.onReady?.();
      };
      img.onerror = () => { this.loading = null; done(); };
      img.src = dataUrl(`sky/milkyway-${size}k.jpg`);
    });
    return this.loading;
  }

  /** Draws a frame; the caller copies `canvas` (its size is w × h at dpr). */
  render(f: SkyFrame) {
    const gl = this.gl, c = this.canvas;
    const W = Math.max(1, Math.round(f.w * f.dpr)), H = Math.max(1, Math.round(f.h * f.dpr));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    gl.viewport(0, 0, W, H);
    gl.disable(gl.DEPTH_TEST);
    // Background.
    const basis: M3 = [f.right[0], f.up[0], f.fwd[0], f.right[1], f.up[1], f.fwd[1], f.right[2], f.up[2], f.fwd[2]];
    // GLSL mat3 is column-major: pass the transpose of our row-major matrices.
    const glm = (m: M3) => new Float32Array(transpose(m));
    // Galactic from equatorial of date: TO_GALACTIC · precessionᵀ.
    const toGal = mmul(TO_GALACTIC, transpose(f.prec));
    gl.useProgram(this.bg);
    const ub = (n: string) => gl.getUniformLocation(this.bg, n);
    gl.uniform2f(ub('uRes'), W, H);
    gl.uniform2f(ub('uCenter'), f.cx * f.dpr, f.cy * f.dpr);
    gl.uniform1f(ub('uScale'), f.scale * f.dpr);
    gl.uniform1i(ub('uProj'), f.proj === 'stereo' ? 0 : 1);
    gl.uniformMatrix3fv(ub('uBasis'), false, glm(basis));
    gl.uniformMatrix3fv(ub('uToGal'), false, glm(toGal));
    gl.uniform1f(ub('uMwK'), this.tex ? f.mw : 0);
    gl.uniform3fv(ub('uZenith'), f.zenith ?? [0, 0, 1]);
    gl.uniform1f(ub('uGround'), f.zenith ? 1 : 0);
    gl.uniform3fv(ub('uSun'), f.sun ?? [1, 0, 0]);
    gl.uniform1f(ub('uSunAlt'), f.sunAlt ?? -90);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(ub('uMw'), 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const ap = gl.getAttribLocation(this.bg, 'aPos');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(ap);
    // Stars.
    if (!this.starBuf || f.stars <= 0) return;
    gl.useProgram(this.st);
    const us = (n: string) => gl.getUniformLocation(this.st, n);
    // From J2000 to the view: basisᵀ · precession.
    const view = mmul(transpose(basis), f.prec);
    gl.uniformMatrix3fv(us('uView'), false, glm(view));
    gl.uniform1i(us('uProj'), f.proj === 'stereo' ? 0 : 1);
    gl.uniform1f(us('uScale'), f.scale * f.dpr);
    gl.uniform2f(us('uCenter'), f.cx * f.dpr, f.cy * f.dpr);
    gl.uniform2f(us('uRes'), W, H);
    gl.uniform1f(us('uDpr'), f.dpr);
    gl.uniform1f(us('uMagLimit'), f.magLimit);
    gl.uniform1f(us('uK'), f.stars);
    // The zenith in J2000 (so the shader compares it with the stars' J2000 positions).
    const z = f.zenith ? (() => { const p = transpose(f.prec), v = f.zenith!; return [p[0] * v[0] + p[1] * v[1] + p[2] * v[2], p[3] * v[0] + p[4] * v[1] + p[5] * v[2], p[6] * v[0] + p[7] * v[1] + p[8] * v[2]]; })() : [0, 0, 1];
    gl.uniform3fv(us('uZenith'), z);
    gl.uniform1f(us('uGround'), f.zenith ? 1 : 0);
    gl.uniform1f(us('uDay'), f.zenith ? Math.max(0, Math.min(1, ((f.sunAlt ?? -90) + 6) / 10)) : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starBuf);
    const aPos = gl.getAttribLocation(this.st, 'aPos'), aMag = gl.getAttribLocation(this.st, 'aMag'), aCol = gl.getAttribLocation(this.st, 'aCol');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(aMag); gl.vertexAttribPointer(aMag, 1, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 28, 16);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, this.nStars);
    gl.disableVertexAttribArray(aPos); gl.disableVertexAttribArray(aMag); gl.disableVertexAttribArray(aCol);
    gl.disable(gl.BLEND);
  }
}
