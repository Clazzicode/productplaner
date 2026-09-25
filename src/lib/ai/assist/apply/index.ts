import type { Prisma, AiAssistItem } from "@prisma/client";
import { applyFeatureProposal } from "./applyFeatureProposal";
import { applyContentProposal } from "./applyContentProposal";
import { applyDependencyObservation } from "./applyDependencyObservation";
import { applyRiskObservation } from "./applyRiskObservation";

export { AiAssistApplyBlockedError, DependencyAlreadyExistsError } from "@/lib/ai/errors";

// Apply dispatch (Section 4 §5) — mirrors src/lib/context/crystallize.ts's
// fieldKey-keyed table, reused for the same purpose: one small handler per
// AiActionKey, each routing through a real write a human could trigger by
// hand. RECOMMEND_STATUS applies via src/lib/ai/assist/apply/
// applyStatusRecommendation.ts directly (not through this dispatcher — it
// doesn't take a `tx`, see that file). ROADMAP_INSIGHTS/RECOMMEND_RELEASES/
// RECOMMEND_SPRINTS have no write path through this dispatcher at all:
// roadmap insights are read-only (Dismiss/Acknowledge only), and release/
// sprint recommendations apply through the platform's existing manual forms
// client-side, confirmed via POST /api/ai-assist-items/[id]/mark-applied.
export type ApplicableActionKey = "PROPOSE_FEATURES" | "PROPOSE_STORY_CONTENT" | "PROPOSE_DEPENDENCIES" | "PROPOSE_RISKS";

export function isApplicableThroughDispatcher(actionKey: string): actionKey is ApplicableActionKey {
  return (
    actionKey === "PROPOSE_FEATURES" ||
    actionKey === "PROPOSE_STORY_CONTENT" ||
    actionKey === "PROPOSE_DEPENDENCIES" ||
    actionKey === "PROPOSE_RISKS"
  );
}

export interface ApplyResult {
  appliedEntityType: string;
  appliedEntityId: string;
}

export async function applyAiAssistItem(
  tx: Prisma.TransactionClient,
  item: AiAssistItem,
  content: unknown,
  confirmApprovedImpact: boolean,
): Promise<ApplyResult> {
  switch (item.actionKey) {
    case "PROPOSE_FEATURES": {
      if (!item.initiativeId) throw new Error("Feature proposal has no initiativeId.");
      return applyFeatureProposal(tx, item.initiativeId, content);
    }
    case "PROPOSE_STORY_CONTENT": {
      if (!item.targetId) throw new Error("Story content proposal has no target feature.");
      return applyContentProposal(tx, item.targetId, content as never, confirmApprovedImpact);
    }
    case "PROPOSE_DEPENDENCIES":
      return applyDependencyObservation(tx, content as never);
    case "PROPOSE_RISKS":
      return applyRiskObservation(
        tx,
        { organizationId: item.organizationId, projectId: item.projectId, initiativeId: item.initiativeId, fieldKey: "risk" },
        content,
      );
    default:
      throw new Error(`AiAssistItem.actionKey "${item.actionKey}" has no apply path through this dispatcher.`);
  }
}
