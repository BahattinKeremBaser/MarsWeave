/**
 * MARSWEAVE — Visor-HUD telemetry (pure functions, no rendering).
 *
 * Everything here is computed from the elevation grid that is loaded in the app. If that grid is the SYNTHETIC
 * terrain, the HUD values are synthetic too; the HUD labels the data status.
 *
 * STATUS OF EACH VALUE
 *  - pitch / roll / slope: DERIVED from the elevation grid (finite differences over half a cell either side).
 *  - terrain shielding: MODELLED. Fraction of the upper hemisphere hidden by the horizon (8 azimuths) multiplied by
 *    TERRAIN_SHIELD_EFFECTIVENESS, an ASSUMPTION: galactic cosmic rays are energetic, so rock only removes part of
 *    the flux and the DEM resolution hides small-scale terrain.
 *  - dose: MODELLED. RAD_BASELINE_MICROSV_H (MSL RAD at Gale, a proxy) x shielding factor x time.
 *  - relay line-of-sight: MODELLED coverage percentage from the terrain-masking grid. It is NOT a link budget, so no dB.
 */

import {
  ARCADIA_ELEVATION_GRID,
  ARCADIA_SLOPE_GRID,
  ARCADIA_COMMS_GRID,
  GRID_COLS,
  GRID_ROWS,
  CELL_METERS_X,
  CELL_METERS_Y,
  MISSION_BOUNDS,
  RAD_BASELINE_MICROSV_H
} from '../data/arcadiaData';
import { RouteWaypoint } from '../types/marsweave';

/** Suit-helmet eye height above the local ground, metres. */
export const EYE_HEIGHT_M = 1.7;
/** ASSUMPTION: share of the hidden sky fraction that actually reduces dose. */
export const TERRAIN_SHIELD_EFFECTIVENESS = 0.5;

const DEG = 180 / Math.PI;

function clampIdx(v: number, max: number): number {
  return Math.max(0, Math.min(max, v));
}

/** Bilinear elevation (metres) at percent coordinates (0..100). */
export function sampleElevationM(xPct: number, yPct: number): number {
  const cf = clampIdx((xPct / 100) * (GRID_COLS - 1), GRID_COLS - 1);
  const rf = clampIdx((yPct / 100) * (GRID_ROWS - 1), GRID_ROWS - 1);
  const c0 = Math.floor(cf), r0 = Math.floor(rf);
  const c1 = Math.min(GRID_COLS - 1, c0 + 1), r1 = Math.min(GRID_ROWS - 1, r0 + 1);
  const fx = cf - c0, fy = rf - r0;
  const g = ARCADIA_ELEVATION_GRID;
  return (1 - fx) * (1 - fy) * g[r0][c0] + fx * (1 - fy) * g[r0][c1] + (1 - fx) * fy * g[r1][c0] + fx * fy * g[r1][c1];
}

/** Percent offsets -> metres east / south. */
export function pctDeltaToMeters(dxPct: number, dyPct: number): { east: number; south: number } {
  return {
    east: (dxPct / 100) * MISSION_BOUNDS.areaWidthKm * 1000,
    south: (dyPct / 100) * MISSION_BOUNDS.areaHeightKm * 1000
  };
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const d = pctDeltaToMeters(b[0] - a[0], b[1] - a[1]);
  return Math.hypot(d.east, d.south);
}

/** Compass heading in radians (0 = north, +pi/2 = east) from a to b. North is -y on the grid. */
export function headingRadians(a: [number, number], b: [number, number]): number {
  const d = pctDeltaToMeters(b[0] - a[0], b[1] - a[1]);
  return Math.atan2(d.east, -d.south);
}

/** Percent coordinates of the point `meters` ahead of `pos` along a compass heading. */
export function pointAhead(pos: [number, number], headingRad: number, meters: number): [number, number] {
  const east = Math.sin(headingRad) * meters;
  const north = Math.cos(headingRad) * meters;
  return [
    pos[0] + (east / (MISSION_BOUNDS.areaWidthKm * 1000)) * 100,
    pos[1] - (north / (MISSION_BOUNDS.areaHeightKm * 1000)) * 100
  ];
}

export interface Attitude {
  /** Nose-up positive (uphill ahead), degrees. */
  pitchDeg: number;
  /** Right-side-up positive (ground rises to the right), degrees. */
  rollDeg: number;
  slopeDeg: number;
}

