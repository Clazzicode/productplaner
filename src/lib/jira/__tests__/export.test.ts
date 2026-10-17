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
vi.mock("../import", () => ({ currentTargetFingerprint: vi.fn(), fingerprint: vi.fn(() => "a".repeat(64)), sourceSnapshot: vi.fn() }));

import { approveJiraExport } from "../export";

describe("Jira export approval boundary", () => {
  it("never approves a conflict for execution", async () => {
    await expect(approveJiraExport("run-a", ["item-a"], "Reviewed export", "user-a")).rejects.toMatchObject({ status: 422 });
    expect(writes.run).not.toHaveBeenCalled();
    expect(writes.item).not.toHaveBeenCalled();
    expect(writes.approval).not.toHaveBeenCalled();
    expect(writes.link).not.toHaveBeenCalled();
  });
});
