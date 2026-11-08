import { describe, expect, it } from "vitest";
import { workerAlerts } from "../monitorModel";
const start = "2026-11-08T12:00:00Z";
const good = { status: "ready", workers: { jira: "ready", background: "ready" } };
describe("worker monitor thresholds", () => {
  it("does not alert for one transient failed cycle", () => expect(workerAlerts({ ...good, status: "unavailable", workers: { ...good.workers, jira: "failed" }, workerSignals: [{ worker: "jira", consecutiveFailures: 1 }] }, start)).toEqual([]));
  it("alerts on two failures and stale/missing required workers", () => {
    expect(workerAlerts({ ...good, workers: { jira: "failed", background: "stale" }, workerSignals: [{ worker: "jira", consecutiveFailures: 2 }] }, start).map(row => row.key)).toEqual(["jira:failed", "background:stale"]);
  });
  it("retains terminal failure evidence even after a healthy idle cycle", () => {
    expect(workerAlerts({ ...good, workerSignals: [{ worker: "jira", lastTerminalJobFailureAt: "2026-11-08T12:10:00Z" }] }, start)[0].key).toContain("terminal");
    expect(workerAlerts({ ...good, workerSignals: [{ worker: "jira", lastTerminalJobFailureAt: "2026-11-07T12:10:00Z" }] }, start)).toEqual([]);
  });
  it("fails closed for missing monitoring payloads and requires a bounded observation start", () => {
    expect(workerAlerts({}, start)).toHaveLength(2);
    expect(() => workerAlerts(good, "invalid")).toThrow();
  });
});
