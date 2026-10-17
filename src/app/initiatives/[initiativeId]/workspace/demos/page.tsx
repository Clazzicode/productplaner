import { notFound } from "next/navigation";
import DemoManagementBoard from "@/components/workspace/DemoManagementBoard";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { demoInclude } from "@/lib/demos/service";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function DemoManagementPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const workspace = await loadWorkspace(initiativeId);
  if (!workspace) notFound();

  const [plans, demos, stakeholders, blockers, clarifications] = await Promise.all([
    db.sprintPlan.findMany({
      where: { initiativeId, status: "committed" },
      orderBy: { sprint: { sprintNumber: "asc" } },
      include: {
        sprint: { select: { id: true, sprintNumber: true } },
        items: {
          orderBy: { order: "asc" },
          include: {
            story: { select: { id: true, title: true, sourceCapabilityId: true } },
            bug: { include: { request: { select: { data: true } } } },
          },
        },
      },
    }),
    db.demoItem.findMany({ where: { initiativeId }, include: demoInclude, orderBy: [{ sprint: { sprintNumber: "desc" } }, { plannedOrder: "asc" }, { createdAt: "asc" }] }),
    db.stakeholderContact.findMany({ where: { organizationId: workspace.initiative.organizationId, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    db.planningBlocker.findMany({ where: { initiativeId, status: { in: ["open", "in_progress"] } }, select: { sprintId: true, storyId: true, bugId: true } }),
    db.inSprintClarification.findMany({ where: { initiativeId, status: { in: ["open", "answered"] } }, select: { storyId: true, bugId: true } }),
  ]);

  const bugTitle = (data: unknown) => typeof data === "object" && data && !Array.isArray(data) && "title" in data ? String(data.title) : "Bug";
  const workItems: { key: string; type: "story" | "bug"; id: string; title: string; capabilityId: string | null; sprintId: string; sprintLabel: string }[] = [];
  for (const plan of plans) for (const item of plan.items) {
    if (item.story) workItems.push({ key: `story:${item.story.id}:${plan.sprint.id}`, type: "story", id: item.story.id, title: item.story.title, capabilityId: item.story.sourceCapabilityId, sprintId: plan.sprint.id, sprintLabel: `Sprint ${plan.sprint.sprintNumber}` });
    if (item.bug) workItems.push({ key: `bug:${item.bug.id}:${plan.sprint.id}`, type: "bug", id: item.bug.id, title: bugTitle(item.bug.request.data), capabilityId: item.bug.affectedCapabilityId, sprintId: plan.sprint.id, sprintLabel: `Sprint ${plan.sprint.sprintNumber}` });
  }
  const serializedDemos = demos.map(demo => ({
    ...demo,
    createdAt: demo.createdAt.toISOString(), updatedAt: demo.updatedAt.toISOString(), decidedAt: demo.decidedAt?.toISOString() ?? null,
    revisions: demo.revisions.map(revision => ({ ...revision, createdAt: revision.createdAt.toISOString(), previousData: undefined, nextData: undefined })),
    aiSuggestions: demo.aiSuggestions.map(suggestion => ({ ...suggestion, kind: suggestion.kind as "purpose" | "completed_work", createdAt: suggestion.createdAt.toISOString(), actedAt: suggestion.actedAt?.toISOString() ?? null })),
    blockerCount: blockers.filter(blocker => blocker.sprintId === demo.sprintId || (demo.storyId ? blocker.storyId === demo.storyId : blocker.bugId === demo.bugId)).length,
    clarificationCount: clarifications.filter(item => demo.storyId ? item.storyId === demo.storyId : item.bugId === demo.bugId).length,
  }));
  const canEdit = access.level === "edit" || access.level === "owner";
  const canDecide = canEdit && (user.permissionRole === "owner" || user.permissionRole === "admin");

  return <div><h2 className="text-xl font-bold">Demo management</h2><p className="mt-1 text-sm text-neutral-500">Prepare a sprint review agenda, make readiness decisions, retain presenter and outcome history, and carry unfinished demonstrations into committed future sprints.</p><div className="mt-6"><DemoManagementBoard initiativeId={initiativeId} workItems={workItems} sprints={plans.map(plan => ({ id: plan.sprint.id, label: `Sprint ${plan.sprint.sprintNumber}` }))} stakeholders={stakeholders} demos={serializedDemos} canEdit={canEdit} canDecide={canDecide} /></div></div>;
}
