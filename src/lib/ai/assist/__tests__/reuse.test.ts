import { beforeEach, describe, expect, it, vi } from "vitest";

// No static top-level import of "../reuse" here — that module imports
// "@/lib/db" at its own top level, and a static import of it would resolve
// (and run the hoisted vi.mock factory below) before this file's own
// `const findFirst = vi.fn()` has initialized, throwing a TDZ error. Both
// decideReuse and resolveReuseDecision come from the one dynamic import
// after the mock/consts are set up, matching this codebase's established
// pattern (see src/lib/planningWeights/__tests__/planningWeights.test.ts).

const findFirst = vi.fn();
const update = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { aiAssistItem: { findFirst, update } },
}));

const { decideReuse, resolveReuseDecision } = await import("../reuse");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decideReuse — pure decision", () => {
  it("first generation: no existing row -> generate_new", () => {
    expect(decideReuse({ existingFingerprint: null, existingStatus: null, freshFingerprint: "abc" })).toBe(
      "generate_new",
    );
  });

  it("existing, no change: matching fingerprint -> reuse (no AI call reachable)", () => {
    expect(
      decideReuse({ existingFingerprint: "abc", existingStatus: "proposed", freshFingerprint: "abc" }),
    ).toBe("reuse");
  });

  it("existing, changed context, still proposed -> flag_stale (never silent regen)", () => {
    expect(
      decideReuse({ existingFingerprint: "abc", existingStatus: "proposed", freshFingerprint: "xyz" }),
    ).toBe("flag_stale");
  });

  it("existing, changed context, already stale -> flag_stale (idempotent)", () => {
    expect(decideReuse({ existingFingerprint: "abc", existingStatus: "stale", freshFingerprint: "xyz" })).toBe(
      "flag_stale",
    );
  });

  it("existing, changed context, already applied -> generate_new (settled decision, a re-trigger versions forward)", () => {
    expect(
      decideReuse({ existingFingerprint: "abc", existingStatus: "applied", freshFingerprint: "xyz" }),
    ).toBe("generate_new");
  });

  it("existing, changed context, already dismissed -> generate_new (settled decision)", () => {
    expect(
      decideReuse({ existingFingerprint: "abc", existingStatus: "dismissed", freshFingerprint: "xyz" }),
    ).toBe("generate_new");
  });
});

describe("resolveReuseDecision — DB-backed wrapper", () => {
  it("queries by actionKey/targetType/targetId/initiativeId/projectId, most recent version first", async () => {
    findFirst.mockResolvedValue(null);
    await resolveReuseDecision({
      actionKey: "PROPOSE_FEATURES",
      targetType: "initiative",
      targetId: null,
      initiativeId: "init-1",
      projectId: "proj-1",
      freshFingerprint: "abc",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { actionKey: "PROPOSE_FEATURES", targetType: "initiative", targetId: null, initiativeId: "init-1", projectId: "proj-1" },
      orderBy: { version: "desc" },
    });
  });

  it("omits the targetId filter entirely when targetId is undefined (propose-dependencies' 'any pair' gate)", async () => {
    findFirst.mockResolvedValue(null);
    await resolveReuseDecision({
      actionKey: "PROPOSE_DEPENDENCIES",
      targetType: "capability_pair",
      targetId: undefined,
      initiativeId: "init-1",
      projectId: "proj-1",
      freshFingerprint: "abc",
    });
    const where = findFirst.mock.calls[0][0].where;
    expect("targetId" in where).toBe(false);
  });

  it("flags a stale 'proposed' row in the same request, without regenerating", async () => {
    findFirst.mockResolvedValue({ id: "item-1", fingerprint: "old", status: "proposed" });
    const result = await resolveReuseDecision({
      actionKey: "PROPOSE_FEATURES",
      targetType: "initiative",
      targetId: null,
      initiativeId: "init-1",
      projectId: "proj-1",
      freshFingerprint: "new",
    });
    expect(result.decision).toBe("flag_stale");
    expect(update).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { status: "stale" } });
  });

  it("does not re-write status when already stale (idempotent)", async () => {
    findFirst.mockResolvedValue({ id: "item-1", fingerprint: "old", status: "stale" });
    await resolveReuseDecision({
      actionKey: "PROPOSE_FEATURES",
      targetType: "initiative",
      targetId: null,
      initiativeId: "init-1",
      projectId: "proj-1",
      freshFingerprint: "new",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("reuse: matching fingerprint never calls update", async () => {
    findFirst.mockResolvedValue({ id: "item-1", fingerprint: "same", status: "proposed" });
    const result = await resolveReuseDecision({
      actionKey: "PROPOSE_FEATURES",
      targetType: "initiative",
      targetId: null,
      initiativeId: "init-1",
      projectId: "proj-1",
      freshFingerprint: "same",
    });
    expect(result.decision).toBe("reuse");
    expect(update).not.toHaveBeenCalled();
  });
});
