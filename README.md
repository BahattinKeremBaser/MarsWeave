# MARSWEAVE
### *Intelligent EVA Planning & Dual-Mode 2D/3D Geospatial Simulation for the Red Planet*

> **"A future astronaut does not need another static Mars map. They need to know where to walk, when to walk, what to avoid, where to stop, what to investigate, and why."**

[![NASA Space Apps Challenge 2026](https://img.shields.io/badge/NASA%20Space%20Apps-2026%20Challenge-orange.svg)](https://www.spaceappschallenge.org/)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Status: Hackathon Prototype](https://img.shields.io/badge/Status-Hackathon%20Prototype-orange.svg)]()
[![Three.js: WebGL 3D DEM](https://img.shields.io/badge/Three.js-3D%20DEM%20Engine-black.svg)]()

---

> **Data status (read first).** Every layer in the app carries a REAL / DERIVED / MODELLED / SIMULATED label (single source: `LAYER_TRUTH` in `data/arcadiaData.ts`), and the Surface Inspector shows the source and resolution of each value you click.
>
> | Layer | Status in this build |
> | :--- | :--- |
> | Elevation | **REAL** when `data/arcadia_dem.json` exists (USGS MOLA-HRSC blend, 200 m/px, via `scripts/fetch_arcadia_dem.py`); otherwise SIMULATED |
> | Slope | DERIVED from elevation |
> | Radiation dose | MODELLED: published MSL RAD rate (26.7 µSv/h, Gale) used as a proxy x EVA time |
> | Ice (SWIM2), thermal (THEMIS), brightness (Viking), dust (LMD MY34), relay passes (NAIF) are real products at coarse resolution; hazard map is slope-based; science sites are rule-based candidates. See section 6 for each status |
> | Arrival view | REAL Perseverance image (Jezero, an analog, not this site), fetched live if the NASA feed is reachable |
>
> **Scale.** The global 200 m DEM is regional. For a genuinely hyper-local EVA, load a HiRISE (about 1 m/px) or CTX (about 20 m/px) DEM with the script's `--dtm` mode.
> **Mobility.** Walking cost follows Minetti et al. (2002) scaled by the Mars/Earth cost ratio 0.87; pace, slope limit and consumables follow NASA Mars PLSS design values (350 W average, 530 W peak, 8 h). Suit mass, stop time and heart-rate limits are flagged ASSUMPTIONS. MODELLED, not validated against suited-EVA data. The route planner flags routes that exceed the EVA time limit.
> See `DATA_SOURCES.md` and `REFERENCES.md`.

## 1. What is MARSWEAVE?
**MARSWEAVE** is an interactive surface mission-planning and scientific exploration platform engineered for future human extravehicular activity (EVA) on the Martian surface (Arcadia Planitia: $39.3^\circ\text{N}, 171.4^\circ\text{W}$).

Rather than functioning as a passive GIS viewer with disconnected layer checkboxes, MARSWEAVE converts heterogeneous NASA orbital and in-situ datasets into an **explainable, multi-objective traversal plan**. When an astronaut or mission controller defines a starting habitat and science targets, the system simultaneously evaluates terrain elevation slopes, boulder scree, subsurface water ice deposits, mineralogical spectra, orbital relay communications, atmospheric dust opacity, and life-support constraints.

The platform provides a **dual-mode visualization engine**:
1. **2D Topographical Cartography:** High-precision canvas renderer with MOLA elevation hillshading, 25-meter contour intervals, aerocentric grid, and multi-spectral layer blending.
2. **Interactive 3D WebGL Surface & Orbital DEM:** Full Three.js digital elevation model with realistic PBR Martian regolith shading, glowing 3D spline routes with animated photon pulses, 3D Habitat Alpha base station, animated astronaut exploration rover, 3D holographic science beacons, and dynamic camera choreography.

---

## 2. NASA Challenge Addressed
* **Challenge:** Interplanetary Survival Guide: Martian Map (NASA Space Apps Challenge 2026)
* **Core Philosophy:** Transform multi-mission NASA datasets into an active decision-support and exploration system that enables human explorers to work safely, efficiently, and discover more on Mars.

---

## 3. The Problem
Current planetary mapping tools display layers in isolation:
* An astronaut or planner sees MOLA elevation on one map, CRISM spectral signatures on another, and SHARAD radar echograms in a scientific paper.
* Standard routing engines (such as Dijkstra or road navigation) simply minimize geometric distance ($A \rightarrow B$). On Mars, the shortest route can be fatal: traversing a 34° loose scree crater rim, descending into a communication shadow zone, or bypassing high-value astrobiological discoveries by just 150 meters.

---

## 4. The Solution: Multi-Objective EVA Optimization
MARSWEAVE solves this through a multi-objective cost optimization:

$$\text{Route Cost} = \alpha \cdot d + \beta \cdot \text{SlopePenalty} + \gamma \cdot \text{BoulderHazard} + \delta \cdot \text{CommsLoss} + \epsilon \cdot \text{DustFriction} - \omega \cdot \text{ScienceYield} - \zeta \cdot \text{IceProximity}$$

Where weights $(\alpha, \beta, \gamma, \delta, \epsilon, \omega, \zeta)$ are dynamically governed by the **Mission Objective** (`WATER`, `MINERALOGY`, `GEOLOGY`, `TERRAIN_SURVEY`, `MULTI_SCIENCE`) and **Risk Tolerance** (`LOW`, `MEDIUM`, `HIGH`).

---

## 5. Dual-Mode Visualization Engine (2D & 3D)

MARSWEAVE features seamless switching between **2D Topographical Cartography** and **3D WebGL Orbital Simulation** via a one-click toggle (`2D TOPO` / `3D SURF`):

### A. 3D WebGL Surface & Orbital DEM (Three.js)
* **3D Digital Elevation Model (DEM):** Elevation mesh built from the USGS MOLA-HRSC blended DEM when `data/arcadia_dem.json` is present (run `python scripts/fetch_arcadia_dem.py`); otherwise a clearly-labelled synthetic terrain. Includes a real-time **Vertical Exaggeration slider (1.0x to 3.5x)** to highlight subtle periglacial hummocks or dramatize escarpment relief.
* **Martian PBR Texturing & Dynamic NASA Overlays:** Physically-based regolith shading dynamically blended in real time with active NASA spectral layers (MOLA hypsometry, slope risk, SHARAD subsurface ice, HiRISE boulder hazards, and UHF comms shadows).
* **Guaranteed Terrain Clearance for 3D Routes:** Evaluated spline routes maintain safe elevated clearance (1.15 to 1.55+ units) above Martian terrain contours. High-density adaptive segment subdivision combined with per-point ground clearance clamping ensures no route ever dips into or penetrates crater lips, hills, or ridges. Material includes GPU polygon offset to prevent z-fighting.
* **Smart Heading & Anti-Tilt Rover Navigation:** Detailed 6-wheel articulated exploration rover with dual illuminated LED headlights, aerodynamic gold crew visor, rear UHF comms mast, and dual rear status tail-lights. The vehicle's front always rotates and points smoothly in the exact direction of travel (`yaw = atan2(dirWorldX, dirWorldZ)`), sitting level and upright on the surface without unnatural tilt or roll.
* **Universal 3D & 2D Location Names & Landmark Tags:** Every candidate site (`SCI-04`, `SCI-02`, `SCI-11`), the Habitat Alpha base station and each hazard zone is labelled with its title and type. Features dual-mode rendering: crisp 512x140 3D billboard sprites in WebGL space and interactive screen-space floating HUD tags that can be clicked to select destinations. Includes a `[TAGS: ON/OFF]` toolbar toggle.
* **3D Habitat Alpha Base Station:** Geodesic pressurized crew dome, interconnected airlock modules, rotating high-gain parabolic comms antenna, solar array banks, and pulsing landing perimeter beacon.
* **3D Holographic Science Beacons:** Vertical laser beams extending into the Martian sky with rotating diamond status indicators (colour-coded by candidate rule: ice-index, steep-slope, depression).
* **3D Volumetric Hazard Zones:** Transparent cylindrical warning volumes, pulsing boundary rings, and 3D hazard warning badges marking dangerous crater rims, boulder fields, and comms shadows.
* **Camera Choreography Presets:**
  * `ORBIT`: 45° overhead isometric orbital survey (`Key 1` or `R`).
  * `HORIZON`: Low-angle surface perspective from astronaut eye level looking toward crater ridges (`Key 2`).
  * `FOLLOW`: Dynamic third-person chase camera locking onto the moving rover during simulation (`Key 3`).
  * `NADIR`: 90° top-down nadir overview for tactical navigation (`Key 4`).
* **3D Navigation Shortcuts & Virtual Controls Hub:**
  * **Keyboard Shortcuts:** `W / A / S / D` or `Arrow Keys` (Pan surface), `Q / E` (Orbit/Yaw angle), `+ / -` or `[ / ]` (Smooth Zoom), `R` (Reset view), `1-4` (Camera presets), `T / L` (Toggle 3D name badges), `G` (Toggle coordinate grid), `? / H` (Shortcuts help dialog).
  * **On-Screen Touch D-Pad:** Virtual floating aerospace navigation pad (`[3D NAV]`) with 4-way pan buttons, orbit controls, zoom steppers, and rover follow trigger—engineered for single-handed mobile navigation without a keyboard.
  * **Touch Gestures:** Native 1-finger drag orbit, 2-finger pinch zoom, 2-finger pan translation, and 1-finger surface elevation inspection.
* **Mobile & Tablet Full Compatibility:**
  * Responsive navigation header with collapsible slide-down drawer for all scientific pages and telemetry.
  * Mobile tab switcher (`[MAP]`, `[SETUP]`, `[ROUTES]`, `[LAYERS]`) giving 100% full-screen map real-estate on mobile phones.
  * Slide-in mobile overlay drawers for mission profile adjustments and route candidate comparisons.
  * Collapsible mobile EVA vitals telemetry HUD with one-tap toggle (`[VITALS]`).
* **3D Raycaster & Terrain Inspector:** Click or hover anywhere on the 3D surface to cast a targeting reticle, inspect coordinates, elevation, slope, and set as destination or start point.

### B. 2D Topographical Cartography (Canvas2D)
* **Resolution & Viewport Integrity:** Fully managed via `ResizeObserver` for razor-sharp rendering on all screen sizes and DPI scales without pixelation.
* **Location Names Display:** Full landmark titles (`SCI-04: Candidate A…`, `HABITAT ALPHA (BASE)`, `★ DESTINATION: …`, and hazard-zone names) rendered with clean typographic hierarchy.
* **Hillshading & contours:** MOLA-HRSC elevation hypsometric color ramp with dynamic hillshading and topographic contour lines.
* **Aerocentric Geographic Grid:** Live latitude/longitude coordinate ticks ($39.12^\circ\text{N} - 39.48^\circ\text{N}$, $171.22^\circ\text{W} - 171.58^\circ\text{W}$) with True Martian North compass.
* **Pan & Zoom with Click Separation:** Smooth dragging to pan, mouse-wheel to zoom, and intelligent drag-vs-click separation to prevent accidental dialog triggers.
* **Surface Inspector HUD:** Interactive inspection popover displaying exact latitude, longitude, elevation (meters), slope angle (degrees), subsurface ice confidence, comms coverage, and nearby hazards.

---

## 6. NASA Datasets & Mission Provenance
Every layer carries an honest status. Layers that are not loaded are listed as such:

| Product / instrument | Mission | Status in this build | Role in MARSWEAVE |
| :--- | :--- | :--- | :--- |
| **MOLA + HRSC blended DEM (USGS, 200 m)** | Mars Global Surveyor + Mars Express | REAL (loaded) | Elevation, slope, hazard cells, route planning |
| **SWIM2 ice-consistency composite** | MRO SHARAD and other data (NASA/PSI) | REAL (loaded, ~3 km pixels) | Ice layer and the ice candidate site; an index, not a depth or probability |
| **THEMIS thermal-inertia mosaic** | 2001 Mars Odyssey | REAL (loaded, shown only; possible mosaic seam) | Display layer; not used for routing |
| **Viking MDIM 2.1 mosaic** | Viking | REAL (loaded) | Image brightness for the basemap (not calibrated albedo) |
| **LMD/MCD dust climatology** | MRO MCS and other retrievals | REAL (loaded) | Dust optical depth scenario values |
| **MRO ephemeris (NAIF SPICE)** | MRO | DERIVED | Geometric MRO visibility; no link budget |
| **MSL RAD** | Curiosity (Gale) | Published value (proxy) | 0.64 mSv/day = 26.7 µSv/h radiation proxy |
| **Mars 2020 MEDA** | Perseverance (Jezero) | Published samples (reference) | Reference air temperature and wind |
| **HiRISE, SHARAD radargrams, CRISM cubes** | MRO | NOT LOADED | Named as future layers only; no claim relies on them |

---

## 7. System Architecture
```
                                 NASA PDS ARCHIVE
         [MOLA] [HiRISE] [SHARAD] [CRISM] [THEMIS] [MEDA] [RAD] [MARCI]
                                         │
                                         ▼
                     GEOSPATIAL & HAZARD NORMALIZATION ENGINE
             (Arcadia Planitia 50x50 Aerocentric Surface Grid Matrix)
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
         MULTI-OBJECTIVE A*                          REAL-TIME TELEMETRY
         ROUTE OPTIMIZER                             & CONTINGENCY SIMULATOR
  (Slope, Comms, Boulders, Science)             (Dust Front, Battery, O2, Rad)
                   │                                           │
                   └─────────────────────┬─────────────────────┘
                                         ▼
                         MARSWEAVE SCIENTIFIC MISSION HUD
             ┌───────────────────────────┴───────────────────────────┐
             ▼                                                       ▼
    [2D TOPOGRAPHICAL CANVAS]                               [3D WEBGL DEM VIEWPORT]
 (Hillshade, Contours, Inspector)                     (Three.js, PBR Terrain, Beacons)
             │                                                       │
             └───────────────────────────┬───────────────────────────┘
                                         ▼
                      [Explainable AI: "Why This Route?"]
                      [Verifiable Science Evidence Chains]
                      [What-If Simulation Sandbox]
                      [Gemini-Powered Mission Copilot]
                      [Post-EVA Mission Report]
```

---

## 8. Key Features
1. **Dual-Mode 2D/3D Geospatial Engine:** Seamless 1-click toggle between crisp 2D cartography and fully interactive 3D WebGL planetary simulation.
2. **"WHY THIS ROUTE?" Explainable AI:** Detailed metric comparison explaining why Route Alpha was selected over Route Beta and Route Gamma.
3. **Multi-Tier Evidence Chain:** Click any science target to inspect the verifiable sequence of NASA observations behind the classification.
4. **Interactive Mission Simulator:** Scrub timeline from $00:00$ to $120:00$, monitoring battery, suit $\text{O}_2$, heart rate, and environmental conditions.
5. **Dynamic Replanning:** When a regional dust storm surge is detected, the system immediately calculates an alternate route with exact quantitative deltas ($\Delta\text{Time}$, $\Delta\text{Risk}$, $\Delta\text{Science}$, $\Delta\text{Comms}$).
6. **"WHAT IF?" Contingency Engine:** Test hypothetical scenarios (e.g., dust optical depth at the MY34 peak, early satellite loss-of-signal, or impaired astronaut climbing mobility).
7. **MARSWEAVE COPILOT:** Optional Gemini-powered copilot (server-side, model set by `GEMINI_MODEL`) plus a built-in offline rule engine; both answer from the simulated mission state, and the offline engine says so.
8. **Final EVA Mission Report:** Debrief of distance, time, dose and targets for the planned EVA.

---

## 9. Technology Stack

* **Frontend Framework:** React 19, TypeScript
* **3D Graphics & Spatial Engine:** Three.js, WebGL, OrbitControls
* **Styling & HUD Design:** Tailwind CSS
* **Build System:** Vite
* **AI Model:** Google Gemini via `@google/genai` (optional; configure `GEMINI_MODEL`)
* **Icons:** Lucide React

---

## 10. Installation & Running Locally

```bash
# Clone the repository
git clone https://github.com/BahattinKeremBaser/MarsWeave
cd MarsWeave

# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 11. Space Apps Challenge Presentation Statement
* **Central Statement:** *"The best route is mission-dependent."*
* **Mission Loop:** `OBSERVE → UNDERSTAND → PLAN → WALK → DISCOVER → ADAPT`
