import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ capability: { id: "cap-a", name: "Canonical name" } as { id: string; name: string } | null,
  approved: false, projection: null as Record<string, unknown> | null, insert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {
  capability: { findFirst: async () => state.capability },
  prototype: { findUnique: async () => ({ id: "proto-a", approvedAt: state.approved ? new Date() : null }) },
  artifactLayer: { findFirst: async () => state.projection },
  $executeRaw: state.insert,
} }));
import { ensureFeatureProjection } from "../featureIdentity";
beforeEach(() => {
  state.capability = { id: "cap-a", name: "Canonical name" }; state.approved = false; state.projection = null;
  state.insert.mockReset(); state.insert.mockImplementation(async () => { state.projection = { id: "representation-a", sourceCapabilityId: "cap-a", title: "Canonical name" }; return 1; });
});
describe("canonical feature representations", () => {
  it("reuses an edited representation without overwriting editorial content", async () => {
    state.projection = { id: "representation-a", sourceCapabilityId: "cap-a", title: "Human editorial title", body: "Human text" };
    expect(await ensureFeatureProjection("init-a", "cap-a")).toBe(state.projection);
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("keeps one representation across repeated synchronization", async () => {
    const first = await ensureFeatureProjection("init-a", "cap-a", "generated");
    expect(await ensureFeatureProjection("init-a", "cap-a", "generated")).toBe(first);
    expect(state.insert).toHaveBeenCalledOnce();
  });
  it("accepts the winner of a concurrent insertion without creating a Capability", async () => {
    state.insert.mockImplementation(async () => { state.projection = { id: "race-winner", sourceCapabilityId: "cap-a", title: "Preserved winner" }; return 0; });
    expect(await ensureFeatureProjection("init-a", "cap-a")).toMatchObject({ id: "race-winner" });
  });
  it("rejects invalid scope and approved-plan mutation", async () => {
    state.capability = null;
    await expect(ensureFeatureProjection("other-init", "cap-a")).rejects.toMatchObject({ status: 404 });
    state.capability = { id: "cap-a", name: "Canonical name" }; state.approved = true;
    await expect(ensureFeatureProjection("init-a", "cap-a")).rejects.toMatchObject({ status: 409 });
    expect(state.insert).not.toHaveBeenCalled();
  });
});
