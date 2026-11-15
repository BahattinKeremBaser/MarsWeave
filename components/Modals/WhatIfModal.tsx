/**
 * MARSWEAVE — "WHAT IF?" Dynamic Contingency Scenario Engine Modal
 */

import React, { useState } from 'react';
import {
  WhatIfScenarioOption,
  RouteCandidate,
  RouteComparisonDelta
} from '../../types/marsweave';
import {
  Sparkles,
  AlertTriangle,
  Wind,
  Radio,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  X,
  Play,
  Check
} from 'lucide-react';

interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalRoute: RouteCandidate;
  onApplyScenario: (scenario: WhatIfScenarioOption) => void;
  onSimulateScenario: (scenario: WhatIfScenarioOption) => {
    adaptedRoute: RouteCandidate;
    comparison: RouteComparisonDelta;
  };
}

export const PRESET_WHAT_IF_SCENARIOS: WhatIfScenarioOption[] = [
  {
    id: 'DUST_SURGE_50',
    title: 'Dust Optical Depth Rises to the MY34 Peak (scenario)',
    description: 'A hypothetical scenario: dust optical depth is set to the MY34 maximum from the LMD record, and the planner adds a cost penalty (a planning weight, not a measured effect). Not a forecast or an observation.',
    dustModifier: 1.5,
    commsModifier: 1.0,
    maxTraversableSlope: 18,
    scienceRewardMultiplier: 1.0,
    durationBudgetMin: 120
  },
  {
    id: 'COMMS_BLACKOUT_EARLY',
    title: 'MRO Relay Link Lost Early (scenario)',
    description: 'A hypothetical loss of the orbital link. The re-plan weights modelled comms coverage more heavily.',
    dustModifier: 1.0,
    commsModifier: 2.8, // Heavy penalty on comms shadow
    maxTraversableSlope: 22,
    scienceRewardMultiplier: 0.9,
    durationBudgetMin: 100
  },
  {
    id: 'TRACTION_LIMIT_12DEG',
    title: 'Reduced Mobility (Max Slope 14°, scenario)',
    description: 'A hypothetical limit on the steepest slope the route may use (14° is a scenario value, not a suit specification).',
    dustModifier: 1.0,
    commsModifier: 1.0,
    maxTraversableSlope: 14,
    scienceRewardMultiplier: 0.8,
    durationBudgetMin: 120
  },
  {
    id: 'ICE_PRIORITY_CRITICAL',
    title: 'Ice Prospecting Prioritised (scenario)',
    description: 'A hypothetical priority change that weights the ice-index candidate more heavily in the re-plan.',
    dustModifier: 1.0,
    commsModifier: 1.0,
    maxTraversableSlope: 22,
    scienceRewardMultiplier: 2.5,
    durationBudgetMin: 140
  }
];

