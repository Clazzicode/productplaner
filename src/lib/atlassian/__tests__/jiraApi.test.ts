import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverProjects, JiraApiError, readMappedIssueStatuses } from "../jiraApi";
import type { VerifiedForgeInvocation } from "../forgeAuth";

const invocation: VerifiedForgeInvocation = {
  installationId: "installation-1",
  appId: "ari:cloud:ecosystem::app/example",
  cloudId: "cloud-1",
  apiBaseUrl: "https://api.atlassian.com/ex/jira/cloud-1",
  expiresAt: new Date(Date.now() + 60_000),
};

afterEach(() => vi.unstubAllGlobals());

describe("Jira API boundary", () => {
  it("uses only the verified host and never follows redirects", async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ values: [{ id: "42", key: "PLAN", name: "Planning" }], isLast: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://product.example/api/atlassian/forge/discover", {
      method: "POST", headers: { "x-forge-oauth-system": "short-lived-oauth-token" },
    });

    await expect(discoverProjects(request, invocation)).resolves.toEqual({
      projects: [{ id: "42", key: "PLAN", name: "Planning", projectTypeKey: undefined }],
      truncated: false,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain("https://api.atlassian.com/ex/jira/cloud-1/");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", cache: "no-store" });
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ authorization: "Bearer short-lived-oauth-token" });
  });

  it("rejects oversized responses before buffering their body", async () => {
    const response = new Response(null, { status: 200, headers: { "content-length": "2000001" } });
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => { void args; return response; });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://product.example", { headers: { "x-forge-oauth-user": "short-lived-token" } });

    await expect(discoverProjects(request, invocation)).rejects.toMatchObject({
      constructor: JiraApiError,
      code: "JIRA_RESPONSE_TOO_LARGE",
    });
  });

  it("rejects an oversized streamed body even when content-length is absent", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_500_000));
        controller.enqueue(new Uint8Array(600_001));
      },
    });
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => { void args; return new Response(stream); }));
    const request = new Request("https://product.example", { headers: { "x-forge-oauth-system": "short-lived-token" } });

    await expect(discoverProjects(request, invocation)).rejects.toMatchObject({ code: "JIRA_RESPONSE_TOO_LARGE" });
  });

  it("reads execution status only for mapped Jira keys using a Jira GET", async () => {
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args;
      return Response.json({ issues: [
        { id: "issue-10001", key: "PLAN-1", fields: { status: { id: "3", name: "In Progress" }, updated: "2026-10-18T16:00:00.000Z" } },
        { id: "issue-unmapped", key: "PLAN-999", fields: { status: { id: "4", name: "Done" }, updated: "2026-10-18T16:01:00.000Z" } },
      ] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://product.example/api/atlassian/forge/sync-status", {
      method: "POST", headers: { "x-forge-oauth-system": "short-lived-oauth-token" },
    });

    await expect(readMappedIssueStatuses(request, invocation, ["PLAN-1"])).resolves.toEqual({
      issues: [{ id: "issue-10001", key: "PLAN-1", statusId: "3", statusName: "In Progress", updatedAt: "2026-10-18T16:00:00.000Z" }],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(String(url)).toContain("/rest/api/3/search/jql?");
    expect(new URL(String(url)).searchParams.get("jql")).toBe("key in (PLAN-1)");
    expect(new URL(String(url)).searchParams.get("fields")).toBe("status,updated");
  });

  it("rejects unsafe or oversized mapped key lists before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("https://product.example", { headers: { "x-forge-oauth-system": "short-lived-token" } });

    await expect(readMappedIssueStatuses(request, invocation, ["PLAN-1 AND project=OTHER"])).rejects.toMatchObject({ code: "INVALID_MAPPED_JIRA_ISSUES" });
    await expect(readMappedIssueStatuses(request, invocation, Array.from({ length: 51 }, (_, index) => `PLAN-${index + 1}`))).rejects.toMatchObject({ code: "INVALID_MAPPED_JIRA_ISSUES" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
