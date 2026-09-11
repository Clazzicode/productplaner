/**
 * TEMPORARY legacy compatibility for QualifyingProfile's required-but-now-unused fields.
 *
 * V2's questionnaire no longer asks these questions directly:
 * - `role` is superseded by the Working Role captured during V2 onboarding
 *   (product_management | project_manager | product_owner). The old 7-option enum has no
 *   equivalent for those three, so no real mapping is attempted — see
 *   docs/V2-QUESTIONNAIRE-MAP.md §6.
 * - `executionTool` is asked for real in Section 5, but its answer is held only in
 *   client-side questionnaire state and shown on Review — it is never written back to
 *   this column (no update endpoint exists, and nothing reads this column today; see
 *   docs/V2-QUESTIONNAIRE-IMPLEMENTATION.md "Compatibility Layer").
 * - `statedMethodology` is asked for real in Section 5, but its answer's authoritative
 *   destination is `Initiative.methodology` (via `POST /api/initiatives/[id]/methodology`,
 *   see `src/lib/questionnaire/methodologyMapping.ts`) — this column is never updated
 *   after profile creation and nothing reads it.
 *
 * `teamComposition` graduated OUT of this placeholder set: it's now a real, onboarding-
 * captured signal (Solo vs Team/Organization, asked in /onboarding) — every `/api/qualifying`
 * caller must pass it explicitly (`"solo"` or `"small_team"`), not spread it from here.
 *
 * `QualifyingProfile.role`/`executionTool`/`statedMethodology` remain required,
 * non-nullable Prisma columns because schema changes are out of scope until the
 * V2 database is isolated (docs/V2-ARCHITECTURE.md §11). These placeholder values exist
 * ONLY to satisfy that column requirement at profile-creation time. They must NEVER be
 * displayed as the user's real selection and must NEVER drive V2 behavior. Delete this
 * file (and the columns it papers over) once the schema can change.
 */
export const LEGACY_QUALIFYING_PROFILE_DEFAULTS = {
  role: "product_owner",
  executionTool: "none",
  statedMethodology: "hybrid",
} as const;
