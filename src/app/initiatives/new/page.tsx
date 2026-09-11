import { FocusedLayout } from "@/components/layout/PageLayouts";
import ProductDirectionBootstrap from "@/components/questionnaire/ProductDirectionBootstrap";
import SimplifiedIntakeWizard from "@/components/questionnaire/SimplifiedIntakeWizard";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { requireCurrentUser } from "@/lib/auth/session";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { isSimplifiedIntakeExperience } from "@/lib/questionnaire/roleGuidance";
import type { SimplifiedExperienceLevel } from "@/lib/onboarding/experienceOptions";

export const dynamic = "force-dynamic";

export default async function NewInitiativePage() {
  const user = await requireCurrentUser();
  const profile = user.profiles[0] ?? null;
  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);
  const simplified = profile != null && isSimplifiedIntakeExperience(profile.experienceLevel);

  return (
    <FocusedLayout>
      <Breadcrumb items={[{ label: "Initiatives", href: "/initiatives" }, { label: "New Initiative" }]} />
      <h1 className="mt-4 text-2xl font-bold">New initiative</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        No blank templates ahead — a few questions build straight into your working plan.
      </p>
      {simplified && profile ? (
        <SimplifiedIntakeWizard
          hasProfile
          workingRole={workingRole}
          experienceLevel={profile.experienceLevel as SimplifiedExperienceLevel}
          teamComposition={profile.teamComposition}
        />
      ) : (
        <ProductDirectionBootstrap hasProfile={profile != null} workingRole={workingRole} />
      )}
    </FocusedLayout>
  );
}
