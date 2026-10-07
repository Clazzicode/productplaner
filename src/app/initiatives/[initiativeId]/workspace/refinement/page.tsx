import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { loadWorkspace } from "@/lib/workspace";
import { storyReadiness } from "@/lib/stories/service";
import StorySuggestionButton from "@/components/workspace/StorySuggestionButton";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
export const dynamic = "force-dynamic";

export default async function RefinementPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params; const user = await requireCurrentUser(); establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId); if (!ws) notFound();
  const stories = await db.artifactLayer.findMany({ where: { prototypeId: ws.prototype.id, type: "story", readinessStatus: { not: "split" } }, orderBy: [{ readinessStatus: "asc" }, { order: "asc" }], include: { children: { where: { type: "acceptance_criterion" }, orderBy: { order: "asc" } }, parent: { include: { parent: { select: { id: true, title: true } } } } } });
  const reviewed = stories.map(story => {
    const result = storyReadiness({ title: story.title, body: story.body, points: story.points, readinessStatus: story.readinessStatus, criteria: story.children });
    const explanations = [...result.gaps];
    if (story.readinessStatus === "needs_refinement" && result.ready) explanations.push("Content checks pass; the Product Owner still needs to confirm refinement readiness.");
    if (story.readinessStatus === "blocked") explanations.push("This story is marked blocked and needs a recorded blocker resolved.");
    return { story, result, explanations };
  });
  const groups = [
    { key: "ready", label: "Ready for refinement", items: reviewed.filter(x => x.result.ready && ["ready_for_refinement", "sprint_ready"].includes(x.story.readinessStatus)) },
    { key: "attention", label: "Needs clarification", items: reviewed.filter(x => x.story.readinessStatus !== "blocked" && (!x.result.ready || x.story.readinessStatus === "needs_refinement")) },
    { key: "blocked", label: "Blocked", items: reviewed.filter(x => x.story.readinessStatus === "blocked") },
  ];
  const features = [...new Map(stories.map(story => story.parent?.parent).filter(Boolean).map(feature => [feature!.id, feature!])).values()];
  return <div><h2 className="text-xl font-bold">Refinement preparation</h2><p className="mt-1 text-sm text-neutral-500">Review the agenda, resolve readiness gaps, and approve or dismiss AI findings before meeting with engineering.</p>
    <section className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5"><h3 className="font-semibold">Refinement agenda</h3><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm"><li>Review {groups[1].items.length} stories needing clarification.</li><li>Resolve {groups[2].items.length} blocked stories.</li><li>Confirm acceptance criteria for {reviewed.filter(x => x.story.children.some(ac => !ac.approvedAt)).length} stories.</li><li>Confirm estimates and move ready stories toward sprint planning.</li></ol></section>
    <div className="mt-6 grid gap-5 xl:grid-cols-3">{groups.map(group => <section key={group.key} className="rounded-xl bg-slate-100 p-4"><h3 className="font-bold">{group.label} <span className="text-sm font-normal text-slate-500">({group.items.length})</span></h3><div className="mt-3 space-y-3">{group.items.map(({story,explanations}) => <article key={story.id} className="rounded-lg border bg-white p-3"><Link href={`/initiatives/${initiativeId}/workspace/stories/${story.id}`} className="font-semibold text-indigo-700">{story.title}</Link><p className="mt-1 text-xs text-slate-500">Feature: {story.parent?.parent?.title}</p>{explanations.length > 0 ? <ul className="mt-2 list-disc pl-4 text-xs text-amber-800">{explanations.map(explanation => <li key={explanation}>{explanation}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-700">Content checks pass and the Product Owner marked this story ready.</p>}</article>)}</div></section>)}</div>
    <section className="mt-8"><h3 className="font-semibold">AI refinement review</h3><p className="text-sm text-neutral-500">Run a review for a feature, then approve, edit, or dismiss the findings below.</p><div className="mt-3 flex flex-wrap gap-2">{features.map(feature => <StorySuggestionButton key={feature.id} initiativeId={initiativeId} featureId={feature.id} featureTitle={feature.title} />)}</div><div className="mt-5"><AiAssistPanel initiativeId={initiativeId} scope="features" /></div></section>
  </div>;
}
