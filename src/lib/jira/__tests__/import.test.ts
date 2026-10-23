import { describe, expect, it, vi } from "vitest";

const writes = vi.hoisted(() => ({ run: vi.fn(), item: vi.fn(), link: vi.fn() }));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  db: {
    jiraImportRun: { findUnique: async () => ({ id: "run-a", organizationId: "org-a", initiativeId: "init-a", connectionId: "connection-a", status: "previewed" }), updateMany: writes.run, update: writes.run },
    jiraImportItem: { findMany: async () => [{ id: "item-a", importRunId: "run-a", action: "conflict", status: "previewed" }], update: writes.item, updateMany: writes.item },
    jiraExternalLink: { upsert: writes.link },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));
vi.mock("@/lib/backlog/service", () => ({ saveFeature: vi.fn() }));
vi.mock("@/lib/requests/service", () => ({ saveRequest: vi.fn() }));
vi.mock("../oauth", () => ({ accessTokenFor: vi.fn() }));
vi.mock("../client", () => ({ searchJiraIssues: vi.fn() }));

import { applyJiraImport, deduplicateJiraIssues, previewJiraImport } from "../import";

describe("Jira import approval boundary", () => {
  it("never applies a selected conflict automatically", async () => {
    await expect(applyJiraImport("run-a", ["item-a"], "Reviewed import", "user-a")).rejects.toMatchObject({ status: 422 });
    expect(writes.run).not.toHaveBeenCalled();
    expect(writes.item).not.toHaveBeenCalled();
    expect(writes.link).not.toHaveBeenCalled();
  });
});

describe("Jira read deduplication", () => {
  const issue = { id: "100", key: "ABC-1", summary: "First", description: null } as Parameters<typeof deduplicateJiraIssues>[0][number];
  it("keeps one copy when pagination repeats the same issue", () => {
    expect(deduplicateJiraIssues([issue, { ...issue }])).toEqual([issue]);
  });
  it("rejects conflicting copies of the same external ID", () => {
    expect(() => deduplicateJiraIssues([issue, { ...issue, summary: "Changed" }])).toThrow(/conflicting copies/);
  });
  it("rejects one external key mapped to two IDs", () => {
    expect(() => deduplicateJiraIssues([issue, { ...issue, id: "101" }])).toThrow(/two issue IDs/);
  });
});

it("reuses the saved preview on a retried job without rereading Jira", async () => {
  const { accessTokenFor } = await import("../oauth");
  const saved = await previewJiraImport("connection-a", "user-a", "job-a");
  expect(saved?.id).toBe("run-a");
  expect(accessTokenFor).not.toHaveBeenCalled();
});
