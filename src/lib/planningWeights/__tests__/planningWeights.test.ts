import { beforeEach, describe, expect, it, vi } from "vitest";
import { VALUE_FACTOR_WEIGHTS } from "@/lib/generation/constants";

const overrideFindUnique = vi.fn();
const overrideFindMany = vi.fn();
const overrideUpsert = vi.fn();
const overrideDeleteMany = vi.fn();
const capabilityFindMany = vi.fn();
const capabilityUpdate = vi.fn();

const withTransaction = vi.fn((fn: (tx: unknown) => unknown) =>
  fn({
    planningWeightOverride: { upsert: overrideUpsert, deleteMany: overrideDeleteMany },
    capability: { findMany: capabilityFindMany, update: capabilityUpdate },
  }),
);

vi.mock("@/lib/db", () => ({
  db: {
    planningWeightOverride: { findUnique: overrideFindUnique, findMany: overrideFindMany },
  },
  withTransaction,
}));

const { getEffectiveWeights, getWeightConfigurationView, saveWeightConfiguration, resetWeightConfiguration, InvalidWeightSetError } =
  await import("../planningWeights");

const INITIATIVE = "init-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getEffectiveWeights", () => {
  it("returns defaults when no override row exists", async () => {
    overrideFindUnique.mockResolvedValue(null);
    const weights = await getEffectiveWeights(INITIATIVE, "valueFactorWeights");
    expect(weights).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("applies a valid persisted override", async () => {
    const override = { customerImpact: 0.4, revenueImpact: 0.4, strategicAlignment: 0.1, riskCompliance: 0.1 };
    overrideFindUnique.mockResolvedValue({ weightsJson: JSON.stringify(override) });
    const weights = await getEffectiveWeights(INITIATIVE, "valueFactorWeights");
    expect(weights).toEqual(override);
  });

  it("scopes the lookup to the given initiative and weight set", async () => {
    overrideFindUnique.mockResolvedValue(null);
    await getEffectiveWeights(INITIATIVE, "priorityWeights");
    expect(overrideFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { initiativeId_weightSetId: { initiativeId: INITIATIVE, weightSetId: "priorityWeights" } },
      }),
    );
  });
});

describe("getWeightConfigurationView", () => {
  it("marks both sets as not overridden when no rows exist", async () => {
    overrideFindMany.mockResolvedValue([]);
    const view = await getWeightConfigurationView(INITIATIVE);
    expect(view).toHaveLength(2);
    expect(view.every((s) => !s.isOverridden)).toBe(true);
    expect(view.find((s) => s.id === "valueFactorWeights")!.weights).toEqual(VALUE_FACTOR_WEIGHTS);
  });

  it("marks an overridden set and carries its saved weights", async () => {
    const override = { customerImpact: 0.4, revenueImpact: 0.4, strategicAlignment: 0.1, riskCompliance: 0.1 };
    overrideFindMany.mockResolvedValue([{ weightSetId: "valueFactorWeights", weightsJson: JSON.stringify(override) }]);
    const view = await getWeightConfigurationView(INITIATIVE);
    const row = view.find((s) => s.id === "valueFactorWeights")!;
    expect(row.isOverridden).toBe(true);
    expect(row.weights).toEqual(override);
  });
});

