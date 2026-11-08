import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { currentAuthUserId, db, withTransaction } from "@/lib/db";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { getResolvedAccess, type ActorRow } from "@/lib/access/initiativeAccess";
import { meetsMinimum } from "@/lib/access/resolution";
import { generalIntakeSchema, generalIntakeVersion } from "./generalIntake";
import { ensureDraftWorkspace } from "./draftWorkspace";

export async function saveGeneralIntake(actor: ActorRow, draftId: string, raw: unknown) {
  if (actor.status !== "active" || actor.memberType === "external") throw new BusinessError("You cannot create or edit planning drafts.", 403);
  const input = generalIntakeSchema.parse(raw);
  return withTransaction(async (tx) => {
    const verified = currentAuthUserId();
    const user = verified ? await tx.user.findUnique({ where: { authUserId: verified } }) : null;
    const membership = verified ? await tx.organizationMember.findUnique({ where: { organizationId_authUserId: { organizationId: actor.organizationId, authUserId: verified } } }) : null;
    if (!user || user.id !== actor.id || user.status !== "active" || user.memberType !== "internal" || membership?.status !== "active") throw new BusinessError("You cannot create or edit planning drafts.", 403);
    const existing = await tx.initiative.findUnique({ where: { id: draftId }, include: { intakeAnswerSet: true, prototype: { select: { status: true, approvedAt: true } } } });
    if (existing) {
      if (existing.organizationId !== actor.organizationId) {
        throw new BusinessError("Draft not found.", 404);
      }
      const access = await getResolvedAccess(actor, draftId);
      if (access === "not_found" || !meetsMinimum(access.level, "edit")) throw new BusinessError("You cannot edit this draft.", 403);
      await requireCollaborationAction(draftId, actor.id, "edit", actor.organizationId);
      if (existing.status === "generated") throw new BusinessError("Use the initiative's intake editor to change an existing plan.", 409);
      if (existing.prototype?.approvedAt) throw new BusinessError("Use the existing plan workflow to change an approved initiative.", 409);
      if (input.projectId && existing.projectId !== input.projectId) throw new BusinessError("This draft belongs to another project. Open it from that project.", 409);
      // A lost creation response can be retried with the same ID without creating another initiative.
      const unchanged = existing.name === input.name && existing.methodology === input.methodology
        && existing.intakeAnswerSet?.problemStatement === input.problemStatement
        && existing.intakeAnswerSet?.targetCustomer === input.targetCustomer
        && existing.intakeAnswerSet?.outcomeStatement === input.outcomeStatement;
      if (unchanged) return { initiativeId: existing.id, updatedAt: generalIntakeVersion(existing) };
      if (!input.expectedUpdatedAt || generalIntakeVersion(existing) !== input.expectedUpdatedAt) {
        throw new BusinessError("This draft changed in another tab. Reload it before saving.", 409);
      }
      const updated = await tx.initiative.updateMany({
        where: { id: draftId, updatedAt: existing.updatedAt },
        data: { name: input.name, description: input.problemStatement, methodology: input.methodology },
      });
      if (updated.count !== 1) throw new BusinessError("This draft changed. Reload before saving.", 409);
      await tx.intakeAnswerSet.update({ where: { initiativeId: draftId }, data: {
        problemStatement: input.problemStatement, targetCustomer: input.targetCustomer, outcomeStatement: input.outcomeStatement,
      } });
      await auditInitiative(draftId, "intake.draft_saved", { actorUserId: actor.id });
    } else {
      let projectId = input.projectId;
      if (projectId) {
        const project = await tx.project.findFirst({ where: { id: projectId, organizationId: actor.organizationId }, select: { id: true } });
        if (!project) throw new BusinessError("Project not found.", 404);
      } else {
        const project = await tx.project.create({ data: {
          organizationId: actor.organizationId, createdByUserId: actor.id, name: input.name + " — Project",
        } });
        projectId = project.id;
      }
      await tx.initiative.create({ data: {
        id: draftId, organizationId: actor.organizationId, userId: actor.id, projectId,
        name: input.name, description: input.problemStatement, methodology: input.methodology,
        intakeMethod: "guided", status: "intake_in_progress",
        intakeAnswerSet: { create: {
          problemStatement: input.problemStatement, targetCustomer: input.targetCustomer, outcomeStatement: input.outcomeStatement,
        } },
        initiativeAccess: { create: { userId: actor.id, permission: "owner" } },
      } });
      await ensureDraftWorkspace(tx, draftId);
      await auditInitiative(draftId, "intake.draft_created", { actorUserId: actor.id });
    }
    const saved = await db.initiative.findUniqueOrThrow({ where: { id: draftId }, include: { intakeAnswerSet: true } });
    return { initiativeId: saved.id, updatedAt: generalIntakeVersion(saved) };
  });
}
