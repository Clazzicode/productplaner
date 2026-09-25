import type { Explanation, ExplanationTerm } from "@/lib/explainability/types";
import type { BusinessValue } from "../types";

export interface RoadmapPlacementCandidate {
  isMvp: boolean;
  businessValue: BusinessValue;
  manualPhaseOverride?: number | null;
}

/** Explains a capability's roadmap phase per buildPlan.ts's partitionPhases
 * seeding rule (MVP -> Phase 1; non-MVP High/Critical value -> Phase 2;
 * otherwise Phase 3). Notes, rather than re-derives, the dependency-closure
 * promotion buildPlan.ts also applies — replicating that fixed-point
 * computation here would duplicate the engine rather than explain it. */
export function explainRoadmapPlacement(cap: RoadmapPlacementCandidate): Explanation {
  if (cap.manualPhaseOverride != null) {
    return {
      summary: `Phase ${cap.manualPhaseOverride} was set manually (dragged on the Timeline) — it overrides the automatic rule below.`,
      terms: [{ label: "Manual override", value: cap.manualPhaseOverride }],
    };
  }

  const terms: ExplanationTerm[] = [
    { label: "Required for MVP", value: cap.isMvp ? "yes" : "no" },
    { label: "Business value", value: cap.businessValue },
  ];

  if (cap.isMvp) {
    return {
      summary: "Phase 1 (MVP) — required for the MVP.",
      terms,
      formula: "MVP → Phase 1. Non-MVP with High/Critical value → Phase 2. Otherwise → Phase 3.",
    };
  }

  const pulledToPhase2 = cap.businessValue === "high" || cap.businessValue === "critical";
  return {
    summary: pulledToPhase2
      ? `Phase 2 — not required for the MVP, but its business value (${cap.businessValue}) is high enough to pull it into the second phase.`
      : `Phase 3 — not required for the MVP, and its business value (${cap.businessValue}) isn't high enough to pull it earlier. A dependency of an earlier feature can still pull this forward, so nothing is scheduled after something that needs it first.`,
    terms,
    formula: "MVP → Phase 1. Non-MVP with High/Critical value → Phase 2. Otherwise → Phase 3.",
  };
}
