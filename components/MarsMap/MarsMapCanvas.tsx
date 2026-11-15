/**
 * MARSWEAVE — Mars Geospatial Viewport Orchestrator
 * High-performance dual-mode planetary visualization.
 * Supports pristine 2D Topographical Cartography (MOLA hillshading, contours,
 * NASA multi-spectral layers, cell inspector) and true 3D WebGL Orbital/Surface DEM simulation.
 */

import React, { useState } from 'react';
import {
  LayerMetadata,
  RouteCandidate,
  ScienceTarget,
  HazardZone,
  AstronautTelemetry
} from '../../types/marsweave';
import { Mars2DViewport } from './Mars2DViewport';
import { Mars3DViewport } from './Mars3DViewport';
import { VisorView } from './VisorView';

export interface CellInspectionInfo {
  x: number;
  y: number;
  /** Exact clicked position (0..100), used only to draw the point marker. */
  markerX?: number;
  markerY?: number;
  lat: number;
  lon: number;
  elevation: number;
  slope: number;
  hazardScore: number;
  iceConfidence: number;
  commsPct: number;
  nearScience?: ScienceTarget;
  hazardNear?: HazardZone;
}

interface MarsMapCanvasProps {
  layers: LayerMetadata[];
  routes: RouteCandidate[];
  selectedRoute: RouteCandidate;
  scienceTargets: ScienceTarget[];
  hazardZones: HazardZone[];
  startPoint: [number, number];
  targetPoint: [number, number];
  astronautPos?: [number, number]; // [x, y] in grid 0..100
  astronautTelemetry?: AstronautTelemetry;
  evaLimitMin?: number;
  elapsedSec?: number;
  dustStormActive?: boolean;
  viewMode?: 'MISSION' | 'SCIENCE';
  onToggleViewMode?: (mode: 'MISSION' | 'SCIENCE') => void;
  onSelectRoute?: (route: RouteCandidate) => void;
  onSelectScienceTarget: (target: ScienceTarget) => void;
  onSetTargetPoint: (point: [number, number]) => void;
  onSetStartPoint: (point: [number, number]) => void;
  onInspectPixel?: (info: CellInspectionInfo | null) => void;
  simple?: boolean;
  dustTau?: number;
  sunElevationDeg?: number;
  localTimeLabel?: string;
}

export const MarsMapCanvas: React.FC<MarsMapCanvasProps> = ({
  layers,
  routes,
  selectedRoute,
  scienceTargets,
  hazardZones,
  startPoint,
  targetPoint,
  astronautPos,
  astronautTelemetry,
  evaLimitMin,
  elapsedSec,
  dustStormActive,
  onSelectRoute,
  onSelectScienceTarget,
  onSetTargetPoint,
  onSetStartPoint,
  onInspectPixel,
  simple,
  dustTau = 0.54,
  sunElevationDeg = 48.5,
  localTimeLabel = '14:24 LST'
}) => {
  // Dimension mode: Defaults to true 3D WebGL Orbital/Surface DEM simulation, seamlessly switchable to 2D
  const [dimensionMode, setDimensionMode] = useState<'2D' | '3D' | 'VISOR'>('2D');

  if (dimensionMode === 'VISOR') {
    return (
      <VisorView
        astronautPos={astronautPos ?? startPoint}
        selectedRoute={selectedRoute}
        targetPoint={targetPoint}
        dustStormActive={dustStormActive}
        dustTau={dustTau}
        sunElevationDeg={sunElevationDeg}
        localTimeLabel={localTimeLabel}
        evaLimitMin={evaLimitMin ?? 150}
        elapsedSec={elapsedSec ?? 0}
        astronautTelemetry={astronautTelemetry}
        simple={simple}
        onExit={() => setDimensionMode('2D')}
      />
    );
  }

  if (dimensionMode === '3D' && !simple) {
    return (
      <Mars3DViewport
        layers={layers}
        routes={routes}
        selectedRoute={selectedRoute}
        scienceTargets={scienceTargets}
        hazardZones={hazardZones}
        startPoint={startPoint}
        targetPoint={targetPoint}
        astronautPos={astronautPos}
        astronautTelemetry={astronautTelemetry}
        evaLimitMin={evaLimitMin}
        elapsedSec={elapsedSec}
        dustStormActive={dustStormActive}
        onSelectRoute={onSelectRoute}
        onSelectScienceTarget={onSelectScienceTarget}
        onSetTargetPoint={onSetTargetPoint}
        onSetStartPoint={onSetStartPoint}
        onInspectPixel={onInspectPixel}
        onSwitchTo2D={() => setDimensionMode('2D')}
        onOpenVisor={() => setDimensionMode('VISOR')}
      />
    );
  }

  return (
    <Mars2DViewport
      layers={layers}
      routes={routes}
      selectedRoute={selectedRoute}
      scienceTargets={scienceTargets}
      hazardZones={hazardZones}
      startPoint={startPoint}
      targetPoint={targetPoint}
      astronautPos={astronautPos}
      astronautTelemetry={astronautTelemetry}
      dustStormActive={dustStormActive}
      onSelectRoute={onSelectRoute}
      onSelectScienceTarget={onSelectScienceTarget}
      onSetTargetPoint={onSetTargetPoint}
      onSetStartPoint={onSetStartPoint}
      onInspectPixel={onInspectPixel}
      onSwitchTo3D={() => setDimensionMode('3D')}
      onSwitchToVisor={() => setDimensionMode('VISOR')}
      simple={simple}
    />
  );
};
