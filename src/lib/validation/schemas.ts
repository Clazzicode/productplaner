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
  targetLaunchDate: z.coerce.date().nullable().optional(),
  budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
  averageHourlyRate: z.number().min(1).max(5000).optional(),
});

export const initiativePatchSchema = z
  .object({
    name: z.string().trim().min(3).optional(),
    description: z.string().trim().optional(),
    targetLaunchDate: z.coerce.date().nullable().optional(),
    budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
    averageHourlyRate: z.number().min(1).max(5000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const intakePatchSchema = z.object({
  problemStatement: z.string().optional(),
  targetCustomer: z.string().optional(),
  outcomeStatement: z.string().optional(),
  outcomeMetric: z.string().optional(),
  teamSize: z.number().int().min(1).max(200).nullable().optional(),
  sprintLengthWeeks: z.number().int().min(1).max(4).optional(),
  velocityPerPersonPerSprint: z.number().min(0.5).max(40).optional(),
  capacityBufferPercent: z.number().int().min(0).max(90).optional(),
  hoursPerSprintPerMember: z.number().min(1).max(400).optional(),
  utilizationRatePercent: z.number().int().min(10).max(100).optional(),
  hoursPerStoryPoint: z.number().min(1).max(40).optional(),
  historicalVelocityPoints: z.number().min(0).max(1000).nullable().optional(),
});

// Capacity/cost assumptions stay editable after generation (§29 recalculation
// inputs) — unlike intake answers, which are permanent (FR-06).
export const assumptionsPatchSchema = z
  .object({
    averageHourlyRate: z.number().min(1).max(5000).optional(),
    budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
    targetLaunchDate: z.coerce.date().nullable().optional(),
    utilizationRatePercent: z.number().int().min(10).max(100).optional(),
    capacityBufferPercent: z.number().int().min(0).max(90).optional(),
    hoursPerStoryPoint: z.number().min(1).max(40).optional(),
    hoursPerSprintPerMember: z.number().min(1).max(400).optional(),
    historicalVelocityPoints: z.number().min(0).max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const effortSizeSchema = z.enum(["xs", "s", "m", "l", "xl"]);
export const businessValueSchema = z.enum(["very_low", "low", "medium", "high", "critical"]);
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const mvpImportanceSchema = z.enum([
  "required_for_mvp",
  "strongly_preferred",
  "useful_not_required",
  "future_enhancement",
  "optional",
]);

const factorScore = z.number().int().min(1).max(5).nullable().optional();

export const capabilityUpsertSchema = z.object({
  name: z.string().trim().min(3, "Name the capability (3+ characters)."),
  description: z.string().trim().default(""),
  isMvp: z.boolean(),
  effortSize: effortSizeSchema,
  businessValue: businessValueSchema,
  riskLevel: riskLevelSchema.default("medium"),
  mvpImportance: mvpImportanceSchema.nullable().optional(),
  customerImpactScore: factorScore,
  revenueImpactScore: factorScore,
  strategicAlignmentScore: factorScore,
  riskComplianceScore: factorScore,
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

export const integrationActionSchema = z.object({
  action: z.enum(["connect", "configure", "sync", "disconnect", "reconnect"]),
  connectionId: z.string().optional(),
  initiativeId: z.string().nullable().optional(),
  workspaceName: z.string().trim().max(120).optional(),
  workspaceUrl: z.string().trim().max(300).optional(),
  projectKey: z.string().trim().max(20).optional(),
  projectName: z.string().trim().max(120).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
