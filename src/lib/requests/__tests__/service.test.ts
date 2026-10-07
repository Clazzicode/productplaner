import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], sources: [] as Record<string, unknown>[], auditFails: false, events: [] as string[], features: [] as Record<string, unknown>[], planApproved: false }));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = structuredClone(state.rows); const features = structuredClone(state.features); const sources = structuredClone(state.sources);
    try { return await fn(); } catch (e) { state.rows = before; state.features = features; state.sources = sources; throw e; }
  },
  db: {
    initiative: { findUnique: async () => ({ organizationId: "org-a", projectId: "project-a" }) },
    requestSourceRecord: { create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `source-${state.sources.length + 1}`, ...data }; state.sources.push(row); return row; } },
    prototype: { findUnique: async () => ({ approvedAt: state.planApproved ? new Date() : null }) },
    intakeAnswerSet: { findUnique: async () => ({ id: "intake-a" }) },
    capability: { aggregate: async () => ({ _max: { order: 0 } }), create: async ({data}: {data: Record<string, unknown>}) => { const row = {id: "feature-a", ...data}; state.features.push(row); return row; } },
    planningRequest: {
    findFirst: async ({ where }: { where: { id?: string | { not: string }; initiativeId: string; dedupeKey?: string } }) => state.rows.find(r => r.initiativeId === where.initiativeId &&
      (typeof where.id === "string" ? r.id === where.id : typeof where.id === "object" ? r.id !== where.id.not : true) &&
      (where.dedupeKey ? r.dedupeKey === where.dedupeKey : true)) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: "request-1", ...data, revision: 1, capabilityId: data.capabilityId ?? null, sourceRecordId: data.sourceRecordId ?? null, updatedAt: new Date() }; state.rows.push(row); return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: { data: unknown } }) => {
      const row = state.rows.find(r => r.id === where.id)!; Object.assign(row, data, { revision: Number(row.revision) + 1 }); return row;
    },
  } },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: async (_id: string, action: string) => {
  if (state.auditFails) throw new Error("audit unavailable"); state.events.push(action);
} }));
vi.mock("@/lib/generation/mutation", () => ({ withPlanningMutation: async (_id: string, _action: string, fn: () => Promise<unknown>) => {
  const { withTransaction } = await import("@/lib/db"); return withTransaction(fn);
} }));
import { saveRequest, promoteRequest } from "../service";
import { emptyRequest } from "../model";
const input = () => ({ ...emptyRequest(), title: "Saved maps", requestor: "PO",
  userAffected: "Returning map users", businessValueNarrative: "Reduces repeated setup time",
  businessRules: "Views belong to their creator", inScope: "Save and restore a view", outOfScope: "Sharing views",
  assumptions: "Users are signed in", dependencies: "Authentication", risks: "Stale saved filters",
  stakeholders: "Product Owner and map users", supportingMaterials: "Customer notes", definitionOfSuccess: "A saved view restores in one click",
});
beforeEach(() => { state.rows = []; state.sources = []; state.auditFails = false; state.events = []; state.features = []; state.planApproved = false; });
describe("saved PO workflow", () => {
  it("persists a request and its business audit together", async () => {
    const first = await saveRequest("init-a", input());
    expect(first.revision).toBe(1); expect(state.events).toEqual(["request.created"]);
    const second = await saveRequest("init-a", { ...input(), problem: "Users lose filters" }, { id: first.id, revision: 1 });
    expect(second.revision).toBe(2); expect(state.events).toEqual(["request.created", "request.updated"]);
  });
  it("does not find a request through a foreign initiative", async () => {
    await saveRequest("init-b", input());
    await expect(saveRequest("init-a", input(), { id: "request-1", revision: 1 })).rejects.toThrow("not found");
  });
  it("rejects a duplicate request using normalized planning content", async () => {
    await saveRequest("init-a", input());
    await expect(saveRequest("init-a", { ...input(), title: "  SAVED   MAPS " })).rejects.toThrow("matching request already exists");
    expect(state.rows).toHaveLength(1);
  });
  it("preserves meeting notes as immutable source evidence", async () => {
    const meeting = { ...input(), source: "meeting" as const, sourceReference: "Roadmap review · Oct 7", meetingNotes: "Tiana requested a release cadence view." };
    const saved = await saveRequest("init-a", meeting, undefined, { actorUserId: "user-a" });
    expect(saved.sourceRecordId).toBe("source-1");
    expect(state.sources[0]).toMatchObject({ type: "meeting_note", rawContent: meeting.meetingNotes, createdByUserId: "user-a" });
    await expect(saveRequest("init-a", { ...meeting, meetingNotes: "Different notes" }, { id: saved.id, revision: saved.revision }, { actorUserId: "user-a" }))
      .rejects.toThrow("original source is immutable");
  });
  it("rolls back meeting evidence when request auditing fails", async () => {
    state.auditFails = true;
    const meeting = { ...input(), source: "meeting" as const, sourceReference: "PO review", meetingNotes: "Keep this source only when the request commits." };
    await expect(saveRequest("init-a", meeting, undefined, { actorUserId: "user-a" })).rejects.toThrow("audit unavailable");
    expect(state.rows).toEqual([]); expect(state.sources).toEqual([]);
  });
  it("creates a traceable bug from a reviewed spreadsheet row", async () => {
    const bug = { ...input(), title: "Map crashes", kind: "bug" as const, source: "spreadsheet" as const,
      sourceReference: "bugs.xlsx · Backlog · row 4", bug: { ...input().bug, severity: "critical" as const,
        affectedArea: "Map", observedBehavior: "The app closes", expectedBehavior: "The map remains open" },
      priority: { ...input().priority, bugSeverity: "critical" as const } };
    const saved = await saveRequest("init-a", bug, undefined, { actorUserId: "user-a", source: {
      type: "spreadsheet_row", label: "bugs.xlsx", locator: "Backlog row 4", rawContent: '{"title":"Map crashes"}', documentId: "doc-a",
    } });
    expect(saved.kind).toBe("bug");
    expect(state.sources[0]).toMatchObject({ type: "spreadsheet_row", documentId: "doc-a", locator: "Backlog row 4" });
  });
  it("links an approved document finding to its created request and existing feature", async () => {
    const saved = await saveRequest("init-a", { ...input(), source: "document", sourceReference: "brief.pdf · page 2",
      documentUse: "create_backlog_items" }, undefined, { actorUserId: "user-a", linkedCapabilityId: "feature-a", source: {
      type: "document_finding", label: "brief.pdf", locator: "page 2", rawContent: "Users need saved views.", documentId: "doc-a", contextItemId: "context-a",
    } });
    expect(saved.capabilityId).toBe("feature-a");
    expect(state.sources[0]).toMatchObject({ type: "document_finding", contextItemId: "context-a", rawContent: "Users need saved views." });
  });
  it("rejects stale writes instead of losing a colleague's edits", async () => {
    await saveRequest("init-a", input());
    await saveRequest("init-a", input(), { id: "request-1", revision: 1 });
    await expect(saveRequest("init-a", input(), { id: "request-1", revision: 1 })).rejects.toThrow("changed");
  });
  it("rolls back the request when audit persistence fails", async () => {
    state.auditFails = true;
    await expect(saveRequest("init-a", input())).rejects.toThrow("audit unavailable");
    expect(state.rows).toEqual([]);
  });
  it("requires reopening an approved request before changing its meaning", async () => {
    const approved = { ...input(), problem: "Lost filters", requestedChange: "Save view", outcome: "Restore in one click", status: "approved" as const,
      priority: { ...input().priority, decision: "now" as const, reason: "Repeated customer need" } };
    await saveRequest("init-a", approved);
    await expect(saveRequest("init-a", { ...approved, outcome: "Something different" }, { id: "request-1", revision: 1 })).rejects.toThrow("Reopen");
    expect((await saveRequest("init-a", { ...approved, status: "clarifying" }, { id: "request-1", revision: 1 })).status).toBe("clarifying");
  });
  it("creates one linked feature from an approved request and rejects a duplicate", async () => {
    const data = { ...input(), problem: "Lost filters", requestedChange: "Save view", outcome: "Restore quickly", status: "approved" as const,
      priority: { ...input().priority, decision: "now" as const, reason: "Customer need" } };
    await saveRequest("init-a", data);
    const linked = await promoteRequest("init-a", "request-1", 1);
    expect(linked.capabilityId).toBe("feature-a");
    expect(state.features).toHaveLength(1);
    await expect(promoteRequest("init-a", "request-1", 2)).rejects.toThrow("already has");
  });
  it("rejects promotion of an unapproved request", async () => {
    await saveRequest("init-a", input());
    await expect(promoteRequest("init-a", "request-1", 1)).rejects.toThrow("Approve this request");
    expect(state.features).toEqual([]);
  });
  it("does not add a feature to an approved plan", async () => {
    const data = { ...input(), problem: "Lost filters", requestedChange: "Save view", outcome: "Restore quickly", status: "approved" as const,
      priority: { ...input().priority, decision: "now" as const, reason: "Customer need" } };
    await saveRequest("init-a", data); state.planApproved = true;
    await expect(promoteRequest("init-a", "request-1", 1)).rejects.toThrow("Reopen the approved plan");
    expect(state.features).toEqual([]);
  });
  it("rolls back feature creation and the link when audit persistence fails", async () => {
    const data = { ...input(), problem: "Lost filters", requestedChange: "Save view", outcome: "Restore quickly", status: "approved" as const,
      priority: { ...input().priority, decision: "now" as const, reason: "Customer need" } };
    await saveRequest("init-a", data); state.auditFails = true;
    await expect(promoteRequest("init-a", "request-1", 1)).rejects.toThrow("audit unavailable");
    expect(state.features).toEqual([]); expect(state.rows[0].capabilityId).toBeNull();
  });

});
