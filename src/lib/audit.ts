import type { Prisma } from "@prisma/client";
import { currentAuthUserId, db } from "@/lib/db";
import { currentRequestId } from "@/lib/observability";

/** Call inside the business transaction; never pass request bodies or secrets. */
export async function auditInitiative(
  initiativeId: string,
  action: string,
  metadata: Prisma.InputJsonObject = {},
) {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId }, select: { organizationId: true, projectId: true },
  });
  const authUserId = currentAuthUserId();
  const actor = authUserId ? await db.user.findUnique({ where: { authUserId }, select: { id: true } }) : null;
  return db.auditEvent.create({ data: {
    organizationId: initiative.organizationId,
    projectId: initiative.projectId,
    actorUserId: actor?.id,
    entityType: "initiative",
    entityId: initiativeId,
    action,
    metadata,
    requestId: currentRequestId(),
  } });
}
