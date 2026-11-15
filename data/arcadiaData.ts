/**
 * MARSWEAVE — Arcadia Planitia Scientific Dataset & NASA Data Provenance
 * Study window: a 16 km square in Arcadia Planitia near 39.3°N, 171.4°W (188.6°E). Arcadia Planitia is a northern-lowland plain
 * (centre 47.2°N, 184.3°E, USGS Gazetteer) that published work singles out for widespread excess ice. It is a region of interest,
 * not an officially selected landing site.
 * DATA STATUS: elevation is REAL (USGS MOLA-HRSC blend) when data/arcadia_dem.json exists (see
 * scripts/fetch_arcadia_dem.py), otherwise a SYNTHETIC model. Hazard, ice, comms and science-target
 * layers are currently MODELLED/illustrative, not retrieved from PDS products. See DATA_SOURCES.md.
 */

import { marsSunPosition } from '../engine/sunGeometry';
import { slopeDegAtPower, maxWalkableSlopeDeg, NOMINAL_PACE_MS, METABOLIC_AVG_W, METABOLIC_PEAK_W, GRADIENT_LIMIT } from '../engine/evaPhysiology';

const SLOPE_EASY_DEG = slopeDegAtPower(METABOLIC_AVG_W, NOMINAL_PACE_MS);
const SLOPE_HARD_DEG = maxWalkableSlopeDeg(METABOLIC_AVG_W);
const SLOPE_LIMIT_DEG = maxWalkableSlopeDeg(METABOLIC_PEAK_W);
/** Steepest gradient the Minetti cost polynomial covers (0.45 = 24.2 deg); beyond it the cost is unknown. */
const CRITICAL_SLOPE_DEG = (Math.atan(GRADIENT_LIMIT) * 180) / Math.PI;
import { REAL_PRODUCTS, hasReal, isPublished, resampleGrid, realLabel } from './realProducts';
import {
  ScienceTarget,
  HazardZone,
  DataProvenanceEntry,
  DataStatus,
  LayerMetadata,
  EnvironmentalConditions
} from '../types/marsweave';

/**
 * Optional REAL elevation data. Produced by `python scripts/fetch_arcadia_dem.py`, which writes
 * data/arcadia_dem.json from the USGS MOLA-HRSC blended DEM. When the file is absent the app falls
 * back to a clearly-labelled SYNTHETIC terrain model (see ELEVATION_SOURCE).
 */
interface RealDem {
  source: string;
  citation: string;
  datasetUrl: string;
  cols: number;
  rows: number;
  minLat: number; maxLat: number; minLonWest: number; maxLonWest: number;
  areaWidthKm: number; areaHeightKm: number;
  elevationMinMeters: number; elevationMaxMeters: number;
  nativePixelMeters?: number;
  license?: string;
  elevations: number[][]; // rows x cols, metres, row 0 = north
}
const realDemModules = import.meta.glob('./arcadia_dem.json', { eager: true, import: 'default' }) as Record<string, RealDem>;
/** Structural validation: a malformed or truncated JSON must never crash the app, it falls back to SYNTHETIC. */
function validateRealDem(d: RealDem | undefined): RealDem | undefined {
  if (!d) return undefined;
  const fail = (why: string): undefined => {
    console.warn(`[MARSWEAVE] data/arcadia_dem.json ignored (${why}); using SYNTHETIC terrain.`);
    return undefined;
  };
  if (!Array.isArray(d.elevations) || d.elevations.length < 8) return fail('elevations missing or too small');
  if (d.rows !== d.elevations.length) return fail('rows does not match elevations');
  for (const row of d.elevations) {
    if (!Array.isArray(row) || row.length !== d.cols) return fail('cols does not match elevations');
    for (const v of row) if (typeof v !== 'number' || !Number.isFinite(v)) return fail('non-numeric elevation value');
  }
  const nums = [d.minLat, d.maxLat, d.minLonWest, d.maxLonWest, d.areaWidthKm, d.areaHeightKm,
    d.elevationMinMeters, d.elevationMaxMeters];
  if (nums.some(n => typeof n !== 'number' || !Number.isFinite(n))) return fail('bounds or extent missing');
  if (d.areaWidthKm <= 0 || d.areaHeightKm <= 0) return fail('non-positive area extent');
  return d;
}
export const REAL_DEM: RealDem | undefined = validateRealDem(Object.values(realDemModules)[0]);
export const ELEVATION_SOURCE: 'REAL_MOLA_HRSC' | 'SYNTHETIC' = REAL_DEM ? 'REAL_MOLA_HRSC' : 'SYNTHETIC';

// Grid size for the digital elevation and risk simulation model
export const GRID_COLS = REAL_DEM ? REAL_DEM.cols : 50;
export const GRID_ROWS = REAL_DEM ? REAL_DEM.rows : 50;

// Geographic bounding box for Arcadia Planitia Mission Zone
export const MISSION_BOUNDS = {
  minLat: REAL_DEM ? REAL_DEM.minLat : 39.12,
  maxLat: REAL_DEM ? REAL_DEM.maxLat : 39.48,
  minLon: REAL_DEM ? REAL_DEM.minLonWest : 171.22, // West
  maxLon: REAL_DEM ? REAL_DEM.maxLonWest : 171.58, // West
  datumElevationMinMeters: REAL_DEM ? REAL_DEM.elevationMinMeters : -4120,
  datumElevationMaxMeters: REAL_DEM ? REAL_DEM.elevationMaxMeters : -3790,
  areaWidthKm: REAL_DEM ? REAL_DEM.areaWidthKm : 6.8,
  areaHeightKm: REAL_DEM ? REAL_DEM.areaHeightKm : 6.8,
};

/** Metres per grid cell along x (columns) and y (rows). */
export const CELL_METERS_X = (MISSION_BOUNDS.areaWidthKm * 1000) / GRID_COLS;
export const CELL_METERS_Y = (MISSION_BOUNDS.areaHeightKm * 1000) / GRID_ROWS;

// Base station Habitat Alpha position (Grid: [10, 80], Lat/Lon approx)
const RAW_HABITAT = {
  id: 'HAB_ALPHA',
  name: 'Habitat Alpha (Primary Outpost)',
  x: 12,
  y: 82,
  lat: 39.16,
  lon: 171.51,
  elevationMeters: -4020,
  description: 'Hypothetical pressurized habitat module & rover recharging dock (a planning assumption, not a real asset).',
};

/**
 * Radiation baseline: MSL RAD measured GCR dose equivalent rate on the Gale crater surface of about
 * 0.64 mSv/day (Hassler et al. 2014, Science 343, 1244797) = 26.7 uSv/h. Used here as a PROXY for Arcadia
 * Planitia (which sits ~4 km lower than Gale, i.e. under more atmosphere). Solar particle events are not modelled.
 */
export const RAD_BASELINE_MICROSV_H: number = (REAL_PRODUCTS.rad?.doseEquivMicroSvPerH as number | undefined) ?? 26.7;

// Default Target (SCI-04: periglacial ground; fits the default 150 min EVA limit for the WATER objective)
export const DEFAULT_TARGET_ID = 'SCI-04';

/**
 * Procedural generation of deterministic MOLA elevation grid with realistic Martian topography:
 * - Gentle plains base (-4020m)
 * - Escarpment ridge in the NW (elevation rising to -3810m)
 * - Impact crater "Arcadia-C1" at x:35, y:45 (rim at -3880m, bowl floor at -4110m)
 * - Lobate debris flow / ice apron in the North-East
 */
export function generateElevationGrid(): number[][] {
  if (REAL_DEM) return REAL_DEM.elevations.map(row => row.slice());
  const grid: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const nx = c / GRID_COLS;
      const ny = r / GRID_ROWS;

      // Base regional slope (dips toward South-East)
      let elev = -4010 - (nx * 30) - (ny * 40);

      // Northwest Escarpment ridge
      const ridgeDist = Math.abs((nx * 0.8 + ny * 0.6) - 0.45);
      if (ridgeDist < 0.22) {
        elev += (0.22 - ridgeDist) * 750;
      }

      // Impact crater "Arcadia-C1" (center nx: 0.68, ny: 0.42, radius: 0.16)
      const craterDx = nx - 0.68;
      const craterDy = ny - 0.42;
      const craterDist = Math.sqrt(craterDx * craterDx + craterDy * craterDy);
      if (craterDist < 0.18) {
        if (craterDist > 0.13) {
          // Elevated crater rim
          elev += (0.18 - craterDist) * 800;
        } else {
          // Crater bowl depression
          elev -= (0.13 - craterDist) * 950;
        }
      }

      // Secondary degraded micro-crater (center nx: 0.28, ny: 0.65, radius: 0.08)
      const c2Dist = Math.hypot(nx - 0.28, ny - 0.65);
      if (c2Dist < 0.09) {
        elev -= (0.09 - c2Dist) * 450;
      }

      // Subsurface ice mantle hummocks (subtle wave pattern)
      elev += Math.sin(nx * 14) * Math.cos(ny * 12) * 18;
      elev += Math.sin(nx * 32 + ny * 24) * 8;

      row.push(Math.round(elev * 10) / 10);
    }
    grid.push(row);
  }
  return grid;
}

export const ARCADIA_ELEVATION_GRID = generateElevationGrid();

/**
 * Calculate slope steepness matrix (in degrees) from elevation grid.
 */
export function calculateSlopeGrid(elevations: number[][]): number[][] {
  const slopes: number[][] = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const e = elevations[r][c];
      const eLeft = c > 0 ? elevations[r][c - 1] : e;
      const eRight = c < GRID_COLS - 1 ? elevations[r][c + 1] : e;
      const eTop = r > 0 ? elevations[r - 1][c] : e;
      const eBottom = r < GRID_ROWS - 1 ? elevations[r + 1][c] : e;

      const dzDx = (eRight - eLeft) / (2 * CELL_METERS_X);
      const dzDy = (eBottom - eTop) / (2 * CELL_METERS_Y);
      const slopeRad = Math.atan(Math.sqrt(dzDx * dzDx + dzDy * dzDy));
      const slopeDeg = (slopeRad * 180) / Math.PI;

      row.push(Math.round(slopeDeg * 10) / 10);
    }
    slopes.push(row);
  }
  return slopes;
}

