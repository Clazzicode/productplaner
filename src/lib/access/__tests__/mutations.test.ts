import { describe, expect, it, vi, beforeEach } from "vitest";

const initiative = { findUnique: vi.fn() };
const user = { findUnique: vi.fn() };
const team = { findUnique: vi.fn() };
const initiativeAccess = { create: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn() };

vi.mock("@/lib/db", () => ({
  db: { initiative, user, team, initiativeAccess },
}));

const { grantDirectAccess, grantTeamAccess, changeGrantPermission, revokeGrant } = await import("../mutations");

const ORG = "org-1";
const OTHER_ORG = "org-2";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation (docs/V2-RESOURCE-ACCESS.md §10)", () => {
  it("blocks a direct grant when the initiative belongs to a different organization", async () => {
    initiative.findUnique.mockResolvedValue({ organizationId: OTHER_ORG });
    const result = await grantDirectAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      userId: "user-1",
      permission: "view",
    });
    expect(result).toEqual({ ok: false, reason: "cross_tenant" });
    expect(initiativeAccess.create).not.toHaveBeenCalled();
  });

  it("blocks a direct grant when the grantee user belongs to a different organization", async () => {
    initiative.findUnique.mockResolvedValue({ organizationId: ORG });
    user.findUnique.mockResolvedValue({ organizationId: OTHER_ORG });
    const result = await grantDirectAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      userId: "user-1",
      permission: "view",
    });
    expect(result).toEqual({ ok: false, reason: "cross_tenant" });
    expect(initiativeAccess.create).not.toHaveBeenCalled();
  });

  it("blocks a team grant when the initiative belongs to a different organization", async () => {
    initiative.findUnique.mockResolvedValue({ organizationId: OTHER_ORG });
    const result = await grantTeamAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      teamId: "team-1",
      permission: "edit",
    });
    expect(result).toEqual({ ok: false, reason: "cross_tenant" });
    expect(initiativeAccess.create).not.toHaveBeenCalled();
  });

  it("blocks a team grant when the grantee team belongs to a different organization", async () => {
    initiative.findUnique.mockResolvedValue({ organizationId: ORG });
    team.findUnique.mockResolvedValue({ organizationId: OTHER_ORG });
    const result = await grantTeamAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      teamId: "team-1",
      permission: "edit",
    });
    expect(result).toEqual({ ok: false, reason: "cross_tenant" });
    expect(initiativeAccess.create).not.toHaveBeenCalled();
  });
});

describe("external ceiling on direct grants (docs/V2-RESOURCE-ACCESS.md §5)", () => {
  it("blocks a direct Edit grant to an external user", async () => {
    initiative.findUnique.mockResolvedValue({ organizationId: ORG });
    user.findUnique
      .mockResolvedValueOnce({ organizationId: ORG }) // tenant check
      .mockResolvedValueOnce({ memberType: "external" }); // ceiling check
    const result = await grantDirectAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      userId: "user-1",
      permission: "edit",
    });
    expect(result).toEqual({ ok: false, reason: "external_above_view" });
    expect(initiativeAccess.create).not.toHaveBeenCalled();
  });

  it("allows a direct View grant to an external user", async () => {
    initiative.findUnique.mockResolvedValue({ organizationId: ORG });
    user.findUnique
      .mockResolvedValueOnce({ organizationId: ORG })
      .mockResolvedValueOnce({ memberType: "external" });
    initiativeAccess.create.mockResolvedValue({ id: "grant-1" });
    const result = await grantDirectAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      userId: "user-1",
      permission: "view",
    });
    expect(result).toEqual({ ok: true, data: { id: "grant-1" } });
  });

  it("does not cap a team grant at creation time, even though it may have external members", async () => {
    // docs/V2-RESOURCE-ACCESS.md §15: team grants are never capped at grant
    // time — only the per-member resolution caps an external member's result.
    initiative.findUnique.mockResolvedValue({ organizationId: ORG });
    team.findUnique.mockResolvedValue({ organizationId: ORG });
    initiativeAccess.create.mockResolvedValue({ id: "grant-2" });
    const result = await grantTeamAccess({
      organizationId: ORG,
      initiativeId: "init-1",
      teamId: "team-1",
      permission: "edit",
    });
    expect(result).toEqual({ ok: true, data: { id: "grant-2" } });
  });
});

describe("last-owner safeguard (docs/V2-ORG-ADMIN-IA.md §20)", () => {
  it("blocks revoking the only direct Owner grant on an initiative", async () => {
    initiativeAccess.findUnique.mockResolvedValue({
      id: "grant-1",
      initiativeId: "init-1",
      permission: "owner",
      initiative: { organizationId: ORG },
    });
    initiativeAccess.count.mockResolvedValue(0); // no other owner grants
    const result = await revokeGrant("grant-1", ORG);
    expect(result).toEqual({ ok: false, reason: "last_owner" });
    expect(initiativeAccess.delete).not.toHaveBeenCalled();
  });

  it("blocks downgrading the only direct Owner grant to Edit", async () => {
    initiativeAccess.findUnique.mockResolvedValue({
      id: "grant-1",
      initiativeId: "init-1",
      permission: "owner",
      userId: "user-1",
      initiative: { organizationId: ORG },
      user: { memberType: "internal" },
    });
    initiativeAccess.count.mockResolvedValue(0);
    const result = await changeGrantPermission("grant-1", ORG, "edit");
    expect(result).toEqual({ ok: false, reason: "last_owner" });
    expect(initiativeAccess.update).not.toHaveBeenCalled();
  });

  it("allows revoking an Owner grant when another Owner grant exists", async () => {
    initiativeAccess.findUnique.mockResolvedValue({
      id: "grant-1",
      initiativeId: "init-1",
      permission: "owner",
      initiative: { organizationId: ORG },
    });
    initiativeAccess.count.mockResolvedValue(1); // one other owner grant
    initiativeAccess.delete.mockResolvedValue({});
    const result = await revokeGrant("grant-1", ORG);
    expect(result).toEqual({ ok: true, data: { id: "grant-1" } });
  });

  it("does not block revoking a non-Owner grant", async () => {
    initiativeAccess.findUnique.mockResolvedValue({
      id: "grant-1",
      initiativeId: "init-1",
      permission: "view",
      initiative: { organizationId: ORG },
    });
    initiativeAccess.delete.mockResolvedValue({});
    const result = await revokeGrant("grant-1", ORG);
    expect(result).toEqual({ ok: true, data: { id: "grant-1" } });
    expect(initiativeAccess.count).not.toHaveBeenCalled();
  });
});
