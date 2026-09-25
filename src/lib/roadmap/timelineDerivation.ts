// Pure Timeline derivation rules (Step 9B, docs/V2-ROADMAP-TIMELINE.md §4/§8).
// No Prisma here on purpose — kept unit-testable without a database, matching
// the existing health.ts / buildPlan.ts convention. The DB-facing loader
// (loadRoadmapTimelineData.ts) calls these with data it has already fetched.

import { scheduleHealth } from "@/lib/generation/health";

// ---------- schedule (start/end) derivation ----------

export type ScheduleSource = "sprints" | "phase_range" | "unscheduled";

export interface DerivedSchedule {
  start: Date | null;
  end: Date | null;
  source: ScheduleSource;
}

/**
 * Feature dates = earliest start / latest end across the Sprints its Stories
 * actually landed in (§4/§9A). Falls back to the roadmap_phase's own cached
 * date range only for Kanban (`continuous_flow`, which never creates Sprint
 * rows), and never fabricates a date otherwise — a Feature with no scheduled
 * Stories is `"unscheduled"`.
 */
export function deriveFeatureSchedule(args: {
  spannedSprints: { startDate: Date; endDate: Date }[];
  phaseRange: { start: Date; end: Date } | null;
  isContinuousFlow: boolean;
}): DerivedSchedule {
  if (args.spannedSprints.length > 0) {
    const start = args.spannedSprints.reduce(
      (min, s) => (s.startDate < min ? s.startDate : min),
      args.spannedSprints[0].startDate,
    );
    const end = args.spannedSprints.reduce(
      (max, s) => (s.endDate > max ? s.endDate : max),
      args.spannedSprints[0].endDate,
    );
    return { start, end, source: "sprints" };
  }
  if (args.isContinuousFlow && args.phaseRange) {
    return { start: args.phaseRange.start, end: args.phaseRange.end, source: "phase_range" };
  }
  return { start: null, end: null, source: "unscheduled" };
}

// ---------- health derivation ----------

/**
 * Extends the real 3-tier `HealthStatus` (health.ts) with a 4th tier at read
 * time only — never a second health engine, never a stored field. "warning"
 * (orange) and "critical" (red) are both what `scheduleHealth` already calls
 * `"at_risk"`, split by one additional real signal `scheduleHealth` doesn't
 * have: whether the Feature's own derived end date has already passed.
 * Over capacity but not yet due = "approaching issue" (orange); over
 * capacity AND already past its date = "overdue/problem" (red). This is the
 * first real consumer of the reserved `health-warning` token
 * (docs/V2-DESIGN-SYSTEM.md §10) — deliberately not forced onto the other
 * two tiers, which keep their existing meaning unchanged.
 */
export type TimelineHealth = "on_track" | "attention" | "warning" | "critical";

export const TIMELINE_HEALTH_LABELS: Record<TimelineHealth, string> = {
  on_track: "On track",
  attention: "Attention",
  warning: "Approaching issue",
  critical: "Overdue",
};

export function deriveFeatureHealth(args: {
  /** True if any Sprint this Feature's Stories fall into is itself
   *  over-allocated (computeCapacityForecast) — reused verbatim, exactly the
   *  same signal Release/Initiative health already use, just scoped to this
   *  Feature's own spanned sprints. */
  anyOverAllocated: boolean;
  featurePoints: number;
  spannedCapacity: number;
  end: Date | null;
  today: Date;
}): TimelineHealth {
  const base = args.anyOverAllocated ? "at_risk" : scheduleHealth(args.featurePoints, args.spannedCapacity);
  if (base === "on_track" || base === "attention") return base;
  // base === "at_risk": split by date proximity — the one signal scheduleHealth doesn't have.
  return args.end && args.today > args.end ? "critical" : "warning";
}
