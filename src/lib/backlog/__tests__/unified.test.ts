import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRequest } from "@/lib/requests/model";

const state = vi.hoisted(() => ({
  feature: {
    id: "feature-a", backlogKey: "PO-04", name: "Feature management", description: "Maintain features",
    backlogLane: "now", backlogStatus: "planned", backlogRevision: 2, order: 0, ownerUserId: "owner-a",
    isMvp: true, businessValue: "high", riskLevel: "medium",
    owner: { id: "owner-a", name: "Avery", email: "avery@example.com" },
    dependsOnEdges: [] as { toCapabilityId: string }[],
    sourceRequests: [] as { id: string; data: unknown }[],
  },
  request: null as null | Record<string, unknown>,
  story: {
    id: "story-a", externalRef: null, title: "Review a feature", body: "As a PO, I want a review.",
    sourceType: "manual", readinessStatus: "needs_refinement", archivedAt: null as Date | null,
    backlogRevision: 1, order: 0, sourceCapability: null as null | Record<string, unknown>,
  },
  events: [] as string[],
}));

vi.mock("../service", () => ({ listFeatures: async () => [state.feature] }));

vi.mock("@/lib/db", () => ({
  db: {
    planningRequest: {
      findMany: async () => state.request ? [state.request] : [],
      findFirst: async ({ where }: { where: { id: string } }) => state.request?.id === where.id ? state.request : null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const revision = Number(state.request!.revision) + 1;
        state.request = { ...state.request!, ...data, revision, archivedAt: data.archivedAt ?? state.request!.archivedAt };
        return state.request;
      },
    },
    artifactLayer: {
      findMany: async () => [state.story],
      findFirst: async ({ where }: { where: { id: string } }) => state.story.id === where.id ? state.story : null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.story = { ...state.story, ...data, backlogRevision: state.story.backlogRevision + 1 };
        return state.story;
      },
    },
    prototype: { findUnique: async () => ({ approvedAt: null }) },
    initiative: { findUnique: async () => ({ organizationId: "org-a" }), findUniqueOrThrow: async () => ({ organizationId: "org-a", projectId: "project-a" }) },
    capability: {
      findFirst: async ({ where }: { where: { id: string } }) => state.feature.id === where.id ? state.feature : null,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.feature = { ...state.feature, ...data, backlogRevision: state.feature.backlogRevision + 1 } as typeof state.feature;
        return state.feature;
      },
    },
  },
}));

vi.mock("@/lib/audit", () => ({ auditInitiative: async (_id: string, action: string) => { state.events.push(action); } }));
vi.mock("@/lib/generation/mutation", () => ({
  withPlanningMutation: async (_id: string, _action: string, fn: () => Promise<unknown>) => {
    const before = structuredClone({ feature: state.feature, request: state.request, story: state.story, events: state.events });
    try { return await fn(); } catch (error) {
      state.feature = before.feature; state.request = before.request; state.story = before.story; state.events = before.events;
      throw error;
    }
  },
}));

import { bulkTriageBacklog, listUnifiedBacklog } from "../unified";

beforeEach(() => {
  const request = { ...emptyRequest(), title: "Critical map defect", kind: "bug" as const, source: "manual" as const,
    problem: "Map fails", requestedChange: "Repair map", outcome: "Map works",
    bug: { ...emptyRequest().bug, affectedArea: "Map", observedBehavior: "Fails", expectedBehavior: "Works" },
    priority: { ...emptyRequest().priority, businessValue: 5, urgency: 5, decision: "now" as const, reason: "Critical customer impact" } };
  state.request = { id: "request-a", initiativeId: "init-a", data: request, revision: 1, capabilityId: null, archivedAt: null, updatedAt: new Date() };
  state.feature.backlogLane = "now"; state.feature.backlogStatus = "planned"; state.feature.backlogRevision = 2;
  state.feature.sourceRequests = [];
  state.story = { ...state.story, archivedAt: null, backlogRevision: 1, sourceCapability: state.feature };
  state.events = [];
});

describe("unified backlog", () => {
  it("uses one authoritative record for each request, feature and story and orders by priority", async () => {
    const items = await listUnifiedBacklog("init-a");
    expect(items.map(item => `${item.recordType}:${item.id}`)).toEqual(["request:request-a", "feature:feature-a", "story:story-a"]);
    expect(new Set(items.map(item => `${item.recordType}:${item.id}`)).size).toBe(3);
    expect(items[0]).toMatchObject({ workType: "bug", priorityScore: 75, roadmapLane: "now" });
    expect(items[2]).toMatchObject({ workType: "story", sourceFeatureId: "feature-a", owner: { id: "owner-a" } });
  });

  it("archives mixed backlog items atomically without deleting their source records", async () => {
    const items = await bulkTriageBacklog("init-a", {
      action: "archive", reason: "Remove superseded work from active triage",
      items: [
        { id: "feature-a", type: "feature", revision: 2 },
        { id: "request-a", type: "request", revision: 1 },
        { id: "story-a", type: "story", revision: 1 },
      ],
    });
    expect(state.feature.backlogStatus).toBe("archived");
    expect(state.request?.archivedAt).toBeInstanceOf(Date);
    expect(state.story.archivedAt).toBeInstanceOf(Date);
    expect(items.filter(item => item.archived)).toHaveLength(3);
    expect(state.events).toContain("backlog.bulk_triaged");
  });

  it("rejects stale bulk edits", async () => {
    await expect(bulkTriageBacklog("init-a", {
      action: "archive", reason: "Archive old work",
      items: [{ id: "feature-a", type: "feature", revision: 1 }],
    })).rejects.toThrow("changed");
    expect(state.feature.backlogStatus).toBe("planned");
  });

  it("rolls back earlier updates when a mixed roadmap placement contains a story", async () => {
    await expect(bulkTriageBacklog("init-a", {
      action: "set_lane", lane: "later", reason: "Sequence after core work",
      items: [
        { id: "feature-a", type: "feature", revision: 2 },
        { id: "story-a", type: "story", revision: 1 },
      ],
    })).rejects.toThrow("inherit roadmap placement");
    expect(state.feature.backlogLane).toBe("now");
    expect(state.feature.backlogRevision).toBe(2);
  });

  it("updates request placement without creating a duplicate backlog record", async () => {
    const items = await bulkTriageBacklog("init-a", {
      action: "set_lane", lane: "next", reason: "Schedule after the current critical work",
      items: [{ id: "request-a", type: "request", revision: 1 }],
    });
    expect(items.filter(item => item.id === "request-a")).toHaveLength(1);
    expect(items.find(item => item.id === "request-a")).toMatchObject({ roadmapLane: "next", revision: 2 });
  });
});
