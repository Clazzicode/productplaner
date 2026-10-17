import { describe, expect, it } from "vitest";
import { jiraImportApplySchema, jiraProjectSchema, jiraStartSchema } from "../model";

describe("Jira command validation", () => {
  it("allows only local integration return paths", () => {
    expect(jiraStartSchema.safeParse({ initiativeId: "init-a", returnPath: "/integrations/jira?step=2" }).success).toBe(true);
    expect(jiraStartSchema.safeParse({ initiativeId: "init-a", returnPath: "https://evil.example" }).success).toBe(false);
  });
  it("limits issue mappings to supported planning targets", () => {
    expect(jiraProjectSchema.safeParse({ projectId: "1", projectKey: "GP", projectName: "Guided Planning", expectedRevision: 1, issueTypeMappings: { Epic: "feature", Bug: "bug" }, storyPointsField: "customfield_10016" }).success).toBe(true);
    expect(jiraProjectSchema.safeParse({ projectId: "1", projectKey: "GP", projectName: "Guided Planning", expectedRevision: 1, issueTypeMappings: { Epic: "release" }, storyPointsField: "points" }).success).toBe(false);
  });
  it("requires explicit selected item IDs and a human reason", () => {
    expect(jiraImportApplySchema.safeParse({ expectedStatus: "previewed", selectedItemIds: ["item-a"], reason: "Reviewed by the Product Owner." }).success).toBe(true);
    expect(jiraImportApplySchema.safeParse({ expectedStatus: "previewed", selectedItemIds: ["item-a"], reason: "ok" }).success).toBe(false);
  });
});
