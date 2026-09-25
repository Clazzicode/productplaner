/**
 * Maps the Section 5 methodology answer (which offers a "not sure" option) onto the
 * real, engine-recognized methodology values accepted by
 * `POST /api/initiatives/[id]/methodology` (`methodologySchema` in
 * src/lib/validation/schemas.ts). "Not sure" resolves to "hybrid" — the platform's
 * stated flagship/default model (see QualifyingWizard's own "Hybrid will be applied by
 * default" hint) — explicitly, not silently: the Execution Preferences UI states this
 * fallback before the user confirms it.
 */
export type MethodologyAnswer = "hybrid" | "agile_scrum" | "waterfall" | "kanban" | "not_sure";
export type EngineMethodology = "hybrid" | "agile_scrum" | "waterfall" | "kanban";

export function mapMethodologyAnswer(answer: MethodologyAnswer): EngineMethodology {
  return answer === "not_sure" ? "hybrid" : answer;
}
