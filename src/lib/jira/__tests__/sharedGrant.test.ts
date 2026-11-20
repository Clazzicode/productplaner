import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), getAccessToken: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { jiraConnection: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/atlassian/credentials", () => ({ getAtlassianAccessToken: mocks.getAccessToken }));

import { accessTokenFor } from "../oauth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUnique.mockResolvedValue({
    id: "jira-a", organizationId: "org-a", status: "project_selection_required",
    accessTokenCiphertext: "vault-reference:org-a", refreshTokenCiphertext: "vault-reference:org-a",
  });
  mocks.getAccessToken.mockResolvedValue("verified-access-token");
});

describe("Jira connection backed by workspace Atlassian access", () => {
  it("uses the workspace grant without decrypting a legacy Jira credential", async () => {
    const result = await accessTokenFor("jira-a");
    expect(result.accessToken).toBe("verified-access-token");
    expect(mocks.getAccessToken).toHaveBeenCalledWith("org-a");
  });

  it("rejects a revoked connection before requesting the workspace token", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "jira-a", status: "revoked" });
    await expect(accessTokenFor("jira-a")).rejects.toThrow("Jira connection not found.");
    expect(mocks.getAccessToken).not.toHaveBeenCalled();
  });
});
