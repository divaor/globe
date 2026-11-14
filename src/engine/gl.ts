// WebGL2 raster renderer: drapes equirectangular images (satellite, relief, climate grids, city
// lights...) over the current projection. A grid mesh lives in *rotated* coordinates (so the
// projection's seam is always at the mesh edge); the vertex shader runs the same raw projection
// formulas as d3 (see projections.ts) and the fragment shader rotates back to geographic
// coordinates for an exact, seamless texture lookup.
// Zoomed in, an image can carry a *detail* mosaic: web-map tiles of the area on screen (see detail.ts), either
// pictures (satellite) or heights (Terrarium PNGs), from which the shader draws shaded relief or elevation colours.
import type { View } from './view';

const VERT = `#version 300 es
precision highp float;
in vec2 a_lp;
uniform int u_pa;
uniform int u_pb;
uniform float u_t;
uniform float u_fa;
uniform float u_fb;
uniform float u_zoom;
uniform vec2 u_translate;
uniform vec2 u_viewport;
out vec3 v_dir;

#define PI 3.141592653589793
#define HALF_PI 1.5707963267948966
#define SQRT2 1.4142135623730951
#define MERC_MAX 1.4844222297453324

const vec2 RK[20] = vec2[20](
  vec2(0.9986, -0.062), vec2(1.0, 0.0), vec2(0.9986, 0.062), vec2(0.9954, 0.124), vec2(0.99, 0.186),
  vec2(0.9822, 0.248), vec2(0.973, 0.31), vec2(0.96, 0.372), vec2(0.9427, 0.434), vec2(0.9216, 0.4958),
  vec2(0.8962, 0.5571), vec2(0.8679, 0.6176), vec2(0.835, 0.6769), vec2(0.7986, 0.7346), vec2(0.7597, 0.7903),
  vec2(0.7186, 0.8435), vec2(0.6732, 0.8936), vec2(0.6213, 0.9394), vec2(0.5722, 0.9761), vec2(0.5322, 1.0));

vec2 robinson(float l, float p) {
  float i = min(18.0, abs(p) * 36.0 / PI);
  int i0 = int(floor(i));
  float di = i - float(i0);
  vec2 a = RK[i0]; vec2 b = RK[i0 + 1]; vec2 c = RK[min(19, i0 + 2)];
  float x = l * (b.x + di * (c.x - a.x) / 2.0 + di * di * (c.x - 2.0 * b.x + a.x) / 2.0);
  float y = sign(p) * (b.y + di * (c.y - a.y) / 2.0 + di * di * (c.y - 2.0 * b.y + a.y) / 2.0) * 1.593415793900743;
  return vec2(x, y);
}
vec2 aitoff(float l, float p) {
  float cy = cos(p); float x = l / 2.0;
  float a = acos(clamp(cy * cos(x), -1.0, 1.0));
  float s = a > 1e-6 ? a / sin(a) : 1.0;
  return vec2(2.0 * cy * sin(x) * s, sin(p) * s);
}
vec2 mollweide(float l, float p) {
  float t;
  if (abs(p) > 1.57079) { t = sign(p) * PI; }
  else {
    float k = PI * sin(p); t = p;
    for (int i = 0; i < 16; i++) { float d = (t + sin(t) - k) / max(1e-6, 1.0 + cos(t)); t -= d; if (abs(d) < 1e-7) break; }
  }
  float th = t / 2.0;
  return vec2(SQRT2 / HALF_PI * l * cos(th), SQRT2 * sin(th));
}
vec2 eckert4(float l, float p) {
  float k = (2.0 + HALF_PI) * sin(p); float t = p / 2.0;
  for (int i = 0; i < 12; i++) {
    float c = cos(t);
    float d = (t + sin(t) * (c + 2.0) - k) / max(1e-6, 2.0 * c * (1.0 + c));
    t -= d; if (abs(d) < 1e-7) break;
  }
  return vec2(2.0 / sqrt(PI * (4.0 + PI)) * l * (1.0 + cos(t)), 2.0 * sqrt(PI / (4.0 + PI)) * sin(t));
}
vec2 raw(int id, float l, float p) {
  if (id == 0) return vec2(cos(p) * sin(l), sin(p));
  if (id == 1) return vec2(l, p);
  if (id == 2) { float q = clamp(p, -MERC_MAX, MERC_MAX); return vec2(l, log(tan(PI / 4.0 + q / 2.0))); }
  if (id == 3) { float q = clamp(p, -1.5620696, 1.5620696); return vec2(l, 1.25 * log(tan(PI / 4.0 + 0.4 * q))); }
  if (id == 4) return robinson(l, p);
  if (id == 5) { vec2 a = aitoff(l, p); return vec2((a.x + l / HALF_PI) / 2.0, (a.y + p) / 2.0); }
  if (id == 6) {
    float M = 0.8660254037844386;
    float t = asin(M * sin(p)); float t2 = t * t; float t6 = t2 * t2 * t2;
    return vec2(l * cos(t) / (M * (1.340264 + 3.0 * -0.081106 * t2 + t6 * (7.0 * 0.000893 + 9.0 * 0.003796 * t2))),
                t * (1.340264 + -0.081106 * t2 + t6 * (0.000893 + 0.003796 * t2)));
  }
  if (id == 7) {
    float p2 = p * p; float p4 = p2 * p2;
    return vec2(l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
                p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))));
  }
  if (id == 8) return mollweide(l, p);
  if (id == 9) return vec2(l * 0.7071067811865476, sin(p) / 0.7071067811865476);
  if (id == 10) return eckert4(l, p);
  float cx = cos(l); float cyy = cos(p); float c = clamp(cx * cyy, -1.0, 1.0);
  float k;
  if (id == 11) { float a = acos(c); k = a > 1e-6 ? a / sin(a) : 1.0; }
  else if (id == 12) { k = sqrt(2.0 / max(1e-6, 1.0 + c)); }
  else { k = 1.0 / max(1e-3, 1.0 + c); }
  return vec2(k * cyy * sin(l), k * sin(p));
}

void main() {
  float l = a_lp.x; float p = a_lp.y;
  vec2 xy = u_t >= 1.0 ? raw(u_pb, l, p) * u_fb
          : u_t <= 0.0 ? raw(u_pa, l, p) * u_fa
          : mix(raw(u_pa, l, p) * u_fa, raw(u_pb, l, p) * u_fb, u_t);
  vec2 s = vec2(u_translate.x + xy.x * u_zoom, u_translate.y - xy.y * u_zoom);
  gl_Position = vec4(s.x / u_viewport.x * 2.0 - 1.0, 1.0 - s.y / u_viewport.y * 2.0, 0.0, 1.0);
  v_dir = vec3(cos(p) * cos(l), cos(p) * sin(l), sin(p));
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 v_dir;
uniform mat3 u_inv;
uniform float u_clip;
uniform sampler2D u_tex;
uniform sampler2D u_pal;
uniform int u_mode;       // 0 rgb, 1 palette (gray value -> colour, 0 = transparent), 2 night only
uniform float u_opacity;
uniform vec3 u_sun;
uniform int u_shade;      // darken the night side
// Detail mosaic: tiles x0..x0+nx-1, y0..y0+ny-1 of web-map zoom z (n = 2^z tiles across the world).
uniform int u_dmode;      // 0 none, 1 picture, 2 shaded relief from heights, 3 elevation colours from heights
uniform sampler2D u_det;
uniform sampler2D u_dpal; // height -> colour (see heightU)
uniform vec4 u_dbox;      // x0, y0, nx, ny
uniform float u_dn;       // tiles round the world: 2^z (Mercator) or 2^(z+1) (a longitude/latitude grid)
uniform int u_dgeo;       // 1: the tiles are a longitude/latitude grid (the other worlds), 0: Web Mercator
uniform vec2 u_dsize;     // mosaic size in texels
uniform float u_zf;       // how much the shading exaggerates slopes
out vec4 outColor;
#define PI 3.141592653589793

// Terrarium: height = R * 256 + G + B / 256 - 32768 metres; alpha 0 where no tile has arrived.
bool texelH(ivec2 q, out float hgt) {
  ivec2 c = clamp(q, ivec2(0), ivec2(u_dsize) - 1);
  vec4 t = texelFetch(u_det, c, 0) * 255.0;
  hgt = t.r * 256.0 + t.g + t.b / 256.0 - 32768.0;
  return t.a > 127.0;
}
bool heightAt(vec2 p, out float hgt) {
  vec2 b = floor(p); vec2 f = p - b; ivec2 q = ivec2(b);
  float a, c, d, e;
  bool ok = texelH(q, a) && texelH(q + ivec2(1, 0), c) && texelH(q + ivec2(0, 1), d) && texelH(q + ivec2(1, 1), e);
  hgt = mix(mix(a, c, f.x), mix(d, e, f.x), f.y);
  return ok;
}
// Palette position: the sea in 0..0.5, the land in 0.5..1, with more room near sea level.
float heightU(float hgt) {
  return hgt < 0.0 ? 0.5 - 0.5 * sqrt(min(1.0, -hgt / 11000.0)) : 0.5 + 0.5 * sqrt(min(1.0, hgt / 8848.0));
}

void main() {
  vec3 d = normalize(v_dir);
  if (d.x < cos(u_clip) - 1e-5) discard;
  vec3 g = u_inv * d;
  float lon = atan(g.y, g.x);
  float lat = asin(clamp(g.z, -1.0, 1.0));
  // Two parameterisations of u so the mip level is right across the antimeridian seam.
  float u1 = lon / (2.0 * PI) + 0.5;
  float u2 = fract(u1 + 0.5);
  vec2 dx1 = dFdx(vec2(u1, 0.0)), dy1 = dFdy(vec2(u1, 0.0));
  vec2 dx2 = dFdx(vec2(u2, 0.0)), dy2 = dFdy(vec2(u2, 0.0));
  float v = 0.5 - lat / PI;
  vec2 dv = vec2(dFdx(v), dFdy(v));
  float dux = abs(dx1.x) < abs(dx2.x) ? dx1.x : dx2.x;
  float duy = abs(dy1.x) < abs(dy2.x) ? dy1.x : dy2.x;
  vec4 c = textureGrad(u_tex, vec2(u1, v), vec2(dux, dv.x), vec2(duy, dv.y));
  float night = 1.0 - smoothstep(-0.12, 0.08, dot(g, u_sun));
  if (u_mode == 1) {
    float val = c.r;
    if (val < 0.5 / 255.0) discard;
    c = texture(u_pal, vec2(val, 0.5));
  } else if (u_mode == 2) {
    float val = c.r;
    c = vec4(texture(u_pal, vec2(val, 0.5)).rgb, val * night);
  }
  if (u_dmode > 0) {
    float latc = clamp(lat, -1.4844222, 1.4844222);
    float X = (lon / (2.0 * PI) + 0.5) * u_dn;
    float Y = u_dgeo == 1 ? (0.5 - lat / PI) * u_dn * 0.5 : (1.0 - log(tan(PI / 4.0 + latc / 2.0)) / PI) / 2.0 * u_dn;
    vec2 uv = vec2(mod(X - u_dbox.x, u_dn) / u_dbox.z, (Y - u_dbox.y) / u_dbox.w);
    if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
      if (u_dmode == 1) {
        vec4 dc = texture(u_det, uv);
        if (dc.a > 0.5) c = vec4(dc.rgb, 1.0);
      } else {
        vec2 p = uv * u_dsize - 0.5;
        float h0, hE, hW, hN, hS;
        if (heightAt(p, h0) && heightAt(p + vec2(1.0, 0.0), hE) && heightAt(p - vec2(1.0, 0.0), hW) && heightAt(p - vec2(0.0, 1.0), hN) && heightAt(p + vec2(0.0, 1.0), hS)) {
          // Metres per texel at this latitude (Mercator texels are square on the ground).
          float mpp = 40075016.686 * cos(latc) / (256.0 * u_dn);
          vec3 nrm = normalize(vec3(-(hE - hW) / (2.0 * mpp) * u_zf, -(hN - hS) / (2.0 * mpp) * u_zf, 1.0));
          // Light from the north-west, 45 degrees up; flat ground keeps its colour.
          float k = clamp(dot(nrm, normalize(vec3(-1.0, 1.0, 1.41421356))) / 0.70710678, 0.25, 1.45);
          // Sea below 10 m; from 10 m down to sea level only where the world image shows water, since land below
          // sea level (the Netherlands' polders, the Po delta) and lagoons have the same heights.
          bool watery = c.b > c.r + 0.06 && c.b > c.g;
          bool sea = h0 < -10.0 || (h0 < 0.0 && watery);
          vec3 pal = texture(u_dpal, vec2(heightU(sea ? min(h0, -1.0) : max(h0, 0.0)), 0.5)).rgb;
          if (u_dmode == 3) c = vec4(pal * mix(1.0, k, 0.9), 1.0);
          else if (sea) c = vec4(pal, 1.0);
          else {
            // Shaded relief: the base image's colours (its land cover) where it shows land, sharpened by the heights.
            vec3 tint = watery ? pal : mix(pal, c.rgb, 0.55);
            c = vec4(tint * mix(1.0, k, 0.85), 1.0);
          }
        }
      }
    }
  }
  if (u_shade == 1) c.rgb *= mix(1.0, 0.18, night);
  float a = c.a * u_opacity;
  outColor = vec4(c.rgb * a, a);
}`;

