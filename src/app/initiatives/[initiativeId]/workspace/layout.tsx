import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import JiraSyncPanel from "@/components/workspace/JiraSyncPanel";
import NavTabs from "@/components/workspace/NavTabs";
import RefreshBar from "@/components/workspace/RefreshBar";
import RoadmapVersionPanel from "@/components/workspace/RoadmapVersionPanel";
import RoadmapWorkspaceFrame from "@/components/workspace/RoadmapWorkspaceFrame";
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

  const roadmapTools = <div className="space-y-4">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-[#7164d8]">Planning context</p>
      <p className="mt-1 text-sm font-semibold text-[#121b34]">{ws.initiative.name} <span className="font-normal text-[#65718b]">· {profile.label}</span></p>
      <Link href={`/initiatives/${initiativeId}/intake`} className="mt-1 inline-block text-xs font-semibold text-[#5145ed]">Open initiative context →</Link>
      {ws.prototype.approvedAt && <div className="mt-2"><Badge variant="emerald">Baseline approved {new Date(ws.prototype.approvedAt).toLocaleDateString()}</Badge></div>}
      {drifted && <div className="mt-2"><Badge variant="amber" title="Approved inputs changed since this roadmap was generated.">Inputs changed since generated</Badge></div>}
    </div>
    <div className="border-t border-[#e5e7f2] pt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#7164d8]">Versions and refresh</p><div className="flex flex-wrap gap-2"><RoadmapVersionPanel initiativeId={initiativeId} /><RefreshBar initiativeId={initiativeId} manualReleaseCount={manualReleaseCount} manualSprintCount={manualSprintCount} /></div></div>
    <div className="border-t border-[#e5e7f2] pt-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#7164d8]">Integration</p><JiraSyncPanel initiativeId={initiativeId} status={ws.jira?.status ?? "not_connected"} lastSyncedAt={ws.jira?.lastSyncedAt?.toISOString() ?? null} /></div>
    <div className="border-t border-[#e5e7f2] pt-3"><p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#7164d8]">Related work</p><NavTabs initiativeId={initiativeId} methodology={methodology} /></div>
  </div>;

  return (
    <RoadmapWorkspaceFrame roadmapTools={roadmapTools} header={<header className="no-print">
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
      </header>}>
      {children}
    </RoadmapWorkspaceFrame>
  );
}

export default withAuthenticatedPage(WorkspaceLayout);
