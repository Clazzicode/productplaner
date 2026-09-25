import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGETS } from "../widgetRegistry";
import { filterVisible, resolveWidgetVisibility } from "../dashboardConfigResolution";

describe("resolveWidgetVisibility", () => {
  it("defaults every widget to visible when there are no overrides", () => {
    const result = resolveWidgetVisibility({});
    for (const w of DASHBOARD_WIDGETS) expect(result[w.id]).toBe(true);
  });

  it("an override hides a widget", () => {
    const result = resolveWidgetVisibility({ current_focus: false });
    expect(result.current_focus).toBe(false);
    expect(result.plan_health).toBe(true);
  });

  it("an override can explicitly re-affirm visible (matches the default, harmless)", () => {
    const result = resolveWidgetVisibility({ plan_health: true });
    expect(result.plan_health).toBe(true);
  });

  it("returns exactly one entry per registered widget, no more, no less", () => {
    const result = resolveWidgetVisibility({});
    expect(Object.keys(result).sort()).toEqual(DASHBOARD_WIDGETS.map((w) => w.id).sort());
  });
});

describe("filterVisible", () => {
  it("preserves order and drops hidden widgets", () => {
    const order = ["plan_health", "current_sprint", "current_focus"] as const;
    const visibility = resolveWidgetVisibility({ current_sprint: false });
    expect(filterVisible([...order], visibility)).toEqual(["plan_health", "current_focus"]);
  });

  it("keeps everything when nothing is hidden", () => {
    const order = DASHBOARD_WIDGETS.map((w) => w.id);
    expect(filterVisible(order, resolveWidgetVisibility({}))).toEqual(order);
  });
});
