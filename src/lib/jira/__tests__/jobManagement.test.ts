import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  job: { id: "job-a", organizationId: "org-a", initiativeId: "init-a", connectionId: "connection-a", jobType: "export_item", payload: { exportItemId: "item-a" }, idempotencyKey: "old", status: "failed", attemptCount: 5, maxAttempts: 5, availableAt: new Date(), lockedAt: null, lockedBy: null, completedAt: null, lastError: "outage", createdAt: new Date(), updatedAt: new Date() },
  created: [] as Record<string, unknown>[],
  audits: [] as string[],
  failAudit: false,
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = structuredClone({ job: state.job, created: state.created, audits: state.audits });
    try { return await fn(); } catch (error) {
      Object.assign(state.job, before.job);
      state.created.splice(0, state.created.length, ...before.created);
      state.audits.splice(0, state.audits.length, ...before.audits);
      throw error;
    }
  },
  establishAuthContext: vi.fn(),
  rawDb: { $queryRaw: vi.fn() },
  db: {
    jiraSyncJob: {
      findUnique: async () => state.job,
      findUniqueOrThrow: async () => state.job,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...state.job, ...data, id: "job-replay", status: "queued", attemptCount: 0 }; state.created.push(row); return row; },
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state.job, data); return state.job; },
    },
    jiraExportItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: async () => ({ id: "item-a", exportRunId: "run-a" }) },
    jiraWebhookEvent: { updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: async (_initiativeId: string, action: string) => { if (state.failAudit) throw new Error("audit unavailable"); state.audits.push(action); } }));
vi.mock("../export", () => ({ executeJiraExportItem: vi.fn(), finalizeJiraExportRun: vi.fn() }));
vi.mock("../conflicts", () => ({ recordExportExecutionConflict: vi.fn() }));
vi.mock("../import", () => ({ previewJiraImport: vi.fn() }));
vi.mock("../webhooks", () => ({ renewWebhook: vi.fn() }));

import { manageJiraJob } from "../jobs";

describe("Jira job recovery controls", () => {
  beforeEach(() => { state.job.status = "failed"; state.job.lastError = "outage"; state.created.length = 0; state.audits.length = 0; state.failAudit = false; });

  it("replays only terminal work as a new durable job", async () => {
    const replay = await manageJiraJob("job-a", "replay", "user-a");
    expect(replay).toMatchObject({ id: "job-replay", status: "queued", jobType: "export_item" });
    expect(state.created).toHaveLength(1);
    expect(state.audits).toContain("jira.job_replayed");
  });

  it("cancels queued work without executing it", async () => {
    state.job.status = "queued";
    await manageJiraJob("job-a", "cancel", "user-a");
    expect(state.job.status).toBe("cancelled");
    expect(state.audits).toContain("jira.job_cancelled");
  });

  it("rolls back job recovery when its audit event cannot be recorded", async () => {
    state.job.status = "queued";
    state.failAudit = true;
    await expect(manageJiraJob("job-a", "cancel", "user-a")).rejects.toThrow("audit unavailable");
    expect(state.job).toMatchObject({ status: "queued", lastError: "outage" });
    expect(state.audits).toHaveLength(0);
  });
});
