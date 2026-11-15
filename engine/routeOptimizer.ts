/**
 * MARSWEAVE — Multi-Objective EVA Route Optimizer
 * Implements weighted multi-objective A* pathfinding on Martian terrain grids.
 * Synthesizes terrain slope, boulder hazards, subsurface ice value, mineral spectra,
 * communication line-of-sight, and radiation exposure into an explainable operational plan.
 */

import {
  MissionProfile,
  RouteCandidate,
  HazardCrossing,
  RouteWaypoint,
  ScienceTarget,
  RouteComparisonDelta,
  HazardZone,
  DataStatus
} from '../types/marsweave';
import {
  GRID_COLS,
  GRID_ROWS,
  MISSION_BOUNDS,
  CELL_METERS_X,
  CELL_METERS_Y,
  RAD_BASELINE_MICROSV_H,
  ARCADIA_ELEVATION_GRID,
  ARCADIA_SLOPE_GRID,
  ARCADIA_HAZARD_GRID,
  ARCADIA_ICE_GRID,
  ARCADIA_COMMS_GRID,
  ARCADIA_SCIENCE_TARGETS,
  ARCADIA_HAZARD_ZONES
} from '../data/arcadiaData';

import {
  METABOLIC_AVG_W, METABOLIC_PEAK_W, GRADIENT_LIMIT, EVA_DESIGN_MIN, O2_CAPACITY_KJ,
  maxWalkableSlopeDeg, paceMs, walkingPowerW, SUITED_CREW_MASS_KG
} from './evaPhysiology';

interface GridNode {
  c: number; // 0..GRID_COLS-1
  r: number; // 0..GRID_ROWS-1
}

interface CostWeights {
  distanceWeight: number;
  slopeWeight: number;
  hazardWeight: number;
  scienceAttraction: number;
  iceAttraction: number;
  commsPenalty: number;
  maxSlopeAllowed: number;
}

/**
 * Mobility and consumables come from engine/evaPhysiology.ts (published equations and NASA design values, status
 * MODELLED). Pace on each leg is the speed at which metabolic power stays at the sustainable Mars EVA rate, so
 * carried equipment, slope and Mars gravity all act through one physical equation instead of team-made factors.
 */
export { SUITED_CREW_MASS_KG } from './evaPhysiology';

/** Metabolic ceiling (W) that sets the steepest walkable slope, by risk tolerance (see maxWalkableSlopeDeg). */
function riskCapW(risk: MissionProfile['riskTolerance']): number {
  if (risk === 'LOW') return METABOLIC_AVG_W;
  if (risk === 'HIGH') return METABOLIC_PEAK_W;
  return (METABOLIC_AVG_W + METABOLIC_PEAK_W) / 2;
}

/** Steepest slope (deg) the planner allows for this profile. */
export function planningSlopeLimitDeg(profile: MissionProfile): number {
  return maxWalkableSlopeDeg(riskCapW(profile.riskTolerance), Math.max(0, profile.payloadKg ?? 0));
}

/** Level-ground pace in m/min with the carried equipment (nominal gradient 0). */
export function effectiveSpeedMpm(profile: MissionProfile): number {
  return paceMs(0, Math.max(0, profile.payloadKg ?? 0)) * 60;
}

/** Citation notes shown in the provenance drawer. Every entry states what is real, modelled or assumed. */
export interface PayloadModelNote {
  id: string;
  title: string;
  status: DataStatus;
  text: string;
  citations: string[];
}

