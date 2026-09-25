import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), cookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique }, organizationMember: { findFirst: mocks.findFirst } }, establishAuthContext: vi.fn(), withTransaction: vi.fn() }));
import { getCurrentUser, requireCurrentUserApi } from "../session";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-auth-id" } }, error: null });
  mocks.findUnique.mockResolvedValue({ id: "app-user", homeOrganizationId: "org-a", status: "active" });
});

describe("verified session and active membership", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await requireCurrentUserApi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("does not invent membership from a home organization", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await getCurrentUser()).toBeNull();
  });
  it("rejects an invalid persisted role", async () => {
    mocks.findFirst.mockResolvedValue({ organizationId: "org-a", role: "superuser" });
    expect(await getCurrentUser()).toBeNull();
  });
  it("ignores a forged organization cookie and resolves actual membership", async () => {
    mocks.cookie.mockReturnValue({ value: "org-b" });
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ organizationId: "org-a", role: "member" });
    expect(await getCurrentUser()).toMatchObject({ organizationId: "org-a", permissionRole: "member", accessLevel: "standard_user" });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { authUserId: "verified-auth-id" } }));
  });
});
