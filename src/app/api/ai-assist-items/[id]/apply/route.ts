import { withApi } from "@/lib/observability";
import { validateApplyTargets } from "@/lib/ai/assist/apply/validateTargets";
import { archiveWorkingVersion } from "@/lib/generation/versioning";
import { auditInitiative } from "@/lib/audit";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import { NextResponse } from "next/server";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { aiAssistApplySchema } from "@/lib/validation/schemas";
import { requireAiAssistItemAccess } from "@/lib/ai/assist/itemAccess";
import { applyAiAssistItem, isApplicableThroughDispatcher } from "@/lib/ai/assist/apply";
import { applyStatusRecommendation } from "@/lib/ai/assist/apply/applyStatusRecommendation";
import { AiAssistApplyBlockedError, DependencyAlreadyExistsError } from "@/lib/ai/errors";

// POST /api/ai-assist-items/[id]/apply (Section 4 §5/§23) — the only path
// that turns a Draft/Proposed AiAssistItem into a real write, and only on
// this explicit user action. `editedContent` lets the user's edits (not the
// AI's raw proposal) be what's actually written — status becomes
// "edited_and_applied" instead of "applied" so that distinction survives.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const item = await db.aiAssistItem.findUnique({ where: { id } });
  if (!item) return jsonError("Not found.", 404);

  const accessGuard = await requireAiAssistItemAccess(user, item);
  if (!accessGuard.ok) return accessGuard.response;

  if (item.status !== "proposed" && item.status !== "stale") {
    return jsonError(`This suggestion is already ${item.status.replace(/_/g, " ")}.`, 409);
  }

  const parsed = aiAssistApplySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { editedContent, confirmApprovedImpact } = parsed.data;
  const content = editedContent ?? JSON.parse(item.proposedContentJson);
  const nextStatus = editedContent ? "edited_and_applied" : "applied";

  try {
    if (item.actionKey === "RECOMMEND_STATUS") {
      if (item.targetType !== "project" && item.targetType !== "initiative") {
        return jsonError("This recommendation type doesn't apply directly — use its own form.", 400);
      }
      const proposed = JSON.parse(item.proposedContentJson) as { color: "green" | "yellow" | "red"; reason: string };
      const targetType: "project" | "initiative" = item.targetType;
      const targetGuard = targetType === "project"
        ? await requireProjectApiAccess(user, item.targetId ?? "")
        : await requireInitiativeApiAccess(user, item.targetId ?? "", "edit");
      if (!targetGuard.ok) return targetGuard.response;
      return withTransaction(async () => {
      const applied = await applyStatusRecommendation({
        organizationId: item.organizationId,
        entityType: targetType,
        entityId: item.targetId ?? "",
        color: proposed.color,
        reason: proposed.reason,
        updatedByUserId: user.id,
      });
      const updated = await db.aiAssistItem.update({
        where: { id },
        data: {
          status: nextStatus,
          appliedByUserId: user.id,
          appliedAt: new Date(),
          appliedValueJson: JSON.stringify(content),
          appliedEntityType: applied.appliedEntityType,
          appliedEntityId: applied.appliedEntityId,
        },
      });
      return NextResponse.json({ item: updated, applied });
      });
    }

    if (!isApplicableThroughDispatcher(item.actionKey)) {
      return jsonError("This recommendation applies through its own form — see the AI Assist panel.", 400);
    }

    const { updated, applied } = await withTransaction(async (tx) => {
      await validateApplyTargets(tx, item, content);
      // Detect a concurrent Apply before any content is changed.
      const claimed = await tx.aiAssistItem.updateMany({ where: { id, status: { in: ["proposed", "stale"] } }, data: { status: nextStatus } });
      if (claimed.count !== 1) throw new Error("Suggestion was already applied.");
      const prototype = item.initiativeId ? await tx.prototype.findUnique({ where: { initiativeId: item.initiativeId } }) : null;
      if (prototype) await archiveWorkingVersion(prototype.id);
      const applied = await applyAiAssistItem(tx, item, content, confirmApprovedImpact ?? false);
      if (prototype && item.actionKey === "PROPOSE_STORY_CONTENT") {
        await tx.prototype.update({ where: { id: prototype.id }, data: { approvedAt: null, approvedBaselineJson: null } });
      }
      if (item.initiativeId) await auditInitiative(item.initiativeId, "ai_suggestion.applied", { itemId: id, actionKey: item.actionKey });
      const updated = await tx.aiAssistItem.update({
        where: { id },
        data: {
          status: nextStatus,
          appliedByUserId: user.id,
          appliedAt: new Date(),
          appliedValueJson: JSON.stringify(content),
          appliedEntityType: applied.appliedEntityType,
          appliedEntityId: applied.appliedEntityId,
        },
      });
      return { updated, applied };
    });

    return NextResponse.json({ item: updated, applied });
  } catch (err) {
    if (err instanceof AiAssistApplyBlockedError) {
      return NextResponse.json(
        { error: err.message, requiresApprovedImpactConfirmation: true, reason: err.reason },
        { status: 409 },
      );
    }
    if (err instanceof DependencyAlreadyExistsError) return jsonError(err.message, 409);
    return jsonError("Could not apply this suggestion — please try again.", 502);
  }
}

export const POST = withApi(POSTHandler);
