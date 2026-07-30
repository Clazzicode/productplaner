import { z } from "zod";

// Zod schemas for API payloads. These also carry the enum constraints that
// the SQLite schema can't express natively.

export const qualifyingSchema = z.object({
  role: z.enum([
    "senior_pm",
    "product_owner",
    "business_analyst",
    "project_manager",
    "scrum_master",
    "founder_first_timer",
    "executive_stakeholder",
  ]),
  experienceLevel: z.enum(["first_time", "some_experience", "experienced", "expert"]),
  teamComposition: z.enum(["solo", "small_team", "multiple_teams"]),
  productType: z.enum(["software_product", "non_product"]),
  executionTool: z.enum(["jira", "azure_devops", "aha", "other", "none"]),
  statedMethodology: z.enum(["hybrid", "agile_scrum", "waterfall", "kanban", "not_sure"]),
});

export const initiativeCreateSchema = z.object({
  name: z.string().trim().min(3, "Give the initiative a name (3+ characters)."),
  description: z.string().trim().default(""),
});

export const intakePatchSchema = z.object({
  problemStatement: z.string().optional(),
  targetCustomer: z.string().optional(),
  outcomeStatement: z.string().optional(),
  outcomeMetric: z.string().optional(),
  teamSize: z.number().int().min(1).max(200).nullable().optional(),
  sprintLengthWeeks: z.number().int().min(1).max(4).optional(),
  velocityPerPersonPerSprint: z.number().min(0.5).max(40).optional(),
  capacityBufferPercent: z.number().int().min(0).max(90).optional(),
});

export const effortSizeSchema = z.enum(["xs", "s", "m", "l", "xl"]);
export const businessValueSchema = z.enum(["low", "medium", "high", "critical"]);

export const capabilityUpsertSchema = z.object({
  name: z.string().trim().min(3, "Name the capability (3+ characters)."),
  description: z.string().trim().default(""),
  isMvp: z.boolean(),
  effortSize: effortSizeSchema,
  businessValue: businessValueSchema,
  dependsOn: z.array(z.string()).default([]),
});

export const artifactPatchSchema = z
  .object({
    title: z.string().trim().min(3).optional(),
    body: z.string().optional(),
    points: z.number().int().min(1).max(21).optional(),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined || v.points !== undefined, {
    message: "Nothing to update.",
  });

export const moveSprintSchema = z.object({
  sprintNumber: z.number().int().min(1),
});

export const layerTypeSchema = z.enum([
  "roadmap",
  "feature_hierarchy",
  "epics",
  "stories",
  "acceptance_criteria",
]);

export const syncActionSchema = z.object({
  action: z.enum(["connect", "sync"]),
});
