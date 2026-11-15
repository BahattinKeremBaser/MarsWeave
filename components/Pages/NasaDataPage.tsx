/**
 * MARSWEAVE — NASA Planetary Data Catalog View
 * A formal scientific instrument and data product catalog with verifiable PDS citations.
 */

import React, { useState } from 'react';
import { NASA_PROVENANCE_REGISTRY, SUN_DERIVED, SUN_LS_DEG } from '../../data/arcadiaData';
import { hasReal, REAL_PRODUCTS } from '../../data/realProducts';
import {
  Database,
  Search,
  Filter,
  ExternalLink,
  ShieldCheck,
  Info,
  CheckCircle2
} from 'lucide-react';

export const NasaDataPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');

  const statuses = ['ALL', 'REAL NASA ARCHIVE', 'DERIVED', 'MODELLED', 'SIMULATED'];

  const filteredEntries = NASA_PROVENANCE_REGISTRY.filter(entry => {
    const matchesSearch =
      entry.instrument.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.instrumentFull.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.mission.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.usedInMarsweaveFor.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatusFilter === 'ALL' || entry.dataStatus === selectedStatusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0d12] text-[#d6d9e0] select-text">
      {/* Top Breadcrumb */}
      <div className="hairline-b bg-[#0e1117] px-6 py-2.5 text-xs font-mono text-[#8b95a5]">
        <span>Marsweave</span> <span className="text-gray-600">/</span> <span className="text-white">NASA data catalog</span>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-16 space-y-10">
        {/* Title Header */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-block text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">
            Planetary data system repository
          </div>
          <h1 className="text-3xl md:text-5xl font-sans font-bold tracking-tight text-white leading-tight">
            NASA Mission Data Provenance
          </h1>
          <p className="text-sm md:text-base text-[#9ba5b5] font-sans leading-relaxed">
            Every layer, calculation, and waypoint in MARSWEAVE is cross-referenced against published NASA planetary mission archives. We explicitly distinguish direct archival measurements from derived models and simulated operational scenarios.
          </p>
        </div>

        {/* What this build actually uses (computed from the data-truth table, never hand-edited) */}
        <div className="bg-[#10141d] border border-[#1c2230] p-5 space-y-3" data-testid="data-in-use">
          <div className="text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">Data in use in this build</div>
          <ul className="text-sm text-[#c4cad6] space-y-2 font-sans">
            <li><span className="text-emerald-400 font-mono text-xs mr-2">REAL</span>
              Terrain height (USGS MOLA-HRSC blended DEM, 200 m), the 16 x 16 km window; slope, routes and the astronaut view are computed from it.
              {hasReal('themis_ti') && ' Thermal inertia: USGS THEMIS quantitative mosaic (100 m).'}
              {hasReal('swim_ice') && ' Subsurface ice: SWIM2 composite (coarse, about 3 km pixels).'}
              {hasReal('hirise_albedo') && ' Ground brightness: USGS Viking MDIM 2.1 mosaic (232 m/px; image brightness, not calibrated albedo).'}
              {hasReal('dust_tau') && ' Dust optical depth: LMD climatology, Mars Year 34 (one 5 x 6 degree cell; converted to surface visible tau with stated assumptions).'}
            </li>
            <li><span className="text-amber-300 font-mono text-xs mr-2">Published</span>
              Radiation: 26.67 µSv/h from MSL RAD at Gale (Hassler et al. 2014), used as a proxy. Weather: afternoon wind and air temperature from published Mars 2020 MEDA samples at Jezero, shown as a reference only.
            </li>
            {hasReal('relay_passes') && (
              <li><span className="text-sky-300 font-mono text-xs mr-2">DERIVED</span>
                Orbiter passes: computed from the MRO ephemeris with NAIF SPICE (3 passes above 10° elevation in one sol, geometric visibility only, MRO only).
              </li>
            )}
            {hasReal('space_weather') && (() => {
              const sw: any = REAL_PRODUCTS.space_weather;
              const ev: any[] = (sw.events ?? []).slice(0, 5);
              return (
                <li data-testid="space-weather"><span className="text-amber-300 font-mono text-xs mr-2">MODELLED</span>
                  Space weather (NASA DONKI archive, last {sw.windowDays} days): {sw.marsDirectedCount} solar eruption simulation(s) predicted to reach Mars; arrival times are model forecasts, not measurements at Mars.
                  {ev.length > 0 && <span className="block text-xs text-[#8b95a5] mt-1">{ev.map(e => `${String(e.date).slice(0, 10)} ${e.what}`).join(' | ')}</span>}
                </li>
              );
            })()}
            {SUN_DERIVED && (
              <li><span className="text-sky-300 font-mono text-xs mr-2">DERIVED</span>
                Sun position at 14:24 local solar time: computed from latitude, the solar longitude Ls = {SUN_LS_DEG}° (taken from the LMD Mars Year 34 file at sol 342) and the Mars axial tilt: elevation {SUN_DERIVED.elDeg.toFixed(1)}°.
              </li>
            )}
            <li><span className="text-gray-400 font-mono text-xs mr-2">Model / sim</span>
              {['the boulder and hazard map (slope based; no HiRISE rock census)', !hasReal('crism_hydration') && 'CRISM minerals (the only CRISM image over the site covers about 16 % of the window)', 'the per-cell relay shadow map', 'the dust-storm timing (a compressed scenario; the tau peak value is real)'].filter(Boolean).join(', ')}
              {' '}are models or simulations. Each is labelled in the catalog below.
            </li>
            <li><span className="text-gray-400 font-mono text-xs mr-2">SIM</span>Suit oxygen, battery and heart rate are simulated. Walking power, pace, oxygen and battery follow the Minetti et al. (2002) walking-cost equation and NASA Mars PLSS design values (MODELLED); suit mass and heart-rate limits are assumptions.</li>
          </ul>
        </div>

        {/* What the four labels mean */}
        <div className="bg-[#10141d] border border-[#1c2230] p-5 space-y-3" data-testid="label-glossary">
          <div className="text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">What the labels mean</div>
          <ul className="text-sm text-[#c4cad6] space-y-2 font-sans">
            <li><span className="text-emerald-400 font-mono text-xs mr-2">REAL</span>
              The archived measurement itself, read from a NASA/USGS/PDS product for this location.</li>
            <li><span className="text-sky-300 font-mono text-xs mr-2">DERIVED</span>
              Computed from a real input with a known physical or geometric formula (for example orbiter passes from the MRO ephemeris, sun position from latitude, season and axial tilt, slope from the DEM). The input is real and the calculation can be repeated.</li>
            <li><span className="text-amber-300 font-mono text-xs mr-2">MODELLED</span>
              A real reference value or physical assumption applied to this site, but not measured here (for example radiation from MSL RAD at Gale, or weather from MEDA at Jezero). How reliable it is depends on the assumptions.</li>
            <li><span className="text-gray-400 font-mono text-xs mr-2">SIMULATED</span>
              Produced by a rule or a scenario with no measurement behind it (for example the boulder map, CRISM minerals, the storm timing, suit telemetry). It exists to demonstrate the decision logic only.</li>
          </ul>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-[#10141d] border border-[#1c2230] p-4 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-[#8b95a5]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by instrument, mission, or measurement type..."
              className="w-full bg-transparent outline-none text-white placeholder-[#6b7788]"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[#6b7788] uppercase text-[10px]">Filter status:</span>
            <div className="flex flex-wrap gap-1">
              {statuses.map(status => (
                <button
                  key={status}
                  onClick={() => setSelectedStatusFilter(status)}
                  className={`px-2.5 py-1 rounded text-[10.5px] transition ${
                    selectedStatusFilter === status
                      ? 'bg-[#3898b8] text-black font-semibold'
                      : 'bg-[#181d26] text-[#8b95a5] hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scientific Data Table */}
        <div className="space-y-4">
          <div className="text-xs font-mono text-[#8b95a5] flex items-center justify-between">
            <span>SHOWING {filteredEntries.length} OF {NASA_PROVENANCE_REGISTRY.length} DATASETS</span>
            <span>DATASET CATALOG · SEE DATA STATUS IN DATA_SOURCES.md</span>
          </div>

          <div className="space-y-3 font-sans">
            {filteredEntries.map(entry => (
              <div
                key={entry.instrument}
                className="bg-[#10141d] border border-[#1c2230] p-5 space-y-3 hover:border-gray-700 transition"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3 hairline-b pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white font-sans">
                        {entry.instrument}
                      </h2>
                      <span className="text-xs text-[#8b95a5]">
                        ({entry.instrumentFull})
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#3898b8] mt-0.5">
                      {entry.mission} • {entry.agency}
                    </div>
                  </div>

                  <span
                    className={`text-[9.5px] font-mono px-2 py-0.5 rounded font-semibold uppercase ${
                      entry.dataStatus === 'REAL NASA ARCHIVE'
                        ? 'bg-[#18261e] text-[#48b577] border border-[#234230]'
                        : entry.dataStatus === 'DERIVED'
                        ? 'bg-[#142330] text-[#3898b8] border border-[#1e3448]'
                        : entry.dataStatus === 'MODELLED'
                        ? 'bg-[#2a2214] text-[#d49938] border border-[#44351d]'
                        : 'bg-[#25192d] text-[#b37cd6] border border-[#3f274e]'
                    }`}
                  >
                    {entry.dataStatus}
                  </span>
                </div>

                {/* Technical Specifications Strip */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs bg-[#0b0e14] p-3 border border-[#1c2230]">
                  <div>
                    <span className="text-[10px] text-[#6b7788] block">PDS dataset ID</span>
                    <span className="text-white truncate block">{entry.pdsDatasetId}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6b7788] block">Spatial resolution</span>
                    <span className="text-white">{entry.spatialResolution}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6b7788] block">Bandwidth / channels</span>
                    <span className="text-white truncate block">{entry.spectralRange}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6b7788] block">Coverage confidence</span>
                    <span className={entry.confidence === 'HIGH' ? 'text-[#48b577] font-semibold' : 'text-[#d49938] font-semibold'}>
                      {entry.confidence} CONFIDENCE
                    </span>
                  </div>
                </div>

                {/* Role and Methodology */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="font-mono text-[10px] text-[#8b95a5] uppercase tracking-wider block mb-1">
                      What it contributes to Marsweave:
                    </span>
                    <p className="text-[#cdd3de] leading-relaxed">
                      {entry.usedInMarsweaveFor}
                    </p>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] text-[#c85a32] uppercase tracking-wider block mb-1">
                      Methodological caveat & honesty:
                    </span>
                    <p className="text-[#8b95a5] font-mono leading-relaxed text-[11px]">
                      {entry.scientificHonestyNotes}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
