import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revoke: vi.fn(),
  findRevoked: vi.fn(),
  purge: vi.fn(),
  deleteGrant: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUserApi: async () => ({ ok: true, user: { id: "user-a", authUserId: "00000000-0000-0000-0000-000000000001", organizationId: "org-a", permissionRole: "owner" } }),
}));
vi.mock("@/lib/access/organizationRole", () => ({ requireOrganizationRole: () => ({ ok: true }) }));
vi.mock("@/lib/db", () => ({
  establishAuthContext: vi.fn(),
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    jiraConnection: { updateMany: mocks.revoke, findMany: mocks.findRevoked },
    $executeRaw: vi.fn().mockImplementation((parts: TemplateStringsArray) =>
      parts[0].includes("purge_jira_source_data") ? mocks.purge() : mocks.deleteGrant(),
    ),
    auditEvent: { create: mocks.audit },
  }),
}));
vi.mock("@/lib/observability", () => ({ withApi: (handler: unknown) => handler, currentRequestId: () => "request-a" }));

import { DELETE } from "@/app/api/atlassian/oauth/disconnect/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.revoke.mockResolvedValue({ count: 2 });
  mocks.findRevoked.mockResolvedValue([{ id: "jira-current" }, { id: "jira-older" }]);
  mocks.purge.mockResolvedValue([]);
  mocks.deleteGrant.mockResolvedValue(1);
  mocks.audit.mockResolvedValue({});
});

describe("workspace-wide Atlassian disconnect", () => {
  it("revokes the grant and purges source data for current and older Jira connections", async () => {
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ disconnected: true });
    expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(mocks.findRevoked).toHaveBeenCalledWith({
      where: { organizationId: "org-a", status: "revoked" },
      select: { id: true },
    });
    expect(mocks.purge).toHaveBeenCalledTimes(2);
    expect(mocks.deleteGrant).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "atlassian.oauth.disconnected", organizationId: "org-a" }),
    });
  });
});
