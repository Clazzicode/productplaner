import { beforeEach, describe, expect, it, vi } from "vitest";

const crystallizeFeature = vi.fn();
const crystallizeRisk = vi.fn();

vi.mock("@/lib/context/crystallize", () => ({
  crystallizeFeature,
  crystallizeRisk,
}));

vi.mock("@/lib/generation/locking", () => ({
  assertArtifactEditable: vi.fn().mockResolvedValue(undefined),
  LockedLayerError: class LockedLayerError extends Error {},
}));

const { applyAiAssistItem, isApplicableThroughDispatcher } = await import("../index");

// Minimal stub covering only the Prisma.TransactionClient methods the
// dispatcher's handlers actually call — same style as
// src/lib/context/__tests__/crystallize.test.ts's buildStubTx().
function buildStubTx() {
  return {
    capabilityDependency: { create: vi.fn().mockResolvedValue({ id: "dep-1" }) },
    artifactLayer: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ prototypeId: "proto-1", prototype: { approvedAt: null } }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: "new-1" }),
      count: vi.fn().mockResolvedValue(0),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const baseItem = {
  id: "item-1",
  organizationId: "org-1",
  projectId: "proj-1",
  initiativeId: "init-1",
  targetId: "feature-1",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyAiAssistItem — dispatch completeness", () => {
  it("PROPOSE_FEATURES routes through crystallizeFeature", async () => {
    crystallizeFeature.mockResolvedValueOnce("cap-new");
    const tx = buildStubTx();
    const result = await applyAiAssistItem(tx, { ...baseItem, actionKey: "PROPOSE_FEATURES" }, { name: "X" }, false);
    expect(crystallizeFeature).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ appliedEntityType: "capability", appliedEntityId: "cap-new" });
  });

  it("PROPOSE_RISKS routes through crystallizeRisk", async () => {
    crystallizeRisk.mockResolvedValueOnce("risk-new");
    const tx = buildStubTx();
    const result = await applyAiAssistItem(
      tx,
      { ...baseItem, actionKey: "PROPOSE_RISKS" },
      { description: "x", severity: "medium" },
      false,
    );
    expect(crystallizeRisk).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ appliedEntityType: "risk", appliedEntityId: "risk-new" });
  });

  it("PROPOSE_DEPENDENCIES creates a real CapabilityDependency row", async () => {
    const tx = buildStubTx();
    const result = await applyAiAssistItem(
      tx,
      { ...baseItem, actionKey: "PROPOSE_DEPENDENCIES" },
      { fromCapabilityId: "cap-2", toCapabilityId: "cap-1" },
      false,
    );
    expect(tx.capabilityDependency.create).toHaveBeenCalledWith({
      data: { fromCapabilityId: "cap-2", toCapabilityId: "cap-1", note: "" },
      select: { id: true },
    });
    expect(result.appliedEntityType).toBe("capability_dependency");
  });

  it("PROPOSE_STORY_CONTENT updates only title/body on an existing ArtifactLayer row", async () => {
    const tx = buildStubTx();
    await applyAiAssistItem(
      tx,
      { ...baseItem, actionKey: "PROPOSE_STORY_CONTENT" },
      { epics: [{ existingArtifactLayerId: "epic-1", title: "New title", body: "New body", stories: [] }] },
      false,
    );
    expect(tx.artifactLayer.update).toHaveBeenCalledWith({
      where: { id: "epic-1" },
      data: { title: "New title", body: "New body" },
    });
    expect(tx.artifactLayer.create).not.toHaveBeenCalled();
  });

  it("an unsupported actionKey (e.g. ROADMAP_INSIGHTS) throws — never a silent no-op write", async () => {
    const tx = buildStubTx();
    await expect(applyAiAssistItem(tx, { ...baseItem, actionKey: "ROADMAP_INSIGHTS" }, {}, false)).rejects.toThrow();
  });
});

describe("isApplicableThroughDispatcher", () => {
  it("is true for the 4 dispatcher-handled actions", () => {
    for (const key of ["PROPOSE_FEATURES", "PROPOSE_STORY_CONTENT", "PROPOSE_DEPENDENCIES", "PROPOSE_RISKS"]) {
      expect(isApplicableThroughDispatcher(key)).toBe(true);
    }
  });

  it("is false for roadmap insights and release/sprint/status recommendations", () => {
    for (const key of ["ROADMAP_INSIGHTS", "RECOMMEND_RELEASES", "RECOMMEND_SPRINTS", "RECOMMEND_STATUS"]) {
      expect(isApplicableThroughDispatcher(key)).toBe(false);
    }
  });
});
