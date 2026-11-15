/**
 * MARSWEAVE — Post-EVA Mission Debrief & Scientific Operational Report Modal
 */

import React from 'react';
import {
  RouteCandidate,
  MissionProfile,
  EnvironmentalConditions,
  AstronautTelemetry,
  ScienceTarget
} from '../../types/marsweave';
import { EvaFailure, failureText } from '../../engine/evaOutcome';
import {
  AlertTriangle,
  FileText,
  Award,
  CheckCircle2,
  Mountain,
  Clock,
  Sparkles,
  ShieldCheck,
  Radio,
  Printer,
  X,
  RotateCcw
} from 'lucide-react';

interface MissionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRoute: RouteCandidate;
  profile: MissionProfile;
  environment: EnvironmentalConditions;
  astronautTelemetry: AstronautTelemetry;
  scienceTargets: ScienceTarget[];
  /** Set when the walk ended because a suit consumable ran out (SIMULATED planning model). */
  failure?: EvaFailure | null;
  onRestartMission: () => void;
}

export const MissionReportModal: React.FC<MissionReportModalProps> = ({
  isOpen,
  onClose,
  selectedRoute,
  profile,
  environment,
  astronautTelemetry,
  scienceTargets,
  failure,
  onRestartMission
}) => {
  if (!isOpen) return null;

  const failed = !!failure;
  const overLimit = !failed && selectedRoute.timeBudgetExceededMin > 0;
  const coveredKm = astronautTelemetry.currentDistanceMeters / 1000;

  const crossedZones = selectedRoute.hazardsCrossed.filter(
    z => z.fromM <= astronautTelemetry.currentDistanceMeters + 1
  );

  const visitedTargets = scienceTargets.filter(t => 
    astronautTelemetry.completedObservations.includes(t.id) || 
    selectedRoute.scienceTargetsVisited.some(st => st.id === t.id)
  );


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md select-none print:p-0 print:bg-white">
      <div className="bg-[#0b0f19] border border-[#38bdf8]/40 rounded-lg shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden text-gray-200 print:text-black print:bg-white print:border-none print:shadow-none">
        {/* Header */}
        <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] flex items-center justify-between print:border-b-2 print:border-black">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded border ${failed ? "bg-rose-500/15 text-rose-400 border-rose-500/30" : "bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30"}`}>
              {failed ? <AlertTriangle className="w-6 h-6" /> : <Award className="w-6 h-6" />}
            </div>
            <div>
              <div className="text-[10px] font-mono text-[#38bdf8] uppercase tracking-widest font-semibold">
                Mission report
              </div>
              <h2 className="text-lg font-heading font-bold text-white tracking-wide">
                Marsweave EVA mission report
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-[#1e293b] hover:bg-[#334155] text-gray-200 rounded font-mono text-xs flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print report</span>
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#1e293b] transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Report Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs font-mono">
          {/* Mission Classification Bar */}
          <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div>
              <span className="text-[9px] text-gray-400 block">Mission ID</span>
              <span className="text-sm font-bold text-white">ARCADIA-EVA-01</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-400 block">Primary objective</span>
              <span className="text-sm font-bold text-[#e25c2b]">{profile.objective}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-400 block">Martian date</span>
              <span className="text-sm font-bold text-white">SOL {environment.sol}</span>
            </div>
            <div>
              <span className="text-[9px] text-gray-400 block">Mission result</span>
              {failed ? (
                <span className="text-sm font-bold text-rose-400 flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Failed
                </span>
              ) : overLimit ? (
                <span className="text-sm font-bold text-amber-400 flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Over EVA limit
                </span>
              ) : (
                <span className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Accomplished
                </span>
              )}
            </div>
          </div>

          {failed && failure && (
            <div className="border border-rose-500/50 bg-rose-950/40 rounded p-3 space-y-1 text-rose-100" data-testid="report-failure">
              <div className="font-bold text-rose-300 uppercase tracking-wider">Mission failed: EVA terminated at {Math.round(failure.atSec / 60)} min</div>
              <div>{failureText(failure.cause)} The astronaut covered {coveredKm.toFixed(2)} km of {selectedRoute.totalDistanceKm} km and did not reach the target.</div>
              <div className="text-rose-200/80">Remedy: raise the EVA time limit, pick the shorter route (Route Gamma) or choose a closer target, then plan again.</div>
              <div className="text-[9px] text-rose-200/60">MODELLED from NASA Mars PLSS design values (8 h EVA, 350 W average metabolic rate, 20.9 kJ per litre O2). It is not a flight life-support analysis.</div>
            </div>
          )}
          {overLimit && (
            <div className="border border-amber-500/50 bg-amber-950/30 rounded p-3 text-amber-100" data-testid="report-overlimit">
              The route ran {selectedRoute.timeBudgetExceededMin} min past the {profile.durationMin} min EVA limit. The target was reached, but with thin suit reserves. Treat this plan as unsafe.
            </div>
          )}

          {/* Section 1: Surface Odometry & Travel Profile */}
          <div className="space-y-2">
            <h3 className="text-xs font-heading font-bold text-[#38bdf8] uppercase tracking-wider flex items-center gap-1.5">
              <Mountain className="w-4 h-4" />
              1. SURFACE TRAVERSE & TERRAIN PERFORMANCE
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center bg-[#090d16] border border-gray-800 p-3 rounded">
              <div>
                <span className="text-[9px] text-gray-500 block">Traverse distance</span>
                <span className="text-base font-bold text-white">{selectedRoute.totalDistanceKm} km</span>
              </div>
              <div>
                <span className="text-[9px] text-gray-500 block">Total EVA time</span>
                <span className="text-base font-bold text-[#38bdf8]">{selectedRoute.totalDurationMin} MIN</span>
              </div>
              <div>
                <span className="text-[9px] text-gray-500 block">Average slope</span>
                <span className="text-base font-bold text-emerald-400">{selectedRoute.avgSlopeDeg}°</span>
              </div>
              <div>
                <span className="text-[9px] text-gray-500 block">Max slope encountered</span>
                <span className="text-base font-bold text-gray-300">{selectedRoute.maxSlopeDeg}°</span>
              </div>
            </div>
          </div>

          {/* Section 2: Scientific Harvest Catalog */}
          <div className="space-y-2">
            <h3 className="text-xs font-heading font-bold text-[#facc15] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              2. SCIENTIFIC OBSERVATIONS & ISRU HARVEST
            </h3>
            <div className="bg-[#090d16] border border-gray-800 p-3 rounded space-y-2">
              <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-gray-800">
                <span>Candidate sites visited:</span>
                <span className="font-bold text-[#facc15]">{visitedTargets.length} CANDIDATE SITES</span>
              </div>

              <div className="space-y-1.5">
                {visitedTargets.map(t => (
                  <div key={t.id} className="bg-[#0f172a] p-2 rounded flex items-center justify-between border border-gray-800">
                    <div>
                      <span className="text-[#38bdf8] font-bold mr-2">{t.id}</span>
                      <span className="text-white">{t.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-emerald-400 font-semibold">Candidate</span>
                      <span className="text-[9px] text-gray-500 block">{t.dataSources[0]}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 3: Hazard zones the route passed through */}
          <div className="space-y-2">
            <h3 className="text-xs font-heading font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              3. HAZARD ZONES CROSSED ({crossedZones.length})
            </h3>
            <div className="bg-[#090d16] border border-gray-800 p-3 rounded space-y-2 text-[11px]">
              {crossedZones.length === 0 ? (
                <div className="text-emerald-400">
                  The walked route did not enter any mapped hazard zone. Max slope on the route: {selectedRoute.maxSlopeDeg}°.
                </div>
              ) : (
                crossedZones.map(z => (
                  <div key={z.zoneId} className="border border-gray-800 rounded p-2 bg-[#0f172a]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white font-semibold">{z.name}</span>
                      <span className={`font-mono text-[10px] font-bold ${z.severity === 'CRITICAL' ? 'text-red-400' : z.severity === 'HIGH_RISK' ? 'text-orange-400' : 'text-amber-300'}`}>
                        {z.severity.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-gray-400 text-[10px] mt-0.5">
                      {z.type.replace(/_/g, ' ')} · crossed from {(z.fromM / 1000).toFixed(2)} km to {(z.toM / 1000).toFixed(2)} km
                      {' '}({Math.max(0, z.toM - z.fromM)} m of route) · steepest slope on route inside the zone {z.maxSlopeDeg}° · entered near {z.lat.toFixed(3)}°N, {z.lon.toFixed(3)}°W
                    </div>
                    <div className="text-gray-300 text-[10px] mt-1">Hazard: {z.description}</div>
                    <div className="text-gray-400 text-[10px] mt-0.5">Why it matters: {z.avoidanceRationale}</div>
                  </div>
                ))
              )}
              <div className="text-[9px] text-gray-600">
                Zones are DERIVED from the real elevation grid (slope clusters and a modelled relay shadow); slopes are averaged over grid cells of about 320 m, so real local slopes can be steeper. Boulders are not resolved. Only the part of the route actually walked is listed.
              </div>
            </div>
          </div>

          {/* Section 4: Safety & Life-Support Margins */}
          <div className="space-y-2">
            <h3 className="text-xs font-heading font-bold text-[#10b981] uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              4. ASTRONAUT SAFETY & LOGISTICS MARGINS
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 bg-[#090d16] border border-gray-800 p-3 rounded">
              <div>
                <span className="text-[9px] text-gray-500 block">Final suit battery</span>
                <span className="text-sm font-bold text-amber-400">
                  {Math.round(astronautTelemetry.suitBatteryRemainingPct)}% REMAINING
                </span>
              </div>
              <div>
                <span className="text-[9px] text-gray-500 block">Final primary O2</span>
                <span className="text-sm font-bold text-emerald-400">
                  {Math.round(astronautTelemetry.suitO2RemainingPct)}% REMAINING
                </span>
              </div>
              <div>
                <span className="text-[9px] text-gray-500 block">MRO relay link</span>
                <span className="text-sm font-bold text-[#38bdf8]">
                  {selectedRoute.commsCoveragePct}% AVERAGE
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Data Provenance & Archival Citations */}
          <div className="pt-2 border-t border-gray-800 text-[10px] text-gray-500 space-y-1">
            <div className="font-bold text-gray-400">NASA dataset & mission integration credits:</div>
            <div>• MOLA-HRSC blended DEM (USGS) • SWIM2 ice-consistency map (Morgan et al. 2021) • THEMIS thermal inertia (Odyssey, display only)</div>
            <div>• Viking MDIM brightness • LMD dust optical depth (MY34) • NAIF SPICE MRO passes • MSL RAD and Mars 2020 MEDA published reference values</div>
            <div className="text-[9px] text-gray-600 mt-2">
              Generated by MARSWEAVE Autonomous EVA Planning Engine. Referenced to Mars MOLA 0-datum.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#1e293b] bg-[#0d1322] flex items-center justify-between print:hidden">
          <button
            onClick={() => {
              onRestartMission();
              onClose();
            }}
            className="px-4 py-2 bg-[#1e293b] hover:bg-[#334155] text-white rounded font-mono text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Start new mission</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#38bdf8] hover:bg-[#0284c7] text-black font-heading font-bold text-xs rounded transition shadow"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
