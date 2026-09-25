import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveMethodology } from "@/lib/generation/methodology";
import { recommendReleasesResultSchema } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeReleaseRecommendationFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { ContextTier } from "@/lib/ai/context/types";
import type { AiAssistItem } from "@prisma/client";

// RECOMMEND_RELEASES (Section 4 §17) — a recommendation only. Never states a
// date itself (recommendReleasesResultSchema has no date field at all) and
// never writes a Release row directly — Apply pre-fills the existing manual
// POST /api/initiatives/[id]/releases form for the user to confirm
// (src/components/ai/AiAssistItemCard.tsx), or, for an adjustment to an
// existing release, is read-only guidance (no matching write path exists).

const TOOL_NAME = "submit_release_recommendation";

const RELEASE_RECOMMENDATION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit one release grouping recommendation.",
  input_schema: {
    type: "object",
    properties: {
      recommendationType: { type: "string", enum: ["new_grouping", "adjustment"] },
      targetReleaseId: { type: ["string", "null"], description: "Set only for recommendationType \"adjustment\"." },
      suggestedName: { type: "string" },
      suggestedPhaseNumber: { type: "number", enum: [1, 2, 3] },
      groupedCapabilityIds: { type: "array", items: { type: "string" }, description: "Capability ids from the list given." },
      why: { type: "string" },
      informationUsed: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["recommendationType", "why", "informationUsed"],
  },
};

export interface RunRecommendReleasesParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunRecommendReleasesResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runRecommendReleases(params: RunRecommendReleasesParams): Promise<RunRecommendReleasesResult> {
  const { initiativeId, userId, organizationId } = params;

  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      projectId: true,
      methodology: true,
      intakeAnswerSet: {
        select: {
          capabilities: {
            orderBy: { order: "asc" },
            select: { id: true, name: true, effortSize: true, businessValue: true, manualPhaseOverride: true },
          },
        },
      },
      prototype: {
        select: { releases: { orderBy: { order: "asc" }, select: { id: true, name: true, phaseNumber: true, targetDate: true } } },
      },
    },
  });
  const capabilities = initiative.intakeAnswerSet?.capabilities ?? [];

  if (capabilities.length === 0) {
    throw new InsufficientContextError("Generate the plan before requesting release recommendations.");
  }

  const methodology = resolveMethodology(initiative.methodology);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nThis is a recommendation only — never state a specific target date. Your recommendation is applied through the platform's normal release form, where the user sets the date themselves. Recommend a release grouping (new, or an adjustment to an existing one) — qualitative grouping and phase only, no dates.`;

  // Target launch date comes from the centralized "initiative" layer;
  // capability ids and existing releases are task-specific (the generic
  // features tier doesn't expose ids, and releases aren't part of any
  // generic layer at all), so they're built here.
  const taskTier: ContextTier = {
    layer: "task",
    priority: 100,
    required: true,
    label: "Features and existing releases",
    content: `Approved features (id: name, effort, value):
${capabilities.map((c) => `- ${c.id}: ${c.name}, ${c.effortSize}, ${c.businessValue}`).join("\n")}

Existing releases: ${
      initiative.prototype?.releases.length
        ? initiative.prototype.releases.map((r) => `${r.id}: ${r.name} (phase ${r.phaseNumber})`).join("; ")
        : "(none yet)"
    }`,
    sourceType: "Release",
    sourceId: initiativeId,
  };

  const freshFingerprint = await computeReleaseRecommendationFingerprint(initiativeId);

  const result = await runAssistAction({
    action: "RECOMMEND_RELEASES",
    userId,
    organizationId,
    projectId: initiative.projectId,
    initiativeId,
    reuseScope: { targetType: "initiative", targetId: null },
    freshFingerprint,
    tool: RELEASE_RECOMMENDATION_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [taskTier],
    schema: recommendReleasesResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => [
      {
        targetType: parsed.targetReleaseId ? "release" : "initiative",
        targetId: parsed.targetReleaseId ?? null,
        title: parsed.suggestedName?.trim() || (parsed.recommendationType === "new_grouping" ? "New release grouping" : "Release adjustment"),
        synopsis: parsed.why,
        informationUsed: parsed.informationUsed,
        why: parsed.why,
        impact: "Applying opens the release form pre-filled with this grouping — you confirm the actual date.",
        assumptions: parsed.assumptions ?? [],
        sources: parsed.sources ?? [],
        rulesApplied: ["Never states a date — the user sets it in the release form."],
        proposedContent: {
          recommendationType: parsed.recommendationType,
          targetReleaseId: parsed.targetReleaseId,
          suggestedName: parsed.suggestedName,
          suggestedPhaseNumber: parsed.suggestedPhaseNumber,
          groupedCapabilityIds: parsed.groupedCapabilityIds.filter((id: string) => capabilities.some((c) => c.id === id)),
        },
      },
    ],
  });

  return { decision: result.decision, items: result.items };
}
