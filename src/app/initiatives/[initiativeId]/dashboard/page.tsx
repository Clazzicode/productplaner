import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/PageLayouts";
import Accordion, { type AccordionSection } from "@/components/ui/Accordion";
import { Badge, healthBadgeVariant } from "@/components/ui/Badge";
import CapacityCostPanel from "@/components/dashboard/CapacityCostPanel";
import ConnectedToolsWidget, { type ToolStatusView } from "@/components/dashboard/ConnectedToolsWidget";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import DecisionsRequiredPanel, { type DecisionItem } from "@/components/dashboard/DecisionsRequiredPanel";
import RecentActivity, { type ActivityItem } from "@/components/dashboard/RecentActivity";
import RoadmapTimeline, { type TimelinePhase } from "@/components/dashboard/RoadmapTimeline";
import RoleRoadmapPanel from "@/components/dashboard/roleRoadmap/RoleRoadmapPanel";
import SprintReleaseStatus, {
  type ReleaseSummaryView,
  type SprintSummaryView,
} from "@/components/dashboard/SprintReleaseStatus";
import SummaryCards from "@/components/dashboard/SummaryCards";
import UpcomingActions, { type UpcomingAction } from "@/components/dashboard/UpcomingActions";
import { requireInitiativeView } from "@/lib/access/guards";
import { requireCurrentUser } from "@/lib/auth/session";
import { resolveLifecycleState, STAGE_LABEL, STAGE_PROGRESS_PERCENT } from "@/lib/lifecycle/resolveLifecycleState";
import { db, establishAuthContext } from "@/lib/db";
import { PHASE_NAMES } from "@/lib/generation/constants";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { buildCostModel } from "@/lib/generation/cost";
import { findCycle } from "@/lib/generation/dependencyGraph";
import { loadIntakeInput } from "@/lib/generation/engine";
import { costHealth, HEALTH_LABELS, scheduleHealth, type HealthStatus } from "@/lib/generation/health";
import { profileFor } from "@/lib/generation/methodology";
import { LAYER_LABELS, type LayerType } from "@/lib/generation/types";
import { validateIntake } from "@/lib/generation/validateIntake";
import { resolveWorkingRole } from "@/lib/onboarding/resolveWorkingRole";
import { readOnboardingStateServer } from "@/lib/onboarding/tempStateServer";
import { deriveRoleRoadmapView, type RoleRoadmapCapability, type RoleRoadmapInput } from "@/lib/roadmap/roleRoadmapView";

