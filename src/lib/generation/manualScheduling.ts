import { db } from "@/lib/db";
import { BusinessError } from "@/lib/businessError";
import { assertAgileLayerEditable, AgileLayerLockedError } from "./engine";
import { withPlanningMutation } from "./mutation";

async function assertEditable(id: string) {
  try { await assertAgileLayerEditable(id); }
  catch (error) {
    if (error instanceof AgileLayerLockedError) throw new BusinessError(error.message);
    throw error;
  }
}

export async function createManualRelease(initiativeId: string, input: {
  cadence: "weekly" | "biweekly" | "every_three_weeks" | "monthly" | "quarterly" | "custom";
  customCadence: string;
  targetDate: Date;
}) {
  return withPlanningMutation(initiativeId, "release.created", async () => {
    await assertEditable(initiativeId);
    const prototype = await db.prototype.findUnique({ where: { initiativeId }, include: { releases: true } });
    if (!prototype) throw new BusinessError("Generate a plan before creating a release.");
    const manual = prototype.releases.filter(r => r.origin === "manual");
    const phases = await db.artifactLayer.findMany({ where: { prototypeId: prototype.id, type: "roadmap_phase" }, orderBy: { order: "asc" }, select: { contentJson: true } });
    const occupied = new Set(manual.map((release) => release.phaseNumber));
    const phaseNumber = phases.map((phase, index) => {
      try { return (JSON.parse(phase.contentJson) as { phaseNumber?: number }).phaseNumber ?? index + 1; }
      catch { return index + 1; }
    }).find((candidate) => !occupied.has(candidate));
    if (phaseNumber == null) throw new BusinessError("Every roadmap group already has a release. Adjust the roadmap before adding another release.", 422);
    if (manual.length === 0) {
      await db.sprint.deleteMany({ where: { prototypeId: prototype.id, origin: "auto" } });
      await db.release.deleteMany({ where: { prototypeId: prototype.id, origin: "auto" } });
    }
    const order = await db.release.aggregate({ where: { prototypeId: prototype.id }, _max: { order: true } });
    const nextOrder = (order._max.order ?? 0) + 1;
    await db.initiative.update({ where: { id: initiativeId }, data: {
      releaseCadence: input.cadence,
      customReleaseCadence: input.cadence === "custom" ? input.customCadence.trim() : "",
    } });
    return db.release.create({ data: { prototypeId: prototype.id, phaseNumber,
      name: `Release ${nextOrder}`, targetDate: input.targetDate, order: nextOrder, origin: "manual" } });
  }, true);
}

export async function createManualSprint(initiativeId: string, releaseId: string,
  input: { startDate: Date; endDate: Date; capacityPoints: number; storyIds: string[] }) {
  return withPlanningMutation(initiativeId, "sprint.created", async () => {
    await assertEditable(initiativeId);
    const release = await db.release.findFirst({ where: { id: releaseId, prototype: { initiativeId } } });
    if (!release || release.origin !== "manual") throw new BusinessError("Select a manually created release.");
    const storyIds = [...new Set(input.storyIds)];
    const candidates = await db.artifactLayer.findMany({
      where: { id: { in: storyIds }, prototypeId: release.prototypeId, type: "story", sprintId: null },
      select: { id: true, parent: { select: { parent: { select: { parent: { select: { contentJson: true } } } } } } },
    });
    if (candidates.length !== storyIds.length || candidates.some(s => {
      try { return JSON.parse(s.parent?.parent?.parent?.contentJson ?? "{}").phaseNumber !== release.phaseNumber; }
      catch { return true; }
    })) throw new BusinessError("Some selected stories are unavailable or belong to another phase. Refresh and try again.");
    const max = await db.sprint.aggregate({ where: { prototypeId: release.prototypeId }, _max: { sprintNumber: true } });
    const sprint = await db.sprint.create({ data: { prototypeId: release.prototypeId, releaseId,
      sprintNumber: (max._max.sprintNumber ?? 0) + 1, phaseNumber: release.phaseNumber,
      startDate: input.startDate, endDate: input.endDate, capacityPoints: input.capacityPoints, origin: "manual" } });
    if (storyIds.length) {
      const claimed = await db.artifactLayer.updateMany({ where: { id: { in: storyIds }, prototypeId: release.prototypeId, type: "story", sprintId: null }, data: { sprintId: sprint.id } });
      if (claimed.count !== storyIds.length) throw new BusinessError("A selected story was assigned elsewhere. Refresh and try again.");
    }
    return { sprint, assignedStoryCount: storyIds.length };
  }, true);
}
