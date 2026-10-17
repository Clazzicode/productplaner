import { notFound } from "next/navigation";
import SprintReviewBoard from "@/components/workspace/SprintReviewBoard";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { loadReviewDetails } from "@/lib/sprintReviews/service";
import { loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SprintReviewPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser(); establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const workspace = await loadWorkspace(initiativeId); if (!workspace) notFound();
  const [plans, rows, stakeholders, documents] = await Promise.all([
    db.sprintPlan.findMany({ where: { initiativeId, status: "committed" }, include: { sprint: { select: { id: true, sprintNumber: true, startDate: true, endDate: true } } }, orderBy: { sprint: { sprintNumber: "desc" } } }),
    db.sprintReview.findMany({ where: { initiativeId }, select: { id: true }, orderBy: { createdAt: "desc" } }),
    db.stakeholderContact.findMany({ where: { organizationId: workspace.initiative.organizationId, archivedAt: null }, select: { id: true, displayName: true, email: true }, orderBy: { displayName: "asc" } }),
    db.document.findMany({ where: { initiativeId }, select: { id: true, fileName: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const reviews = (await Promise.all(rows.map(row => loadReviewDetails(row.id)))).filter(Boolean);
  const serializable = JSON.parse(JSON.stringify(reviews));
  const canEdit = access.level === "edit" || access.level === "owner";
  const canFinalize = canEdit && (user.permissionRole === "owner" || user.permissionRole === "admin");
  return <div><h2 className="text-xl font-bold">Sprint review</h2><p className="mt-1 text-sm text-neutral-500">Build a presentation-ready review from committed sprint work and demo evidence, then preserve the approved record as an immutable snapshot.</p><div className="mt-6"><SprintReviewBoard initiativeId={initiativeId} sprints={plans.map(plan => ({ id: plan.sprint.id, label: `Sprint ${plan.sprint.sprintNumber}`, startDate: plan.sprint.startDate.toISOString(), endDate: plan.sprint.endDate.toISOString() }))} stakeholders={stakeholders} documents={documents} initialReviews={serializable} canEdit={canEdit} canFinalize={canFinalize} /></div></div>;
}
