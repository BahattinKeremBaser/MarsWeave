/**
 * MARSWEAVE — 3D Mars Surface & Orbital Visualization Viewport
 * Built with Three.js WebGL.
 * Features true MOLA digital elevation model (DEM) terrain mesh,
 * procedural Martian regolith PBR texturing, multi-spectral NASA layer projection,
 * 3D route spline trajectories with animated photon pulses, 3D science beacons,
 * 3D Habitat Alpha base station, animated astronaut rover with dust trails,
 * raycasted terrain inspection, and multiple camera choreography presets.
 */

import { CellSourceTable } from './CellSourceTable';
import MapLegend from './MapLegend';
import AstronautHint from './AstronautHint';
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { demBicubic } from '../../engine/visorRender';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  LayerMetadata,
  RouteCandidate,
  ScienceTarget,
  HazardZone,
  AstronautTelemetry
} from '../../types/marsweave';
import {
  MISSION_BOUNDS,
  ARCADIA_ELEVATION_GRID,
  ARCADIA_SLOPE_GRID,
  ARCADIA_HAZARD_GRID,
  ARCADIA_ICE_GRID,
  ICE_IS_REAL_SWIM,
  ARCADIA_COMMS_GRID,
  GRID_COLS,
  GRID_ROWS,
  HABITAT_ALPHA,
  ELEVATION_SOURCE,
  RAD_BASELINE_MICROSV_H,
  shortTargetLabel,
  targetKindLabel,
  targetColor,
  hazardColor,
  hazardKindLabel
} from '../../data/arcadiaData';
import { gridToCoordinates } from '../../engine/routeOptimizer';
import {
  EYE_HEIGHT_M,
  computeVisorReadout,
  distanceMeters,
  headingRadians,
  meanShieldingAlongRoute,
  pointAhead,
  routeLookAhead,
  smoothHeading,
  VisorReadout
} from '../../engine/visorTelemetry';
import { VisorHud } from './VisorHud';
import { CellInspectionInfo } from './MarsMapCanvas';
import {
  Eye,
  Camera,
  Layers,
  Compass,
  Crosshair,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sliders,
  Sparkles,
  MapPin,
  Radio,
  Wind,
  Keyboard,
  RotateCcw,
  RotateCw,
  Smartphone,
  HelpCircle,
  Gamepad2,
  Move,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export type CameraPreset = 'ORBITAL' | 'SURFACE' | 'FOLLOW' | 'NADIR' | 'VISOR';

interface Mars3DViewportProps {
  layers: LayerMetadata[];
  routes: RouteCandidate[];
  selectedRoute: RouteCandidate;
  scienceTargets: ScienceTarget[];
  hazardZones: HazardZone[];
  startPoint: [number, number];
  targetPoint: [number, number];
  astronautPos?: [number, number];
  astronautTelemetry?: AstronautTelemetry;
  /** EVA time limit from the mission profile (minutes) and elapsed simulation time (seconds), for the visor HUD. */
  evaLimitMin?: number;
  elapsedSec?: number;
  dustStormActive?: boolean;
  onSelectRoute?: (route: RouteCandidate) => void;
  onSelectScienceTarget: (target: ScienceTarget) => void;
  onSetTargetPoint: (point: [number, number]) => void;
  onSetStartPoint: (point: [number, number]) => void;
  onInspectPixel?: (info: CellInspectionInfo | null) => void;
  onSwitchTo2D?: () => void;
  onOpenVisor?: () => void;
}

// 3D Scene dimensions: 100 x 100 units (representing 6.8km x 6.8km)
const SCENE_SIZE = 100;
const HALF_SIZE = SCENE_SIZE / 2;
/** Soft round sprite texture (white core fading out) used for dust, stars and the sun glow. Cosmetic. */
function makeSoftDotTexture(inner = 0.0, size = 64): THREE.Texture | null {
  try {
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const g = cv.getContext('2d');
    if (!g) return null;
    const gr = g.createRadialGradient(size / 2, size / 2, size * inner * 0.5, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cv);
  } catch { return null; }
}

const BASE_ELEV_SCALE = 0.038; // Maps elevation delta (~330m) to ~12.5 3D height units

function distanceToEnd(pos: [number, number], route: RouteCandidate): number {
  const last = route.waypoints[route.waypoints.length - 1];
  return last ? distanceMeters(pos, [last.x, last.y]) : Infinity;
}

/**
 * Creates an aerospace-grade 3D billboard canvas text badge sprite.
 * High-resolution canvas texture (512x140) ensures crystal-clear readability
 * with location names, codes, and scientific yields at all zoom levels.
 */
function createTextBadgeSprite(
  title: string,
  subtitle?: string,
  borderColor: string = '#38bdf8',
  bgColor: string = 'rgba(7, 11, 19, 0.94)',
  isPrimary: boolean = false
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;
  const ctx = canvas.getContext('2d')!;

  const r = 16;
  const x = 8;
  const y = 8;
  const w = 496;
  const h = 124;

  // Background rounded box with drop shadow glow
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = isPrimary ? '#facc15' : borderColor;
  ctx.lineWidth = isPrimary ? 6 : 4;

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Corner target accent
  ctx.strokeStyle = isPrimary ? '#facc15' : '#ffffff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 22);
  ctx.lineTo(x + 12, y + 12);
  ctx.lineTo(x + 22, y + 12);
  ctx.stroke();

  // Title text (Location Name)
  ctx.textAlign = 'center';
  ctx.textBaseline = subtitle ? 'top' : 'middle';
  ctx.fillStyle = isPrimary ? '#facc15' : '#ffffff';
  ctx.font = 'bold 30px "IBM Plex Sans", -apple-system, sans-serif';
  ctx.fillText(title, 256, subtitle ? 22 : 60);

  // Subtitle text (Type / Domain / SCI Yield)
  if (subtitle) {
    ctx.fillStyle = isPrimary ? '#fef08a' : (borderColor === '#ffffff' ? '#cbd5e1' : borderColor);
    ctx.font = 'bold 19px "IBM Plex Mono", monospace';
    ctx.fillText(subtitle, 256, 74);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(7.5, 2.05, 1);
  return sprite;
}

/**
 * Safely disposes and clears children of a Three.js group to prevent memory leaks
 */
function clearThreeGroup(group: THREE.Group) {
  while (group.children.length > 0) {
    const obj = group.children[0];
    group.remove(obj);
    obj.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: any) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        } else {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      }
    });
  }
}