/** Terrain attitude under the astronaut for a given heading, from the elevation grid. */
export function terrainAttitude(pos: [number, number], headingRad: number): Attitude {
  const half = Math.max(CELL_METERS_X, CELL_METERS_Y) * 0.5;
  const fwd = sampleElevationM(...pointAhead(pos, headingRad, half));
  const back = sampleElevationM(...pointAhead(pos, headingRad, -half));
  const right = sampleElevationM(...pointAhead(pos, headingRad + Math.PI / 2, half));
  const left = sampleElevationM(...pointAhead(pos, headingRad + Math.PI / 2, -half));
  const pitchDeg = Math.atan2(fwd - back, 2 * half) * DEG;
  const rollDeg = Math.atan2(right - left, 2 * half) * DEG;
  const slopeDeg = Math.hypot(pitchDeg, rollDeg);
  return { pitchDeg, rollDeg, slopeDeg };
}

/**
 * Fraction (0..1) of the upper hemisphere (solid angle) hidden by terrain, from the highest horizon angle in 8
 * azimuths out to ~12 cells. For an isotropic sky the visible fraction above horizon angle h is 1 - sin(h).
 */
export function horizonBlockedFraction(pos: [number, number]): number {
  const e0 = sampleElevationM(pos[0], pos[1]) + EYE_HEIGHT_M;
  const step = Math.min(CELL_METERS_X, CELL_METERS_Y);
  let sum = 0;
  for (let k = 0; k < 8; k++) {
    const az = (k * Math.PI) / 4;
    let maxAngle = 0;
    for (let i = 1; i <= 12; i++) {
      const dist = i * step;
      const p = pointAhead(pos, az, dist);
      if (p[0] < 0 || p[0] > 100 || p[1] < 0 || p[1] > 100) break;
      const ang = Math.atan2(sampleElevationM(p[0], p[1]) - e0, dist);
      if (ang > maxAngle) maxAngle = ang;
    }
    sum += Math.sin(maxAngle);
  }
  return Math.min(1, sum / 8);
}

/** Dose-rate multiplier (<= 1) from terrain shielding (MODELLED, see file header). */
export function shieldingFactor(pos: [number, number]): number {
  return 1 - TERRAIN_SHIELD_EFFECTIVENESS * horizonBlockedFraction(pos);
}

/** Modelled dose rate (microSv/h) at a position. */
export function doseRateMicroSvPerH(pos: [number, number]): number {
  return RAD_BASELINE_MICROSV_H * shieldingFactor(pos);
}

/** Relay line-of-sight coverage percentage (MODELLED grid) at a position. */
export function relayCoveragePct(pos: [number, number]): number {
  const c = clampIdx(Math.round((pos[0] / 100) * (GRID_COLS - 1)), GRID_COLS - 1);
  const r = clampIdx(Math.round((pos[1] / 100) * (GRID_ROWS - 1)), GRID_ROWS - 1);
  return ARCADIA_COMMS_GRID[r][c];
}

/** Slope (deg) of the grid cell under a position, for comparison with the finite-difference attitude. */
export function cellSlopeDeg(pos: [number, number]): number {
  const c = clampIdx(Math.round((pos[0] / 100) * (GRID_COLS - 1)), GRID_COLS - 1);
  const r = clampIdx(Math.round((pos[1] / 100) * (GRID_ROWS - 1)), GRID_ROWS - 1);
  return ARCADIA_SLOPE_GRID[r][c];
}

/** Result of projecting a position onto a route polyline. */
export interface RouteAhead {
  /** Point on the route `lookAheadM` metres further along the route than the astronaut's projection. */
  point: [number, number];
  atEnd: boolean;
  /** Route direction (compass radians) at the projection, from the segment the astronaut is on. */
  tangentRad: number;
  /** Distance travelled along the route at the projection (m) and total route length (m). */
  chainageM: number;
  totalM: number;
}

/**
 * Point on the route about `lookAheadM` metres AHEAD of the astronaut, measured ALONG the route.
 *
 * The astronaut is projected onto the nearest route SEGMENT (not the nearest vertex: with sparse waypoints the nearest
 * vertex is often behind the astronaut, which made the old version turn the view backwards). `minChainageM` keeps the
 * projection from jumping backwards on routes that double back near themselves.
 * Returns null when the route has fewer than two distinct waypoints.
 */
