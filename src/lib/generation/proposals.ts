import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { currentAuthUserId, db, withTransaction } from "@/lib/db";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { BusinessError } from "@/lib/businessError";
import { auditInitiative } from "@/lib/audit";
import { buildPlan } from "./buildPlan";
import { validateIntake } from "./validateIntake";
import { resolveMethodology } from "./methodology";
import { archiveWorkingVersion } from "./versioning";
import { digest, generatedNodes, reconcile, type GeneratedFields, type ReconciliationItem } from "./reconciliation";
import type { GeneratedPlan, LayerType } from "./types";
import { LAYER_FOR_ARTIFACT, LAYER_SEQUENCE, type ArtifactType } from "./types";

async function actorFor(initiativeId: string) {
  const authUserId = currentAuthUserId();
  const actor = authUserId ? await db.user.findUnique({ where: { authUserId } }) : null;
  if (!actor) throw new BusinessError("Not signed in.", 401);
  await requireCollaborationAction(initiativeId, actor.id, "edit");
  return actor;
}

async function source(initiativeId: string) {
  const { loadIntakeInput } = await import("./engine");
  const [input, initiative] = await Promise.all([
    loadIntakeInput(initiativeId), db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, select: { methodology: true } }),
  ]);
  // The planning clock is not source input. Freeze forecast dates in the proposal.
  return { input, methodology: resolveMethodology(initiative.methodology), fingerprint: digest({ ...input, startDate: null, methodology: initiative.methodology }) };
}

async function records(prototypeId: string) {
  const container = await db.prototype.findUniqueOrThrow({ where: { id: prototypeId }, select: { initiativeId: true } });
  const [prototype, layers, sprints, releases, links, locks, capabilities] = await Promise.all([
    db.prototype.findUniqueOrThrow({ where: { id: prototypeId } }),
    db.artifactLayer.findMany({ where: { prototypeId }, orderBy: { id: "asc" } }),
    db.sprint.findMany({ where: { prototypeId }, orderBy: { id: "asc" } }),
    db.release.findMany({ where: { prototypeId }, orderBy: { id: "asc" } }),
    db.jiraExternalLink.findMany({ where: { initiativeId: container.initiativeId }, orderBy: { id: "asc" } }),
    db.layerLock.findMany({ where: { prototypeId }, orderBy: { id: "asc" } }),
    db.capability.findMany({ where: { intakeAnswerSet: { initiativeId: container.initiativeId } }, orderBy: { id: "asc" } }),
  ]);
  return { prototype, layers, sprints, releases, links, locks, capabilities };
}

/** Used only for a newly created tree, whose structural identity is known. */
export async function recordInitialGeneration(prototypeId: string, plan: GeneratedPlan) {
  const layers = await db.artifactLayer.findMany({ where: { prototypeId } });
  const mapping = new Map<string, string>();
  const baselines: { id: string; key: string; baseline: GeneratedFields }[] = [];
  for (const node of generatedNodes(plan)) {
    const candidates = layers.filter(row => row.type === node.type && row.parentId === (node.parentKey ? mapping.get(node.parentKey) : null)
      && row.sourceCapabilityId === node.capabilityId && row.order === node.order);
    if (candidates.length !== 1) continue;
    const row = candidates[0];
    mapping.set(node.key, row.id);
    baselines.push({ id: row.id, key: node.key, baseline: { title: row.title, body: row.body, points: row.points, contentJson: row.contentJson } });
  }
  await db.$executeRaw`UPDATE public."ArtifactLayer" a SET "generationKey"=b.key,"generatedBaseline"=b.baseline
    FROM jsonb_to_recordset(${JSON.stringify(baselines)}::jsonb) AS b(id text,key text,baseline jsonb)
    WHERE a.id=b.id AND a."prototypeId"=${prototypeId}`;
}

