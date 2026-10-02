import { z } from "zod";

const narrative = z.string().trim().max(8000);
export const requestSchema = z.object({
  title: z.string().trim().min(1, "Add a request title.").max(160),
  kind: z.enum(["new_feature", "enhancement", "defect"]),
  requestor: z.string().trim().min(1, "Add the requestor.").max(160),
  problem: narrative, requestedChange: narrative, outcome: narrative,
  businessRules: narrative, dependencies: narrative,
  questions: z.array(z.object({
    id: z.string().min(1).max(80), question: z.string().trim().min(1).max(1000),
    owner: z.string().trim().min(1, "Assign an owner to each question.").max(160), answer: z.string().trim().max(2000),
  })).max(30).refine(q => new Set(q.map(x => x.id)).size === q.length, "Question IDs must be unique."),
  status: z.enum(["new", "clarifying", "ready", "approved", "declined"]),
  priority: z.object({
    businessValue: z.number().int().min(1).max(5), urgency: z.number().int().min(1).max(5),
    userNeed: z.number().int().min(1).max(5), dependencyImpact: z.number().int().min(1).max(5),
    risk: z.number().int().min(1).max(5), effort: z.number().int().min(1).max(5),
    decision: z.enum(["untriaged", "now", "next", "later"]), reason: z.string().trim().max(2000),
  }),
}).strict().superRefine((data, ctx) => {
  if (["ready", "approved"].includes(data.status)) {
    for (const gap of requirementGaps(data)) ctx.addIssue({ code: "custom", message: gap });
  }
  if (data.priority.decision !== "untriaged" && !data.priority.reason) {
    ctx.addIssue({ code: "custom", path: ["priority", "reason"], message: "Explain the PO's priority decision." });
  }
  if (data.status === "approved" && data.priority.decision === "untriaged") {
    ctx.addIssue({ code: "custom", message: "Make a priority decision before approving this request." });
  }
});

export type RequestInput = z.infer<typeof requestSchema>;
export type RequestRecord = RequestInput & { id: string; revision: number; capabilityId: string | null; updatedAt: string };

export function requirementGaps(data: Pick<RequestInput, "problem" | "requestedChange" | "outcome" | "questions">): string[] {
  const gaps: string[] = [];
  if (!data.problem.trim()) gaps.push("Describe the problem.");
  if (!data.requestedChange.trim()) gaps.push("Describe the requested change.");
  if (!data.outcome.trim()) gaps.push("Describe the expected outcome.");
  if (data.questions.some(q => !q.answer.trim())) gaps.push("Answer all open questions before marking requirements ready.");
  return gaps;
}

export const priorityFactors = [
  { key: "businessValue", label: "Business value", weight: 30, help: "1 = low value; 5 = critical value" },
  { key: "urgency", label: "Urgency", weight: 20, help: "1 = flexible; 5 = time critical" },
  { key: "userNeed", label: "User need", weight: 20, help: "1 = minor; 5 = essential" },
  { key: "dependencyImpact", label: "Dependency impact", weight: 10, help: "1 = unblocks little; 5 = unblocks major work" },
  { key: "risk", label: "Delivery risk", weight: 10, help: "1 = low risk; 5 = high risk (reduces score)" },
  { key: "effort", label: "Effort", weight: 10, help: "1 = small; 5 = large (reduces score)" },
] as const;

/** Request triage score; does not replace the existing roadmap planning engine. */
export function priorityScore(priority: RequestInput["priority"]) {
  return Math.round(priorityFactors.reduce((sum, factor) => {
    const rating = priority[factor.key];
    return sum + ((factor.key === "risk" || factor.key === "effort" ? 6 - rating : rating) - 1) / 4 * factor.weight;
  }, 0));
}

export function emptyRequest(): RequestInput {
  return { title: "", kind: "new_feature", requestor: "", problem: "", requestedChange: "", outcome: "",
    businessRules: "", dependencies: "", questions: [], status: "new",
    priority: { businessValue: 3, urgency: 3, userNeed: 3, dependencyImpact: 3, risk: 3, effort: 3, decision: "untriaged", reason: "" } };
}
