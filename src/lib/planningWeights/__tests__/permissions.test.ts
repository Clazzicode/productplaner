import { describe, expect, it } from "vitest";
import { canEditPlanningWeights } from "../permissions";

const BASE = {
  actorStatus: "active",
  actorMemberType: "internal",
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

  it("denies an inconsistent admin resolution without initiative edit access", () => {
    expect(
      canEditPlanningWeights({ ...BASE, accessLevel: "org_admin", initiativePermission: "view", initiativeExperienceLevel: "first_time" }),
    ).toBe(false);
  });

  it("allows a standard user with edit permission on the initiative, regardless of experience", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "edit", initiativeExperienceLevel: "first_time" })).toBe(true);
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "owner", initiativeExperienceLevel: "first_time" })).toBe(true);
  });

  it("denies a viewer regardless of experience", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "experienced" })).toBe(false);
  });

  it("denies an experienced legacy viewer too", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "expert" })).toBe(false);
  });

  it("denies a standard user with only view permission and Beginner/Some-Experience level", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "first_time" })).toBe(false);
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "view", initiativeExperienceLevel: "some_experience" })).toBe(false);
  });

  it("denies a standard user with no initiative access and no experience level set", () => {
    expect(canEditPlanningWeights({ ...BASE, initiativePermission: "none", initiativeExperienceLevel: null })).toBe(false);
  });
});
