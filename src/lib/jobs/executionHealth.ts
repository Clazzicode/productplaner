import { randomUUID } from "node:crypto";
import { db, withServiceContext } from "@/lib/db";
import { serverLog } from "@/lib/observability";
import { safeWorkerCode, workerReadiness, type WorkerCounts, type WorkerHealth, type WorkerName, type WorkerStage } from "./healthModel";

export async function loadWorkerReadiness() {
  const rows = await withServiceContext(async () => await db.$queryRaw<WorkerHealth[]>`
    SELECT "worker", "startedAt", "finishedAt", "lastSuccessAt", "lastOutcome"
    FROM app_private."WorkerHealth"
  `);
  return workerReadiness(rows);
}

export async function observeWorker<T>(worker: WorkerName, work: (stage: (value: WorkerStage) => void) => Promise<{ data: T; counts: WorkerCounts }>): Promise<T> {
  const runId = randomUUID();
  const started = Date.now();
  let stage: WorkerStage = "start";
  try {
    await withServiceContext(async () => await db.$executeRaw`
      INSERT INTO app_private."WorkerHealth" ("worker", "runId", "startedAt", "stage")
      VALUES (${worker}, ${runId}, now(), 'start')
      ON CONFLICT ("worker") DO UPDATE SET "runId"=EXCLUDED."runId", "startedAt"=EXCLUDED."startedAt", "stage"='start'
    `);
    serverLog("worker.started", { worker, stage });
    const { data, counts } = await work(value => { stage = value; });
    stage = "finish";
    const saved = await withServiceContext(async () => await db.$executeRaw`
      UPDATE app_private."WorkerHealth" SET "finishedAt"=now(), "lastSuccessAt"=now(),
        "lastOutcome"='succeeded', "consecutiveFailures"=0, "durationMs"=${Date.now()-started}::integer,
        "processed"=${counts.processed}::integer, "completed"=${counts.completed}::integer,
        "retried"=${counts.retried}::integer, "failed"=${counts.failed}::integer, "errorCode"=NULL, "stage"='finish'
      WHERE "worker"=${worker} AND "runId"=${runId}
    `);
    if (saved && counts.failed > 0) serverLog("worker.alert.terminal_jobs", { status: 500, worker, stage, ...counts });
    serverLog("worker.completed", { worker, stage, durationMs: Date.now()-started, ...counts });
    const readiness = await loadWorkerReadiness();
    for (const name of ["background", "jira"] as const) {
      if (readiness[name] === "stale") serverLog("worker.alert.stale", { status: 503, worker: name });
    }
    return data;
  } catch (error) {
    const errorCode = safeWorkerCode(error);
    try {
      const rows = await withServiceContext(async () => await db.$queryRaw<{ consecutiveFailures: number }[]>`
        UPDATE app_private."WorkerHealth" SET "finishedAt"=now(), "lastOutcome"='failed',
          "consecutiveFailures"="consecutiveFailures"+1, "durationMs"=${Date.now()-started}::integer,
          "errorCode"=${errorCode}, "stage"=${stage}
        WHERE "worker"=${worker} AND "runId"=${runId} RETURNING "consecutiveFailures"
      `);
      if ((rows[0]?.consecutiveFailures ?? 0) >= 2) serverLog("worker.alert.consecutive_failures", { status: 503, worker, stage, errorCode });
    } catch { serverLog("worker.health_unavailable", { status: 503, worker, stage, errorCode }); }
    serverLog("worker.failed", { status: 500, worker, stage, errorCode, durationMs: Date.now()-started });
    throw error;
  }
}