export const ARCADIA_SLOPE_GRID = calculateSlopeGrid(ARCADIA_ELEVATION_GRID);

/** Slope step (deg) between neighbouring cells that counts as a severe roughness transition. */
export const ROUGHNESS_JUMP_DEG = 12;
/** Cells steeper than this (deg) are clustered into hazard zones (the planner starts penalising slopes here). */
export const HAZARD_SLOPE_DEG = SLOPE_HARD_DEG; // slowest credible pace (1 km/h) needs more than the 350 W Mars EVA average
/** Mean cluster slope above which a zone is HIGH_RISK (near the suit traction limit). */
export const HAZARD_HIGH_SLOPE_DEG = SLOPE_LIMIT_DEG; // slowest credible pace needs more than the 530 W peak

/** Largest absolute slope difference between a cell and its 8 neighbours (a simple roughness proxy). */
function slopeRoughness(slopes: number[][], r: number, c: number): number {
  let m = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= slopes.length || cc < 0 || cc >= slopes[0].length) continue;
      const d = Math.abs(slopes[rr][cc] - slopes[r][c]);
      if (d > m) m = d;
    }
  }
  return m;
}

/** Per-cell percentile rank (0..1) of the real THEMIS thermal inertia inside the window; undefined without the product. */
/** OFF: the THEMIS window shows an axis-aligned step (about 110 -> 900 tiu) that looks like a mosaic seam, not terrain. Do not steer routes with it until verified. */
const ROCK_PROXY_FROM_TI = false;
const TI_RANK: number[][] | undefined = (() => {
  if (!hasReal('themis_ti')) return undefined;
  const g = resampleGrid('themis_ti', GRID_COLS, GRID_ROWS);
  if (!g) return undefined;
  const sorted = g.flat().slice().sort((a, b) => a - b);
  const n = sorted.length;
  return g.map(row => row.map(v => {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    return lo / n;
  }));
})();

/**
 * HiRISE Boulder & Hazard density grid (0..1 normalized risk)
 */
export function generateHazardGrid(slopes: number[][]): number[][] {
  const hazards: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const nx = c / GRID_COLS;
      const ny = r / GRID_ROWS;
      const slope = slopes[r][c];

      // Slope component. Band edges come from the walking-cost model (engine/evaPhysiology.ts), unloaded crew:
      //  above SLOPE_EASY_DEG the nominal pace needs more than the 350 W Mars EVA average,
      //  above SLOPE_HARD_DEG even the slowest credible pace (1 km/h) needs more than 350 W,
      //  above SLOPE_LIMIT_DEG it needs more than the 530 W peak. The weights 0.15 / 0.4 / 0.75 are design choices.
      let risk = 0;
      if (slope > SLOPE_LIMIT_DEG) risk += 0.75;
      else if (slope > SLOPE_HARD_DEG) risk += 0.4;
      else if (slope > SLOPE_EASY_DEG) risk += 0.15;

      if (REAL_DEM) {
        // Real terrain: only what the DEM supports (slope + local slope roughness). Boulders are NOT resolved.
        if (slopeRoughness(slopes, r, c) > ROUGHNESS_JUMP_DEG && slope > SLOPE_HARD_DEG) risk += 0.2;
        // Rock/bedrock PROXY from real THEMIS thermal inertia: the most thermally inertial cells of the window
        // (top 10 % / next 15 %) are the likeliest to be rocky or bedrock-exposed. This is a relative proxy, not a rock census.
        if (TI_RANK && ROCK_PROXY_FROM_TI) {
          const q = TI_RANK[r][c];
          if (q >= 0.9) risk += 0.2; else if (q >= 0.75) risk += 0.08;
        }
      } else {
        // SYNTHETIC terrain only: hand-authored ejecta ring around crater Arcadia-C1 (nx 0.68, ny 0.42)
        const cDist = Math.hypot(nx - 0.68, ny - 0.42);
        if (cDist >= 0.14 && cDist <= 0.28) {
          risk += Math.max(0, (0.28 - cDist) * 2.8);
        }

        // SYNTHETIC terrain only: escarpment scree field in North-West
        const ridgeDist = Math.abs((nx * 0.8 + ny * 0.6) - 0.45);
        if (ridgeDist < 0.12) {
          risk += 0.35;
        }
      }

      row.push(Math.min(1, Math.round(risk * 100) / 100));
    }
    hazards.push(row);
  }
  return hazards;
}

export const ARCADIA_HAZARD_GRID = generateHazardGrid(ARCADIA_SLOPE_GRID);

/**
 * SHARAD Subsurface Ice Confidence Map (0..100%)
 * Arcadia Planitia is renowned for massive sheet-like excess ice deposits 
 * documented by Bramson et al. and Stuurman et al.
 */
export function generateSubsurfaceIceGrid(): number[][] {
  const iceGrid: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const nx = c / GRID_COLS;
      const ny = r / GRID_ROWS;

      // High ice probability in northern and north-eastern lobes
      let prob = 50 + (1 - ny) * 35 + (nx * 15);

      // Craters punch through or disturb pure ice layer
      const cDist = Math.hypot(nx - 0.68, ny - 0.42);
      if (cDist < 0.14) {
        prob *= 0.25;
      }

      prob += Math.sin(nx * 8) * Math.cos(ny * 8) * 10;
      row.push(Math.max(0, Math.min(100, Math.round(prob))));
    }
    iceGrid.push(row);
  }
  return iceGrid;
}

export const ARCADIA_ICE_GRID: number[][] = (hasReal('swim_ice') ? resampleGrid('swim_ice', GRID_COLS, GRID_ROWS) : undefined) ?? generateSubsurfaceIceGrid();
/** Real grids (undefined when the product file is absent). */
/** True when the ice grid is the real SWIM2 file (then the number is a consistency index x100, NOT a probability). */
export const ICE_IS_REAL_SWIM: boolean = hasReal('swim_ice');
export const REAL_THEMIS_GRID = hasReal('themis_ti') ? resampleGrid('themis_ti', GRID_COLS, GRID_ROWS) : undefined;
export const REAL_ALBEDO_GRID = hasReal('hirise_albedo') ? resampleGrid('hirise_albedo', GRID_COLS, GRID_ROWS) : undefined;
export const REAL_CRISM_GRID = hasReal('crism_hydration') ? resampleGrid('crism_hydration', GRID_COLS, GRID_ROWS) : undefined;
/** Column dust optical depth: real LMD/MCD series when loaded, otherwise the old scenario values. */
/** Published MEDA (Jezero) afternoon reference values; undefined when data/real/meda.json is absent. */
export const MEDA_REF = hasReal('meda') ? {
  afternoonAirTempC: Math.round(((REAL_PRODUCTS.meda?.afternoonAirTempK as number) - 273.15) * 10) / 10,
  afternoonWindMedianMs: REAL_PRODUCTS.meda?.afternoonWindMedianMs as number,
  n: REAL_PRODUCTS.meda?.afternoonN as number,
} : undefined;

/**
 * Sun geometry for the scenario "Sol 342, 14:24 LTST". Ls comes from the real LMD MY34 file (its Ls for sol 342);
 * without that file the old fixed elevation is kept. Latitude 39.3 N.
 */
const SCENARIO_SOL = 342, SCENARIO_LTST_H = 14 + 24 / 60;
const SCENARIO_LS: number | undefined = (REAL_PRODUCTS.dust_tau?.series as { sol: number; ls: number | null }[] | undefined)
  ?.find(p => p.sol === SCENARIO_SOL)?.ls ?? undefined;
export const SUN_DERIVED = SCENARIO_LS !== undefined ? marsSunPosition(39.3, SCENARIO_LS, SCENARIO_LTST_H) : undefined;
export const SUN_LS_DEG: number | undefined = SCENARIO_LS;

export const TAU_TYPICAL: number = (REAL_PRODUCTS.dust_tau?.tauTypical as number | undefined) ?? 0.54;
export const TAU_STORM: number = (REAL_PRODUCTS.dust_tau?.tauMax as number | undefined) ?? 1.65;

/**
 * Communication Relay Line-of-Sight Coverage Grid (0..100%)
 * Accounts for terrain shadowing from the northwest escarpment and deep crater.
 */
export function generateCommsGrid(elevations: number[][]): number[][] {
  const commsGrid: number[][] = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      const nx = c / GRID_COLS;
      const ny = r / GRID_ROWS;

      // Baseline nominal orbital relay pass visibility
      let coverage = 95;

      // Deep crater floor shadow
      const cDist = Math.hypot(nx - 0.68, ny - 0.42);
      if (cDist < 0.11) {
        coverage = 42; // Low elevation multipath attenuation
      } else if (cDist < 0.15) {
        coverage = 68;
      }

      // Shadowed backside of NW Escarpment
      if (nx < 0.22 && ny < 0.35) {
        coverage = 60;
      }

      row.push(coverage);
    }
    commsGrid.push(row);
  }
  return commsGrid;
}

export const ARCADIA_COMMS_GRID = generateCommsGrid(ARCADIA_ELEVATION_GRID);

/**
 * Hand-authored hazard zones for the SYNTHETIC terrain only. They are used as a fallback when no real DEM
 * is loaded AND the derivation below finds no cluster; they never apply to real terrain.
 */
