import React, { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';

interface Props {
  /** True once the walk has started (time has moved past 0). */
  started: boolean;
  onOpen: () => void;
}

/** Small prompt on the map once a walk is running: offers the astronaut's-eye view. Can be dismissed. */
const AstronautHint: React.FC<Props> = ({ started, onOpen }) => {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(false);
  // Appear a few seconds after the walk starts, not instantly.
  useEffect(() => {
    if (!started) { setReady(false); return; }
    const t = window.setTimeout(() => setReady(true), 4500);
    return () => window.clearTimeout(t);
  }, [started]);
  if (!started || !ready || dismissed) return null;
  return (
    <div data-testid="eyes-hint" className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[#0a0f18]/95 backdrop-blur-md border border-[#38bdf8]/50 rounded-lg shadow-2xl pl-3 pr-2 py-2 text-sm text-gray-200">
      <span>See this walk through the astronaut's eyes.</span>
      <button
        onClick={onOpen}
        className="flex items-center gap-1.5 bg-[#38bdf8]/20 hover:bg-[#38bdf8]/30 border border-[#38bdf8]/60 text-[#38bdf8] px-2.5 py-1 rounded font-medium"
      >
        <Eye className="w-4 h-4" /> Astronaut view
      </button>
      <button onClick={() => setDismissed(true)} className="p-1 text-gray-500 hover:text-white" aria-label="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default AstronautHint;
