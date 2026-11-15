// 3D backdrop for the title screen: a lit, rotating, procedurally generated Mars globe with two orbit
// rings over a parallax star field. Raw WebGL2, no library.
//
// The globe is original art: an artist's impression built from noise, loosely arranged like Mars.
// It is not NASA imagery or data, and the title screen says so.
//
// The surface is baked once on the GPU into two equirectangular textures (colour + clouds, bump
// normals + ice), so a frame costs only a handful of texture reads. One canvas and one GL context
// live for the whole session and are re-attached each time the title is shown. Without WebGL2 the
// title keeps its CSS gradient planet. The same loop feeds the pointer tilt (--tx, --ty) that the
// CSS 3D menu uses, so the menu and the backdrop move together.
import { reducedMotion } from './dom'

/** Same breakpoint as the narrow layout in title.css. */
const NARROW = '(max-width: 859px), (max-aspect-ratio: 115/100)'
const TEX_W = 2048, TEX_H = 1024, NEB_W = 1024, NEB_H = 512
const RND = 64 // edge of the random 3D texture the bake shaders read
const STRIPS = 16 // the surface bake is spread over this many frames so the menu animation stays smooth
const TAU = Math.PI * 2
const EPOCH = performance.now()

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const HEAD = `#version 300 es
precision highp float;
precision highp int;
const float PI = 3.14159265, TAU = 6.2831853;
`

// Integer hash, identical on every GPU. Used per frame for the stars and the dither.
const HASH = `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(vec3 p) { return vec3(pcg3d(uvec3(ivec3(floor(p))))) * (1.0 / 4294967296.0); }
`

// Noise for the two bake shaders. It reads a small tiling 3D texture of seeded random bytes instead of
// hashing in the shader: the Direct3D shader compiler took about ten seconds on the hashed version.
const NOISE = `
uniform highp sampler3D uRnd;
// Four smooth value-noise fields in 0..1 from one filtered read.
vec4 rnd4(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return textureLod(uRnd, (i + f + 0.5) / ${RND}.0, 0.0);
}
// Four random bytes for one lattice cell.
vec4 cellRnd(vec3 cell, int seed) { return texelFetch(uRnd, (ivec3(cell) + seed) & ${RND - 1}, 0); }
const mat3 OCT = mat3(0.00, 1.60, 1.20, -1.60, 0.72, -0.96, -1.20, -0.96, 1.28); // rotate, then double
float fbm(vec3 p, int oct) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < oct; i++) { s += a * (rnd4(p).r - 0.5); p = OCT * p + 0.37; a *= 0.5; }
  return s * 1.5;
}
vec3 fbm3(vec3 p, int oct) {
  float a = 0.5;
  vec3 s = vec3(0.0);
  for (int i = 0; i < oct; i++) { s += a * (rnd4(p).rgb - 0.5); p = OCT * p + 0.37; a *= 0.5; }
  return s * 1.5;
}
`