export interface RasterTexture { tex: WebGLTexture; width: number; height: number }
export interface RasterPalette { tex: WebGLTexture }

/** A detail mosaic over a draw: tiles x0.., y0.. of zoom z (n = 2^z), `nx` × `ny` of them in `tex`. */
export interface RasterDetail {
  tex: WebGLTexture;
  x0: number; y0: number; nx: number; ny: number; n: number;
  /** The tiles are a longitude/latitude grid (n columns, n/2 rows), not Web Mercator. */
  geo?: boolean;
  /** 1 picture, 2 shaded relief from heights, 3 elevation colours from heights. */
  mode: 1 | 2 | 3;
  /** Height palette (modes 2 and 3). */
  palette?: RasterPalette;
  /** Slope exaggeration of the shading. */
  zf: number;
}

export interface RasterDraw {
  texture: RasterTexture;
  opacity: number;
  mode?: 0 | 1 | 2;
  palette?: RasterPalette;
  shadeNight?: boolean;
  detail?: RasterDetail | null;
}

export class GLRaster {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private ibuf: WebGLBuffer;
  private count = 0;
  private meshKey = '';
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private dummyPal: RasterPalette;
  sun: [number, number, number] = [1, 0, 0];

  static create(canvas: HTMLCanvasElement): GLRaster | null {
    try {
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl) return null;
      return new GLRaster(gl);
    } catch (e) {
      console.warn('WebGL2 unavailable', e);
      return null;
    }
  }

  /** WebGL emulated on the CPU (no usable GPU): GPU motion would be slower than vectors there. */
  readonly software: boolean;

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    this.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader error');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'a_lp');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link error');
    this.prog = prog;
    for (const n of ['u_pa', 'u_pb', 'u_t', 'u_fa', 'u_fb', 'u_zoom', 'u_translate', 'u_viewport', 'u_inv', 'u_clip',
      'u_tex', 'u_pal', 'u_mode', 'u_opacity', 'u_sun', 'u_shade', 'u_dmode', 'u_det', 'u_dpal', 'u_dbox', 'u_dn', 'u_dgeo', 'u_dsize', 'u_zf']) this.loc[n] = gl.getUniformLocation(prog, n);
    this.vao = gl.createVertexArray()!;
    this.buf = gl.createBuffer()!;
    this.ibuf = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibuf);
    gl.bindVertexArray(null);
    this.dummyPal = this.palette([[0, '#000000'], [1, '#ffffff']]);
  }

  /** Mesh in rotated coordinates around (0, phiC), covering ±halfL × ±halfP radians. */
  private ensureMesh(phiC: number, halfL: number, halfP: number) {
    const q = (v: number) => Math.round(v * 40) / 40;
    const key = `${q(phiC)}|${q(halfL)}|${q(halfP)}`;
    if (key === this.meshKey) return;
    this.meshKey = key;
    const nx = 160, ny = 96;
    const p0 = Math.max(-Math.PI / 2, phiC - halfP), p1 = Math.min(Math.PI / 2, phiC + halfP);
    const l0 = -halfL, l1 = halfL;
    const verts = new Float32Array((nx + 1) * (ny + 1) * 2);
    let o = 0;
    for (let j = 0; j <= ny; j++) {
      const p = p0 + ((p1 - p0) * j) / ny;
      for (let i = 0; i <= nx; i++) {
        verts[o++] = l0 + ((l1 - l0) * i) / nx;
        verts[o++] = p;
      }
    }
    const idx = new Uint32Array(nx * ny * 6);
    o = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx[o++] = a; idx[o++] = b; idx[o++] = c; idx[o++] = b; idx[o++] = d; idx[o++] = c;
    }
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    this.count = idx.length;
  }

  texture(img: TexImageSource & { width: number; height: number }): RasterTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return { tex, width: img.width, height: img.height };
  }

  /** Uploads a canvas, reusing `into`'s texture object when given (re-uploads keep one GPU texture). */
  upload(canvas: HTMLCanvasElement, into?: RasterTexture | null): RasterTexture {
    if (!into) return this.texture(canvas);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, into.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    return { tex: into.tex, width: canvas.width, height: canvas.height };
  }

  get maxTextureSize(): number { return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number; }

  async load(url: string): Promise<RasterTexture> {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number;
    if (img.width > max) {
      const c = document.createElement('canvas');
      c.width = max; c.height = Math.round((max * img.height) / img.width);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return this.texture(c);
    }
    return this.texture(img);
  }

  /** An empty RGBA texture for a detail mosaic (`nearest` for heights, which must not be blended). */
  detailTexture(w: number, h: number, nearest: boolean): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** Puts a tile (or a stand-in) into a detail mosaic at texel (x, y). */
  uploadTile(tex: WebGLTexture, x: number, y: number, img: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
  }

  deleteTexture(tex: WebGLTexture) { this.gl.deleteTexture(tex); }

  /** Palette texture from colour stops (t in 0..1), 256 texels wide by default. */
  palette(stops: [number, string][], width = 256): RasterPalette {
    const c = document.createElement('canvas');
    c.width = width; c.height = 1;
    const ctx = c.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, width, 0);
    for (const [t, col] of stops) g.addColorStop(Math.max(0, Math.min(1, t)), col);
    ctx.fillStyle = g; ctx.fillRect(0, 0, width, 1);
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex };
  }

  render(view: View, draws: RasterDraw[]) {
    const gl = this.gl;
    const W = Math.round(view.w * view.dpr), H = Math.round(view.h * view.dpr);
    if (gl.canvas.width !== W || gl.canvas.height !== H) { gl.canvas.width = W; gl.canvas.height = H; }
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!draws.length) return;

    const u = view.uniforms();
    // Mesh around the visible region in rotated coordinates.
    // When zoomed in, a denser mesh covering only the visible window keeps rasters aligned with vectors.
    const r = view.visibleRadius();
    const local = !view.morphing && r < 1.2;
    const phiC = view.current.kind === 'flat' ? (view.lat * Math.PI) / 180 : 0;
    const halfL = local ? Math.min(Math.PI, r * 1.3 + 0.02) : Math.PI;
    const halfP = local ? Math.min(Math.PI / 2, r * 1.3 + 0.02) : Math.PI / 2;
    this.ensureMesh(local ? phiC : 0, halfL, halfP);

    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const L = this.loc;
    gl.uniform1i(L.u_pa, u.pa); gl.uniform1i(L.u_pb, u.pb);
    gl.uniform1f(L.u_t, u.t); gl.uniform1f(L.u_fa, u.fa * view.dpr); gl.uniform1f(L.u_fb, u.fb * view.dpr);
    gl.uniform1f(L.u_zoom, u.zoom);
    gl.uniform2f(L.u_translate, u.translate[0] * view.dpr, u.translate[1] * view.dpr);
    gl.uniform2f(L.u_viewport, W, H);
    gl.uniformMatrix3fv(L.u_inv, false, new Float32Array(u.inv));
    gl.uniform1f(L.u_clip, u.clip);
    gl.uniform3f(L.u_sun, this.sun[0], this.sun[1], this.sun[2]);
    gl.uniform1i(L.u_tex, 0);
    gl.uniform1i(L.u_pal, 1);
    gl.uniform1i(L.u_det, 2);
    gl.uniform1i(L.u_dpal, 3);
    for (const d of draws) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, d.texture.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (d.palette ?? this.dummyPal).tex);
      const det = d.detail;
      gl.uniform1i(L.u_dmode, det ? det.mode : 0);
      // Unused samplers still need a texture of the right kind bound.
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, det ? det.tex : this.dummyPal.tex);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, (det?.palette ?? this.dummyPal).tex);
      if (det) {
        gl.uniform4f(L.u_dbox, det.x0, det.y0, det.nx, det.ny);
        gl.uniform1f(L.u_dn, det.n);
        gl.uniform1i(L.u_dgeo, det.geo ? 1 : 0);
        gl.uniform2f(L.u_dsize, det.nx * 256, det.ny * 256);
        gl.uniform1f(L.u_zf, det.zf);
      }
      gl.uniform1i(L.u_mode, d.mode ?? 0);
      gl.uniform1f(L.u_opacity, d.opacity);
      gl.uniform1i(L.u_shade, d.shadeNight ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }
}
