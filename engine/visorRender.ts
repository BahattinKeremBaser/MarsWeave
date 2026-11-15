/**
 * MARSWEAVE — first-person astronaut view renderer (software heightfield ray-marcher, no WebGL).
 *
 * WHAT IS REAL AND WHAT IS NOT (shown to the user in the view's footer)
 *  - Large-scale landform: REAL. The USGS MOLA-HRSC DEM grid loaded by the app, smoothly (Catmull-Rom) interpolated.
 *    The DEM is 200 m/pixel, so anything smaller than ~300 m is not measured.
 *  - Fine relief (hummocks 30-500 m), ground texture and scattered rocks: PROCEDURAL. Invented noise so that the
 *    ground does not look like glass. It is deterministic (same place = same rocks) but it is NOT data.
 *  - Haze: MODELLED. Horizontal extinction beta = tau / H, tau from the app's dust optical depth, H = 11 km scale
 *    height (ASSUMPTION: dust well mixed up to that height).
 *  - Sky colours, sun disc: MODELLED approximation of a butterscotch Martian sky. Sun elevation from the app's
 *    environment; sun azimuth from local solar time at 39 N, equinox declination (ASSUMPTION).
 *  - Shadows: DERIVED from the real DEM (+ procedural relief) with the sun direction above.
 *
 * Pure functions: usable in node (for tests) and in the browser.
 */

import { ARCADIA_ELEVATION_GRID, GRID_COLS, GRID_ROWS, MISSION_BOUNDS } from '../data/arcadiaData';

const DEG = Math.PI / 180;
export const WORLD_W_M = MISSION_BOUNDS.areaWidthKm * 1000;
export const WORLD_H_M = MISSION_BOUNDS.areaHeightKm * 1000;
/** ASSUMPTION: well-mixed dust scale height used to turn optical depth into horizontal extinction. */
export const DUST_SCALE_HEIGHT_M = 11000;
/** ILLUSTRATIVE multiplier applied to haze extinction while the storm event is active (not data). */
export const STORM_VISUAL_BOOST = 1.0; // the real MY34 peak tau (~2.9) is already strong; no exaggeration needed

// ---------------------------------------------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------------------------------------------

function hash2(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 65536) / 65536;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in 0..1. */
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// ---------------------------------------------------------------------------------------------------------------
// Height map: real DEM + procedural relief
// ---------------------------------------------------------------------------------------------------------------

export interface HeightMap {
  n: number;
  h: Float32Array;
  /** metres per pixel */
  mx: number;
  my: number;
  baseMin: number;
  /** precomputed smooth surface slope components dh/dx, dh/dy (central differences) */
  gx: Float32Array;
  gy: Float32Array;
  /** concavity (m): positive in hollows, negative on crests. Used as a cheap ambient-occlusion cue. DERIVED from the DEM. */
  cav: Float32Array;
}