export const PAYLOAD_MODEL_NOTES: PayloadModelNote[] = [
  {
    id: 'cost',
    title: 'Walking cost, pace and slope limit',
    status: 'MODELLED',
    text:
      'Metabolic power = Minetti walking cost for the leg gradient x Mars/Earth cost ratio 0.87 x suited mass x speed. ' +
      'Pace is the nominal 2.7 km/h unless that would exceed the 350 W Mars EVA average, then it slows, never below 1 km/h. ' +
      'The steepest walkable slope is where the cost at 1 km/h reaches 350 W (low risk), 530 W (high risk) or their mean (medium). ' +
      'Minetti is valid for gradients up to 0.45. Downhill pace is capped at nominal.',
    citations: [
      'Minetti AE, Moia C, Roi GS, Susta D, Ferretti G (2002) Energy cost of walking and running at extreme uphill and downhill slopes. J Appl Physiol 93:1039-1046',
      'NASA Mars PLSS studies, ICES 2025, NTRS 20250006266 (350 W average, 530 W maximum metabolic rate)',
      'Apollo EVA walking speeds, NASA OSTI 7168757 and Apollo Lunar Surface Journal'
    ]
  },
  {
    id: 'consumables',
    title: 'Oxygen and battery',
    status: 'MODELLED',
    text:
      'Oxygen used = metabolic energy / 20.9 kJ per litre, against the energy of the 8 h, 350 W design EVA (about 0.69 kg O2, ' +
      'matching the 0.7 kg of the closed-loop Mars PLSS schematics). Battery is the 8 h design life used at a constant rate. ' +
      'A 30 min reserve is the warning level. Science stops are charged at the 350 W average.',
    citations: ['NASA NTRS 20120003917 (20.9 kJ per litre O2)', 'NASA NTRS 20250006266 (8 h EVA, consumables table)']
  },
  {
    id: 'suit-mass',
    title: 'Suited crew mass',
    status: 'SIMULATED',
    text:
      `Crew 80 kg plus suit and life support 80 kg (${SUITED_CREW_MASS_KG} kg) is an assumption. No public xEMU mass was found; ` +
      'the Mars PLSS studies list 87 to 150 kg for the backpack alone, so the true figure may be higher.',
    citations: []
  },
  {
    id: 'suited-gravity',
    title: 'Suited locomotion in partial gravity (context)',
    status: 'REAL NASA ARCHIVE',
    text:
      'NASA JSC suited-walking studies measured metabolic cost in simulated lunar and Mars gravity. They show the direction of the ' +
      'bias; the 0.87 ratio used here comes from unsuited reduced-gravity walking data, so suit stiffness is not included.',
    citations: [
      'Norcross JR et al. (2009) Feasibility of Performing a Suited 10-km Ambulation: Final Report of the EVA Walkback Test. NASA/TP-2009-214796',
      'Norcross JR, Gernhardt ML (2011) Metabolic rate across gravity levels for simulated EVA tasks. NASA NTRS 20110008554'
    ]
  }
];

/**
 * Derives cost weights dynamically from mission objective and risk tolerance.
 */
function getCostWeights(profile: MissionProfile, dustFactor: number = 1.0): CostWeights {
  let distanceWeight = 1.0;
  let slopeWeight = 2.4;
  let hazardWeight = 3.0;
  let scienceAttraction = 1.8;
  let iceAttraction = 1.5;
  let commsPenalty = 1.6;
  // Slope limit derived from the metabolic envelope (see planningSlopeLimitDeg)
  let maxSlopeAllowed = planningSlopeLimitDeg(profile);

  // Adjust for risk tolerance
  if (profile.riskTolerance === 'LOW') {
    slopeWeight *= 1.6;
    hazardWeight *= 1.8;
  } else if (profile.riskTolerance === 'HIGH') {
    slopeWeight *= 0.7;
    hazardWeight *= 0.6;
  }

  // Adjust for mission objective
  switch (profile.objective) {
    case 'WATER':
      iceAttraction *= 3.0;
      scienceAttraction *= 1.5;
      break;
    case 'MINERALOGY':
      scienceAttraction *= 2.8;
      iceAttraction *= 1.2;
      break;
    case 'GEOLOGY':
      scienceAttraction *= 2.4;
      slopeWeight *= 0.9; // Geologists tolerate steeper outcrop margins
      break;
    case 'TERRAIN_SURVEY':
      hazardWeight *= 1.4;
      distanceWeight *= 0.8;
      break;
    case 'MULTI_SCIENCE':
      scienceAttraction *= 2.2;
      iceAttraction *= 2.0;
      break;
  }

  // Communication priority modifier
  if (profile.commsPriority === 'HIGH') {
    commsPenalty *= 2.5;
  }

  // Dust storm modifier: dust friction increases risk and slope slip hazard
  hazardWeight *= dustFactor;
  slopeWeight *= Math.sqrt(dustFactor);

  return {
    distanceWeight,
    slopeWeight,
    hazardWeight,
    scienceAttraction,
    iceAttraction,
    commsPenalty,
    maxSlopeAllowed
  };
}

/**
 * Grid coordinates to Martian geographic Lat/Lon
 */
export function gridToCoordinates(x: number, y: number): { lat: number; lon: number } {
  const normX = Math.max(0, Math.min(100, x)) / 100;
  const normY = Math.max(0, Math.min(100, y)) / 100;
  const lat = MISSION_BOUNDS.minLat + (1 - normY) * (MISSION_BOUNDS.maxLat - MISSION_BOUNDS.minLat);
  const lon = MISSION_BOUNDS.minLon + normX * (MISSION_BOUNDS.maxLon - MISSION_BOUNDS.minLon);
  return {
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000
  };
}

/**
 * Finds science targets within a given radius of a grid waypoint.
 */
function findNearbyScienceTarget(x: number, y: number, radiusGrid: number = 8): ScienceTarget | undefined {
  return ARCADIA_SCIENCE_TARGETS.find(target => {
    const dist = Math.hypot(target.x - x, target.y - y);
    return dist <= radiusGrid;
  });
}

