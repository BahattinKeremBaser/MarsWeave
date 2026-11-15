/**
 * MARSWEAVE — Mars 2D Geospatial Cartography Viewport
 * Professional Canvas2D planetary surface renderer.
 * Features true aerocentric coordinates, MOLA digital elevation model,
 * hillshading, contour lines, multi-spectral NASA layer overlays,
 * route rendering, animated astronaut telemetry, drag-to-pan, and interactive cell inspection.
 */

import { CellSourceTable } from './CellSourceTable';
import MapLegend from './MapLegend';
import AstronautHint from './AstronautHint';
import React, { useRef, useEffect, useState, useCallback } from 'react';
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
  shortTargetLabel,
  targetColor,
  hazardColor,
  withAlpha,
  TERRAIN_CLASSES,
  TERRAIN_CLASS_GRID,
  TERRAIN_REGIONS,
  REAL_THEMIS_GRID,
  REAL_ALBEDO_GRID,
  REAL_CRISM_GRID
} from '../../data/arcadiaData';
import { gridToCoordinates } from '../../engine/routeOptimizer';
import { CellInspectionInfo } from './MarsMapCanvas';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Compass,
  Layers,
  MapPin,
  Crosshair,
  AlertTriangle,
  Info,
  Radio,
  Eye,
  LocateFixed
} from 'lucide-react';

interface Mars2DViewportProps {
  layers: LayerMetadata[];
  routes: RouteCandidate[];
  selectedRoute: RouteCandidate;
  scienceTargets: ScienceTarget[];
  hazardZones: HazardZone[];
  startPoint: [number, number];
  targetPoint: [number, number];
  astronautPos?: [number, number];
  astronautTelemetry?: AstronautTelemetry;
  dustStormActive?: boolean;
  onSelectRoute?: (route: RouteCandidate) => void;
  onSelectScienceTarget: (target: ScienceTarget) => void;
  onSetTargetPoint: (point: [number, number]) => void;
  onSetStartPoint: (point: [number, number]) => void;
  onInspectPixel?: (info: CellInspectionInfo | null) => void;
  onSwitchTo3D?: () => void;
  onSwitchToVisor?: () => void;
  /** Easy mode: hide the expert overlay toggles and the 3D switch. */
  simple?: boolean;
}

/** 2nd-98th percentile range of a grid, for colour scaling of real product maps. */
function robustRange(g?: number[][]): [number, number] {
  if (!g) return [0, 1];
  const v = g.flat().sort((a, b) => a - b);
  return [v[Math.floor(v.length * 0.02)], v[Math.floor(v.length * 0.98)] || 1];
}
const THEMIS_RANGE = robustRange(REAL_THEMIS_GRID);
const ALBEDO_RANGE = robustRange(REAL_ALBEDO_GRID);
const CRISM_RANGE = robustRange(REAL_CRISM_GRID);
const norm01 = (v: number, [lo, hi]: [number, number]) => Math.max(0, Math.min(1, (v - lo) / Math.max(1e-9, hi - lo)));

