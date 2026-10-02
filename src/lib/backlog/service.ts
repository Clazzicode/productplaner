import { db } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { withPlanningMutation } from "@/lib/generation/mutation";
import { featureSchema, type FeatureInput } from "./model";

// API/page guards establish initiative permission before entering this service.
// Every supplied object ID is also constrained to that initiative here.
export async function listFeatures(initiativeId: string) {
  return db.capability.findMany({ where: { intakeAnswerSet: { initiativeId } }, orderBy: [{ order: "asc" }, { id: "asc" }] });
}

async function assertEditable(initiativeId: string) {
  const plan = await db.prototype.findUnique({ where: { initiativeId }, select: { approvedAt: true } });
  if (plan?.approvedAt) throw new BusinessError("Reopen the approved plan before changing its feature backlog.");
}

export async function saveFeature(initiativeId: string, input: FeatureInput, existing?: { id: string; revision: number }) {
  const data = featureSchema.parse(input);
  return withPlanningMutation(initiativeId, "backlog.feature_saved", async () => {
    await assertEditable(initiativeId);
    const previous = existing ? await db.capability.findFirst({ where: { id: existing.id, intakeAnswerSet: { initiativeId } } }) : null;
    if (existing && !previous) throw new BusinessError("Feature not found.", 404);
    if (previous && previous.backlogRevision !== existing!.revision) throw new BusinessError("This feature changed. Reload before saving.");
    let row;
    if (previous) {
      row = await db.capability.update({ where: { id: previous.id, backlogRevision: existing!.revision }, data: { ...data, backlogRevision: { increment: 1 } } });
    } else {
      const intake = await db.intakeAnswerSet.findUnique({ where: { initiativeId }, select: { id: true } });
      if (!intake) throw new BusinessError("Start guided intake before adding a feature.");
      const max = await db.capability.aggregate({ where: { intakeAnswerSetId: intake.id }, _max: { order: true } });
      row = await db.capability.create({ data: { ...data, intakeAnswerSetId: intake.id, order: (max._max.order ?? -1) + 1,
        isMvp: false, effortSize: "m", businessValue: "medium", riskLevel: "medium" } });
    }
    await auditInitiative(initiativeId, previous ? "backlog.feature_updated" : "backlog.feature_created", {
      capabilityId: row.id, revision: row.backlogRevision, lane: data.backlogLane, status: data.backlogStatus,
      previousLane: previous?.backlogLane ?? null, previousStatus: previous?.backlogStatus ?? null,
      contentChanged: !previous || previous.name !== data.name || previous.description !== data.description,
    });
    return row;
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