// Bakes the globe. Output 0: rgb = sqrt(albedo), a = cloud cover. Output 1: rgb = bump normal offset, a = ice.
const PLANET = `${HEAD}
uniform vec2 uSize;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
${NOISE}
const float BUMP = 1.0;
vec3 lin(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }
// East-positive longitude and latitude in degrees to a point on the unit sphere.
vec3 ll(float lonE, float lat) {
  float lo = radians(-lonE), la = radians(lat);
  return vec3(cos(la) * cos(lo), sin(la), cos(la) * sin(lo));
}
float ang(vec3 a, vec3 b) { return acos(clamp(dot(a, b), -1.0, 1.0)); }

// One octave of impact craters: bowl, flat floor on the deep ones, raised rim. Radii stay under half a
// cell, so the 2x2x2 cells around p - 0.5 are the only ones that can reach p.
float craters(vec3 q, float freq, float dens, int seed) {
  vec3 p = q * freq;
  vec3 base = floor(p - 0.5);
  float h = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 cell = base + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 r = cellRnd(cell, seed).rgb;
    vec3 s = cellRnd(cell, seed + 29).gbr;
    if (s.x > dens) continue;
    float rad = mix(0.16, 0.48, s.y * s.y);
    float d = length(p - cell - r) / rad;
    if (d > 1.7) continue;
    float bowl = max(d * d - 1.0, -0.72) * (1.0 - smoothstep(0.9, 1.05, d));
    float rim = exp(-(d - 1.0) * (d - 1.0) * 30.0) * 0.38;
    h += (bowl * 0.9 + rim) * rad * (0.6 + 0.6 * s.z);
  }
  return h / freq;
}
float volcano(vec3 q, vec3 c, float sig, float amp) {
  float t = ang(q, c) / sig;
  return amp * (exp(-t * t * 1.4) - 0.35 * (1.0 - smoothstep(0.08, 0.16, t)));
}
// A long equatorial rift east of the volcanic rise.
float canyonMask(vec3 q) {
  float lonE = -atan(q.z, q.x), lat = asin(clamp(q.y, -1.0, 1.0));
  float x = lonE - radians(-68.0), halfLen = radians(29.0);
  float path = radians(-9.0) + 0.045 * sin(x * 4.0) + 0.06 * fbm(q * 9.0 + 5.0, 3);
  float dy = lat - path;
  float dx = max(abs(x) - halfLen, 0.0) * cos(lat);
  float d = sqrt(dx * dx + dy * dy);
  float wide = 0.02 * (1.0 + 1.5 * (1.0 - smoothstep(0.0, halfLen, abs(x)))) * (1.0 + 1.2 * fbm(q * 24.0, 3));
  return 1.0 - smoothstep(wide * 0.35, wide, d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float lon = (uv.x - 0.5) * TAU, lat = (uv.y - 0.5) * PI;
  vec3 q = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));

  vec3 w = q + 0.2 * fbm3(q * 1.4 + 3.1, 3);
  float cont = fbm(w * 1.6, 6);
  float north = smoothstep(-0.2, 0.3, q.y + 0.5 * cont); // smoother, lower northern plains
  float rough = mix(1.0, 0.3, north);

  // ---- height, in planet radii (exaggerated so relief reads from orbit)
  float h = cont * 0.05 - north * 0.018;
  float rd = 0.0, a = 0.5;
  vec3 p = w * 5.0;
  for (int i = 0; i < 5; i++) { rd += a * (1.0 - 3.0 * abs(rnd4(p).g - 0.5)); p = OCT * p + 9.3; a *= 0.5; }
  h += (rd - 0.5) * 0.012 * rough;
  h += fbm(q * 46.0, 3) * 0.002 * rough;
  float crat = craters(q, 5.0, 0.5, 11) + craters(q, 10.0, 0.55, 23) + craters(q, 20.0, 0.6, 37) + craters(q, 38.0, 0.6, 51);
  crat *= mix(1.0, 0.2, north);
  h += crat * 0.2;
  float bulge = exp(-pow(ang(q, ll(-112.0, 2.0)) / 0.42, 2.0));
  float volc = volcano(q, ll(-134.0, 19.0), 0.085, 0.05) + volcano(q, ll(-121.0, -9.0), 0.04, 0.026)
    + volcano(q, ll(-113.0, 1.0), 0.04, 0.026) + volcano(q, ll(-104.0, 11.0), 0.04, 0.026) + volcano(q, ll(147.0, 25.0), 0.06, 0.03);
  h += bulge * 0.022 + volc;
  float canyon = canyonMask(q);
  h -= canyon * 0.03;
  float basin = 1.0 - smoothstep(0.12, 0.24, ang(q, ll(70.0, -42.0)) + 0.04 * fbm(q * 6.0, 3));
  h -= basin * 0.03;

  // ---- colour (linear)
  vec3 BRIGHT = lin(0.86, 0.55, 0.34), MID = lin(0.70, 0.37, 0.20), DARK = lin(0.36, 0.22, 0.17);
  vec3 DEEP = lin(0.24, 0.13, 0.10), ICE = lin(0.95, 0.93, 0.90);
  float a1 = fbm(w * 2.2 + 31.0, 6), a2 = fbm(w * 5.3 + 3.0, 5);
  float darkM = smoothstep(0.0, 0.24, a1 + 0.35 * a2 - 0.22 * north + 0.04);
  vec3 col = mix(MID, BRIGHT, smoothstep(-0.25, 0.3, a2 + 1.2 * cont));
  col = mix(col, DARK, darkM * 0.85);
  float blotch = 1.0 - smoothstep(0.07, 0.2, ang(q, ll(67.0, 9.0)) * (1.0 + 0.6 * fbm(q * 5.0 + 9.0, 3)));
  col = mix(col, DARK, blotch * 0.8);
  col *= 0.94 + 0.9 * fbm(q * 30.0, 4);
  col = mix(col, BRIGHT, clamp(bulge * 0.35 + volc * 14.0, 0.0, 0.7));
  col = mix(col, BRIGHT * 1.05, basin * 0.6);
  col = mix(col, DEEP, canyon * 0.75);
  col *= 1.0 + clamp(crat * 9.0, -0.3, 0.25);
  float capN = smoothstep(0.945, 0.975, q.y + 0.035 * fbm(q * 8.0, 4));
  float capS = smoothstep(0.972, 0.992, -q.y + 0.025 * fbm(q * 9.0 + 4.0, 4));
  float cap = max(capN, capS);
  float swirl = 0.5 + 0.5 * sin(lon * 3.0 + acos(clamp(abs(q.y), 0.0, 1.0)) * 46.0 + 4.0 * fbm(q * 6.0, 3));
  col = mix(col, ICE * (0.86 + 0.14 * swirl), cap);

  float cl = fbm(q * vec3(2.4, 5.5, 2.4) + 0.9 * fbm(q * 2.0 + 60.0, 3) + 80.0, 5);
  float cloud = smoothstep(0.1, 0.5, cl) * (0.25 + 0.75 * smoothstep(0.3, 0.9, abs(q.y)));
  oA = vec4(sqrt(clamp(col, 0.0, 1.0)), cloud);

  // ---- bump normal from screen-space derivatives of the height (no tangent frame needed)
  vec3 dqx = dFdx(q), dqy = dFdy(q);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dqy, q), r2 = cross(q, dqx);
  float det = dot(dqx, r1);
  vec3 grad = abs(det) > 1e-14 ? (dhx * r1 + dhy * r2) / det : vec3(0.0);
  grad *= (1.0 - smoothstep(0.99, 0.999, abs(q.y))) * (1.0 - 0.6 * cap);
  vec3 off = normalize(q - BUMP * grad) - q;
  oB = vec4(clamp(off + 0.5, 0.0, 1.0), cap);
}`

