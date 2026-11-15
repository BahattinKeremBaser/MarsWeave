/**
 * MARSWEAVE — EVA physiology and suit consumables, built from published numbers.
 *
 * Nothing here is tuned by the team. Every constant carries its source. Where no published value exists the
 * constant is marked ASSUMPTION and shown that way in the app. Status of the whole module: MODELLED (published
 * equations and NASA design values, applied to our terrain). It is not a measurement and not a flight life-support model.
 *
 * 1. Walking cost vs. gradient  : Minetti et al. (2002) polynomial, J per kg per m (valid for gradients -0.45..+0.45).
 * 2. Mars gravity               : cost per kg-min at the same speed is 0.060 (Mars) vs 0.069 (Earth) kcal/kg/min at 1.2 m/s
 *                                 in an underwater-treadmill reduced-gravity study (6 subjects, NASA-funded); ratio 0.87.
 *                                 Brown et al. (2018, JEPonline 21:25-35, LBPP treadmill at 0.38 g) measured a larger drop in
 *                                 VO2 (1.00 to 0.68 L/min, about 32 % lower), so 0.87 is on the conservative (high-cost) side.
 *                                 Pavei & Minetti (2016) concerns hopping, not walking, and is NOT used for this ratio.
 * 3. Sustainable metabolic rate : NASA Mars PLSS studies (ICES 2025/26): 350 W average and 530 W maximum for a Mars EVA.
 *                                 Cross-check: 35 % of the 36 ml/min/kg flight-rule minimum VO2max for an 80 kg crewmember
 *                                 = 1.0 L/min O2 = 348 W at 20.9 kJ per litre of O2 (NASA metabolic equivalent).
 * 4. Oxygen use                 : metabolic power / 20.9 kJ per litre O2 (NASA NTRS 20120003917).
 * 5. EVA duration / capacity    : 8 h design EVA of the Mars PLSS studies. O2 capacity = 350 W x 8 h of metabolic energy
 *                                 (the closed-loop schematics list 0.7 kg O2, which equals this energy: 0.69 kg).
 *                                 Battery capacity = the same 8 h at a constant PLSS draw (the study's power column is
 *                                 labelled W-hr; its meaning is ambiguous, so only the 8 h life is used).
 * 6. Walking pace               : nominal 2.7 km/h (Apollo walkback planning average, level ground); slowest credible pace
 *                                 1 km/h (Apollo typical average 1-2 km/h). Pace is the speed at which metabolic power stays
 *                                 at or below the sustainable rate, never faster than nominal.
 */

export const G_MARS = 3.71; // m/s2, IAU/NASA planetary fact sheet
export const G_EARTH = 9.80665;

/** Metabolic equivalent of oxygen: 20.9 kJ per litre O2. NASA NTRS 20120003917. */
export const KJ_PER_LITRE_O2 = 20.9;
export const O2_GRAMS_PER_LITRE = 1.429; // density of O2 at 0 degC, 1 atm

/** Mars EVA metabolic rates, NASA Mars PLSS studies (NTRS 20250006266). */
export const METABOLIC_AVG_W = 350;
export const METABOLIC_PEAK_W = 530;
/** Design EVA length of the same studies. */
export const EVA_DESIGN_MIN = 480;
/** Metabolic energy that the 8 h, 350 W design EVA uses; used as the oxygen capacity, kJ. */
export const O2_CAPACITY_KJ = (METABOLIC_AVG_W * EVA_DESIGN_MIN * 60) / 1000;
/** Warn when less than this much of the design life is left (EMU secondary oxygen is a 30 min reserve). */
export const RESERVE_MIN = 30;

/** Reduced-gravity walking cost ratio Mars/Earth: 0.060 / 0.069 kcal/kg/min at 1.2 m/s. */
export const MARS_GRAVITY_COST_RATIO = 0.060 / 0.069;

/** Pace limits in m/s. */
export const NOMINAL_PACE_MS = 2.7 / 3.6; // Apollo walkback planning average
export const FLOOR_PACE_MS = 1.0 / 3.6; // low end of the Apollo typical 1-2 km/h

/** ASSUMPTIONS (no public xEMU figure found): crewmember body mass and suit + life support mass, kg. */
export const BODY_MASS_KG = 80;
export const SUIT_MASS_KG = 80;
export const SUITED_CREW_MASS_KG = BODY_MASS_KG + SUIT_MASS_KG;

/** Suit pressure of the Mars suit requirement (CDHCU requirements, NTRS 20170010189): 29.6 kPa = 4.3 psia. */
export const SUIT_PRESSURE_KPA = 29.6;

/** Resting metabolic power, assumption used only for the heart-rate estimate (about 1.2 W/kg x 80 kg). */
const REST_W = 100;
/** Aerobic ceiling: 36 ml/min/kg flight-rule minimum VO2max x body mass x 20.9 kJ/L, in W. */
export const AEROBIC_MAX_W = (36 * BODY_MASS_KG / 1000) * KJ_PER_LITRE_O2 * 1000 / 60;

export const GRADIENT_LIMIT = 0.45;

/** Minetti et al. (2002) J Appl Physiol 93:1039-1046, walking: J per kg per m, i = gradient as a fraction. */
export function walkingCostJ(i: number): number {
  const g = Math.max(-GRADIENT_LIMIT, Math.min(GRADIENT_LIMIT, i));
  return 280.5 * g ** 5 - 58.7 * g ** 4 - 76.8 * g ** 3 + 51.9 * g ** 2 + 19.6 * g + 2.5;
}

export function totalMassKg(payloadKg = 0): number {
  return SUITED_CREW_MASS_KG + Math.max(0, payloadKg);
}

