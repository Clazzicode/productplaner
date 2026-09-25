import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PageHeader from "@/components/ui/PageHeader";
import SettingsForm from "@/components/account/SettingsForm";
import { requireCurrentUser } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import type { SelectableExperienceLevel } from "@/lib/onboarding/experienceOptions";

export const dynamic = "force-dynamic";

/**
 * Directive item 3: "Allow it to be changed later in Settings if needed" —
 * the account menu's own comment used to say this entry was permanently
 * removed pending "a real personal setting"; experience level and working
 * role are exactly that.
 */
export default async function AccountSettingsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);

  const profile = user.profiles[0];
  if (!profile) redirect("/welcome");

  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);

  // "expert" is a retired UI choice, still valid on old rows — treated
  // identically to "experienced" everywhere else (roleGuidance.ts), so it
  // maps to the same choice card here rather than leaving none selected.
  const currentExperienceLevel: SelectableExperienceLevel =
    profile.experienceLevel === "expert" ? "experienced" : (profile.experienceLevel as SelectableExperienceLevel);

  return (
    <ContainedLayout className="max-w-2xl">
      <PageHeader
        eyebrow="Guided Product Planning Platform"
        title="Settings"
        description="Change how the platform calibrates guidance for you. These don't change what's asked or how a plan is built."
      />
      <SettingsForm currentExperienceLevel={currentExperienceLevel} currentWorkingRole={workingRole} />
    </ContainedLayout>
  );
}
