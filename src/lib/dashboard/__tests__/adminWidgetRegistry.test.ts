import { describe, expect, it } from "vitest";
import {
  ADMIN_DASHBOARD_ORDER,
  ADMIN_DASHBOARD_WIDGETS,
  LEFT_COLUMN_ORDER,
  RIGHT_COLUMN_ORDER,
} from "../adminWidgetRegistry";

describe("ADMIN_DASHBOARD_ORDER", () => {
  it("is a permutation of every registered admin widget", () => {
    const ids = ADMIN_DASHBOARD_WIDGETS.map((w) => w.id).sort();
    expect(ADMIN_DASHBOARD_ORDER.slice().sort()).toEqual(ids);
  });

  it("has no duplicate entries", () => {
    expect(new Set(ADMIN_DASHBOARD_ORDER).size).toBe(ADMIN_DASHBOARD_ORDER.length);
  });

  it("is exactly the left column followed by the right column", () => {
    expect(ADMIN_DASHBOARD_ORDER).toEqual([...LEFT_COLUMN_ORDER, ...RIGHT_COLUMN_ORDER]);
  });
});

describe("LEFT_COLUMN_ORDER / RIGHT_COLUMN_ORDER", () => {
  it("never share a widget id", () => {
    const overlap = LEFT_COLUMN_ORDER.filter((id) => RIGHT_COLUMN_ORDER.includes(id));
    expect(overlap).toEqual([]);
  });
});

describe("ADMIN_DASHBOARD_WIDGETS", () => {
  it("defaults every widget to visible", () => {
    expect(ADMIN_DASHBOARD_WIDGETS.every((w) => w.defaultVisible)).toBe(true);
  });
});
