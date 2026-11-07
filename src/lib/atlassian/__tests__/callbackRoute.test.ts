import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  state: vi.fn(),
  resources: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCurrentUserApi: async () => ({ ok: true, user: { id: "user-a", authUserId: "00000000-0000-0000-0000-000000000001", organizationId: "org-a", permissionRole: "owner" } }),
}));
vi.mock("@/lib/access/organizationRole", () => ({ requireOrganizationRole: () => ({ ok: true }) }));
vi.mock("@/lib/atlassian/oauth", () => ({
  AtlassianOAuthError: class AtlassianOAuthError extends Error { constructor(readonly code: string) { super(code); } },
  atlassianOAuthConfig: () => ({ redirectUri: "https://preview.example/api/atlassian/oauth/callback" }),
  encryptAtlassianTokens: () => "encrypted-token",
  exchangeAtlassianCode: async () => ({ accessToken: "access-token", refreshToken: "refresh-token", expiresIn: 3600, scopes: ["offline_access", "read:jira-work"] }),
  getAtlassianAccessibleResources: mocks.resources,
}));
vi.mock("@/lib/db", () => ({
  db: { $queryRaw: mocks.state },
  establishAuthContext: vi.fn(),
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
    $executeRaw: vi.fn(),
    jiraConnection: { findMany: mocks.findMany, updateMany: mocks.updateMany, update: mocks.update, create: mocks.create },
    auditEvent: { create: mocks.audit },
  }),
}));
vi.mock("@/lib/observability", () => ({ withApi: (handler: unknown) => handler, currentRequestId: () => "request-a" }));

import { GET } from "@/app/api/atlassian/oauth/callback/route";

const callbackRequest = () => new Request(`https://preview.example/api/atlassian/oauth/callback?state=${"a".repeat(43)}&code=valid-code`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.mockResolvedValue([{ organizationId: "org-a", initiativeId: "initiative-a", returnPath: "/integrations/jira" }]);
  mocks.resources.mockResolvedValue([{ id: "site-a", name: "Test Jira", url: "https://jira.example", scopes: ["read:jira-work"] }]);
  mocks.findMany.mockResolvedValue([]);
  mocks.updateMany.mockResolvedValue({ count: 0 });
  mocks.update.mockResolvedValue({ id: "connection-old" });
  mocks.create.mockResolvedValue({});
  mocks.audit.mockResolvedValue({});
});

describe("Atlassian OAuth callback connection continuity", () => {
  it("keeps the same connection and project mapping on a same-site reconnect", async () => {
    mocks.findMany.mockResolvedValue([{ id: "connection-old", cloudId: "site-a", projectId: "100", projectKey: "SCRUM", projectName: "Test", status: "connected" }]);

    const response = await GET(callbackRequest());
    const redirect = new URL(response.headers.get("location")!);

    expect(redirect.searchParams.get("atlassian")).toBe("reconnected");
    expect(redirect.searchParams.get("connectionId")).toBe("connection-old");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "connection-old" },
      data: expect.objectContaining({ status: "connected", cloudId: "site-a", configuredByUserId: "user-a" }),
    });
    expect(mocks.update.mock.calls[0][0].data).not.toHaveProperty("projectId");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a new connection on first consent", async () => {
    const response = await GET(callbackRequest());
    const redirect = new URL(response.headers.get("location")!);

    expect(redirect.searchParams.get("atlassian")).toBe("connected");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not reuse a mapped connection when the authorized Jira site changes", async () => {
    mocks.findMany.mockResolvedValue([{ id: "connection-old", cloudId: "site-a", projectId: "100", projectKey: "SCRUM", status: "reauthorization_required" }]);
    mocks.resources.mockResolvedValue([{ id: "site-b", name: "Different Jira", url: "https://other.example", scopes: ["read:jira-work"] }]);

    const response = await GET(callbackRequest());
    const redirect = new URL(response.headers.get("location")!);

    expect(redirect.searchParams.get("atlassian")).toBe("connected");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["connection-old"] } },
      data: expect.objectContaining({ status: "revoked" }),
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