/**
 * Binary min-heap keyed by a numeric priority. O(log N) push/pop, replacing the previous O(N) open-set scan.
 */
export class MinHeap<T> {
  private items: { item: T; priority: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: T, priority: number): void {
    const a = this.items;
    a.push({ item, priority });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].priority <= a[i].priority) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }

  pop(): { item: T; priority: number } | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].priority < a[m].priority) m = l;
        if (r < a.length && a[r].priority < a[m].priority) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Multi-objective A* algorithm finding optimal route on discrete grid.
 */
function searchAStar(
  startGrid: GridNode,
  goalGrid: GridNode,
  weights: CostWeights,
  waypointBiases: GridNode[],
  slopeCapDeg: number
): GridNode[] | null {
  const cols = GRID_COLS;
  const rows = GRID_ROWS;

  const gScore = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const fScore = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
  const cameFrom = new Map<string, GridNode>();

  // Lazy-deletion heap: a node may be pushed several times; stale entries are skipped when popped.
  const open = new MinHeap<GridNode>();
  gScore[startGrid.r][startGrid.c] = 0;

  function heuristic(node: GridNode): number {
    const dx = node.c - goalGrid.c;
    const dy = node.r - goalGrid.r;
    let baseH = Math.hypot(dx * CELL_METERS_X, dy * CELL_METERS_Y) / CELL_METERS_X;

    // If waypoint bias exists (e.g. for Route B intermediate science targets)
    if (waypointBiases.length > 0) {
      let minBiasDist = Infinity;
      for (const wp of waypointBiases) {
        const d = Math.hypot(node.c - wp.c, node.r - wp.r);
        if (d < minBiasDist) minBiasDist = d;
      }
      baseH += minBiasDist * 0.4;
    }

    return baseH;
  }

  fScore[startGrid.r][startGrid.c] = heuristic(startGrid);
  open.push(startGrid, fScore[startGrid.r][startGrid.c]);

  // Step lengths in true metres (cells are not exactly square), in units of one cell width
  const len = (dc: number, dr: number) => Math.hypot(dc * CELL_METERS_X, dr * CELL_METERS_Y) / CELL_METERS_X;
  const neighbors = [
    { dc: 1, dr: 0, cost: len(1, 0) },
    { dc: -1, dr: 0, cost: len(1, 0) },
    { dc: 0, dr: 1, cost: len(0, 1) },
    { dc: 0, dr: -1, cost: len(0, 1) },
    { dc: 1, dr: 1, cost: len(1, 1) },
    { dc: -1, dr: 1, cost: len(1, 1) },
    { dc: 1, dr: -1, cost: len(1, 1) },
    { dc: -1, dr: -1, cost: len(1, 1) }
  ];

  let iterations = 0;
  const maxIterations = 60000; // the grid has 2,500 cells; the cap only guards against runaway loops

  while (open.size > 0 && iterations < maxIterations) {
    const popped = open.pop()!;
    const current = popped.item;
    if (popped.priority > fScore[current.r][current.c] + 1e-9) continue; // superseded by a better entry
    iterations++;

    if (current.c === goalGrid.c && current.r === goalGrid.r) {
      // Reconstruct path
      const path: GridNode[] = [current];
      let currKey = `${current.c},${current.r}`;
      while (cameFrom.has(currKey)) {
        const prev = cameFrom.get(currKey)!;
        path.unshift(prev);
        currKey = `${prev.c},${prev.r}`;
      }
      return path;
    }

    for (const nb of neighbors) {
      const nc = current.c + nb.dc;
      const nr = current.r + nb.dr;

      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

      const slope = ARCADIA_SLOPE_GRID[nr][nc];
      // Hard avoidance if slope exceeds max physical traction limit
      // The chosen destination itself is always enterable. The steepest slope on the route is reported either way.
      const isGoal = nc === goalGrid.c && nr === goalGrid.r;
      if (slope > slopeCapDeg && !isGoal) continue;

      const hazard = ARCADIA_HAZARD_GRID[nr][nc];
      const iceConfidence = ARCADIA_ICE_GRID[nr][nc];
      const commsCoverage = ARCADIA_COMMS_GRID[nr][nc];

      // Multi-objective cell step cost
      let stepCost = nb.cost * weights.distanceWeight;

      // Exponential penalty for steep slopes
      if (slope > 14) {
        stepCost += Math.pow((slope - 14) / 4, 1.8) * weights.slopeWeight;
      }

      // Boulder & terrain obstacle penalty
      stepCost += hazard * 8.0 * weights.hazardWeight;

      // Communication shadow penalty
      if (commsCoverage < 75) {
        stepCost += ((75 - commsCoverage) / 25) * 4.0 * weights.commsPenalty;
      }

      // Science & ice attraction (negative cost / bonus)
      const normX = (nc / cols) * 100;
      const normY = (nr / rows) * 100;
      const nearTarget = findNearbyScienceTarget(normX, normY, 6);
      if (nearTarget) {
        stepCost = Math.max(0.2, stepCost - (nearTarget.scientificValue / 100) * weights.scienceAttraction);
      }

      // Subsurface ice proximity reward
      if (iceConfidence > 65) {
        stepCost = Math.max(0.3, stepCost - ((iceConfidence - 65) / 35) * weights.iceAttraction);
      }

      const tentativeG = gScore[current.r][current.c] + stepCost;

      if (tentativeG < gScore[nr][nc]) {
        cameFrom.set(`${nc},${nr}`, current);
        gScore[nr][nc] = tentativeG;
        fScore[nr][nc] = tentativeG + heuristic({ c: nc, r: nr });

        open.push({ c: nc, r: nr }, fScore[nr][nc]);
      }
    }
  }

  return null; // goal not reachable under this slope cap
}

