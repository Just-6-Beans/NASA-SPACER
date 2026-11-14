// GLSL for the launch scene: one full-screen pass for the sky and the ground, one for the lit
// meshes, one for flames, smoke and glows. Everything is a procedural artist's impression: the
// dusk sky, the coast and the lights are not NASA imagery or data.

const HEAD = `#version 300 es
precision highp float;
precision highp int;
`

/** Shared by the background and the meshes, so a rocket reflects the same sky it stands under. */
const SKY = `
const float RE = 6371000.0;
uniform vec3 uSun;        // direction to the sun: just under the horizon at the pad
const vec3 ZENITH = vec3(0.0022, 0.0048, 0.0135);
const vec3 HORIZON = vec3(0.020, 0.033, 0.058);
const vec3 AFTERGLOW = vec3(0.235, 0.090, 0.024);
const vec3 LIMB_NIGHT = vec3(0.035, 0.085, 0.19);
const vec3 LIMB_DAY = vec3(0.22, 0.40, 0.72);

// Sine of the angle by which the horizon lies below level, seen from h metres up.
float horizonDip(float h) { float k = RE / (RE + h); return sqrt(max(1.0 - k * k, 0.0)); }

// Colour of the sky along d from h metres above the ground: a dusk dome low down, thinning with
// height into a bright line along the limb.
vec3 skyColor(vec3 d, float h) {
  float above = d.y + horizonDip(h);
  float air = exp(-h / 8500.0);
  float t = clamp(above, 0.0, 1.0);
  vec3 dome = mix(HORIZON, ZENITH, pow(t, 0.4));
  float toSun = max(dot(normalize(d.xz + vec2(1e-5)), normalize(uSun.xz)), 0.0);
  float up = max(above, 0.0), side = pow(toSun, 3.0);
  dome += AFTERGLOW * exp(-up * 11.0) * (0.03 + 1.5 * side)
        + vec3(0.046, 0.018, 0.032) * exp(-up * 6.0) * side * 0.5
        + vec3(0.005, 0.016, 0.032) * exp(-up * 2.2) * (0.2 + 0.8 * side)
        + HORIZON * 0.9 * exp(-up * 22.0) * (1.0 - 0.55 * side);
  float thick = clamp(70000.0 / sqrt(2.0 * RE * h + h * h + 1.0), 0.004, 0.6);
  float limb = exp(-max(above, 0.0) / thick);
  vec3 space = mix(LIMB_NIGHT, LIMB_DAY, pow(toSun, 1.4)) * limb * (0.5 + 1.3 * toSun * toSun);
  return mix(space, dome, air);
}

vec3 toneMap(vec3 c, float exposure) { return pow(1.0 - exp(-c * exposure), vec3(1.0 / 2.2)); }
`

const HASH = `
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3(vec3 p) { return vec3(pcg3d(uvec3(ivec3(floor(p)) + 20000))) * (1.0 / 4294967296.0); }
`

export const VERT_FULL = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

