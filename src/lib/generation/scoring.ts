// Deterministic scoring rules from "Planning & Cost Logic" (§2, §4, §5, §9).
// Pure functions only — computed on read or at generation time, never
// persisted except for the §2 weighted score snapshot.

import {
  FIBONACCI_POINTS,
  MVP_IMPORTANCE_SCORE,
  PRIORITY_WEIGHTS,
  VALUE_FACTOR_WEIGHTS,
  VALUE_SCORE,
} from "./constants";
import type { BusinessValue, CapabilityInput, MvpImportance, RiskLevel } from "./types";

// ---------- §2 business-value scoring ----------

export interface ValueFactors {
  customerImpactScore: number; // 1-5
  revenueImpactScore: number; // 1-5
  strategicAlignmentScore: number; // 1-5
  riskComplianceScore: number; // 1-5
}

/** §2 weighted score: (CI×0.30)+(RI×0.30)+(SA×0.25)+(RC×0.15), range 1–5. */
export function computeBusinessValueScore(f: ValueFactors): number {
  const raw =
    f.customerImpactScore * VALUE_FACTOR_WEIGHTS.customerImpact +
    f.revenueImpactScore * VALUE_FACTOR_WEIGHTS.revenueImpact +
    f.strategicAlignmentScore * VALUE_FACTOR_WEIGHTS.strategicAlignment +
    f.riskComplianceScore * VALUE_FACTOR_WEIGHTS.riskCompliance;
  return Math.round(raw * 100) / 100;
}

/** Map a 1–5 weighted score onto the five-level label scale. */
export function businessValueLevelFromScore(score: number): BusinessValue {
  if (score >= 4.5) return "critical";
  if (score >= 3.5) return "high";
  if (score >= 2.5) return "medium";
  if (score >= 1.5) return "low";
  return "very_low";
}

/** The four §2 sub-factors, only when ALL are provided (partial sets ignored). */
export function valueFactorsFrom(obj: {
  customerImpactScore?: number | null;
  revenueImpactScore?: number | null;
  strategicAlignmentScore?: number | null;
  riskComplianceScore?: number | null;
}): ValueFactors | null {
  const { customerImpactScore, revenueImpactScore, strategicAlignmentScore, riskComplianceScore } = obj;
  if (
    customerImpactScore == null ||
    revenueImpactScore == null ||
    strategicAlignmentScore == null ||
    riskComplianceScore == null
  ) {
    return null;
  }
  return { customerImpactScore, revenueImpactScore, strategicAlignmentScore, riskComplianceScore };
}

// ---------- §5 priority sub-factors (computed, not asked) ----------

/** Derive MVP importance from the Q4 boolean when no explicit override is set. */
export function deriveMvpImportance(cap: {
  isMvp: boolean;
  mvpImportance?: MvpImportance | null;
}): MvpImportance {
  return cap.mvpImportance ?? (cap.isMvp ? "required_for_mvp" : "useful_not_required");
}

/**
 * Prototype convention: bucket how many other capabilities depend on this one.
 * 0 → fully independent (1) … 4+ → blocks several (5).
 */
export function dependencyImportanceScore(dependedOnByCount: number): number {
  return Math.min(5, dependedOnByCount + 1);
}

/**
 * §4 rule operationalized: high-risk MVP work carries the most learning value
 * and should be prioritized earlier rather than deferred.
 */
export function riskReductionScore(riskLevel: RiskLevel, isMvp: boolean): number {
  switch (riskLevel) {
    case "critical":
      return isMvp ? 5 : 4;
    case "high":
      return isMvp ? 4 : 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}

// ---------- §5 priority score ----------

/** The §2 score when sub-factors were used, otherwise the level's 1–5 rank. */
export function effectiveBusinessValueScore(cap: {
  businessValue: BusinessValue;
  businessValueScore?: number | null;
}): number {
  return cap.businessValueScore ?? VALUE_SCORE[cap.businessValue];
}

/**
 * §5: (Business Value × 0.45) + (MVP Importance × 0.25)
 *    + (Dependency Importance × 0.15) + (Risk Reduction Value × 0.15)
 */
export function computePriorityScore(cap: CapabilityInput, dependedOnByCount: number): number {
  const raw =
    effectiveBusinessValueScore(cap) * PRIORITY_WEIGHTS.businessValue +
    MVP_IMPORTANCE_SCORE[deriveMvpImportance(cap)] * PRIORITY_WEIGHTS.mvpImportance +
    dependencyImportanceScore(dependedOnByCount) * PRIORITY_WEIGHTS.dependencyImportance +
    riskReductionScore(cap.riskLevel ?? "medium", cap.isMvp) * PRIORITY_WEIGHTS.riskReduction;
  return Math.round(raw * 100) / 100;
}

/**
 * Whether a capability carries the new §4/§5 inputs. Legacy in-memory inputs
 * (engine test fixtures, pre-upgrade data) don't — the ordering comparator
 * must fall through to the original value/effort/order keys for those.
 */
export function hasScoringInputs(cap: CapabilityInput): boolean {
  return cap.riskLevel !== undefined || cap.mvpImportance != null;
}

// ---------- §9 story points ----------

/** Snap a raw point estimate to the Fibonacci scale (nearest; ties round down). */
export function snapToFibonacci(points: number): number {
  let best: number = FIBONACCI_POINTS[0];
  for (const f of FIBONACCI_POINTS) {
    if (Math.abs(f - points) < Math.abs(best - points)) best = f;
  }
  return best;
}

/** §9: any 13-point story should be flagged as too large for one sprint. */
export function isOversizedStory(points: number): boolean {
  return points >= 13;
}

/** §3: an XL capability (13 base points) may be too broad to plan well. */
export function isOversizedCapability(cap: { effortSize: string }): boolean {
  return cap.effortSize === "xl";
}
