import { z } from "zod";

export const sprintItemTargetSchema = z.object({
  type: z.enum(["story", "bug"]),
  id: z.string().trim().min(1).max(191),
});

export const readinessDecisionSchema = z.object({
  target: sprintItemTargetSchema,
  decision: z.enum(["ready", "not_ready", "overridden"]),
  reason: z.string().trim().min(3).max(2000),
}).strict().superRefine((data, ctx) => {
  if (data.decision === "overridden" && data.reason.length < 5) ctx.addIssue({ code: "custom", path: ["reason"], message: "Explain why readiness is being overridden." });
});

export const sprintPlanSaveSchema = z.object({
  sprintId: z.string().trim().min(1).max(191),
  expectedRevision: z.number().int().positive().nullable().optional(),
  goal: z.string().trim().min(3).max(2000),
  cadence: z.string().trim().max(100).default(""),
  commit: z.boolean().default(false),
  items: z.array(z.object({
    target: sprintItemTargetSchema,
    estimatePoints: z.number().positive().max(1000),
    carryoverReason: z.string().trim().max(2000).default(""),
    overrideReason: z.string().trim().max(2000).default(""),
  })).max(500),
}).strict().superRefine((data, ctx) => {
  const keys = data.items.map((item) => `${item.target.type}:${item.target.id}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["items"], message: "A work item can appear only once in a sprint plan." });
});

export type SprintItemTarget = z.infer<typeof sprintItemTargetSchema>;
export type ReadinessDecisionInput = z.infer<typeof readinessDecisionSchema>;
export type SprintPlanSaveInput = z.infer<typeof sprintPlanSaveSchema>;