export const Mars3DViewport: React.FC<Mars3DViewportProps> = ({
  layers,
  routes,
  selectedRoute,
  scienceTargets,
  hazardZones,
  startPoint,
  targetPoint,
  astronautPos,
  astronautTelemetry,
  evaLimitMin = 150,
  elapsedSec = 0,
  dustStormActive = false,
  onSelectRoute,
  onSelectScienceTarget,
  onSetTargetPoint,
  onSetStartPoint,
  onInspectPixel,
  onSwitchTo2D,
  onOpenVisor
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Dynamic Scene Objects Refs
  const terrainMeshRef = useRef<THREE.Mesh | null>(null);
  const terrainGeoRef = useRef<THREE.PlaneGeometry | null>(null);
  const skirtMeshRef = useRef<THREE.Mesh | null>(null);
  const canvasTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const routesGroupRef = useRef<THREE.Group | null>(null);
  const scienceBeaconsGroupRef = useRef<THREE.Group | null>(null);
  const hazardsGroupRef = useRef<THREE.Group | null>(null);
  const roverGroupRef = useRef<THREE.Group | null>(null);
  const habitatGroupRef = useRef<THREE.Group | null>(null);
  const targetReticleRef = useRef<THREE.Group | null>(null);
  const dustParticlesRef = useRef<THREE.Points | null>(null);

  // Scene lifecycle & stability flags
  const [sceneInitialized, setSceneInitialized] = useState<boolean>(false);
  const dustStormActiveRef = useRef<boolean>(dustStormActive);
  dustStormActiveRef.current = dustStormActive;
  const pointerDownPosRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // State
  const [cameraMode, setCameraMode] = useState<CameraPreset>('ORBITAL');
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(1.8);
  const [showAltRoutes, setShowAltRoutes] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showLocationLabels, setShowLocationLabels] = useState<boolean>(true);
  const showLocationLabelsRef = useRef<boolean>(showLocationLabels);
  showLocationLabelsRef.current = showLocationLabels;

  const [projectedPins, setProjectedPins] = useState<Array<{
    id: string;
    name: string;
    subtitle?: string;
    color: string;
    screenX: number;
    screenY: number;
    visible: boolean;
    isPrimary?: boolean;
    onClick?: () => void;
  }>>([]);
  const [inspectedCell, setInspectedCell] = useState<CellInspectionInfo | null>(null);
  const [hoveredBeacon, setHoveredBeacon] = useState<ScienceTarget | null>(null);
  const [compassBearing, setCompassBearing] = useState<number>(0);
  const [isControlsMenuOpen, setIsControlsMenuOpen] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [showNavPad, setShowNavPad] = useState<boolean>(true);

  // Time & animation tracking
  const animFrameIdRef = useRef<number | null>(null);
  const visorUpdateRef = useRef<(() => void) | null>(null);
  const visorHeadingRef = useRef<number>(0);
  const visorTickRef = useRef<number>(0);
  const [visorReadout, setVisorReadout] = useState<VisorReadout | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());

  /**
   * Helper: Sample terrain elevation at normalized coordinates (0..100)
   */
  const getElevationAtNorm = useCallback((normX: number, normY: number, exag: number = verticalExaggeration): number => {
    const colFloat = (normX / 100) * (GRID_COLS - 1);
    const rowFloat = (normY / 100) * (GRID_ROWS - 1);

    // Catmull-Rom bicubic interpolation of the real DEM: smooth slopes instead of facets (same data, nicer surface)
    const elev = demBicubic(Math.max(0, Math.min(GRID_COLS - 1, colFloat)), Math.max(0, Math.min(GRID_ROWS - 1, rowFloat)));

    // Convert datum elevation (-4120 to -3790) to 3D world height
    const minElev = MISSION_BOUNDS.datumElevationMinMeters;
    const normHeight = (elev - minElev);
    return normHeight * BASE_ELEV_SCALE * exag;
  }, [verticalExaggeration]);

  /**
   * Helper: Convert normalized [0..100] coordinates to 3D World coordinates [x, y, z]
   */
  /**
   * Solid-looking terrain block: a vertical skirt around the four edges plus a flat bottom, so the map is not a
   * paper-thin sheet when seen from the side or from behind. Heights follow the same function as the terrain.
   */
  const buildSkirtGeometry = useCallback((exag: number): THREE.BufferGeometry => {
    const N = 200;
    let BASE_Y = 0;
    const ring: [number, number][] = [];
    for (let i = 0; i < N; i++) ring.push([(i / N) * 100, 0]);
    for (let i = 0; i < N; i++) ring.push([100, (i / N) * 100]);
    for (let i = 0; i < N; i++) ring.push([100 - (i / N) * 100, 100]);
    for (let i = 0; i <= N; i++) ring.push([0, 100 - (i / N) * 100]);
    const pos: number[] = [];
    const idx: number[] = [];
    BASE_Y = Math.min(...ring.map(([nx, ny]) => getElevationAtNorm(nx, ny, exag))) - 3;
    ring.forEach(([nx, ny]) => {
      const x = (nx / 100) * SCENE_SIZE - HALF_SIZE;
      const z = (ny / 100) * SCENE_SIZE - HALF_SIZE;
      pos.push(x, getElevationAtNorm(nx, ny, exag) - 0.02, z, x, BASE_Y, z);
    });
    for (let i = 0; i < ring.length - 1; i++) {
      const a = i * 2, b = (i + 1) * 2;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    // bottom cap
    const c0 = pos.length / 3;
    pos.push(-HALF_SIZE, BASE_Y, -HALF_SIZE, HALF_SIZE, BASE_Y, -HALF_SIZE, HALF_SIZE, BASE_Y, HALF_SIZE, -HALF_SIZE, BASE_Y, HALF_SIZE);
    idx.push(c0, c0 + 1, c0 + 2, c0, c0 + 2, c0 + 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [getElevationAtNorm]);

  /**
   * Ribbon that follows the terrain: for each angle around a world-space centre, the vertex height is the terrain
   * height there (local to the centre), so rings and curtains hug the ground instead of floating as flat discs.
   */
  const buildDrapedBand = useCallback((center: THREE.Vector3, rInner: number, rOuter: number, segments: number, lift: number, wallHeight: number, exag: number): THREE.BufferGeometry => {
    const pos: number[] = [];
    const idx: number[] = [];
    const heightAt = (wx: number, wz: number) => {
      const nx = Math.max(0, Math.min(100, ((wx + HALF_SIZE) / SCENE_SIZE) * 100));
      const ny = Math.max(0, Math.min(100, ((wz + HALF_SIZE) / SCENE_SIZE) * 100));
      return getElevationAtNorm(nx, ny, exag) - center.y;
    };
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const hIn = heightAt(center.x + ca * rInner, center.z + sa * rInner) + lift;
      const hOut = heightAt(center.x + ca * rOuter, center.z + sa * rOuter) + lift;
      pos.push(ca * rInner, hIn, sa * rInner, ca * rOuter, hOut, sa * rOuter);
      if (wallHeight > 0) pos.push(ca * rOuter, hOut + wallHeight, sa * rOuter);
    }
    const stride = wallHeight > 0 ? 3 : 2;
    for (let i = 0; i < segments; i++) {
      const b = i * stride, n = (i + 1) * stride;
      if (wallHeight > 0) {
        // curtain: outer-bottom (b+1) to outer-top (b+2)
        idx.push(b + 1, n + 1, b + 2, n + 1, n + 2, b + 2);
      } else {
        idx.push(b, n, b + 1, n, n + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [getElevationAtNorm]);

  const normToWorld = useCallback((normX: number, normY: number, exag: number = verticalExaggeration): THREE.Vector3 => {
    const wx = (normX / 100) * SCENE_SIZE - HALF_SIZE;
    const wz = (normY / 100) * SCENE_SIZE - HALF_SIZE;
    const wy = getElevationAtNorm(normX, normY, exag);
    return new THREE.Vector3(wx, wy, wz);
  }, [getElevationAtNorm, verticalExaggeration]);

  /**
   * Helper: Calculate 2D Screen pixel projection for all Mars landmarks and targets.
   * Enables crystal-clear, razor-sharp location names directly above locations in 3D.
   */
  const updateScreenPins = useCallback(() => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width === 0 || height === 0) return;

    const pins: Array<{
      id: string;
      name: string;
      subtitle?: string;
      color: string;
      screenX: number;
      screenY: number;
      visible: boolean;
      isPrimary?: boolean;
      onClick?: () => void;
    }> = [];

    const projectPoint = (normX: number, normY: number, heightOffset: number) => {
      const worldPos = normToWorld(normX, normY, verticalExaggeration);
      worldPos.y += heightOffset;
      worldPos.project(camera);
      const inFront = worldPos.z < 1.0;
      const sx = (worldPos.x * 0.5 + 0.5) * width;
      const sy = (-worldPos.y * 0.5 + 0.5) * height;
      const onScreen = sx >= -40 && sx <= width + 40 && sy >= -30 && sy <= height + 30;
      return { x: sx, y: sy, visible: inFront && onScreen };
    };

    // 1. Habitat Alpha (Base)
    const habP = projectPoint(HABITAT_ALPHA.x, HABITAT_ALPHA.y, 6.4);
    if (habP.visible) {
      pins.push({
        id: 'HABITAT_ALPHA',
        name: 'BASE',
        subtitle: '',
        color: '#38bdf8',
        screenX: habP.x,
        screenY: habP.y,
        visible: true
      });
    }

    // 2. Science Targets
    scienceTargets.forEach(st => {
      const isPrimary = Math.hypot(st.x - targetPoint[0], st.y - targetPoint[1]) < 3;
      const stP = projectPoint(st.x, st.y, isPrimary ? 7.6 : 6.2);
      if (stP.visible) {
        const color = targetColor(st);

        pins.push({
          id: st.id,
          name: isPrimary ? `★ ${shortTargetLabel(st)}` : shortTargetLabel(st),
          subtitle: '',
          color,
          screenX: stP.x,
          screenY: stP.y,
          visible: true,
          isPrimary,
          onClick: () => {
            onSelectScienceTarget(st);
            onSetTargetPoint([st.x, st.y]);
          }
        });
      }
    });

    // 3. Hazard Zones
    hazardZones.forEach(hz => {
      const hzP = projectPoint(hz.center[0], hz.center[1], 4.2);
      if (hzP.visible) {
        pins.push({
          id: hz.id,
          name: `${hazardKindLabel(hz.type)} (${hz.id})`,
          subtitle: '',
          color: hazardColor(hz.type),
          screenX: hzP.x,
          screenY: hzP.y,
          visible: true
        });
      }
    });

    // 4. Recon Rover
    if (astronautPos) {
      const rP = projectPoint(astronautPos[0], astronautPos[1], 4.6);
      if (rP.visible) {
        pins.push({
          id: 'ROVER_ACTIVE',
          name: 'EVA',
          subtitle: '',
          color: '#e25c2b',
          screenX: rP.x,
          screenY: rP.y,
          visible: true,
          isPrimary: true
        });
      }
    }

    setProjectedPins(pins);
  }, [normToWorld, verticalExaggeration, scienceTargets, targetPoint, hazardZones, astronautPos, onSelectScienceTarget, onSetTargetPoint]);

  const updateScreenPinsRef = useRef(updateScreenPins);
  updateScreenPinsRef.current = updateScreenPins;
  const frameTickRef = useRef<number>(0);

  /**
   * Generate 1024x1024 Multi-Spectral Texture for the 3D Terrain
   */
  const updateTerrainTexture = useCallback(() => {
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
      offscreenCanvasRef.current.width = 1024;
      offscreenCanvasRef.current.height = 1024;
    }

    const canvas = offscreenCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const molaLayer = layers.find(l => l.id === 'mola_elevation');
    const slopeLayer = layers.find(l => l.id === 'slope');
    const themisLayer = layers.find(l => l.id === 'themis_thermal');
    const iceLayer = layers.find(l => l.id === 'sharad_ice');
    const commsLayer = layers.find(l => l.id === 'relay_comms');
    const hazardLayer = layers.find(l => l.id === 'hazards');
    const hiriseLayer = layers.find(l => l.id === 'hirise_texture');
    const crismLayer = layers.find(l => l.id === 'crism_minerals');

    const cellW = width / GRID_COLS;
    const cellH = height / GRID_ROWS;
    // Cell colours go into a 1-pixel-per-cell image that is stretched with smoothing (no blocky mosaic). The stretch is
    // aligned so that the centre of cell c sits exactly under mesh column c.
    const cellImg = ctx.createImageData(GRID_COLS, GRID_ROWS);

    // 1. Base Martian Regolith & PBR Albedo
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const elev = ARCADIA_ELEVATION_GRID[r][c];
        const slope = ARCADIA_SLOPE_GRID[r][c];
        const hazard = ARCADIA_HAZARD_GRID[r][c];
        const ice = ARCADIA_ICE_GRID[r][c];
        const comms = ARCADIA_COMMS_GRID[r][c];

        const elevNorm = (elev - MISSION_BOUNDS.datumElevationMinMeters) /
                         (MISSION_BOUNDS.datumElevationMaxMeters - MISSION_BOUNDS.datumElevationMinMeters);

        // Martian oxidized basalt colors: rich rust, umber, and hematite
        let red = 158 + Math.round(elevNorm * 52);
        let green = 72 + Math.round(elevNorm * 38);
        let blue = 52 + Math.round(elevNorm * 28);

        // Hillshade ambient variation
        const eLeft = c > 0 ? ARCADIA_ELEVATION_GRID[r][c - 1] : elev;
        const eTop = r > 0 ? ARCADIA_ELEVATION_GRID[r - 1][c] : elev;
        let shade = ((elev - eLeft) + (elev - eTop)) * 0.06;
        // baked cavity shading from the DEM (hollows darker, crests lighter): a cheap ambient-occlusion cue
        {
          const R2 = 3;
          const aE = ARCADIA_ELEVATION_GRID[r][Math.max(0, c - R2)], bE = ARCADIA_ELEVATION_GRID[r][Math.min(GRID_COLS - 1, c + R2)];
          const cE = ARCADIA_ELEVATION_GRID[Math.max(0, r - R2)][c], dE = ARCADIA_ELEVATION_GRID[Math.min(GRID_ROWS - 1, r + R2)][c];
          const cav = (aE + bE + cE + dE) / 4 - elev; // > 0 in hollows
          shade -= Math.max(-1, Math.min(2, cav * 0.1));
        }
        red = Math.max(20, Math.min(255, red + Math.round(shade * 35)));
        green = Math.max(12, Math.min(255, green + Math.round(shade * 20)));
        blue = Math.max(8, Math.min(255, blue + Math.round(shade * 15)));

        // MOLA False Color Overlay
        if (molaLayer?.visible) {
          const mOp = molaLayer.opacity;
          const mR = Math.round(35 + elevNorm * 220);
          const mG = Math.round(85 + Math.sin(elevNorm * Math.PI) * 120);
          const mB = Math.round(180 - elevNorm * 140);
          red = Math.round(red * (1 - mOp) + mR * mOp);
          green = Math.round(green * (1 - mOp) + mG * mOp);
          blue = Math.round(blue * (1 - mOp) + mB * mOp);
        }

        // Slope Hazard Overlay
        if (slopeLayer?.visible) {
          const sOp = slopeLayer.opacity;
          const slopeNorm = Math.min(1, slope / 28);
          red = Math.round(red * (1 - sOp) + (245 * slopeNorm) * sOp);
          green = Math.round(green * (1 - sOp) + (140 * (1 - slopeNorm)) * sOp);
          blue = Math.round(blue * (1 - sOp) + 20 * sOp);
        }

        // THEMIS Thermal Inertia Overlay
        if (themisLayer?.visible) {
          const tOp = themisLayer.opacity;
          const tVal = (elevNorm * 0.7 + (slope / 30) * 0.3);
          red = Math.round(red * (1 - tOp) + (220 * tVal) * tOp);
          green = Math.round(green * (1 - tOp) + 40 * tOp);
          blue = Math.round(blue * (1 - tOp) + (200 * (1 - tVal)) * tOp);
        }

        // SHARAD Subsurface Ice Overlay (Luminescent Cyan)
        if (iceLayer?.visible && ice > 50) {
          const iOp = (iceLayer.opacity * (ice - 50)) / 50;
          red = Math.round(red * (1 - iOp) + 14 * iOp);
          green = Math.round(green * (1 - iOp) + 190 * iOp);
          blue = Math.round(blue * (1 - iOp) + 225 * iOp);
        }

        // UHF Comms Shadow
        if (commsLayer?.visible && comms < 70) {
          const cOp = commsLayer.opacity * ((70 - comms) / 70);
          red = Math.round(red * (1 - cOp) + 20 * cOp);
          green = Math.round(green * (1 - cOp) + 30 * cOp);
          blue = Math.round(blue * (1 - cOp) + 85 * cOp);
        }

        // Hazard Risk Heat Overlay
        if (hazardLayer?.visible && hazard > 0.3) {
          const hOp = hazardLayer.opacity * ((hazard - 0.3) / 0.7);
          red = Math.round(red * (1 - hOp) + 235 * hOp);
          green = Math.round(green * (1 - hOp) + 25 * hOp);
          blue = Math.round(blue * (1 - hOp) + 45 * hOp);
        }

        {
          const o4 = (r * GRID_COLS + c) * 4;
          cellImg.data[o4] = red; cellImg.data[o4 + 1] = green; cellImg.data[o4 + 2] = blue; cellImg.data[o4 + 3] = 255;
        }

      }
    }

    {
      const small = document.createElement('canvas');
      small.width = GRID_COLS; small.height = GRID_ROWS;
      const sctx = small.getContext('2d');
      if (sctx) {
        sctx.putImageData(cellImg, 0, 0);
        const cw = width / (GRID_COLS - 1), ch = height / (GRID_ROWS - 1);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, -cw / 2, -ch / 2, cw * GRID_COLS, ch * GRID_ROWS);
      }
    }

    // HiRISE micro-detail stippling (drawn after the smoothed colour image so it stays visible)
    if (hiriseLayer?.visible) {
      ctx.fillStyle = 'rgba(255, 235, 215, 0.12)';
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if ((r + c) % 3 === 0) ctx.fillRect(c * cellW + cellW * 0.25, r * cellH + cellH * 0.25, 2, 2);
        }
      }
    }

    // 2. CRISM Spectral Deposit Footprints
    if (crismLayer?.visible) {
      scienceTargets.forEach(st => {
        if (st.type === 'HYDRATED_MINERAL') {
          const sx = (st.x / 100) * width;
          const sy = (st.y / 100) * height;
          const grad = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
          grad.addColorStop(0, 'rgba(16, 185, 129, 0.6)');
          grad.addColorStop(0.5, 'rgba(16, 185, 129, 0.25)');
          grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, 60, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 3. Optional Contour Lines (Every 50 meters)
    if (showContours) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 1; r < GRID_ROWS - 1; r += 2) {
        for (let c = 1; c < GRID_COLS - 1; c += 2) {
          const elev = ARCADIA_ELEVATION_GRID[r][c];
          if (Math.abs(elev % 50) < 14) {
            const px = c * cellW;
            const py = r * cellH;
            ctx.moveTo(px, py);
            ctx.lineTo(px + cellW, py + cellH * 0.5);
          }
        }
      }
      ctx.stroke();
    }

    // 4. Optional Coordinate Grid Lines
    if (showGrid) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 6]);
      const gridInterval = width / 5;
      for (let i = 1; i < 5; i++) {
        // Vertical
        ctx.beginPath();
        ctx.moveTo(i * gridInterval, 0);
        ctx.lineTo(i * gridInterval, height);
        ctx.stroke();
        // Horizontal
        ctx.beginPath();
        ctx.moveTo(0, i * gridInterval);
        ctx.lineTo(width, i * gridInterval);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    if (canvasTextureRef.current) {
      canvasTextureRef.current.needsUpdate = true;
    }
  }, [layers, scienceTargets, showContours, showGrid]);

  /**
   * Initialize Three.js Scene, Camera, Lights, and Renderer
   */
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    // Dusk-toned Martian sky: deep blue-black overhead, butterscotch haze at the horizon (cosmetic gradient, not data)
    try {
      const skyCv = document.createElement('canvas');
      skyCv.width = 4; skyCv.height = 256;
      const sg = skyCv.getContext('2d');
      if (sg) {
        const gr = sg.createLinearGradient(0, 0, 0, 256);
        gr.addColorStop(0, '#05070d'); gr.addColorStop(0.45, '#1b1722'); gr.addColorStop(0.75, '#6e4a3a'); gr.addColorStop(1, '#b07a55');
        sg.fillStyle = gr; sg.fillRect(0, 0, 4, 256);
        const skyTex = new THREE.CanvasTexture(skyCv);
        scene.background = skyTex;
      } else scene.background = new THREE.Color('#07090e');
    } catch { scene.background = new THREE.Color('#07090e'); }

    // Mars Atmospheric Fog
    const fogColor = dustStormActiveRef.current ? '#6a4630' : '#4a2f22';
    const fogDensity = dustStormActiveRef.current ? 0.016 : 0.0045;
    scene.fog = new THREE.FogExp2(fogColor, fogDensity);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 800);
    camera.position.set(0, 52, 68);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // 4. Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.06; // Prevent going underneath terrain
    controls.minDistance = 6;
    controls.maxDistance = 180;
    controls.target.set(0, 3, 0);
    controlsRef.current = controls;

    // 5. Lighting
    // Directional Sun Light (Low-angle Mars sun)
    const sunLight = new THREE.DirectionalLight('#fff0dc', 2.9);
    sunLight.position.set(45, 65, 35);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 200;
    sunLight.shadow.camera.left = -60;
    sunLight.shadow.camera.right = 60;
    sunLight.shadow.camera.top = 60;
    sunLight.shadow.camera.bottom = -60;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.06;
    sunLight.shadow.radius = 2.5;
    scene.add(sunLight);

    // Ambient Skylight (Red-pink Martian atmospheric scattering)
    const ambientLight = new THREE.AmbientLight('#4a2a22', 0.65);
    scene.add(ambientLight);

    // Hemisphere Light
    const hemiLight = new THREE.HemisphereLight('#8a5a46', '#1a0f0b', 0.75);
    scene.add(hemiLight);

    // 6. Deep Space Stars & Phobos
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 380 + Math.random() * 50;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) + 20; // Above horizon
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const dotTex = makeSoftDotTexture(0, 64);
    const starMat = new THREE.PointsMaterial({
      color: '#e2e8f0',
      size: dotTex ? 2.4 : 1.2,
      map: dotTex ?? undefined,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      fog: false
    });
    const starPoints = new THREE.Points(starGeo, starMat);
    scene.add(starPoints);

    // Phobos (Moon of Mars) in the upper sky
    const phobosGeo = new THREE.DodecahedronGeometry(2.4, 1);
    const phobosMat = new THREE.MeshStandardMaterial({
      color: '#9ca3af',
      roughness: 0.9,
      metalness: 0.1
    });
    const phobosMesh = new THREE.Mesh(phobosGeo, phobosMat);
    phobosMesh.position.set(-90, 140, -120);
    scene.add(phobosMesh);

    // 7. Dynamic Dust Particles (Atmosphere simulation)
    const dustCount = 800;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 110;
      dustPositions[i * 3 + 1] = Math.random() * 22;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 110;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: '#d99a5a',
      size: dotTex ? 1.5 : 0.65,
      map: dotTex ?? undefined,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });
    const dustPoints = new THREE.Points(dustGeo, dustMat);
    dustParticlesRef.current = dustPoints;
    scene.add(dustPoints);

    // 8. Build 3D Terrain Plane Geometry
    const segs = 199;
    const planeGeo = new THREE.PlaneGeometry(SCENE_SIZE, SCENE_SIZE, segs, segs);
    planeGeo.rotateX(-Math.PI / 2); // Lay flat on X-Z plane
    terrainGeoRef.current = planeGeo;

    // Apply Elevation to Vertices
    const posAttr = planeGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);

      // Convert X, Z [-50..50] to normalized [0..100]
      const normX = ((x + HALF_SIZE) / SCENE_SIZE) * 100;
      const normY = ((z + HALF_SIZE) / SCENE_SIZE) * 100;

      const y = getElevationAtNorm(normX, normY, 1.8);
      posAttr.setY(i, y);
    }
    planeGeo.computeVertexNormals();

    // Terrain Texture
    updateTerrainTexture();
    const canvasTex = new THREE.CanvasTexture(offscreenCanvasRef.current!);
    canvasTex.generateMipmaps = true;
    canvasTex.minFilter = THREE.LinearMipmapLinearFilter;
    canvasTex.magFilter = THREE.LinearFilter;
    canvasTextureRef.current = canvasTex;

    const terrainMat = new THREE.MeshStandardMaterial({
      map: canvasTex,
      roughness: 0.85,
      metalness: 0.12,
      flatShading: false
    });

    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    terrainMeshRef.current = terrainMesh;
    scene.add(terrainMesh);

    // Side walls and bottom so the terrain reads as a solid block from any angle
    const skirtMesh = new THREE.Mesh(
      buildSkirtGeometry(1.8),
      new THREE.MeshStandardMaterial({ color: '#4b3a2e', roughness: 0.95, metalness: 0.05, side: THREE.DoubleSide })
    );
    skirtMeshRef.current = skirtMesh;
    scene.add(skirtMesh);

    // crisper terrain texture at grazing angles
    try { canvasTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch { /* optional */ }

    // Sun disc + glow in the sky, placed along the light direction (cosmetic)
    try {
      const glowTex = makeSoftDotTexture(0.0, 128);
      if (glowTex) {
        const dir = sunLight.position.clone().normalize();
        const mkSprite = (scale: number, color: string, opacity: number) => {
          const m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
          const sp = new THREE.Sprite(m);
          sp.position.copy(dir).multiplyScalar(520);
          sp.scale.set(scale, scale, 1);
          scene.add(sp);
        };
        mkSprite(200, '#ff9a55', 0.35); // wide warm halo
        mkSprite(70, '#ffd7a0', 0.7);   // inner glow
        mkSprite(22, '#fff6e6', 1.0);   // disc
      }
    } catch { /* optional */ }

    // 9. Groups for Dynamic Entities
    const routesGroup = new THREE.Group();
    routesGroupRef.current = routesGroup;
    scene.add(routesGroup);

    const scienceGroup = new THREE.Group();
    scienceBeaconsGroupRef.current = scienceGroup;
    scene.add(scienceGroup);

    const hazardsGroup = new THREE.Group();
    hazardsGroupRef.current = hazardsGroup;
    scene.add(hazardsGroup);

    const habitatGroup = new THREE.Group();
    habitatGroupRef.current = habitatGroup;
    scene.add(habitatGroup);

    const roverGroup = new THREE.Group();
    roverGroupRef.current = roverGroup;
    scene.add(roverGroup);

    // 10. 3D Holographic Reticle for Click / Hover Inspection
    const reticleGroup = new THREE.Group();
    const reticleRingGeo = new THREE.RingGeometry(1.2, 1.45, 32);
    reticleRingGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const reticleRing = new THREE.Mesh(reticleRingGeo, reticleMat);
    reticleGroup.add(reticleRing);

    // Vertical pointer beacon
    const pointerGeo = new THREE.CylinderGeometry(0.04, 0.04, 3, 8);
    pointerGeo.translate(0, 1.5, 0);
    const pointerMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.7
    });
    const pointerMesh = new THREE.Mesh(pointerGeo, pointerMat);
    reticleGroup.add(pointerMesh);

    reticleGroup.visible = false;
    targetReticleRef.current = reticleGroup;
    scene.add(reticleGroup);

    // 11. Handle Container Resize
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 12. Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      const time = clockRef.current.getElapsedTime();

      // Update Controls
      if (controlsRef.current) {
        controlsRef.current.update();

        // Calculate Compass Bearing from Camera Azimuth
        if (cameraRef.current) {
          const camDir = new THREE.Vector3();
          cameraRef.current.getWorldDirection(camDir);
          const angle = Math.atan2(camDir.x, camDir.z) * (180 / Math.PI);
          setCompassBearing(Math.round(angle));
        }
      }

      // First-person visor camera (no-op unless VISOR mode is active)
      if (visorUpdateRef.current) visorUpdateRef.current();

      // Rotate Phobos slowly
      if (phobosMesh) {
        phobosMesh.rotation.y += 0.002;
      }

      // Drift Dust Particles
      if (dustParticlesRef.current) {
        const positions = dustParticlesRef.current.geometry.attributes.position.array as Float32Array;
        const speed = dustStormActiveRef.current ? 0.35 : 0.08;
        for (let i = 0; i < positions.length; i += 3) {
          positions[i] += speed * (Math.sin(time * 0.5 + i) * 0.2 + 0.8); // Drift +X
          positions[i + 2] += speed * 0.3; // Drift +Z
          if (positions[i] > HALF_SIZE + 5) positions[i] = -HALF_SIZE - 5;
          if (positions[i + 2] > HALF_SIZE + 5) positions[i + 2] = -HALF_SIZE - 5;
        }
        dustParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Pulse Science Beacons
      if (scienceBeaconsGroupRef.current) {
        scienceBeaconsGroupRef.current.children.forEach((beaconObj, idx) => {
          const diamond = beaconObj.getObjectByName('DIAMOND_MESH');
          if (diamond) {
            diamond.rotation.y += 0.025;
            diamond.position.y = 4.2 + Math.sin(time * 2.5 + idx) * 0.4;
          }
          const beam = beaconObj.getObjectByName('BEAM_MESH') as THREE.Mesh;
          if (beam && beam.material) {
            (beam.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(time * 3 + idx) * 0.2;
          }
        });
      }

      // Rotate Habitat Alpha Radar Dish
      if (habitatGroupRef.current) {
        const dish = habitatGroupRef.current.getObjectByName('RADAR_DISH');
        if (dish) {
          dish.rotation.y += 0.03;
        }
      }

      // Update screen-space location name pins every 2 frames
      frameTickRef.current++;
      if (frameTickRef.current % 2 === 0 && showLocationLabelsRef.current) {
        updateScreenPinsRef.current();
      }

      // Render Scene
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    setSceneInitialized(true);
    animate();

    return () => {
      setSceneInitialized(false);
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);

  /**
   * Smoothly update Mars atmospheric fog density when storm alerts trigger
   */
  useEffect(() => {
    dustStormActiveRef.current = dustStormActive;
    if (sceneRef.current) {
      sceneRef.current.fog = new THREE.FogExp2(
        dustStormActive ? '#6a4630' : '#4a2f22',
        dustStormActive ? 0.016 : 0.0045
      );
    }
  }, [dustStormActive]);

  /**
   * Re-calculate Terrain Mesh Vertices when Vertical Exaggeration changes
   */
  useEffect(() => {
    if (!terrainGeoRef.current) return;
    const posAttr = terrainGeoRef.current.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const normX = ((x + HALF_SIZE) / SCENE_SIZE) * 100;
      const normY = ((z + HALF_SIZE) / SCENE_SIZE) * 100;
      const y = getElevationAtNorm(normX, normY, verticalExaggeration);
      posAttr.setY(i, y);
    }
    terrainGeoRef.current.computeVertexNormals();
    posAttr.needsUpdate = true;
    if (skirtMeshRef.current) {
      skirtMeshRef.current.geometry.dispose();
      skirtMeshRef.current.geometry = buildSkirtGeometry(verticalExaggeration);
    }
  }, [verticalExaggeration, getElevationAtNorm, buildSkirtGeometry]);

  /**
   * Refresh Texture when Layers or Contours/Grid toggle
   */
  useEffect(() => {
    updateTerrainTexture();
  }, [updateTerrainTexture]);

  /**
   * Build 3D Habitat Alpha Base
   */
  useEffect(() => {
    if (!sceneInitialized) return;
    const group = habitatGroupRef.current;
    if (!group) return;

    clearThreeGroup(group);

    const pos = normToWorld(HABITAT_ALPHA.x, HABITAT_ALPHA.y, verticalExaggeration);

    const habContainer = new THREE.Group();
    habContainer.position.copy(pos);

    // Primary Geodesic Habitat Dome
    const domeGeo = new THREE.SphereGeometry(2.4, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.35,
      metalness: 0.65
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.castShadow = true;
    habContainer.add(domeMesh);

    // Secondary Airlock Hub
    const airlockGeo = new THREE.CylinderGeometry(0.7, 0.7, 2.2, 16);
    airlockGeo.rotateZ(Math.PI / 2);
    const airlockMat = new THREE.MeshStandardMaterial({
      color: '#0284c7',
      roughness: 0.5,
      metalness: 0.5
    });
    const airlockMesh = new THREE.Mesh(airlockGeo, airlockMat);
    airlockMesh.position.set(2.2, 0.5, 0);
    habContainer.add(airlockMesh);

    // Solar Panel Farm
    const panelGeo = new THREE.BoxGeometry(4.2, 0.1, 2.0);
    const panelMat = new THREE.MeshStandardMaterial({
      color: '#1e3a8a',
      roughness: 0.2,
      metalness: 0.8
    });
    const panelMesh = new THREE.Mesh(panelGeo, panelMat);
    panelMesh.position.set(-3.5, 0.8, -2.5);
    panelMesh.rotation.x = 0.35;
    habContainer.add(panelMesh);

    // Rotating High-Gain Comms Dish
    const mastGeo = new THREE.CylinderGeometry(0.12, 0.16, 3.2, 8);
    const mastMat = new THREE.MeshStandardMaterial({ color: '#94a3b8' });
    const mastMesh = new THREE.Mesh(mastGeo, mastMat);
    mastMesh.position.set(0, 2.6, 0);
    habContainer.add(mastMesh);

    const dishGroup = new THREE.Group();
    dishGroup.name = 'RADAR_DISH';
    dishGroup.position.set(0, 4.2, 0);

    const dishGeo = new THREE.CylinderGeometry(1.1, 0.1, 0.4, 16, 1, true);
    dishGeo.rotateX(Math.PI / 3);
    const dishMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.4,
      metalness: 0.7,
      side: THREE.DoubleSide
    });
    const dishMesh = new THREE.Mesh(dishGeo, dishMat);
    dishGroup.add(dishMesh);
    habContainer.add(dishGroup);

    // Landing Perimeter Ring
    const padGeo = new THREE.RingGeometry(3.5, 3.9, 32);
    padGeo.rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = 0.05;
    habContainer.add(padMesh);

    // 3D Location Name Badge
    const habBadge = createTextBadgeSprite('BASE', undefined, '#38bdf8', 'rgba(7, 11, 19, 0.94)', false);
    habBadge.position.set(0, 5.8, 0);
    habContainer.add(habBadge);

    group.add(habContainer);
  }, [sceneInitialized, normToWorld, verticalExaggeration]);

  /**
   * Build 3D Science Target Beacons
   */
  useEffect(() => {
    if (!sceneInitialized) return;
    const group = scienceBeaconsGroupRef.current;
    if (!group) return;

    clearThreeGroup(group);

    scienceTargets.forEach(target => {
      const pos = normToWorld(target.x, target.y, verticalExaggeration);

      const beaconObj = new THREE.Group();
      beaconObj.position.copy(pos);
      beaconObj.userData = { target };

      const isPrimary = Math.hypot(target.x - targetPoint[0], target.y - targetPoint[1]) < 3;

      const colorHex = targetColor(target);

      // Vertical Laser Beam Shaft (reaching into sky)
      const beamGeo = new THREE.CylinderGeometry(0.08, 0.16, 6, 12);
      beamGeo.translate(0, 3, 0);
      const beamMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: isPrimary ? 0.75 : 0.45,
        blending: THREE.AdditiveBlending
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.name = 'BEAM_MESH';
      beaconObj.add(beamMesh);

      // Rotating Octahedron / Diamond Beacon
      const diamondGeo = new THREE.OctahedronGeometry(isPrimary ? 0.7 : 0.55);
      const diamondMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.6,
        roughness: 0.2,
        metalness: 0.8
      });
      const diamondMesh = new THREE.Mesh(diamondGeo, diamondMat);
      diamondMesh.name = 'DIAMOND_MESH';
      diamondMesh.position.y = 2.2;
      beaconObj.add(diamondMesh);

      // Ground Pulsing Ring
      const ringGeo = buildDrapedBand(pos, 1.6, 1.9, 32, 0.1, 0, verticalExaggeration);
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      beaconObj.add(ringMesh);

      group.add(beaconObj);
    });
  }, [sceneInitialized, scienceTargets, targetPoint, normToWorld, buildDrapedBand, verticalExaggeration]);

  /**
   * Build 3D Volumetric Hazard Zones with 3D Location Name Badges
   */
  useEffect(() => {
    if (!sceneInitialized) return;
    const group = hazardsGroupRef.current;
    if (!group) return;

    clearThreeGroup(group);

    hazardZones.forEach(hz => {
      const pos = normToWorld(hz.center[0], hz.center[1], verticalExaggeration);
      const worldRadius = (hz.radius / 100) * SCENE_SIZE;

      const hzObj = new THREE.Group();
      hzObj.position.copy(pos);

      const colorHex = hazardColor(hz.type);

      // Warning curtain and perimeter band, both draped over the terrain
      const curtainGeo = buildDrapedBand(pos, worldRadius, worldRadius, 48, 0.05, 2.2, verticalExaggeration);
      const curtainMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      hzObj.add(new THREE.Mesh(curtainGeo, curtainMat));

      const bandGeo = buildDrapedBand(pos, worldRadius * 0.95, worldRadius, 48, 0.12, 0, verticalExaggeration);
      const bandMat = new THREE.MeshBasicMaterial({
        color: colorHex,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
      });
      hzObj.add(new THREE.Mesh(bandGeo, bandMat));

      group.add(hzObj);
    });
  }, [sceneInitialized, hazardZones, normToWorld, buildDrapedBand, verticalExaggeration]);

  /**
   * Build 3D Route Trajectories (Spline Tubes & Glowing Paths)
   * Guaranteed safe clearance above terrain so no section penetrates or clips into hills/ridges.
   * Completely resilient to layer updates, mode changes, and scene resets.
   */
  useEffect(() => {
    if (!sceneInitialized) return;
    const group = routesGroupRef.current;
    if (!group) return;

    clearThreeGroup(group);

    if (!selectedRoute) return;

    const renderRoute = (route: RouteCandidate, isSelected: boolean) => {
      try {
        if (!route || !route.waypoints || route.waypoints.length < 2) return;

        // Safe clearance height above terrain (generous so no hills or crater lips penetrate the line)
        const routeHoverHeight = (isSelected ? 1.45 : 1.15) * Math.max(1, verticalExaggeration * 0.65);
        const densePoints: THREE.Vector3[] = [];

        // Highest terrain within ~0.7 scene units of a point (covers the tube radius and steep side slopes),
        // so the route can never clip into a ridge that lies next to its centre line.
        const clearanceAt = (nx: number, ny: number): number => {
          let hMax = -Infinity;
          for (let dx = -0.7; dx <= 0.71; dx += 0.7) {
            for (let dy = -0.7; dy <= 0.71; dy += 0.7) {
              const h = getElevationAtNorm(Math.max(0, Math.min(100, nx + dx)), Math.max(0, Math.min(100, ny + dy)), verticalExaggeration);
              if (h > hMax) hMax = h;
            }
          }
          return hMax;
        };

        for (let i = 0; i < route.waypoints.length - 1; i++) {
          const wpA = route.waypoints[i];
          const wpB = route.waypoints[i + 1];
          const segDist = Math.hypot(wpB.x - wpA.x, wpB.y - wpA.y);
          const subSteps = Math.max(6, Math.ceil(segDist * 2.5)); // ~0.4 scene units between samples

          for (let s = 0; s < subSteps; s++) {
            const t = s / subSteps;
            const normX = wpA.x + (wpB.x - wpA.x) * t;
            const normY = wpA.y + (wpB.y - wpA.y) * t;

            const wx = (normX / 100) * SCENE_SIZE - HALF_SIZE;
            const wz = (normY / 100) * SCENE_SIZE - HALF_SIZE;
            const groundY = clearanceAt(normX, normY);
            const wy = groundY + routeHoverHeight;

            densePoints.push(new THREE.Vector3(wx, wy, wz));
          }
        }

        // Add the final waypoint point
        const lastWp = route.waypoints[route.waypoints.length - 1];
        const lastWx = (lastWp.x / 100) * SCENE_SIZE - HALF_SIZE;
        const lastWz = (lastWp.y / 100) * SCENE_SIZE - HALF_SIZE;
        const lastGroundY = clearanceAt(lastWp.x, lastWp.y);
        densePoints.push(new THREE.Vector3(lastWx, lastGroundY + routeHoverHeight, lastWz));

        // Deduplicate adjacent points to prevent CatmullRom singular matrix errors
        const cleanPoints: THREE.Vector3[] = [];
        for (const pt of densePoints) {
          if (cleanPoints.length === 0 || cleanPoints[cleanPoints.length - 1].distanceToSquared(pt) > 0.0001) {
            cleanPoints.push(pt);
          }
        }

        if (cleanPoints.length < 2) return;

        // Smooth the height profile without ever dropping below the required clearance
        for (let pass = 0; pass < 3; pass++) {
          const ys = cleanPoints.map(q => q.y);
          for (let k = 0; k < cleanPoints.length; k++) {
            let sum = 0, cnt = 0;
            for (let d = -3; d <= 3; d++) {
              const idx = k + d;
              if (idx >= 0 && idx < ys.length) { sum += ys[idx]; cnt++; }
            }
            cleanPoints[k].y = Math.max(ys[k], sum / cnt);
          }
        }

        // Build initial CatmullRom curve
        const initialCurve = new THREE.CatmullRomCurve3(cleanPoints, false, 'centripetal', 0.1);
        const sampleCount = Math.max(24, Math.min(cleanPoints.length * 2, 1500));
        const curvePoints = initialCurve.getSpacedPoints(sampleCount);

        // CRITICAL: Strictly inspect and clamp EVERY point on the curve to never dip into terrain
        for (let k = 0; k < curvePoints.length; k++) {
          const pt = curvePoints[k];
          const nx = Math.max(0, Math.min(100, ((pt.x + HALF_SIZE) / SCENE_SIZE) * 100));
          const nz = Math.max(0, Math.min(100, ((pt.z + HALF_SIZE) / SCENE_SIZE) * 100));
          const groundElevation = clearanceAt(nx, nz);
          const minAllowedY = groundElevation + routeHoverHeight;
          if (pt.y < minAllowedY) {
            pt.y = minAllowedY;
          }
        }

        const finalCurve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.1);
        const tubeRadius = isSelected ? 0.32 : 0.20;
        const tubeGeo = new THREE.TubeGeometry(
          finalCurve,
          curvePoints.length,
          tubeRadius,
          8,
          false
        );

        const tubeMat = new THREE.MeshStandardMaterial({
          color: route.color,
          emissive: route.color,
          emissiveIntensity: isSelected ? 0.95 : 0.45,
          roughness: 0.2,
          metalness: 0.7,
          transparent: true,
          opacity: isSelected ? 0.95 : 0.65,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -4
        });

        const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
        tubeMesh.castShadow = true;
        tubeMesh.userData = { route };
        group.add(tubeMesh);

        // Add Waypoint Nodes along selected route with Waypoint Name Badges
        if (isSelected) {
          route.waypoints.forEach(wp => {
            const elevY = getElevationAtNorm(wp.x, wp.y, verticalExaggeration);
            const wpPos = normToWorld(wp.x, wp.y, verticalExaggeration);
            wpPos.y = elevY + routeHoverHeight;

            const sphereGeo = new THREE.SphereGeometry(0.42, 16, 16);
            const sphereMat = new THREE.MeshStandardMaterial({
              color: '#ffffff',
              emissive: route.color,
              emissiveIntensity: 0.95
            });
            const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
            sphereMesh.position.copy(wpPos);
            group.add(sphereMesh);

            // Vertical ground rod connecting cleanly to surface
            const rodHeight = routeHoverHeight;
            const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, rodHeight, 8);
            rodGeo.translate(0, rodHeight / 2, 0);
            const rodMat = new THREE.MeshBasicMaterial({ color: route.color, transparent: true, opacity: 0.75 });
            const rodMesh = new THREE.Mesh(rodGeo, rodMat);
            rodMesh.position.set(wpPos.x, elevY, wpPos.z);
            group.add(rodMesh);

            // 3D Waypoint Location Name Badge
            const isKeyWp = wp.label === 'START' || wp.label === 'TARGET';
            const wpBadge = createTextBadgeSprite(wp.label.replace('WP-0', 'W').replace('WP-', 'W'), undefined, route.color, 'rgba(7, 11, 19, 0.90)', isKeyWp);
            wpBadge.scale.set(2.6, 0.8, 1);
            wpBadge.position.set(wpPos.x, wpPos.y + 1.45, wpPos.z);
            group.add(wpBadge);
          });
        }
      } catch (err) {
        console.error('Failed to render 3D route trajectory:', err);
      }
    };

    // Draw unselected candidate routes first
    if (showAltRoutes && Array.isArray(routes)) {
      routes.forEach(r => {
        if (r && selectedRoute && r.id !== selectedRoute.id) renderRoute(r, false);
      });
    }

    // Selected Route on top
    if (selectedRoute) {
      renderRoute(selectedRoute, true);
    }
  }, [sceneInitialized, routes, selectedRoute, showAltRoutes, normToWorld, getElevationAtNorm, verticalExaggeration]);

  /**
   * Build 3D Astronaut Rover Model & Follow-Cam Tracking
   * Correctly aligns the front of the rover (+Z) with the direction of travel.
   * Completely eliminates crooked tilt/roll: sits level and upright on terrain surface.
   */
  useEffect(() => {
    if (!sceneInitialized) return;
    const group = roverGroupRef.current;
    if (!group) return;

    clearThreeGroup(group);

    if (!astronautPos) return;

    // 1. Calculate travel heading vector from route waypoints
    let dirWorldX = 0;
    let dirWorldZ = -1; // Default facing north/upward

    if (selectedRoute && selectedRoute.waypoints.length >= 2) {
      const wps = selectedRoute.waypoints;
      let bestIdx = 0;
      let minDistanceSq = Infinity;
      // Find the route segment closest to astronaut's current position
      for (let i = 0; i < wps.length - 1; i++) {
        const wpA = wps[i];
        const wpB = wps[i + 1];
        const segDx = wpB.x - wpA.x;
        const segDy = wpB.y - wpA.y;
        const segLenSq = segDx * segDx + segDy * segDy;
        if (segLenSq > 0.00001) {
          const t = Math.max(0, Math.min(1, ((astronautPos[0] - wpA.x) * segDx + (astronautPos[1] - wpA.y) * segDy) / segLenSq));
          const projX = wpA.x + t * segDx;
          const projY = wpA.y + t * segDy;
          const dSq = (astronautPos[0] - projX) ** 2 + (astronautPos[1] - projY) ** 2;
          if (dSq < minDistanceSq) {
            minDistanceSq = dSq;
            bestIdx = i;
          }
        }
      }
      const curWp = wps[bestIdx];
      const nextWp = wps[bestIdx + 1];
      const normDx = nextWp.x - curWp.x;
      const normDy = nextWp.y - curWp.y;
      dirWorldX = (normDx / 100) * SCENE_SIZE;
      dirWorldZ = (normDy / 100) * SCENE_SIZE;
    }

    const headingAngle = (Math.hypot(dirWorldX, dirWorldZ) > 0.0001)
      ? Math.atan2(dirWorldX, dirWorldZ)
      : 0;

    const groundY = getElevationAtNorm(astronautPos[0], astronautPos[1], verticalExaggeration);
    const curWorldX = (astronautPos[0] / 100) * SCENE_SIZE - HALF_SIZE;
    const curWorldZ = (astronautPos[1] / 100) * SCENE_SIZE - HALF_SIZE;

    const roverObj = new THREE.Group();
    // Position cleanly on the ground (wheels touching surface)
    roverObj.position.set(curWorldX, groundY + 0.35, curWorldZ);
    // Keep rover completely level and upright on the terrain (zero sideways tilt/roll),
    // rotating purely in yaw so its front faces directly in the direction of travel!
    roverObj.rotation.set(0, headingAngle, 0);

    // Rover Chassis (Pressurized Exploration Vehicle)
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.7, 2.6);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: '#e25c2b', // Mars Orange
      roughness: 0.35,
      metalness: 0.6
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.position.y = 0.45;
    chassisMesh.castShadow = true;
    roverObj.add(chassisMesh);

    // Aerodynamic Sloped Cabin Windshield - Faces +Z (Front)
    const cabinGeo = new THREE.BoxGeometry(1.5, 0.6, 1.4);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: '#facc15', // Gold reflective EVA visor
      roughness: 0.1,
      metalness: 0.95
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.set(0, 0.95, 0.4);
    roverObj.add(cabinMesh);

    // Front Exploration Bull-Bar Bumper (+Z front)
    const bumperGeo = new THREE.BoxGeometry(1.9, 0.25, 0.2);
    const bumperMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.8 });
    const bumperMesh = new THREE.Mesh(bumperGeo, bumperMat);
    bumperMesh.position.set(0, 0.35, 1.35);
    roverObj.add(bumperMesh);

    // DUAL FRONT HEADLIGHTS (+Z) - Shining forward along travel direction
    const headlightGeo = new THREE.SphereGeometry(0.14, 12, 12);
    const headlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
    hlLeft.position.set(-0.65, 0.5, 1.35);
    roverObj.add(hlLeft);

    const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
    hlRight.position.set(0.65, 0.5, 1.35);
    roverObj.add(hlRight);

    // Forward Illuminating Light Beams (+Z)
    const beamConeGeo = new THREE.ConeGeometry(0.65, 3.8, 16, 1, true);
    beamConeGeo.rotateX(Math.PI / 2);
    beamConeGeo.translate(0, 0, 1.9);
    const beamConeMat = new THREE.MeshBasicMaterial({
      color: '#fef08a',
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beamL = new THREE.Mesh(beamConeGeo, beamConeMat);
    beamL.position.set(-0.65, 0.5, 1.35);
    roverObj.add(beamL);

    const beamR = new THREE.Mesh(beamConeGeo, beamConeMat);
    beamR.position.set(0.65, 0.5, 1.35);
    roverObj.add(beamR);

    // DUAL REAR RED TAIL-LIGHTS (-Z rear)
    const tailLightGeo = new THREE.BoxGeometry(0.2, 0.1, 0.05);
    const tailLightMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    const tailL = new THREE.Mesh(tailLightGeo, tailLightMat);
    tailL.position.set(-0.6, 0.5, -1.32);
    roverObj.add(tailL);

    const tailR = new THREE.Mesh(tailLightGeo, tailLightMat);
    tailR.position.set(0.6, 0.5, -1.32);
    roverObj.add(tailR);

    // 6 Articulated Heavy-Duty Rover Wheels (radius 0.35, bottoms touch ground at y=0)
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.32, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.9,
      metalness: 0.2
    });

    const wheelOffsets = [
      [-1.05, 0.0, -0.85], // Rear Left
      [1.05, 0.0, -0.85],  // Rear Right
      [-1.05, 0.0, 0.0],   // Mid Left
      [1.05, 0.0, 0.0],    // Mid Right
      [-1.05, 0.0, 0.85],  // Front Left
      [1.05, 0.0, 0.85]   // Front Right
    ];

    wheelOffsets.forEach(([wx, wy, wz]) => {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.position.set(wx, wy, wz);
      roverObj.add(wMesh);
    });

    // Rear High-Gain Communications Mast (-Z rear)
    const antGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.5, 8);
    antGeo.translate(0, 0.75, 0);
    const antMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8 });
    const antMesh = new THREE.Mesh(antGeo, antMat);
    antMesh.position.set(0.6, 0.8, -0.9);
    roverObj.add(antMesh);

    const antBeaconGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const antBeaconMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const antBeaconMesh = new THREE.Mesh(antBeaconGeo, antBeaconMat);
    antBeaconMesh.position.set(0.6, 2.3, -0.9);
    roverObj.add(antBeaconMesh);

    // Ground Tracking Halo Ring
    const haloGeo = new THREE.RingGeometry(2.2, 2.5, 32);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#e25c2b',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.position.y = -0.3;
    roverObj.add(haloMesh);

    // 3D Location Name Badge above Rover
    const roverBadge = createTextBadgeSprite('EVA', undefined, '#e25c2b', 'rgba(7, 11, 19, 0.94)', true);
    roverBadge.scale.set(3.4, 1.0, 1);
    roverBadge.position.set(0, 3.4, 0);
    roverObj.add(roverBadge);

    group.add(roverObj);

    // Follow-Cam logic
    if (cameraMode === 'FOLLOW' && controlsRef.current && cameraRef.current) {
      controlsRef.current.target.lerp(new THREE.Vector3(curWorldX, groundY + 1.2, curWorldZ), 0.1);
    }
  }, [sceneInitialized, astronautPos, selectedRoute, cameraMode, normToWorld, getElevationAtNorm, verticalExaggeration]);

  /**
   * Apply Camera Mode Presets
   */
  const handleApplyCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraMode(preset);
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    if (preset === 'ORBITAL') {
      camera.position.set(0, 55, 68);
      controls.target.set(0, 4, 0);
    } else if (preset === 'SURFACE') {
      // Positioned near Habitat Alpha, looking towards the crater and mountain ridge
      const habPos = normToWorld(HABITAT_ALPHA.x, HABITAT_ALPHA.y, verticalExaggeration);
      camera.position.set(habPos.x - 8, habPos.y + 3.5, habPos.z + 12);
      controls.target.set(0, 8, -5);
    } else if (preset === 'FOLLOW') {
      if (astronautPos) {
        const curPos = normToWorld(astronautPos[0], astronautPos[1], verticalExaggeration);
        camera.position.set(curPos.x - 12, curPos.y + 9, curPos.z + 15);
        controls.target.set(curPos.x, curPos.y + 1, curPos.z);
      }
    } else if (preset === 'VISOR') {
      // Camera is driven every frame by visorUpdateRef while this mode is active
      visorHeadingRef.current = Number.NaN;
    } else if (preset === 'NADIR') {
      // Top-Down Nadir 3D View
      camera.position.set(0, 92, 0.001);
      controls.target.set(0, 0, 0);
    }

    controls.update();
  }, [normToWorld, verticalExaggeration, astronautPos]);

  /**
   * Visor-HUD mode: camera 1.7 m above the terrain at the astronaut position, looking toward the next waypoint.
   * Rebuilt every render so the frame loop always sees the latest props.
   */
  const visorPos: [number, number] = astronautPos ?? startPoint;
  visorUpdateRef.current = cameraMode !== 'VISOR' ? null : () => {
    const cam = cameraRef.current;
    if (!cam) return;
    const pos = visorPos;
    const ahead = routeLookAhead(selectedRoute.waypoints, pos, 90);
    const aim: [number, number] = ahead ? ahead.point : targetPoint;
    const desired = distanceMeters(pos, aim) > 2 ? headingRadians(pos, aim) : ahead ? ahead.tangentRad : visorHeadingRef.current;
    visorHeadingRef.current = Number.isNaN(visorHeadingRef.current)
      ? (Number.isNaN(desired) ? 0 : desired)
      : (Number.isNaN(desired) ? visorHeadingRef.current : smoothHeading(visorHeadingRef.current, desired, 1 / 60));
    const heading = visorHeadingRef.current;
    const eye = EYE_HEIGHT_M * BASE_ELEV_SCALE * verticalExaggeration;
    const here = normToWorld(pos[0], pos[1], verticalExaggeration);
    const lookPct = pointAhead(pos, heading, 60);
    const there = normToWorld(lookPct[0], lookPct[1], verticalExaggeration);
    cam.position.set(here.x, here.y + eye, here.z);
    cam.lookAt(there.x, there.y + eye, there.z);

    visorTickRef.current++;
    if (visorTickRef.current % 6 === 0) {
      setVisorReadout(computeVisorReadout(pos, heading, targetPoint));
    }
  };

  useEffect(() => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    if (!cam || !controls) return;
    const visor = cameraMode === 'VISOR';
    cam.near = visor ? 0.05 : 0.5;
    cam.fov = visor ? 70 : 45;
    cam.updateProjectionMatrix();
    controls.enabled = !visor;
    if (roverGroupRef.current) roverGroupRef.current.visible = !visor;
    if (!visor) setVisorReadout(null);
  }, [cameraMode, sceneInitialized]);

  const visorProgress = Math.min(1, elapsedSec / Math.max(1, selectedRoute.totalDurationMin * 60));
  const visorMeanShield = useMemo(
    () => (cameraMode === 'VISOR' ? meanShieldingAlongRoute(selectedRoute.waypoints, Math.max(0.02, visorProgress)) : 1),
    // recompute only when the route or progress bucket changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cameraMode, selectedRoute, Math.round(visorProgress * 50)]
  );

  /**
   * Pan Camera across XZ ground plane relative to camera heading
   */
  const panCamera = useCallback((deltaX: number, deltaZ: number) => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.0001) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3()
      .addScaledVector(right, deltaX)
      .addScaledVector(forward, deltaZ);

    camera.position.add(move);
    controls.target.add(move);
    controls.update();
  }, []);

  /**
   * Orbit / Yaw Camera around current target point
   */
  const orbitCamera = useCallback((angleDelta: number) => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), angleDelta);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }, []);

  /**
   * Zoom Camera in or out
   */
  const zoomCamera = useCallback((zoomFactor: number) => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const currentDist = offset.length();
    const newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, currentDist * zoomFactor));
    offset.setLength(newDist);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }, []);

  /**
   * Global Keyboard Shortcuts for 3D Mars Navigation
   */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (activeEl as HTMLElement)?.isContentEditable) {
        return;
      }

      const panStep = 4.0;
      const rotateStep = Math.PI / 18; // 10 degrees

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          e.preventDefault();
          panCamera(0, panStep);
          break;
        case 'KeyS':
        case 'ArrowDown':
          e.preventDefault();
          panCamera(0, -panStep);
          break;
        case 'KeyA':
        case 'ArrowLeft':
          e.preventDefault();
          panCamera(-panStep, 0);
          break;
        case 'KeyD':
        case 'ArrowRight':
          e.preventDefault();
          panCamera(panStep, 0);
          break;
        case 'KeyQ':
          e.preventDefault();
          orbitCamera(-rotateStep);
          break;
        case 'KeyE':
          e.preventDefault();
          orbitCamera(rotateStep);
          break;
        case 'Digit5':
        case 'Numpad5':
        case 'KeyV':
          e.preventDefault();
          if (onOpenVisor) onOpenVisor(); else handleApplyCameraPreset('VISOR');
          break;
        case 'KeyR':
          e.preventDefault();
          handleApplyCameraPreset('ORBITAL');
          break;
        case 'Digit1':
        case 'Numpad1':
          e.preventDefault();
          handleApplyCameraPreset('ORBITAL');
          break;
        case 'Digit2':
        case 'Numpad2':
          e.preventDefault();
          handleApplyCameraPreset('SURFACE');
          break;
        case 'Digit3':
        case 'Numpad3':
          e.preventDefault();
          handleApplyCameraPreset('FOLLOW');
          break;
        case 'Digit4':
        case 'Numpad4':
          e.preventDefault();
          handleApplyCameraPreset('NADIR');
          break;
        case 'Equal':
        case 'NumpadAdd':
        case 'BracketRight':
          e.preventDefault();
          zoomCamera(0.85);
          break;
        case 'Minus':
        case 'NumpadSubtract':
        case 'BracketLeft':
          e.preventDefault();
          zoomCamera(1.18);
          break;
        case 'KeyL':
        case 'KeyT':
          e.preventDefault();
          setShowLocationLabels(v => !v);
          break;
        case 'KeyG':
          e.preventDefault();
          setShowGrid(v => !v);
          break;
        case 'KeyH':
        case 'Slash':
          if (e.key === '?' || e.code === 'KeyH') {
            e.preventDefault();
            setShowShortcutsModal(v => !v);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panCamera, orbitCamera, zoomCamera, handleApplyCameraPreset]);

  /**
   * Pointer interaction tracking:
   * Record pointer down location so dragging/orbiting the camera does NOT accidentally trigger a click!
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  /**
   * Mouse / Touch Click Raycaster for 3D Terrain, Beacons & Candidate Routes
   */
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDownPosRef.current) return;
    const dx = Math.abs(e.clientX - pointerDownPosRef.current.x);
    const dy = Math.abs(e.clientY - pointerDownPosRef.current.y);
    const dt = Date.now() - pointerDownPosRef.current.time;
    pointerDownPosRef.current = null;

    // If pointer moved more than 6px or press lasted > 600ms, user was Orbiting/Panning, NOT clicking!
    if (dx > 6 || dy > 6 || dt > 600) return;

    const container = mountRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    const terrain = terrainMeshRef.current;
    if (!container || !camera || !scene || !terrain) return;

    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

    // 1. Check Science Beacons First
    if (scienceBeaconsGroupRef.current) {
      const beaconHits = raycaster.intersectObjects(scienceBeaconsGroupRef.current.children, true);
      if (beaconHits.length > 0) {
        let hitObj: THREE.Object3D | null = beaconHits[0].object;
        while (hitObj && !hitObj.userData.target && hitObj.parent) {
          hitObj = hitObj.parent;
        }
        if (hitObj && hitObj.userData.target) {
          const target: ScienceTarget = hitObj.userData.target;
          onSelectScienceTarget(target);
          onSetTargetPoint([target.x, target.y]);
          return;
        }
      }
    }

    // 2. Check Candidate Routes (Allows clicking directly on a route in 3D to select it)
    if (routesGroupRef.current) {
      const routeHits = raycaster.intersectObjects(routesGroupRef.current.children, true);
      if (routeHits.length > 0) {
        let hitObj: THREE.Object3D | null = routeHits[0].object;
        while (hitObj && !hitObj.userData.route && hitObj.parent) {
          hitObj = hitObj.parent;
        }
        if (hitObj && hitObj.userData.route) {
          if (onSelectRoute) {
            onSelectRoute(hitObj.userData.route);
          }
          return;
        }
      }
    }

    // 3. Terrain Click -> Surface Coordinates & Inspection
    const terrainHits = raycaster.intersectObject(terrain);
    if (terrainHits.length > 0) {
      const hit = terrainHits[0];
      const point = hit.point;

      // Position reticle
      if (targetReticleRef.current) {
        targetReticleRef.current.position.set(point.x, point.y + 0.1, point.z);
        targetReticleRef.current.visible = true;
      }

      // Map back to 0..100 normalized coords
      const normX = ((point.x + HALF_SIZE) / SCENE_SIZE) * 100;
      const normY = ((point.z + HALF_SIZE) / SCENE_SIZE) * 100;

      const c = Math.min(GRID_COLS - 1, Math.max(0, Math.floor((normX / 100) * GRID_COLS)));
      const r = Math.min(GRID_ROWS - 1, Math.max(0, Math.floor((normY / 100) * GRID_ROWS)));

      const coords = gridToCoordinates(normX, normY);
      const elev = ARCADIA_ELEVATION_GRID[r][c];
      const slope = ARCADIA_SLOPE_GRID[r][c];
      const hazardScore = ARCADIA_HAZARD_GRID[r][c];
      const ice = ARCADIA_ICE_GRID[r][c];
      const comms = ARCADIA_COMMS_GRID[r][c];

      const hazardNear = hazardZones.find(hz => Math.hypot(hz.center[0] - normX, hz.center[1] - normY) < hz.radius + 2);
      const nearSci = scienceTargets.find(st => Math.hypot(st.x - normX, st.y - normY) < 6);

      const cellInfo: CellInspectionInfo = {
        x: Math.round(normX),
        y: Math.round(normY),
        lat: coords.lat,
        lon: coords.lon,
        elevation: elev,
        slope,
        hazardScore,
        iceConfidence: ice,
        commsPct: comms,
        nearScience: nearSci,
        hazardNear
      };

      setInspectedCell(cellInfo);
      if (onInspectPixel) onInspectPixel(cellInfo);
    }
  };

  /**
   * Pointer Move -> Hover over science targets
   */
  const handleCanvasPointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera || !scienceBeaconsGroupRef.current) return;

    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

    const beaconHits = raycaster.intersectObjects(scienceBeaconsGroupRef.current.children, true);
    if (beaconHits.length > 0) {
      let hitObj: THREE.Object3D | null = beaconHits[0].object;
      while (hitObj && !hitObj.userData.target && hitObj.parent) {
        hitObj = hitObj.parent;
      }
      if (hitObj && hitObj.userData.target) {
        setHoveredBeacon(hitObj.userData.target);
        return;
      }
    }
    setHoveredBeacon(null);
  };

  return (
    <div className="@container relative w-full h-full bg-[#05070b] overflow-hidden select-none">
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handleCanvasPointerMove}
        className="w-full h-full cursor-crosshair block"
      />

      {/* 3D Interactive Screen-Space Location Names Overlay */}
      {showLocationLabels && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
          {projectedPins.map(pin => (
            <div
              key={pin.id}
              style={{
                transform: `translate3d(${pin.screenX}px, ${pin.screenY}px, 0) translate(-50%, -50%)`,
              }}
              className="absolute top-0 left-0 select-none"
            >
              <div className="group relative flex flex-col items-center pointer-events-auto" style={{ width: 20, height: 20 }}>
                {/* Name card: only while the pointer is over the marker */}
                <div
                  className="hidden group-hover:block absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-30"
                >
                  <div
                    onClick={pin.onClick}
                    className={`px-2.5 py-1 rounded backdrop-blur-md shadow-2xl border whitespace-nowrap ${
                      pin.isPrimary ? 'bg-[#0f172a]/95 border-[#facc15]' : 'bg-[#070b13]/95 border-[#334155]'
                    } ${pin.onClick ? 'cursor-pointer' : ''}`}
                  >
                    <div className={`text-[12px] font-semibold ${pin.isPrimary ? 'text-[#facc15]' : 'text-white'}`}>{pin.name}</div>
                    {pin.subtitle && <div className="text-[11px]" style={{ color: pin.color }}>{pin.subtitle}</div>}
                  </div>
                </div>
                {/* Small marker */}
                <div
                  onClick={pin.onClick}
                  className={`m-auto w-3 h-3 rounded-full border-2 ${pin.onClick ? 'cursor-pointer' : ''} ${pin.isPrimary ? 'border-[#facc15]' : 'border-white/80'}`}
                  style={{ backgroundColor: pin.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Astronaut visor HUD (first-person EVA mode) */}
      {cameraMode === 'VISOR' && visorReadout && (
        <VisorHud
          readout={visorReadout}
          cumulativeDoseMicroSv={RAD_BASELINE_MICROSV_H * visorMeanShield * (elapsedSec / 3600)}
          evaRemainingMin={evaLimitMin - elapsedSec / 60}
          evaLimitMin={evaLimitMin}
          o2Pct={astronautTelemetry?.suitO2RemainingPct}
          batteryPct={astronautTelemetry?.suitBatteryRemainingPct}
          atRouteEnd={distanceToEnd(visorPos, selectedRoute) < 40}
          elevationSource={ELEVATION_SOURCE}
          onExit={() => handleApplyCameraPreset('ORBITAL')}
        />
      )}

      {/* Top Left: 3D Mission Zone HUD */}
      <div className="absolute top-3 left-3 bg-[#070b13]/90 backdrop-blur-md border border-[#1e293b] px-2.5 sm:px-3.5 py-1.5 sm:py-2.5 rounded shadow-2xl hidden @[1000px]:flex items-center gap-2 sm:gap-3 z-20">
        <div className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#e25c2b] animate-ping shrink-0" />
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-[9px] sm:text-[10px] text-gray-400 font-mono tracking-wider">3D Mars simulator</span>
            <span className="text-[8px] sm:text-[9px] font-mono text-[#38bdf8] bg-[#38bdf8]/10 border border-[#38bdf8]/30 px-1 sm:px-1.5 py-0.2 rounded">
              PBR DEM
            </span>
          </div>
          <div className="text-[11px] sm:text-xs font-semibold text-white tracking-wide font-sans hidden sm:block">
            Arcadia Planitia (39.3°N, 171.4°W)
          </div>
        </div>
      </div>

      {/* Top Right: Mode Switcher & 3D Controls Bar */}
      <div className="absolute top-3 right-3 flex items-center gap-1 sm:gap-1.5 bg-[#070b13]/90 backdrop-blur-md border border-[#1e293b] p-1 sm:p-1.5 rounded shadow-2xl z-20 max-w-[calc(100%-1.5rem)] overflow-x-auto no-scrollbar">
        {/* Switch between 3D and 2D */}
        <div className="flex items-center bg-[#0d131f] border border-[#1e293b] rounded p-0.5 mr-0.5 sm:mr-1 text-[10px] sm:text-[11px] font-mono shrink-0">
          <button
            onClick={() => {}}
            className="px-2 sm:px-2.5 py-1 bg-[#e25c2b] text-white font-semibold rounded shadow transition"
          >
            3D surface
          </button>
          {onSwitchTo2D && (
            <button
              onClick={onSwitchTo2D}
              className="px-2 sm:px-2.5 py-1 text-gray-400 hover:text-white rounded transition hover:bg-[#1a2333]"
              title="Switch to 2D Topographical Map View"
            >
              2D map
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

        {/* Camera Preset Buttons */}
        <button
          onClick={() => handleApplyCameraPreset('ORBITAL')}
          title="Orbital Reconnaissance View (45° Isometric) [1 / R]"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition flex items-center gap-1 shrink-0 ${
            cameraMode === 'ORBITAL'
              ? 'bg-white/10 text-white'
              : 'text-gray-300 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Orbit</span>
        </button>

        <button
          onClick={() => handleApplyCameraPreset('SURFACE')}
          title="Surface Ground View (Astronaut POV) [2]"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition flex items-center gap-1 shrink-0 ${
            cameraMode === 'SURFACE'
              ? 'bg-white/10 text-white'
              : 'text-gray-300 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Horizon</span>
        </button>

        <button
          onClick={() => handleApplyCameraPreset('FOLLOW')}
          title="Lock Camera on Active Astronaut Rover [3]"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition flex items-center gap-1 shrink-0 ${
            cameraMode === 'FOLLOW'
              ? 'bg-[#e25c2b]/25 text-[#e25c2b] border border-[#e25c2b]/50'
              : 'text-gray-300 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Follow</span>
        </button>

        <button
          onClick={() => handleApplyCameraPreset('NADIR')}
          title="Nadir Overhead Top-Down View [4]"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition shrink-0 ${
            cameraMode === 'NADIR'
              ? 'bg-white/10 text-white'
              : 'text-gray-300 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          Nadir
        </button>

        <button
          onClick={() => (onOpenVisor ? onOpenVisor() : handleApplyCameraPreset('VISOR'))}
          title="Astronaut Visor-HUD: first-person view 1.7 m above the terrain along the active EVA route [5 / V]"
          data-testid="visor-toggle"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition shrink-0 ${
            cameraMode === 'VISOR'
              ? 'bg-cyan-400/20 text-cyan-300 border border-cyan-400/50'
              : 'text-gray-300 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          Visor
        </button>

        <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

        {/* Location Names & Labels Toggle */}
        <button
          onClick={() => setShowLocationLabels(v => !v)}
          title="Toggle 3D Location Names & Target Badges [T / L]"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition flex items-center gap-1 shrink-0 ${
            showLocationLabels
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          <span>Tags:</span>
          <span className="font-bold">{showLocationLabels ? 'ON' : 'OFF'}</span>
        </button>

        <div className="w-px h-5 bg-gray-700 mx-0.5 shrink-0" />

        {/* On-Screen Touch / D-pad Navigation Pad Toggle */}
        <button
          onClick={() => setShowNavPad(v => !v)}
          title="Toggle On-Screen Navigation Pad (Ideal for Mobile & Touch)"
          className={`px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-mono rounded transition flex items-center gap-1 shrink-0 ${
            showNavPad
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white hover:bg-[#1a2333]'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">D-pad</span>
        </button>

        {/* Keyboard Shortcuts Button */}
        <button
          onClick={() => setShowShortcutsModal(true)}
          title="View 3D Navigation Shortcuts & Mobile Gestures [? / H]"
          className="px-1.5 sm:px-2 py-1 bg-[#18202f] hover:bg-[#222d42] border border-[#2a364f] text-[#38bdf8] text-[11px] sm:text-xs font-mono rounded transition flex items-center gap-1 shrink-0 cursor-pointer"
        >
          <Keyboard className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span className="hidden md:inline">Shortcuts</span>
        </button>

        {/* 3D Parameters Dropdown Toggle */}
        <button
          onClick={() => setIsControlsMenuOpen(v => !v)}
          title="Adjust 3D Terrain & Visual Parameters"
          className={`p-1.5 rounded transition shrink-0 ${isControlsMenuOpen ? 'bg-[#38bdf8]/20 text-[#38bdf8]' : 'text-gray-300 hover:text-white hover:bg-[#1a2333]'}`}
        >
          <Sliders className="w-3.5 h-3.5" />
        </button>

        {/* Reset Camera Button */}
        <button
          onClick={() => handleApplyCameraPreset('ORBITAL')}
          title="Reset 3D View [R]"
          className="p-1.5 hover:bg-[#1a2333] text-gray-300 hover:text-white rounded transition shrink-0"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3D Terrain Settings Popover */}
      {isControlsMenuOpen && (
        <div className="absolute top-14 right-3 bg-[#0a0f18]/95 backdrop-blur-md border border-[#1e293b] p-3.5 rounded shadow-2xl w-64 text-xs font-mono z-30">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-3">
            <span className="text-white font-semibold flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#38bdf8]" />
              3D VIEWPORT SETTINGS
            </span>
            <button
              onClick={() => setIsControlsMenuOpen(false)}
              className="text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3.5">
            {/* Vertical Exaggeration Slider */}
            <div>
              <div className="flex justify-between text-gray-400 text-[11px] mb-1">
                <span>Vertical exaggeration:</span>
                <span className="text-[#38bdf8] font-bold">{verticalExaggeration.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.5"
                step="0.1"
                value={verticalExaggeration}
                onChange={e => setVerticalExaggeration(parseFloat(e.target.value))}
                className="w-full accent-[#38bdf8] h-1.5 bg-gray-800 rounded cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-500 mt-0.5">
                <span>1.0x (True Scale)</span>
                <span>3.5x (High Relief)</span>
              </div>
            </div>

            <div className="w-full h-px bg-gray-800" />

            {/* Visual Feature Toggles */}
            <div className="space-y-2 text-[11px]">
              <label className="flex items-center justify-between cursor-pointer text-gray-300 hover:text-white">
                <span>Show Aerocentric Grid</span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={e => setShowGrid(e.target.checked)}
                  className="accent-[#38bdf8] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer text-gray-300 hover:text-white">
                <span>Show MOLA Elevation Contours</span>
                <input
                  type="checkbox"
                  checked={showContours}
                  onChange={e => setShowContours(e.target.checked)}
                  className="accent-[#38bdf8] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer text-gray-300 hover:text-white">
                <span>Show Location Name Tags</span>
                <input
                  type="checkbox"
                  checked={showLocationLabels}
                  onChange={e => setShowLocationLabels(e.target.checked)}
                  className="accent-[#38bdf8] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer text-gray-300 hover:text-white">
                <span>Show Alternative Routes</span>
                <input
                  type="checkbox"
                  checked={showAltRoutes}
                  onChange={e => setShowAltRoutes(e.target.checked)}
                  className="accent-[#a855f7] cursor-pointer"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      <AstronautHint started={elapsedSec > 0} onOpen={() => (onOpenVisor ? onOpenVisor() : handleApplyCameraPreset('VISOR'))} />
      <MapLegend low={[158, 72, 52]} high={[210, 110, 80]} className="absolute top-20 left-10 z-20" />

      {/* Bottom Left: 3D True North Compass & Scale Bar */}
      <div className="absolute bottom-3 left-3 bg-[#070b13]/90 backdrop-blur-md border border-[#1e293b] px-3.5 py-2.5 rounded shadow-2xl flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-[#38bdf8]">
          <div
            className="w-5 h-5 rounded-full border border-[#38bdf8]/50 flex items-center justify-center transition-transform"
            style={{ transform: `rotate(${-compassBearing}deg)` }}
          >
            <Compass className="w-4 h-4 text-[#38bdf8]" />
          </div>
          <div>
            <div className="text-[9px] text-gray-400">Bearing</div>
            <div className="font-bold">{((compassBearing + 360) % 360).toFixed(0)}° AZ</div>
          </div>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        <div>
          <div className="text-[9px] text-gray-400 font-mono">Scale 3D</div>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-gradient-to-r from-white via-gray-400 to-white border border-gray-600 rounded-sm" />
            <span className="text-[10px] font-mono text-gray-300">1.0 KM</span>
          </div>
        </div>

        {dustStormActive && (
          <>
            <div className="w-px h-6 bg-gray-700" />
            <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[10px]">
              <Wind className="w-3.5 h-3.5 animate-pulse text-amber-400" />
              <span>Dust active</span>
            </div>
          </>
        )}
      </div>

      {/* Hovered Science Target Beacon Card */}
      {hoveredBeacon && !inspectedCell && (
        <div className="absolute bottom-16 left-3 bg-[#0a0f18]/95 backdrop-blur-md border border-[#10b981]/50 px-3 py-2 rounded shadow-2xl text-xs font-mono flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-ping" />
          <div>
            <div className="text-white font-semibold">{hoveredBeacon.id}: {hoveredBeacon.name}</div>
            <div className="text-gray-400 text-[10px]">{targetKindLabel(hoveredBeacon)} · candidate</div>
          </div>
        </div>
      )}

      {/* Inspected 3D Surface Cell HUD */}
      {inspectedCell && (
        <div className="absolute bottom-3 right-3 bg-[#070b13]/95 backdrop-blur-md border border-[#38bdf8]/50 p-3.5 rounded shadow-2xl max-w-xs text-xs font-mono z-30">
          <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
            <div className="flex items-center gap-1.5 text-[#38bdf8] font-semibold">
              <Crosshair className="w-3.5 h-3.5" />
              <span>3D terrain inspector</span>
            </div>
            <button
              onClick={() => {
                setInspectedCell(null);
                if (targetReticleRef.current) targetReticleRef.current.visible = false;
              }}
              className="text-gray-500 hover:text-white text-xs font-mono"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-2">
            <div>
              <span className="text-gray-400">LAT:</span>{' '}
              <span className="text-white font-semibold">{inspectedCell.lat.toFixed(3)}°N</span>
            </div>
            <div>
              <span className="text-gray-400">LON:</span>{' '}
              <span className="text-white font-semibold">{inspectedCell.lon.toFixed(3)}°W</span>
            </div>
            <div>
              <span className="text-gray-400">Elev:</span>{' '}
              <span className="text-[#38bdf8] font-semibold">{Math.round(inspectedCell.elevation)} m</span>
            </div>
            <div>
              <span className="text-gray-400">Slope:</span>{' '}
              <span className={`font-semibold ${inspectedCell.slope > 20 ? 'text-red-400' : inspectedCell.slope > 12 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {inspectedCell.slope.toFixed(1)}°
              </span>
            </div>
            <div>
              <span className="text-gray-400">{ICE_IS_REAL_SWIM ? 'SWIM ICE INDEX (x100):' : 'ICE PROB:'}</span>{' '}
              <span className="text-[#06b6d4] font-semibold">{Number(inspectedCell.iceConfidence).toFixed(1)}%</span>
            </div>
            <div>
              <span className="text-gray-400">Comms:</span>{' '}
              <span className="text-white font-semibold">{inspectedCell.commsPct}%</span>
            </div>
          </div>

          <CellSourceTable />

          {inspectedCell.hazardNear && (
            <div className="text-[10px] text-red-300 bg-red-950/40 border border-red-800/40 p-1.5 rounded mb-2 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
              <span>{inspectedCell.hazardNear.name}: {inspectedCell.hazardNear.description}</span>
            </div>
          )}

          {inspectedCell.nearScience && (
            <div className="text-[10px] text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 p-1.5 rounded mb-2 flex items-start gap-1">
              <Sparkles className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
              <span>Nearby: {inspectedCell.nearScience.id} ({inspectedCell.nearScience.name})</span>
            </div>
          )}

          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => {
                onSetTargetPoint([inspectedCell.x, inspectedCell.y]);
                setInspectedCell(null);
                if (targetReticleRef.current) targetReticleRef.current.visible = false;
              }}
              className="flex-1 bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 border border-[#38bdf8]/50 text-[#38bdf8] text-[10px] py-1 rounded transition text-center"
            >
              Set destination
            </button>
            <button
              onClick={() => {
                onSetStartPoint([inspectedCell.x, inspectedCell.y]);
                setInspectedCell(null);
                if (targetReticleRef.current) targetReticleRef.current.visible = false;
              }}
              className="flex-1 bg-[#e25c2b]/20 hover:bg-[#e25c2b]/30 border border-[#e25c2b]/50 text-[#e25c2b] text-[10px] py-1 rounded transition text-center"
            >
              Set start
            </button>
          </div>
        </div>
      )}

      {/* 3D Virtual Navigation D-Pad & Control Hub (Mobile & Desktop) */}
      <div className="absolute bottom-16 sm:bottom-4 right-3 z-20 select-none flex flex-col items-end gap-1.5 pointer-events-auto">
        {showNavPad ? (
          <div className="bg-[#070b13]/92 backdrop-blur-md border border-[#1e293b] p-2 sm:p-2.5 rounded-xl shadow-2xl flex flex-col items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
            {/* Header with Title & Minimize */}
            <div className="w-full flex items-center justify-between text-[10px] font-mono text-gray-400 border-b border-gray-800 pb-1 mb-1">
              <span className="flex items-center gap-1 text-[#38bdf8] font-bold">
                <Gamepad2 className="w-3 h-3" />
                <span>3D nav pad</span>
              </span>
              <button
                onClick={() => setShowNavPad(false)}
                className="text-gray-500 hover:text-white px-1"
                title="Minimize Nav Pad"
              >
                ✕
              </button>
            </div>

            {/* Virtual D-pad (Pan & Center) */}
            <div className="grid grid-cols-3 gap-1 w-28 h-28 place-items-center bg-[#05070c]/80 p-1.5 rounded-lg border border-[#18202f]">
              <div />
              <button
                onClick={() => panCamera(0, 4)}
                title="Pan Forward [W / Up]"
                className="w-8 h-8 rounded bg-[#161e2c] hover:bg-[#202b3f] active:bg-[#e25c2b] active:scale-95 text-gray-200 hover:text-white flex items-center justify-center transition border border-[#243147] shadow"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <div />

              <button
                onClick={() => panCamera(-4, 0)}
                title="Pan Left [A / Left]"
                className="w-8 h-8 rounded bg-[#161e2c] hover:bg-[#202b3f] active:bg-[#e25c2b] active:scale-95 text-gray-200 hover:text-white flex items-center justify-center transition border border-[#243147] shadow"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleApplyCameraPreset('ORBITAL')}
                title="Reset View [R]"
                className="w-8 h-8 rounded bg-[#1f293d] hover:bg-[#2a3854] active:bg-[#38bdf8] active:scale-95 text-[#38bdf8] hover:text-white flex items-center justify-center transition border border-[#3b4b6b] text-[10px] font-bold font-mono"
              >
                R
              </button>
              <button
                onClick={() => panCamera(4, 0)}
                title="Pan Right [D / Right]"
                className="w-8 h-8 rounded bg-[#161e2c] hover:bg-[#202b3f] active:bg-[#e25c2b] active:scale-95 text-gray-200 hover:text-white flex items-center justify-center transition border border-[#243147] shadow"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div />
              <button
                onClick={() => panCamera(0, -4)}
                title="Pan Backward [S / Down]"
                className="w-8 h-8 rounded bg-[#161e2c] hover:bg-[#202b3f] active:bg-[#e25c2b] active:scale-95 text-gray-200 hover:text-white flex items-center justify-center transition border border-[#243147] shadow"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <div />
            </div>

            {/* Orbit & Zoom Toolbar */}
            <div className="grid grid-cols-4 gap-1 w-full pt-1">
              <button
                onClick={() => orbitCamera(-Math.PI / 18)}
                title="Orbit Left [Q]"
                className="p-1.5 rounded bg-[#121824] hover:bg-[#1c2638] active:bg-[#38bdf8] active:scale-90 text-gray-300 hover:text-white flex items-center justify-center border border-[#1e293b]"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => orbitCamera(Math.PI / 18)}
                title="Orbit Right [E]"
                className="p-1.5 rounded bg-[#121824] hover:bg-[#1c2638] active:bg-[#38bdf8] active:scale-90 text-gray-300 hover:text-white flex items-center justify-center border border-[#1e293b]"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => zoomCamera(0.85)}
                title="Zoom In [+]"
                className="p-1.5 rounded bg-[#121824] hover:bg-[#1c2638] active:bg-[#10b981] active:scale-90 text-gray-300 hover:text-white flex items-center justify-center border border-[#1e293b]"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => zoomCamera(1.18)}
                title="Zoom Out [-]"
                className="p-1.5 rounded bg-[#121824] hover:bg-[#1c2638] active:bg-[#10b981] active:scale-90 text-gray-300 hover:text-white flex items-center justify-center border border-[#1e293b]"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Secondary Actions: Follow & Shortcuts */}
            <div className="flex items-center gap-1 w-full pt-0.5">
              <button
                onClick={() => handleApplyCameraPreset('FOLLOW')}
                className="flex-1 py-1 px-1.5 rounded bg-[#e25c2b]/20 hover:bg-[#e25c2b]/30 active:scale-95 text-[#e25c2b] text-[10px] font-mono flex items-center justify-center gap-1 border border-[#e25c2b]/40"
                title="Focus & Follow Rover [3]"
              >
                <Radio className="w-3 h-3" />
                <span>Follow</span>
              </button>
              <button
                onClick={() => setShowShortcutsModal(true)}
                className="py-1 px-2 rounded bg-[#18202f] hover:bg-[#222d42] active:scale-95 text-[#38bdf8] text-[10px] font-mono flex items-center justify-center border border-[#2c3954]"
                title="Shortcuts Guide [?]"
              >
                <Keyboard className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNavPad(true)}
            className="p-2 rounded-xl bg-[#0a0f18]/90 hover:bg-[#161f30] border border-[#223048] text-[#38bdf8] shadow-2xl flex items-center gap-1.5 text-xs font-mono transition"
            title="Open 3D Navigation Controls Pad"
          >
            <Gamepad2 className="w-4 h-4 text-[#38bdf8]" />
            <span className="hidden sm:inline">3D nav</span>
          </button>
        )}
      </div>

      {/* 3D Navigation Shortcuts & Mobile Gestures Modal */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 select-text animate-in fade-in duration-200">
          <div className="bg-[#0a0e17] border border-[#222d42] rounded-xl shadow-2xl max-w-xl w-full p-4 sm:p-6 text-xs font-mono max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-800 pb-3 mb-4">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Keyboard className="w-4 h-4 text-[#38bdf8]" />
                <span>3D HARİTA GEZİNME KISAYOLLARI & KONTROLLERİ</span>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800"
              >
                ✕
              </button>
            </div>

            {/* Content Sections */}
            <div className="space-y-4">
              {/* 1. Keyboard Shortcuts */}
              <div>
                <div className="text-[11px] font-bold text-[#e25c2b] flex items-center gap-1.5 mb-2">
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Klavye kisayollari (keyboard shortcuts)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">İleri / Geri Kaydır</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">W / S · ↑ / ↓</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Sola / Sağa Kaydır</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">A / D · ← / →</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Yörünge Dönüşü (Yaw)</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">Q / E</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Yakınlaş / Uzaklaş</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">+ / − · [ / ]</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Kamera Açıları</span>
                    <span className="text-[#e25c2b] font-bold bg-[#291712] px-2 py-0.5 rounded border border-[#4a241b]">1 · 2 · 3 · 4</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Görünümü Sıfırla</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">R</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Konum İsimleri (Tags)</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">T / L</span>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333] flex items-center justify-between">
                    <span className="text-gray-300">Koordinat Izgarası</span>
                    <span className="text-[#38bdf8] font-bold bg-[#162033] px-2 py-0.5 rounded border border-[#25334e]">G</span>
                  </div>
                </div>
              </div>

              {/* 2. Touch & Mobile Gestures */}
              <div>
                <div className="text-[11px] font-bold text-[#10b981] flex items-center gap-1.5 mb-2">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>MOBİL & DOKUNMATİK HAREKETLER (TOUCH GESTURES)</span>
                </div>
                <div className="space-y-1.5 text-[11px] bg-[#0d131f] p-3 rounded border border-[#1a2333]">
                  <div className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold shrink-0">1 Parmak Kaydır:</span>
                    <span className="text-gray-300">Mars arazisini serbestçe 360° yörüngede döndürün.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold shrink-0">2 Parmak Sıkıştır (Pinch):</span>
                    <span className="text-gray-300">Yakınlaşın veya tüm havzayı görmek için uzaklaşın.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 font-bold shrink-0">2 Parmak Kaydır (Drag):</span>
                    <span className="text-gray-300">Harita düzlemini sağa, sola, ileri veya geri kaydırın.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-rose-400 font-bold shrink-0">1 Parmak Dokun:</span>
                    <span className="text-gray-300">Bilim noktalarını seçin veya MOLA arazi yükseklik/eğim verilerini inceleyin.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-[#38bdf8] font-bold shrink-0">Ekran D-Pad:</span>
                    <span className="text-gray-300">Klavyeniz olmadığında sağ alttaki sanal D-Pad ile tek dokunuşla kaydırıp döndürün.</span>
                  </div>
                </div>
              </div>

              {/* 3. Mouse Controls */}
              <div>
                <div className="text-[11px] font-bold text-[#38bdf8] flex items-center gap-1.5 mb-2">
                  <Move className="w-3.5 h-3.5" />
                  <span>FARE KONTROLLERİ (MOUSE CONTROLS)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333]">
                    <div className="text-white font-bold mb-0.5">Sol Tık + Sürükle</div>
                    <div className="text-gray-400 text-[10px]">3D Kamerayı Döndür (Orbit)</div>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333]">
                    <div className="text-white font-bold mb-0.5">Sağ Tık + Sürükle</div>
                    <div className="text-gray-400 text-[10px]">Arazide Kaydır (Pan)</div>
                  </div>
                  <div className="bg-[#0d131f] p-2 rounded border border-[#1a2333]">
                    <div className="text-white font-bold mb-0.5">Tekerlek (Scroll)</div>
                    <div className="text-gray-400 text-[10px]">Yakınlaş / Uzaklaş (Zoom)</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-5 pt-3 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="px-4 py-2 bg-[#e25c2b] hover:bg-[#d14f20] text-white font-bold rounded text-xs transition cursor-pointer shadow"
              >
                Anladim, kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
