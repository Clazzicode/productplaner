import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { assertArtifactEditable } from "@/lib/generation/locking";
import type { z } from "zod";
import type {
  acceptanceCriterionCreateSchema,
  acceptanceCriterionUpdateSchema,
  storyCreateSchema,
  storySplitSchema,
  storyUpdateSchema,
} from "@/lib/validation/schemas";

type StoryCreate = z.infer<typeof storyCreateSchema>;
type StorySplit = z.infer<typeof storySplitSchema>;
type StoryUpdate = z.infer<typeof storyUpdateSchema>;
type AcCreate = z.infer<typeof acceptanceCriterionCreateSchema>;
type AcUpdate = z.infer<typeof acceptanceCriterionUpdateSchema>;

const normalized = (value: string) => value.trim().toLocaleLowerCase().split(" ").filter(Boolean).join(" ");

export function storyReadiness(input: {
  title: string;
  body: string;
  points: number | null;
  readinessStatus: string;
  criteria: { title?: string; body: string }[];
}) {
  const gaps: string[] = [];
  if (!/^as an? .+, i want .+, so that .+/i.test(input.body)) gaps.push("Use a clear As a / I want / so that outcome.");
  if (input.points == null) gaps.push("Add a story-point estimate.");
  if (input.criteria.length < 2) gaps.push("Add at least two acceptance criteria.");
  if (input.criteria.some((criterion) =>
    !acceptanceCriterionAdequacy({
      title: criterion.title ?? "Acceptance criterion",
      body: criterion.body,
    }).adequate
  )) {
    gaps.push("Make each acceptance criterion specific, testable, and observable.");
  }
  const uniqueCriteria = new Set(input.criteria.map((criterion) => normalized(criterion.body)));
  if (uniqueCriteria.size !== input.criteria.length) {
    gaps.push("Remove duplicate acceptance criteria.");
  }
  if (input.readinessStatus === "blocked") gaps.push("Resolve the recorded blocker.");
  return { ready: gaps.length === 0, gaps };
}

async function epicContext(initiativeId: string, epicId: string) {
  const epic = await db.artifactLayer.findUnique({
    where: { id: epicId },
    include: {
      prototype: { select: { initiativeId: true } },
      parent: { select: { id: true, type: true, sourceCapabilityId: true } },
    },
  });
  if (!epic || epic.prototype.initiativeId !== initiativeId || epic.type !== "epic" || epic.parent?.type !== "feature") {
    throw new BusinessError("Epic not found.", 404);
  }
  return epic;
}

async function storyContext(initiativeId: string, storyId: string) {
  const story = await db.artifactLayer.findFirst({
    where: { id: storyId, type: "story", prototype: { initiativeId } },
    include: {
      prototype: { select: { initiativeId: true } },
      parent: { include: { parent: { select: { id: true, type: true, sourceCapabilityId: true } } } },
    },
  });
  if (!story || !story.parentId || story.parent?.parent?.type !== "feature") {
    throw new BusinessError("Story not found.", 404);
  }
  return story;
}

function storySnapshot(story: {
  title: string;
  body: string;
  points: number | null;
  readinessStatus: string;
  parentId: string | null;
  sourceCapabilityId: string | null;
  sourceType: string;
  externalRef: string | null;
  archivedAt: Date | null;
  backlogRevision: number;
}) {
  return {
    title: story.title,
    body: story.body,
    points: story.points,
    readinessStatus: story.readinessStatus,
    epicId: story.parentId,
    sourceCapabilityId: story.sourceCapabilityId,
    sourceType: story.sourceType,
    externalRef: story.externalRef,
    archivedAt: story.archivedAt?.toISOString() ?? null,
    revision: story.backlogRevision,
  };
}

export async function createStory(initiativeId: string, input: StoryCreate) {
  return withPlanningMutation(initiativeId, "story.created", async () => {
    const epic = await epicContext(initiativeId, input.epicId);
    await assertArtifactEditable(epic.prototypeId, "story");
    const key = `feature:${epic.parent!.id}:title:${normalized(input.title)}`;
    const duplicate = await db.artifactLayer.findFirst({
      where: { prototypeId: epic.prototypeId, type: "story", dedupeKey: key },
    });
    if (duplicate) throw new BusinessError("A story with this title already exists for the feature.", 409);
    const order = await db.artifactLayer.count({ where: { parentId: epic.id, type: "story" } });
    const created = await db.artifactLayer.create({
      data: {
        prototypeId: epic.prototypeId,
        type: "story",
        parentId: epic.id,
        order,
        title: input.title,
        body: input.body,
        points: input.points,
        sourceCapabilityId: epic.parent!.sourceCapabilityId,
        sourceType: "manual",
        externalRef: null,
        dedupeKey: key,
        readinessStatus: "needs_refinement",
        traceNote: "Created manually by the Product Owner.",
      },
    });
    await auditInitiative(initiativeId, "story.created", {
      storyId: created.id,
      epicId: epic.id,
      sourceType: "manual",
    } as Prisma.InputJsonObject);
    return created;
  }, true);
}

