import { describe, expect, it } from "vitest";
import { MIN_OUTCOME_CHARS } from "@/lib/generation/constants";
import {
  buildCapabilityPlan,
  buildCapabilityPlanAllMvp,
  capabilityFieldsForBucket,
  composeTargetCustomer,
  computeTargetLaunchDate,
  defaultTeamSize,
  deriveInitiativeName,
  deriveOutcomeStatement,
  finalizeOutcomeStatement,
  DEFAULT_TARGET_CUSTOMER,
  parseFeatureLines,
} from "@/lib/questionnaire/simplifiedIntakeTranslate";

describe("parseFeatureLines", () => {
  it("returns an empty array for blank input", () => {
    expect(parseFeatureLines("")).toEqual([]);
    expect(parseFeatureLines("   \n  ")).toEqual([]);
  });

  it("splits newline-separated input", () => {
    expect(parseFeatureLines("Order ahead\nDaily menu\nNotifications")).toEqual([
      "Order ahead",
      "Daily menu",
      "Notifications",
    ]);
  });

  it("falls back to comma/semicolon splitting for single-line input", () => {
    expect(parseFeatureLines("Order ahead, daily menu; notifications")).toEqual([
      "Order ahead",
      "daily menu",
      "notifications",
    ]);
  });

  it("strips leading bullet and numbered-list markers", () => {
    expect(parseFeatureLines("- Order ahead\n* Daily menu\n1. Notifications\n2) Loyalty points")).toEqual([
      "Order ahead",
      "Daily menu",
      "Notifications",
      "Loyalty points",
    ]);
  });

  it("does not mangle text that merely starts with a digit", () => {
    expect(parseFeatureLines("3-day free trial")).toEqual(["3-day free trial"]);
  });

  it("de-dupes case-insensitively", () => {
    expect(parseFeatureLines("Order ahead\norder AHEAD\nDaily menu")).toEqual(["Order ahead", "Daily menu"]);
  });

  it("drops items shorter than 3 characters", () => {
    expect(parseFeatureLines("Order ahead\nhi\nDaily menu")).toEqual(["Order ahead", "Daily menu"]);
  });

  it("caps output at 25 items", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `Feature ${i}`).join("\n");
    expect(parseFeatureLines(lines)).toHaveLength(25);
  });
});

describe("buildCapabilityPlan", () => {
  it("places priority items in now, next items in next, leftover feature items in later", () => {
    const plan = buildCapabilityPlan(
      "Order ahead\nDaily menu\nLoyalty points",
      "Order ahead",
      "Daily menu",
    );
    expect(plan).toEqual([
      { name: "Order ahead", bucket: "now" },
      { name: "Daily menu", bucket: "next" },
      { name: "Loyalty points", bucket: "later" },
    ]);
  });

  it("lets priority win over a duplicate that also appears in next or features", () => {
    const plan = buildCapabilityPlan("Order ahead", "Order ahead", "Order ahead");
    expect(plan).toEqual([{ name: "Order ahead", bucket: "now" }]);
  });

  it("lets next win over a duplicate leftover in features", () => {
    const plan = buildCapabilityPlan("Daily menu", "", "Daily menu");
    expect(plan).toEqual([{ name: "Daily menu", bucket: "next" }]);
  });

  it("handles empty features/next answers", () => {
    const plan = buildCapabilityPlan("", "Order ahead", "");
    expect(plan).toEqual([{ name: "Order ahead", bucket: "now" }]);
  });

  it("returns an empty plan when all three answers are empty", () => {
    expect(buildCapabilityPlan("", "", "")).toEqual([]);
  });
});

describe("buildCapabilityPlanAllMvp", () => {
  // Guided-activation restructure (reference doc §5): Some Experience's
  // shorter flow has no dedicated prioritization question — every listed
  // item is treated as equally must-deliver.
  it("places every parsed item in the now bucket", () => {
    expect(buildCapabilityPlanAllMvp("Online ordering\nPayments\nLoyalty points")).toEqual([
      { name: "Online ordering", bucket: "now" },
      { name: "Payments", bucket: "now" },
      { name: "Loyalty points", bucket: "now" },
    ]);
  });

  it("returns an empty plan for blank input", () => {
    expect(buildCapabilityPlanAllMvp("")).toEqual([]);
  });
});

