import { z } from "zod";

const narrative = z.string().trim().max(8000);
const shortText = z.string().trim().max(160);

export const requestKinds = ["new_feature", "enhancement", "bug", "defect", "research", "other"] as const;
export const requestSources = ["manual", "jira", "spreadsheet", "document", "meeting", "email", "other"] as const;
export const readinessValues = ["needs_clarification", "ready_for_feature", "ready_for_story", "blocked_by_decision"] as const;
export const moscowValues = ["must", "should", "could", "wont_now"] as const;
export const fibonacciEffort = [1, 2, 3, 5, 8, 13] as const;

const prioritySchema = z.object({
  businessValue: z.number().int().min(1).max(5),
  urgency: z.number().int().min(1).max(5),
  userNeed: z.number().int().min(1).max(5),
  dependencyImpact: z.number().int().min(1).max(5),
  risk: z.number().int().min(1).max(5),
  // Preserved for saved requests and feature promotion. The UI derives it
  // from the Fibonacci estimate below.
  effort: z.number().int().min(1).max(5),
  effortPoints: z.union(fibonacciEffort.map((value) => z.literal(value))).default(3),
  moscow: z.enum(moscowValues).default("should"),
  bugSeverity: z.enum(["not_applicable", "low", "medium", "high", "critical"]).default("not_applicable"),
  decision: z.enum(["untriaged", "now", "next", "later"]),
  reason: z.string().trim().max(2000),
});