const parseContentJson = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ initiativeId: string }>;
}) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  await requireInitiativeView(user, initiativeId);
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

  const [sprints, releases, stories, grouped, phaseArtifacts, onboarding] = await Promise.all([
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
      select: {
        points: true,
        sourceCapabilityId: true,
        sprint: { select: { phaseNumber: true, sprintNumber: true } },
      },
    }),
    db.artifactLayer.groupBy({
      by: ["type"],
      where: { prototypeId: prototype.id },
      _count: { _all: true },
    }),
    // Real phase titles (methodology-aware — e.g. "Now"/"Next"/"Later N" for
    // agile_scrum) for the role roadmap panel below, since PHASE_NAMES[n] alone
    // (used by the existing `phases`/TimelinePhase computation a few lines down)
    // mislabels agile_scrum initiatives. Same pattern as workspace/roadmap/page.tsx.
    db.artifactLayer.findMany({
      where: { prototypeId: prototype.id, type: "roadmap_phase" },
      select: { title: true, contentJson: true },
    }),
    readOnboardingStateServer(),
  ]);
  const count = (t: string) => grouped.find((g) => g.type === t)?._count._all ?? 0;
  const workingRole = resolveWorkingRole(user.workingRole, onboarding.workingRole);
  const phaseTitleByNumber = new Map<number, string>();
  for (const p of phaseArtifacts) {
    const content = parseContentJson(p.contentJson);
    const phaseNumber = typeof content.phaseNumber === "number" ? content.phaseNumber : null;
    if (phaseNumber != null) phaseTitleByNumber.set(phaseNumber, p.title);
  }

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

  // ---------- plan progress ----------
  // The waterfall layer-lock ceremony (Roadmap/Features/Epics/Stories/
  // Acceptance Criteria) that used to drive "plan completion" here has been
  // removed platform-wide — `locks` stays only for the Recent Activity feed
  // below, which shows any pre-existing "X locked" history truthfully rather
  // than erasing it, but nothing can ever add to it again. Progress is now
  // read from the same lifecycle resolver every other screen uses.
  const locks = prototype.layerLocks;
  const lifecycleResolution = resolveLifecycleState({
    initiative: { id: initiative.id, status: initiative.status },
    manualReleaseCount: releases.filter((r) => r.origin === "manual").length,
    manualSprintCount: sprints.filter((s) => s.origin === "manual").length,
  });
  const completionPercent = STAGE_PROGRESS_PERCENT[lifecycleResolution.stage];

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
  const capSprintNumbers = new Map<string, Set<number>>();
  for (const s of stories) {
    if (!s.sourceCapabilityId || !s.sprint) continue;
    const set = capSprintNumbers.get(s.sourceCapabilityId) ?? new Set<number>();
    set.add(s.sprint.sprintNumber);
    capSprintNumbers.set(s.sourceCapabilityId, set);
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

  // ---------- plan stage grouping (drives the dashboard accordion below) ----------
  const ws = (slug: string) => `/initiatives/${initiativeId}/workspace/${slug}`;
  const oversizedStories = stories.filter((s) => (s.points ?? 1) >= 13).length;
  const broadCapabilityWarnings = warnings.filter((w) => w.code === "capability_too_broad").length;

  // ---------- role-differentiated roadmap panel ----------
  // Same underlying capabilities/cost/dependency data as the "Roadmap & Features"
  // section above, reshaped per Working Role by deriveRoleRoadmapView — never a
  // second data path, never a change to the generation engine.
  const overAllocatedSprintNumbers = new Set(overAllocated.map((f) => f.sprintNumber));
  const sprintStartDatesByPhase = new Map<number, Date[]>();
  for (const s of sprints) {
    const arr = sprintStartDatesByPhase.get(s.phaseNumber) ?? [];
    arr.push(s.startDate);
    sprintStartDatesByPhase.set(s.phaseNumber, arr);
  }
  const roleRoadmapPhases: RoleRoadmapInput["phases"] = [1, 2, 3].map((n) => ({
    phaseNumber: n,
    name: phaseTitleByNumber.get(n) || PHASE_NAMES[n],
    sprintStartDates: sprintStartDatesByPhase.get(n) ?? [],
    capabilities: capabilities
      .filter((c) => (capPhase.get(c.id) ?? (c.isMvp ? 1 : 3)) === n)
      .map(
        (c): RoleRoadmapCapability => ({
          id: c.id,
          name: c.name,
          isMvp: c.isMvp,
          businessValue: c.businessValue as RoleRoadmapCapability["businessValue"],
          riskLevel: c.riskLevel as RoleRoadmapCapability["riskLevel"],
          revenueImpactScore: c.revenueImpactScore,
          estimatedCost: (pointsByCapability.get(c.id) ?? 0) * model.costPerStoryPoint,
          dependsOnNames: c.dependsOnEdges.map((e) => e.toCapability.name),
          inOverAllocatedSprint: [...(capSprintNumbers.get(c.id) ?? [])].some((sn) =>
            overAllocatedSprintNumbers.has(sn),
          ),
        }),
      ),
  }));
  const roleRoadmapView = deriveRoleRoadmapView(workingRole, {
    phases: roleRoadmapPhases,
    cost: {
      estimatedInitiativeCost: model.estimatedInitiativeCost,
      budgetVariance: model.budgetVariance,
      costHealth: overallCost,
    },
    scheduleHealth: overallSchedule,
    hasDependencyCycle: findCycle(intakeInput.capabilities).length > 0,
    oversizedStoryCount: oversizedStories,
    tooBroadCapabilityCount: broadCapabilityWarnings,
    milestones: releases.map((r) => ({ name: r.name, targetDate: r.targetDate, phaseNumber: r.phaseNumber })),
  });

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
      impact: "Broad features produce coarse estimates and risky sprints.",
      action: "Split the feature in the intake before re-generating.",
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
      .map((c) => ({ when: c.lastSyncedAt!, label: "Jira sync completed" })),
    ...initiative.integrationConnections
      .filter((c) => c.lastSyncAt)
      .map((c) => ({ when: c.lastSyncAt!, label: `${c.provider.name} sync completed` })),
  ]
    .sort((a, b) => b.when.getTime() - a.when.getTime())
    .slice(0, 7);

  const now: UpcomingAction[] = [];
  const next: UpcomingAction[] = [];
  const later: UpcomingAction[] = [];
  if (lifecycleResolution.stage !== "active_execution") {
    now.push({ label: lifecycleResolution.nextAction.label, href: lifecycleResolution.nextAction.href });
  }
  if (overAllocated.length > 0) {
    next.push({ label: `Rebalance sprint ${overAllocated[0].sprintNumber}`, href: ws("sprints") });
  }
  next.push({ label: "Review capacity & cost assumptions", href: ws("capacity") });
  later.push({ label: "Generate executive presentation", href: ws("executive") });
  later.push({ label: "Run an integration sync", href: "/integrations" });

  // ---------- connected tools ----------
  const tools: ToolStatusView[] = initiative.integrationConnections.map((c) => ({
    name: c.provider.name,
    status: c.status,
  }));
  const legacyJira = initiative.syncConnections.find((c) => c.tool === "jira");
  if (tools.length === 0 && legacyJira?.status === "connected") {
    tools.push({ name: "Jira", status: legacyJira.lastSyncedAt ? "sync_complete" : "demo_connected" });
  }

  // ---------- dashboard accordion: everything past the top summary lives here,
  // collapsed by default except "delivery" — used to instead default to
  // whichever waterfall layer was next in line to lock, but there's no more
  // layer-by-layer review step to point at (the removed lock ceremony), so
  // this just opens the section most likely to need attention day to day. ----------
  const isContinuousFlow = profile.sprintMode === "continuous_flow";
  const defaultOpenIds = ["delivery"];

  const sections: AccordionSection[] = [
    {
      id: "roadmap",
      title: "Roadmap & Features",
      meta: (
        <>
          {broadCapabilityWarnings > 0 && (
            <Badge variant="amber">
              {broadCapabilityWarnings} warning{broadCapabilityWarnings > 1 ? "s" : ""}
            </Badge>
          )}
        </>
      ),
      content: <RoadmapTimeline initiativeId={initiativeId} phases={phases} />,
    },
    {
      id: "backlog",
      title: "Epics, Stories & Acceptance Criteria",
      meta: (
        <>
          {oversizedStories > 0 && (
            <Badge variant="amber">
              {oversizedStories} warning{oversizedStories > 1 ? "s" : ""}
            </Badge>
          )}
        </>
      ),
      content: (
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-neutral-800">Backlog summary</p>
            <Link href={ws("epics")} className="text-xs font-medium text-indigo-600 hover:underline">
              Open backlog →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xl font-bold">{count("epic")}</p>
              <p className="text-xs text-neutral-500">Epics</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xl font-bold">{count("story")}</p>
              <p className="text-xs text-neutral-500">Stories</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-white p-3">
              <p className="text-xl font-bold">{count("acceptance_criterion")}</p>
              <p className="text-xs text-neutral-500">Acceptance criteria</p>
            </div>
          </div>
          {oversizedStories > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              {oversizedStories} {oversizedStories === 1 ? "story exceeds" : "stories exceed"} the
              recommended size (13 points) and should be split.
            </p>
          )}
        </div>
      ),
    },
    {
      id: "delivery",
      title: isContinuousFlow ? "Flow & Releases" : "Sprints & Releases",
      meta: overAllocated.length > 0 && (
        <Badge variant="amber">
          {overAllocated.length} warning{overAllocated.length > 1 ? "s" : ""}
        </Badge>
      ),
      content: (
        <SprintReleaseStatus
          initiativeId={initiativeId}
          currentSprint={currentSprint}
          releases={releaseViews}
          mode={isContinuousFlow ? "continuous_flow" : "sprints"}
        />
      ),
    },
    {
      id: "capacity",
      title: "Capacity & Cost",
      meta: overallCost && <Badge variant={healthBadgeVariant(overallCost)}>{HEALTH_LABELS[overallCost]}</Badge>,
      content: <CapacityCostPanel initiativeId={initiativeId} teamSize={intakeRow.teamSize} model={model} />,
    },
    {
      id: "tools",
      title: "Connected Tools",
      meta: (
        <Badge variant="neutral">
          {tools.length} connected
        </Badge>
      ),
      content: <ConnectedToolsWidget tools={tools} />,
    },
    {
      id: "activity",
      title: "Recent Activity",
      content: <RecentActivity items={activity} />,
    },
  ];

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
        isOrgAdmin={user.accessLevel === "org_admin"}
      />

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <SummaryCards
            completion={{
              percent: completionPercent,
              stageLabel: STAGE_LABEL[lifecycleResolution.stage],
              nextAction:
                lifecycleResolution.stage === "active_execution"
                  ? "Fully active"
                  : lifecycleResolution.nextAction.label,
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
          <RoleRoadmapPanel view={roleRoadmapView} />
          <Accordion sections={sections} defaultOpenIds={defaultOpenIds} />
        </div>

        <aside className="min-w-0 space-y-4">
          <UpcomingActions now={now} next={next} later={later} />
          <DecisionsRequiredPanel items={decisions} />
        </aside>
      </div>
    </DashboardLayout>
  );
}
