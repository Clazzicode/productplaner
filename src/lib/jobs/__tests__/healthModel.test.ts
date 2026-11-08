import { describe, expect, it } from "vitest";
import { safeWorkerCode, workerReadiness, type WorkerHealth } from "../healthModel";

const now = new Date("2026-11-08T05:00:00Z");
const healthy: WorkerHealth = { worker: "jira", startedAt: now, finishedAt: now, lastOutcome: "succeeded", lastSuccessAt: now };
describe("observed worker readiness", () => {
  it("fails until each required worker has successfully completed", () => {
    expect(workerReadiness([], now)).toEqual({ jira: "missing", background: "missing" });
    expect(workerReadiness([healthy], now)).toEqual({ jira: "ready", background: "missing" });
    expect(workerReadiness([healthy, { ...healthy, worker: "background" }], now)).toEqual({ jira: "ready", background: "ready" });
  });
  it("fails after the latest failure even with a recent prior success", () => {
    expect(workerReadiness([{ ...healthy, lastOutcome: "failed" }], now).jira).toBe("failed");
  });
  it("becomes stale after fifteen minutes without a completed success", () => {
    expect(workerReadiness([healthy], new Date(now.getTime() + 900_001)).jira).toBe("stale");
    expect(workerReadiness([healthy], new Date(now.getTime() + 900_000)).jira).toBe("ready");
  });
  it("never emits error messages or credentials as diagnostic codes", () => {
    expect(safeWorkerCode(new Error("postgresql://secret"))).toBe("WORKER_EXECUTION_FAILED");
    expect(safeWorkerCode({ code: "P2010", message: "secret" })).toBe("P2010");
    expect(safeWorkerCode({ code: "https://private" })).toBe("WORKER_EXECUTION_FAILED");
  });
});
