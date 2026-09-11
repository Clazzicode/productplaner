import type { Explanation, ExplanationTerm } from "@/lib/explainability/types";
import { VALUE_FACTOR_WEIGHTS } from "../constants";
import { businessValueLevelFromScore, computeBusinessValueScore, valueFactorsFrom } from "../scoring";
import type { BusinessValue } from "../types";

const round = (n: number) => Math.round(n * 100) / 100;

export interface BusinessValueScoreCandidate {
  businessValue: BusinessValue;
  customerImpactScore?: number | null;
  revenueImpactScore?: number | null;
  strategicAlignmentScore?: number | null;
  riskComplianceScore?: number | null;
}

/** Explains a §2 business value score. When a capability didn't use the
 * optional weighted sub-factor scoring, this is a distinct, honest "direct
 * pick" explanation — not a needs_business_rule gap, since the methodology
 * exists, this specific feature just wasn't scored that way. */
export function explainBusinessValueScore(
  cap: BusinessValueScoreCandidate,
  weights: typeof VALUE_FACTOR_WEIGHTS = VALUE_FACTOR_WEIGHTS,
): Explanation {
  const factors = valueFactorsFrom(cap);
  if (!factors) {
    return {
      summary: `Business value "${cap.businessValue}" was set directly — this feature didn't use the optional weighted-factor breakdown.`,
      terms: [{ label: "Business value (direct pick)", value: cap.businessValue }],
    };
  }

  const score = computeBusinessValueScore(factors, weights);
  const terms: ExplanationTerm[] = [
    {
      label: "Customer impact",
      value: factors.customerImpactScore,
      weight: weights.customerImpact,
      contribution: round(factors.customerImpactScore * weights.customerImpact),
    },
    {
      label: "Revenue impact",
      value: factors.revenueImpactScore,
      weight: weights.revenueImpact,
      contribution: round(factors.revenueImpactScore * weights.revenueImpact),
    },
    {
      label: "Strategic alignment",
      value: factors.strategicAlignmentScore,
      weight: weights.strategicAlignment,
      contribution: round(factors.strategicAlignmentScore * weights.strategicAlignment),
    },
    {
      label: "Risk / compliance impact",
      value: factors.riskComplianceScore,
      weight: weights.riskCompliance,
      contribution: round(factors.riskComplianceScore * weights.riskCompliance),
    },
  ];

  return {
    summary: `Business value score ${score} (${businessValueLevelFromScore(score)}) — the weighted sum of four sub-factors.`,
    terms,
    formula: "(customer impact × weight) + (revenue impact × weight) + (strategic alignment × weight) + (risk/compliance × weight)",
  };
}
