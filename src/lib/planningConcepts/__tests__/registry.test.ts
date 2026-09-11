import { describe, expect, it } from "vitest";
import { PLANNING_CONCEPTS, planningConceptById, type PlanningConceptPart } from "../registry";

const PARTS = ["meaning", "factors", "userInputs", "interpretation", "output"] as const;

describe("PLANNING_CONCEPTS", () => {
  it("gives every concept a non-empty detail for every part", () => {
    for (const concept of PLANNING_CONCEPTS) {
      for (const part of PARTS) {
        const value = concept[part] as PlanningConceptPart;
        expect(value.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it("has unique ids", () => {
    const ids = PLANNING_CONCEPTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Regression guard: a status must never flip from needs_business_rule to
  // defined without real methodology behind it. If this test needs updating,
  // it means a real business rule was actually defined — not a copy tweak.
  it("business_value_pm_po recognizes factors but leaves thresholds/weighting undefined", () => {
    const c = planningConceptById("business_value_pm_po")!;
    expect(c.meaning.status).toBe("defined");
    expect(c.factors.status).toBe("defined");
    expect(c.userInputs.status).toBe("needs_business_rule");
    expect(c.interpretation.status).toBe("needs_business_rule");
    expect(c.output.status).toBe("needs_business_rule");
  });

  it("business_value_project_manager recognizes cost but leaves the evaluation method undefined", () => {
    const c = planningConceptById("business_value_project_manager")!;
    expect(c.meaning.status).toBe("defined");
    expect(c.factors.status).toBe("defined");
    expect(c.interpretation.status).toBe("needs_business_rule");
    expect(c.output.status).toBe("needs_business_rule");
  });

  it("risk_project_manager recognizes SWOT but leaves the risk-level mapping undefined", () => {
    const c = planningConceptById("risk_project_manager")!;
    expect(c.meaning.status).toBe("defined");
    expect(c.factors.status).toBe("defined");
    expect(c.userInputs.status).toBe("defined");
    expect(c.interpretation.status).toBe("needs_business_rule");
    expect(c.output.status).toBe("needs_business_rule");
  });

  it("risk_pm_po is entirely undefined and explicitly must not default to SWOT", () => {
    const c = planningConceptById("risk_pm_po")!;
    for (const part of PARTS) {
      expect((c[part] as PlanningConceptPart).status).toBe("needs_business_rule");
    }
    expect(c.factors.detail.toLowerCase()).not.toContain("strength");
  });
});

describe("planningConceptById", () => {
  it("returns undefined for an unknown id", () => {
    expect(planningConceptById("not_a_real_concept")).toBeUndefined();
  });
});