// Bakes the faint band of dust and gas behind the stars. rgb = sqrt(colour).
const NEBULA = `${HEAD}
uniform vec2 uSize;
out vec4 o;
${NOISE}
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 p = vec3(uv * vec2(4.0, 2.0), 0.0);
  float warp = fbm(p * 1.2 + 9.0, 4);
  float n1 = fbm(p * 1.1 + vec3(warp * 1.5, 0.0, 3.0), 6);
  float n2 = fbm(p * 2.3 + vec3(0.0, warp * 2.0, 11.0), 5);
  float t = (uv.y - 0.55 - 0.25 * (uv.x - 0.5) + 0.2 * warp) / 0.28;
  float band = exp(-t * t);
  vec3 col = vec3(0.010, 0.018, 0.042);
  col += vec3(0.05, 0.11, 0.2) * smoothstep(-0.1, 0.5, n1) * band * 0.9;
  col += vec3(0.02, 0.14, 0.13) * smoothstep(0.1, 0.5, n2) * band * 0.6;
  col += vec3(0.16, 0.06, 0.03) * smoothstep(0.15, 0.5, n1 * n2 * 4.0 + 0.1) * band * 0.4;
  col *= 1.0 - 0.6 * smoothstep(0.1, 0.45, fbm(p * 3.1 + 40.0, 5)) * band;
  o = vec4(sqrt(col), 1.0);
}`

