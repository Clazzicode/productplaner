import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";

// GET /api/ai-jobs/[id] (Section 4 §32/§33) — refresh-resumability: the
// client polls this while a job is non-terminal instead of restarting
// generation on a browser refresh.
async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const job = await db.aiJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      actionKey: true,
      startedAt: true,
      completedAt: true,
      errorMessage: true,
      resultSummaryJson: true,
      organizationId: true,
      projectId: true,
      initiativeId: true,
    },
  });
  if (!job) return jsonError("Not found.", 404);

  if (job.initiativeId) {
    const guard = await requireInitiativeApiAccess(user, job.initiativeId, "view");
    if (!guard.ok) return guard.response;
  } else if (job.projectId) {
    const guard = await requireProjectApiAccess(user, job.projectId);
    if (!guard.ok) return guard.response;
  } else if (job.organizationId !== user.organizationId) {
    return jsonError("Not found.", 404);
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    actionKey: job.actionKey,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    resultSummaryJson: job.resultSummaryJson,
  });
}

export const GET = withApi(GETHandler);