function cubic(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

function demAt(r: number, c: number): number {
  const rr = Math.max(0, Math.min(GRID_ROWS - 1, r));
  const cc = Math.max(0, Math.min(GRID_COLS - 1, c));
  return ARCADIA_ELEVATION_GRID[rr][cc];
}

/** Catmull-Rom bicubic sample of the DEM at fractional grid indices. */
export function demBicubic(cf: number, rf: number): number {
  const c0 = Math.floor(cf), r0 = Math.floor(rf);
  const fx = cf - c0, fy = rf - r0;
  const col: number[] = [];
  for (let j = -1; j <= 2; j++) {
    col.push(cubic(demAt(r0 + j, c0 - 1), demAt(r0 + j, c0), demAt(r0 + j, c0 + 1), demAt(r0 + j, c0 + 2), fx));
  }
  return cubic(col[0], col[1], col[2], col[3], fy);
}

/** Procedural fine relief in metres (hummocks 30-500 m). NOT measured data. */
export function proceduralRelief(xM: number, yM: number): number {
  let amp = 2.6, freq = 1 / 520, sum = 0;
  for (let o = 0; o < 5; o++) {
    sum += (vnoise(xM * freq + o * 17.3, yM * freq - o * 9.1) - 0.5) * 2 * amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum;
}

const heightMapCache = new Map<string, HeightMap & { procedural: boolean }>();

/** procedural=false (default) gives the REAL DEM only (smoothly interpolated). Both variants stay cached. */
export function buildHeightMap(n = 512, procedural = false): HeightMap {
  const key = `${n}:${procedural ? 1 : 0}`;
  const hit = heightMapCache.get(key);
  if (hit) return hit;
  const h = new Float32Array(n * n);
  let minH = Infinity;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const cf = (i / (n - 1)) * (GRID_COLS - 1);
      const rf = (j / (n - 1)) * (GRID_ROWS - 1);
      const xM = (i / (n - 1)) * WORLD_W_M, yM = (j / (n - 1)) * WORLD_H_M;
      const v = demBicubic(cf, rf) + (procedural ? proceduralRelief(xM, yM) : 0);
      h[j * n + i] = v;
      if (v < minH) minH = v;
    }
  }
  const mx = WORLD_W_M / (n - 1), my = WORLD_H_M / (n - 1);
  const gx = new Float32Array(n * n), gy = new Float32Array(n * n), cav = new Float32Array(n * n);
  const R = 4; // cavity radius in pixels (~120 m)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const il = Math.max(0, i - 1), ir = Math.min(n - 1, i + 1), jt = Math.max(0, j - 1), jb = Math.min(n - 1, j + 1);
      gx[k] = (h[j * n + ir] - h[j * n + il]) / ((ir - il) * mx);
      gy[k] = (h[jb * n + i] - h[jt * n + i]) / ((jb - jt) * my);
      const a = h[j * n + Math.max(0, i - R)], b = h[j * n + Math.min(n - 1, i + R)];
      const c = h[Math.max(0, j - R) * n + i], d = h[Math.min(n - 1, j + R) * n + i];
      cav[k] = (a + b + c + d) / 4 - h[k];
    }
  }
  const out = { n, h, mx, my, baseMin: minH, procedural, gx, gy, cav };
  heightMapCache.set(key, out);
  return out;
}

