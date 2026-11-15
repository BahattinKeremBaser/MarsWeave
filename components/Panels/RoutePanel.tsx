/**
 * MARSWEAVE — Route Inspection, Candidate Comparison & "WHY THIS ROUTE?" Rationale
 */

import { PovImageCard } from './PovImageCard';
import { RAD_BASELINE_MICROSV_H } from '../../data/arcadiaData';
import React, { useState } from 'react';
import { RouteCandidate, RouteWaypoint } from '../../types/marsweave';
import {
  Route,
  CheckCircle,
  AlertTriangle,
  Radio,
  Clock,
  Compass,
  Zap,
  Sparkles,
  Mountain,
  ChevronRight,
  ShieldCheck,
  TrendingDown
} from 'lucide-react';

interface RoutePanelProps {
  routes: RouteCandidate[];
  selectedRoute: RouteCandidate;
  onSelectRoute: (route: RouteCandidate) => void;
  onInspectWaypoint?: (wp: RouteWaypoint) => void;
}

export const RoutePanel: React.FC<RoutePanelProps> = ({
  routes,
  selectedRoute,
  onSelectRoute,
  onInspectWaypoint
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'EXPLANATION' | 'WAYPOINTS'>('EXPLANATION');

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] border-l border-[#1a2333] text-gray-200 select-none">
      {/* Route Selector Header Tabs */}
      <div className="p-3 border-b border-[#1a2333] bg-[#0c121e]">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Route className="w-4 h-4 text-[#38bdf8]" />
          <h2 className="text-xs font-mono uppercase tracking-widest text-[#38bdf8] font-semibold">
            Routes
          </h2>
        </div>

        {/* 3 Candidate Routes Selector */}
        <div className="grid grid-cols-3 gap-1.5">
          {routes.map(r => {
            const isSelected = r.id === selectedRoute.id;
            return (
              <button
                key={r.id}
                onClick={() => onSelectRoute(r)}
                className={`py-2 px-1 rounded border text-left transition ${
                  isSelected
                    ? 'bg-[#38bdf8]/15 border-[#38bdf8] shadow-sm'
                    : 'bg-[#0f172a] border-[#1e293b] hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
                  <span className="font-semibold" style={{ color: r.color }}>{r.name}</span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8]" />}
                </div>
                <div className="text-[11px] font-bold text-white font-mono">
                  {r.totalDistanceKm} km
                </div>
                <div className="text-[9px] text-gray-400 font-mono">
                  {r.totalDurationMin} min
                </div>
                {r.samePathAs && (
                  <div className="text-[9px] text-amber-300/90 mt-0.5">Same path as {r.samePathAs.replace('Route ', '')}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Internal Subtabs */}
      <div className="flex border-b border-[#1a2333] bg-[#080c14] text-[10px] font-mono">
        <button
          onClick={() => setActiveTab('EXPLANATION')}
          className={`flex-1 py-2 text-center transition ${
            activeTab === 'EXPLANATION'
              ? 'text-[#38bdf8] border-b-2 border-[#38bdf8] font-bold bg-[#38bdf8]/10'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Why this route?
        </button>
        <button
          onClick={() => setActiveTab('OVERVIEW')}
          className={`flex-1 py-2 text-center transition ${
            activeTab === 'OVERVIEW'
              ? 'text-[#38bdf8] border-b-2 border-[#38bdf8] font-bold bg-[#38bdf8]/10'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Metrics & profile
        </button>
        <button
          onClick={() => setActiveTab('WAYPOINTS')}
          className={`flex-1 py-2 text-center transition ${
            activeTab === 'WAYPOINTS'
              ? 'text-[#38bdf8] border-b-2 border-[#38bdf8] font-bold bg-[#38bdf8]/10'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          WAYPOINTS ({selectedRoute.waypoints.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'EXPLANATION' && (
          <div className="space-y-4">
            {/* Highlighted Choice Title */}
            <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-1">
                Summary
              </div>
              <div className="text-xs font-heading font-semibold text-white mb-1">
                {selectedRoute.name}: {selectedRoute.subtitle}
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">
                {selectedRoute.description}
              </p>
            </div>

            {/* "Why this route" Evidence points */}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#10b981] mb-2 flex items-center gap-1.5 font-semibold">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Why this route</span>
              </div>
              <div className="space-y-1.5">
                {selectedRoute.whyChosenReasons.map((reason, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 bg-[#10b981]/10 border border-[#10b981]/30 p-2 rounded text-xs text-gray-200"
                  >
                    <span className="text-[#10b981] font-bold">✓</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AVOIDED HAZARDS */}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Hazards avoided</span>
              </div>
              <div className="space-y-1.5">
                {selectedRoute.hazardsAvoided.map((haz, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/25 p-2 rounded text-xs text-gray-300"
                  >
                    <span className="text-amber-400">⚠</span>
                    <span>{haz}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Scientific Targets En Route */}
            {selectedRoute.scienceTargetsVisited.length > 0 && (
              <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded">
                <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[#facc15]">
                    <Sparkles className="w-3 h-3" />
                    Candidate sites on route
                  </span>
                  <span className="text-white font-mono">{selectedRoute.scienceTargetsVisited.length} CANDIDATE SITES</span>
                </div>
                <div className="space-y-1.5">
                  {selectedRoute.scienceTargetsVisited.map(target => (
                    <div
                      key={target.id}
                      className="flex items-center justify-between bg-[#1e293b]/50 p-2 rounded text-xs border border-gray-800"
                    >
                      <div>
                        <span className="font-mono text-[#38bdf8] font-bold mr-1.5">{target.id}</span>
                        <span className="text-white">{target.name.split(':')[1] || target.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-900 px-1.5 py-0.5 rounded">
                        {target.observationTimeMin}m scan
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            {/* Engineering Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#0f172a] border border-[#1e293b] p-2.5 rounded">
                <span className="text-[10px] text-gray-400 block mb-1">Total traverse</span>
                <span className="text-base font-bold text-white">{selectedRoute.totalDistanceKm} km</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">Surface odometry</span>
              </div>
              <div className="bg-[#0f172a] border border-[#1e293b] p-2.5 rounded">
                <span className="text-[10px] text-gray-400 block mb-1">Total EVA time</span>
                <span className="text-base font-bold text-[#38bdf8]">{selectedRoute.totalDurationMin} MIN</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">Incl. science stops</span>
              </div>
              <div className="bg-[#0f172a] border border-[#1e293b] p-2.5 rounded">
                <span className="text-[10px] text-gray-400 block mb-1">Average slope</span>
                <span className="text-base font-bold text-emerald-400">{selectedRoute.avgSlopeDeg}°</span>
                <span className="text-[10px] text-gray-500 block mt-0.5">Max: {selectedRoute.maxSlopeDeg}°</span>
              </div>
              <div className="bg-[#0f172a] border border-[#1e293b] p-2.5 rounded">
                <span className="text-[10px] text-gray-400 block mb-1">Hazard exposure</span>
                <span className={`text-base font-bold ${selectedRoute.hazardExposureScore > 30 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedRoute.hazardExposureScore} / 100
                </span>
                <span className="text-[10px] text-gray-500 block mt-0.5">
                  {selectedRoute.hazardExposureScore > 30 ? 'Moderate Caution' : 'Nominal Safe'}
                </span>
              </div>
            </div>

            {selectedRoute.timeBudgetExceededMin > 0 && (
              <div className="text-[11px] text-red-300 bg-red-950/40 border border-red-800/50 rounded p-2 font-mono" data-testid="budget-warning">
                NOT FEASIBLE: this route is {selectedRoute.timeBudgetExceededMin} min longer than the EVA time limit.
                Pick a closer target, raise the limit, or reduce carried equipment.
              </div>
            )}

            {/* Radiation dose (MODELLED) */}
            <div className="bg-[#0f172a] border border-[#1e293b] p-2.5 rounded text-xs font-mono" data-testid="dose-card">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-400">Estimated radiation dose</span>
                <span className="text-[8.5px] px-1.5 py-0.5 rounded uppercase font-semibold border bg-amber-950 text-amber-300 border-amber-800/40">MODELLED</span>
              </div>
              <span className="text-base font-bold text-white">{selectedRoute.doseMicroSv} µSv</span>
              <span className="text-[10px] text-gray-500 block mt-0.5 leading-snug">
                = {RAD_BASELINE_MICROSV_H} µSv/h × EVA time. Rate is the published MSL RAD surface value at Gale (Hassler et al. 2014)
                used as a proxy; solar particle events and local shielding are not modelled.
              </span>
            </div>

            <PovImageCard />

            {/* Telemetry Budgets */}
            <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded space-y-3">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">
                Astronaut life-support & logistics
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    Suit Battery Budget:
                  </span>
                  <span className="text-white font-semibold">{selectedRoute.energyConsumptionPct}% consumed</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${selectedRoute.energyConsumptionPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <Radio className="w-3 h-3 text-[#38bdf8]" />
                    MRO Orbiter Relay Link:
                  </span>
                  <span className="text-white font-semibold">{selectedRoute.commsCoveragePct}% coverage</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#38bdf8] rounded-full"
                    style={{ width: `${selectedRoute.commsCoveragePct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className="text-gray-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-[#10b981]" />
                    Suit Primary Oxygen:
                  </span>
                  <span className="text-white font-semibold">{selectedRoute.suitOxygenUsedPct}% consumed</span>
                </div>
                <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#10b981] rounded-full"
                    style={{ width: `${selectedRoute.suitOxygenUsedPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Elevation Profile Visualizer */}
            <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded">
              <div className="flex justify-between text-[10px] font-mono text-gray-400 uppercase tracking-wider mb-2">
                <span className="flex items-center gap-1 text-[#38bdf8]">
                  <Mountain className="w-3 h-3" />
                  MOLA elevation profile
                </span>
                <span>{selectedRoute.waypoints[0]?.elevation}m → {selectedRoute.waypoints[selectedRoute.waypoints.length - 1]?.elevation}m</span>
              </div>
              <div className="h-16 flex items-end gap-1 pt-2 border-b border-gray-800">
                {selectedRoute.waypoints.map((wp, idx) => {
                  const minElev = -4100;
                  const maxElev = -3850;
                  const normH = Math.max(15, Math.min(100, ((wp.elevation - minElev) / (maxElev - minElev)) * 100));
                  return (
                    <div
                      key={idx}
                      title={`${wp.label}: ${wp.elevation}m, slope ${wp.slopeDeg}°`}
                      className="flex-1 bg-[#38bdf8]/40 hover:bg-[#38bdf8] rounded-t transition cursor-pointer"
                      style={{ height: `${normH}%` }}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] font-mono text-gray-500 mt-1">
                <span>START (0.0km)</span>
                <span>TARGET ({selectedRoute.totalDistanceKm}km)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'WAYPOINTS' && (
          <div className="space-y-2">
            {selectedRoute.waypoints.map((wp, idx) => (
              <div
                key={wp.id}
                onClick={() => onInspectWaypoint && onInspectWaypoint(wp)}
                className="bg-[#0f172a] hover:bg-[#1e293b] border border-[#1e293b] p-2.5 rounded transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#38bdf8]">{wp.label}</span>
                    <span className="text-[10px] font-mono text-gray-400">
                      {(wp.cumulativeDistanceMeters / 1000).toFixed(2)} km
                    </span>
                    {wp.scienceTargetNear && (
                      <span className="text-[9px] font-mono bg-amber-500/20 text-amber-300 px-1 rounded">
                        Science stop
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                    {wp.lat.toFixed(3)}°N, {wp.lon.toFixed(3)}°W | Elev: {Math.round(wp.elevation)}m | Slope: {wp.slopeDeg.toFixed(1)}°
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-semibold text-white">+{Math.round(wp.cumulativeTimeMin)}m</div>
                  <div className="text-[9px] text-gray-500">T+{Math.round(wp.cumulativeTimeMin)}m</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
