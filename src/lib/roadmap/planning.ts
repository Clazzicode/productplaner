import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { withPlanningMutation } from "@/lib/generation/mutation";

export const roadmapFeatureUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  lane: z.enum(["now", "next", "later", "unscheduled"]).optional(),
  releaseId: z.string().min(1).nullable().optional(),
  reason: z.string().trim().min(3, "Explain why the roadmap is changing.").max(1000),
}).refine((value) => value.lane !== undefined || value.releaseId !== undefined, {
  message: "Choose a roadmap placement or target release.",
});

export type RoadmapFeatureUpdate = z.infer<typeof roadmapFeatureUpdateSchema>;

export async function updateRoadmapFeature(
  initiativeId: string,
  capabilityId: string,
  input: RoadmapFeatureUpdate,
) {
  const data = roadmapFeatureUpdateSchema.parse(input);
  return withPlanningMutation(initiativeId, "roadmap.feature_changed", async () => {
    const [prototype, capability] = await Promise.all([
      db.prototype.findUnique({ where: { initiativeId }, select: { id: true, approvedAt: true } }),
      db.capability.findFirst({
        where: { id: capabilityId, intakeAnswerSet: { initiativeId } },
        select: { id: true, backlogLane: true, backlogRevision: true, releaseId: true },
      }),
    ]);
    if (!prototype) throw new BusinessError("Generate a plan before editing its roadmap.", 404);
    if (prototype.approvedAt) throw new BusinessError("Reopen the approved plan before changing its roadmap.");
    if (!capability) throw new BusinessError("Feature not found.", 404);
    if (capability.backlogRevision !== data.expectedRevision) {
      throw new BusinessError("This feature changed. Reload before updating its roadmap.");
    }

    if (data.releaseId) {
      const release = await db.release.findFirst({
        where: { id: data.releaseId, prototypeId: prototype.id },
        select: { id: true },
      });
      if (!release) throw new BusinessError("Choose a release from this initiative.");
    }

    const result = await db.capability.updateMany({
      where: { id: capability.id, backlogRevision: data.expectedRevision },
      data: {
        ...(data.lane !== undefined ? { backlogLane: data.lane } : {}),
        ...(data.releaseId !== undefined ? { releaseId: data.releaseId } : {}),
        backlogRevision: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new BusinessError("This feature changed. Reload before updating its roadmap.");

    const updated = await db.capability.findUniqueOrThrow({
      where: { id: capability.id },
      select: { id: true, backlogLane: true, backlogRevision: true, releaseId: true },
    });
    await auditInitiative(initiativeId, "roadmap.feature_updated", {
      capabilityId,
      reason: data.reason,
      previous: { lane: capability.backlogLane, releaseId: capability.releaseId },
      next: { lane: updated.backlogLane, releaseId: updated.releaseId },
      revision: updated.backlogRevision,
    } as Prisma.InputJsonObject);
    return updated;
  }, true);
}
