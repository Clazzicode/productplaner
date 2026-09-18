import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveMethodology } from "@/lib/generation/methodology";
import { recommendSprintsResultSchema } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeSprintRecommendationFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { ContextTier } from "@/lib/ai/context/types";
import type { AiAssistItem } from "@prisma/client";

// RECOMMEND_SPRINTS (Section 4 §18/§19) — uses only user-provided team size/
// velocity/capacity fields already entered on IntakeAnswerSet; never invents
// a number. Short-circuits with InsufficientContextError (no AI call at all)
// when team size hasn't been entered yet, matching "if required delivery
// information is missing, ask for it."

const TOOL_NAME = "submit_sprint_recommendation";

const SPRINT_RECOMMENDATION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit one sprint structure recommendation, using only the capacity figures given.",
  input_schema: {
    type: "object",
    properties: {
      recommendationType: { type: "string", enum: ["new_structure", "adjustment"] },
      targetSprintId: { type: ["string", "null"], description: "Set only for recommendationType \"adjustment\"." },
      note: { type: "string", description: "Plain-language recommendation — never restate a specific capacity number as if you computed it." },
      storyIdsToMove: { type: "array", items: { type: "string" } },
      why: { type: "string" },
      informationUsed: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["recommendationType", "note", "why", "informationUsed"],
  },
};

export interface RunRecommendSprintsParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunRecommendSprintsResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runRecommendSprints(params: RunRecommendSprintsParams): Promise<RunRecommendSprintsResult> {
  const { initiativeId, userId, organizationId } = params;

  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      projectId: true,
      methodology: true,
      intakeAnswerSet: {
        select: {
          teamSize: true,
          sprintLengthWeeks: true,
          velocityPerPersonPerSprint: true,
          historicalVelocityPoints: true,
        },
      },
      prototype: {
        select: {
          sprints: {
            orderBy: { sprintNumber: "asc" },
            select: { id: true, sprintNumber: true, capacityPoints: true, status: true },
          },
        },
      },
    },
  });

  // Capacity/velocity must come from the user, never invented — this is a
  // hard gate, not a soft default, per Section 4 §18/§19.
  if (!initiative.intakeAnswerSet?.teamSize) {
    throw new InsufficientContextError("Enter your team size before requesting a sprint recommendation — capacity is never estimated for you.");
  }
  if (!initiative.prototype?.sprints.length) {
    throw new InsufficientContextError("Generate the plan and create at least one sprint before requesting a sprint recommendation.");
  }

  const methodology = resolveMethodology(initiative.methodology);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nUse only the capacity figures given below — never restate, recompute, or approximate a capacity/velocity number yourself. Recommend a sprint structure adjustment if one of the existing sprints looks over/under capacity, or note that the current structure looks reasonable.`;

  const taskTier: ContextTier = {
    layer: "task",
    priority: 100,
    required: true,
    label: "Team capacity and existing sprints",
    content: `Team size: ${initiative.intakeAnswerSet.teamSize}
Sprint length: ${initiative.intakeAnswerSet.sprintLengthWeeks} weeks
Velocity per person per sprint: ${initiative.intakeAnswerSet.velocityPerPersonPerSprint}${
      initiative.intakeAnswerSet.historicalVelocityPoints != null
        ? `\nHistorical velocity: ${initiative.intakeAnswerSet.historicalVelocityPoints} points`
        : ""
    }

Existing sprints: ${initiative.prototype.sprints.map((s) => `#${s.sprintNumber} (${s.capacityPoints} pts, ${s.status})`).join("; ")}`,
    sourceType: "Sprint",
    sourceId: initiativeId,
  };

  const freshFingerprint = await computeSprintRecommendationFingerprint(initiativeId);

  const result = await runAssistAction({
    action: "RECOMMEND_SPRINTS",
    userId,
    organizationId,
    projectId: initiative.projectId,
    initiativeId,
    reuseScope: { targetType: "initiative", targetId: null },
    freshFingerprint,
    tool: SPRINT_RECOMMENDATION_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [taskTier],
    schema: recommendSprintsResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => [
      {
        targetType: parsed.targetSprintId ? "sprint" : "initiative",
        targetId: parsed.targetSprintId ?? null,
        title: parsed.recommendationType === "adjustment" ? "Sprint adjustment recommended" : "Sprint structure recommendation",
        synopsis: parsed.note,
        informationUsed: parsed.informationUsed,
        why: parsed.why,
        impact: "Applying opens the sprint tools pre-filled with this suggestion — nothing is reassigned automatically.",
        assumptions: parsed.assumptions ?? [],
        sources: parsed.sources ?? [],
        rulesApplied: ["Capacity/velocity are user-provided figures only — never estimated by AI."],
        proposedContent: {
          recommendationType: parsed.recommendationType,
          targetSprintId: parsed.targetSprintId,
          storyIdsToMove: parsed.storyIdsToMove,
        },
      },
    ],
  });

  return { decision: result.decision, items: result.items };
}
