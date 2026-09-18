// Document Import & Approved Context (directive §3, items 12/18). The
// standard, fixed field lists a Project/Initiative's approved context is
// measured against — deliberately NOT an adaptive/weighted engine (matches
// this effort's existing "don't implement undefined scoring logic"
// boundary). Only review-screen COPY varies by experience level
// (src/lib/questionnaire/roleGuidance.ts's depthFromExperience), never which
// fields are required.

export const PROJECT_CONTEXT_FIELDS = [
  "project_name",
  "description",
  "goal",
  "budget",
  "projected_go_live",
  "team",
  "constraints",
  "stakeholders",
] as const;

export const INITIATIVE_CONTEXT_FIELDS = [
  "initiative_name",
  "initiative_goal",
  "success_measure",
  "initiative_target_date",
] as const;

// Open-ended: many rows per scope are normal (not "conflicting" with each
// other the way a single scalar fact can) — see conflictDetection.ts.
// dependency/assumption are valid extraction targets but are never
// crystallized into a real relation (traceability-only, a deliberate scope
// cut — see crystallize.ts).
export const OPEN_ENDED_FIELD_KEYS = ["feature", "risk", "dependency", "assumption"] as const;

export type ProjectContextField = (typeof PROJECT_CONTEXT_FIELDS)[number];
export type InitiativeContextField = (typeof INITIATIVE_CONTEXT_FIELDS)[number];
export type OpenEndedFieldKey = (typeof OPEN_ENDED_FIELD_KEYS)[number];
export type ContextFieldKey = ProjectContextField | InitiativeContextField | OpenEndedFieldKey;

export function isOpenEndedFieldKey(fieldKey: string): fieldKey is OpenEndedFieldKey {
  return (OPEN_ENDED_FIELD_KEYS as readonly string[]).includes(fieldKey);
}

/**
 * Directive item 12 ("Needs Your Input"): which of the current scope's
 * required fields have neither a real existing value nor an approved
 * ContextItem yet. `pendingApprovedFieldKeys` lets a caller (the review
 * screen) reflect an approval the user just clicked without waiting on a
 * full Project/Initiative refetch — the crystallization write itself always
 * happens immediately server-side regardless.
 */
export function detectGaps(
  scope: "project" | "initiative",
  currentValues: Record<string, unknown>,
  pendingApprovedFieldKeys: ReadonlySet<string> = new Set(),
): string[] {
  const fields: readonly string[] = scope === "project" ? PROJECT_CONTEXT_FIELDS : INITIATIVE_CONTEXT_FIELDS;
  return fields.filter((key) => {
    const current = currentValues[key];
    const hasCurrent = current !== null && current !== undefined && current !== "";
    return !hasCurrent && !pendingApprovedFieldKeys.has(key);
  });
}
