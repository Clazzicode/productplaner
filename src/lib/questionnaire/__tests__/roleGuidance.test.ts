import { describe, expect, it } from "vitest";
import { depthFromExperience, guidanceFor, isSimplifiedIntakeExperience } from "../roleGuidance";

describe("one Product Owner workflow", () => {
  it.each(["first_time", "some_experience", "experienced", "expert", "unknown", null, undefined])("keeps guidance and intake independent of historical experience %s", experience => {
    expect(depthFromExperience(experience)).toBe(true);
    expect(isSimplifiedIntakeExperience(experience)).toBe(false);
  });
  it.each(["productDirection", "success", "capabilities", "delivery", "execution", "review"] as const)("keeps %s framing consistent across historical roles", section => {
    for (const role of ["product_owner", "product_management", "project_manager", "business_analyst", "founder_business_lead", "other", null] as const) {
      expect(guidanceFor(section, role)).toBe(guidanceFor(section, "product_owner"));
    }
  });
});