const LEGACY_SYNTHETIC_HAZARD_ZONES: HazardZone[] = [
  {
    id: 'HAZ-01',
    name: 'Arcadia-C1 Steep Crater Rim Scarp',
    type: 'CRATER_RIM',
    severity: 'CRITICAL',
    center: [68, 42],
    radius: 11,
    slopeDeg: 34,
    boulderDensityPct: 65,
    description: 'Unstable scree slope with 30-36° gradients and high probability of astronaut regolith slippage.',
    avoidanceRationale: 'Exceeds suit mobility traction limits (>25°); risk of unrecoverable tumble or suit puncture.'
  },
  {
    id: 'HAZ-02',
    name: 'South Ejecta Dense Boulder Field',
    type: 'BOULDER_FIELD',
    severity: 'HIGH_RISK',
    center: [75, 48],
    radius: 8,
    boulderDensityPct: 82,
    description: 'Cluster of metric and decametric basalt boulders with sharp fracture edges from impact cratering.',
    avoidanceRationale: 'Extreme trip and suit tear hazard; forces rover and pedestrian navigation into dead-ends.'
  },
  {
    id: 'HAZ-03',
    name: 'Northwest Escarpment Crest',
    type: 'STEEP_ESCARPMENT',
    severity: 'HIGH_RISK',
    center: [22, 28],
    radius: 9,
    slopeDeg: 28,
    description: 'Sheer vertical drop-off and fractured bedrock overhang.',
    avoidanceRationale: 'Structural collapse risk and severe elevation penalty for astronaut metabolic rate.'
  },
  {
    id: 'HAZ-04',
    name: 'Crater Floor Communication Blindspot',
    type: 'COMMS_SHADOW',
    severity: 'CAUTION',
    center: [68, 42],
    radius: 8,
    description: 'Deep topographic depression causing multipath radar attenuation and loss of orbiter line-of-sight.',
    avoidanceRationale: 'Deprives astronaut of telemetry downlink and real-time medical monitoring from Habitat.'
  }
];

/** Short map labels (the full names stay in the detail panels). */
const SHORT_TARGET_NAMES: Record<string, string> = {
  'SCI-04': 'Ice-index site',
  'SCI-02': 'Steep slope',
  'SCI-11': 'Depression',
  'SCI-05': 'Lowest flat ground',
  'SCI-06': 'Smoothest ground'
};
/** One colour per candidate kind (maps and markers) and one per hazard kind, so the two are never confused. */
const TARGET_COLORS: Record<string, string> = {
  'SCI-04': '#38bdf8', // ice index: blue
  'SCI-02': '#c084fc', // steep slope: purple
  'SCI-11': '#2dd4bf', // depression: teal
  'SCI-05': '#a3e635', // lowest flat ground: lime
  'SCI-06': '#f472b6'  // smoothest ground: pink
};
export function targetColor(t: Pick<ScienceTarget, 'id'>): string {
  return TARGET_COLORS[t.id] ?? '#e2e8f0';
}
const HAZARD_COLORS: Record<string, string> = {
  STEEP_ESCARPMENT: '#ef4444', // red
  CRATER_RIM: '#f97316',       // orange
  BOULDER_FIELD: '#eab308',    // yellow (rough terrain)
  COMMS_SHADOW: '#94a3b8',     // grey-blue
  DUST_ACCUMULATION: '#d6a15c' // sand
};
const HAZARD_KIND: Record<string, string> = {
  STEEP_ESCARPMENT: 'Steep slope',
  CRATER_RIM: 'Slope beside a depression',
  BOULDER_FIELD: 'Rough terrain',
  COMMS_SHADOW: 'Relay shadow',
  DUST_ACCUMULATION: 'Dust'
};
export function hazardColor(type: string): string { return HAZARD_COLORS[type] ?? '#ef4444'; }
export function hazardKindLabel(type: string): string { return HAZARD_KIND[type] ?? 'Hazard'; }
/** '#rrggbb' + alpha -> 'rgba(...)' for canvas drawing. */
export function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Plain-language kind of a candidate (replaces the internal type enum in the UI). */
export function targetKindLabel(t: Pick<ScienceTarget, 'id'>): string {
  return SHORT_TARGET_NAMES[t.id] ?? 'Candidate site';
}
export function shortTargetLabel(t: Pick<ScienceTarget, 'id'>): string {
  const n = SHORT_TARGET_NAMES[t.id];
  return n ? `${t.id} · ${n}` : t.id;
}

/** Cell (col,row) -> percent coordinates used everywhere else (0..100, consistent with planEvaRoutes). */
function cellToPercent(c: number, r: number): [number, number] {
  return [Math.round((c / GRID_COLS) * 1000) / 10, Math.round((r / GRID_ROWS) * 1000) / 10];
}

function percentToLatLon(x: number, y: number): { lat: number; lon: number } {
  const lat = MISSION_BOUNDS.minLat + (1 - y / 100) * (MISSION_BOUNDS.maxLat - MISSION_BOUNDS.minLat);
  const lon = MISSION_BOUNDS.minLon + (x / 100) * (MISSION_BOUNDS.maxLon - MISSION_BOUNDS.minLon);
  return { lat: Math.round(lat * 10000) / 10000, lon: Math.round(lon * 10000) / 10000 };
}

/** 8-connected clustering of a boolean mask. Returns lists of [col,row] cells. */
function clusterMask(mask: boolean[][], minCells: number): [number, number][][] {
  const rows = mask.length;
  const cols = mask[0].length;
  const seen = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const clusters: [number, number][][] = [];
  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      if (!mask[r0][c0] || seen[r0][c0]) continue;
      const stack: [number, number][] = [[c0, r0]];
      const cells: [number, number][] = [];
      seen[r0][c0] = true;
      while (stack.length > 0) {
        const [c, r] = stack.pop()!;
        cells.push([c, r]);
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || seen[rr][cc] || !mask[rr][cc]) continue;
            seen[rr][cc] = true;
            stack.push([cc, rr]);
          }
        }
      }
      if (cells.length >= minCells) clusters.push(cells);
    }
  }
  return clusters.sort((a, b) => b.length - a.length);
}

/**
 * Derives named hazard zones from the terrain itself.
 *  - Steep/rough clusters: cells steeper than HAZARD_SLOPE_DEG, or steeper than 14 deg with a slope step
 *    larger than ROUGHNESS_JUMP_DEG to a neighbour, grouped with 8-connectivity.
 *  - Comms shadows: clusters of cells with modelled relay coverage below 55 % (MODELLED input).
 * Boulders are NOT resolved at DEM resolution; roughness-dominated clusters are only a proxy for blocky terrain.
 */
