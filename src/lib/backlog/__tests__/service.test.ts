import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureInput } from "../model";

const state = vi.hoisted(() => ({
  features: [] as Record<string, unknown>[],
  dependencies: [] as { fromCapabilityId: string; toCapabilityId: string }[],
  events: [] as { action: string; metadata: Record<string, unknown> }[],
  auditFails: false,
}));

function enriched(row: Record<string, unknown>) {
  return {
    ...row,
    owner: row.ownerUserId ? { id: row.ownerUserId, name: "Avery", email: "avery@example.com" } : null,
    dependsOnEdges: state.dependencies.filter(edge => edge.fromCapabilityId === row.id),
    sourceRequests: row.sourceRequests ?? [],
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    initiative: { findUnique: async () => ({ organizationId: "org-a" }) },
    prototype: { findUnique: async () => ({ approvedAt: null }) },
    user: {
      findFirst: async ({ where }: { where: { id: string } }) => where.id === "owner-a" ? { id: "owner-a" } : null,
      findMany: async () => [{ id: "owner-a", name: "Avery", email: "avery@example.com" }],
    },
    intakeAnswerSet: { findUnique: async () => ({ id: "intake-a" }) },
    capability: {
      aggregate: async () => ({ _max: { order: state.features.length - 1 } }),
      findFirst: async ({ where }: { where: { id: string } }) => {
        const row = state.features.find(item => item.id === where.id);
        return row ? enriched(row) : null;
      },
      findMany: async ({ where }: { where?: { id?: { in: string[] } } }) => {
        const rows = where?.id?.in ? state.features.filter(item => where.id!.in.includes(String(item.id))) : state.features;
        return rows.map(enriched);
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => enriched(state.features.find(item => item.id === where.id)!),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `feature-${state.features.length + 1}`, backlogKey: null, backlogRevision: 1, ...data };
        state.features.push(row); return row;
      },
      update: async ({ where, data }: { where: { id: string; backlogRevision?: number }; data: Record<string, unknown> }) => {
        const index = state.features.findIndex(item => item.id === where.id);
        const current = state.features[index];
        if (!current || (where.backlogRevision && current.backlogRevision !== where.backlogRevision)) throw new Error("stale");
        const revision = data.backlogRevision && typeof data.backlogRevision === "object"
          ? Number(current.backlogRevision) + 1 : current.backlogRevision;
        const row = { ...current, ...data, backlogRevision: revision };
        state.features[index] = row; return row;
      },
    },
    capabilityDependency: {
      deleteMany: async ({ where }: { where: { fromCapabilityId: string } }) => {
        state.dependencies = state.dependencies.filter(edge => edge.fromCapabilityId !== where.fromCapabilityId);
      },
      createMany: async ({ data }: { data: { fromCapabilityId: string; toCapabilityId: string }[] }) => { state.dependencies.push(...data); },
    },
    auditEvent: { findMany: async () => [] },
  },
}));

vi.mock("@/lib/audit", () => ({
  auditInitiative: async (_initiativeId: string, action: string, metadata: Record<string, unknown>) => {
    if (state.auditFails) throw new Error("audit unavailable");
    state.events.push({ action, metadata });
  },
}));

vi.mock("@/lib/generation/mutation", () => ({
  withPlanningMutation: async (_id: string, _action: string, fn: () => Promise<unknown>) => {
    const beforeFeatures = structuredClone(state.features);
    const beforeDependencies = structuredClone(state.dependencies);
    try { return await fn(); }
    catch (error) { state.features = beforeFeatures; state.dependencies = beforeDependencies; throw error; }
  },
}));

import { saveFeature } from "../service";

const input = (overrides: Partial<FeatureInput> = {}): FeatureInput => ({
  name: "Request intake", description: "Capture an approved product need.", backlogLane: "now",
  backlogStatus: "planned", ownerUserId: "owner-a", isMvp: true, businessValue: "high",
  riskLevel: "medium", dependsOnIds: [], ...overrides,
});

beforeEach(() => {
  state.features = []; state.dependencies = []; state.events = []; state.auditFails = false;
});

describe("Feature Management", () => {
  it("creates and then maintains the complete feature in one workflow", async () => {
    const dependency = await saveFeature("init-a", input({ name: "Authentication", ownerUserId: null }));
    const created = await saveFeature("init-a", input({ dependsOnIds: [dependency.id] }));
    expect(created).toMatchObject({
      name: "Request intake", ownerUserId: "owner-a", isMvp: true, businessValue: "high", riskLevel: "medium",
    });
    expect(state.dependencies).toEqual([{ fromCapabilityId: created.id, toCapabilityId: dependency.id }]);

    const updated = await saveFeature("init-a", input({
      name: "Request intake and triage", backlogStatus: "ready_for_review", businessValue: "critical",
      riskLevel: "high", dependsOnIds: [dependency.id],
    }), { id: created.id, revision: 1 }, { reason: "Expanded PO triage scope" });
    expect(updated.backlogRevision).toBe(2);
    expect(state.events.at(-1)).toMatchObject({ action: "backlog.feature_updated" });
    expect(state.events.at(-1)?.metadata).toMatchObject({ reason: "Expanded PO triage scope", revision: 2 });
  });

  it("archives without deleting and records the reason", async () => {
    const created = await saveFeature("init-a", input());
    const archived = await saveFeature("init-a", input({ backlogStatus: "archived" }),
      { id: created.id, revision: 1 }, { reason: "Superseded by a consolidated feature" });
    expect(archived.backlogStatus).toBe("archived");
    expect(state.features).toHaveLength(1);
    expect(state.events.at(-1)).toMatchObject({ action: "backlog.feature_archived" });
  });

  it("rejects a foreign owner and a dependency outside the initiative", async () => {
    await expect(saveFeature("init-a", input({ ownerUserId: "owner-b" }))).rejects.toThrow("active member");
    await expect(saveFeature("init-a", input({ dependsOnIds: ["foreign-feature"] }))).rejects.toThrow("do not belong");
  });

  it("requires a reason and rejects stale edits", async () => {
    const created = await saveFeature("init-a", input());
    await expect(saveFeature("init-a", input({ name: "Changed" }), { id: created.id, revision: 1 })).rejects.toThrow("Explain why");
    await saveFeature("init-a", input({ name: "Changed" }), { id: created.id, revision: 1 }, { reason: "Clarified scope" });
    await expect(saveFeature("init-a", input(), { id: created.id, revision: 1 }, { reason: "Stale overwrite" })).rejects.toThrow("changed");
  });

  it("rolls back feature and dependency changes when auditing fails", async () => {
    const dependency = await saveFeature("init-a", input({ name: "Authentication", ownerUserId: null }));
    state.auditFails = true;
    await expect(saveFeature("init-a", input({ dependsOnIds: [dependency.id] }))).rejects.toThrow("audit unavailable");
    expect(state.features).toHaveLength(1);
    expect(state.dependencies).toEqual([]);
  });
});
