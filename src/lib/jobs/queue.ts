import type { BackgroundJob, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db, rawDb, withTransaction } from "@/lib/db";
import type { BackgroundJobType } from "./types";

export interface EnqueueBackgroundJobInput {
  organizationId: string;
  initiatedByUserId: string;
  initiatedByAuthUserId: string;
  type: BackgroundJobType;
  payload: Prisma.InputJsonObject;
  idempotencyKey: string;
  aggregateType: string;
  aggregateId: string;
  priority?: number;
  maxAttempts?: number;
  availableAt?: Date;
}

/** Atomically records both the work and the durable event that requested it. */
export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput): Promise<BackgroundJob> {
  return withTransaction(async (tx) => {
    const job = await tx.backgroundJob.upsert({
      where: {
        organizationId_type_idempotencyKey: {
          organizationId: input.organizationId,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        initiatedByUserId: input.initiatedByUserId,
        initiatedByAuthUserId: input.initiatedByAuthUserId,
        type: input.type,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        priority: input.priority ?? 100,
        maxAttempts: input.maxAttempts ?? 5,
        availableAt: input.availableAt,
      },
      update: {},
    });

    await tx.outboxEvent.upsert({
      where: {
        organizationId_eventType_deduplicationKey: {
          organizationId: input.organizationId,
          eventType: "background_job.requested",
          deduplicationKey: input.idempotencyKey,
        },
      },
      create: {
        organizationId: input.organizationId,
        backgroundJobId: job.id,
        eventType: "background_job.requested",
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        deduplicationKey: input.idempotencyKey,
        payload: { jobId: job.id, jobType: input.type },
      },
      update: {},
    });
    return job;
  });
}

export async function claimNextBackgroundJob(workerId: string, leaseSeconds = 300): Promise<BackgroundJob | null> {
  const rows = await rawDb.$queryRaw<BackgroundJob[]>`
    SELECT * FROM app_private.claim_background_job(${workerId}, ${leaseSeconds}::integer)
  `;
  return rows[0] ?? null;
}

export async function heartbeatBackgroundJob(jobId: string, workerId: string, leaseSeconds = 300): Promise<boolean> {
  const rows = await rawDb.$queryRaw<Array<{ extended: boolean | null }>>`
    SELECT app_private.heartbeat_background_job(${jobId}, ${workerId}, ${leaseSeconds}::integer) AS extended
  `;
  return rows[0]?.extended === true;
}

export async function completeBackgroundJob(
  jobId: string,
  workerId: string,
  result: Prisma.InputJsonObject,
): Promise<boolean> {
  const serialized = JSON.stringify(result);
  const rows = await rawDb.$queryRaw<Array<{ completed: boolean | null }>>`
    SELECT app_private.complete_background_job(${jobId}, ${workerId}, ${serialized}::jsonb) AS completed
  `;
  return rows[0]?.completed === true;
}

export async function failBackgroundJob(input: {
  jobId: string;
  workerId: string;
  errorCode: string;
  errorMessage: string;
  retryDelaySeconds: number;
  permanent: boolean;
}): Promise<string | null> {
  const rows = await rawDb.$queryRaw<Array<{ status: string | null }>>`
    SELECT app_private.fail_background_job(
      ${input.jobId},
      ${input.workerId},
      ${input.errorCode},
      ${input.errorMessage},
      ${input.retryDelaySeconds}::integer,
      ${input.permanent}
    ) AS status
  `;
  return rows[0]?.status ?? null;
}

export function retryDelaySeconds(attemptNumber: number): number {
  const exponential = Math.min(3600, 5 * 2 ** Math.max(0, attemptNumber - 1));
  // Deterministic lower-bound helper; the worker adds bounded random jitter.
  return exponential;
}

export function idempotencyKeyFromRequest(request: Request): string {
  const candidate = request.headers.get("idempotency-key")?.trim();
  if (candidate && candidate.length >= 8 && candidate.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

export async function getBackgroundJobForCurrentOrganization(jobId: string) {
  return db.backgroundJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      type: true,
      status: true,
      result: true,
      attemptCount: true,
      maxAttempts: true,
      availableAt: true,
      startedAt: true,
      completedAt: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