/** Sky, stars, cloud, and the ground from pad level up to orbit. */
export const FRAG_BACK = `${HEAD}
uniform vec2 uRes;
uniform float uTime;
uniform float uPx;
uniform vec3 uCamR, uCamU, uCamF;   // camera axes
uniform vec2 uLens;                 // tan(half vertical field of view), aspect
uniform float uShiftY;              // lens shift, in half-screens
uniform float uEyeH;                // camera height above the ground, metres
uniform vec2 uEyeXZ;                // camera position east and south of the pad, metres
uniform float uFlood;               // pad lighting, 0 to 1
uniform vec3 uLightA, uLightB;      // directions to the two flood lamp banks
uniform vec4 uStack;                // height of the stack above the ground, its girth, deck height, shadow strength
uniform vec4 uFire;                 // engine light: east, height above ground, south, strength
uniform float uExposure;
uniform float uPixel;               // angle one pixel covers, radians
uniform sampler2D uNoise;
out vec4 o;
${SKY}
${HASH}

// Soft shadow of a capsule (a to b, radius r) on the ray from ro along rd. After Inigo Quilez.
float capShadow(vec3 ro, vec3 rd, vec3 a, vec3 b, float r, float k) {
  vec3 ba = b - a, oa = ro - a;
  float oad = dot(oa, rd), dba = dot(rd, ba), baba = dot(ba, ba), oaba = dot(oa, ba);
  vec2 th = vec2(-oad * baba + dba * oaba, oaba - oad * dba) / max(baba - dba * dba, 1e-4);
  th.x = max(th.x, 0.0001);
  th.y = clamp(th.y, 0.0, 1.0);
  float d = length((a + ba * th.y) - (ro + rd * th.x)) - r;
  float s = clamp(k * d / th.x + 0.5, 0.0, 1.0);
  return s * s * (3.0 - 2.0 * s);
}

// Distance along a downward ray to a sphere "drop" metres below the eye, radius RE + shell.
// Written to keep its precision whether the eye is two metres up or in orbit.
float toShell(float dy, float drop, float shell) {
  float rr = RE + shell + drop;
  float b = rr * dy, c = drop * (2.0 * (RE + shell) + drop);
  float disc = b * b - c;
  if (dy >= 0.0 || disc <= 0.0) return -1.0;
  return c / (-b + sqrt(disc));
}

vec3 stars(vec3 d) {
  vec2 sph = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0)));
  vec3 sum = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float cell = layer == 0 ? 0.011 : 0.027;
    vec2 g = sph / cell;
    vec2 id = floor(g);
    vec3 h = hash3(vec3(id, float(layer) * 7.0 + 3.0));
    vec3 h2 = hash3(vec3(id, float(layer) * 7.0 + 11.0));
    float dist = length(g - id - (0.15 + 0.7 * h.xy));
    float b = h.z * h.z; b *= b;
    b *= b;
    float rad = (0.7 + 0.9 * b) * uPixel / cell;
    float tw = 0.8 + 0.2 * sin(uTime * (0.9 + 2.2 * h2.x) + h2.y * 40.0);
    float core = 1.0 - smoothstep(rad * 0.2, rad, dist);
    sum += mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.72), h2.z) * (0.035 + 0.965 * b) * core * tw * (layer == 0 ? 0.55 : 1.7);
  }
  return sum;
}

float n1(vec2 p) { return texture(uNoise, p).r; }
float n2(vec2 p) { return texture(uNoise, p).g; }
// Cloud cover at a point (metres): three sizes of pattern, each turned a different way, so no tile shows.
float cloudCover(vec2 p) {
  vec2 a = mat2(0.8, -0.6, 0.6, 0.8) * p / 410000.0, b = mat2(0.6, 0.8, -0.8, 0.6) * p / 61000.0;
  float c = n1(a + uTime * 0.0002) * 0.55 + n2(b + uTime * 0.0011) * 0.3 + texture(uNoise, p / 2300000.0 + 0.37).b * 0.5;
  return smoothstep(0.62, 0.86, c);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  ndc.y -= uShiftY;
  vec3 d = normalize(uCamF + uCamR * (ndc.x * uLens.x * uLens.y) + uCamU * (ndc.y * uLens.x));
  float h = max(uEyeH, 1.0);
  vec3 col = skyColor(d, h);
  float air = exp(-h / 8500.0);
  float dip = horizonDip(h);
  float above = d.y + dip;

  // ---- stars, the rising sun, high cloud seen from below
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  if (above > 0.0) col += stars(d) * (1.0 - smoothstep(0.006, 0.07, lum)) * smoothstep(0.0, 0.03, above);
  float sunUp = smoothstep(-0.01, 0.05, uSun.y + dip);
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.86, 0.66) * sunUp * (pow(sd, 2500.0) * 30.0 + pow(sd, 90.0) * 0.5 + pow(sd, 9.0) * 0.07) * smoothstep(-0.004, 0.012, above);
  const float CLOUD = 9000.0;
  if (d.y > 0.015 && h < CLOUD) {
    float tc = (CLOUD - h) / d.y;
    float cov = cloudCover(uEyeXZ + d.xz * tc) * exp(-tc / 90000.0);
    float toSun = max(dot(normalize(d.xz), normalize(uSun.xz)), 0.0);
    vec3 lit = vec3(0.030, 0.040, 0.060) + AFTERGLOW * 0.75 * pow(toSun, 2.0) * exp(-d.y * 4.5) + vec3(0.04, 0.016, 0.026) * pow(toSun, 3.0) * exp(-d.y * 2.6);
    col = mix(col, lit, cov * 0.7 * air);
  }

  // ---- the ground
  float t = toShell(d.y, h, 0.0);
  if (t > 0.0) {
    vec2 p = uEyeXZ + d.xz * t;
    float dist = length(p);
    vec3 nrm = normalize(vec3(p.x, RE, p.y));
    float sunlit = smoothstep(-0.085, 0.10, dot(nrm, uSun));
    // land to the west, sea to the east, a ragged coast between
    float coast = p.x - 2600.0 - 3800.0 * (n1(p / 61000.0) - 0.5) - 900.0 * (n2(p / 9000.0) - 0.5);
    float sea = smoothstep(-60.0, 60.0, coast);
    float patch_ = n1(p / 2300.0 + 0.3) * 0.6 + n2(p / 310.0) * 0.4;
    vec3 land = mix(vec3(0.030, 0.038, 0.026), vec3(0.060, 0.054, 0.040), patch_);
    land = mix(land, vec3(0.085, 0.075, 0.058), smoothstep(0.62, 0.9, n2(p / 37000.0 + 0.7)) * 0.7);   // dry country inland
    vec3 water = vec3(0.012, 0.022, 0.036);
    vec3 alb = mix(land, water, sea);

    // near the pad: hard-stand, flame trench, crawler road
    float near = 1.0 - smoothstep(900.0, 2600.0, dist);
    if (near > 0.0) {
      float road = (1.0 - smoothstep(11.0, 14.0, abs(p.y))) * step(p.x, -20.0) * (1.0 - smoothstep(1500.0, 2400.0, -p.x));
      alb = mix(alb, vec3(0.13, 0.115, 0.095) * (0.85 + 0.3 * n2(p / 23.0)), road * near);
      float apron = 1.0 - smoothstep(205.0, 235.0, dist);
      vec3 slab = vec3(0.15, 0.148, 0.142) * (0.74 + 0.36 * n1(p / 61.0) + 0.14 * n2(p / 7.0));
      slab *= 1.0 - 0.3 * smoothstep(0.55, 0.8, n2(p / 140.0 + 0.4));   // old scorch and tyre marks
      float joints = smoothstep(0.93, 1.0, cos(atan(p.y, p.x) * 16.0)) + smoothstep(0.9, 1.0, cos(dist * 0.21));
      slab *= 1.0 - 0.22 * min(joints, 1.0);
      alb = mix(alb, slab, apron);
      float trench = (1.0 - smoothstep(7.0, 9.0, abs(p.y))) * (1.0 - smoothstep(60.0, 72.0, abs(p.x)));
      alb = mix(alb, vec3(0.035, 0.032, 0.03), trench * 0.8);
      float ring = 1.0 - smoothstep(0.0, 1.3, abs(dist - 74.0));
      alb = mix(alb, vec3(0.42, 0.33, 0.10), ring * 0.35 * apron);
    }

    // light: dusk sky, the far daylight, the pad's lamps with the stack's shadow, the engines
    vec3 light = vec3(0.010, 0.016, 0.028) * (0.6 + 0.4 * air) + vec3(1.0, 0.93, 0.82) * sunlit * 0.75;
    if (uFlood > 0.0 && dist < 900.0) {
      vec3 gp = vec3(p.x, 0.0, p.y);
      vec3 a = vec3(0.0, uStack.z, 0.0), b = vec3(0.0, uStack.x, 0.0);
      float pool = exp(-dist * dist / 5600.0) + 0.12 * exp(-dist / 190.0);
      float sa = mix(1.0, capShadow(gp, uLightA, a, b, uStack.y, 5.0), uStack.w);
      float sb = mix(1.0, capShadow(gp, uLightB, a, b, uStack.y, 5.0), uStack.w);
      light += uFlood * pool * (vec3(1.0, 0.97, 0.90) * 0.95 * sa + vec3(1.0, 0.82, 0.6) * 0.22 * sb);
    }
    if (uFire.w > 0.0) {
      vec2 e = p - uFire.xz;
      float fall = 1.0 / (1.0 + dot(e, e) / (900.0 + uFire.y * uFire.y * 2.0));
      light += vec3(1.0, 0.55, 0.22) * uFire.w * fall * (2.4 / (1.0 + uFire.y * 0.012));
    }
    vec3 g = alb * light;
    if (uFlood > 0.0 && dist < 420.0) {
      float wet = (1.0 - smoothstep(170.0, 230.0, dist)) * (0.3 + 0.7 * n1(p / 19.0));
      vec3 mirror = reflect(d, vec3(0.0, 1.0, 0.0));
      float glance = pow(1.0 - clamp(-d.y, 0.0, 1.0), 5.0);
      float streak = pow(max(dot(mirror, uLightA), 0.0), 60.0) + pow(max(dot(mirror, uLightB), 0.0), 60.0);
      g += wet * (skyColor(mirror, h) * glance * 0.9 + vec3(1.0, 0.95, 0.86) * streak * 0.35 * uFlood);
    }
    // lights of towns on the dark land, seen from high up
    float town = smoothstep(0.80, 0.93, n1(p / 5200.0 + 0.11)) * smoothstep(0.55, 0.85, n2(p / 880.0)) * (1.0 - sea) * (1.0 - sunlit);
    g += vec3(1.0, 0.72, 0.38) * town * 0.11 * smoothstep(1500.0, 9000.0, h);
    // the sea mirrors the sky at a glancing angle
    vec3 refl = skyColor(reflect(d, vec3(0.0, 1.0, 0.0)), min(h, 2000.0));
    g += refl * sea * (0.05 + 0.85 * pow(1.0 - clamp(-d.y, 0.0, 1.0), 6.0));
    // cloud deck seen from above
    if (h > CLOUD) {
      float tc = toShell(d.y, h - CLOUD, CLOUD);
      float cov = cloudCover(uEyeXZ + d.xz * max(tc, 0.0));
      vec3 top = vec3(0.022, 0.030, 0.046) + vec3(1.0, 0.92, 0.82) * sunlit * 0.6;
      g = mix(g, top, cov * 0.85 * step(0.0, tc));
    }
    // air between the eye and the ground: thick along the limb
    float hazeAmt = 1.0 - exp(-t / mix(9000.0, 3400000.0, 1.0 - air * air));
    float lowH = min(h, 3000.0);
    vec3 flat_ = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0));
    vec3 hazeCol = skyColor(vec3(flat_.x, 0.02 - horizonDip(lowH), flat_.z), lowH);   // the sky just above the horizon, the same way round
    hazeCol = mix(hazeCol, LIMB_DAY * 0.5, sunlit * (1.0 - air) * 0.6);
    col = mix(g, hazeCol, hazeAmt);
  }

  // a soft halo in the damp air round the lit pad
  if (uFlood > 0.0) {
    vec3 pad = vec3(-uEyeXZ.x, uStack.x * 0.5 - h, -uEyeXZ.y);
    float along = max(dot(pad, d), 0.0);
    float miss = length(pad - d * along);
    col += vec3(0.55, 0.70, 0.95) * uFlood * (0.016 * exp(-miss * miss / 4200.0) + 0.006 * exp(-miss / 110.0)) / (1.0 + along * 0.0016);
  }
  // punching through the cloud deck
  col = mix(col, vec3(0.05, 0.06, 0.08) + AFTERGLOW * 0.2, 0.55 * exp(-abs(h - CLOUD) / 420.0));

  vec2 v = gl_FragCoord.xy / uRes - 0.5;
  col *= 1.0 - 0.95 * dot(v, v);
  col = toneMap(col, uExposure);
  col += (hash3(vec3(gl_FragCoord.xy, mod(uTime * 60.0, 512.0))).x - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`