// The frame: stars, nebula, the globe under one sun, haze at the limb, two orbit rings with their craft.
// The camera is orthographic: view space is x right, y up, z toward the viewer.
const SCENE = `${HEAD}
uniform vec2 uRes;
uniform float uTime;
uniform float uPx;      // device pixels per CSS pixel
uniform vec2 uCenter;   // globe centre, device pixels, y up
uniform float uRadius;  // globe radius, device pixels
uniform vec2 uPar;      // pointer parallax, -1..1, y up
uniform mat3 uRot;      // surface: object space to view space
uniform mat3 uRotC;     // cloud layer
uniform vec3 uLight;
uniform vec3 uRingU[2];
uniform vec3 uRingV[2];
uniform vec2 uRing[2];  // x = orbit radius in globe radii, y = craft angle
uniform sampler2D uAlb;
uniform sampler2D uNrm;
uniform sampler2D uNeb;
out vec4 o;
${HASH}
vec2 equirect(vec3 q) { return vec2(atan(q.z, q.x) / TAU + 0.5, asin(clamp(q.y, -1.0, 1.0)) / PI + 0.5); }

vec3 stars(vec2 p, float cell, float seed) {
  vec2 id = floor(p / cell);
  vec3 h = hash3(vec3(id, seed));
  vec3 h2 = hash3(vec3(id, seed + 7.0));
  float d = length(p - (id + 0.15 + 0.7 * h.xy) * cell);
  float b = h.z * h.z;
  b *= b;
  float rad = (0.6 + 1.3 * b) * uPx;
  float tw = 0.78 + 0.22 * sin(uTime * (0.8 + 2.5 * h2.x) + h2.y * 40.0);
  float core = 1.0 - smoothstep(rad * 0.2, rad, d);
  float g = max(0.0, 1.0 - d / (0.15 * cell)); // glow fades to nothing before the cell edge
  float halo = b * g * g * g * 0.4;
  return mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.7), h2.z) * (0.12 + 0.88 * b) * (core + halo) * tw;
}

// An orbit drawn as a circle in a plane through the globe centre. Hidden where the globe is in front.
vec3 orbit(vec2 uv, float r, float aa, int i) {
  vec3 U = uRingU[i], V = uRingV[i];
  vec3 N = cross(U, V);
  float R = uRing[i].x, sa = uRing[i].y;
  vec3 tint = i == 0 ? vec3(0.25, 0.82, 1.0) : vec3(0.37, 0.95, 0.77);
  vec3 c = vec3(0.0);

  float zp = -(uv.x * N.x + uv.y * N.y) / N.z;   // depth of the orbit plane under this pixel
  vec3 p = vec3(uv, zp);
  float len = length(p);
  vec2 g = (uv - zp * N.xy / N.z) / len;
  float d = abs(len - R) / max(length(g), 1e-3) * uRadius / uPx; // CSS pixels from the line
  if (d < 40.0) {
    float shown = zp < 0.0 ? smoothstep(1.0 - aa, 1.0 + aa, r) : 1.0;
    float a = atan(dot(p, V), dot(p, U));
    float trail = exp(-mod(sa - a, TAU) * 1.4);
    float depth = 0.5 + 0.5 * smoothstep(-R, R, zp);
    float line = 1.0 - smoothstep(0.3, 1.3, d);
    float dash = i == 0 ? 1.0 : step(0.45, fract(a * 30.0 / TAU));
    c += tint * depth * shown * (line * (0.2 + 1.1 * trail) * dash + exp(-d / 5.0) * (0.04 + 0.5 * trail));
  }

  vec3 S = R * (cos(sa) * U + sin(sa) * V);       // the craft itself
  float vis = S.z < 0.0 ? smoothstep(1.0, 1.03, length(S.xy)) : 1.0;
  float big = 1.0 + 0.35 * S.z / R;                // nearer reads larger
  float ds = length(uv - S.xy) * uRadius / uPx / big;
  c += (vec3(1.0) * (1.0 - smoothstep(1.0, 2.6, ds)) + tint * 0.55 / (1.0 + ds * ds * 0.06)) * vis * big;
  return c;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 par = uPar * uPx;

  // ---- sky
  vec2 suv = (fc + par * 3.0) / uRes;
  vec2 nuv = vec2(suv.x * uRes.x / uRes.y * 0.5, suv.y) * 0.9 + vec2(uTime * 0.0012, 0.03);
  vec3 neb = texture(uNeb, nuv).rgb;
  vec3 col = neb * neb * 1.25;
  float drift = uTime * 1.6 * uPx;
  col += stars(fc + par * 4.0 + vec2(drift * 0.5, 0.0), 26.0 * uPx, 1.0) * 0.55;
  col += stars(fc + par * 8.0 + vec2(drift * 0.8, 0.0), 61.0 * uPx, 2.0) * 0.9;
  col += stars(fc + par * 14.0 + vec2(drift * 1.2, 0.0), 149.0 * uPx, 3.0) * 1.5;

  // ---- globe
  vec2 uv = (fc - (uCenter - par * 22.0)) / uRadius;
  float r = length(uv);
  float aa = 1.2 / uRadius;
  vec3 L = uLight;
  if (r < 1.0 + aa) {
    float z = sqrt(max(1.0 - r * r, 0.0));
    vec3 n = normalize(vec3(uv, z));
    vec3 q = n * uRot;
    float lod = max(0.0, log2(${TEX_W}.0 / (TAU * uRadius)) - 0.5 * log2(max(z, 0.02)));
    vec2 tuv = equirect(q);
    vec4 A = textureLod(uAlb, tuv, lod);
    vec4 B = textureLod(uNrm, tuv, lod);
    vec3 alb = A.rgb * A.rgb;
    vec3 nv = uRot * normalize(q + (B.rgb - 0.5));
    float geo = dot(n, L);
    float day = smoothstep(-0.1, 0.22, geo);
    float lam = max(dot(nv, L), 0.0);
    float cloud = textureLod(uAlb, equirect(n * uRotC), lod + 1.0).a;
    float shade = textureLod(uAlb, equirect(normalize(n + L * 0.035) * uRotC), lod + 1.5).a;
    vec3 surf = alb * lam * 1.55 * (1.0 - 0.3 * shade);
    surf = mix(surf, vec3(1.0, 0.88, 0.74) * max(geo, 0.0) * 1.3, cloud * 0.3);
    vec3 pc = surf * day + alb * vec3(0.010, 0.012, 0.018);
    float fres = pow(1.0 - z, 3.5);
    pc += vec3(0.95, 0.56, 0.34) * fres * smoothstep(-0.25, 0.45, geo) * 0.5;         // dust haze at the limb
    pc += vec3(0.2, 0.42, 0.7) * fres * (1.0 - smoothstep(0.0, 0.25, abs(geo))) * 0.25; // cool twilight band
    pc += pow(max(dot(nv, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * B.a * day * 0.5;
    col = mix(col, pc, 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r));
  }
  // thin atmosphere just outside the limb, on the sunlit side
  float limbSun = smoothstep(-0.3, 0.5, dot(vec3(uv / max(r, 1e-4), 0.0), L));
  float outside = max(r - 1.0, 0.0);
  col += vec3(0.9, 0.5, 0.3) * limbSun * smoothstep(1.0 - aa, 1.0 + aa, r) * (exp(-outside / 0.02) * 0.35 + exp(-outside / 0.09) * 0.06);

  col += orbit(uv, r, aa, 0) + orbit(uv, r, aa, 1);

  vec2 v = fc / uRes - 0.5;
  col *= 1.0 - 0.7 * dot(v, v);
  col = pow(1.0 - exp(-col * 1.35), vec3(1.0 / 2.2));
  col += (hash3(vec3(fc, mod(uTime * 60.0, 512.0))).x - 0.5) / 255.0; // dither: no banding in the dark sky
  o = vec4(col, 1.0);
}`

