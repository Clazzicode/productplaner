import { setRoadmapStatus } from "@/lib/roadmapStatus/service";
import type { StatusColor, StatusEntityType } from "@/lib/roadmapStatus/types";

// status_recommendation -> setRoadmapStatus(), the platform's existing,
// unmodified Accept/Keep-Current mechanism (Section 4 §5/§25) — zero new
// write path. Deliberately NOT part of the transactional applyAiAssistItem
// dispatcher: setRoadmapStatus writes through the shared `db` client (not a
// passed-in tx), so the API route calls this, then updates the AiAssistItem
// row as a second, separate step — matching how release/sprint recommend
// "apply" is also not a single atomic write (Section 4 §5's external-form
// case), rather than forcing an artificial tx parameter onto a shared,
// otherwise-untouched module.
export async function applyStatusRecommendation(params: {
  organizationId: string;
  entityType: StatusEntityType;
  entityId: string;
  color: StatusColor;
  reason: string;
  updatedByUserId: string;
}): Promise<{ appliedEntityType: "roadmap_status"; appliedEntityId: string }> {
  await setRoadmapStatus({
    organizationId: params.organizationId,
    entityType: params.entityType,
    entityId: params.entityId,
    color: params.color,
    reason: params.reason,
    source: "system",
    updatedByUserId: params.updatedByUserId,
  });
  return { appliedEntityType: "roadmap_status", appliedEntityId: params.entityId };
}
