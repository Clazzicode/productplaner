import { describe, expect, it } from "vitest";
import { depthFromExperience, guidanceFor } from "@/lib/questionnaire/roleGuidance";

describe("depthFromExperience", () => {
  it("is verbose for first_time and some_experience", () => {
    expect(depthFromExperience("first_time")).toBe(true);
    expect(depthFromExperience("some_experience")).toBe(true);
  });

  it("is concise for experienced, expert, unknown, or missing", () => {
    expect(depthFromExperience("experienced")).toBe(false);
    expect(depthFromExperience("expert")).toBe(false);
    expect(depthFromExperience(undefined)).toBe(false);
    expect(depthFromExperience(null)).toBe(false);
  });
});

describe("guidanceFor", () => {
  const sections = [
    "productDirection",
    "success",
    "capabilities",
    "delivery",
    "execution",
    "review",
  ] as const;
  const roles = ["product_management", "project_manager", "product_owner"] as const;

  it("returns a non-empty, role-specific string for every section/role pair", () => {
    for (const section of sections) {
      const perRole = roles.map((role) => guidanceFor(section, role));
      for (const text of perRole) expect(text.length).toBeGreaterThan(0);
      // Working Role must actually change emphasis — not collapse to identical copy.
      expect(new Set(perRole).size).toBe(roles.length);
    }
  });

  it("falls back to product_management framing when role is null", () => {
    expect(guidanceFor("capabilities", null)).toBe(guidanceFor("capabilities", "product_management"));
  });
});
