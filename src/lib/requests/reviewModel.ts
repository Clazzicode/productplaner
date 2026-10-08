import { z } from "zod";

export const requirementReviewFieldSchema = z.enum([
  "problem", "requestedChange", "outcome", "userAffected", "businessValueNarrative", "businessRules",
  "inScope", "outOfScope", "assumptions", "dependencies", "risks", "stakeholders",
  "supportingMaterials", "definitionOfSuccess", "questions", "readiness",
]);

const requirementReviewFindingFields = {
  category: z.enum(["follow_up_question", "contradiction", "missing_business_rule", "risk", "dependency", "engineering_question", "missing_information"]),
  fieldKey: requirementReviewFieldSchema,
  title: z.string().trim().min(3).max(160),
  detail: z.string().trim().min(3).max(2000),
  proposedValue: z.string().trim().max(8000).default(""),
  question: z.string().trim().max(1000).default(""),
};

const validateFinding = (value: { fieldKey: z.infer<typeof requirementReviewFieldSchema>; proposedValue: string; question: string }, ctx: z.core.$RefinementCtx<unknown>) => {
  if (value.fieldKey === "questions" && !value.question) ctx.addIssue({ code: "custom", path: ["question"], message: "A question suggestion must include the question." });
  if (value.fieldKey !== "questions" && !value.proposedValue) ctx.addIssue({ code: "custom", path: ["proposedValue"], message: "A requirement suggestion must include proposed wording." });
};

const requirementReviewSuggestionSchema = z.object(requirementReviewFindingFields).strict().superRefine(validateFinding);

export const requirementReviewFindingSchema = z.object({
  requestId: z.string().min(1),
  ...requirementReviewFindingFields,
}).strict().superRefine(validateFinding);

export const requirementReviewResultSchema = z.object({
  findings: z.array(requirementReviewSuggestionSchema).max(12),
  readiness: z.enum(["needs_clarification", "ready_for_feature", "ready_for_story", "blocked_by_decision"]),
  summary: z.string().trim().min(3).max(2000),
  informationUsed: z.string().trim().min(3).max(2000),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  sources: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
}).strict();

export type RequirementReviewFinding = z.infer<typeof requirementReviewFindingSchema>;
