import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  initiative: vi.fn(),
  directGrant: vi.fn(),
  memberships: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    initiative: { findUnique: calls.initiative },
    initiativeAccess: { findUnique: calls.directGrant },
    teamMember: { findMany: calls.memberships },
  },
}));

import { getResolvedAccess, type ActorRow } from "../initiativeAccess";

const admin: ActorRow = { id: "user-1", organizationId: "org-1", accessLevel: "org_admin", status: "active", memberType: "internal" };

beforeEach(() => {
  vi.clearAllMocks();
  calls.initiative.mockResolvedValue({ id: "initiative-1", organizationId: "org-1" });
  calls.directGrant.mockResolvedValue(null);
  calls.memberships.mockResolvedValue([]);
});

describe("initiative access read path", () => {
  it("checks tenant ownership but skips grant queries for an active internal org admin", async () => {
    const result = await getResolvedAccess(admin, "initiative-1");
    expect(result).not.toBe("not_found");
    if (result !== "not_found") expect(result.level).toBe("owner");
    expect(calls.initiative).toHaveBeenCalledOnce();
    expect(calls.directGrant).not.toHaveBeenCalled();
    expect(calls.memberships).not.toHaveBeenCalled();
  });

  it("never grants an admin access across organizations", async () => {
    calls.initiative.mockResolvedValue(null);
    expect(await getResolvedAccess(admin, "other-org-initiative")).toBe("not_found");
    expect(calls.directGrant).not.toHaveBeenCalled();
  });

  it("still reads grants for an ordinary member", async () => {
    const result = await getResolvedAccess({ ...admin, accessLevel: "standard_user" }, "initiative-1");
    expect(result).not.toBe("not_found");
    expect(calls.directGrant).toHaveBeenCalledOnce();
    expect(calls.memberships).toHaveBeenCalledOnce();
  });
});
