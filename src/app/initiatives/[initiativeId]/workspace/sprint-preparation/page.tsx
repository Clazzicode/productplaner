import { notFound } from "next/navigation";
import SprintPreparationBoard from "@/components/workspace/SprintPreparationBoard";
import { requireInitiativeView } from "@/lib/access/guards";
import { meetsMinimum } from "@/lib/access/resolution";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { evaluateSprintReadiness } from "@/lib/sprintPreparation/service";
import { depthFromExperience } from "@/lib/questionnaire/roleGuidance";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SprintPreparationPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params; const user = await requireCurrentUser(); establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const canEdit = meetsMinimum(access.level, "edit");
  const workspace = await loadWorkspace(initiativeId); if (!workspace) notFound();
  const [stories, bugs, assessments, sprints] = await Promise.all([
    db.artifactLayer.findMany({ where: { prototypeId: workspace.prototype.id, type: "story", archivedAt: null, readinessStatus: { not: "split" } }, orderBy: { order: "asc" }, select: { id: true, title: true, points: true } }),
    db.bugPlanningRecord.findMany({ where: { initiativeId, archivedAt: null }, orderBy: { updatedAt: "desc" }, include: { request: { select: { data: true } } } }),
    db.sprintReadinessAssessment.findMany({ where: { initiativeId, invalidatedAt: null }, orderBy: { createdAt: "desc" } }),
    db.sprint.findMany({ where: { prototypeId: workspace.prototype.id }, orderBy: { sprintNumber: "asc" }, include: { sprintPlan: { include: { items: true } } } }),
  ]);
  const rawItems = [...stories.map((story) => ({ key: `story:${story.id}`, type: "story" as const, id: story.id, title: story.title, estimatePoints: story.points ?? 0 })), ...bugs.map((bug) => ({ key: `bug:${bug.id}`, type: "bug" as const, id: bug.id, title: typeof bug.request.data === "object" && bug.request.data && !Array.isArray(bug.request.data) && "title" in bug.request.data ? String(bug.request.data.title) : "Bug", estimatePoints: 0 }))];
  const evaluated = await Promise.all(rawItems.map(async (item) => {
    const evaluation = await evaluateSprintReadiness(initiativeId, { type: item.type, id: item.id });
    const latest = assessments.find((assessment) => (item.type === "story" ? assessment.storyId === item.id : assessment.bugId === item.id) && assessment.inputFingerprint === evaluation.inputFingerprint);
    return { ...item, ...evaluation, latestDecision: latest?.decision ?? null, latestReason: latest?.reason ?? null };
  }));
  return <div><h2 className="text-xl font-bold">Guided sprint planning</h2><p className="mt-1 text-sm text-neutral-500">Review readiness evidence, fill gaps, build an editable sprint draft, then explicitly commit it. Suggestions never commit work for you.</p><div className="mt-6"><SprintPreparationBoard initiativeId={initiativeId} items={evaluated} sprints={sprints.map((sprint) => ({ id: sprint.id, label: `Sprint ${sprint.sprintNumber}`, capacityPoints: sprint.capacityPoints, plan: sprint.sprintPlan ? { revision: sprint.sprintPlan.revision, status: sprint.sprintPlan.status, goal: sprint.sprintPlan.goal, items: sprint.sprintPlan.items.map((item) => ({ storyId: item.storyId, bugId: item.bugId, estimatePoints: item.estimatePoints })) } : null }))} canEdit={canEdit} canApprove={canEdit && (user.permissionRole === "owner" || user.permissionRole === "admin")} verbose={depthFromExperience(user.profiles[0]?.experienceLevel)} /></div></div>;
}
