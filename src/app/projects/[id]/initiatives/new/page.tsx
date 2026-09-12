import { notFound } from "next/navigation";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import ProductDirectionBootstrap from "@/components/questionnaire/ProductDirectionBootstrap";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { requireProjectPageAccess } from "@/lib/access/projectAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";

export const dynamic = "force-dynamic";

/**
 * New initiative inside an existing Project (directive §8/§9) — reached from
 * Project Home's "+ New initiative". Always uses ProductDirectionBootstrap's
 * full form (not SimplifiedIntakeWizard, which has no starting-point chooser
 * or Project-context concept yet — a reasonable fast-follow, not built this
 * pass) so every experience tier gets the "use existing project context"
 * option and the budget/rate/target-date inheritance it enables.
 */
export default async function NewInitiativeInProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireProjectPageAccess(user, id);

  const project = await db.project.findUnique({
    where: { id },
    include: { _count: { select: { initiatives: true } } },
  });
  if (!project) notFound();

  const onboarding = await readOnboardingStateServer();
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);
  const hasContext = project._count.initiatives > 0 || project.budget != null || project.averageHourlyRate != null || project.targetLaunchDate != null;

  return (
    <FocusedLayout>
      <Breadcrumb
        items={[
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "New Initiative" },
        ]}
      />
      <h1 className="mt-4 text-2xl font-bold">New initiative in {project.name}</h1>
      <p className="mt-1 mb-8 text-sm text-neutral-500">
        A few questions build straight into your working plan — budget, rate, and target date
        carry over from the project unless you override them.
      </p>
      <ProductDirectionBootstrap
        hasProfile
        workingRole={workingRole}
        project={{
          id: project.id,
          name: project.name,
          hasContext,
          budget: project.budget,
          averageHourlyRate: project.averageHourlyRate,
          targetLaunchDate: project.targetLaunchDate?.toISOString() ?? null,
        }}
      />
    </FocusedLayout>
  );
}
