import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/db", () => ({ withTransaction: async (fn: () => Promise<unknown>) => await fn(), withServiceContext: async (fn: () => Promise<unknown>) => await fn(), db: { $executeRaw: mocks.execute, $queryRaw: mocks.query } }));
vi.mock("@/lib/observability", () => ({ serverLog: mocks.log }));
import { observeWorker } from "../executionHealth";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue(1);
  mocks.query.mockImplementation(async (parts: TemplateStringsArray) => parts[0].includes("UPDATE") ? [{ consecutiveFailures: 2 }] : [
    { worker: "jira", startedAt: new Date(), finishedAt: new Date(), lastSuccessAt: new Date(), lastOutcome: "succeeded" },
    { worker: "background", startedAt: new Date(), finishedAt: new Date(), lastSuccessAt: new Date(), lastOutcome: "succeeded" },
  ]);
});
describe("worker execution recording", () => {
  it("records an idle cycle as a real successful execution", async () => {
    expect(await observeWorker("jira", async stage => {
      stage("retention"); return { data: "idle", counts: { processed: 0, completed: 0, retried: 0, failed: 0 } };
    })).toBe("idle");
    expect(mocks.execute.mock.calls.some(([sql]) => sql.join("").includes('INSERT INTO app_private."WorkerExecution"'))).toBe(true);
    expect(mocks.log).toHaveBeenCalledWith("worker.completed", expect.objectContaining({ worker: "jira", processed: 0 }));
  });
  it("records a failed stage and signals consecutive failures without logging its message", async () => {
    await expect(observeWorker("jira", async stage => { stage("retention"); throw Object.assign(new Error("secret data"), { code: "P2010" }); })).rejects.toThrow("secret data");
    expect(mocks.log).toHaveBeenCalledWith("worker.alert.consecutive_failures", expect.objectContaining({ stage: "retention", errorCode: "P2010" }));
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("secret data");
  });
  it("signals terminal jobs even though the worker itself completed", async () => {
    await observeWorker("background", async () => ({ data: [], counts: { processed: 1, completed: 0, retried: 0, failed: 1 } }));
    expect(mocks.log).toHaveBeenCalledWith("worker.alert.terminal_jobs", expect.objectContaining({ failed: 1 }));
  });
});