export function deriveHazardsFromSlope(
  slopeGrid: number[][],
  elevationGrid: number[][],
  commsGrid: number[][] = []
): HazardZone[] {
  const rows = slopeGrid.length;
  const cols = slopeGrid[0].length;
  const mask = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const roughOnly = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = slopeGrid[r][c];
      const steep = s > HAZARD_SLOPE_DEG;
      const rough = s > HAZARD_SLOPE_DEG && slopeRoughness(slopeGrid, r, c) > ROUGHNESS_JUMP_DEG;
      mask[r][c] = steep || rough;
      roughOnly[r][c] = !steep && rough;
    }
  }

  const cellPct = 100 / cols; // one cell, in percent of the x axis (zone radii use this unit)
  const zones: HazardZone[] = [];
  // Long escarpments would be one huge circle, so each connected cluster is split into square tiles.
  const tile = Math.max(4, Math.round(0.1 * Math.min(rows, cols)));
  const clusters = clusterMask(mask, 3).slice(0, 8);
  const candidates: HazardZone[] = [];
  clusters.forEach(cells => {
    const cAll = cells.map(([c]) => c), rAll = cells.map(([, r]) => r);
    const wCells = Math.max(...cAll) - Math.min(...cAll) + 1, hCells = Math.max(...rAll) - Math.min(...rAll) + 1;
    const elongation = Math.max(wCells, hCells) / Math.max(1, Math.min(wCells, hCells));
    const roughShare = cells.filter(([c, r]) => roughOnly[r][c]).length / cells.length;
    const clusterElev = cells.reduce((a, [c, r]) => a + elevationGrid[r][c], 0) / cells.length;
    const mcAll = cAll.reduce((a, b) => a + b, 0) / cells.length;
    const mrAll = rAll.reduce((a, b) => a + b, 0) / cells.length;

    // Is there a depression within the cluster footprint? Then a steep ring reads as a crater rim.
    const reach = Math.ceil(Math.max(wCells, hCells));
    let lowest = Infinity;
    for (let r = Math.max(0, Math.floor(mrAll) - reach); r <= Math.min(rows - 1, Math.floor(mrAll) + reach); r++) {
      for (let c = Math.max(0, Math.floor(mcAll) - reach); c <= Math.min(cols - 1, Math.floor(mcAll) + reach); c++) {
        if (elevationGrid[r][c] < lowest) lowest = elevationGrid[r][c];
      }
    }
    let type: HazardZone['type'];
    let label: string;
    if (roughShare > 0.5) {
      type = 'BOULDER_FIELD';
      label = 'Rough terrain';
    } else if (elongation >= 2.2) {
      type = 'STEEP_ESCARPMENT';
      label = 'Steep escarpment';
    } else if (clusterElev - lowest > 25) {
      type = 'CRATER_RIM';
      label = 'Steep slope beside a depression';
    } else {
      type = 'STEEP_ESCARPMENT';
      label = 'Steep slope patch';
    }

    const tiles = new Map<string, [number, number][]>();
    for (const cell of cells) {
      const key = `${Math.floor(cell[0] / tile)},${Math.floor(cell[1] / tile)}`;
      const arr = tiles.get(key);
      if (arr) arr.push(cell); else tiles.set(key, [cell]);
    }
    tiles.forEach(tc => {
      if (tc.length < 3 && cells.length >= 3 && tiles.size > 1) return;
      const n = tc.length;
      const mc = tc.reduce((a, [c]) => a + c, 0) / n;
      const mr = tc.reduce((a, [, r]) => a + r, 0) / n;
      const radiusCells = Math.max(...tc.map(([c, r]) => Math.hypot(c - mc, r - mr))) + 1;
      const slopes = tc.map(([c, r]) => slopeGrid[r][c]);
      const meanSlope = slopes.reduce((a, b) => a + b, 0) / n;
      const peakSlope = Math.max(...slopes);
      const severity: HazardZone['severity'] =
        peakSlope > CRITICAL_SLOPE_DEG || meanSlope > CRITICAL_SLOPE_DEG - 4 ? 'CRITICAL' : meanSlope > HAZARD_HIGH_SLOPE_DEG ? 'HIGH_RISK' : 'CAUTION';
      const x = Math.round(((mc + 0.5) / cols) * 1000) / 10;
      const y = Math.round(((mr + 0.5) / rows) * 1000) / 10;
      const ll = percentToLatLon(x, y);
      candidates.push({
        id: '',
        name: `${label} (${ll.lat.toFixed(3)}°N, ${ll.lon.toFixed(3)}°W)`,
        type,
        severity,
        center: [x, y],
        radius: Math.round(Math.min(14, Math.max(3, radiusCells * cellPct)) * 10) / 10,
        slopeDeg: Math.round(peakSlope),
        description:
          `DERIVED from the elevation grid: ${n} connected cells, mean slope ${meanSlope.toFixed(1)}°, ` +
          `peak ${peakSlope.toFixed(1)}° at ${CELL_METERS_X.toFixed(0)} m cells.` +
          (type === 'BOULDER_FIELD'
            ? ' Roughness is only a proxy for blocky terrain; individual boulders are not resolved at this resolution.'
            : ''),
        avoidanceRationale:
          `Slopes above ${HAZARD_SLOPE_DEG.toFixed(1)}° are penalised by the planner. The modelled walking-power limit (350 to 530 W at 1 km/h) ` +
          `is about ${SLOPE_HARD_DEG.toFixed(0)}° (350 W) to ${SLOPE_LIMIT_DEG.toFixed(0)}° (530 W) for the unloaded crew; it is a metabolic limit, not a traction limit. ` +
          'Slopes are averaged over the grid cell size, so real local slopes can be steeper.'
      });
    });
  });
  const sevRank: Record<string, number> = { CRITICAL: 3, HIGH_RISK: 2, CAUTION: 1, SAFE: 0 };
  candidates
    .sort((a, b) => sevRank[b.severity] - sevRank[a.severity] || (b.slopeDeg ?? 0) - (a.slopeDeg ?? 0))
    .slice(0, 16)
    .forEach((z, i) => zones.push({ ...z, id: `HAZ-D${String(i + 1).padStart(2, '0')}` }));

  if (commsGrid.length > 0) {
    const shadow = commsGrid.map(row => row.map(v => v < 55));
    clusterMask(shadow, 6).slice(0, 2).forEach((cells, i) => {
      const n = cells.length;
      const mc = cells.reduce((a, [c]) => a + c, 0) / n;
      const mr = cells.reduce((a, [, r]) => a + r, 0) / n;
      const radiusCells = Math.max(...cells.map(([c, r]) => Math.hypot(c - mc, r - mr))) + 1;
      zones.push({
        id: `HAZ-C${String(i + 1).padStart(2, '0')}`,
        name: `Relay comms shadow ${i + 1}`,
        type: 'COMMS_SHADOW',
        severity: 'CAUTION',
        center: [Math.round(((mc + 0.5) / cols) * 1000) / 10, Math.round(((mr + 0.5) / rows) * 1000) / 10],
        radius: Math.round(Math.min(14, Math.max(3, radiusCells * cellPct)) * 10) / 10,
        description:
          `${n} cells where the MODELLED relay line-of-sight coverage is below 55 %. Computed from terrain masking, ` +
          'not from a real orbiter pass geometry.',
        avoidanceRationale: 'Telemetry downlink and real-time medical monitoring may drop here (modelled).'
      });
    });
  }
  return zones;
}

const DERIVED_HAZARD_ZONES = deriveHazardsFromSlope(ARCADIA_SLOPE_GRID, ARCADIA_ELEVATION_GRID, ARCADIA_COMMS_GRID);

/**
 * 'DERIVED' = zones are computed from the real DEM; 'LEGACY' = hand-authored zones that belong to the SYNTHETIC
 * terrain (its slopes never exceed ~16 deg, so slope clustering alone would find nothing to avoid there).
 */
export const HAZARD_ZONE_ORIGIN: 'DERIVED' | 'LEGACY' = REAL_DEM ? 'DERIVED' : 'LEGACY';

export const ARCADIA_HAZARD_ZONES: HazardZone[] =
  HAZARD_ZONE_ORIGIN === 'DERIVED' ? DERIVED_HAZARD_ZONES : LEGACY_SYNTHETIC_HAZARD_ZONES;

/**
 * Terrain classes from the slope grid, drawn as an annotated "regions" overlay in the style of NASA route maps.
 * Status: DERIVED from the elevation grid only. These are slope classes, NOT geologic units.
 */
export const TERRAIN_CLASSES = [
  { id: 0, label: 'Smooth plain', range: '< 3°', rgb: '16,185,129' },
  { id: 1, label: 'Gentle slope', range: '3–8°', rgb: '56,189,248' },
  { id: 2, label: 'Moderate slope', range: '8–14°', rgb: '245,158,11' },
  { id: 3, label: 'Steep slope', range: '> 14°', rgb: '239,68,68' }
] as const;

export const TERRAIN_CLASS_GRID: number[][] = ARCADIA_SLOPE_GRID.map(row =>
  row.map(sl => (sl < 3 ? 0 : sl < 8 ? 1 : sl < 14 ? 2 : 3))
);

export interface TerrainRegion { classId: number; label: string; x: number; y: number; cells: number }

/** Largest connected patch of each class (and a second one when it is big), with its centroid in percent. */
export const TERRAIN_REGIONS: TerrainRegion[] = (() => {
  const regions: TerrainRegion[] = [];
  for (const cls of TERRAIN_CLASSES) {
    const mask = TERRAIN_CLASS_GRID.map(row => row.map(v => v === cls.id));
    const clusters = clusterMask(mask, 10).slice(0, 2);
    clusters.forEach((cells, i) => {
      if (i === 1 && cells.length < 120) return;
      const mc = cells.reduce((a, [c]) => a + c, 0) / cells.length;
      const mr = cells.reduce((a, [, r]) => a + r, 0) / cells.length;
      // snap the label anchor to the member cell closest to the centroid so it sits inside its patch
      let best = cells[0], bd = Infinity;
      for (const cell of cells) {
        const d = Math.hypot(cell[0] - mc, cell[1] - mr);
        if (d < bd) { bd = d; best = cell; }
      }
      if (regions.some(o => Math.hypot(o.x - ((best[0] + 0.5) / GRID_COLS) * 100, o.y - ((best[1] + 0.5) / GRID_ROWS) * 100) < 16)) return;
      regions.push({
        classId: cls.id,
        label: `${cls.label} (${cls.range})`,
        x: ((best[0] + 0.5) / GRID_COLS) * 100,
        y: ((best[1] + 0.5) / GRID_ROWS) * 100,
        cells: cells.length
      });
    });
  }
  return regions;
})();

/**
 * Candidate sampling sites, DERIVED from the data layers that are actually loaded. They are NOT detections: no CRISM,
 * HiRISE or SHARAD product is read for them, and no instrument observation is claimed. Each candidate is the best
 * reachable cell (slope <= 18 deg, away from the window edge, >= 3 cells apart) for one transparent rule:
 *  - SCI-04  flat ground with the highest SWIM2 ice-consistency index (flat = easier drilling; the index is coarse, ~3 km cells)
 *  - SCI-02  steepest reachable slope (exposed-bedrock proxy; slope from the real DEM)
 *  - SCI-11  deepest local depression (pit floor proxy; elevation from the DEM)
 * scientificValue is a constant 100 (each candidate is the best cell for its own rule; no cross-rule ranking is claimed).
 * confidencePct is 0 because nothing was detected.
 */
const CANDIDATE_STOP_MIN = 10; // ASSUMPTION: planning time per sampling stop, not a sourced figure

interface CandidateRule {
  id: string;
  name: string;
  type: ScienceTarget['type'];
  metric: (c: number, r: number) => number | null; // higher is better, null = not applicable
  describe: (c: number, r: number) => { description: string; evidence: ScienceTarget['evidenceChain']; sources: string[] };
}

