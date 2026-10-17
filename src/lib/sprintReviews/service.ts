import { Prisma, type PlanningMeeting, type SprintReview } from "@prisma/client";
import { auditInitiative } from "@/lib/audit";
import { BusinessError } from "@/lib/businessError";
import { db, withTransaction } from "@/lib/db";
import type { ReviewCommand } from "./model";

type Warning = { code: string; message: string; severity: "blocking" | "warning" };

function requestTitle(data: unknown) {
  return typeof data === "object" && data && !Array.isArray(data) && "title" in data ? String(data.title) : "Bug";
}

export async function buildReviewProjection(initiativeId: string, sprintId: string) {
  const plan = await db.sprintPlan.findFirst({ where: { initiativeId, sprintId, status: "committed" }, include: {
    sprint: { select: { id: true, sprintNumber: true, startDate: true, endDate: true, status: true } },
    items: { orderBy: { order: "asc" }, include: { story: { select: { id: true, title: true } }, bug: { include: { request: { select: { data: true } } } } } },
  } });
  if (!plan) throw new BusinessError("Sprint Review requires a committed sprint plan.", 422);
  const [demos, blockers, clarifications] = await Promise.all([
    db.demoItem.findMany({ where: { initiativeId, sprintId }, orderBy: [{ plannedOrder: "asc" }, { createdAt: "asc" }], include: { story: { select: { title: true } }, bug: { include: { request: { select: { data: true } } } }, capability: { select: { name: true } } } }),
    db.planningBlocker.findMany({ where: { initiativeId, status: { in: ["open", "in_progress"] }, OR: [{ sprintId }, { storyId: { in: plan.items.flatMap(item => item.storyId ? [item.storyId] : []) } }, { bugId: { in: plan.items.flatMap(item => item.bugId ? [item.bugId] : []) } }] }, select: { id: true, description: true, status: true, storyId: true, bugId: true } }),
    db.inSprintClarification.findMany({ where: { initiativeId, sprintId, status: { in: ["open", "answered"] } }, select: { id: true, question: true, status: true, urgency: true, storyId: true, bugId: true } }),
  ]);
  const warnings: Warning[] = [];
  if (demos.length === 0) warnings.push({ code: "no_demo_items", severity: "blocking", message: "Add at least one committed story or bug to the demo agenda." });
  for (const demo of demos) {
    if (["proposed", "preparing"].includes(demo.status)) warnings.push({ code: `readiness:${demo.id}`, severity: "blocking", message: `Choose Ready or Not ready for “${demo.title}”.` });
    if (demo.status === "ready" && !demo.presenterNameSnapshot.trim()) warnings.push({ code: `presenter:${demo.id}`, severity: "blocking", message: `Assign a presenter to “${demo.title}”.` });
  }
  if (blockers.length > 0) warnings.push({ code: "open_blockers", severity: "warning", message: `${blockers.length} blocker(s) remain open and must be acknowledged in the review.` });
  if (clarifications.length > 0) warnings.push({ code: "open_clarifications", severity: "warning", message: `${clarifications.length} clarification(s) remain open or awaiting acknowledgement.` });
  const work = plan.items.map(item => item.story ? { type: "story", id: item.story.id, title: item.story.title, estimatePoints: item.estimatePoints } : { type: "bug", id: item.bug!.id, title: requestTitle(item.bug!.request.data), estimatePoints: item.estimatePoints });
  const demoView = demos.map(demo => ({ id: demo.id, title: demo.title, status: demo.status, purpose: demo.purpose, presenter: demo.presenterNameSnapshot, completedWork: demo.completedWork, notes: demo.notes, plannedOrder: demo.plannedOrder, blockingReason: demo.blockingReason, carryoverReason: demo.carryoverReason, storyTitle: demo.story?.title ?? null, bugTitle: demo.bug ? requestTitle(demo.bug.request.data) : null, featureName: demo.capability?.name ?? null }));
  return {
    snapshot: { sprint: { id: plan.sprint.id, number: plan.sprint.sprintNumber, goal: plan.goal, status: plan.sprint.status, startDate: plan.sprint.startDate.toISOString(), endDate: plan.sprint.endDate.toISOString(), capacityPoints: plan.capacityPoints, plannedPoints: plan.plannedPoints }, work, completedWork: demoView.filter(item => item.completedWork.trim()).map(item => ({ id: item.id, title: item.title, completedWork: item.completedWork })), readyDemos: demoView.filter(item => item.status === "ready"), notReadyDemos: demoView.filter(item => ["proposed", "preparing", "not_ready", "skipped"].includes(item.status)), demonstrated: demoView.filter(item => item.status === "demonstrated"), carryover: demoView.filter(item => item.status === "carried_over"), blockers, clarifications, bugs: plan.items.filter(item => item.bug).map(item => ({ id: item.bug!.id, title: requestTitle(item.bug!.request.data), severity: item.bug!.severity, status: item.bug!.status, priority: item.bug!.priority })) } as Prisma.InputJsonObject,
    warnings, demos,
  };
}

