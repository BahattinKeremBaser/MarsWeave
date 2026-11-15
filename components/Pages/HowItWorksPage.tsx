/**
 * MARSWEAVE — How It Works / Scientific Pipeline View
 * An interactive, 9-stage engineering pipeline illustrating the transformation
 * of raw NASA orbital data into an adaptive EVA mission plan.
 */

import React, { useState } from 'react';
import {
  Database,
  Layers,
  Wind,
  Target,
  AlertTriangle,
  Route,
  Activity,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info
} from 'lucide-react';

interface HowItWorksPageProps {
  onLaunchSimulator: () => void;
}

interface PipelineStage {
  id: string;
  step: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  dataUsed: string;
  derivedOutputs: string;
  modelledFactors: string;
  uncertainty: string;
  missionImpact: string;
}

export const HowItWorksPage: React.FC<HowItWorksPageProps> = ({ onLaunchSimulator }) => {
  const [activeStageId, setActiveStageId] = useState<string>('stage-01');

  const pipelineStages: PipelineStage[] = [
    {
      id: 'stage-01',
      step: '01',
      title: 'Loaded data products',
      subtitle: 'Real products read by this build, with their status',
      icon: <Database className="w-4 h-4 text-[#3898b8]" />,
      dataUsed: 'USGS MOLA-HRSC blended DEM (200 m), SWIM2 ice-consistency composite, THEMIS thermal-inertia mosaic (100 m), Viking MDIM brightness mosaic, LMD/MCD dust climatology, NAIF SPICE MRO kernels. Published values: MSL RAD dose (Gale) and Mars 2020 MEDA samples (Jezero).',
      derivedOutputs: 'Grids cropped to a 16 km window near 39.3°N, 171.4°W in Arcadia Planitia, each tagged REAL, DERIVED, MODELLED or SIMULATED.',
      modelledFactors: 'Nothing is invented at this stage; layers that are not loaded (CRISM, SHARAD, HiRISE boulders) stay marked as not used.',
      uncertainty: 'Each product has its own resolution: SWIM2 pixels are about 3 km, THEMIS 100 m, the DEM 200 m.',
      missionImpact: 'Every later number can be traced to a product or to a flagged assumption.'
    },
    {
      id: 'stage-02',
      step: '02',
      title: 'Grid fusion',
      subtitle: 'Resampling to one 50 × 50 grid',
      icon: <Layers className="w-4 h-4 text-[#3898b8]" />,
      dataUsed: 'The products listed in stage 01.',
      derivedOutputs: 'A 50 × 50 grid over the 16 km window (about 320 m per cell).',
      modelledFactors: 'Bilinear resampling to the common grid. Coarse layers are smoothed, not sharpened.',
      uncertainty: 'Resampling cannot add detail: the ice layer holds only a few independent values across the window.',
      missionImpact: 'Keeps every layer aligned to the same cells.'
    },
    {
      id: 'stage-03',
      step: '03',
      title: 'Environment values',
      subtitle: 'Published reference values, not Arcadia measurements',
      icon: <Wind className="w-4 h-4 text-[#c85a32]" />,
      dataUsed: 'Dust optical depth from LMD/MCD; MSL RAD dose rate at Gale (0.64 mSv/day); Mars 2020 MEDA afternoon air temperature and wind at Jezero.',
      derivedOutputs: 'A scenario sol and local time, dust optical depth, an air-temperature reference and a radiation dose proxy.',
      modelledFactors: 'Values from other sites are used as references and labelled so. They are not scaled to Arcadia.',
      uncertainty: 'Dose and weather at Arcadia differ from Gale and Jezero and were not measured.',
      missionImpact: 'Feeds the dust what-if, radiation dose estimate and display values.'
    },
    {
      id: 'stage-04',
      step: '04',
      title: 'Candidate sampling sites',
      subtitle: 'Rule-based picks from real layers, not detections',
      icon: <Target className="w-4 h-4 text-[#3898b8]" />,
      dataUsed: 'DEM slope and elevation and the SWIM2 ice-consistency index. THEMIS thermal inertia is shown but not used because the window shows a possible mosaic seam.',
      derivedOutputs: 'Three candidate sites: flat ground with the highest ice index, the steepest reachable slope, and the deepest depression.',
      modelledFactors: 'Fixed selection rules; the rank is a percentile inside this window.',
      uncertainty: 'No CRISM, SHARAD or HiRISE product is read. A candidate is a place worth checking, not a finding.',
      missionImpact: 'Gives the route planner destinations that follow the real terrain.'
    },
    {
      id: 'stage-05',
      step: '05',
      title: 'Terrain hazard estimation',
      subtitle: 'Hazard cells from the DEM',
      icon: <AlertTriangle className="w-4 h-4 text-[#c85a32]" />,
      dataUsed: 'DEM-derived slope and roughness.',
      derivedOutputs: 'A hazard score per cell and clusters of steep or rough cells.',
      modelledFactors: 'The planner slope limit comes from the NASA Mars EVA metabolic rate and the Minetti walking-cost equation (about 12 to 20 degrees, depending on risk tolerance and carried load).',
      uncertainty: 'No boulder census is loaded; sub-grid rocks and soft ground are not represented.',
      missionImpact: 'Keeps routes off cells a suited astronaut could not walk at a sustainable effort.'
    },
    {
      id: 'stage-06',
      step: '06',
      title: 'MULTI-OBJECTIVE A* ROUTE PLANNING',
      subtitle: 'Weighted search balancing distance, slope, hazard, comms and candidate sites',
      icon: <Route className="w-4 h-4 text-[#3898b8]" />,
      dataUsed: 'The grids above and the mission profile.',
      derivedOutputs: 'Three candidate routes: balanced, more candidate sites, and direct.',
      modelledFactors: 'Cost weights depend on the mission objective and risk tolerance. The weights are design choices, not measured quantities.',
      uncertainty: 'The search is a heuristic; it does not prove an optimum.',
      missionImpact: 'Shows why a route was chosen through its numbers.'
    },
    {
      id: 'stage-07',
      step: '07',
      title: 'EVA simulation',
      subtitle: 'Walking cost, oxygen and battery from published equations',
      icon: <Activity className="w-4 h-4 text-[#3898b8]" />,
      dataUsed: 'Route legs, signed gradient, Minetti et al. (2002) walking cost, NASA Mars PLSS studies (350 W average, 530 W peak, 8 h EVA), 20.9 kJ per litre O2.',
      derivedOutputs: 'Pace, metabolic power, oxygen and battery use over time, and a failure outcome if a consumable runs out.',
      modelledFactors: 'Mars gravity cost ratio 0.87 from a reduced-gravity walking study. Suit mass (160 kg) and heart-rate limits are assumptions.',
      uncertainty: 'Suit stiffness, thermal load and CO2 limits are not modelled; Apollo crews logged higher heart rates than this estimate.',
      missionImpact: 'Lets a planner see whether a plan fits inside the suit.'
    },
    {
      id: 'stage-08',
      step: '08',
      title: 'Re-planning',
      subtitle: 'What-if changes recompute the route',
      icon: <RefreshCw className="w-4 h-4 text-[#c85a32]" />,
      dataUsed: 'A user-set dust optical depth or a comms change.',
      derivedOutputs: 'A new route with differences in time, hazard, candidate sites and comms.',
      modelledFactors: 'The what-if inputs are scenarios, not forecasts.',
      uncertainty: 'Dust storm timing is unpredictable; the tool only shows the effect of the chosen scenario.',
      missionImpact: 'Shows how sensitive a plan is to a change.'
    },
    {
      id: 'stage-09',
      step: '09',
      title: 'MISSION REPORT',
      subtitle: 'A summary of the simulated walk',
      icon: <FileText className="w-4 h-4 text-[#3898b8]" />,
      dataUsed: 'The route, the simulated telemetry and the radiation proxy.',
      derivedOutputs: 'A report with distance, time, consumables, dose proxy and outcome.',
      modelledFactors: 'Every figure is MODELLED or SIMULATED as labelled; none is a flight certification.',
      uncertainty: 'This is a planning prototype, not a life-support analysis.',
      missionImpact: 'Documents the assumptions behind each plan.'
    },
  ];

  const activeStage = pipelineStages.find(s => s.id === activeStageId) || pipelineStages[0];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0d12] text-[#d6d9e0] select-text">
      {/* Top Breadcrumb */}
      <div className="hairline-b bg-[#0e1117] px-6 py-2.5 text-xs font-mono text-[#8b95a5]">
        <span>Marsweave</span> <span className="text-gray-600">/</span> <span className="text-white">System pipeline</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16 space-y-12">
        {/* Title Header */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-block text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">
            Scientific information architecture
          </div>
          <h1 className="text-3xl md:text-5xl font-sans font-bold tracking-tight text-white leading-tight">
            The 9-Stage MARSWEAVE Scientific Pipeline
          </h1>
          <p className="text-sm md:text-base text-[#9ba5b5] font-sans leading-relaxed">
            From raw NASA Planetary Data System orbital products to an adaptive on-surface traversal plan, explore each computational stage of our decision-support engine.
          </p>
        </div>

        {/* Interactive Vertical Pipeline Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column: Vertical Pipeline Step Selector */}
          <div className="md:col-span-5 space-y-2 font-mono text-xs">
            {pipelineStages.map((stage, idx) => {
              const isActive = stage.id === activeStageId;
              return (
                <div key={stage.id} className="relative">
                  {/* Connecting Line */}
                  {idx < pipelineStages.length - 1 && (
                    <div className="absolute left-5 top-9 bottom-0 w-px bg-[#1c2230] z-0" />
                  )}

                  <button
                    onClick={() => setActiveStageId(stage.id)}
                    className={`w-full p-3 text-left transition flex items-center gap-3 relative z-10 border ${
                      isActive
                        ? 'bg-[#141a26] border-[#3898b8] text-white shadow-sm'
                        : 'bg-[#0f131c] border-[#1c2230] text-[#8b95a5] hover:border-gray-700 hover:text-[#cdd3de]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-bold shrink-0 ${
                      isActive ? 'bg-[#3898b8] text-black' : 'bg-[#181e2b] text-[#8b95a5]'
                    }`}>
                      {stage.step}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{stage.title}</div>
                      <div className="text-[10px] text-[#6b7788] truncate font-sans">{stage.subtitle}</div>
                    </div>

                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-[#3898b8] shrink-0" />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Right Column: Deep Stage Inspection Panel */}
          <div className="md:col-span-7 bg-[#10141d] border border-[#1c2230] p-6 space-y-6">
            <div className="hairline-b pb-4">
              <div className="flex items-center gap-2 text-xs font-mono text-[#3898b8] mb-1">
                <span>STAGE {activeStage.step} OF 09</span>
                <span className="text-[#647082]">•</span>
                <span>Inspection</span>
              </div>
              <h2 className="text-xl font-bold text-white font-sans tracking-tight">
                {activeStage.title}
              </h2>
              <p className="text-xs text-[#8b95a5] font-sans mt-1">
                {activeStage.subtitle}
              </p>
            </div>

            {/* Stage Specifications */}
            <div className="space-y-4 text-xs font-sans">
              <div>
                <span className="font-mono text-[10px] text-[#6b7788] uppercase tracking-wider block mb-1">
                  1. INPUT NASA DATASETS & INSTRUMENTS
                </span>
                <p className="text-[#cdd3de] bg-[#0b0e14] p-3 border border-[#1c2230] font-mono leading-relaxed">
                  {activeStage.dataUsed}
                </p>
              </div>

              <div>
                <span className="font-mono text-[10px] text-[#6b7788] uppercase tracking-wider block mb-1">
                  2. DERIVED SCIENTIFIC PROPERTIES
                </span>
                <p className="text-[#cdd3de] bg-[#0b0e14] p-3 border border-[#1c2230] leading-relaxed">
                  {activeStage.derivedOutputs}
                </p>
              </div>

              <div>
                <span className="font-mono text-[10px] text-[#6b7788] uppercase tracking-wider block mb-1">
                  3. MODELLED FACTORS & CALIBRATION
                </span>
                <p className="text-[#cdd3de] bg-[#0b0e14] p-3 border border-[#1c2230] leading-relaxed">
                  {activeStage.modelledFactors}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
                  <span className="font-mono text-[10px] text-[#c85a32] uppercase tracking-wider block mb-1 font-semibold">
                    Scientific uncertainty
                  </span>
                  <p className="text-[#8b95a5] leading-relaxed">
                    {activeStage.uncertainty}
                  </p>
                </div>
                <div className="bg-[#0b0e14] p-3 border border-[#1c2230]">
                  <span className="font-mono text-[10px] text-[#3898b8] uppercase tracking-wider block mb-1 font-semibold">
                    EVA operational impact
                  </span>
                  <p className="text-[#8b95a5] leading-relaxed">
                    {activeStage.missionImpact}
                  </p>
                </div>
              </div>
            </div>

            <div className="hairline-t pt-4 flex items-center justify-between">
              <span className="text-[11px] font-mono text-[#8b95a5]">Grounded in NASA PDS archival standards</span>
              <button
                onClick={onLaunchSimulator}
                className="text-xs font-mono text-[#c85a32] hover:text-[#e06a3e] flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>Test in simulator</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