export async function createRegenerationProposal(initiativeId: string, editedLayer?: LayerType) {
  return withTransaction(async () => {
    const actor = await actorFor(initiativeId);
    const prototype = await db.prototype.findUniqueOrThrow({ where: { initiativeId } });
    const input = await source(initiativeId);
    const validation = validateIntake(input.input);
    if (validation.errors.length) throw new BusinessError("Resolve intake validation errors before proposing regeneration.", 422);
    const plan = buildPlan(input.input, input.methodology);
    const snapshot = await records(prototype.id);
    const nodes = generatedNodes(plan).filter(node => !editedLayer || LAYER_SEQUENCE.indexOf(LAYER_FOR_ARTIFACT[node.type as ArtifactType]) > LAYER_SEQUENCE.indexOf(editedLayer));
    const applicable = snapshot.layers.filter(row => !editedLayer || LAYER_SEQUENCE.indexOf(LAYER_FOR_ARTIFACT[row.type as ArtifactType]) > LAYER_SEQUENCE.indexOf(editedLayer));
    const committedCapabilities = new Set(snapshot.capabilities.filter(row => row.releaseId).map(row => row.id));
    const items = reconcile(nodes, applicable.map(row => ({ ...row, committed: Boolean(row.sourceCapabilityId && committedCapabilities.has(row.sourceCapabilityId)) })));
    const proposal = await db.regenerationProposal.create({ data: {
      initiativeId, prototypeId: prototype.id, createdByUserId: actor.id,
      sourceFingerprint: input.fingerprint, recordFingerprint: digest(snapshot),
      payload: { items, editedLayer: editedLayer ?? null, approvedBaseline: Boolean(prototype.approvedAt),
        candidateRecords: snapshot.layers.map(row => ({ id: row.id, type: row.type, title: row.title, body: row.body, parentId: row.parentId, sourceCapabilityId: row.sourceCapabilityId })),
        retainedSprintIds: snapshot.sprints.map(row => row.id), retainedReleaseIds: snapshot.releases.map(row => row.id),
        expectedVersions: snapshot.layers.map(row => ({ id: row.id, revision: row.backlogRevision, updatedAt: row.updatedAt.toISOString() })) } as unknown as Prisma.InputJsonValue,
    } });
    return { prototypeId: prototype.id, proposalId: proposal.id, status: "pending" as const };
  }, { timeout: 120_000 });
}

