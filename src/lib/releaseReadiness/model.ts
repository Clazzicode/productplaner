import { z } from "zod";

const id = z.string().trim().min(1).max(191);
const reason = z.string().trim().min(3).max(1000);

export const releaseReadinessCreateSchema = z.object({ releaseId: id }).strict();

export const releaseReadinessCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh"), expectedRevision: z.number().int().positive(), reason }).strict(),
  z.object({ action: z.literal("update"), expectedRevision: z.number().int().positive(), summary: z.string().trim().max(20_000), stakeholderCommunication: z.string().trim().max(20_000), communicationOwnerStakeholderId: id.nullable(), communicationStatus: z.enum(["not_started", "drafted", "sent"]), reason }).strict(),
  z.object({ action: z.literal("override_check"), expectedRevision: z.number().int().positive(), checkKey: id, overrideReason: z.string().trim().min(5).max(4000), reason }).strict(),
  z.object({ action: z.literal("mark_ready"), expectedRevision: z.number().int().positive(), reason }).strict(),
  z.object({ action: z.literal("approve"), expectedRevision: z.number().int().positive(), decisionReason: z.string().trim().min(3).max(8000), reason }).strict(),
  z.object({ action: z.literal("reopen"), expectedRevision: z.number().int().positive(), reason }).strict(),
  z.object({ action: z.literal("use_ai"), expectedRevision: z.number().int().positive(), suggestionId: id, summary: z.string().trim().min(3).max(20_000), stakeholderCommunication: z.string().trim().max(20_000), reason }).strict(),
]);

export const releaseReadinessAiSchema = z.object({}).strict();
export const releaseReadinessSuggestionSchema = z.object({ action: z.literal("dismiss") }).strict();
export type ReleaseReadinessCommand = z.infer<typeof releaseReadinessCommandSchema>;

