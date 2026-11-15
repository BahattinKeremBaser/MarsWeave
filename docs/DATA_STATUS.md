# MARSWEAVE data status (build v23)

| Data | Status | Source |
|---|---|---|
| Terrain height | REAL | USGS MOLA-HRSC blended DEM, 200 m |
| Thermal inertia | REAL | USGS THEMIS quantitative mosaic, 100 m |
| Subsurface ice index | REAL (coarse, ~3 km) | SWIM2 composite |
| Ground brightness | REAL (not HiRISE, not calibrated albedo) | USGS Viking MDIM 2.1, 232 m |
| Dust optical depth | REAL series, converted with stated assumptions | LMD MY34 climatology |
| Orbiter passes | DERIVED (MRO only, geometric) | NAIF SPICE, mro_psp47.bsp |
| Sun position | DERIVED | latitude, Ls from LMD file, axial tilt |
| Radiation, weather | PUBLISHED reference values | MSL RAD (Gale), Mars 2020 MEDA (Jezero) |
| Boulder/hazard map | SIMULATED | rule-based from slope |
| CRISM minerals | SIMULATED | only CRISM image over the site (FRT0000981F) covers ~16 % of the window |
| Relay shadow map, storm timing, suit telemetry | SIMULATED | scenario |

## v33: EVA physiology (MODELLED)
Walking power, pace, slope limit, oxygen, battery and heart rate follow published equations and NASA design values (see METHODOLOGY.md). Crew/suit mass and heart-rate limits are ASSUMPTIONS and labelled so in the app.

## v34 audit changes
- Science sites are CANDIDATES picked by fixed rules from the real DEM and SWIM2 ice index (SCI-04 flat + highest ice index, SCI-02 steepest reachable slope, SCI-11 deepest depression). They are not detections; no instrument evidence, confidence or rank is claimed.
- Dropped: earlier hand-placed targets with invented evidence text (SCI-07, SCI-09 and others), and every THEMIS-based rule (the THEMIS tile has a ~110 to ~900 tiu seam, display only).
- Stuurman et al. 2016 is about Utopia Planitia, not Arcadia; the citation was corrected.
- "PDS Release 78" removed. Verified PDS IDs: MRO-M-SHARAD-5-RADARGRAM-V1.0 and MSL-M-RAD-3-RDR-V1.0; THEMIS, MEDA and MCS/MARCI IDs are UNVERIFIED and not quoted as facts.
- Dust alert: SIMULATED scenario, no "detection" wording, no invented wind speed or ETA/risk deltas.
- Route and score text: no invented "points"; candidate sites are counted, not scored.
- Source pages for Arcadia Planitia: Wikipedia (regional elevation 0 to -3 km) and science.nasa.gov (could not be opened from the build sandbox, listed but not relied on). Our window's real DEM range is -4.0 to -3.4 km.

## v35
- Mission report now has "Hazard zones crossed": every mapped zone the walked route runs through, with entry/exit km, steepest slope inside, entry coordinates and the zone's description. Computed from the route and the DERIVED zones (sampled along each leg).
- Mission objective cards and report credits no longer name data that is not loaded (SHARAD, CRISM, HiRISE).

## v36 (UI calm pass)
- One sans typeface, sentence-case labels, larger small text, neutral toggle colours; header badges and duplicate Simulator button removed.
- Plainer wording on Home, Problem, Jury tour, setup panel and route panel.
- Layer metadata corrected: the ice layer is the SWIM2 index (~3 km), the CRISM layer is marked not loaded and hidden by default.

## v37
- Candidate sites: 5 (SCI-04 ice index, SCI-02 steepest slope, SCI-11 depression, SCI-05 lowest flat ground, SCI-06 smoothest ground), all rule-picked from the real DEM and SWIM2. Small markers on the map, name on hover.
- Starship landing-site study (LPSC 2021, 7 sites) added as context in Sources. Its sites are outside our window and are not mapped.

## v40
- Candidate sites and hazard zones are colour-coded by type in 2D and 3D (colours are only a display aid, not data).
- 3D terrain now has side walls and a base so it looks solid from behind and the sides (display only).

## v41
- Route Beta now really stops at a candidate site (the one adding the least detour). Before, it only leaned towards one and often matched Alpha.
- When two routes follow exactly the same grid cells, the route card says "Same path as ...". Routes with equal length but different cells are not labelled.

## v42
- 2D base map is drawn at 1 pixel per DEM cell and scaled with smoothing. This is display interpolation only (no new data); the real resolution is still ~322 m per cell.

## v43
- Added a map legend to the 2D and 3D views: elevation ramp with the real DEM range, candidate site colours, hazard colours. The ramp shows the base shading colours only; shaded relief is added on top.

## v44
- The clicked-cell marker in 2D is now a point at the exact click position instead of a dashed square. The values shown are still those of the DEM cell underneath. The SWIM ice index is rounded to 1 decimal.

## v45
- The map legend can be dragged around the map (it stays inside the map area); a click folds it.

## v46
- Easy mode: the surface inspector no longer shows "Set as target / Set as start" (they did nothing there). Easy mode walks to the candidate sites only; any point can be picked in Advanced.

## v47
- The "see the walk through the astronaut's eyes" prompt now appears about 4.5 s after the walk starts (it used to show at once), in 2D and 3D.
- Easy mode: the "Looking for more? / Switch to Advanced" card is pinned to the bottom of the side panel once a walk has started.

## v48 (route planner fix)
- Bug: when the destination cell was steeper than the walkable slope limit, the Alpha search could never enter it and fell back to a straight line that ignored the terrain (so Alpha could look shorter than Gamma). The destination cell is now always enterable; the steepest slope on the route is still reported.
- The search step cap was raised (3,500 to 60,000). Long routes had been cut off before reaching the goal.

## v49 (route planner audit)
Found while checking why Gamma could be longer than Alpha. All three routes now use the same search and the same measurement.
- Measurement: routes were reduced to about 10 waypoints and distance, time, slope and hazard were measured on the straight lines between them. Every grid cell on the path is now a waypoint, so the numbers are measured on the cells actually crossed.
- Gamma (direct) now weights distance only (before it still carried slope, hazard and comms terms). Gamma is therefore the shortest path on the grid by construction. Alpha balances several terms, Beta detours through a candidate site.
- If a goal cannot be reached under the profile's slope limit, the limit is relaxed step by step and the route reports its real steepest slope ("above the N degree walking limit"). No more silent straight-line fallback.
- Step lengths use true cell sizes in metres.
- Route reasons are computed from the route's own numbers; the old fixed claims ("shortest", "fastest", "direct retreat path") are gone. Beta/Gamma get a line comparing them with Alpha.
- The astronaut position follows elapsed time along the legs (it used to follow waypoint index).
- Checked over 270 start/goal/risk/objective combinations: no straight-line fallbacks, every route ends at its goal, Gamma is never longer than Alpha or Beta.
- Default trip (Habitat Alpha to SCI-04): Alpha 3.51 km / 87.9 min, Beta 8.18 km / 242.3 min, Gamma 3.51 km / 87.9 min.
