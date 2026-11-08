import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import Link from "next/link";
import CoachMark from "@/components/coachmarks/CoachMark";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import StatusBadge from "@/components/roadmapStatus/StatusBadge";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { listAuthorizedInitiativeIds } from "@/lib/access/initiativeAccess";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { resolveLifecycleState, STAGE_LABEL } from "@/lib/lifecycle/resolveLifecycleState";
import { getResolvedStatuses } from "@/lib/roadmapStatus/service";

export const dynamic = "force-dynamic";

// Relocated from /home in Step 7B (docs/V2-STANDARD-DASHBOARD.md) so /home could
// become the global Standard Dashboard. Content and behavior unchanged from the
// previous /home — this remains the simple initiative list; reworking it into
// the dense "Data Table" layout (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §9) is
// still a separate, future step, not done here.
//
// Step 8C (docs/V2-RESOURCE-ACCESS.md §16): filtered through the same
// authorized-initiative set the dashboard uses, not raw `userId` ownership —
// a global list must not show initiatives a detail page would then reject.

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Prototype live", variant: "emerald" },
};

async function InitiativesPage() {
  const user = await requireCurrentUser();
  const canCreate = user.memberType === "internal" && ["owner", "admin"].includes(user.permissionRole);
  establishAuthContext(user.authUserId);
  const authorizedInitiativeIds = await listAuthorizedInitiativeIds(user);

  const initiatives = await db.initiative.findMany({
    where: { id: { in: authorizedInitiativeIds ?? [] } },
    orderBy: { updatedAt: "desc" },
    include: {
      prototype: {
        include: {
          releases: { where: { origin: "manual" }, select: { id: true } },
          sprints: { where: { origin: "manual" }, select: { id: true } },
        },
      },
      syncConnections: true,
    },
  });
  const statuses = await getResolvedStatuses(user.organizationId, "initiative", initiatives.map((i) => i.id));

  return (
    <ContainedLayout>
      <PageHeader
        eyebrow="Clarivia"
        title="Your initiatives"
        description="Plan structural status at a glance. Live plan-health against delivery actuals arrives with the v1.1 living-plan release."
        primaryAction={canCreate ? (
          <Link
            href="/initiatives/new"
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New initiative
          </Link>
        ) : undefined}
      />
      <CoachMark coachMarkKey="initiatives" className="mt-4" />

      {initiatives.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <h2 className="text-lg font-semibold">No initiatives yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            {canCreate ? "Save an initiative with a name, then develop its planning work at your own pace." : "Ask a workspace owner to share an initiative or create one for your team."}
          </p>
          {canCreate && (<Link
            href="/initiatives/new"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Start your first plan
          </Link>)}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {initiatives.map((initiative) => {
            const stageLabel = STAGE_LABEL[
              resolveLifecycleState({
                initiative: { id: initiative.id, status: initiative.status },
                manualReleaseCount: initiative.prototype?.releases.length ?? 0,
                manualSprintCount: initiative.prototype?.sprints.length ?? 0,
              }).stage
            ];
            const status = STATUS_META[initiative.status] ?? STATUS_META.draft;
            const jira = initiative.syncConnections.find((c) => c.tool === "jira");
            const href =
              `/initiatives/${initiative.id}/overview`;
            return (
              <li key={initiative.id}>
                <Link
                  href={href}
                  className="group block h-full rounded-xl border border-border-subtle bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)] transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-semibold text-text-primary group-hover:text-accent">{initiative.name}</h2>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        entityType="initiative"
                        entityId={initiative.id}
                        status={statuses.get(initiative.id) ?? { color: null, source: null, reason: "", recommendation: null }}
                      />
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                  </div>
                  {initiative.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                      {initiative.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {initiative.prototype && (
                      <span className="font-medium text-neutral-700">{stageLabel}</span>
                    )}
                    {initiative.prototype?.approvedAt && (
                      <span className="text-emerald-700">Baseline approved</span>
                    )}
                    {jira?.status === "connected" && (
                      <span className="text-indigo-600">
                        Jira {jira.lastSyncedAt ? "synced" : "connected"}
                      </span>
                    )}
                    <span>Methodology: hybrid waterfall</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ContainedLayout>
  );
}

export default withAuthenticatedPage(InitiativesPage);