export async function updateStory(
  initiativeId: string,
  storyId: string,
  input: StoryUpdate,
  actorUserId: string,
) {
  return withPlanningMutation(initiativeId, "story.changed", async () => {
    const current = await storyContext(initiativeId, storyId);
    await assertArtifactEditable(current.prototypeId, "story");
    if (current.archivedAt && input.archived !== false) {
      throw new BusinessError("Restore this story before changing it.");
    }
    if (current.backlogRevision !== input.expectedRevision) {
      throw new BusinessError("This story changed. Reload before saving.");
    }

    const targetEpic = input.epicId ? await epicContext(initiativeId, input.epicId) : current.parent!;
    if (targetEpic.prototypeId !== current.prototypeId) throw new BusinessError("Choose an epic from this initiative.");
    const featureId = targetEpic.parent!.id;
    const nextTitle = input.title ?? current.title;
    const dedupeKey = `feature:${featureId}:title:${normalized(nextTitle)}`;
    const duplicate = await db.artifactLayer.findFirst({
      where: {
        prototypeId: current.prototypeId,
        type: "story",
        dedupeKey,
        NOT: { id: current.id },
      },
      select: { id: true },
    });
    if (duplicate) throw new BusinessError("A story with this title already exists for the target feature.", 409);

    if (input.readinessStatus === "sprint_ready") {
      const criteria = await db.artifactLayer.findMany({
        where: { parentId: current.id, type: "acceptance_criterion", archivedAt: null },
        select: { body: true },
      });
      const readiness = storyReadiness({
        title: nextTitle,
        body: input.body ?? current.body,
        points: input.points === undefined ? current.points : input.points,
        readinessStatus: input.readinessStatus,
        criteria,
      });
      if (!readiness.ready) {
        throw new BusinessError(`This story is not sprint-ready: ${readiness.gaps.join(" ")}`, 422);
      }
    }

    const before = storySnapshot(current);
    const moving = targetEpic.id !== current.parentId;
    const order = moving
      ? await db.artifactLayer.count({ where: { parentId: targetEpic.id, type: "story", archivedAt: null } })
      : current.order;
    const version = await db.artifactRevision.count({ where: { artifactId: current.id } }) + 1;
    await db.artifactRevision.create({
      data: {
        artifactId: current.id,
        version,
        title: current.title,
        body: current.body,
        reason: input.reason,
        actorUserId,
        metadata: before,
      },
    });

    const updated = await db.artifactLayer.updateMany({
      where: { id: current.id, backlogRevision: input.expectedRevision },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.points !== undefined ? { points: input.points } : {}),
        ...(input.readinessStatus !== undefined ? { readinessStatus: input.readinessStatus } : {}),
        ...(moving ? {
          parentId: targetEpic.id,
          sourceCapabilityId: targetEpic.parent!.sourceCapabilityId,
          order,
        } : {}),
        ...(input.archived !== undefined ? {
          archivedAt: input.archived ? new Date() : null,
          ...(input.archived ? { sprintId: null } : {}),
        } : {}),
        dedupeKey,
        backlogRevision: { increment: 1 },
      },
    });
    if (updated.count !== 1) throw new BusinessError("This story changed. Reload before saving.");

    const saved = await db.artifactLayer.findUniqueOrThrow({ where: { id: current.id } });
    const action = input.archived === true
      ? "story.archived"
      : input.archived === false
        ? "story.restored"
        : moving
          ? "story.reassigned"
          : "story.updated";
    await auditInitiative(initiativeId, action, {
      storyId,
      reason: input.reason,
      before,
      after: storySnapshot(saved),
    } as Prisma.InputJsonObject);
    return saved;
  }, true);
}

