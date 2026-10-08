import { z } from "zod";

export const priorityEntityTypes = ["request", "feature", "story"] as const;
export const priorityMoscowValues = ["must", "should", "could", "wont_now"] as const;
export const priorityLanes = ["now", "next", "later", "unscheduled"] as const;
export const priorityFibonacci = [1, 2, 3, 5, 8, 13] as const;

export const priorityFactorsSchema = z.object({
  businessValue: z.number().int().min(1).max(5),
  urgency: z.number().int().min(1).max(5),
  userImpact: z.number().int().min(1).max(5),
  dependencyImpact: z.number().int().min(1).max(5),
  risk: z.number().int().min(1).max(5),
  effort: z.number().int().min(1).max(5),
  effortPoints: z.union(priorityFibonacci.map(value => z.literal(value))),
  bugSeverity: z.enum(["not_applicable", "low", "medium", "high", "critical"]),
}).strict();

export const priorityDecisionCommand = z.object({
  entityType: z.enum(priorityEntityTypes),
  entityId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  factors: priorityFactorsSchema,
  moscow: z.enum(priorityMoscowValues),
  roadmapLane: z.enum(priorityLanes),
  reason: z.string().trim().min(3).max(2000),
  source: z.enum(["manual", "ai"]).default("manual"),
  recommendationItemId: z.string().min(1).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (value.source === "ai" && !value.recommendationItemId) {
    context.addIssue({ code: "custom", path: ["recommendationItemId"], message: "Choose the AI recommendation being applied." });
  }
  if (value.source === "manual" && value.recommendationItemId) {
    context.addIssue({ code: "custom", path: ["recommendationItemId"], message: "Manual decisions cannot reference an AI recommendation." });
  }
});

export type PriorityFactors = z.infer<typeof priorityFactorsSchema>;
export type PriorityDecisionInput = z.infer<typeof priorityDecisionCommand>;

export type PriorityDecisionRecord = {
  id: string;
  entityType: typeof priorityEntityTypes[number];
  entityId: string;
  revision: number;
  score: number;
  dependencyAdjustedScore: number;
  moscow: typeof priorityMoscowValues[number];
  roadmapLane: typeof priorityLanes[number];
  reason: string;
  source: "manual" | "ai";
  factors: PriorityFactors;
  recommendationItemId: string | null;
  changedBy: { id: string; name: string; email: string } | null;
  createdAt: string;
};

const factorWeights = {
  businessValue: 30, urgency: 20, userImpact: 20, dependencyImpact: 10, risk: 10, effort: 10,
} as const;

export function calculatePriorityScore(factors: PriorityFactors): number {
  const keys = Object.keys(factorWeights) as (keyof typeof factorWeights)[];
  return Math.round(keys.reduce((total, key) => {
    const rating = factors[key];
    const normalized = key === "risk" || key === "effort" ? 6 - rating : rating;
    return total + (normalized - 1) / 4 * factorWeights[key];
  }, 0));
}

export function calculateDependencyAdjustedScore(score: number, dependsOnCount: number, blocksCount: number): number {
  return Math.max(0, Math.min(120, score + Math.min(15, blocksCount * 3) - Math.min(10, dependsOnCount * 2)));
}
