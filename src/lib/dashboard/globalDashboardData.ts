// Standard (global) Dashboard data loader — Step 7B, docs/V2-STANDARD-DASHBOARD.md.
//
// Read-only against existing tables. No Prisma changes, no writes, no new
// health/cost calculations — every number here is either a real column or
// computed via the exact same functions the initiative dashboard
// (src/app/initiatives/[initiativeId]/dashboard/page.tsx, untouched) already
// uses. Deliberately excludes budget/cost figures — see docs/V2-STANDARD-DASHBOARD.md
// §8 for why, tied to docs/V2-ACCESS-TEAMS-VISIBILITY.md's sensitive-data rules.
//
// Authorization readiness (docs/V2-ACCESS-TEAMS-VISIBILITY.md §5, §20):
// `authorizedInitiativeIds` is the seam a future real authorization layer plugs
// into. Today it is always `null` (nothing enforces it yet — every initiative
// this demo user owns is implicitly "authorized"), but every query below is
// already shaped to accept a narrower id list instead of trusting `userId`
// ownership alone, so wiring real Resource Access later does not require
// touching this file's query shape — only the value passed in from the caller.

import type { DecisionItem } from "@/components/dashboard/DecisionsRequiredPanel";
import type { ActivityItem } from "@/components/dashboard/RecentActivity";
import type { ReleaseSummaryView, SprintSummaryView } from "@/components/dashboard/SprintReleaseStatus";
import type { UpcomingAction } from "@/components/dashboard/UpcomingActions";
import { db } from "@/lib/db";
import { computeCapacityForecast } from "@/lib/generation/capacityForecast";
import { PHASE_NAMES } from "@/lib/generation/constants";
import { loadIntakeInput } from "@/lib/generation/engine";
import { scheduleHealth, type HealthStatus } from "@/lib/generation/health";
import { LAYER_LABELS, LAYER_SEQUENCE, type LayerType } from "@/lib/generation/types";
import { validateIntake } from "@/lib/generation/validateIntake";

export interface InitiativeOverview {
  id: string;
  name: string;
  status: string;
  updatedAt: Date;
  lockedCount: number;
  totalLayers: number;
  isPrimary: boolean;
}

export interface TimelineEntry {
  date: Date;
  label: string;
  kind: "sprint" | "release" | "launch";
  /** Only set when the user has more than one generated initiative — a
   * single-initiative timeline doesn't need to repeat its own name. */
  initiativeName: string | null;
  href: string;
}

export interface PrimaryInitiativeDetail {
  id: string;
  name: string;
  completionPercent: number;
  lockedCount: number;
  totalLayers: number;
  activeLayerLabel: string | null;
  scheduleHealth: HealthStatus;
  currentPhaseName: string;
  nextMilestone: { label: string; date: Date } | null;
  currentSprint: SprintSummaryView | null;
  releases: ReleaseSummaryView[];
  focusStories: { id: string; title: string; points: number | null }[];
  focusLabel: string;
  decisions: DecisionItem[];
  activity: ActivityItem[];
  actions: { now: UpcomingAction[]; next: UpcomingAction[]; later: UpcomingAction[] };
}

export interface GlobalDashboardData {
  greeting: string;
  operationalSummary: string;
  initiatives: InitiativeOverview[];
  primary: PrimaryInitiativeDetail | null;
  timeline: TimelineEntry[];
}

function timeOfDayGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function buildOperationalSummary(params: {
  activeCount: number;
  attentionCount: number;
  nextCheckpoint: TimelineEntry | null;
}): string {
  const { activeCount, attentionCount, nextCheckpoint } = params;
  if (activeCount === 0) {
    return "You don't have any initiatives yet — start your first plan to see your dashboard come to life.";
  }
  const initiativeClause = `${activeCount} ${activeCount === 1 ? "initiative is" : "initiatives are"} active`;
  const attentionClause =
    attentionCount === 0
      ? "nothing needs attention right now"
      : `${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} attention`;
  const checkpointClause = nextCheckpoint
    ? ` Your next checkpoint is ${nextCheckpoint.label.toLowerCase()} on ${nextCheckpoint.date.toLocaleDateString()}.`
    : "";
  return `${initiativeClause}. ${capitalize(attentionClause)}.${checkpointClause}`;
}

