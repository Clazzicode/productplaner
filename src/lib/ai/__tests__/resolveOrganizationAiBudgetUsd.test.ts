import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Separate file from budget.test.ts deliberately: that file statically
// imports "../budget" for its pure-function tests, and this module's own
// resolveOrganizationAiBudgetUsd/getOrganizationAiSpendThisMonthUsd need a
// mocked "@/lib/db" — mixing a vi.mock("@/lib/db", ...) factory (which
// references local consts) into a file that also statically imports the
// module under test hits a hoisting TDZ error, confirmed earlier this
// session. Dynamic import only, matching this codebase's established
// pattern for DB-backed tests (src/lib/planningWeights/__tests__/).

const organizationFindUnique = vi.fn();
const aiUsageEventAggregate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    organization: { findUnique: organizationFindUnique },
    aiUsageEvent: { aggregate: aiUsageEventAggregate },
  },
}));

const { resolveOrganizationAiBudgetUsd } = await import("../budget");

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.PLATFORM_AI_MONTHLY_BUDGET_USD;
  delete process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT;
});

describe("resolveOrganizationAiBudgetUsd", () => {
  it("returns the org's explicit override when set, ignoring the platform default entirely", async () => {
    organizationFindUnique.mockResolvedValueOnce({ aiMonthlyBudgetUsd: 500 });
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "10000";
    expect(await resolveOrganizationAiBudgetUsd("org-1")).toBe(500);
  });

  it("returns null (no cap) when no org override and no platform budget is configured — never a flat reservation with nothing to be a share of", async () => {
    organizationFindUnique.mockResolvedValueOnce({ aiMonthlyBudgetUsd: null });
    expect(await resolveOrganizationAiBudgetUsd("org-1")).toBeNull();
  });

  it("defaults to 4% of the platform budget when configured", async () => {
    organizationFindUnique.mockResolvedValueOnce({ aiMonthlyBudgetUsd: null });
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "1000";
    expect(await resolveOrganizationAiBudgetUsd("org-1")).toBeCloseTo(40, 6);
  });

  it("the org share math flows through the configurable percent, not the old hardcoded 4%", async () => {
    organizationFindUnique.mockResolvedValueOnce({ aiMonthlyBudgetUsd: null });
    process.env.PLATFORM_AI_MONTHLY_BUDGET_USD = "1000";
    process.env.PLATFORM_AI_DEFAULT_ORG_SHARE_PERCENT = "10";
    expect(await resolveOrganizationAiBudgetUsd("org-1")).toBeCloseTo(100, 6);
  });
});
