import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ attempt: vi.fn(), updateJob: vi.fn().mockResolvedValue({ count: 1 }), updateItem: vi.fn(), establish: vi.fn(), jobType: "export_item", payload: { exportItemId: "item-a" } as Record<string, string> }));
vi.mock("@/lib/db", () => ({
  establishAuthContext: mocks.establish,
  withTransaction: async (fn: () => Promise<unknown>) => fn(),
  rawDb: { $queryRaw: vi.fn().mockResolvedValue([{ job_id: "job-a", organization_id: "org-a", connection_id: "connection-a", actor_auth_user_id: "00000000-0000-0000-0000-000000000001" }]) },
  db: {
    jiraSyncJob: { findUnique: async () => ({ id: "job-a", organizationId: "org-a", connectionId: "connection-a", initiativeId: "init-a", jobType: mocks.jobType, payload: mocks.payload, status: "processing", lockedBy: "worker-a", attemptCount: 1, maxAttempts: 5 }), updateMany: mocks.updateJob },
    jiraSyncAttempt: { createMany: mocks.attempt },
    jiraExportItem: { updateMany: mocks.updateItem, findUnique: async () => ({ id: "item-a", exportRunId: "run-a" }) },
    jiraWebhookEvent: { updateMany: vi.fn() },
  },
}));
vi.mock("../export", () => ({ executeJiraExportItem: vi.fn().mockRejectedValue(new Error("Temporary Jira outage")), finalizeJiraExportRun: vi.fn() }));
vi.mock("../conflicts", () => ({ recordExportExecutionConflict: vi.fn() }));
vi.mock("../import", () => ({ previewJiraImport: vi.fn() }));
vi.mock("../webhooks", () => ({ renewWebhook: vi.fn() }));

import { processJiraJobs } from "../jobs";

describe("durable Jira job processing", () => {
  it("persists temporary failures and schedules exponential retry", async () => {
    const result = await processJiraJobs(10, "worker-a", "org-a");
    expect(result).toEqual({ claimed: 1, completed: 0, retried: 1, failed: 0 });
    expect(mocks.establish).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000001");
    expect(mocks.attempt).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ status: "retry_scheduled", errorMessage: "Jira job failed; retry or review server diagnostics." })]) }));
    expect(mocks.updateJob).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "queued", lastError: "Jira job failed; retry or review server diagnostics." }) }));
  });
  it("does not finalize work after another worker has taken the lease", async () => {
    mocks.attempt.mockClear();
    mocks.updateJob.mockResolvedValueOnce({ count: 0 });
    const result = await processJiraJobs(10, "worker-a", "org-a");
    expect(result).toEqual({ claimed: 1, completed: 0, retried: 0, failed: 0 });
    expect(mocks.attempt).not.toHaveBeenCalled();
  });
  it("passes the durable job ID to a read-only import preview", async () => {
    mocks.jobType = "import_preview";
    mocks.payload = { actorUserId: "user-a" };
    const result = await processJiraJobs(10, "worker-a", "org-a");
    const { previewJiraImport } = await import("../import");
    expect(previewJiraImport).toHaveBeenCalledWith("connection-a", "user-a", "job-a");
    expect(result.completed).toBe(1);
  });
});