export async function loadGlobalDashboardData(
  userId: string,
  authorizedInitiativeIds: string[] | null,
): Promise<GlobalDashboardData> {
  const today = new Date();

  // Step 8C: once a real authorized-initiative list is supplied, it is the
  // *complete* filter — an Organization Admin's list legitimately includes
  // initiatives they didn't personally create, so `userId` must not also be
  // ANDed in here. `userId` only remains the filter for the (now purely
  // defensive) `null` fallback — see docs/V2-RESOURCE-ACCESS.md §16.
  const initiatives = await db.initiative.findMany({
    where: authorizedInitiativeIds ? { id: { in: authorizedInitiativeIds } } : { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      prototype: { include: { layerLocks: true } },
      syncConnections: true,
      integrationConnections: { select: { lastSyncAt: true, provider: { select: { name: true } } } },
      intakeAnswerSet: { select: { updatedAt: true } },
    },
  });

  const primaryInitiative = initiatives.find((i) => i.status === "generated") ?? initiatives[0] ?? null;

  const initiativeOverviews: InitiativeOverview[] = initiatives.map((i) => ({
    id: i.id,
    name: i.name,
    status: i.status,
    updatedAt: i.updatedAt,
    lockedCount: (i.prototype?.layerLocks ?? []).filter((l) => l.state === "locked").length,
    totalLayers: LAYER_SEQUENCE.length,
    isPrimary: primaryInitiative?.id === i.id,
  }));

  // ---------- primary initiative detail ----------
  let primary: PrimaryInitiativeDetail | null = null;
  if (primaryInitiative && primaryInitiative.status === "generated" && primaryInitiative.prototype) {
    const prototype = primaryInitiative.prototype;
    const [sprints, releases, stories] = await Promise.all([
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
        orderBy: { order: "asc" },
        select: { id: true, title: true, points: true, sprintId: true, createdAt: true },
      }),
    ]);

    const locks = prototype.layerLocks;
    const isLocked = (t: LayerType) => locks.find((l) => l.layerType === t)?.state === "locked";
    const lockedCount = LAYER_SEQUENCE.filter(isLocked).length;
    const activeLayer = LAYER_SEQUENCE.find((t) => !isLocked(t)) ?? null;
    const completionPercent = Math.round((lockedCount / LAYER_SEQUENCE.length) * 100);

    const forecast = computeCapacityForecast(sprints);
    const overAllocated = forecast.filter((f) => f.status === "over-allocated");
    const totalPlannedPoints = stories.reduce((n, s) => n + (s.points ?? 1), 0);
    const totalCapacity = sprints.reduce((n, s) => n + s.capacityPoints, 0);
    const overallSchedule: HealthStatus =
      overAllocated.length > 0 ? "at_risk" : scheduleHealth(totalPlannedPoints, totalCapacity);
    const oversizedStories = stories.filter((s) => (s.points ?? 1) >= 13).length;

    const currentSprintRow = sprints.find((s) => s.endDate >= today) ?? sprints[sprints.length - 1] ?? null;
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
        health: relForecast.some((f) => f.status === "over-allocated") ? "at_risk" : scheduleHealth(points, capacity),
      };
    });

    const currentPhaseName = PHASE_NAMES[currentSprintRow?.phaseNumber ?? 1] ?? PHASE_NAMES[1];
    const upcomingRelease = releases.find((r) => r.targetDate >= today) ?? releases[releases.length - 1] ?? null;
    const nextMilestone = upcomingRelease ? { label: upcomingRelease.name, date: upcomingRelease.targetDate } : null;

    // "My Work" has no real per-user assignment data yet (ArtifactLayer has no
    // assigneeId) — see docs/V2-STANDARD-DASHBOARD.md §6. Honest substitute:
    // this sprint's planned stories, or the most recently planned stories when
    // there's no current sprint (e.g. continuous-flow methodology).
    let focusStories: { id: string; title: string; points: number | null }[];
    let focusLabel: string;
    if (currentSprintRow) {
      focusStories = stories.filter((s) => s.sprintId === currentSprintRow.id).slice(0, 6);
      focusLabel = `Planned in Sprint ${currentSprintRow.sprintNumber}`;
    } else {
      focusStories = stories
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 6);
      focusLabel = "Recently planned stories";
    }

    const ws = (slug: string) => `/initiatives/${primaryInitiative.id}/workspace/${slug}`;
    const layerHref = (t: LayerType) => (t === "roadmap" ? ws("roadmap") : t === "feature_hierarchy" ? ws("features") : ws("epics"));

    // Deliberately no cost/budget decision item here (unlike the initiative
    // dashboard) — the global Standard Dashboard doesn't surface financial
    // figures for any user yet. See docs/V2-STANDARD-DASHBOARD.md §8.
    const decisions: DecisionItem[] = [];
    if (activeLayer) {
      decisions.push({
        title: `${LAYER_LABELS[activeLayer]} is ready to review and lock`,
        impact: "Downstream layers can't lock until this one does (strict waterfall sequence).",
        action: `Review the generated ${LAYER_LABELS[activeLayer].toLowerCase()} and lock the layer.`,
        href: layerHref(activeLayer),
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
    const intakeInput = await loadIntakeInput(primaryInitiative.id);
    const broadWarnings = validateIntake(intakeInput).warnings.filter((w) => w.code === "capability_too_broad");
    for (const w of broadWarnings) {
      decisions.push({
        title: w.message.split(".")[0],
        impact: "Broad capabilities produce coarse estimates and risky sprints.",
        action: "Split the capability in the intake before re-generating.",
        href: `/initiatives/${primaryInitiative.id}/intake`,
        severity: "warning",
      });
    }

    const activity: ActivityItem[] = [
      ...(primaryInitiative.intakeAnswerSet ? [{ when: primaryInitiative.intakeAnswerSet.updatedAt, label: "Intake updated" }] : []),
      { when: prototype.createdAt, label: "Working prototype generated" },
      ...locks
        .filter((l) => l.lockedAt && l.state === "locked")
        .map((l) => ({ when: l.lockedAt!, label: `${LAYER_LABELS[l.layerType as LayerType]} locked` })),
      ...(prototype.approvedAt ? [{ when: prototype.approvedAt, label: "Baseline approved" }] : []),
      ...primaryInitiative.syncConnections
        .filter((c) => c.lastSyncedAt)
        .map((c) => ({ when: c.lastSyncedAt!, label: "Jira sync completed" })),
      ...primaryInitiative.integrationConnections
        .filter((c) => c.lastSyncAt)
        .map((c) => ({ when: c.lastSyncAt!, label: `${c.provider.name} sync completed` })),
    ]
      .sort((a, b) => b.when.getTime() - a.when.getTime())
      .slice(0, 6);

    const now: UpcomingAction[] = [];
    const next: UpcomingAction[] = [];
    const later: UpcomingAction[] = [];
    if (activeLayer) now.push({ label: `Review & lock ${LAYER_LABELS[activeLayer]}`, href: layerHref(activeLayer) });
    if (overAllocated.length > 0) next.push({ label: `Rebalance sprint ${overAllocated[0].sprintNumber}`, href: ws("sprints") });
    next.push({ label: "Review capacity assumptions", href: ws("capacity") });
    later.push({ label: "Generate executive presentation", href: ws("executive") });
    later.push({ label: "Run an integration sync", href: "/integrations" });

    primary = {
      id: primaryInitiative.id,
      name: primaryInitiative.name,
      completionPercent,
      lockedCount,
      totalLayers: LAYER_SEQUENCE.length,
      activeLayerLabel: activeLayer ? LAYER_LABELS[activeLayer] : null,
      scheduleHealth: overallSchedule,
      currentPhaseName,
      nextMilestone,
      currentSprint,
      releases: releaseViews,
      focusStories,
      focusLabel,
      decisions,
      activity,
      actions: { now, next, later },
    };
  }

  // ---------- cross-initiative upcoming timeline ----------
  const generatedInitiatives = initiatives.filter((i) => i.status === "generated" && i.prototype);
  const prototypeIds = generatedInitiatives.map((i) => i.prototype!.id);
  const prototypeToInitiative = new Map(generatedInitiatives.map((i) => [i.prototype!.id, i]));
  const multiInitiative = generatedInitiatives.length > 1;

  const [timelineSprints, timelineReleases] =
    prototypeIds.length > 0
      ? await Promise.all([
          db.sprint.findMany({
            where: { prototypeId: { in: prototypeIds }, endDate: { gte: today } },
            orderBy: { startDate: "asc" },
            take: 20,
          }),
          db.release.findMany({
            where: { prototypeId: { in: prototypeIds }, targetDate: { gte: today } },
            orderBy: { targetDate: "asc" },
            take: 20,
          }),
        ])
      : [[], []];

  const timeline: TimelineEntry[] = [
    ...timelineSprints.map((s) => {
      const init = prototypeToInitiative.get(s.prototypeId)!;
      return {
        date: s.startDate,
        label: `Sprint ${s.sprintNumber} starts`,
        kind: "sprint" as const,
        initiativeName: multiInitiative ? init.name : null,
        href: `/initiatives/${init.id}/workspace/sprints`,
      };
    }),
    ...timelineReleases.map((r) => {
      const init = prototypeToInitiative.get(r.prototypeId)!;
      return {
        date: r.targetDate,
        label: `${r.name} target`,
        kind: "release" as const,
        initiativeName: multiInitiative ? init.name : null,
        href: `/initiatives/${init.id}/workspace/sprints`,
      };
    }),
    ...initiatives
      .filter((i) => i.targetLaunchDate != null && i.targetLaunchDate >= today)
      .map((i) => ({
        date: i.targetLaunchDate!,
        label: `${i.name} go-live target`,
        kind: "launch" as const,
        initiativeName: multiInitiative ? i.name : null,
        href: i.status === "generated" ? `/initiatives/${i.id}/dashboard` : `/initiatives/${i.id}/intake`,
      })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 8);

  const attentionCount = primary?.decisions.length ?? 0;
  const operationalSummary = buildOperationalSummary({
    activeCount: initiatives.length,
    attentionCount,
    nextCheckpoint: timeline[0] ?? null,
  });

  return {
    greeting: timeOfDayGreeting(today),
    operationalSummary,
    initiatives: initiativeOverviews,
    primary,
    timeline,
  };
}
