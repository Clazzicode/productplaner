import type { Prisma } from "@prisma/client";
import { assertArtifactEditable, LockedLayerError } from "@/lib/generation/locking";
import { AiAssistApplyBlockedError, DependencyAlreadyExistsError } from "@/lib/ai/errors";

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
const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

export async function applyContentProposal(
  tx: Prisma.TransactionClient,
  featureArtifactLayerId: string,
  content: ProposedContent,
  confirmApprovedImpact: boolean,
): Promise<{ appliedEntityType: "artifact_layer"; appliedEntityId: string }> {
  const feature = await tx.artifactLayer.findFirstOrThrow({
    where: { id: featureArtifactLayerId, type: "feature" },
    select: { prototypeId: true, sourceCapabilityId: true, prototype: { select: { approvedAt: true } } },
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
      await tx.artifactLayer.findFirstOrThrow({
        where: { id: epicId, prototypeId: feature.prototypeId, type: "epic", parentId: featureArtifactLayerId },
        select: { id: true },
      });
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
          sourceType: "ai",
          sourceCapabilityId: feature.sourceCapabilityId,
        },
        select: { id: true },
      });
      epicId = created.id;
    }

    let storyOrder = await tx.artifactLayer.count({ where: { parentId: epicId } });
    for (const story of epic.stories) {
      let storyId = story.existingArtifactLayerId;
      if (storyId) {
        const current = await tx.artifactLayer.findFirstOrThrow({
          where: { id: storyId, prototypeId: feature.prototypeId, type: "story", parentId: epicId },
        });
        const dedupeKey = `feature:${featureArtifactLayerId}:title:${normalized(story.title)}`;
        const duplicate = await tx.artifactLayer.findFirst({
          where: { prototypeId: feature.prototypeId, type: "story", dedupeKey, NOT: { id: storyId } },
          select: { id: true },
        });
        if (duplicate) throw new DependencyAlreadyExistsError(`A story named "${story.title}" already exists for this feature.`);
        const changed = current.title !== story.title || current.body !== story.body;
        if (changed) {
          const version = await tx.artifactRevision.count({ where: { artifactId: current.id } }) + 1;
          await tx.artifactRevision.create({
            data: {
              artifactId: current.id,
              version,
              title: current.title,
              body: current.body,
              reason: "Applied a reviewed AI story suggestion.",
              metadata: {
                title: current.title,
                body: current.body,
                points: current.points,
                readinessStatus: current.readinessStatus,
                epicId: current.parentId,
                sourceCapabilityId: current.sourceCapabilityId,
                sourceType: current.sourceType,
                externalRef: current.externalRef,
                archivedAt: current.archivedAt?.toISOString() ?? null,
                revision: current.backlogRevision,
              },
            },
          });
        }
        await tx.artifactLayer.update({
          where: { id: storyId },
          data: {
            title: story.title,
            body: story.body,
            dedupeKey,
            ...(changed ? { backlogRevision: { increment: 1 } } : {}),
          },
        });
      } else {
        const dedupeKey = `feature:${featureArtifactLayerId}:title:${normalized(story.title)}`;
        const duplicate = await tx.artifactLayer.findFirst({
          where: { prototypeId: feature.prototypeId, type: "story", dedupeKey },
          select: { id: true },
        });
        if (duplicate) throw new DependencyAlreadyExistsError(`A story named "${story.title}" already exists for this feature.`);
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
            sourceType: "ai",
            dedupeKey,
            sourceCapabilityId: feature.sourceCapabilityId,
          },
          select: { id: true },
        });
        storyId = created.id;
      }

      let acOrder = await tx.artifactLayer.count({
        where: { parentId: storyId, type: "acceptance_criterion", archivedAt: null },
      });
      for (const ac of story.acceptanceCriteria) {
        const dedupeKey = `story:${storyId}:criterion:${normalized(ac.title)}:${normalized(ac.body)}`;
        const duplicate = await tx.artifactLayer.findFirst({
          where: {
            parentId: storyId,
            type: "acceptance_criterion",
            dedupeKey,
            archivedAt: null,
            ...(ac.existingArtifactLayerId
              ? { NOT: { id: ac.existingArtifactLayerId } }
              : {}),
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new DependencyAlreadyExistsError(
            `This acceptance criterion already exists for the story: "${ac.title}".`,
          );
        }

        if (ac.existingArtifactLayerId) {
          const current = await tx.artifactLayer.findFirstOrThrow({
            where: {
              id: ac.existingArtifactLayerId,
              prototypeId: feature.prototypeId,
              type: "acceptance_criterion",
              parentId: storyId,
              archivedAt: null,
            },
          });
          const changed = current.title !== ac.title || current.body !== ac.body;
          if (changed) {
            const version = await tx.artifactRevision.count({
              where: { artifactId: current.id },
            }) + 1;
            await tx.artifactRevision.create({
              data: {
                artifactId: current.id,
                version,
                title: current.title,
                body: current.body,
                reason: "Applied a reviewed AI acceptance-criterion suggestion.",
                metadata: {
                  title: current.title,
                  body: current.body,
                  storyId: current.parentId,
                  sourceType: current.sourceType,
                  order: current.order,
                  approvedAt: current.approvedAt?.toISOString() ?? null,
                  approvedByUserId: current.approvedByUserId,
                  archivedAt: current.archivedAt?.toISOString() ?? null,
                  revision: current.backlogRevision,
                },
              },
            });
          }
          await tx.artifactLayer.update({
            where: { id: ac.existingArtifactLayerId },
            data: {
              title: ac.title,
              body: ac.body,
              dedupeKey,
              ...(changed
                ? {
                    approvedAt: null,
                    approvedByUserId: null,
                    backlogRevision: { increment: 1 },
                  }
                : {}),
            },
          });
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
              sourceType: "ai",
              dedupeKey,
              sourceCapabilityId: feature.sourceCapabilityId,
            },
          });
        }
      }
    }
  }

  return { appliedEntityType: "artifact_layer", appliedEntityId: featureArtifactLayerId };
}
