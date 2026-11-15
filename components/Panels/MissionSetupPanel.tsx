/**
 * MARSWEAVE — Mission Setup & EVA Parameter Configuration Panel
 */

import { effectiveSpeedMpm, planningSlopeLimitDeg } from '../../engine/routeOptimizer';
import React from 'react';
import {
  MissionObjectiveType,
  RiskToleranceType,
  PriorityLevel,
  MissionProfile,
  ScienceTarget
} from '../../types/marsweave';
import { HABITAT_ALPHA } from '../../data/arcadiaData';
import {
  Compass,
  Clock,
  ShieldAlert,
  Sparkles,
  Radio,
  Play,
  CheckCircle2,
  Navigation
} from 'lucide-react';

interface MissionSetupPanelProps {
  profile: MissionProfile;
  onChangeProfile: (profile: MissionProfile) => void;
  scienceTargets: ScienceTarget[];
  selectedTargetId: string;
  onSelectTargetId: (id: string) => void;
  onPlanEva: () => void;
  isPlanning: boolean;
}

export const MissionSetupPanel: React.FC<MissionSetupPanelProps> = ({
  profile,
  onChangeProfile,
  scienceTargets,
  selectedTargetId,
  onSelectTargetId,
  onPlanEva,
  isPlanning
}) => {
  const objectives: { type: MissionObjectiveType; label: string; icon: string; desc: string }[] = [
    {
      type: 'WATER',
      label: 'Water & ice',
      icon: '🧊',
      desc: 'Pulls the route toward cells with a higher SWIM2 ice-consistency index (coarse map, not a detection).'
    },
    {
      type: 'MINERALOGY',
      label: 'Mineralogy',
      icon: '🧪',
      desc: 'Weights candidate sites more. No mineral map is loaded (CRISM is not), so this is a planner weighting only.'
    },
    {
      type: 'GEOLOGY',
      label: 'Geology',
      icon: '🪨',
      desc: 'Weights candidate sites and tolerates slightly steeper slopes. No geologic map is loaded.'
    },
    {
      type: 'TERRAIN_SURVEY',
      label: 'Terrain survey',
      icon: '🧭',
      desc: 'Avoids hazard cells more strongly and prefers shorter distance.'
    },
    {
      type: 'MULTI_SCIENCE',
      label: 'Multi-science',
      icon: '✨',
      desc: 'Weights both candidate sites and the ice-consistency index.'
    }
  ];

  return (
    <div className="flex flex-col h-full bg-[#0a0e17] border-r border-[#1a2333] text-gray-200 select-none">
      {/* Panel Header */}
      <div className="p-4 border-b border-[#1a2333] bg-[#0c121e]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#e25c2b]" />
            <h2 className="text-xs font-mono uppercase tracking-widest text-[#e25c2b] font-semibold">
              Plan your walk
            </h2>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Pick a goal, a destination and how much time you have.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* 1. SCIENTIFIC OBJECTIVE SELECTOR */}
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-2">
            1. Goal of the walk
          </label>
          <div className="grid grid-cols-1 gap-2">
            {objectives.map(obj => {
              const isSelected = profile.objective === obj.type;
              return (
                <button
                  key={obj.type}
                  onClick={() => onChangeProfile({ ...profile, objective: obj.type })}
                  className={`text-left p-2.5 rounded transition border flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-[#e25c2b]/15 border-[#e25c2b] text-white shadow-sm'
                      : 'bg-[#0f172a]/60 border-[#1e293b] text-gray-400 hover:border-gray-600 hover:text-gray-200'
                  }`}
                >
                  <span className="text-lg">{obj.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-heading font-semibold tracking-wide text-white">
                        {obj.label}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#e25c2b]" />
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">
                      {obj.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. TARGET SELECTION */}
        <div>
          <label className="block text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-2">
            2. Destination
          </label>
          <select
            value={selectedTargetId}
            onChange={e => onSelectTargetId(e.target.value)}
            className="w-full bg-[#0f172a] border border-[#1e293b] text-xs text-white rounded p-2.5 font-mono focus:border-[#e25c2b] outline-none"
          >
            {scienceTargets.map(target => (
              <option key={target.id} value={target.id}>
                {target.id}: {target.name} (candidate)
              </option>
            ))}
          </select>
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-gray-500 font-mono">
            <span>START: {HABITAT_ALPHA.name}</span>
            <span className="text-[#38bdf8]">Or click map to customize</span>
          </div>
        </div>

        {/* 3. EVA TIME BUDGET */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <span>3. EVA time limit</span>
            </label>
            <span className="text-xs font-mono font-semibold text-white">
              {profile.durationMin} MIN ({(profile.durationMin / 60).toFixed(1)} HR)
            </span>
          </div>
          <input
            type="range"
            min="60"
            max="180"
            step="15"
            value={profile.durationMin}
            onChange={e => onChangeProfile({ ...profile, durationMin: Number(e.target.value) })}
            className="w-full accent-[#e25c2b] h-1.5 bg-gray-800 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-gray-500 mt-1">
            <span>60 min (short)</span>
            <span>120 min (standard)</span>
            <span>180 min (max suit O2)</span>
          </div>
        </div>

        {/* 3b. CARRIED EQUIPMENT (mobility) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400">
              Carried equipment
            </label>
            <span className="text-xs font-mono font-semibold text-white">{profile.payloadKg} KG</span>
          </div>
          <input
            type="range"
            min="0"
            max="40"
            step="5"
            value={profile.payloadKg}
            onChange={e => onChangeProfile({ ...profile, payloadKg: Number(e.target.value) })}
            className="w-full accent-[#e25c2b] h-1.5 bg-gray-800 rounded cursor-pointer"
            data-testid="payload-slider"
          />
          <div className="text-[10px] font-mono text-gray-500 mt-1 leading-snug">
            Level pace {Math.round(effectiveSpeedMpm(profile))} m/min, steepest slope planned {planningSlopeLimitDeg(profile).toFixed(1)}°.
            MODELLED: Minetti walking cost x Mars gravity ratio 0.87 x assumed suited mass, limited by the NASA Mars EVA
            metabolic rate (350 W average, 530 W peak). Sources in the provenance drawer.
          </div>
        </div>

        {/* 4. RISK & SAFETY CONSTRAINTS */}
        <div className="space-y-3 pt-1 border-t border-[#1a2333]">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              <span>Terrain risk tolerance</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['LOW', 'MEDIUM', 'HIGH'] as RiskToleranceType[]).map(rt => (
                <button
                  key={rt}
                  onClick={() => onChangeProfile({ ...profile, riskTolerance: rt })}
                  className={`py-1.5 text-xs font-mono rounded border text-center transition ${
                    profile.riskTolerance === rt
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                      : 'bg-[#0f172a] border-[#1e293b] text-gray-400 hover:text-white'
                  }`}
                >
                  {rt}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase text-gray-400 mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#10b981]" />
                <span>Science priority</span>
              </label>
              <select
                value={profile.sciencePriority}
                onChange={e => onChangeProfile({ ...profile, sciencePriority: e.target.value as PriorityLevel })}
                className="w-full bg-[#0f172a] border border-[#1e293b] text-xs text-white rounded p-1.5 font-mono"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase text-gray-400 mb-1 flex items-center gap-1">
                <Radio className="w-3 h-3 text-[#38bdf8]" />
                <span>Comms priority</span>
              </label>
              <select
                value={profile.commsPriority}
                onChange={e => onChangeProfile({ ...profile, commsPriority: e.target.value as PriorityLevel })}
                className="w-full bg-[#0f172a] border border-[#1e293b] text-xs text-white rounded p-1.5 font-mono"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-4 border-t border-[#1a2333] bg-[#0c121e]">
        <button
          onClick={onPlanEva}
          disabled={isPlanning}
          className="w-full bg-gradient-to-r from-[#e25c2b] to-[#f97316] hover:from-[#d14f20] hover:to-[#ea580c] text-white py-3 rounded font-heading font-bold text-sm tracking-wider shadow-lg shadow-[#e25c2b]/25 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {isPlanning ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Planning the route...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Plan EVA mission</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
