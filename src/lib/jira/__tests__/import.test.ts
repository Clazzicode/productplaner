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

import { applyJiraImport } from "../import";

describe("Jira import approval boundary", () => {
  it("never applies a selected conflict automatically", async () => {
    await expect(applyJiraImport("run-a", ["item-a"], "Reviewed import", "user-a")).rejects.toMatchObject({ status: 422 });
    expect(writes.run).not.toHaveBeenCalled();
    expect(writes.item).not.toHaveBeenCalled();
    expect(writes.link).not.toHaveBeenCalled();
  });
});
