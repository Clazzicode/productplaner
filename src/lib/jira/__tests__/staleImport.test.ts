import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ connection: { status: "connected", revision: 2 }, run: { id: "run", organizationId: "org", initiativeId: "init", connectionId: "connection", status: "previewed", connectionRevision: 2 }, item: {} as Record<string, unknown>, capability: { name: "Changed after preview", description: "Human edit", backlogRevision: 2 }, mutate: vi.fn(), authorize: vi.fn(), link: null as unknown }));
vi.mock("@/lib/db", () => ({ withTransaction: async (fn: () => Promise<unknown>) => fn(), db: { jiraImportRun: { findUnique: async () => state.run, updateMany: state.mutate }, jiraImportItem: { findMany: async () => [state.item] }, jiraConnection: { findUnique: async () => state.connection }, capability: { findUnique: async () => state.capability }, jiraExternalLink: { findUnique: async () => state.link } } }));
vi.mock("@/lib/access/actionGuard", () => ({ requireCollaborationAction: state.authorize }));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));
vi.mock("@/lib/backlog/service", () => ({ saveFeature: vi.fn() }));
vi.mock("@/lib/requests/service", () => ({ saveRequest: vi.fn() }));
vi.mock("../oauth", () => ({ accessTokenFor: vi.fn() }));
import { applyJiraImport } from "../import";
beforeEach(() => { vi.clearAllMocks(); state.connection.revision = 2; state.connection.status = "connected"; state.run.connectionRevision = 2; state.link = null; state.item = { id: "item", externalIssueId: "100", externalKey: "ABC-1", targetType: "feature", targetId: "feature", action: "update", reviewSnapshot: { schemaVersion: 1, targetFingerprint: "old-fingerprint" } }; });
describe("stale import prevention", () => {
  it("rejects an edit after preview before any mutation", async () => {
    await expect(applyJiraImport("run", ["item"], "Reviewed", "actor")).rejects.toThrow("changed locally after review");
    expect(state.authorize).toHaveBeenCalledWith("init", "actor", "manage_integrations", "org"); expect(state.mutate).not.toHaveBeenCalled();
  });
  it.each(["reconnect", "disconnect"])("rejects %s before changing planning data", async kind => {
    if (kind === "reconnect") state.connection.revision = 3; else state.connection.status = "revoked";
    await expect(applyJiraImport("run", ["item"], "Reviewed", "actor")).rejects.toThrow("connection changed"); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("requires a fresh preview for legacy summary-only reviews", async () => {
    state.item.reviewSnapshot = null;
    await expect(applyJiraImport("run", ["item"], "Reviewed", "actor")).rejects.toThrow("legacy import preview"); expect(state.mutate).not.toHaveBeenCalled();
  });
  it("prevents a second create when another run already linked the external issue", async () => {
    state.item.action = "create"; state.item.targetId = null; state.item.reviewSnapshot = { schemaVersion: 1, targetFingerprint: null }; state.link = { targetId: "other" };
    await expect(applyJiraImport("run", ["item"], "Reviewed", "actor")).rejects.toThrow("canonical Jira mapping changed"); expect(state.mutate).not.toHaveBeenCalled();
  });
});
