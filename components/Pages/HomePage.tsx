/**
 * MARSWEAVE — Home / Editorial Briefing View
 * Scientific editorial layout communicating exploration, precision, and engineering.
 */

import React from 'react';
import {
  Compass,
  ArrowRight,
  Database,
  Layers,
  Radio,
  Sparkles,
  Mountain,
  Shield,
  Activity,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

import { RouteCandidate } from '../../types/marsweave';
import { MISSION_BOUNDS } from '../../data/arcadiaData';

interface HomePageProps {
  onNavigate: (page: string) => void;
  onLaunchSimulator: () => void;
  routes: RouteCandidate[];
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigate,
  onLaunchSimulator,
  routes
}) => {
  const rA = routes.find(r => r.id === 'ROUTE_A');
  const rB = routes.find(r => r.id === 'ROUTE_B');
  const rC = routes.find(r => r.id === 'ROUTE_C');
  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0d12] text-[#d6d9e0] select-text">
      {/* Top Telemetry Baseline Strip */}
      <div className="hairline-b bg-[#0e1117] px-6 py-2 flex flex-wrap items-center justify-between text-[11px] font-mono text-[#8b95a5]">
        <div className="flex items-center gap-6">
          <span>Study area: <strong className="text-white">Arcadia Planitia</strong> (39.3°N, 171.4°W)</span>
          <span className="hidden md:inline">Elevation: <strong className="text-white">{Math.round(MISSION_BOUNDS.datumElevationMinMeters)} to {Math.round(MISSION_BOUNDS.datumElevationMaxMeters)} m</strong> (MOLA datum)</span>
          <span className="hidden lg:inline">Window: <strong className="text-white">{MISSION_BOUNDS.areaWidthKm.toFixed(1)} × {MISSION_BOUNDS.areaHeightKm.toFixed(1)} km</strong></span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#8b95a5]">NASA space apps 2026</span>
        </div>
      </div>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">
        <div className="max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#181d26] border border-[#222a38] text-[11px] font-mono text-[#c85a32]">
            <span>Prototype</span>
            <span className="text-[#647082]">•</span>
            <span>Walking on Mars</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-sans font-bold tracking-tight text-white leading-[1.08]">
            Planning a walk on Mars.
          </h1>

          <p className="text-base md:text-lg text-[#9ba5b5] font-sans leading-relaxed">
            MARSWEAVE combines a real Mars elevation model, orbital ice and thermal-inertia maps, and published NASA suit and walking-cost figures into an explainable, multi-objective route planning prototype for human Marswalks.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-3">
            <button
              onClick={onLaunchSimulator}
              className="px-5 py-2.5 bg-[#c85a32] hover:bg-[#b54f2a] text-white font-sans font-medium text-xs rounded transition flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <span>Launch 3D mission simulator</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigate('HOW IT WORKS')}
              className="px-4 py-2.5 bg-[#141822] hover:bg-[#1c2230] border border-[#222a38] text-[#cdd3de] font-sans text-xs rounded transition cursor-pointer"
            >
              System pipeline
            </button>
          </div>
        </div>

        {/* Technical Data Ribbon */}
        <div className="mt-16 hairline-t hairline-b py-6 grid grid-cols-2 md:grid-cols-4 gap-6 font-mono text-xs">
          <div>
            <div className="text-[10px] text-[#6b7788] uppercase tracking-wider mb-1">Data products</div>
            <div className="text-lg font-semibold text-white">5 real, 4 derived</div>
            <div className="text-[11px] text-[#8b95a5] mt-0.5">Real: MOLA-HRSC DEM, SWIM2, Viking MDIM, LMD dust, THEMIS (display only). Derived: slope and hazards, candidate sites, orbiter passes, sun position. RAD and MEDA are published reference values.</div>
          </div>
          <div>
            <div className="text-[10px] text-[#6b7788] uppercase tracking-wider mb-1">Pathfinding model</div>
            <div className="text-lg font-semibold text-white">Multi-objective A*</div>
            <div className="text-[11px] text-[#8b95a5] mt-0.5">Slope, hazard, comms, candidate sites</div>
          </div>
          <div>
            <div className="text-[10px] text-[#6b7788] uppercase tracking-wider mb-1">Demonstration area</div>
            <div className="text-lg font-semibold text-white">Arcadia Planitia</div>
            <div className="text-[11px] text-[#8b95a5] mt-0.5">50 × 50 grid, 16 km window</div>
          </div>
          <div>
            <div className="text-[10px] text-[#6b7788] uppercase tracking-wider mb-1">Honesty</div>
            <div className="text-lg font-semibold text-white">Shows its work</div>
            <div className="text-[11px] text-[#8b95a5] mt-0.5">Quantitative "Why this route?" deltas</div>
          </div>
        </div>

        {/* The 6-Stage Operational Cycle */}
        <div className="mt-16 space-y-8">
          <div>
            <div className="text-[11px] font-mono text-[#c85a32] uppercase tracking-wider mb-1">How it works</div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              From data to a walk
            </h2>
            <p className="text-sm text-[#8b95a5] max-w-2xl mt-1">
              Look at the data, plan a route, walk it, and adjust when conditions change.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                step: '01',
                title: 'OBSERVE',
                desc: 'Load the real elevation model and the orbital ice and brightness maps onto one grid.'
              },
              {
                step: '02',
                title: 'UNDERSTAND',
                desc: 'Derive slope and roughness-based hazard cells from the DEM, and read the ice index per cell.'
              },
              {
                step: '03',
                title: 'PLAN',
                desc: 'Generate candidate routes balancing traverse distance, terrain risk, candidate sites and suit consumables.'
              },
              {
                step: '04',
                title: 'WALK',
                desc: 'Simulate the walk with a published walking-cost equation, NASA Mars EVA metabolic rates and suit oxygen use.'
              },
              {
                step: '05',
                title: 'DISCOVER',
                desc: 'Visit candidate sampling sites picked by transparent rules from the loaded layers (not confirmed finds).'
              },
              {
                step: '06',
                title: 'ADAPT',
                desc: 'Re-plan the route when a dust scenario or a communication change is applied.'
              }
            ].map(item => (
              <div key={item.step} className="bg-[#10141d] border border-[#1c2230] p-4 flex flex-col justify-between">
                <div>
                  <span className="font-mono text-xs text-[#c85a32] font-semibold">{item.step}</span>
                  <h3 className="font-sans font-semibold text-sm text-white mt-1 mb-2">{item.title}</h3>
                  <p className="text-xs text-[#8b95a5] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Why Science-Driven Routing Matters */}
        <div className="mt-20 hairline-t pt-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div className="space-y-4">
            <span className="text-[11px] font-mono text-[#3898b8] uppercase tracking-wider block">Mission safety & discovery</span>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Why the shortest path is rarely the right mission path.
            </h2>
            <p className="text-sm text-[#9ba5b5] leading-relaxed">
              Standard geospatial routing minimizes geometric distance. On Mars, an unweighted straight line can climb steeper ground than a suited astronaut can walk at a sustainable metabolic rate, cross rough cells, or skip the places a mission wants to sample.
            </p>
            <p className="text-sm text-[#9ba5b5] leading-relaxed">
              MARSWEAVE weights each terrain step against physical safety constraints and scientific value, providing human planners with transparent trade-offs between rapid transit and scientific harvest.
            </p>
          </div>

          <div className="bg-[#10141d] border border-[#1c2230] p-6 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between hairline-b pb-3">
              <span className="text-[#8b95a5]">Route comparison (current setup)</span>
              <span className="text-[10px] text-[#3898b8]">DERIVED metrics</span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-xs text-[#8b95a5]">
                <span>Candidate</span><span>Distance</span><span>Hazard score</span><span>Sites passed</span>
              </div>
              {[rA, rB, rC].map(r => r && (
                <div key={r.id} className="grid grid-cols-4 gap-2 hairline-t pt-2 text-[#cdd3de]">
                  <span className="font-semibold">{r.name}</span>
                  <span>{r.totalDistanceKm} km</span>
                  <span>{r.hazardExposureScore} / 100</span>
                  <span>{r.scienceTargetsVisited.length}</span>
                </div>
              ))}
            </div>

            <div className="hairline-t pt-3 text-[11px] text-[#8b95a5] leading-relaxed">
              <strong className="text-white">Computed live</strong> by the planner for the current mission setup. Lower hazard score is safer; the direct route minimises distance only.
              {rA && rC && ` Direct vs balanced: ${(rA.totalDistanceKm - rC.totalDistanceKm).toFixed(2)} km shorter, max slope ${rC.maxSlopeDeg}° vs ${rA.maxSlopeDeg}°.`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
