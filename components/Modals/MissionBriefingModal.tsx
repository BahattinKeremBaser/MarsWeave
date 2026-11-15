/**
 * MARSWEAVE — Pre-EVA Mission Briefing Modal
 * Provides a formal aerospace flight readiness briefing before surface traversal.
 */

import React from 'react';
import { MissionProfile } from '../../types/marsweave';
import { EVA_DESIGN_MIN, METABOLIC_AVG_W, o2GramsPerMin, RESERVE_MIN } from '../../engine/evaPhysiology';
import { TAU_TYPICAL } from '../../data/arcadiaData';
import {
  Compass,
  ArrowRight,
  ShieldAlert,
  Clock,
  Radio,
  Battery,
  Sparkles,
  Mountain,
  CheckCircle2,
  X
} from 'lucide-react';

interface MissionBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBeginMission: () => void;
  profile: MissionProfile;
}

export const MissionBriefingModal: React.FC<MissionBriefingModalProps> = ({
  isOpen,
  onClose,
  onBeginMission,
  profile
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#0f131c] border border-[#222a38] max-w-xl w-full flex flex-col overflow-hidden text-[#d6d9e0] shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-[#141822] hairline-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#c85a32]" />
            <div>
              <div className="text-[10px] font-mono text-[#c85a32] tracking-wider uppercase font-semibold">
                Walkthrough
              </div>
              <h2 className="text-base font-bold text-white font-sans tracking-tight">
                Mission briefing (SIMULATED EVA)
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b95a5] hover:text-white p-1 rounded hover:bg-[#1a202c] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Briefing Body */}
        <div className="p-6 space-y-6 text-xs font-sans">
          {/* Mission Identification Strip */}
          <div className="bg-[#0b0e14] p-4 border border-[#1c2230] grid grid-cols-2 gap-4 font-mono text-xs">
            <div>
              <span className="text-[10px] text-[#6b7788] block uppercase">Study window</span>
              <span className="text-sm font-semibold text-white">Arcadia Planitia</span>
              <span className="text-[10px] text-[#8b95a5] block mt-0.5">39.3°N, 171.4°W</span>
            </div>
            <div>
              <span className="text-[10px] text-[#6b7788] block uppercase">Mission window</span>
              <span className="text-sm font-semibold text-[#3898b8]">{profile.durationMin} MIN</span>
              <span className="text-[10px] text-[#8b95a5] block mt-0.5">EVA time limit you set; scenario sol 342, afternoon</span>
            </div>
          </div>

          {/* Primary Objective & Scope */}
          <div className="space-y-2">
            <span className="font-mono text-[10px] text-[#c85a32] uppercase tracking-wider block font-semibold">
              Primary mission directive
            </span>
            <div className="bg-[#0b0e14] p-4 border border-[#1c2230] space-y-2">
              <h3 className="text-sm font-bold text-white">
                {profile.objective === 'WATER'
                  ? 'Visit the candidate ice-index site'
                  : profile.objective === 'MINERALOGY'
                  ? 'Visit candidate sites (no mineral map is loaded)'
                  : profile.objective === 'GEOLOGY'
                  ? 'Visit the steepest-slope and depression candidates'
                  : 'Multi-site surface reconnaissance'}
              </h3>
              <p className="text-xs text-[#8b95a5] leading-relaxed">
                The simulated crew leaves Habitat Alpha (a hypothetical base), follows the planned route and ends at the selected candidate site. Candidate sites are rule-based picks from real map layers, not confirmed finds.
              </p>
            </div>
          </div>

          {/* Operational Constraints Strip */}
          <div className="space-y-2">
            <span className="font-mono text-[10px] text-[#8b95a5] uppercase tracking-wider block font-semibold">
              Planning envelope
            </span>
            <div className="grid grid-cols-3 gap-2 font-mono text-center">
              <div className="bg-[#0b0e14] p-2.5 border border-[#1c2230]">
                <span className="text-[9px] text-[#6b7788] block">Science priority</span>
                <span className="text-xs font-semibold text-white">{profile.sciencePriority}</span>
              </div>
              <div className="bg-[#0b0e14] p-2.5 border border-[#1c2230]">
                <span className="text-[9px] text-[#6b7788] block">Risk tolerance</span>
                <span className="text-xs font-semibold text-[#c85a32]">{profile.riskTolerance}</span>
              </div>
              <div className="bg-[#0b0e14] p-2.5 border border-[#1c2230]">
                <span className="text-[9px] text-[#6b7788] block">Carried load</span>
                <span className="text-xs font-semibold text-[#3898b8]">{profile.payloadKg} KG</span>
              </div>
            </div>
          </div>

          {/* Consumables Checklist */}
          <div className="space-y-1 text-xs font-mono text-[#8b95a5]">
            <div className="flex items-center gap-2 text-[#48b577]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Suit oxygen: design EVA is {EVA_DESIGN_MIN / 60} h at {METABOLIC_AVG_W} W, about {((o2GramsPerMin(METABOLIC_AVG_W) * EVA_DESIGN_MIN) / 1000).toFixed(2)} kg O₂ (NASA Mars PLSS studies)</span>
            </div>
            <div className="flex items-center gap-2 text-[#48b577]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Suit battery: {EVA_DESIGN_MIN / 60} h design life, {RESERVE_MIN} min reserve warning</span>
            </div>
            <div className="flex items-center gap-2 text-[#48b577]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Dust optical depth (tau): {TAU_TYPICAL.toFixed(2)} (LMD climatology, regional)</span>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-[#141822] hairline-t flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-mono text-[#8b95a5] hover:text-white transition"
          >
            Dismiss briefing
          </button>

          <button
            onClick={() => {
              onBeginMission();
              onClose();
            }}
            className="px-5 py-2.5 bg-[#c85a32] hover:bg-[#b54f2a] text-white font-sans font-semibold text-xs rounded transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <span>Begin EVA mission</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
