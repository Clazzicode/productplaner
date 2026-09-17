import type { WorkingRole } from "@/lib/onboarding/types";

// Account/project-layer counterpart to resolveLifecycleState.ts, which only
// covers initiative progression (create -> generate -> release -> sprint ->
// active). This resolver owns the stages upstream of that: onboarding, then
// "does this account have a Project yet." The two compose rather than
// duplicate one another — once a user is inside a Project/Initiative,
// resolveLifecycleState keeps owning progression exactly as it does today.
//
// Pure, no `db`/`cookies` import: the caller (src/app/page.tsx) loads the
// handful of needed facts itself and passes them in, matching
// resolveLifecycleState's own "callers load the DB facts, this just
// decides" shape. Kept this way (rather than bundling an I/O loader here)
// because src/lib/db.ts's documented AsyncLocalStorage rule means
// establishAuthContext()'s effect is lost if it's set inside a function that
// itself awaits cookies()/headers() and returns before the caller uses
// `db` — page.tsx's existing call shape (establishAuthContext, then await
// cookies() via readOnboardingStateServer(), then db calls, all in one
// function body) is already proven safe; splitting the I/O into a second
// function here would introduce a new boundary to reason about for no
// benefit.

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
export function resolveAccountState(input: AccountStateInput): AccountStateResolution {
  if (!input.hasProfile) {
    return input.onboardingWorkspaceTypeChosen
      ? { stage: "onboarding_qualifying", redirectTo: "/welcome" }
      : { stage: "onboarding_org_setup", redirectTo: "/onboarding" };
  }
  if (!input.workingRole) {
    return { stage: "onboarding_role", redirectTo: "/onboarding/role" };
  }
  return input.projectCount > 0
    ? { stage: "projects_home", redirectTo: "/projects" }
    : { stage: "projects_home_empty", redirectTo: "/projects" };
}
