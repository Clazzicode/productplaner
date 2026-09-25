import type { AiAssistItem, Prisma } from "@prisma/client";
import { proposeStoryContentResultSchema, proposeDependencyCandidateSchema } from "@/lib/validation/schemas";

/** Client edits are untrusted even when the original AI suggestion was valid. */
export async function validateApplyTargets(tx: Prisma.TransactionClient, item: AiAssistItem, content: unknown) {
  if (item.actionKey === "PROPOSE_STORY_CONTENT") {
    const parsed = proposeStoryContentResultSchema.pick({ epics: true }).parse(content);
    const feature = await tx.artifactLayer.findFirst({
      where: { id: item.targetId ?? "", type: "feature", prototype: { initiativeId: item.initiativeId ?? "", initiative: { organizationId: item.organizationId } } },
      select: { id: true, prototypeId: true },
    });
    if (!feature) throw new Error("Suggestion target is outside its initiative.");
    async function check(id: string | null, parentId: string | null, type: string) {
      if (!id) return;
      if (!parentId || !await tx.artifactLayer.findFirst({ where: { id, parentId, prototypeId: feature!.prototypeId, type }, select: { id: true } })) {
        throw new Error("Edited artifact is outside its expected parent.");
      }
    }
    for (const epic of parsed.epics) {
      await check(epic.existingArtifactLayerId, feature.id, "epic");
      for (const story of epic.stories) {
        await check(story.existingArtifactLayerId, epic.existingArtifactLayerId, "story");
        for (const ac of story.acceptanceCriteria) await check(ac.existingArtifactLayerId, story.existingArtifactLayerId, "acceptance_criterion");
      }
    }
  } else if (item.actionKey === "PROPOSE_DEPENDENCIES") {
    const parsed = proposeDependencyCandidateSchema.pick({ fromCapabilityId: true, toCapabilityId: true }).parse(content);
    const ids = [...new Set([parsed.fromCapabilityId, parsed.toCapabilityId])];
    if (ids.length !== 2 || await tx.capability.count({ where: { id: { in: ids }, intakeAnswerSet: { initiativeId: item.initiativeId ?? "", initiative: { organizationId: item.organizationId } } } }) !== 2) {
      throw new Error("Dependencies must belong to this initiative.");
    }
  }
}
