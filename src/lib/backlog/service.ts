import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { featureRecord, featureSchema, type FeatureHistoryRecord, type FeatureInput, type FeatureRecord } from "./model";

const featureInclude = {
  owner: { select: { id: true, name: true, email: true } },
  dependsOnEdges: { select: { toCapabilityId: true } },
  sourceRequests: { select: { id: true, data: true } },
} satisfies Prisma.CapabilityInclude;

export async function listFeatures(initiativeId: string) {
  return db.capability.findMany({
    where: { intakeAnswerSet: { initiativeId } }, include: featureInclude,
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
}

async function assertEditable(initiativeId: string) {
  const plan = await db.prototype.findUnique({ where: { initiativeId }, select: { approvedAt: true } });
  if (plan?.approvedAt) throw new BusinessError("Reopen the approved plan before changing its feature backlog.");
}

async function validateReferences(initiativeId: string, organizationId: string, data: FeatureInput, featureId?: string) {
  if (featureId && data.dependsOnIds.includes(featureId)) throw new BusinessError("A feature cannot depend on itself.");
  if (data.ownerUserId) {
    const owner = await db.user.findFirst({ where: {
      id: data.ownerUserId, status: "active",
      memberships: { some: { organizationId, status: "active" } },
    }, select: { id: true } });
    if (!owner) throw new BusinessError("Choose an active member of this organization as the feature owner.");
  }
  if (data.dependsOnIds.length) {
    const dependencies = await db.capability.findMany({
      where: { id: { in: data.dependsOnIds }, intakeAnswerSet: { initiativeId } }, select: { id: true },
    });
    if (dependencies.length !== data.dependsOnIds.length) throw new BusinessError("One or more dependencies do not belong to this initiative.");
  }
}

function snapshot(row: ReturnType<typeof featureRecord>) {
  return {
    name: row.name, description: row.description, ownerUserId: row.ownerUserId, isMvp: row.isMvp,
    businessValue: row.businessValue, riskLevel: row.riskLevel, backlogLane: row.backlogLane,
    backlogStatus: row.backlogStatus, dependsOnIds: [...row.dependsOnIds].sort(),
  };
}

function changed(before: ReturnType<typeof snapshot> | null, after: ReturnType<typeof snapshot>) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after) as (keyof typeof after)[]) {
    if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after[key])) changes[key] = { before: before?.[key] ?? null, after: after[key] };
  }
  return changes;
}

export async function saveFeature(
  initiativeId: string,
  input: FeatureInput,
  existing?: { id: string; revision: number },
  options?: { reason?: string },
) {
  const data = featureSchema.parse(input);
  return withPlanningMutation(initiativeId, "backlog.feature_saved", async () => {
    await assertEditable(initiativeId);
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    const previous = existing ? await db.capability.findFirst({
      where: { id: existing.id, intakeAnswerSet: { initiativeId } }, include: featureInclude,
    }) : null;
    if (existing && !previous) throw new BusinessError("Feature not found.", 404);
    if (previous && previous.backlogRevision !== existing!.revision) throw new BusinessError("This feature changed. Reload before saving.");
    const reason = options?.reason?.trim();
    if (previous && (!reason || reason.length < 3)) throw new BusinessError("Explain why this feature is changing.");
    await validateReferences(initiativeId, initiative.organizationId, data, previous?.id);
    let row;
    if (previous) {
      row = await db.capability.update({
        where: { id: previous.id, backlogRevision: existing!.revision },
        data: {
          name: data.name, description: data.description, backlogLane: data.backlogLane, backlogStatus: data.backlogStatus,
          ownerUserId: data.ownerUserId, isMvp: data.isMvp, businessValue: data.businessValue, riskLevel: data.riskLevel,
          backlogRevision: { increment: 1 },
        },
      });
    } else {
      const intake = await db.intakeAnswerSet.findUnique({ where: { initiativeId }, select: { id: true } });
      if (!intake) throw new BusinessError("Start guided intake before adding a feature.");
      const max = await db.capability.aggregate({ where: { intakeAnswerSetId: intake.id }, _max: { order: true } });
      row = await db.capability.create({ data: {
        name: data.name, description: data.description, backlogLane: data.backlogLane, backlogStatus: data.backlogStatus,
        ownerUserId: data.ownerUserId, isMvp: data.isMvp, businessValue: data.businessValue, riskLevel: data.riskLevel,
        intakeAnswerSetId: intake.id, order: (max._max.order ?? -1) + 1, effortSize: "m",
      } });
    }
    await db.capabilityDependency.deleteMany({ where: { fromCapabilityId: row.id } });
    if (data.dependsOnIds.length) {
      await db.capabilityDependency.createMany({ data: data.dependsOnIds.map(toCapabilityId => ({ fromCapabilityId: row.id, toCapabilityId })) });
    }
    const savedRow = await db.capability.findUniqueOrThrow({ where: { id: row.id }, include: featureInclude });
    const saved = featureRecord(savedRow);
    const before = previous ? snapshot(featureRecord(previous)) : null;
    const action = previous
      ? previous.backlogStatus !== "archived" && data.backlogStatus === "archived" ? "backlog.feature_archived" : "backlog.feature_updated"
      : "backlog.feature_created";
    await auditInitiative(initiativeId, action, {
      capabilityId: saved.id, revision: saved.backlogRevision, reason: reason || "Feature created",
      changes: changed(before, snapshot(saved)),
    } as Prisma.InputJsonObject);
    return savedRow;
  }, true);
}

