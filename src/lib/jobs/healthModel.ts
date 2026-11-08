export const REQUIRED_WORKERS = ["background", "jira"] as const;
export type WorkerName = typeof REQUIRED_WORKERS[number];
export type WorkerStage = "start" | "execute" | "retention" | "finish";
export type WorkerCounts = { processed: number; completed: number; retried: number; failed: number };
export type WorkerHealth = {
  worker: WorkerName; startedAt: Date; finishedAt: Date | null;
  lastSuccessAt: Date | null; lastOutcome: "succeeded" | "failed" | null;
};

export function workerReadiness(rows: WorkerHealth[], now = new Date()) {
  return Object.fromEntries(REQUIRED_WORKERS.map(worker => {
    const row = rows.find(item => item.worker === worker);
    const status = !row?.lastOutcome ? "missing" : row.lastOutcome === "failed" ? "failed"
      : !row.lastSuccessAt || now.getTime() - row.lastSuccessAt.getTime() > 15 * 60_000 ? "stale" : "ready";
    return [worker, status];
  })) as Record<WorkerName, "missing" | "failed" | "stale" | "ready">;
}

export function safeWorkerCode(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && /^[A-Z0-9_]{2,40}$/.test(code) ? code : "WORKER_EXECUTION_FAILED";
}
