import { WEIGHT_SETS, type WeightSetId } from "./weightRegistry";

/** Mirrors src/lib/dashboard/dashboardConfigResolution.ts — pure, DB-agnostic.
 * A corrupt or partial stored override never partially applies; it's treated
 * exactly like no override at all. */

const SUM_TOLERANCE = 0.001;

function safeParseWeights(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** True only when `weights` has exactly the registry's keys, all numeric, and
 * the values sum to within SUM_TOLERANCE of 1.0 — the invariant this table
 * exists to protect (see PlanningWeightOverride's schema comment). */
export function isValidWeightSet(setId: WeightSetId, weights: Record<string, unknown>): weights is Record<string, number> {
  const keys = Object.keys(WEIGHT_SETS[setId].defaults);
  if (Object.keys(weights).length !== keys.length) return false;
  if (!keys.every((k) => typeof weights[k] === "number" && Number.isFinite(weights[k]))) return false;
  const sum = keys.reduce((s, k) => s + (weights[k] as number), 0);
  return Math.abs(sum - 1) <= SUM_TOLERANCE;
}

/** Registry defaults, unless `overrideJson` is a complete, valid, sum-to-1.0
 * set — never a fabricated or silently-normalized value. */
export function resolveWeightSet(setId: WeightSetId, overrideJson: string | null | undefined): Record<string, number> {
  const defaults = WEIGHT_SETS[setId].defaults;
  if (!overrideJson) return { ...defaults };
  const parsed = safeParseWeights(overrideJson);
  if (!parsed || !isValidWeightSet(setId, parsed)) return { ...defaults };
  return { ...parsed };
}
