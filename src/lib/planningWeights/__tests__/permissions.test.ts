import { describe, expect, it } from "vitest";
import { canEditPlanningWeights } from "../permissions";

const BASE = {
  actorStatus: "active",
  accessLevel: "standard_user",
  initiativePermission: "view" as const,
  initiativeExperienceLevel: "experienced" as string | null,
};

describe("canEditPlanningWeights", () => {
  it("denies an inactive actor regardless of anything else", () => {
    expect(
      canEditPlanningWeights({ ...BASE, actorStatus: "disabled", accessLevel: "org_admin", initiativePermission: "owner" }),
    ).toBe(false);
  });

  it("allows an active org admin regardless of initiative permission or experience", () => {
    expect(
      canEditPlanningWeights({ ...BASE, accessLevel: "org_admin", initiativePermission: "view", initiativeExperienceLevel: "first_time" }),
    ).toBe(true);
  });

  it("allows a standard user with edit permission on the initiative, regardless of experience", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "edit", initiativeExperienceLevel: "first_time" })).toBe(true);
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "owner", initiativeExperienceLevel: "first_time" })).toBe(true);
  });

  it("allows a standard user with only view permission, if experienced", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "experienced" })).toBe(true);
  });

  it("allows the legacy 'expert' experience value the same as 'experienced'", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "expert" })).toBe(true);
  });

  it("denies a standard user with only view permission and Beginner/Some-Experience level", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "first_time" })).toBe(false);
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "some_experience" })).toBe(false);
  });

  it("denies a standard user with no initiative access and no experience level set", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "none", initiativeExperienceLevel: null })).toBe(false);
  });
});
