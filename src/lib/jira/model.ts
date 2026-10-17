import { z } from "zod";

export const jiraStartSchema = z.object({
  initiativeId: z.string().trim().min(1).nullable().default(null),
  returnPath: z.string().trim().regex(/^\/integrations\/jira(?:[/?#].*)?$/).default("/integrations/jira"),
});

export const jiraSiteSchema = z.object({
  cloudId: z.string().trim().min(1).max(200),
  expectedRevision: z.number().int().positive(),
});

export const jiraProjectSchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  projectKey: z.string().trim().min(1).max(50),
  projectName: z.string().trim().min(1).max(300),
  expectedRevision: z.number().int().positive(),
  issueTypeMappings: z.record(z.string(), z.enum(["feature", "story", "bug", "skip"])).default({}),
  storyPointsField: z.string().trim().regex(/^customfield_\d+$/).default("customfield_10016"),
});

export const jiraImportPreviewSchema = z.object({ connectionId: z.string().trim().min(1) });

export const jiraImportApplySchema = z.object({
  expectedStatus: z.literal("previewed"),
  selectedItemIds: z.array(z.string().trim().min(1)).max(1000),
  reason: z.string().trim().min(5).max(1000),
});

export type JiraProjectInput = z.infer<typeof jiraProjectSchema>;
