import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ committed: [] as string[], opens: 0 }));
vi.mock("@prisma/client", () => ({
  Prisma: { TransactionIsolationLevel: { Serializable: "Serializable" } },
  PrismaClient: class {
    $extends() { return { prototype: { create: () => { throw new Error("Escaped transaction"); } } }; }
    async $transaction(fn: (tx: unknown) => Promise<unknown>) {
      state.opens++;
      const pending: string[] = [];
      const tx = { $executeRaw: async () => 1, prototype: { create: async ({ data }: { data: { id: string } }) => { pending.push(data.id); return data; } } };
      const result = await fn(tx);
      state.committed.push(...pending);
      return result;
    }
  },
}));
import { db, establishAuthContext, withTransaction } from "@/lib/db";

beforeEach(() => { state.committed = []; state.opens = 0; establishAuthContext("verified-user"); });

describe("business transaction composition", () => {
  it("joins nested services and db delegates into one transaction", async () => {
    await withTransaction(async () => {
      await db.prototype.create({ data: { id: "move", initiativeId: "i" } });
      await withTransaction(() => db.prototype.create({ data: { id: "regenerate", initiativeId: "i" } }));
    });
    expect(state.opens).toBe(1);
    expect(state.committed).toEqual(["move", "regenerate"]);
  });
  it.each(["downstream regeneration", "baseline creation"])("rolls back preceding writes on failure in %s", async (stage) => {
    await expect(withTransaction(async () => {
      await db.prototype.create({ data: { id: "first-write", initiativeId: "i" } });
      await withTransaction(async () => { throw new Error(stage); });
    })).rejects.toThrow(stage);
    expect(state.committed).toEqual([]);
  });
  it("keeps concurrent transactions separate", async () => {
    await Promise.all([
      withTransaction(async () => { await Promise.resolve(); await db.prototype.create({ data: { id: "a", initiativeId: "i" } }); }),
      withTransaction(async () => { await db.prototype.create({ data: { id: "b", initiativeId: "j" } }); throw new Error("rollback b"); }).catch(() => undefined),
    ]);
    expect(state.opens).toBe(2);
    expect(state.committed).toEqual(["a"]);
  });
});
