import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";
import { withPlanningMutation } from "@/lib/generation/mutation";
import {
  acceptanceCriterionAdequacy,
} from "@/lib/stories/service";
import type {
  refinementFindingCreateSchema,
  refinementFindingUpdateSchema,
} from "@/lib/validation/schemas";

type FindingCreate = z.infer<typeof refinementFindingCreateSchema>;
type FindingUpdate = z.infer<typeof refinementFindingUpdateSchema>;

const normalized = (value: string) =>
  value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).join(" ");

export const refinementFindingKey = (
  sourceType: "manual" | "ai" | "deterministic",
  storyId: string,
  category: string,
  title: string,
) => `${sourceType}:${storyId}:${category}:${normalized(title)}`;

function snapshot(finding: {
  category: string;
  title: string;
  detail: string;
  status: string;
  ownerUserId: string | null;
  resolution: string;
  followUpNote: string;
  followUpAt: Date | null;
  revision: number;
}) {
  return {
    category: finding.category,
    title: finding.title,
    detail: finding.detail,
    status: finding.status,
    ownerUserId: finding.ownerUserId,
    resolution: finding.resolution,
    followUpNote: finding.followUpNote,
    followUpAt: finding.followUpAt?.toISOString() ?? null,
    revision: finding.revision,
  };
}

async function scopedFinding(findingId: string) {
  const finding = await db.refinementFinding.findUnique({
    where: { id: findingId },
    include: { story: { select: { id: true, type: true } } },
  });
  if (!finding || finding.story.type !== "story") {
    throw new BusinessError("Refinement finding not found.", 404);
  }
  return finding;
}

async function validateOwner(organizationId: string, ownerUserId: string | null | undefined) {
  if (!ownerUserId) return;
  const member = await db.organizationMember.findFirst({
    where: { organizationId, user: { id: ownerUserId }, status: "active" },
    select: { id: true },
  });
  if (!member) {
    throw new BusinessError("The selected owner is not an active member of this organization.", 422);
  }
}

export async function createManualRefinementFinding(
  initiativeId: string,
  input: FindingCreate,
  actorUserId: string,
) {
  return withPlanningMutation(initiativeId, "refinement_finding.created", async () => {
    const story = await db.artifactLayer.findFirst({
      where: { id: input.storyId, type: "story", prototype: { initiativeId } },
      select: {
        id: true,
        archivedAt: true,
        prototype: { select: { initiative: { select: { organizationId: true } } } },
      },
    });
    if (!story) throw new BusinessError("Story not found.", 404);
    if (story.archivedAt) throw new BusinessError("Restore the story before adding a refinement finding.");
    const organizationId = story.prototype.initiative.organizationId;
    await validateOwner(organizationId, input.ownerUserId);
    const dedupeKey = refinementFindingKey("manual", story.id, input.category, input.title);
    const duplicate = await db.refinementFinding.findFirst({
      where: { storyId: story.id, dedupeKey, status: "open" },
      select: { id: true },
    });
    if (duplicate) throw new BusinessError("This open refinement finding already exists.", 409);

    const created = await db.refinementFinding.create({
      data: {
        organizationId,
        initiativeId,
        storyId: story.id,
        sourceType: "manual",
        category: input.category,
        title: input.title,
        detail: input.detail,
        ownerUserId: input.ownerUserId ?? null,
        followUpNote: input.followUpNote,
        followUpAt: input.followUpAt ?? null,
        dedupeKey,
        createdByUserId: actorUserId,
      },
    });
    await auditInitiative(initiativeId, "refinement_finding.created", {
      findingId: created.id,
      storyId: story.id,
      sourceType: "manual",
    } as Prisma.InputJsonObject);
    return created;
  }, true);
}

