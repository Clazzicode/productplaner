import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import { readinessObstacles } from "@/lib/dependencies/service";
import type { ReadinessDecisionInput, SprintItemTarget, SprintPlanSaveInput } from "./model";

export type ReadinessCheckResult = { checkKey: string; status: "pass" | "fail" | "review"; explanation: string; evidence?: Prisma.InputJsonObject };

const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function evaluateSprintReadiness(initiativeId: string, target: SprintItemTarget) {
  const obstacles = await readinessObstacles(initiativeId, target);
  const checks: ReadinessCheckResult[] = [];
  let source: unknown;
  if (target.type === "story") {
    const story = await db.artifactLayer.findFirst({ where: { id: target.id, type: "story", archivedAt: null, prototype: { initiativeId } }, include: { children: { where: { type: "acceptance_criterion", archivedAt: null } }, sourceCapability: { select: { ownerUserId: true, backlogLane: true } }, refinementSessionItems: { include: { session: { select: { status: true } } } } } });
    if (!story) throw new BusinessError("Story not found.", 404); source = story;
    checks.push({ checkKey: "story_detail", status: story.title.trim() && story.body.trim().length >= 20 ? "pass" : "fail", explanation: story.body.trim().length >= 20 ? "The story has a title and useful detail." : "Add a clear story outcome and enough detail for engineering." });
    const approvedCriteria = story.children.filter((criterion) => criterion.approvedAt);
    checks.push({ checkKey: "acceptance_criteria", status: approvedCriteria.length >= 1 ? "pass" : "fail", explanation: approvedCriteria.length >= 1 ? `${approvedCriteria.length} acceptance criterion/criteria approved.` : "Approve at least one testable acceptance criterion." });
    checks.push({ checkKey: "estimate", status: story.points && story.points > 0 ? "pass" : "fail", explanation: story.points ? `Estimated at ${story.points} points.` : "Add an estimate before sprint planning." });
    const refined = story.refinementSessionItems.some((item) => item.session.status === "completed");
    checks.push({ checkKey: "refinement", status: refined ? "pass" : "fail", explanation: refined ? "Reviewed in a completed refinement session." : "Complete refinement for this story." });
    checks.push({ checkKey: "priority", status: story.sourceCapability && story.sourceCapability.backlogLane !== "unscheduled" ? "pass" : "review", explanation: story.sourceCapability && story.sourceCapability.backlogLane !== "unscheduled" ? `The parent feature is placed in ${story.sourceCapability.backlogLane}.` : "Prioritize and place the parent feature before sprint commitment." });
    checks.push({ checkKey: "owner", status: story.sourceCapability?.ownerUserId ? "pass" : "review", explanation: story.sourceCapability?.ownerUserId ? "The parent feature has an owner." : "Assign an accountable owner." });
  } else {
    const bug = await db.bugPlanningRecord.findFirst({ where: { id: target.id, initiativeId, archivedAt: null }, include: { request: true, refinementSessionItems: { include: { session: { select: { status: true } } } } } });
    if (!bug) throw new BusinessError("Bug not found.", 404); source = bug;
    const data = bug.request.data as Prisma.JsonObject; const detail = [data.observedBehavior, data.expectedBehavior, data.reproductionDetails].filter((value) => typeof value === "string" && value.trim()).length;
    checks.push({ checkKey: "bug_detail", status: detail >= 2 ? "pass" : "fail", explanation: detail >= 2 ? "Observed, expected, or reproduction details are recorded." : "Record observed behavior, expected behavior, and reproduction details." });
    checks.push({ checkKey: "severity_priority", status: bug.severity && bug.priority ? "pass" : "fail", explanation: bug.severity && bug.priority ? `${bug.severity} severity with ${bug.priority} priority.` : "Set severity and priority." });
    checks.push({ checkKey: "refinement", status: bug.refinementSessionItems.some((item) => item.session.status === "completed") ? "pass" : "fail", explanation: bug.refinementSessionItems.some((item) => item.session.status === "completed") ? "Reviewed in refinement." : "Review this bug during refinement." });
    checks.push({ checkKey: "owner", status: bug.ownerUserId ? "pass" : "review", explanation: bug.ownerUserId ? "An owner is assigned." : "Assign an owner." });
  }
  checks.push({ checkKey: "blockers", status: obstacles.blockers.length === 0 ? "pass" : "fail", explanation: obstacles.blockers.length === 0 ? "No open blockers." : `${obstacles.blockers.length} blocker(s) remain open.`, evidence: { ids: obstacles.blockers.map((item) => item.id) } });
  checks.push({ checkKey: "dependencies", status: obstacles.dependencies.length === 0 ? "pass" : "review", explanation: obstacles.dependencies.length === 0 ? "No predecessor dependency requires review." : `Confirm ${obstacles.dependencies.length} predecessor dependency/dependencies are satisfied.`, evidence: { ids: obstacles.dependencies.map((item) => item.id) } });
  return { checks, inputFingerprint: fingerprint({ source, obstacles }), recommendedDecision: checks.some((check) => check.status === "fail") ? "not_ready" as const : checks.some((check) => check.status === "review") ? "not_ready" as const : "ready" as const };
}

