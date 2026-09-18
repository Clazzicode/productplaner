import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveTargetLaunchDate } from "@/lib/projectContext";
import { recommendInitiativeStatus, recommendProjectStatus } from "@/lib/roadmapStatus/recommend";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { recommendStatusResultSchema } from "@/lib/validation/schemas";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeStatusRecommendationFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { ContextTier } from "@/lib/ai/context/types";
import type { AiAssistItem } from "@prisma/client";

// RECOMMEND_STATUS (Section 4 §25/§26/§38) — never computes its own color.
// src/lib/roadmapStatus/recommend.ts's deterministic recommendation (an
// objective, already-known condition — a date passed, required information
// is missing — never an invented numeric threshold) is the only source of
// the color; this action only turns it into plain-language why/impact copy.
// Feature/epic/story/sprint/release status has no recommender defined yet
// (recommend.ts's own header comment) — deliberately not supported here
// either, per Section 4 §38 "AI should not invent methodology."

const TOOL_NAME = "submit_status_explanation";

const STATUS_EXPLANATION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit a plain-language explanation of an already-computed status recommendation.",
  input_schema: {
    type: "object",
    properties: {
      impact: { type: "string", description: "What this could mean for the plan if not addressed." },
      why: { type: "string", description: "Restate the given reason in plain, empathetic language — never invent a new reason." },
      informationUsed: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["impact", "why", "informationUsed"],
  },
};

export interface RunRecommendStatusParams {
  entityType: "project" | "initiative";
  entityId: string;
  userId: string;
  organizationId: string;
}

export interface RunRecommendStatusResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runRecommendStatus(params: RunRecommendStatusParams): Promise<RunRecommendStatusResult> {
  const { entityType, entityId, userId, organizationId } = params;
  const today = new Date();

  let projectId: string;
  let initiativeId: string | null;
  let color: string;
  let reason: string;

  if (entityType === "initiative") {
    const i = await db.initiative.findUniqueOrThrow({
      where: { id: entityId },
      select: {
        projectId: true,
        status: true,
        targetLaunchDateOverride: true,
        project: { select: { targetLaunchDate: true } },
        intakeAnswerSet: { select: { problemStatement: true, targetCustomer: true, outcomeStatement: true } },
      },
    });
    const rec = recommendInitiativeStatus(
      {
        targetLaunchDate: resolveTargetLaunchDate(i, i.project),
        isActivelyExecuting: i.status === "generated",
        problemStatement: i.intakeAnswerSet?.problemStatement ?? "",
        targetCustomer: i.intakeAnswerSet?.targetCustomer ?? "",
        outcomeStatement: i.intakeAnswerSet?.outcomeStatement ?? "",
      },
      today,
    );
    if (!rec) throw new InsufficientContextError("No status concern to explain right now.");
    projectId = i.projectId;
    initiativeId = entityId;
    color = rec.color;
    reason = rec.reason;
  } else {
    const p = await db.project.findUniqueOrThrow({
      where: { id: entityId },
      select: { targetLaunchDate: true, initiatives: { select: { status: true } } },
    });
    const rec = recommendProjectStatus(
      { targetLaunchDate: p.targetLaunchDate, hasGeneratedInitiative: p.initiatives.some((i) => i.status === "generated") },
      today,
    );
    if (!rec) throw new InsufficientContextError("No status concern to explain right now.");
    projectId = entityId;
    initiativeId = null;
    color = rec.color;
    reason = rec.reason;
  }

  const system = `${PLATFORM_SYSTEM_PROMPT}\n\nA deterministic rule elsewhere in the platform already computed this status recommendation from an objective condition — you are ONLY explaining it in plain language. Never propose a different color, never invent a new reason beyond the one given.`;
  const taskTier: ContextTier = {
    layer: "task",
    priority: 100,
    required: true,
    label: "Computed status recommendation",
    content: `Recommended status: ${color}\nReason (deterministic, already computed — do not change it): ${reason}`,
    sourceType: "RoadmapStatus",
    sourceId: entityId,
  };

  const freshFingerprint = await computeStatusRecommendationFingerprint(entityType, entityId);

  const result = await runAssistAction({
    action: "RECOMMEND_STATUS",
    userId,
    organizationId,
    projectId,
    initiativeId,
    reuseScope: { targetType: entityType, targetId: entityId },
    freshFingerprint,
    tool: STATUS_EXPLANATION_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [taskTier],
    schema: recommendStatusResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => [
      {
        targetType: entityType,
        targetId: entityId,
        title: `Status recommendation: ${color}`,
        synopsis: reason,
        informationUsed: parsed.informationUsed,
        why: parsed.why,
        impact: parsed.impact,
        assumptions: parsed.assumptions ?? [],
        sources: parsed.sources ?? [],
        rulesApplied: ["Color and reason come from the platform's deterministic recommender — never AI-computed."],
        proposedContent: { color, reason },
      },
    ],
  });

  return { decision: result.decision, items: result.items };
}
