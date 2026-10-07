import { db } from "@/lib/db";
import { BusinessError } from "@/lib/businessError";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { assertArtifactEditable } from "@/lib/generation/locking";
import type { z } from "zod";
import type { acceptanceCriterionCreateSchema, storyCreateSchema, storySplitSchema } from "@/lib/validation/schemas";

type StoryCreate = z.infer<typeof storyCreateSchema>;
type StorySplit = z.infer<typeof storySplitSchema>;
type AcCreate = z.infer<typeof acceptanceCriterionCreateSchema>;

const normalized = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");

export function storyReadiness(input: { title: string; body: string; points: number | null; readinessStatus: string; criteria: { body: string }[] }) {
  const gaps: string[] = [];
  if (!/^as an? .+, i want .+, so that .+/i.test(input.body)) gaps.push("Use a clear As a / I want / so that outcome.");
  if (input.points == null) gaps.push("Add a story-point estimate.");
  if (input.criteria.length < 2) gaps.push("Add at least two acceptance criteria.");
  if (input.criteria.some(c => !/given[\s\S]+when[\s\S]+then/i.test(c.body))) gaps.push("Write each criterion as a testable Given / When / Then outcome.");
  if (input.readinessStatus === "blocked") gaps.push("Resolve the recorded blocker.");
  return { ready: gaps.length === 0, gaps };
}

async function epicContext(initiativeId: string, epicId: string) {
  const epic = await db.artifactLayer.findUnique({ where: { id: epicId }, include: { prototype: { select: { initiativeId: true } }, parent: { select: { id: true, type: true, sourceCapabilityId: true } } } });
  if (!epic || epic.prototype.initiativeId !== initiativeId || epic.type !== "epic" || epic.parent?.type !== "feature") throw new BusinessError("Epic not found.", 404);
  return epic;
}

export async function createStory(initiativeId: string, input: StoryCreate) {
  return withPlanningMutation(initiativeId, input.sourceType === "jira" ? "story.imported" : "story.created", async () => {
    const epic = await epicContext(initiativeId, input.epicId);
    await assertArtifactEditable(epic.prototypeId, "story");
    const key = `feature:${epic.parent!.id}:title:${normalized(input.title)}`;
    const duplicate = await db.artifactLayer.findFirst({ where: { prototypeId: epic.prototypeId, type: "story", dedupeKey: key } });
    if (duplicate) throw new BusinessError(input.sourceType === "jira" ? "That Jira story is already imported." : "A story with this title already exists for the feature.", 409);
    const order = await db.artifactLayer.count({ where: { parentId: epic.id, type: "story" } });
    return db.artifactLayer.create({ data: {
      prototypeId: epic.prototypeId, type: "story", parentId: epic.id, order, title: input.title, body: input.body,
      points: input.points, sourceCapabilityId: epic.parent!.sourceCapabilityId, sourceType: input.sourceType,
      externalRef: input.externalRef, dedupeKey: key, readinessStatus: "needs_refinement",
      traceNote: input.sourceType === "jira" ? `Imported from Jira ${input.externalRef}.` : "Created manually by the Product Owner.",
    } });
  }, true);
}

export async function splitStory(initiativeId: string, storyId: string, input: StorySplit) {
  return withPlanningMutation(initiativeId, "story.split", async () => {
    const original = await db.artifactLayer.findUnique({ where: { id: storyId }, include: { prototype: { select: { initiativeId: true } }, parent: { include: { parent: true } } } });
    if (!original || original.prototype.initiativeId !== initiativeId || original.type !== "story" || !original.parentId || original.parent?.parent?.type !== "feature") throw new BusinessError("Story not found.", 404);
    await assertArtifactEditable(original.prototypeId, "story");
    const start = await db.artifactLayer.count({ where: { parentId: original.parentId, type: "story" } });
    const created = [];
    for (const [index, story] of input.stories.entries()) {
      const key = `feature:${original.parent.parent.id}:title:${normalized(story.title)}`;
      if (await db.artifactLayer.findFirst({ where: { prototypeId: original.prototypeId, type: "story", dedupeKey: key } })) throw new BusinessError(`A story named "${story.title}" already exists for the feature.`, 409);
      created.push(await db.artifactLayer.create({ data: { prototypeId: original.prototypeId, type: "story", parentId: original.parentId,
        order: start + index, title: story.title, body: story.body, points: story.points, sourceCapabilityId: original.sourceCapabilityId,
        sourceType: "split", dedupeKey: key, readinessStatus: "needs_refinement", traceNote: `Split from story ${original.title}.` } }));
    }
    await db.artifactLayer.update({ where: { id: original.id }, data: { readinessStatus: "split" } });
    return created;
  }, true);
}

export async function createAcceptanceCriterion(initiativeId: string, storyId: string, input: AcCreate) {
  return withPlanningMutation(initiativeId, "acceptance_criterion.created", async () => {
    const story = await db.artifactLayer.findUnique({ where: { id: storyId }, include: { prototype: { select: { initiativeId: true } } } });
    if (!story || story.prototype.initiativeId !== initiativeId || story.type !== "story") throw new BusinessError("Story not found.", 404);
    await assertArtifactEditable(story.prototypeId, "acceptance_criterion");
    const order = await db.artifactLayer.count({ where: { parentId: storyId, type: "acceptance_criterion" } });
    return db.artifactLayer.create({ data: { prototypeId: story.prototypeId, type: "acceptance_criterion", parentId: storyId,
      order, title: input.title, body: input.body, sourceCapabilityId: story.sourceCapabilityId, sourceType: input.sourceType,
      traceNote: input.sourceType === "ai" ? "AI-assisted criterion; reviewed before creation." : "Created manually by the Product Owner." } });
  }, true);
}

export async function reorderAcceptanceCriteria(initiativeId: string, storyId: string, orderedIds: string[]) {
  return withPlanningMutation(initiativeId, "acceptance_criteria.reordered", async () => {
    const story = await db.artifactLayer.findFirst({ where: { id: storyId, type: "story", prototype: { initiativeId } }, select: { prototypeId: true } });
    if (!story) throw new BusinessError("Story not found.", 404);
    await assertArtifactEditable(story.prototypeId, "acceptance_criterion");
    const rows = await db.artifactLayer.findMany({ where: { id: { in: orderedIds }, parentId: storyId, type: "acceptance_criterion", prototype: { initiativeId } }, select: { id: true } });
    if (rows.length !== orderedIds.length) throw new BusinessError("One or more acceptance criteria were not found.", 404);
    await Promise.all(orderedIds.map((id, order) => db.artifactLayer.update({ where: { id }, data: { order } })));
  }, true);
}

export async function approveAcceptanceCriterion(initiativeId: string, criterionId: string, actorUserId: string, comment: string) {
  return withPlanningMutation(initiativeId, "acceptance_criterion.approved", async () => {
    const row = await db.artifactLayer.findUnique({ where: { id: criterionId }, include: { prototype: { select: { initiativeId: true } } } });
    if (!row || row.type !== "acceptance_criterion" || row.prototype.initiativeId !== initiativeId) throw new BusinessError("Acceptance criterion not found.", 404);
    await assertArtifactEditable(row.prototypeId, "acceptance_criterion");
    const version = await db.artifactRevision.count({ where: { artifactId: row.id } }) + 1;
    await db.artifactRevision.create({ data: { artifactId: row.id, version, title: row.title, body: row.body, reason: comment || "Approved acceptance criterion", actorUserId } });
    return db.artifactLayer.update({ where: { id: row.id }, data: { approvedAt: new Date(), approvedByUserId: actorUserId } });
  });
}
