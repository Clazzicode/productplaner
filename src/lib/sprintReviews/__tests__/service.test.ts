import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  review: {} as Record<string, unknown>, meeting: {} as Record<string, unknown>, participants: [] as Record<string, unknown>[], revisions: [] as Record<string, unknown>[], demos: [] as Record<string, unknown>[], audits: [] as string[], auditFails: false,
}));

vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => { const before = structuredClone(state); try { return await fn(); } catch (error) { Object.assign(state, before); throw error; } },
  db: {
    initiative: { findUnique: async () => ({ organizationId: "org-a", projectId: "project-a" }) },
    sprintPlan: { findFirst: async () => ({ goal: "Deliver value", capacityPoints: 20, plannedPoints: 3, sprint: { id: "sprint-a", sprintNumber: 1, startDate: new Date("2026-01-01"), endDate: new Date("2026-01-14"), status: "active" }, items: [{ storyId: "story-a", bugId: null, estimatePoints: 3, story: { id: "story-a", title: "Saved planning" }, bug: null }] }) },
    demoItem: { findMany: async () => state.demos }, planningBlocker: { findMany: async () => [] }, inSprintClarification: { findMany: async () => [] },
    sprintReview: {
      findUnique: async () => state.review.id ? state.review : null,
      findUniqueOrThrow: async () => state.review,
      updateMany: async ({ where, data }: { where: { revision: number }; data: Record<string, unknown> }) => { if (state.review.revision !== where.revision) return { count: 0 }; const revision = Number(state.review.revision) + 1; state.review = { ...state.review, ...data, revision }; return { count: 1 }; },
    },
    planningMeeting: { findUnique: async () => state.meeting, findUniqueOrThrow: async () => state.meeting, update: async ({ data }: { data: Record<string, unknown> }) => { state.meeting = { ...state.meeting, ...data }; return state.meeting; } },
    stakeholderContact: { findFirst: async () => null, findMany: async () => [{ id: "person-a", displayName: "Avery", email: "avery@example.com" }] },
    planningMeetingParticipant: { deleteMany: async () => { state.participants = []; }, createMany: async ({ data }: { data: Record<string, unknown>[] }) => { state.participants = data.map((item, i) => ({ id: `participant-${i}`, createdAt: new Date(), role: "participant", ...item })); }, findMany: async () => state.participants },
    planningMeetingDecision: { findMany: async () => [], create: vi.fn() }, planningMeetingAction: { findMany: async () => [], create: vi.fn() },
    sprintReviewRevision: { create: async ({ data }: { data: Record<string, unknown> }) => { state.revisions.push(data); return data; }, findMany: async () => state.revisions },
    sprintReviewAiSuggestion: { findMany: async () => [], findFirst: async () => null, update: vi.fn() },
  },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: async (_id: string, action: string) => { if (state.auditFails) throw new Error("audit unavailable"); state.audits.push(action); } }));

import { applyReviewCommand, buildReviewProjection } from "../service";

beforeEach(() => {
  state.review = { id: "review-a", organizationId: "org-a", projectId: "project-a", initiativeId: "init-a", sprintId: "sprint-a", meetingId: "meeting-a", status: "draft", draftSnapshot: {}, finalSnapshot: null, missingWarnings: [], summary: "", overrideReason: "", revision: 1, createdByUserId: "user-a", finalizedAt: null, finalizedByUserId: null, createdAt: new Date(), updatedAt: new Date() };
  state.meeting = { id: "meeting-a", title: "Sprint 1 Review", scheduledAt: null, facilitatorStakeholderId: null, facilitatorNameSnapshot: "", purpose: "Review value", notes: "", transcriptText: "", transcriptDocumentId: null, outcome: "", status: "draft" };
  state.participants = []; state.revisions = []; state.audits = []; state.auditFails = false;
  state.demos = [{ id: "demo-a", title: "Show planning", status: "ready", purpose: "Explain value", presenterNameSnapshot: "Avery", completedWork: "Planning persists", notes: "", plannedOrder: 0, blockingReason: "", carryoverReason: "", story: { title: "Saved planning" }, bug: null, capability: { name: "Planning" } }];
});

describe("sprint review service", () => {
  it("builds the agenda from authoritative sprint and demo data", async () => {
    const result = await buildReviewProjection("init-a", "sprint-a");
    expect((result.snapshot.readyDemos as unknown[])).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    state.demos[0].status = "preparing";
    expect((await buildReviewProjection("init-a", "sprint-a")).warnings[0].severity).toBe("blocking");
  });

  it("rejects stale edits and rolls back the whole update when audit persistence fails", async () => {
    await expect(applyReviewCommand("review-a", { action: "update", expectedRevision: 2, title: "Sprint 1 Review", scheduledAt: null, facilitatorStakeholderId: null, participantIds: [], purpose: "Review", notes: "", transcriptText: "", transcriptDocumentId: null, outcome: "", summary: "", reason: "Stale edit" }, "user-a", false)).rejects.toThrow("changed");
    state.auditFails = true;
    await expect(applyReviewCommand("review-a", { action: "update", expectedRevision: 1, title: "Changed Review", scheduledAt: null, facilitatorStakeholderId: null, participantIds: ["person-a"], purpose: "Review", notes: "Notes", transcriptText: "", transcriptDocumentId: null, outcome: "Done", summary: "Summary", reason: "Prepare the review" }, "user-a", false)).rejects.toThrow("audit unavailable");
    expect(state.review.revision).toBe(1); expect(state.meeting.title).toBe("Sprint 1 Review"); expect(state.participants).toEqual([]); expect(state.revisions).toEqual([]);
  });

  it("requires owner/admin approval and keeps the final presentation snapshot unchanged after source edits", async () => {
    await applyReviewCommand("review-a", { action: "update", expectedRevision: 1, title: "Sprint 1 Review", scheduledAt: null, facilitatorStakeholderId: null, participantIds: ["person-a"], purpose: "Review", notes: "", transcriptText: "", transcriptDocumentId: null, outcome: "Accepted", summary: "Delivered planned value", reason: "Prepare the review" }, "user-a", false);
    await expect(applyReviewCommand("review-a", { action: "finalize", expectedRevision: 2, overrideReason: "", reason: "PO approved review" }, "member-a", false)).rejects.toThrow("owner or administrator");
    await applyReviewCommand("review-a", { action: "finalize", expectedRevision: 2, overrideReason: "", reason: "PO approved review" }, "admin-a", true);
    const locked = structuredClone(state.review.finalSnapshot);
    state.demos[0].completedWork = "Later source edit";
    expect(state.review.finalSnapshot).toEqual(locked);
    await applyReviewCommand("review-a", { action: "reopen", expectedRevision: 3, reason: "New review revision requested" }, "admin-a", true);
    expect(state.review.status).toBe("draft"); expect(state.review.finalSnapshot).toEqual(locked);
    expect(state.audits).toEqual(expect.arrayContaining(["sprint_review.updated", "sprint_review.finalized", "sprint_review.reopened"]));
  });
});
