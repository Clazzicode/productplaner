import { z } from "zod";
const id = z.string().trim().min(1).max(191);
const criterion = z.object({ criterionId: id, result: z.enum(["pending", "met", "not_met", "not_demonstrated", "not_applicable"]), reason: z.string().trim().max(4000), evidenceNotes: z.string().trim().max(8000) }).strict();
export const validationCreateSchema = z.object({ sprintId: id, storyId: id, demoItemId: id.nullable().optional(), sprintReviewId: id.nullable().optional() }).strict();
export const validationCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), expectedRevision: z.number().int().positive(), validatorStakeholderId: id.nullable(), evidenceNotes: z.string().trim().max(30_000), evidenceLinks: z.array(z.string().trim().url().max(2000)).max(30), criteria: z.array(criterion).max(100), reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal("finalize"), expectedRevision: z.number().int().positive(), status: z.enum(["accepted", "rejected", "changes_needed"]), decisionReason: z.string().trim().min(3).max(8000), criteria: z.array(criterion).min(1).max(100), createFollowUp: z.boolean(), followUpTitle: z.string().trim().max(160), reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal("use_ai"), expectedRevision: z.number().int().positive(), suggestionId: id, evidenceNotes: z.string().trim().min(3).max(30_000), reason: z.string().trim().min(3).max(1000) }).strict(),
]);
export const validationAiSchema = z.object({}).strict();
export const validationSuggestionSchema = z.object({ action: z.literal("dismiss") }).strict();
export type ValidationCommand = z.infer<typeof validationCommandSchema>;
