import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { runAnalyzeIntake } from "@/lib/ai/actions/analyzeIntake";
import {
  AiCapabilityDisabledError,
  AiDisabledError,
  AiRequestInProgressError,
  AiResponseValidationError,
  AiUsageLimitExceededError,
} from "@/lib/ai/errors";

// AI Foundation — ANALYZE_INTAKE (docs/V2-AI-FOUNDATION.md). Analysis only:
// writes exclusively to the new IntakeAiAnalysis/AiUsageEvent tables, never
// to IntakeAnswerSet/Capability or anything the deterministic generation
// engine owns.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  try {
    const { analysis, analysisId, usageEventId } = await runAnalyzeIntake({
      initiativeId: id,
      userId: user.id,
      organizationId: user.organizationId,
    });
    return NextResponse.json({ analysis, analysisId, usageEventId });
  } catch (err) {
    if (err instanceof AiDisabledError) return jsonError("AI features are currently disabled.", 503);
    if (err instanceof AiCapabilityDisabledError) return jsonError(err.message, 403);
    if (err instanceof AiUsageLimitExceededError) return jsonError(err.message, 429);
    if (err instanceof AiRequestInProgressError) {
      return jsonError("An analysis is already in progress for this initiative.", 409);
    }
    if (err instanceof AiResponseValidationError) {
      return jsonError("The AI response could not be validated — please try again.", 502);
    }
    return jsonError("Could not analyze this initiative — please try again.", 502);
  }
}

export const POST = withApi(POSTHandler);
