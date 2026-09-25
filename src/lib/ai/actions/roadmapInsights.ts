import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { loadIntakeInput } from "@/lib/generation/engine";
import { resolveMethodology } from "@/lib/generation/methodology";
import { roadmapInsightResultSchema } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeRoadmapInsightFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { AiAssistItem } from "@prisma/client";

// ROADMAP_INSIGHTS (Section 4 §10/§12) — reviews the approved plan and
// context for a qualitative timing/dependency concern. Purely advisory: the
// resulting AiAssistItem never states a date/sprint/point figure, and never
// touches the roadmap itself — only src/lib/generation/* does that.

const TOOL_NAME = "submit_roadmap_insight";

const ROADMAP_INSIGHT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit one roadmap insight, or an empty synopsis if nothing notable stands out.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short label, e.g. \"Dependency may affect timing\"." },
      synopsis: { type: "string", description: "One or two sentences — the always-visible summary." },
      impact: { type: "string", description: "What this could mean for the plan if not addressed." },
      why: { type: "string" },
      informationUsed: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["title", "synopsis", "impact", "why", "informationUsed"],
  },
};

export interface RunRoadmapInsightsParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunRoadmapInsightsResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runRoadmapInsights(params: RunRoadmapInsightsParams): Promise<RunRoadmapInsightsResult> {
  const { initiativeId, userId, organizationId } = params;

  const [intake, initiativeRow] = await Promise.all([
    loadIntakeInput(initiativeId),
    db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, select: { projectId: true, methodology: true } }),
  ]);

  if (intake.capabilities.length === 0) {
    throw new InsufficientContextError("Approve at least one feature before requesting roadmap insights.");
  }

  const methodology = resolveMethodology(initiativeRow.methodology);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nReview this plan qualitatively for a timing, sequencing, or dependency concern worth surfacing. If nothing stands out, say so plainly in the synopsis rather than inventing a concern.`;

  const freshFingerprint = await computeRoadmapInsightFingerprint(initiativeId);

  // No extraTiers needed — the centralized "initiative" layer (required by
  // this action's AiCapability config) already includes the approved
  // feature list with dependency counts (src/lib/ai/context/loaders.ts).
  const result = await runAssistAction({
    action: "ROADMAP_INSIGHTS",
    userId,
    organizationId,
    projectId: initiativeRow.projectId,
    initiativeId,
    reuseScope: { targetType: "initiative", targetId: null },
    freshFingerprint,
    tool: ROADMAP_INSIGHT_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [],
    schema: roadmapInsightResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => [
      {
        targetType: "initiative",
        targetId: null,
        title: parsed.title,
        synopsis: parsed.synopsis,
        informationUsed: parsed.informationUsed,
        why: parsed.why,
        impact: parsed.impact,
        assumptions: parsed.assumptions ?? [],
        sources: parsed.sources ?? [],
        rulesApplied: ["Qualitative only — never states a date, sprint, or point estimate."],
        proposedContent: {},
      },
    ],
  });

  return { decision: result.decision, items: result.items };
}