export async function listStoryHistory(initiativeId: string, storyId: string) {
  await storyContext(initiativeId, storyId);
  const revisions = await db.artifactRevision.findMany({
    where: { artifactId: storyId },
    orderBy: { version: "desc" },
  });
  const actorIds = [...new Set(revisions.map((revision) => revision.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  return revisions.map((revision) => ({
    id: revision.id,
    version: revision.version,
    reason: revision.reason,
    snapshot: revision.metadata,
    createdAt: revision.createdAt.toISOString(),
    actor: revision.actorUserId ? actorById.get(revision.actorUserId) ?? null : null,
  }));
}

export async function splitStory(
  initiativeId: string,
  storyId: string,
  input: StorySplit,
  actorUserId?: string,
) {
  return withPlanningMutation(initiativeId, "story.split", async () => {
    const original = await storyContext(initiativeId, storyId);
    await assertArtifactEditable(original.prototypeId, "story");
    if (original.archivedAt) throw new BusinessError("Restore this story before splitting it.");
    const start = await db.artifactLayer.count({ where: { parentId: original.parentId, type: "story" } });
    const created = [];
    for (const [index, story] of input.stories.entries()) {
      const key = `feature:${original.parent!.parent!.id}:title:${normalized(story.title)}`;
      const duplicate = await db.artifactLayer.findFirst({
        where: { prototypeId: original.prototypeId, type: "story", dedupeKey: key },
      });
      if (duplicate) throw new BusinessError(`A story named "${story.title}" already exists for the feature.`, 409);
      created.push(await db.artifactLayer.create({
        data: {
          prototypeId: original.prototypeId,
          type: "story",
          parentId: original.parentId,
          order: start + index,
          title: story.title,
          body: story.body,
          points: story.points,
          sourceCapabilityId: original.sourceCapabilityId,
          sourceType: "split",
          dedupeKey: key,
          readinessStatus: "needs_refinement",
          traceNote: `Split from story ${original.title}.`,
        },
      }));
    }
    const version = await db.artifactRevision.count({ where: { artifactId: original.id } }) + 1;
    await db.artifactRevision.create({
      data: {
        artifactId: original.id,
        version,
        title: original.title,
        body: original.body,
        reason: "Split into smaller stories.",
        actorUserId,
        metadata: storySnapshot(original),
      },
    });
    await db.artifactLayer.update({
      where: { id: original.id },
      data: { readinessStatus: "split", backlogRevision: { increment: 1 } },
    });
    await auditInitiative(initiativeId, "story.split", {
      storyId: original.id,
      createdStoryIds: created.map((story) => story.id),
    } as Prisma.InputJsonObject);
    return created;
  }, true);
}

export function acceptanceCriterionAdequacy(input: { title: string; body: string }) {
  const gaps: string[] = [];
  const title = input.title.trim();
  const body = input.body.trim();
  const outcome = body.toLocaleLowerCase();
  const when = outcome.indexOf(" when ");
  const then = outcome.indexOf(" then", when + 1);
  if (title.length < 3) gaps.push("Add a specific criterion title.");
  if (!outcome.startsWith("given ") || when < 0 || then < 0) {
    gaps.push("Use a Given / When / Then outcome in that order.");
  } else {
    const givenClause = body.slice(6, when).trim();
    const whenClause = body.slice(when + 6, then).trim();
    const thenClause = body.slice(then + 5).trim();
    if (givenClause.length < 4) gaps.push("Describe a concrete starting condition.");
    if (whenClause.length < 4) gaps.push("Describe a specific user or system action.");
    if (thenClause.length < 6) gaps.push("Describe an observable result.");
  }
  if (/\b(tbd|etc\.?|something|works correctly|as expected|properly)\b/i.test(body)) {
    gaps.push("Replace vague wording with an observable result.");
  }
  return { adequate: gaps.length === 0, gaps };
}

async function criterionContext(initiativeId: string, criterionId: string) {
  const criterion = await db.artifactLayer.findFirst({
    where: {
      id: criterionId,
      type: "acceptance_criterion",
      prototype: { initiativeId },
    },
    include: {
      prototype: { select: { initiativeId: true } },
      parent: { select: { id: true, type: true, archivedAt: true } },
    },
  });
  if (!criterion || criterion.parent?.type !== "story") {
    throw new BusinessError("Acceptance criterion not found.", 404);
  }
  return criterion;
}

function criterionSnapshot(criterion: {
  title: string;
  body: string;
  parentId: string | null;
  sourceType: string;
  order: number;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  archivedAt: Date | null;
  backlogRevision: number;
}) {
  return {
    title: criterion.title,
    body: criterion.body,
    storyId: criterion.parentId,
    sourceType: criterion.sourceType,
    order: criterion.order,
    approvedAt: criterion.approvedAt?.toISOString() ?? null,
    approvedByUserId: criterion.approvedByUserId,
    archivedAt: criterion.archivedAt?.toISOString() ?? null,
    revision: criterion.backlogRevision,
  };
}

const criterionKey = (storyId: string, title: string, body: string) =>
  `story:${storyId}:criterion:${normalized(title)}:${normalized(body)}`;

export async function createAcceptanceCriterion(
  initiativeId: string,
  storyId: string,
  input: AcCreate,
  actorUserId?: string,
) {
  return withPlanningMutation(initiativeId, "acceptance_criterion.created", async () => {
    const story = await storyContext(initiativeId, storyId);
    if (story.archivedAt) throw new BusinessError("Restore this story before adding acceptance criteria.");
    await assertArtifactEditable(story.prototypeId, "acceptance_criterion");
    const dedupeKey = criterionKey(storyId, input.title, input.body);
    const duplicate = await db.artifactLayer.findFirst({
      where: {
        parentId: storyId,
        type: "acceptance_criterion",
        dedupeKey,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) throw new BusinessError("This acceptance criterion already exists for the story.", 409);
    const order = await db.artifactLayer.count({
      where: { parentId: storyId, type: "acceptance_criterion", archivedAt: null },
    });
    const created = await db.artifactLayer.create({
      data: {
        prototypeId: story.prototypeId,
        type: "acceptance_criterion",
        parentId: storyId,
        order,
        title: input.title,
        body: input.body,
        sourceCapabilityId: story.sourceCapabilityId,
        sourceType: "manual",
        dedupeKey,
        traceNote: "Created manually by the Product Owner.",
      },
    });
    await auditInitiative(initiativeId, "acceptance_criterion.created", {
      criterionId: created.id,
      storyId,
      actorUserId: actorUserId ?? null,
    } as Prisma.InputJsonObject);
    return created;
  }, true);
}

export async function updateAcceptanceCriterion(
  initiativeId: string,
  criterionId: string,
  input: AcUpdate,
  actorUserId: string,
) {
  return withPlanningMutation(initiativeId, "acceptance_criterion.changed", async () => {
    const current = await criterionContext(initiativeId, criterionId);
    await assertArtifactEditable(current.prototypeId, "acceptance_criterion");
    if (current.parent?.archivedAt) {
      throw new BusinessError("Restore the story before changing its acceptance criteria.");
    }
    if (current.archivedAt && input.archived !== false) {
      throw new BusinessError("Restore this criterion before changing it.");
    }
    if (current.backlogRevision !== input.expectedRevision) {
      throw new BusinessError("This acceptance criterion changed. Reload before saving.", 409);
    }
    if (input.reopen && !current.approvedAt) {
      throw new BusinessError("This acceptance criterion is not approved.");
    }

    const nextTitle = input.title ?? current.title;
    const nextBody = input.body ?? current.body;
    const dedupeKey = criterionKey(current.parentId!, nextTitle, nextBody);
    const duplicate = await db.artifactLayer.findFirst({
      where: {
        parentId: current.parentId,
        type: "acceptance_criterion",
        dedupeKey,
        archivedAt: null,
        NOT: { id: current.id },
      },
      select: { id: true },
    });
    if (duplicate) throw new BusinessError("This acceptance criterion already exists for the story.", 409);

    const version = await db.artifactRevision.count({ where: { artifactId: current.id } }) + 1;
    await db.artifactRevision.create({
      data: {
        artifactId: current.id,
        version,
        title: current.title,
        body: current.body,
        reason: input.reason,
        actorUserId,
        metadata: criterionSnapshot(current),
      },
    });

    const contentChanged = input.title !== undefined || input.body !== undefined;
    const reopen = input.reopen === true || Boolean(current.approvedAt && contentChanged);
    const updated = await db.artifactLayer.updateMany({
      where: { id: current.id, backlogRevision: input.expectedRevision },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
        ...(reopen || input.archived === true
          ? { approvedAt: null, approvedByUserId: null }
          : {}),
        dedupeKey,
        backlogRevision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new BusinessError("This acceptance criterion changed. Reload before saving.", 409);
    }

    const saved = await db.artifactLayer.findUniqueOrThrow({ where: { id: current.id } });
    const action = input.archived === true
      ? "acceptance_criterion.archived"
      : input.archived === false
        ? "acceptance_criterion.restored"
        : reopen
          ? "acceptance_criterion.reopened"
          : "acceptance_criterion.updated";
    await auditInitiative(initiativeId, action, {
      criterionId,
      storyId: current.parentId,
      reason: input.reason,
      before: criterionSnapshot(current),
      after: criterionSnapshot(saved),
    } as Prisma.InputJsonObject);
    return saved;
  }, true);
}

export async function listAcceptanceCriterionHistory(
  initiativeId: string,
  criterionId: string,
) {
  await criterionContext(initiativeId, criterionId);
  const revisions = await db.artifactRevision.findMany({
    where: { artifactId: criterionId },
    orderBy: { version: "desc" },
  });
  const actorIds = [...new Set(
    revisions.map((revision) => revision.actorUserId).filter((id): id is string => Boolean(id)),
  )];
  const actors = actorIds.length
    ? await db.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  return revisions.map((revision) => ({
    id: revision.id,
    version: revision.version,
    title: revision.title,
    body: revision.body,
    reason: revision.reason,
    snapshot: revision.metadata,
    createdAt: revision.createdAt.toISOString(),
    actor: revision.actorUserId ? actorById.get(revision.actorUserId) ?? null : null,
  }));
}

export async function reorderAcceptanceCriteria(
  initiativeId: string,
  storyId: string,
  orderedIds: string[],
  actorUserId?: string,
) {
  return withPlanningMutation(initiativeId, "acceptance_criteria.reordered", async () => {
    const story = await storyContext(initiativeId, storyId);
    if (story.archivedAt) throw new BusinessError("Restore this story before reordering acceptance criteria.");
    await assertArtifactEditable(story.prototypeId, "acceptance_criterion");
    const rows = await db.artifactLayer.findMany({
      where: {
        id: { in: orderedIds },
        parentId: storyId,
        type: "acceptance_criterion",
        archivedAt: null,
        prototype: { initiativeId },
      },
      select: { id: true },
    });
    if (rows.length !== orderedIds.length) {
      throw new BusinessError("One or more acceptance criteria were not found.", 404);
    }
    await Promise.all(
      orderedIds.map((id, order) =>
        db.artifactLayer.update({ where: { id }, data: { order } }),
      ),
    );
    await auditInitiative(initiativeId, "acceptance_criteria.reordered", {
      storyId,
      orderedIds,
      actorUserId: actorUserId ?? null,
    } as Prisma.InputJsonObject);
  }, true);
}

export async function approveAcceptanceCriterion(
  initiativeId: string,
  criterionId: string,
  actorUserId: string,
  input: { expectedRevision: number; comment: string },
) {
  return withPlanningMutation(initiativeId, "acceptance_criterion.approved", async () => {
    const current = await criterionContext(initiativeId, criterionId);
    await assertArtifactEditable(current.prototypeId, "acceptance_criterion");
    if (current.archivedAt) throw new BusinessError("Restore this criterion before approving it.");
    if (current.parent?.archivedAt) throw new BusinessError("Restore the story before approving its criteria.");
    if (current.backlogRevision !== input.expectedRevision) {
      throw new BusinessError("This acceptance criterion changed. Reload before approving.", 409);
    }
    if (current.approvedAt) throw new BusinessError("This acceptance criterion is already approved.", 409);
    const adequacy = acceptanceCriterionAdequacy(current);
    if (!adequacy.adequate) {
      throw new BusinessError(`This criterion is not ready for approval: ${adequacy.gaps.join(" ")}`, 422);
    }

    const version = await db.artifactRevision.count({ where: { artifactId: current.id } }) + 1;
    await db.artifactRevision.create({
      data: {
        artifactId: current.id,
        version,
        title: current.title,
        body: current.body,
        reason: input.comment,
        actorUserId,
        metadata: criterionSnapshot(current),
      },
    });
    const updated = await db.artifactLayer.updateMany({
      where: { id: current.id, backlogRevision: input.expectedRevision },
      data: {
        approvedAt: new Date(),
        approvedByUserId: actorUserId,
        backlogRevision: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new BusinessError("This acceptance criterion changed. Reload before approving.", 409);
    }
    const saved = await db.artifactLayer.findUniqueOrThrow({ where: { id: current.id } });
    await auditInitiative(initiativeId, "acceptance_criterion.approved", {
      criterionId,
      storyId: current.parentId,
      reason: input.comment,
    } as Prisma.InputJsonObject);
    return saved;
  }, true);
}