export async function reorderFeatures(initiativeId: string, items: { id: string; revision: number }[]) {
  return withPlanningMutation(initiativeId, "backlog.reordered", async () => {
    await assertEditable(initiativeId);
    const current = await listFeatures(initiativeId);
    const ids = new Set(items.map(item => item.id));
    if (ids.size !== items.length || current.length !== items.length || current.some(row => !ids.has(row.id))) {
      throw new BusinessError("The backlog changed. Reload before reordering.");
    }
    const byId = new Map(current.map(row => [row.id, row]));
    if (items.some(item => byId.get(item.id)!.backlogRevision !== item.revision)) throw new BusinessError("A feature changed. Reload before reordering.");
    for (const [order, item] of items.entries()) {
      await db.capability.update({ where: { id: item.id, backlogRevision: item.revision }, data: { order, backlogRevision: { increment: 1 } } });
    }
    await auditInitiative(initiativeId, "backlog.order_changed", { previousOrder: current.map(row => row.id), newOrder: items.map(item => item.id) });
    return listFeatures(initiativeId);
  }, true);
}

export async function listFeatureHistory(initiativeId: string, featureId: string): Promise<FeatureHistoryRecord[]> {
  const feature = await db.capability.findFirst({ where: { id: featureId, intakeAnswerSet: { initiativeId } }, select: { id: true } });
  if (!feature) throw new BusinessError("Feature not found.", 404);
  const events = await db.auditEvent.findMany({
    where: {
      entityType: "initiative", entityId: initiativeId,
      action: { in: ["backlog.feature_created", "backlog.feature_updated", "backlog.feature_archived"] },
    },
    orderBy: { createdAt: "desc" }, take: 250,
  });
  const matching = events.filter(event => {
    const metadata = event.metadata as Record<string, unknown>;
    return metadata.capabilityId === featureId;
  });
  const actorIds = [...new Set(matching.map(event => event.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorById = new Map(actors.map(actor => [actor.id, actor]));
  return matching.map(event => {
    const metadata = event.metadata as Record<string, unknown>;
    return {
      id: event.id, action: event.action, reason: typeof metadata.reason === "string" ? metadata.reason : "",
      revision: typeof metadata.revision === "number" ? metadata.revision : 0, createdAt: event.createdAt.toISOString(),
      actor: event.actorUserId ? actorById.get(event.actorUserId) ?? null : null,
      changes: metadata.changes && typeof metadata.changes === "object" ? metadata.changes as FeatureHistoryRecord["changes"] : {},
    };
  });
}
