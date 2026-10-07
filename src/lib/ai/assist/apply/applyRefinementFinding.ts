import type { AiAssistItem, Prisma } from "@prisma/client";
import { refinementFindingProposalSchema } from "@/lib/validation/schemas";

export async function applyRefinementFinding(
  tx: Prisma.TransactionClient,
  item: AiAssistItem,
  content: unknown,
): Promise<{ appliedEntityType: "refinement_finding"; appliedEntityId: string }> {
  const parsed = refinementFindingProposalSchema.parse(content);
  if (parsed.storyArtifactLayerId !== item.targetId) throw new Error("Finding target does not match its story.");

  const story = await tx.artifactLayer.findFirst({
    where: {
      id: parsed.storyArtifactLayerId,
      type: "story",
      prototype: { initiativeId: item.initiativeId ?? "", initiative: { organizationId: item.organizationId } },
    },
    select: { id: true },
  });
  if (!story || !item.initiativeId) throw new Error("Finding target is outside its initiative.");

  const finding = await tx.refinementFinding.create({
    data: {
      organizationId: item.organizationId,
      initiativeId: item.initiativeId,
      storyId: story.id,
      sourceType: "ai",
      category: parsed.category,
      title: parsed.title,
      detail: parsed.detail,
      sourceAiAssistItemId: item.id,
      createdByUserId: item.generatedByUserId,
    },
    select: { id: true },
  });
  return { appliedEntityType: "refinement_finding", appliedEntityId: finding.id };
}
