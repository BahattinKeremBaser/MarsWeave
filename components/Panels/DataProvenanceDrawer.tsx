/**
 * MARSWEAVE — NASA Data Provenance & Archival Traceability Drawer
 */

import React, { useState } from 'react';
import { DataProvenanceEntry } from '../../types/marsweave';
import { NASA_PROVENANCE_REGISTRY } from '../../data/arcadiaData';
import { PAYLOAD_MODEL_NOTES } from '../../engine/routeOptimizer';
import { PHYSIOLOGY_SOURCES } from '../../engine/evaPhysiology';
import {
  Database,
  X,
  ExternalLink,
  ShieldCheck,
  Search,
  Filter,
  Info
} from 'lucide-react';

interface DataProvenanceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedInstrumentFilter?: string;
}

export const DataProvenanceDrawer: React.FC<DataProvenanceDrawerProps> = ({
  isOpen,
  onClose,
  selectedInstrumentFilter
}) => {
  const [searchQuery, setSearchQuery] = useState<string>(selectedInstrumentFilter || '');

  if (!isOpen) return null;

  const filteredEntries = NASA_PROVENANCE_REGISTRY.filter(entry => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      entry.instrument.toLowerCase().includes(q) ||
      entry.instrumentFull.toLowerCase().includes(q) ||
      entry.mission.toLowerCase().includes(q) ||
      entry.usedInMarsweaveFor.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/75 backdrop-blur-sm select-none">
      <div className="bg-[#0b0f19] border-l border-[#1e293b] w-full max-w-2xl h-full shadow-2xl flex flex-col text-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-[#1e293b] bg-[#0d1322] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#38bdf8]/15 text-[#38bdf8] rounded border border-[#38bdf8]/30">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono text-[#38bdf8] uppercase tracking-widest font-semibold">
                Scientific reproducibility & honesty
              </div>
              <h2 className="text-base font-heading font-bold text-white tracking-wide">
                NASA data provenance registry
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-[#1e293b] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-[#1e293b] bg-[#080c14] flex items-center gap-2">
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search NASA instrument, mission, or dataset..."
            className="flex-1 bg-transparent text-xs text-white outline-none font-mono placeholder-gray-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[10px] font-mono text-gray-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Provenance Card List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          <div className="bg-[#0f172a] border border-[#1e293b] p-3 rounded text-[11px] text-gray-300 leading-relaxed">
            <span className="text-[#38bdf8] font-bold block mb-1 font-mono">Note:</span>
            MARSWEAVE is designed around the NASA instruments listed here, but in this build only elevation can be real (USGS MOLA-HRSC DEM, when loaded) and slope is derived from it. Everything else is modelled or simulated and is labelled that way. Instrument and dataset names show the intended source, not data that is already loaded.
          </div>

          {filteredEntries.map(entry => (
            <div
              key={entry.instrument}
              className="bg-[#0f172a] border border-[#1e293b] hover:border-gray-600 rounded p-3.5 transition space-y-2.5"
            >
              {/* Header Row */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-heading font-bold text-white">
                      {entry.instrument}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({entry.instrumentFull})
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-[#38bdf8] mt-0.5">
                    {entry.mission} • {entry.agency}
                  </div>
                </div>

                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase font-semibold shrink-0 ${
                    entry.dataStatus === 'REAL NASA ARCHIVE'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                      : entry.dataStatus === 'DERIVED'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800/40'
                      : entry.dataStatus === 'PUBLISHED'
                      ? 'bg-yellow-950 text-yellow-300 border border-yellow-800/40'
                      : entry.dataStatus === 'MODELLED'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                      : entry.dataStatus === 'NOT LOADED'
                      ? 'bg-gray-900 text-gray-400 border border-gray-700/60'
                      : 'bg-purple-950 text-purple-300 border border-purple-800/40'
                  }`}
                >
                  {entry.dataStatus}
                </span>
              </div>

              {/* Data Specifications */}
              <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono bg-[#090d16] p-2 rounded border border-gray-800/70">
                <div>
                  <span className="text-gray-500 block">PDS identifier:</span>
                  <span className="text-gray-300 truncate block">{entry.pdsDatasetId}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Spatial resolution:</span>
                  <span className="text-gray-300">{entry.spatialResolution}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Spectral bandwidth:</span>
                  <span className="text-gray-300 truncate block">{entry.spectralRange}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Data confidence:</span>
                  <span className={entry.confidence === 'HIGH' ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                    {entry.confidence}
                  </span>
                </div>
              </div>

              {/* Role in Marsweave */}
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 block mb-0.5">
                  Role in Marsweave optimization:
                </span>
                <p className="text-gray-300 text-[11px]">
                  {entry.usedInMarsweaveFor}
                </p>
              </div>

              {/* Scientific Honesty Notes */}
              <div className="pt-2 border-t border-gray-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold block mb-0.5">
                  Methodological caveat & honesty:
                </span>
                <p className="text-gray-400 font-mono text-[10px] leading-relaxed">
                  {entry.scientificHonestyNotes}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Payload & suit mobility model: citations and honesty notes */}
        <div className="border-t border-[#1e293b] bg-[#0a1020] p-3 max-h-[34%] overflow-y-auto" data-testid="payload-model-notes">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#38bdf8] font-semibold mb-2">
            SUIT, WALKING AND CONSUMABLES MODEL — SOURCES AND ASSUMPTIONS
          </div>
          <div className="space-y-2">
            {PAYLOAD_MODEL_NOTES.map(note => (
              <div key={note.id} className="border border-[#1e293b] rounded p-2 bg-[#0b0f19]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-gray-200">{note.title}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-gray-600 text-gray-300">
                    {note.status}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 mt-1 leading-snug">{note.text}</p>
                {note.citations.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 space-y-0.5">
                    {note.citations.map(c => (
                      <li key={c} className="text-[10px] font-mono text-gray-500 leading-snug">{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Per-constant source table of the physiology model */}
        <div className="border-t border-[#1e293b] bg-[#0a1020] p-3 max-h-[28%] overflow-y-auto" data-testid="physiology-sources">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#38bdf8] font-semibold mb-2">
            Every constant and its source
          </div>
          <ul className="space-y-1.5">
            {PHYSIOLOGY_SOURCES.map(src => (
              <li key={src.id} className="text-[10px] leading-snug">
                <span className={`font-mono px-1 py-0.5 rounded border mr-1.5 ${src.status === 'ASSUMPTION' ? 'border-amber-600 text-amber-300' : 'border-emerald-700 text-emerald-300'}`}>{src.status}</span>
                <span className="text-gray-200">{src.what}.</span> <span className="text-gray-500 font-mono">{src.ref}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#1e293b] bg-[#0d1322] flex items-center justify-between text-[10px] font-mono text-gray-500">
          <span>Full reference list on the Sources page</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
