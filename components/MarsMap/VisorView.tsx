/**
 * MARSWEAVE — astronaut-eye view. Renders the real DEM first-person and, in ADVANCED mode, the visor HUD on top. It follows
 * the simulator state, so it needs no setup of its own.
 *
 * SMOOTHNESS
 *  - The picture is drawn on the GPU (WebGL2, engine/visorGL.ts) in its own animation-frame loop at the screen's refresh
 *    rate, independent of the simulator (which only ticks 10 times per second).
 *  - The camera is interpolated between simulator ticks (one tick of delay), so motion is continuous, not stepped.
 *  - Dynamic resolution: the GPU cost of a frame is measured now and then and the internal resolution is raised or lowered to
 *    keep a frame well under the 60 fps budget on any machine.
 *  - Without WebGL2 the software renderer (engine/visorRender.ts) is used instead, at low resolution and a limited frame
 *    rate, so it can never freeze the page.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RouteCandidate, AstronautTelemetry } from '../../types/marsweave';
import {
  buildHeightMap, renderVisor, postProcessVisor, makeProjector, lineOfSightClear, terrainHeight, sunFromLocalTime, parseLocalHours,
  WORLD_W_M, WORLD_H_M, ViewParams, HeightMap, SunState
} from '../../engine/visorRender';
import { VisorGL } from '../../engine/visorGL';
import {
  computeVisorReadout, routeLookAhead, smoothHeading, headingRadians, distanceMeters, meanShieldingAlongRoute, terrainAttitude, EYE_HEIGHT_M
} from '../../engine/visorTelemetry';
import { RAD_BASELINE_MICROSV_H, ELEVATION_SOURCE, REAL_ALBEDO_GRID, SUN_DERIVED, GRID_COLS, GRID_ROWS } from '../../data/arcadiaData';
import { VisorHud } from './VisorHud';

const flat = REAL_ALBEDO_GRID ? REAL_ALBEDO_GRID.flat().sort((a, b) => a - b) : [0, 1];
const ALB_LO = flat[Math.floor(flat.length * 0.02)];
const ALB_HI = flat[Math.floor(flat.length * 0.98)] || 1;

/** Software-renderer quality steps (fallback only) and its widest internal size. */
const CPU_STEPS = [1, 0.8, 0.64, 0.5];
const CPU_MAX_W = 640;
/** GPU path: frame cost the resolution control aims for, and the band around it where nothing is changed (ms). */
const GPU_TARGET_MS = 8;
const GPU_HIGH_MS = 11;
const GPU_LOW_MS = 5;
const MIN_SCALE = 0.35;
/** A frame this slow at the lowest resolution means the "GPU" is really software emulation: use the software renderer instead. */
const GPU_GIVE_UP_MS = 45;
/** Set when the GPU path was found unusable on this machine, so re-opening the view does not try it again. */
let gpuGaveUp = false;
/** The canvas never gets more device pixels than this (4K screens are rendered below native size). */
const MAX_CANVAS_PIXELS = 2.8e6;
/** Overlay (route dots, glare) resolution cap, pixels wide. */
const OVERLAY_MAX_W = 1600;

interface VisorViewProps {
  astronautPos: [number, number];
  selectedRoute: RouteCandidate;
  targetPoint: [number, number];
  dustStormActive?: boolean;
  dustTau: number;
  sunElevationDeg: number;
  localTimeLabel: string;
  evaLimitMin: number;
  elapsedSec: number;
  astronautTelemetry?: AstronautTelemetry;
  /** Easy mode: no technical HUD, only a short message. */
  simple?: boolean;
  onExit: () => void;
}

interface Sample { t: number; pos: [number, number]; e: number }
interface CamState { heading: number; pitch: number; chainage: number; route: RouteCandidate | null }
interface Live {
  route: RouteCandidate;
  target: [number, number];
  storm: boolean;
  tau: number;
  sun: SunState;
  procedural: boolean;
  hm: HeightMap;
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Camera position / simulated time at time `rt` between the recorded simulator samples (holds the newest one while the simulator is paused). */
function cameraAt(samples: Sample[], rt: number): { pos: [number, number]; e: number } | null {
  const n = samples.length;
  if (n === 0) return null;
  if (n === 1 || rt <= samples[0].t) return { pos: samples[0].pos, e: samples[0].e };
  for (let i = n - 1; i >= 0; i--) {
    if (samples[i].t <= rt) {
      if (i === n - 1) return { pos: samples[i].pos, e: samples[i].e };
      const a = samples[i], b = samples[i + 1];
      const k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1);
      return { pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * k, a.pos[1] + (b.pos[1] - a.pos[1]) * k], e: a.e + (b.e - a.e) * k };
    }
  }
  return { pos: samples[0].pos, e: samples[0].e };
}

