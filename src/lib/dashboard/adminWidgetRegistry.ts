// Organization Admin Dashboard widget registry (Step 8D —
// docs/V2-ORG-ADMIN-DASHBOARD.md). Deliberately smaller than
// widgetRegistry.ts's Standard Dashboard registry: Admin has no Working-Role
// personalization axis (docs/V2-ARCHITECTURE.md §4's open question about a
// personal admin working role remains undecided), so there is no per-role
// order to compute — one fixed composition for every Organization Admin.
//
// This still exists as its own file/registry (not folded into
// widgetRegistry.ts) so a future Step 8E could extend it with org-level
// visibility toggles without conflating two dashboards' configuration or
// forcing Standard Dashboard's per-role shape onto a page that has no role
// axis to key off.

export type AdminDashboardWidgetId =
  | "portfolio_health"
  | "admin_attention"
  | "users_intelligence"
  | "teams_intelligence"
  | "access_intelligence"
  | "delivery_intelligence"
  | "admin_timeline"
  | "integration_health";

export interface AdminDashboardWidgetDefinition {
  id: AdminDashboardWidgetId;
  title: string;
  /** Code-level default only — no persisted Dashboard Configuration exists
   * yet for the Admin Dashboard either. Every widget defaults visible. */
  defaultVisible: true;
}

export const ADMIN_DASHBOARD_WIDGETS: AdminDashboardWidgetDefinition[] = [
  { id: "portfolio_health", title: "Portfolio / Initiative Health", defaultVisible: true },
  { id: "admin_attention", title: "Admin Attention", defaultVisible: true },
  { id: "users_intelligence", title: "Users", defaultVisible: true },
  { id: "teams_intelligence", title: "Teams", defaultVisible: true },
  { id: "access_intelligence", title: "Access", defaultVisible: true },
  { id: "delivery_intelligence", title: "Delivery Intelligence", defaultVisible: true },
  { id: "admin_timeline", title: "Upcoming Timeline", defaultVisible: true },
  { id: "integration_health", title: "Integration Health", defaultVisible: true },
];

/** Desktop (`xl:` and above) two-column composition — src/app/admin/page.tsx
 * renders each column from these two lists directly, the same way
 * widgetRegistry.ts's resolveMainColumnOrder feeds the Standard Dashboard's
 * main column. No per-role variants; see module doc comment above for why. */
export const LEFT_COLUMN_ORDER: AdminDashboardWidgetId[] = [
  "portfolio_health",
  "delivery_intelligence",
  "teams_intelligence",
];

export const RIGHT_COLUMN_ORDER: AdminDashboardWidgetId[] = [
  "admin_attention",
  "users_intelligence",
  "access_intelligence",
  "admin_timeline",
  "integration_health",
];

/** Below `xl:`: single column, left column's widgets then right column's —
 * same "collapse the two-column order" rule the Standard Dashboard's narrow
 * layout uses. */
export const ADMIN_DASHBOARD_ORDER: AdminDashboardWidgetId[] = [...LEFT_COLUMN_ORDER, ...RIGHT_COLUMN_ORDER];