/** Metabolic power of walking at pace v (m/s) on gradient i, W. */
export function walkingPowerW(i: number, vMs: number, payloadKg = 0): number {
  return walkingCostJ(i) * MARS_GRAVITY_COST_RATIO * totalMassKg(payloadKg) * vMs;
}

/** Self-paced speed: as fast as nominal, slowed so power stays at or below capW, never below the floor pace. */
export function paceMs(i: number, payloadKg = 0, capW = METABOLIC_AVG_W, nominal = NOMINAL_PACE_MS): number {
  const perMs = walkingCostJ(i) * MARS_GRAVITY_COST_RATIO * totalMassKg(payloadKg); // W per (m/s)
  if (perMs <= 0) return nominal;
  return Math.max(FLOOR_PACE_MS, Math.min(nominal, capW / perMs));
}

/**
 * Steepest gradient (degrees) walkable at the floor pace without exceeding capW. Used as the planner slope limit.
 * LOW risk tolerance uses the sustained 350 W rate, HIGH the 530 W peak, MEDIUM their mean (an interpolation).
 */
export function maxWalkableSlopeDeg(capW: number, payloadKg = 0): number {
  return slopeDegAtPower(capW, FLOOR_PACE_MS, payloadKg);
}

/** Steepest uphill slope (degrees) at which walking at vMs stays within capW. */
export function slopeDegAtPower(capW: number, vMs: number, payloadKg = 0): number {
  let lo = 0;
  let hi = GRADIENT_LIMIT;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (walkingPowerW(mid, vMs, payloadKg) > capW) hi = mid; else lo = mid;
  }
  return (Math.atan(lo) * 180) / Math.PI;
}

export function o2LitresPerMin(powerW: number): number {
  return (powerW * 60) / (KJ_PER_LITRE_O2 * 1000);
}
export function o2GramsPerMin(powerW: number): number {
  return o2LitresPerMin(powerW) * O2_GRAMS_PER_LITRE;
}

/** Heart rate from the %HRR = %VO2R relation (ACSM) with rest 60, max 180 bpm: ASSUMPTIONS. Apollo 17 logged 120-130 bpm, higher than this, because of suit heat load. */
export function heartRateBpm(powerW: number): number {
  const f = Math.max(0, Math.min(1, (powerW - REST_W) / (AEROBIC_MAX_W - REST_W)));
  return Math.round(60 + 120 * f);
}

/** Share of the design life used, percent. avgW is the route-average metabolic power. */
export function suitResources(elapsedSec: number, avgW: number): { batteryPct: number; o2Pct: number } {
  const t = Math.max(0, elapsedSec);
  const batteryUsed = t / (EVA_DESIGN_MIN * 60);
  const o2Used = (avgW * t) / 1000 / O2_CAPACITY_KJ;
  return {
    batteryPct: Math.max(0, Math.min(100, 100 - batteryUsed * 100)),
    o2Pct: Math.max(0, Math.min(100, 100 - o2Used * 100))
  };
}

/** Percent of design life left at which the dashboard warns: 30 min of the 8 h. */
export const RESERVE_WARN_PCT = (RESERVE_MIN / EVA_DESIGN_MIN) * 100;

export const PHYSIOLOGY_SOURCES: { id: string; what: string; status: 'REAL NASA' | 'REAL PEER-REVIEWED' | 'ASSUMPTION'; ref: string }[] = [
  { id: 'cost', what: 'Walking energy cost vs gradient', status: 'REAL PEER-REVIEWED', ref: 'Minetti AE et al. (2002) Energy cost of walking and running at extreme uphill and downhill slopes. J Appl Physiol 93:1039-1046' },
  { id: 'gravity', what: 'Mars/Earth walking cost ratio 0.87', status: 'REAL PEER-REVIEWED', ref: 'Underwater-treadmill reduced-gravity locomotion study (0.060 vs 0.069 kcal/kg/min at 1.2 m/s, 6 subjects); cross-check: Brown E et al. (2018) JEPonline 21(1):25-35, LBPP 0.38 g, VO2 1.00 to 0.68 L/min' },
  { id: 'rate', what: 'Mars EVA metabolic rate 350 W average, 530 W peak; 8 h EVA', status: 'REAL NASA', ref: 'NASA Mars PLSS studies, ICES 2025, NTRS 20250006266' },
  { id: 'o2', what: '20.9 kJ per litre O2', status: 'REAL NASA', ref: 'NASA NTRS 20120003917' },
  { id: 'vo2', what: 'VO2max flight-rule minimum 36 ml/min/kg, nominal use at most 35 %', status: 'REAL NASA', ref: 'xEMU / ICES Mars suit mass paper, NTRS 20260005410' },
  { id: 'pace', what: 'Walking pace 2.7 km/h nominal, 1 km/h floor', status: 'REAL NASA', ref: 'Apollo EVA walking speeds, NASA OSTI 7168757 and Apollo Lunar Surface Journal' },
  { id: 'pressure', what: 'Suit pressure 29.6 kPa', status: 'REAL NASA', ref: 'CDHCU requirements, NTRS 20170010189' },
  { id: 'mass', what: 'Crew 80 kg + suit/PLSS 80 kg', status: 'ASSUMPTION', ref: 'No public xEMU mass found; PLSS studies list 87-150 kg PLSS schematics, so this may be low' },
  { id: 'hr', what: 'Heart rate rest 60, max 180 bpm', status: 'ASSUMPTION', ref: '%HRR = %VO2R relation; rest and max are typical values, not crew data' },
  { id: 'battery', what: 'Battery drains at a constant rate over the 8 h design life', status: 'ASSUMPTION', ref: 'PLSS power column unit ambiguous in the source, so only the 8 h life is used' }
];
