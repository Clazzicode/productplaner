import { format } from "date-fns";
import { notFound } from "next/navigation";
import ExplainCallout from "@/components/demo/ExplainCallout";
import SprintMoveSelect from "@/components/workspace/SprintMoveSelect";
import { db } from "@/lib/db";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SprintsPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();
  const cost = await loadCostContext(initiativeId, ws.prototype.id);

  const [sprints, releases, stories] = await Promise.all([
    db.sprint.findMany({
      where: { prototypeId: ws.prototype.id },
      orderBy: { sprintNumber: "asc" },
      include: {
        stories: { orderBy: { order: "asc" }, select: { id: true, title: true, points: true } },
        release: { select: { name: true } },
      },
    }),
    db.release.findMany({
      where: { prototypeId: ws.prototype.id },
      orderBy: { order: "asc" },
      include: { sprints: { select: { sprintNumber: true } } },
    }),
    db.artifactLayer.findMany({
      where: { prototypeId: ws.prototype.id, type: "story" },
      select: {
        id: true,
        sourceCapabilityId: true,
        sprint: { select: { sprintNumber: true } },
      },
    }),
  ]);

  // Dependency check (non-blocking, FR-12: the sprint layer stays flexible):
  // warn when a capability has stories scheduled before a dependency finishes.
  const capabilities = await db.capability.findMany({
    where: { intakeAnswerSet: { initiativeId } },
    include: { dependsOnEdges: { include: { toCapability: { select: { id: true, name: true } } } } },
  });
  const sprintsOfCap = new Map<string, number[]>();
  for (const s of stories) {
    if (!s.sourceCapabilityId || !s.sprint) continue;
    const list = sprintsOfCap.get(s.sourceCapabilityId) ?? [];
    list.push(s.sprint.sprintNumber);
    sprintsOfCap.set(s.sourceCapabilityId, list);
  }
  const warnings: string[] = [];
  for (const cap of capabilities) {
    for (const edge of cap.dependsOnEdges) {
      const mine = sprintsOfCap.get(cap.id);
      const theirs = sprintsOfCap.get(edge.toCapability.id);
      if (mine && theirs && Math.min(...mine) < Math.max(...theirs)) {
        warnings.push(
          `"${cap.name}" has stories scheduled before its dependency "${edge.toCapability.name}" finishes (Sprint ${Math.min(...mine)} vs. Sprint ${Math.max(...theirs)}).`,
        );
      }
    }
  }

  const sprintNumbers = sprints.map((s) => s.sprintNumber);

  return (
    <div>
      <h2 className="text-xl font-bold">Sprint &amp; release plan</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Agile execution layers — flexible beneath the locked waterfall structure. Moving
        stories here never restructures locked layers above. Re-locking an upper layer
        recomputes this plan.
      </p>
      <ExplainCallout>
        Stories were packed into sprints in strict roadmap order against the estimated sprint
        capacity — a story only joins the current sprint if it fits, phases never mix in one
        sprint, and each sprint shows its planned story cost against the full labor allocation.
      </ExplainCallout>

      {/* Releases strip */}
      <div className="mt-5 flex flex-wrap gap-3">
        {releases.map((rel) => (
          <div
            key={rel.id}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm"
          >
            <p className="font-semibold text-emerald-900">{rel.name}</p>
            <p className="text-xs text-emerald-700">
              Sprint{rel.sprints.length === 1 ? "" : "s"}{" "}
              {rel.sprints.map((s) => s.sprintNumber).join(", ")} · ships{" "}
              {format(rel.targetDate, "MMM d, yyyy")}
            </p>
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Dependency check</p>
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800">
              {w}
            </p>
          ))}
        </div>
      )}

      {/* Sprint columns */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sprints.map((sprint) => {
          const planned = sprint.stories.reduce((n, s) => n + (s.points ?? 1), 0);
          const over = planned > sprint.capacityPoints;
          const pct = Math.min(100, (planned / Math.max(sprint.capacityPoints, 0.01)) * 100);
          return (
            <div key={sprint.id} className="rounded-2xl border border-neutral-200 p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">Sprint {sprint.sprintNumber}</h3>
                <span className="text-xs text-neutral-400">
                  {format(sprint.startDate, "MMM d")} – {format(sprint.endDate, "MMM d")}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                {sprint.release?.name} · Phase {sprint.phaseNumber}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${over ? "bg-red-500" : "bg-indigo-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className={`mt-1 text-xs ${over ? "font-semibold text-red-600" : "text-neutral-500"}`}>
                {planned} / {sprint.capacityPoints.toFixed(1)} pts{over && " — over-allocated"}
              </p>
              <p
                className="mt-0.5 text-xs text-neutral-400"
                title="Planned story cost vs. the sprint's full labor allocation (§17/§22)"
              >
                ${Math.round(planned * cost.model.costPerStoryPoint).toLocaleString()} planned · $
                {Math.round(cost.model.sprintLaborCost).toLocaleString()} allocated
              </p>
              <ul className="mt-3 space-y-1.5">
                {sprint.stories.map((story) => (
                  <li
                    key={story.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate" title={story.title}>
                      {story.title}
                    </span>
                    <span className="shrink-0 font-medium text-neutral-400">
                      {story.points ?? 1}
                    </span>
                    <SprintMoveSelect
                      artifactId={story.id}
                      currentSprintNumber={sprint.sprintNumber}
                      sprintNumbers={sprintNumbers}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
