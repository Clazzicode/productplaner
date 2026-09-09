import { describe, expect, it, vi, beforeEach } from "vitest";
import { DASHBOARD_WIDGETS } from "../widgetRegistry";

const findMany = vi.fn();
const upsert = vi.fn();
const deleteMany = vi.fn();
const $transaction = vi.fn((ops: Promise<unknown>[]) => Promise.all(ops));

vi.mock("@/lib/db", () => ({
  db: {
    dashboardConfiguration: { findMany, upsert, deleteMany },
    $transaction,
  },
}));

const { getEffectiveWidgetVisibility, getRoleConfigurationView, saveRoleConfiguration, resetRoleConfiguration } =
  await import("../dashboardConfiguration");

const ORG = "org-1";
const OTHER_ORG = "org-2";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEffectiveWidgetVisibility", () => {
  it("returns all defaults when no Working Role is known — never guesses a role", async () => {
    const result = await getEffectiveWidgetVisibility(ORG, null);
    expect(findMany).not.toHaveBeenCalled();
    for (const w of DASHBOARD_WIDGETS) expect(result[w.id]).toBe(true);
  });

  it("returns all defaults when no rows exist for the org/role", async () => {
    findMany.mockResolvedValue([]);
    const result = await getEffectiveWidgetVisibility(ORG, "product_management");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, workingRole: "product_management" } }),
    );
    for (const w of DASHBOARD_WIDGETS) expect(result[w.id]).toBe(true);
  });

  it("applies a persisted override", async () => {
    findMany.mockResolvedValue([{ widgetId: "current_focus", visible: false }]);
    const result = await getEffectiveWidgetVisibility(ORG, "product_owner");
    expect(result.current_focus).toBe(false);
    expect(result.plan_health).toBe(true);
  });

  it("ignores a row whose widgetId no longer matches the registry", async () => {
    findMany.mockResolvedValue([{ widgetId: "not_a_real_widget", visible: false }]);
    const result = await getEffectiveWidgetVisibility(ORG, "product_owner");
    for (const w of DASHBOARD_WIDGETS) expect(result[w.id]).toBe(true);
  });
});

describe("role and organization isolation", () => {
  it("scopes the lookup to the given organization and Working Role only", async () => {
    findMany.mockResolvedValue([]);
    await getEffectiveWidgetVisibility(ORG, "project_manager");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG, workingRole: "project_manager" } }),
    );
  });

  it("a Product Owner override query never reads Product Management's rows (different where clause)", async () => {
    findMany.mockResolvedValue([]);
    await getEffectiveWidgetVisibility(ORG, "product_owner");
    const call = findMany.mock.calls[0][0];
    expect(call.where.workingRole).toBe("product_owner");
    expect(call.where.workingRole).not.toBe("product_management");
  });

  it("a different organization's config never leaks in (scoped by organizationId in the query)", async () => {
    findMany.mockResolvedValue([]);
    await getEffectiveWidgetVisibility(OTHER_ORG, "product_owner");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: OTHER_ORG, workingRole: "product_owner" } }));
  });
});

describe("getRoleConfigurationView", () => {
  it("marks every widget as not overridden when no rows exist", async () => {
    findMany.mockResolvedValue([]);
    const view = await getRoleConfigurationView(ORG, "product_management");
    expect(view).toHaveLength(DASHBOARD_WIDGETS.length);
    expect(view.every((w) => !w.isOverridden)).toBe(true);
    expect(view.every((w) => w.visible)).toBe(true);
  });

  it("marks an overridden widget and carries its saved value", async () => {
    findMany.mockResolvedValue([{ widgetId: "recent_activity", visible: false }]);
    const view = await getRoleConfigurationView(ORG, "product_management");
    const row = view.find((w) => w.id === "recent_activity")!;
    expect(row.isOverridden).toBe(true);
    expect(row.visible).toBe(false);
  });

  it("carries title/description straight from the registry", async () => {
    findMany.mockResolvedValue([]);
    const view = await getRoleConfigurationView(ORG, "product_management");
    const planHealth = view.find((w) => w.id === "plan_health")!;
    const registryEntry = DASHBOARD_WIDGETS.find((w) => w.id === "plan_health")!;
    expect(planHealth.title).toBe(registryEntry.title);
    expect(planHealth.description).toBe(registryEntry.description);
  });
});

describe("saveRoleConfiguration", () => {
  it("upserts one row per widget, keyed on the compound unique constraint", async () => {
    upsert.mockResolvedValue({});
    await saveRoleConfiguration(ORG, "product_management", [{ id: "plan_health", visible: false }]);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_workingRole_widgetId: { organizationId: ORG, workingRole: "product_management", widgetId: "plan_health" } },
        create: { organizationId: ORG, workingRole: "product_management", widgetId: "plan_health", visible: false },
        update: { visible: false },
      }),
    );
  });

  it("drops an unknown widget id before writing anything", async () => {
    upsert.mockResolvedValue({});
    await saveRoleConfiguration(ORG, "product_management", [{ id: "not_a_real_widget", visible: false }]);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("only writes rows for the widgets it was given, never other roles", async () => {
    upsert.mockResolvedValue({});
    // current_sprint defaults to visible — false is a genuine override.
    await saveRoleConfiguration(ORG, "product_owner", [{ id: "current_sprint", visible: false }]);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.create.workingRole).toBe("product_owner");
  });

  it("clears (never stores) a widget whose submitted value matches its registry default", async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    // plan_health defaults to visible: true — submitting true again is not an override.
    await saveRoleConfiguration(ORG, "product_management", [{ id: "plan_health", visible: true }]);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG, workingRole: "product_management" }),
      }),
    );
  });

  it("a mixed save both upserts the real override and clears the default-matching one", async () => {
    upsert.mockResolvedValue({});
    deleteMany.mockResolvedValue({ count: 1 });
    await saveRoleConfiguration(ORG, "product_management", [
      { id: "plan_health", visible: false }, // override
      { id: "current_sprint", visible: true }, // matches default
    ]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("resetRoleConfiguration", () => {
  it("deletes only the given organization/Working Role's rows", async () => {
    deleteMany.mockResolvedValue({ count: 3 });
    await resetRoleConfiguration(ORG, "project_manager");
    expect(deleteMany).toHaveBeenCalledWith({ where: { organizationId: ORG, workingRole: "project_manager" } });
  });

  it("falling back to defaults after reset requires no second default source", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    findMany.mockResolvedValue([]);
    await resetRoleConfiguration(ORG, "project_manager");
    const view = await getRoleConfigurationView(ORG, "project_manager");
    expect(view.every((w) => !w.isOverridden && w.visible)).toBe(true);
  });
});
