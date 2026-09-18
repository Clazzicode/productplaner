import { beforeEach, describe, expect, it, vi } from "vitest";

const intakeAnswerSetFindUnique = vi.fn();
const riskFindMany = vi.fn();
const artifactLayerFindUniqueOrThrow = vi.fn();
const initiativeFindUniqueOrThrow = vi.fn();
const projectFindUniqueOrThrow = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    intakeAnswerSet: { findUnique: intakeAnswerSetFindUnique },
    risk: { findMany: riskFindMany },
    artifactLayer: { findUniqueOrThrow: artifactLayerFindUniqueOrThrow },
    initiative: { findUniqueOrThrow: initiativeFindUniqueOrThrow },
    project: { findUniqueOrThrow: projectFindUniqueOrThrow },
  },
}));

const {
  computeDependencyObservationFingerprint,
  computeRiskObservationFingerprint,
  computeContentProposalFingerprint,
  computeStatusRecommendationFingerprint,
} = await import("../fingerprint");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeDependencyObservationFingerprint", () => {
  const capabilities = [
    { id: "cap-1", name: "A", dependsOnEdges: [] },
    { id: "cap-2", name: "B", dependsOnEdges: [{ toCapabilityId: "cap-1" }] },
  ];

  it("is stable under capability array reordering", async () => {
    intakeAnswerSetFindUnique.mockResolvedValueOnce({ capabilities });
    const a = await computeDependencyObservationFingerprint("init-1");
    intakeAnswerSetFindUnique.mockResolvedValueOnce({ capabilities: [...capabilities].reverse() });
    const b = await computeDependencyObservationFingerprint("init-1");
    expect(a).toBe(b);
  });

  it("changes when a new dependency edge is added", async () => {
    intakeAnswerSetFindUnique.mockResolvedValueOnce({ capabilities });
    const before = await computeDependencyObservationFingerprint("init-1");
    intakeAnswerSetFindUnique.mockResolvedValueOnce({
      capabilities: [{ ...capabilities[0], dependsOnEdges: [{ toCapabilityId: "cap-2" }] }, capabilities[1]],
    });
    const after = await computeDependencyObservationFingerprint("init-1");
    expect(after).not.toBe(before);
  });
});

describe("computeRiskObservationFingerprint", () => {
  const base = {
    problemStatement: "Users churn during onboarding.",
    targetCustomer: "SMB admins",
    outcomeStatement: "Reduce churn.",
    capabilities: [{ id: "cap-1", name: "Signup wizard", riskLevel: "medium" }],
  };

  it("changes when a new risk is added", async () => {
    intakeAnswerSetFindUnique.mockResolvedValueOnce(base);
    riskFindMany.mockResolvedValueOnce([]);
    const before = await computeRiskObservationFingerprint("init-1");

    intakeAnswerSetFindUnique.mockResolvedValueOnce(base);
    riskFindMany.mockResolvedValueOnce([{ description: "Vendor lock-in", severity: "high", status: "open" }]);
    const after = await computeRiskObservationFingerprint("init-1");

    expect(after).not.toBe(before);
  });

  it("is stable when nothing relevant changed", async () => {
    intakeAnswerSetFindUnique.mockResolvedValueOnce(base);
    riskFindMany.mockResolvedValueOnce([]);
    const a = await computeRiskObservationFingerprint("init-1");
    intakeAnswerSetFindUnique.mockResolvedValueOnce(base);
    riskFindMany.mockResolvedValueOnce([]);
    const b = await computeRiskObservationFingerprint("init-1");
    expect(a).toBe(b);
  });
});

describe("computeContentProposalFingerprint", () => {
  const baseFeature = {
    title: "Bulk export",
    body: "",
    sourceCapability: { name: "Bulk export", description: "", effortSize: "m", businessValue: "high", riskLevel: "medium" },
    prototype: { initiative: { methodology: "hybrid", intakeAnswerSet: { targetCustomer: "SMB", outcomeStatement: "Faster reporting" } } },
    children: [{ title: "Core Implementation", body: "epic body", children: [{ title: "Story", body: "story body", children: [] }] }],
  };

  it("changes when a hand-edit changes a story's current title/body", async () => {
    artifactLayerFindUniqueOrThrow.mockResolvedValueOnce(baseFeature);
    const before = await computeContentProposalFingerprint("feature-1");

    const edited = {
      ...baseFeature,
      children: [{ ...baseFeature.children[0], children: [{ title: "Renamed story", body: "story body", children: [] }] }],
    };
    artifactLayerFindUniqueOrThrow.mockResolvedValueOnce(edited);
    const after = await computeContentProposalFingerprint("feature-1");

    expect(after).not.toBe(before);
  });
});

describe("computeStatusRecommendationFingerprint", () => {
  it("differs between an initiative and a project entity even with overlapping ids", async () => {
    initiativeFindUniqueOrThrow.mockResolvedValueOnce({
      status: "generated",
      targetLaunchDateOverride: null,
      project: { targetLaunchDate: null },
      intakeAnswerSet: { problemStatement: "x", targetCustomer: "y", outcomeStatement: "z" },
    });
    const initiativeFp = await computeStatusRecommendationFingerprint("initiative", "entity-1");

    projectFindUniqueOrThrow.mockResolvedValueOnce({ targetLaunchDate: null, initiatives: [] });
    const projectFp = await computeStatusRecommendationFingerprint("project", "entity-1");

    expect(initiativeFp).not.toBe(projectFp);
  });

  it("changes when the initiative's status changes", async () => {
    initiativeFindUniqueOrThrow.mockResolvedValueOnce({
      status: "draft",
      targetLaunchDateOverride: null,
      project: { targetLaunchDate: null },
      intakeAnswerSet: { problemStatement: "x", targetCustomer: "y", outcomeStatement: "z" },
    });
    const before = await computeStatusRecommendationFingerprint("initiative", "entity-1");

    initiativeFindUniqueOrThrow.mockResolvedValueOnce({
      status: "generated",
      targetLaunchDateOverride: null,
      project: { targetLaunchDate: null },
      intakeAnswerSet: { problemStatement: "x", targetCustomer: "y", outcomeStatement: "z" },
    });
    const after = await computeStatusRecommendationFingerprint("initiative", "entity-1");

    expect(after).not.toBe(before);
  });
});
