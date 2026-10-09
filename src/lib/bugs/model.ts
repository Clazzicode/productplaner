import { z } from "zod";

const optionalId = z.string().trim().min(1).max(191).nullable().optional();

export const bugPlanningUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  bugType: z.string().trim().min(1).max(80).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["open", "in_progress", "resolved", "closed", "accepted"]).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  environment: z.string().trim().max(500).optional(),
  readinessStatus: z.enum(["needs_refinement", "ready_for_refinement", "sprint_ready", "blocked"]).optional(),
  affectedCapabilityId: optionalId,
  affectedStoryId: optionalId,
  affectedSprintId: optionalId,
  affectedReleaseId: optionalId,
  ownerUserId: optionalId,
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type BugPlanningUpdate = z.infer<typeof bugPlanningUpdateSchema>;
