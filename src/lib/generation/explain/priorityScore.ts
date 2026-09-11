import type { Explanation, ExplanationTerm } from "@/lib/explainability/types";
import { MVP_IMPORTANCE_SCORE, PRIORITY_WEIGHTS } from "../constants";
import {
  computePriorityScore,
  dependencyImportanceScore,
  deriveMvpImportance,
  effectiveBusinessValueScore,
  riskReductionScore,
} from "../scoring";
import type { CapabilityInput } from "../types";

const round = (n: number) => Math.round(n * 100) / 100;

/** Explains a §5 priority score. `total` always comes from computePriorityScore
 * itself (same weights passed through) — never re-derived — so the explanation
 * can never drift from the number actually shown/used. */
export function explainPriorityScore(
  cap: CapabilityInput,
  dependedOnByCount: number,
  weights: typeof PRIORITY_WEIGHTS = PRIORITY_WEIGHTS,
): Explanation {
  const businessValue = effectiveBusinessValueScore(cap);
  const mvpImportance = MVP_IMPORTANCE_SCORE[deriveMvpImportance(cap)];
  const dependencyImportance = dependencyImportanceScore(dependedOnByCount);
  const riskReduction = riskReductionScore(cap.riskLevel ?? "medium", cap.isMvp);
  const total = computePriorityScore(cap, dependedOnByCount, weights);

  const terms: ExplanationTerm[] = [
    {
      label: "Business value",
      value: businessValue,
      weight: weights.businessValue,
      contribution: round(businessValue * weights.businessValue),
    },
    {
      label: "MVP importance",
      value: mvpImportance,
      weight: weights.mvpImportance,
      contribution: round(mvpImportance * weights.mvpImportance),
    },
    {
      label: "Dependency importance",
      value: dependencyImportance,
      weight: weights.dependencyImportance,
      contribution: round(dependencyImportance * weights.dependencyImportance),
    },
    {
      label: "Risk reduction",
      value: riskReduction,
      weight: weights.riskReduction,
      contribution: round(riskReduction * weights.riskReduction),
    },
  ];

  return {
    summary: `Priority score ${total} — the weighted sum of business value, MVP importance, dependency importance, and risk reduction.`,
    terms,
    formula: "(business value × weight) + (MVP importance × weight) + (dependency importance × weight) + (risk reduction × weight)",
  };
}
