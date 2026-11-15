/**
 * MARSWEAVE — Intelligent EVA Planning for the Red Planet
 * Type definitions for mission planning, geospatial engine, NASA datasets, and simulation
 */

export type MissionObjectiveType = 
  | 'WATER'
  | 'GEOLOGY'
  | 'MINERALOGY'
  | 'TERRAIN_SURVEY'
  | 'MULTI_SCIENCE';

export type RiskToleranceType = 'LOW' | 'MEDIUM' | 'HIGH';
export type PriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MissionProfile {
  objective: MissionObjectiveType;
  durationMin: number;
  riskTolerance: RiskToleranceType;
  sciencePriority: PriorityLevel;
  commsPriority: PriorityLevel;
  astronautSpeedMpm: number; // no longer drives the plan: pace comes from engine/evaPhysiology.ts
  payloadKg: number; // carried equipment, kg (ASSUMPTION-based mobility model, see routeOptimizer.ts)
}

export type DataStatus = 'REAL NASA ARCHIVE' | 'DERIVED' | 'MODELLED' | 'SIMULATED';

export interface LayerMetadata {
  id: string;
  name: string;
  instrument: string;
  mission: string;
  dataType: DataStatus;
  resolution: string;
  coverage: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  color: string;
  visible: boolean;
  opacity: number;
}

export interface MarsCoordinates {
  lat: number; // degrees North (positive) or South (negative)
  lon: number; // degrees West or East (0-360 E standard or -180 to 180)
  elevationMeters: number; // relative to Mars datum (MOLA 0-datum)
}

export interface ScienceEvidenceStep {
  instrument: string;
  mission: string;
  observation: string;
  derivedProperty: string;
  scientificSignificance: string;
}

export interface ScienceTarget {
  id: string;
  name: string;
  type: 'HYDRATED_MINERAL' | 'SUBSURFACE_ICE' | 'GEOLOGY_STRATUM' | 'THERMAL_ANOMALY' | 'VOLCANIC_BASALT';
  lat: number;
  lon: number;
  x: number; // normalized grid coordinates 0..100
  y: number;
  elevationMeters: number;
  scientificValue: number; // 0..100
  confidencePct: number; // 0..100
  dataSources: string[];
  recommendedAction: string;
  observationTimeMin: number;
  description: string;
  spectralData?: {
    wavelengthMicrons: number[];
    reflectance: number[];
    absorptionBands: string[];
  };
  radarData?: {
    depthMeters: number;
    dielectricConstant: number;
    icePurityPct: number;
  };
  evidenceChain: ScienceEvidenceStep[];
  /** Set when the position was moved onto DEM morphology (original hand-authored x,y in percent). */
  snappedFrom?: [number, number];
  snapRule?: string;
}

export type HazardSeverity = 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'CRITICAL';

export interface HazardZone {
  id: string;
  name: string;
  type: 'STEEP_ESCARPMENT' | 'BOULDER_FIELD' | 'CRATER_RIM' | 'DUST_ACCUMULATION' | 'COMMS_SHADOW';
  severity: HazardSeverity;
  center: [number, number]; // [x, y] in grid 0..100
  radius: number;
  slopeDeg?: number;
  boulderDensityPct?: number;
  description: string;
  avoidanceRationale: string;
  polygon?: [number, number][];
}

export interface RouteWaypoint {
  id: string;
  label: string;
  lat: number;
  lon: number;
  x: number; // 0..100
  y: number; // 0..100
  elevation: number;
  slopeDeg: number;
  hazardScore: number; // 0..1
  commsSignalPct: number;
  distanceFromPrevMeters: number;
  cumulativeDistanceMeters: number;
  cumulativeTimeMin: number;
  /** Metabolic power while walking this leg, W (MODELLED, engine/evaPhysiology.ts). */
  legMetabolicW?: number;
  scienceTargetNear?: ScienceTarget;
}

/** A hazard zone the planned route passes through (computed from the route and the zone footprint). */
export interface HazardCrossing {
  zoneId: string;
  name: string;
  type: HazardZone['type'];
  severity: HazardSeverity;
  description: string;
  avoidanceRationale: string;
  /** Distance along the route where the route enters / leaves the zone, metres. */
  fromM: number;
  toM: number;
  /** Steepest interpolated slope of the route inside the zone, degrees. */
  maxSlopeDeg: number;
  lat: number;
  lon: number;
}