function reviewSnapshot(review: SprintReview, meeting: PlanningMeeting): Prisma.InputJsonObject {
  return { status: review.status, draftSnapshot: review.draftSnapshot as Prisma.InputJsonValue, finalSnapshot: review.finalSnapshot === null ? null : review.finalSnapshot as Prisma.InputJsonValue, missingWarnings: review.missingWarnings as Prisma.InputJsonValue, summary: review.summary, overrideReason: review.overrideReason, revision: review.revision,
    meeting: { title: meeting.title, scheduledAt: meeting.scheduledAt?.toISOString() ?? null, facilitatorStakeholderId: meeting.facilitatorStakeholderId, facilitatorNameSnapshot: meeting.facilitatorNameSnapshot, purpose: meeting.purpose, notes: meeting.notes, transcriptText: meeting.transcriptText, transcriptDocumentId: meeting.transcriptDocumentId, outcome: meeting.outcome, status: meeting.status } };
}

async function getReview(id: string) {
  const review = await db.sprintReview.findUnique({ where: { id } });
  if (!review) throw new BusinessError("Sprint review not found.", 404);
  const meeting = await db.planningMeeting.findUnique({ where: { id: review.meetingId } });
  if (!meeting) throw new BusinessError("Sprint review meeting not found.", 404);
  return { review, meeting };
}

async function stakeholder(organizationId: string, id: string | null | undefined) {
  if (!id) return null;
  const row = await db.stakeholderContact.findFirst({ where: { id, organizationId, archivedAt: null }, select: { id: true, displayName: true, email: true } });
  if (!row) throw new BusinessError("Choose an active stakeholder from this organization.", 422);
  return row;
}

async function writeRevision(review: SprintReview, meeting: PlanningMeeting, next: Prisma.InputJsonObject, reason: string, actorUserId: string) {
  await db.sprintReviewRevision.create({ data: { organizationId: review.organizationId, reviewId: review.id, fromRevision: review.revision, toRevision: review.revision + 1, previousData: reviewSnapshot(review, meeting), nextData: next, reason, actorUserId } });
}

async function incrementRevision(id: string, revision: number, data: Prisma.SprintReviewUpdateManyMutationInput = {}) {
  const changed = await db.sprintReview.updateMany({ where: { id, revision }, data: { ...data, revision: { increment: 1 } } });
  if (changed.count !== 1) throw new BusinessError("This sprint review changed. Reload before saving.", 409);
}

