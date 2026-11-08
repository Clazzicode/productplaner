import { randomUUID } from "node:crypto";
import { db, withServiceContext, withTransaction } from "@/lib/db";
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
  const release = /^[a-f0-9]{40,64}$/.test(process.env.VERCEL_GIT_COMMIT_SHA ?? "") ? process.env.VERCEL_GIT_COMMIT_SHA! : null;
  const started = Date.now();
  let stage: WorkerStage = "start";
  try {
    await withServiceContext(async () => await withTransaction(async () => {
      await db.$executeRaw`
      INSERT INTO app_private."WorkerHealth" ("worker", "runId", "startedAt", "stage")
      VALUES (${worker}, ${runId}, now(), 'start')
      ON CONFLICT ("worker") DO UPDATE SET "runId"=EXCLUDED."runId", "startedAt"=EXCLUDED."startedAt", "stage"='start'
    `;
      await db.$executeRaw`INSERT INTO app_private."WorkerExecution" ("runId",worker,"startedAt",stage,"releaseCommit") VALUES (${runId},${worker},now(),'start',${release})`;
      await db.$executeRaw`SELECT app_private.expire_worker_execution()`;
    }));
    serverLog("worker.started", { worker, stage });
    const { data, counts } = await work(value => { stage = value; });
    stage = "finish";
    const saved = await withServiceContext(async () => await withTransaction(async () => {
      await db.$executeRaw`UPDATE app_private."WorkerExecution" SET "finishedAt"=now(),outcome='succeeded',"durationMs"=${Date.now()-started}::integer,
        processed=${counts.processed}::integer,completed=${counts.completed}::integer,retried=${counts.retried}::integer,failed=${counts.failed}::integer,stage='finish' WHERE "runId"=${runId}`;
      if (counts.failed > 0) await db.$executeRaw`UPDATE app_private."WorkerHealth"
        SET "terminalJobFailures"="terminalJobFailures"+${counts.failed}::integer,"lastTerminalJobFailureAt"=now() WHERE worker=${worker}`;
      return await db.$executeRaw`
      UPDATE app_private."WorkerHealth" SET "finishedAt"=now(), "lastSuccessAt"=now(),
        "lastOutcome"='succeeded', "consecutiveFailures"=0, "durationMs"=${Date.now()-started}::integer,
        "processed"=${counts.processed}::integer, "completed"=${counts.completed}::integer,
        "retried"=${counts.retried}::integer, "failed"=${counts.failed}::integer, "errorCode"=NULL,
        "stage"='finish'
      WHERE "worker"=${worker} AND "runId"=${runId}
    `;
    }));
    if (saved && counts.failed > 0) serverLog("worker.alert.terminal_jobs", { status: 500, worker, stage, ...counts });
    serverLog("worker.completed", { worker, stage, durationMs: Date.now()-started, ...counts });
    try {
    const readiness = await loadWorkerReadiness();
    for (const name of ["background", "jira"] as const) {
      if (readiness[name] === "stale") serverLog("worker.alert.stale", { status: 503, worker: name });
    }
    } catch { serverLog("worker.health_unavailable", { status: 503, worker, stage }); }
    return data;
  } catch (error) {
    const errorCode = safeWorkerCode(error);
    try {
      const rows = await withServiceContext(async () => await withTransaction(async () => {
        await db.$executeRaw`UPDATE app_private."WorkerExecution" SET "finishedAt"=now(),outcome='failed',stage=${stage},"errorCode"=${errorCode},"durationMs"=${Date.now()-started}::integer WHERE "runId"=${runId} AND outcome IS NULL`;
        return await db.$queryRaw<{ consecutiveFailures: number }[]>`
        UPDATE app_private."WorkerHealth" SET "finishedAt"=now(), "lastOutcome"='failed',
          "consecutiveFailures"="consecutiveFailures"+1, "durationMs"=${Date.now()-started}::integer,
          "errorCode"=${errorCode}, "stage"=${stage}, processed=NULL, completed=NULL, retried=NULL, failed=NULL
        WHERE "worker"=${worker} AND "runId"=${runId} RETURNING "consecutiveFailures"
      `;
      }));
      if ((rows[0]?.consecutiveFailures ?? 0) >= 2) serverLog("worker.alert.consecutive_failures", { status: 503, worker, stage, errorCode });
    } catch { serverLog("worker.health_unavailable", { status: 503, worker, stage, errorCode }); }
    serverLog("worker.failed", { status: 500, worker, stage, errorCode, durationMs: Date.now()-started });
    throw error;
  }
}

/** Public readiness diagnostics contain only operational counts/times, no job IDs or source data. */
export async function loadWorkerSignals() {
  return await withServiceContext(async () => await db.$queryRaw<{ worker: WorkerName; consecutiveFailures: number; lastTerminalJobFailureAt: Date | null; terminalJobFailures: number }[]>`
    SELECT worker,"consecutiveFailures","lastTerminalJobFailureAt","terminalJobFailures"::integer
    FROM app_private."WorkerHealth"`);
}

export async function loadWorkerObservation() {
  const release = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!release || !/^[a-f0-9]{40,64}$/.test(release)) return [];
  return await withServiceContext(async () => await db.$queryRaw`
    WITH history AS (
      SELECT worker,"startedAt","finishedAt",outcome,failed,
        lag("startedAt") OVER (PARTITION BY worker ORDER BY "startedAt") AS previous
      FROM app_private."WorkerExecution" WHERE "releaseCommit"=${release}
    ), summary AS (
      SELECT worker,min("startedAt") AS "firstObservedAt",max("finishedAt") FILTER (WHERE outcome='succeeded') AS "lastSuccessAt",
        count(*) FILTER (WHERE "startedAt">=now()-interval '24 hours')::integer AS cycles,
        count(*) FILTER (WHERE "startedAt">=now()-interval '24 hours' AND outcome='failed')::integer AS "failedCycles",
        coalesce(sum(failed) FILTER (WHERE "startedAt">=now()-interval '24 hours'),0)::integer AS "terminalJobs",
        greatest(coalesce(max(extract(epoch FROM "startedAt"-greatest(previous,now()-interval '24 hours'))) FILTER (WHERE "startedAt">=now()-interval '24 hours'),0),
          extract(epoch FROM now()-max("startedAt")))::float8 AS "maxGapSeconds"
      FROM history GROUP BY worker
    ) SELECT w.worker,s."firstObservedAt",s."lastSuccessAt",coalesce(s.cycles,0) AS cycles,
      coalesce(s."failedCycles",0) AS "failedCycles",coalesce(s."terminalJobs",0) AS "terminalJobs",s."maxGapSeconds",
      coalesce(s."firstObservedAt"<=now()-interval '24 hours' AND s."lastSuccessAt">=now()-interval '15 minutes'
        AND s.cycles>=96 AND s."failedCycles"=0 AND s."terminalJobs"=0 AND s."maxGapSeconds"<=900,false) AS "coverageComplete"
    FROM (VALUES ('jira'),('background')) w(worker) LEFT JOIN summary s ON s.worker=w.worker`);
}
