import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import RoadmapBoard, { type BoardPhase } from "@/components/workspace/RoadmapBoard";
import RoadmapLegacyViews from "@/components/workspace/RoadmapLegacyViews";
import RoadmapToolbar from "@/components/workspace/RoadmapToolbar";
import RoadmapViewSwitcher from "@/components/workspace/RoadmapViewSwitcher";
import TraceBadge from "@/components/workspace/TraceBadge";
import CoachMark from "@/components/coachmarks/CoachMark";
import TimelineRoadmap from "@/components/workspace/timeline/TimelineRoadmap";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { PHASE_NAMES } from "@/lib/generation/constants";
import { profileFor } from "@/lib/generation/methodology";
import { loadRoadmapTimelineData, serializeTimelineData } from "@/lib/roadmap/loadRoadmapTimelineData";
import { traceEntriesFor } from "@/lib/trace";
import { loadCostContext, loadWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const parse = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export default async function RoadmapPage({
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

  const root = await db.artifactLayer.findFirst({
    where: { prototypeId: ws.prototype.id, type: "roadmap" },
  });
  const phases = await db.artifactLayer.findMany({
    where: { prototypeId: ws.prototype.id, type: "roadmap_phase" },
    orderBy: { order: "asc" },
    include: {
      children: {
        where: { type: "feature" },
        orderBy: { order: "asc" },
        include: {
          children: {
            where: { type: "epic" },
            orderBy: { order: "asc" },
            include: { _count: { select: { children: true } } },
          },
        },
      },
    },
  });
  if (!root) notFound();

  const profile = profileFor(ws.initiative.methodology);
  const boardPhases: BoardPhase[] = phases.map((phase) => {
    const content = parse(phase.contentJson);
    const phaseNumber = (content.phaseNumber as number | undefined) ?? phase.order + 1;
    return {
      phaseNumber,
      name: phase.title || PHASE_NAMES[phaseNumber] || `Phase ${phaseNumber}`,
      features: phase.children.map((feature) => {
        const cap = feature.sourceCapabilityId ? ws.capViewById.get(feature.sourceCapabilityId) : null;
        return {
          id: feature.id,
          capabilityId: feature.sourceCapabilityId,
          title: feature.title,
          isMvp: cap?.isMvp ?? false,
          businessValue: cap?.businessValue ?? "medium",
          riskLevel: cap?.riskLevel ?? null,
          cost: feature.sourceCapabilityId
            ? (cost.costByCapability.get(feature.sourceCapabilityId) ?? null)
            : null,
          epics: feature.children.map((epic) => ({
            id: epic.id,
            title: epic.title,
            storyCount: epic._count.children,
          })),
        };
      }),
    };
  });

  const listView = (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <EditableArtifact
            artifactId={root.id}
            title={root.title}
            body={root.body}
            titleClassName="text-xl font-bold"
          />
        </div>
        <TraceBadge
          note={root.traceNote}
          entries={traceEntriesFor(root.traceAnswerKeys, ws.intakeView)}
        />
      </div>

      <div className="mt-8 space-y-4">
        {phases.map((phase) => {
          const content = parse(phase.contentJson);
          const start = content.startDate ? new Date(content.startDate as string) : null;
          const end = content.endDate ? new Date(content.endDate as string) : null;
          const phaseCost = phase.children.reduce(
            (n, f) =>
              n + (f.sourceCapabilityId ? (cost.costByCapability.get(f.sourceCapabilityId) ?? 0) : 0),
            0,
          );
          return (
            <section
              key={phase.id}
              className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <EditableArtifact
                    artifactId={phase.id}
                    title={phase.title}
                    body={phase.body}
                    titleClassName="text-lg font-semibold text-indigo-900"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {phaseCost > 0 && (
                    <span
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600"
                      title="Sum of this phase's feature costs (§25) — story points × cost per point"
                    >
                      ~${Math.round(phaseCost).toLocaleString()}
                    </span>
                  )}
                  {start && end && (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-neutral-600">
                      {format(start, "MMM d")} → {format(end, "MMM d, yyyy")}
                    </span>
                  )}
                  <TraceBadge
                    note={phase.traceNote}
                    entries={traceEntriesFor(phase.traceAnswerKeys, ws.intakeView)}
                  />
                </div>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {phase.children.map((feature) => (
                  <li key={feature.id}>
                    <Link
                      href={`/initiatives/${initiativeId}/workspace/features`}
                      className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm hover:border-indigo-300"
                    >
                      {feature.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-neutral-400">
        Phase date ranges are computed from the sprint plan (the FR-07 dual capacity mapping).
      </p>
    </div>
  );

  const boardView = (
    <div>
      {profile.roadmapMode === "continuous_backlog" ? (
        <p className="rounded-lg bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
          The Board isn&apos;t available for Agile/Scrum — its phases are a continuously re-ranked
          backlog, not fixed categories a feature can be pinned to. Switch methodology to
          Hybrid, Waterfall, or Kanban to use it.
        </p>
      ) : (
        <RoadmapBoard initiativeId={initiativeId} phases={boardPhases} />
      )}
    </div>
  );

  const timelineData = await loadRoadmapTimelineData(initiativeId, ws.prototype.id, ws.initiative.methodology);
  const timelineView = (
    <TimelineRoadmap initiativeId={initiativeId} data={serializeTimelineData(timelineData)} />
  );

  const milestonesView = (
    <EmptyState
      title="Milestones is coming in Step 9C"
      description="Releases, the projected go-live date, and the approved-baseline checkpoint will plot on one strategic timeline here — not built yet."
    />
  );
  const connectionsView = (
    <EmptyState
      title="Connections is coming in Step 9D"
      description="Feature dependencies will render as a relationship map here — not built yet."
    />
  );

  return (
    <RoadmapToolbar
      title="Roadmap"
      description="One page, three lenses over the same plan — Timeline for scanning work over time, Milestones for strategic checkpoints, Connections for dependencies."
    >
      <CoachMark coachMarkKey="roadmap" className="mb-4" />
      <RoadmapViewSwitcher timeline={timelineView} milestones={milestonesView} connections={connectionsView} />
      <RoadmapLegacyViews list={listView} board={boardView} />

      {/* Secondary to the roadmap above, never the main output (Section 4). */}
      <div className="mt-8 max-w-xl">
        <AiAssistPanel initiativeId={initiativeId} scope="roadmap" />
      </div>
    </RoadmapToolbar>
  );
}
