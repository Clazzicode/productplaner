import type { Prisma, StakeholderAssignment } from "@prisma/client";
import { auditOrganization } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import type {
  StakeholderAssignmentCreate,
  StakeholderAssignmentUpdate,
  StakeholderContactCreate,
} from "./model";

function assignmentSnapshot(row: StakeholderAssignment) {
  return {
    stakeholderId: row.stakeholderId,
    productRole: row.productRole,
    responsibility: row.responsibility,
    influence: row.influence,
    interest: row.interest,
    engagementExpectation: row.engagementExpectation,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    revision: row.revision,
  };
}

export async function listProjectStakeholders(projectId: string, organizationId: string, initiativeId?: string) {
  const project = await db.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
  if (!project) throw new BusinessError("Project not found.", 404);
  const [contacts, assignments] = await Promise.all([
    db.stakeholderContact.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { displayName: "asc" },
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    }),
    db.stakeholderAssignment.findMany({
      where: { organizationId, projectId, archivedAt: null, ...(initiativeId ? { OR: [{ initiativeId }, { initiativeId: null }] } : {}) },
      orderBy: [{ productRole: "asc" }, { createdAt: "asc" }],
      include: { stakeholder: true },
    }),
  ]);
  return { contacts, assignments };
}

export async function createStakeholderContact(
  organizationId: string,
  projectId: string,
  input: StakeholderContactCreate,
  actorUserId: string,
) {
  return withTransaction(async () => {
    const project = await db.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true } });
    if (!project) throw new BusinessError("Project not found.", 404);
    if (input.userId) {
      const member = await db.organizationMember.findFirst({
        where: { organizationId, status: "active", user: { id: input.userId } },
        select: { user: { select: { id: true, name: true, email: true } } },
      });
      if (!member) throw new BusinessError("The selected person is not an active member of this organization.", 422);
      const existing = await db.stakeholderContact.findFirst({ where: { organizationId, userId: input.userId } });
      if (existing) return existing;
      const contact = await db.stakeholderContact.create({ data: {
        organizationId, userId: input.userId,
        displayName: input.displayName || member.user.name,
        email: input.email || member.user.email,
        company: input.company || null, external: false,
      } });
      await auditOrganization({ organizationId, actorUserId, projectId, entityType: "stakeholder_contact", entityId: contact.id, action: "stakeholder_contact.created", metadata: { external: false } });
      return contact;
    }
    const duplicate = input.email ? await db.stakeholderContact.findFirst({
      where: { organizationId, external: true, archivedAt: null, email: { equals: input.email, mode: "insensitive" } },
    }) : null;
    if (duplicate) throw new BusinessError("An external stakeholder with this email already exists.", 409);
    const contact = await db.stakeholderContact.create({ data: {
      organizationId, displayName: input.displayName, email: input.email || null,
      company: input.company || null, external: true,
    } });
    await auditOrganization({ organizationId, actorUserId, projectId, entityType: "stakeholder_contact", entityId: contact.id, action: "stakeholder_contact.created", metadata: { external: true } });
    return contact;
  });
}

async function validateTarget(projectId: string, organizationId: string, initiativeId: string | null | undefined, target: StakeholderAssignmentCreate["target"]) {
  const baseInitiative = initiativeId ? await db.initiative.findFirst({ where: { id: initiativeId, projectId, organizationId }, select: { id: true } }) : null;
  if (initiativeId && !baseInitiative) throw new BusinessError("Initiative not found in this project.", 404);
  if (target.type === "request") {
    return db.planningRequest.findFirst({ where: { id: target.id, initiative: { projectId, organizationId, ...(initiativeId ? { id: initiativeId } : {}) } }, select: { id: true } });
  }
  if (target.type === "feature") {
    return db.capability.findFirst({ where: { id: target.id, intakeAnswerSet: { initiative: { projectId, organizationId, ...(initiativeId ? { id: initiativeId } : {}) } } }, select: { id: true } });
  }
  if (target.type === "story") {
    return db.artifactLayer.findFirst({ where: { id: target.id, type: "story", prototype: { initiative: { projectId, organizationId, ...(initiativeId ? { id: initiativeId } : {}) } } }, select: { id: true } });
  }
  if (target.type === "sprint") {
    return db.sprint.findFirst({ where: { id: target.id, prototype: { initiative: { projectId, organizationId, ...(initiativeId ? { id: initiativeId } : {}) } } }, select: { id: true } });
  }
  if (target.type === "release") {
    return db.release.findFirst({ where: { id: target.id, prototype: { initiative: { projectId, organizationId, ...(initiativeId ? { id: initiativeId } : {}) } } }, select: { id: true } });
  }
  return db.decision.findFirst({ where: { id: target.id, projectId, organizationId, ...(initiativeId ? { OR: [{ initiativeId }, { initiativeId: null }] } : {}) }, select: { id: true } });
}