/**
 * Heading: turns calmly towards a point ~90 m AHEAD ALONG the route (projected on the route line, never behind).
 * `chainage` remembers how far along the route we already are, so the view cannot flip backwards on a route that doubles
 * back; it is reset when another route is selected or the simulation is rewound.
 */
function stepHeading(cs: CamState, pos: [number, number], route: RouteCandidate, target: [number, number], dtSec: number): number {
  if (cs.route !== route) { cs.route = route; cs.chainage = 0; cs.heading = NaN; }
  const free = routeLookAhead(route.waypoints, pos, 90, 0);
  if (free && free.chainageM < cs.chainage - 25) cs.chainage = free.chainageM;
  const ahead = free && cs.chainage > 0 ? routeLookAhead(route.waypoints, pos, 90, Math.max(0, cs.chainage - 5)) : free;
  if (ahead) cs.chainage = Math.max(cs.chainage, ahead.chainageM);
  const aim: [number, number] = ahead ? ahead.point : target;
  const desired = distanceMeters(pos, aim) > 2 ? headingRadians(pos, aim) : ahead ? ahead.tangentRad : cs.heading;
  cs.heading = Number.isNaN(cs.heading)
    ? (Number.isNaN(desired) ? 0 : desired)                 // first frame: face the way of travel immediately
    : (Number.isNaN(desired) ? cs.heading : smoothHeading(cs.heading, desired, dtSec));
  return cs.heading;
}

/** Real Viking brightness, bilinear, normalised to the 2 %..98 % range (same mapping the GPU texture uses). */
const albedoAt = REAL_ALBEDO_GRID
  ? (x: number, y: number) => {
      const c = clamp((x / WORLD_W_M) * (GRID_COLS - 1), 0, GRID_COLS - 1.001);
      const rr = clamp((y / WORLD_H_M) * (GRID_ROWS - 1), 0, GRID_ROWS - 1.001);
      const c0 = c | 0, r0 = rr | 0, fx = c - c0, fy = rr - r0;
      const g = REAL_ALBEDO_GRID;
      const val = g[r0][c0] * (1 - fx) * (1 - fy) + g[r0][c0 + 1] * fx * (1 - fy) + g[r0 + 1][c0] * (1 - fx) * fy + g[r0 + 1][c0 + 1] * fx * fy;
      return (val - ALB_LO) / Math.max(1e-9, ALB_HI - ALB_LO);
    }
  : undefined;

