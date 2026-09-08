// Standard Dashboard widget registry (Step 7B — docs/V2-STANDARD-DASHBOARD.md).
//
// Pure data, no React and no I/O, so ordering logic is unit-testable in isolation.
// This is deliberately NOT a database-backed configuration table: per
// docs/V2-ACCESS-TEAMS-VISIBILITY.md §13/§18, Dashboard Configuration is a future
// (Step 8) org-scoped model kept architecturally separate from authorization. This
// registry is the code-level default every org gets until that model exists —
// see "widgetVisible" below for the seam a future config layer plugs into.
//
// Working Role only ever changes ORDER (emphasis). It must never determine
// whether a widget is *authorized* — that's Resource Access + Member Type
// (docs/V2-ACCESS-TEAMS-VISIBILITY.md §1), which this file has no knowledge of.

import type { WorkingRole } from "@/lib/onboarding/types";

export type DashboardWidgetId =
  | "plan_health"
  | "current_sprint"
  | "roadmap_snapshot"
  | "current_focus"
  | "initiative_summary"
  | "upcoming_timeline"
  | "attention"
  | "upcoming_actions"
  | "recent_activity";

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  /** Business-purpose language for the Dashboard Configuration admin UI
   * (Step 8E — docs/V2-DASHBOARD-CONFIGURATION.md) — what the widget shows,
   * never how it's implemented. This is the single source of truth; nothing
   * hardcodes widget copy a second time anywhere else. */
  description: string;
  /** Code-level default — the fallback whenever no
   * `DashboardConfiguration` row exists for an organization/Working Role
   * (Step 8E). Every widget defaults visible today. */
  defaultVisible: true;
}

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  {
    id: "plan_health",
    title: "Plan Health",
    description: "Shows the health and progress of the current plan.",
    defaultVisible: true,
  },
  {
    id: "current_sprint",
    title: "Current Sprint",
    description: "Shows sprint status, planned work, and capacity.",
    defaultVisible: true,
  },
  {
    id: "roadmap_snapshot",
    title: "Roadmap Snapshot",
    description: "Shows the current roadmap phase and next milestone.",
    defaultVisible: true,
  },
  {
    id: "current_focus",
    title: "My Work / Current Focus",
    description: "Shows currently planned work for the team.",
    defaultVisible: true,
  },
  {
    id: "initiative_summary",
    title: "Your Initiatives",
    description: "Shows your initiatives and their status.",
    defaultVisible: true,
  },
  {
    id: "upcoming_timeline",
    title: "Upcoming Timeline",
    description: "Shows upcoming sprint, release, and launch dates.",
    defaultVisible: true,
  },
  {
    id: "attention",
    title: "Attention",
    description: "Shows items that need review or a decision.",
    defaultVisible: true,
  },
  {
    id: "upcoming_actions",
    title: "Upcoming Actions",
    description: "Shows suggested next steps for the plan.",
    defaultVisible: true,
  },
  {
    id: "recent_activity",
    title: "Recent Activity",
    description: "Shows recent changes to the plan.",
    defaultVisible: true,
  },
];

/**
 * Default emphasis/order per Working Role. Every role orders the same nine
 * widgets — Working Role changes emphasis, never which widgets exist or what
 * data they're authorized to show (docs/V2-STANDARD-DASHBOARD.md §7).
 *
 * "upcoming_timeline" always renders in its own right-rail slot on desktop
 * regardless of rank (§11 of the same doc) — its position here only governs
 * where it falls when the layout collapses to a single column on narrow
 * screens, per the Standard Dashboard's responsive ordering rule.
 */
export const ROLE_WIDGET_ORDER: Record<WorkingRole, DashboardWidgetId[]> = {
  product_management: [
    "plan_health",
    "roadmap_snapshot",
    "initiative_summary",
    "upcoming_timeline",
    "attention",
    "upcoming_actions",
    "current_sprint",
    "current_focus",
    "recent_activity",
  ],
  project_manager: [
    "upcoming_timeline",
    "current_sprint",
    "roadmap_snapshot",
    "attention",
    "upcoming_actions",
    "plan_health",
    "initiative_summary",
    "current_focus",
    "recent_activity",
  ],
  developer: [
    "current_sprint",
    "current_focus",
    "attention",
    "upcoming_actions",
    "recent_activity",
    "plan_health",
    "roadmap_snapshot",
    "upcoming_timeline",
    "initiative_summary",
  ],
};

/** Used when no Working Role is known yet (e.g. onboarding incomplete, or an
 * Org Admin with no personal role selected — an open question per
 * docs/V2-ARCHITECTURE.md §4, not decided here). A neutral, PM-leaning default
 * rather than guessing a role. */
const DEFAULT_ORDER: DashboardWidgetId[] = [
  "plan_health",
  "current_sprint",
  "roadmap_snapshot",
  "initiative_summary",
  "upcoming_timeline",
  "attention",
  "current_focus",
  "upcoming_actions",
  "recent_activity",
];

export function resolveDashboardOrder(role: WorkingRole | null | undefined): DashboardWidgetId[] {
  if (role && ROLE_WIDGET_ORDER[role]) return ROLE_WIDGET_ORDER[role];
  return DEFAULT_ORDER;
}

/** Widgets in role order, excluding the timeline (which has its own fixed
 * right-rail slot on desktop — see module doc comment above). */
export function resolveMainColumnOrder(role: WorkingRole | null | undefined): DashboardWidgetId[] {
  return resolveDashboardOrder(role).filter((id) => id !== "upcoming_timeline");
}
