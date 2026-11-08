type Signal = { worker: string; consecutiveFailures?: number; lastTerminalJobFailureAt?: string | null; terminalJobFailures?: number };
export type WorkerMonitorInput = { status?: string; workers?: Record<string, string>; workerSignals?: Signal[] };
export function workerAlerts(input: WorkerMonitorInput, observationStartedAt: string) {
  const since = Date.parse(observationStartedAt);
  if (!Number.isFinite(since)) throw new Error("An explicit observation start is required");
  const alerts: { key: string; worker: string; reason: string }[] = [];
  for (const worker of ["jira", "background"]) {
    const state = input.workers?.[worker];
    const signal = input.workerSignals?.find(row => row.worker === worker);
    if (!state || ["missing", "stale"].includes(state)) alerts.push({ key: `${worker}:stale`, worker, reason: "Required worker has no recent successful execution (15-minute readiness limit)." });
    if ((signal?.consecutiveFailures ?? 0) >= 2) alerts.push({ key: `${worker}:failed`, worker, reason: "Two or more consecutive worker cycles failed." });
    if (signal?.lastTerminalJobFailureAt && Date.parse(signal.lastTerminalJobFailureAt) >= since) alerts.push({ key: `${worker}:terminal:${signal.lastTerminalJobFailureAt}`, worker, reason: `Terminal job failure recorded at ${signal.lastTerminalJobFailureAt}.` });
  }
  if (input.status !== "ready" && !alerts.length && !Object.values(input.workers ?? {}).includes("failed")) alerts.push({ key: "readiness", worker: "application", reason: "Application readiness is unavailable." });
  return alerts;
}
