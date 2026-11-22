import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import CoachMark from "@/components/coachmarks/CoachMark";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import FeaturesWorkspace from "@/components/features/FeaturesWorkspace";
import PageHeader from "@/components/ui/PageHeader";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { resolveLifecycleState, STAGE_LABEL } from "@/lib/lifecycle/resolveLifecycleState";
import { getResolvedStatuses } from "@/lib/roadmapStatus/service";

export const dynamic = "force-dynamic";

async function InitiativesPage() {
  const user = await requireCurrentUser();
  const canCreate = user.memberType === "internal" && ["owner", "admin"].includes(user.permissionRole);
  establishAuthContext(user.authUserId);
  const authorizedInitiativeIds = await listAuthorizedInitiativeIds(user);

  const [initiatives, products] = await Promise.all([
    db.initiative.findMany({
      where: { id: { in: authorizedInitiativeIds ?? [] } },
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        prototype: { include: {
          releases: { where: { origin: "manual" }, select: { id: true } },
          sprints: { where: { origin: "manual" }, select: { id: true } },
        } },
        syncConnections: { where: { tool: "jira" }, select: { status: true, lastSyncedAt: true } },
      },
    }),
    db.project.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const statuses = await getResolvedStatuses(user.organizationId, "initiative", initiatives.map(i => i.id));

  const features = initiatives.map(initiative => ({
    id: initiative.id,
    name: initiative.name,
    description: initiative.description,
    product: initiative.project,
    status: statuses.get(initiative.id) ?? { color: null, source: null, reason: "", recommendation: null },
    stage: initiative.prototype ? STAGE_LABEL[resolveLifecycleState({
      initiative: { id: initiative.id, status: initiative.status },
      manualReleaseCount: initiative.prototype.releases.length,
      manualSprintCount: initiative.prototype.sprints.length,
    }).stage] : null,
    lifecycle: initiative.status,
    baselineApproved: Boolean(initiative.prototype?.approvedAt),
    jiraConnected: initiative.syncConnections.some(connection => connection.status === "connected"),
    jiraSynced: initiative.syncConnections.some(connection => connection.status === "connected" && connection.lastSyncedAt),
  }));

  return <ContainedLayout>
    <PageHeader
      eyebrow="Clarivia"
      title="Your features"
      description="Plan structural status at a glance. Live plan-health against delivery actuals arrives with the v1.1 living-plan release."
    />
    <CoachMark coachMarkKey="initiatives" className="mt-4" />
    <FeaturesWorkspace features={features} products={products} canCreate={canCreate} />
  </ContainedLayout>;
}

export default withAuthenticatedPage(InitiativesPage);
