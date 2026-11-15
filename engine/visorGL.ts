/**
 * MARSWEAVE — astronaut-eye renderer on the GPU (WebGL2, no libraries).
 *
 * This draws the SAME scene as engine/visorRender.ts (the software renderer) but on the graphics card, so the view runs at
 * the screen's frame rate instead of 2-7 frames per second. The software renderer stays as a fallback for machines
 * without WebGL2.
 *
 * WHAT IS REAL AND WHAT IS NOT (identical to the software renderer, shown in the view's footer)
 *  - Landform: REAL USGS MOLA-HRSC DEM (the same 512x512 height map, uploaded as a texture).
 *  - Fine relief, ground texture, pebbles, rocks: PROCEDURAL (invented, deterministic noise). Rocks are baked once into two
 *    small tiling textures; the ray marcher reads them like a height map.
 *  - Haze: MODELLED from the dust optical depth. Sky colours / sun: MODELLED. Shadows: DERIVED from the DEM + sun direction
 *    (computed on the GPU whenever the sun moves).
 *  - Sharpening, bloom, contrast, grain: cosmetic image processing.
 *
 * Passes per frame: (1) scene: one ray per pixel marched through the height map (Lipschitz-bounded steps, fine steps only
 * in the 3.4 m "rock band" above the ground), (2) post: bicubic up-scaling, light edge smoothing, sharpening, bloom, tone.
 * The scene is drawn at a lower internal resolution when the GPU is slow (see VisorView, dynamic resolution).
 */

import {
  HeightMap, ViewParams, DUST_SCALE_HEIGHT_M, STORM_VISUAL_BOOST, skyPalette, terrainHeight, makeProjector
} from './visorRender';

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------------
// Shader sources
// ---------------------------------------------------------------------------------------------------------------

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Integer hash (PCG) and value noise, shared by all fragment shaders. */
const COMMON = `
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float hashI(ivec2 p) {
  uint h = pcg(uint(p.x) + pcg(uint(p.y)));
  return float(h >> 8) * (1.0 / 16777216.0);
}
float vnoise(vec2 p) {
  vec2 ip = floor(p);
  vec2 f = p - ip;
  f = f * f * (3.0 - 2.0 * f);
  ivec2 i = ivec2(ip);
  float a = hashI(i);
  float b = hashI(i + ivec2(1, 0));
  float c = hashI(i + ivec2(0, 1));
  float d = hashI(i + ivec2(1, 1));
  return a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
}
`;

/** Bakes one periodic tile of procedural rocks (R8: rock height / uMaxH). */
const ROCK_FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;
uniform float uP;
uniform float uTexN;
uniform int uPopN;
uniform vec4 uPopA[2];   // cell size (m), threshold, size min (m), size range (m)
uniform vec4 uPopB[2];   // shape k, noise freq (1/m), salt, offset amplitude (cells)
uniform float uMaxH;
${COMMON}
float vnoiseP(vec2 p, float per) {
  vec2 ip = floor(p);
  vec2 f = p - ip;
  f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(ip.x, per), y0 = mod(ip.y, per);
  float x1 = mod(ip.x + 1.0, per), y1 = mod(ip.y + 1.0, per);
  float a = hashI(ivec2(int(x0), int(y0)));
  float b = hashI(ivec2(int(x1), int(y0)));
  float c = hashI(ivec2(int(x0), int(y1)));
  float d = hashI(ivec2(int(x1), int(y1)));
  return a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
}
void main() {
  vec2 w = (floor(gl_FragCoord.xy) + 0.5) / uTexN * uP;
  float best = 0.0;
  for (int k = 0; k < 2; k++) {
    if (k >= uPopN) break;
    float cs = uPopA[k].x;
    float thr = uPopA[k].y;
    float smin = uPopA[k].z;
    float srange = uPopA[k].w;
    float shapeK = uPopB[k].x;
    float nf = uPopB[k].y;
    int sl = int(uPopB[k].z);
    float offAmp = uPopB[k].w;
    float ncell = floor(uP / cs + 0.5);
    ivec2 c0 = ivec2(floor(w / cs));
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        ivec2 c = c0 + ivec2(i, j);
        ivec2 cw = ivec2(int(mod(float(c.x), ncell)), int(mod(float(c.y), ncell)));
        float r = hashI(cw + ivec2(sl, sl * 3 + 1));
        if (r <= thr) continue;
        float size = smin + srange * hashI(cw + ivec2(13 + sl, 71));
        vec2 off = (vec2(hashI(cw + ivec2(7 + sl, 19)), hashI(cw + ivec2(29, 5 + sl))) - 0.5) * offAmp;
        vec2 d = w / cs - vec2(c) - 0.5 - off;
        // each rock: random orientation and aspect, boulder-like profile (steeper sides than a dome), lumpy surface
        float ang = hashI(cw + ivec2(41 + sl, 3)) * 6.2831853;
        float asp = 0.7 + 0.7 * hashI(cw + ivec2(5, 97 + sl));
        vec2 dr = vec2(cos(ang) * d.x + sin(ang) * d.y, -sin(ang) * d.x + cos(ang) * d.y);
        dr = vec2(dr.x * asp, dr.y / asp);
        float rr = dot(dr, dr) / ((size / cs) * (size / cs) * shapeK);
        if (rr < 1.0) {
          float prof = pow(1.0 - rr, 0.45);
          float lump = (0.75 + 0.5 * vnoiseP(w * nf, uP * nf)) * (0.9 + 0.2 * vnoiseP(w * nf * 4.0, uP * nf * 4.0));
          best = max(best, size * prof * lump);
        }
      }
    }
  }
  outColor = vec4(best / uMaxH, 0.0, 0.0, 1.0);
}
`;

/** Terrain self-shadow of the height map for one sun direction (R8, 1 = shadowed, soft edge). */
const SHADOW_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 outColor;
uniform sampler2D uHeight;
uniform float uBase;
uniform float uN;
uniform vec2 uM;
uniform vec2 uWorld;
uniform vec2 uSunH;
uniform float uTanEl;
float terrH(vec2 p) {
  vec2 uv = (p / uM + 0.5) / uN;
  vec2 hl = textureLod(uHeight, uv, 0.0).rg;
  return uBase + hl.x + hl.y;
}
void main() {
  vec2 p0 = floor(gl_FragCoord.xy) * uM;
  float h0 = terrH(p0);
  float sh = 0.0;
  for (int s = 1; s <= 120; s++) {
    float fs = float(s);
    float d = fs * uM.x * (1.0 + max(0.0, fs - 60.0) * 0.05);
    vec2 p = p0 + uSunH * d;
    if (p.x < 0.0 || p.y < 0.0 || p.x > uWorld.x || p.y > uWorld.y) break;
    float ex = terrH(p) - (h0 + d * uTanEl);
    if (ex > 0.0) {
      sh = max(sh, smoothstep(0.0, 1.0 + 0.012 * d, ex));
      if (sh > 0.999) break;
    }
  }
  outColor = vec4(sh, 0.0, 0.0, 1.0);
}
`;

