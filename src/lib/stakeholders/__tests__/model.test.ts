import { describe, expect, it } from "vitest";
import {
  stakeholderAssignmentCreateSchema,
  stakeholderContactCreateSchema,
} from "../model";

describe("structured stakeholders", () => {
  it("keeps product roles separate from authorization roles", () => {
    expect(stakeholderAssignmentCreateSchema.parse({
      stakeholderId: "contact-a",
      initiativeId: "initiative-a",
      productRole: "decision_maker",
      target: { type: "feature", id: "feature-a" },
    }).productRole).toBe("decision_maker");
    expect(stakeholderAssignmentCreateSchema.safeParse({
      stakeholderId: "contact-a", productRole: "admin", target: { type: "feature", id: "feature-a" },
    }).success).toBe(false);
  });

  it("requires internal stakeholders to link to an organization member", () => {
    expect(stakeholderContactCreateSchema.safeParse({ displayName: "Avery", external: false }).success).toBe(false);
    expect(stakeholderContactCreateSchema.safeParse({ displayName: "Tiana", email: "tiana@example.com", external: true }).success).toBe(true);
  });
});
