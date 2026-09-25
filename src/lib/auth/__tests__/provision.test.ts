import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ find: vi.fn(), provision: vi.fn(), context: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.find } }, establishAuthContext: mocks.context }));
vi.mock("@/lib/auth/session", () => ({ provisionSoloWorkspace: mocks.provision }));
import { ensureAuthenticatedWorkspace } from "../provision";
const user = { id: "verified-id", email: "customer@example.com", email_confirmed_at: "today", user_metadata: { name: "Customer", role: "owner" } } as unknown as User;
beforeEach(() => vi.resetAllMocks());
describe("workspace provisioning after confirmation", () => {
  it("requires a confirmed provider email", async () => {
    await expect(ensureAuthenticatedWorkspace({ ...user, email_confirmed_at: undefined })).rejects.toThrow("Confirmed email");
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("keeps an existing workspace and does not create another", async () => {
    mocks.find.mockResolvedValue({ id: "existing" });
    expect(await ensureAuthenticatedWorkspace(user)).toEqual({ id: "existing" });
    expect(mocks.provision).not.toHaveBeenCalled();
  });
  it("recovers a concurrent provisioning conflict by re-reading the existing account", async () => {
    mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner" });
    mocks.provision.mockRejectedValue({ code: "P2002" });
    expect(await ensureAuthenticatedWorkspace(user)).toEqual({ id: "winner" });
    expect(mocks.provision).toHaveBeenCalledWith({ authUserId: "verified-id", name: "Customer", email: user.email });
    expect(mocks.context).toHaveBeenCalledWith("verified-id");
  });
  it("does not hide database failures", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.provision.mockRejectedValue(new Error("Database unavailable"));
    await expect(ensureAuthenticatedWorkspace(user)).rejects.toThrow("Database unavailable");
  });
});