export async function createOrRefreshReview(initiativeId: string, sprintId: string, actorUserId: string, expectedRevision?: number, reason = "Sprint review refreshed") {
  return withTransaction(async () => {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { organizationId: true, projectId: true } });
    if (!initiative) throw new BusinessError("Initiative not found.", 404);
    const projection = await buildReviewProjection(initiativeId, sprintId);
    const existing = await db.sprintReview.findUnique({ where: { sprintId } });
    if (!existing) {
      const meeting = await db.planningMeeting.create({ data: { organizationId: initiative.organizationId, projectId: initiative.projectId, initiativeId, meetingType: "sprint_review", sprintId, title: `Sprint ${String((projection.snapshot.sprint as Prisma.JsonObject).number)} Review`, purpose: "Review completed work, demonstrate value, and agree follow-up actions.", createdByUserId: actorUserId } });
      const review = await db.sprintReview.create({ data: { organizationId: initiative.organizationId, projectId: initiative.projectId, initiativeId, sprintId, meetingId: meeting.id, draftSnapshot: projection.snapshot, missingWarnings: projection.warnings, createdByUserId: actorUserId } });
      if (projection.demos.length) await db.planningMeetingWorkItem.createMany({ data: projection.demos.map(demo => ({ organizationId: initiative.organizationId, meetingId: meeting.id, demoItemId: demo.id })) });
      await auditInitiative(initiativeId, "sprint_review.created", { reviewId: review.id, sprintId, warningCount: projection.warnings.length });
      return loadReviewDetails(review.id);
    }
    if (existing.status === "finalized") throw new BusinessError("Reopen the finalized sprint review before refreshing it.", 409);
    if (!expectedRevision || existing.revision !== expectedRevision) throw new BusinessError("This sprint review changed. Reload before refreshing.", 409);
    const meeting = await db.planningMeeting.findUniqueOrThrow({ where: { id: existing.meetingId } });
    const next = { ...reviewSnapshot(existing, meeting), draftSnapshot: projection.snapshot, missingWarnings: projection.warnings as unknown as Prisma.InputJsonValue, revision: existing.revision + 1 } as Prisma.InputJsonObject;
    await writeRevision(existing, meeting, next, reason, actorUserId);
    await db.planningMeetingWorkItem.deleteMany({ where: { meetingId: meeting.id } });
    if (projection.demos.length) await db.planningMeetingWorkItem.createMany({ data: projection.demos.map(demo => ({ organizationId: existing.organizationId, meetingId: meeting.id, demoItemId: demo.id })) });
    const changed = await db.sprintReview.updateMany({ where: { id: existing.id, revision: existing.revision }, data: { draftSnapshot: projection.snapshot, missingWarnings: projection.warnings, revision: { increment: 1 } } });
    if (changed.count !== 1) throw new BusinessError("This sprint review changed. Reload before refreshing.", 409);
    await auditInitiative(initiativeId, "sprint_review.refreshed", { reviewId: existing.id, reason, warningCount: projection.warnings.length });
    return loadReviewDetails(existing.id);
  });
}

