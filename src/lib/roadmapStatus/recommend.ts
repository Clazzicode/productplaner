// Explainable, condition-based status recommendations — deliberately NOT
// built on health.ts's numeric schedule/cost/scope bands (those need
// business-defined thresholds; see health.ts's own BUSINESS RULE REQUIRED
// note). Every recommender here checks an objective, already-known fact
// (a date has passed, required information is missing) taken directly from
// the directive's own RED/YELLOW examples — never a weighted score or an
// invented cutoff (e.g. "14 days before deadline" would be an invented
// threshold; "the deadline already passed" is not).
//
// Deliberately scoped: dependency-blocking and "approaching deadline"
// recommendations are NOT implemented yet. Both are directive-listed
// examples, but implementing them honestly needs either a completion/done
// concept this schema doesn't have yet (Capability/Feature has no "done"
// flag to check a dependency against) or an arbitrary proximity window
// (how many days counts as "approaching"?) that would itself be an invented
// threshold. Add them once that data or an explicit business rule exists —
// pure functions here, so a fast-follow.

import type { StatusRecommendation } from "./types";

export interface InitiativeStatusInput {
  targetLaunchDate: Date | null;
  isActivelyExecuting: boolean;
  problemStatement: string;
  targetCustomer: string;
  outcomeStatement: string;
}

/** Directive RED example: "The item has passed an important target date."
 * Directive YELLOW example: "Required information is still missing." */
export function recommendInitiativeStatus(input: InitiativeStatusInput, today: Date = new Date()): StatusRecommendation | null {
  if (input.targetLaunchDate && input.targetLaunchDate < today && !input.isActivelyExecuting) {
    return { color: "red", reason: `Passed its target date (${input.targetLaunchDate.toLocaleDateString()}).` };
  }
  const missing: string[] = [];
  if (!input.problemStatement.trim()) missing.push("problem statement");
  if (!input.targetCustomer.trim()) missing.push("target customer");
  if (!input.outcomeStatement.trim()) missing.push("desired outcome");
  if (missing.length > 0) {
    return { color: "yellow", reason: `Missing required information: ${missing.join(", ")}.` };
  }
  return null;
}

export interface ProjectStatusInput {
  targetLaunchDate: Date | null;
  hasGeneratedInitiative: boolean;
}

/** Same RED example as above, applied at the Project level: the project's
 * shared target date has passed and nothing under it has reached a
 * generated plan yet. */
export function recommendProjectStatus(input: ProjectStatusInput, today: Date = new Date()): StatusRecommendation | null {
  if (input.targetLaunchDate && input.targetLaunchDate < today && !input.hasGeneratedInitiative) {
    return { color: "red", reason: `Passed its target date (${input.targetLaunchDate.toLocaleDateString()}) with no initiative yet generated.` };
  }
  return null;
}
