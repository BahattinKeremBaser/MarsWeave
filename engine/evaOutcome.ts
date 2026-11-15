/**
 * MARSWEAVE — EVA outcome from the sourced consumables model (engine/evaPhysiology.ts, status MODELLED).
 * The walk fails when oxygen or battery reaches zero before the route ends. Not a flight life-support analysis.
 */
import { suitResources as physSuitResources, O2_CAPACITY_KJ, EVA_DESIGN_MIN, RESERVE_WARN_PCT } from './evaPhysiology';

export { RESERVE_WARN_PCT };

export type EvaFailureCause = 'O2_EXHAUSTED' | 'BATTERY_EXHAUSTED';

export interface EvaFailure {
  cause: EvaFailureCause;
  /** Elapsed seconds at which the resource reaches zero. */
  atSec: number;
}

export type EvaOutcomeKind = 'ACCOMPLISHED' | 'OVER_LIMIT' | 'FAILED';

export function suitResources(elapsedSec: number, avgMetabolicW: number): { batteryPct: number; o2Pct: number } {
  return physSuitResources(elapsedSec, avgMetabolicW);
}

/** The first moment a consumable hits zero before the route ends, or null if the walk can be finished. */
export function findFailure(routeTotalSec: number, avgMetabolicW: number): EvaFailure | null {
  const batAt = EVA_DESIGN_MIN * 60;
  const o2At = avgMetabolicW > 0 ? (O2_CAPACITY_KJ * 1000) / avgMetabolicW : Infinity;
  const at = Math.min(o2At, batAt);
  if (at >= routeTotalSec) return null;
  return { cause: o2At <= batAt ? 'O2_EXHAUSTED' : 'BATTERY_EXHAUSTED', atSec: Math.floor(at) };
}

export function failureText(cause: EvaFailureCause): string {
  return cause === 'O2_EXHAUSTED'
    ? 'Suit oxygen ran out before the route was finished.'
    : 'Suit battery ran out before the route was finished.';
}
