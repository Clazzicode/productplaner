import type { WorkingRole } from "./types";

/**
 * Product Owner is the only launched working experience. Historical persisted
 * values and stale onboarding cookies must not revive unfinished workflows.
 * Keep the arguments so all existing callers use this one normalization point.
 */
export function resolveWorkingRole(
  persisted: string | null | undefined,
  cookieValue: WorkingRole | undefined,
): WorkingRole {
  void persisted;
  void cookieValue;
  return "product_owner";
}
