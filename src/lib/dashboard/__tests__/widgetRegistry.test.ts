import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGETS,
  resolveDashboardOrder,
  resolveMainColumnOrder,
} from "../widgetRegistry";

describe("resolveDashboardOrder", () => {
  it("returns a permutation of every registered widget for each working role", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id).sort();
    for (const role of ["product_management", "project_manager", "product_owner"] as const) {
      expect(resolveDashboardOrder(role).slice().sort()).toEqual(ids);
    }
  });

  it("falls back to a neutral default when no working role is known", () => {
    const ids = DASHBOARD_WIDGETS.map((w) => w.id).sort();
    expect(resolveDashboardOrder(null).slice().sort()).toEqual(ids);
    expect(resolveDashboardOrder(undefined).slice().sort()).toEqual(ids);
  });

  it("puts Upcoming Timeline first for Project Manager", () => {
    expect(resolveDashboardOrder("project_manager")[0]).toBe("upcoming_timeline");
  });

  it("puts Current Sprint first for Product Owner", () => {
    expect(resolveDashboardOrder("product_owner")[0]).toBe("current_sprint");
  });

  it("puts Plan Health first for Product Management", () => {
    expect(resolveDashboardOrder("product_management")[0]).toBe("plan_health");
  });
});

describe("resolveMainColumnOrder", () => {
  it("excludes upcoming_timeline, which renders in its own right-rail slot", () => {
    for (const role of ["product_management", "project_manager", "product_owner", null] as const) {
      expect(resolveMainColumnOrder(role)).not.toContain("upcoming_timeline");
    }
  });
});
