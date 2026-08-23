import { notFound, redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/PageLayouts";
import CapacityCostPanel from "@/components/dashboard/CapacityCostPanel";
import ConnectedToolsWidget, { type ToolStatusView } from "@/components/dashboard/ConnectedToolsWidget";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DecisionsRequiredPanel, { type DecisionItem } from "@/components/dashboard/DecisionsRequiredPanel";
import PlanHealthChain, { type ChainLevel } from "@/components/dashboard/PlanHealthChain";
import RecentActivity, { type ActivityItem } from "@/components/dashboard/RecentActivity";
import RoadmapTimeline, { type TimelinePhase } from "@/components/dashboard/RoadmapTimeline";
import SprintReleaseStatus, {
  type ReleaseSummaryView,
  type SprintSummaryView,
} from "@/components/dashboard/SprintReleaseStatus";
import SummaryCards from "@/components/dashboard/SummaryCards";
import UpcomingActions, { type UpcomingAction } from "@/components/dashboard/UpcomingActions";
import { db } from "@/lib/db";
import { PHASE_NAMES } from "@/lib/generation/constants";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { buildCostModel } from "@/lib/generation/cost";
import { loadIntakeInput } from "@/lib/generation/engine";
import { costHealth, scheduleHealth, type HealthStatus } from "@/lib/generation/health";
import { profileFor } from "@/lib/generation/methodology";
import { LAYER_LABELS, LAYER_SEQUENCE, type LayerType } from "@/lib/generation/types";
import { validateIntake } from "@/lib/generation/validateIntake";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const initiative = await db.initiative.findUnique({
    where: { id: initiativeId },
    include: {
      intakeAnswerSet: {
        include: {
          capabilities: {
            orderBy: { order: "asc" },
            include: { dependsOnEdges: { include: { toCapability: { select: { name: true } } } } },
          },
        },
      },
      prototype: { include: { layerLocks: true } },
      syncConnections: true,
      integrationConnections: { include: { provider: { select: { name: true } } } },
    },
  });
  if (!initiative || !initiative.intakeAnswerSet) notFound();
  if (!initiative.prototype) redirect(`/initiatives/${initiativeId}/intake`);

  const intakeRow = initiative.intakeAnswerSet;
  const prototype = initiative.prototype;
  const capabilities = intakeRow.capabilities;
  const profile = profileFor(initiative.methodology);

  const [sprints, releases, stories, grouped] = await Promise.all([
    db.sprint.findMany({
      where: { prototypeId: prototype.id },
      orderBy: { sprintNumber: "asc" },
      include: { stories: { select: { points: true } } },
    }),
    db.release.findMany({
      where: { prototypeId: prototype.id },
      orderBy: { order: "asc" },
      include: { sprints: { select: { sprintNumber: true }, orderBy: { sprintNumber: "asc" } } },
    }),
    db.artifactLayer.findMany({
      where: { prototypeId: prototype.id, type: "story" },
      select: { points: true, sourceCapabilityId: true, sprint: { select: { phaseNumber: true } } },
    }),
    db.artifactLayer.groupBy({
      by: ["type"],
      where: { prototypeId: prototype.id },
      _count: { _all: true },
    }),
  ]);
  const count = (t: string) => grouped.find((g) => g.type === t)?._count._all ?? 0;

  const intakeInput = await loadIntakeInput(initiativeId);
  const warnings = validateIntake(intakeInput).warnings;
  const forecast = computeCapacityForecast(sprints);
  const totalPlannedPoints = stories.reduce((n, s) => n + (s.points ?? 1), 0);
  const model = buildCostModel({
    capacity: intakeInput,
    averageHourlyRate: initiative.averageHourlyRate,
    budget: initiative.budget,
    totalSprints: sprints.length,
    totalPlannedPoints,
  });

  // ---------- plan completion ----------
  const locks = prototype.layerLocks;
  const isLocked = (t: LayerType) => locks.find((l) => l.layerType === t)?.state === "locked";
  const lockedCount = LAYER_SEQUENCE.filter(isLocked).length;
  const activeLayer = LAYER_SEQUENCE.find((t) => !isLocked(t)) ?? null;
  const completionPercent = Math.round((lockedCount / LAYER_SEQUENCE.length) * 100);

  // ---------- overall schedule / cost health ----------
  const overAllocated = forecast.filter((f) => f.status === "over-allocated");
  const totalCapacity = sprints.reduce((n, s) => n + s.capacityPoints, 0);
  const overallSchedule: HealthStatus =
    overAllocated.length > 0 ? "at_risk" : scheduleHealth(totalPlannedPoints, totalCapacity);
  const overallCost = costHealth(model.estimatedInitiativeCost, model.budget);

  // ---------- per-capability cost (§25) ----------
  const pointsByCapability = new Map<string, number>();
  for (const s of stories) {
    if (!s.sourceCapabilityId) continue;
    pointsByCapability.set(
      s.sourceCapabilityId,
      (pointsByCapability.get(s.sourceCapabilityId) ?? 0) + (s.points ?? 1),
    );
  }
  const capPhase = new Map<string, number>();
  for (const s of stories) {
    if (s.sourceCapabilityId && s.sprint) capPhase.set(s.sourceCapabilityId, s.sprint.phaseNumber);
  }
  const phases: TimelinePhase[] = [1, 2, 3]
    .map((n) => ({
      name: PHASE_NAMES[n],
      items: capabilities
        .filter((c) => (capPhase.get(c.id) ?? (c.isMvp ? 1 : 3)) === n)
        .map((c) => ({
          name: c.name,
          isMvp: c.isMvp,
          businessValue: c.businessValue,
          effortSize: c.effortSize,
          riskLevel: c.riskLevel,
          estimatedCost: (pointsByCapability.get(c.id) ?? 0) * model.costPerStoryPoint,
          dependsOnNames: c.dependsOnEdges.map((e) => e.toCapability.name),
        })),
    }))
    .filter((p) => p.items.length > 0 || p.name === PHASE_NAMES[1]);

  // ---------- plan-health chain ----------
  const ws = (slug: string) => `/initiatives/${initiativeId}/workspace/${slug}`;
  const oversizedStories = stories.filter((s) => (s.points ?? 1) >= 13).length;
  const chain: ChainLevel[] = [
    { label: "Roadmap", href: ws("roadmap"), total: count("roadmap_phase"), locked: isLocked("roadmap"), warnings: 0 },
    { label: "Features", href: ws("features"), total: count("feature"), locked: isLocked("feature_hierarchy"), warnings: warnings.filter((w) => w.code === "capability_too_broad").length },
    { label: "Epics", href: ws("epics"), total: count("epic"), locked: isLocked("epics"), warnings: 0 },
    { label: "Stories", href: ws("epics"), total: count("story"), locked: isLocked("stories"), warnings: oversizedStories },
    { label: "Acceptance criteria", href: ws("epics"), total: count("acceptance_criterion"), locked: isLocked("acceptance_criteria"), warnings: 0 },
    { label: "Sprints", href: ws("sprints"), total: sprints.length, locked: null, warnings: overAllocated.length },
    { label: "Releases", href: ws("sprints"), total: releases.length, locked: null, warnings: 0 },
  ];

  // ---------- sprint / release summaries ----------
  const today = new Date();
  const currentSprintRow =
    sprints.find((s) => s.endDate >= today) ?? sprints[sprints.length - 1] ?? null;
  const currentSprint: SprintSummaryView | null = currentSprintRow
    ? {
        sprintNumber: currentSprintRow.sprintNumber,
        plannedPoints: currentSprintRow.stories.reduce((n, s) => n + (s.points ?? 1), 0),
        capacityPoints: currentSprintRow.capacityPoints,
        storyCount: currentSprintRow.stories.length,
        startDate: currentSprintRow.startDate,
        endDate: currentSprintRow.endDate,
      }
    : null;
  const releaseViews: ReleaseSummaryView[] = releases.map((r) => {
    const nums = r.sprints.map((s) => s.sprintNumber);
    const relForecast = forecast.filter((f) => nums.includes(f.sprintNumber));
    const points = relForecast.reduce((n, f) => n + f.plannedPoints, 0);
    const capacity = relForecast.reduce((n, f) => n + f.capacityPoints, 0);
    return {
      name: r.name,
      sprintRange: nums.length > 1 ? `${nums[0]}–${nums[nums.length - 1]}` : `${nums[0] ?? "—"}`,
      points,
      targetDate: r.targetDate,
      health: relForecast.some((f) => f.status === "over-allocated")
        ? "at_risk"
        : scheduleHealth(points, capacity),
    };
  });

  // ---------- decisions required ----------
  const decisions: DecisionItem[] = [];
  if (activeLayer) {
    decisions.push({
      title: `${LAYER_LABELS[activeLayer]} is ready to review and lock`,
      impact: "Downstream layers can't lock until this one does (strict waterfall sequence).",
      action: `Review the generated ${LAYER_LABELS[activeLayer].toLowerCase()} and lock the layer.`,
      href: activeLayer === "roadmap" ? ws("roadmap") : activeLayer === "feature_hierarchy" ? ws("features") : ws("epics"),
      severity: "info",
    });
  }
  for (const f of overAllocated) {
    decisions.push({
      title: `Sprint ${f.sprintNumber} exceeds capacity by ${Math.round(f.plannedPoints - f.capacityPoints)} points`,
      impact: "The release containing this sprint may slip.",
      action: "Move a story to a later sprint or reduce scope.",
      href: ws("sprints"),
      severity: "risk",
    });
  }
  if (oversizedStories > 0) {
    decisions.push({
      title: `${oversizedStories} ${oversizedStories === 1 ? "story exceeds" : "stories exceed"} the recommended size (13 points)`,
      impact: "Oversized stories rarely finish within one sprint.",
      action: "Split them into smaller stories.",
      href: ws("epics"),
      severity: "warning",
    });
  }
  if (overallCost === "attention" || overallCost === "at_risk") {
    decisions.push({
      title: `Estimated cost exceeds the budget by ${model.budgetVariance?.percent}%`,
      impact: "The initiative is forecast to overrun its available budget.",
      action: "Reduce scope, extend the budget, or adjust the cost assumptions.",
      href: ws("capacity"),
      severity: overallCost === "at_risk" ? "risk" : "warning",
    });
  }
  for (const w of warnings.filter((w) => w.code === "capability_too_broad")) {
    decisions.push({
      title: w.message.split(".")[0],
      impact: "Broad capabilities produce coarse estimates and risky sprints.",
      action: "Split the capability in the intake before re-generating.",
      href: `/initiatives/${initiativeId}/intake`,
      severity: "warning",
    });
  }

  // ---------- activity + upcoming ----------
  const activity: ActivityItem[] = [
    { when: intakeRow.updatedAt, label: "Intake updated" },
    { when: prototype.createdAt, label: "Working prototype generated" },
    ...locks
      .filter((l) => l.lockedAt && l.state === "locked")
      .map((l) => ({ when: l.lockedAt!, label: `${LAYER_LABELS[l.layerType as LayerType]} locked` })),
    ...(prototype.approvedAt ? [{ when: prototype.approvedAt, label: "Baseline approved" }] : []),
    ...initiative.syncConnections
      .filter((c) => c.lastSyncedAt)
      .map((c) => ({ when: c.lastSyncedAt!, label: "Jira demo sync completed" })),
    ...initiative.integrationConnections
      .filter((c) => c.lastSyncAt)
      .map((c) => ({ when: c.lastSyncAt!, label: `${c.provider.name} demo sync completed` })),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 7);

  const now: UpcomingAction[] = [];
  const next: UpcomingAction[] = [];
  const later: UpcomingAction[] = [];
  if (activeLayer) {
    now.push({
      label: `Review & lock ${LAYER_LABELS[activeLayer]}`,
      href: activeLayer === "roadmap" ? ws("roadmap") : activeLayer === "feature_hierarchy" ? ws("features") : ws("epics"),
    });
  }
  if (overAllocated.length > 0) {
    next.push({ label: `Rebalance sprint ${overAllocated[0].sprintNumber}`, href: ws("sprints") });
  }
  next.push({ label: "Review capacity & cost assumptions", href: ws("capacity") });
  later.push({ label: "Generate executive presentation", href: ws("executive") });
  later.push({ label: "Run a demo integration sync", href: "/integrations" });

  // ---------- connected tools ----------
  const tools: ToolStatusView[] = initiative.integrationConnections.map((c) => ({
    name: c.provider.name,
    status: c.status,
  }));
  const legacyJira = initiative.syncConnections.find((c) => c.tool === "jira");
  if (tools.length === 0 && legacyJira?.status === "connected") {
    tools.push({ name: "Jira (workspace demo)", status: legacyJira.lastSyncedAt ? "sync_complete" : "demo_connected" });
  }

  return (
    <DashboardLayout>
      <DashboardHeader
        initiativeId={initiativeId}
        name={initiative.name}
        description={initiative.description}
        methodology={initiative.methodology}
        releaseTarget={
          initiative.targetLaunchDate?.toLocaleDateString() ??
          releases[releases.length - 1]?.targetDate.toLocaleDateString() ??
          null
        }
        updatedAt={initiative.updatedAt}
        baselineApprovedAt={prototype.approvedAt}
      />

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <SummaryCards
            completion={{
              percent: completionPercent,
              lockedCount,
              totalLayers: LAYER_SEQUENCE.length,
              activeLayer: activeLayer ? LAYER_LABELS[activeLayer] : null,
              nextAction: activeLayer
                ? `Review & lock ${LAYER_LABELS[activeLayer]}`
                : "All layers locked — baseline stored",
            }}
            scope={{
              total: capabilities.length,
              mvp: capabilities.filter((c) => c.isMvp).length,
              deferred: capabilities.filter((c) => !c.isMvp).length,
              baselineApprovedAt: prototype.approvedAt,
            }}
            forecast={{
              sprints: sprints.length,
              releaseDate: releases[releases.length - 1]?.targetDate ?? null,
              totalPoints: totalPlannedPoints,
              variancePercent:
                totalCapacity > 0
                  ? Math.round(((totalPlannedPoints - totalCapacity) / totalCapacity) * 1000) / 10
                  : 0,
              health: overallSchedule,
            }}
            cost={{
              total: model.estimatedInitiativeCost,
              perSprint: model.sprintLaborCost,
              perPoint: model.costPerStoryPoint,
              variancePercent: model.budgetVariance?.percent ?? null,
              health: overallCost,
            }}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <PlanHealthChain levels={chain} />
            <CapacityCostPanel initiativeId={initiativeId} teamSize={intakeRow.teamSize} model={model} />
          </div>
          <RoadmapTimeline initiativeId={initiativeId} phases={phases} />
          <div className="grid gap-4 lg:grid-cols-2">
            <SprintReleaseStatus
              initiativeId={initiativeId}
              currentSprint={currentSprint}
              releases={releaseViews}
              mode={profile.sprintMode === "continuous_flow" ? "continuous_flow" : "sprints"}
            />
            <ConnectedToolsWidget tools={tools} />
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <UpcomingActions now={now} next={next} later={later} />
          <DecisionsRequiredPanel items={decisions} />
          <RecentActivity items={activity} />
        </aside>
      </div>
    </DashboardLayout>
  );
}
