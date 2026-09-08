import type { WorkingRole } from "./types";

const VALID_ROLES: readonly WorkingRole[] = ["product_management", "project_manager", "developer"];

/**
 * Step 8B transition (docs/V2-USERS-TEAMS.md "Working Role Cookie
 * Transition"): prefer the persisted `User.workingRole` when it's set;
 * fall back to the Step 4 onboarding cookie for users who haven't had it
 * written yet. Every reader of Working Role should go through this, not
 * read either source directly, so the fallback rule lives in one place.
 */
export function resolveWorkingRole(
  persisted: string | null | undefined,
  cookieValue: WorkingRole | undefined,
): WorkingRole | null {
  if (persisted && (VALID_ROLES as readonly string[]).includes(persisted)) {
    return persisted as WorkingRole;
  }
  return cookieValue ?? null;
}
