import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

/**
 * Guided-activation restructure (reference doc §2): resumes wherever the
 * user left off in the onboarding sequence — Org Setup -> Experience
 * Calibration -> Role/Working Context -> Adaptive Planning Questions (the
 * initiative-creation intake, per the merge decision in Block 3) -> Home.
 *
 * "Has a QualifyingProfile" marks Experience Calibration done (it's created
 * at the end of that step, see WelcomeQualifying); "has a resolved Working
 * Role" marks Role done; "has an Initiative" marks the merged adaptive-
 * questions step done. Each check is independent of the others rather than
 * relying on the temp onboarding cookie's own step order, so an interrupted
 * session resumes correctly regardless of exactly where it stopped.
 */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  establishAuthContext(user.authUserId);

  const profile = user.profiles[0] ?? null;
  if (!profile) {
    const onboarding = await readOnboardingStateServer();
    redirect(onboarding.workspaceType ? "/welcome" : "/onboarding");
  }

  const onboarding = await readOnboardingStateServer();
  if (!resolveWorkingRole(user.workingRole, onboarding.workingRole)) {
    redirect("/onboarding/role");
  }

  const hasInitiative = (await db.initiative.count({ where: { userId: user.id } })) > 0;
  redirect(hasInitiative ? "/home" : "/initiatives/new");
}