export async function updateRefinementFinding(
  findingId: string,
  input: FindingUpdate,
  actorUserId: string,
) {
  const initial = await scopedFinding(findingId);
  return withPlanningMutation(initial.initiativeId, "refinement_finding.updated", async () => {
    const current = await scopedFinding(findingId);
    if (current.revision !== input.expectedRevision) {
      throw new BusinessError("This refinement finding changed. Reload before saving.", 409);
    }
    await validateOwner(current.organizationId, input.ownerUserId);
    const nextStatus = input.status ?? current.status;
    const nextResolution = input.resolution ?? current.resolution;
    if (nextStatus === "resolved" && !nextResolution.trim()) {
      throw new BusinessError("Add a resolution before marking this finding resolved.", 422);
    }

    const next = {
      ...snapshot(current),
      status: nextStatus,
      ownerUserId: input.ownerUserId === undefined ? current.ownerUserId : input.ownerUserId,
      resolution: nextResolution,
      followUpNote: input.followUpNote ?? current.followUpNote,
      followUpAt: input.followUpAt === undefined
        ? current.followUpAt?.toISOString() ?? null
        : input.followUpAt?.toISOString() ?? null,
      revision: current.revision + 1,
    };
    await db.refinementFindingRevision.create({
      data: {
        findingId,
        fromRevision: current.revision,
        toRevision: current.revision + 1,
        previousData: snapshot(current),
        nextData: next,
        reason: input.reason,
        actorUserId,
      },
    });
    const changed = await db.refinementFinding.updateMany({
      where: { id: findingId, revision: input.expectedRevision },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
        ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
        ...(input.followUpNote !== undefined ? { followUpNote: input.followUpNote } : {}),
        ...(input.followUpAt !== undefined ? { followUpAt: input.followUpAt } : {}),
        resolvedAt: nextStatus === "resolved" ? current.resolvedAt ?? new Date() : null,
        revision: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new BusinessError("This refinement finding changed. Reload before saving.", 409);
    }
    const saved = await db.refinementFinding.findUniqueOrThrow({ where: { id: findingId } });
    await auditInitiative(current.initiativeId, `refinement_finding.${nextStatus}`, {
      findingId,
      storyId: current.storyId,
      reason: input.reason,
      fromRevision: current.revision,
      toRevision: saved.revision,
    } as Prisma.InputJsonObject);
    return saved;
  }, true);
}

export async function listRefinementFindingHistory(findingId: string) {
  const finding = await scopedFinding(findingId);
  const revisions = await db.refinementFindingRevision.findMany({
    where: { findingId },
    orderBy: { toRevision: "desc" },
    include: { actorUser: { select: { id: true, name: true, email: true } } },
  });
  return { initiativeId: finding.initiativeId, revisions };
}

type DeterministicCandidate = {
  storyId: string;
  category: "acceptance_criteria" | "contradiction" | "dependency";
  title: string;
  detail: string;
};

const scenarioKey = (body: string) => {
  const lower = normalized(body);
  const then = lower.indexOf(" then ");
  return then > 0 ? lower.slice(0, then) : null;
};

export function detectCriterionConcerns(story: {
  id: string;
  children: { title: string; body: string }[];
}): DeterministicCandidate[] {
  const candidates: DeterministicCandidate[] = [];
  for (const criterion of story.children) {
    const adequacy = acceptanceCriterionAdequacy(criterion);
    if (!adequacy.adequate) {
      candidates.push({
        storyId: story.id,
        category: "acceptance_criteria",
        title: `Clarify ${criterion.title}`,
        detail: adequacy.gaps.join(" "),
      });
    }
  }
  const byScenario = new Map<string, Set<string>>();
  for (const criterion of story.children) {
    const key = scenarioKey(criterion.body);
    if (!key) continue;
    const outcomes = byScenario.get(key) ?? new Set<string>();
    outcomes.add(normalized(criterion.body));
    byScenario.set(key, outcomes);
  }
  if ([...byScenario.values()].some((outcomes) => outcomes.size > 1)) {
    candidates.push({
      storyId: story.id,
      category: "contradiction",
      title: "Resolve conflicting acceptance criteria",
      detail: "Two criteria use the same starting condition and action but specify different outcomes. Confirm the intended result before refinement.",
    });
  }
  return candidates;
}

export async function syncDeterministicRefinementFindings(
  initiativeId: string,
  actorUserId: string,
) {
  return withPlanningMutation(initiativeId, "refinement_findings.deterministic_sync", async () => {
    const initiative = await db.initiative.findUnique({
      where: { id: initiativeId },
      select: { organizationId: true },
    });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    const stories = await db.artifactLayer.findMany({
      where: {
        type: "story",
        archivedAt: null,
        readinessStatus: { not: "split" },
        prototype: { initiativeId },
      },
      select: {
        id: true,
        title: true,
        sourceCapabilityId: true,
        children: {
          where: { type: "acceptance_criterion", archivedAt: null },
          select: { title: true, body: true },
        },
      },
    });
    const candidates: DeterministicCandidate[] = [];
    for (const story of stories) {
      candidates.push(...detectCriterionConcerns(story));
    }

    const dependencies = await db.capabilityDependency.findMany({
      where: { fromCapability: { intakeAnswerSet: { initiativeId } } },
      select: {
        fromCapabilityId: true,
        toCapability: { select: { name: true, artifacts: { where: { type: "story", archivedAt: null }, select: { readinessStatus: true } } } },
      },
    });
    for (const dependency of dependencies) {
      const dependencyReady = dependency.toCapability.artifacts.some((story) =>
        ["ready_for_refinement", "sprint_ready"].includes(story.readinessStatus));
      if (dependencyReady) continue;
      for (const story of stories.filter((item) => item.sourceCapabilityId === dependency.fromCapabilityId)) {
        candidates.push({
          storyId: story.id,
          category: "dependency",
          title: `Resolve dependency on ${dependency.toCapability.name}`,
          detail: `The dependent feature has no story marked ready for refinement. Confirm sequencing or remove the dependency before sprint planning.`,
        });
      }
    }

    let created = 0;
    for (const candidate of candidates) {
      const dedupeKey = refinementFindingKey(
        "deterministic",
        candidate.storyId,
        candidate.category,
        candidate.title,
      );
      const existing = await db.refinementFinding.findFirst({
        where: { storyId: candidate.storyId, dedupeKey, status: "open" },
        select: { id: true },
      });
      if (existing) continue;
      await db.refinementFinding.create({
        data: {
          organizationId: initiative.organizationId,
          initiativeId,
          storyId: candidate.storyId,
          sourceType: "deterministic",
          category: candidate.category,
          title: candidate.title,
          detail: candidate.detail,
          dedupeKey,
          createdByUserId: actorUserId,
        },
      });
      created += 1;
    }
    await auditInitiative(initiativeId, "refinement_findings.deterministic_sync", {
      detected: candidates.length,
      created,
    } as Prisma.InputJsonObject);
    return { detected: candidates.length, created };
  }, true);
}
