import { notFound } from "next/navigation";
import SprintPreparationBoard from "@/components/workspace/SprintPreparationBoard";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { evaluateSprintReadiness } from "@/lib/sprintPreparation/service";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SprintPreparationPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params; const user = await requireCurrentUser(); establishAuthContext(user.authUserId);
  const workspace = await loadWorkspace(initiativeId); if (!workspace) notFound();
  const [stories, bugs, assessments, sprints] = await Promise.all([
    db.artifactLayer.findMany({ where: { prototypeId: workspace.prototype.id, type: "story", archivedAt: null, readinessStatus: { not: "split" } }, orderBy: { order: "asc" }, select: { id: true, title: true, points: true } }),
    db.bugPlanningRecord.findMany({ where: { initiativeId, archivedAt: null }, orderBy: { updatedAt: "desc" }, include: { request: { select: { data: true } } } }),
    db.sprintReadinessAssessment.findMany({ where: { initiativeId, invalidatedAt: null }, orderBy: { createdAt: "desc" } }),
    db.sprint.findMany({ where: { prototypeId: workspace.prototype.id }, orderBy: { sprintNumber: "asc" }, include: { sprintPlan: { include: { items: true } } } }),
  ]);
  const rawItems = [...stories.map((story) => ({ key: `story:${story.id}`, type: "story" as const, id: story.id, title: story.title, estimatePoints: story.points ?? 1 })), ...bugs.map((bug) => ({ key: `bug:${bug.id}`, type: "bug" as const, id: bug.id, title: typeof bug.request.data === "object" && bug.request.data && !Array.isArray(bug.request.data) && "title" in bug.request.data ? String(bug.request.data.title) : "Bug", estimatePoints: 1 }))];
  const evaluated = await Promise.all(rawItems.map(async (item) => {
    const evaluation = await evaluateSprintReadiness(initiativeId, { type: item.type, id: item.id });
    const latest = assessments.find((assessment) => (item.type === "story" ? assessment.storyId === item.id : assessment.bugId === item.id) && assessment.inputFingerprint === evaluation.inputFingerprint);
    return { ...item, ...evaluation, latestDecision: latest?.decision ?? null };
  }));
  return <div><h2 className="text-xl font-bold">Sprint preparation</h2><p className="mt-1 text-sm text-neutral-500">Feature 12 readiness evidence and Feature 13 sprint commitment are connected here, while remaining separate Product Owner decisions.</p><div className="mt-6"><SprintPreparationBoard initiativeId={initiativeId} items={evaluated} sprints={sprints.map((sprint) => ({ id: sprint.id, label: `Sprint ${sprint.sprintNumber}`, capacityPoints: sprint.capacityPoints, plan: sprint.sprintPlan ? { revision: sprint.sprintPlan.revision, status: sprint.sprintPlan.status, goal: sprint.sprintPlan.goal, items: sprint.sprintPlan.items.map((item) => ({ storyId: item.storyId, bugId: item.bugId, estimatePoints: item.estimatePoints })) } : null }))} canApprove={user.permissionRole === "owner" || user.permissionRole === "admin"} /></div></div>;
}
