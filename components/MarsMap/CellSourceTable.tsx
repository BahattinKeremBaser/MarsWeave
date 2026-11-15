/**
 * MARSWEAVE - Cell source table for the Surface Inspector.
 * For every value shown in the inspector, states whether it is REAL / DERIVED / MODELLED / SIMULATED,
 * where it came from, and at what resolution. Reads the shared truth table so it cannot drift from the
 * layer panel.
 */
import React, { useState } from 'react';
import { DataStatus } from '../../types/marsweave';
import { LAYER_TRUTH, STATUS_DEFINITIONS } from '../../data/arcadiaData';

const ROWS: { label: string; layerId: string }[] = [
  { label: 'Elevation', layerId: 'mola_elevation' },
  { label: 'Slope', layerId: 'slope' },
  { label: 'Hazard', layerId: 'hazards' },
  { label: 'Ice prob.', layerId: 'sharad_ice' },
  { label: 'Comms', layerId: 'relay_comms' },
];

const BADGE: Record<DataStatus, string> = {
  'REAL NASA ARCHIVE': 'bg-emerald-950 text-emerald-300 border-emerald-800/40',
  'DERIVED': 'bg-sky-950 text-sky-300 border-sky-800/40',
  'PUBLISHED': 'bg-yellow-950 text-yellow-300 border-yellow-800/40',
  'MODELLED': 'bg-amber-950 text-amber-300 border-amber-800/40',
  'SIMULATED': 'bg-purple-950 text-purple-300 border-purple-800/40',
  'NOT LOADED': 'bg-gray-900 text-gray-400 border-gray-700/60',
};

export const CellSourceTable: React.FC = () => {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mb-2 border-t border-gray-800 pt-1.5" data-testid="cell-source-table">
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Where each value comes from</div>
      {ROWS.map(({ label, layerId }) => {
        const t = LAYER_TRUTH[layerId];
        if (!t) return null;
        const isOpen = open === layerId;
        return (
          <div key={layerId} className="mb-0.5">
            <button
              onClick={() => setOpen(isOpen ? null : layerId)}
              className="w-full flex items-center justify-between gap-2 text-left"
              aria-expanded={isOpen}
            >
              <span className="text-[10px] text-gray-400">{label}</span>
              <span className={`text-[8.5px] px-1.5 py-0.5 rounded uppercase font-semibold border ${BADGE[t.status]}`}>
                {t.status === 'REAL NASA ARCHIVE' ? 'REAL' : t.status}
              </span>
            </button>
            {isOpen && (
              <div className="text-[10px] text-gray-300 bg-[#0f172a] border border-[#1e293b] rounded p-1.5 mt-0.5 leading-snug">
                <div><span className="text-gray-500">Source:</span> {t.source}</div>
                <div><span className="text-gray-500">Resolution:</span> {t.resolution}</div>
                <div className="text-gray-400 mt-0.5">{t.note}</div>
                <div className="text-gray-500 mt-0.5 italic">{t.status}: {STATUS_DEFINITIONS[t.status]}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
