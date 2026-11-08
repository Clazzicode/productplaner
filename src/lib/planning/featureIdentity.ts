import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/businessError";

/** Reuse the representation of a canonical Capability without rewriting its
 * editorial content. The database partial index arbitrates concurrent creators. */
export async function ensureFeatureProjection(initiativeId: string, capabilityId: string, sourceType: "manual" | "jira" = "manual") {
  const capability = await db.capability.findFirst({ where: { id: capabilityId, intakeAnswerSet: { initiativeId } }, select: { id: true, name: true } });
  if (!capability) throw new BusinessError("Feature not found.", 404);
  const prototype = await db.prototype.findUnique({ where: { initiativeId }, select: { id: true, approvedAt: true } });
  if (!prototype) throw new BusinessError("Start this initiative's planning workspace before adding stories.", 422);
  if (prototype.approvedAt) throw new BusinessError("Reopen the approved plan before adding work.", 409);
  const where = { prototypeId: prototype.id, type: "feature", sourceCapabilityId: capability.id, archivedAt: null };
  const existing = await db.artifactLayer.findFirst({ where });
  if (existing) return existing;
  await db.$executeRaw`
    INSERT INTO public."ArtifactLayer" (id,"prototypeId",type,title,"sourceCapabilityId","sourceType","updatedAt")
    VALUES (${randomUUID()},${prototype.id},'feature',${capability.name},${capability.id},${sourceType},now())
    ON CONFLICT ("prototypeId","sourceCapabilityId")
      WHERE type='feature' AND "archivedAt" IS NULL AND "sourceCapabilityId" IS NOT NULL DO NOTHING
  `;
  const projection = await db.artifactLayer.findFirst({ where });
  if (!projection) throw new BusinessError("The feature changed concurrently. Refresh and try again.", 409);
  return projection;
}
