import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { resolveAccountState } from "@/lib/lifecycle/resolveAccountState";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

/**
 * Guided-activation restructure (reference doc §2): resumes wherever the
 * user left off in the onboarding sequence — Org Setup -> Experience
 * Calibration -> Role/Working Context -> Projects Home (directive §5/§37: a
 * returning or freshly-onboarded user always lands on Projects Home next,
 * never straight into a specific initiative — Projects Home itself renders
 * the right state whether that's zero Projects or many).
 *
 * "Has a QualifyingProfile" marks Experience Calibration done (it's created
 * at the end of that step, see WelcomeQualifying); "has a resolved Working
 * Role" marks Role done. Each check is independent of the others rather than
 * relying on the temp onboarding cookie's own step order, so an interrupted
 * session resumes correctly regardless of exactly where it stopped. See
 * resolveAccountState() for the actual stage/redirect decision.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  establishAuthContext(user.authUserId);

  const onboarding = await readOnboardingStateServer();
  const hasProfile = user.profiles[0] != null;
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);
  const projectCount =
    hasProfile && workingRole
      ? await db.project.count({ where: { organizationId: user.organizationId } })
      : 0;

  const { redirectTo } = resolveAccountState({
    hasProfile,
    workingRole,
    onboardingWorkspaceTypeChosen: onboarding.workspaceType != null,
    projectCount,
  });
  redirect(redirectTo);
}
