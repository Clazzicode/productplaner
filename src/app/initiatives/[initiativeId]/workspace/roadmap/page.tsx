import { format } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";
import EmptyState from "@/components/ui/EmptyState";
import EditableArtifact from "@/components/workspace/EditableArtifact";
import RoadmapBoard, { type BoardPhase } from "@/components/workspace/RoadmapBoard";
import RoadmapLegacyViews from "@/components/workspace/RoadmapLegacyViews";
import RoadmapToolbar from "@/components/workspace/RoadmapToolbar";
import RoadmapViewSwitcher from "@/components/workspace/RoadmapViewSwitcher";
import RoadmapPlanningView from "@/components/workspace/RoadmapPlanningView";
import TraceBadge from "@/components/workspace/TraceBadge";
import CoachMark from "@/components/coachmarks/CoachMark";
import TimelineRoadmap from "@/components/workspace/timeline/TimelineRoadmap";
import AiAssistPanel from "@/components/ai/AiAssistPanel";
import { requireInitiativeView } from "@/lib/access/guards";
import { meetsMinimum } from "@/lib/access/resolution";
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
  const access = await requireInitiativeView(user, initiativeId);
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
  const timelineFeatures = [...timelineData.phases.flatMap((phase) => phase.features), ...timelineData.unscheduled];
  const timelineByCapabilityId = new Map(timelineFeatures.filter((feature) => feature.capabilityId).map((feature) => [feature.capabilityId!, feature]));
  const planningView = <RoadmapPlanningView
    initiativeId={initiativeId}
    canEdit={meetsMinimum(access.level, "edit")}
    releases={timelineData.releases.map((release) => ({ id: release.id, label: release.label, targetDate: release.targetDate.toISOString() }))}
    features={ws.initiative.intakeAnswerSet!.capabilities.map((capability) => {
      const timeline = timelineByCapabilityId.get(capability.id);
      return {
        id: capability.id, name: capability.name, description: capability.description,
        backlogLane: capability.backlogLane, backlogRevision: capability.backlogRevision,
        releaseId: capability.releaseId, businessValue: capability.businessValue,
        riskLevel: capability.riskLevel, dependencyCount: capability.dependsOnEdges.length,
        dependencyWarnings: timeline?.dependencyWarnings ?? [], defectCount: timeline?.defectCount ?? 0,
        blockerCount: timeline?.blockerCount ?? 0, qualityRisk: timeline?.qualityRisk ?? "low",
      };
    })}
  />;
  const timelineView = (
    <TimelineRoadmap initiativeId={initiativeId} data={serializeTimelineData(timelineData)} />
  );

  const milestonesView = (
    timelineData.releases.length === 0
      ? <EmptyState title="No target releases yet" description="Create a release from Sprints & Releases to add the release cadence and target release date to this roadmap." />
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{timelineData.releases.map((release) => <section key={release.id} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5"><p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Target release</p><h3 className="mt-1 text-lg font-bold text-indigo-950">{format(release.targetDate, "MMM d, yyyy")}</h3><p className="mt-2 text-sm text-indigo-800">{release.label}</p><p className="mt-1 text-xs capitalize text-indigo-700">Cadence: {release.cadence.replaceAll("_", " ") || "Not set"}</p><div className="mt-3 flex flex-wrap gap-1.5 text-xs"><span className="rounded-full bg-white px-2 py-1">{release.featureCount} features</span><span className="rounded-full bg-white px-2 py-1">{release.defectCount} active defects</span><span className="rounded-full bg-white px-2 py-1">{release.blockerCount} blockers</span><span className="rounded-full bg-white px-2 py-1 capitalize">{release.qualityRisk} quality risk</span></div></section>)}</div>
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
      description="Plan features in Now, Next, Later, or Unscheduled, then enrich the roadmap with release cadence, target dates, and dependencies."
    >
      <CoachMark coachMarkKey="roadmap" className="mb-4" />
      <RoadmapViewSwitcher planning={planningView} timeline={timelineView} milestones={milestonesView} connections={connectionsView} />
      <RoadmapLegacyViews list={listView} board={boardView} />

      {/* Secondary to the roadmap above, never the main output (Section 4). */}
      <div className="mt-8 max-w-xl">
        <AiAssistPanel initiativeId={initiativeId} scope="roadmap" />
      </div>
    </RoadmapToolbar>
  );
}
