import { beforeEach, describe, expect, it, vi } from "vitest";

const groupBy = vi.fn();
vi.mock("@/lib/db", () => ({ db: { aiUsageEvent: { groupBy } } }));

const getOrganizationAiUsageStatus = vi.fn();
vi.mock("../budget", () => ({ getOrganizationAiUsageStatus }));

const { getOrganizationUsageSummary } = await import("../reporting");

beforeEach(() => {
  vi.clearAllMocks();
  getOrganizationAiUsageStatus.mockResolvedValue({ budgetUsd: 100, spentUsd: 10, percentUsed: 10, warningLevel: null });
});

describe("getOrganizationUsageSummary", () => {
  it("returns an empty-but-valid summary when there's no usage yet", async () => {
    groupBy.mockResolvedValueOnce([]);
    const summary = await getOrganizationUsageSummary("org-1");
    expect(summary.byAction).toEqual([]);
    expect(summary.totalGenerations).toBe(0);
    expect(summary.totalReuseHits).toBe(0);
    expect(summary.totalEstimatedCostUsd).toBe(0);
    expect(summary.estimatedCostAvoidedUsd).toBe(0);
    expect(summary.budgetUsd).toBe(100);
  });

  it("separates generation and reuse counts per action", async () => {
    groupBy.mockResolvedValueOnce([
      {
        action: "PROPOSE_FEATURES",
        kind: "generation",
        _count: 3,
        _sum: { inputTokens: 300, outputTokens: 150, cacheReadInputTokens: 0, estimatedCostUsd: 0.3 },
      },
      {
        action: "PROPOSE_FEATURES",
        kind: "reuse",
        _count: 7,
        _sum: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, estimatedCostUsd: 0 },
      },
    ]);

    const summary = await getOrganizationUsageSummary("org-1");
    expect(summary.byAction).toHaveLength(1);
    expect(summary.byAction[0]).toMatchObject({
      action: "PROPOSE_FEATURES",
      generationCount: 3,
      reuseCount: 7,
      inputTokens: 300,
      outputTokens: 150,
      estimatedCostUsd: 0.3,
    });
    expect(summary.totalGenerations).toBe(3);
    expect(summary.totalReuseHits).toBe(7);
  });

  it("estimatedCostAvoidedUsd is derived as (avg cost per real generation) x reuse count, per action, summed", async () => {
    groupBy.mockResolvedValueOnce([
      {
        action: "PROPOSE_FEATURES",
        kind: "generation",
        _count: 2,
        _sum: { inputTokens: 200, outputTokens: 100, cacheReadInputTokens: 0, estimatedCostUsd: 0.2 }, // $0.10/generation
      },
      {
        action: "PROPOSE_FEATURES",
        kind: "reuse",
        _count: 5,
        _sum: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, estimatedCostUsd: 0 },
      },
    ]);

    const summary = await getOrganizationUsageSummary("org-1");
    // 0.2 / 2 generations = $0.10/generation avg; x 5 reuse hits = $0.50 avoided.
    expect(summary.estimatedCostAvoidedUsd).toBeCloseTo(0.5, 6);
  });

  it("an action with reuse hits but zero real generations contributes nothing to estimatedCostAvoidedUsd (no basis for an average)", async () => {
    groupBy.mockResolvedValueOnce([
      {
        action: "ROADMAP_INSIGHTS",
        kind: "reuse",
        _count: 4,
        _sum: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, estimatedCostUsd: 0 },
      },
    ]);

    const summary = await getOrganizationUsageSummary("org-1");
    expect(summary.estimatedCostAvoidedUsd).toBe(0);
  });

  it("passes an organizationId-scoped, date-bounded where clause to groupBy", async () => {
    groupBy.mockResolvedValueOnce([]);
    const monthStart = new Date("2027-01-01T00:00:00.000Z");
    await getOrganizationUsageSummary("org-1", { monthStart });
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1", createdAt: { gte: monthStart } },
      }),
    );
  });
});
