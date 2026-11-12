import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prior: { id: "connection-a", organizationId: "org-a", initiativeId: "initiative-a", cloudId: "cloud-a", projectKey: "CLVTEST", status: "reauthorization_required" } as Record<string, unknown> | null,
  update: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  db: {
    jiraOAuthState: { findUnique: async () => ({ id: "state-a", userId: "user-a", organizationId: "org-a", initiativeId: "initiative-a", consumedAt: null, expiresAt: new Date(Date.now() + 60_000), returnPath: "/integrations/jira" }), updateMany: async () => ({ count: 1 }) },
    jiraConnection: { findMany: async () => mocks.prior ? [mocks.prior] : [], update: mocks.update, create: mocks.create },
    integrationProvider: { findUnique: async () => null },
  },
}));
vi.mock("@/lib/audit", () => ({ auditOrganization: mocks.audit }));
vi.mock("../client", () => ({
  exchangeJiraCode: async () => ({ accessToken: "access", refreshToken: "refresh", expiresAt: new Date(Date.now() + 3600_000), scope: "read:jira-work write:jira-work read:jira-user manage:jira-webhook offline_access" }),
  accessibleJiraResources: async () => [{ id: "cloud-a", url: "https://jira.example", name: "Jira test", scopes: ["read:jira-work"] }],
  encryptedTokens: () => ({ accessTokenCiphertext: "new-access", refreshTokenCiphertext: "new-refresh", scopes: "read:jira-work write:jira-work read:jira-user manage:jira-webhook offline_access", tokenExpiresAt: new Date(Date.now() + 3600_000) }),
}));

import { completeJiraOAuth } from "../oauth";

afterEach(() => { vi.unstubAllEnvs(); mocks.update.mockReset(); mocks.create.mockReset(); mocks.audit.mockReset(); });

describe("Jira reauthorization", () => {
  it("retains the connection ID, site, and project when authorization is renewed", async () => {
    vi.stubEnv("JIRA_WRITE_ENABLED", "true");
    mocks.prior = { id: "connection-a", organizationId: "org-a", initiativeId: "initiative-a", cloudId: "cloud-a", projectKey: "CLVTEST", status: "reauthorization_required" };
    mocks.update.mockResolvedValue({ ...mocks.prior, status: "connected", siteName: "Jira test", siteUrl: "https://jira.example" });
    const result = await completeJiraOAuth({ state: "state", code: "code", userId: "user-a", organizationId: "org-a" });
    expect(result.connection.id).toBe("connection-a");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "connection-a" }, data: expect.objectContaining({ status: "connected", revision: { increment: 1 }, cloudId: "cloud-a" }) });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "jira.oauth_reauthorized" }));
  });
  it("rejects a different Jira site instead of discarding existing issue links", async () => {
    vi.stubEnv("JIRA_WRITE_ENABLED", "true");
    mocks.prior = { id: "connection-a", organizationId: "org-a", initiativeId: "initiative-a", cloudId: "another-cloud", projectKey: "CLVTEST", status: "reauthorization_required" };
    await expect(completeJiraOAuth({ state: "state", code: "code", userId: "user-a", organizationId: "org-a" })).rejects.toThrow("Authorize the same Jira site");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
