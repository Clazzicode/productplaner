import type { AiAssistItem } from "@prisma/client";
import {
  computeContentProposalFingerprint,
  computeDependencyObservationFingerprint,
  computeFeatureProposalFingerprint,
  computeReleaseRecommendationFingerprint,
  computeRiskObservationFingerprint,
  computeRoadmapInsightFingerprint,
  computeSprintRecommendationFingerprint,
  computeStatusRecommendationFingerprint,
} from "./fingerprint";

// Live drift check for the AI Assist list route (Section 4 §4/§31) — called
// on every load for each still-"proposed" item, so context changes surface
// as a "may need an update" flag without ever regenerating on their own.
// Returns null (never throws) when the referenced entity is gone or the
// action key isn't recognized — a missing signal leaves the item's status
// untouched rather than breaking the whole list request.
export async function recomputeFingerprintForItem(item: AiAssistItem): Promise<string | null> {
  try {
    switch (item.actionKey) {
      case "ROADMAP_INSIGHTS":
        return item.initiativeId ? await computeRoadmapInsightFingerprint(item.initiativeId) : null;
      case "PROPOSE_FEATURES":
        return item.initiativeId ? await computeFeatureProposalFingerprint(item.initiativeId) : null;
      case "PROPOSE_STORY_CONTENT":
        return item.targetId ? await computeContentProposalFingerprint(item.targetId) : null;
      case "PROPOSE_DEPENDENCIES":
        return item.initiativeId ? await computeDependencyObservationFingerprint(item.initiativeId) : null;
      case "PROPOSE_RISKS":
        return item.initiativeId ? await computeRiskObservationFingerprint(item.initiativeId) : null;
      case "RECOMMEND_RELEASES":
        return item.initiativeId ? await computeReleaseRecommendationFingerprint(item.initiativeId) : null;
      case "RECOMMEND_SPRINTS":
        return item.initiativeId ? await computeSprintRecommendationFingerprint(item.initiativeId) : null;
      case "RECOMMEND_STATUS":
        if ((item.targetType === "project" || item.targetType === "initiative") && item.targetId) {
          return computeStatusRecommendationFingerprint(item.targetType, item.targetId);
        }
        return null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
