/**
 * MARSWEAVE — Astronaut visor HUD overlay (first-person EVA mode).
 * Pure presentational component; values come from engine/visorTelemetry.ts.
 */

import React from 'react';
import { VisorReadout } from '../../engine/visorTelemetry';

export interface VisorHudProps {
  readout: VisorReadout;
  cumulativeDoseMicroSv: number;
  evaRemainingMin: number;
  evaLimitMin: number;
  o2Pct?: number;
  batteryPct?: number;
  heartRateBpm?: number;
  atRouteEnd: boolean;
  /** 'REAL_MOLA_HRSC' when the elevation grid is the real DEM, otherwise 'SYNTHETIC'. */
  elevationSource: 'REAL_MOLA_HRSC' | 'SYNTHETIC';
  onExit: () => void;
}

const PX_PER_DEG = 6;

function fmtTime(min: number): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

const Tape: React.FC<{ headingDeg: number }> = ({ headingDeg }) => {
  const ticks: { deg: number; offset: number }[] = [];
  for (let d = -60; d <= 60; d += 10) {
    const abs = (Math.round(headingDeg / 10) * 10 + d + 360) % 360;
    ticks.push({ deg: abs, offset: (abs - headingDeg + 540) % 360 - 180 });
  }
  return (
    <div className="relative h-7 w-full overflow-hidden">
      {ticks.map(t => (
        <div
          key={t.deg}
          className="absolute top-0 text-center text-[9px] font-mono text-cyan-200/90"
          style={{ left: `${50 + t.offset * 0.75}%`, transform: 'translateX(-50%)' }}
        >
          <div className={`mx-auto w-px ${t.deg % 90 === 0 ? 'h-3 bg-cyan-200' : 'h-1.5 bg-cyan-300/60'}`} />
          {CARDINALS[t.deg] ?? (t.deg % 30 === 0 ? t.deg : '')}
        </div>
      ))}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; tag?: string; warn?: boolean }> = ({ label, value, tag, warn }) => (
  <div className="leading-tight">
    <div className="text-[8px] tracking-widest text-cyan-300/70 flex items-center gap-1">
      {label}
      {tag && <span className="px-1 border border-cyan-300/40 rounded-sm text-[7px] text-cyan-200/80">{tag}</span>}
    </div>
    <div className={`text-sm font-semibold ${warn ? 'text-amber-300' : 'text-cyan-100'}`}>{value}</div>
  </div>
);

export const VisorHud: React.FC<VisorHudProps> = ({
  readout,
  cumulativeDoseMicroSv,
  evaRemainingMin,
  evaLimitMin,
  o2Pct,
  batteryPct,
  heartRateBpm,
  atRouteEnd,
  elevationSource,
  onExit
}) => {
  const lowTime = evaRemainingMin < 0.15 * evaLimitMin;
  const steep = readout.slopeDeg > 15;
  const lowComms = readout.relayCoveragePct < 60;
  const ladder: number[] = [];
  for (let a = -30; a <= 30; a += 10) ladder.push(a);

  return (
    <div className="absolute inset-0 z-30 pointer-events-none select-none font-mono text-cyan-100" data-testid="visor-hud">
      {/* Visor glass: curved vignette and rim */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 72% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(2,10,20,0.55) 80%, rgba(2,6,12,0.92) 100%)'
        }}
      />
      <div
        className="absolute inset-[3%] rounded-[46%/38%] border border-cyan-300/30"
        style={{ boxShadow: 'inset 0 0 60px rgba(56,189,248,0.18), 0 0 18px rgba(56,189,248,0.12)' }}
      />

      {/* Compass tape */}
      <div className="absolute top-[7%] left-1/2 -translate-x-1/2 w-[46%]" style={{ perspective: 400 }}>
        <div style={{ transform: 'rotateX(18deg)' }}>
          <div className="text-center text-[10px] tracking-widest text-cyan-200">
            HDG {String(Math.round(readout.headingDeg)).padStart(3, '0')}°
          </div>
          <Tape headingDeg={readout.headingDeg} />
          <div className="mx-auto w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-cyan-200" />
        </div>
      </div>

      {/* Attitude: pitch ladder rotates with roll and shifts with pitch */}
      <div className="absolute left-1/2 top-1/2 w-56 h-56 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
        <div
          className="absolute inset-0"
          style={{ transform: `rotate(${-readout.rollDeg}deg) translateY(${readout.pitchDeg * PX_PER_DEG}px)` }}
        >
          {ladder.map(a => (
            <div
              key={a}
              className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 text-[8px]"
              style={{ top: `calc(50% - ${a * PX_PER_DEG}px)` }}
            >
              <span className="block h-px bg-cyan-200/80" style={{ width: a === 0 ? 90 : 36 }} />
              {a !== 0 && <span>{a}</span>}
              <span className="block h-px bg-cyan-200/80" style={{ width: a === 0 ? 90 : 36 }} />
            </div>
          ))}
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="w-6 h-6 rounded-full border border-cyan-200/80" />
      </div>
      <div className="absolute left-1/2 top-[71%] -translate-x-1/2 text-[10px] text-cyan-200 flex gap-4">
        <span>PITCH {readout.pitchDeg >= 0 ? '+' : ''}{readout.pitchDeg.toFixed(1)}°</span>
        <span>ROLL {readout.rollDeg >= 0 ? '+' : ''}{readout.rollDeg.toFixed(1)}°</span>
      </div>

      {/* Left wing: suit and time */}
      <div className="absolute left-[6%] top-1/2 -translate-y-1/2 space-y-3" style={{ perspective: 600 }}>
        <div className="space-y-3 p-3 border-l-2 border-cyan-300/50 bg-cyan-950/30" style={{ transform: 'rotateY(22deg)', transformOrigin: 'left center' }}>
          <Stat label="EVA time left" value={fmtTime(evaRemainingMin)} warn={lowTime} />
          <Stat label="SUIT O2" value={o2Pct !== undefined ? `${o2Pct.toFixed(0)} %` : 'n/a'} tag="SIM" />
          <Stat label="SUIT BATTERY" value={batteryPct !== undefined ? `${batteryPct.toFixed(0)} %` : 'n/a'} tag="SIM" />
          <Stat label="HEART RATE" value={heartRateBpm !== undefined ? `${Math.round(heartRateBpm)} bpm` : 'n/a'} tag="SIM" />
        </div>
      </div>

      {/* Right wing: environment */}
      <div className="absolute right-[6%] top-1/2 -translate-y-1/2" style={{ perspective: 600 }}>
        <div className="space-y-3 p-3 border-r-2 border-cyan-300/50 bg-cyan-950/30 text-right" style={{ transform: 'rotateY(-22deg)', transformOrigin: 'right center' }}>
          <Stat label="Dose (cumul.)" value={`${cumulativeDoseMicroSv.toFixed(0)} µSv`} tag="MODELLED" />
          <Stat label="Dose rate" value={`${readout.doseRateMicroSvH.toFixed(1)} µSv/h`} tag="MODELLED" />
          <Stat label="Terrain shield" value={`${readout.shieldingPct.toFixed(1)} %`} tag="MODELLED" />
          <Stat label="Relay LOS" value={`${readout.relayCoveragePct.toFixed(0)} %`} tag="MODELLED" warn={lowComms} />
        </div>
      </div>

      {/* Bottom: target and slope */}
      <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 flex items-end gap-8 px-5 py-2 border-t border-cyan-300/40 bg-cyan-950/30 rounded-[40%/100%_100%_0_0]">
        <Stat label={atRouteEnd ? 'AT TARGET AREA' : 'TO TARGET'} value={`${Math.round(readout.distanceToTargetM)} m`} />
        <Stat label="SLOPE" value={`${readout.slopeDeg.toFixed(1)}°`} warn={steep} />
        <Stat label="ELEVATION" value={`${Math.round(readout.elevationM)} m`} tag={elevationSource === 'REAL_MOLA_HRSC' ? 'REAL DEM' : 'SYNTH'} />
      </div>


      <button
        onClick={onExit}
        className="pointer-events-auto absolute top-[7%] right-[8%] px-2 py-1 text-[10px] border border-cyan-300/50 rounded bg-black/40 hover:bg-cyan-900/50"
      >
        Back to map
      </button>
    </div>
  );
};
