import { describe, expect, it } from "vitest";
import { generalIntakeSchema, generalIntakeVersion } from "../generalIntake";

describe("minimal resumable planning intake", () => {
  it("accepts an initiative name with unknown planning context", () => {
    expect(generalIntakeSchema.parse({ name: "Customer returns" })).toMatchObject({ problemStatement: "", targetCustomer: "", outcomeStatement: "", methodology: "agile_scrum" });
  });
  it("rejects client-supplied authority and experience qualification", () => {
    for (const field of ["organizationId", "userId", "experienceLevel", "qualifyingProfileId", "status"]) {
      expect(generalIntakeSchema.safeParse({ name: "Customer returns", [field]: "forged" }).success).toBe(false);
    }
  });
  it("includes edits to both the initiative and intake in the optimistic version", () => {
    expect(generalIntakeVersion({ updatedAt: new Date(1000), intakeAnswerSet: { updatedAt: new Date(2000) } })).toBe(new Date(2000).toISOString());
    expect(generalIntakeVersion({ updatedAt: new Date(3000), intakeAnswerSet: { updatedAt: new Date(2000) } })).toBe(new Date(3000).toISOString());
  });
});
