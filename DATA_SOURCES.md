# NASA Mission Data Sources & Provenance

## Data status

Authoritative table: `LAYER_TRUTH` in `data/arcadiaData.ts` (shown in the layer panel and the cell inspector).

| Layer | Status | Source / note |
| :--- | :--- | :--- |
| Elevation | **REAL** if `data/arcadia_dem.json` exists, else SIMULATED | USGS MOLA-HRSC blended DEM v2 (200 m/px). HRSC part CC BY-SA 3.0 IGO |
| Slope | DERIVED | Finite differences of the elevation grid |
| Basemap | DERIVED / SIMULATED | Colour ramp rendering, not CTX/Viking imagery |
| Hazard zones | DERIVED (real DEM) / SIMULATED (synthetic) | Clusters of steep and rough cells from the DEM slope grid; comms shadows from the modelled relay grid. No HiRISE boulder census |
| Radiation | MODELLED | MSL RAD rate at Gale, Hassler et al. 2014, used as a proxy |
| Dust (tau) | MODELLED | Scenario value for the what-if engine |
| Ice, minerals, thermal, comms, science targets | SIMULATED | Placeholders. No SHARAD/SWIM, CRISM, THEMIS or relay ephemerides loaded |

The instrument sections below describe the intended source products and what each would contribute; they are not a claim that those products are already ingested.

---


---

### 1. MOLA — Mars Orbiter Laser Altimeter
- **Mission:** Mars Global Surveyor (MGS)
- **Agency:** NASA / Goddard Space Flight Center
- **Measurement:** 1064 nm Nd:YAG laser altimetry
- **Spatial Resolution:** 128 pixels/degree ($\approx 463\text{ m/pixel}$ at equator)
- **Role in MARSWEAVE:** Forms the digital elevation model (DEM), hypsometric tint color map, macro-slope calculation, and hillshade azimuth rendering.
- **Scientific Caveat:** Sub-100m micro-roughness is augmented by HiRISE stereophotogrammetry.

---

### 2. HiRISE — High Resolution Imaging Science Experiment
- **Mission:** Mars Reconnaissance Orbiter (MRO)
- **Agency:** NASA / University of Arizona
- **Measurement:** High-resolution visible & NIR imaging (RED 550-850 nm, BG 400-600 nm, NIR 800-1000 nm)
- **Spatial Resolution:** $25 - 30\text{ cm per pixel}$
- **Role in MARSWEAVE:** Detects decametric boulder fields, crater rim collapse scarps, and periglacial thermal contraction crack polygon networks.
- **Scientific Caveat:** HiRISE swathes are targeted; untargeted intermediate zones utilize CTX (Context Camera, 6 m/px) context interpolation.

---

### 3. SHARAD — Shallow Subsurface Radar
- **Mission:** Mars Reconnaissance Orbiter (MRO)
- **Agency:** NASA / ASI (Italian Space Agency)
- **Measurement:** 15–25 MHz chirped synthetic aperture radar sounding
- **Spatial Resolution:** 15 m vertical in free space (higher in water-ice, $\varepsilon \approx 3.15$), 0.3–1 km along track
- **Role in MARSWEAVE:** NOT LOADED directly. SHARAD is one input to the SWIM2 ice composite that the app does use. Published SHARAD work in Arcadia (Bramson et al. 2015) reports excess ice tens of metres thick, not a 1.5 to 4.2 m layer; the app states no ice depth.
- **Scientific Caveat:** Radar reflections require clutter simulation to confirm that subsurface reflectors are not off-nadir surface topography echoes.

---

### 4. CRISM — Compact Reconnaissance Imaging Spectrometer for Mars
- **Mission:** Mars Reconnaissance Orbiter (MRO)
- **Agency:** NASA / Johns Hopkins University Applied Physics Laboratory (JHUAPL)
- **Measurement:** 544 spectral channels spanning 362 to 3920 nm
- **Spatial Resolution:** 18 to 36 m/pixel in Targeted Mode
- **Role in MARSWEAVE:** Identifies hydrated smectite clays, hydrated silica, and phyllosilicates through the diagnostic $1.41\text{ }\mu\text{m}$ (O-H stretch) and $1.92\text{ }\mu\text{m}$ ($\text{H}_2\text{O}$ vibrational bend) absorption doublets.
- **Scientific Caveat:** Volcano-scan atmospheric correction is applied to eliminate atmospheric $\text{CO}_2$ interference bands.

---

### 5. THEMIS — Thermal Emission Imaging System
- **Mission:** 2001 Mars Odyssey
- **Agency:** NASA / Arizona State University
- **Measurement:** 9 infrared bands (6.8 to 14.9 µm)
- **Spatial Resolution:** 100 m/pixel (Infrared)
- **Role in MARSWEAVE:** Computes nighttime thermal inertia to distinguish coherent rock outcrops from loose, insulating fine dust mantles.

---

### 6. MEDA — Mars Environmental Dynamics Analyzer
- **Mission:** Mars 2020 (Perseverance Rover)
- **Agency:** NASA / INTA-CSIC
- **Measurement:** Surface pressure, ground/air temperature, 3D wind velocity, relative humidity, and dust optical depth (RDS).
- **Role in MARSWEAVE:** Provides calibrated in-situ baseline measurements scaled to Arcadia Planitia's latitude ($39^\circ\text{N}$) and pressure (~680 Pa).

---

### 7. RAD — Radiation Assessment Detector
- **Mission:** Mars Science Laboratory (Curiosity Rover)
- **Agency:** NASA / Southwest Research Institute (SwRI)
- **Measurement:** Surface energetic charged particles (protons to iron nuclei) and neutral neutrons/gamma rays.
- **Role in MARSWEAVE:** Calibrates nominal surface astronaut dose rates ($\sim 24 - 32\text{ }\mu\text{Sv/h}$).

---

### 8. Mars Relay Network
- **Mission:** MRO, 2001 Mars Odyssey, Trace Gas Orbiter (TGO), MAVEN
- **Agency:** NASA / ESA
- **Role in MARSWEAVE:** Calculates line-of-sight elevation angles and terrain shadow masks for the UHF Proximity-1 communications link between the EVA crew and orbiting relay spacecraft.

---

**Note on dataset IDs.** The PDS dataset IDs in the registry were written from memory and have not all been verified against the PDS archive. Check each against https://pds.nasa.gov before submission, or remove it.

## USGS catalogue package (reference only, no data inside)
`docs/usgs_package/` holds the link catalogue provided with the challenge resources (USGS Explore Data hub, Interactive Maps: Mars, SIM 3292 global geologic map 1:20M, Gazetteer of Planetary Nomenclature, THEMIS thermal-inertia mosaics, Mars ODE). The package contains URLs and a downloader for PDFs/pages, not raster or vector data, so **none of it is used as data in the app**. The only real dataset used is the MOLA-HRSC blended DEM, fetched with `scripts/fetch_arcadia_dem.py`. Any layer taken from these sources later must keep its own licence and credit in REFERENCES.md.
