import { describe, expect, it } from "vitest";
import { resolveAccountState } from "../resolveAccountState";

describe("experience-independent account routing", () => {
  it.each([false, true])("does not gate account navigation on a profile (%s)", hasProfile => {
    expect(resolveAccountState({ hasProfile, workingRole: null, onboardingWorkspaceTypeChosen: false, projectCount: 0 })).toEqual({ stage: "projects_home_empty", redirectTo: "/projects" });
    expect(resolveAccountState({ hasProfile, workingRole: "product_management", onboardingWorkspaceTypeChosen: true, projectCount: 3 })).toEqual({ stage: "projects_home", redirectTo: "/projects" });
  });
});
