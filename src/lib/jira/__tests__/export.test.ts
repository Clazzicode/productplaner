import { describe, expect, it, vi } from "vitest";

const writes = vi.hoisted(() => ({ run: vi.fn(), item: vi.fn(), approval: vi.fn(), link: vi.fn() }));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  db: {
    jiraExportRun: { findUnique: async () => ({ id: "run-a", organizationId: "org-a", initiativeId: "init-a", connectionId: "connection-a", status: "previewed" }), updateMany: writes.run, update: writes.run },
    jiraExportItem: { findMany: async () => [{ id: "item-a", exportRunId: "run-a", action: "conflict", status: "conflict" }], updateMany: writes.item, update: writes.item },
    jiraExportApproval: { create: writes.approval, findUnique: vi.fn() },
    jiraExternalLink: { upsert: writes.link },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));
vi.mock("../oauth", () => ({ accessTokenFor: vi.fn() }));
vi.mock("../client", () => ({ createJiraIssue: vi.fn(), getJiraIssue: vi.fn(), updateJiraIssue: vi.fn() }));
vi.mock("../import", () => ({ currentTargetFingerprint: vi.fn(), fingerprint: vi.fn((value: unknown) => JSON.stringify(value)), exportSourceFingerprint: vi.fn((value: { summary: string; description: unknown }) => JSON.stringify({ summary: value.summary, description: value.description })), importSourceFingerprint: vi.fn(), sourceSnapshot: vi.fn() }));

import { approveJiraExport, assertFrozenJiraTarget, assertJiraIssueProject, exportSourceFingerprint, fieldsFor } from "../export";

vi.stubEnv("JIRA_WRITE_ENABLED", "true");

describe("Jira export approval boundary", () => {
  it("never approves a conflict for execution", async () => {
    await expect(approveJiraExport("run-a", ["item-a"], "Reviewed export", "user-a")).rejects.toMatchObject({ status: 422 });
    expect(writes.run).not.toHaveBeenCalled();
    expect(writes.item).not.toHaveBeenCalled();
    expect(writes.approval).not.toHaveBeenCalled();
    expect(writes.link).not.toHaveBeenCalled();
  });
});

it("freezes only the fields that an update will actually send", () => {
  const candidate = { summary: "Title", description: "Body", issueType: "Story" };
  expect(Object.keys(fieldsFor(candidate, "project", true).fields).sort()).toEqual(["description", "summary"]);
  expect(fieldsFor(candidate, "project").fields).toMatchObject({ project: { id: "project" }, issuetype: { name: "Story" } });
  expect(fieldsFor(candidate, "project", false, "10002").fields).toMatchObject({ project: { id: "project" }, issuetype: { id: "10002" } });
});

it("blocks an approved export when the Jira connection or linked issue moved projects", () => {
  const frozen = { target: { cloudId: "site-a", projectId: "project-a" } };
  expect(() => assertFrozenJiraTarget(frozen, { cloudId: "site-a", projectId: "project-a" })).not.toThrow();
  expect(() => assertFrozenJiraTarget(frozen, { cloudId: "site-b", projectId: "project-a" })).toThrow("changed after approval");
  expect(() => assertFrozenJiraTarget(frozen, { cloudId: "site-a", projectId: "project-b" })).toThrow("changed after approval");
  expect(() => assertJiraIssueProject({ projectId: "project-a", projectKey: "ABC" }, { projectId: "project-a", projectKey: "ABC" })).not.toThrow();
  expect(() => assertJiraIssueProject({ projectId: "project-b", projectKey: "OTHER" }, { projectId: "project-a", projectKey: "ABC" })).toThrow("moved to another project");
});

it("ignores Jira delivery status when checking outbound field changes", () => {
  const before = { summary: "Story", description: "Details", status: "To Do" };
  const after = { summary: "Story", description: "Details", status: "Done" };
  expect(exportSourceFingerprint(before)).toBe(exportSourceFingerprint(after));
  expect(exportSourceFingerprint({ ...after, description: "Changed" })).not.toBe(exportSourceFingerprint(before));
});
