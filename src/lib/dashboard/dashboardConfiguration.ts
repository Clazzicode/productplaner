// Step 8E DB-facing dashboard configuration layer
// (docs/V2-DASHBOARD-CONFIGURATION.md). Mirrors src/lib/access/initiativeAccess.ts:
// every function here is a thin fetch-then-resolve wrapper — the actual
// visibility rule lives in exactly one place (dashboardConfigResolution.ts).
// Keeps Prisma's row shape out of the Standard Dashboard and the admin UI —
// both call these functions, never `db.dashboardConfiguration` directly.

import { db, withTransaction } from "@/lib/db";
import type { WorkingRole } from "@/lib/onboarding/types";
import { resolveWidgetVisibility, type WidgetVisibilityMap } from "./dashboardConfigResolution";
import { DASHBOARD_WIDGETS, type DashboardWidgetId } from "./widgetRegistry";

const VALID_WIDGET_IDS = new Set<string>(DASHBOARD_WIDGETS.map((w) => w.id));

/**
 * The Standard Dashboard's only entry point into Dashboard Configuration.
 * `workingRole === null` (onboarding incomplete, or an Org Admin with no
 * personal role) skips the database lookup entirely and returns pure
 * registry defaults — there is no role to look up a configuration for, and
 * nothing here guesses one (docs/V2-ARCHITECTURE.md §4).
 */
export async function getEffectiveWidgetVisibility(
  organizationId: string,
  workingRole: WorkingRole | null,
): Promise<WidgetVisibilityMap> {
  if (!workingRole) return resolveWidgetVisibility({});

  const rows = await db.dashboardConfiguration.findMany({
    where: { organizationId, workingRole },
    select: { widgetId: true, visible: true },
  });
  const overrides: Partial<Record<DashboardWidgetId, boolean>> = {};
  for (const row of rows) {
    if (VALID_WIDGET_IDS.has(row.widgetId)) overrides[row.widgetId as DashboardWidgetId] = row.visible;
  }
  return resolveWidgetVisibility(overrides);
}

export interface RoleWidgetConfigView {
  id: DashboardWidgetId;
  title: string;
  description: string;
  visible: boolean;
  /** True when a persisted row exists for this widget — i.e. an admin has
   * explicitly configured it, as opposed to it falling through to the
   * registry default. Lets the UI honestly show "which widgets are
   * defaults" per the brief. */
  isOverridden: boolean;
}

/** Full per-widget view for the admin UI — one row per registry widget,
 * always in registry order. */
export async function getRoleConfigurationView(
  organizationId: string,
  workingRole: WorkingRole,
): Promise<RoleWidgetConfigView[]> {
  const rows = await db.dashboardConfiguration.findMany({
    where: { organizationId, workingRole },
    select: { widgetId: true, visible: true },
  });
  const overrides = new Map(rows.map((r) => [r.widgetId, r.visible]));

  return DASHBOARD_WIDGETS.map((widget) => ({
    id: widget.id,
    title: widget.title,
    description: widget.description,
    visible: overrides.get(widget.id) ?? widget.defaultVisible,
    isOverridden: overrides.has(widget.id),
  }));
}

/**
 * Persists the admin's chosen visibility for one Working Role. Unknown
 * widget ids are dropped defensively — the registry is the only source of
 * truth for valid ids (the API route's zod schema already rejects them
 * first; this is the second, DB-layer check per the same "never trust a
 * single validation point" discipline `mutations.ts` already uses for
 * tenant isolation). Only the given role's rows are touched — every other
 * role, and every other organization, is untouched.
 *
 * Keeps the table sparse: a widget whose submitted value matches its
 * registry default is cleared (or never written) rather than stored as a
 * redundant row equal to the default. This is what makes `isOverridden` on
 * `getRoleConfigurationView` mean something real after a save — an admin
 * who changes one widget and saves still sees every other widget correctly
 * marked "Default," not falsely "explicitly configured."
 */
export async function saveRoleConfiguration(
  organizationId: string,
  workingRole: WorkingRole,
  widgets: { id: string; visible: boolean }[],
): Promise<void> {
  const defaultsById = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.defaultVisible]));
  const valid = widgets.filter((w) => VALID_WIDGET_IDS.has(w.id));
  const toUpsert = valid.filter((w) => defaultsById.get(w.id as DashboardWidgetId) !== w.visible);
  const toClear = valid.filter((w) => defaultsById.get(w.id as DashboardWidgetId) === w.visible);

  await withTransaction((tx) =>
    Promise.all([
      ...toUpsert.map((w) =>
        tx.dashboardConfiguration.upsert({
          where: { organizationId_workingRole_widgetId: { organizationId, workingRole, widgetId: w.id } },
          create: { organizationId, workingRole, widgetId: w.id, visible: w.visible },
          update: { visible: w.visible },
        }),
      ),
      ...(toClear.length > 0
        ? [
            tx.dashboardConfiguration.deleteMany({
              where: { organizationId, workingRole, widgetId: { in: toClear.map((w) => w.id) } },
            }),
          ]
        : []),
    ]),
  );
}

/**
 * Removes every persisted override for one organization/Working Role —
 * uncovering the registry defaults again. No second copy of default values
 * lives here; deleting is the entire "reset."
 */
export async function resetRoleConfiguration(organizationId: string, workingRole: WorkingRole): Promise<void> {
  await db.dashboardConfiguration.deleteMany({ where: { organizationId, workingRole } });
}