/**
 * Finds the route on the grid. Every route uses the same search; only the cost weights differ.
 * If the goal cannot be reached under the profile's slope limit (it is enclosed by steeper ground), the cap is relaxed
 * step by step and the route's real steepest slope is reported, instead of silently drawing a straight line.
 */
function runAStar(
  startGrid: GridNode,
  goalGrid: GridNode,
  weights: CostWeights,
  waypointBiases: GridNode[] = []
): GridNode[] {
  if (startGrid.c === goalGrid.c && startGrid.r === goalGrid.r) {
    const fallbackGoal: GridNode = {
      c: Math.min(GRID_COLS - 1, startGrid.c + (startGrid.c > GRID_COLS / 2 ? -2 : 2)),
      r: Math.min(GRID_ROWS - 1, startGrid.r + (startGrid.r > GRID_ROWS / 2 ? -2 : 2))
    };
    return [startGrid, fallbackGoal];
  }
  const caps = [weights.maxSlopeAllowed, (Math.atan(GRADIENT_LIMIT) * 180) / Math.PI, Infinity];
  for (const cap of caps) {
    const path = searchAStar(startGrid, goalGrid, weights, waypointBiases, cap);
    if (path) return path;
  }
  return [startGrid, goalGrid]; // not reachable on a connected grid; kept only as a last resort
}

/**
 * Converts raw grid nodes into smooth operational waypoints with telemetry metrics.
 */
function buildWaypointsFromGrid(
  rawNodes: GridNode[],
  payloadKg: number = 0
): RouteWaypoint[] {
  const waypoints: RouteWaypoint[] = [];

  // Guarantee at least 2 valid nodes
  const nodes = [...rawNodes];
  if (nodes.length < 2) {
    const first = nodes[0] || { c: 20, r: 20 };
    nodes.push({
      c: Math.min(GRID_COLS - 1, first.c + 2),
      r: Math.min(GRID_ROWS - 1, first.r + 2)
    });
  }

  // One waypoint per grid cell on the path, so distance, time, slope, hazard and comms are measured on the cells the
  // astronaut actually crosses (an earlier version kept only ~10 points and measured the straight lines between them).
  const sampledNodes: GridNode[] = nodes.filter((n, i) => i === 0 || n.c !== nodes[i - 1].c || n.r !== nodes[i - 1].r);
  if (sampledNodes.length < 2) {
    sampledNodes.push({
      c: Math.min(GRID_COLS - 1, sampledNodes[0].c + 2),
      r: Math.min(GRID_ROWS - 1, sampledNodes[0].r + 2)
    });
  }

  let cumulativeDist = 0;
  let cumulativeTime = 0;

  for (let i = 0; i < sampledNodes.length; i++) {
    const node = sampledNodes[i];
    const x = Math.round((node.c / GRID_COLS) * 100);
    const y = Math.round((node.r / GRID_ROWS) * 100);
    const coords = gridToCoordinates(x, y);

    const elev = ARCADIA_ELEVATION_GRID[node.r][node.c];
    const slope = ARCADIA_SLOPE_GRID[node.r][node.c];
    const hazard = ARCADIA_HAZARD_GRID[node.r][node.c];
    const comms = ARCADIA_COMMS_GRID[node.r][node.c];

    let legDist = 0;
    if (i > 0) {
      const prev = sampledNodes[i - 1];
      const dc = (node.c - prev.c) * CELL_METERS_X;
      const dr = (node.r - prev.r) * CELL_METERS_Y;
      legDist = Math.hypot(dc, dr);
    }

    cumulativeDist += legDist;

    // Pace and metabolic power from the signed gradient of this leg (Minetti cost, Mars gravity, suited mass)
    let legTime = 0;
    let legPowerW = 0;
    if (legDist > 0) {
      const prevElev = ARCADIA_ELEVATION_GRID[sampledNodes[i - 1].r][sampledNodes[i - 1].c];
      const gradient = (elev - prevElev) / legDist;
      const v = paceMs(gradient, payloadKg);
      legTime = legDist / (v * 60); // minutes
      legPowerW = walkingPowerW(gradient, v, payloadKg);
    }
    cumulativeTime += legTime;

    const nearScience = findNearbyScienceTarget(x, y, 7);

    waypoints.push({
      id: `WP-${String(i).padStart(2, '0')}`,
      label: i === 0 ? 'START' : i === sampledNodes.length - 1 ? 'TARGET' : `WP-${String(i).padStart(2, '0')}`,
      lat: coords.lat,
      lon: coords.lon,
      x,
      y,
      elevation: elev,
      slopeDeg: slope,
      hazardScore: hazard,
      commsSignalPct: comms,
      distanceFromPrevMeters: Math.round(legDist),
      cumulativeDistanceMeters: Math.round(cumulativeDist),
      cumulativeTimeMin: Math.round(cumulativeTime * 10) / 10,
      legMetabolicW: Math.round(legPowerW),
      scienceTargetNear: nearScience
    });
  }

  return waypoints;
}

