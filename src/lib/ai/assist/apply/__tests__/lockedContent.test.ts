import { beforeEach, describe, expect, it, vi } from "vitest";

class LockedLayerError extends Error {}
const assertArtifactEditable = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/generation/locking", () => ({ assertArtifactEditable, LockedLayerError }));

const { applyContentProposal } = await import("../applyContentProposal");
const { AiAssistApplyBlockedError } = await import("@/lib/ai/errors");

function buildStubTx(approvedAt: Date | null) {
  return {
    artifactLayer: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ prototypeId: "proto-1", prototype: { approvedAt } }),
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: "new-1" }),
      count: vi.fn().mockResolvedValue(0),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const content = { epics: [{ existingArtifactLayerId: "epic-1", title: "T", body: "B", stories: [] }] };

beforeEach(() => {
  vi.clearAllMocks();
  assertArtifactEditable.mockResolvedValue(undefined);
});

describe("applyContentProposal — locked/approved-baseline handling", () => {
  it("blocks with AiAssistApplyBlockedError('approved_baseline') when an approved baseline exists and not confirmed", async () => {
    const tx = buildStubTx(new Date("2027-01-01"));
    await expect(applyContentProposal(tx, "feature-1", content, false)).rejects.toThrow(AiAssistApplyBlockedError);
    expect(tx.artifactLayer.update).not.toHaveBeenCalled();
  });

  it("succeeds and writes when confirmApprovedImpact is true", async () => {
    const tx = buildStubTx(new Date("2027-01-01"));
    const result = await applyContentProposal(tx, "feature-1", content, true);
    expect(tx.artifactLayer.update).toHaveBeenCalledWith({ where: { id: "epic-1" }, data: { title: "T", body: "B" } });
    expect(result.appliedEntityType).toBe("artifact_layer");
  });

  it("proceeds without confirmation when there is no approved baseline", async () => {
    const tx = buildStubTx(null);
    await expect(applyContentProposal(tx, "feature-1", content, false)).resolves.toBeTruthy();
    expect(tx.artifactLayer.update).toHaveBeenCalledTimes(1);
  });

  it("blocks with AiAssistApplyBlockedError('locked_layer') when the governing layer is locked", async () => {
    assertArtifactEditable.mockRejectedValueOnce(new LockedLayerError("Epics is locked."));
    const tx = buildStubTx(null);
    await expect(applyContentProposal(tx, "feature-1", content, false)).rejects.toThrow(AiAssistApplyBlockedError);
    expect(tx.artifactLayer.update).not.toHaveBeenCalled();
  });

  it("never touches points/sprintId/order when updating an existing node", async () => {
    const tx = buildStubTx(null);
    await applyContentProposal(tx, "feature-1", content, false);
    const updateData = tx.artifactLayer.update.mock.calls[0][0].data;
    expect(Object.keys(updateData).sort()).toEqual(["body", "title"]);
  });

  it("creates a new node with points/sprintId left null when no existingArtifactLayerId is given", async () => {
    const tx = buildStubTx(null);
    await applyContentProposal(
      tx,
      "feature-1",
      { epics: [{ existingArtifactLayerId: null, title: "New epic", body: "B", stories: [] }] },
      false,
    );
    expect(tx.artifactLayer.create).toHaveBeenCalledTimes(1);
    const createData = tx.artifactLayer.create.mock.calls[0][0].data;
    expect(createData.type).toBe("epic");
    expect(createData.parentId).toBe("feature-1");
  });
});
