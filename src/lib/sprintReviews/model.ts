import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const text = z.string().trim().max(30_000);

export const reviewGenerateSchema = z.object({ sprintId: id, expectedRevision: z.number().int().positive().optional(), reason: z.string().trim().min(3).max(1000).default("Sprint review refreshed") }).strict();

export const reviewCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), expectedRevision: z.number().int().positive(), title: z.string().trim().min(3).max(300), scheduledAt: z.coerce.date().nullable(), facilitatorStakeholderId: id.nullable(), purpose: text, notes: text, transcriptText: text, transcriptDocumentId: id.nullable(), outcome: text, participantIds: z.array(id).max(100), summary: z.string().trim().max(12_000), reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal("decision"), expectedRevision: z.number().int().positive(), title: z.string().trim().min(1).max(1000), rationale: z.string().trim().min(1).max(4000), decisionMakerStakeholderId: id.nullable(), reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal("follow_up"), expectedRevision: z.number().int().positive(), title: z.string().trim().min(1).max(1000), ownerStakeholderId: id.nullable(), dueAt: z.coerce.date().nullable(), reason: z.string().trim().min(3).max(1000), suggestionId: id.nullable().optional() }).strict(),
  z.object({ action: z.literal("finalize"), expectedRevision: z.number().int().positive(), overrideReason: z.string().trim().max(4000), reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal("reopen"), expectedRevision: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) }).strict(),
  z.object({ action: z.literal("use_summary"), expectedRevision: z.number().int().positive(), suggestionId: id, summary: z.string().trim().min(3).max(12_000), reason: z.string().trim().min(3).max(1000) }).strict(),
]);

export const reviewAiSchema = z.object({}).strict();
export const reviewSuggestionSchema = z.object({ action: z.literal("dismiss") }).strict();
export type ReviewCommand = z.infer<typeof reviewCommandSchema>;
