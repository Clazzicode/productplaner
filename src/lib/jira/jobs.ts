import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { establishAuthContext, db, rawDb, withTransaction } from "@/lib/db";
import { BusinessError } from "@/lib/businessError";
import { executeJiraExportItem, finalizeJiraExportRun } from "./export";
import { previewJiraImport } from "./import";
import { recordExportExecutionConflict } from "./conflicts";
import { renewWebhook } from "./webhooks";
import { jiraHash } from "./crypto";
import { auditInitiative } from "@/lib/audit";
import type { JiraConnection } from "@prisma/client";

type ClaimedJob = { job_id: string; organization_id: string; connection_id: string; actor_auth_user_id: string };
const payloadObject = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeJobError = (error: unknown) => error instanceof BusinessError ? error.message.slice(0, 500)
  : error instanceof Error && /^Jira request failed with status \d{3}\.$/.test(error.message) ? error.message
  : "Jira job failed; retry or review server diagnostics.";

async function perform(job: { id: string; jobType: string; payload: unknown; connectionId: string }) {
  const payload = payloadObject(job.payload);
  if (job.jobType === "import_preview") {
    const actorUserId = String(payload.actorUserId ?? "");
    if (!actorUserId) throw new BusinessError("The import job payload is invalid.", 422);
    await previewJiraImport(job.connectionId, actorUserId, job.id);
    return;
  }
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
    await previewJiraImport(job.connectionId, connection.configuredByUserId, job.id);
    await db.jiraWebhookEvent.update({ where: { id: event.id }, data: { status: "processed", processedAt: new Date(), failureMessage: null } });
    return;
  }
  if (job.jobType === "renew_webhook") { await renewWebhook(job.connectionId); return; }
  throw new BusinessError("Unsupported Jira job type.", 422);
}

