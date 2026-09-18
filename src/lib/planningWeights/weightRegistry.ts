import { PRIORITY_WEIGHTS, VALUE_FACTOR_WEIGHTS } from "@/lib/generation/constants";

/**
 * Code-level defaults for every editable weight set — the "code-level
 * default" half of the same registry + sparse-override pattern
 * DashboardConfiguration already uses (src/lib/dashboard/widgetRegistry.ts).
 *
 * `defaults` below are the LITERAL imported constants, never re-typed —
 * keeping this registry (and everything downstream: the resolver, the editor
 * UI, and the explanation popovers) from ever drifting the way the app's
 * existing hardcoded-formula tooltip strings already have.
 */

export type WeightSetId = "valueFactorWeights" | "priorityWeights";

export interface WeightFactorDefinition {
  key: string;
  label: string;
  description: string;
}

export interface WeightSetDefinition {
  id: WeightSetId;
  title: string;
  description: string;
  factors: WeightFactorDefinition[];
  defaults: Record<string, number>;
}

export const WEIGHT_SETS: Record<WeightSetId, WeightSetDefinition> = {
  valueFactorWeights: {
    id: "valueFactorWeights",
    title: "Business value factor weights",
    description:
      "How the four weighted sub-factors combine into a capability's business value score, when a feature uses the optional weighted-factor scoring.",
    factors: [
      { key: "customerImpact", label: "Customer impact", description: "How much this feature affects the customer." },
      { key: "revenueImpact", label: "Revenue impact", description: "How much this feature affects revenue." },
      { key: "strategicAlignment", label: "Strategic alignment", description: "How well this feature aligns with strategy." },
      { key: "riskCompliance", label: "Risk / compliance impact", description: "How much this feature affects risk or compliance exposure." },
    ],
    defaults: VALUE_FACTOR_WEIGHTS,
  },
  priorityWeights: {
    id: "priorityWeights",
    title: "Priority score weights",
    description: "How business value, MVP importance, dependency importance, and risk reduction combine into a feature's priority score.",
    factors: [
      { key: "businessValue", label: "Business value", description: "The feature's business value score." },
      { key: "mvpImportance", label: "MVP importance", description: "How important this feature is to the MVP." },
      { key: "dependencyImportance", label: "Dependency importance", description: "How many other features depend on this one." },
      { key: "riskReduction", label: "Risk reduction", description: "How much scheduling this earlier reduces risk." },
    ],
    defaults: PRIORITY_WEIGHTS,
  },
};