const SCENE_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 outColor;

uniform sampler2D uHeight;   // RG16F: height = uBase + r + g
uniform sampler2D uShadow;   // R8
uniform sampler2D uRockA;    // R8 tile (cobbles + stones), period uPA
uniform sampler2D uRockB;    // R8 tile (boulders), period uPB
uniform sampler2D uAlbedo;   // R8, 0..1

uniform vec2  uRes;
uniform float uFocal;
uniform float uHorizonY;
uniform vec2  uCam;
uniform float uCamH;
uniform vec2  uF;
uniform vec2  uR;
uniform vec3  uSunVec;       // east, up, south
uniform vec2  uSunH;         // horizontal unit vector (east, south)
uniform vec3  uSunCam;       // right, up, forward
uniform float uBeta;
uniform float uTau;
uniform float uProc;
uniform float uHasAlb;
uniform float uBase;
uniform float uN;
uniform vec2  uM;
uniform vec2  uWorld;
uniform float uLip;
uniform float uHMax;
uniform vec3  uHorizon;
uniform vec3  uZenith;
uniform vec3  uAmbient;
uniform vec3  uSunTint;
uniform float uExposure;
uniform vec2  uAlbDim;
uniform float uPA;
uniform float uPB;
uniform float uDebug;

const float PI = 3.14159265359;
const float MAX_DIST = 9000.0;
const float ROCK_A_MAX = 1.2;
const float ROCK_B_MAX = 3.2;
const float ROCK_BAND = 3.4;
const float ROCK_MAXZ = 420.0;
const int MAX_IT = 420;
${COMMON}

float terrH(vec2 p) {
  vec2 uv = (p / uM + 0.5) / uN;
  vec2 hl = textureLod(uHeight, uv, 0.0).rg;
  return uBase + hl.x + hl.y;
}

float rockRaw(vec2 p, float z) {
  float h = textureLod(uRockB, fract(p / uPB), 0.0).r * ROCK_B_MAX;
  if (z < 130.0) h = max(h, textureLod(uRockA, fract(p / uPA), 0.0).r * ROCK_A_MAX);
  return h;
}

float fadeIn(float z) { return clamp((z - 3.5) / 7.5, 0.0, 1.0); }

