import { randomUUID } from "node:crypto";
import { establishAuthContext, db, rawDb } from "@/lib/db";
import { BusinessError } from "@/lib/businessError";
import { executeJiraExportItem, finalizeJiraExportRun } from "./export";
import { previewJiraImport } from "./import";
import { recordExportExecutionConflict } from "./conflicts";
import { renewWebhook } from "./webhooks";

type ClaimedJob = { job_id: string; organization_id: string; connection_id: string; actor_auth_user_id: string };
const payloadObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

async function perform(job: { id: string; jobType: string; payload: unknown; connectionId: string }) {
  const payload = payloadObject(job.payload);
  if (job.jobType === "export_item") {
    const exportItemId = String(payload.exportItemId ?? "");
    if (!exportItemId) throw new BusinessError("The export job payload is invalid.", 422);
    await executeJiraExportItem(exportItemId);
    return;
  }
  if (job.jobType === "webhook_import") {
    const eventId = String(payload.webhookEventId ?? "");
    const event = await db.jiraWebhookEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new BusinessError("The webhook event no longer exists.", 404);
    if (event.status === "processed" || event.status === "ignored") return;
    const connection = await db.jiraConnection.findUniqueOrThrow({ where: { id: job.connectionId } });
    await previewJiraImport(job.connectionId, connection.configuredByUserId);
    await db.jiraWebhookEvent.update({ where: { id: event.id }, data: { status: "processed", processedAt: new Date(), failureMessage: null } });
    return;
  }
  if (job.jobType === "renew_webhook") { await renewWebhook(job.connectionId); return; }
  throw new BusinessError("Unsupported Jira job type.", 422);
}

async function claim(workerId: string, limit: number, organizationId?: string) {
  return rawDb.$queryRaw<ClaimedJob[]>`SELECT * FROM app_private.claim_jira_jobs(${workerId},${limit},${organizationId ?? null})`;
}

export async function processJiraJobs(limit = 10, workerId = `jira-${randomUUID()}`, organizationId?: string) {
  const claimed = await claim(workerId, limit, organizationId);
  const result = { claimed: claimed.length, completed: 0, retried: 0, failed: 0 };
  for (const claimRow of claimed) {
    establishAuthContext(claimRow.actor_auth_user_id);
    const job = await db.jiraSyncJob.findUnique({ where: { id: claimRow.job_id } });
    if (!job || job.status !== "processing" || job.lockedBy !== workerId) continue;
    const startedAt = new Date();
    try {
      await perform(job);
      await db.jiraSyncAttempt.createMany({ data: [{ organizationId: job.organizationId, jobId: job.id, attemptNumber: job.attemptCount, status: "succeeded", startedAt, finishedAt: new Date() }], skipDuplicates: true });
      await db.jiraSyncJob.update({ where: { id: job.id }, data: { status: "completed", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
      if (job.jobType === "export_item") {
        const exportItemId = String(payloadObject(job.payload).exportItemId ?? "");
        const item = exportItemId ? await db.jiraExportItem.findUnique({ where: { id: exportItemId } }) : null;
        if (item) await finalizeJiraExportRun(item.exportRunId);
      }
      result.completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Jira job failed.";
      const terminal = error instanceof BusinessError && [404, 409, 422].includes(error.status) || job.attemptCount >= job.maxAttempts;
      await db.jiraSyncAttempt.createMany({ data: [{ organizationId: job.organizationId, jobId: job.id, attemptNumber: job.attemptCount, status: terminal ? "failed" : "retry_scheduled", errorMessage: message, startedAt, finishedAt: new Date() }], skipDuplicates: true });
      await db.jiraSyncJob.update({ where: { id: job.id }, data: terminal ? { status: "failed", lockedAt: null, lockedBy: null, lastError: message } : { status: "queued", availableAt: new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** job.attemptCount * 30_000)), lockedAt: null, lockedBy: null, lastError: message } });
      const payload = payloadObject(job.payload);
      if (job.jobType === "export_item") {
        const exportItemId = String(payload.exportItemId ?? "");
        if (exportItemId) {
          await db.jiraExportItem.updateMany({ where: { id: exportItemId, status: { not: "succeeded" } }, data: { status: error instanceof BusinessError && error.status === 409 ? "conflict" : "failed", failureMessage: message } });
          if (terminal && error instanceof BusinessError && error.status === 409) await recordExportExecutionConflict(exportItemId, message).catch(() => null);
          const item = await db.jiraExportItem.findUnique({ where: { id: exportItemId } });
          if (terminal && item) await finalizeJiraExportRun(item.exportRunId);
        }
      } else if (job.jobType === "webhook_import") {
        const eventId = String(payload.webhookEventId ?? "");
        if (eventId) await db.jiraWebhookEvent.updateMany({ where: { id: eventId }, data: { status: terminal ? "failed" : "queued", failureMessage: message } });
      } else if (job.jobType === "renew_webhook" && terminal) {
        await db.jiraWebhookSubscription.updateMany({ where: { connectionId: job.connectionId, status: { not: "disabled" } }, data: { status: "renewal_required" } });
      }
      if (terminal) result.failed += 1; else result.retried += 1;
    }
  }
  return result;
}
