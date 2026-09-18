import { meetsMinimum, type ResolvedLevel } from "@/lib/access/resolution";
import { isSimplifiedIntakeExperience } from "@/lib/questionnaire/roleGuidance";

/**
 * "Appropriate experience or permissions" (the platform's own phrasing) —
 * the first place experienceLevel gates a CAPABILITY rather than just copy.
 * Built entirely from existing, already-scoped signals: resolveInitiativeAccess()/
 * meetsMinimum() (src/lib/access/resolution.ts) and isSimplifiedIntakeExperience()
 * (src/lib/questionnaire/roleGuidance.ts) — no new signal invented.
 */
export function canEditPlanningWeights(params: {
  actorStatus: string;
  accessLevel: string;
  initiativePermission: ResolvedLevel;
  initiativeExperienceLevel: string | null | undefined;
}): boolean {
  if (params.actorStatus !== "active") return false;
  if (params.accessLevel === "org_admin") return true;
  if (meetsMinimum(params.initiativePermission, "edit")) return true;
  // Fail closed when experience is unknown (no QualifyingProfile) — the
  // experience-based branch only grants access on a CONFIRMED "experienced"
  // reading, never on the absence of a signal. isSimplifiedIntakeExperience(null)
  // returns false (its "concise help text" default), which is right for copy
  // depth but wrong to reuse directly for a permission gate.
  if (params.initiativeExperienceLevel == null) return false;
  return !isSimplifiedIntakeExperience(params.initiativeExperienceLevel);
}
