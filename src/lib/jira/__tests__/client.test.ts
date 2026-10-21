import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accessibleJiraResources, createJiraIssue, deleteJiraWebhooks, exchangeJiraCode, getJiraProjectMetadata, jiraAuthorizationUrl, refreshJiraWebhook, registerJiraWebhook, searchJiraIssues, updateJiraIssue } from "../client";

const original = { id: process.env.JIRA_CLIENT_ID, secret: process.env.JIRA_CLIENT_SECRET, redirect: process.env.JIRA_REDIRECT_URI, writes: process.env.JIRA_WRITE_ENABLED };
beforeEach(() => { process.env.JIRA_CLIENT_ID = "client-a"; process.env.JIRA_CLIENT_SECRET = "secret-a"; process.env.JIRA_REDIRECT_URI = "https://app.example/api/integrations/jira/oauth/callback"; process.env.JIRA_WRITE_ENABLED = "true"; });
afterEach(() => { for (const [key, value] of [["JIRA_CLIENT_ID",original.id],["JIRA_CLIENT_SECRET",original.secret],["JIRA_REDIRECT_URI",original.redirect],["JIRA_WRITE_ENABLED",original.writes]] as const) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });

describe("Atlassian OAuth and Jira REST client", () => {
  it("blocks Jira writes by default before making a provider request", async () => {
    delete process.env.JIRA_WRITE_ENABLED;
    const fetcher = vi.fn();
    await expect(createJiraIssue({ cloudId: "cloud-a", accessToken: "token", fields: { summary: "must not write" } }, fetcher)).rejects.toThrow("Jira write operations are disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("builds a 3LO URL with offline access and an exact callback", () => {
    const url = new URL(jiraAuthorizationUrl("opaque-state"));
    expect(url.origin).toBe("https://auth.atlassian.com");
    expect(url.searchParams.get("state")).toBe("opaque-state");
    expect(url.searchParams.get("scope")).toContain("offline_access");
    expect(url.searchParams.get("scope")).toContain("write:jira-work");
    expect(url.searchParams.get("scope")).toContain("manage:jira-webhook");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.JIRA_REDIRECT_URI);
  });
  it("exchanges the code and loads accessible resources", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "read:jira-work" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "cloud-a", url: "https://example.atlassian.net", name: "Example", scopes: ["read:jira-work"] }]), { status: 200 }));
    const tokens = await exchangeJiraCode("code-a", fetcher);
    expect(tokens.refreshToken).toBe("refresh");
    expect((await accessibleJiraResources(tokens.accessToken, fetcher))).toEqual([{ id: "cloud-a", url: "https://example.atlassian.net", name: "Example", scopes: ["read:jira-work"] }]);
    expect(fetcher.mock.calls[0][0]).toBe("https://auth.atlassian.com/oauth/token");
  });
  it("uses enhanced JQL search and preserves planning fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ isLast: true, issues: [{ id: "10001", key: "GP-1", fields: { summary: "Login fails", description: { type: "doc", content: [] }, issuetype: { id: "bug", name: "Bug", subtask: false }, status: { id: "open", name: "Open", statusCategory: { key: "new" } }, assignee: { accountId: "acct", displayName: "Avery" }, priority: { id: "1", name: "High" }, labels: ["auth"], parent: { key: "GP-EPIC" }, fixVersions: [{ id: "v1", name: "Release 1", releaseDate: "2026-11-01" }], updated: "2026-10-17T12:00:00.000Z", customfield_10016: 5, customfield_10020: [{ id: 7, name: "Sprint 1" }] } }] }), { status: 200 }));
    const result = await searchJiraIssues({ cloudId: "cloud-a", accessToken: "token", projectKey: "GP" }, fetcher);
    expect(result.issues[0]).toMatchObject({ key: "GP-1", storyPoints: 5, parentKey: "GP-EPIC", assignee: { displayName: "Avery" }, fixVersions: [{ name: "Release 1" }] });
    expect(fetcher.mock.calls[0][0]).toContain("/rest/api/3/search/jql");
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.jql).toContain("project = \"GP\"");
  });
  it("does not request or infer story points when an administrator disables that mapping", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ isLast: true, issues: [{ id: "10001", key: "GP-1", fields: { summary: "Story", issuetype: { id: "1", name: "Story" }, status: { id: "1", name: "To Do", statusCategory: { key: "new" } }, customfield_10016: 8 } }] }), { status: 200 }));
    const result = await searchJiraIssues({ cloudId: "cloud-a", accessToken: "token", projectKey: "GP", storyPointsField: null }, fetcher);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.fields).not.toContain("customfield_10016");
    expect(result.issues[0].storyPoints).toBeNull();
  });
  it("creates and updates Jira issues only through explicit write calls", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "10001", key: "GP-1" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await createJiraIssue({ cloudId: "cloud-a", accessToken: "token", fields: { summary: "Approved story" } }, fetcher)).toEqual({ id: "10001", key: "GP-1" });
    await updateJiraIssue({ cloudId: "cloud-a", accessToken: "token", issueIdOrKey: "GP-1", fields: { summary: "Updated story" } }, fetcher);
    expect(fetcher.mock.calls[0][1]?.method).toBe("POST");
    expect(fetcher.mock.calls[1][1]?.method).toBe("PUT");
  });
  it("discovers issue types, statuses, fields, priorities, and versions before mapping", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "10001", name: "Story", subtask: false, statuses: [{ id: "3", name: "In Progress" }] }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "customfield_10016", name: "Story points", custom: true, schema: { type: "number" } }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "1", name: "Highest" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "v1", name: "November release", released: false, releaseDate: "2026-11-01" }]), { status: 200 }));
    const result = await getJiraProjectMetadata({ cloudId: "cloud-a", accessToken: "token", projectId: "101", projectKey: "GP" }, fetcher);
    expect(result).toEqual({ issueTypes: [{ id: "10001", name: "Story", subtask: false, statuses: [{ id: "3", name: "In Progress" }] }], fields: [{ id: "customfield_10016", name: "Story points", custom: true, number: true }], priorities: [{ id: "1", name: "Highest" }], versions: [{ id: "v1", name: "November release", released: false, releaseDate: "2026-11-01" }] });
    expect(fetcher.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining([expect.stringContaining("/project/GP/statuses"), expect.stringContaining("/rest/api/3/field"), expect.stringContaining("/rest/api/3/priority"), expect.stringContaining("/project/101/versions")]));
  });
  it("registers and renews scoped dynamic webhooks", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ webhookRegistrationResult: [{ createdWebhookId: 9001 }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ expirationDate: "2026-11-16T12:00:00.000+0000" }), { status: 200 }));
    expect(await registerJiraWebhook({ cloudId: "cloud-a", accessToken: "token", callbackUrl: "https://app.example/api/integrations/jira/webhooks/connection-a?token=secret", projectKey: "GP" }, fetcher)).toEqual({ id: "9001" });
    const renewed = await refreshJiraWebhook({ cloudId: "cloud-a", accessToken: "token", webhookId: "9001" }, fetcher);
    expect(renewed.expiresAt.toISOString()).toBe("2026-11-16T12:00:00.000Z");
    expect(fetcher.mock.calls[1][0]).toContain("/rest/api/3/webhook/refresh");
  });
  it("removes registered webhooks during disconnect", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    await deleteJiraWebhooks({ cloudId: "cloud-a", accessToken: "token", webhookIds: ["9001"] }, fetcher);
    expect(fetcher.mock.calls[0][0]).toContain("/rest/api/3/webhook");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "DELETE", body: JSON.stringify({ webhookIds: [9001] }) });
  });
});
