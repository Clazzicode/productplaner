import { format } from "date-fns";
import { notFound } from "next/navigation";
import CoachMark from "@/components/coachmarks/CoachMark";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import CreateReleaseForm from "@/components/workspace/CreateReleaseForm";
import CreateSprintForm from "@/components/workspace/CreateSprintForm";
import SprintMoveSelect from "@/components/workspace/SprintMoveSelect";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { profileFor } from "@/lib/generation/methodology";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SprintsPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const ws = await loadWorkspace(initiativeId);
  if (!ws) notFound();
  const cost = await loadCostContext(initiativeId, ws.prototype.id);
  const profile = profileFor(ws.initiative.methodology);
  const isKanban = profile.sprintMode === "continuous_flow";
  const agileFrozen = profile.agileLayerGate === "locked_after_baseline" && ws.prototype.approvedAt != null;

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

  // Guided-activation restructure: data for the manual Create Release / Plan
  // Sprint forms. Phases are identified by contentJson.phaseNumber (not a
  // queryable column), same parse-in-application-code pattern the Kanban
  // flowPhases block below already uses.
  const parsePhaseNumber = (raw: string): number => {
    try {
      return (JSON.parse(raw) as { phaseNumber?: number }).phaseNumber ?? 1;
    } catch {
      return 1;
    }
  };
  const phaseRows = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "roadmap_phase" },
    orderBy: { order: "asc" },
    select: { title: true, contentJson: true },
  });
  const manualReleasePhaseNumbers = new Set(
    releases.filter((r) => r.origin === "manual").map((r) => r.phaseNumber),
  );
  const availablePhases = phaseRows
    .map((p) => ({ phaseNumber: parsePhaseNumber(p.contentJson), title: p.title }))
    .filter((p) => !manualReleasePhaseNumbers.has(p.phaseNumber));

  const unassignedStoryRows = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "story", sprintId: null },
    select: {
      id: true,
      title: true,
      points: true,
      parent: { select: { parent: { select: { parent: { select: { contentJson: true } } } } } },
    },
  });
  const unassignedStoriesByPhase = new Map<number, { id: string; title: string; points: number }[]>();
  for (const s of unassignedStoryRows) {
    const phaseNumber = parsePhaseNumber(s.parent?.parent?.parent?.contentJson ?? "{}");
    const list = unassignedStoriesByPhase.get(phaseNumber) ?? [];
    list.push({ id: s.id, title: s.title, points: s.points ?? 1 });
    unassignedStoriesByPhase.set(phaseNumber, list);
  }

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

  // Kanban: no sprints exist — fetch the story queue in true roadmap order
  // (phase → feature → epic → story) for the continuous-flow view.
  const flowPhases = isKanban
    ? await (async () => {
        const rows = await db.artifactLayer.findMany({
          where: { prototypeId: ws.prototype.id, type: "story" },
          orderBy: { order: "asc" },
          select: {
            id: true,
            title: true,
            points: true,
            order: true,
            parent: {
              select: {
                order: true,
                parent: {
                  select: {
                    order: true,
                    parent: { select: { order: true, contentJson: true } },
                  },
                },
              },
            },
          },
        });
        const parse = (raw: string): { phaseNumber?: number } => {
          try {
            return JSON.parse(raw) as { phaseNumber?: number };
          } catch {
            return {};
          }
        };
        const withOrder = rows.map((r) => ({
          id: r.id,
          title: r.title,
          points: r.points ?? 1,
          phaseNumber: parse(r.parent?.parent?.parent?.contentJson ?? "{}").phaseNumber ?? 1,
          sortKey: [
            r.parent?.parent?.parent?.order ?? 0,
            r.parent?.parent?.order ?? 0,
            r.parent?.order ?? 0,
            r.order,
          ] as const,
        }));
        withOrder.sort((a, b) => {
          for (let i = 0; i < a.sortKey.length; i++) {
            if (a.sortKey[i] !== b.sortKey[i]) return a.sortKey[i] - b.sortKey[i];
          }
          return 0;
        });
        const byPhase = new Map<number, typeof withOrder>();
        for (const s of withOrder) {
          const list = byPhase.get(s.phaseNumber) ?? [];
          list.push(s);
          byPhase.set(s.phaseNumber, list);
        }
        return [...byPhase.entries()].sort((a, b) => a[0] - b[0]);
      })()
    : [];
  const throughputPerWeek =
    isKanban && ws.intakeView.sprintLengthWeeks > 0
      ? Math.round((cost.model.sprintPointCapacity / ws.intakeView.sprintLengthWeeks) * 10) / 10
      : 0;

  return (
    <div>
      <h2 className="text-xl font-bold">
        {isKanban ? "Flow & release plan" : "Sprint & release plan"}
        {isKanban && (
          <span className="ml-2 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {throughputPerWeek} pts/week throughput
          </span>
        )}
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        {isKanban
          ? "Kanban continuous flow — no fixed sprints. Stories are worked in priority order; release dates are forecasted from cumulative throughput."
          : agileFrozen
            ? "Waterfall: the sprint and release plan became a fixed schedule once the baseline was approved — it can no longer be rebalanced."
            : "Create releases and plan sprints directly here — nothing is auto-assigned. Regenerating the plan from Living Plan rebuilds everything, including releases and sprints you've created."}
      </p>
      <CoachMark coachMarkKey="sprints_releases" className="mt-4" />
      {/* Releases strip */}
      <div className="mt-5 flex flex-wrap items-start gap-3">
        {releases.map((rel) => (
          <div
            key={rel.id}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm"
          >
            <p className="font-semibold text-emerald-900">
              {rel.name}
              {rel.origin === "manual" && (
                <span className="ml-1.5 rounded-full bg-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                  Confirmed
                </span>
              )}
            </p>
            <p className="text-xs text-emerald-700">
              {isKanban
                ? "Forecasted"
                : `Sprint${rel.sprints.length === 1 ? "" : "s"} ${rel.sprints.map((s) => s.sprintNumber).join(", ") || "none yet"}`}{" "}
              · ships {format(rel.targetDate, "MMM d, yyyy")}
            </p>
            {!isKanban && rel.origin === "manual" && !agileFrozen && (
              <div className="mt-2">
                <CreateSprintForm
                  releaseId={rel.id}
                  releaseName={rel.name}
                  availableStories={unassignedStoriesByPhase.get(rel.phaseNumber) ?? []}
                  defaultCapacityPoints={cost.model.sprintPointCapacity}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Guided-activation restructure: the explicit Create Release step
          (reference doc §8 STATE 4) — available as soon as a plan exists
          (this page never renders without one), for any phase without a
          release yet. The waterfall roadmap-lock ceremony this used to
          require has been removed platform-wide. */}
      {!isKanban && !agileFrozen && (
        <div className="mt-4">
          <CreateReleaseForm initiativeId={initiativeId} availablePhases={availablePhases} />
        </div>
      )}

      {agileFrozen && (
        <div className="mt-4 rounded-xl border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
          Baseline approved — this schedule is fixed under the Waterfall methodology.
        </div>
      )}

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

      {isKanban ? (
        <div className="mt-6 space-y-6">
          {flowPhases.map(([phaseNumber, phaseStories]) => {
            const points = phaseStories.reduce((n, s) => n + s.points, 0);
            return (
              <div key={phaseNumber} className="rounded-2xl border border-neutral-200 p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">Phase {phaseNumber}</h3>
                  <span className="text-xs text-neutral-400">{points} points queued</span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {phaseStories.map((story) => (
                    <li
                      key={story.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate" title={story.title}>
                        {story.title}
                      </span>
                      <span className="shrink-0 font-medium text-neutral-400">{story.points}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {flowPhases.length === 0 && (
            <p className="text-sm text-neutral-400">No stories generated yet.</p>
          )}
        </div>
      ) : (
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
                      {agileFrozen ? (
                        <span className="shrink-0 text-neutral-300">🔒</span>
                      ) : (
                        <SprintMoveSelect
                          artifactId={story.id}
                          currentSprintNumber={sprint.sprintNumber}
                          sprintNumbers={sprintNumbers}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Secondary to the sprint plan above (Section 4). */}
      <div className="mt-8 max-w-xl">
        <AiAssistPanel initiativeId={initiativeId} scope="sprints" />
      </div>
    </div>
  );
}
