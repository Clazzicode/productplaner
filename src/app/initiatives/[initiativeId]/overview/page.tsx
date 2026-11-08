import Link from "next/link";
import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db } from "@/lib/db";
import { hasCollaborationAction } from "@/lib/access/actionGuard";
import { loadPlanningEvidence, planningLabel, commitmentLabel } from "@/lib/planning/readiness";
import StartDraftWorkspace from "@/components/workspace/StartDraftWorkspace";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import PoWorkflowGuide from "@/components/planning/PoWorkflowGuide";

async function OverviewPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  await requireInitiativeView(user, initiativeId);
  const [initiative, evidence, canEdit] = await Promise.all([
    db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, include: { prototype: { select: { id: true } } } }),
    loadPlanningEvidence(initiativeId), hasCollaborationAction(initiativeId, user.id, "edit"),
  ]);
  return <ContainedLayout><PoWorkflowGuide initiativeId={initiativeId} initiativeName={initiative.name} />
    <p className="mt-3">Planning evidence: {planningLabel(evidence)}</p><p>Delivery commitments: {commitmentLabel(evidence)}</p>
    <p className="mt-2">{evidence.missingContext.length ? `Context to develop: ${evidence.missingContext.join(", ")}.` : "Problem, customer and outcome are recorded."}</p>
    <p>Generation readiness: {evidence.generationReady ? "ready for an optional proposal" : "more evidence needed"}. You can plan manually without generation or AI.</p>
    <nav aria-label="Initiative planning" className="mt-5 flex flex-wrap gap-4"><Link href="/home" className="underline">Home</Link><Link href="/initiatives" className="underline">All initiatives</Link>
      <Link href={`/initiatives/${initiativeId}/intake`} className="underline">Edit context</Link>
      {initiative.prototype && <><Link href={`/initiatives/${initiativeId}/backlog`} className="underline">Features and backlog</Link><Link href={`/initiatives/${initiativeId}/dashboard`} className="underline">Dashboard</Link></>}
    </nav>
    {!initiative.prototype && canEdit && <div className="mt-5"><StartDraftWorkspace initiativeId={initiativeId} /></div>}
  </ContainedLayout>;
}
export default withAuthenticatedPage(OverviewPage);