export const VisorView: React.FC<VisorViewProps> = ({
  astronautPos, selectedRoute, targetPoint, dustStormActive, dustTau, sunElevationDeg, localTimeLabel,
  evaLimitMin, elapsedSec, astronautTelemetry, simple, onExit
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const cpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<{ w: number; h: number }>({ w: 760, h: 700 });
  const glRef = useRef<VisorGL | null>(null);
  const [mode, setMode] = useState<'init' | 'gl' | 'cpu'>('init');
  const [ready, setReady] = useState(false);
  const [procedural, setProcedural] = useState(true);

  const hm = useMemo(() => buildHeightMap(512, procedural), [procedural]);
  const sun = useMemo(
    () => sunFromLocalTime(parseLocalHours(localTimeLabel), sunElevationDeg, SUN_DERIVED?.decDeg ?? 0),
    [localTimeLabel, sunElevationDeg]
  );

  // everything the frame loop needs, refreshed on every React render (the loop itself never re-renders React)
  const live = useRef<Live>({ route: selectedRoute, target: targetPoint, storm: !!dustStormActive, tau: dustTau, sun, procedural, hm });
  live.current = { route: selectedRoute, target: targetPoint, storm: !!dustStormActive, tau: dustTau, sun, procedural, hm };

  // ---- simulator samples (for camera interpolation) ----
  const samplesRef = useRef<Sample[]>([]);
  const tickMsRef = useRef(100);
  const simRateRef = useRef(10);          // simulated seconds per real second (only used to calm the walking bob at fast-forward)
  useEffect(() => {
    const now = performance.now();
    const arr = samplesRef.current;
    const last = arr[arr.length - 1];
    if (last) {
      if (distanceMeters(last.pos, astronautPos) > 60 || elapsedSec < last.e - 0.5) arr.length = 0;   // jump / rewind: snap
      else {
        const dtS = (now - last.t) / 1000;
        if (dtS > 0.02 && dtS < 0.4) {
          tickMsRef.current += (dtS * 1000 - tickMsRef.current) * 0.2;
          simRateRef.current += ((elapsedSec - last.e) / dtS - simRateRef.current) * 0.3;
        }
      }
    }
    arr.push({ t: now, pos: astronautPos, e: elapsedSec });
    if (arr.length > 6) arr.shift();
  }, [astronautPos, elapsedSec]);

  // heading state (the HUD reads it at the simulator's 10 Hz; the frame loop updates it every frame)
  const camRef = useRef<CamState>({ heading: NaN, pitch: NaN, chainage: 0, route: null });
  if (Number.isNaN(camRef.current.heading) || camRef.current.route !== selectedRoute) stepHeading(camRef.current, astronautPos, selectedRoute, targetPoint, 0);
  const heading = camRef.current.heading;
  const readout = useMemo(() => computeVisorReadout(astronautPos, heading, targetPoint), [astronautPos, heading, targetPoint]);
  const progress = Math.min(1, elapsedSec / Math.max(1, selectedRoute.totalDurationMin * 60));
  const meanShield = useMemo(
    () => meanShieldingAlongRoute(selectedRoute.waypoints, Math.max(0.02, progress)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedRoute, Math.round(progress * 50)]
  );
  const atEnd = distanceMeters(astronautPos, targetPoint) < 40;

  // Wind-blown dust overlay (ILLUSTRATIVE, drawn only while the storm event is active). Own rAF loop so it keeps
  // moving even when the simulation is paused.
  useEffect(() => {
    const c = dustRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    if (!dustStormActive) { ctx.clearRect(0, 0, c.width, c.height); return; }
    const N = 170;
    const seed = (i: number, k: number) => { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); };
    let raf = 0;
    const draw = (now: number) => {
      const t = now / 1000;
      ctx.clearRect(0, 0, c.width, c.height);
      const gust = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.3);
      const veil = ctx.createLinearGradient(0, 0, 0, c.height);
      veil.addColorStop(0, `rgba(176,110,70,${0.10 + 0.06 * gust})`);
      veil.addColorStop(0.55, `rgba(196,126,80,${0.22 + 0.10 * gust})`);
      veil.addColorStop(1, `rgba(150,92,60,${0.16 + 0.06 * gust})`);
      ctx.fillStyle = veil; ctx.fillRect(0, 0, c.width, c.height);
      ctx.lineCap = 'round';
      for (let i = 0; i < N; i++) {
        const depth = seed(i, 1);                       // 0 far .. 1 near
        const speed = 90 + 420 * depth + 160 * gust;     // px/s, left to right
        const x = ((seed(i, 2) * (c.width + 200) + t * speed) % (c.width + 200)) - 100;
        const y = c.height * (0.28 + 0.72 * seed(i, 3)) + Math.sin(t * 1.3 + i) * 2 * depth;
        const len = 8 + 46 * depth * (0.6 + gust);
        ctx.strokeStyle = `rgba(222,170,120,${0.08 + 0.22 * depth * (0.6 + 0.4 * gust)})`;
        ctx.lineWidth = 0.6 + 1.6 * depth;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y + len * 0.06); ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [dustStormActive]);

  // ---- window size ----
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const upd = () => { boxRef.current = { w: Math.max(320, el.clientWidth), h: Math.max(240, el.clientHeight) }; };
    upd();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---- choose the renderer: GPU if possible, otherwise software ----
  useEffect(() => {
    const w = window as unknown as { __visorForceCpu?: boolean };
    const c = glCanvasRef.current;
    if (!c || w.__visorForceCpu || gpuGaveUp) { setMode('cpu'); return; }
    const g = VisorGL.create(c);
    if (!g) { setMode('cpu'); return; }
    g.onLost = () => { glRef.current = null; setMode('cpu'); };
    g.setAlbedo(REAL_ALBEDO_GRID ?? null, ALB_LO, ALB_HI);
    glRef.current = g;
    setMode('gl');
    return () => {
      g.dispose();
      if (glRef.current === g) glRef.current = null;
      // give the context back for good, unless this is only a development re-mount that has already made a new one
      window.setTimeout(() => { if (!glRef.current) g.loseContext(); }, 60);
    };
  }, []);

  // ---- frame loop ----
  useEffect(() => {
    if (mode === 'init') return;
    const glCanvas = glCanvasRef.current, cpuCanvas = cpuCanvasRef.current, overlay = overlayRef.current;
    if (!overlay) return;
    const octx = overlay.getContext('2d');
    if (!octx) return;
    const win = window as unknown as {
      __visor?: Record<string, unknown>; __visorForceScale?: number; __visorMs?: number; __visorSize?: string;
    };

    let raf = 0;
    let lastNow = performance.now();
    let lastSig = '';
    let lastRenderAt = 0;
    let ivEma = 16.7;                                   // smoothed gap between two consecutive drawn frames (ms)
    let drawn = 0;
    let fpsT0 = lastNow, fpsN = 0, fps = 0;
    // GPU resolution control
    let startScale = 0.7, probe = false;
    let scale = 0;                                      // internal resolution factor, chosen on the first frame
    let scaleCap = 1;                                   // highest scale that was seen to hold the frame budget
    let hist: number[] = [];                            // recent GPU frame times at the current scale
    let warm = 8;                                       // frames to measure back to back after start / after a change
    let skip = 2;                                       // first frames after start / a size change include one-off costs
    let countdown = 0;
    let lastUpAt = -1e9, lastUpFrom = 0;
    let lastAdjAt = 0;
    // software fallback
    let cpuQ = 0;
    let cpuLastEnd = 0, cpuLastMs = 0, cpuSlow = 0, cpuFast = 0;
    const cpuImg: { w: number; h: number; data: ImageData | null } = { w: 0, h: 0, data: null };
    let markerGlow: HTMLCanvasElement | null = null;

    const getGlow = () => {
      if (markerGlow) return markerGlow;
      const g = document.createElement('canvas');
      g.width = g.height = 32;
      const x = g.getContext('2d');
      if (x) {
        const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(255,170,90,0.95)');
        gr.addColorStop(0.35, 'rgba(255,130,50,0.45)');
        gr.addColorStop(1, 'rgba(255,110,40,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      }
      markerGlow = g;
      return g;
    };

    /** Route markers, destination beacon, sun glare, lens ghosts, dust motes: a cheap 2-D layer above the picture. */
    const drawOverlay = (W: number, H: number, hmap: HeightMap, v: ViewParams, route: RouteCandidate, target: [number, number], tau: number, e: number) => {
      if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
      const sc = H / 405;
      octx.clearRect(0, 0, W, H);
      const proj = makeProjector(hmap, v, W, H);
      const wps = route.waypoints;
      const toM = (p: [number, number]): [number, number] => [(p[0] / 100) * WORLD_W_M, (p[1] / 100) * WORLD_H_M];
      const visible = (x: number, y: number, h: number) => lineOfSightClear(hmap, v, proj.camH, x, y, h);
      octx.save();
      octx.globalCompositeOperation = 'lighter';
      const glow = getGlow();
      for (let i = 0; i + 1 < wps.length; i++) {
        const a = toM([wps[i].x, wps[i].y]), b = toM([wps[i + 1].x, wps[i + 1].y]);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let d = 0; d < len; d += 5) {
          const t = d / len;
          const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          if (Math.hypot(x - v.xM, y - v.yM) > 500) continue;
          const gh = terrainHeight(hmap, x, y);
          const p = proj.project(x, y, gh);
          if (!p || p.sx < -10 || p.sx > W + 10 || p.sy < 0 || p.sy > H) continue;
          if (!visible(x, y, gh)) continue;
          const r = Math.min(7 * sc, Math.max(1.4 * sc, (60 * sc) / p.z));
          const al = Math.max(0.25, 1 - p.z / 520);
          octx.globalAlpha = al * 0.9;
          octx.drawImage(glow, p.sx - r * 2.2, p.sy - r * 1.3, r * 4.4, r * 2.6);
          octx.globalAlpha = al;
          octx.fillStyle = 'rgb(255,150,70)';
          octx.fillRect(p.sx - r, p.sy - r * 0.3, r * 2, Math.max(1.2 * sc, r * 0.5));
        }
      }
      octx.restore();
      const tm = toM(target);
      const th = terrainHeight(hmap, tm[0], tm[1]);
      const tp = proj.project(tm[0], tm[1], th);
      if (tp && tp.sx > 0 && tp.sx < W && visible(tm[0], tm[1], th)) {
        octx.save();
        octx.shadowBlur = 10 * sc; octx.shadowColor = '#38bdf8';
        octx.strokeStyle = 'rgba(120,210,255,0.9)'; octx.lineWidth = 2 * sc;
        const top = proj.project(tm[0], tm[1], th + 60);
        octx.beginPath(); octx.moveTo(tp.sx, tp.sy); octx.lineTo(tp.sx, top ? top.sy : 0); octx.stroke();
        octx.beginPath(); octx.arc(tp.sx, tp.sy, Math.max(3 * sc, (400 * sc) / tp.z), 0, Math.PI * 2); octx.stroke();
        octx.restore();
      }

      // optics (cosmetic): sun glare with lens ghosts, drifting dust motes
      try {
        const sunS = v.sun;
        const sunAzRel = Math.atan2(Math.sin((sunS.azDeg * Math.PI) / 180 - v.headingRad), Math.cos((sunS.azDeg * Math.PI) / 180 - v.headingRad));
        const sEl = (sunS.elDeg * Math.PI) / 180;
        const inFront = Math.abs(sunAzRel) < Math.PI / 2;
        const sx = W / 2 + proj.focal * Math.tan(sunAzRel);
        const sy = proj.horizonY - (proj.focal * Math.tan(sEl)) / Math.max(0.15, Math.cos(sunAzRel));
        const atten = Math.exp(-tau * 0.3);
        if (inFront && sx > -W * 0.6 && sx < W * 1.6) {
          octx.save();
          octx.globalCompositeOperation = 'screen';
          const gl = octx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.75);
          gl.addColorStop(0, `rgba(255,236,205,${0.55 * atten})`);
          gl.addColorStop(0.12, `rgba(255,205,150,${0.30 * atten})`);
          gl.addColorStop(0.45, `rgba(240,160,110,${0.10 * atten})`);
          gl.addColorStop(1, 'rgba(240,160,110,0)');
          octx.fillStyle = gl; octx.fillRect(0, 0, W, H);
          const cx = W / 2, cy = H / 2, dx = cx - sx, dy = cy - sy;
          const ghosts: Array<[number, number, string]> = [[0.55, 26 * sc, '255,200,140'], [0.95, 14 * sc, '150,200,255'], [1.35, 34 * sc, '255,170,110'], [1.8, 18 * sc, '255,230,190']];
          for (const [k, rr, col] of ghosts) {
            const gx = sx + dx * k, gy = sy + dy * k;
            const g2 = octx.createRadialGradient(gx, gy, 0, gx, gy, rr);
            g2.addColorStop(0, `rgba(${col},${0.10 * atten})`); g2.addColorStop(1, `rgba(${col},0)`);
            octx.fillStyle = g2; octx.beginPath(); octx.arc(gx, gy, rr, 0, Math.PI * 2); octx.fill();
          }
          octx.restore();
        }
        const nMotes = Math.round(18 + Math.min(1, tau / 2.5) * 70);
        octx.save();
        for (let i = 0; i < nMotes; i++) {
          const a = (i * 7919) % 1000 / 1000, b = (i * 104729) % 1000 / 1000, c = (i * 1299709) % 1000 / 1000;
          const mx = ((a * W + e * (4 + c * 10)) % W + W) % W;
          const my = ((b * H * 0.9 + Math.sin(e * 0.4 + i) * 6) % H + H) % H;
          const r2 = (0.5 + c * 1.5) * sc;
          octx.fillStyle = `rgba(255,225,190,${0.05 + c * 0.14})`;
          octx.beginPath(); octx.arc(mx, my, r2, 0, Math.PI * 2); octx.fill();
        }
        octx.restore();
      } catch { /* optics are optional */ }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dtMs = Math.min(250, now - lastNow);
      lastNow = now;
      if (now - fpsT0 > 1000) { fps = (fpsN * 1000) / (now - fpsT0); fpsN = 0; fpsT0 = now; }

      const L = live.current;
      const samples = samplesRef.current;
      const delay = clamp(tickMsRef.current * 1.3, 70, 260);          // render slightly behind the newest tick so jitter is absorbed
      const cam = cameraAt(samples, now - delay);
      if (!cam) return;
      const cs = camRef.current;
      const heading = stepHeading(cs, cam.pos, L.route, L.target, dtMs / 1000);
      const att = terrainAttitude(cam.pos, heading);
      const pitchTarget = clamp((att.pitchDeg * Math.PI) / 180 * -0.3, -0.12, 0.12);
      cs.pitch = Number.isNaN(cs.pitch) ? pitchTarget : cs.pitch + (pitchTarget - cs.pitch) * (1 - Math.exp(-dtMs / 1000 / 0.25));
      const bob = Math.sin(cam.e * 0.9) * 0.04 * clamp(12 / Math.max(1, Math.abs(simRateRef.current)), 0.08, 1);
      const v: ViewParams = {
        xM: (cam.pos[0] / 100) * WORLD_W_M, yM: (cam.pos[1] / 100) * WORLD_H_M, eyeM: EYE_HEIGHT_M + bob,
        headingRad: heading, pitchRad: cs.pitch, sun: L.sun, tau: L.tau, stormActive: L.storm, procedural: L.procedural, albedoAt
      };
      const box = boxRef.current;

      if (mode === 'gl') {
        const g = glRef.current;
        if (!g || !glCanvas) return;
        const dprCap = Math.min(window.devicePixelRatio || 1, 2);
        let cw = box.w * dprCap, ch = box.h * dprCap;
        if (cw * ch > MAX_CANVAS_PIXELS) { const f = Math.sqrt(MAX_CANVAS_PIXELS / (cw * ch)); cw *= f; ch *= f; }
        cw = Math.round(cw); ch = Math.round(ch);
        const forced = typeof win.__visorForceScale === 'number' ? win.__visorForceScale : undefined;
        if (scale === 0) { startScale = clamp(Math.sqrt(8e5 / (cw * ch)), MIN_SCALE, 1); scale = MIN_SCALE; probe = true; }   // first frame: small probe, so software GL is spotted cheaply
        if (forced !== undefined) scale = forced;
        const sig = [v.xM.toFixed(2), v.yM.toFixed(2), heading.toFixed(4), v.pitchRad.toFixed(4), bob.toFixed(3), L.sun.elDeg.toFixed(2),
          L.sun.azDeg.toFixed(2), L.tau.toFixed(3), L.storm ? 1 : 0, L.procedural ? 1 : 0, cw, ch, scale.toFixed(3)].join('|');
        if (sig === lastSig) return;                  // nothing changed: leave the last picture on screen, no GPU work
        lastSig = sig;

        g.setCanvasSize(cw, ch);
        g.scale = scale;
        const measure = forced === undefined && (warm > 0 || countdown-- <= 0);
        const t0 = performance.now();
        try {
          g.render(L.hm, v);
          if (measure) g.finish();                    // wait for the GPU now and then to learn what a frame costs
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('GPU view failed, switching to the software renderer:', err);
          glRef.current = null;
          setMode('cpu');
          return;
        }
        const gpuMs = performance.now() - t0;

        if (probe) {
          probe = false;
          if (gpuMs > 2000) {
            // eslint-disable-next-line no-console
            console.warn(`GPU view too slow (${gpuMs.toFixed(0)} ms for a tiny first frame), using the software renderer`);
            gpuGaveUp = true; glRef.current = null; g.dispose(); setMode('cpu'); return;
          }
          scale = forced !== undefined ? forced : startScale; skip = 1;
        } else if (measure) {
          if (warm > 0) warm--;
          countdown = 24;
          if (skip > 0) skip--;
          else {
            hist.push(gpuMs);
            if (hist.length > 3) hist.shift();
            const hopeless = gpuMs > 150;                 // one such sample is enough to know the picture is far too slow
            if (hist.length === 3 || hopeless) {
              const med = hopeless ? gpuMs : [...hist].sort((a, b) => a - b)[1];
              const s = scale;
              let next = s;
              if (med > GPU_HIGH_MS) {
                if (s <= MIN_SCALE + 0.011 && med > GPU_GIVE_UP_MS) {
                  // even the smallest picture takes far too long: this is software GL, not a GPU
                  // eslint-disable-next-line no-console
                  console.warn(`GPU view too slow (${med.toFixed(0)} ms per frame at the lowest resolution), using the software renderer`);
                  gpuGaveUp = true;
                  glRef.current = null;
                  g.dispose();
                  setMode('cpu');
                  return;
                }
                next = med > 100 ? MIN_SCALE : Math.max(MIN_SCALE, s * clamp(Math.sqrt(GPU_TARGET_MS / med), 0.6, 0.95));
                if (now - lastUpAt < 8000) scaleCap = Math.min(scaleCap, lastUpFrom);   // the last step up did not hold: remember
              } else if (med < GPU_LOW_MS && s < scaleCap) {
                const s2 = Math.min(scaleCap, s * 1.15);
                if (med * (s2 / s) * (s2 / s) < GPU_HIGH_MS * 0.75) { next = s2; lastUpAt = now; lastUpFrom = s; }
              } else if (ivEma > 28 && med > 4 && s > 0.5 && now - lastAdjAt > 1000) {
                next = Math.max(0.5, s * 0.88);       // frames arrive slowly although the GPU time looks fine: trade a little sharpness
              }
              next = Math.round(next * 100) / 100;
              if (Math.abs(next - s) >= 0.01) {
                scale = next; lastAdjAt = now;
                hist = []; warm = 3; skip = 1;       // measure the new size quickly, ignoring the frame that reallocates buffers
              }
            }
          }
          win.__visorMs = gpuMs;
        }
        win.__visorSize = `${cw}x${ch}`;
        win.__visor = { mode: 'gl', gpuMs: Number(gpuMs.toFixed(2)), scale, fps: Number(fps.toFixed(1)), intervalMs: Number(ivEma.toFixed(1)), canvas: `${cw}x${ch}`, scene: `${Math.round(cw * scale)}x${Math.round(ch * scale)}` };

        const ow = Math.min(cw, OVERLAY_MAX_W);
        const tO = performance.now();
        drawOverlay(ow, Math.round((ch * ow) / cw), L.hm, v, L.route, L.target, L.tau, cam.e);
        if (win.__visor) win.__visor.overlayMs = Number((performance.now() - tO).toFixed(2));
        if (lastRenderAt && now - lastRenderAt < 70) ivEma += (now - lastRenderAt - ivEma) * 0.1;
        lastRenderAt = now;
        fpsN++; drawn++;
        if (drawn === 1) setReady(true);
        return;
      }

      // ---- software fallback: low resolution, limited frame rate, never queues work ----
      if (!cpuCanvas) return;
      const minGap = Math.max(110, cpuLastMs * 1.4);
      if (now - cpuLastEnd < minGap) return;
      const base = Math.min(1, CPU_MAX_W / box.w);
      const W = Math.max(240, Math.round((box.w * base * CPU_STEPS[cpuQ]) / 2) * 2);
      const H = Math.max(180, Math.round((box.h * base * CPU_STEPS[cpuQ]) / 2) * 2);
      const sig = [v.xM.toFixed(1), v.yM.toFixed(1), heading.toFixed(3), L.sun.elDeg.toFixed(1), L.sun.azDeg.toFixed(1), L.tau.toFixed(2), L.storm ? 1 : 0, L.procedural ? 1 : 0, W, H].join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      const ctx = cpuCanvas.getContext('2d');
      if (!ctx) return;
      if (cpuCanvas.width !== W || cpuCanvas.height !== H) { cpuCanvas.width = W; cpuCanvas.height = H; }
      if (!cpuImg.data || cpuImg.w !== W || cpuImg.h !== H) { cpuImg.data = ctx.createImageData(W, H); cpuImg.w = W; cpuImg.h = H; }
      const t0 = performance.now();
      renderVisor(L.hm, v, cpuImg.data.data, W, H);
      postProcessVisor(cpuImg.data.data, W, H, 0.55, 0.24, 1.1, 2.0);
      ctx.putImageData(cpuImg.data, 0, 0);
      const ms = performance.now() - t0;
      cpuLastMs = ms; cpuLastEnd = performance.now();
      win.__visorMs = ms;
      win.__visorSize = `${W}x${H}`;
      win.__visor = { mode: 'cpu', cpuMs: Number(ms.toFixed(1)), fps: Number(fps.toFixed(1)), canvas: `${W}x${H}` };
      if (ms > 260) { cpuSlow++; cpuFast = 0; } else if (ms < 80) { cpuFast++; cpuSlow = 0; } else { cpuSlow = 0; cpuFast = 0; }
      if (cpuSlow >= 2 && cpuQ < CPU_STEPS.length - 1) { cpuSlow = 0; cpuQ++; }
      else if (cpuFast >= 8 && cpuQ > 0) { cpuFast = 0; cpuQ--; }
      drawOverlay(W, H, L.hm, v, L.route, L.target, L.tau, cam.e);
      fpsN++; drawn++;
      if (drawn === 1) setReady(true);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const remainingMin = Math.max(0, evaLimitMin - elapsedSec / 60);
  return (
    <div ref={rootRef} className="absolute inset-0 bg-black overflow-hidden" data-testid="visor-view">
      <canvas ref={glCanvasRef} className="absolute inset-0 w-full h-full" style={{ display: mode === 'gl' ? 'block' : 'none' }} data-testid="visor-gl" />
      <canvas ref={cpuCanvasRef} className="absolute inset-0 w-full h-full" style={{ display: mode === 'cpu' ? 'block' : 'none', imageRendering: 'auto' }} data-testid="visor-cpu" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" data-testid="visor-overlay" />
      <canvas ref={dustRef} width={640} height={400} className="absolute inset-0 w-full h-full pointer-events-none" data-testid="visor-dust" />
      {/* helmet glass: dark rim, vignette, curved reflections, sun-visor tint and a faint cyan inner edge */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: '4rem',
          boxShadow: 'inset 0 0 150px 55px rgba(0,0,0,0.88), inset 0 0 0 10px rgba(10,6,4,0.96), inset 0 0 0 11px rgba(120,200,255,0.18), inset 0 0 38px 4px rgba(90,170,255,0.10)',
          background:
            'linear-gradient(180deg, rgba(40,28,12,0.28) 0%, rgba(40,28,12,0) 22%),' +
            'radial-gradient(ellipse 60% 38% at 22% 14%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 70%),' +
            'radial-gradient(ellipse 30% 22% at 82% 80%, rgba(180,220,255,0.07) 0%, rgba(180,220,255,0) 70%),' +
            'linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 28%)'
        }}
      />
      {!ready && <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm">Preparing the view…</div>}
      {simple ? (
        <>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/55 text-white font-sans text-base">
            {atEnd ? '🎉 You are at the place!' : `Still ${Math.round(readout.distanceToTargetM)} m to go. Follow the orange dots.`}
          </div>
          <button onClick={onExit} className="absolute top-4 right-5 px-4 py-2 rounded-xl bg-[#c85a32] text-white font-bold font-sans cursor-pointer" data-testid="visor-exit">
            Back to map
          </button>
        </>
      ) : (
        <VisorHud
          readout={readout}
          cumulativeDoseMicroSv={RAD_BASELINE_MICROSV_H * meanShield * (elapsedSec / 3600)}
          evaRemainingMin={remainingMin}
          evaLimitMin={evaLimitMin}
          o2Pct={astronautTelemetry?.suitO2RemainingPct}
          batteryPct={astronautTelemetry?.suitBatteryRemainingPct}
          atRouteEnd={atEnd}
          elevationSource={ELEVATION_SOURCE}
          onExit={onExit}
        />
      )}
      <div className={`absolute ${simple ? 'bottom-1' : 'bottom-[1%]'} left-1/2 -translate-x-1/2 text-[9px] text-white/60 text-center font-sans px-4 max-w-[90%]`}>
        {procedural
          ? 'ILLUSTRATIVE DETAIL ON: rocks, hills and texture are invented, NOT data. '
          : 'Real-data view: landforms from the USGS MOLA-HRSC DEM only, no invented rocks. '}
        {REAL_ALBEDO_GRID ? 'Ground brightness: real Viking mosaic, 232 m (coarse). ' : 'Ground colour is a uniform model colour. '}
        Sky colour is a model; haze uses the dust optical depth shown in the app. Glare, bloom and dust motes: cosmetic.
        {dustStormActive && ' DUST STORM: haze uses the storm optical depth; the blowing dust streaks are drawn for illustration, not measured.'}
      </div>
      {!simple && (
        <button
          onClick={() => setProcedural(v => !v)}
          data-testid="procedural-toggle"
          className="absolute top-[7%] left-[8%] px-2 py-1 text-[10px] border border-amber-300/50 rounded bg-black/40 hover:bg-amber-900/40 text-amber-200 font-mono cursor-pointer"
          title="Adds invented rocks and small hills so the ground looks less smooth. This is NOT data."
        >
          ILLUSTRATIVE DETAIL (INVENTED): {procedural ? 'ON' : 'OFF'}
        </button>
      )}
    </div>
  );
};
