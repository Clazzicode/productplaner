import { describe, expect, it } from "vitest";
import { isBareRoute } from "./bareMode";

describe("isBareRoute", () => {
  it("is always bare with no profile, regardless of path", () => {
    expect(isBareRoute("/home", false, undefined)).toBe(true);
  });

  it("is bare on the pre-shell routes", () => {
    expect(isBareRoute("/", true, undefined)).toBe(true);
    expect(isBareRoute("/welcome", true, undefined)).toBe(true);
    expect(isBareRoute("/onboarding", true, undefined)).toBe(true);
    expect(isBareRoute("/onboarding/role", true, undefined)).toBe(true);
  });

  it("is bare on the executive print route", () => {
    expect(isBareRoute("/initiatives/abc/workspace/executive/print", true, undefined)).toBe(true);
  });

  it("is shelled for ordinary operational routes", () => {
    expect(isBareRoute("/home", true, undefined)).toBe(false);
    expect(isBareRoute("/integrations", true, undefined)).toBe(false);
    expect(isBareRoute("/initiatives/abc/workspace/roadmap", true, undefined)).toBe(false);
  });

  it("is bare on the guided questionnaire before generation", () => {
    expect(isBareRoute("/initiatives/abc/intake", true, { id: "abc", status: "intake_in_progress" })).toBe(true);
    expect(isBareRoute("/initiatives/abc/intake", true, { id: "abc", status: "draft" })).toBe(true);
  });

  it("is shelled on the guided questionnaire after generation (living-plan editing)", () => {
    expect(isBareRoute("/initiatives/abc/intake", true, { id: "abc", status: "generated" })).toBe(false);
  });

  it("falls through to shelled (not stranded bare) when the initiative can't be found", () => {
    expect(isBareRoute("/initiatives/unknown-id/intake", true, undefined)).toBe(false);
  });
});