export const VERT_MESH = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNrm;
layout(location = 2) in vec4 aCol;
layout(location = 3) in vec4 aAux;
uniform mat4 uViewProj;
uniform mat4 uModel;
out vec3 vPos;
out vec3 vObj;
out vec3 vNrm;
out vec4 vCol;
out vec4 vAux;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vPos = w.xyz;
  vObj = aPos;
  vNrm = mat3(uModel) * aNrm;
  vCol = aCol;
  vAux = aAux;
  gl_Position = uViewProj * w;
}`

/** Painted and metal surfaces under three lights, the sky and the engines. */
export const FRAG_MESH = `${HEAD}
uniform vec3 uEye;
uniform float uEyeH;
uniform vec3 uLightDir[3];
uniform vec3 uLightCol[3];
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec4 uFire;        // engine light: position in the scene, strength
uniform vec3 uFogCol;
uniform float uFog;        // per metre
uniform float uExposure;
uniform float uTime;
uniform vec2 uLampFade;    // height by which the lamp light has faded, and how much of it is lamp light
uniform vec2 uPadXZ;       // where the pad is in the scene: the lamps light what stands near it
uniform vec2 uMirror;      // x: above 0 while drawing the reflection in the wet hard-stand, y: the ground's height
uniform sampler2D uNoise;
in vec3 vPos;
in vec3 vObj;
in vec3 vNrm;
in vec4 vCol;
in vec4 vAux;
out vec4 o;
${SKY}
float dither(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453) - 0.5; }
void main() {
  vec3 N = normalize(vNrm), V = normalize(uEye - vPos);
  vec3 alb = vCol.rgb * vCol.rgb;
  float rough = vCol.a, metal = vAux.r, glow = vAux.g, ao = vAux.b, seam = vAux.a * 10.0;
  // wear: soft blotches, fine grain, streaks running down, and a dark line at each weld ring
  float blotch = texture(uNoise, vObj.xy * 0.037 + vObj.z * 0.029).r;
  float grain = texture(uNoise, vObj.xy * 0.41 + vObj.zx * 0.33).g;
  float streak = texture(uNoise, vec2(vObj.x * 0.31 + vObj.z * 0.47, vObj.y * 0.021)).b;
  float wear = mix(0.16, 0.5, smoothstep(0.75, 0.95, rough));
  alb *= 1.0 - wear + wear * (0.9 * blotch + 0.5 * grain + 0.55 * streak);
  rough = clamp(rough + (blotch - 0.5) * 0.18, 0.04, 1.0);
  if (seam > 0.0) {
    float ring = abs(fract(vObj.y / seam + 0.5) - 0.5) * seam;
    alb *= 1.0 - 0.3 * (1.0 - smoothstep(0.015, 0.06, ring));
  }
  vec3 f0 = mix(vec3(0.04), alb, metal);
  vec3 base = alb * (1.0 - 0.85 * metal);
  float nv = max(dot(N, V), 0.0);
  vec3 col = base * mix(uAmbGround, uAmbSky, N.y * 0.5 + 0.5) * ao;
  float shin = mix(260.0, 5.0, sqrt(rough));
  for (int i = 0; i < 3; i++) {
    vec3 L = uLightDir[i];
    float nl = dot(N, L);
    float diff = clamp(nl * 0.92 + 0.08, 0.0, 1.0);
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), shin) * (shin + 8.0) * 0.04 * max(nl, 0.0);
    vec2 off = vPos.xz - uPadXZ;
    float reach = i == 2 ? 1.0 : mix(1.0, mix(1.0, 0.5, smoothstep(0.0, uLampFade.x, vPos.y)) * (0.04 + 0.96 * exp(-dot(off, off) / 11000.0)), uLampFade.y);
    col += uLightCol[i] * reach * (base * diff + f0 * spec * (1.0 - 0.6 * rough)) * mix(0.5, 1.0, ao);
  }
  // the sky in smooth and metal surfaces, strongest at a glancing angle
  float fres = pow(1.0 - nv, 4.0);
  vec3 env = skyColor(normalize(reflect(-V, N)), uEyeH);
  col += env * mix(f0, vec3(1.0), fres) * (1.0 - rough) * (0.5 + 2.5 * metal) * ao;
  // firelight on whatever faces the engines
  vec3 toFire = uFire.xyz - vPos;
  float df = length(toFire);
  col += base * vec3(1.0, 0.56, 0.24) * uFire.w * max(dot(N, toFire / df) * 0.8 + 0.2, 0.0) * 9.0 / (1.0 + df * df * 0.006);
  col += alb * glow * 5.0;
  col = mix(col, uFogCol, 1.0 - exp(-length(uEye - vPos) * uFog));
  col = toneMap(col, uExposure);
  if (uMirror.x > 0.0) {
    // this fragment is a mirror image under the ground: fade it with the height of the real point,
    // and break it up where the concrete is dry
    float under = uMirror.y - vPos.y;
    if (under < 0.0) discard;
    vec3 ray = vPos - uEye;
    vec3 hit = uEye + ray * ((uEye.y - uMirror.y) / max(uEye.y - vPos.y, 0.001));
    vec2 q = hit.xz - uPadXZ;
    float wet = (1.0 - smoothstep(170.0, 230.0, length(q))) * (0.25 + 0.75 * texture(uNoise, q / 19.0).r);
    float a = uMirror.x * wet * exp(-under / 38.0);
    o = vec4(col * a, a);
    return;
  }
  o = vec4(col + dither(gl_FragCoord.xy) / 255.0, 1.0);
}`

export const VERT_FX = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aCol;
layout(location = 3) in vec2 aKind;
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
out vec2 vKind;
void main() { vUv = aUv; vCol = aCol; vKind = aKind; gl_Position = uViewProj * vec4(aPos, 1.0); }`

