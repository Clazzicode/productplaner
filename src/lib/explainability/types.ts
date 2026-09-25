/**
 * Shared shape for "how was this calculated?" — a specific instance's real,
 * already-defined formula, explained. Deliberately separate from
 * PlanningConceptStatus (src/lib/planningConcepts/registry.ts): that tracks
 * whether a METHODOLOGY is defined at all (product-team-facing); this is
 * "can this specific number, from an already-defined formula, be explained"
 * (always true when one exists). Where the underlying methodology is itself
 * `needs_business_rule` (risk level, either role), no Explanation is ever
 * produced — render PendingBusinessRule instead. Fabricating an Explanation
 * for an undefined methodology would be exactly the "presenting a result as
 * authoritative when the logic can't be explained" failure mode this exists
 * to prevent.
 */

export interface ExplanationTerm {
  label: string;
  value: number | string;
  weight?: number;
  contribution?: number;
}

export interface Explanation {
  summary: string;
  terms: ExplanationTerm[];
  formula?: string;
}
