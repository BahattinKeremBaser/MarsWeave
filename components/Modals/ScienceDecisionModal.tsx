/**
 * MARSWEAVE — In-Situ Science Decision Modal
 * When an astronaut arrives at a waypoint, presents distinct operational protocols
 * with explicit time, energy, and scientific return trade-offs.
 */

import { targetKindLabel } from '../../data/arcadiaData';
import React from 'react';
import { ScienceTarget } from '../../types/marsweave';
import {
  Target,
  Sparkles,
  Camera,
  Activity,
  Compass,
  ArrowRight,
  Clock,
  Zap,
  X
} from 'lucide-react';

export interface ScienceDecisionAction {
  id: 'SPECTRAL' | 'IMAGING' | 'ASSESSMENT' | 'SKIP';
  name: string;
  desc: string;
  scienceBonus: number;
  timeCostMin: number;
  energyCostPct: number;
}

interface ScienceDecisionModalProps {
  isOpen: boolean;
  target: ScienceTarget | null;
  onSelectAction: (action: ScienceDecisionAction) => void;
  onClose: () => void;
  remainingTimeMin: number;
  batteryPct: number;
}

export const ScienceDecisionModal: React.FC<ScienceDecisionModalProps> = ({
  isOpen,
  target,
  onSelectAction,
  onClose,
  remainingTimeMin,
  batteryPct
}) => {
  if (!isOpen || !target) return null;

  // Calculate scaled consequences based on target's innate scientific value
  const baseValue = target.scientificValue;

  const actions: ScienceDecisionAction[] = [
    {
      id: 'SPECTRAL',
      name: 'Deep spectral observation & core drill',
      desc: 'Deploy VNIR contact spectrometer and drill 10cm regolith core sample.',
      scienceBonus: Math.round(baseValue * 0.22),
      timeCostMin: target.observationTimeMin,
      energyCostPct: 4
    },
    {
      id: 'IMAGING',
      name: 'High-resolution stereo imaging',
      desc: 'Capture 3D macro-photogrammetric sweep of layered bench fractures.',
      scienceBonus: Math.round(baseValue * 0.14),
      timeCostMin: Math.max(3, Math.round(target.observationTimeMin * 0.5)),
      energyCostPct: 2
    },
    {
      id: 'ASSESSMENT',
      name: 'Rapid site assessment & sniffer',
      desc: 'Log visual geological contact and take ambient volatile desorption measurement.',
      scienceBonus: Math.round(baseValue * 0.08),
      timeCostMin: Math.max(2, Math.round(target.observationTimeMin * 0.3)),
      energyCostPct: 1
    },
    {
      id: 'SKIP',
      name: 'Bypass waypoint (continue traverse)',
      desc: 'Conserve suit consumables and proceed immediately toward final destination.',
      scienceBonus: 0,
      timeCostMin: 0,
      energyCostPct: 0
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#0f131c] border border-[#222a38] max-w-xl w-full flex flex-col overflow-hidden text-[#d6d9e0] shadow-2xl">
        {/* Header */}
        <div className="p-4 bg-[#141822] hairline-b flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#3898b8]/15 text-[#3898b8] rounded border border-[#3898b8]/30">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-[#3898b8] tracking-wider uppercase font-semibold">
                Waypoint intercept
              </div>
              <h2 className="text-sm font-bold text-white font-sans tracking-tight">
                SCIENCE OPPORTUNITY: {target.id}
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

        {/* Content */}
        <div className="p-5 space-y-4 text-xs font-sans">
          {/* Target Identification */}
          <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
            <div className="flex items-center justify-between font-mono text-[10px] text-[#8b95a5] mb-1">
              <span>{targetKindLabel(target)}</span>
              <span className="text-[#3898b8]">Candidate, NOT a detection</span>
            </div>
            <h3 className="text-sm font-bold text-white font-sans">{target.name}</h3>
            <p className="text-xs text-[#8b95a5] mt-1 leading-relaxed">{target.description}</p>
          </div>

          {/* Vitals Budget Status */}
          <div className="flex items-center justify-between font-mono text-[11px] text-[#8b95a5] px-1">
            <span>Remaining EVA time: <strong className="text-white">{remainingTimeMin} MIN</strong></span>
            <span>Suit battery: <strong className="text-white">{Math.round(batteryPct)}%</strong></span>
          </div>

          {/* Action Decision List */}
          <div className="space-y-2">
            <span className="font-mono text-[10px] text-[#6b7788] uppercase tracking-wider block font-semibold">
              Select in-situ protocol:
            </span>

            {actions.map(action => (
              <button
                key={action.id}
                onClick={() => {
                  onSelectAction(action);
                  onClose();
                }}
                className="w-full text-left p-3 bg-[#0b0e14] hover:bg-[#141822] border border-[#1c2230] hover:border-[#3898b8] transition flex items-center justify-between gap-4 cursor-pointer group"
              >
                <div className="space-y-0.5">
                  <div className="font-mono font-semibold text-xs text-white group-hover:text-[#3898b8] transition">
                    {action.name}
                  </div>
                  <p className="text-[11px] text-[#8b95a5]">{action.desc}</p>
                </div>

                <div className="text-right font-mono text-[10px] shrink-0 space-y-0.5">
                  <div className={action.scienceBonus > 0 ? 'text-[#48b577] font-semibold' : 'text-[#8b95a5]'}>
                    {action.scienceBonus > 0 ? `+${action.scienceBonus} GAME PTS` : '0 GAME PTS'}
                  </div>
                  <div className="text-[#8b95a5]">
                    {action.timeCostMin > 0 ? `-${action.timeCostMin} MIN` : '0 MIN'}
                  </div>
                  <div className="text-[#8b95a5]">
                    {action.energyCostPct > 0 ? `-${action.energyCostPct}% BATT` : '0%'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
