import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import CoachMark from "@/components/coachmarks/CoachMark";
import { DashboardLayout } from "@/components/layout/PageLayouts";
import ProjectsPortfolio from "@/components/projects/ProjectsPortfolio";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { getResolvedStatuses } from "@/lib/roadmapStatus/service";
import { formatCalendarDate } from "@/lib/calendarDate";

export const dynamic = "force-dynamic";

async function ProjectsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const canCreateProject = user.memberType === "internal" && ["owner", "admin"].includes(user.permissionRole);
  const projects = await db.project.findMany({ where: { organizationId: user.organizationId }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { initiatives: true } }, initiatives: { select: { id: true, name: true }, take: 8, orderBy: { updatedAt: "desc" } } } });
  const statuses = await getResolvedStatuses(user.organizationId, "project", projects.map(p => p.id));
  const rows = projects.map(project => ({ id: project.id, name: project.name, description: project.description, goal: project.goal, initiativeCount: project._count.initiatives, initiatives: project.initiatives, target: project.targetLaunchDate ? formatCalendarDate(project.targetLaunchDate) : null, updated: project.updatedAt.toLocaleDateString(), health: statuses.get(project.id)?.color ?? null, healthReason: statuses.get(project.id)?.reason ?? "" }));
  return <DashboardLayout><ProjectsPortfolio projects={rows} canCreateProject={canCreateProject} /><CoachMark coachMarkKey="projects" className="mt-4" /></DashboardLayout>;
}

export default withAuthenticatedPage(ProjectsPage);