export const requestSchema = z.object({
  title: z.string().trim().min(1, "Add a request title.").max(160),
  requirementsVersion: z.union([z.literal(1), z.literal(2)]).default(1),
  kind: z.enum(requestKinds),
  source: z.enum(requestSources).default("manual"),
  sourceReference: z.string().trim().max(500).default(""),
  documentUse: z.enum(["", "extract_requirements", "identify_bugs", "summarize", "create_backlog_items", "other"]).default(""),
  requestor: z.string().trim().min(1, "Add the requestor.").max(160),
  problem: narrative,
  requestedChange: narrative,
  outcome: narrative,
  userAffected: narrative.default(""),
  businessValueNarrative: narrative.default(""),
  businessRules: narrative,
  inScope: narrative.default(""),
  outOfScope: narrative.default(""),
  assumptions: narrative.default(""),
  dependencies: narrative,
  risks: narrative.default(""),
  stakeholders: narrative.default(""),
  supportingMaterials: narrative.default(""),
  definitionOfSuccess: narrative.default(""),
  readiness: z.enum(readinessValues).default("needs_clarification"),
  bug: z.object({
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
    affectedArea: shortText.default(""),
    observedBehavior: narrative.default(""),
    expectedBehavior: narrative.default(""),
    reproductionDetails: narrative.default(""),
    environment: shortText.default(""),
    status: z.enum(["reported", "confirmed", "in_progress", "resolved", "closed"]).default("reported"),
  }).default({ severity: "medium", affectedArea: "", observedBehavior: "", expectedBehavior: "", reproductionDetails: "", environment: "", status: "reported" }),
  questions: z.array(z.object({
    id: z.string().min(1).max(80), question: z.string().trim().min(1).max(1000),
    owner: z.string().trim().min(1, "Assign an owner to each question.").max(160), answer: z.string().trim().max(2000),
  })).max(30).refine((q) => new Set(q.map((x) => x.id)).size === q.length, "Question IDs must be unique."),
  status: z.enum(["new", "clarifying", "ready", "approved", "declined"]),
  priority: prioritySchema,
}).strict().superRefine((data, ctx) => {
  const isBug = data.kind === "bug" || data.kind === "defect";
  if (data.source !== "manual" && !data.sourceReference) {
    ctx.addIssue({ code: "custom", path: ["sourceReference"], message: "Add the source reference so this request remains traceable." });
  }
  if (data.source === "document" && !data.documentUse) {
    ctx.addIssue({ code: "custom", path: ["documentUse"], message: "Choose how the uploaded document should be used." });
  }
  if (isBug) {
    if (!data.bug.affectedArea) ctx.addIssue({ code: "custom", path: ["bug", "affectedArea"], message: "Add the affected area for this bug." });
    if (!data.bug.observedBehavior) ctx.addIssue({ code: "custom", path: ["bug", "observedBehavior"], message: "Describe the observed behavior." });
    if (!data.bug.expectedBehavior) ctx.addIssue({ code: "custom", path: ["bug", "expectedBehavior"], message: "Describe the expected behavior." });
  }
  if (["ready", "approved"].includes(data.status) || ["ready_for_feature", "ready_for_story"].includes(data.readiness)) {
    const gaps = data.requirementsVersion === 1 && data.readiness === "needs_clarification"
      ? coreRequirementGaps(data)
      : requirementGaps(data);
    for (const gap of gaps) ctx.addIssue({ code: "custom", message: gap });
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

export function requirementGaps(data: Pick<RequestInput,
  "problem" | "requestedChange" | "outcome" | "userAffected" | "businessValueNarrative" | "businessRules" |
  "inScope" | "outOfScope" | "assumptions" | "dependencies" | "risks" | "stakeholders" | "supportingMaterials" |
  "definitionOfSuccess" | "questions"
>): string[] {
  const fields: [keyof typeof data, string][] = [
    ["problem", "Describe the problem being solved."], ["requestedChange", "Describe the requested change."],
    ["outcome", "Describe the requested outcome."], ["userAffected", "Identify the user or customer affected."],
    ["businessValueNarrative", "Describe the business value."], ["businessRules", "Record business rules, or state that none are known."],
    ["inScope", "Define what is in scope."], ["outOfScope", "Define what is out of scope."],
    ["assumptions", "Record assumptions, or state that none are known."], ["dependencies", "Record dependencies, or state that none are known."],
    ["risks", "Record risks, or state that none are known."], ["stakeholders", "Identify stakeholders and decision makers."],
    ["supportingMaterials", "Reference supporting material, or state that none exists."], ["definitionOfSuccess", "Define how success will be measured."],
  ];
  const gaps = fields.filter(([key]) => !String(data[key]).trim()).map(([, message]) => message);
  if (data.questions.some((q) => !q.answer.trim())) gaps.push("Answer all open questions before marking requirements ready.");
  return gaps;
}

function coreRequirementGaps(data: Pick<RequestInput, "problem" | "requestedChange" | "outcome" | "questions">): string[] {
  const gaps: string[] = [];
  if (!data.problem.trim()) gaps.push("Describe the problem being solved.");
  if (!data.requestedChange.trim()) gaps.push("Describe the requested change.");
  if (!data.outcome.trim()) gaps.push("Describe the requested outcome.");
  if (data.questions.some((q) => !q.answer.trim())) gaps.push("Answer all open questions before marking requirements ready.");
  return gaps;
}

export const priorityFactors = [
  { key: "businessValue", label: "Business value", weight: 30, help: "1 = low value; 5 = critical value" },
  { key: "urgency", label: "Urgency", weight: 20, help: "1 = flexible; 5 = time critical" },
  { key: "userNeed", label: "User impact", weight: 20, help: "1 = minor; 5 = essential" },
  { key: "dependencyImpact", label: "Dependency impact", weight: 10, help: "1 = unblocks little; 5 = unblocks major work" },
  { key: "risk", label: "Delivery risk", weight: 10, help: "1 = low risk; 5 = high risk (reduces score)" },
  { key: "effort", label: "Effort", weight: 10, help: "Fibonacci estimate; larger work reduces the score" },
] as const;

export function effortRating(points: number): number {
  if (points <= 1) return 1;
  if (points <= 3) return 2;
  if (points <= 5) return 3;
  if (points <= 8) return 4;
  return 5;
}

export function priorityScore(priority: RequestInput["priority"]) {
  return Math.round(priorityFactors.reduce((sum, factor) => {
    const rating = priority[factor.key];
    return sum + ((factor.key === "risk" || factor.key === "effort" ? 6 - rating : rating) - 1) / 4 * factor.weight;
  }, 0));
}

export function priorityExplanation(priority: RequestInput["priority"]): string {
  const strengths = priorityFactors.filter((factor) => factor.key !== "risk" && factor.key !== "effort")
    .sort((a, b) => priority[b.key] - priority[a.key]).slice(0, 2).map((factor) => factor.label.toLowerCase());
  const constraints = [priority.risk >= 4 ? "delivery risk" : null, priority.effort >= 4 ? "effort" : null].filter(Boolean);
  return `${strengths.join(" and ")} are the strongest value drivers${constraints.length ? `; ${constraints.join(" and ")} reduce the score` : "; no major risk or effort penalty is applied"}.`;
}

export function emptyRequest(): RequestInput {
  return {
    title: "", requirementsVersion: 2, kind: "new_feature", source: "manual", sourceReference: "", documentUse: "", requestor: "",
    problem: "", requestedChange: "", outcome: "", userAffected: "", businessValueNarrative: "", businessRules: "",
    inScope: "", outOfScope: "", assumptions: "", dependencies: "", risks: "", stakeholders: "",
    supportingMaterials: "", definitionOfSuccess: "", readiness: "needs_clarification",
    bug: { severity: "medium", affectedArea: "", observedBehavior: "", expectedBehavior: "", reproductionDetails: "", environment: "", status: "reported" },
    questions: [], status: "new",
    priority: { businessValue: 3, urgency: 3, userNeed: 3, dependencyImpact: 3, risk: 3, effort: 3, effortPoints: 5,
      moscow: "should", bugSeverity: "not_applicable", decision: "untriaged", reason: "" },
  };
}