function deriveScienceTargets(
  elevations: number[][],
  slopes: number[][],
  ice: number[][]
): ScienceTarget[] {
  const rows = slopes.length;
  const cols = slopes[0].length;
  const MAX_SLOPE = 18;
  const margin = 2;
  const status = REAL_DEM ? 'real MOLA-HRSC DEM' : 'SYNTHETIC terrain (no real DEM loaded)';
  const iceName = ICE_IS_REAL_SWIM ? 'SWIM2 ice-consistency index' : 'modelled ice score (SIMULATED)';

  const localDepth = (c: number, r: number) => {
    let sum = 0, cnt = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) { sum += elevations[rr][cc]; cnt++; }
    }
    return sum / cnt - elevations[r][c];
  };
  const dem = (c: number, r: number) => ({
    instrument: 'DEM',
    mission: REAL_DEM ? 'MOLA (MGS) + HRSC (Mars Express) blend' : 'Synthetic terrain model',
    observation: `Elevation ${Math.round(elevations[r][c])} m, slope ${slopes[r][c].toFixed(1)}\u00b0 at this cell (${status}).`,
    derivedProperty: 'Position, reachability and local relief used by the route planner.',
    scientificSignificance: 'Terrain fact for this cell only; says nothing about composition.'
  });

  const rules: CandidateRule[] = [
    {
      id: 'SCI-04',
      name: 'Candidate A: flat ground, highest ice-consistency index',
      type: 'SUBSURFACE_ICE',
      metric: (c, r) => ice[r][c] - 4 * slopes[r][c],
      describe: (c, r) => ({
        description: `Flat reachable ground (${slopes[r][c].toFixed(1)}\u00b0) where the ${iceName} is highest in this window (${ice[r][c]}). A candidate for ice-prospecting, not a detected deposit.`,
        evidence: [
          {
            instrument: ICE_IS_REAL_SWIM ? 'SWIM2 composite' : 'Ice model',
            mission: ICE_IS_REAL_SWIM ? 'Mars Subsurface Water Ice Mapping (NASA/PSI)' : 'MARSWEAVE placeholder',
            observation: `${iceName}: ${ice[r][c]} (0..100 rescaled; native pixels about 3 km, so the window holds only a few independent values).`,
            derivedProperty: ICE_IS_REAL_SWIM ? 'Consistency of the combined orbital evidence with buried ice. It is an index, not a probability or a depth.' : 'Not a measurement.',
            scientificSignificance: 'Arcadia Planitia is a published region of widespread excess ice (Bramson et al. 2015; Morgan et al. 2021), but this exact spot is not confirmed.'
          },
          dem(c, r)
        ],
        sources: [ICE_IS_REAL_SWIM ? 'SWIM2 composite (Morgan et al. 2021)' : 'Placeholder ice model', REAL_DEM ? 'MOLA-HRSC DEM (USGS)' : 'Synthetic DEM']
      })
    },
    {
      id: 'SCI-02',
      name: 'Candidate B: steepest reachable slope (bedrock-exposure proxy)',
      type: 'GEOLOGY_STRATUM',
      metric: (_c, _r) => null,
      describe: (c, r) => ({
        description: `Steepest reachable slope in the window (${slopes[r][c].toFixed(1)}\u00b0). Steep faces can expose layering, but no rock type is identified here.`,
        evidence: [dem(c, r)],
        sources: [REAL_DEM ? 'MOLA-HRSC DEM (USGS)' : 'Synthetic DEM']
      })
    },
    {
      id: 'SCI-11',
      name: 'Candidate C: deepest local depression (pit proxy)',
      type: 'THERMAL_ANOMALY',
      metric: (c, r) => (slopes[r][c] > 12 ? null : localDepth(c, r)),
      describe: (c, r) => ({
        description: `Deepest local depression (${localDepth(c, r).toFixed(0)} m below the surrounding mean). Depressions in Arcadia are often related to ground-ice loss, but no process is confirmed here.`,
        evidence: [dem(c, r)],
        sources: [REAL_DEM ? 'MOLA-HRSC DEM (USGS)' : 'Synthetic DEM']
      })
    }
  ];
  const meanSlope5 = (c: number, r: number) => {
    let sum = 0, cnt = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) { sum += slopes[rr][cc]; cnt++; }
    }
    return sum / cnt;
  };
  rules.push(
    {
      id: 'SCI-05',
      name: 'Candidate D: lowest flat ground (low-elevation proxy)',
      type: 'GEOLOGY_STRATUM',
      metric: (c, r) => (slopes[r][c] > 3 ? null : -elevations[r][c]),
      describe: (c, r) => ({
        description: `Lowest ground in the window that is also flat (${slopes[r][c].toFixed(1)}\u00b0), at ${Math.round(elevations[r][c])} m. Published Starship landing-site studies of Arcadia, Erebus and Phlegra weigh low elevation and ice association; this cell only applies the elevation and flatness part to our window.`,
        evidence: [dem(c, r)],
        sources: [REAL_DEM ? 'MOLA-HRSC DEM (USGS)' : 'Synthetic DEM', 'SpaceX Starship Landing Sites on Mars (LPSC 52, 2021, abstract 2420)']
      })
    },
    {
      id: 'SCI-06',
      name: 'Candidate E: smoothest ground (landing and base proxy)',
      type: 'GEOLOGY_STRATUM',
      metric: (c, r) => -meanSlope5(c, r),
      describe: (c, r) => ({
        description: `Cell whose 5 x 5 neighbourhood has the lowest mean slope in the window (${meanSlope5(c, r).toFixed(1)}\u00b0). A smooth, easy-to-cross area; roughness finer than the DEM cell is not resolved.`,
        evidence: [dem(c, r)],
        sources: [REAL_DEM ? 'MOLA-HRSC DEM (USGS)' : 'Synthetic DEM']
      })
    }
  );
  // SCI-02 uses slope itself
  rules[1].metric = (c, r) => slopes[r][c];

  const taken: [number, number][] = [];
  const out: ScienceTarget[] = [];
  for (const rule of rules) {
    const cells: { c: number; r: number; m: number }[] = [];
    for (let r = margin; r < rows - margin; r++) {
      for (let c = margin; c < cols - margin; c++) {
        if (slopes[r][c] > MAX_SLOPE) continue;
        const m = rule.metric(c, r);
        if (m === null || !Number.isFinite(m)) continue;
        cells.push({ c, r, m });
      }
    }
    if (!cells.length) continue;
    const sorted = [...cells].sort((p, q) => p.m - q.m);
    const pick = [...sorted].reverse().find(k => !taken.some(([tc, tr]) => Math.hypot(tc - k.c, tr - k.r) < 3));
    if (!pick) continue;
    taken.push([pick.c, pick.r]);
    const [x, y] = cellToPercent(pick.c, pick.r);
    const ll = percentToLatLon(x, y);
    const info = rule.describe(pick.c, pick.r);
    out.push({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      x, y,
      lat: ll.lat,
      lon: ll.lon,
      elevationMeters: Math.round(elevations[pick.r][pick.c]),
      scientificValue: 100, // every candidate is the best cell for its own rule; no cross-rule ranking is claimed
      confidencePct: 0,
      dataSources: info.sources,
      recommendedAction: 'Visual survey and sample collection (planning placeholder, not an instrument-driven plan).',
      observationTimeMin: CANDIDATE_STOP_MIN,
      description: info.description,
      evidenceChain: info.evidence,
      snapRule: `Candidate rule: ${rule.name}`
    });
  }
  return out;
}

/** Candidate sites follow the loaded layers (real DEM, SWIM2, THEMIS when present). */
export const ARCADIA_SCIENCE_TARGETS: ScienceTarget[] = deriveScienceTargets(ARCADIA_ELEVATION_GRID, ARCADIA_SLOPE_GRID, ARCADIA_ICE_GRID);

/**
 * Habitat Alpha is a hypothetical outpost. On a real DEM it is placed on the flattest ground (slope <= 2.5 deg)
 * closest to the centre of the science targets, so every EVA is of realistic length and starts on safe terrain.
 */
function snapHabitat(base: typeof RAW_HABITAT): typeof RAW_HABITAT {
  const targets = ARCADIA_SCIENCE_TARGETS.slice(0, 3); // the three original rules keep EVA lengths realistic
  const cx = targets.reduce((a, t) => a + t.x, 0) / targets.length;
  const cy = targets.reduce((a, t) => a + t.y, 0) / targets.length;
  let best: { c: number; r: number; d: number } | null = null;
  for (let r = 3; r < GRID_ROWS - 3; r++) {
    for (let c = 3; c < GRID_COLS - 3; c++) {
      if (ARCADIA_SLOPE_GRID[r][c] > 2.5) continue;
      const d = Math.hypot((c / GRID_COLS) * 100 - cx, (r / GRID_ROWS) * 100 - cy);
      if (!best || d < best.d) best = { c, r, d };
    }
  }
  if (!best) return base;
  const [x, y] = cellToPercent(best.c, best.r);
  const ll = percentToLatLon(x, y);
  return { ...base, x, y, lat: ll.lat, lon: ll.lon, elevationMeters: Math.round(ARCADIA_ELEVATION_GRID[best.r][best.c]) };
}

export const HABITAT_ALPHA = REAL_DEM ? snapHabitat(RAW_HABITAT) : RAW_HABITAT;

/**
 * NASA instrument catalogue: which products MARSWEAVE is designed around, and their real/simulated status here
 */
