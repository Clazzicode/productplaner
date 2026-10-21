import { withApi } from "@/lib/observability";
import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { determineRespectLocksBranch } from "@/lib/generation/engine";
import { enqueueBackgroundJob, idempotencyKeyFromRequest } from "@/lib/jobs/queue";
import { runBackgroundWorkerBatch } from "@/lib/jobs/worker";
import { recalculatePlanSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  if (!authGuard.user.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  const authUserId = authGuard.user.authUserId;
  establishAuthContext(authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = recalculatePlanSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  if (!parsed.data.confirmApprovedImpact) {
    const existing = await db.prototype.findUnique({
      where: { initiativeId: id },
      select: { approvedAt: true, layerLocks: { select: { layerType: true, state: true } } },
    });
    const branch = existing && parsed.data.mode === "respect_locks"
      ? determineRespectLocksBranch(existing.layerLocks)
      : null;
    if (existing?.approvedAt && (parsed.data.mode === "full" || branch?.kind !== "repack_only")) {
      return NextResponse.json({
        error: `This initiative has an approved baseline (approved ${existing.approvedAt.toLocaleDateString()}). This recalculation would rebuild approved work. Confirm to proceed anyway.`,
        requiresApprovedImpactConfirmation: true,
      }, { status: 409 });
    }
  }

  const user = authGuard.user;
  const job = await enqueueBackgroundJob({
    organizationId: user.organizationId,
    initiatedByUserId: user.id,
    initiatedByAuthUserId: authUserId,
    type: "plan.generate",
    payload: {
      initiativeId: id,
      mode: parsed.data.mode,
      confirmApprovedImpact: parsed.data.confirmApprovedImpact ?? false,
    },
    idempotencyKey: idempotencyKeyFromRequest(request),
    aggregateType: "initiative",
    aggregateId: id,
  });
  after(() => runBackgroundWorkerBatch(`request:${job.id}:${randomUUID()}`, 3));
  return NextResponse.json({ ok: true, jobId: job.id, status: job.status }, { status: 202 });
}

export const POST = withApi(POSTHandler);
