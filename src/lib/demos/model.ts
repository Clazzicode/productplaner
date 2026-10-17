import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const text = z.string().trim().max(8000);
export const demoStatusSchema = z.enum(["proposed", "preparing", "ready", "not_ready", "demonstrated", "skipped", "carried_over"]);

export const demoCreateSchema = z.object({
  sprintId: id, storyId: id.nullable().optional(), bugId: id.nullable().optional(), capabilityId: id.nullable().optional(),
  title: z.string().trim().min(3).max(300), purpose: text.default(""), presenterStakeholderId: id.nullable().optional(),
  notes: text.default(""), completedWork: text.default(""), plannedOrder: z.number().int().min(0).max(10_000).default(0),
  repeatReason: z.string().trim().max(2000).default(""), evidenceLinks: z.array(z.string().trim().url().max(2000)).max(20).default([]),
}).strict().refine((value) => Number(Boolean(value.storyId)) + Number(Boolean(value.bugId)) === 1, "Choose exactly one sprint story or bug.");

const base = z.object({ expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) }).strict();
export const demoCommandSchema = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("update"), title: z.string().trim().min(3).max(300), purpose: text,
    presenterStakeholderId: id.nullable(), notes: text, completedWork: text, plannedOrder: z.number().int().min(0).max(10_000),
    evidenceLinks: z.array(z.string().trim().url().max(2000)).max(20), suggestionId: id.nullable().optional(),
    suggestionKind: z.enum(["purpose", "completed_work"]).nullable().optional() }).strict(),
  base.extend({ action: z.literal("decide"), status: z.enum(["ready", "not_ready"]), readinessReason: text,
    blockingReason: text, overrideReason: text }).strict(),
  base.extend({ action: z.literal("outcome"), status: z.enum(["demonstrated", "skipped"]), notes: text }).strict(),
  base.extend({ action: z.literal("carryover"), targetSprintId: id, carryoverReason: z.string().trim().min(3).max(4000) }).strict(),
]);

export const demoSuggestionCommandSchema = z.object({ action: z.literal("dismiss") }).strict();
export const demoDraftSchema = z.object({ kind: z.enum(["purpose", "completed_work"]) }).strict();
export type DemoCreateInput = z.infer<typeof demoCreateSchema>;
export type DemoCommandInput = z.infer<typeof demoCommandSchema>;
