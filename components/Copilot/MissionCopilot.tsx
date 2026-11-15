/**
 * MARSWEAVE — Mission Copilot Interface
 * AI-assisted mission advisory engine grounded in active telemetry and NASA archives.
 */

import { RESERVE_WARN_PCT } from '../../engine/evaPhysiology';
import { TAU_TYPICAL, TAU_STORM } from '../../data/arcadiaData';
import React, { useState, useRef, useEffect } from 'react';
import {
  CopilotMessage,
  RouteCandidate,
  MissionProfile,
  EnvironmentalConditions,
  AstronautTelemetry,
  ScienceTarget
} from '../../types/marsweave';
import {
  Bot,
  Send,
  Sparkles,
  HelpCircle,
  Database,
  CheckCircle2,
  X,
  Minimize2,
  Maximize2
} from 'lucide-react';

interface MissionCopilotProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRoute: RouteCandidate;
  profile: MissionProfile;
  environment: EnvironmentalConditions;
  astronautTelemetry: AstronautTelemetry;
  scienceTargets: ScienceTarget[];
}

export const MissionCopilot: React.FC<MissionCopilotProps> = ({
  isOpen,
  onClose,
  selectedRoute,
  profile,
  environment,
  astronautTelemetry,
  scienceTargets
}) => {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      id: 'welcome',
      sender: 'copilot',
      timestamp: '14:24 LST',
      text: "MARSWEAVE COPILOT online. I work from the loaded layers only: the MOLA-HRSC elevation model, the SWIM2 ice index, and the simulated suit telemetry. Habitat Alpha is a hypothetical base. How can I assist your EVA planning?",
      suggestedFollowUps: [
        "Why did you choose this route?",
        "What are the nearest water-ice targets?",
        "What happens if dust optical depth surges?",
        "What data is behind the ice candidate SCI-04?"
      ]
    }
  ]);

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: CopilotMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: environment.marsLocalTime,
      text: textToSend
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsLoading(true);

    try {
      // First attempt to call server-side proxy /api/copilot
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textToSend,
          context: {
            selectedRoute: {
              name: selectedRoute.name,
              distanceKm: selectedRoute.totalDistanceKm,
              durationMin: selectedRoute.totalDurationMin,
              avgSlopeDeg: selectedRoute.avgSlopeDeg,
              hazardScore: selectedRoute.hazardExposureScore,
              commsCoveragePct: selectedRoute.commsCoveragePct,
              whyChosen: selectedRoute.whyChosenReasons,
              avoidedHazards: selectedRoute.hazardsAvoided
            },
            profile: {
              objective: profile.objective,
              durationMin: profile.durationMin,
              riskTolerance: profile.riskTolerance
            },
            environment: {
              tau: environment.dustOpticalDepthTau,
              tempC: environment.surfaceTempC,
              windMs: environment.windSpeedMs,
              radiationMicroSvH: environment.radiationDoseRateMicroSvH,
              relay: environment.commsRelayOrbiter
            },
            astronaut: {
              batteryPct: astronautTelemetry.suitBatteryRemainingPct,
              o2Pct: astronautTelemetry.suitO2RemainingPct,
              distanceCovered: astronautTelemetry.currentDistanceMeters
            }
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [
          ...prev,
          {
            id: `copilot-${Date.now()}`,
            sender: 'copilot',
            timestamp: environment.marsLocalTime,
            text: `${data.reply}\n\n— AI-generated (Gemini) from the simulated mission data above; not a NASA measurement.`
          }
        ]);
        setIsLoading(false);
        return;
      }
    } catch {
      // Fallback to grounded local operational reasoning engine
    }

    // Local grounded reasoning engine
    setTimeout(() => {
      let reply = '';
      const cited: string[] = [];

      const query = textToSend.toLowerCase();

      if (query.includes('why') && (query.includes('route') || query.includes('choose') || query.includes('selected'))) {
        reply = `${selectedRoute.name} was chosen by the multi-objective A* engine because it satisfies your ${profile.objective} objective while keeping hazard exposure to ${selectedRoute.hazardExposureScore}/100. Specifically, it achieves:
1. A gentle traverse profile (average slope ${selectedRoute.avgSlopeDeg}°).
2. ${selectedRoute.hazardsAvoided[0] || 'No mapped hazard zone was avoided or crossed'}.
3. Sustained line-of-sight communication (${selectedRoute.commsCoveragePct}% MRO coverage).
4. Passes ${selectedRoute.scienceTargetsVisited.length} candidate sampling sites, leaving ${Math.max(0, Math.round(profile.durationMin - selectedRoute.totalDurationMin))} min safety margin.`;
        cited.push('Mola-hrsc DEM (USGS)', 'NAIF SPICE (MRO)');
      } else if (query.includes('ice') || query.includes('water')) {
        const t = scienceTargets.find(x => x.id === 'SCI-04');
        reply = t
          ? `The best ice candidate in this window is ${t.id} at ${t.lat.toFixed(2)}°N, ${t.lon.toFixed(2)}°W, on ground of about ${(t.evidenceChain.find(e => e.instrument === 'DEM')?.observation.match(/slope ([0-9.]+)/)?.[1]) ?? '?'}° slope. It is the flattest cell with the highest ice-consistency index from the SWIM2 mapping. That index comes from coarse (about 3 km) orbital data, so it says Arcadia Planitia is a region of interest for excess ice, not that ice sits under this exact spot or at what depth. Only a ground-penetrating radar traverse or a drill could tell.`
          : 'No ice candidate is available in this window.';
        cited.push('SWIM2 composite (Morgan et al. 2021)', 'Mola-hrsc DEM (USGS)');
      } else if (query.includes('dust') || query.includes('tau') || query.includes('weather')) {
        reply = `Dust optical depth is τ = ${environment.dustOpticalDepthTau.toFixed(2)} (${TAU_TYPICAL === environment.dustOpticalDepthTau ? 'typical value' : 'storm scenario'}; the typical and maximum values, ${TAU_TYPICAL.toFixed(2)} and ${TAU_STORM.toFixed(2)}, come from the LMD Mars Climate Database MY34 product when it is loaded). Higher τ lowers sunlight reaching the surface and can affect visibility and solar power; we do not model a battery or slip effect of dust, so none is claimed. The "WHAT IF?" dust scenario only switches τ to the maximum value and re-plans.`;
        cited.push('LMD Mars Climate Database (MY34 dust)');
      } else if (query.includes('sci-0') || query.includes('sci-1') || query.includes('evidence') || query.includes('dataset') || query.includes('data')) {
        const t = scienceTargets.find(x => query.includes(x.id.toLowerCase())) ?? scienceTargets[0];
        reply = t
          ? `${t.id} (${t.name}) is a candidate picked by a fixed rule from the loaded layers, not an instrument detection:\n` + t.evidenceChain.map(e => `• ${e.instrument}: ${e.observation}`).join('\n')
          : 'No candidate sites are available.';
        cited.push(...(t ? t.dataSources : []));
      } else if (query.includes('time') || query.includes('battery') || query.includes('margin')) {
        reply = `EVA Status: Traversed ${(astronautTelemetry.currentDistanceMeters / 1000).toFixed(2)} km of ${selectedRoute.totalDistanceKm} km total. Suit battery is currently at ${Math.round(astronautTelemetry.suitBatteryRemainingPct)}%, primary O2 is at ${Math.round(astronautTelemetry.suitO2RemainingPct)}%, and total estimated mission time is ${selectedRoute.totalDurationMin} min against your ${profile.durationMin} min budget. ${astronautTelemetry.suitO2RemainingPct <= 0 || astronautTelemetry.suitBatteryRemainingPct <= 0 ? 'A suit consumable is exhausted: the EVA cannot continue.' : Math.min(astronautTelemetry.suitO2RemainingPct, astronautTelemetry.suitBatteryRemainingPct) < RESERVE_WARN_PCT ? `WARNING: a suit reserve is below the 30 min reserve (${RESERVE_WARN_PCT.toFixed(1)}% of the 8 h design life).` : selectedRoute.timeBudgetExceededMin > 0 ? `WARNING: the route exceeds the EVA limit by ${selectedRoute.timeBudgetExceededMin} min.` : 'Vital margins are within the planned limits.'}`;
        cited.push('Habitat Alpha Life Support', 'MRO Telemetry');
      } else {
        reply = `I can confirm current operational conditions on Arcadia Planitia: Route distance is ${selectedRoute.totalDistanceKm} km with ${selectedRoute.commsCoveragePct}% communication relay coverage. Ambient temperature is ${environment.surfaceTempC.toFixed(1)}°C, wind speed is ${environment.windSpeedMs} m/s, and radiation dose rate is ${environment.radiationDoseRateMicroSvH.toFixed(1)} µSv/h (calibrated to MSL RAD). What specific operational or scientific question do you have?`;
        cited.push('MOLA', 'MEDA', 'MSL RAD');
      }

      setMessages(prev => [
        ...prev,
        {
          id: `copilot-${Date.now()}`,
          sender: 'copilot',
          timestamp: environment.marsLocalTime,
          text: `${reply}\n\n— Offline assistant: answers are generated from the simulated mission data above, not from a live NASA query.`,
          dataSourcesCited: cited
        }
      ]);
      setIsLoading(false);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed z-50 transition-all select-none ${
      isMinimized
        ? 'bottom-20 right-4 w-72 h-12'
        : 'bottom-20 right-4 w-96 h-[540px]'
    }`}>
      <div className="w-full h-full bg-[#0b0f19]/95 backdrop-blur-md border border-[#38bdf8]/40 rounded-lg shadow-2xl flex flex-col overflow-hidden text-gray-200">
        {/* Header */}
        <div className="p-3 border-b border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 bg-[#38bdf8]/20 text-[#38bdf8] rounded">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-heading font-bold text-white tracking-wide flex items-center gap-1.5">
                <span>Marsweave copilot</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <span className="text-[9px] font-mono text-gray-400 block">
                NASA data grounded operational AI
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-gray-400">
            <button
              onClick={() => setIsMinimized(v => !v)}
              className="p-1 hover:text-white rounded hover:bg-[#1e293b]"
              title={isMinimized ? 'Expand' : 'Minimize'}
            >
              {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:text-white rounded hover:bg-[#1e293b]"
              title="Close Copilot"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="text-[9px] font-mono text-gray-500 mb-0.5">
                    {msg.sender === 'user' ? 'OPERATOR' : 'COPILOT'} • {msg.timestamp}
                  </div>
                  <div
                    className={`p-2.5 rounded max-w-[88%] leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-[#38bdf8]/20 border border-[#38bdf8]/40 text-white rounded-br-none'
                        : 'bg-[#0f172a] border border-[#1e293b] text-gray-200 rounded-bl-none'
                    }`}
                  >
                    <p className="whitespace-pre-line">{msg.text}</p>

                    {/* Cited Data Sources */}
                    {msg.dataSourcesCited && msg.dataSourcesCited.length > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-gray-800 flex items-center gap-1 flex-wrap text-[9px] font-mono text-gray-400">
                        <Database className="w-3 h-3 text-[#38bdf8]" />
                        <span>Citations:</span>
                        {msg.dataSourcesCited.map((cite, idx) => (
                          <span key={idx} className="bg-gray-800 text-gray-300 px-1 py-0.5 rounded">
                            {cite}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Suggested Followups */}
                  {msg.suggestedFollowUps && (
                    <div className="mt-2 flex flex-col gap-1 w-full">
                      {msg.suggestedFollowUps.map((chip, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendMessage(chip)}
                          className="text-left bg-[#1e293b]/60 hover:bg-[#1e293b] border border-gray-800 hover:border-[#38bdf8]/40 text-[10.5px] text-[#38bdf8] p-1.5 rounded transition"
                        >
                          → {chip}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex items-center gap-2 text-gray-400 text-xs font-mono p-2">
                  <div className="w-3 h-3 border-2 border-[#38bdf8] border-t-transparent rounded-full animate-spin" />
                  <span>Working it out...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendMessage(inputPrompt);
              }}
              className="p-2 border-t border-[#1a2333] bg-[#0c121e] flex items-center gap-1.5"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={e => setInputPrompt(e.target.value)}
                placeholder="Ask about route, risks, or NASA data..."
                className="flex-1 bg-[#0f172a] border border-[#1e293b] text-xs text-white rounded px-2.5 py-1.5 outline-none focus:border-[#38bdf8] font-mono"
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                className="p-1.5 bg-[#38bdf8] hover:bg-[#0284c7] text-black rounded transition disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