/**
 * Calculates complete RouteCandidate object with explainability metrics.
 */
function evaluateRouteCandidate(
  id: 'ROUTE_A' | 'ROUTE_B' | 'ROUTE_C',
  name: string,
  subtitle: string,
  description: string,
  color: string,
  waypoints: RouteWaypoint[],
  profile: MissionProfile,
  allHazards: HazardZone[]
): RouteCandidate {
  const totalDistanceKm = Math.round((waypoints[waypoints.length - 1].cumulativeDistanceMeters / 1000) * 100) / 100;
  
  // Base walking duration + extra time for visited science targets
  let totalScienceObservationMin = 0;
  const visitedTargets: ScienceTarget[] = [];
  const targetIdSet = new Set<string>();

  for (const wp of waypoints) {
    if (wp.scienceTargetNear && !targetIdSet.has(wp.scienceTargetNear.id)) {
      targetIdSet.add(wp.scienceTargetNear.id);
      visitedTargets.push(wp.scienceTargetNear);
      totalScienceObservationMin += wp.scienceTargetNear.observationTimeMin;
    }
  }

  const travelDurationMin = waypoints[waypoints.length - 1].cumulativeTimeMin;
  const totalDurationMin = Math.round((travelDurationMin + totalScienceObservationMin) * 10) / 10;

  // Slope and hazard averages
  const slopeSum = waypoints.reduce((acc, wp) => acc + wp.slopeDeg, 0);
  const avgSlopeDeg = Math.round((slopeSum / waypoints.length) * 10) / 10;
  const maxSlopeDeg = Math.max(...waypoints.map(wp => wp.slopeDeg));

  const hazardSum = waypoints.reduce((acc, wp) => acc + wp.hazardScore, 0);
  const hazardExposureScore = Math.round((hazardSum / waypoints.length) * 100);

  const commsSum = waypoints.reduce((acc, wp) => acc + wp.commsSignalPct, 0);
  const commsCoveragePct = Math.round(commsSum / waypoints.length);

  const totalScienceScore = visitedTargets.reduce((acc, t) => acc + t.scientificValue, 0);

  // Metabolic energy: walking legs at the Minetti power, science stops at the 350 W Mars EVA average.
  // Legs are timed in cumulativeTimeMin, so leg energy = power x leg minutes.
  let walkKJ = 0;
  for (let k = 1; k < waypoints.length; k++) {
    const dtMin = waypoints[k].cumulativeTimeMin - waypoints[k - 1].cumulativeTimeMin;
    walkKJ += ((waypoints[k].legMetabolicW ?? 0) * dtMin * 60) / 1000;
  }
  const totalMetabolicKJ = Math.round(walkKJ + (METABOLIC_AVG_W * totalScienceObservationMin * 60) / 1000);
  const avgMetabolicW = totalDurationMin > 0 ? Math.round((totalMetabolicKJ * 1000) / (totalDurationMin * 60)) : 0;
  // Battery: constant drain over the 8 h design life. Oxygen: metabolic energy against the 8 h, 350 W design EVA.
  const energyConsumptionPct = Math.min(100, Math.round((totalDurationMin / EVA_DESIGN_MIN) * 100));
  const suitOxygenUsedPct = Math.min(100, Math.round((totalMetabolicKJ / O2_CAPACITY_KJ) * 100));

  // Radiation dose over the full EVA (MODELLED: published MSL RAD rate used as a surface proxy)
  const doseMicroSv = Math.round(RAD_BASELINE_MICROSV_H * (totalDurationMin / 60));
  // Honest time-budget check: a route longer than the EVA limit does not fit the plan
  const timeBudgetExceededMin = Math.max(0, Math.round(totalDurationMin - profile.durationMin));

  // Determine which specific hazards were avoided
  const hazardsAvoided: string[] = [];
  for (const hz of allHazards) {
    const isNearby = waypoints.some(wp => Math.hypot(wp.x - hz.center[0], wp.y - hz.center[1]) < hz.radius + 6);
    if (!isNearby) {
      hazardsAvoided.push(`Avoided ${hz.name} (${hz.severity})`);
    }
  }

  // Hazard zones the route actually runs through (sampled along each leg, ~8 samples per leg)
  const hazardsCrossed: HazardCrossing[] = [];
  for (const hz of allHazards) {
    let fromM = Infinity, toM = -Infinity, maxSlope = 0, entryLat = 0, entryLon = 0;
    for (let k = 1; k < waypoints.length; k++) {
      const a = waypoints[k - 1], b = waypoints[k];
      const STEPS = 8;
      for (let s = 0; s <= STEPS; s++) {
        const u = s / STEPS;
        const px = a.x + (b.x - a.x) * u, py = a.y + (b.y - a.y) * u;
        if (Math.hypot(px - hz.center[0], py - hz.center[1]) > hz.radius) continue;
        const dM = a.cumulativeDistanceMeters + (b.cumulativeDistanceMeters - a.cumulativeDistanceMeters) * u;
        if (dM < fromM) {
          fromM = dM;
          entryLat = a.lat + (b.lat - a.lat) * u;
          entryLon = a.lon + (b.lon - a.lon) * u;
        }
        if (dM > toM) toM = dM;
        maxSlope = Math.max(maxSlope, a.slopeDeg + (b.slopeDeg - a.slopeDeg) * u);
      }
    }
    if (fromM !== Infinity) {
      hazardsCrossed.push({
        zoneId: hz.id,
        name: hz.name,
        type: hz.type,
        severity: hz.severity,
        description: hz.description,
        avoidanceRationale: hz.avoidanceRationale,
        fromM: Math.round(fromM),
        toM: Math.round(toM),
        maxSlopeDeg: Math.round(maxSlope * 10) / 10,
        lat: Math.round(entryLat * 10000) / 10000,
        lon: Math.round(entryLon * 10000) / 10000
      });
    }
  }
  hazardsCrossed.sort((p, q) => p.fromM - q.fromM);

  // Explainable reasons: only numbers computed from this route, plus what its weights aim for (no claims about other routes here).
  const whyChosenReasons: string[] = [];
  const slopeLimit = Math.round(planningSlopeLimitDeg(profile) * 10) / 10;
  whyChosenReasons.push(
    `Slope along the route: average ${avgSlopeDeg}°, steepest ${maxSlopeDeg}°` +
      (maxSlopeDeg > slopeLimit ? ` (above the ${slopeLimit}° walking limit of this profile)` : '')
  );
  whyChosenReasons.push(`Relay coverage averages ${commsCoveragePct}% (modelled)`);
  whyChosenReasons.push(`Passes ${visitedTargets.length} candidate site(s) along the walk`);
  whyChosenReasons.push(
    hazardsCrossed.length > 0
      ? `Runs through ${hazardsCrossed.length} mapped hazard zone(s): ${hazardsCrossed.map(h => h.zoneId).join(', ')}`
      : 'Does not run through any mapped hazard zone'
  );
  whyChosenReasons.push(
    timeBudgetExceededMin > 0
      ? `EXCEEDS the ${profile.durationMin} min EVA limit by ${timeBudgetExceededMin} min: shorten the route or raise the limit`
      : `Leaves ${Math.round(profile.durationMin - totalDurationMin)} min safety margin in EVA time budget`
  );
  if (id === 'ROUTE_B') whyChosenReasons.push('Detours through a candidate site to add sampling time (stop time is an assumption)');

  return {
    id,
    name,
    subtitle,
    description,
    waypoints,
    totalDistanceKm,
    totalDurationMin,
    avgSlopeDeg,
    maxSlopeDeg,
    hazardExposureScore,
    commsCoveragePct,
    scienceTargetsVisited: visitedTargets,
    totalScienceScore,
    energyConsumptionPct,
    totalMetabolicKJ,
    avgMetabolicW,
    suitOxygenUsedPct,
    doseMicroSv,
    timeBudgetExceededMin,
    whyChosenReasons,
    hazardsAvoided,
    hazardsCrossed,
    color
  };
}