// ------------------------------------------------------------------ small row-major 3x3 helpers
type M3 = number[]
const mul = (a: M3, b: M3): M3 => {
  const o = new Array<number>(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  return o
}
const rx = (t: number): M3 => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)]
const ry = (t: number): M3 => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)]
const rz = (t: number): M3 => [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1]
const column = (m: M3, i: number, sign = 1) => [m[i] * sign, m[3 + i] * sign, m[6 + i] * sign]
const deg = (d: number) => (d * Math.PI) / 180

// North pole leans toward the viewer and to the left. The relay orbit sits near the equator; the
// survey orbit is steep. Both run prograde, so each orbit's V axis is the tilted -z.
const TILT = mul(rz(deg(17)), rx(deg(22)))
const ORBITS = [mul(rz(deg(17)), rx(deg(27))), mul(rz(deg(-38)), rx(deg(63)))]
const LIGHT = (() => { const v = [-0.62, 0.38, 0.55], n = Math.hypot(...v); return v.map(x => x / n) })()

// ------------------------------------------------------------------ GL lifecycle
interface Gfx {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  parallel: { COMPLETION_STATUS_KHR: number } | null
  progs: { planet: WebGLProgram; nebula: WebGLProgram; scene: WebGLProgram }
  u: Record<string, WebGLUniformLocation | null>
  tex: { alb: WebGLTexture; nrm: WebGLTexture; neb: WebGLTexture } | null
  rnd: WebGLTexture | null
  fbo: WebGLFramebuffer | null
  phase: 'compile' | 'bake' | 'ready'
  strip: number
  scale: number // backing-store pixels per CSS pixel; drops if frames run slow
  slow: number
  frames: number
}
/** undefined: not tried yet. null: WebGL2 is unavailable or failed, so the CSS planet stays. */
let gfx: Gfx | null | undefined

