import { z } from "zod";

const id = z.string().trim().min(1).max(191);
export const clarificationUrgencySchema = z.enum(["low", "normal", "high", "urgent"]);
export const clarificationImpactSchema = z.enum([
  "none", "clarification_only", "acceptance_criteria_change", "scope_change",
  "estimate_impact", "schedule_impact", "follow_up_work",
]);

export const clarificationCreateSchema = z.object({
  sprintId: id,
  storyId: id.nullable().optional(),
  bugId: id.nullable().optional(),
  question: z.string().trim().min(5).max(3000),
  context: z.string().trim().max(8000).default(""),
  urgency: clarificationUrgencySchema.default("normal"),
  ownerUserId: id.nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  externalReference: z.string().trim().max(300).nullable().optional(),
}).strict().refine((value) => Number(Boolean(value.storyId)) + Number(Boolean(value.bugId)) === 1, {
  message: "Choose exactly one sprint story or bug.",
});

const commandBase = z.object({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const clarificationAnswerSchema = commandBase.extend({
  action: z.literal("answer"),
  answer: z.string().trim().min(3).max(12_000),
  rationale: z.string().trim().max(4000).default(""),
  impact: clarificationImpactSchema,
  suggestionId: id.nullable().optional(),
}).strict().superRefine((value, context) => {
  if (!["none", "clarification_only"].includes(value.impact) && value.rationale.trim().length < 5) {
    context.addIssue({ code: "custom", path: ["rationale"], message: "Explain the impact on approved work." });
  }
});

export const clarificationCommandSchema = z.discriminatedUnion("action", [
  clarificationAnswerSchema,
  commandBase.extend({ action: z.literal("acknowledge") }).strict(),
  commandBase.extend({ action: z.literal("resolve") }).strict(),
  commandBase.extend({ action: z.literal("reopen") }).strict(),
  commandBase.extend({ action: z.literal("withdraw") }).strict(),
  commandBase.extend({ action: z.literal("create_follow_up"), title: z.string().trim().min(3).max(160) }).strict(),
]);

export const clarificationSuggestionCommandSchema = z.object({
  action: z.enum(["use", "dismiss"]),
}).strict();

export type ClarificationCreateInput = z.infer<typeof clarificationCreateSchema>;
export type ClarificationCommandInput = z.infer<typeof clarificationCommandSchema>;

export const OPEN_CLARIFICATION_STATUSES = ["open", "answered", "acknowledged"] as const;

