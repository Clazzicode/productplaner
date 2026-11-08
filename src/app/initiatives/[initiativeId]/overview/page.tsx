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
    loadPlanningEvidence(initiativeId), hasCollaborationAction(initiativeId, user.id, "edit"),
  ]);
  const base = `/initiatives/${initiativeId}`;
  const lifecycle = [
    { label: "Context", href: `${base}/intake` }, { label: "Features", href: `${base}/workspace/features` },
    { label: "Stories", href: `${base}/backlog` }, { label: "Sprint plan", href: `${base}/workspace/sprint-preparation` },
    { label: "Review", href: `${base}/workspace/sprint-review` }, { label: "Release", href: `${base}/workspace/release-readiness` },
  ];
  return <DashboardLayout>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><Link href={`/projects/${initiative.project.id}`} className="text-xs font-bold uppercase tracking-widest text-[#5145ed]">{initiative.project.name} / Initiative</Link><h1 className="mt-1 text-3xl font-bold text-[#0d1b3e]">{initiative.name}</h1><p className="mt-2 text-sm text-slate-600">Planning stage: {planningLabel(evidence)} · Delivery: {commitmentLabel(evidence)}</p></div><Link href={`${base}/intake`} className="rounded-lg bg-[#5145ed] px-4 py-2.5 text-sm font-semibold text-white">Open context</Link></div>
    <nav aria-label="Initiative lifecycle" className="mt-6 flex gap-2 overflow-x-auto pb-2">{lifecycle.map((step, index) => <Link key={step.label} href={step.href} className="min-w-32 flex-1 shrink-0 rounded-xl border border-[#dfe3f4] bg-white px-3 py-3 text-sm font-semibold text-[#0d1b3e] hover:border-[#5145ed]"><span className="mr-2 text-xs text-[#5145ed]">0{index + 1}</span>{step.label}</Link>)}</nav>
    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"><div className="space-y-4"><section className="rounded-2xl border border-[#dfe3f4] bg-white p-5"><p className="text-xs font-bold uppercase tracking-wider text-[#5145ed]">Current focus</p><h2 className="mt-1 text-xl font-bold text-[#0d1b3e]">{evidence.missingContext.length ? "Develop the initiative context" : "Build and review your plan"}</h2><p className="mt-2 text-sm text-slate-600">{evidence.missingContext.length ? `Context to develop: ${evidence.missingContext.join(", ")}.` : "Problem, customer, and outcome are recorded. Continue with features, stories, and sprint readiness."}</p><p className="mt-3 text-sm text-slate-600">Planning evidence: {planningLabel(evidence)}. Delivery commitments: {commitmentLabel(evidence)}.</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`${base}/workspace/features`} className="rounded-lg border border-[#c9c4f7] px-3 py-2 text-sm font-semibold text-[#5145ed]">Linked features</Link><Link href={`${base}/workspace/sprint-preparation`} className="rounded-lg border border-[#c9c4f7] px-3 py-2 text-sm font-semibold text-[#5145ed]">Sprint readiness</Link></div></section><section className="rounded-2xl border border-[#dfe3f4] bg-white p-5"><h2 className="font-bold text-[#0d1b3e]">Priority decisions</h2><p className="mt-2 text-sm text-slate-600">Use the planning tools below to review evidence and decide what enters delivery. Suggestions do not commit work.</p><Link href={`${base}/workspace/roadmap`} className="mt-3 inline-block text-sm font-semibold text-[#5145ed]">Open roadmap →</Link></section></div><aside className="space-y-4"><section className="rounded-2xl border border-[#dfe3f4] bg-white p-5"><h2 className="font-bold text-[#0d1b3e]">Goal and target</h2><p className="mt-2 text-sm text-slate-600">{initiative.project.goal || "No project goal recorded yet."}</p><p className="mt-3 text-xs text-slate-500">Target: {initiative.project.targetLaunchDate?.toLocaleDateString() ?? "Not set"}</p></section><section className="rounded-2xl border border-[#dfe3f4] bg-white p-5"><h2 className="font-bold text-[#0d1b3e]">Evidence and team</h2><p className="mt-2 text-sm text-slate-600">{evidence.featureCount} features · {evidence.storyCount} stories · {evidence.criteriaCount} criteria</p><p className="mt-2 text-xs text-slate-500">Generation readiness: {evidence.generationReady ? "Ready for optional proposal" : "More evidence needed"}. Manual planning remains available.</p></section></aside></div>
    {!initiative.prototype && canEdit && <div className="mt-5"><StartDraftWorkspace initiativeId={initiativeId} /></div>}
    <section className="mt-8"><PoWorkflowGuide initiativeId={initiativeId} initiativeName={initiative.name} /></section>
  </DashboardLayout>;
}
export default withAuthenticatedPage(OverviewPage);