describe("composeTargetCustomer", () => {
  it("falls back to the default when nothing was entered", () => {
    expect(composeTargetCustomer([], "")).toBe(DEFAULT_TARGET_CUSTOMER);
  });

  it("joins chip selections", () => {
    expect(composeTargetCustomer(["Customers", "Employees"], "")).toBe("Customers, Employees");
  });

  it("uses free-text detail alone when no chips are selected", () => {
    expect(composeTargetCustomer([], "Freelance photographers")).toBe("Freelance photographers");
  });

  it("combines chips and free-text detail", () => {
    expect(composeTargetCustomer(["Businesses"], "specifically small dental practices")).toBe(
      "Businesses — specifically small dental practices",
    );
  });
});

describe("finalizeOutcomeStatement", () => {
  it("returns the trimmed answer unchanged when it already clears the minimum length", () => {
    const long = "Cut average order wait time in half and increase repeat visits.";
    expect(finalizeOutcomeStatement(long)).toBe(long);
  });

  it("pads a too-short answer to clear the minimum length", () => {
    const statement = finalizeOutcomeStatement("Faster.");
    expect(statement.length).toBeGreaterThanOrEqual(MIN_OUTCOME_CHARS);
    expect(statement).toContain("Faster.");
  });
});

describe("capabilityFieldsForBucket", () => {
  it("marks now as MVP with high business value", () => {
    expect(capabilityFieldsForBucket("now")).toEqual({
      isMvp: true,
      effortSize: "m",
      businessValue: "high",
      riskLevel: "medium",
    });
  });

  it("marks next and later as non-MVP with descending business value", () => {
    expect(capabilityFieldsForBucket("next").isMvp).toBe(false);
    expect(capabilityFieldsForBucket("next").businessValue).toBe("medium");
    expect(capabilityFieldsForBucket("later").isMvp).toBe(false);
    expect(capabilityFieldsForBucket("later").businessValue).toBe("low");
  });
});

describe("deriveInitiativeName", () => {
  it("uses the first clause of the product answer", () => {
    expect(deriveInitiativeName("A coffee ordering app. It also tracks loyalty points.")).toBe(
      "A coffee ordering app",
    );
  });

  it("falls back to a default name for blank or too-short input", () => {
    expect(deriveInitiativeName("")).toBe("My Product");
    expect(deriveInitiativeName("Hi")).toBe("My Product");
  });

  it("truncates very long single-clause answers", () => {
    const long = "A".repeat(100);
    const name = deriveInitiativeName(long);
    expect(name.length).toBeLessThanOrEqual(60);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("deriveOutcomeStatement", () => {
  it("quotes the priority answer and clears the minimum length requirement", () => {
    const statement = deriveOutcomeStatement("Order ahead", "A coffee ordering app");
    expect(statement).toContain("Order ahead");
    expect(statement.length).toBeGreaterThanOrEqual(MIN_OUTCOME_CHARS);
  });

  it("falls back to the product answer when priority is blank, still clearing the minimum length", () => {
    const statement = deriveOutcomeStatement("", "A coffee ordering app");
    expect(statement.length).toBeGreaterThanOrEqual(MIN_OUTCOME_CHARS);
  });
});

describe("DEFAULT_TARGET_CUSTOMER", () => {
  it("is a non-trivial, always-valid fallback", () => {
    expect(DEFAULT_TARGET_CUSTOMER.length).toBeGreaterThanOrEqual(5);
  });
});

describe("computeTargetLaunchDate", () => {
  it("adds the correct number of months for each timeline bucket", () => {
    const now = new Date("2026-01-15T00:00:00.000Z");
    expect(computeTargetLaunchDate("3", now)?.getUTCMonth()).toBe(3); // Jan(0) + 3 = Apr(3)
    expect(computeTargetLaunchDate("6", now)?.getUTCMonth()).toBe(6);
    expect(computeTargetLaunchDate("9", now)?.getUTCMonth()).toBe(9);
    expect(computeTargetLaunchDate("12", now)?.getUTCFullYear()).toBe(2027);
  });

  it("returns null for the 'none' bucket (guided-activation restructure: no date given)", () => {
    expect(computeTargetLaunchDate("none")).toBeNull();
  });
});

describe("defaultTeamSize", () => {
  it("is 1 for solo and 3 otherwise", () => {
    expect(defaultTeamSize("solo")).toBe(1);
    expect(defaultTeamSize("small_team")).toBe(3);
    expect(defaultTeamSize("multiple_teams")).toBe(3);
    expect(defaultTeamSize(null)).toBe(3);
    expect(defaultTeamSize(undefined)).toBe(3);
  });
});