export async function applyReviewCommand(id: string, input: ReviewCommand, actorUserId: string, canFinalize: boolean) {
  return withTransaction(async () => {
    const { review, meeting } = await getReview(id);
    if (review.revision !== input.expectedRevision) throw new BusinessError("This sprint review changed. Reload before saving.", 409);
    if (["finalize", "reopen"].includes(input.action) && !canFinalize) throw new BusinessError("Only an organization owner or administrator can finalize or reopen a sprint review.", 403);
    if (review.status === "finalized" && input.action !== "reopen") throw new BusinessError("Reopen the finalized sprint review before making changes.", 409);
    let next: Prisma.InputJsonObject; let auditAction: string;
    if (input.action === "update") {
      const facilitator = await stakeholder(review.organizationId, input.facilitatorStakeholderId);
      const uniqueParticipants = [...new Set(input.participantIds)];
      const participants = await db.stakeholderContact.findMany({ where: { id: { in: uniqueParticipants }, organizationId: review.organizationId, archivedAt: null }, select: { id: true, displayName: true, email: true } });
      if (participants.length !== uniqueParticipants.length) throw new BusinessError("One or more participants are not active stakeholders in this organization.", 422);
      if (input.transcriptDocumentId) {
        const document = await db.document.findFirst({ where: { id: input.transcriptDocumentId, organizationId: review.organizationId, initiativeId: review.initiativeId }, select: { id: true } });
        if (!document) throw new BusinessError("Choose a document uploaded to this initiative.", 422);
      }
      next = { ...reviewSnapshot(review, meeting), summary: input.summary, revision: review.revision + 1, meeting: { title: input.title, scheduledAt: input.scheduledAt?.toISOString() ?? null, facilitatorStakeholderId: facilitator?.id ?? null, facilitatorNameSnapshot: facilitator?.displayName ?? "", purpose: input.purpose, notes: input.notes, transcriptText: input.transcriptText, transcriptDocumentId: input.transcriptDocumentId, outcome: input.outcome, status: meeting.status } };
      await writeRevision(review, meeting, next, input.reason, actorUserId);
      await db.planningMeeting.update({ where: { id: meeting.id }, data: { title: input.title, scheduledAt: input.scheduledAt, facilitatorStakeholderId: facilitator?.id ?? null, facilitatorNameSnapshot: facilitator?.displayName ?? "", purpose: input.purpose, notes: input.notes, transcriptText: input.transcriptText, transcriptDocumentId: input.transcriptDocumentId, outcome: input.outcome } });
      await db.planningMeetingParticipant.deleteMany({ where: { meetingId: meeting.id } });
      if (participants.length) await db.planningMeetingParticipant.createMany({ data: participants.map(person => ({ organizationId: review.organizationId, meetingId: meeting.id, stakeholderId: person.id, participantNameSnapshot: person.displayName, participantEmailSnapshot: person.email })) });
      await incrementRevision(id, review.revision, { summary: input.summary }); auditAction = "updated";
    } else if (input.action === "decision") {
      const decisionMaker = await stakeholder(review.organizationId, input.decisionMakerStakeholderId);
      next = { ...reviewSnapshot(review, meeting), operation: "decision", revision: review.revision + 1 };
      await writeRevision(review, meeting, next, input.reason, actorUserId);
      await db.planningMeetingDecision.create({ data: { organizationId: review.organizationId, meetingId: meeting.id, title: input.title, rationale: input.rationale, decisionMakerStakeholderId: decisionMaker?.id ?? null, decisionMakerNameSnapshot: decisionMaker?.displayName ?? "", createdByUserId: actorUserId } });
      await incrementRevision(id, review.revision); auditAction = "decision_recorded";
    } else if (input.action === "follow_up") {
      const owner = await stakeholder(review.organizationId, input.ownerStakeholderId);
      next = { ...reviewSnapshot(review, meeting), operation: "follow_up", revision: review.revision + 1 };
      await writeRevision(review, meeting, next, input.reason, actorUserId);
      await db.planningMeetingAction.create({ data: { organizationId: review.organizationId, meetingId: meeting.id, title: input.title, ownerStakeholderId: owner?.id ?? null, ownerNameSnapshot: owner?.displayName ?? "", dueAt: input.dueAt, createdByUserId: actorUserId } });
      if (input.suggestionId) await useSuggestion(input.suggestionId, review.id, "follow_up", actorUserId);
      await incrementRevision(id, review.revision); auditAction = "follow_up_recorded";
    } else if (input.action === "use_summary") {
      await useSuggestion(input.suggestionId, review.id, "summary", actorUserId);
      next = { ...reviewSnapshot(review, meeting), summary: input.summary, revision: review.revision + 1 };
      await writeRevision(review, meeting, next, input.reason, actorUserId);
      await incrementRevision(id, review.revision, { summary: input.summary }); auditAction = "ai_summary_used";
    } else if (input.action === "finalize") {
      const projection = await buildReviewProjection(review.initiativeId, review.sprintId);
      const [participants, decisions, actions] = await Promise.all([
        db.planningMeetingParticipant.findMany({ where: { meetingId: meeting.id }, orderBy: { createdAt: "asc" } }),
        db.planningMeetingDecision.findMany({ where: { meetingId: meeting.id }, orderBy: { decidedAt: "asc" } }),
        db.planningMeetingAction.findMany({ where: { meetingId: meeting.id }, orderBy: { createdAt: "asc" } }),
      ]);
      const warnings: Warning[] = [...projection.warnings];
      if (!participants.length) warnings.push({ code: "no_participants", severity: "warning", message: "Add at least one sprint-review participant." });
      if (!meeting.outcome.trim()) warnings.push({ code: "no_outcome", severity: "warning", message: "Record the sprint-review outcome." });
      const blocking = warnings.filter(warning => warning.severity === "blocking");
      if (blocking.length) throw new BusinessError(blocking.map(warning => warning.message).join(" "), 422);
      if (warnings.length && input.overrideReason.trim().length < 5) throw new BusinessError(`${warnings.map(warning => warning.message).join(" ")} Record an authorized override reason to finalize.`, 422);
      const finalSnapshot = { ...projection.snapshot, meeting: { title: meeting.title, scheduledAt: meeting.scheduledAt?.toISOString() ?? null, facilitator: meeting.facilitatorNameSnapshot, purpose: meeting.purpose, notes: meeting.notes, transcriptText: meeting.transcriptText, transcriptDocumentId: meeting.transcriptDocumentId, outcome: meeting.outcome }, participants: participants.map(person => ({ name: person.participantNameSnapshot, email: person.participantEmailSnapshot, role: person.role })), decisions: decisions.map(item => ({ title: item.title, rationale: item.rationale, decisionMaker: item.decisionMakerNameSnapshot, decidedAt: item.decidedAt.toISOString() })), followUps: actions.map(item => ({ title: item.title, owner: item.ownerNameSnapshot, dueAt: item.dueAt?.toISOString() ?? null, status: item.status })), summary: review.summary, finalizedAt: new Date().toISOString() } as Prisma.InputJsonObject;
      next = { ...reviewSnapshot(review, meeting), status: "finalized", finalSnapshot, draftSnapshot: projection.snapshot, missingWarnings: warnings as unknown as Prisma.InputJsonValue, overrideReason: input.overrideReason, revision: review.revision + 1 };
      await writeRevision(review, meeting, next, input.reason, actorUserId);
      const changed = await db.sprintReview.updateMany({ where: { id, revision: review.revision }, data: { status: "finalized", draftSnapshot: projection.snapshot, finalSnapshot, missingWarnings: warnings, overrideReason: input.overrideReason, finalizedByUserId: actorUserId, finalizedAt: new Date(), revision: { increment: 1 } } });
      if (changed.count !== 1) throw new BusinessError("This sprint review changed. Reload before finalizing.", 409);
      await db.planningMeeting.update({ where: { id: meeting.id }, data: { status: "finalized" } }); auditAction = "finalized";
    } else {
      next = { ...reviewSnapshot(review, meeting), status: "draft", revision: review.revision + 1 };
      await writeRevision(review, meeting, next, input.reason, actorUserId);
      const changed = await db.sprintReview.updateMany({ where: { id, revision: review.revision }, data: { status: "draft", revision: { increment: 1 } } });
      if (changed.count !== 1) throw new BusinessError("This sprint review changed. Reload before reopening.", 409);
      await db.planningMeeting.update({ where: { id: meeting.id }, data: { status: "draft" } }); auditAction = "reopened";
    }
    await auditInitiative(review.initiativeId, `sprint_review.${auditAction}`, { reviewId: id, reason: input.reason, fromRevision: review.revision, toRevision: review.revision + 1 });
    return loadReviewDetails(id);
  });
}