/**
 * Flames, glows, light shafts and smoke, drawn after everything else. Output is premultiplied:
 * light adds (alpha 0), smoke covers (alpha above 0).
 * Kinds: 0 glow, 1 flame (v runs from the nozzle to the tip), 2 smoke, 3 light shaft.
 */
export const FRAG_FX = `${HEAD}
uniform sampler2D uNoise;
uniform float uTime;
in vec2 vUv;
in vec4 vCol;
in vec2 vKind;
out vec4 o;
void main() {
  float kind = vKind.x, seed = vKind.y;
  vec2 c = vUv * 2.0 - 1.0;
  float r = length(c);
  if (kind < 0.5) {
    float a = pow(max(1.0 - r, 0.0), 2.4);
    o = vec4(vCol.rgb * a * vCol.a, 0.0);
  } else if (kind < 1.5) {
    float y = vUv.y, x = abs(c.x);
    float n = texture(uNoise, vec2(vUv.x * 0.35 + seed, y * 0.55 - uTime * 2.6)).r;
    float m = texture(uNoise, vec2(vUv.x * 1.3 + seed * 3.0, y * 2.0 - uTime * 5.0)).g;
    float width = mix(0.42, 1.0, pow(y, 0.7)) * (0.86 + 0.3 * n);
    float shape = 1.0 - smoothstep(width * 0.25, width, x + (m - 0.5) * 0.3 * y);
    float fade = pow(1.0 - y, 1.25) * smoothstep(0.0, 0.03, y);
    vec3 hot = mix(vec3(1.0, 0.98, 0.92), vCol.rgb, smoothstep(0.0, 0.45, y + x * 0.5));
    o = vec4(hot * shape * fade * vCol.a * (0.8 + 0.4 * n), 0.0);
  } else if (kind < 2.5) {
    float n = texture(uNoise, vUv * 0.42 + seed).r, m = texture(uNoise, vUv * 1.1 + seed * 1.7).g;
    float a = (1.0 - smoothstep(0.25, 1.0, r + (n - 0.5) * 0.75 + (m - 0.5) * 0.3)) * vCol.a;
    o = vec4(vCol.rgb * (0.72 + 0.5 * m) * a, a);
  } else {
    float a = pow(max(1.0 - abs(c.x), 0.0), 1.6) * pow(1.0 - vUv.y, 0.7) * smoothstep(0.0, 0.05, vUv.y) * vCol.a;
    o = vec4(vCol.rgb * a, 0.0);
  }
}`
