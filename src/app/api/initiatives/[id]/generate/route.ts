import { withApi } from "@/lib/observability";
import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { enqueueBackgroundJob, idempotencyKeyFromRequest } from "@/lib/jobs/queue";
import { runBackgroundWorkerBatch } from "@/lib/jobs/worker";
import { generateSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

async function POSTHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  if (!user.authUserId) return jsonError("Your authenticated account is not fully provisioned.", 409);
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  const parsed = generateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  if (!parsed.data.confirmApprovedImpact) {
    const existing = await db.prototype.findUnique({ where: { initiativeId: id }, select: { approvedAt: true } });
    if (existing?.approvedAt) {
      return NextResponse.json({
        error: `This initiative has an approved baseline (approved ${existing.approvedAt.toLocaleDateString()}). Full regenerate replaces the entire plan. Confirm to proceed anyway.`,
        requiresApprovedImpactConfirmation: true,
      }, { status: 409 });
    }
  }

  const job = await enqueueBackgroundJob({
    organizationId: user.organizationId,
    initiatedByUserId: user.id,
    initiatedByAuthUserId: user.authUserId,
    type: "plan.generate",
    payload: { initiativeId: id, mode: "full", confirmApprovedImpact: parsed.data.confirmApprovedImpact ?? false },
    idempotencyKey: idempotencyKeyFromRequest(request),
    aggregateType: "initiative",
    aggregateId: id,
  });
  after(() => runBackgroundWorkerBatch(`request:${job.id}:${randomUUID()}`, 3));
  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
}

export const POST = withApi(POSTHandler);