void main() {
  float pyTop = uRes.y - gl_FragCoord.y;
  float u = (gl_FragCoord.x - uRes.x * 0.5) / uFocal;
  float v = (uHorizonY - pyTop) / uFocal;
  vec2 d2 = uF + uR * u;
  float closing0 = uLip * length(d2);
  bool proc = uProc > 0.5;

  // haze colour of this column (also the sky colour at the horizon): horizon sky plus a bit of sun glow
  float cosang = (u * uSunCam.x + uSunCam.z) / sqrt(u * u + 1.0);
  float glowH = pow(max(0.0, cosang), 6.0) * 0.35;
  vec3 hz = mix(uHorizon, uSunTint, min(0.6, glowH)) * uExposure;

  // ---- march ------------------------------------------------------------------------------------------------
  float z = 1.0;
  float zPrev = 1.0;
  bool hit = false;
  bool escaped = false;
  int iters = 0;
  for (int i = 0; i < MAX_IT; i++) {
    iters = i;
    vec2 p = uCam + d2 * z;
    float rayH = uCamH + v * z;
    if (v >= 0.0 && rayH > uHMax) { escaped = true; break; }
    float gapT = rayH - terrH(p);
    float hR = 0.0;
    bool band = false;
    if (proc && z > 3.5 && z < ROCK_MAXZ && gapT < ROCK_BAND) {
      hR = rockRaw(p, z) * fadeIn(z);
      band = true;
    }
    if (gapT - hR <= 0.0) { hit = true; break; }
    zPrev = z;
    float minStep = max(0.3, z * (z < 60.0 ? 0.014 : 0.02));
    float dz = minStep;
    if (!band) {
      float cl = max(-v, 0.0) + closing0;
      float room = gapT - ((proc && z < ROCK_MAXZ) ? ROCK_BAND : 0.0);
      dz = max(minStep, 0.8 * room / max(cl, 1e-3));
    }
    z += dz;
    if (z > MAX_DIST) { escaped = true; break; }
  }
  if (!hit && !escaped) hit = true;   // iteration budget used up: shade what we reached (far, hazy terrain)

  if (uDebug > 0.5) {
    float t = float(iters) / float(MAX_IT);
    outColor = vec4(t, hit ? 1.0 - t : 0.0, 0.0, 1.0);
    return;
  }

  vec3 col;
  if (hit) {
    // refine the hit between the last two samples
    float lo = zPrev, hi = z;
    for (int k = 0; k < 7; k++) {
      float m = 0.5 * (lo + hi);
      vec2 pm = uCam + d2 * m;
      float rm = uCamH + v * m;
      float gT = rm - terrH(pm);
      float hr = 0.0;
      if (proc && m > 3.5 && m < ROCK_MAXZ && gT < ROCK_BAND) hr = rockRaw(pm, m) * fadeIn(m);
      if (gT - hr <= 0.0) hi = m; else lo = m;
    }
    z = hi;
    vec2 p = uCam + d2 * z;
    float hT = terrH(p);
    float fd = fadeIn(z);
    float rock = (proc && z > 3.5 && z < ROCK_MAXZ) ? rockRaw(p, z) * fd : 0.0;
    float hh = hT + rock;

    // smooth terrain normal from the height map, cavity (cheap ambient occlusion)
    float hxp = terrH(p + vec2(uM.x, 0.0)), hxm = terrH(p - vec2(uM.x, 0.0));
    float hyp = terrH(p + vec2(0.0, uM.y)), hym = terrH(p - vec2(0.0, uM.y));
    float gx = (hxp - hxm) / (2.0 * uM.x);
    float gy = (hyp - hym) / (2.0 * uM.y);
    float cav = 0.25 * (terrH(p + vec2(4.0 * uM.x, 0.0)) + terrH(p - vec2(4.0 * uM.x, 0.0))
                      + terrH(p + vec2(0.0, 4.0 * uM.y)) + terrH(p - vec2(0.0, 4.0 * uM.y))) - hT;

    float rgx = 0.0, rgy = 0.0;
    if (proc && z < 160.0) {
      float e2 = 0.35;
      rgx = (rockRaw(p + vec2(e2, 0.0), z) - rockRaw(p - vec2(e2, 0.0), z)) / (2.0 * e2) * fd;
      rgy = (rockRaw(p + vec2(0.0, e2), z) - rockRaw(p - vec2(0.0, e2), z)) / (2.0 * e2) * fd;
    }
    float rockShade = 1.0;
    if (proc && z < 120.0 && rock < 0.03) {
      float tanEl = uSunVec.y / max(length(vec2(uSunVec.x, uSunVec.z)), 1e-4);
      float dMax = z < 60.0 ? 4.2 : 2.4;
      for (int k = 1; k <= 14; k++) {
        float d = 0.3 * float(k);
        if (d > dMax) break;
        if (rockRaw(p + uSunH * d, z) > d * tanEl) { rockShade = 0.42; break; }
      }
    }
    vec3 nrm = normalize(vec3(-gx - rgx, 1.0, -gy - rgy));
    float slope = acos(clamp(nrm.y, -1.0, 1.0));
    float diff = max(0.0, dot(nrm, uSunVec));
    float shadow = textureLod(uShadow, (p / uM + 0.5) / uN, 0.0).r;
    float aoF = clamp(1.0 - cav * 0.09, 0.72, 1.12);
    float rk = smoothstep(0.015, 0.09, rock);
    float lit = (0.30 + 1.05 * diff * (1.0 - 0.88 * shadow) + 0.22 * rk) * aoF;

    // albedo: regolith patches, real Viking brightness, rocks
    float patchA = proc ? vnoise(p / 180.0) : 0.5;
    float patchB = proc ? vnoise(p / 23.0 + vec2(40.0, 0.0)) : 0.5;
    float realA = 1.0;
    if (uHasAlb > 0.5) {
      vec2 t = p / uWorld * (uAlbDim - 1.0);
      realA = 0.78 + 0.44 * textureLod(uAlbedo, (t + 0.5) / uAlbDim, 0.0).r;
    }
    vec3 soil = mix(vec3(172.0, 108.0, 74.0), vec3(140.0, 90.0, 66.0), patchA) / 255.0;
    vec3 rockc = mix(vec3(118.0, 90.0, 76.0), vec3(92.0, 74.0, 66.0), vnoise(p * 3.1)) / 255.0;
    vec3 alb = mix(soil, rockc, rk);
    float dark = min(0.35, slope * 1.6);
    alb *= (0.86 + 0.28 * patchB) * (1.0 - dark) * rockShade * realA;

    // ground texture: octaves fade out where one pixel would span more than the feature (no aliasing)
    float tex = 1.0;
    if (proc && z < 450.0) {
      float fp = (z * z) / (max(0.8, uCamH - hh) * uFocal);
      float w2 = clamp(1.25 - fp * 1.3 * 0.7, 0.0, 1.0);
      float w3 = clamp(1.25 - fp * 4.5 * 0.7, 0.0, 1.0);
      float w4 = clamp(1.25 - fp * 15.0 * 0.7, 0.0, 1.0);
      float w5 = clamp(1.25 - fp * 40.0 * 0.7, 0.0, 1.0);
      float t0 = (vnoise(p * 0.12) - 0.5) * 0.16 + (vnoise(p * 0.4) - 0.5) * 0.15;
      if (w2 > 0.0) t0 += (vnoise(p * 1.3) - 0.5) * 0.16 * w2;
      if (w3 > 0.0) {
        float n3 = vnoise(p * 4.5);
        t0 += (n3 - 0.5) * 0.20 * w3;
        if (z < 90.0) t0 -= (vnoise(p * 4.5 + uSunH * 0.4) - n3) * 0.55 * w3 * min(1.0, (90.0 - z) / 40.0);
      }
      if (w4 > 0.0) {
        float n4 = vnoise(p * 15.0);
        t0 += (n4 - 0.5) * 0.18 * w4;
        if (z < 40.0) t0 -= (vnoise(p * 15.0 + uSunH * 0.4) - n4) * 0.5 * w4 * min(1.0, (40.0 - z) / 20.0);
      }
      if (w5 > 0.0) t0 += (hashI(ivec2(floor(p * 40.0))) - 0.5) * 0.16 * w5;
      tex = 1.0 + t0;
      // pebbles near the camera: tiny stones with a lit side and a short shadow on the far side (two sizes)
      if (z < 35.0) {
        for (int L = 0; L < 2; L++) {
          float cs = L == 0 ? 0.45 : 1.2;
          float wp = clamp(1.25 - fp * (L == 0 ? 4.0 : 1.6) * 0.7, 0.0, 1.0);
          if (wp <= 0.0) continue;
          ivec2 cc = ivec2(floor(p / cs));
          if (hashI(cc + ivec2(777 + L * 91, -313)) < (L == 0 ? 0.7 : 0.85)) continue;
          float rad = 0.2 + 0.13 * hashI(cc + ivec2(9, 5 + L));
          vec2 dd = p / cs - vec2(cc) - vec2(0.5 + (hashI(cc + ivec2(31, 2)) - 0.5) * 0.3,
                                             0.5 + (hashI(cc + ivec2(4, 47)) - 0.5) * 0.3);
          float dl = length(dd);
          float dn = dl / rad;
          float along = dot(dd, uSunH);
          if (dn < 1.0) tex *= 1.0 + wp * (-0.1 + 0.42 * (along / max(dl, 1e-4)) * dn + 0.1 * (1.0 - dn));
          else if (dn < 2.2 && along < 0.0) tex *= 1.0 - wp * 0.32 * ((2.2 - dn) / 1.2) * min(1.0, -along / (rad * 0.8));
        }
      }
    }

    vec3 c = alb * lit * tex;
    c += uAmbient * 0.10;
    c *= uExposure;
    float trans = exp(-uBeta * z);
    col = c * trans + hz * (1.0 - trans);
  } else if (v < 0.0) {
    col = hz;
  } else {
    // sky
    float elev = atan(v);
    float t = pow(clamp(elev / (75.0 * PI / 180.0), 0.0, 1.0), 0.55);
    vec3 c = mix(uHorizon, uZenith, t);
    if (proc && elev > 0.12) {
      float band = vnoise(vec2(u * 2.4 + 11.0, v * 16.0)) * 0.65 + vnoise(vec2(u * 5.5 + 3.0, v * 34.0)) * 0.35;
      float cl = max(0.0, band - 0.56) * 1.5 * min(1.0, (elev - 0.12) / 0.25) * exp(-uTau * 0.5);
      c = mix(c, vec3(250.0, 226.0, 205.0) / 255.0, min(0.28, cl));
    }
    vec3 dirv = vec3(u, v, 1.0);
    float cosS = dot(dirv, uSunCam) / length(dirv);
    float core = clamp((cosS - 0.99994517) / (0.9999619 - 0.99994517), 0.0, 1.0);
    float halo = pow(max(0.0, cosS), 40.0) * 0.55 + pow(max(0.0, cosS), 6.0) * 0.16;
    c = mix(c, uSunTint, min(0.85, halo * exp(-uTau * 0.35)));
    c = mix(c, vec3(255.0, 251.0, 242.0) / 255.0, core * exp(-uTau * 0.15));
    col = c * uExposure;
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const POST_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uSceneSize;
uniform vec2 uOutSize;
uniform float uSharpen;
uniform float uContrast;
uniform float uSat;
uniform float uGrain;
uniform float uBloom;
${COMMON}
vec3 catmull(vec2 uv, vec2 texSize) {
  vec2 samplePos = uv * texSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / w12;
  vec2 t0 = (texPos1 - 1.0) / texSize;
  vec2 t3 = (texPos1 + 2.0) / texSize;
  vec2 t12 = (texPos1 + offset12) / texSize;
  vec3 r = vec3(0.0);
  r += textureLod(uScene, vec2(t0.x, t0.y), 0.0).rgb * w0.x * w0.y;
  r += textureLod(uScene, vec2(t12.x, t0.y), 0.0).rgb * w12.x * w0.y;
  r += textureLod(uScene, vec2(t3.x, t0.y), 0.0).rgb * w3.x * w0.y;
  r += textureLod(uScene, vec2(t0.x, t12.y), 0.0).rgb * w0.x * w12.y;
  r += textureLod(uScene, vec2(t12.x, t12.y), 0.0).rgb * w12.x * w12.y;
  r += textureLod(uScene, vec2(t3.x, t12.y), 0.0).rgb * w3.x * w12.y;
  r += textureLod(uScene, vec2(t0.x, t3.y), 0.0).rgb * w0.x * w3.y;
  r += textureLod(uScene, vec2(t12.x, t3.y), 0.0).rgb * w12.x * w3.y;
  r += textureLod(uScene, vec2(t3.x, t3.y), 0.0).rgb * w3.x * w3.y;
  return max(r, 0.0);
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 uv = gl_FragCoord.xy / uOutSize;
  vec2 px = 1.0 / uSceneSize;
  vec3 c = (uSceneSize.x < uOutSize.x * 0.97) ? catmull(uv, uSceneSize) : textureLod(uScene, uv, 0.0).rgb;
  vec3 cN = textureLod(uScene, uv + vec2(0.0, px.y), 0.0).rgb;
  vec3 cS = textureLod(uScene, uv - vec2(0.0, px.y), 0.0).rgb;
  vec3 cE = textureLod(uScene, uv + vec2(px.x, 0.0), 0.0).rgb;
  vec3 cW = textureLod(uScene, uv - vec2(px.x, 0.0), 0.0).rgb;
  vec3 avg = 0.25 * (cN + cS + cE + cW);
  float lc = luma(c);
  float lmax = max(lc, max(max(luma(cN), luma(cS)), max(luma(cE), luma(cW))));
  float lmin = min(lc, min(min(luma(cN), luma(cS)), min(luma(cE), luma(cW))));
  float edge = smoothstep(0.07, 0.28, lmax - lmin);
  c = mix(c, 0.5 * c + 0.5 * avg, edge * 0.8);                 // soften hard stair-steps on strong edges
  c += (c - avg) * uSharpen * (1.0 - edge);                     // sharpen fine texture elsewhere
  vec3 bl = 0.4 * textureLod(uScene, uv, 3.0).rgb + 0.35 * textureLod(uScene, uv, 4.0).rgb + 0.25 * textureLod(uScene, uv, 5.0).rgb;
  c += max(bl - 0.62, 0.0) * uBloom;
  c = clamp(c, 0.0, 1.0);
  vec3 sc = c * c * (3.0 - 2.0 * c);
  c = c + (sc - c) * uContrast;
  float l = luma(c);
  c = l + (c - l) * uSat;
  float g = (hashI(ivec2(gl_FragCoord.xy)) - 0.5) * 2.0 * uGrain / 255.0;
  outColor = vec4(clamp(c + g, 0.0, 1.0), 1.0);
}
`;

// ---------------------------------------------------------------------------------------------------------------
// GL helpers
// ---------------------------------------------------------------------------------------------------------------

interface Prog { p: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'unknown';
    gl.deleteShader(sh);
    throw new Error('shader compile: ' + log);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, fsSrc: string): Prog {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program link: ' + (gl.getProgramInfoLog(p) || 'unknown'));
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return { p, loc: new Map() };
}

function uni(gl: WebGL2RenderingContext, pr: Prog, name: string): WebGLUniformLocation | null {
  if (!pr.loc.has(name)) pr.loc.set(name, gl.getUniformLocation(pr.p, name));
  return pr.loc.get(name) ?? null;
}

export interface GLFrameInfo {
  sceneW: number;
  sceneH: number;
}

interface HeightGL { tex: WebGLTexture; lip: number; hMax: number; id: number }

let heightIdCounter = 1;

export class VisorGL {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  lost = false;
  onLost: (() => void) | null = null;

  private pScene: Prog;
  private pShadow: Prog;
  private pPost: Prog;
  private rockA: WebGLTexture;
  private rockB: WebGLTexture;
  private heights = new WeakMap<HeightMap, HeightGL>();
  private heightTexList: WebGLTexture[] = [];
  private shadowTex: WebGLTexture | null = null;
  private shadowFbo: WebGLFramebuffer | null = null;
  private shadowN = 0;
  private shadowKey = '';
  private albTex: WebGLTexture | null = null;
  private albDim: [number, number] = [1, 1];
  private hasAlb = false;
  private sceneTex: WebGLTexture | null = null;
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneW = 0;
  private sceneH = 0;
  private outW = 0;
  private outH = 0;
  /** internal resolution factor relative to the canvas (set by the caller) */
  scale = 0.7;
  /** debug: colour = march iteration count */
  debug = false;

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.pScene = link(gl, SCENE_FS);
    this.pShadow = link(gl, SHADOW_FS);
    this.pPost = link(gl, POST_FS);
    const pRock = link(gl, ROCK_FS);
    this.rockA = this.bakeRocks(pRock, 70, 1024, 1.2, [
      [2.0, 0.90, 0.12, 0.34, 1.6, 5.1, 3, 0.9],     // cobbles
      [5.0, 0.90, 0.25, 0.55, 1.5, 2.7, 11, 0.6]     // stones
    ]);
    this.rockB = this.bakeRocks(pRock, 420, 2048, 3.2, [
      [14.0, 0.955, 0.7, 1.6, 1.3, 1.3, 23, 0.5]     // boulders
    ]);
    gl.deleteProgram(pRock.p);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    canvas.addEventListener('webglcontextlost', this.handleLost as EventListener, false);
  }

  /** Returns null when WebGL2 (with float render/filter support we need) is not available or shaders fail to build. */
  static create(canvas: HTMLCanvasElement): VisorGL | null {
    try {
      const gl = canvas.getContext('webgl2', {
        antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false
      }) as WebGL2RenderingContext | null;
      if (!gl) return null;
      return new VisorGL(canvas, gl);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('VisorGL unavailable:', e);
      return null;
    }
  }

  private handleLost = (ev: Event) => {
    ev.preventDefault();
    this.lost = true;
    if (this.onLost) this.onLost();
  };

  private makeTexture(): WebGLTexture {
    const t = this.gl.createTexture();
    if (!t) throw new Error('createTexture failed');
    return t;
  }

  /** Bakes a periodic rock tile into an R8 texture (GPU, one-off). */
  private bakeRocks(pr: Prog, periodM: number, texN: number, maxH: number, pops: number[][]): WebGLTexture {
    const gl = this.gl;
    const tex = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, texN, texN, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('rock framebuffer incomplete');
    gl.viewport(0, 0, texN, texN);
    gl.disable(gl.BLEND);
    gl.useProgram(pr.p);
    gl.uniform1f(uni(gl, pr, 'uP'), periodM);
    gl.uniform1f(uni(gl, pr, 'uTexN'), texN);
    gl.uniform1i(uni(gl, pr, 'uPopN'), pops.length);
    gl.uniform1f(uni(gl, pr, 'uMaxH'), maxH);
    const a = new Float32Array(8), b = new Float32Array(8);
    pops.forEach((q, i) => {
      a.set([q[0], q[1], q[2], q[3]], i * 4);
      b.set([q[4], q[5], q[6], q[7]], i * 4);
    });
    gl.uniform4fv(uni(gl, pr, 'uPopA'), a);
    gl.uniform4fv(uni(gl, pr, 'uPopB'), b);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return tex;
  }

  private heightGL(hm: HeightMap): HeightGL {
    const hit = this.heights.get(hm);
    if (hit) return hit;
    const gl = this.gl;
    const n = hm.n;
    const data = new Float32Array(n * n * 2);
    let lip = 0, hMaxRel = -Infinity;
    for (let k = 0; k < n * n; k++) {
      const rel = hm.h[k] - hm.baseMin;
      const hi = Math.round(rel / 16) * 16;
      data[k * 2] = hi;
      data[k * 2 + 1] = rel - hi;
      const g = Math.hypot(hm.gx[k], hm.gy[k]);
      if (g > lip) lip = g;
      if (rel > hMaxRel) hMaxRel = rel;
    }
    const tex = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, n, n, 0, gl.RG, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const out: HeightGL = { tex, lip: lip * 1.25 + 0.02, hMax: hm.baseMin + hMaxRel + 4, id: heightIdCounter++ };
    this.heights.set(hm, out);
    this.heightTexList.push(tex);
    return out;
  }

  /** Real brightness grid (rows of columns, any scale); lo/hi map to 0..1. Pass null for a uniform ground colour. */
  setAlbedo(grid: number[][] | null, lo: number, hi: number): void {
    const gl = this.gl;
    if (this.albTex) { gl.deleteTexture(this.albTex); this.albTex = null; }
    this.hasAlb = false;
    if (!grid || !grid.length) return;
    const rows = grid.length, cols = grid[0].length;
    const data = new Uint8Array(rows * cols);
    const span = Math.max(1e-9, hi - lo);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      data[r * cols + c] = Math.round(Math.max(0, Math.min(1, (grid[r][c] - lo) / span)) * 255);
    }
    const tex = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.albTex = tex;
    this.albDim = [cols, rows];
    this.hasAlb = true;
  }

  /** Canvas backing-store size in device pixels. */
  setCanvasSize(w: number, h: number): void {
    w = Math.max(16, Math.round(w)); h = Math.max(16, Math.round(h));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.outW = w; this.outH = h;
  }

  private ensureScene(): void {
    const gl = this.gl;
    const w = Math.max(64, Math.round(this.outW * this.scale));
    const h = Math.max(48, Math.round(this.outH * this.scale));
    if (this.sceneTex && w === this.sceneW && h === this.sceneH) return;
    if (this.sceneTex) gl.deleteTexture(this.sceneTex);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
    const tex = this.makeTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.sceneTex = tex; this.sceneFbo = fbo; this.sceneW = w; this.sceneH = h;
  }

  private ensureShadow(hm: HeightMap, hg: HeightGL, v: ViewParams): void {
    const gl = this.gl;
    const n = hm.n;
    if (!this.shadowTex || this.shadowN !== n) {
      if (this.shadowTex) gl.deleteTexture(this.shadowTex);
      if (this.shadowFbo) gl.deleteFramebuffer(this.shadowFbo);
      const tex = this.makeTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.shadowTex = tex; this.shadowFbo = fbo; this.shadowN = n; this.shadowKey = '';
    }
    const key = `${hg.id}:${Math.round(v.sun.elDeg * 4)}:${Math.round(v.sun.azDeg * 4)}`;
    if (key === this.shadowKey) return;
    this.shadowKey = key;
    const sAz = v.sun.azDeg * DEG, sEl = v.sun.elDeg * DEG;
    const sunE = Math.cos(sEl) * Math.sin(sAz), sunS = -Math.cos(sEl) * Math.cos(sAz);
    const hl = Math.hypot(sunE, sunS) || 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, n, n);
    gl.useProgram(this.pShadow.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hg.tex);
    gl.uniform1i(uni(gl, this.pShadow, 'uHeight'), 0);
    gl.uniform1f(uni(gl, this.pShadow, 'uBase'), hm.baseMin);
    gl.uniform1f(uni(gl, this.pShadow, 'uN'), n);
    gl.uniform2f(uni(gl, this.pShadow, 'uM'), hm.mx, hm.my);
    gl.uniform2f(uni(gl, this.pShadow, 'uWorld'), hm.mx * (n - 1), hm.my * (n - 1));
    gl.uniform2f(uni(gl, this.pShadow, 'uSunH'), sunE / hl, sunS / hl);
    gl.uniform1f(uni(gl, this.pShadow, 'uTanEl'), Math.tan(sEl));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Draws one frame. The canvas size must have been set with setCanvasSize first. */
  render(hm: HeightMap, v: ViewParams): GLFrameInfo {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) return { sceneW: this.sceneW, sceneH: this.sceneH };
    const hg = this.heightGL(hm);
    this.ensureScene();
    this.ensureShadow(hm, hg, v);
    const W = this.sceneW, H = this.sceneH;

    // camera and sun (same maths as the software renderer)
    const proj = makeProjector(hm, v, W, H);
    const camH = terrainHeight(hm, v.xM, v.yM) + v.eyeM;
    const f: [number, number] = [Math.sin(v.headingRad), -Math.cos(v.headingRad)];
    const r: [number, number] = [Math.cos(v.headingRad), Math.sin(v.headingRad)];
    const sAz = v.sun.azDeg * DEG, sEl = v.sun.elDeg * DEG;
    const sunE = Math.cos(sEl) * Math.sin(sAz), sunS = -Math.cos(sEl) * Math.cos(sAz), sunU = Math.sin(sEl);
    const sHl = Math.hypot(sunE, sunS) || 1;
    const pal = skyPalette(v.sun.elDeg, v.tau, v.stormActive);
    const beta = (v.tau * (v.stormActive ? STORM_VISUAL_BOOST : 1)) / DUST_SCALE_HEIGHT_M;
    const worldW = hm.mx * (hm.n - 1), worldH = hm.my * (hm.n - 1);

    // ---- pass 1: scene ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    const P = this.pScene;
    gl.useProgram(P.p);
    const bindTex = (unit: number, tex: WebGLTexture | null, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(uni(gl, P, name), unit);
    };
    bindTex(0, hg.tex, 'uHeight');
    bindTex(1, this.shadowTex, 'uShadow');
    bindTex(2, this.rockA, 'uRockA');
    bindTex(3, this.rockB, 'uRockB');
    bindTex(4, this.albTex ?? this.rockA, 'uAlbedo');
    const u2 = (n: string, a: number, b: number) => gl.uniform2f(uni(gl, P, n), a, b);
    const u3 = (n: string, a: number[]) => gl.uniform3f(uni(gl, P, n), a[0], a[1], a[2]);
    const u1 = (n: string, a: number) => gl.uniform1f(uni(gl, P, n), a);
    u2('uRes', W, H);
    u1('uFocal', proj.focal);
    u1('uHorizonY', proj.horizonY);
    u2('uCam', v.xM, v.yM);
    u1('uCamH', camH);
    u2('uF', f[0], f[1]);
    u2('uR', r[0], r[1]);
    u3('uSunVec', [sunE, sunU, sunS]);
    u2('uSunH', sunE / sHl, sunS / sHl);
    u3('uSunCam', [sunE * r[0] + sunS * r[1], sunU, sunE * f[0] + sunS * f[1]]);
    u1('uBeta', beta);
    u1('uTau', v.tau);
    u1('uProc', v.procedural ? 1 : 0);
    u1('uHasAlb', this.hasAlb ? 1 : 0);
    u1('uBase', hm.baseMin);
    u1('uN', hm.n);
    u2('uM', hm.mx, hm.my);
    u2('uWorld', worldW, worldH);
    u1('uLip', hg.lip);
    u1('uHMax', hg.hMax);
    u3('uHorizon', pal.horizon.map(c => c / 255));
    u3('uZenith', pal.zenith.map(c => c / 255));
    u3('uAmbient', pal.ambient.map(c => c / 255));
    u3('uSunTint', pal.sunTint.map(c => c / 255));
    u1('uExposure', pal.exposure);
    u2('uAlbDim', this.albDim[0], this.albDim[1]);
    u1('uPA', 70);
    u1('uPB', 420);
    u1('uDebug', this.debug ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- pass 2: post (to the canvas) ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.viewport(0, 0, this.outW, this.outH);
    const Q = this.pPost;
    gl.useProgram(Q.p);
    gl.uniform1i(uni(gl, Q, 'uScene'), 0);
    gl.uniform2f(uni(gl, Q, 'uSceneSize'), W, H);
    gl.uniform2f(uni(gl, Q, 'uOutSize'), this.outW, this.outH);
    gl.uniform1f(uni(gl, Q, 'uSharpen'), 0.55);
    gl.uniform1f(uni(gl, Q, 'uContrast'), 0.24);
    gl.uniform1f(uni(gl, Q, 'uSat'), 1.1);
    gl.uniform1f(uni(gl, Q, 'uGrain'), 2.0);
    gl.uniform1f(uni(gl, Q, 'uBloom'), 0.5);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return { sceneW: W, sceneH: H };
  }

  /** Waits until the GPU has finished the submitted work (used to measure what a frame costs). */
  finish(): void {
    // gl.finish() does not reliably wait in Chromium; reading one pixel back forces the frame to complete.
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
  }
  private px = new Uint8Array(4);

  /** Gives the GL context itself back (call after dispose() when the canvas is going away for good). */
  loseContext(): void {
    try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ }
  }

  dispose(): void {
    const gl = this.gl;
    this.canvas.removeEventListener('webglcontextlost', this.handleLost as EventListener, false);
    try {
      for (const t of [this.rockA, this.rockB, this.shadowTex, this.albTex, this.sceneTex, ...this.heightTexList]) if (t) gl.deleteTexture(t);
      this.heightTexList = [];
      for (const f of [this.shadowFbo, this.sceneFbo]) if (f) gl.deleteFramebuffer(f);
      gl.deleteProgram(this.pScene.p);
      gl.deleteProgram(this.pShadow.p);
      gl.deleteProgram(this.pPost.p);
    } catch { /* context may already be gone */ }
  }
}