const RAW_PROVENANCE_REGISTRY: DataProvenanceEntry[] = [
  {
    instrument: 'MOLA',
    instrumentFull: 'Mars Orbiter Laser Altimeter',
    mission: 'Mars Global Surveyor (MGS)',
    agency: 'NASA / GSFC',
    pdsDatasetId: 'MGS-M-MOLA-5-MEGDR-L3-V1.0 (not verified)',
    spatialResolution: '128 pixels/degree (~463 m at equator, higher at mid-latitudes)',
    spectralRange: '1064 nm Nd:YAG laser pulse altimetry',
    temporalCoverage: '1997 - 2001 (archival mission baseline)',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'HIGH',
    usedInMarsweaveFor: 'Digital elevation model (blended with HRSC), slope calculation, and relief.',
    scientificHonestyNotes: 'Elevation is referenced to the Mars MOLA datum. No HiRISE stereo terrain is used; detail finer than the 200 m DEM pixel is not represented.'
  },
  {
    instrument: 'HiRISE',
    instrumentFull: 'High Resolution Imaging Science Experiment',
    mission: 'Mars Reconnaissance Orbiter (MRO)',
    agency: 'NASA / University of Arizona',
    pdsDatasetId: 'MRO-M-HIRISE-3-RDR-V1.1 (not verified)',
    spatialResolution: '25 - 30 cm per pixel',
    spectralRange: 'Visible / Near-Infrared (RED 550-850 nm, BG 400-600 nm, NIR 800-1000 nm)',
    temporalCoverage: '2006 - Present',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'HIGH',
    usedInMarsweaveFor: 'NOT LOADED. Would supply boulder counts and polygon classification; hazards are DEM-derived instead.',
    scientificHonestyNotes: 'No HiRISE product is read in this build. HiRISE coverage is targeted in swaths.'
  },
  {
    instrument: 'SHARAD',
    instrumentFull: 'Shallow Subsurface Radar',
    mission: 'Mars Reconnaissance Orbiter (MRO)',
    agency: 'NASA / ASI (Italian Space Agency)',
    pdsDatasetId: 'MRO-M-SHARAD-5-RADARGRAM-V1.0',
    spatialResolution: '15 m vertical in free space (higher in ice ε=3.15), 0.3-1 km along track',
    spectralRange: '15 - 25 MHz chirped radar pulses',
    temporalCoverage: '2006 - Present',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'MEDIUM',
    usedInMarsweaveFor: 'NOT LOADED directly. The ice layer is the SWIM2 composite, which itself uses SHARAD among other data.',
    scientificHonestyNotes: 'SHARAD radargrams require complex clutter simulation to differentiate surface echoes from true subsurface dielectric interfaces.'
  },
  {
    instrument: 'CRISM',
    instrumentFull: 'Compact Reconnaissance Imaging Spectrometer for Mars',
    mission: 'Mars Reconnaissance Orbiter (MRO)',
    agency: 'NASA / JHUAPL',
    pdsDatasetId: 'MRO-M-CRISM-3-RDR-TARGETED-V1.0 (not verified)',
    spatialResolution: '18 - 36 m per pixel in Targeted Mode',
    spectralRange: '362 - 3920 nm across 544 spectral channels',
    temporalCoverage: '2006 - 2023 (Archival)',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'HIGH',
    usedInMarsweaveFor: 'NOT LOADED. Would supply mineral identification; no mineral claims are made.',
    scientificHonestyNotes: 'No CRISM product is read in this build.'
  },
  {
    instrument: 'THEMIS',
    instrumentFull: 'Thermal Emission Imaging System',
    mission: '2001 Mars Odyssey',
    agency: 'NASA / Arizona State University',
    pdsDatasetId: 'ID not verified (see PDS Geosciences Node, THEMIS)',
    spatialResolution: '100 m per pixel (Infrared), 18 m per pixel (Visible)',
    spectralRange: '9 infrared bands (6.8 to 14.9 µm)',
    temporalCoverage: '2001 - Present',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'HIGH',
    usedInMarsweaveFor: 'Thermal-inertia layer (USGS THEMIS mosaic), DISPLAY ONLY. The mosaic has a seam, so it is not used in routing, hazards or candidate selection.',
    scientificHonestyNotes: 'The mosaic is a published USGS product (Fergason et al. 2006); a value is a 100 m pixel average, not a spot measurement.'
  },
  {
    instrument: 'MEDA',
    instrumentFull: 'Mars Environmental Dynamics Analyzer',
    mission: 'Mars 2020 (Perseverance Rover)',
    agency: 'NASA / INTA-CSIC',
    pdsDatasetId: 'ID not verified (see PDS Atmospheres Node, Mars 2020 MEDA)',
    spatialResolution: 'In-situ point sensor array at Jezero Crater',
    spectralRange: 'Pressure, Ambient/Ground Temp, Wind 2D/3D, Relative Humidity, Dust Optical Depth (RDS)',
    temporalCoverage: '2021 - Present',
    dataStatus: 'DERIVED',
    confidence: 'MEDIUM',
    usedInMarsweaveFor: 'Reference afternoon air temperature and wind (Jezero samples).',
    scientificHonestyNotes: 'Published Jezero Crater samples (afternoon air temperature and wind). They are NOT scaled to Arcadia: pressure, temperature and wind there differ with elevation and season and were not measured.'
  },
  {
    instrument: 'RAD',
    instrumentFull: 'Radiation Assessment Detector',
    mission: 'Mars Science Laboratory (Curiosity Rover)',
    agency: 'NASA / SwRI',
    pdsDatasetId: 'MSL-M-RAD-3-RDR-V1.0',
    spatialResolution: 'In-situ surface energetic particle detector at Gale Crater',
    spectralRange: 'Charged particles (protons to iron nuclei 10-1000 MeV/n) and neutral particles (neutrons, gamma rays)',
    temporalCoverage: '2012 - Present',
    dataStatus: 'DERIVED',
    confidence: 'HIGH',
    usedInMarsweaveFor: 'Radiation dose-rate proxy (0.64 mSv/day = 26.7 µSv/h at Gale).',
    scientificHonestyNotes: 'Published Gale Crater dose rate used as a proxy. The dose at Arcadia depends on atmospheric column mass and solar activity and was not measured or corrected.'
  },
  {
    instrument: 'MCS & MARCI',
    instrumentFull: 'Mars Climate Sounder & Mars Color Imager',
    mission: 'Mars Reconnaissance Orbiter (MRO)',
    agency: 'NASA / JPL & Malin Space Science Systems',
    pdsDatasetId: 'ID not verified (see PDS Atmospheres Node, MRO MCS / MARCI)',
    spatialResolution: 'Global daily synoptic weather mapping (MARCI ~1 km, MCS limb vertical profiling ~5 km)',
    spectralRange: 'UV, VIS, and thermal infrared limb sounding',
    temporalCoverage: '2006 - Present',
    dataStatus: 'MODELLED',
    confidence: 'MEDIUM',
    usedInMarsweaveFor: 'Dust optical depth values from the LMD/MCD climatology (MCS and MARCI feed that product).',
    scientificHonestyNotes: 'Values come from the LMD Mars Year 34 gridded product (one 5 x 6 degree cell). The storm timing in the scenario is a compressed assumption.'
  },
  {
    instrument: 'Mars Relay Network',
    instrumentFull: 'Mars Telecommunications Orbiter Constellation (MRO, Odyssey, TGO, MAVEN)',
    mission: 'NASA / ESA Mars Exploration Program',
    agency: 'NASA / ESA',
    pdsDatasetId: 'N/A (no single PDS product; line-of-sight is computed in-app)',
    spatialResolution: 'UHF Proximity-1 Link (~400 MHz) footprint geometry',
    spectralRange: 'Electromagnetic UHF & X-band',
    temporalCoverage: 'Active operations',
    dataStatus: 'SIMULATED',
    confidence: 'HIGH',
    usedInMarsweaveFor: 'MRO geometric visibility from NAIF SPICE; the map coverage field is a terrain model.',
    scientificHonestyNotes: 'Geometric visibility only (MRO, elevation above 10 degrees); no link budget, no Odyssey, MAVEN or TGO passes.'
  },
  {
    instrument: 'Viking MDIM 2.1',
    instrumentFull: 'Mars Digital Image Model 2.1 (Viking Orbiter mosaic)',
    mission: 'Viking Orbiters',
    agency: 'NASA / USGS Astrogeology',
    pdsDatasetId: 'N/A (USGS Astrogeology mosaic, file Mars_Viking_MDIM21_ClrMosaic_global_232m.tif)',
    spatialResolution: '232 m per pixel',
    spectralRange: 'Visible image brightness (colorized mosaic)',
    temporalCoverage: 'Archival (Viking Orbiter imaging)',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'MEDIUM',
    usedInMarsweaveFor: 'Surface brightness layer (colours the ground only).',
    scientificHonestyNotes: 'Image brightness, not calibrated albedo, and not HiRISE. Individual rocks and boulders are not visible at this resolution.'
  },
  {
    instrument: 'SWIM2 composite',
    instrumentFull: 'Subsurface Water Ice Mapping, phase 2 composite',
    mission: 'Multiple orbital datasets (radar, thermal, neutron, geomorphology)',
    agency: 'NASA / Planetary Science Institute',
    pdsDatasetId: 'N/A (PSI SWIM2 product, file SWIM2_c0_1.tif)',
    spatialResolution: '~3 km per pixel (coarse)',
    spectralRange: 'Ice-consistency index combining several lines of evidence',
    temporalCoverage: 'Archival composite',
    dataStatus: 'REAL NASA ARCHIVE',
    confidence: 'MEDIUM',
    usedInMarsweaveFor: 'Subsurface ice index: used for the Water & ice goal and to pick candidate site SCI-04.',
    scientificHonestyNotes: 'Only about 6 x 8 cells cover the window, so it ranks areas; it does not locate or size a deposit. SHARAD is one of its inputs.'
  },
  {
    instrument: 'MARSWEAVE rules',
    instrumentFull: 'Slope, hazard zones and candidate sites (fixed rules)',
    mission: 'Computed in-app from MOLA-HRSC and SWIM2',
    agency: 'Sirius Team',
    pdsDatasetId: 'N/A (computed in-app)',
    spatialResolution: '~322 m cells (50 x 50 grid)',
    spectralRange: 'Elevation and ice index',
    temporalCoverage: 'N/A',
    dataStatus: 'DERIVED',
    confidence: 'MEDIUM',
    usedInMarsweaveFor: 'Slope, hazard zones (clusters of steep or rough cells) and the five candidate sites (SCI-04, SCI-02, SCI-11, SCI-05, SCI-06).',
    scientificHonestyNotes: 'Rule-based results, not measurements or detections. Boulders are not resolved at this resolution; roughness is only a proxy.'
  }
];

/**
 * Initial layer configuration for the Map Layer Manager
 */
