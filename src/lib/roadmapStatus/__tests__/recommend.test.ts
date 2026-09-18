import { describe, expect, it } from "vitest";
import { recommendInitiativeStatus, recommendProjectStatus } from "../recommend";

const TODAY = new Date("2026-06-15");

describe("recommendInitiativeStatus", () => {
  const complete = {
    targetLaunchDate: null as Date | null,
    isActivelyExecuting: false,
    problemStatement: "Cart abandonment is high.",
    targetCustomer: "Mobile shoppers.",
    outcomeStatement: "Reduce checkout time.",
  };

  it("recommends nothing when there is no target date and all required info is present", () => {
    expect(recommendInitiativeStatus(complete, TODAY)).toBeNull();
  });

  it("recommends red when the target date has passed and it isn't actively executing", () => {
    const result = recommendInitiativeStatus({ ...complete, targetLaunchDate: new Date("2026-01-01") }, TODAY);
    expect(result).toEqual({ color: "red", reason: expect.stringContaining("Passed its target date") });
  });

  it("does not recommend red for a passed date once the initiative is actively executing", () => {
    const result = recommendInitiativeStatus(
      { ...complete, targetLaunchDate: new Date("2026-01-01"), isActivelyExecuting: true },
      TODAY,
    );
    expect(result).toBeNull();
  });

  it("does not recommend anything for a future target date", () => {
    const result = recommendInitiativeStatus({ ...complete, targetLaunchDate: new Date("2027-01-01") }, TODAY);
    expect(result).toBeNull();
  });

  it("recommends yellow when required intake information is missing", () => {
    const result = recommendInitiativeStatus({ ...complete, problemStatement: "" }, TODAY);
    expect(result).toEqual({ color: "yellow", reason: expect.stringContaining("problem statement") });
  });

  it("lists every missing field, not just the first", () => {
    const result = recommendInitiativeStatus(
      { ...complete, problemStatement: "", targetCustomer: "", outcomeStatement: "" },
      TODAY,
    );
    expect(result?.reason).toContain("problem statement");
    expect(result?.reason).toContain("target customer");
    expect(result?.reason).toContain("desired outcome");
  });

  it("prioritizes the passed-target-date signal over missing information", () => {
    const result = recommendInitiativeStatus(
      { ...complete, targetLaunchDate: new Date("2026-01-01"), problemStatement: "" },
      TODAY,
    );
    expect(result?.color).toBe("red");
  });
});

describe("recommendProjectStatus", () => {
  it("recommends nothing with no target date", () => {
    expect(recommendProjectStatus({ targetLaunchDate: null, hasGeneratedInitiative: false }, TODAY)).toBeNull();
  });

  it("recommends red when the target date passed with no generated initiative", () => {
    const result = recommendProjectStatus(
      { targetLaunchDate: new Date("2026-01-01"), hasGeneratedInitiative: false },
      TODAY,
    );
    expect(result).toEqual({ color: "red", reason: expect.stringContaining("Passed its target date") });
  });

  it("does not recommend red once an initiative has been generated", () => {
    const result = recommendProjectStatus(
      { targetLaunchDate: new Date("2026-01-01"), hasGeneratedInitiative: true },
      TODAY,
    );
    expect(result).toBeNull();
  });
});
