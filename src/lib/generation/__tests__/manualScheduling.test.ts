import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ approved: false, duplicate: false, storyUnavailable: false, claimCount: 1,
  writes: [] as string[], auditFails: false }));
vi.mock("@/lib/db", () => ({
  withTransaction: async (fn: () => Promise<unknown>) => {
    const before = [...state.writes];
    try { return await fn(); } catch (e) { state.writes = before; throw e; }
  },
  db: {
    initiative: {
      findUniqueOrThrow: async () => ({ methodology: "waterfall", prototype: { approvedAt: state.approved ? new Date() : null } }),
      update: async () => { state.writes.push("cadence"); },
    },
    prototype: { findUnique: async () => ({ id: "proto", releases: state.duplicate ? [{ phaseNumber: 1, origin: "manual" }] : [] }), update: async () => { state.writes.push("approval-cleared"); } },
    release: {
      findFirst: async () => ({ id: "release", prototypeId: "proto", phaseNumber: 1, origin: "manual" }),
      aggregate: async () => ({ _max: { order: 1 } }), deleteMany: async () => { state.writes.push("auto-release-cleanup"); },
      create: async () => { state.writes.push("release"); return { id: "new-release" }; },
    },
    sprint: {
      aggregate: async () => ({ _max: { sprintNumber: 1 } }), deleteMany: async () => { state.writes.push("auto-sprint-cleanup"); },
      create: async () => { state.writes.push("sprint"); return { id: "new-sprint" }; },
    },
    artifactLayer: {
      findMany: async ({ where }: { where: { type: string } }) => where.type === "roadmap_phase"
        ? [{ contentJson: '{"phaseNumber":1}' }]
        : state.storyUnavailable ? [] : [{ id: "story", parent: { parent: { parent: { contentJson: '{"phaseNumber":1}' } } } }],
      updateMany: async () => { state.writes.push("story-assigned"); return { count: state.claimCount }; },
    },
  },
}));
vi.mock("@/lib/generation/versioning", () => ({ archiveWorkingVersion: async () => { state.writes.push("checkpoint"); } }));
vi.mock("@/lib/audit", () => ({ auditInitiative: async () => {
  if (state.auditFails) throw new Error("Audit failed"); state.writes.push("audit");
} }));
import { createManualRelease, createManualSprint } from "../manualScheduling";

const release = { cadence: "monthly" as const, customCadence: "", targetDate: new Date("2026-11-01") };
const sprint = { startDate: new Date("2026-10-05"), endDate: new Date("2026-10-16"), capacityPoints: 10, storyIds: ["story"] };
beforeEach(() => Object.assign(state, { approved: false, duplicate: false, storyUnavailable: false, claimCount: 1, writes: [], auditFails: false }));
describe("manual scheduling integrity", () => {
  it("rejects manual release creation on an approved Waterfall plan", async () => {
    state.approved = true;
    await expect(createManualRelease("init", release)).rejects.toThrow("Waterfall");
    expect(state.writes).toEqual([]);
  });
  it("rejects manual sprint creation on an approved Waterfall plan", async () => {
    state.approved = true;
    await expect(createManualSprint("init", "release", sprint)).rejects.toThrow("Waterfall");
    expect(state.writes).toEqual([]);
  });
  it("checks duplicate releases within the mutation", async () => {
    state.duplicate = true;
    await expect(createManualRelease("init", release)).rejects.toThrow("already has");
    expect(state.writes).toEqual([]);
  });
  it("rejects invalid selections rather than silently dropping stories", async () => {
    state.storyUnavailable = true;
    await expect(createManualSprint("init", "release", sprint)).rejects.toThrow("unavailable");
    expect(state.writes).toEqual([]);
  });
  it("rolls back the sprint and checkpoint when another operation claims the story", async () => {
    state.claimCount = 0;
    await expect(createManualSprint("init", "release", sprint)).rejects.toThrow("assigned elsewhere");
    expect(state.writes).toEqual([]);
  });
  it("rolls back when audit persistence fails", async () => {
    state.auditFails = true;
    await expect(createManualRelease("init", release)).rejects.toThrow("Audit failed");
    expect(state.writes).toEqual([]);
  });
  it("commits assignment, history and audit as one business operation", async () => {
    expect((await createManualSprint("init", "release", sprint)).assignedStoryCount).toBe(1);
    expect(state.writes).toEqual(["checkpoint", "sprint", "story-assigned", "approval-cleared", "audit"]);
  });
});
