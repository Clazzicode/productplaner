import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Badge } from "@/components/ui/Badge";
import JiraSyncPanel from "@/components/workspace/JiraSyncPanel";
import NavTabs from "@/components/workspace/NavTabs";
import RefreshBar from "@/components/workspace/RefreshBar";
import RoadmapVersionPanel from "@/components/workspace/RoadmapVersionPanel";
import WorkspaceBreadcrumb from "@/components/workspace/WorkspaceBreadcrumb";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { hasRoadmapDrifted } from "@/lib/generation/fingerprint";
import { profileFor, resolveMethodology } from "@/lib/generation/methodology";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Covers every workspace sub-page (roadmap/features/epics/sprints/capacity/
 * executive/stories) with one View check, since they all render inside this
 * shared layout — the minimum coverage docs/V2-RESOURCE-ACCESS.md §12 calls
 * for without touching each page individually.
 */
async function WorkspaceLayout({
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
    redirect(`/initiatives/${initiativeId}/overview`);
  }
  const methodology = resolveMethodology(ws.initiative.methodology);
  const profile = profileFor(ws.initiative.methodology);
  const [manualReleaseCount, manualSprintCount, drifted] = await Promise.all([
    db.release.count({ where: { prototypeId: ws.prototype.id, origin: "manual" } }),
    db.sprint.count({ where: { prototypeId: ws.prototype.id, origin: "manual" } }),
    hasRoadmapDrifted(initiativeId),
  ]);

  return (
    <WideLayout>
      <header className="no-print">
        <WorkspaceBreadcrumb
          initiativeId={initiativeId}
          initiativeName={ws.initiative.name}
          methodology={ws.initiative.methodology}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dfe3f4] bg-white px-4 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-600"><strong className="max-w-64 truncate text-sm text-[#0d1b3e]">{ws.initiative.name}</strong><span>· {profile.label}</span><Link href={`/initiatives/${initiativeId}/intake`} className="font-semibold text-[#5145ed] hover:underline">Context</Link>{ws.prototype.approvedAt && <Badge variant="emerald">Baseline approved {new Date(ws.prototype.approvedAt).toLocaleDateString()}</Badge>}{drifted && <Badge variant="amber" title="Approved inputs changed since this roadmap was generated.">Inputs changed since generated</Badge>}</div>
          <div className="flex flex-wrap items-center gap-2"><RoadmapVersionPanel initiativeId={initiativeId} /><JiraSyncPanel initiativeId={initiativeId} status={ws.jira?.status ?? "not_connected"} lastSyncedAt={ws.jira?.lastSyncedAt?.toISOString() ?? null} /></div>
        </div>
        <div className="mt-4">
          <RefreshBar
            initiativeId={initiativeId}
            manualReleaseCount={manualReleaseCount}
            manualSprintCount={manualSprintCount}
          />
        </div>
        <div className="mt-4">
          <NavTabs initiativeId={initiativeId} methodology={methodology} />
        </div>
      </header>
      <main className="mt-4 min-w-0">
        {children}
      </main>
    </WideLayout>
  );
}

export default withAuthenticatedPage(WorkspaceLayout);