export const WhatIfModal: React.FC<WhatIfModalProps> = ({
  isOpen,
  onClose,
  originalRoute,
  onApplyScenario,
  onSimulateScenario
}) => {
  const [selectedScenario, setSelectedScenario] = useState<WhatIfScenarioOption>(PRESET_WHAT_IF_SCENARIOS[0]);

  const simulatedResult = React.useMemo(() => {
    if (!isOpen) return null;
    return onSimulateScenario(selectedScenario);
  }, [isOpen, selectedScenario, onSimulateScenario]);

  if (!isOpen) return null;

  const handleSelectScenario = (sc: WhatIfScenarioOption) => {
    setSelectedScenario(sc);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/15 text-amber-400 rounded border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-amber-400 uppercase tracking-widest font-semibold">
                What-if lab
              </div>
              <h2 className="text-base font-heading font-bold text-white tracking-wide">
                "WHAT IF?" SCENARIO ANALYSIS
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#1e293b] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Preset Scenario Selector */}
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-2 font-semibold">
              Select hypothetical operational stressor
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {PRESET_WHAT_IF_SCENARIOS.map(sc => {
                const isSelected = selectedScenario.id === sc.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() => handleSelectScenario(sc)}
                    className={`p-3 rounded text-left border transition ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                        : 'bg-[#0f172a] border-[#1e293b] text-gray-400 hover:border-gray-600 hover:text-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-heading font-semibold text-xs text-white">
                        {sc.title}
                      </span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-amber-400" />}
                    </div>
                    <p className="text-[10.5px] text-gray-400 line-clamp-2">
                      {sc.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Comparative Metrics (Original vs Scenario) */}
          {simulatedResult && (
            <div className="bg-[#0f172a] border border-[#1e293b] p-4 rounded space-y-4">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#38bdf8] font-semibold flex items-center justify-between">
                <span>Projected mission impact comparison</span>
                <span className="text-gray-400 font-mono text-[10px]">
                  ORIGINAL ({originalRoute.name}) → ADAPTED
                </span>
              </div>

              {/* Side-by-side metric boxes */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-mono">
                {/* Distance */}
                <div className="bg-[#090d16] border border-gray-800 p-2.5 rounded">
                  <span className="text-[9px] text-gray-400 block mb-0.5">Distance</span>
                  <div className="text-xs text-gray-400 line-through">
                    {originalRoute.totalDistanceKm} km
                  </div>
                  <div className="text-sm font-bold text-white">
                    {simulatedResult.adaptedRoute.totalDistanceKm} km
                  </div>
                  <span className={`text-[10px] block mt-0.5 ${simulatedResult.comparison.distanceDeltaKm > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {simulatedResult.comparison.distanceDeltaKm >= 0 ? `+${simulatedResult.comparison.distanceDeltaKm}` : simulatedResult.comparison.distanceDeltaKm} km
                  </span>
                </div>

                {/* Duration */}
                <div className="bg-[#090d16] border border-gray-800 p-2.5 rounded">
                  <span className="text-[9px] text-gray-400 block mb-0.5">EVA time</span>
                  <div className="text-xs text-gray-400 line-through">
                    {originalRoute.totalDurationMin} min
                  </div>
                  <div className="text-sm font-bold text-[#38bdf8]">
                    {simulatedResult.adaptedRoute.totalDurationMin} min
                  </div>
                  <span className={`text-[10px] block mt-0.5 ${simulatedResult.comparison.timeDeltaMin > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {simulatedResult.comparison.timeDeltaMin >= 0 ? `+${simulatedResult.comparison.timeDeltaMin}` : simulatedResult.comparison.timeDeltaMin} min
                  </span>
                </div>

                {/* Hazard Exposure */}
                <div className="bg-[#090d16] border border-gray-800 p-2.5 rounded">
                  <span className="text-[9px] text-gray-400 block mb-0.5">Hazard score</span>
                  <div className="text-xs text-gray-400 line-through">
                    {originalRoute.hazardExposureScore}/100
                  </div>
                  <div className="text-sm font-bold text-emerald-400">
                    {simulatedResult.adaptedRoute.hazardExposureScore}/100
                  </div>
                  <span className={`text-[10px] block mt-0.5 ${simulatedResult.comparison.riskDeltaPct <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {simulatedResult.comparison.riskDeltaPct <= 0 ? `${simulatedResult.comparison.riskDeltaPct}%` : `+${simulatedResult.comparison.riskDeltaPct}%`}
                  </span>
                </div>

                {/* Comms Coverage */}
                <div className="bg-[#090d16] border border-gray-800 p-2.5 rounded">
                  <span className="text-[9px] text-gray-400 block mb-0.5">Comms link</span>
                  <div className="text-xs text-gray-400 line-through">
                    {originalRoute.commsCoveragePct}%
                  </div>
                  <div className="text-sm font-bold text-white">
                    {simulatedResult.adaptedRoute.commsCoveragePct}%
                  </div>
                  <span className={`text-[10px] block mt-0.5 ${simulatedResult.comparison.commsDeltaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {simulatedResult.comparison.commsDeltaPct >= 0 ? `+${simulatedResult.comparison.commsDeltaPct}%` : `${simulatedResult.comparison.commsDeltaPct}%`}
                  </span>
                </div>
              </div>

              {/* Rationale Breakdown */}
              <div className="pt-2 border-t border-gray-800">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider block mb-1.5 font-semibold">
                  Why:
                </span>
                <div className="space-y-1">
                  {simulatedResult.comparison.explanation.map((exp, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-gray-300 font-mono text-[11px]">
                      <span className="text-amber-400">▸</span>
                      <span>{exp}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-mono text-xs transition"
          >
            Discard scenario
          </button>

          <button
            onClick={() => {
              onApplyScenario(selectedScenario);
              onClose();
            }}
            className="px-5 py-2.5 rounded bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-heading font-bold text-xs tracking-wider shadow-lg shadow-amber-500/25 transition cursor-pointer flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-black" />
            <span>Apply contingency route to live mission</span>
          </button>
        </div>
      </div>
    </div>
  );
};
