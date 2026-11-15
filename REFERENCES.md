# References (Space Apps rule: list ALL external resources, including open-source and freely available ones)

## Data
- Fergason, R. L., Hare, T. M., & Laura, J. (2018). HRSC and MOLA Blended Digital Elevation Model at 200m v2. Astrogeology PDS Annex, U.S. Geological Survey. https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m
  MOLA: NASA/GSFC, CC0. HRSC: ESA/DLR/FU Berlin, **CC BY-SA 3.0 IGO** (attribution required; adaptations must be shared under the same licence). `data/arcadia_dem.json` and the slope derived from it are such adaptations: keep the attribution and licence with them.
- Hassler, D. M., et al. (2014). Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover. Science 343, 1244797. (surface dose rate used as a proxy)
- NASA/JPL-Caltech. Mars 2020 Perseverance raw images. https://mars.nasa.gov/mars2020/multimedia/raw-images/ (arrival view card; undocumented JSON feed, may change)
- NASA JPL Mars Trek: https://trek.nasa.gov/mars/ (reference only; no tiles are bundled)
- USGS-NASA Planetary Geologic Mapping Program (reference only)

## Software and services (non-US-government: their own terms apply)
- React, React DOM (MIT); Three.js (MIT); Vite (MIT); Tailwind CSS (MIT); lucide-react (ISC); @google/genai (Apache-2.0).
- Google Gemini API (optional copilot; Google API terms) and Google Fonts (Inter, IBM Plex: SIL OFL) loaded from fonts.googleapis.com.

## AI assistance and pre-existing work (fill in before submitting)
- AI assistance: Claude (Anthropic) assisted with code and documentation; Gemini powers the optional in-app copilot.
- Work that existed before the hackathon start on 2026-11-14: ______ (first commit date: ______). Confirm with your Local Lead that this is acceptable.

## Not NASA data in this build
Hazard, ice, mineral, thermal, comms layers and science targets are modelled or simulated placeholders (see DATA_SOURCES.md).

## Payload / suit mobility model
- (Removed in v34: Pandolf et al. 1977 load-carriage equation is no longer used; walking cost now follows Minetti et al. 2002, see v33 additions below.)
- Myles WS, Saunders PL (1979) The physiological cost of carrying light and heavy loads. Eur J Appl Physiol 42:125-131.
- Norcross JR et al. (2009) EVA Walkback Test final report. NASA/TP-2009-214796 (context only).
- Gernhardt ML, Norcross J, Vos J (2008) Integrated Suit Test 1. SAE 2008-01-1951 (context only).
- Norcross JR, Gernhardt ML (2011) NASA NTRS 20110008554 (context only).

## USGS reference catalogue
- Tanaka KL et al. (2014) Geologic map of Mars. USGS Scientific Investigations Map 3292, doi:10.3133/sim3292 (listed in docs/usgs_package; not used as data yet).
- USGS Astrogeology Science Center, Astropedia and Gazetteer of Planetary Nomenclature (links only).

## Design reference (not a data source)
- NASA, "Curiosity's Proposed Path Up Mount Sharp", https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/ — inspiration for the annotated REGIONS overlay (coloured regions, labels, route line). The map credits MRO HiRISE/CRISM/CTX, Mars Express HRSC, Univ. of Arizona, Ball Aerospace, JHU APL, Malin Space Science Systems, NASA/JPL-Caltech. None of these products are used; MARSWEAVE regions are DERIVED slope classes from the USGS DEM, not geologic units.

## v33 additions (EVA physiology)
- Minetti AE, Moia C, Roi GS, Susta D, Ferretti G (2002) Energy cost of walking and running at extreme uphill and downhill slopes. J Appl Physiol 93:1039-1046.
- Brown E, Russomano T, Bueno B, et al. (2018) The metabolic cost of walking in simulated martian gravity and its implications. JEPonline 21(1):25-35.
- Underwater-treadmill reduced-gravity locomotion study (0.060 / 0.069 kcal/kg/min at 1.2 m/s, Mars/Earth), https://apu.edu/files/cris_reduced_gravities.pdf (authors not confirmed).
- (Pavei & Minetti 2016 removed: it studies hopping, not walking.)
- NASA Mars PLSS / EMU studies, ICES 2025-2026: NTRS 20250006266, 20260005204, 20260002884, 20260005410.
- NASA metabolic equivalent of oxygen, NTRS 20120003917. CDHCU requirements, NTRS 20170010189.
- Apollo EVA walking speeds, NASA OSTI 7168757; Apollo Lunar Surface Journal.
