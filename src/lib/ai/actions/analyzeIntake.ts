import type Anthropic from "@anthropic-ai/sdk";
import { db, withTransaction } from "@/lib/db";
import { loadIntakeInput } from "@/lib/generation/engine";
import { resolveMethodology } from "@/lib/generation/methodology";
import type { IntakeInput } from "@/lib/generation/types";
import { analyzeIntakeResultSchema, type AnalyzeIntakeResult } from "@/lib/validation/schemas";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { assertAiActionAllowed, recordAiUsage } from "@/lib/ai/usage";
import { completeAiJob, setAiJobStatus } from "@/lib/ai/job";
import { AiResponseValidationError } from "@/lib/ai/errors";

// ANALYZE_INTAKE (req #9-#13, docs/V2-AI-FOUNDATION.md). Reads intake data
// read-only via the same loadIntakeInput() the deterministic engine uses,
// and writes only to the new IntakeAiAnalysis/AiUsageEvent tables — never
// to IntakeAnswerSet, Capability, or anything the deterministic engine
// owns. This module never imports buildPlan/scoring/cost/dependencyGraph.

const TOOL_NAME = "submit_intake_analysis";

const ANALYZE_INTAKE_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit the structured analysis of this initiative's intake data.",
  input_schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "A concise plain-language summary of what this initiative is and where its plan currently stands.",
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description:
          "Assumptions this analysis relies on, based on what's in the intake data (or reasonable inference where it's thin). Not a restatement of the platform's own numeric planning assumptions.",
      },
      missingInformation: {
        type: "array",
        items: { type: "string" },
        description: "Specific information that would make this plan stronger but isn't present in the intake data yet.",
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
          },
          required: ["description", "severity"],
        },
        description: "Risks to this initiative succeeding, grounded in the intake data.",
      },
      recommendedRoadmapPhases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: {
              type: "string",
              description: "What belongs in this phase and why, in qualitative terms only — never a date, sprint number, or point estimate.",
            },
            relatedCapabilities: {
              type: "array",
              items: { type: "string" },
              description: "Names of capabilities from the intake data that belong in this phase.",
            },
          },
          required: ["name", "description"],
        },
        description:
          "A qualitative grouping of the initiative's capabilities into roadmap phases — advisory framing only, not the platform's actual phase plan.",
      },
      rationale: { type: "string", description: "Why this analysis reached these conclusions, in plain language." },
    },
    // Deliberately no top-level `required`: with this model, a `required`
    // array listing every top-level property makes it stringify each
    // field's true array/object value into the first property instead of
    // emitting real JSON structure (reproduced consistently in testing —
    // stop_reason is still "tool_use", so this fails silently unless the
    // response is actually validated). Nested item-level `required` below
    // is unaffected and kept, matching documentUnderstanding.ts's precedent
    // (src/lib/ai/actions/documentUnderstanding.ts). Zod (analyzeIntakeResultSchema) remains the real
    // completeness gate — a field the model omits still fails validation.
  },
};

function formatIntakeForPrompt(intake: IntakeInput): string {
  const capabilities = intake.capabilities
    .map(
      (c) =>
        `- ${c.name} (${c.isMvp ? "MVP" : "not MVP"}, effort: ${c.effortSize}, business value: ${c.businessValue}${
          c.riskLevel ? `, risk: ${c.riskLevel}` : ""
        })${c.description ? `: ${c.description}` : ""}`,
    )
    .join("\n");

  return `Initiative: ${intake.initiativeName}

Problem statement: ${intake.problemStatement || "(not provided)"}
Target customer: ${intake.targetCustomer || "(not provided)"}
Outcome: ${intake.outcomeStatement || "(not provided)"}
Outcome metric: ${intake.outcomeMetric || "(not provided)"}

Capabilities:
${capabilities || "(none entered yet)"}`;
}

export interface RunAnalyzeIntakeParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunAnalyzeIntakeResult {
  analysis: AnalyzeIntakeResult;
  analysisId: string;
  usageEventId: string;
}

