import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureFeatureProjection } from "./featureIdentity";

/** Explicit empty initialization creates no estimates, dates or commitments. */
export async function ensureDraftWorkspace(tx: Prisma.TransactionClient, initiativeId: string) {
  const existing = await tx.prototype.findUnique({ where: { initiativeId } });
  if (existing) return existing;
  const prototype = await tx.prototype.create({ data: { initiativeId, status: "draft" } });
  const root = await tx.artifactLayer.create({ data: { prototypeId: prototype.id, type: "roadmap", title: "Planning roadmap", body: "Organize intended outcomes before committing delivery.", sourceType: "manual" } });
  await tx.artifactLayer.createMany({ data: ["Now", "Next", "Later", "Unscheduled"].map((title, order) => ({
    prototypeId: prototype.id, parentId: root.id, type: "roadmap_phase", title, order, sourceType: "manual", contentJson: JSON.stringify({ phaseNumber: order + 1 }),
  })) });
  return prototype;
}

/** Add a manual story container for the canonical feature, never replace prose. */
export async function syncDraftFeature(initiativeId: string, capability: { id: string; name: string; backlogLane?: string }) {
  const prototype = await db.prototype.findUnique({ where: { initiativeId }, select: { id: true, approvedAt: true } });
  if (!prototype?.id || prototype.approvedAt) return;
  const existing = await db.artifactLayer.findFirst({ where: { prototypeId: prototype.id, type: "feature", sourceCapabilityId: capability.id, archivedAt: null } });
  const feature = await ensureFeatureProjection(initiativeId, capability.id);
  if (!existing) {
    const order = { now: 0, next: 1, later: 2, unscheduled: 3 }[capability.backlogLane ?? "unscheduled"] ?? 3;
    let phase = await db.artifactLayer.findFirst({ where: { prototypeId: prototype.id, type: "roadmap_phase", order } });
    if (!phase) {
      const root = await db.artifactLayer.findFirst({ where: { prototypeId: prototype.id, type: "roadmap" } });
      if (root) phase = await db.artifactLayer.create({ data: { prototypeId: prototype.id, parentId: root.id, type: "roadmap_phase", order,
        title: ["Now", "Next", "Later", "Unscheduled"][order], sourceType: "manual", contentJson: JSON.stringify({ phaseNumber: order + 1 }) } });
    }
    if (phase) await db.artifactLayer.update({ where: { id: feature.id }, data: { parentId: phase.id } });
  }
  if (!await db.artifactLayer.findFirst({ where: { parentId: feature.id, type: "epic", archivedAt: null } })) {
    await db.artifactLayer.create({ data: { prototypeId: prototype.id, parentId: feature.id, type: "epic", title: capability.name,
      body: "Add small, testable stories for this feature.", sourceCapabilityId: capability.id, sourceType: "manual" } });
  }
}
