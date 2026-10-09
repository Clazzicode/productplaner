import { z } from "zod";

export const productRoles = [
  "requestor", "business_owner", "product_owner", "decision_maker",
  "engineer", "technical_owner", "stakeholder", "demo_owner", "validator",
] as const;

export const influenceLevels = ["low", "medium", "high"] as const;

export const stakeholderContactCreateSchema = z.object({
  userId: z.string().trim().min(1).max(191).optional(),
  displayName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  company: z.string().trim().max(160).default(""),
  external: z.boolean(),
}).strict().superRefine((data, ctx) => {
  if (data.external && data.userId) ctx.addIssue({ code: "custom", path: ["userId"], message: "External stakeholders cannot be linked to an organization user." });
  if (!data.external && !data.userId) ctx.addIssue({ code: "custom", path: ["userId"], message: "Select an organization member." });
});

const targetSchema = z.union([
  z.object({ type: z.literal("request"), id: z.string().min(1) }),
  z.object({ type: z.literal("feature"), id: z.string().min(1) }),
  z.object({ type: z.literal("story"), id: z.string().min(1) }),
  z.object({ type: z.literal("sprint"), id: z.string().min(1) }),
  z.object({ type: z.literal("release"), id: z.string().min(1) }),
  z.object({ type: z.literal("decision"), id: z.string().min(1) }),
]);

export const stakeholderAssignmentCreateSchema = z.object({
  stakeholderId: z.string().trim().min(1).max(191),
  initiativeId: z.string().trim().min(1).max(191).nullable().optional(),
  productRole: z.enum(productRoles),
  responsibility: z.string().trim().max(2000).default(""),
  influence: z.enum(influenceLevels).default("medium"),
  interest: z.enum(influenceLevels).default("medium"),
  engagementExpectation: z.string().trim().max(2000).default(""),
  target: targetSchema,
}).strict();

export const stakeholderAssignmentUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  productRole: z.enum(productRoles).optional(),
  responsibility: z.string().trim().max(2000).optional(),
  influence: z.enum(influenceLevels).optional(),
  interest: z.enum(influenceLevels).optional(),
  engagementExpectation: z.string().trim().max(2000).optional(),
  archived: z.boolean().optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type StakeholderContactCreate = z.infer<typeof stakeholderContactCreateSchema>;
export type StakeholderAssignmentCreate = z.infer<typeof stakeholderAssignmentCreateSchema>;
export type StakeholderAssignmentUpdate = z.infer<typeof stakeholderAssignmentUpdateSchema>;