export async function recordReadinessDecision(initiativeId: string, input: ReadinessDecisionInput, actorUserId: string, canOverride: boolean) {
  return withTransaction(async () => {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true } }); if (!initiative) throw new BusinessError("Initiative not found.", 404);
    const evaluation = await evaluateSprintReadiness(initiativeId, input.target);
    if (input.decision === "overridden" && !canOverride) throw new BusinessError("Only an organization owner or administrator can override readiness checks.", 403);
    if (input.decision === "ready" && evaluation.recommendedDecision !== "ready") throw new BusinessError("Resolve the failed readiness checks or record an authorized override.", 422);
    const assessment = await db.sprintReadinessAssessment.create({ data: { organizationId: initiative.organizationId, initiativeId, storyId: input.target.type === "story" ? input.target.id : null, bugId: input.target.type === "bug" ? input.target.id : null, inputFingerprint: evaluation.inputFingerprint, decision: input.decision, reason: input.reason, decidedByUserId: actorUserId, checks: { create: evaluation.checks.map((check) => ({ checkKey: check.checkKey, status: check.status, explanation: check.explanation, evidence: check.evidence ?? {} })) } }, include: { checks: true } });
    const readinessStatus = input.decision === "not_ready" ? "ready_for_refinement" : "sprint_ready";
    if (input.target.type === "story") {
      const story = await db.artifactLayer.findUniqueOrThrow({ where: { id: input.target.id } });
      if (story.readinessStatus !== readinessStatus) {
        await db.artifactRevision.create({ data: { artifactId: story.id, version: story.backlogRevision, title: story.title, body: story.body, reason: input.reason, metadata: { readinessStatus: story.readinessStatus, nextReadinessStatus: readinessStatus }, actorUserId } });
        const changed = await db.artifactLayer.updateMany({ where: { id: story.id, backlogRevision: story.backlogRevision }, data: { readinessStatus, backlogRevision: { increment: 1 } } });
        if (changed.count !== 1) throw new BusinessError("This story changed. Reload before recording readiness.", 409);
      }
    } else {
      const bug = await db.bugPlanningRecord.findUniqueOrThrow({ where: { id: input.target.id } });
      if (bug.readinessStatus !== readinessStatus) {
        await db.bugPlanningRevision.create({ data: { organizationId: bug.organizationId, bugId: bug.id, fromRevision: bug.revision, toRevision: bug.revision + 1, previousData: { readinessStatus: bug.readinessStatus, revision: bug.revision }, nextData: { readinessStatus, revision: bug.revision + 1 }, reason: input.reason, actorUserId } });
        const changed = await db.bugPlanningRecord.updateMany({ where: { id: bug.id, revision: bug.revision }, data: { readinessStatus, revision: { increment: 1 } } });
        if (changed.count !== 1) throw new BusinessError("This bug changed. Reload before recording readiness.", 409);
      }
    }
    await auditInitiative(initiativeId, "sprint_readiness.decided", { assessmentId: assessment.id, target: `${input.target.type}:${input.target.id}`, decision: input.decision, reason: input.reason });
    return assessment;
  });
}

async function latestAssessment(initiativeId: string, target: SprintItemTarget) {
  return db.sprintReadinessAssessment.findFirst({ where: { initiativeId, invalidatedAt: null, ...(target.type === "story" ? { storyId: target.id } : { bugId: target.id }) }, orderBy: { createdAt: "desc" } });
}