async function useSuggestion(suggestionId: string, reviewId: string, kind: string, actorUserId: string) {
  const suggestion = await db.sprintReviewAiSuggestion.findFirst({ where: { id: suggestionId, reviewId, kind, status: "proposed" } });
  if (!suggestion) throw new BusinessError("The AI suggestion is no longer available.", 409);
  await db.sprintReviewAiSuggestion.update({ where: { id: suggestionId }, data: { status: "used", actedByUserId: actorUserId, actedAt: new Date() } });
}

export async function dismissReviewSuggestion(id: string, actorUserId: string) {
  return withTransaction(async () => {
    const suggestion = await db.sprintReviewAiSuggestion.findUnique({ where: { id } });
    if (!suggestion) throw new BusinessError("Sprint-review suggestion not found.", 404);
    if (suggestion.status !== "proposed") throw new BusinessError("This suggestion has already been acted on.", 409);
    const review = await db.sprintReview.findUniqueOrThrow({ where: { id: suggestion.reviewId } });
    const saved = await db.sprintReviewAiSuggestion.update({ where: { id }, data: { status: "dismissed", actedByUserId: actorUserId, actedAt: new Date() } });
    await auditInitiative(review.initiativeId, "sprint_review.ai_suggestion_dismissed", { reviewId: review.id, suggestionId: id }); return saved;
  });
}

export async function loadReviewDetails(id: string) {
  const review = await db.sprintReview.findUnique({ where: { id } }); if (!review) return null;
  const [meeting, participants, decisions, actions, revisions, suggestions] = await Promise.all([
    db.planningMeeting.findUniqueOrThrow({ where: { id: review.meetingId } }),
    db.planningMeetingParticipant.findMany({ where: { meetingId: review.meetingId }, orderBy: { createdAt: "asc" } }),
    db.planningMeetingDecision.findMany({ where: { meetingId: review.meetingId }, orderBy: { decidedAt: "asc" } }),
    db.planningMeetingAction.findMany({ where: { meetingId: review.meetingId }, orderBy: { createdAt: "asc" } }),
    db.sprintReviewRevision.findMany({ where: { reviewId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.sprintReviewAiSuggestion.findMany({ where: { reviewId: id }, orderBy: [{ createdAt: "desc" }, { ordinal: "asc" }], take: 30 }),
  ]);
  return { review, meeting, participants, decisions, actions, revisions, suggestions };
}
