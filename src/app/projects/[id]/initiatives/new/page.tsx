import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { notFound, redirect } from "next/navigation";
import { FocusedLayout } from "@/components/layout/PageLayouts";
import GeneralIntakeForm from "@/components/questionnaire/GeneralIntakeForm";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { requireProjectPageAccess } from "@/lib/access/projectAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * New initiative inside an existing Project (directive §8/§9) — reached from
 * Project Home's "+ New initiative". Always uses ProductDirectionBootstrap's
 * full form (not SimplifiedIntakeWizard, which has no starting-point chooser
 * or Project-context concept yet — a reasonable fast-follow, not built this
 * pass) so every experience tier gets the "use existing project context"
 * option and the budget/rate/target-date inheritance it enables.
 */
async function NewInitiativeInProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireProjectPageAccess(user, id);
  if (user.memberType !== "internal" || !["owner", "admin"].includes(user.permissionRole)) redirect(`/projects/${id}`);

  const project = await db.project.findUnique({
    where: { id },
    include: { _count: { select: { initiatives: true } } },
  });
  if (!project) notFound();

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
      <GeneralIntakeForm
        storageScope={`${user.id}:${user.organizationId}`}
        project={{
          id: project.id,
          name: project.name,
          hasContext,
          budget: project.budget == null ? null : Number(project.budget),
          averageHourlyRate: project.averageHourlyRate == null ? null : Number(project.averageHourlyRate),
          targetLaunchDate: project.targetLaunchDate?.toISOString() ?? null,
        }}
      />
    </FocusedLayout>
  );
}

export default withAuthenticatedPage(NewInitiativeInProjectPage);