/**
 * Computes all 3 candidate routes for the active mission setup.
 */
export function planEvaRoutes(
  startGridPos: [number, number], // [x, y] 0..100
  targetGridPos: [number, number], // [x, y] 0..100
  profile: MissionProfile,
  dustModifier: number = 1.0,
  commsModifier: number = 1.0
): {
  selectedRoute: RouteCandidate;
  routes: RouteCandidate[];
  comparison?: RouteComparisonDelta;
} {
  const startNode: GridNode = {
    c: Math.min(GRID_COLS - 1, Math.max(0, Math.round((startGridPos[0] / 100) * GRID_COLS))),
    r: Math.min(GRID_ROWS - 1, Math.max(0, Math.round((startGridPos[1] / 100) * GRID_ROWS)))
  };

  const goalNode: GridNode = {
    c: Math.min(GRID_COLS - 1, Math.max(0, Math.round((targetGridPos[0] / 100) * GRID_COLS))),
    r: Math.min(GRID_ROWS - 1, Math.max(0, Math.round((targetGridPos[1] / 100) * GRID_ROWS)))
  };

  // 1. ROUTE A: Balanced "Science & Safety"
  const weightsA = getCostWeights(profile, dustModifier);
  weightsA.commsPenalty *= commsModifier;
  const nodesA = runAStar(startNode, goalNode, weightsA);
  const waypointsA = buildWaypointsFromGrid(nodesA, profile.payloadKg ?? 0);
  const routeA = evaluateRouteCandidate(
    'ROUTE_A',
    'Route Alpha',
    'Balanced Science & Safety (Recommended)',
    'Balances distance, slope, DEM-derived hazard cells, modelled comms coverage and candidate sampling sites.',
    '#38bdf8', // Cool cyan
    waypointsA,
    profile,
    ARCADIA_HAZARD_ZONES
  );

  // 2. ROUTE B: "Maximum Science Target Yield"
  // Guide A* through intermediate science waypoints (e.g. SCI-02 or SCI-04)
  const weightsB = getCostWeights(profile, dustModifier);
  weightsB.scienceAttraction *= 2.8;
  weightsB.iceAttraction *= 2.5;
  weightsB.slopeWeight *= 0.7; // More adventurous
  // Beta stops at the candidate site that adds the smallest detour (not at the start or goal themselves).
  const detourOf = (t: { x: number; y: number }) =>
    Math.hypot(t.x - startGridPos[0], t.y - startGridPos[1]) + Math.hypot(t.x - targetGridPos[0], t.y - targetGridPos[1]);
  const stopCandidates = ARCADIA_SCIENCE_TARGETS.filter(t =>
    Math.hypot(t.x - startGridPos[0], t.y - startGridPos[1]) > 4 && Math.hypot(t.x - targetGridPos[0], t.y - targetGridPos[1]) > 4);
  const intermediateTarget = (stopCandidates.length ? stopCandidates : ARCADIA_SCIENCE_TARGETS)
    .reduce((best, t) => (detourOf(t) < detourOf(best) ? t : best));
  const biasNode: GridNode = {
    c: Math.round((intermediateTarget.x / 100) * GRID_COLS),
    r: Math.round((intermediateTarget.y / 100) * GRID_ROWS)
  };
  // Beta is forced through the chosen candidate site (two legs), so it only matches Alpha if Alpha already passes there.
  const farFromEnds = Math.hypot(biasNode.c - startNode.c, biasNode.r - startNode.r) > 2 && Math.hypot(biasNode.c - goalNode.c, biasNode.r - goalNode.r) > 2;
  let nodesB: GridNode[];
  if (farFromEnds) {
    const leg1 = runAStar(startNode, biasNode, weightsB);
    const leg2 = runAStar(biasNode, goalNode, weightsB);
    nodesB = leg1.length && leg2.length ? [...leg1, ...leg2.slice(1)] : runAStar(startNode, goalNode, weightsB, [biasNode]);
  } else {
    nodesB = runAStar(startNode, goalNode, weightsB, [biasNode]);
  }
  const waypointsB = buildWaypointsFromGrid(nodesB, profile.payloadKg ?? 0);
  const routeB = evaluateRouteCandidate(
    'ROUTE_B',
    'Route Beta',
    'Maximum Science Yield',
    'Detours through the candidate site that adds the least distance, so it is longer than Alpha.',
    '#a855f7', // Purple
    waypointsB,
    profile,
    ARCADIA_HAZARD_ZONES
  );

  // 3. ROUTE C: "Direct / High Risk"
  // Prioritizes pure distance minimization; disregards terrain slope & hazard penalties
  const weightsC: CostWeights = {
    distanceWeight: 1.0,
    slopeWeight: 0,
    hazardWeight: 0,
    scienceAttraction: 0,
    iceAttraction: 0,
    commsPenalty: 0,
    maxSlopeAllowed: (Math.atan(GRADIENT_LIMIT) * 180) / Math.PI // steepest gradient the cost model covers
  };
  const nodesC = runAStar(startNode, goalNode, weightsC);
  const waypointsC = buildWaypointsFromGrid(nodesC, profile.payloadKg ?? 0);
  const routeC = evaluateRouteCandidate(
    'ROUTE_C',
    'Route Gamma',
    'Direct Transit (shortest distance)',
    'Weights distance only, with a looser slope limit. It is shorter but ignores hazard cells, comms coverage and candidate sites.',
    '#ef4444', // Red
    waypointsC,
    profile,
    ARCADIA_HAZARD_ZONES
  );

  // Determine selected route based on user objective
  let selected = routeA;
  if (profile.objective === 'MULTI_SCIENCE' && profile.sciencePriority === 'HIGH') {
    selected = routeB;
  } else if (profile.riskTolerance === 'HIGH' && profile.durationMin < 75) {
    selected = routeC;
  }

  // Plain comparison lines against Alpha, computed from the numbers (never assumed).
  const cmp = (r: RouteCandidate) => {
    if (r === routeA) return;
    const dKm = Math.round((r.totalDistanceKm - routeA.totalDistanceKm) * 100) / 100;
    const dMin = Math.round((r.totalDurationMin - routeA.totalDurationMin) * 10) / 10;
    const part = (v: number, unit: string, more: string, less: string) =>
      v === 0 ? (unit === 'km' ? 'same distance as Alpha' : 'same time as Alpha') : `${Math.abs(v)} ${unit === 'km' ? 'km' : 'min'} ${v > 0 ? more : less} than Alpha`;
    r.whyChosenReasons.push(`Compared with Alpha: ${part(dKm, 'km', 'longer', 'shorter')}, ${part(dMin, 'time', 'slower', 'faster')}`);
  };
  cmp(routeB);
  cmp(routeC);

  // Say so when two routes follow exactly the same cells, instead of presenting them as different options.
  const key = (n: GridNode[]) => n.map(g => `${g.c},${g.r}`).join(';');
  const kA = key(nodesA), kB = key(nodesB), kC = key(nodesC);
  if (kB === kA) routeB.samePathAs = routeA.name;
  if (kC === kA) routeC.samePathAs = routeA.name;
  else if (kC === kB) routeC.samePathAs = routeB.name;

  return {
    selectedRoute: selected,
    routes: [routeA, routeB, routeC]
  };
}