export async function enqueueJiraImportPreview(connection: JiraConnection, actorUserId: string, idempotencyKey: string) {
  if (connection.status !== "connected" || !connection.initiativeId || !connection.cloudId || !connection.projectKey) {
    throw new BusinessError("Finish selecting a Jira site, project, and initiative before importing.", 422);
  }
  const key = jiraHash(`import-preview:${connection.id}:${actorUserId}:${idempotencyKey}`);
  const existing = await db.jiraSyncJob.findFirst({ where: { connectionId: connection.id, jobType: "import_preview", OR: [{ idempotencyKey: key }, { status: { in: ["queued", "processing"] } }] }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;
  try {
    return await withTransaction(async () => {
      const job = await db.jiraSyncJob.create({ data: { organizationId: connection.organizationId, initiativeId: connection.initiativeId!, connectionId: connection.id, jobType: "import_preview", payload: { actorUserId }, idempotencyKey: key } });
      await auditInitiative(connection.initiativeId!, "jira.import_queued", { jiraJobId: job.id, jiraConnectionId: connection.id, workspaceId: connection.organizationId, source: "jira", projectKey: connection.projectKey, actorUserId });
      return job;
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      const raced = await db.jiraSyncJob.findFirst({ where: { connectionId: connection.id, jobType: "import_preview", OR: [{ idempotencyKey: key }, { status: { in: ["queued", "processing"] } }] }, orderBy: { createdAt: "desc" } });
      if (raced) return raced;
    }
    throw error;
  }
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
      const completed = await withTransaction(async () => {
        const changed = await db.jiraSyncJob.updateMany({ where: { id: job.id, status: "processing", lockedBy: workerId, attemptCount: job.attemptCount }, data: { status: "completed", completedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
        if (changed.count === 1) await db.jiraSyncAttempt.createMany({ data: [{ organizationId: job.organizationId, jobId: job.id, attemptNumber: job.attemptCount, status: "succeeded", startedAt, finishedAt: new Date() }], skipDuplicates: true });
        return changed;
      });
      if (completed.count !== 1) continue;
      if (job.jobType === "export_item") {
        const exportItemId = String(payloadObject(job.payload).exportItemId ?? "");
        const item = exportItemId ? await db.jiraExportItem.findUnique({ where: { id: exportItemId } }) : null;
        if (item) await finalizeJiraExportRun(item.exportRunId);
      }
      result.completed += 1;
    } catch (error) {
      const message = safeJobError(error);
      const terminal = error instanceof BusinessError && [404, 409, 422].includes(error.status) || job.attemptCount >= job.maxAttempts;
      const updated = await withTransaction(async () => {
        const changed = await db.jiraSyncJob.updateMany({ where: { id: job.id, status: "processing", lockedBy: workerId, attemptCount: job.attemptCount }, data: terminal ? { status: "failed", lockedAt: null, lockedBy: null, lastError: message } : { status: "queued", availableAt: new Date(Date.now() + Math.min(60 * 60 * 1000, 2 ** job.attemptCount * 30_000)), lockedAt: null, lockedBy: null, lastError: message } });
        if (changed.count === 1) await db.jiraSyncAttempt.createMany({ data: [{ organizationId: job.organizationId, jobId: job.id, attemptNumber: job.attemptCount, status: terminal ? "failed" : "retry_scheduled", errorMessage: message, startedAt, finishedAt: new Date() }], skipDuplicates: true });
        return changed;
      });
      if (updated.count !== 1) continue;
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
      if (job.jobType === "import_preview" || job.jobType === "webhook_import") {
        await db.jiraConnection.update({ where: { id: job.connectionId }, data: { lastSyncAt: new Date(), lastSyncStatus: "read_failed" } });
        await auditInitiative(job.initiativeId, "jira.import_read_failed", { jiraJobId: job.id, jiraConnectionId: job.connectionId, workspaceId: job.organizationId, attempt: job.attemptCount, terminal, occurredAt: new Date().toISOString() });
      }
      if (terminal) result.failed += 1; else result.retried += 1;
    }
  }
  return result;
}

export async function manageJiraJob(jobId: string, action: "replay" | "cancel", actorUserId: string) {
  return withTransaction(async () => {
    const job = await db.jiraSyncJob.findUnique({ where: { id: jobId } });
    if (!job) throw new BusinessError("Jira job not found.", 404);
    if (action === "cancel") {
      if (job.status !== "queued") throw new BusinessError("Only queued Jira work can be cancelled.", 409);
      await db.jiraSyncJob.update({ where: { id: job.id }, data: { status: "cancelled", lastError: "Cancelled by an administrator." } });
      const payload = payloadObject(job.payload);
      if (job.jobType === "export_item") {
        const itemId = String(payload.exportItemId ?? "");
        if (itemId) {
          await db.jiraExportItem.updateMany({ where: { id: itemId, status: { not: "succeeded" } }, data: { status: "failed", failureMessage: "Cancelled before delivery." } });
          const item = await db.jiraExportItem.findUnique({ where: { id: itemId } });
          if (item) await finalizeJiraExportRun(item.exportRunId);
        }
      } else if (job.jobType === "webhook_import") {
        const eventId = String(payload.webhookEventId ?? "");
        if (eventId) await db.jiraWebhookEvent.updateMany({ where: { id: eventId, status: { not: "processed" } }, data: { status: "ignored", processedAt: new Date(), failureMessage: "Cancelled by an administrator." } });
      }
      await auditInitiative(job.initiativeId, "jira.job_cancelled", { jiraJobId: job.id, jobType: job.jobType, actorUserId });
      return db.jiraSyncJob.findUniqueOrThrow({ where: { id: job.id } });
    }
    if (!["failed", "cancelled"].includes(job.status)) throw new BusinessError("Only failed or cancelled Jira work can be replayed.", 409);
    const replay = await db.jiraSyncJob.create({ data: { organizationId: job.organizationId, initiativeId: job.initiativeId, connectionId: job.connectionId, jobType: job.jobType, payload: (job.payload ?? {}) as Prisma.InputJsonValue, idempotencyKey: jiraHash(`replay:${job.id}:${randomUUID()}`), maxAttempts: job.maxAttempts } });
    const payload = payloadObject(job.payload);
    if (job.jobType === "export_item") {
      const itemId = String(payload.exportItemId ?? "");
      if (itemId) await db.jiraExportItem.updateMany({ where: { id: itemId, status: "failed" }, data: { status: "pending", failureMessage: null } });
    } else if (job.jobType === "webhook_import") {
      const eventId = String(payload.webhookEventId ?? "");
      if (eventId) await db.jiraWebhookEvent.updateMany({ where: { id: eventId, status: { in: ["failed", "ignored"] } }, data: { status: "queued", processedAt: null, failureMessage: null } });
    }
    await auditInitiative(job.initiativeId, "jira.job_replayed", { originalJiraJobId: job.id, jiraJobId: replay.id, jobType: job.jobType, actorUserId });
    return replay;
  });
}
