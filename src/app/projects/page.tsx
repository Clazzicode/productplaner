import Link from "next/link";
import { redirect } from "next/navigation";
import CoachMark from "@/components/coachmarks/CoachMark";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import StatusBadge from "@/components/roadmapStatus/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { getResolvedStatuses } from "@/lib/roadmapStatus/service";

export const dynamic = "force-dynamic";

/**
 * Projects Home (directive §5/§37) — the landing surface for a returning
 * user's existing work: open an existing Project, resume recent work (the
 * lifecycle-aware /home dashboard, unchanged), or create a new Project.
 * Reuses /initiatives's card-list pattern rather than inventing a new one.
 */
export default async function ProjectsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");

  const projects = await db.project.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { initiatives: true } } },
  });
  const statuses = await getResolvedStatuses(user.organizationId, "project", projects.map((p) => p.id));

  return (
    <ContainedLayout>
      <PageHeader
        eyebrow="Guided Product Planning Platform"
        title="Projects"
        description="A Project holds the context shared across its initiatives. Open one to see its initiatives, or resume recent work from the dashboard."
        primaryAction={
          <Link
            href="/projects/new"
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + New project
          </Link>
        }
        secondaryActions={
          <Link
            href="/home"
            className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:border-neutral-400"
          >
            Resume recent work
          </Link>
        }
      />
      <CoachMark coachMarkKey="projects" className="mt-4" />

      {projects.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center">
          <h2 className="text-lg font-semibold">No projects yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            Create a Project to hold the shared context — budget, team, constraints — for one or
            more initiatives.
          </p>
          <Link
            href="/projects/new"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Create your first project
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="group block h-full rounded-xl border border-border-subtle bg-white p-5 shadow-[0_8px_28px_rgba(46,71,125,0.06)] transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
              >
                <div className="flex items-center justify-between gap-4">
                    <h2 className="font-semibold text-text-primary group-hover:text-accent">{project.name}</h2>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      entityType="project"
                      entityId={project.id}
                      status={statuses.get(project.id) ?? { color: null, source: null, reason: "", recommendation: null }}
                    />
                    <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                      {project._count.initiatives} {project._count.initiatives === 1 ? "initiative" : "initiatives"}
                    </span>
                  </div>
                </div>
                {project.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{project.description}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                  {project.budget != null && <span>Budget: ${project.budget.toLocaleString()}</span>}
                  {project.targetLaunchDate && (
                    <span>Target: {project.targetLaunchDate.toLocaleDateString()}</span>
                  )}
                  {project.lastOpenedAt && (
                    <span>Last opened: {project.lastOpenedAt.toLocaleDateString()}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContainedLayout>
  );
}
