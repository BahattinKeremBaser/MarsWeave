import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { MISSION_BOUNDS, ARCADIA_SCIENCE_TARGETS, ARCADIA_HAZARD_ZONES, targetColor, shortTargetLabel, hazardColor, hazardKindLabel } from '../../data/arcadiaData';

interface Props {
  /** Colour at the lowest and highest elevation of the base shading (differs slightly between 2D and 3D). */
  low: [number, number, number];
  high: [number, number, number];
  className?: string;
}

/** Small legend: elevation ramp (real DEM range), candidate site colours, hazard colours. */
const MapLegend: React.FC<Props> = ({ low, high, className = '' }) => {
  const [open, setOpen] = useState(true);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const boxRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // Drag by the header; the box stays inside the map area. A click without movement still folds the legend.
  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = boxRef.current;
    if (!d || !box) return;
    let dx = e.clientX - d.x;
    let dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const parent = box.offsetParent?.getBoundingClientRect();
    const r = box.getBoundingClientRect();
    if (parent) {
      dx = Math.min(Math.max(dx, parent.left - r.left), parent.right - r.right);
      dy = Math.min(Math.max(dy, parent.top - r.top), parent.bottom - r.bottom);
    }
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
    d.x = e.clientX; d.y = e.clientY;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (drag.current && !drag.current.moved) setOpen(o => !o);
    drag.current = null;
  };
  const minE = Math.round(MISSION_BOUNDS.datumElevationMinMeters);
  const maxE = Math.round(MISSION_BOUNDS.datumElevationMaxMeters);
  const hazardTypes = Array.from(new Set(ARCADIA_HAZARD_ZONES.map(h => h.type)));
  const ramp = `linear-gradient(to right, rgb(${low.join(',')}), rgb(${high.join(',')}))`;

  return (
    <div
      ref={boxRef}
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      className={`bg-[#0a0f18]/90 backdrop-blur-md border border-[#1e293b] rounded shadow-xl text-gray-300 w-52 ${className}`}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Drag to move, click to fold"
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-200 cursor-grab active:cursor-grabbing select-none touch-none"
      >
        <span className="flex items-center gap-1"><GripVertical className="w-3.5 h-3.5 text-gray-500" />Legend</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </div>
      {open && (
        <div className="px-3 pb-2.5 space-y-2.5 text-[11px]">
          <div>
            <div className="text-gray-400 mb-1">Elevation (MOLA datum)</div>
            <div className="h-2 rounded-sm border border-gray-700" style={{ background: ramp }} />
            <div className="flex justify-between mt-0.5 tabular-nums">
              <span>{minE} m</span>
              <span>{maxE} m</span>
            </div>
            <div className="text-gray-500 mt-0.5">Shaded relief adds light and dark on top.</div>
          </div>
          <div>
            <div className="text-gray-400 mb-1">Candidate sites</div>
            {ARCADIA_SCIENCE_TARGETS.map(t => (
              <div key={t.id} className="flex items-center gap-2 leading-5">
                <span className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ background: targetColor(t) }} />
                <span className="truncate">{shortTargetLabel(t)}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-gray-400 mb-1">Hazard zones</div>
            {hazardTypes.map(type => (
              <div key={type} className="flex items-center gap-2 leading-5">
                <span className="w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: hazardColor(type) }} />
                <span className="truncate">{hazardKindLabel(type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapLegend;
