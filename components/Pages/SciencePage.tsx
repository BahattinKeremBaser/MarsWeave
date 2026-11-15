/**
 * MARSWEAVE — Science & Evidence Chain View
 * Deep exploration of in-situ science targets, CRISM spectral signatures,
 * SHARAD radar dielectric interfaces, and the multi-mission Evidence Chain.
 */

import React, { useState } from 'react';
import { ARCADIA_SCIENCE_TARGETS, targetKindLabel } from '../../data/arcadiaData';
import { ScienceTarget } from '../../types/marsweave';
import {
  Target,
  Sparkles,
  Database,
  ArrowRight,
  Activity,
  Radio,
  Mountain,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';

interface SciencePageProps {
  onLaunchSimulator: () => void;
}

export const SciencePage: React.FC<SciencePageProps> = ({ onLaunchSimulator }) => {
  const [selectedTarget, setSelectedTarget] = useState<ScienceTarget>(ARCADIA_SCIENCE_TARGETS[0]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0d12] text-[#d6d9e0] select-text">
      {/* Top Breadcrumb */}
      <div className="hairline-b bg-[#0e1117] px-6 py-2.5 text-xs font-mono text-[#8b95a5]">
        <span>Marsweave</span> <span className="text-gray-600">/</span> <span className="text-white">Site selection from REAL layers</span>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 space-y-12">
        {/* Title Header */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-block text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">
            Candidate sites
          </div>
          <h1 className="text-3xl md:text-5xl font-sans font-bold tracking-tight text-white leading-tight">
            How MARSWEAVE Picks Candidate Sites
          </h1>
          <p className="text-sm md:text-base text-[#9ba5b5] font-sans leading-relaxed">
            In human planetary exploration, every meter walked must have a clear geological or resource extraction rationale. MARSWEAVE generates verifiable <em>Evidence Chains</em> from the real layers that are loaded (DEM, ice index, thermal inertia). They are candidates to check, not detections.
          </p>
        </div>

        {/* Target Selector Tabs */}
        <div className="hairline-b pb-4 flex flex-wrap gap-2">
          {ARCADIA_SCIENCE_TARGETS.map(t => {
            const isSelected = t.id === selectedTarget.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTarget(t)}
                className={`px-4 py-2 font-mono text-xs transition border flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-[#141a26] border-[#3898b8] text-white font-semibold'
                    : 'bg-[#10141d] border-[#1c2230] text-[#8b95a5] hover:border-gray-700 hover:text-white'
                }`}
              >
                <span>{t.id}</span>
                <span className="text-[10px] text-[#6b7788] hidden sm:inline">
                  {targetKindLabel(t)}
                </span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#3898b8]" />}
              </button>
            );
          })}
        </div>

        {/* Selected Target Deep Dive */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Target Overview & Metrics */}
          <div className="lg:col-span-5 bg-[#10141d] border border-[#1c2230] p-6 space-y-6">
            <div className="hairline-b pb-4">
              <div className="flex items-center gap-2 text-xs font-mono text-[#3898b8] mb-1">
                <span>{selectedTarget.id}</span>
                <span className="text-[#647082]">•</span>
                <span className="uppercase">{targetKindLabel(selectedTarget)}</span>
              </div>
              <h2 className="text-xl font-bold text-white font-sans tracking-tight">
                {selectedTarget.name}
              </h2>
              <p className="text-xs text-[#8b95a5] font-sans mt-2 leading-relaxed">
                {selectedTarget.description}
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
                <span className="text-[10px] text-[#6b7788] block">Selection</span>
                <span className="text-base font-bold text-[#c85a32]">
                  Best cell for its rule
                </span>
              </div>
              <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
                <span className="text-[10px] text-[#6b7788] block">Evidence status</span>
                <span className="text-base font-bold text-[#3898b8]">
                  Candidate, NOT a detection
                </span>
              </div>
              <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
                <span className="text-[10px] text-[#6b7788] block">Elevation</span>
                <span className="text-white font-semibold">{selectedTarget.elevationMeters} m (MOLA)</span>
              </div>
              <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
                <span className="text-[10px] text-[#6b7788] block">Required time</span>
                <span className="text-white font-semibold">{selectedTarget.observationTimeMin} MIN (ASSUMED)</span>
              </div>
            </div>

            {/* Protocol */}
            <div>
              <span className="font-mono text-[10px] text-[#8b95a5] uppercase tracking-wider block mb-1">
                Planning placeholder:
              </span>
              <p className="text-xs font-mono text-white bg-[#0b0e14] p-3 border border-[#1c2230]">
                {selectedTarget.recommendedAction}
              </p>
            </div>

            {/* Spectral or Radar Component */}
            {selectedTarget.spectralData && (
              <div className="bg-[#0b0e14] p-4 border border-[#1c2230] space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px] text-[#3898b8]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Activity className="w-3.5 h-3.5" />
                    CRISM absorption profile
                  </span>
                  <span className="text-[#6b7788] text-[9px]">0.4 - 2.5 µM</span>
                </div>
                <div className="h-20 flex items-end gap-1.5 pt-2 hairline-b pb-2">
                  {selectedTarget.spectralData.wavelengthMicrons.map((wave, idx) => {
                    const refl = selectedTarget.spectralData!.reflectance[idx];
                    const h = Math.round(refl * 280);
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                        <div
                          className="w-full bg-[#3898b8]/80 hover:bg-[#3898b8] transition"
                          style={{ height: `${h}%` }}
                        />
                        <span className="text-[8px] text-[#6b7788] mt-1">{wave}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-1 text-[10px]">
                  {selectedTarget.spectralData.absorptionBands.map((band, idx) => (
                    <div key={idx} className="text-[#8b95a5]">
                      • {band}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedTarget.radarData && (
              <div className="bg-[#0b0e14] p-4 border border-[#1c2230] space-y-2 font-mono text-xs">
                <div className="flex items-center gap-1.5 text-[#3898b8] font-semibold text-[11px]">
                  <Radio className="w-3.5 h-3.5" />
                  <span>Radar reflectivity</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div>
                    <span className="text-[9px] text-[#6b7788] block">Ice depth</span>
                    <span className="text-white font-semibold">~{selectedTarget.radarData.depthMeters}m</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#6b7788] block">Dielectric</span>
                    <span className="text-[#3898b8] font-semibold">ε = {selectedTarget.radarData.dielectricConstant}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#6b7788] block">Ice purity</span>
                    <span className="text-white font-semibold">{selectedTarget.radarData.icePurityPct}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: The Evidence Chain Signature Component */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-[#10141d] border border-[#1c2230] p-6 space-y-6">
              <div className="hairline-b pb-3">
                <span className="text-[10px] font-mono text-[#c85a32] uppercase tracking-wider block mb-0.5">
                  Where the evidence comes from
                </span>
                <h3 className="text-lg font-bold text-white font-sans tracking-tight">
                  Layer values behind this pick
                </h3>
                <p className="text-xs text-[#8b95a5] font-sans mt-1">
                  The real layer values at this cell. No instrument has confirmed anything here.
                </p>
              </div>

              {/* Step Sequence */}
              <div className="space-y-4">
                {selectedTarget.evidenceChain.map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="bg-[#0b0e14] border border-[#1c2230] p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono hairline-b pb-2">
                        <span className="font-semibold text-white">
                          TIER {idx + 1}: {step.instrument} ({step.mission})
                        </span>
                        <span className="text-[9px] text-[#3898b8] bg-[#141a26] px-1.5 py-0.5 rounded">
                          From loaded layers
                        </span>
                      </div>

                      <div className="text-xs font-sans text-[#cdd3de] space-y-1">
                        <div>
                          <span className="font-mono text-[10px] text-[#6b7788] uppercase block">Direct Observation:</span>
                          <span className="text-[#cdd3de]">{step.observation}</span>
                        </div>
                        <div className="pt-1">
                          <span className="font-mono text-[10px] text-[#6b7788] uppercase block">Physical Inference:</span>
                          <span className="text-[#8b95a5]">{step.derivedProperty}</span>
                        </div>
                        <div className="pt-1">
                          <span className="font-mono text-[10px] text-[#3898b8] uppercase block">Mission Significance:</span>
                          <span className="text-white font-medium">{step.scientificSignificance}</span>
                        </div>
                      </div>
                    </div>

                    {/* Step Arrow */}
                    {idx < selectedTarget.evidenceChain.length - 1 && (
                      <div className="flex justify-center my-2 text-[#6b7788]">
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Final Synthesis Node */}
                <div className="bg-[#141a26] border border-[#3898b8] p-4 text-xs font-mono flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#3898b8] block uppercase">Synthesized conclusion</span>
                    <span className="text-sm font-bold text-white">{selectedTarget.name}</span>
                  </div>
                  <span className="text-xs text-[#3898b8] font-bold">
                    Candidate for a visit
                  </span>
                </div>
              </div>
            </div>

            <div className="hairline-t pt-4 flex items-center justify-between">
              <span className="text-xs font-mono text-[#8b95a5]">Simulate an astronaut visit to this target</span>
              <button
                onClick={onLaunchSimulator}
                className="px-4 py-2 bg-[#c85a32] hover:bg-[#b54f2a] text-white text-xs font-mono rounded transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>Open in simulator</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
