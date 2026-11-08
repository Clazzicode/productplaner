import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ auth: "auth-a" as string | null, status: "active", memberType: "internal", membershipStatus: "active", role: "member", level: "edit" }));
vi.mock("@/lib/db", () => ({
  currentAuthUserId: () => state.auth,
  db: {
    user: { findUnique: async () => ({ id: "user-a", authUserId: "auth-a", status: state.status, memberType: state.memberType }) },
    initiative: { findUnique: async () => ({ organizationId: "org-a" }) },
    organizationMember: { findUnique: async () => ({ status: state.membershipStatus, role: state.role }) },
  },
}));
vi.mock("../initiativeAccess", () => ({ getResolvedAccess: async () => ({ level: state.level }) }));
import { hasCollaborationAction, requireCollaborationAction } from "../actionGuard";
beforeEach(() => Object.assign(state, { auth: "auth-a", status: "active", memberType: "internal", membershipStatus: "active", role: "member", level: "edit" }));
describe("fresh service action authorization", () => {
  it("denies actor impersonation and service context", async () => {
    await expect(requireCollaborationAction("init-a", "user-a", "submit_feedback", "other-workspace")).rejects.toMatchObject({ status: 404 });
    await expect(requireCollaborationAction("init-a", "forged-owner", "approve_release")).rejects.toMatchObject({ status: 403 });
    state.auth = null;
    expect(await hasCollaborationAction("init-a", "user-a", "edit")).toBe(false);
  });
  it("rechecks revoked membership despite an established session", async () => {
    state.membershipStatus = "revoked";
    expect(await hasCollaborationAction("init-a", "user-a", "read")).toBe(false);
  });
  it("allows internal editors story acceptance, but reserves release approval for internal admins", async () => {
    expect(await hasCollaborationAction("init-a", "user-a", "accept_story")).toBe(true);
    expect(await hasCollaborationAction("init-a", "user-a", "approve_release")).toBe(false);
    state.role = "admin";
    expect(await hasCollaborationAction("init-a", "user-a", "approve_release")).toBe(true);
    state.memberType = "external";
    expect(await hasCollaborationAction("init-a", "user-a", "approve_release")).toBe(false);
    expect(await hasCollaborationAction("init-a", "user-a", "submit_feedback")).toBe(true);
    state.level = "none";
    expect(await hasCollaborationAction("init-a", "user-a", "submit_feedback")).toBe(false);
  });
});
