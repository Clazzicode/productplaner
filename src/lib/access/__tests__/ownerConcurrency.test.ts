import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ grants: new Map<string, { id: string; initiativeId: string; permission: string; userId: string; initiative: { organizationId: string }; user: { memberType: string } }>(), queue: Promise.resolve() as Promise<unknown> }));
// Serialize this test double like a successful serializable transaction. The
// separate db transaction test verifies the PostgreSQL isolation setting.
vi.mock("@/lib/db", () => ({
  withTransaction: (fn: () => Promise<unknown>) => {
    const next = state.queue.then(fn); state.queue = next.catch(() => undefined); return next;
  },
  db: { initiativeAccess: {
    findUnique: async ({ where }: { where: { id: string } }) => state.grants.get(where.id),
    count: async ({ where }: { where: { id: { not: string } } }) => [...state.grants.values()].filter(g => g.id !== where.id.not && g.permission === "owner").length,
    delete: async ({ where }: { where: { id: string } }) => state.grants.delete(where.id),
    update: async ({ where, data }: { where: { id: string }; data: { permission: string } }) => { state.grants.get(where.id)!.permission = data.permission; },
  } },
}));
vi.mock("@/lib/audit", () => ({ auditInitiative: vi.fn() }));
import { revokeGrant, changeGrantPermission } from "../mutations";
beforeEach(() => {
  state.queue = Promise.resolve(); state.grants = new Map(["a", "b"].map(id => [id, { id, initiativeId: "init", permission: "owner", userId: id, initiative: { organizationId: "org" }, user: { memberType: "internal" } }]));
});
describe("initiative owner preservation", () => {
  it("prevents two concurrent removals from removing both owners", async () => {
    const results = await Promise.all([revokeGrant("a", "org"), revokeGrant("b", "org")]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect([...state.grants.values()].filter(g => g.permission === "owner")).toHaveLength(1);
  });
  it("preserves an owner when a removal races with a downgrade", async () => {
    const results = await Promise.all([revokeGrant("a", "org"), changeGrantPermission("b", "org", "edit")]);
    expect(results.filter(r => r.ok)).toHaveLength(1);
    expect([...state.grants.values()].filter(g => g.permission === "owner")).toHaveLength(1);
  });
});
