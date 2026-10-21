import { describe, expect, it } from "vitest";
import { WORKING_ROLE_META, WORKING_ROLE_ORDER } from "../roleOptions";
import { resolveWorkingRole } from "../resolveWorkingRole";

describe("launched working roles", () => {
  it("offers only Product Owner while retaining future-role metadata", () => {
    expect(WORKING_ROLE_ORDER).toEqual(["product_owner"]);
    expect(WORKING_ROLE_META.product_owner.label).toBe("Product Owner");
    expect(WORKING_ROLE_META.product_management.label).toBe("Product Manager");
    expect(WORKING_ROLE_META.project_manager.label).toBe("Project Manager");
  });

  it("normalizes old accounts and stale onboarding cookies to Product Owner", () => {
    expect(resolveWorkingRole("product_management", undefined)).toBe("product_owner");
    expect(resolveWorkingRole("project_manager", "project_manager")).toBe("product_owner");
    expect(resolveWorkingRole(null, undefined)).toBe("product_owner");
  });
});
