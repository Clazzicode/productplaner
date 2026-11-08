import type { WorkingRole } from "@/lib/onboarding/types";

// Compatibility shape for older callers. Historical onboarding/profile data
// does not control access to the Product Owner workspace.

export type AccountStage =
  | "onboarding_org_setup" // no profile yet, workspace type not chosen
  | "onboarding_qualifying" // no profile yet, workspace type chosen
  | "onboarding_role" // profile exists, working role unresolved
  | "projects_home_empty" // onboarding complete, zero Projects
  | "projects_home"; // onboarding complete, >=1 Project

export interface AccountStateInput {
  hasProfile: boolean;
  workingRole: WorkingRole | null;
  /** OnboardingState.workspaceType != null — whether the first onboarding
   * question (Solo vs Team) has been answered yet. */
  onboardingWorkspaceTypeChosen: boolean;
  /** Only meaningful once onboarding is complete; callers may pass 0 when
   * onboarding isn't done yet, since it won't be read. */
  projectCount: number;
}

export interface AccountStateResolution {
  stage: AccountStage;
  redirectTo: string;
}

/**
 * The two `projects_home*` stages both redirect to the same "/projects" —
 * that page already renders the correct empty-vs-populated state itself
 * (src/app/projects/page.tsx). Kept as two named stages anyway so a future
 * caller that needs to branch on "empty vs. populated" (e.g. analytics) has
 * one source of truth instead of re-deriving it from a raw count.
 */
/** Legacy callers also receive experience-independent routing. */
export function resolveAccountState(input: AccountStateInput): AccountStateResolution {
  return input.projectCount > 0
    ? { stage: "projects_home", redirectTo: "/projects" }
    : { stage: "projects_home_empty", redirectTo: "/projects" };
}
