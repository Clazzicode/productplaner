import { describe, expect, it } from "vitest";
import { formatAccessLabel, meetsMinimum, resolveInitiativeAccess, type ResolveActor } from "../resolution";

const ORG = "org-1";

function actor(overrides: Partial<ResolveActor> = {}): ResolveActor {
  return {
    id: "user-1",
    organizationId: ORG,
    accessLevel: "standard_user",
    status: "active",
    memberType: "internal",
    ...overrides,
  };
}

describe("resolveInitiativeAccess", () => {
  it("resolves no grant as No Access", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [],
    });
    expect(result.level).toBe("none");
    expect(result.sourceLabel).toBe("");
  });

  it("resolves a direct View grant", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "view" },
      teamGrants: [],
    });
    expect(result.level).toBe("view");
    expect(result.sourceLabel).toBe("Direct");
  });

  it("resolves a direct Edit grant", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "edit" },
      teamGrants: [],
    });
    expect(result.level).toBe("edit");
    expect(result.sourceLabel).toBe("Direct");
  });

  it("resolves a team View grant", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [{ teamName: "Product", permission: "view" }],
    });
    expect(result.level).toBe("view");
    expect(result.sourceLabel).toBe("via Product");
  });

  it("resolves a team Edit grant", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [{ teamName: "Product", permission: "edit" }],
    });
    expect(result.level).toBe("edit");
    expect(result.sourceLabel).toBe("via Product");
  });

  it("highest wins: team Edit beats direct View", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "view" },
      teamGrants: [{ teamName: "Product", permission: "edit" }],
    });
    expect(result.level).toBe("edit");
    expect(result.sourceLabel).toBe("via Product");
  });

  it("highest wins: direct Edit beats team View, and names Direct only", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "edit" },
      teamGrants: [{ teamName: "Product", permission: "view" }],
    });
    expect(result.level).toBe("edit");
    expect(result.sourceLabel).toBe("Direct");
  });

  it("combines multiple sources at the same top level", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "edit" },
      teamGrants: [
        { teamName: "Product", permission: "edit" },
        { teamName: "PMO", permission: "edit" },
      ],
    });
    expect(result.level).toBe("edit");
    expect(result.sourceLabel).toBe("via Product + PMO + Direct");
  });

  it("multiple teams at the top level, no direct grant", () => {
    const result = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [
        { teamName: "Product", permission: "edit" },
        { teamName: "PMO", permission: "edit" },
      ],
    });
    expect(result.sourceLabel).toBe("via Product + PMO");
  });

  it("Org Admin resolves Owner regardless of any grants", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ accessLevel: "org_admin" }),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [],
    });
    expect(result.level).toBe("owner");
    expect(result.sourceLabel).toBe("Organization Admin");
    expect(result.sources).toEqual([{ kind: "org_admin", level: "owner" }]);
  });

  it("disabled user resolves No Access even with grants", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ status: "disabled" }),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "owner" },
      teamGrants: [{ teamName: "Product", permission: "edit" }],
    });
    expect(result.level).toBe("none");
  });

  it("archived user resolves No Access even with grants", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ status: "archived" }),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "owner" },
      teamGrants: [],
    });
    expect(result.level).toBe("none");
  });

  it("disabled Org Admin does NOT get implicit Owner", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ accessLevel: "org_admin", status: "disabled" }),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [],
    });
    expect(result.level).toBe("none");
  });

  it("external user with a direct Edit grant resolves only View, and is flagged capped", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ memberType: "external" }),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "edit" },
      teamGrants: [],
    });
    expect(result.level).toBe("view");
    expect(result.externallyCapped).toBe(true);
  });

  it("external user inheriting Edit via a team resolves only View", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ memberType: "external" }),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [{ teamName: "Client — Acme", permission: "edit" }],
    });
    expect(result.level).toBe("view");
    expect(result.externallyCapped).toBe(true);
  });

  it("external user with only a View grant is not flagged as capped", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ memberType: "external" }),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "view" },
      teamGrants: [],
    });
    expect(result.level).toBe("view");
    expect(result.externallyCapped).toBe(false);
  });

  it("cross-organization actor never resolves access, even with a matching grant shape", () => {
    const result = resolveInitiativeAccess({
      actor: actor({ organizationId: "org-2" }),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "owner" },
      teamGrants: [],
    });
    expect(result.level).toBe("none");
  });
});

describe("revocation scenarios (docs/V2-RESOURCE-ACCESS.md §32)", () => {
  it("removing team membership (no more team grants) falls back to a remaining direct grant", () => {
    // Before: team Edit + direct View. After leaving the team: only direct View remains.
    const before = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "view" },
      teamGrants: [{ teamName: "Product", permission: "edit" }],
    });
    const after = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: { permission: "view" },
      teamGrants: [], // membership removed
    });
    expect(before.level).toBe("edit");
    expect(after.level).toBe("view");
    expect(after.sourceLabel).toBe("Direct");
  });

  it("revoking the direct grant falls back to a remaining team grant", () => {
    const after = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null, // revoked
      teamGrants: [{ teamName: "Product", permission: "edit" }],
    });
    expect(after.level).toBe("edit");
    expect(after.sourceLabel).toBe("via Product");
  });

  it("revoking one of two team grants falls back to the remaining team", () => {
    const after = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [{ teamName: "PMO", permission: "view" }], // Product's grant revoked
    });
    expect(after.level).toBe("view");
    expect(after.sourceLabel).toBe("via PMO");
  });

  it("revoking the last remaining source of access resolves No Access", () => {
    const after = resolveInitiativeAccess({
      actor: actor(),
      initiativeOrganizationId: ORG,
      directGrant: null,
      teamGrants: [],
    });
    expect(after.level).toBe("none");
  });
});

describe("formatAccessLabel", () => {
  it("formats Direct with an em dash", () => {
    expect(formatAccessLabel("view", "Direct")).toBe("View — Direct");
  });

  it("formats a team source with 'via'", () => {
    expect(formatAccessLabel("edit", "via Product")).toBe("Edit via Product");
  });

  it("formats Organization Admin with an em dash", () => {
    expect(formatAccessLabel("owner", "Organization Admin")).toBe("Owner — Organization Admin");
  });

  it("formats No Access with no source", () => {
    expect(formatAccessLabel("none", "")).toBe("No Access");
  });
});

describe("meetsMinimum", () => {
  it("none never meets any minimum", () => {
    expect(meetsMinimum("none", "view")).toBe(false);
  });
  it("view meets view but not edit or owner", () => {
    expect(meetsMinimum("view", "view")).toBe(true);
    expect(meetsMinimum("view", "edit")).toBe(false);
    expect(meetsMinimum("view", "owner")).toBe(false);
  });
  it("owner meets every minimum", () => {
    expect(meetsMinimum("owner", "view")).toBe(true);
    expect(meetsMinimum("owner", "edit")).toBe(true);
    expect(meetsMinimum("owner", "owner")).toBe(true);
  });
});
