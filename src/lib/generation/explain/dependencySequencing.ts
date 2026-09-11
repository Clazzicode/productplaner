import type { Explanation, ExplanationTerm } from "@/lib/explainability/types";
import { findCycle } from "../dependencyGraph";
import type { CapabilityInput } from "../types";

/** Explains how one capability's dependencies affect its sequencing — how
 * many features it depends on, how many depend on it (which feeds its
 * dependency-importance score), and whether it's part of an unresolved cycle. */
export function explainDependencySequencing(cap: CapabilityInput, allCapabilities: CapabilityInput[]): Explanation {
  const dependedOnByCount = allCapabilities.filter((c) => c.dependsOn.includes(cap.id)).length;
  const cycleIds = findCycle(allCapabilities);
  const inCycle = cycleIds.includes(cap.id);

  const terms: ExplanationTerm[] = [
    { label: "Depends on", value: cap.dependsOn.length },
    { label: "Other features depending on this", value: dependedOnByCount },
  ];

  if (inCycle) {
    return {
      summary: "This feature is part of a circular dependency — sequencing can't be fully resolved until the cycle is broken.",
      terms,
    };
  }

  return {
    summary:
      cap.dependsOn.length > 0
        ? `Sequenced after its ${cap.dependsOn.length} dependenc${cap.dependsOn.length === 1 ? "y" : "ies"}. ${dependedOnByCount} other feature${dependedOnByCount === 1 ? "" : "s"} wait${dependedOnByCount === 1 ? "s" : ""} on this one, which feeds its dependency-importance score.`
        : `No dependencies — nothing must finish before this can start. ${dependedOnByCount} other feature${dependedOnByCount === 1 ? "" : "s"} wait${dependedOnByCount === 1 ? "s" : ""} on this one, which feeds its dependency-importance score.`,
    terms,
  };
}
