import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { loadWorkspace } from "@/lib/workspace";
import { storyReadiness } from "@/lib/stories/service";
import StorySuggestionButton from "@/components/workspace/StorySuggestionButton";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import RefinementFindingBoard from "@/components/workspace/RefinementFindingBoard";
import RefinementPreparationControls from "@/components/workspace/RefinementPreparationControls";
import RefinementSessionBoard from "@/components/workspace/RefinementSessionBoard";
import DependencyBlockerBoard from "@/components/workspace/DependencyBlockerBoard";
export const dynamic = "force-dynamic";

export default async function RefinementPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params; const user = await requireCurrentUser(); establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId); if (!ws) notFound();
  const [stories, findings, memberships, bugs, sessions, dependencies, blockers, sprints, releases] = await Promise.all([
    db.artifactLayer.findMany({ where: { prototypeId: ws.prototype.id, type: "story", readinessStatus: { not: "split" }, archivedAt: null }, orderBy: [{ readinessStatus: "asc" }, { order: "asc" }], include: { children: { where: { type: "acceptance_criterion", archivedAt: null }, orderBy: { order: "asc" } }, parent: { include: { parent: { select: { id: true, title: true } } } } } }),
    db.refinementFinding.findMany({ where: { initiativeId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], include: { story: { select: { id: true, title: true } } } }),
    db.organizationMember.findMany({ where: { organizationId: ws.initiative.organizationId, status: "active" }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    db.bugPlanningRecord.findMany({ where: { initiativeId, archivedAt: null }, include: { request: { select: { data: true } } }, orderBy: { updatedAt: "desc" } }),
    db.refinementSession.findMany({ where: { initiativeId }, orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }], include: { facilitator: { select: { name: true } }, items: { include: { story: { select: { title: true } }, bug: { select: { severity: true, request: { select: { data: true } } } } }, orderBy: { order: "asc" } }, questions: true, decisions: true, actions: true } }),
    db.workDependency.findMany({ where: { initiativeId }, orderBy: { createdAt: "desc" } }),
    db.planningBlocker.findMany({ where: { initiativeId }, include: { owner: { select: { name: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    db.sprint.findMany({ where: { prototypeId: ws.prototype.id }, select: { id: true, sprintNumber: true } }),
    db.release.findMany({ where: { prototypeId: ws.prototype.id }, select: { id: true, name: true } }),
  ]);
  const openFindingCountByStory = new Map<string, number>();
  for (const finding of findings.filter(finding => finding.status === "open")) {
    openFindingCountByStory.set(finding.storyId, (openFindingCountByStory.get(finding.storyId) ?? 0) + 1);
  }
  const reviewed = stories.map(story => {
    const result = storyReadiness({ title: story.title, body: story.body, points: story.points, readinessStatus: story.readinessStatus, criteria: story.children });
    const explanations = [...result.gaps];
    const openFindingCount = openFindingCountByStory.get(story.id) ?? 0;
    if (openFindingCount > 0) explanations.push(`Resolve or dismiss ${openFindingCount} open refinement finding${openFindingCount === 1 ? "" : "s"}.`);
    if (story.readinessStatus === "needs_refinement" && result.ready) explanations.push("Content checks pass; the Product Owner still needs to confirm refinement readiness.");
    if (story.readinessStatus === "blocked") explanations.push("This story is marked blocked and needs a recorded blocker resolved.");
    return { story, result, explanations, readyForRefinement: result.ready && openFindingCount === 0 };
  });
  const groups = [
    { key: "ready", label: "Ready for refinement", items: reviewed.filter(x => x.readyForRefinement && ["ready_for_refinement", "sprint_ready"].includes(x.story.readinessStatus)) },
    { key: "attention", label: "Needs clarification", items: reviewed.filter(x => x.story.readinessStatus !== "blocked" && (!x.readyForRefinement || x.story.readinessStatus === "needs_refinement")) },
    { key: "blocked", label: "Blocked", items: reviewed.filter(x => x.story.readinessStatus === "blocked") },
  ];
  const features = [...new Map(stories.map(story => story.parent?.parent).filter(Boolean).map(feature => [feature!.id, feature!])).values()];
  const bugTitle = (data: unknown) => typeof data === "object" && data && !Array.isArray(data) && "title" in data ? String(data.title) : "Bug";
  const workOptions = [
    ...features.map(feature => ({ key: `feature:${feature.id}`, type: "feature" as const, id: feature.id, label: `Feature: ${feature.title}` })),
    ...stories.map(story => ({ key: `story:${story.id}`, type: "story" as const, id: story.id, label: `Story: ${story.title}` })),
    ...bugs.map(bug => ({ key: `bug:${bug.id}`, type: "bug" as const, id: bug.id, label: `Bug: ${bugTitle(bug.request.data)}` })),
    ...sprints.map(sprint => ({ key: `sprint:${sprint.id}`, type: "sprint" as const, id: sprint.id, label: `Sprint ${sprint.sprintNumber}` })),
    ...releases.map(release => ({ key: `release:${release.id}`, type: "release" as const, id: release.id, label: `Release: ${release.name}` })),
  ];
  const labels = new Map(workOptions.map(option => [option.key, option.label]));
  const dependencyEndpoint = (row: typeof dependencies[number], prefix: "predecessor" | "dependent") => {
    const candidates = [["feature", row[`${prefix}CapabilityId`]], ["story", row[`${prefix}StoryId`]], ["bug", row[`${prefix}BugId`]], ["sprint", row[`${prefix}SprintId`]], ["release", row[`${prefix}ReleaseId`]]] as const;
    const found = candidates.find(([, id]) => id); return found ? labels.get(`${found[0]}:${found[1]}`) ?? found[0] : "Unknown item";
  };
  const blockerTarget = (row: typeof blockers[number]) => labels.get(row.capabilityId ? `feature:${row.capabilityId}` : row.storyId ? `story:${row.storyId}` : row.bugId ? `bug:${row.bugId}` : row.sprintId ? `sprint:${row.sprintId}` : `release:${row.releaseId}`) ?? "Planning item";
  return <div><h2 className="text-xl font-bold">Refinement preparation</h2><p className="mt-1 text-sm text-neutral-500">Review the agenda, resolve readiness gaps, and approve or dismiss AI findings before meeting with engineering.</p>
    <section className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/40 p-5"><h3 className="font-semibold">Refinement agenda</h3><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm"><li>Review {groups[1].items.length} stories needing clarification.</li><li>Resolve {groups[2].items.length} blocked stories.</li><li>Confirm acceptance criteria for {reviewed.filter(x => x.story.children.some(ac => !ac.approvedAt)).length} stories.</li><li>Confirm estimates and move ready stories toward sprint planning.</li></ol></section>
    <div className="mt-6 grid gap-5 xl:grid-cols-3">{groups.map(group => <section key={group.key} className="rounded-xl bg-slate-100 p-4"><h3 className="font-bold">{group.label} <span className="text-sm font-normal text-slate-500">({group.items.length})</span></h3><div className="mt-3 space-y-3">{group.items.map(({story,explanations}) => <article key={story.id} className="rounded-lg border bg-white p-3"><Link href={`/initiatives/${initiativeId}/workspace/stories/${story.id}`} className="font-semibold text-indigo-700">{story.title}</Link><p className="mt-1 text-xs text-slate-500">Feature: {story.parent?.parent?.title}</p>{explanations.length > 0 ? <ul className="mt-2 list-disc pl-4 text-xs text-amber-800">{explanations.map(explanation => <li key={explanation}>{explanation}</li>)}</ul> : <p className="mt-2 text-xs text-emerald-700">Content checks pass and the Product Owner marked this story ready.</p>}</article>)}</div></section>)}</div>
    <section className="mt-8"><h3 className="font-semibold">Tracked refinement findings</h3><p className="mb-3 text-sm text-neutral-500">Assign each approved finding, record the follow-up, and resolve or dismiss it without changing the underlying story.</p><RefinementPreparationControls initiativeId={initiativeId} stories={stories.map(story => ({ id: story.id, title: story.title }))} members={memberships.map(membership => membership.user)} /><RefinementFindingBoard findings={findings} members={memberships.map(membership => membership.user)} /></section>
    <RefinementSessionBoard initiativeId={initiativeId} stories={stories.map(story => ({ id: story.id, title: story.title }))} bugs={bugs.map(bug => ({ id: bug.id, title: typeof bug.request.data === "object" && bug.request.data && !Array.isArray(bug.request.data) && "title" in bug.request.data ? String(bug.request.data.title) : "Bug" }))} members={memberships.map(membership => membership.user)} sessions={sessions} />
    <DependencyBlockerBoard initiativeId={initiativeId} options={workOptions} dependencies={dependencies.map(row => ({ id: row.id, predecessorLabel: dependencyEndpoint(row, "predecessor"), dependentLabel: dependencyEndpoint(row, "dependent"), dependencyType: row.dependencyType, description: row.description }))} blockers={blockers.map(row => ({ id: row.id, blockerType: row.blockerType, description: row.description, status: row.status, revision: row.revision, owner: row.owner, targetLabel: blockerTarget(row) }))} />
    <section className="mt-8"><h3 className="font-semibold">AI refinement review</h3><p className="text-sm text-neutral-500">Run a review for a feature, then approve, edit, or dismiss the findings below.</p><div className="mt-3 flex flex-wrap gap-2">{features.map(feature => <StorySuggestionButton key={feature.id} initiativeId={initiativeId} featureId={feature.id} featureTitle={feature.title} />)}</div><div className="mt-5"><AiAssistPanel initiativeId={initiativeId} scope="features" /></div></section>
  </div>;
}
