/**
 * MARSWEAVE — Scientific Sources & Literature Citations View
 * Peer-reviewed papers, NASA reports and web pages used by the app, each with what it supports.
 */

import React from 'react';
import { Database, ExternalLink, BookOpen, FileCheck } from 'lucide-react';

export const SourcesPage: React.FC = () => {
  const citations = [
    {
      author: 'SpaceX Starship Landing Sites on Mars (LPSC 52)',
      year: '2021',
      title: 'SpaceX Starship Landing Sites on Mars',
      journal: '52nd Lunar and Planetary Science Conference, abstract 2420 (ADS 2021LPI....52.2420G)',
      doi: 'https://ui.adsabs.harvard.edu/abs/2021LPI....52.2420G/abstract',
      note: 'Seven landing sites in Phlegra Montes, Erebus Montes and Arcadia Planitia (4 prime, 3 secondary). Values below are read from a figure and table supplied by the team (not re-checked against the paper): PM-1 35.23N 163.95E -3.2 km; AP-1 39.8N 202.1E; AP-9 40.02N 203.35E; EM-16 39.89N 192.03E; AP-8 40.75N 201.3E; EM-15 39.75N 195.62E (all -3.9 km); PM-7 36.43N 162.16E -2.3 km. All of them lie outside our 16 km study window (about 188.6E, 39.3N; EM-16 is roughly 160 km away), so they are context only and are not drawn on our map.'
    },
    {
      author: 'Bramson, A. M., Byrne, S., Putzig, N. E., Sutton, S., Plaut, J. J., Brothers, T. C., & Holt, J. W.',
      year: '2015',
      title: 'Widespread excess ice in Arcadia Planitia, Mars',
      journal: 'Geophysical Research Letters, 42(16), 6566-6574',
      doi: '10.1002/2015GL064844',
      note: 'SHARAD subsurface reflectors indicate widespread excess ice in Arcadia Planitia. Basis for treating Arcadia as an ice-rich region of interest.'
    },
    {
      author: 'Morgan, G. A., Putzig, N. E., Perry, M. R., Sizemore, H. G., Bramson, A. M., Petersen, E. I., et al.',
      year: '2021',
      title: 'Availability of subsurface water-ice resources in the northern mid-latitudes of Mars',
      journal: 'Nature Astronomy, 5, 230-236',
      doi: '10.1038/s41550-020-01290-z',
      note: 'First results of the Subsurface Water Ice Mapping (SWIM) project. The SWIM2 composite used for the ice layer comes from this project (about 3 km pixels).'
    },
    {
      author: 'Ramsdale, J. D., Balme, M. R., Conway, S. J., et al.',
      year: '2019',
      title: 'Grid mapping the northern plains of Mars: geomorphological, radar, and water-equivalent hydrogen results from Arcadia Planitia',
      journal: 'Journal of Geophysical Research: Planets, 124, 504-527',
      doi: 'SWIM pilot study (cited by Morgan et al. 2021)',
      note: 'Geomorphic, radar and neutron evidence for ground ice across Arcadia Planitia.'
    },
    {
      author: 'Viola, D., McEwen, A. S., Dundas, C. M., & Byrne, S.',
      year: '2015',
      title: 'Expanded secondary craters in the Arcadia Planitia region, Mars: Evidence for tens of Myr-old shallow subsurface ice',
      journal: 'Icarus (2015)',
      doi: 'See Wikipedia, Arcadia Planitia, reference 5',
      note: 'Expanded secondary craters point to shallow, long-lived subsurface ice in Arcadia.'
    },
    {
      author: 'Stuurman, C. M., Osinski, G. R., Holt, J. W., Levy, J. S., Brothers, T. C., Kerrigan, M., & Campbell, B. A.',
      year: '2016',
      title: 'SHARAD detection and characterization of subsurface water ice deposits in Utopia Planitia, Mars',
      journal: 'Geophysical Research Letters, 43(18), 9484-9491',
      doi: '10.1002/2016GL070138',
      note: 'About 375,000 km2 of radar-reflective ice-rich deposit in western Utopia Planitia (not Arcadia). Cited as a comparable northern-plains ice setting only.'
    },
    {
      author: 'Ehlmann, B. L., & Edwards, C. S.',
      year: '2014',
      title: 'Mineralogy of the Martian Surface',
      journal: 'Annual Review of Earth and Planetary Sciences, 42, 291-315',
      doi: '10.1146/annurev-earth-060313-054614',
      note: 'Review of Martian mineralogy. Background only: no CRISM product is loaded in this build.'
    },
    {
      author: 'Hassler, D. M., Zeitlin, C., Wimmer-Schweingruber, R. F., et al.',
      year: '2014',
      title: "Mars' Surface Radiation Environment Measured with the Mars Science Laboratory's Curiosity Rover",
      journal: 'Science, 343(6169), 1244797',
      doi: '10.1126/science.1244797',
      note: '0.64 mSv/day dose equivalent (26.7 µSv/h) at Gale Crater. Used as a proxy; not measured at Arcadia.'
    },
    {
      author: 'Rodriguez-Manfredi, J. A., de la Torre Juárez, M., Alonso, A., et al.',
      year: '2021',
      title: 'The Mars Environmental Dynamics Analyzer (MEDA) Instrument Suite on the Mars 2020 Mission',
      journal: 'Space Science Reviews, 217(3), 48',
      doi: '10.1007/s11214-021-00816-9',
      note: 'Instrument description. The MEDA values shown in the app are published Jezero samples, not Arcadia data.'
    },
    {
      author: 'Smith, D. E., Zuber, M. T., Frey, H. V., et al.',
      year: '2001',
      title: 'Mars Orbiter Laser Altimeter: Experiment summary after the first year of global mapping of Mars',
      journal: 'Journal of Geophysical Research: Planets, 106(E10), 23689-23722',
      doi: '10.1029/2000JE001464',
      note: 'Reference for MOLA topography and the Mars elevation datum.'
    },
    {
      author: 'Fergason, R. L., Christensen, P. R., & Kieffer, H. H.',
      year: '2006',
      title: 'High-resolution thermal inertia derived from the Thermal Emission Imaging System (THEMIS): Thermal model and applications',
      journal: 'Journal of Geophysical Research, 111, E12004',
      doi: '10.1029/2006JE002735',
      note: 'Method behind the THEMIS thermal-inertia mosaic used for the thermal-inertia layer.'
    },
    {
      author: 'Montabone, L., Forget, F., Millour, E., et al.',
      year: '2015',
      title: 'Eight-year climatology of dust optical depth on Mars',
      journal: 'Icarus, 251, 65-95',
      doi: '10.1016/j.icarus.2014.12.034',
      note: 'Dust climatology (LMD/MCD) used for the optical-depth scenario values.'
    },
    {
      author: 'Minetti, A. E., Moia, C., Roi, G. S., Susta, D., & Ferretti, G.',
      year: '2002',
      title: 'Energy cost of walking and running at extreme uphill and downhill slopes',
      journal: 'Journal of Applied Physiology, 93(3), 1039-1046',
      doi: 'J Appl Physiol 93:1039-1046',
      note: 'Fifth-order polynomial for walking energy cost against gradient. Drives pace, power, oxygen use and the planner slope limit.'
    },
    {
      author: 'Brown, E., Russomano, T., Bueno, B., et al.',
      year: '2018',
      title: 'The metabolic cost of walking in simulated martian gravity and its implications',
      journal: 'Journal of Exercise Physiology Online, 21(1), 25-35',
      doi: 'JEPonline 21(1):25-35',
      note: 'Walking at 0.38 g on a lower-body positive-pressure treadmill: VO2 fell from 1.00 to 0.68 L/min. Supports a Mars/Earth walking-cost ratio below 1. We use the more conservative 0.87 from the underwater-treadmill study (0.060 vs 0.069 kcal/kg/min at 1.2 m/s, six subjects; NASA-funded, PDF at apu.edu/files/cris_reduced_gravities.pdf, authors not confirmed here).'
    },
    {
      author: 'NASA Mars PLSS studies (ICES 2025/2026)',
      year: '2025',
      title: 'Mars portable life support system studies',
      journal: 'NASA ntrs 20250006266, 20260005204, 20260002884, 20260005410',
      doi: 'https://ntrs.nasa.gov/citations/20250006266',
      note: 'Mars EVA metabolic rate 350 W average and 530 W peak, 8 h EVA, consumables tables; VO2max flight-rule minimum 36 ml/min/kg.'
    },
    {
      author: 'NASA',
      year: '2012',
      title: 'Metabolic equivalent of oxygen (20.9 kJ per litre)',
      journal: 'NASA ntrs 20120003917',
      doi: 'https://ntrs.nasa.gov/citations/20120003917',
      note: 'Converts metabolic power to oxygen consumption.'
    },
    {
      author: 'NASA',
      year: '2017',
      title: 'CDHCU requirements',
      journal: 'NASA ntrs 20170010189',
      doi: 'https://ntrs.nasa.gov/citations/20170010189',
      note: 'Suit pressure 29.6 kPa (4.3 psia).'
    },
    {
      author: 'NASA',
      year: '1974',
      title: 'Apollo EVA walking speeds (OSTI 7168757) and Apollo Lunar Surface Journal',
      journal: 'NASA osti 7168757',
      doi: 'https://www.osti.gov/biblio/7168757',
      note: 'Typical Apollo EVA walking pace of 1 to 2 km/h and a 2.7 km/h planning average for walkbacks.'
    },
    {
      author: 'USGS Astrogeology Science Center',
      year: '2015',
      title: 'Arcadia Planitia, Gazetteer of Planetary Nomenclature',
      journal: 'USGS Gazetteer',
      doi: 'https://planetarynames.wr.usgs.gov/Feature/348',
      note: 'Official name and centre of the feature (47.2°N, 184.3°E).'
    },
    {
      author: 'Wikipedia contributors',
      year: '2026',
      title: 'Arcadia Planitia',
      journal: 'Wikipedia, the free encyclopedia',
      doi: 'https://en.wikipedia.org/wiki/Arcadia_Planitia',
      note: 'Overview: smooth plain with Amazonian lava flows, elevation about 0 to -3 km, ground-ice indications, named by Schiaparelli in 1882. Second-hand; primary papers above. Note: our 16 km window sits lower (see the DEM range) than this regional range.'
    },
    {
      author: 'NASA Science',
      year: '2026',
      title: 'Arcadia Planitia (resource page supplied by the team)',
      journal: 'science.nasa.gov',
      doi: 'https://science.nasa.gov/resource/arcadia-planitia/',
      note: 'Listed by the team. The page could not be opened during the audit, so no claim in the app relies on it; related NASA Odyssey THEMIS images of Arcadia (PIA22789, PIA04263) were checked instead.'
    },
    {
      author: 'DLR',
      year: '2025',
      title: "Afternoon whirlwinds: the dynamic plains of Mars\\'s Arcadia Planitia",
      journal: 'dlr.de',
      doi: 'https://www.dlr.de/en/latest/news/2025/afternoon-whirlwinds-the-dynamic-plains-of-mars-s-arcadia-planitia',
      note: 'Arcadia lies north-west of Tharsis; solidified low-viscosity lava erupted about two billion years ago; large quantities of ice thought to exist underground.'
    },
    {
      author: 'University of Arizona HiRISE',
      year: '2008',
      title: 'Indications of Ground Ice in Arcadia Planitia (PSP_004097_2185)',
      journal: 'hirise.lpl.arizona.edu',
      doi: 'https://hirise.lpl.arizona.edu/PSP_004097_2185',
      note: 'Knobby surface and cracks likely related to subsurface ground ice in Arcadia.'
    },
    {
      author: 'NASA Planetary Data System',
      year: '',
      title: 'PDS Geosciences Node',
      journal: 'pds-geosciences.wustl.edu',
      doi: 'https://pds-geosciences.wustl.edu',
      note: 'Public archive for MRO, MGS, Odyssey, MSL and Mars 2020 data products. The app does not read PDS files directly except through the USGS/PSI/LMD products named above.'
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#0b0d12] text-[#d6d9e0] select-text">
      {/* Top Breadcrumb */}
      <div className="hairline-b bg-[#0e1117] px-6 py-2.5 text-xs font-mono text-[#8b95a5]">
        <span>Marsweave</span> <span className="text-gray-600">/</span> <span className="text-white">Scientific sources & citations</span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 md:py-16 space-y-10">
        {/* Title Header */}
        <div className="space-y-4 max-w-3xl">
          <div className="inline-block text-[11px] font-mono text-[#c85a32] uppercase tracking-wider">
            Scientific background
          </div>
          <h1 className="text-3xl md:text-5xl font-sans font-bold tracking-tight text-white leading-tight">
            Scientific Sources & References
          </h1>
          <p className="text-sm md:text-base text-[#9ba5b5] font-sans leading-relaxed">
            The references below inform MARSWEAVE's models and constants. They do not mean every layer is loaded from these sources: see the real / derived / modelled / simulated label on each layer.
          </p>
        </div>

        {/* Data attribution & licences */}
        <div className="bg-[#10141d] border border-[#1c2230] p-5 space-y-2 font-sans text-xs" data-testid="attribution">
          <div className="text-white font-semibold text-sm">Data attribution and licences</div>
          <p className="text-[#9ba5b5] leading-relaxed">
            Elevation (when loaded): Fergason, R. L., Hare, T. M., &amp; Laura, J. (2018). HRSC and MOLA Blended Digital Elevation Model at 200m v2.
            Astrogeology PDS Annex, U.S. Geological Survey. MOLA: NASA/GSFC (CC0). HRSC: ESA/DLR/FU Berlin (CC BY-SA 3.0 IGO). Elevation values and the
            slope computed from them are adaptations of this data and are shared under CC BY-SA 3.0 IGO.
          </p>
          <p className="text-[#9ba5b5] leading-relaxed">
            Perseverance raw images: NASA/JPL-Caltech. Radiation baseline: Hassler et al. (2014), Science 343, 1244797 (MSL RAD).
            NASA does not endorse non-US-government sources; their data-use terms apply.
          </p>
        </div>

        {/* Design reference: NASA annotated route map */}
        <div className="bg-[#10141d] border border-[#1c2230] p-5 space-y-2 font-sans text-xs" data-testid="design-reference">
          <div className="text-white font-semibold text-sm">Design reference: NASA annotated route map</div>
          <p className="text-[#9ba5b5] leading-relaxed">
            The REGIONS overlay follows the visual idea of NASA's "Curiosity's Proposed Path Up Mount Sharp"
            (science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/): coloured terrain regions, italic labels and a highlighted route.
            The NASA map is credited to MRO (HiRISE, CRISM, CTX) and Mars Express (HRSC) data, University of Arizona, Ball Aerospace, JHU/APL,
            Malin Space Science Systems and NASA/JPL-Caltech. None of those image or spectral products are used here: MARSWEAVE's regions are slope classes
            derived from the USGS elevation grid and are not geologic units.
          </p>
        </div>

        {/* Citations List */}
        <div className="space-y-4">
          {citations.map((cite, idx) => (
            <div
              key={idx}
              className="bg-[#10141d] border border-[#1c2230] p-5 space-y-2 font-sans text-xs hover:border-gray-700 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-white font-semibold text-sm leading-snug">
                  {cite.title}
                </div>
                <span className="font-mono text-xs text-[#c85a32] font-bold shrink-0">
                  {cite.year}
                </span>
              </div>

              <div className="text-[#8b95a5] text-xs font-sans">
                {cite.author}
              </div>

              <div className="text-xs text-[#3898b8] font-mono">
                {cite.journal}
              </div>

              <p className="text-[#9ba5b5] text-xs leading-relaxed pt-1.5 hairline-t">
                {cite.note}
              </p>

              <div className="text-[11px] font-mono text-[#6b7788]">
                DOI / REF: {cite.doi}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
