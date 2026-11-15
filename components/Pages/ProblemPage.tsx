/**
 * MARSWEAVE — The Multi-Variable Problem View
 * Explains the physical and operational challenges of human Martian EVA navigation.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Mountain,
  Radio,
  Sparkles,
  Zap,
  Clock,
  Shield,
  Layers,
  CheckCircle2,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { RouteCandidate } from '../../types/marsweave';

interface ProblemPageProps {
  onLaunchSimulator: () => void;
  routes: RouteCandidate[];
}

export const ProblemPage: React.FC<ProblemPageProps> = ({ onLaunchSimulator, routes }) => {
  const [selectedComparison, setSelectedComparison] = useState<'SHORTEST' | 'OPTIMIZED'>('OPTIMIZED');
  const direct = routes.find(r => r.id === 'ROUTE_C');
  const balanced = routes.find(r => r.id === 'ROUTE_A');
  const r = selectedComparison === 'SHORTEST' ? direct : balanced;

  const variables = [
    {
      title: 'Terrain & slope',
      instrument: 'MOLA (MGS) + HRSC (Mars Express) blended DEM, USGS',
      problem: 'Walking cost rises steeply with gradient (Minetti et al. 2002). The planner turns the NASA Mars EVA metabolic rates (350 W average, 530 W peak) into a slope limit and a pace for every leg.',
      status: 'REAL NASA ARCHIVE'
    },
    {
      title: 'Roughness hazards',
      instrument: 'DEM slope and roughness (no HiRISE boulder census loaded)',
      problem: 'Clusters of steep or rough DEM cells are flagged as hazard zones. Real boulder fields are not mapped here; HiRISE boulder counts would be the next layer.',
      status: 'DERIVED'
    },
    {
      title: 'Subsurface water ice',
      instrument: 'SWIM2 composite (NASA/PSI), orbital radar, thermal, neutron and geomorphology evidence',
      problem: 'Arcadia Planitia is a published region of widespread excess ice. The loaded index has about 3 km pixels, so it ranks areas, it does not locate or size a deposit.',
      status: 'REAL NASA ARCHIVE'
    },
    {
      title: 'Thermal inertia',
      instrument: 'THEMIS thermal-inertia mosaic (2001 Mars Odyssey)',
      problem: 'Higher thermal inertia points to a more rock-like surface and lower values to loose dust. It is loaded and shown, but not used for routing or site picks: the window has an abrupt jump (about 110 to 900 tiu) that may be a mosaic seam.',
      status: 'REAL NASA ARCHIVE'
    },
    {
      title: 'Orbital relay communications',
      instrument: 'MRO ephemeris from NAIF SPICE; terrain masking is modelled',
      problem: 'Geometric MRO visibility is computed from real orbit kernels (a small share of each sol). The per-cell comms shadows on the map are a terrain model, not a link budget.',
      status: 'DERIVED'
    },
    {
      title: 'Atmospheric dust',
      instrument: 'LMD / MCD gridded dust climatology (Montabone et al.)',
      problem: 'Dust optical depth changes visibility and solar power. The dust storm scenario is an input to the what-if engine, not a forecast.',
      status: 'MODELLED'
    },
    {
      title: 'Surface radiation',
      instrument: 'RAD (MSL Curiosity), published Gale value',
      problem: 'About 0.64 mSv per day (26.7 µSv/h) was measured at Gale Crater (Hassler et al. 2014). It is used as a proxy; the dose at Arcadia was not measured.',
      status: 'MODELLED'
    },
    {
      title: 'Suit consumables',
      instrument: 'NASA Mars PLSS studies, Minetti 2002, NASA oxygen equivalent',
      problem: 'Oxygen and battery use come from published metabolic and design values for an 8 h EVA. Suit mass and heart-rate limits are flagged assumptions.',
      status: 'MODELLED'
    }
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0d12] text-[#d6d9e0] select-text">
      {/* Top Breadcrumb */}
      <div className="hairline-b bg-[#0e1117] px-6 py-2.5 text-xs font-mono text-[#8b95a5]">
        <span>Marsweave</span> <span className="text-gray-600">/</span> <span className="text-white">The problem</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16 space-y-12">
        {/* Title Header */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-block text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">
            The problem
          </div>
          <h1 className="text-3xl md:text-5xl font-sans font-bold tracking-tight text-white leading-tight">
            Planning a Marswalk takes many variables at once.
          </h1>
          <p className="text-sm md:text-base text-[#9ba5b5] font-sans leading-relaxed">
            On Earth, a route planner mostly minimises time or distance. On Mars, a straight line from the habitat to a site can cross steep or hazardous ground.
          </p>
        </div>

        {/* Interactive Comparison Widget */}
        <div className="bg-[#10141d] border border-[#1c2230] p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 hairline-b pb-4">
            <div>
              <h2 className="text-base font-bold text-white font-sans">
                Direct route vs balanced route
              </h2>
              <p className="text-xs text-[#8b95a5] font-sans mt-0.5">
                Toggle below to compare the direct route with the balanced route for the current mission setup.
              </p>
            </div>

            <div className="flex bg-[#0b0e14] border border-[#222a38] p-1 rounded font-mono text-xs">
              <button
                onClick={() => setSelectedComparison('SHORTEST')}
                className={`px-3 py-1.5 rounded transition ${
                  selectedComparison === 'SHORTEST'
                    ? 'bg-[#c85a32] text-white font-semibold'
                    : 'text-[#8b95a5] hover:text-white'
                }`}
              >
                Shortest route (direct)
              </button>
              <button
                onClick={() => setSelectedComparison('OPTIMIZED')}
                className={`px-3 py-1.5 rounded transition ${
                  selectedComparison === 'OPTIMIZED'
                    ? 'bg-[#3898b8] text-white font-semibold'
                    : 'text-[#8b95a5] hover:text-white'
                }`}
              >
                Balanced (Marsweave)
              </button>
            </div>
          </div>

          {/* Metric Comparison Table (computed live from the planner) */}
          {r && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
              <div className="bg-[#0b0e14] border border-[#1c2230] p-3">
                <span className="text-[10px] text-[#6b7788] block mb-1">Total distance</span>
                <span className="text-base font-bold text-white">{r.totalDistanceKm} km</span>
                <span className="text-[10px] text-[#8b95a5] block mt-0.5">{r.totalDurationMin} min incl. stops</span>
              </div>
              <div className="bg-[#0b0e14] border border-[#1c2230] p-3">
                <span className="text-[10px] text-[#6b7788] block mb-1">Max slope angle</span>
                <span className="text-base font-bold text-white">{r.maxSlopeDeg}°</span>
                <span className="text-[10px] text-[#8b95a5] block mt-0.5">average {r.avgSlopeDeg}°</span>
              </div>
              <div className="bg-[#0b0e14] border border-[#1c2230] p-3">
                <span className="text-[10px] text-[#6b7788] block mb-1">MODELLED comms coverage</span>
                <span className="text-base font-bold text-white">{r.commsCoveragePct}%</span>
                <span className="text-[10px] text-[#8b95a5] block mt-0.5">terrain model, not a link budget</span>
              </div>
              <div className="bg-[#0b0e14] border border-[#1c2230] p-3">
                <span className="text-[10px] text-[#6b7788] block mb-1">Candidate sites passed</span>
                <span className="text-base font-bold text-white">{r.scienceTargetsVisited.length}</span>
                <span className="text-[10px] text-[#8b95a5] block mt-0.5">hazard score {r.hazardExposureScore} / 100 (lower is safer)</span>
              </div>
            </div>
          )}

          <div className="bg-[#0b0e14] border border-[#1c2230] p-4 text-xs font-sans space-y-2 text-[#b0b8c6]">
            <span className="font-mono text-[10px] text-[#8b95a5] uppercase tracking-wider block">What the numbers say</span>
            {r && (
              <p>
                {selectedComparison === 'SHORTEST'
                  ? `The direct route weights distance only and allows slopes up to the limit of the walking-cost model. It is ${r.totalDistanceKm} km long with a ${r.maxSlopeDeg}° maximum slope and a hazard score of ${r.hazardExposureScore}.`
                  : `The balanced route trades distance for lower slope and hazard cost. It is ${r.totalDistanceKm} km long with a ${r.maxSlopeDeg}° maximum slope and a hazard score of ${r.hazardExposureScore}.`}
                {' '}The planner sets its slope limit from the NASA Mars EVA metabolic rate; it does not claim a fall or traction limit.
              </p>
            )}
          </div>
        </div>

        {/* The 8 Multi-Variable Dimensions */}
        <div className="space-y-6">
          <div className="hairline-b pb-2">
            <h2 className="text-xl font-bold text-white font-sans tracking-tight">
              What the planner has to weigh
            </h2>
            <p className="text-xs text-[#8b95a5] font-sans mt-0.5">
              Each variable names its source and its honest status in this build.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {variables.map(item => (
              <div key={item.title} className="bg-[#10141d] border border-[#1c2230] p-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="font-semibold text-white">{item.title}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#181d26] text-[#8b95a5]">
                    {item.status}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#3898b8]">
                  SOURCE: {item.instrument}
                </div>
                <p className="text-xs text-[#8b95a5] font-sans leading-relaxed">
                  {item.problem}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Scientific Honesty Disclaimer */}
        <div className="bg-[#141822] border border-[#222a38] p-5 space-y-2 text-xs font-sans text-[#8b95a5] leading-relaxed">
          <div className="flex items-center gap-2 text-white font-mono font-semibold">
            <HelpCircle className="w-4 h-4 text-[#c85a32]" />
            <span>What is real and what is not</span>
          </div>
          <p>
            MARSWEAVE is an aerospace mission-planning decision-support prototype. Traversal metrics represent <em>derived mission-planning estimates</em> and <em>modelled risk profiles</em>. They do not constitute certified NASA human life-support safety ratings. The terrain is the USGS MOLA-HRSC blended elevation model; the ice, thermal-inertia, dust and orbit layers are listed with their status in the Sources page.
          </p>
        </div>

        {/* Call to Action */}
        <div className="hairline-t pt-8 flex items-center justify-between">
          <span className="text-xs font-mono text-[#8b95a5]">Ready to test these variables in real time?</span>
          <button
            onClick={onLaunchSimulator}
            className="px-5 py-2.5 bg-[#c85a32] hover:bg-[#b54f2a] text-white font-sans font-medium text-xs rounded transition flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <span>Launch mission simulator</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
