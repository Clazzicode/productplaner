import { db } from "@/lib/db";
import { resolveTargetLaunchDate } from "@/lib/projectContext";
import { recommendInitiativeStatus, recommendProjectStatus } from "./recommend";
import type { ResolvedStatus, StatusColor, StatusEntityType } from "./types";

async function computeRecommendations(
  organizationId: string,
  entityType: StatusEntityType,
  entityIds: string[],
): Promise<Map<string, { color: StatusColor; reason: string } | null>> {
  const out = new Map<string, { color: StatusColor; reason: string } | null>();
  const today = new Date();

  if (entityType === "initiative") {
    const initiatives = await db.initiative.findMany({
      where: { id: { in: entityIds }, organizationId },
      select: {
        id: true,
        status: true,
        targetLaunchDateOverride: true,
        project: { select: { targetLaunchDate: true } },
        intakeAnswerSet: { select: { problemStatement: true, targetCustomer: true, outcomeStatement: true } },
      },
    });
    for (const i of initiatives) {
      const rec = recommendInitiativeStatus(
        {
          targetLaunchDate: resolveTargetLaunchDate(i, i.project),
          isActivelyExecuting: i.status === "generated",
          problemStatement: i.intakeAnswerSet?.problemStatement ?? "",
          targetCustomer: i.intakeAnswerSet?.targetCustomer ?? "",
          outcomeStatement: i.intakeAnswerSet?.outcomeStatement ?? "",
        },
        today,
      );
      out.set(i.id, rec);
    }
  } else if (entityType === "project") {
    const projects = await db.project.findMany({
      where: { id: { in: entityIds }, organizationId },
      select: { id: true, targetLaunchDate: true, initiatives: { select: { status: true } } },
    });
    for (const p of projects) {
      const rec = recommendProjectStatus(
        {
          targetLaunchDate: p.targetLaunchDate,
          hasGeneratedInitiative: p.initiatives.some((i) => i.status === "generated"),
        },
        today,
      );
      out.set(p.id, rec);
    }
  } else {
    // No recommendation source implemented yet for these entity types — see
    // recommend.ts's header comment. Stored status (if any) still applies.
    for (const id of entityIds) out.set(id, null);
  }
  return out;
}

/** Batch-resolve current + recommended status for a set of same-type
 * entities — the shape every list/card view needs. */
export async function getResolvedStatuses(
  organizationId: string,
  entityType: StatusEntityType,
  entityIds: string[],
): Promise<Map<string, ResolvedStatus>> {
  if (entityIds.length === 0) return new Map();

  const [stored, recommendations] = await Promise.all([
    db.roadmapStatus.findMany({ where: { organizationId, entityType, entityId: { in: entityIds } } }),
    computeRecommendations(organizationId, entityType, entityIds),
  ]);
  const storedByEntity = new Map(stored.map((s) => [s.entityId, s]));

  const result = new Map<string, ResolvedStatus>();
  for (const id of entityIds) {
    const row = storedByEntity.get(id);
    const rec = recommendations.get(id) ?? null;
    const current = row ? (row.color as StatusColor) : null;
    result.set(id, {
      color: current,
      source: row ? (row.source as "manual" | "system") : null,
      reason: row?.reason ?? "",
      // Nothing to accept once it already matches the current color.
      recommendation: rec && rec.color !== current ? rec : null,
    });
  }
  return result;
}

export async function getResolvedStatus(
  organizationId: string,
  entityType: StatusEntityType,
  entityId: string,
): Promise<ResolvedStatus> {
  const map = await getResolvedStatuses(organizationId, entityType, [entityId]);
  return map.get(entityId) ?? { color: null, source: null, reason: "", recommendation: null };
}

/** Manual set, or accepting a system recommendation — either way this
 * becomes the current status; never written silently (directive: "Do not
 * let AI silently change the status of approved work"). */
export async function setRoadmapStatus(params: {
  organizationId: string;
  entityType: StatusEntityType;
  entityId: string;
  color: StatusColor;
  reason: string;
  source: "manual" | "system";
  updatedByUserId: string;
}): Promise<void> {
  await db.roadmapStatus.upsert({
    where: { entityType_entityId: { entityType: params.entityType, entityId: params.entityId } },
    create: {
      organizationId: params.organizationId,
      entityType: params.entityType,
      entityId: params.entityId,
      color: params.color,
      reason: params.reason,
      source: params.source,
      updatedByUserId: params.updatedByUserId,
    },
    update: {
      color: params.color,
      reason: params.reason,
      source: params.source,
      updatedByUserId: params.updatedByUserId,
    },
  });
}
