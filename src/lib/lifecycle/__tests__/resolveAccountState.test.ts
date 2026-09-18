import { describe, expect, it } from "vitest";
import { resolveAccountState, type AccountStateInput } from "../resolveAccountState";

const base: AccountStateInput = {
  hasProfile: false,
  workingRole: null,
  onboardingWorkspaceTypeChosen: false,
  projectCount: 0,
};

describe("resolveAccountState", () => {
  it("onboarding_org_setup for a brand-new user who hasn't chosen a workspace type yet", () => {
    const result = resolveAccountState(base);
    expect(result.stage).toBe("onboarding_org_setup");
    expect(result.redirectTo).toBe("/onboarding");
  });

  it("onboarding_qualifying once workspace type is chosen but no profile yet", () => {
    const result = resolveAccountState({ ...base, onboardingWorkspaceTypeChosen: true });
    expect(result.stage).toBe("onboarding_qualifying");
    expect(result.redirectTo).toBe("/welcome");
  });

  it("onboarding_role once a profile exists but working role is unresolved", () => {
    const result = resolveAccountState({ ...base, hasProfile: true, onboardingWorkspaceTypeChosen: true });
    expect(result.stage).toBe("onboarding_role");
    expect(result.redirectTo).toBe("/onboarding/role");
  });

  it("projects_home_empty once onboarding is complete but there are zero Projects", () => {
    const result = resolveAccountState({
      ...base,
      hasProfile: true,
      workingRole: "product_management",
      projectCount: 0,
    });
    expect(result.stage).toBe("projects_home_empty");
    expect(result.redirectTo).toBe("/projects");
  });

  it("projects_home once onboarding is complete and Projects exist", () => {
    const result = resolveAccountState({
      ...base,
      hasProfile: true,
      workingRole: "product_management",
      projectCount: 3,
    });
    expect(result.stage).toBe("projects_home");
    expect(result.redirectTo).toBe("/projects");
  });
});
