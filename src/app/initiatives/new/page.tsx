import { FocusedLayout } from "@/components/layout/PageLayouts";
import ProductDirectionBootstrap from "@/components/questionnaire/ProductDirectionBootstrap";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

export default async function NewInitiativePage() {
  const profile = await getActiveProfile();
  const user = await getCurrentUser();
  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);

  return (
    <FocusedLayout>
      <Breadcrumb items={[{ label: "Initiatives", href: "/initiatives" }, { label: "New Initiative" }]} />
      <h1 className="mt-4 text-2xl font-bold">New initiative</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        No blank templates ahead — a few questions build straight into your working plan.
      </p>
      <ProductDirectionBootstrap hasProfile={profile != null} workingRole={workingRole} />
    </FocusedLayout>
  );
}