/** Bilinear terrain height (no rocks) at world metres (east, south). Clamped outside the mapped area. */
export function terrainHeight(hm: HeightMap, xM: number, yM: number): number {
  const n = hm.n;
  const fx = Math.max(0, Math.min(n - 1.001, xM / hm.mx));
  const fy = Math.max(0, Math.min(n - 1.001, yM / hm.my));
  const i = fx | 0, j = fy | 0;
  const tx = fx - i, ty = fy - j;
  const k = j * n + i;
  const a = hm.h[k], b = hm.h[k + 1], c = hm.h[k + n], d = hm.h[k + n + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

/** Rock height (m) at a point: two procedural populations (pebbles/cobbles and boulders). NOT data. */
export function rockHeight(xM: number, yM: number): number {
  let best = 0;
  // cobbles: 2.2 m cells
  {
    const cs = 2.2;
    const cx = Math.floor(xM / cs), cy = Math.floor(yM / cs);
    const r = hash2(cx, cy);
    if (r > 0.9) {
      const size = 0.12 + 0.34 * hash2(cx + 91, cy + 17);
      const ox = (hash2(cx + 5, cy + 11) - 0.5) * 0.9, oy = (hash2(cx + 23, cy + 3) - 0.5) * 0.9;
      const dx = xM / cs - cx - 0.5 - ox, dy = yM / cs - cy - 0.5 - oy;
      const rr = (dx * dx + dy * dy) / ((size / cs) * (size / cs) * 1.6);
      if (rr < 1) best = Math.max(best, size * Math.sqrt(1 - rr) * (0.7 + 0.6 * vnoise(xM * 5.1, yM * 5.1)));
    }
  }
  // stones: 5 m cells, 0.25-0.8 m
  {
    const cs = 5;
    const cx = Math.floor(xM / cs), cy = Math.floor(yM / cs);
    const r = hash2(cx + 211, cy + 133);
    if (r > 0.9) {
      const size = 0.25 + 0.55 * hash2(cx + 61, cy + 9);
      const ox = (hash2(cx + 3, cy + 41) - 0.5) * 0.6, oy = (hash2(cx + 53, cy + 7) - 0.5) * 0.6;
      const dx = xM / cs - cx - 0.5 - ox, dy = yM / cs - cy - 0.5 - oy;
      const rr = (dx * dx + dy * dy) / ((size / cs) * (size / cs) * 1.5);
      if (rr < 1) best = Math.max(best, size * Math.sqrt(1 - rr) * (0.7 + 0.6 * vnoise(xM * 2.7, yM * 2.7)));
    }
  }
  // boulders: 14 m cells
  {
    const cs = 14;
    const cx = Math.floor(xM / cs), cy = Math.floor(yM / cs);
    const r = hash2(cx + 401, cy - 77);
    if (r > 0.955) {
      const size = 0.7 + 1.6 * hash2(cx + 13, cy + 71);
      const ox = (hash2(cx + 7, cy + 19) - 0.5) * 0.5, oy = (hash2(cx + 29, cy + 5) - 0.5) * 0.5;
      const dx = xM / cs - cx - 0.5 - ox, dy = yM / cs - cy - 0.5 - oy;
      const rr = (dx * dx + dy * dy) / ((size / cs) * (size / cs) * 1.3);
      if (rr < 1) best = Math.max(best, size * Math.sqrt(1 - rr) * (0.72 + 0.56 * vnoise(xM * 1.3, yM * 1.3)));
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Sun
// ---------------------------------------------------------------------------------------------------------------

export interface SunState {
  elDeg: number;
  /** compass azimuth, degrees clockwise from north */
  azDeg: number;
}

/**
 * Sun azimuth from local solar time at 39.3 N. With a declination (derived from Ls, see engine/sunGeometry.ts) the
 * azimuth is exact for that geometry; without one it falls back to the equinox assumption. Elevation comes from the app.
 */
export function sunFromLocalTime(localHours: number, elDeg: number, decDeg = 0): SunState {
  const lat = 39.3 * DEG;
  const hourAngle = (localHours - 12) * 15 * DEG;
  const el = elDeg * DEG, dec = decDeg * DEG;
  let cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  cosAz = Math.max(-1, Math.min(1, cosAz));
  let az = Math.acos(cosAz) / DEG; // 0..180 measured from north through east
  if (hourAngle > 0) az = 360 - az; // afternoon: western half
  return { elDeg, azDeg: az };
}

export function parseLocalHours(label: string | undefined, fallback = 14.4): number {
  const m = /(\d{1,2}):(\d{2})/.exec(label ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : fallback;
}

/** Bilinear sample of a per-pixel array at world metres. */
function bilin(a: ArrayLike<number>, hm: HeightMap, xM: number, yM: number): number {
  const n = hm.n;
  const fx = Math.max(0, Math.min(n - 1.001, xM / hm.mx));
  const fy = Math.max(0, Math.min(n - 1.001, yM / hm.my));
  const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
  return a[k] * (1 - tx) * (1 - ty) + a[k + 1] * tx * (1 - ty) + a[k + n] * (1 - tx) * ty + a[k + n + 1] * tx * ty;
}

/** Terrain self-shadow map for a sun direction (0 = lit, 1 = shadow). Cached per direction. */
let shadowCache: { key: string; data: Uint8Array } | null = null;
export function buildShadowMap(hm: HeightMap, sun: SunState): Uint8Array {
  const key = `${hm.n}:${(hm as { procedural?: boolean }).procedural ? 1 : 0}:${Math.round(sun.elDeg)}:${Math.round(sun.azDeg / 2)}`;
  if (shadowCache && shadowCache.key === key) return shadowCache.data;
  const n = hm.n;
  const out = new Uint8Array(n * n);
  const az = sun.azDeg * DEG;
  // sun direction on the ground plane in (east, south)
  const dx = Math.sin(az), dy = -Math.cos(az);
  const tanEl = Math.tan(sun.elDeg * DEG);
  const stepM = hm.mx;
  const steps = 90;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x0 = i * hm.mx, y0 = j * hm.my;
      const h0 = hm.h[j * n + i];
      let sh = 0;
      for (let s = 1; s <= steps; s++) {
        const d = s * stepM;
        const x = x0 + dx * d, y = y0 + dy * d;
        if (x < 0 || y < 0 || x > WORLD_W_M || y > WORLD_H_M) break;
        if (terrainHeight(hm, x, y) > h0 + d * tanEl) { sh = 1; break; }
      }
      out[j * n + i] = sh;
    }
  }
  shadowCache = { key, data: out };
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Camera / projection
// ---------------------------------------------------------------------------------------------------------------

export interface ViewParams {
  /** world metres east / south of the camera */
  xM: number;
  yM: number;
  /** eye height above ground, m */
  eyeM: number;
  headingRad: number;
  /** vertical look offset in radians (+ = look up) */
  pitchRad: number;
  sun: SunState;
  tau: number;
  stormActive: boolean;
  /** invented rocks/ground texture (NOT data). Default false. */
  procedural?: boolean;
  /** real reflectance 0..1 at world metres, e.g. from a HiRISE product; undefined = uniform colour */
  albedoAt?: (xM: number, yM: number) => number;
}

export interface Projector {
  W: number;
  H: number;
  focal: number;
  horizonY: number;
  camH: number;
  /** returns null when behind the camera */
  project(xM: number, yM: number, h: number): { sx: number; sy: number; z: number } | null;
}

export function makeProjector(hm: HeightMap, v: ViewParams, W: number, H: number): Projector {
  // vertical FOV 62 deg (natural for a helmet visor); on very wide windows the horizontal FOV is capped at 100 deg
  const focal = Math.max(H / 2 / Math.tan((62 * DEG) / 2), W / 2 / Math.tan((100 * DEG) / 2));
  const horizonY = H * 0.44 + Math.tan(-v.pitchRad) * focal;
  const camH = terrainHeight(hm, v.xM, v.yM) + v.eyeM;
  const fx = Math.sin(v.headingRad), fy = -Math.cos(v.headingRad);
  const rx = Math.cos(v.headingRad), ry = Math.sin(v.headingRad);
  return {
    W, H, focal, horizonY, camH,
    project(xM, yM, h) {
      const dx = xM - v.xM, dy = yM - v.yM;
      const z = dx * fx + dy * fy;
      if (z < 0.5) return null;
      const x = dx * rx + dy * ry;
      return { sx: W / 2 + (x / z) * focal, sy: horizonY + ((camH - h) / z) * focal, z };
    }
  };
}

/** True when the straight line from the camera to (x,y,h) is not blocked by terrain (rocks ignored). */
export function lineOfSightClear(hm: HeightMap, v: ViewParams, camH: number, xM: number, yM: number, h: number): boolean {
  const dx = xM - v.xM, dy = yM - v.yM;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(8, Math.min(80, Math.ceil(dist / 12)));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const th = terrainHeight(hm, v.xM + dx * t, v.yM + dy * t);
    if (th > camH + (h - camH) * t + 0.3) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------------------------

type RGB = [number, number, number];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

interface SkyPalette { horizon: RGB; zenith: RGB; ambient: RGB; sunTint: RGB; exposure: number }

export function skyPalette(sunElDeg: number, tau: number, storm: boolean): SkyPalette {
  const dust = Math.max(0, Math.min(1, (tau - 0.3) / 2.0)) * (storm ? 1 : 0.8);
  const clearH: RGB = [222, 176, 138], clearZ: RGB = [150, 118, 104];
  const duskH: RGB = [150, 92, 58], duskZ: RGB = [96, 66, 54];
  const horizon = mix(clearH, duskH, dust);
  const zenith = mix(clearZ, duskZ, dust);
  const lowSun = Math.max(0, 1 - sunElDeg / 25);
  const exposure = (0.55 + 0.5 * Math.min(1, Math.sin(Math.max(2, sunElDeg) * DEG) * 1.25)) * (1 - 0.45 * dust);
  // a low sun turns the sky near it blue-grey on Mars
  const sunTint: RGB = mix([255, 238, 218], [170, 190, 235], lowSun * 0.7);
  return { horizon, zenith, ambient: mix([165, 128, 112], [120, 86, 70], dust), sunTint, exposure };
}

// ---------------------------------------------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------------------------------------------

const MAX_DIST_M = 9000;

export interface RenderStats { samples: number }

/**
 * Renders RGBA into `buf` (length W*H*4). Column-by-column heightfield ray marching with per-pixel ground texture
 * and exponential dust haze.
 */
export function renderVisor(hm: HeightMap, v: ViewParams, buf: Uint8ClampedArray, W: number, H: number): RenderStats {
  const proj = makeProjector(hm, v, W, H);
  const { focal, horizonY, camH } = proj;
  const pal = skyPalette(v.sun.elDeg, v.tau, v.stormActive);
  const shadows = buildShadowMap(hm, v.sun);
  // Storm extinction uses the storm tau directly (STORM_VISUAL_BOOST = 1).
  const beta = (v.tau * (v.stormActive ? STORM_VISUAL_BOOST : 1)) / DUST_SCALE_HEIGHT_M;

  const f: [number, number] = [Math.sin(v.headingRad), -Math.cos(v.headingRad)];
  const r: [number, number] = [Math.cos(v.headingRad), Math.sin(v.headingRad)];

  // sun in camera frame (right, up, forward)
  const sAz = v.sun.azDeg * DEG, sEl = v.sun.elDeg * DEG;
  const sunE = Math.cos(sEl) * Math.sin(sAz), sunS = -Math.cos(sEl) * Math.cos(sAz), sunU = Math.sin(sEl);
  const sunCam: RGB = [sunE * r[0] + sunS * r[1], sunU, sunE * f[0] + sunS * f[1]];
  const sunVec: RGB = [sunE, sunU, sunS]; // (east, up, south) for shading
  const sHl = Math.hypot(sunE, sunS) || 1;
  const sunH: [number, number] = [sunE / sHl, sunS / sHl]; // horizontal sun direction (east, south)

  let samples = 0;
  const yMin = new Int32Array(W);

  // per-column haze colour: horizon sky incl. sun glow
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - W / 2) / focal;
    const dir: RGB = [u, 0, 1];
    const len = Math.hypot(dir[0], dir[2]);
    const cosang = (dir[0] * sunCam[0] + dir[2] * sunCam[2]) / len / 1;
    const glow = Math.pow(Math.max(0, cosang), 6) * 0.35;
    const hazeCol = mix(pal.horizon, pal.sunTint, Math.min(0.6, glow));
    const hz: RGB = [hazeCol[0] * pal.exposure, hazeCol[1] * pal.exposure, hazeCol[2] * pal.exposure];

    let ymin = H;
    let zPrev = 1.0;
    let hPrev = terrainHeight(hm, v.xM + (f[0] + r[0] * u) * zPrev, v.yM + (f[1] + r[1] * u) * zPrev);
    let yPrev = horizonY + ((camH - hPrev) / zPrev) * focal;
    let z = 1.0;
    let prevR = -1, prevG = 0, prevB = 0;
    // march
    while (z < MAX_DIST_M && ymin > 0) {
      z += Math.max(0.35, z * (z < 60 ? 0.012 : 0.02));
      const wx = v.xM + (f[0] + r[0] * u) * z;
      const wy = v.yM + (f[1] + r[1] * u) * z;
      let hh = terrainHeight(hm, wx, wy);
      let rock = 0;
      if (v.procedural && z < 420 && z > 3.5) {
        // rocks fade in between 3.5 and 11 m so none sit under the astronaut's feet
        const fadeIn = Math.min(1, (z - 3.5) / 7.5);
        rock = rockHeight(wx, wy) * fadeIn;
        hh += rock;
      }
      samples++;
      const y = horizonY + ((camH - hh) / z) * focal;
      if (y < ymin) {
        // shading at this sample (smooth normals from the precomputed DEM gradients)
        const hx = bilin(hm.gx, hm, wx, wy);
        const hy = bilin(hm.gy, hm, wx, wy);
        let nx = -hx, ny = 1, nz = -hy;
        let rockShade = 1;
        if (v.procedural && z < 120 && rock === 0) {
          // contact shadow: a cobble toward the sun blocks the light for a short distance
          const sh2 = Math.hypot(sunVec[0], sunVec[2]) || 1;
          const sx = sunVec[0] / sh2, sy = sunVec[2] / sh2, tanEl = sunVec[1] / sh2;
          const dMax = z < 60 ? 4.2 : 2.4;
          for (let d = 0.3; d <= dMax; d += 0.3) {
            if (rockHeight(wx + sx * d, wy + sy * d) > d * tanEl) { rockShade = 0.42; break; }
          }
        }
        if (v.procedural && z < 160) {
          const e = 0.35;
          const gx = (rockHeight(wx + e, wy) - rockHeight(wx - e, wy)) / (2 * e);
          const gy = (rockHeight(wx, wy + e) - rockHeight(wx, wy - e)) / (2 * e);
          nx -= gx; nz -= gy;
        }
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        const slope = Math.acos(Math.max(-1, Math.min(1, ny)));
        const diff = Math.max(0, nx * sunVec[0] + ny * sunVec[1] + nz * sunVec[2]);
        const shadow = bilin(shadows, hm, wx, wy);
        const aoF = Math.max(0.72, Math.min(1.12, 1 - bilin(hm.cav, hm, wx, wy) * 0.09));
        const lit = (0.30 + 1.05 * diff * (1 - 0.88 * shadow) + (rock > 0 ? 0.22 : 0)) * aoF;
        // albedo: regolith patches, darker on slopes and on rocks
        const patch = v.procedural ? vnoise(wx / 180, wy / 180) : 0.5;
        const patch2 = v.procedural ? vnoise(wx / 23 + 40, wy / 23) : 0.5;
        const realA = v.albedoAt ? 0.78 + 0.44 * Math.max(0, Math.min(1, v.albedoAt(wx, wy))) : 1;
        let alb: RGB = rock > 0 ? mix([118, 90, 76], [92, 74, 66], vnoise(wx * 3.1, wy * 3.1)) : mix([172, 108, 74], [140, 90, 66], patch);
        const dark = Math.min(0.35, slope * 1.6);
        const f2 = (0.86 + 0.28 * patch2) * (1 - dark) * rockShade * realA;
        alb = [alb[0] * f2, alb[1] * f2, alb[2] * f2];
        // fraction of this span covered
        const hasPrev = prevR >= 0;
        const yFrom = Math.max(0, Math.floor(y));
        const yTo = Math.min(H, Math.ceil(ymin));
        const span = Math.max(1, ymin - y);
        for (let py = yFrom; py < yTo; py++) {
          const t = Math.max(0, Math.min(1, (py - y) / span));
          const zp = z + (zPrev - z) * t; // approximate distance of this pixel
          // ground texture: octave value noise, each octave fades out where one pixel would span more than its feature size
          // (no aliasing, no fake waves), plus sun-aware micro-relief on the finest octaves. PROCEDURAL, not data.
          let tex = 1;
          if (v.procedural && zp < 450) {
            const px2 = v.xM + (f[0] + r[0] * u) * zp, py2 = v.yM + (f[1] + r[1] * u) * zp;
            const fp = (zp * zp) / (Math.max(0.8, camH - hh) * focal); // ground footprint of one pixel along the view ray, m
            const wt = (fr: number) => Math.max(0, Math.min(1, 1.25 - fp * fr * 0.7));
            const w2 = wt(1.3), w3 = wt(4.5), w4 = wt(15), w5 = wt(40);
            let t0 = (vnoise(px2 * 0.12, py2 * 0.12) - 0.5) * 0.16 + (vnoise(px2 * 0.4, py2 * 0.4) - 0.5) * 0.15;
            if (w2 > 0) t0 += (vnoise(px2 * 1.3, py2 * 1.3) - 0.5) * 0.16 * w2;
            if (w3 > 0) {
              const n3 = vnoise(px2 * 4.5, py2 * 4.5);
              t0 += (n3 - 0.5) * 0.20 * w3;
              if (zp < 90) t0 -= (vnoise(px2 * 4.5 + sunH[0] * 0.4, py2 * 4.5 + sunH[1] * 0.4) - n3) * 0.55 * w3 * Math.min(1, (90 - zp) / 40);
            }
            if (w4 > 0) {
              const n4 = vnoise(px2 * 15, py2 * 15);
              t0 += (n4 - 0.5) * 0.18 * w4;
              if (zp < 40) t0 -= (vnoise(px2 * 15 + sunH[0] * 0.4, py2 * 15 + sunH[1] * 0.4) - n4) * 0.5 * w4 * Math.min(1, (40 - zp) / 20);
            }
            if (w5 > 0) t0 += (hash2(Math.floor(px2 * 40), Math.floor(py2 * 40)) - 0.5) * 0.16 * w5;
            tex = 1 + t0;
            // pebble field near the camera: tiny stones with a lit side and a short shadow on the far side (two sizes)
            if (zp < 35) {
              for (let L = 0; L < 2; L++) {
                const cs = L === 0 ? 0.45 : 1.2;
                const wp = wt(L === 0 ? 4 : 1.6);
                if (wp <= 0) continue;
                const cx = Math.floor(px2 / cs), cy = Math.floor(py2 / cs);
                if (hash2(cx + 777 + L * 91, cy - 313) < (L === 0 ? 0.7 : 0.85)) continue;
                const rad = 0.2 + 0.13 * hash2(cx + 9, cy + 5 + L);
                const ddx = px2 / cs - cx - (0.5 + (hash2(cx + 31, cy + 2) - 0.5) * 0.3);
                const ddy = py2 / cs - cy - (0.5 + (hash2(cx + 4, cy + 47) - 0.5) * 0.3);
                const dd = Math.hypot(ddx, ddy);
                const d = dd / rad;
                const along = ddx * sunH[0] + ddy * sunH[1]; // >0 on the sun side
                if (d < 1) tex *= 1 + wp * (-0.1 + 0.42 * (along / Math.max(dd, 1e-4)) * d + 0.1 * (1 - d));
                else if (d < 2.2 && along < 0) tex *= 1 - wp * 0.32 * ((2.2 - d) / 1.2) * Math.min(1, -along / (rad * 0.8));
              }
            }
          }
          let cr = alb[0] * lit * tex, cg = alb[1] * lit * tex, cb = alb[2] * lit * tex;
          if (hasPrev && rock === 0) {
            const k2 = t * 0.85;
            cr = (alb[0] * lit + (prevR - alb[0] * lit) * k2) * tex;
            cg = (alb[1] * lit + (prevG - alb[1] * lit) * k2) * tex;
            cb = (alb[2] * lit + (prevB - alb[2] * lit) * k2) * tex;
          }
          cr += pal.ambient[0] * 0.10; cg += pal.ambient[1] * 0.10; cb += pal.ambient[2] * 0.10;
          cr *= pal.exposure; cg *= pal.exposure; cb *= pal.exposure;
          const trans = Math.exp(-beta * zp);
          const o = (py * W + x) * 4;
          buf[o] = cr * trans + hz[0] * (1 - trans);
          buf[o + 1] = cg * trans + hz[1] * (1 - trans);
          buf[o + 2] = cb * trans + hz[2] * (1 - trans);
          buf[o + 3] = 255;
        }
        ymin = Math.min(ymin, y);
        prevR = alb[0] * lit; prevG = alb[1] * lit; prevB = alb[2] * lit;
      }
      zPrev = z; hPrev = hh; yPrev = y;
    }
    yMin[x] = Math.max(0, Math.min(H, Math.ceil(ymin)));
    void hPrev; void yPrev;

    // sky above the terrain in this column
    for (let py = 0; py < yMin[x]; py++) {
      const vv = (horizonY - (py + 0.5)) / focal; // tan(elevation) approx
      const elev = Math.atan(vv);
      const t = Math.pow(Math.max(0, Math.min(1, elev / (75 * DEG))), 0.55);
      let c = mix(pal.horizon, pal.zenith, t);
      // thin high cirrus streaks (water-ice cloud look): faint, stretched along the horizon, ILLUSTRATIVE
      if (v.procedural && elev > 0.12) {
        const band = vnoise(u * 2.4 + 11, vv * 16) * 0.65 + vnoise(u * 5.5 + 3, vv * 34) * 0.35;
        const cl = Math.max(0, band - 0.56) * 1.5 * Math.min(1, (elev - 0.12) / 0.25) * Math.exp(-v.tau * 0.5);
        c = mix(c, [250, 226, 205], Math.min(0.28, cl));
      }
      // sun glow
      const dl = Math.hypot(u, vv, 1);
      const cosS = (u * sunCam[0] + vv * sunCam[1] + 1 * sunCam[2]) / dl;
      const core = Math.max(0, Math.min(1, (cosS - 0.99994517) / (0.9999619 - 0.99994517))); // ~0.5 deg disc, soft edge
      const halo = Math.pow(Math.max(0, cosS), 40) * 0.55 + Math.pow(Math.max(0, cosS), 6) * 0.16;
      const hs = halo * Math.exp(-v.tau * 0.35);
      c = mix(c, pal.sunTint, Math.min(0.85, hs));
      if (core > 0) c = mix(c, [255, 251, 242], core * Math.exp(-v.tau * 0.15));
      const o = (py * W + x) * 4;
      buf[o] = c[0] * pal.exposure; buf[o + 1] = c[1] * pal.exposure; buf[o + 2] = c[2] * pal.exposure; buf[o + 3] = 255;
    }
  }
  return { samples };
}

// ---------------------------------------------------------------------------------------------------------------
// Post-process (cosmetic image processing, no data involved)
// ---------------------------------------------------------------------------------------------------------------

let ppScratch: Uint8ClampedArray | null = null;
let ppLut: Uint8ClampedArray | null = null;

/**
 * Crispness pass: unsharp mask (sharpens the rendered ground), a gentle S-curve for contrast, slightly richer colour and a
 * very faint film grain that hides banding. Purely cosmetic; it does not add or remove any information.
 */
export function postProcessVisor(buf: Uint8ClampedArray, W: number, H: number, sharpen = 0.55, contrast = 0.22, saturation = 1.1, grain = 2.2): void {
  if (!ppScratch || ppScratch.length !== buf.length) ppScratch = new Uint8ClampedArray(buf.length);
  if (!ppLut) {
    ppLut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      const x = i / 255;
      const sc = x * x * (3 - 2 * x);
      ppLut[i] = (x + (sc - x) * contrast) * 255;
    }
  }
  const src = ppScratch, lut = ppLut;
  src.set(buf);
  for (let y = 0; y < H; y++) {
    const yu = y > 0 ? y - 1 : y, yd = y < H - 1 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      const xl = x > 0 ? x - 1 : x, xr = x < W - 1 ? x + 1 : x;
      const o = (y * W + x) * 4;
      const oU = (yu * W + x) * 4, oD = (yd * W + x) * 4, oL = (y * W + xl) * 4, oR = (y * W + xr) * 4;
      const g = (hash2(x, y) - 0.5) * 2 * grain;
      let r = src[o], gg = src[o + 1], b = src[o + 2];
      r += sharpen * (r - (src[oU] + src[oD] + src[oL] + src[oR]) * 0.25);
      gg += sharpen * (gg - (src[oU + 1] + src[oD + 1] + src[oL + 1] + src[oR + 1]) * 0.25);
      b += sharpen * (b - (src[oU + 2] + src[oD + 2] + src[oL + 2] + src[oR + 2]) * 0.25);
      r = lut[Math.max(0, Math.min(255, r | 0))]; gg = lut[Math.max(0, Math.min(255, gg | 0))]; b = lut[Math.max(0, Math.min(255, b | 0))];
      const l = 0.3 * r + 0.59 * gg + 0.11 * b;
      buf[o] = l + (r - l) * saturation + g;
      buf[o + 1] = l + (gg - l) * saturation + g;
      buf[o + 2] = l + (b - l) * saturation + g;
    }
  }
}
