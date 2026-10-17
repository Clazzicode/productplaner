import { describe, expect, it } from "vitest";
import { jiraConflictResolutionSchema, jiraExportApprovalSchema, jiraExportExecuteSchema, jiraImportApplySchema, jiraProjectSchema, jiraStartSchema, jiraWebhookCommandSchema } from "../model";

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
  it("separates Jira export approval from execution", () => {
    expect(jiraExportApprovalSchema.safeParse({ expectedStatus: "previewed", selectedItemIds: ["item-a"], reason: "Approved for the planned release." }).success).toBe(true);
    expect(jiraExportApprovalSchema.safeParse({ expectedStatus: "previewed", selectedItemIds: [], reason: "Approved" }).success).toBe(false);
    expect(jiraExportExecuteSchema.safeParse({ expectedStatus: "approved" }).success).toBe(true);
    expect(jiraExportExecuteSchema.safeParse({ expectedStatus: "previewed" }).success).toBe(false);
  });
  it("requires explicit webhook and conflict commands", () => {
    expect(jiraWebhookCommandSchema.safeParse({ action: "register" }).success).toBe(true);
    expect(jiraWebhookCommandSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(jiraConflictResolutionSchema.safeParse({ resolution: "keep_planning", reason: "PO chose the planning version." }).success).toBe(true);
    expect(jiraConflictResolutionSchema.safeParse({ resolution: "auto", reason: "Decide automatically" }).success).toBe(false);
  });
});
