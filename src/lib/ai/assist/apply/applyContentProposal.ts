import type { Prisma } from "@prisma/client";
import { assertArtifactEditable, LockedLayerError } from "@/lib/generation/locking";
import { AiAssistApplyBlockedError } from "@/lib/ai/errors";

// content_proposal -> ArtifactLayer.update/.create (Section 4 §5/§8). Per
// node: an existing id updates ONLY title/body — order/points/sprintId/
// parentId stay engine-owned, never touched here; no id creates a new row
// with points/sprintId left null for a human to size. Blocked (never
// silently applied) when the prototype has an approved baseline or the
// governing layer is locked — mirrors recalculatePlan's
// ApprovedBaselineImpactError pattern without reusing that class directly
// (it's tightly coupled to its own call site).

interface ProposedAc {
  existingArtifactLayerId: string | null;
  title: string;
  body: string;
}
interface ProposedStory {
  existingArtifactLayerId: string | null;
  title: string;
  body: string;
  acceptanceCriteria: ProposedAc[];
}
interface ProposedEpic {
  existingArtifactLayerId: string | null;
  title: string;
  body: string;
  stories: ProposedStory[];
}
export interface ProposedContent {
  epics: ProposedEpic[];
}

export async function applyContentProposal(
  tx: Prisma.TransactionClient,
  featureArtifactLayerId: string,
  content: ProposedContent,
  confirmApprovedImpact: boolean,
): Promise<{ appliedEntityType: "artifact_layer"; appliedEntityId: string }> {
  const feature = await tx.artifactLayer.findUniqueOrThrow({
    where: { id: featureArtifactLayerId },
    select: { prototypeId: true, prototype: { select: { approvedAt: true } } },
  });

  if (feature.prototype.approvedAt && !confirmApprovedImpact) {
    throw new AiAssistApplyBlockedError(
      `This initiative has an approved baseline (approved ${feature.prototype.approvedAt.toLocaleDateString()}). Confirm to apply this change anyway.`,
      "approved_baseline",
    );
  }

  try {
    await assertArtifactEditable(feature.prototypeId, "epic");
    await assertArtifactEditable(feature.prototypeId, "story");
    await assertArtifactEditable(feature.prototypeId, "acceptance_criterion");
  } catch (err) {
    if (err instanceof LockedLayerError) throw new AiAssistApplyBlockedError(err.message, "locked_layer");
    throw err;
  }

  let epicOrder = await tx.artifactLayer.count({ where: { parentId: featureArtifactLayerId } });

  for (const epic of content.epics) {
    let epicId = epic.existingArtifactLayerId;
    if (epicId) {
      await tx.artifactLayer.update({ where: { id: epicId }, data: { title: epic.title, body: epic.body } });
    } else {
      const created = await tx.artifactLayer.create({
        data: {
          prototypeId: feature.prototypeId,
          type: "epic",
          parentId: featureArtifactLayerId,
          order: epicOrder++,
          title: epic.title,
          body: epic.body,
          traceNote: "AI-assisted addition — see the AI Assist panel for details.",
        },
        select: { id: true },
      });
      epicId = created.id;
    }

    let storyOrder = await tx.artifactLayer.count({ where: { parentId: epicId } });
    for (const story of epic.stories) {
      let storyId = story.existingArtifactLayerId;
      if (storyId) {
        await tx.artifactLayer.update({ where: { id: storyId }, data: { title: story.title, body: story.body } });
      } else {
        const created = await tx.artifactLayer.create({
          data: {
            prototypeId: feature.prototypeId,
            type: "story",
            parentId: epicId,
            order: storyOrder++,
            title: story.title,
            body: story.body,
            points: null,
            sprintId: null,
            traceNote: "AI-assisted addition — see the AI Assist panel for details.",
          },
          select: { id: true },
        });
        storyId = created.id;
      }

      let acOrder = await tx.artifactLayer.count({ where: { parentId: storyId } });
      for (const ac of story.acceptanceCriteria) {
        if (ac.existingArtifactLayerId) {
          await tx.artifactLayer.update({ where: { id: ac.existingArtifactLayerId }, data: { title: ac.title, body: ac.body } });
        } else {
          await tx.artifactLayer.create({
            data: {
              prototypeId: feature.prototypeId,
              type: "acceptance_criterion",
              parentId: storyId,
              order: acOrder++,
              title: ac.title,
              body: ac.body,
              traceNote: "AI-assisted addition — see the AI Assist panel for details.",
            },
          });
        }
      }
    }
  }

  return { appliedEntityType: "artifact_layer", appliedEntityId: featureArtifactLayerId };
}