function link(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const p = gl.createProgram()!
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, frag]] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    gl.attachShader(p, s)
  }
  gl.bindAttribLocation(p, 0, 'aPos')
  gl.linkProgram(p)
  return p
}

function build(): Gfx | null {
  const canvas = document.createElement('canvas')
  canvas.className = 't3d-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false })
  if (!gl) return null
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('context lost') })
  // one oversized triangle covers the viewport
  gl.bindVertexArray(gl.createVertexArray())
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  return {
    canvas, gl,
    parallel: gl.getExtension('KHR_parallel_shader_compile'),
    progs: { planet: link(gl, PLANET), nebula: link(gl, NEBULA), scene: link(gl, SCENE) },
    u: {}, tex: null, rnd: null, fbo: null, phase: 'compile', strip: 0,
    scale: Math.min(window.devicePixelRatio || 1, 2), slow: 0, frames: 0,
  }
}

/** A tiling cube of seeded random bytes on texture unit 3. Seeded, so the globe is the same on every device and run. */
function randomCube(gl: WebGL2RenderingContext): WebGLTexture {
  const data = new Uint8Array(RND * RND * RND * 4)
  let s = 0x9e3779b9
  for (let i = 0; i < data.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; data[i] = s >>> 24 }
  const t = gl.createTexture()!
  gl.activeTexture(gl.TEXTURE3)
  gl.bindTexture(gl.TEXTURE_3D, t)
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, RND, RND, RND, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR)
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT)
  gl.activeTexture(gl.TEXTURE0)
  return t
}

function fail(why: string) {
  console.warn(`SPACER title: 3D backdrop disabled (${why}). Showing the static planet instead.`)
  gfx?.canvas.remove()
  gfx = null
}

