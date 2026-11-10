import Link from "next/link";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db } from "@/lib/db";
import { hasCollaborationAction } from "@/lib/access/actionGuard";
import { loadPlanningEvidence, planningLabel, commitmentLabel } from "@/lib/planning/readiness";
import StartDraftWorkspace from "@/components/workspace/StartDraftWorkspace";
import { DashboardLayout } from "@/components/layout/PageLayouts";
import PoWorkflowGuide from "@/components/planning/PoWorkflowGuide";

async function OverviewPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  await requireInitiativeView(user, initiativeId);
  const [initiative, evidence, canEdit] = await Promise.all([
    db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, include: { prototype: { select: { id: true } }, project: { select: { id: true, name: true, goal: true, targetLaunchDate: true } } } }),
    loadPlanningEvidence(initiativeId),
    hasCollaborationAction(initiativeId, user.id, "edit"),
  ]);

  return <DashboardLayout>
    <div className="mx-auto max-w-[1220px]">
      <Link href={`/projects/${initiative.project.id}`} className="text-xs font-bold uppercase tracking-widest text-[#5145ed] hover:underline">{initiative.project.name} / Initiative</Link>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="break-words text-xl font-bold text-[#0d1b3e]">{initiative.name}</h1>
        <p className="text-xs text-slate-600">Planning: {planningLabel(evidence)} · Delivery: {commitmentLabel(evidence)}</p>
      </div>
    </div>

    <div className="mt-7"><PoWorkflowGuide initiativeId={initiativeId} hasWorkspace={!!initiative.prototype} /></div>

    {!initiative.prototype && canEdit && <div className="mx-auto mt-8 max-w-[1220px]"><StartDraftWorkspace initiativeId={initiativeId} /></div>}

    <details className="mx-auto mt-8 max-w-[1220px] rounded-2xl border border-[#dfe3f4] bg-white p-5 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold text-[#0d1b3e]">Planning context for {initiative.name}</summary>
      <div className="mt-4 grid gap-4 border-t border-[#e6e9f4] pt-4 sm:grid-cols-2">
        <div><h2 className="font-semibold">Goal and target</h2><p className="mt-1">{initiative.project.goal || "No project goal recorded yet."}</p><p className="mt-2 text-xs text-slate-500">Target: {initiative.project.targetLaunchDate?.toLocaleDateString() ?? "Not set"}</p></div>
        <div><h2 className="font-semibold">Planning evidence</h2><p className="mt-1">{evidence.featureCount} features · {evidence.storyCount} stories · {evidence.criteriaCount} criteria</p><p className="mt-2 text-xs text-slate-500">Generation readiness: {evidence.generationReady ? "Ready for optional proposal" : "More evidence needed"}. Manual planning remains available.</p></div>
      </div>
    </details>
  </DashboardLayout>;
}

export default withAuthenticatedPage(OverviewPage);
