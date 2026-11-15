/**
 * MARSWEAVE — NASA Space Apps Challenge Jury Tour & Presentation Mode
 * 2-3 minute guided walkthrough demonstrating:
 * 1. Heterogeneous NASA Data Fusion
 * 2. Multi-Objective A* Route Optimization
 * 3. Explainable "WHY THIS ROUTE?"
 * 4. In-Situ Scientific Sampling
 * 5. Dynamic Environmental Adaptation (Dust Surge Re-planning)
 * 6. Mission Debrief & Provenance
 */

import React, { useState } from 'react';
import {
  Compass,
  Play,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  X,
  Sparkles,
  ShieldAlert,
  Database,
  RefreshCw,
  Award
} from 'lucide-react';

interface JuryTourStep {
  title: string;
  tag: string;
  description: string;
  actionText: string;
  highlight: string;
  onApplyStep?: () => void;
}

interface JuryTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTriggerPlanEva: () => void;
  onSelectScienceObjective: (obj: any) => void;
  onToggleLayer: (id: string) => void;
  onTriggerDustScenario: () => void;
  onTriggerReplanning: () => void;
  onOpenReport: () => void;
  onOpenProvenance: () => void;
}

export const JuryTourModal: React.FC<JuryTourModalProps> = ({
  isOpen,
  onClose,
  onTriggerPlanEva,
  onSelectScienceObjective,
  onToggleLayer,
  onTriggerDustScenario,
  onTriggerReplanning,
  onOpenReport,
  onOpenProvenance
}) => {
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);

  if (!isOpen) return null;

  const steps: JuryTourStep[] = [
    {
      title: 'The core paradigm',
      tag: 'Challenge solution',
      description: 'A map with toggles is not enough for someone who has to walk on Mars. This prototype turns real NASA orbital data into a route plan that explains itself.',
      highlight: '"The best route is mission-dependent."',
      actionText: 'Start guided demo'
    },
    {
      title: '1. Real NASA data on one grid',
      tag: 'OBSERVE',
      description: 'MARSWEAVE puts the MOLA-HRSC elevation model, the SWIM2 ice index, dust climatology, MRO orbit geometry and published MSL RAD / MEDA values onto one grid, each with an honest status label.',
      highlight: 'Real NASA/USGS products on a 16 km window of Arcadia Planitia.',
      actionText: 'Next: plan routes'
    },
    {
      title: '2. Routes that depend on the goal',
      tag: 'PLAN',
      description: 'Unlike a plain shortest-path search, MARSWEAVE weighs slope, DEM-derived hazard cells, modelled comms coverage, candidate sampling sites and suit consumables.',
      highlight: 'Computes Route Alpha (Balanced), Route Beta (Science Yield), and Route Gamma (Direct).',
      actionText: 'Plan routes',
      onApplyStep: () => {
        onTriggerPlanEva();
      }
    },
    {
      title: '3. Why this route?',
      tag: 'UNDERSTAND',
      description: 'The system shows why Route Alpha was selected with live numbers from the planner: distance, slope, hazard score and candidate sites passed.',
      highlight: 'Every number comes from the planner, not from a script.',
      actionText: 'Next: in-situ sampling'
    },
    {
      title: '4. Walking the route',
      tag: 'Walk & discover',
      description: 'As the astronaut traverses the route, life support telemetry updates in real-time. Approaching a candidate site prompts a card listing the real layer values behind that pick (not an instrument detection).',
      highlight: 'Simulates walking cost, suit oxygen and battery from published NASA and peer-reviewed figures.',
      actionText: 'Simulate dust surge event',
      onApplyStep: () => {
        onTriggerDustScenario();
      }
    },
    {
      title: '5. When conditions change',
      tag: 'ADAPT',
      description: 'When you apply a dust scenario, MARSWEAVE re-plans the route and shows the change in time, hazard and comms.',
      highlight: 'Side-by-side comparison with the real computed deltas for the scenario you chose.',
      actionText: 'Trigger dynamic replan',
      onApplyStep: () => {
        onTriggerReplanning();
      }
    },
    {
      title: '6. The report',
      tag: 'Debrief & citations',
      description: 'At the end of the walk, a report lists the route, simulated consumables, the radiation proxy and the outcome, with sources.',
      highlight: 'Scientific transparency: every layer is labelled REAL, DERIVED, MODELLED or SIMULATED.',
      actionText: 'View mission report',
      onApplyStep: () => {
        onOpenReport();
      }
    }
  ];

  const currentStep = steps[currentStepIdx];

  const handleNext = () => {
    if (currentStep.onApplyStep) {
      currentStep.onApplyStep();
    }
    if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(i => i + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(i => i - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="bg-[#0b0f19] border border-[#e25c2b]/50 rounded-lg shadow-2xl max-w-xl w-full flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#e25c2b]/20 text-[#e25c2b] rounded">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono text-[#e25c2b] tracking-widest font-semibold block">
                NASA space apps 2026 jury presentation
              </span>
              <h2 className="text-base font-heading font-bold text-white tracking-wide">
                Marsweave 2-MINUTE demo flow
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded hover:bg-[#1e293b]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono bg-amber-500/15 border border-amber-500/30 text-amber-300 px-2 py-0.5 rounded font-semibold">
              STEP {currentStepIdx + 1} OF {steps.length} • {currentStep.tag}
            </span>
            <div className="flex gap-1">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-4 h-1.5 rounded-full transition ${
                    idx === currentStepIdx
                      ? 'bg-[#e25c2b]'
                      : idx < currentStepIdx
                      ? 'bg-emerald-500'
                      : 'bg-gray-800'
                  }`}
                />
              ))}
            </div>
          </div>

          <h3 className="text-base font-heading font-bold text-white tracking-wide">
            {currentStep.title}
          </h3>

          <p className="text-xs text-gray-300 leading-relaxed font-sans">
            {currentStep.description}
          </p>

          <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded text-center">
            <span className="text-xs font-mono font-bold text-[#38bdf8]">
              {currentStep.highlight}
            </span>
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-[#1e293b] bg-[#0c121e] flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={currentStepIdx === 0}
            className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-gray-300 font-mono text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            onClick={handleNext}
            className="px-5 py-2 rounded bg-gradient-to-r from-[#e25c2b] to-[#ea580c] hover:from-[#d14f20] hover:to-[#c2410c] text-white font-heading font-bold text-xs tracking-wider shadow-lg shadow-[#e25c2b]/25 flex items-center gap-2 transition cursor-pointer"
          >
            <span>{currentStep.actionText}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