const targetColumns = (target: StakeholderAssignmentCreate["target"]) => ({
  planningRequestId: target.type === "request" ? target.id : null,
  capabilityId: target.type === "feature" ? target.id : null,
  storyId: target.type === "story" ? target.id : null,
  sprintId: target.type === "sprint" ? target.id : null,
  releaseId: target.type === "release" ? target.id : null,
  decisionId: target.type === "decision" ? target.id : null,
});

export async function createStakeholderAssignment(
  organizationId: string,
  projectId: string,
  input: StakeholderAssignmentCreate,
  actorUserId: string,
) {
  return withTransaction(async () => {
    const contact = await db.stakeholderContact.findFirst({ where: { id: input.stakeholderId, organizationId, archivedAt: null }, select: { id: true } });
    if (!contact) throw new BusinessError("Stakeholder not found.", 404);
    const target = await validateTarget(projectId, organizationId, input.initiativeId, input.target);
    if (!target) throw new BusinessError("The assignment target does not belong to this project.", 422);
    const columns = targetColumns(input.target);
    const duplicate = await db.stakeholderAssignment.findFirst({ where: {
      organizationId, projectId, stakeholderId: input.stakeholderId, productRole: input.productRole,
      archivedAt: null, ...columns,
    } });
    if (duplicate) throw new BusinessError("This stakeholder already has that role on the selected item.", 409);
    const assignment = await db.stakeholderAssignment.create({ data: {
      organizationId, projectId, initiativeId: input.initiativeId ?? null,
      stakeholderId: input.stakeholderId, productRole: input.productRole,
      responsibility: input.responsibility, influence: input.influence,
      interest: input.interest, engagementExpectation: input.engagementExpectation,
      createdByUserId: actorUserId, ...columns,
    } });
    await auditOrganization({ organizationId, actorUserId, projectId, entityType: "stakeholder_assignment", entityId: assignment.id, action: "stakeholder_assignment.created", metadata: { productRole: input.productRole, targetType: input.target.type, targetId: input.target.id } });
    return assignment;
  });
}

export async function updateStakeholderAssignment(
  assignmentId: string,
  organizationId: string,
  input: StakeholderAssignmentUpdate,
  actorUserId: string,
) {
  return withTransaction(async () => {
    const current = await db.stakeholderAssignment.findFirst({ where: { id: assignmentId, organizationId } });
    if (!current) throw new BusinessError("Stakeholder assignment not found.", 404);
    if (current.revision !== input.expectedRevision) throw new BusinessError("This assignment changed. Reload before saving.", 409);
    const changes = {
      ...(input.productRole !== undefined ? { productRole: input.productRole } : {}),
      ...(input.responsibility !== undefined ? { responsibility: input.responsibility } : {}),
      ...(input.influence !== undefined ? { influence: input.influence } : {}),
      ...(input.interest !== undefined ? { interest: input.interest } : {}),
      ...(input.engagementExpectation !== undefined ? { engagementExpectation: input.engagementExpectation } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    };
    const next = { ...assignmentSnapshot(current), ...changes, archivedAt: changes.archivedAt?.toISOString() ?? assignmentSnapshot(current).archivedAt, revision: current.revision + 1 };
    await db.stakeholderAssignmentRevision.create({ data: {
      organizationId, assignmentId, fromRevision: current.revision, toRevision: current.revision + 1,
      previousData: assignmentSnapshot(current), nextData: next as Prisma.InputJsonObject,
      reason: input.reason, actorUserId,
    } });
    const result = await db.stakeholderAssignment.updateMany({ where: { id: assignmentId, organizationId, revision: input.expectedRevision }, data: { ...changes, revision: { increment: 1 } } });
    if (result.count !== 1) throw new BusinessError("This assignment changed. Reload before saving.", 409);
    const saved = await db.stakeholderAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    await auditOrganization({ organizationId, actorUserId, projectId: current.projectId, entityType: "stakeholder_assignment", entityId: assignmentId, action: input.archived ? "stakeholder_assignment.archived" : "stakeholder_assignment.updated", metadata: { reason: input.reason, fromRevision: current.revision, toRevision: saved.revision } });
    return saved;
  });
}
