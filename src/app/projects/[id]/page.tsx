import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProjectPageAccess } from "@/lib/access/projectAccess";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import Breadcrumb from "@/components/ui/Breadcrumb";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import DecisionsPanel from "@/components/projects/DecisionsPanel";
import RisksPanel from "@/components/projects/RisksPanel";
import StatusBadge from "@/components/roadmapStatus/StatusBadge";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { getResolvedStatus, getResolvedStatuses } from "@/lib/roadmapStatus/service";

export const dynamic = "force-dynamic";

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Prototype live", variant: "emerald" },
};

/**
 * Project Home (directive §7) — the working container for related
 * initiatives. Shows the shared context entered once and reused by every
 * initiative beneath it (directive §9), plus decisions and risks tracked at
 * the Project level. Documents/research sections are intentionally omitted —
 * those are Phase 4/7 foundations, not built yet; showing an always-empty
 * section for them would add nothing.
 */
export default async function ProjectHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireProjectPageAccess(user, id);

  const project = await db.project.findUnique({
    where: { id },
    include: {
      initiatives: { select: { id: true, name: true, description: true, status: true }, orderBy: { updatedAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" } },
      risks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const [projectStatus, initiativeStatuses] = await Promise.all([
    getResolvedStatus(user.organizationId, "project", project.id),
    getResolvedStatuses(user.organizationId, "initiative", project.initiatives.map((i) => i.id)),
  ]);

  return (
    <ContainedLayout className="max-w-4xl">
      <Breadcrumb items={[{ label: "Projects", href: "/projects" }, { label: project.name }]} />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <StatusBadge entityType="project" entityId={project.id} status={projectStatus} />
          </div>
          {project.description && <p className="mt-1 text-sm text-neutral-500">{project.description}</p>}
        </div>
        <Link
          href={`/projects/${project.id}/initiatives/new`}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          + New initiative
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Goal" value={project.goal || "—"} />
        <Stat label="Budget" value={project.budget != null ? `$${project.budget.toLocaleString()}` : "Not set"} />
        <Stat label="Avg. hourly rate" value={project.averageHourlyRate != null ? `$${project.averageHourlyRate}/hr` : "Not set"} />
        <Stat label="Target go-live" value={project.targetLaunchDate ? project.targetLaunchDate.toLocaleDateString() : "Not set"} />
      </div>
      {project.planningApproach && (
        <p className="mt-3 text-xs text-neutral-500">Planning approach: {project.planningApproach}</p>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Initiatives</h2>
        {project.initiatives.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
            <p className="text-sm text-neutral-500">No initiatives yet in this project.</p>
            <Link
              href={`/projects/${project.id}/initiatives/new`}
              className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Create the first one
            </Link>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {project.initiatives.map((initiative) => {
              const status = STATUS_META[initiative.status] ?? STATUS_META.draft;
              const href =
                initiative.status === "generated"
                  ? `/initiatives/${initiative.id}/dashboard`
                  : `/initiatives/${initiative.id}/intake`;
              return (
                <li key={initiative.id}>
                  <Link
                    href={href}
                    className="block rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-semibold">{initiative.name}</h3>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          entityType="initiative"
                          entityId={initiative.id}
                          status={initiativeStatuses.get(initiative.id) ?? { color: null, source: null, reason: "", recommendation: null }}
                        />
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                    </div>
                    {initiative.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-500">{initiative.description}</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <DecisionsPanel
          projectId={project.id}
          decisions={project.decisions.map((d) => ({
            id: d.id,
            title: d.title,
            description: d.description,
            decidedAt: d.decidedAt?.toISOString() ?? null,
          }))}
        />
        <RisksPanel
          projectId={project.id}
          risks={project.risks.map((r) => ({ id: r.id, description: r.description, severity: r.severity, status: r.status }))}
        />
      </div>
    </ContainedLayout>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-xs text-neutral-500">{props.label}</p>
      <p className="mt-0.5 text-sm font-semibold text-neutral-800">{props.value}</p>
    </div>
  );
}
