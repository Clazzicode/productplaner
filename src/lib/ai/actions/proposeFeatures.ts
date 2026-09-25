import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { loadIntakeInput } from "@/lib/generation/engine";
import { resolveMethodology } from "@/lib/generation/methodology";
import { proposeFeaturesResultSchema, type ProposeFeatureCandidate } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeFeatureProposalFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { AiAssistItem } from "@prisma/client";

// PROPOSE_FEATURES (Section 4 §13) — the worked example every other AI
// Assist action module mirrors. Proposes CANDIDATE new features from
// approved intake/capabilities; every candidate is saved as its own Draft/
// Proposed AiAssistItem (never written to Capability directly — only
// src/lib/ai/assist/apply's feature_proposal handler does that, and only on
// an explicit user Apply).

const TOOL_NAME = "submit_feature_candidates";

const FEATURE_CANDIDATES_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit candidate features the initiative may be missing.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        description: "0-10 candidate features. Prefer fewer, well-justified candidates over padding the list.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            isMvp: { type: "boolean", description: "Omit if you aren't confident — never guess." },
            effortSize: { type: "string", enum: ["xs", "s", "m", "l", "xl"], description: "Omit if you aren't confident." },
            businessValue: {
              type: "string",
              enum: ["very_low", "low", "medium", "high", "critical"],
              description: "Omit if you aren't confident.",
            },
            riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Omit if you aren't confident." },
            why: { type: "string", description: "Why this feature appears to be missing." },
            informationUsed: { type: "string", description: "What from the initiative's approved data led to this." },
            assumptions: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: { type: "string" } },
          },
          required: ["name", "why", "informationUsed"],
        },
      },
    },
  },
};

export interface RunProposeFeaturesParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunProposeFeaturesResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runProposeFeatures(params: RunProposeFeaturesParams): Promise<RunProposeFeaturesResult> {
  const { initiativeId, userId, organizationId } = params;

  const [intake, initiativeRow] = await Promise.all([
    loadIntakeInput(initiativeId),
    db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, select: { projectId: true, methodology: true } }),
  ]);

  // Nothing to reason about yet — never spend a call guessing at an empty
  // plan (Section 4 §17's "never invent, ask for input" applied to
  // input-starvation, not just missing numeric fields).
  if (intake.capabilities.length === 0 && !intake.problemStatement.trim() && !intake.targetCustomer.trim()) {
    throw new InsufficientContextError(
      "Add a problem statement, target customer, or at least one approved feature before requesting feature suggestions.",
    );
  }

  const methodology = resolveMethodology(initiativeRow.methodology);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nYou propose CANDIDATE new features only. When unsure of a sub-field (effort/value/risk), omit it rather than guess. Propose features that appear to be missing given the initiative's problem statement and target customer — never duplicate an approved feature already listed below.`;

  const freshFingerprint = await computeFeatureProposalFingerprint(initiativeId);

  // No extraTiers needed — everything this action reasons about (problem
  // statement, target customer, approved features) is already covered by
  // the centralized "initiative" layer this action's AiCapability config
  // declares as required (src/lib/ai/context/loaders.ts).
  const result = await runAssistAction({
    action: "PROPOSE_FEATURES",
    userId,
    organizationId,
    projectId: initiativeRow.projectId,
    initiativeId,
    reuseScope: { targetType: "initiative", targetId: null },
    freshFingerprint,
    tool: FEATURE_CANDIDATES_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [],
    schema: proposeFeaturesResultSchema,
    buildDrafts: (parsed) =>
      parsed.candidates.map(
        (c: ProposeFeatureCandidate): AiAssistItemDraft => ({
          targetType: "initiative",
          targetId: null,
          title: c.name,
          synopsis: c.why,
          informationUsed: c.informationUsed,
          why: c.why,
          impact: `Applying this adds "${c.name}" as an approved feature.`,
          assumptions: c.assumptions ?? [],
          sources: c.sources ?? [],
          rulesApplied: ["Feature suggestions never duplicate an already-approved feature."],
          proposedContent: {
            name: c.name,
            description: c.description ?? "",
            isMvp: c.isMvp,
            effortSize: c.effortSize,
            businessValue: c.businessValue,
            riskLevel: c.riskLevel,
          },
        }),
      ),
  });

  return { decision: result.decision, items: result.items };
}
