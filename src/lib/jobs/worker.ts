import { ZodError, z } from "zod";
import type { Prisma } from "@prisma/client";
import { BusinessError } from "@/lib/businessError";
import { establishAuthContext } from "@/lib/db";
import {
  ApprovedBaselineImpactError,
  IntakeInvalidError,
  RecalculateBlockedError,
  recalculatePlan,
} from "@/lib/generation/engine";
import { serverLog } from "@/lib/observability";
import {
  claimNextBackgroundJob,
  completeBackgroundJob,
  failBackgroundJob,
  retryDelaySeconds,
} from "./queue";

const planGeneratePayload = z.object({
  initiativeId: z.string().min(1),
  mode: z.enum(["full", "respect_locks"]),
  confirmApprovedImpact: z.boolean(),
});

function isPermanentFailure(error: unknown): boolean {
  return error instanceof ZodError
    || error instanceof IntakeInvalidError
    || error instanceof ApprovedBaselineImpactError
    || error instanceof RecalculateBlockedError
    || (error instanceof BusinessError && error.status >= 400 && error.status < 500);
}

function safeWorkerError(error: unknown, permanent: boolean): { code: string; message: string } {
  if (error instanceof ZodError) return { code: "INVALID_JOB_PAYLOAD", message: "The queued job payload is invalid." };
  if (error instanceof IntakeInvalidError) return { code: "INTAKE_INVALID", message: "The intake has unresolved validation flags." };
  if (error instanceof ApprovedBaselineImpactError) return { code: "APPROVED_BASELINE_CONFIRMATION_REQUIRED", message: error.message };
  if (error instanceof RecalculateBlockedError || error instanceof BusinessError) {
    return { code: error.name.toUpperCase(), message: error.message };
  }
  return {
    code: permanent ? "PERMANENT_JOB_FAILURE" : "TRANSIENT_JOB_FAILURE",
    message: permanent ? "The background job cannot be completed." : "The background job failed temporarily and will be retried.",
  };
}

async function executeJob(type: string, payload: unknown): Promise<Prisma.InputJsonObject> {
  if (type === "plan.generate") {
    const parsed = planGeneratePayload.parse(payload);
    const result = await recalculatePlan(parsed.initiativeId, parsed.mode, {
      confirmApprovedImpact: parsed.confirmApprovedImpact,
    });
    return JSON.parse(JSON.stringify(result)) as Prisma.InputJsonObject;
  }
  throw new ZodError([{ code: "custom", path: ["type"], message: `Unsupported job type: ${type}`, input: type }]);
}

export async function runBackgroundWorkerOnce(workerId: string): Promise<"idle" | "completed" | "retrying" | "dead_letter"> {
  const job = await claimNextBackgroundJob(workerId);
  if (!job) return "idle";
  try {
    if (!job.initiatedByAuthUserId) throw new ZodError([{ code: "custom", path: ["initiatedByAuthUserId"], message: "Missing initiating identity", input: null }]);
    establishAuthContext(job.initiatedByAuthUserId);
    const result = await executeJob(job.type, job.payload);
    const completed = await completeBackgroundJob(job.id, workerId, result);
    if (!completed) throw new Error("Background job lease was lost before completion.");
    serverLog("background_job.completed");
    return "completed";
  } catch (error) {
    const permanent = isPermanentFailure(error);
    const safe = safeWorkerError(error, permanent);
    const baseDelay = retryDelaySeconds(job.attemptCount);
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay / 4)));
    const status = await failBackgroundJob({
      jobId: job.id,
      workerId,
      errorCode: safe.code,
      errorMessage: safe.message,
      retryDelaySeconds: baseDelay + jitter,
      permanent,
    });
    serverLog("background_job.failed", { status: permanent || status === "dead_letter" ? 500 : 503, errorType: safe.code });
    return status === "dead_letter" ? "dead_letter" : "retrying";
  }
}

export async function runBackgroundWorkerBatch(workerId: string, limit = 3) {
  const outcomes: Array<"completed" | "retrying" | "dead_letter"> = [];
  for (let index = 0; index < Math.max(1, Math.min(limit, 10)); index += 1) {
    const outcome = await runBackgroundWorkerOnce(workerId);
    if (outcome === "idle") break;
    outcomes.push(outcome);
  }
  return outcomes;
}

