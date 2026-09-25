import { db } from "@/lib/db";
import type { AiActionKey, AiJobStatus } from "./types";

// AI job bookkeeping (directive §18-21 foundation) — a persisted record of
// each AI action invocation, independent of AiUsageEvent (which only ever
// records a *finished* attempt). Status writes are secondary bookkeeping:
// swallow-on-failure here, matching this module's existing convention for
// non-critical writes (e.g. usage.ts's lock-release .catch(() => {})), so a
// job-tracking hiccup never fails the actual AI request.

export async function createAiJob(params: {
  organizationId: string;
  createdByUserId: string;
  actionKey: AiActionKey;
  projectId?: string | null;
  initiativeId?: string | null;
}): Promise<string> {
  const job = await db.aiJob.create({
    data: {
      organizationId: params.organizationId,
      createdByUserId: params.createdByUserId,
      actionKey: params.actionKey,
      projectId: params.projectId ?? null,
      initiativeId: params.initiativeId ?? null,
      status: "queued",
    },
    select: { id: true },
  });
  return job.id;
}

export async function setAiJobStatus(jobId: string, status: AiJobStatus): Promise<void> {
  await db.aiJob.update({ where: { id: jobId }, data: { status } }).catch(() => {});
}

export async function completeAiJob(jobId: string, resultSummary: Record<string, unknown>): Promise<void> {
  await db.aiJob
    .update({
      where: { id: jobId },
      data: { status: "completed", completedAt: new Date(), resultSummaryJson: JSON.stringify(resultSummary) },
    })
    .catch(() => {});
}

export async function failAiJob(jobId: string, errorMessage: string): Promise<void> {
  await db.aiJob
    .update({ where: { id: jobId }, data: { status: "failed", completedAt: new Date(), errorMessage } })
    .catch(() => {});
}

// Section 5 §40 — internal-only, lightweight context-audit trail (record
// type/id/version references, never the assembled prompt text itself — see
// src/lib/ai/context/types.ts's ContextAudit, which is exactly what's
// serialized here unmodified).
export async function setAiJobContextAudit(jobId: string, audit: Record<string, unknown>): Promise<void> {
  await db.aiJob.update({ where: { id: jobId }, data: { contextAuditJson: JSON.stringify(audit) } }).catch(() => {});
}
