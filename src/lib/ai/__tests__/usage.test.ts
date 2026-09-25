import { describe, expect, it } from "vitest";
import { deriveScopeKey, isOverLimit, startOfCurrentMonthUtc } from "../usage";

describe("isOverLimit", () => {
  it("is false while under the limit", () => {
    expect(isOverLimit(4, 5)).toBe(false);
  });

  it("is true once the count reaches the limit", () => {
    expect(isOverLimit(5, 5)).toBe(true);
  });

  it("is true once the count exceeds the limit", () => {
    expect(isOverLimit(6, 5)).toBe(true);
  });
});

describe("deriveScopeKey", () => {
  it("uses the initiative id for an initiative-scoped action", () => {
    expect(deriveScopeKey({ userId: "user_1", initiativeId: "init_1" })).toBe("init_1");
  });

  it("falls back to the user id when there's no initiative", () => {
    expect(deriveScopeKey({ userId: "user_1", initiativeId: null })).toBe("user_1");
    expect(deriveScopeKey({ userId: "user_1" })).toBe("user_1");
  });
});

describe("startOfCurrentMonthUtc", () => {
  it("returns midnight UTC on the 1st of the given date's month", () => {
    const result = startOfCurrentMonthUtc(new Date("2026-09-09T15:42:00Z"));
    expect(result.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("handles December correctly without rolling into next year", () => {
    const result = startOfCurrentMonthUtc(new Date("2026-12-31T23:59:59Z"));
    expect(result.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});
