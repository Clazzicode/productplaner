import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ api: vi.fn(), page: vi.fn(), optional: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireCurrentUserApi: auth.api, requireCurrentUser: auth.page, getCurrentUser: auth.optional }));
vi.mock("@prisma/client", () => ({ PrismaClient: class { $extends() { return {}; } }, Prisma: {} }));
import { currentAuthOrganizationId, currentAuthUserId, establishAuthContext, withAuthenticatedDatabaseContext, withServiceContext } from "@/lib/db";
import { withAuthenticatedApi, withAuthenticatedPage, withOptionalAuthenticatedPage } from "../entryPoints";
import { currentVerifiedRequest } from "../verifiedRequest";
const user = { id: "user-a", authUserId: "auth-a", organizationId: "org-a" };
beforeEach(() => { vi.clearAllMocks(); auth.api.mockResolvedValue({ ok: true, user }); auth.page.mockResolvedValue(user); auth.optional.mockResolvedValue(user); });
describe("verified entry-point context", () => {
  it("rejects anonymous requests before the handler", async () => {
    auth.api.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });
    const handler = vi.fn();
    expect((await withAuthenticatedApi(handler)(new Request("https://clarivia.test/api/test"))).status).toBe(401);
    expect(handler).not.toHaveBeenCalled(); expect(currentAuthUserId()).toBeNull();
  });
  it("awaits lazy operations inside the verified identity scope", async () => {
    const lazy = { then(resolve: (value: string | null) => void) { resolve(currentAuthUserId()); } };
    const result = await withAuthenticatedDatabaseContext(user, () => lazy as unknown as Promise<string>);
    expect(result).toBe("auth-a"); expect(currentAuthUserId()).toBeNull();
  });
  it("isolates concurrent users and does not leak claims after completion", async () => {
    auth.api.mockResolvedValueOnce({ ok: true, user }).mockResolvedValueOnce({ ok: true, user: { ...user, id: "user-b", authUserId: "auth-b", organizationId: "org-b" } });
    const handler = withAuthenticatedApi(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      establishAuthContext(currentAuthUserId());
      return Response.json({ auth: currentAuthUserId(), organization: currentAuthOrganizationId(), cached: currentVerifiedRequest()?.user?.id });
    });
    const responses = await Promise.all([handler(), handler()]);
    expect(await Promise.all(responses.map(r => r.json()))).toEqual([
      { auth: "auth-a", organization: "org-a", cached: "user-a" }, { auth: "auth-b", organization: "org-b", cached: "user-b" },
    ]);
    expect(currentAuthUserId()).toBeNull(); expect(currentVerifiedRequest()).toBeUndefined();
  });
  it("restores scope after handler failure and keeps service execution explicit", async () => {
    const handler = withAuthenticatedApi(async () => {
      expect(await withServiceContext(async () => { await Promise.resolve(); return currentAuthUserId(); })).toBeNull();
      expect(currentAuthUserId()).toBe("auth-a");
      throw new Error("deliberate failure");
    });
    expect((await handler()).status).toBe(500);
    expect(currentAuthUserId()).toBeNull(); expect(currentAuthOrganizationId()).toBeUndefined();
  });
  it("scopes protected pages and permits anonymous public shells without user claims", async () => {
    expect(await withAuthenticatedPage(async () => currentAuthUserId())()).toBe("auth-a");
    auth.optional.mockResolvedValue(null);
    expect(await withOptionalAuthenticatedPage(async () => ({ auth: currentAuthUserId(), cached: currentVerifiedRequest()?.user }))()).toEqual({ auth: null, cached: null });
    expect(currentAuthUserId()).toBeNull();
  });
  it("retains withApi cross-origin mutation rejection before authentication", async () => {
    const handler = vi.fn();
    const response = await withAuthenticatedApi(handler)(new Request("https://clarivia.test/api/test", { method: "POST", headers: { origin: "https://untrusted.test" } }));
    expect(response.status).toBe(403); expect(auth.api).not.toHaveBeenCalled(); expect(handler).not.toHaveBeenCalled();
  });
});