const RAW_DATA_LAYERS: LayerMetadata[] = [
  {
    id: 'base',
    name: 'Base map (rendered from elevation)',
    instrument: 'CTX / Viking MDIM 2.1',
    mission: 'NASA MRO & Viking',
    dataType: 'REAL NASA ARCHIVE',
    resolution: '6 m/px',
    coverage: '100% Arcadia Planitia',
    confidence: 'HIGH',
    description: 'Viking MDIM 2.1 image brightness (not calibrated albedo), or a colour ramp when the file is absent.',
    color: '#e2714b',
    visible: true,
    opacity: 0.95
  },
  {
    id: 'mola_elevation',
    name: 'Terrain elevation (MOLA-HRSC)',
    instrument: 'MOLA',
    mission: 'Mars Global Surveyor',
    dataType: 'REAL NASA ARCHIVE',
    resolution: '128 px/deg',
    coverage: 'Global',
    confidence: 'HIGH',
    description: REAL_DEM ? `Hypsometric tint of the study window, ${Math.round(MISSION_BOUNDS.datumElevationMinMeters)} m to ${Math.round(MISSION_BOUNDS.datumElevationMaxMeters)} m relative to the MOLA datum.` : 'Hypsometric tint of a SYNTHETIC terrain model, -4120 m to -3790 m.',
    color: '#38bdf8',
    visible: true,
    opacity: 0.70
  },
  {
    id: 'slope',
    name: 'Slope (derived from the DEM)',
    instrument: 'Derived from MOLA / HRSC',
    mission: 'NASA / ESA',
    dataType: 'DERIVED',
    resolution: '136 m grid',
    coverage: 'Full Area',
    confidence: 'HIGH',
    description: 'Terrain steepness computed from the DEM. The planner slope limit comes from the walking-cost model, not from a fixed 15° or 25° threshold.',
    color: '#f59e0b',
    visible: true,
    opacity: 0.40
  },
  {
    id: 'hirise_texture',
    name: 'Surface brightness (Viking MDIM)',
    instrument: 'HiRISE',
    mission: 'Mars Reconnaissance Orbiter',
    dataType: 'REAL NASA ARCHIVE',
    resolution: '25 cm/px',
    coverage: 'Targeted Swathes',
    confidence: 'HIGH',
    description: 'Hazard cells derived from DEM slope and roughness. No HiRISE boulder census is loaded.',
    color: '#a855f7',
    visible: true,
    opacity: 0.60
  },
  {
    id: 'themis_thermal',
    name: 'Thermal inertia (THEMIS, display only)',
    instrument: 'THEMIS',
    mission: '2001 Mars Odyssey',
    dataType: 'REAL NASA ARCHIVE',
    resolution: '100 m/px',
    coverage: 'Full Area',
    confidence: 'HIGH',
    description: 'THEMIS thermal inertia: higher values mean a more rock-like surface, lower values loose dust.',
    color: '#ef4444',
    visible: true,
    opacity: 0.30
  },
  {
    id: 'crism_minerals',
    name: 'CRISM minerals (not loaded)',
    instrument: 'CRISM',
    mission: 'Mars Reconnaissance Orbiter',
    dataType: 'SIMULATED',
    resolution: 'not loaded',
    coverage: 'none',
    confidence: 'LOW',
    description: 'Not loaded in this build (placeholder layer). No mineral claim is made.',
    color: '#10b981',
    visible: false,
    opacity: 0.85
  },
  {
    id: 'sharad_ice',
    name: 'Subsurface ice index (SWIM2)',
    instrument: 'SWIM2 composite',
    mission: 'Mars Reconnaissance Orbiter (SHARAD and other datasets)',
    dataType: 'REAL NASA ARCHIVE',
    resolution: '~3 km/px, coarse',
    coverage: 'Whole study window',
    confidence: 'MEDIUM',
    description: 'SWIM2 ice-consistency index (coarse, about 3 km pixels). It carries no depth and no purity.',
    color: '#06b6d4',
    visible: true,
    opacity: 0.75
  },
  {
    id: 'atmosphere_dust',
    name: 'Dust optical depth (LMD, Mars Year 34)',
    instrument: 'MCS / MARCI',
    mission: 'Mars Reconnaissance Orbiter',
    dataType: 'MODELLED',
    resolution: 'Synoptic regional',
    coverage: 'Atmospheric Column',
    confidence: 'MEDIUM',
    description: 'Column dust optical depth from the LMD climatology; the storm scenario is an input, not a forecast.',
    color: '#d97706',
    visible: true,
    opacity: 0.30
  },
  {
    id: 'radiation_rad',
    name: 'Radiation dose rate (published, Gale)',
    instrument: 'MSL RAD Calibration',
    mission: 'Mars Science Laboratory',
    dataType: 'DERIVED',
    resolution: 'Macro-scale',
    coverage: 'Arcadia Surface',
    confidence: 'HIGH',
    description: 'Dose-rate proxy from MSL RAD at Gale (26.7 µSv/h). It is not modulated by Arcadia terrain.',
    color: '#8b5cf6',
    visible: false,
    opacity: 0.55
  },
  {
    id: 'relay_comms',
    name: 'Relay line of sight (MRO passes + shadow map)',
    instrument: 'MRO / Odyssey / TGO',
    mission: 'NASA / ESA',
    dataType: 'SIMULATED',
    resolution: 'Line-of-sight cone',
    coverage: 'Active orbital pass',
    confidence: 'HIGH',
    description: 'Modelled communication corridor and terrain shadowing; real MRO pass geometry is shown separately.',
    color: '#3b82f6',
    visible: true,
    opacity: 0.55
  },
  {
    id: 'hazards',
    name: 'Hazard zones (derived from slope)',
    instrument: 'MARSWEAVE Risk Model',
    mission: 'Multi-Mission Fusion',
    dataType: 'DERIVED',
    resolution: 'Continuous Grid',
    coverage: 'Mission Bounds',
    confidence: 'HIGH',
    description: 'Composite risk polygons from DEM slope and roughness and modelled comms shadows.',
    color: '#e11d48',
    visible: true,
    opacity: 0.70
  },
  {
    id: 'science_targets',
    name: 'Candidate sites (rule-picked)',
    instrument: 'MARSWEAVE Science Engine',
    mission: 'Heterogeneous Fusion',
    dataType: 'DERIVED',
    resolution: 'Discrete Waypoints',
    coverage: 'Mission Bounds',
    confidence: 'HIGH',
    description: 'Rule-based candidate sites picked from the loaded layers. Not detections.',
    color: '#facc15',
    visible: true,
    opacity: 1.0
  }
];

/**
 * Baseline environmental conditions for Arcadia Planitia at Sol 342, 14:15 Local Solar Time
 */
export const INITIAL_ENVIRONMENTAL_CONDITIONS: EnvironmentalConditions = {
  sol: 342,
  marsLocalTime: '14:24 LST',
  sunElevationDeg: SUN_DERIVED ? Math.round(SUN_DERIVED.elDeg * 10) / 10 : 48.5, // derived from Ls (LMD MY34, sol 342) when available
  surfaceTempC: MEDA_REF?.afternoonAirTempC ?? -28, // Jezero MEDA afternoon AIR temperature (published samples); not measured at Arcadia
  windSpeedMs: MEDA_REF?.afternoonWindMedianMs ?? 7.4, // MEDA Jezero afternoon median when published samples are present
  windDirectionDeg: 0, // not modelled (no wind-direction source); unused in the UI
  dustOpticalDepthTau: TAU_TYPICAL, // real LMD/MCD median when data/real/dust_tau.json exists, else 0.54
  radiationDoseRateMicroSvH: 26.7, // = RAD_BASELINE_MICROSV_H (see below)
  commsRelayOrbiter: 'MRO (Mars Reconnaissance Orbiter)',
  commsLineOfSight: true,
  // Real MRO geometric visibility (NAIF SPICE) as a share of one sol; no link budget. 0 when the file is absent.
  commsQualityPct: hasReal('relay_passes') ? Math.round(((REAL_PRODUCTS.relay_passes?.coveragePct as number) ?? 0) * 10) / 10 : 0
};


// ---------------------------------------------------------------------------------------------
// DATA TRUTH TABLE - single source of truth for what is real vs. modelled in this build.
// Layer panel, provenance registry and the cell inspector all read from here. Do not upgrade a
// status here unless the code actually reads that NASA product.
// ---------------------------------------------------------------------------------------------

export const STATUS_DEFINITIONS: Record<DataStatus, string> = {
  'REAL NASA ARCHIVE': 'Values read directly from a NASA/partner data product (cited in REFERENCES.md).',
  'DERIVED': 'Computed by MARSWEAVE from a REAL layer (for example slope from elevation).',
  'PUBLISHED': 'Published reference values from a mission paper or data release, used as a proxy. Not measured at this site.',
  'MODELLED': 'Parameterised from published values or physics. Not a spatial measurement at this site.',
  'SIMULATED': 'Illustrative placeholder. NOT NASA data for this location.',
  'NOT LOADED': 'Not loaded in this build. No claim is made from it.',
};

export interface LayerTruth {
  status: DataStatus;
  source: string;
  resolution: string;
  note: string;
}

const demRes = REAL_DEM
  ? `${REAL_DEM.nativePixelMeters ?? 200} m/px native, resampled to ${REAL_DEM.cols}x${REAL_DEM.rows}`
  : 'synthetic ' + GRID_COLS + 'x' + GRID_ROWS + ' grid';