export async function saveSprintPlan(initiativeId: string, input: SprintPlanSaveInput, actorUserId: string, canOverride: boolean) {
  return withTransaction(async () => {
    const sprint = await db.sprint.findFirst({ where: { id: input.sprintId, prototype: { initiativeId } }, include: { prototype: { select: { initiative: { select: { organizationId: true } } } } } });
    if (!sprint) throw new BusinessError("Sprint not found.", 404); const organizationId = sprint.prototype.initiative.organizationId;
    const existing = await db.sprintPlan.findUnique({ where: { sprintId: sprint.id } });
    if (existing?.status === "committed") throw new BusinessError("This sprint plan is already committed.", 409);
    if (existing && input.expectedRevision !== existing.revision) throw new BusinessError("This sprint plan changed. Reload before saving.", 409);
    const plannedPoints = input.items.reduce((sum, item) => sum + item.estimatePoints, 0);
    if (input.commit && plannedPoints > sprint.capacityPoints && !input.items.some((item) => item.overrideReason)) throw new BusinessError("The plan exceeds sprint capacity. Remove work or record an override reason.", 422);
    const assessed: { input: SprintPlanSaveInput["items"][number]; assessmentId: string | null }[] = [];
    for (const item of input.items) {
      let assessment = await latestAssessment(initiativeId, item.target);
      if (assessment) {
        const currentEvaluation = await evaluateSprintReadiness(initiativeId, item.target);
        if (assessment.inputFingerprint !== currentEvaluation.inputFingerprint) {
          await db.sprintReadinessAssessment.update({ where: { id: assessment.id }, data: { invalidatedAt: new Date() } });
          assessment = null;
        }
      }
      if ((!assessment || !["ready", "overridden"].includes(assessment.decision)) && !item.overrideReason) throw new BusinessError("Every selected item must be sprint-ready or have an authorized override reason.", 422);
      if (item.overrideReason && !canOverride) throw new BusinessError("Only an organization owner or administrator can override sprint readiness.", 403);
      const conflict = await db.sprintPlanningItem.findFirst({ where: { ...(item.target.type === "story" ? { storyId: item.target.id } : { bugId: item.target.id }), sprintPlan: { status: "committed", sprintId: { not: sprint.id } } }, select: { id: true } });
      if (conflict) throw new BusinessError("A selected item is already committed to another sprint.", 409);
      assessed.push({ input: item, assessmentId: assessment?.id ?? null });
    }
    const plan = existing ? await db.sprintPlan.update({ where: { id: existing.id }, data: { goal: input.goal, cadence: input.cadence, status: input.commit ? "committed" : "draft", capacityPoints: sprint.capacityPoints, plannedPoints, revision: { increment: 1 }, committedByUserId: input.commit ? actorUserId : null, committedAt: input.commit ? new Date() : null, items: { deleteMany: {}, create: assessed.map(({ input: item, assessmentId }, order) => ({ storyId: item.target.type === "story" ? item.target.id : null, bugId: item.target.type === "bug" ? item.target.id : null, readinessAssessmentId: assessmentId, estimatePoints: item.estimatePoints, order, carryoverReason: item.carryoverReason, overrideReason: item.overrideReason })) } }, include: { items: true } }) : await db.sprintPlan.create({ data: { organizationId, initiativeId, sprintId: sprint.id, goal: input.goal, cadence: input.cadence, status: input.commit ? "committed" : "draft", capacityPoints: sprint.capacityPoints, plannedPoints, createdByUserId: actorUserId, committedByUserId: input.commit ? actorUserId : null, committedAt: input.commit ? new Date() : null, items: { create: assessed.map(({ input: item, assessmentId }, order) => ({ storyId: item.target.type === "story" ? item.target.id : null, bugId: item.target.type === "bug" ? item.target.id : null, readinessAssessmentId: assessmentId, estimatePoints: item.estimatePoints, order, carryoverReason: item.carryoverReason, overrideReason: item.overrideReason })) } }, include: { items: true } });
    if (input.commit) {
      for (const item of input.items) if (item.target.type === "story") await db.artifactLayer.update({ where: { id: item.target.id }, data: { sprintId: sprint.id } }); else await db.bugPlanningRecord.update({ where: { id: item.target.id }, data: { affectedSprintId: sprint.id, revision: { increment: 1 } } });
    }
    await auditInitiative(initiativeId, input.commit ? "sprint_plan.committed" : "sprint_plan.saved", { sprintPlanId: plan.id, sprintId: sprint.id, plannedPoints, capacityPoints: sprint.capacityPoints }); return plan;
  });
}