export function routeLookAhead(
  waypoints: RouteWaypoint[],
  pos: [number, number],
  lookAheadM: number,
  minChainageM = 0
): RouteAhead | null {
  const pts: [number, number][] = [];
  for (const w of waypoints) {
    const q: [number, number] = [w.x, w.y];
    if (!pts.length || distanceMeters(pts[pts.length - 1], q) > 0.01) pts.push(q);
  }
  if (pts.length < 2) return null;

  // cumulative chainage (m) at every vertex
  const cum: number[] = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + distanceMeters(pts[i - 1], pts[i]));
  const totalM = cum[cum.length - 1];

  // nearest point on any segment (flat local metres; the window is only ~16 km wide)
  let bestD = Infinity, bestS = 0, bestSeg = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pctDeltaToMeters(pts[i][0] - pos[0], pts[i][1] - pos[1]);
    const b = pctDeltaToMeters(pts[i + 1][0] - pos[0], pts[i + 1][1] - pos[1]);
    const dx = b.east - a.east, dy = b.south - a.south;
    const len2 = dx * dx + dy * dy;
    let u = len2 > 0 ? -(a.east * dx + a.south * dy) / len2 : 0;
    u = Math.max(0, Math.min(1, u));
    const px = a.east + dx * u, py = a.south + dy * u;
    const d = Math.hypot(px, py);
    const s = cum[i] + Math.sqrt(len2) * u;
    if (s < minChainageM - 1e-6) continue;           // never fall behind what was already walked
    if (d < bestD) { bestD = d; bestS = s; bestSeg = i; }
  }
  if (!isFinite(bestD)) { bestS = Math.max(minChainageM, 0); bestSeg = pts.length - 2; }

  const tangentRad = headingRadians(pts[bestSeg], pts[bestSeg + 1]);
  const targetS = Math.min(totalM, bestS + lookAheadM);
  let seg = bestSeg;
  while (seg + 1 < pts.length - 1 && cum[seg + 1] < targetS) seg++;
  const segLen = Math.max(1e-6, cum[seg + 1] - cum[seg]);
  const u = Math.max(0, Math.min(1, (targetS - cum[seg]) / segLen));
  const point: [number, number] = [
    pts[seg][0] + (pts[seg + 1][0] - pts[seg][0]) * u,
    pts[seg][1] + (pts[seg + 1][1] - pts[seg][1]) * u
  ];
  return { point, atEnd: targetS >= totalM - 0.5, tangentRad, chainageM: bestS, totalM };
}

/** Shortest signed angle from a to b, in (-pi, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Time-based heading smoothing: exponential approach (time constant `tauSec`) with a turn-rate limit, so the view
 * turns calmly, never spins, and behaves the same at any frame rate. `dtSec` is clamped to avoid jumps after pauses.
 */
export function smoothHeading(prev: number, desired: number, dtSec: number, tauSec = 0.35, maxRateRadPerSec = 1.4): number {
  if (Number.isNaN(prev)) return desired;
  const dt = Math.max(0, Math.min(0.25, dtSec));
  const diff = angleDiff(prev, desired);
  const step = diff * (1 - Math.exp(-dt / tauSec));
  const cap = maxRateRadPerSec * dt;
  return prev + Math.max(-cap, Math.min(cap, step));
}

/** Mean shielding factor over the first part of a route (used for cumulative dose). */
export function meanShieldingAlongRoute(waypoints: RouteWaypoint[], progressRatio: number): number {
  if (waypoints.length === 0) return 1;
  const upTo = Math.max(1, Math.min(waypoints.length, Math.ceil(progressRatio * waypoints.length)));
  let sum = 0;
  for (let i = 0; i < upTo; i++) sum += shieldingFactor([waypoints[i].x, waypoints[i].y]);
  return sum / upTo;
}

export interface VisorReadout {
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  slopeDeg: number;
  doseRateMicroSvH: number;
  shieldingPct: number;
  relayCoveragePct: number;
  distanceToTargetM: number;
  elevationM: number;
}

/** One-shot HUD readout at a position, heading and target. */
export function computeVisorReadout(pos: [number, number], headingRad: number, target: [number, number]): VisorReadout {
  const att = terrainAttitude(pos, headingRad);
  const shield = shieldingFactor(pos);
  return {
    headingDeg: ((headingRad * DEG) % 360 + 360) % 360,
    pitchDeg: att.pitchDeg,
    rollDeg: att.rollDeg,
    slopeDeg: att.slopeDeg,
    doseRateMicroSvH: RAD_BASELINE_MICROSV_H * shield,
    shieldingPct: (1 - shield) * 100,
    relayCoveragePct: relayCoveragePct(pos),
    distanceToTargetM: distanceMeters(pos, target),
    elevationM: sampleElevationM(pos[0], pos[1])
  };
}