/**
 * Computes exact quantitative deltas when dynamic replanning occurs.
 */
export function calculateReplanningDelta(
  originalRoute: RouteCandidate,
  adaptedRoute: RouteCandidate
): RouteComparisonDelta {
  const distDelta = Math.round((adaptedRoute.totalDistanceKm - originalRoute.totalDistanceKm) * 100) / 100;
  const timeDelta = Math.round((adaptedRoute.totalDurationMin - originalRoute.totalDurationMin) * 10) / 10;
  
  const riskDelta = Math.round(
    ((adaptedRoute.hazardExposureScore - originalRoute.hazardExposureScore) / Math.max(1, originalRoute.hazardExposureScore)) * 100
  );

  const scienceDelta = Math.round(
    ((adaptedRoute.totalScienceScore - originalRoute.totalScienceScore) / Math.max(1, originalRoute.totalScienceScore)) * 100
  );

  const commsDelta = Math.round(
    adaptedRoute.commsCoveragePct - originalRoute.commsCoveragePct
  );

  const explanation: string[] = [
    `Adapted route steers ${Math.abs(distDelta)} km ${distDelta >= 0 ? 'longer' : 'shorter'} around oncoming environmental hazard.`,
    `Estimated transit time adjusted by ${timeDelta >= 0 ? `+${timeDelta}` : timeDelta} minutes.`,
    `Overall terrain hazard exposure ${riskDelta <= 0 ? `reduced by ${Math.abs(riskDelta)}%` : `increased by ${riskDelta}%`}.`,
    `Communication reliability ${commsDelta >= 0 ? `improved by +${commsDelta}%` : `decreased by ${Math.abs(commsDelta)}%`}.`
  ];

  return {
    originalRouteId: originalRoute.id,
    newRouteId: adaptedRoute.id,
    distanceDeltaKm: distDelta,
    timeDeltaMin: timeDelta,
    riskDeltaPct: riskDelta,
    scienceValueDeltaPct: scienceDelta,
    commsDeltaPct: commsDelta,
    explanation
  };
}
