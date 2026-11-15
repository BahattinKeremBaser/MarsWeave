/**
 * MARSWEAVE — Intelligent EVA Planning for the Red Planet
 * Main Application Orchestrator & State Machine
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  MissionProfile,
  LayerMetadata,
  ScienceTarget,
  HazardZone,
  RouteCandidate,
  EnvironmentalConditions,
  AstronautTelemetry,
  EnvironmentalAlert,
  WhatIfScenarioOption,
  RouteComparisonDelta
} from './types/marsweave';
import {
  INITIAL_DATA_LAYERS,
  ARCADIA_SCIENCE_TARGETS,
  ARCADIA_HAZARD_ZONES,
  HABITAT_ALPHA,
  DEFAULT_TARGET_ID,
  INITIAL_ENVIRONMENTAL_CONDITIONS,
  TAU_STORM
} from './data/arcadiaData';
import {
  planEvaRoutes,
  calculateReplanningDelta
} from './engine/routeOptimizer';
import { MarsMapCanvas, CellInspectionInfo } from './components/MarsMap/MarsMapCanvas';
import { HeaderBar, PageId } from './components/Header/HeaderBar';
import { HomePage } from './components/Pages/HomePage';
import { HowItWorksPage } from './components/Pages/HowItWorksPage';
import { SourcesPage } from './components/Pages/SourcesPage';
import { ProblemPage } from './components/Pages/ProblemPage';
import { NasaDataPage } from './components/Pages/NasaDataPage';
import { SciencePage } from './components/Pages/SciencePage';
import { MissionBriefingModal } from './components/Modals/MissionBriefingModal';
import { ScienceDecisionModal } from './components/Modals/ScienceDecisionModal';
import { WhatIfModal } from './components/Modals/WhatIfModal';
import { JuryTourModal } from './components/Modals/JuryTourModal';
import { EasyHome } from './components/Easy/EasyHome';
import { EasySimulator } from './components/Easy/EasySimulator';
import { MissionSetupPanel } from './components/Panels/MissionSetupPanel';
import { RoutePanel } from './components/Panels/RoutePanel';
import { LayerManagerPanel } from './components/Panels/LayerManagerPanel';
import { SimulatorControls } from './components/Panels/SimulatorControls';
import { ScienceTargetModal } from './components/Modals/ScienceTargetModal';
import { MissionCopilot } from './components/Copilot/MissionCopilot';
import { DataProvenanceDrawer } from './components/Panels/DataProvenanceDrawer';
import { suitResources, findFailure, failureText } from './engine/evaOutcome';
import { heartRateBpm, SUIT_PRESSURE_KPA } from './engine/evaPhysiology';
import { sampleElevationM } from './engine/visorTelemetry';
import { MissionReportModal } from './components/Modals/MissionReportModal';
import {
  Layers,
  Compass,
  Route,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RefreshCw,
  Sparkles,
  Sliders
} from 'lucide-react';

export default function App() {
  // 1. Mission Configuration Profile State
  const [profile, setProfile] = useState<MissionProfile>({
    objective: 'WATER',
    durationMin: 150,
    riskTolerance: 'LOW',
    sciencePriority: 'HIGH',
    commsPriority: 'HIGH',
    astronautSpeedMpm: 45,
    payloadKg: 10
  });

  // 2. Data Layers State
  const [layers, setLayers] = useState<LayerMetadata[]>(INITIAL_DATA_LAYERS);

  // 3. Targets and Coordinates State
  const [scienceTargets, setScienceTargets] = useState<ScienceTarget[]>(ARCADIA_SCIENCE_TARGETS);
  const [hazardZones, setHazardZones] = useState<HazardZone[]>(ARCADIA_HAZARD_ZONES);
  const [startPoint, setStartPoint] = useState<[number, number]>([HABITAT_ALPHA.x, HABITAT_ALPHA.y]);
  // Start on the default target so the destination marker, the dropdown and the planned route agree.
  const [targetPoint, setTargetPoint] = useState<[number, number]>(() => {
    const t = ARCADIA_SCIENCE_TARGETS.find(x => x.id === DEFAULT_TARGET_ID) ?? ARCADIA_SCIENCE_TARGETS[0];
    return [t.x, t.y];
  });
  const [selectedTargetId, setSelectedTargetId] = useState<string>(DEFAULT_TARGET_ID);

  // 4. Routes State (lazy initialized so planEvaRoutes is not re-executed on every render)
  const initialPlan = useMemo(() => planEvaRoutes([HABITAT_ALPHA.x, HABITAT_ALPHA.y], targetPoint, profile), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [routes, setRoutes] = useState<RouteCandidate[]>(initialPlan.routes);
  const [selectedRoute, setSelectedRoute] = useState<RouteCandidate>(initialPlan.selectedRoute);
  const [isPlanning, setIsPlanning] = useState<boolean>(false);

  // 5. Environmental & Mission Progress State
  const [environment, setEnvironment] = useState<EnvironmentalConditions>(INITIAL_ENVIRONMENTAL_CONDITIONS);
  const [dustStormActive, setDustStormActive] = useState<boolean>(false);
  const [completedObservations, setCompletedObservations] = useState<string[]>([]);
  const [samplesCollected, setSamplesCollected] = useState<string[]>([]);

  // 6. Simulation State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2);
  const [currentElapsedSec, setCurrentElapsedSec] = useState<number>(0);
  const [activeAlert, setActiveAlert] = useState<EnvironmentalAlert | null>(null);
  const [isPerformingObservation, setIsPerformingObservation] = useState<boolean>(false);

  // 7. Page Navigation & Modals Visibility
  const [currentPage, setCurrentPage] = useState<PageId>('SIMULATOR');
  const [leftPanelMode, setLeftPanelMode] = useState<'SETUP' | 'LAYERS' | 'HIDDEN'>('SETUP');
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true);
  const [mobileActiveDrawer, setMobileActiveDrawer] = useState<'SETUP' | 'LAYERS' | 'ROUTES' | null>(null);
  const [activeScienceModalTarget, setActiveScienceModalTarget] = useState<ScienceTarget | null>(null);
  const [isCopilotOpen, setIsCopilotOpen] = useState<boolean>(false);
  const [isProvenanceOpen, setIsProvenanceOpen] = useState<boolean>(false);
  const [provenanceFilter, setProvenanceFilter] = useState<string>('');
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [advanced, setAdvanced] = useState<boolean>(false);
  // EASY mode shows a speed slider; start fast enough that a walk takes about a minute
  useEffect(() => { if (!advanced) setPlaybackSpeed(s => (s < 6 ? 10 : s)); }, [advanced]);
  const [scienceDecisionTarget, setScienceDecisionTarget] = useState<ScienceTarget | null>(null);
  const [isBriefingOpen, setIsBriefingOpen] = useState<boolean>(false);
  const [isWhatIfModalOpen, setIsWhatIfModalOpen] = useState<boolean>(false);
  const [isJuryTourOpen, setIsJuryTourOpen] = useState<boolean>(false);
  const alertTriggeredRef = useRef<boolean>(false);

  // Total Duration in seconds for simulation
  const totalDurationSec = selectedRoute.totalDurationMin * 60;

  /**
   * Calculate Astronaut Position along Waypoints (Memoized pure function)
   */
  const currentAstronautPos = useMemo<[number, number]>(() => {
    if (selectedRoute.waypoints.length === 0) return startPoint;
    if (currentElapsedSec <= 0) return [selectedRoute.waypoints[0].x, selectedRoute.waypoints[0].y];

    // Position by elapsed time along the legs (each leg has its own pace), not by waypoint index.
    const wps = selectedRoute.waypoints;
    const tMin = Math.min(currentElapsedSec / 60, wps[wps.length - 1].cumulativeTimeMin);
    let j = 1;
    while (j < wps.length - 1 && wps[j].cumulativeTimeMin < tMin) j++;
    const p1 = wps[j - 1];
    const p2 = wps[j];
    const span = p2.cumulativeTimeMin - p1.cumulativeTimeMin;
    const fract = span > 0 ? Math.min(1, Math.max(0, (tMin - p1.cumulativeTimeMin) / span)) : 1;
    return [p1.x + (p2.x - p1.x) * fract, p1.y + (p2.y - p1.y) * fract];
  }, [selectedRoute.waypoints, startPoint, currentElapsedSec, totalDurationSec]);

  /**
   * Nearby science target detection (Memoized pure function)
   */
  const nearbyScienceTarget = useMemo(() => {
    const [ax, ay] = currentAstronautPos;
    return scienceTargets.find(t => Math.hypot(t.x - ax, t.y - ay) < 5.0) || null;
  }, [currentAstronautPos, scienceTargets]);

  /**
   * Astronaut Telemetry calculation (Memoized pure function, zero re-render cascade)
   */
  const astronautTelemetry: AstronautTelemetry = useMemo(() => {
    const progressRatio = Math.min(1, currentElapsedSec / totalDurationSec);
    const currentDistMeters = Math.round(progressRatio * selectedRoute.totalDistanceKm * 1000);
    const { batteryPct, o2Pct } = suitResources(currentElapsedSec, selectedRoute.avgMetabolicW);

    return {
      heartRateBpm: heartRateBpm(selectedRoute.avgMetabolicW),
      suitPressureKpa: SUIT_PRESSURE_KPA,
      suitO2RemainingPct: o2Pct,
      suitBatteryRemainingPct: batteryPct,
      metabolicRateWatts: selectedRoute.avgMetabolicW,
      currentDistanceMeters: currentDistMeters,
      currentElevationMeters: Math.round(sampleElevationM(currentAstronautPos[0], currentAstronautPos[1])),
      timeRemainingMin: Math.max(0, Math.round((profile.durationMin * 60 - currentElapsedSec) / 60)),
      samplesCollected,
      completedObservations
    };
  }, [currentElapsedSec, totalDurationSec, selectedRoute, samplesCollected, completedObservations, profile.durationMin, currentAstronautPos]);

  /** The walk cannot be finished if a consumable runs out first (MODELLED from published data, see engine/evaPhysiology.ts). */
  const evaFailure = useMemo(() => findFailure(totalDurationSec, selectedRoute.avgMetabolicW), [totalDurationSec, selectedRoute.avgMetabolicW]);
  const failureReached = !!evaFailure && currentElapsedSec >= evaFailure.atSec;
  useEffect(() => {
    if (!evaFailure) return;
    if (currentElapsedSec > evaFailure.atSec) setCurrentElapsedSec(evaFailure.atSec);
    if (isPlaying && currentElapsedSec >= evaFailure.atSec) {
      setIsPlaying(false);
      setIsReportOpen(true);
    }
  }, [evaFailure, currentElapsedSec, isPlaying]);

  /**
   * Re-plans EVA routes using current parameters
   */
  const handlePlanEva = useCallback((dustMult: number = 1.0, commsMult: number = 1.0) => {
    setIsPlanning(true);
    setTimeout(() => {
      const plan = planEvaRoutes(startPoint, targetPoint, profile, dustMult, commsMult);
      setRoutes(plan.routes);
      setSelectedRoute(plan.selectedRoute);
      setIsPlanning(false);
    }, 350);
  }, [startPoint, targetPoint, profile]);

  /**
   * Handle Target Dropdown selection
   */
  const handleSelectTargetId = (id: string) => {
    setSelectedTargetId(id);
    const found = scienceTargets.find(t => t.id === id);
    if (found) {
      setTargetPoint([found.x, found.y]);
      // Re-plan with new destination
      const plan = planEvaRoutes(startPoint, [found.x, found.y], profile);
      setRoutes(plan.routes);
      setSelectedRoute(plan.selectedRoute);
    }
  };

  /**
   * Toggle Layer Visibility
   */
  const handleToggleLayer = (id: string) => {
    setLayers(prev =>
      prev.map(l => (l.id === id ? { ...l, visible: !l.visible } : l))
    );
  };

  /**
   * Change Layer Opacity
   */
  const handleChangeOpacity = (id: string, opacity: number) => {
    setLayers(prev =>
      prev.map(l => (l.id === id ? { ...l, opacity } : l))
    );
  };

  /**
   * Simulation Timer Tick
   */
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      let reachedEnd = false;
      let shouldAlert = false;
      let tickTime = 0;

      setCurrentElapsedSec(prev => {
        const next = prev + 1 * playbackSpeed;
        if (next >= totalDurationSec) {
          reachedEnd = true;
          tickTime = totalDurationSec;
          return totalDurationSec;
        }

        if (next >= 2700 && next < 2700 + 4 * playbackSpeed) {
          shouldAlert = true;
        }
        tickTime = next;
        return next;
      });

      if (reachedEnd) {
        setIsPlaying(false);
        setIsReportOpen(true);
      } else if (shouldAlert && !alertTriggeredRef.current) {
        alertTriggeredRef.current = true;
        setDustStormActive(true);
        setEnvironment(env => ({
          ...env,
          dustOpticalDepthTau: TAU_STORM
        }));
        setActiveAlert({
          id: 'ALERT_DUST_01',
          type: 'DUST_STORM_SURGE',
          title: '⚠ DUST SCENARIO (SIMULATED, NOT A DETECTION)',
          message: `Scenario: optical depth jumps to tau = ${TAU_STORM.toFixed(2)}, the Mars Year 34 peak in the LMD record (sol 420, Ls 209). The real storm built up over weeks; its timing here is compressed. Nothing was observed: this is a what-if input.`,
          severity: 'CRITICAL',
          triggerAtElapsedSec: tickTime,
          impactTimeDeltaMin: 0,
          impactRiskDeltaPct: 0,
          suggestedAction: 'Re-plan the route to see how it changes under this scenario.',
          resolved: false
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, totalDurationSec]);

  /**
   * Trigger Science In-Situ Observation
   */
  const handlePerformScienceObservation = (target: ScienceTarget) => {
    setIsPerformingObservation(true);
    setTimeout(() => {
      setIsPerformingObservation(false);
      setCompletedObservations(prev => (prev.includes(target.id) ? prev : [...prev, target.id]));
      setSamplesCollected(prev => {
        const item = `${target.id}: ${target.name}`;
        return prev.includes(item) ? prev : [...prev, item];
      });
    }, 1800);
  };

  /**
   * Trigger Dynamic Re-planning in Response to Environmental Alert
   */
  const handleTriggerReplanning = () => {
    const plan = planEvaRoutes(startPoint, targetPoint, profile, 1.6, 0.7); // Apply high dust penalty
    setRoutes(plan.routes);
    setSelectedRoute(plan.selectedRoute);

    if (activeAlert) {
      setActiveAlert(a => (a ? { ...a, resolved: true } : null));
    }
  };


  /**
   * What-If Scenario Application
   */
  const handleSimulateScenario = useCallback((scenario: WhatIfScenarioOption) => {
    const tempProfile = {
      ...profile,
      durationMin: scenario.durationBudgetMin
    };
    const plan = planEvaRoutes(
      startPoint,
      targetPoint,
      tempProfile,
      scenario.dustModifier,
      scenario.commsModifier
    );
    const comparison = calculateReplanningDelta(selectedRoute, plan.selectedRoute);
    return {
      adaptedRoute: plan.selectedRoute,
      comparison
    };
  }, [profile, startPoint, targetPoint, selectedRoute]);

  const handleApplyWhatIfScenario = useCallback((scenario: WhatIfScenarioOption) => {
    setProfile(prev => ({
      ...prev,
      durationMin: scenario.durationBudgetMin
    }));
    const plan = planEvaRoutes(
      startPoint,
      targetPoint,
      profile,
      scenario.dustModifier,
      scenario.commsModifier
    );
    setRoutes(plan.routes);
    setSelectedRoute(plan.selectedRoute);
    if (scenario.dustModifier > 1.2) {
      setDustStormActive(true);
      setEnvironment(e => ({ ...e, dustOpticalDepthTau: TAU_STORM }));
    }
  }, [profile, startPoint, targetPoint]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#07090e] text-[#e2e8f0] overflow-hidden select-none font-sans">
      {/* 1. TOP HEADER & TELEMETRY RIBBON */}
      <HeaderBar
        currentPage={currentPage}
        onNavigate={page => {
          if (page === 'MISSION REPORT') {
            setIsReportOpen(true);
          } else {
            setCurrentPage(page);
          }
        }}
        onOpenCopilot={() => setIsCopilotOpen(true)}
        onOpenProvenance={() => {
          setProvenanceFilter('');
          setIsProvenanceOpen(true);
        }}
        onOpenReport={() => setIsReportOpen(true)}
        onOpenWhatIf={() => setIsWhatIfModalOpen(true)}
        onStartDemoTour={() => setIsJuryTourOpen(true)}
        onOpenBriefing={() => setIsBriefingOpen(true)}
        advanced={advanced}
        onToggleAdvanced={v => {
          setAdvanced(v);
          if (!v && !['HOME', 'SIMULATOR', 'SOURCES'].includes(currentPage)) setCurrentPage('HOME');
        }}
        currentSol={environment.sol}
        localSolarTime={environment.marsLocalTime}
        dustTau={environment.dustOpticalDepthTau}
        commsPct={environment.commsQualityPct}
      />

      {/* EDITORIAL SCIENTIFIC PAGES */}
      {currentPage === 'HOME' && !advanced && <EasyHome onStart={() => setCurrentPage('SIMULATOR')} />}
      {currentPage === 'HOME' && advanced && (
        <HomePage
          onNavigate={p => {
            if (p === 'MISSION REPORT') setIsReportOpen(true);
            else setCurrentPage(p as PageId);
          }}
          onLaunchSimulator={() => setCurrentPage('SIMULATOR')}
          routes={routes}
        />
      )}
      {advanced && currentPage === 'THE PROBLEM' && (
        <ProblemPage onLaunchSimulator={() => setCurrentPage('SIMULATOR')} routes={routes} />
      )}
      {advanced && currentPage === 'NASA DATA' && <NasaDataPage />}
      {advanced && currentPage === 'SCIENCE' && (
        <SciencePage onLaunchSimulator={() => setCurrentPage('SIMULATOR')} />
      )}
      {advanced && currentPage === 'HOW IT WORKS' && (
        <HowItWorksPage onLaunchSimulator={() => setCurrentPage('SIMULATOR')} />
      )}
      {currentPage === 'SOURCES' && <SourcesPage />}

      {/* 2. MAIN SIMULATOR & INTERACTIVE MAP VIEWPORT */}
      {currentPage === 'SIMULATOR' && !advanced && (
        <EasySimulator
          failureMessage={failureReached && evaFailure ? `Mission failed: ${failureText(evaFailure.cause)} Try a closer place or a longer air time.` : null}
          map={
            <MarsMapCanvas
              simple
              layers={layers}
              routes={routes}
              selectedRoute={selectedRoute}
              scienceTargets={scienceTargets}
              hazardZones={hazardZones}
              startPoint={startPoint}
              targetPoint={targetPoint}
              astronautPos={currentAstronautPos}
              astronautTelemetry={astronautTelemetry}
              evaLimitMin={profile.durationMin}
              elapsedSec={currentElapsedSec}
              dustStormActive={dustStormActive}
              dustTau={environment.dustOpticalDepthTau}
              sunElevationDeg={environment.sunElevationDeg}
              localTimeLabel={environment.marsLocalTime}
              onSelectRoute={r => setSelectedRoute(r)}
              onSelectScienceTarget={t => handleSelectTargetId(t.id)}
              onSetTargetPoint={() => {}}
              onSetStartPoint={() => {}}
            />
          }
          targets={scienceTargets}
          selectedTargetId={selectedTargetId}
          onSelectTarget={id => {
            setIsPlaying(false);
            setCurrentElapsedSec(0);
            handleSelectTargetId(id);
          }}
          route={selectedRoute}
          airMinutes={profile.durationMin}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(p => !p)}
          onReset={() => { setIsPlaying(false); setCurrentElapsedSec(0); }}
          elapsedSec={currentElapsedSec}
          totalSec={totalDurationSec}
          speed={playbackSpeed}
          onChangeSpeed={setPlaybackSpeed}
          onSwitchToAdvanced={() => setAdvanced(true)}
        />
      )}
      {currentPage === 'SIMULATOR' && advanced && (
        <>
          <div className="flex-1 flex overflow-hidden relative">
            {/* Mobile Navigation Tabs Bar (Visible only on mobile/tablet screens < lg) */}
            <div className="lg:hidden absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-[#070b13]/95 backdrop-blur-md border border-[#1e293b] p-1 rounded-full shadow-2xl flex items-center gap-1 font-mono text-[10px]">
              <button
                onClick={() => setMobileActiveDrawer(null)}
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition ${
                  mobileActiveDrawer === null
                    ? 'bg-[#e25c2b] text-white font-bold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Compass className="w-3 h-3" />
                <span>MAP</span>
              </button>
              <button
                onClick={() => setMobileActiveDrawer('SETUP')}
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition ${
                  mobileActiveDrawer === 'SETUP'
                    ? 'bg-[#e25c2b] text-white font-bold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3 h-3" />
                <span>Setup</span>
              </button>
              <button
                onClick={() => setMobileActiveDrawer('ROUTES')}
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition ${
                  mobileActiveDrawer === 'ROUTES'
                    ? 'bg-[#38bdf8] text-white font-bold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Route className="w-3 h-3" />
                <span>Routes</span>
              </button>
              <button
                onClick={() => setMobileActiveDrawer('LAYERS')}
                className={`px-2.5 py-1 rounded-full flex items-center gap-1 transition ${
                  mobileActiveDrawer === 'LAYERS'
                    ? 'bg-[#10b981] text-white font-bold'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Layers</span>
              </button>
            </div>

            {/* Mobile Overlay Drawer (On mobile screens < lg) */}
            {mobileActiveDrawer && (
              <div className="lg:hidden fixed inset-0 top-14 z-40 bg-[#070b13]/98 backdrop-blur-xl flex flex-col animate-in slide-in-from-bottom-2 duration-200">
                <div className="h-11 bg-[#0d121c] border-b border-[#1e293b] px-4 flex items-center justify-between font-mono text-xs text-white shrink-0">
                  <div className="flex items-center gap-2 font-bold">
                    {mobileActiveDrawer === 'SETUP' && (
                      <>
                        <Compass className="w-4 h-4 text-[#e25c2b]" />
                        <span>Mission setup & constraints</span>
                      </>
                    )}
                    {mobileActiveDrawer === 'LAYERS' && (
                      <>
                        <Layers className="w-4 h-4 text-[#10b981]" />
                        <span>NASA orbital data layers</span>
                      </>
                    )}
                    {mobileActiveDrawer === 'ROUTES' && (
                      <>
                        <Route className="w-4 h-4 text-[#38bdf8]" />
                        <span>EVA route candidates & tradeoffs</span>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setMobileActiveDrawer(null)}
                    className="px-2.5 py-1 rounded bg-[#1e293b] hover:bg-[#2b3a52] text-gray-300 hover:text-white text-[11px]"
                  >
                    Back to map ✕
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {mobileActiveDrawer === 'SETUP' && (
                    <MissionSetupPanel
                      profile={profile}
                      onChangeProfile={p => {
                        setProfile(p);
                        handlePlanEva();
                      }}
                      scienceTargets={scienceTargets}
                      selectedTargetId={selectedTargetId}
                      onSelectTargetId={id => {
                        handleSelectTargetId(id);
                        setMobileActiveDrawer(null);
                      }}
                      onPlanEva={() => {
                        handlePlanEva();
                        setMobileActiveDrawer(null);
                      }}
                      isPlanning={isPlanning}
                    />
                  )}
                  {mobileActiveDrawer === 'LAYERS' && (
                    <LayerManagerPanel
                      layers={layers}
                      onToggleLayer={handleToggleLayer}
                      onChangeOpacity={handleChangeOpacity}
                      onOpenProvenance={inst => {
                        setProvenanceFilter(inst);
                        setIsProvenanceOpen(true);
                      }}
                    />
                  )}
                  {mobileActiveDrawer === 'ROUTES' && (
                    <RoutePanel
                      routes={routes}
                      selectedRoute={selectedRoute}
                      onSelectRoute={r => {
                        setSelectedRoute(r);
                        setMobileActiveDrawer(null);
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* LEFT DOCKED PANEL: SETUP / LAYERS (Desktop lg+) */}
            {leftPanelMode !== 'HIDDEN' && (
              <aside className="hidden lg:flex w-80 h-full flex-col z-20 shrink-0 shadow-2xl relative">
                {/* Mode Switcher Tabs */}
                <div className="flex bg-[#070b13] border-b border-[#1a2333] text-[10.5px] font-mono">
                  <button
                    onClick={() => setLeftPanelMode('SETUP')}
                    className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition ${
                      leftPanelMode === 'SETUP'
                        ? 'text-[#e25c2b] border-b-2 border-[#e25c2b] font-bold bg-[#e25c2b]/10'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Mission setup</span>
                  </button>
                  <button
                    onClick={() => setLeftPanelMode('LAYERS')}
                    className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition ${
                      leftPanelMode === 'LAYERS'
                        ? 'text-[#38bdf8] border-b-2 border-[#38bdf8] font-bold bg-[#38bdf8]/10'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>NASA layers</span>
                  </button>
                </div>

                {/* Panel View */}
                <div className="flex-1 overflow-hidden">
                  {leftPanelMode === 'SETUP' ? (
                    <MissionSetupPanel
                      profile={profile}
                      onChangeProfile={p => {
                        setProfile(p);
                        handlePlanEva();
                      }}
                      scienceTargets={scienceTargets}
                      selectedTargetId={selectedTargetId}
                      onSelectTargetId={handleSelectTargetId}
                      onPlanEva={() => handlePlanEva()}
                      isPlanning={isPlanning}
                    />
                  ) : (
                    <LayerManagerPanel
                      layers={layers}
                      onToggleLayer={handleToggleLayer}
                      onChangeOpacity={handleChangeOpacity}
                      onOpenProvenance={inst => {
                        setProvenanceFilter(inst);
                        setIsProvenanceOpen(true);
                      }}
                    />
                  )}
                </div>
              </aside>
            )}

            {/* Left Panel Collapse Toggle Button (Desktop lg+) */}
            <button
              onClick={() => setLeftPanelMode(m => (m === 'HIDDEN' ? 'SETUP' : 'HIDDEN'))}
              className="hidden lg:flex absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-[#0a0f18] hover:bg-[#1e293b] border border-gray-700 text-gray-300 hover:text-white p-1 rounded-r shadow-xl transition cursor-pointer"
              title={leftPanelMode === 'HIDDEN' ? 'Expand Configuration Panel' : 'Collapse Panel'}
              style={{ left: leftPanelMode !== 'HIDDEN' ? '20rem' : '0' }}
            >
              {leftPanelMode !== 'HIDDEN' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {/* CENTER: INTERACTIVE MARS MAP VIEWPORT */}
            <main className="flex-1 h-full relative overflow-hidden">
              <MarsMapCanvas
                layers={layers}
                routes={routes}
                selectedRoute={selectedRoute}
                scienceTargets={scienceTargets}
                hazardZones={hazardZones}
                startPoint={startPoint}
                targetPoint={targetPoint}
                astronautPos={currentAstronautPos}
                astronautTelemetry={astronautTelemetry}
                evaLimitMin={profile.durationMin}
                elapsedSec={currentElapsedSec}
                dustStormActive={dustStormActive}
                dustTau={environment.dustOpticalDepthTau}
                sunElevationDeg={environment.sunElevationDeg}
                localTimeLabel={environment.marsLocalTime}
                onSelectRoute={r => setSelectedRoute(r)}
                onSelectScienceTarget={target => setActiveScienceModalTarget(target)}
                onSetTargetPoint={pt => {
                  setTargetPoint(pt);
                  const plan = planEvaRoutes(startPoint, pt, profile);
                  setRoutes(plan.routes);
                  setSelectedRoute(plan.selectedRoute);
                }}
                onSetStartPoint={pt => {
                  setStartPoint(pt);
                  const plan = planEvaRoutes(pt, targetPoint, profile);
                  setRoutes(plan.routes);
                  setSelectedRoute(plan.selectedRoute);
                }}
              />
            </main>

            {/* Right Panel Collapse Toggle Button (Desktop lg+) */}
            <button
              onClick={() => setRightPanelOpen(v => !v)}
              className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 bg-[#0a0f18] hover:bg-[#1e293b] border border-gray-700 text-gray-300 hover:text-white p-1 rounded-l shadow-xl transition cursor-pointer"
              title={rightPanelOpen ? 'Collapse Route Panel' : 'Expand Route Panel'}
              style={{ right: rightPanelOpen ? '22rem' : '0' }}
            >
              {rightPanelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>

            {/* RIGHT DOCKED PANEL: ROUTE METRICS & "WHY THIS ROUTE?" (Desktop lg+) */}
            {rightPanelOpen && (
              <aside className="hidden lg:flex w-[22rem] h-full flex-col z-20 shrink-0 shadow-2xl">
                <RoutePanel
                  routes={routes}
                  selectedRoute={selectedRoute}
                  onSelectRoute={r => setSelectedRoute(r)}
                />
              </aside>
            )}
          </div>

          {/* 3. BOTTOM EVA SIMULATOR & TELEMETRY CONTROLS */}
          <SimulatorControls
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(p => !p)}
            onReset={() => {
              setIsPlaying(false);
              setCurrentElapsedSec(0);
              setDustStormActive(false);
              setActiveAlert(null);
              alertTriggeredRef.current = false;
              setEnvironment(INITIAL_ENVIRONMENTAL_CONDITIONS);
            }}
            playbackSpeed={playbackSpeed}
            onChangeSpeed={s => setPlaybackSpeed(s)}
            currentElapsedSec={currentElapsedSec}
            totalDurationSec={totalDurationSec}
            onSeekSec={sec => setCurrentElapsedSec(sec)}
            environment={environment}
            astronautTelemetry={astronautTelemetry}
            activeAlert={activeAlert}
            onTriggerReplanning={handleTriggerReplanning}
            onDismissAlert={() => setActiveAlert(a => (a ? { ...a, resolved: true } : null))}
            nearbyScienceTarget={nearbyScienceTarget}
            onPerformScienceObservation={target => {
              setScienceDecisionTarget(target);
            }}
            isPerformingObservation={isPerformingObservation}
          />
        </>
      )}

      {/* 4. MODALS & DRAWERS */}
      {/* Science Target Inspector Modal */}
      <ScienceTargetModal
        target={activeScienceModalTarget}
        onClose={() => setActiveScienceModalTarget(null)}
        onSetAsPrimaryTarget={target => {
          setSelectedTargetId(target.id);
          setTargetPoint([target.x, target.y]);
          const plan = planEvaRoutes(startPoint, [target.x, target.y], profile);
          setRoutes(plan.routes);
          setSelectedRoute(plan.selectedRoute);
        }}
        isPrimaryTarget={activeScienceModalTarget?.id === selectedTargetId}
      />


      {/* "WHAT IF?" Scenario Contingency Modal */}
      <WhatIfModal
        isOpen={isWhatIfModalOpen}
        onClose={() => setIsWhatIfModalOpen(false)}
        originalRoute={selectedRoute}
        onApplyScenario={handleApplyWhatIfScenario}
        onSimulateScenario={handleSimulateScenario}
      />

      {/* AI Mission Copilot Drawer */}
      <MissionCopilot
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        selectedRoute={selectedRoute}
        profile={profile}
        environment={environment}
        astronautTelemetry={astronautTelemetry}
        scienceTargets={scienceTargets}
      />

      {/* NASA Data Provenance Drawer */}
      <DataProvenanceDrawer
        isOpen={isProvenanceOpen}
        onClose={() => setIsProvenanceOpen(false)}
        selectedInstrumentFilter={provenanceFilter}
      />

      {/* Post-EVA Debrief Report Modal */}
      <MissionReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        selectedRoute={selectedRoute}
        profile={profile}
        environment={environment}
        astronautTelemetry={astronautTelemetry}
        scienceTargets={scienceTargets}
        failure={failureReached ? evaFailure : null}
        onRestartMission={() => {
          setIsPlaying(false);
          setCurrentElapsedSec(0);
          setDustStormActive(false);
          setActiveAlert(null);
          alertTriggeredRef.current = false;
          setEnvironment(INITIAL_ENVIRONMENTAL_CONDITIONS);
          setCompletedObservations([]);
          setSamplesCollected([]);
        }}
      />

      {/* Flight Readiness Review / Pre-EVA Mission Briefing Modal */}
      <MissionBriefingModal
        isOpen={isBriefingOpen}
        onClose={() => setIsBriefingOpen(false)}
        onBeginMission={() => {
          setIsBriefingOpen(false);
          setCurrentPage('SIMULATOR');
          setIsPlaying(true);
        }}
        profile={profile}
      />

      {/* In-Situ Science Decision Modal */}
      <ScienceDecisionModal
        isOpen={!!scienceDecisionTarget}
        target={scienceDecisionTarget}
        onClose={() => setScienceDecisionTarget(null)}
        onSelectAction={action => {
          if (scienceDecisionTarget) {
            setCompletedObservations(prev =>
              prev.includes(scienceDecisionTarget.id) ? prev : [...prev, scienceDecisionTarget.id]
            );
            setSamplesCollected(prev => {
              const item = `${scienceDecisionTarget.id}: ${scienceDecisionTarget.name} (${action.name})`;
              return prev.includes(item) ? prev : [...prev, item];
            });
          }
          setScienceDecisionTarget(null);
        }}
        remainingTimeMin={astronautTelemetry.timeRemainingMin}
        batteryPct={astronautTelemetry.suitBatteryRemainingPct}
      />

      {/* Jury Demo Tour Walkthrough Modal */}
      <JuryTourModal
        isOpen={isJuryTourOpen}
        onClose={() => setIsJuryTourOpen(false)}
        onTriggerPlanEva={() => handlePlanEva()}
        onSelectScienceObjective={obj => setProfile(p => ({ ...p, objective: obj }))}
        onToggleLayer={handleToggleLayer}
        onTriggerDustScenario={() => {
          setDustStormActive(true);
          setEnvironment(e => ({ ...e, dustOpticalDepthTau: TAU_STORM }));
          setActiveAlert({
            id: 'ALERT_DUST_DEMO',
            type: 'DUST_STORM_SURGE',
            title: '⚠ DUST SCENARIO (SIMULATED, NOT A DETECTION)',
            message: `Scenario: optical depth jumps to tau = ${TAU_STORM.toFixed(2)}, the Mars Year 34 peak in the LMD record (sol 420, Ls 209). The real storm built up over weeks; its timing here is compressed. Nothing was observed: this is a what-if input.`,
            severity: 'CRITICAL',
            triggerAtElapsedSec: currentElapsedSec,
            impactTimeDeltaMin: 0,
            impactRiskDeltaPct: 0,
            suggestedAction: 'Re-plan the route to see how it changes under this scenario.',
            resolved: false
          });
        }}
        onTriggerReplanning={handleTriggerReplanning}
        onOpenReport={() => setIsReportOpen(true)}
        onOpenProvenance={() => {
          setProvenanceFilter('');
          setIsProvenanceOpen(true);
        }}
      />
    </div>
  );
}
