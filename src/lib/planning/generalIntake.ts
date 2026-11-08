import { z } from "zod";

/** Drafts accept incomplete context. Readiness is checked at the requested action. */
export const generalIntakeSchema = z.object({
  name: z.string().trim().min(3).max(160),
  problemStatement: z.string().trim().max(12000).default(""),
  targetCustomer: z.string().trim().max(4000).default(""),
  outcomeStatement: z.string().trim().max(12000).default(""),
  methodology: z.enum(["agile_scrum", "hybrid", "kanban", "waterfall"]).default("agile_scrum"),
  projectId: z.string().min(1).nullable().optional(),
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
}).strict();

export type GeneralIntakeValues = Pick<z.infer<typeof generalIntakeSchema>,
  "name" | "problemStatement" | "targetCustomer" | "outcomeStatement" | "methodology">;

export const EMPTY_GENERAL_INTAKE: GeneralIntakeValues = {
  name: "", problemStatement: "", targetCustomer: "", outcomeStatement: "", methodology: "agile_scrum",
};

/** Either editor can change intake; both timestamps participate in optimistic concurrency. */
export function generalIntakeVersion(row: { updatedAt: Date; intakeAnswerSet?: { updatedAt?: Date } | null }) {
  return new Date(Math.max(row.updatedAt.getTime(), row.intakeAnswerSet?.updatedAt?.getTime() ?? 0)).toISOString();
}
