/**
 * MARSWEAVE — NASA Multi-Mission Data Layer Manager
 * Allows granular control of MOLA, HiRISE, SHARAD, CRISM, THEMIS, MEDA, and RAD layers.
 */

import React from 'react';
import { LayerMetadata, DataStatus } from '../../types/marsweave';
import { STATUS_DEFINITIONS, LAYER_TRUTH, ELEVATION_SOURCE } from '../../data/arcadiaData';
import {
  Layers,
  Eye,
  EyeOff,
  Sliders,
  ShieldCheck,
  Database,
  Info
} from 'lucide-react';

interface LayerManagerPanelProps {
  layers: LayerMetadata[];
  onToggleLayer: (id: string) => void;
  onChangeOpacity: (id: string, opacity: number) => void;
  onOpenProvenance?: (instrument: string) => void;
}

export const LayerManagerPanel: React.FC<LayerManagerPanelProps> = ({
  layers,
  onToggleLayer,
  onChangeOpacity,
  onOpenProvenance
}) => {
  return (
    <div className="flex flex-col h-full bg-[#0a0e17] border-l border-[#1a2333] text-gray-200 select-none">
      {/* Header */}
      <div className="p-3 border-b border-[#1a2333] bg-[#0c121e]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#38bdf8]" />
            <h2 className="text-xs font-mono uppercase tracking-widest text-[#38bdf8] font-semibold">
              NASA data layers
            </h2>
          </div>
          <span className="text-[10px] font-mono bg-[#1e293b] text-gray-400 px-1.5 py-0.5 rounded">
            {layers.filter(l => l.visible).length} / {layers.length} ACTIVE
          </span>
        </div>
        <p className="text-[11px] text-gray-400">
          Each layer is labelled by how it was produced. Only layers marked REAL are read from a NASA/partner product.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-1" data-testid="status-legend">
          {(Object.keys(STATUS_DEFINITIONS) as DataStatus[]).map(st => (
            <div key={st} title={STATUS_DEFINITIONS[st]} className="text-[9px] font-mono text-gray-400 leading-tight">
              <span className="text-gray-200 font-semibold">{layers.filter(l => l.dataType === st).length}</span>{' '}
              {st}
            </div>
          ))}
        </div>
        {ELEVATION_SOURCE === 'SYNTHETIC' && (
          <div className="mt-2 text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded p-1.5">
            Elevation is currently synthetic. Run <span className="font-semibold">scripts/fetch_arcadia_dem.py</span> to load real MOLA-HRSC data.
          </div>
        )}
      </div>

      {/* Layer List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {layers.map(layer => {
          return (
            <div
              key={layer.id}
              className={`p-2.5 rounded border transition ${
                layer.visible
                  ? 'bg-[#0f172a] border-[#1e293b]'
                  : 'bg-[#090d15]/60 border-gray-900 opacity-60'
              }`}
            >
              {/* Row 1: Visibility, Name, Color Swatch */}
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => onToggleLayer(layer.id)}
                  className={`p-1 rounded transition ${
                    layer.visible ? 'text-[#38bdf8] hover:bg-[#1e293b]' : 'text-gray-500 hover:text-gray-300'
                  }`}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="text-xs font-heading font-semibold text-white truncate">
                      {layer.name}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-gray-400 mt-0.5 truncate">
                    {layer.instrument} • {layer.mission}
                  </div>
                  {LAYER_TRUTH[layer.id] && (
                    <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                      Source: {LAYER_TRUTH[layer.id].source}
                    </div>
                  )}
                </div>

                {/* Data Status Badge */}
                <div className="text-right shrink-0">
                  <span
                    className={`text-[8.5px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                      layer.dataType === 'REAL NASA ARCHIVE'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40'
                        : layer.dataType === 'DERIVED'
                        ? 'bg-sky-950 text-sky-300 border border-sky-800/40'
                        : layer.dataType === 'PUBLISHED'
                        ? 'bg-yellow-950 text-yellow-300 border border-yellow-800/40'
                        : layer.dataType === 'MODELLED'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800/40'
                        : layer.dataType === 'NOT LOADED'
                        ? 'bg-gray-900 text-gray-400 border border-gray-700/60'
                        : 'bg-purple-950 text-purple-300 border border-purple-800/40'
                    }`}
                  >
                    {layer.dataType === 'REAL NASA ARCHIVE' ? 'REAL' : layer.dataType}
                  </span>
                </div>
              </div>

              {/* Row 2: Opacity Slider (When visible) */}
              {layer.visible && (
                <div className="mt-2.5 pt-2 border-t border-gray-800/60 flex items-center gap-3">
                  <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
                    Opacity:
                  </span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={layer.opacity}
                    onChange={e => onChangeOpacity(layer.id, parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-gray-800 rounded accent-[#38bdf8] cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-gray-300 w-8 text-right">
                    {Math.round(layer.opacity * 100)}%
                  </span>
                </div>
              )}

              {/* Row 3: Meta & Provenance Quick Info */}
              <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-gray-500">
                <span>RES: {layer.resolution}</span>
                <span className="flex items-center gap-1">
                  <span>Confidence:</span>
                  <span className={layer.confidence === 'HIGH' ? 'text-emerald-400' : 'text-amber-400'}>
                    {layer.confidence}
                  </span>
                </span>
                {onOpenProvenance && (
                  <button
                    onClick={() => onOpenProvenance(layer.instrument)}
                    className="text-[#38bdf8] hover:underline"
                  >
                    PROVENANCE →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
