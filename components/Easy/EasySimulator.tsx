/**
 * MARSWEAVE — EASY mode simulator. A big map, a few big buttons and short sentences.
 * Everything shown here comes from the same route planner as ADVANCED mode.
 */
import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { RouteCandidate, ScienceTarget } from '../../types/marsweave';
import { shortTargetLabel } from '../../data/arcadiaData';

/** One simple sentence per place (candidate places picked from real map data, not confirmed finds). */
const KID_DESCRIPTIONS: Record<string, string> = {
  'SCI-04': 'Flat ground where orbital data best fit buried ice',
  'SCI-02': 'The steepest slope you can reach',
  'SCI-11': 'The deepest dip in the ground',
  'SCI-05': 'The lowest flat ground',
  'SCI-06': 'The smoothest ground'
};

interface EasySimulatorProps {
  map: React.ReactNode;
  targets: ScienceTarget[];
  selectedTargetId: string;
  onSelectTarget: (id: string) => void;
  route: RouteCandidate;
  airMinutes: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  elapsedSec: number;
  totalSec: number;
  speed: number;
  onChangeSpeed: (v: number) => void;
  /** Plain-language reason the walk had to stop early, if any. */
  failureMessage?: string | null;
  /** Switch the whole app to Advanced mode. */
  onSwitchToAdvanced?: () => void;
}

export const EasySimulator: React.FC<EasySimulatorProps> = ({
  map, targets, selectedTargetId, onSelectTarget, route, airMinutes,
  isPlaying, onTogglePlay, onReset, elapsedSec, totalSec, speed, onChangeSpeed, failureMessage, onSwitchToAdvanced
}) => {
  const pct = totalSec > 0 ? Math.min(100, Math.round((elapsedSec / totalSec) * 100)) : 0;
  const done = pct >= 100;
  const enoughAir = route.totalDurationMin <= airMinutes;
  const safe = route.hazardExposureScore < 35;

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0" data-testid="easy-sim">
      <main className="relative flex-1 min-h-[280px] bg-black">{map}</main>

      <aside className="lg:w-[24rem] shrink-0 overflow-auto bg-[#0a0d13] border-t lg:border-t-0 lg:border-l border-[#1c2230] p-4 space-y-5 font-sans text-[#e2e8f0]">
        <section>
          <h2 className="text-lg font-bold text-white mb-2">1. Pick a place to visit</h2>
          <div className="space-y-2">
            {targets.map(t => {
              const on = t.id === selectedTargetId;
              return (
                <button
                  key={t.id}
                  onClick={() => onSelectTarget(t.id)}
                  data-testid={`easy-place-${t.id}`}
                  className={`w-full text-left rounded-xl px-4 py-3 border transition cursor-pointer ${
                    on ? 'bg-[#c85a32]/20 border-[#c85a32] text-white' : 'bg-[#10141d] border-[#1c2230] hover:border-gray-600'
                  }`}
                >
                  <div className="font-semibold text-base">{on ? '📍 ' : ''}{shortTargetLabel(t).replace(/^SCI-\d+\s*·\s*/, '')}</div>
                  <div className="text-sm text-[#9ba5b5]">{KID_DESCRIPTIONS[t.id] ?? 'A place to explore'}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-[#10141d] border border-[#1c2230] rounded-xl p-4 space-y-3" data-testid="easy-summary">
          <h2 className="text-lg font-bold text-white">2. The path</h2>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-[#0a0d13] rounded-lg py-3">
              <div className="text-2xl font-bold text-white">{route.totalDistanceKm} km</div>
              <div className="text-sm text-[#9ba5b5]">how far</div>
            </div>
            <div className="bg-[#0a0d13] rounded-lg py-3">
              <div className="text-2xl font-bold text-white">{Math.round(route.totalDurationMin)} min</div>
              <div className="text-sm text-[#9ba5b5]">how long</div>
            </div>
          </div>
          <p className="text-base">{safe ? '✅ This path is safe. It goes around steep hills.' : '⚠️ Be careful! This path is near steep ground.'}</p>
          <p className="text-base">{enoughAir ? '✅ The astronaut has enough air for this trip.' : '⚠️ Too far! The air would run out. Pick a closer place.'}</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">3. Watch the walk</h2>
          <div className="flex gap-2">
            <button
              onClick={done ? () => { onReset(); onTogglePlay(); } : onTogglePlay}
              data-testid="easy-play"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-4 bg-[#10b981] hover:bg-[#0ea371] text-white text-lg font-bold rounded-xl cursor-pointer transition"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              {isPlaying ? 'Pause' : done ? 'Walk again' : 'Start walking'}
            </button>
            <button
              onClick={onReset}
              title="Start over"
              className="px-4 bg-[#121620] hover:bg-[#1a202c] border border-[#1e2533] rounded-xl text-gray-300 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
          <label className="block text-sm text-[#cdd3de]" data-testid="easy-speed">
            <span className="flex justify-between mb-1"><span>🐢 Slow</span><b className="text-white">Speed: {speed}x</b><span>Fast 🐇</span></span>
            <input
              type="range" min={1} max={60} step={1} value={speed}
              onChange={e => onChangeSpeed(Number(e.target.value))}
              className="w-full accent-[#10b981] cursor-pointer"
            />
          </label>
          <div className="h-3 bg-[#1c2230] rounded-full overflow-hidden">
            <div className="h-full bg-[#10b981] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className={`text-sm ${failureMessage ? 'text-rose-300 font-semibold' : 'text-[#9ba5b5]'}`} data-testid="easy-status">{failureMessage ? `❌ ${failureMessage}` : done ? '🎉 You arrived!' : pct > 0 ? `Walking… ${pct}%` : 'Press the green button.'}</p>
        </section>

        {pct > 0 && onSwitchToAdvanced && (
          <section className="sticky bottom-0 -mx-4 -mb-4 rounded-t-xl border border-[#1e2533] bg-[#121620] p-4 space-y-2 shadow-[0_-8px_20px_rgba(0,0,0,0.5)]" data-testid="easy-more">
            <p className="text-base font-semibold text-white">Looking for more?</p>
            <p className="text-sm text-[#9ba5b5]">Advanced mode adds any start and end point, the 3D surface, data layers, sources and the mission report.</p>
            <button
              onClick={onSwitchToAdvanced}
              className="w-full px-4 py-3 bg-[#e25c2b] hover:bg-[#c94f24] text-white font-bold rounded-lg cursor-pointer transition"
            >
              Switch to Advanced
            </button>
          </section>
        )}

        <p className="text-xs text-[#6b7788] leading-relaxed">
          The height of the ground is real NASA data (USGS). The places to visit are picked by simple rules from that elevation data and an ice-index map. They are candidates, not discoveries.
        </p>
      </aside>
    </div>
  );
};