describe("saveWeightConfiguration", () => {
  it("rejects a weight set that doesn't sum to 1.0", async () => {
    const bad = { customerImpact: 0.5, revenueImpact: 0.5, strategicAlignment: 0.5, riskCompliance: 0.5 };
    await expect(saveWeightConfiguration(INITIATIVE, "valueFactorWeights", bad)).rejects.toThrow(InvalidWeightSetError);
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it("rejects an incomplete weight set", async () => {
    const partial = { customerImpact: 0.6, revenueImpact: 0.4 };
    await expect(saveWeightConfiguration(INITIATIVE, "valueFactorWeights", partial)).rejects.toThrow(InvalidWeightSetError);
  });

  it("upserts a valid override that differs from the default", async () => {
    overrideUpsert.mockResolvedValue({});
    capabilityFindMany.mockResolvedValue([]);
    const override = { customerImpact: 0.4, revenueImpact: 0.4, strategicAlignment: 0.1, riskCompliance: 0.1 };
    await saveWeightConfiguration(INITIATIVE, "valueFactorWeights", override);
    expect(overrideUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { initiativeId_weightSetId: { initiativeId: INITIATIVE, weightSetId: "valueFactorWeights" } },
        create: { initiativeId: INITIATIVE, weightSetId: "valueFactorWeights", weightsJson: JSON.stringify(override) },
      }),
    );
    expect(overrideDeleteMany).not.toHaveBeenCalled();
  });

  it("clears (never stores) a submitted set that matches the registry default", async () => {
    overrideDeleteMany.mockResolvedValue({ count: 0 });
    capabilityFindMany.mockResolvedValue([]);
    await saveWeightConfiguration(INITIATIVE, "valueFactorWeights", { ...VALUE_FACTOR_WEIGHTS });
    expect(overrideUpsert).not.toHaveBeenCalled();
    expect(overrideDeleteMany).toHaveBeenCalledWith({ where: { initiativeId: INITIATIVE, weightSetId: "valueFactorWeights" } });
  });

  it("bulk-recomputes businessValueScore/businessValue for capabilities using weighted sub-factors", async () => {
    overrideUpsert.mockResolvedValue({});
    capabilityFindMany.mockResolvedValue([
      { id: "cap-1", customerImpactScore: 5, revenueImpactScore: 5, strategicAlignmentScore: 5, riskComplianceScore: 5 },
      { id: "cap-2", customerImpactScore: null, revenueImpactScore: null, strategicAlignmentScore: null, riskComplianceScore: null },
    ]);
    capabilityUpdate.mockResolvedValue({});
    const override = { customerImpact: 1, revenueImpact: 0, strategicAlignment: 0, riskCompliance: 0 };
    await saveWeightConfiguration(INITIATIVE, "valueFactorWeights", override);
    // cap-1 has all four sub-factors -> recomputed; cap-2 doesn't -> skipped.
    expect(capabilityUpdate).toHaveBeenCalledTimes(1);
    expect(capabilityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cap-1" }, data: { businessValueScore: 5, businessValue: "critical" } }),
    );
  });

  it("does not touch capabilities when saving priorityWeights (priority score is never persisted)", async () => {
    overrideUpsert.mockResolvedValue({});
    const override = { businessValue: 0.4, mvpImportance: 0.3, dependencyImportance: 0.2, riskReduction: 0.1 };
    await saveWeightConfiguration(INITIATIVE, "priorityWeights", override);
    expect(capabilityFindMany).not.toHaveBeenCalled();
  });
});

describe("resetWeightConfiguration", () => {
  it("deletes only the given initiative/weight-set row", async () => {
    overrideDeleteMany.mockResolvedValue({ count: 1 });
    await resetWeightConfiguration(INITIATIVE, "priorityWeights");
    expect(overrideDeleteMany).toHaveBeenCalledWith({ where: { initiativeId: INITIATIVE, weightSetId: "priorityWeights" } });
  });

  it("bulk-recomputes back to defaults for valueFactorWeights", async () => {
    overrideDeleteMany.mockResolvedValue({ count: 1 });
    capabilityFindMany.mockResolvedValue([
      { id: "cap-1", customerImpactScore: 3, revenueImpactScore: 3, strategicAlignmentScore: 3, riskComplianceScore: 3 },
    ]);
    capabilityUpdate.mockResolvedValue({});
    await resetWeightConfiguration(INITIATIVE, "valueFactorWeights");
    expect(capabilityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cap-1" }, data: { businessValueScore: 3, businessValue: "medium" } }),
    );
  });
});
