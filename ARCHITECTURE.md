# MARSWEAVE Architectural Specification

## 1. System Overview
MARSWEAVE is built as a modular aerospace mission control application for planetary surface exploration. Its architecture separates the planetary data layer, spatial risk modeling, route optimization engine, and interactive visualization layer.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MARSWEAVE WEB APPLICATION                       │
├────────────────────────────────────────────────────────────────────────┤
│  UI / HUD Components                                                   │
│  ├── HeaderBar: Telemetry ribbon, Sol clock, scenario triggers         │
│  ├── MarsMapCanvas: 60fps GPU-accelerated raster & vector GIS viewport │
│  ├── MissionSetupPanel: Objective & constraint formulation             │
│  ├── RoutePanel: Candidate comparison & "Why this route?" AI breakdown │
│  ├── LayerManagerPanel: Opacity & visibility controls for NASA sensors │
│  ├── SimulatorControls: Scrubbable timeline, vitals, replanning banner │
│  └── Modals: ScienceTargetModal, WhatIfModal, MissionReportModal       │
├────────────────────────────────────────────────────────────────────────┤
│  Core Calculation Engines (engine/)                                │
│  ├── routeOptimizer.ts: Multi-objective A* grid pathfinding            │
├────────────────────────────────────────────────────────────────────────┤
│  Data Layer & Provenance (data/)                                   │
│  ├── arcadiaData.ts: real DEM + real-product loaders, derived hazards │
│  (LAYER_TRUTH in arcadiaData.ts: real/derived/modelled/simulated)       │
├────────────────────────────────────────────────────────────────────────┤
│  Backend / API Layer (Vite dev middleware only)                     │
│  └── /api/copilot: Grounded AI query engine using @google/genai        │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Geospatial Grid Model
The primary demonstration area is centered on **Arcadia Planitia** ($39.12^\circ\text{N} - 39.48^\circ\text{N}$, $171.22^\circ\text{W} - 171.58^\circ\text{W}$).
- **Grid Resolution:** $50 \times 50$ cells
- **Cell Size:** $\approx 136$ meters per cell edge ($6.8 \times 6.8\text{ km}$ total mission bounding box)
- **Topographic Datum:** Elevations referenced to the Mars MOLA 0-datum geoid (ranging from $-4,120\text{ m}$ to $-3,790\text{ m}$).

## 3. Multi-Objective Cost Function
The graph search algorithm evaluates each transition $(u \to v)$ using an eight-parameter weight vector:
$$C(u, v) = w_{\text{dist}} \cdot d(u,v) + w_{\text{slope}} \cdot S(v) + w_{\text{haz}} \cdot H(v) + w_{\text{comms}} \cdot (100 - C_{\text{los}}(v)) - w_{\text{sci}} \cdot V_{\text{sci}}(v) - w_{\text{ice}} \cdot P_{\text{ice}}(v)$$

- When an astronaut locomotion constraint is violated (e.g. slope $> 25^\circ$), the transition cost becomes infinite (hard edge pruning).
- Walking speed uses a simple linear slope derate (Tobler-inspired but not Tobler's formula, not validated for suited EVA):
$$v_{\text{walk}} = v_{\text{nominal}} \cdot \max\left(0.4, 1 - \frac{\text{slope}^\circ}{35}\right)$$

## 4. Operational Simulation Engine
The mission simulation runs on a discretized timeline with variable playback rates ($1\times, 2\times, 5\times, 10\times$):
- **Astronaut State:** Linearly interpolated between path nodes with continuous distance, suit battery, and oxygen decrementing.
- **Proximity Event System:** Employs radial bounding box checks to detect when the explorer enters the $200\text{ m}$ science observation envelope of a candidate science site.
- **Dynamic Weather Injection:** Simulates regional dust front advances that trigger automated replanning prompts with differential metric logs.

## 5. Security & API Isolation
- Gemini model invocation (model id from `GEMINI_MODEL`) via `@google/genai` is handled exclusively through server-side middleware (`POST /api/copilot`).
- Client code never receives the `GEMINI_API_KEY`.
- If no API key is provided, `/api/copilot` returns 503 and the client uses its embedded rule engine, which answers from the simulated mission state and labels itself offline.
