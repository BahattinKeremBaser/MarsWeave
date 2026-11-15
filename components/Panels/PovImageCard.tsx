/**
 * MARSWEAVE - Arrival point-of-view card.
 * Shows a recent raw image from NASA's Perseverance rover as an ANALOG of what a surface crew would see.
 * Perseverance operates in Jezero crater, NOT in Arcadia Planitia, so the card says so explicitly.
 *
 * Data access: NASA's raw-image gallery has no documented public API. The JSON feed used below
 * (mars.nasa.gov/rss/api, feed=raw_images, category=mars2020) is an undocumented endpoint known from
 * community projects; it may change, be blocked by CORS or be empty (for example during solar conjunction).
 * Every failure falls back to a link to the official gallery. Image credit: NASA/JPL-Caltech.
 */
import React, { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';

const GALLERY_URL = 'https://mars.nasa.gov/mars2020/multimedia/raw-images/';
const FEED_URL =
  'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=6&order=sol+desc';

interface Pov { url: string; title: string; sol?: number }
type State = { kind: 'loading' } | { kind: 'ok'; pov: Pov } | { kind: 'unavailable' };

export const PovImageCard: React.FC = () => {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    (async () => {
      try {
        const res = await fetch(FEED_URL, { signal: ctrl.signal });
        if (!res.ok) throw new Error('feed ' + res.status);
        const data = await res.json();
        const imgs: any[] = Array.isArray(data?.images) ? data.images : [];
        // prefer a landscape "medium"/"large" browse image
        for (const im of imgs) {
          const f = im?.image_files || {};
          const url: string | undefined = f.medium || f.large || f.small;
          if (url && /^https:\/\/mars\.nasa\.gov\//.test(url)) {
            if (!cancelled) setState({ kind: 'ok', pov: { url, title: String(im.title || 'Perseverance raw image'), sol: im.sol } });
            return;
          }
        }
        throw new Error('no usable image');
      } catch {
        if (!cancelled) setState({ kind: 'unavailable' });
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => { cancelled = true; ctrl.abort(); clearTimeout(timer); };
  }, []);

  return (
    <div className="bg-[#0f172a] border border-[#1e293b] p-2.5 rounded text-xs font-mono" data-testid="pov-card">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] text-gray-400 flex items-center gap-1.5">
          <Camera className="w-3 h-3" /> WHAT A CREW SEES (ANALOG VIEW)
        </span>
        <span className="text-[8.5px] px-1.5 py-0.5 rounded uppercase font-semibold border bg-emerald-950 text-emerald-300 border-emerald-800/40">REAL image</span>
      </div>

      {state.kind === 'ok' && (
        <div>
          <img src={state.pov.url} alt={state.pov.title} className="w-full rounded border border-[#1e293b]" loading="lazy" />
          <div className="text-[10px] text-gray-400 mt-1 leading-snug">
            {state.pov.title}{state.pov.sol !== undefined ? ` (sol ${state.pov.sol})` : ''}. Credit: NASA/JPL-Caltech.
          </div>
        </div>
      )}
      {state.kind === 'loading' && <div className="text-[10px] text-gray-500">Loading latest Perseverance image...</div>}
      {state.kind === 'unavailable' && (
        <div className="text-[10px] text-gray-400 leading-snug">
          Live image feed is not reachable from here. Browse Perseverance raw images in the{' '}
          <a href={GALLERY_URL} target="_blank" rel="noopener noreferrer" className="text-[#38bdf8] underline">official NASA gallery</a>.
        </div>
      )}

      <div className="text-[10px] text-amber-300/90 mt-1.5 leading-snug">
        Perseverance works in Jezero crater, not in Arcadia Planitia. This is an analog of surface conditions, not this site.
      </div>
    </div>
  );
};
