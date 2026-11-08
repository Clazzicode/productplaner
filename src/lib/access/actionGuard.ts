import { currentAuthOrganizationId, currentAuthUserId, db } from "@/lib/db";
import { BusinessError } from "@/lib/businessError";
import { getResolvedAccess } from "./initiativeAccess";
import { canPerformAction, type CollaborationAction } from "./actions";

/** Recheck membership and initiative grants at the service boundary. Never trust
 * caller-provided admin booleans, stakeholder assignments, or actor IDs alone. */
export async function requireCollaborationAction(initiativeId: string, actorUserId: string, action: CollaborationAction, expectedOrganizationId?: string) {
  const authUserId = currentAuthUserId();
  if (!authUserId) throw new BusinessError("Not signed in.", 401);
  const actor = await db.user.findUnique({ where: { authUserId } });
  if (!actor || actor.id !== actorUserId || actor.status !== "active") throw new BusinessError("Not authorized.", 403);
  const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } });
  if (!initiative) throw new BusinessError("Not found.", 404);
  const organizationId = expectedOrganizationId ?? currentAuthOrganizationId();
  if (organizationId && initiative.organizationId !== organizationId) throw new BusinessError("Not found.", 404);
  const membership = await db.organizationMember.findUnique({
    where: { organizationId_authUserId: { organizationId: initiative.organizationId, authUserId } },
  });
  if (!membership || membership.status !== "active") throw new BusinessError("Not authorized.", 403);
  const access = await getResolvedAccess({ ...actor, organizationId: initiative.organizationId,
    accessLevel: ["owner", "admin"].includes(membership.role) ? "org_admin" : "standard_user" }, initiativeId);
  if (access === "not_found" || !canPerformAction({ ...actor, permissionRole: membership.role }, access.level, action)) {
    throw new BusinessError("Insufficient permissions for this action.", 403);
  }
  return { actor, organizationId: initiative.organizationId, access };
}

export async function hasCollaborationAction(initiativeId: string, actorUserId: string, action: CollaborationAction) {
  try {
    await requireCollaborationAction(initiativeId, actorUserId, action);
    return true;
  } catch (error) {
    if (error instanceof BusinessError && [401, 403, 404].includes(error.status)) return false;
    throw error;
  }
}