export interface RouteCandidate {
  id: 'ROUTE_A' | 'ROUTE_B' | 'ROUTE_C';
  name: string;
  subtitle: string;
  description: string;
  waypoints: RouteWaypoint[];
  totalDistanceKm: number;
  totalDurationMin: number;
  avgSlopeDeg: number;
  maxSlopeDeg: number;
  hazardExposureScore: number; // 0..100 (lower is safer)
  commsCoveragePct: number; // 0..100 (higher is better)
  scienceTargetsVisited: ScienceTarget[];
  /** Set when this route follows exactly the same grid cells as an earlier route. */
  samePathAs?: string;
  totalScienceScore: number;
  energyConsumptionPct: number;
  /** Metabolic energy of the whole route, kJ, and its average power, W (MODELLED). */
  totalMetabolicKJ: number;
  avgMetabolicW: number;
  suitOxygenUsedPct: number;
  doseMicroSv: number; // estimated surface radiation dose over the whole EVA (MODELLED)
  timeBudgetExceededMin: number; // >0 means the route does NOT fit the EVA time limit
  whyChosenReasons: string[];
  hazardsAvoided: string[];
  /** Hazard zones the route runs through, in order along the route. */
  hazardsCrossed: HazardCrossing[];
  color: string;
  dashed?: boolean;
}

export interface EnvironmentalConditions {
  sol: number;
  marsLocalTime: string;
  sunElevationDeg: number;
  surfaceTempC: number;
  windSpeedMs: number;
  windDirectionDeg: number;
  dustOpticalDepthTau: number; // 0.2 (clear) to 2.5 (severe storm)
  radiationDoseRateMicroSvH: number; // e.g. 24-35 µSv/h (MSL RAD nominal)
  commsRelayOrbiter: string;
  commsLineOfSight: boolean;
  commsQualityPct: number;
}

export interface AstronautTelemetry {
  heartRateBpm: number;
  suitPressureKpa: number;
  suitO2RemainingPct: number;
  suitBatteryRemainingPct: number;
  metabolicRateWatts: number;
  currentDistanceMeters: number;
  currentElevationMeters: number;
  timeRemainingMin: number;
  samplesCollected: string[];
  completedObservations: string[];
}

export interface EnvironmentalAlert {
  id: string;
  type: 'DUST_STORM_SURGE' | 'COMMS_DEGRADATION' | 'TEMPERATURE_DROP' | 'SLOPE_SLIP_HAZARD';
  title: string;
  message: string;
  severity: 'WARNING' | 'CRITICAL';
  triggerAtElapsedSec: number;
  impactTimeDeltaMin: number;
  impactRiskDeltaPct: number;
  suggestedAction: string;
  resolved: boolean;
}

export interface RouteComparisonDelta {
  originalRouteId: string;
  newRouteId: string;
  distanceDeltaKm: number;
  timeDeltaMin: number;
  riskDeltaPct: number;
  scienceValueDeltaPct: number;
  commsDeltaPct: number;
  explanation: string[];
}

export interface WhatIfScenarioOption {
  id: string;
  title: string;
  description: string;
  dustModifier: number; // multiplier, e.g. 1.5 = +50%
  commsModifier: number; // multiplier, e.g. 0.7 = -30%
  maxTraversableSlope: number; // degrees, e.g. 15 instead of 25
  scienceRewardMultiplier: number;
  durationBudgetMin: number;
}

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'copilot' | 'system';
  timestamp: string;
  text: string;
  dataSourcesCited?: string[];
  suggestedFollowUps?: string[];
}

export interface DataProvenanceEntry {
  instrument: string;
  instrumentFull: string;
  mission: string;
  agency: string;
  pdsDatasetId: string;
  spatialResolution: string;
  spectralRange: string;
  temporalCoverage: string;
  dataStatus: DataStatus;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  usedInMarsweaveFor: string;
  scientificHonestyNotes: string;
}
