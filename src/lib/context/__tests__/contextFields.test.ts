import { describe, expect, it } from "vitest";
import { detectGaps, PROJECT_CONTEXT_FIELDS, INITIATIVE_CONTEXT_FIELDS } from "../contextFields";

describe("detectGaps", () => {
  it("flags every project field as a gap when nothing is set", () => {
    expect(detectGaps("project", {})).toEqual([...PROJECT_CONTEXT_FIELDS]);
  });

  it("does not flag a field with a real, non-empty current value", () => {
    const gaps = detectGaps("project", { project_name: "Acme", budget: 50000 });
    expect(gaps).not.toContain("project_name");
    expect(gaps).not.toContain("budget");
    expect(gaps).toContain("goal");
  });

  it("treats null, undefined, and empty string as still-missing", () => {
    const gaps = detectGaps("project", { project_name: null, description: undefined, goal: "" });
    expect(gaps).toContain("project_name");
    expect(gaps).toContain("description");
    expect(gaps).toContain("goal");
  });

  it("closes a gap via pendingApprovedFieldKeys even before a refetch", () => {
    const gaps = detectGaps("project", {}, new Set(["project_name"]));
    expect(gaps).not.toContain("project_name");
  });

  it("uses the initiative field list for scope=initiative", () => {
    const gaps = detectGaps("initiative", {});
    expect(gaps).toEqual([...INITIATIVE_CONTEXT_FIELDS]);
  });
});
