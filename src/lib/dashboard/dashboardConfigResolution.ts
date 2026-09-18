// Step 8E canonical visibility resolution (docs/V2-DASHBOARD-CONFIGURATION.md).
//
// Pure, DB-agnostic — mirrors src/lib/access/resolution.ts's "one pure
// function, called by everything else" shape. Dashboard Configuration is
// presentation only: this function decides which already-authorized widgets
// render, never what data a user may reach (docs/V2-STANDARD-DASHBOARD.md
// §8/§9). It has no knowledge of accessLevel, memberType, or InitiativeAccess
// and must never be given any.

import { DASHBOARD_WIDGETS, type DashboardWidgetId } from "./widgetRegistry";

export type WidgetVisibilityOverrides = Partial<Record<DashboardWidgetId, boolean>>;
export type WidgetVisibilityMap = Record<DashboardWidgetId, boolean>;

/**
 * For every widget in the registry, a persisted override wins if present;
 * otherwise the registry's own `defaultVisible` applies. An override key
 * that doesn't match a known widget id is silently ignored — the registry
 * remains the only source of truth for which widget ids are valid
 * (docs/V2-DASHBOARD-CONFIGURATION.md "Widget Registry Integration").
 */
export function resolveWidgetVisibility(overrides: WidgetVisibilityOverrides): WidgetVisibilityMap {
  const result = {} as WidgetVisibilityMap;
  for (const widget of DASHBOARD_WIDGETS) {
    const override = overrides[widget.id];
    result[widget.id] = override ?? widget.defaultVisible;
  }
  return result;
}

/** Filters an already-ordered widget id list down to the visible ones,
 * preserving order — the seam `src/app/home/page.tsx` applies on top of
 * `resolveDashboardOrder`/`resolveMainColumnOrder`. */
export function filterVisible(order: DashboardWidgetId[], visibility: WidgetVisibilityMap): DashboardWidgetId[] {
  return order.filter((id) => visibility[id]);
}
