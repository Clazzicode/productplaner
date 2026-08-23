/**
 * The generation engine's `valueFactorsFrom` (src/lib/generation/scoring.ts) treats the
 * four advanced business-value sub-factors as all-or-nothing: it silently discards a
 * partial set and falls back to the plain `businessValue` enum (docs/V2-QUESTIONNAIRE-MAP.md
 * §9). The Advanced Scoring UI must never let a partial set reach the API — this helper is
 * the single source of truth for that check, used both to gate the "save" action and to
 * decide whether to submit the four scores at all.
 */
export interface AdvancedScoreFactors {
  customerImpactScore: number | null;
  revenueImpactScore: number | null;
  strategicAlignmentScore: number | null;
  riskComplianceScore: number | null;
}

export function isAdvancedScoringComplete(factors: AdvancedScoreFactors): boolean {
  return (
    factors.customerImpactScore != null &&
    factors.revenueImpactScore != null &&
    factors.strategicAlignmentScore != null &&
    factors.riskComplianceScore != null
  );
}
