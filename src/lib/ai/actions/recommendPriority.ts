import { z } from "zod";
import type { AiAssistItem } from "@prisma/client";
import type { AiTool } from "@/lib/ai/providerTypes";
import type { ContextTier } from "@/lib/ai/context/types";
import { db } from "@/lib/db";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { GLOBAL_PRODUCT_PLANNING_RULES } from "@/lib/ai/methodologyRules";
import { hashFingerprintPayload } from "@/lib/generation/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import { listUnifiedBacklog } from "@/lib/backlog/unified";
import { priorityFactorsSchema, priorityLanes, priorityMoscowValues } from "@/lib/prioritization/model";

const recommendationSchema = z.object({
  factors: priorityFactorsSchema,
  moscow: z.enum(priorityMoscowValues),
  roadmapLane: z.enum(priorityLanes),
  reason: z.string().trim().min(3).max(2000),
  informationUsed: z.string().trim().min(1).max(4000),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(8),
}).strict();

const TOOL_NAME = "submit_priority_recommendation";
const TOOL: AiTool = {
  name: TOOL_NAME,
  description: "Submit one explainable priority recommendation for Product Owner review.",
  input_schema: {
    type: "object",
    properties: {
      factors: {
        type: "object",
        properties: {
          businessValue: { type: "integer", minimum: 1, maximum: 5 },
          urgency: { type: "integer", minimum: 1, maximum: 5 },
          userImpact: { type: "integer", minimum: 1, maximum: 5 },
          dependencyImpact: { type: "integer", minimum: 1, maximum: 5 },
          risk: { type: "integer", minimum: 1, maximum: 5 },
          effort: { type: "integer", minimum: 1, maximum: 5 },
          effortPoints: { type: "integer", enum: [1, 2, 3, 5, 8, 13] },
          bugSeverity: { type: "string", enum: ["not_applicable", "low", "medium", "high", "critical"] },
        },
        required: ["businessValue", "urgency", "userImpact", "dependencyImpact", "risk", "effort", "effortPoints", "bugSeverity"],
      },
      moscow: { type: "string", enum: [...priorityMoscowValues] },
      roadmapLane: { type: "string", enum: [...priorityLanes] },
      reason: { type: "string" },
      informationUsed: { type: "string" },
      assumptions: { type: "array", maxItems: 8, items: { type: "string" } },
    },
    required: ["factors", "moscow", "roadmapLane", "reason", "informationUsed", "assumptions"],
  },
};

export async function computePriorityRecommendationFingerprint(initiativeId: string, entityType: string, entityId: string): Promise<string> {
  const item = (await listUnifiedBacklog(initiativeId)).find(candidate => candidate.recordType === entityType && candidate.id === entityId);
  if (!item) throw new Error("Backlog item not found.");
  return hashFingerprintPayload(JSON.stringify(item));
}

export async function runPriorityRecommendation(params: {
  initiativeId: string;
  entityType: "request" | "feature" | "story";
  entityId: string;
  userId: string;
  organizationId: string;
}): Promise<{ decision: "generate_new" | "reuse" | "flag_stale"; items: AiAssistItem[] }> {
  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: params.initiativeId },
    select: { projectId: true, organizationId: true },
  });
  if (initiative.organizationId !== params.organizationId) throw new Error("Backlog item is outside this organization.");
  const item = (await listUnifiedBacklog(params.initiativeId)).find(candidate =>
    candidate.recordType === params.entityType && candidate.id === params.entityId
  );
  if (!item) throw new Error("Backlog item not found.");
  const fingerprint = await computePriorityRecommendationFingerprint(params.initiativeId, params.entityType, params.entityId);
  const taskTier: ContextTier = {
    layer: "task",
    priority: 100,
    required: true,
    label: "Backlog item to prioritize",
    content: JSON.stringify(item, null, 2),
    sourceType: item.recordType,
    sourceId: item.id,
  };
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\nRecommend priority for exactly one backlog item using only supplied facts. Score business value, urgency, user impact, dependency impact, delivery risk, and Fibonacci effort. Distinguish MoSCoW necessity, priority score, and Now/Next/Later placement. Explain the recommendation and identify assumptions. Do not modify any record. The Product Owner must explicitly apply or dismiss this recommendation.`;
  const result = await runAssistAction({
    action: "RECOMMEND_PRIORITY",
    userId: params.userId,
    organizationId: params.organizationId,
    projectId: initiative.projectId,
    initiativeId: params.initiativeId,
    reuseScope: { targetType: `priority_${params.entityType}`, targetId: params.entityId },
    freshFingerprint: fingerprint,
    tool: TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [taskTier],
    schema: recommendationSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => [{
      targetType: `priority_${params.entityType}`,
      targetId: params.entityId,
      title: `Priority recommendation for ${item.title}`,
      synopsis: parsed.reason,
      informationUsed: parsed.informationUsed,
      why: parsed.reason,
      impact: "Applying records a new priority decision and immutable history entry. Nothing changes until the Product Owner applies it.",
      assumptions: parsed.assumptions,
      sources: [`${item.recordType}:${item.id}`],
      rulesApplied: ["AI recommends; an owner or administrator makes the final decision.", "Priority changes require a reason."],
      proposedContent: {
        entityType: params.entityType,
        entityId: params.entityId,
        factors: parsed.factors,
        moscow: parsed.moscow,
        roadmapLane: params.entityType === "story" ? item.roadmapLane : parsed.roadmapLane,
        reason: parsed.reason,
      },
    }],
  });
  return { decision: result.decision, items: result.items };
}