export type RegenerationDecision = { key: string; action: "keep" | "apply" | "map"; targetId?: string };
export async function applyRegenerationProposal(initiativeId: string, proposalId: string, expectedFingerprint: string, decisions: RegenerationDecision[]) {
  return withTransaction(async () => {
    const actor = await actorFor(initiativeId);
    // Serialize submissions before inspecting status; transaction isolation also
    // rejects concurrent edits to source records before the atomic commit.
    await db.$queryRaw`SELECT id FROM public."RegenerationProposal" WHERE id=${proposalId} AND "initiativeId"=${initiativeId} FOR UPDATE`;
    const proposal = await db.regenerationProposal.findFirst({ where: { id: proposalId, initiativeId } });
    if (!proposal) throw new BusinessError("Proposal not found.", 404);
    if (proposal.status !== "pending") throw new BusinessError("This proposal was already applied.", 409);
    if (expectedFingerprint !== proposal.recordFingerprint || digest(await records(proposal.prototypeId)) !== proposal.recordFingerprint || (await source(initiativeId)).fingerprint !== proposal.sourceFingerprint) {
      throw new BusinessError("The plan or source changed. Create a new proposal before applying changes.", 409);
    }
    const payload = proposal.payload as unknown as { items: ReconciliationItem[] };
    const choices = new Map(decisions.map(item => [item.key, item]));
    if (choices.size !== decisions.length || decisions.length !== payload.items.length || payload.items.some(item => !choices.has(item.key))) throw new BusinessError("Review every proposal item exactly once.", 422);
    const mapping: Record<string, string> = {};
    const targetIds = new Set<string>();
    for (const item of payload.items) if (item.targetId && item.proposed) targetIds.add(item.targetId);
    for (const item of payload.items) {
      const choice = choices.get(item.key)!;
      if (choice.action === "map") {
        if (item.kind !== "mapping_required" || !choice.targetId || !item.candidateIds.includes(choice.targetId)) throw new BusinessError("Select an eligible record for mapping.", 422);
        if (targetIds.has(choice.targetId)) throw new BusinessError("A record cannot represent two generated items.", 422);
        mapping[item.key] = choice.targetId;
        targetIds.add(choice.targetId);
      } else if (item.targetId && item.proposed) { mapping[item.key] = item.targetId; targetIds.add(item.targetId); }
      else if (choice.action === "apply" && item.kind === "add") mapping[item.key] = randomUUID();
      else if (choice.action === "apply" && item.kind !== "change") throw new BusinessError("This item must be preserved or explicitly mapped.", 422);
    }
    // No live deletion, automatic archival, scheduling, or external writes.
    await archiveWorkingVersion(proposal.prototypeId);
    for (const item of payload.items) {
      const choice = choices.get(item.key)!;
      if (item.kind === "orphan" && item.targetId) await db.artifactLayer.update({ where: { id: item.targetId }, data: { generationReviewStatus: "source_missing_review" } });
      if (!item.proposed || choice.action === "keep") continue;
      const proposed = item.proposed;
      if (choice.action === "map") {
        // Mapping establishes identity only. Legacy/human fields stay intact;
        // no invented generated baseline is assigned to historical prose.
        await db.artifactLayer.update({ where: { id: mapping[item.key] }, data: { generationKey: item.key, generationReviewStatus: "legacy_mapped_preserved" } });
      } else if (item.kind === "add") {
        const parentId = proposed.parentKey ? mapping[proposed.parentKey] : null;
        if (proposed.parentKey && !parentId) {
          const parent = await db.artifactLayer.findFirst({ where: { prototypeId: proposal.prototypeId, generationKey: proposed.parentKey } });
          if (parent) mapping[proposed.parentKey] = parent.id;
        }
        if (proposed.parentKey && !mapping[proposed.parentKey]) throw new BusinessError("Review or map the parent before adding its child.", 422);
        const baseline: GeneratedFields = { title: proposed.title, body: proposed.body, points: proposed.points, contentJson: proposed.contentJson };
        await db.artifactLayer.create({ data: { ...baseline, id: mapping[item.key], prototypeId: proposal.prototypeId, type: proposed.type,
          parentId: proposed.parentKey ? mapping[proposed.parentKey] : null, sourceCapabilityId: proposed.capabilityId, order: proposed.order,
          generationKey: item.key, generatedBaseline: baseline, sourceType: "generated" } });
      } else if (item.kind === "change" && item.targetId) {
        const row = await db.artifactLayer.findUniqueOrThrow({ where: { id: item.targetId } });
        const baseline = { ...(row.generatedBaseline as Record<string, unknown> ?? {}), ...item.changes } as Prisma.InputJsonObject;
        await db.artifactLayer.update({ where: { id: row.id }, data: { ...item.changes, generatedBaseline: baseline,
          backlogRevision: { increment: 1 }, generationReviewStatus: item.preservedFields.length ? "human_edits_preserved" : null } });
      }
    }
    const changedPlanning = payload.items.some(item => choices.get(item.key)?.action === "apply" && ["add", "change"].includes(item.kind));
    if (changedPlanning) await db.prototype.update({ where: { id: proposal.prototypeId }, data: { approvedAt: null, approvedBaselineJson: null } });
    await db.regenerationProposal.update({ where: { id: proposal.id }, data: { status: "applied", appliedAt: new Date(),
      decisions: decisions as unknown as Prisma.InputJsonValue, resultingMapping: mapping } });
    await auditInitiative(initiativeId, "plan.regeneration_applied", { proposalId, actorUserId: actor.id, resultingMapping: mapping });
    return { prototypeId: proposal.prototypeId, proposalId, status: "applied" as const, mapping };
  }, { timeout: 120_000 });
}
