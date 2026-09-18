import { describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const count = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: (...args: unknown[]) => findUnique(...args), count: (...args: unknown[]) => count(...args) } },
}));

const { isLastActiveOrgAdmin } = await import("../safeguards");

describe("isLastActiveOrgAdmin", () => {
  it("is false when the target isn't an org_admin", async () => {
    findUnique.mockResolvedValue({ id: "u1", accessLevel: "standard_user", status: "active" });
    expect(await isLastActiveOrgAdmin("u1", "org1")).toBe(false);
  });

  it("is false when the target admin is already disabled", async () => {
    findUnique.mockResolvedValue({ id: "u1", accessLevel: "org_admin", status: "disabled" });
    expect(await isLastActiveOrgAdmin("u1", "org1")).toBe(false);
  });

  it("is false when another active admin exists in the org", async () => {
    findUnique.mockResolvedValue({ id: "u1", accessLevel: "org_admin", status: "active" });
    count.mockResolvedValue(1);
    expect(await isLastActiveOrgAdmin("u1", "org1")).toBe(false);
  });

  it("is true when the target is the only active admin", async () => {
    findUnique.mockResolvedValue({ id: "u1", accessLevel: "org_admin", status: "active" });
    count.mockResolvedValue(0);
    expect(await isLastActiveOrgAdmin("u1", "org1")).toBe(true);
  });
});
