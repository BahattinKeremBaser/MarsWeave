/**
 * MARSWEAVE — EVA Mission Simulator & Real-Time Telemetry HUD
 * Provides scrubbable mission timeline, live environmental monitoring,
 * science observation event triggers, and dynamic contingency replanning prompts.
 */

import { MEDA_REF } from '../../data/arcadiaData';
import React from 'react';
import {
  EnvironmentalConditions,
  AstronautTelemetry,
  EnvironmentalAlert,
  ScienceTarget
} from '../../types/marsweave';
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  AlertTriangle,
  Radio,
  Wind,
  Thermometer,
  Shield,
  Activity,
  Battery,
  Sparkles,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

interface SimulatorControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  playbackSpeed: number;
  onChangeSpeed: (speed: number) => void;
  currentElapsedSec: number;
  totalDurationSec: number;
  onSeekSec: (sec: number) => void;
  environment: EnvironmentalConditions;
  astronautTelemetry: AstronautTelemetry;
  activeAlert: EnvironmentalAlert | null;
  onTriggerReplanning: () => void;
  onDismissAlert: () => void;
  nearbyScienceTarget: ScienceTarget | null;
  onPerformScienceObservation: (target: ScienceTarget) => void;
  isPerformingObservation: boolean;
}

export const SimulatorControls: React.FC<SimulatorControlsProps> = ({
  isPlaying,
  onTogglePlay,
  onReset,
  playbackSpeed,
  onChangeSpeed,
  currentElapsedSec,
  totalDurationSec,
  onSeekSec,
  environment,
  astronautTelemetry,
  activeAlert,
  onTriggerReplanning,
  onDismissAlert,
  nearbyScienceTarget,
  onPerformScienceObservation,
  isPerformingObservation
}) => {
  const [showTelemetryOnMobile, setShowTelemetryOnMobile] = React.useState<boolean>(false);

  const formatTime = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60);
    const secs = Math.floor(totalSec % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const progressPct = Math.min(100, Math.max(0, (currentElapsedSec / totalDurationSec) * 100));

  return (
    <div className="bg-[#090d16] border-t border-[#1a2333] px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col gap-2 sm:gap-2.5 select-none shadow-2xl relative z-10">
      {/* 1. DYNAMIC CONTINGENCY ALERT BANNER (If Environmental Alert Triggered) */}
      {activeAlert && !activeAlert.resolved && (
        <div className="bg-amber-950/90 border border-amber-500 p-2 sm:p-2.5 rounded shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 animate-pulse">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-500 text-black rounded font-bold text-xs shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-amber-200">
                {activeAlert.title}
              </div>
              <p className="text-[11px] text-amber-300">
                {activeAlert.message}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={onTriggerReplanning}
              className="bg-amber-500 hover:bg-amber-400 text-black px-2.5 sm:px-3 py-1.5 rounded font-mono font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
              <span>Replan EVA route</span>
            </button>
            <button
              onClick={onDismissAlert}
              className="bg-[#1e293b] hover:bg-[#334155] text-gray-300 px-2 py-1.5 rounded font-mono text-xs transition"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* 2. SCIENCE OBSERVATION POPUP (When Astronaut Approaches Target) */}
      {nearbyScienceTarget && (
        <div className="bg-emerald-950/90 border border-emerald-500 p-2 sm:p-2.5 rounded shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-500 text-black rounded font-bold text-xs shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-emerald-200 flex items-center gap-2">
                <span>APPROACHING SCIENCE WAYPOINT: {nearbyScienceTarget.id}</span>
                <span className="text-[10px] bg-emerald-900 text-emerald-300 px-1 rounded">
                  Candidate
                </span>
              </div>
              <p className="text-[11px] text-emerald-300">
                {nearbyScienceTarget.name}: {nearbyScienceTarget.recommendedAction} ({nearbyScienceTarget.observationTimeMin} min)
              </p>
            </div>
          </div>

          <button
            onClick={() => onPerformScienceObservation(nearbyScienceTarget)}
            disabled={isPerformingObservation || astronautTelemetry.completedObservations.includes(nearbyScienceTarget.id)}
            className={`px-3 py-1.5 rounded font-mono font-bold text-xs flex items-center gap-1.5 transition cursor-pointer self-end sm:self-auto ${
              astronautTelemetry.completedObservations.includes(nearbyScienceTarget.id)
                ? 'bg-emerald-900 text-emerald-400 cursor-default'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow'
            }`}
          >
            {isPerformingObservation ? (
              <>
                <div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Sampling cores & spectra...</span>
              </>
            ) : astronautTelemetry.completedObservations.includes(nearbyScienceTarget.id) ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Sample cataloged</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Perform observation</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* 3. TIMELINE SCRUBBER & PLAYBACK CONTROLS */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4">
        {/* Play/Pause & Reset */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            onClick={onTogglePlay}
            className="bg-[#e25c2b] hover:bg-[#d14f20] text-white p-1.5 sm:p-2 rounded transition shadow cursor-pointer active:scale-95"
            title={isPlaying ? 'Pause Simulation [Space]' : 'Play Simulation [Space]'}
          >
            {isPlaying ? <Pause className="w-3.5 sm:w-4 h-3.5 sm:h-4 fill-white" /> : <Play className="w-3.5 sm:w-4 h-3.5 sm:h-4 fill-white" />}
          </button>
          <button
            onClick={onReset}
            className="bg-[#1e293b] hover:bg-[#334155] text-gray-300 p-1.5 sm:p-2 rounded transition active:scale-95"
            title="Reset to T+00:00"
          >
            <RotateCcw className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
          </button>
        </div>

        {/* Speed Toggles */}
        <div className="flex items-center bg-[#0f172a] border border-[#1e293b] p-0.5 rounded text-[9px] sm:text-[10px] font-mono">
          {[1, 2, 5, 10].map(s => (
            <button
              key={s}
              onClick={() => onChangeSpeed(s)}
              className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition ${
                playbackSpeed === s
                  ? 'bg-[#e25c2b] text-white font-bold'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* Time Progress Display */}
        <div className="font-mono text-[11px] sm:text-xs text-gray-300 flex items-center gap-1">
          <span className="text-[#38bdf8] font-bold">{formatTime(currentElapsedSec)}</span>
          <span className="text-gray-500">/</span>
          <span>{formatTime(totalDurationSec)}</span>
        </div>

        {/* Progress Slider */}
        <div className="w-full sm:w-auto sm:flex-1 relative flex items-center order-last sm:order-none">
          <input
            type="range"
            min="0"
            max={totalDurationSec}
            value={currentElapsedSec}
            onChange={e => onSeekSec(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-lg accent-[#e25c2b] cursor-pointer"
          />
        </div>

        {/* Mobile Vitals Toggle Button */}
        <button
          onClick={() => setShowTelemetryOnMobile(v => !v)}
          className="lg:hidden ml-auto px-2 py-1 rounded bg-[#131b29] hover:bg-[#1a2538] border border-[#223048] text-[10px] font-mono text-[#38bdf8] flex items-center gap-1"
        >
          <Activity className="w-3 h-3 text-[#38bdf8]" />
          <span>{showTelemetryOnMobile ? 'HIDE VITALS' : 'VITALS'}</span>
        </button>

        {/* MET & Sol (Desktop) */}
        <div className="hidden lg:flex items-center gap-3 text-xs font-mono text-gray-400">
          <span>SOL {environment.sol}</span>
          <span className="text-white font-semibold">{environment.marsLocalTime}</span>
        </div>
      </div>

      {/* 4. REAL-TIME TELEMETRY BAR (Desktop: always visible, Mobile: togglable) */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1.5 sm:gap-2 text-[10px] sm:text-[10.5px] font-mono border-t border-gray-800/80 pt-2 ${showTelemetryOnMobile ? 'grid' : 'hidden lg:grid'}`}>
        {/* Battery */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Battery className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">Suit battery</span>
            <span className="text-white font-semibold">{Math.round(astronautTelemetry.suitBatteryRemainingPct)}%</span>
          </div>
        </div>

        {/* Primary O2 */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-[#10b981] shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">Suit O2</span>
            <span className="text-white font-semibold">{Math.round(astronautTelemetry.suitO2RemainingPct)}%</span>
          </div>
        </div>

        {/* Heart Rate */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">Heart rate</span>
            <span className="text-white font-semibold">{astronautTelemetry.heartRateBpm} BPM</span>
          </div>
        </div>

        {/* Surface Temp */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Thermometer className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">Air temp (Jezero ref.)</span>
            <span className="text-white font-semibold">{environment.surfaceTempC.toFixed(1)}°C</span>
            {MEDA_REF && <span className="text-gray-500 block text-[8px]">model · MEDA Jezero air {MEDA_REF.afternoonAirTempC}°C (ref.)</span>}
          </div>
        </div>

        {/* Wind Speed */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Wind className="w-3.5 h-3.5 text-gray-300 shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">{MEDA_REF ? 'Wind (MEDA ref.)' : 'Wind (model)'}</span>
            <span className="text-white font-semibold">{environment.windSpeedMs} m/s</span>
            {MEDA_REF && <span className="text-gray-500 block text-[8px]">Jezero afternoon median, n={MEDA_REF.n}</span>}
          </div>
        </div>

        {/* Dust Opacity */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">Dust (TAU)</span>
            <span className={`font-semibold ${environment.dustOpticalDepthTau > 1.2 ? 'text-amber-400 font-bold' : 'text-white'}`}>
              τ = {environment.dustOpticalDepthTau.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Radiation Rate */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">MSL RAD dose</span>
            <span className="text-white font-semibold">{environment.radiationDoseRateMicroSvH.toFixed(1)} µSv/h</span>
          </div>
        </div>

        {/* Relay Link */}
        <div className="bg-[#0f172a] border border-[#1e293b] p-1.5 rounded flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
          <div className="min-w-0">
            <span className="text-gray-400 block text-[9px]">MRO visibility (geometric)</span>
            <span className="text-[#38bdf8] font-semibold">{environment.commsQualityPct}% of sol in view</span>
          </div>
        </div>
      </div>
    </div>
  );
};