/** Shaders compile off the main thread where the browser allows it; this polls without blocking. */
function finishCompile(g: Gfx) {
  const { gl, parallel, progs } = g
  const all = Object.values(progs)
  if (parallel && !all.every(p => gl.getProgramParameter(p, parallel.COMPLETION_STATUS_KHR))) return
  for (const p of all) {
    if (gl.getProgramParameter(p, gl.LINK_STATUS)) continue
    const logs = [gl.getProgramInfoLog(p), ...(gl.getAttachedShaders(p) ?? []).map(s => gl.getShaderInfoLog(s))]
    return fail(`shader: ${logs.filter(Boolean).join(' | ')}`)
  }
  const tex = (w: number, h: number, mips: boolean, wrapS: number, wrapT: number) => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texStorage2D(gl.TEXTURE_2D, mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1, gl.RGBA8, w, h)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT)
    return t
  }
  g.tex = {
    alb: tex(TEX_W, TEX_H, true, gl.REPEAT, gl.CLAMP_TO_EDGE),
    nrm: tex(TEX_W, TEX_H, true, gl.REPEAT, gl.CLAMP_TO_EDGE),
    neb: tex(NEB_W, NEB_H, false, gl.MIRRORED_REPEAT, gl.MIRRORED_REPEAT),
  }
  gl.bindTexture(gl.TEXTURE_2D, null)
  g.rnd = randomCube(gl)
  for (const p of [progs.planet, progs.nebula]) { gl.useProgram(p); gl.uniform1i(gl.getUniformLocation(p, 'uRnd'), 3) }
  g.fbo = gl.createFramebuffer()
  for (const name of ['uRes', 'uTime', 'uPx', 'uCenter', 'uRadius', 'uPar', 'uRot', 'uRotC', 'uLight', 'uRingU', 'uRingV', 'uRing', 'uAlb', 'uNrm', 'uNeb']) {
    g.u[name] = gl.getUniformLocation(progs.scene, name)
  }
  g.phase = 'bake'
}

/** Renders one horizontal strip of the globe textures; after the last strip, the nebula and mipmaps. */
function bakeStep(g: Gfx) {
  const { gl, progs, u } = g
  const tex = g.tex!
  gl.bindFramebuffer(gl.FRAMEBUFFER, g.fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.alb, 0)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex.nrm, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return fail('framebuffer incomplete')
  }
  const rows = TEX_H / STRIPS
  gl.viewport(0, 0, TEX_W, TEX_H)
  gl.enable(gl.SCISSOR_TEST)
  gl.scissor(0, g.strip * rows, TEX_W, rows)
  gl.useProgram(progs.planet)
  gl.uniform2f(gl.getUniformLocation(progs.planet, 'uSize'), TEX_W, TEX_H)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.disable(gl.SCISSOR_TEST)
  if (++g.strip < STRIPS) return gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex.neb, 0)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0])
  gl.viewport(0, 0, NEB_W, NEB_H)
  gl.useProgram(progs.nebula)
  gl.uniform2f(gl.getUniformLocation(progs.nebula, 'uSize'), NEB_W, NEB_H)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.deleteFramebuffer(g.fbo)
  g.fbo = null
  gl.deleteProgram(progs.planet)
  gl.deleteProgram(progs.nebula)
  gl.deleteTexture(g.rnd)
  g.rnd = null

  const units: [WebGLTexture, string, boolean][] = [[tex.alb, 'uAlb', true], [tex.nrm, 'uNrm', true], [tex.neb, 'uNeb', false]]
  gl.useProgram(progs.scene)
  units.forEach(([t, name, mips], i) => {
    gl.activeTexture(gl.TEXTURE0 + i)
    gl.bindTexture(gl.TEXTURE_2D, t)
    if (mips) gl.generateMipmap(gl.TEXTURE_2D)
    gl.uniform1i(u[name], i)
  })
  gl.uniform3fv(u.uLight, LIGHT)
  gl.uniform3fv(u.uRingU, ORBITS.flatMap(m => column(m, 0)))
  gl.uniform3fv(u.uRingV, ORBITS.flatMap(m => column(m, 2, -1)))
  g.phase = 'ready'
}

interface View { cx: number; cy: number; r: number }

/** Where the globe sits, in CSS pixels. The CSS fallback planet reads the same numbers. */
function planetView(w: number, h: number): View {
  return window.matchMedia(NARROW).matches
    ? { cx: w * 0.5, cy: h * 0.25, r: Math.min(w * 0.36, h * 0.19) }
    : { cx: w * 0.72, cy: h * 0.5, r: Math.min(h * 0.4, w * 0.25) }
}