export const Mars2DViewport: React.FC<Mars2DViewportProps> = ({
  simple,
  onSwitchToVisor,
  layers,
  routes,
  selectedRoute,
  scienceTargets,
  hazardZones,
  startPoint,
  targetPoint,
  astronautPos,
  astronautTelemetry,
  dustStormActive,
  onSelectRoute,
  onSelectScienceTarget,
  onSetTargetPoint,
  onSetStartPoint,
  onInspectPixel,
  onSwitchTo3D
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Viewport transformation state
  const [zoom, setZoom] = useState<number>(1.15);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragDistRef = useRef<number>(0);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [hoveredTarget, setHoveredTarget] = useState<ScienceTarget | null>(null);
  const [inspectedCell, setInspectedCell] = useState<CellInspectionInfo | null>(null);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(true);
  const [showContours, setShowContours] = useState<boolean>(true);
  const [showRegions, setShowRegions] = useState<boolean>(false);
  const [showAllRoutes, setShowAllRoutes] = useState<boolean>(true);

  // Animation phase for pulsing beacons and storm front
  const animPhaseRef = useRef<number>(0);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null); // 1 pixel per DEM cell, scaled up smoothly

  // Helper to check layer visibility and opacity
  const getLayer = (id: string): LayerMetadata | undefined => layers.find(l => l.id === id);

  /**
   * Screen coords to Normalized Mars Surface coords (0..100)
   */
  const screenToNorm = useCallback((screenX: number, screenY: number, width: number, height: number): [number, number] => {
    const cx = width / 2 + pan.x;
    const cy = height / 2 + pan.y;
    const mapSize = Math.min(width, height) * 0.92 * zoom;

    const normX = ((screenX - (cx - mapSize / 2)) / mapSize) * 100;
    const normY = ((screenY - (cy - mapSize / 2)) / mapSize) * 100;

    return [Math.max(0, Math.min(100, normX)), Math.max(0, Math.min(100, normY))];
  }, [pan, zoom]);

  /**
   * Normalized Mars Surface coords (0..100) to Screen pixels
   */
  const normToScreen = useCallback((normX: number, normY: number, width: number, height: number): [number, number] => {
    const cx = width / 2 + pan.x;
    const cy = height / 2 + pan.y;
    const mapSize = Math.min(width, height) * 0.92 * zoom;

    const screenX = cx - mapSize / 2 + (normX / 100) * mapSize;
    const screenY = cy - mapSize / 2 + (normY / 100) * mapSize;

    return [screenX, screenY];
  }, [pan, zoom]);

  /**
   * Automatic Robust Resize Observer to keep canvas resolution razor-sharp
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const w = Math.round(container.clientWidth);
      const h = Math.round(container.clientHeight);
      if (w > 0 && h > 0) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  /**
   * Main 2D Render Loop
   */
  useEffect(() => {
    let animId: number;

    const render = () => {
      animPhaseRef.current = (animPhaseRef.current + 0.035) % (Math.PI * 2);
      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(render);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(render);
        return;
      }

      const width = canvas.width;
      const height = canvas.height;

      // Clear with deep space mission dark
      ctx.fillStyle = '#06080d';
      ctx.fillRect(0, 0, width, height);

      const mapSize = Math.min(width, height) * 0.92 * zoom;
      const mapLeft = width / 2 + pan.x - mapSize / 2;
      const mapTop = height / 2 + pan.y - mapSize / 2;

      // 1. BASE MARS TERRAIN & MOLA HYPSOMETRIC RELIEF
      const cellW = mapSize / GRID_COLS;
      const cellH = mapSize / GRID_ROWS;

      const molaLayer = getLayer('mola_elevation');
      const slopeLayer = getLayer('slope');
      const themisLayer = getLayer('themis_thermal');
      const iceLayer = getLayer('sharad_ice');
      const commsLayer = getLayer('relay_comms');
      const hazardLayer = getLayer('hazards');
      const hiriseLayer = getLayer('hirise_texture');

      // One pixel per DEM cell, then scaled with smoothing: the shading is interpolated for display only, no new data.
      if (!baseCanvasRef.current) baseCanvasRef.current = document.createElement('canvas');
      const baseCanvas = baseCanvasRef.current;
      if (baseCanvas.width !== GRID_COLS || baseCanvas.height !== GRID_ROWS) {
        baseCanvas.width = GRID_COLS;
        baseCanvas.height = GRID_ROWS;
      }
      const baseCtx = baseCanvas.getContext('2d')!;
      const baseImg = baseCtx.createImageData(GRID_COLS, GRID_ROWS);
      const stipples: Array<[number, number]> = [];

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          const px = mapLeft + c * cellW;
          const py = mapTop + r * cellH;

          const elev = ARCADIA_ELEVATION_GRID[r][c]; // -4120 to -3790
          const slope = ARCADIA_SLOPE_GRID[r][c]; // 0 to 35
          const hazard = ARCADIA_HAZARD_GRID[r][c];
          const ice = ARCADIA_ICE_GRID[r][c];
          const comms = ARCADIA_COMMS_GRID[r][c];

          // Compute Martian elevation hypsometric color ramp
          const elevNorm = (elev - MISSION_BOUNDS.datumElevationMinMeters) / 
                           (MISSION_BOUNDS.datumElevationMaxMeters - MISSION_BOUNDS.datumElevationMinMeters);

          // Base Mars albedo (rusty ochre to deep umber)
          let red = 135 + Math.round(elevNorm * 75);
          let green = 65 + Math.round(elevNorm * 45);
          let blue = 45 + Math.round(elevNorm * 30);

          // Hillshade lighting (sun from North-West at 45° elevation)
          const eLeft = c > 0 ? ARCADIA_ELEVATION_GRID[r][c - 1] : elev;
          const eTop = r > 0 ? ARCADIA_ELEVATION_GRID[r - 1][c] : elev;
          const shade = ((elev - eLeft) + (elev - eTop)) * 0.08;
          red = Math.max(15, Math.min(255, red + Math.round(shade * 40)));
          green = Math.max(10, Math.min(255, green + Math.round(shade * 25)));
          blue = Math.max(10, Math.min(255, blue + Math.round(shade * 15)));

          // MOLA false color overlay if active
          if (molaLayer?.visible) {
            const mOp = molaLayer.opacity;
            // Cool cyan/blue for low plains to amber/white for highlands
            const mR = Math.round(30 + elevNorm * 220);
            const mG = Math.round(80 + Math.sin(elevNorm * Math.PI) * 120);
            const mB = Math.round(180 - elevNorm * 140);
            red = Math.round(red * (1 - mOp) + mR * mOp);
            green = Math.round(green * (1 - mOp) + mG * mOp);
            blue = Math.round(blue * (1 - mOp) + mB * mOp);
          }

          // Slope gradient overlay
          if (slopeLayer?.visible) {
            const sOp = slopeLayer.opacity;
            const slopeNorm = Math.min(1, slope / 28);
            red = Math.round(red * (1 - sOp) + (245 * slopeNorm) * sOp);
            green = Math.round(green * (1 - sOp) + (140 * (1 - slopeNorm)) * sOp);
            blue = Math.round(blue * (1 - sOp) + 20 * sOp);
          }

          // THEMIS thermal inertia
          if (themisLayer?.visible) {
            const tOp = themisLayer.opacity;
            const tVal = REAL_THEMIS_GRID ? norm01(REAL_THEMIS_GRID[r][c], THEMIS_RANGE) : (elevNorm * 0.7 + (slope / 30) * 0.3);
            red = Math.round(red * (1 - tOp) + (220 * tVal) * tOp);
            green = Math.round(green * (1 - tOp) + 40 * tOp);
            blue = Math.round(blue * (1 - tOp) + (200 * (1 - tVal)) * tOp);
          }

          // HiRISE real reflectance (only when a real HiRISE product is loaded)
          if (hiriseLayer?.visible && REAL_ALBEDO_GRID) {
            const aOp = hiriseLayer.opacity;
            const a = 40 + 200 * norm01(REAL_ALBEDO_GRID[r][c], ALBEDO_RANGE);
            red = Math.round(red * (1 - aOp) + a * aOp);
            green = Math.round(green * (1 - aOp) + a * 0.92 * aOp);
            blue = Math.round(blue * (1 - aOp) + a * 0.85 * aOp);
          }

          // CRISM real hydration summary parameter (only when a real CRISM product is loaded)
          const crismReal = getLayer('crism_minerals');
          if (crismReal?.visible && REAL_CRISM_GRID) {
            const hVal = norm01(REAL_CRISM_GRID[r][c], CRISM_RANGE);
            if (hVal > 0.5) {
              const hOp = crismReal.opacity * (hVal - 0.5) * 2;
              red = Math.round(red * (1 - hOp) + 16 * hOp);
              green = Math.round(green * (1 - hOp) + 185 * hOp);
              blue = Math.round(blue * (1 - hOp) + 129 * hOp);
            }
          }

          // SHARAD Subsurface Ice Overlay (cyan shimmer)
          if (iceLayer?.visible && ice > 50) {
            const iOp = (iceLayer.opacity * (ice - 50)) / 50;
            red = Math.round(red * (1 - iOp) + 14 * iOp);
            green = Math.round(green * (1 - iOp) + 190 * iOp);
            blue = Math.round(blue * (1 - iOp) + 225 * iOp);
          }

          // Communication shadow (deep blue/grey darkening)
          if (commsLayer?.visible && comms < 70) {
            const cOp = commsLayer.opacity * ((70 - comms) / 70);
            red = Math.round(red * (1 - cOp) + 20 * cOp);
            green = Math.round(green * (1 - cOp) + 30 * cOp);
            blue = Math.round(blue * (1 - cOp) + 85 * cOp);
          }

          // Hazard score heat overlay
          if (hazardLayer?.visible && hazard > 0.3) {
            const hOp = hazardLayer.opacity * ((hazard - 0.3) / 0.7);
            red = Math.round(red * (1 - hOp) + 235 * hOp);
            green = Math.round(green * (1 - hOp) + 25 * hOp);
            blue = Math.round(blue * (1 - hOp) + 45 * hOp);
          }

          const o = (r * GRID_COLS + c) * 4;
          baseImg.data[o] = Math.max(0, Math.min(255, red));
          baseImg.data[o + 1] = Math.max(0, Math.min(255, green));
          baseImg.data[o + 2] = Math.max(0, Math.min(255, blue));
          baseImg.data[o + 3] = 255;

          // HiRISE Micro-texture (stippled periglacial cracks)
          if (hiriseLayer?.visible && !REAL_ALBEDO_GRID && (r + c) % 3 === 0) stipples.push([px, py]);
        }
      }
      baseCtx.putImageData(baseImg, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(baseCanvas, mapLeft, mapTop, mapSize, mapSize);
      if (stipples.length) {
        ctx.fillStyle = 'rgba(255, 235, 215, 0.08)';
        for (const [sx, sy] of stipples) ctx.fillRect(sx + cellW * 0.25, sy + cellH * 0.25, 1.5, 1.5);
      }

      // 2. CONTOUR LINES (Every 25 meters)
      if (showContours) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let r = 1; r < GRID_ROWS - 1; r += 2) {
          for (let c = 1; c < GRID_COLS - 1; c += 2) {
            const elev = ARCADIA_ELEVATION_GRID[r][c];
            if (Math.abs(elev % 50) < 12) {
              const px = mapLeft + c * cellW;
              const py = mapTop + r * cellH;
              ctx.moveTo(px, py);
              ctx.lineTo(px + cellW, py + cellH * 0.5);
            }
          }
        }
        ctx.stroke();
      }

      // 2b. ANNOTATED TERRAIN REGIONS (slope classes derived from the elevation grid, NASA route-map style)
      if (showRegions) {
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            const cls = TERRAIN_CLASSES[TERRAIN_CLASS_GRID[r][c]];
            ctx.fillStyle = `rgba(${cls.rgb}, 0.30)`;
            ctx.fillRect(mapLeft + c * cellW, mapTop + r * cellH, cellW + 0.6, cellH + 0.6);
          }
        }
        ctx.font = 'italic 600 12px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        for (const reg of TERRAIN_REGIONS) {
          ctx.fillText(reg.label, mapLeft + (reg.x / 100) * mapSize, mapTop + (reg.y / 100) * mapSize);
        }
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
      }

      // 3. SCIENTIFIC GEOGRAPHIC GRID (Aerocentric Coordinates)
      if (showGridOverlay) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        const gridColsCount = 5;
        const gridRowsCount = 5;

        // Longitude lines
        for (let i = 0; i <= gridColsCount; i++) {
          const gx = mapLeft + (i / gridColsCount) * mapSize;
          ctx.beginPath();
          ctx.moveTo(gx, mapTop);
          ctx.lineTo(gx, mapTop + mapSize);
          ctx.stroke();

          // Coordinate label at top
          const lonVal = MISSION_BOUNDS.minLon + (i / gridColsCount) * (MISSION_BOUNDS.maxLon - MISSION_BOUNDS.minLon);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
          ctx.font = '9px "IBM Plex Mono", monospace';
          ctx.fillText(`${lonVal.toFixed(2)}°W`, gx - 18, mapTop - 6);
        }

        // Latitude lines
        for (let j = 0; j <= gridRowsCount; j++) {
          const gy = mapTop + (j / gridRowsCount) * mapSize;
          ctx.beginPath();
          ctx.moveTo(mapLeft, gy);
          ctx.lineTo(mapLeft + mapSize, gy);
          ctx.stroke();

          // Coordinate label at left
          const latVal = MISSION_BOUNDS.maxLat - (j / gridRowsCount) * (MISSION_BOUNDS.maxLat - MISSION_BOUNDS.minLat);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
          ctx.font = '9px "IBM Plex Mono", monospace';
          ctx.fillText(`${latVal.toFixed(2)}°N`, mapLeft - 44, gy + 3);
        }

        ctx.setLineDash([]);
      }

      // 4. MAP BORDER & BOUNDING FRAME
      ctx.strokeStyle = 'rgba(226, 92, 43, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mapLeft, mapTop, mapSize, mapSize);

      // Corner target brackets
      const bracketLen = 16;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      // Top-Left
      ctx.beginPath();
      ctx.moveTo(mapLeft, mapTop + bracketLen);
      ctx.lineTo(mapLeft, mapTop);
      ctx.lineTo(mapLeft + bracketLen, mapTop);
      ctx.stroke();
      // Top-Right
      ctx.beginPath();
      ctx.moveTo(mapLeft + mapSize - bracketLen, mapTop);
      ctx.lineTo(mapLeft + mapSize, mapTop);
      ctx.lineTo(mapLeft + mapSize, mapTop + bracketLen);
      ctx.stroke();
      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(mapLeft, mapTop + mapSize - bracketLen);
      ctx.lineTo(mapLeft, mapTop + mapSize);
      ctx.lineTo(mapLeft + bracketLen, mapTop + mapSize);
      ctx.stroke();
      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(mapLeft + mapSize - bracketLen, mapTop + mapSize);
      ctx.lineTo(mapLeft + mapSize, mapTop + mapSize);
      ctx.lineTo(mapLeft + mapSize, mapTop + mapSize - bracketLen);
      ctx.stroke();

      // 5. CRISM MINERAL DEPOSIT CLUSTERS (Glow polygon patches)
      const crismLayer = getLayer('crism_minerals');
      if (crismLayer?.visible && !REAL_CRISM_GRID) {
        scienceTargets.forEach(target => {
          if (target.type === 'HYDRATED_MINERAL') {
            const [sx, sy] = normToScreen(target.x, target.y, width, height);
            const radius = 28 * zoom;
            const grad = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius);
            grad.addColorStop(0, 'rgba(16, 185, 129, 0.55)');
            grad.addColorStop(0.6, 'rgba(16, 185, 129, 0.22)');
            grad.addColorStop(1, 'rgba(16, 185, 129, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(sx, sy, radius, 0, Math.PI * 2);
            ctx.fill();

            // Spectral cluster boundary
            ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.arc(sx, sy, radius * 0.75, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });
      }

      // 6. HAZARD ZONES (Crater rims, boulder fields, comms shadows)
      if (hazardLayer?.visible) {
        hazardZones.forEach(hz => {
          const [hx, hy] = normToScreen(hz.center[0], hz.center[1], width, height);
          const hRadius = (hz.radius / 100) * mapSize;

          ctx.save();
          ctx.beginPath();
          ctx.arc(hx, hy, hRadius, 0, Math.PI * 2);

          const hc = hazardColor(hz.type);
          const strong = hz.severity === 'CRITICAL';
          const strokeColor = withAlpha(hc, strong ? 0.95 : 0.75);
          const fillColor = withAlpha(hc, strong ? 0.22 : 0.12);

          ctx.fillStyle = fillColor;
          ctx.fill();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.stroke();
          ctx.restore();

          // Small tag
          ctx.fillStyle = strokeColor;
          ctx.font = '8.5px "IBM Plex Mono", monospace';
          ctx.fillText(hz.id, hx - 14, hy - hRadius - 4);
        });
      }

      // 7. DUST STORM FRONT (Simulated dynamic scenario)
      if (dustStormActive) {
        const stormFrontX = mapLeft + mapSize * (0.45 + Math.sin(animPhaseRef.current * 0.5) * 0.05);
        const grad = ctx.createLinearGradient(stormFrontX - 60, mapTop, stormFrontX + 180, mapTop + mapSize);
        grad.addColorStop(0, 'rgba(217, 119, 6, 0.05)');
        grad.addColorStop(0.5, 'rgba(217, 119, 6, 0.35)');
        grad.addColorStop(1, 'rgba(180, 83, 9, 0.55)');

        ctx.fillStyle = grad;
        ctx.fillRect(mapLeft, mapTop, mapSize, mapSize);

        // Dust front warning line
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(stormFrontX, mapTop);
        ctx.lineTo(stormFrontX + 40, mapTop + mapSize);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f59e0b';
        ctx.font = '10px "IBM Plex Sans", sans-serif';
        ctx.fillText('⚠ DUST OPTICAL DEPTH FRONT (tau > 1.85)', stormFrontX + 8, mapTop + 24);
      }

      // 8. CANDIDATE & ACTIVE ROUTES
      const renderRoutePath = (route: RouteCandidate, isCurrentSelected: boolean) => {
        if (route.waypoints.length < 2) return;

        ctx.save();
        ctx.beginPath();
        const [startX, startY] = normToScreen(route.waypoints[0].x, route.waypoints[0].y, width, height);
        ctx.moveTo(startX, startY);

        for (let i = 1; i < route.waypoints.length; i++) {
          const [wx, wy] = normToScreen(route.waypoints[i].x, route.waypoints[i].y, width, height);
          ctx.lineTo(wx, wy);
        }

        if (isCurrentSelected) {
          // Neon glow for selected route
          ctx.strokeStyle = route.color;
          ctx.lineWidth = 4;
          ctx.shadowColor = route.color;
          ctx.shadowBlur = 12;
          ctx.stroke();

          // Inner high-visibility core line
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 0;
          ctx.stroke();

          // Waypoint markers along selected route
          route.waypoints.forEach((wp, idx) => {
            const [wx, wy] = normToScreen(wp.x, wp.y, width, height);
            ctx.fillStyle = '#07090e';
            ctx.strokeStyle = route.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(wx, wy, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Label
            if (idx > 0 && idx < route.waypoints.length - 1) {
              ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
              ctx.font = '8px "IBM Plex Mono", monospace';
              ctx.fillText(wp.label.replace('WP-0', 'W').replace('WP-', 'W'), wx + 6, wy - 3);
            }
          });
        } else if (showAllRoutes) {
          // Unselected candidate route: dashed muted line
          ctx.strokeStyle = route.color;
          ctx.lineWidth = 2;
          ctx.setLineDash(route.id === 'ROUTE_C' ? [6, 4] : [4, 4]);
          ctx.globalAlpha = 0.55;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
          ctx.setLineDash([]);
        }
        ctx.restore();
      };

      // Draw unselected first, selected on top
      if (showAllRoutes) {
        routes.forEach(r => {
          if (r.id !== selectedRoute.id) renderRoutePath(r, false);
        });
      }
      renderRoutePath(selectedRoute, true);

      // 9. SCIENCE TARGETS MARKERS
      const scienceLayer = getLayer('science_targets');
      if (scienceLayer?.visible) {
        scienceTargets.forEach(target => {
          const [tx, ty] = normToScreen(target.x, target.y, width, height);
          const isHovered = hoveredTarget?.id === target.id;
          const isPrimaryTarget = Math.hypot(target.x - targetPoint[0], target.y - targetPoint[1]) < 3;

          // Small marker; the name appears only on hover
          ctx.save();
          ctx.translate(tx, ty);
          ctx.rotate(Math.PI / 4);
          const tc = targetColor(target);
          ctx.fillStyle = tc;
          ctx.strokeStyle = isPrimaryTarget ? '#ffffff' : 'rgba(11, 15, 23, 0.9)';
          ctx.lineWidth = isPrimaryTarget ? 2.25 : (isHovered ? 2 : 1.25);
          const size = isHovered ? 5.5 : 4;
          ctx.fillRect(-size, -size, size * 2, size * 2);
          ctx.strokeRect(-size, -size, size * 2, size * 2);
          ctx.restore();

          if (isHovered) {
            const line1 = shortTargetLabel(target);
            const line2 = 'candidate site';
            ctx.font = '600 12px Inter, system-ui, sans-serif';
            const w = Math.max(ctx.measureText(line1).width, 90) + 16;
            const bx = Math.min(tx + 12, width - w - 4), by = Math.max(ty - 34, 4);
            ctx.fillStyle = 'rgba(11, 15, 23, 0.94)';
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.lineWidth = 1;
            ctx.fillRect(bx, by, w, 34);
            ctx.strokeRect(bx, by, w, 34);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(line1, bx + 8, by + 14);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px Inter, system-ui, sans-serif';
            ctx.fillText(line2, bx + 8, by + 28);
          }
        });
      }

      // 10. START HABITAT ALPHA MARKER
      const [startX, startY] = normToScreen(startPoint[0], startPoint[1], width, height);
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(startX, startY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Habitat icon ring
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(startX, startY, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10.5px "IBM Plex Sans", sans-serif';
      ctx.fillText('Habitat Alpha (base)', startX + 18, startY + 2);
      ctx.fillStyle = 'rgba(203, 213, 225, 0.85)';
      ctx.font = '8.5px "IBM Plex Mono", monospace';
      ctx.fillText('Primary expedition outpost', startX + 18, startY + 13);

      // 11. PRIMARY DESTINATION CROSSHAIRS
      const [targetX, targetY] = normToScreen(targetPoint[0], targetPoint[1], width, height);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      const chSize = 14;
      // Reticle
      ctx.beginPath();
      ctx.arc(targetX, targetY, chSize * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(targetX - chSize, targetY);
      ctx.lineTo(targetX + chSize, targetY);
      ctx.moveTo(targetX, targetY - chSize);
      ctx.lineTo(targetX, targetY + chSize);
      ctx.stroke();

      const activeDestTarget = scienceTargets.find(t => Math.hypot(t.x - targetPoint[0], t.y - targetPoint[1]) < 3);
      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 10px "IBM Plex Sans", sans-serif';
      ctx.fillText(`★ ${activeDestTarget ? shortTargetLabel(activeDestTarget) : 'TARGET'}`, targetX + 18, targetY + 4);

      // 12. ANIMATED ASTRONAUT POSITION
      if (astronautPos) {
        const [ax, ay] = normToScreen(astronautPos[0], astronautPos[1], width, height);

        // Radio pulse beacon
        const beaconRadius = 14 + Math.sin(animPhaseRef.current * 4) * 6;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ax, ay, beaconRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Astronaut symbol
        ctx.fillStyle = '#e25c2b'; // Mars Orange
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, ay, 7.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Inner core
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax, ay, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Telemetry callout tag
        ctx.fillStyle = 'rgba(7, 10, 16, 0.88)';
        ctx.strokeStyle = '#e25c2b';
        ctx.lineWidth = 1;
        const tagW = 114;
        const tagH = 34;
        ctx.fillRect(ax + 14, ay - 18, tagW, tagH);
        ctx.strokeRect(ax + 14, ay - 18, tagW, tagH);

        ctx.fillStyle = '#ffffff';
        ctx.font = '9px "IBM Plex Sans", sans-serif';
        ctx.fillText('Astronaut 01', ax + 20, ay - 6);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = '8px "IBM Plex Mono", monospace';
        const distKm = astronautTelemetry ? (astronautTelemetry.currentDistanceMeters / 1000).toFixed(2) : '0.00';
        const batt = astronautTelemetry ? Math.round(astronautTelemetry.suitBatteryRemainingPct) : 100;
        ctx.fillText(`DIST: ${distKm}km | BATT: ${batt}%`, ax + 20, ay + 8);
      }

      // 13. INSPECTED CELL HIGHLIGHT
      if (inspectedCell) {
        const [ix, iy] = normToScreen(inspectedCell.markerX ?? inspectedCell.x, inspectedCell.markerY ?? inspectedCell.y, width, height);
        // Shown as a point; the value underneath is still that DEM cell's.
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ix, iy, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(ix, iy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Loop
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [
    layers,
    routes,
    selectedRoute,
    scienceTargets,
    hazardZones,
    startPoint,
    targetPoint,
    astronautPos,
    astronautTelemetry,
    dustStormActive,
    zoom,
    pan,
    hoveredTarget,
    inspectedCell,
    showGridOverlay,
    showContours,
    showRegions,
    showAllRoutes,
    normToScreen
  ]);

  /**
   * Handle Mouse Down (Drag or Click)
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    dragDistRef.current = 0;
  };

  /**
   * Handle Mouse Move (Pan & Hover Detection)
   */
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isDragging) {
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      dragDistRef.current = Math.hypot(dx, dy);

      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const [normX, normY] = screenToNorm(mouseX, mouseY, canvas.width, canvas.height);

    // Check if hovering near a science target
    const nearTarget = scienceTargets.find(t => Math.hypot(t.x - normX, t.y - normY) < 3.5);
    setHoveredTarget(nearTarget || null);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  /**
   * Handle Map Click to inspect terrain pixel or select target
   */
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // If the user was dragging (panned more than 5px), ignore click
    if (dragDistRef.current > 5) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const [normX, normY] = screenToNorm(mouseX, mouseY, canvas.width, canvas.height);

    // If clicked on science target, select it
    const clickedTarget = scienceTargets.find(t => Math.hypot(t.x - normX, t.y - normY) < 4.0);
    if (clickedTarget) {
      onSelectScienceTarget(clickedTarget);
      onSetTargetPoint([clickedTarget.x, clickedTarget.y]);
      return;
    }

    // Inspect clicked cell
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
      markerX: normX,
      markerY: normY,
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
  };

  /**
   * Handle Wheel Zoom
   */
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(prev => Math.min(4.2, Math.max(0.55, prev * zoomFactor)));
  };

  return (
    <div ref={containerRef} className="@container relative w-full h-full bg-[#05070b] overflow-hidden select-none">
      {/* Interactive Main 2D Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        className="w-full h-full cursor-crosshair block"
      />

      {/* Top Left: Mission Location Telemetry Badge */}
      <div className="absolute top-3 left-3 bg-[#0a0f18]/90 backdrop-blur-md border border-[#1e293b] px-3 py-2 rounded shadow-2xl hidden @[1000px]:flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-[#38bdf8] animate-ping" />
        <div>
          <div className="text-[10px] text-gray-400 font-mono tracking-wider">Mars 2D cartography</div>
          <div className="text-xs font-semibold text-white tracking-wide">
            Arcadia Planitia (39.3°N, 171.4°W)
          </div>
        </div>
      </div>

      {/* Top Right: Map Controls Bar */}
      <div className="absolute top-3 right-3 max-w-[calc(100%-1.5rem)] overflow-x-auto no-scrollbar flex items-center gap-1.5 bg-[#0a0f18]/90 backdrop-blur-md border border-[#1e293b] p-1.5 rounded shadow-2xl z-20">
        {/* Switch between 2D and 3D */}
        <div className="flex items-center bg-[#0d131f] border border-[#1e293b] rounded p-0.5 mr-1 text-[11px] font-mono">
          <button
            onClick={() => {}}
            className="px-2.5 py-1 bg-white/15 text-white font-medium rounded transition"
          >
            2D map
          </button>
          {onSwitchToVisor && (
            <button
              onClick={onSwitchToVisor}
              data-testid="astronaut-view"
              className="px-2.5 py-1 text-gray-400 hover:text-white rounded transition hover:bg-[#1a2333]"
              title="See the walk through the astronaut's eyes"
            >
              {simple ? 'Astronaut eyes' : 'Astronaut view'}
            </button>
          )}
          {onSwitchTo3D && !simple && (
            <button
              onClick={onSwitchTo3D}
              className="px-2.5 py-1 text-gray-400 hover:text-white rounded transition hover:bg-[#1a2333]"
              title="Switch to 3D Mars Surface View"
            >
              3D surface
            </button>
          )}
        </div>

        <div className="w-px h-4 bg-gray-700 mx-0.5" />

        <button
          onClick={() => setZoom(z => Math.min(4.2, z * 1.2))}
          title="Zoom In"
          className="p-1.5 hover:bg-[#1e293b] text-gray-300 hover:text-white rounded transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setZoom(z => Math.max(0.55, z * 0.82))}
          title="Zoom Out"
          className="p-1.5 hover:bg-[#1e293b] text-gray-300 hover:text-white rounded transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setZoom(1.15); setPan({ x: 0, y: 0 }); }}
          title="Reset View"
          className="p-1.5 hover:bg-[#1e293b] text-gray-300 hover:text-white rounded transition"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        {!simple && (
          <>
        <div className="w-px h-4 bg-gray-700 mx-0.5" />
        <button
          onClick={() => setShowGridOverlay(v => !v)}
          title="Toggle Aerocentric Coordinates Grid"
          className={`p-1.5 rounded transition text-xs font-mono px-2 ${showGridOverlay ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Grid
        </button>
        <button
          onClick={() => setShowContours(v => !v)}
          title="Toggle MOLA Elevation Contours"
          className={`p-1.5 rounded transition text-xs font-mono px-2 ${showContours ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Contours
        </button>
        <button
          onClick={() => setShowRegions(v => !v)}
          title="Annotated terrain regions (slope classes derived from the elevation grid, not geologic units)"
          data-testid="regions-toggle"
          className={`p-1.5 rounded transition text-xs font-mono px-2 ${showRegions ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Regions
        </button>
        <button
          onClick={() => setShowAllRoutes(v => !v)}
          title="Toggle Alternative Candidate Routes"
          className={`p-1.5 rounded transition text-xs font-mono px-2 ${showAllRoutes ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Alt-routes
        </button>
          </>
        )}
      </div>

      {onSwitchToVisor && <AstronautHint started={(astronautTelemetry?.currentDistanceMeters ?? 0) > 0} onOpen={onSwitchToVisor} />}
      <MapLegend low={[135, 65, 45]} high={[210, 110, 75]} className="absolute top-20 left-10 z-20" />

      {/* Bottom Left: Scale Bar & True Martian North Compass */}
      <div className="absolute bottom-3 left-3 bg-[#0a0f18]/90 backdrop-blur-md border border-[#1e293b] px-3 py-2 rounded shadow-2xl flex items-center gap-4 z-20">
        <div className="flex items-center gap-1.5 text-xs font-mono text-[#38bdf8]">
          <Compass className="w-4 h-4" />
          <span>True north</span>
        </div>
        <div className="w-px h-5 bg-gray-700" />
        <div>
          <div className="text-[9px] text-gray-400 font-mono">Scale</div>
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-gradient-to-r from-white via-gray-400 to-white border border-gray-600 rounded-sm" />
            <span className="text-[10px] font-mono text-gray-300">1.0 KM</span>
          </div>
        </div>
      </div>

      {/* Inspected Cell HUD Box (When clicked on surface) */}
      {inspectedCell && (
        <div className="absolute bottom-3 right-3 bg-[#0a0f18]/95 backdrop-blur-md border border-[#38bdf8]/50 p-3 rounded shadow-2xl max-w-xs text-xs font-mono z-30">
          <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 mb-2">
            <div className="flex items-center gap-1.5 text-[#38bdf8] font-semibold">
              <Crosshair className="w-3.5 h-3.5" />
              <span>Surface inspector</span>
            </div>
            <button
              onClick={() => setInspectedCell(null)}
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

          {simple ? (
            <div className="text-[11px] text-gray-400 pt-1">Easy mode walks to the candidate sites only. Switch to Advanced to pick any point.</div>
          ) : (
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => {
                onSetTargetPoint([inspectedCell.x, inspectedCell.y]);
                setInspectedCell(null);
              }}
              className="flex-1 bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 border border-[#38bdf8]/50 text-[#38bdf8] text-[10px] py-1 rounded transition text-center cursor-pointer"
            >
              Set as target
            </button>
            <button
              onClick={() => {
                onSetStartPoint([inspectedCell.x, inspectedCell.y]);
                setInspectedCell(null);
              }}
              className="flex-1 bg-[#e25c2b]/20 hover:bg-[#e25c2b]/30 border border-[#e25c2b]/50 text-[#e25c2b] text-[10px] py-1 rounded transition text-center cursor-pointer"
            >
              Set as start
            </button>
          </div>
          )}
        </div>
      )}
    </div>
  );
};
