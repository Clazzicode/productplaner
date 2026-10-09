import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const optionalOwner = id.nullable().optional();

export const refinementSessionCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scheduledAt: z.coerce.date().nullable().optional(),
  facilitatorUserId: optionalOwner,
  purpose: z.string().trim().max(4000).default(""),
  agenda: z.string().trim().max(8000).default(""),
  storyIds: z.array(id).max(100).default([]),
  bugIds: z.array(id).max(100).default([]),
}).strict().refine((data) => data.storyIds.length + data.bugIds.length > 0, "Select at least one story or bug.");

export const refinementSessionUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  facilitatorUserId: optionalOwner,
  purpose: z.string().trim().max(4000).optional(),
  agenda: z.string().trim().max(8000).optional(),
  notes: z.string().trim().max(30_000).optional(),
  summary: z.string().trim().max(12_000).optional(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const refinementQuestionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  question: z.string().trim().min(1).max(2000),
  answer: z.string().trim().max(4000).default(""),
  ownerUserId: optionalOwner,
  dueAt: z.coerce.date().nullable().optional(),
}).strict();

export const refinementDecisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(1000),
  rationale: z.string().trim().min(1).max(4000),
  decidedByUserId: optionalOwner,
}).strict();

export const refinementActionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(1000),
  ownerUserId: optionalOwner,
  dueAt: z.coerce.date().nullable().optional(),
}).strict();

export const refinementItemUpdateSchema = z.object({
  expectedRevision: z.number().int().positive(),
  itemId: id,
  status: z.enum(["selected", "discussed", "deferred", "ready"]).optional(),
  estimateBefore: z.number().int().positive().max(1000).nullable().optional(),
  estimateAfter: z.number().int().positive().max(1000).nullable().optional(),
  scopeChange: z.string().trim().max(4000).optional(),
  outcome: z.string().trim().max(4000).optional(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export type RefinementSessionCreate = z.infer<typeof refinementSessionCreateSchema>;
export type RefinementSessionUpdate = z.infer<typeof refinementSessionUpdateSchema>;
export type RefinementQuestionCreate = z.infer<typeof refinementQuestionSchema>;
export type RefinementDecisionCreate = z.infer<typeof refinementDecisionSchema>;
export type RefinementActionCreate = z.infer<typeof refinementActionSchema>;
export type RefinementItemUpdate = z.infer<typeof refinementItemUpdateSchema>;
