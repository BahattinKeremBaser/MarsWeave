/**
 * MARSWEAVE — Scientific Target Inspector & Multi-Mission Evidence Chain Modal
 */

import { targetKindLabel } from '../../data/arcadiaData';
import React from 'react';
import { ScienceTarget } from '../../types/marsweave';
import {
  Sparkles,
  Database,
  ArrowRight,
  ShieldCheck,
  Clock,
  Layers,
  Activity,
  Radio,
  X,
  Target
} from 'lucide-react';

interface ScienceTargetModalProps {
  target: ScienceTarget | null;
  onClose: () => void;
  onSetAsPrimaryTarget: (target: ScienceTarget) => void;
  isPrimaryTarget: boolean;
}

export const ScienceTargetModal: React.FC<ScienceTargetModalProps> = ({
  target,
  onClose,
  onSetAsPrimaryTarget,
  isPrimaryTarget
}) => {
  if (!target) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#0b0f19] border border-[#1e293b] rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#38bdf8]/15 text-[#38bdf8] rounded border border-[#38bdf8]/30">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-[#38bdf8]">{target.id}</span>
                <span className="text-[10px] font-mono bg-[#1e293b] text-gray-400 px-1.5 py-0.5 rounded uppercase">
                  {targetKindLabel(target)}
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                  Candidate, NOT a detection
                </span>
              </div>
              <h2 className="text-base font-heading font-bold text-white tracking-wide mt-0.5">
                {target.name}
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

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Coordinates & Scientific Metrics */}
          <div className="grid grid-cols-4 gap-2 text-center font-mono">
            <div className="bg-[#0f172a] border border-[#1e293b] p-2 rounded">
              <span className="text-[9px] text-gray-400 block">Scientific value</span>
              <span className="text-base font-bold text-[#facc15]">Best cell for its rule</span>
            </div>
            <div className="bg-[#0f172a] border border-[#1e293b] p-2 rounded">
              <span className="text-[9px] text-gray-400 block">Lat / lon</span>
              <span className="text-xs font-bold text-white">{target.lat}°N, {target.lon}°W</span>
            </div>
            <div className="bg-[#0f172a] border border-[#1e293b] p-2 rounded">
              <span className="text-[9px] text-gray-400 block">Elevation</span>
              <span className="text-xs font-bold text-[#38bdf8]">{target.elevationMeters} m</span>
            </div>
            <div className="bg-[#0f172a] border border-[#1e293b] p-2 rounded">
              <span className="text-[9px] text-gray-400 block">Observation time</span>
              <span className="text-xs font-bold text-emerald-400">{target.observationTimeMin} MIN</span>
            </div>
          </div>

          {/* Description & Action */}
          <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded space-y-2">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block mb-1">
                Target geology & morphology:
              </span>
              <p className="text-gray-300 leading-relaxed">
                {target.description}
              </p>
            </div>
            <div className="pt-2 border-t border-gray-800">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold block mb-0.5">
                Planning placeholder:
              </span>
              <p className="text-gray-200 font-mono">
                {target.recommendedAction}
              </p>
            </div>
          </div>

          {/* Spectral Reflectance Curve (CRISM) if available */}
          {target.spectralData && (
            <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#10b981] flex items-center gap-1 font-semibold">
                  <Activity className="w-3.5 h-3.5" />
                  CRISM HYPERSPECTRAL REFLECTANCE SPECTRUM (0.4 - 2.5 µm)
                </span>
                <span className="text-[9px] font-mono text-gray-500">MRO CRISM targeted mode</span>
              </div>

              {/* Spectral Graph Visualization */}
              <div className="h-28 bg-[#090d16] border border-gray-800 rounded p-2 relative flex items-end justify-between gap-1">
                {target.spectralData.wavelengthMicrons.map((wave, idx) => {
                  const refl = target.spectralData!.reflectance[idx];
                  const heightPct = Math.round(refl * 280);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                      <div
                        className="w-full bg-[#10b981]/70 hover:bg-[#10b981] rounded-t transition"
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="text-[8px] font-mono text-gray-500 mt-1">{wave}µ</span>
                    </div>
                  );
                })}
              </div>

              {/* Key Diagnostic Absorption Bands */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {target.spectralData.absorptionBands.map((band, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] font-mono bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/30 px-2 py-0.5 rounded"
                  >
                    DIAGNOSTIC: {band}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Radar Echo Dielectric Profile (SHARAD) if available */}
          {target.radarData && (
            <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#06b6d4] flex items-center gap-1 font-semibold">
                  <Radio className="w-3.5 h-3.5" />
                  SHARAD subsurface radar sounding
                </span>
                <span className="text-[9px] font-mono text-gray-500">MRO SHARAD 15-25 MHz CHIRP</span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-center">
                <div className="bg-[#090d16] p-2 rounded border border-gray-800">
                  <span className="text-[9px] text-gray-400 block">Estimated depth</span>
                  <span className="text-xs font-bold text-white">~{target.radarData.depthMeters} METERS</span>
                </div>
                <div className="bg-[#090d16] p-2 rounded border border-gray-800">
                  <span className="text-[9px] text-gray-400 block">Dielectric constant</span>
                  <span className="text-xs font-bold text-[#06b6d4]">ε = {target.radarData.dielectricConstant}</span>
                </div>
                <div className="bg-[#090d16] p-2 rounded border border-gray-800">
                  <span className="text-[9px] text-gray-400 block">Est. ice purity</span>
                  <span className="text-xs font-bold text-emerald-400">{target.radarData.icePurityPct}% H2O ICE</span>
                </div>
              </div>
            </div>
          )}

          {/* THE MULTI-MISSION EVIDENCE CHAIN */}
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#38bdf8] font-semibold mb-2.5 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>NASA data evidence chain</span>
            </div>

            <div className="space-y-3">
              {target.evidenceChain.map((step, idx) => (
                <div
                  key={idx}
                  className="bg-[#0f172a] border border-[#1e293b] p-3 rounded relative"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-gray-400 mb-1">
                    <span className="text-[#38bdf8] font-bold">
                      STEP {idx + 1}: {step.instrument} ({step.mission})
                    </span>
                    <span className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-[8.5px]">
                      Layer values at this cell
                    </span>
                  </div>

                  <div className="text-gray-200 mb-1">
                    <span className="text-gray-400 font-mono text-[10px]">Observation: </span>
                    {step.observation}
                  </div>

                  <div className="text-gray-300 mb-1">
                    <span className="text-gray-400 font-mono text-[10px]">Derived Property: </span>
                    {step.derivedProperty}
                  </div>

                  <div className="text-emerald-300 font-mono text-[10.5px]">
                    <span className="text-gray-400 font-mono text-[10px]">Significance: </span>
                    {step.scientificSignificance}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <div className="text-[10px] font-mono text-gray-400">
            DATA ARCHIVAL SOURCES: {target.dataSources.join(' • ')}
          </div>

          <button
            onClick={() => {
              onSetAsPrimaryTarget(target);
              onClose();
            }}
            disabled={isPrimaryTarget}
            className={`px-4 py-2 rounded font-heading font-semibold text-xs tracking-wider transition ${
              isPrimaryTarget
                ? 'bg-gray-800 text-gray-400 cursor-default'
                : 'bg-gradient-to-r from-[#38bdf8] to-[#0284c7] hover:from-[#0ea5e9] hover:to-[#0369a1] text-white shadow-lg cursor-pointer'
            }`}
          >
            {isPrimaryTarget ? 'CURRENT PRIMARY TARGET' : 'SET AS PRIMARY EVA TARGET'}
          </button>
        </div>
      </div>
    </div>
  );
};
