import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveMethodology } from "@/lib/generation/methodology";
import { proposeRisksResultSchema, type ProposeRiskCandidate } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeRiskObservationFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { AiAssistItem } from "@prisma/client";

// PROPOSE_RISKS (Section 4 §10) — candidate risks grounded in approved
// intake/capability data. Apply writes via crystallizeRisk (src/lib/context/
// crystallize.ts), the exact same real write a document-derived risk uses.

const TOOL_NAME = "submit_risk_candidates";

const RISK_CANDIDATES_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit candidate risks grounded in the initiative's approved data.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        description: "0-10 candidates. Prefer fewer, well-grounded risks over padding the list.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            why: { type: "string" },
            informationUsed: { type: "string" },
            assumptions: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: { type: "string" } },
          },
          required: ["description", "why", "informationUsed"],
        },
      },
    },
  },
};

export interface RunProposeRisksParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunProposeRisksResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runProposeRisks(params: RunProposeRisksParams): Promise<RunProposeRisksResult> {
  const { initiativeId, userId, organizationId } = params;

  const initiative = await db.initiative.findUniqueOrThrow({
    where: { id: initiativeId },
    select: {
      projectId: true,
      methodology: true,
      intakeAnswerSet: {
        select: {
          problemStatement: true,
          targetCustomer: true,
          outcomeStatement: true,
          capabilities: { orderBy: { order: "asc" }, select: { name: true, riskLevel: true } },
        },
      },
    },
  });
  const intake = initiative.intakeAnswerSet;

  if (!intake || (!intake.problemStatement.trim() && intake.capabilities.length === 0)) {
    throw new InsufficientContextError("Add a problem statement or at least one approved feature before requesting risk suggestions.");
  }

  const methodology = resolveMethodology(initiative.methodology);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nPropose risks worth tracking, grounded in the initiative's problem statement, target customer, and approved features below — never a generic, boilerplate risk.`;

  const freshFingerprint = await computeRiskObservationFingerprint(initiativeId);

  // No extraTiers needed — problem statement/target customer/outcome and
  // the approved feature list all come from the centralized "initiative"
  // layer this action's AiCapability config declares as required.
  const result = await runAssistAction({
    action: "PROPOSE_RISKS",
    userId,
    organizationId,
    projectId: initiative.projectId,
    initiativeId,
    reuseScope: { targetType: "initiative", targetId: null },
    freshFingerprint,
    tool: RISK_CANDIDATES_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [],
    schema: proposeRisksResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] =>
      parsed.candidates.map(
        (c: ProposeRiskCandidate): AiAssistItemDraft => ({
          targetType: "initiative",
          targetId: null,
          title: c.description.length > 80 ? `${c.description.slice(0, 77)}...` : c.description,
          synopsis: c.why,
          informationUsed: c.informationUsed,
          why: c.why,
          impact: "Applying adds this as a tracked risk.",
          assumptions: c.assumptions ?? [],
          sources: c.sources ?? [],
          rulesApplied: [],
          proposedContent: { description: c.description, severity: c.severity },
        }),
      ),
  });

  return { decision: result.decision, items: result.items };
}