export async function runAnalyzeIntake(params: RunAnalyzeIntakeParams): Promise<RunAnalyzeIntakeResult> {
  const { initiativeId, userId, organizationId } = params;

  const { capability, release, jobId } = await assertAiActionAllowed({
    action: "ANALYZE_INTAKE",
    userId,
    organizationId,
    initiativeId,
  });

  try {
    await setAiJobStatus(jobId, "loading_context");
    const [intake, initiative] = await Promise.all([
      loadIntakeInput(initiativeId),
      db.initiative.findUniqueOrThrow({ where: { id: initiativeId }, select: { methodology: true } }),
    ]);
    const methodology = resolveMethodology(initiative.methodology);

    const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}`;

    // This model occasionally (not deterministically) serializes its tool
    // call as legacy text-based function-call XML instead of real JSON
    // structure, while still reporting stop_reason "tool_use" — the request
    // succeeds but the payload fails validation. Retrying is the correct
    // response to that kind of stochastic formatting glitch (confirmed by
    // direct testing that a clean retry reliably produces well-formed
    // output); it never loosens validation itself (req #11) — every attempt
    // is still strictly parsed, and only a validated response is ever saved.
    const MAX_ATTEMPTS = 3;
    let analysis: AnalyzeIntakeResult | undefined;
    let response: Anthropic.Message | undefined;
    let lastError: unknown;

    await setAiJobStatus(jobId, "extracting_information");
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await getAnthropicClient().messages.create({
          model: AI_MODEL,
          max_tokens: capability.maxOutputTokens,
          system,
          messages: [{ role: "user", content: formatIntakeForPrompt(intake) }],
          tools: [ANALYZE_INTAKE_TOOL],
          tool_choice: { type: "tool", name: TOOL_NAME },
        });
      } catch (err) {
        await recordAiUsage({
          userId,
          organizationId,
          initiativeId,
          aiJobId: jobId,
          action: "ANALYZE_INTAKE",
          success: false,
          errorMessage: err instanceof Error ? err.message : "Anthropic API request failed.",
        });
        throw err;
      }

      const toolUse = response.content.find((block) => block.type === "tool_use");
      try {
        if (!toolUse) throw new Error("Model did not return structured output.");
        analysis = analyzeIntakeResultSchema.parse(toolUse.input);
        break;
      } catch (err) {
        lastError = err;
        await recordAiUsage({
          userId,
          organizationId,
          initiativeId,
          aiJobId: jobId,
          action: "ANALYZE_INTAKE",
          success: false,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          errorMessage: `Response failed validation (attempt ${attempt}/${MAX_ATTEMPTS}).`,
        });
      }
    }

    if (!analysis || !response) {
      throw new AiResponseValidationError(
        lastError instanceof Error ? lastError.message : "Response failed validation.",
      );
    }

    await setAiJobStatus(jobId, "validating_output");
    const [analysisRow, usageEvent] = await withTransaction((tx) =>
      Promise.all([
        tx.intakeAiAnalysis.create({
          data: {
            initiativeId,
            generatedByUserId: userId,
            summary: analysis.summary,
            assumptionsJson: JSON.stringify(analysis.assumptions),
            missingInformationJson: JSON.stringify(analysis.missingInformation),
            risksJson: JSON.stringify(analysis.risks),
            recommendedPhasesJson: JSON.stringify(analysis.recommendedRoadmapPhases),
            rationale: analysis.rationale,
            modelUsed: AI_MODEL,
          },
          select: { id: true },
        }),
        tx.aiUsageEvent.create({
          data: {
            userId,
            organizationId,
            initiativeId,
            aiJobId: jobId,
            action: "ANALYZE_INTAKE",
            success: true,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
          select: { id: true },
        }),
      ]),
    );

    await completeAiJob(jobId, {
      summary: analysis.summary,
      risksIdentified: analysis.risks.length,
      recommendedPhases: analysis.recommendedRoadmapPhases.length,
    });

    return { analysis, analysisId: analysisRow.id, usageEventId: usageEvent.id };
  } finally {
    await release();
  }
}