function draw(g: Gfx, t: number, view: View, par: { x: number; y: number }, zoom: number) {
  const { gl, canvas, u } = g
  const k = g.scale
  const spin = deg(-30) + (t * TAU) / 140
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.uniform2f(u.uRes, canvas.width, canvas.height)
  gl.uniform1f(u.uTime, t)
  gl.uniform1f(u.uPx, k)
  gl.uniform2f(u.uCenter, view.cx * k, canvas.height - view.cy * k)
  gl.uniform1f(u.uRadius, view.r * k * zoom)
  gl.uniform2f(u.uPar, par.x, -par.y)
  gl.uniformMatrix3fv(u.uRot, true, mul(TILT, ry(spin)))
  gl.uniformMatrix3fv(u.uRotC, true, mul(TILT, ry(spin * 1.08 + 1.3)))
  gl.uniform2fv(u.uRing, [1.56, 0.6 + (t * TAU) / 48, 1.24, 2.1 + (t * TAU) / 31])
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

/**
 * Attaches the backdrop to a title screen element and runs until that element leaves the page.
 * Expects a `.t3d-planet` child (the CSS fallback); the canvas is inserted right after it.
 */
export function mountBackdrop(host: HTMLElement) {
  const still = reducedMotion()
  if (gfx === undefined) gfx = build()
  if (gfx) {
    gfx.canvas.classList.remove('on')
    host.querySelector('.t3d-planet')!.after(gfx.canvas)
  }
  const ptr = { x: 0, y: 0 }, par = { x: 0, y: 0 }
  const onMove = (e: PointerEvent) => {
    ptr.x = (e.clientX / window.innerWidth) * 2 - 1
    ptr.y = (e.clientY / window.innerHeight) * 2 - 1
  }
  if (!still) window.addEventListener('pointermove', onMove, { passive: true })

  const born = performance.now()
  let last = born, attached = false, sized = '', drawn = ''
  const tick = (now: number) => {
    if (host.isConnected) attached = true
    else if (attached || now - born > 2000) return window.removeEventListener('pointermove', onMove)
    requestAnimationFrame(tick)
    if (host.inert && drawn) return // fading out under the next screen: hold the last frame and leave the graphics card to that screen
    const dt = (now - last) / 1000
    last = now
    const t = still ? 24 : (now - EPOCH) / 1000
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    const view = planetView(w, h)
    const size = `${w}x${h}`
    if (size !== sized) {
      sized = size
      host.style.setProperty('--pcx', `${view.cx}px`)
      host.style.setProperty('--pcy', `${view.cy}px`)
      host.style.setProperty('--pr', `${view.r}px`)
    }
    if (!still) {
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 3.5)
      par.x += (ptr.x + Math.sin(t * 0.21) * 0.14 - par.x) * k
      par.y += (ptr.y + Math.cos(t * 0.16) * 0.1 - par.y) * k
      host.style.setProperty('--tx', par.x.toFixed(3))
      host.style.setProperty('--ty', par.y.toFixed(3))
    }

    const g = gfx
    if (!g) return
    if (g.phase === 'compile') finishCompile(g)
    else if (g.phase === 'bake') bakeStep(g)
    if (gfx !== g || g.phase !== 'ready') return
    // Drop resolution if this GPU cannot hold about 30 frames a second.
    if (!still && dt < 0.25 && ++g.frames > 30) {
      g.slow = g.slow * 0.95 + (dt > 0.034 ? 0.05 : 0)
      if (g.slow > 0.5 && g.scale > 0.6) { g.scale = Math.max(0.6, g.scale * 0.75); g.slow = 0; g.frames = 0 }
    }
    const bw = Math.max(1, Math.round(w * g.scale)), bh = Math.max(1, Math.round(h * g.scale))
    if (g.canvas.width !== bw || g.canvas.height !== bh) { g.canvas.width = bw; g.canvas.height = bh }
    const frame = `${bw}x${bh}`
    if (still && frame === drawn) return // reduced motion: one still frame per size
    const age = Math.min(1, (now - born) / 2200)
    draw(g, t, view, par, still ? 1 : 1 - 0.07 * (1 - age) ** 3)
    if (!drawn) g.canvas.classList.add('on')
    drawn = frame
  }
  requestAnimationFrame(tick)
}
