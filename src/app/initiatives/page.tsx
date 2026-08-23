import Link from "next/link";
import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { getActiveProfile, getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { LAYER_SEQUENCE } from "@/lib/generation/types";

export const dynamic = "force-dynamic";

// Relocated from /home in Step 7B (docs/V2-STANDARD-DASHBOARD.md) so /home could
// become the global Standard Dashboard. Content and behavior unchanged from the
// previous /home — this remains the simple initiative list; reworking it into
// the dense "Data Table" layout (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §9) is
// still a separate, future step, not done here.

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Prototype live", variant: "emerald" },
};

export default async function InitiativesPage() {
  const profile = await getActiveProfile();
  if (!profile) redirect("/welcome");
  const user = await getCurrentUser();

  const initiatives = await db.initiative.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: {
      prototype: { include: { layerLocks: true } },
      syncConnections: true,
    },
  });

  return (
    <ContainedLayout className="max-w-4xl">
      <PageHeader
        eyebrow="Guided Product Planning Platform"
        title="Your initiatives"
        description="Plan structural status at a glance. Live plan-health against delivery actuals arrives with the v1.1 living-plan release."
        primaryAction={
          <Link
            href="/initiatives/new"
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New initiative
          </Link>
        }
      />

      {initiatives.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <h2 className="text-lg font-semibold">No initiatives yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            Create one, answer the eight guided planning questions, and get a working
            prototype of a complete product plan — roadmap to sprint-ready stories.
          </p>
          <Link
            href="/initiatives/new"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Start your first plan
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {initiatives.map((initiative) => {
            const locks = initiative.prototype?.layerLocks ?? [];
            const lockedCount = locks.filter((l) => l.state === "locked").length;
            const status = STATUS_META[initiative.status] ?? STATUS_META.draft;
            const jira = initiative.syncConnections.find((c) => c.tool === "jira");
            const href =
              initiative.status === "generated"
                ? `/initiatives/${initiative.id}/dashboard`
                : `/initiatives/${initiative.id}/intake`;
            return (
              <li key={initiative.id}>
                <Link
                  href={href}
                  className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-semibold">{initiative.name}</h2>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  {initiative.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                      {initiative.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {initiative.prototype && (
                      <span>
                        <span className="font-medium text-neutral-700">
                          {lockedCount}/{LAYER_SEQUENCE.length}
                        </span>{" "}
                        waterfall layers locked
                      </span>
                    )}
                    {initiative.prototype?.approvedAt && (
                      <span className="text-emerald-700">Baseline approved</span>
                    )}
                    {jira?.status === "connected" && (
                      <span className="text-indigo-600">
                        Jira {jira.lastSyncedAt ? "synced" : "connected"} (demo)
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
