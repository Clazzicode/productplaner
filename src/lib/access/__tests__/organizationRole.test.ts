import { describe, expect, it } from "vitest";
import { requireOrganizationRole } from "../organizationRole";

describe("organization role permissions", () => {
  it("denies administrative privileges to external administrators", () => {
    expect(requireOrganizationRole({ status: "active", memberType: "external", permissionRole: "admin" }, ["owner", "admin"]).ok).toBe(false);
  });
  it("denies a member an owner-only action", () => {
    expect(requireOrganizationRole({ status: "active", memberType: "internal", permissionRole: "member" }, ["owner"]).ok).toBe(false);
  });
  it("allows administrators to approve", () => {
    expect(requireOrganizationRole({ status: "active", memberType: "internal", permissionRole: "admin" }, ["owner", "admin"]).ok).toBe(true);
  });
  it("does not treat administrators as owners", () => {
    expect(requireOrganizationRole({ status: "active", memberType: "internal", permissionRole: "admin" }, ["owner"]).ok).toBe(false);
  });
});
