import { z } from "zod";

export const workTargetTypes = ["feature", "story", "bug", "sprint", "release"] as const;
export const workTargetSchema = z.object({ type: z.enum(workTargetTypes), id: z.string().trim().min(1).max(191) });

export const dependencyCreateSchema = z.object({
  predecessor: workTargetSchema,
  dependent: workTargetSchema,
  dependencyType: z.enum(["depends_on", "blocks"]).default("depends_on"),
  description: z.string().trim().max(2000).default(""),
}).strict();

export const blockerCreateSchema = z.object({
  target: workTargetSchema,
  blockerType: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(4000),
  ownerUserId: z.string().trim().min(1).max(191).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
}).strict();

export const blockerUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  status: z.enum(["open", "in_progress", "resolved", "accepted"]).optional(),
  ownerUserId: z.string().trim().min(1).max(191).nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  resolution: z.string().trim().max(4000).optional(),
  overrideReason: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict().superRefine((data, ctx) => {
  if (data.status === "resolved" && !data.resolution) ctx.addIssue({ code: "custom", path: ["resolution"], message: "Record how the blocker was resolved." });
  if (data.status === "accepted" && !data.overrideReason) ctx.addIssue({ code: "custom", path: ["overrideReason"], message: "Explain why the blocker is being accepted." });
});

export type WorkTarget = z.infer<typeof workTargetSchema>;
export type DependencyCreate = z.infer<typeof dependencyCreateSchema>;
export type BlockerCreate = z.infer<typeof blockerCreateSchema>;
export type BlockerUpdate = z.infer<typeof blockerUpdateSchema>;
