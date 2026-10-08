import { randomUUID } from "node:crypto";
import type { AiAssistItem, Prisma } from "@prisma/client";
import { requestSchema, type RequestInput } from "@/lib/requests/model";
import { requirementReviewFindingSchema } from "@/lib/requests/reviewModel";
import { AiAssistApplyBlockedError } from "@/lib/ai/errors";

const narrativeFields = new Set([
  "problem", "requestedChange", "outcome", "userAffected", "businessValueNarrative", "businessRules", "inScope",
  "outOfScope", "assumptions", "dependencies", "risks", "stakeholders", "supportingMaterials", "definitionOfSuccess",
]);

export async function applyRequirementReview(
  tx: Prisma.TransactionClient,
  item: AiAssistItem,
  content: unknown,
  confirmApprovedImpact: boolean,
  appliedByUserId: string,
) {
  const finding = requirementReviewFindingSchema.parse(content);
  const request = await tx.planningRequest.findFirst({ where: { id: finding.requestId, initiativeId: item.initiativeId ?? "" } });
  if (!request || item.organizationId !== (await tx.initiative.findUnique({ where: { id: request.initiativeId }, select: { organizationId: true } }))?.organizationId) {
    throw new Error("Requirement suggestion target is outside its initiative.");
  }
  const previous = requestSchema.parse(request.data);
  if (previous.status === "approved" && !confirmApprovedImpact) {
    throw new AiAssistApplyBlockedError("Applying this suggestion requires reopening the approved request for clarification.", "approved_request");
  }
  const next: RequestInput = structuredClone(previous);
  if (finding.fieldKey === "questions") {
    const actor = await tx.user.findUnique({ where: { id: appliedByUserId }, select: { name: true } });
    next.questions.push({ id: randomUUID(), question: finding.question, owner: actor?.name ?? "Product Owner", answer: "" });
    next.readiness = "needs_clarification";
  } else if (finding.fieldKey === "readiness") {
    next.readiness = finding.proposedValue as RequestInput["readiness"];
  } else if (narrativeFields.has(finding.fieldKey)) {
    (next as unknown as Record<string, unknown>)[finding.fieldKey] = finding.proposedValue;
  } else {
    throw new Error("Unsupported requirement field.");
  }
  if (previous.status === "approved") next.status = "clarifying";
  const validated = requestSchema.parse(next);
  const updated = await tx.planningRequest.update({
    where: { id: request.id, initiativeId: request.initiativeId, revision: request.revision },
    data: { data: validated as Prisma.InputJsonObject, revision: { increment: 1 } },
  });
  await tx.requestRevision.create({ data: {
    organizationId: item.organizationId, requestId: request.id, fromRevision: request.revision, toRevision: updated.revision,
    previousData: previous as Prisma.InputJsonObject, nextData: validated as Prisma.InputJsonObject,
    reason: `Applied AI requirement review: ${finding.title}`, changedByUserId: appliedByUserId, sourceAiAssistItemId: item.id,
  } });
  return { appliedEntityType: "planning_request", appliedEntityId: request.id };
}