export const LAYER_TRUTH: Record<string, LayerTruth> = {
  base: {
    status: REAL_DEM ? 'DERIVED' : 'SIMULATED',
    source: REAL_DEM ? 'Colour ramp computed from the elevation grid' : 'Procedural colour ramp',
    resolution: demRes,
    note: 'No CTX/Viking imagery is loaded; the basemap is a rendering, not a photograph.',
  },
  mola_elevation: {
    status: REAL_DEM ? 'REAL NASA ARCHIVE' : 'SIMULATED',
    source: REAL_DEM ? 'USGS MOLA-HRSC blended DEM v2 (NASA MGS MOLA + ESA Mars Express HRSC)' : 'Hand-written terrain function',
    resolution: demRes,
    note: REAL_DEM
      ? 'HRSC part is CC BY-SA 3.0 IGO (attribution + share-alike); MOLA is CC0.'
      : 'Run scripts/fetch_arcadia_dem.py to replace this with real elevation.',
  },
  slope: {
    status: REAL_DEM ? 'DERIVED' : 'SIMULATED',
    source: 'Finite differences of the elevation grid',
    resolution: demRes,
    note: 'Slope at 200 m baselines under-estimates local steepness that a suited astronaut would meet.',
  },
  hirise_texture: {
    status: hasReal('hirise_albedo') ? 'REAL NASA ARCHIVE' : 'SIMULATED',
    source: hasReal('hirise_albedo') ? String(REAL_PRODUCTS.hirise_albedo?.source) : 'Rule-based from slope plus hand-placed hazard zones',
    resolution: hasReal('hirise_albedo') ? '232 m/px Viking mosaic, resampled to the app grid' : 'not retrieved',
    note: hasReal('hirise_albedo')
      ? 'Real image brightness from the USGS Viking MDIM 2.1 global mosaic (232 m/px, not HiRISE, not calibrated albedo). It colours the ground only; individual rocks and boulders are not mapped.'
      : 'No HiRISE boulder map is loaded. Hazard here is slope plus slope roughness from the real DEM, not a rock census.',
  },
  themis_thermal: {
    status: hasReal('themis_ti') ? 'REAL NASA ARCHIVE' : 'SIMULATED',
    source: hasReal('themis_ti') ? String(REAL_PRODUCTS.themis_ti?.source) : 'Placeholder',
    resolution: hasReal('themis_ti') ? '100 m/px, resampled to the app grid' : 'not retrieved',
    note: hasReal('themis_ti') ? 'Real THEMIS thermal inertia (tiu); absolute accuracy about 20 %. CAUTION: the window has a sharp straight-edged jump (about 110 to 900 tiu) that may be a mosaic seam. DISPLAY ONLY: not used for routing, hazards or candidate selection.' : 'No THEMIS thermal inertia data is loaded.',
  },
  crism_minerals: {
    status: hasReal('crism_hydration') ? 'REAL NASA ARCHIVE' : 'NOT LOADED',
    source: hasReal('crism_hydration') ? String(REAL_PRODUCTS.crism_hydration?.source) : 'Placeholder',
    resolution: hasReal('crism_hydration') ? 'summary-parameter map, resampled' : 'not retrieved',
    note: hasReal('crism_hydration') ? 'Real CRISM summary parameter. A band-depth value is evidence of hydration, not a mineral identification by itself.' : 'No CRISM cubes are loaded. Mineral labels are illustrative.',
  },
  sharad_ice: {
    status: hasReal('swim_ice') ? 'REAL NASA ARCHIVE' : 'SIMULATED',
    source: hasReal('swim_ice') ? String(REAL_PRODUCTS.swim_ice?.source) : 'Placeholder probability field',
    resolution: hasReal('swim_ice') ? '~3 km/px (coarse), resampled' : 'not retrieved',
    note: hasReal('swim_ice') ? 'Real SWIM2 ice-consistency composite (file SWIM2_c0_1.tif, ~3 km pixels, so only about 6 x 8 cells cover this window; depth layer inferred from the file name). The value shown is the consistency index x100, not a probability; it constrains ice, it does not prove it.' : 'No SHARAD radargrams or SWIM ice map are loaded.',
  },
  atmosphere_dust: {
    status: hasReal('dust_tau') ? 'REAL NASA ARCHIVE' : 'MODELLED',
    source: hasReal('dust_tau') ? String(REAL_PRODUCTS.dust_tau?.source) : 'Scenario value (tau) for the what-if engine',
    resolution: hasReal('dust_tau') ? 'daily series at the site (gridded retrievals)' : 'single regional value',
    note: hasReal('dust_tau') ? 'Real LMD dust climatology, Mars Year 34 (variable cdod610, MCS/TES/THEMIS retrievals), one 5 x 6 degree cell around the site. Converted to a surface visible optical depth with an assumed pressure scaling and a 2.6 visible/IR factor, so the absolute value is approximate. Not a live feed.' : 'Not a live MCS/MARCI product.',
  },
  radiation_rad: {
    status: hasReal('rad') ? (isPublished('rad') ? 'PUBLISHED' : 'REAL NASA ARCHIVE') : 'MODELLED',
    source: hasReal('rad') ? String(REAL_PRODUCTS.rad?.source) : 'Published MSL RAD surface dose-equivalent rate at Gale (Hassler et al. 2014), applied as a proxy',
    resolution: 'single site value, not spatial',
    note: 'Dose scales with atmospheric shielding and solar activity; treat as order-of-magnitude for Arcadia.',
  },
  relay_comms: {
    status: 'SIMULATED',
    source: hasReal('relay_passes') ? String(REAL_PRODUCTS.relay_passes?.source) : 'Placeholder coverage field',
    resolution: hasReal('relay_passes') ? 'per-cell shadow map (terrain model); MRO pass list from NAIF SPICE is DERIVED' : 'not computed from orbit ephemerides',
    note: hasReal('relay_passes') ? 'The per-cell relay shadow map is a SIMULATED terrain model. The MRO pass list behind it is DERIVED from NAIF SPICE kernels (see Orbiter passes in the data registry).' : 'No real MRO/TGO/MAVEN pass prediction is performed.',
  },
  hazards: {
    status: REAL_DEM ? 'DERIVED' : 'SIMULATED',
    source: REAL_DEM
      ? 'Clusters of steep (above the walking-cost limit, about 13 deg) and rough cells from the real DEM slope grid; comms shadows from the modelled relay grid'
      : 'Clusters derived from the SYNTHETIC terrain (no real DEM loaded)',
    resolution: demRes,
    note: REAL_DEM
      ? 'Zones follow real terrain, but boulders are not resolved at this resolution (roughness is only a proxy) and comms shadows are modelled.'
      : 'Run scripts/fetch_arcadia_dem.py to derive hazards from real terrain instead of the synthetic model.',
  },
  science_targets: {
    status: 'DERIVED',
    source: REAL_DEM
      ? 'Rule-picked from the real DEM and SWIM2 ice index (fixed rules, not detections)'
      : 'Hand-authored illustrative targets',
    resolution: 'discrete points',
    note: 'Candidate sites are picked by fixed rules from the real DEM and the SWIM2 ice index. They are not detections and are not derived from CRISM or SHARAD observations.',
  },
};

/** Status for a registry instrument (by its `instrument` field). */
const REGISTRY_TRUTH: Record<string, { status: DataStatus; note: string }> = {
  'MOLA': { status: REAL_DEM ? 'REAL NASA ARCHIVE' : 'SIMULATED', note: LAYER_TRUTH.mola_elevation.note },
  'HiRISE': { status: 'NOT LOADED', note: 'No HiRISE boulder census or imagery is loaded. Hazard zones are derived from DEM slope and roughness. The ground brightness layer is the Viking MDIM mosaic, not HiRISE.' },
  'SHARAD': { status: 'NOT LOADED', note: 'SHARAD radar profiles are not loaded directly. They are one input to the SWIM2 ice composite used by the ice layer (~3 km pixels).' },
  'CRISM': { status: LAYER_TRUTH.crism_minerals.status, note: LAYER_TRUTH.crism_minerals.note },
  'THEMIS': { status: LAYER_TRUTH.themis_thermal.status, note: LAYER_TRUTH.themis_thermal.note },
  'MEDA': hasReal('meda') && isPublished('meda')
    ? { status: 'PUBLISHED', note: `${realLabel('meda', '')}. Published Jezero values (afternoon air temperature and wind) inform the baseline; Arcadia is not measured.` }
    : hasReal('meda')
    ? { status: 'REAL NASA ARCHIVE', note: `${realLabel('meda', '')}. In-situ Mars 2020 data at Jezero, not measured at Arcadia.` }
    : { status: 'MODELLED', note: 'Baseline weather values are illustrative, scaled by hand; no MEDA product is read.' },
  'RAD': hasReal('rad') && isPublished('rad')
    ? { status: 'PUBLISHED', note: `${realLabel('rad', '')}. Published Gale dose rate used as a proxy; Arcadia dose differs with atmosphere column and solar activity.` }
    : hasReal('rad')
    ? { status: 'REAL NASA ARCHIVE', note: `${realLabel('rad', '')}. Measured at Gale Crater; Arcadia dose differs with atmosphere column and solar activity.` }
    : { status: 'MODELLED', note: LAYER_TRUTH.radiation_rad.note },
  'MCS & MARCI': { status: LAYER_TRUTH.atmosphere_dust.status, note: LAYER_TRUTH.atmosphere_dust.note },
  'Mars Relay Network': { status: hasReal('relay_passes') ? 'DERIVED' : 'SIMULATED', note: 'MRO pass geometry is DERIVED from NAIF SPICE kernels. The per-cell relay shadow map built on it is a SIMULATED terrain model.' },
};

export const NASA_PROVENANCE_REGISTRY: DataProvenanceEntry[] = RAW_PROVENANCE_REGISTRY.map(e => {
  const t = REGISTRY_TRUTH[e.instrument];
  if (!t) return e;
  return {
    ...e,
    dataStatus: t.status,
    confidence: (t.status === 'SIMULATED' || t.status === 'NOT LOADED') ? 'LOW' : (t.status === 'MODELLED' || t.status === 'PUBLISHED') ? 'MEDIUM' : e.confidence,
    scientificHonestyNotes: t.note,
  };
});

export const INITIAL_DATA_LAYERS: LayerMetadata[] = RAW_DATA_LAYERS.map(l => {
  const t = LAYER_TRUTH[l.id];
  if (!t) return l;
  return {
    ...l,
    dataType: t.status,
    resolution: t.resolution,
    confidence: (t.status === 'SIMULATED' || t.status === 'NOT LOADED') ? 'LOW' : (t.status === 'MODELLED' || t.status === 'PUBLISHED') ? 'MEDIUM' : l.confidence,
    description: t.note,
  };
});

export const DATA_SUMMARY = (() => {
  const counts: Record<string, number> = {};
  INITIAL_DATA_LAYERS.forEach(l => { counts[l.dataType] = (counts[l.dataType] || 0) + 1; });
  return counts;
})();
