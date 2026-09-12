import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import { Badge } from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import JiraSyncPanel from "@/components/workspace/JiraSyncPanel";
import NavTabs from "@/components/workspace/NavTabs";
import RefreshBar from "@/components/workspace/RefreshBar";
import WorkspaceBreadcrumb from "@/components/workspace/WorkspaceBreadcrumb";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { profileFor, resolveMethodology } from "@/lib/generation/methodology";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Covers every workspace sub-page (roadmap/features/epics/sprints/capacity/
 * executive/stories) with one View check, since they all render inside this
 * shared layout — the minimum coverage docs/V2-RESOURCE-ACCESS.md §12 calls
 * for without touching each page individually.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireInitiativeView(user, initiativeId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId } });
    if (!initiative) notFound();
    redirect(`/initiatives/${initiativeId}/intake`);
  }
  const methodology = resolveMethodology(ws.initiative.methodology);
  const profile = profileFor(ws.initiative.methodology);
  const [manualReleaseCount, manualSprintCount] = await Promise.all([
    db.release.count({ where: { prototypeId: ws.prototype.id, origin: "manual" } }),
    db.sprint.count({ where: { prototypeId: ws.prototype.id, origin: "manual" } }),
  ]);

  return (
    <ContainedLayout>
      <header className="no-print">
        <WorkspaceBreadcrumb
          initiativeId={initiativeId}
          initiativeName={ws.initiative.name}
          methodology={ws.initiative.methodology}
        />
        <div className="mt-2">
          <PageHeader
            title={ws.initiative.name}
            description={
              <>
                Working prototype · {profile.label} ·{" "}
                <Link
                  href={`/initiatives/${initiativeId}/intake`}
                  className="text-indigo-600 hover:underline"
                >
                  view intake answers
                </Link>
                {ws.prototype.approvedAt && (
                  <Badge variant="emerald" className="ml-2">
                    Baseline approved {new Date(ws.prototype.approvedAt).toLocaleDateString()}
                  </Badge>
                )}
              </>
            }
            primaryAction={
              <JiraSyncPanel
                initiativeId={initiativeId}
                status={ws.jira?.status ?? "not_connected"}
                lastSyncedAt={ws.jira?.lastSyncedAt?.toISOString() ?? null}
              />
            }
          />
        </div>
        <div className="mt-5">
          <RefreshBar
            initiativeId={initiativeId}
            manualReleaseCount={manualReleaseCount}
            manualSprintCount={manualSprintCount}
          />
        </div>
        <div className="mt-5">
          <NavTabs initiativeId={initiativeId} methodology={methodology} />
        </div>
      </header>
      <main className="rounded-b-2xl rounded-tr-2xl border border-t-0 border-neutral-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        {children}
      </main>
    </ContainedLayout>
  );
}
