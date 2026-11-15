/**
 * Sun position at a Mars site from first principles (DERIVED, not invented):
 *   declination  = asin( sin(obliquity) * sin(Ls) )          obliquity 25.19 deg (IAU)
 *   elevation    = asin( sin(lat) sin(dec) + cos(lat) cos(dec) cos(hourAngle) ),  hourAngle = 15 deg * (LTST - 12 h)
 * Uses the areocentric Ls and local TRUE solar time. Ignores the equation of time and atmospheric refraction
 * (both small), and uses geodetic latitude as is.
 */
const DEG = Math.PI / 180;
export const MARS_OBLIQUITY_DEG = 25.19;

export function marsSunDeclinationDeg(lsDeg: number): number {
  return Math.asin(Math.sin(MARS_OBLIQUITY_DEG * DEG) * Math.sin(lsDeg * DEG)) / DEG;
}

/** Elevation and compass azimuth (0 = north, 90 = east) of the sun. */
export function marsSunPosition(latDeg: number, lsDeg: number, ltstHours: number): { elDeg: number; azDeg: number; decDeg: number } {
  const dec = marsSunDeclinationDeg(lsDeg) * DEG, lat = latDeg * DEG, h = (ltstHours - 12) * 15 * DEG;
  const sinEl = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  const cosAz = (Math.sin(dec) - Math.sin(el) * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz))) / DEG;   // 0..180 from north through east
  if (h > 0) az = 360 - az;                                       // afternoon: western half
  return { elDeg: el / DEG, azDeg: az, decDeg: dec / DEG };
}
