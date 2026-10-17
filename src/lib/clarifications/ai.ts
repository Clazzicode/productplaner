import { z } from "zod";
import type { AiTool } from "@/lib/ai/providerTypes";
import { AI_MODEL, createAiResponse } from "@/lib/ai/client";
import { assertAiActionAllowed, recordAiUsage } from "@/lib/ai/usage";
import { GLOBAL_PRODUCT_PLANNING_RULES } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { hashFingerprintPayload } from "@/lib/generation/fingerprint";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";

const resultSchema = z.object({
  draftAnswer: z.string().trim().min(3).max(6000),
  informationUsed: z.string().trim().min(3).max(2000),
}).strict();

const TOOL_NAME = "submit_clarification_draft";
const TOOL: AiTool = {
  name: TOOL_NAME,
  description: "Submit one concise, source-grounded draft answer for Product Owner review.",
  input_schema: {
    type: "object",
    properties: { draftAnswer: { type: "string" }, informationUsed: { type: "string" } },
    required: ["draftAnswer", "informationUsed"],
    additionalProperties: false,
  },
};

export async function generateClarificationDraft(params: { clarificationId: string; userId: string; organizationId: string }) {
  const row = await db.inSprintClarification.findUnique({
    where: { id: params.clarificationId },
    include: {
      initiative: { select: { id: true, projectId: true, methodology: true } },
      sprint: { select: { sprintNumber: true, startDate: true, endDate: true, sprintPlan: { select: { goal: true } } } },
      story: { include: { children: { where: { type: "acceptance_criterion", archivedAt: null }, select: { title: true, body: true, approvedAt: true } } } },
      bug: { include: { request: { select: { data: true } } } },
    },
  });
  if (!row || row.organizationId !== params.organizationId) throw new BusinessError("Clarification not found.", 404);
  if (["resolved", "withdrawn"].includes(row.status)) throw new BusinessError("Reopen this clarification before drafting an answer.", 409);
  const source = {
    clarification: { question: row.question, context: row.context, urgency: row.urgency },
    sprint: { number: row.sprint.sprintNumber, goal: row.sprint.sprintPlan?.goal ?? "" },
    story: row.story ? { title: row.story.title, body: row.story.body, revision: row.story.backlogRevision,
      acceptanceCriteria: row.story.children.map((criterion) => ({ title: criterion.title, body: criterion.body, approved: Boolean(criterion.approvedAt) })) } : null,
    bug: row.bug ? row.bug.request.data : null,
  };
  const fingerprint = hashFingerprintPayload(JSON.stringify(source));
  const reusable = await db.clarificationAiSuggestion.findUnique({ where: { clarificationId_fingerprint: { clarificationId: row.id, fingerprint } } });
  if (reusable) {
    if (reusable.status !== "proposed") {
      throw new BusinessError(
        reusable.status === "dismissed"
          ? "This source-grounded AI draft was dismissed. Update the question or context before generating another draft."
          : "This source-grounded AI draft has already been used. Update the question or context before generating another draft.",
        409,
      );
    }
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: row.initiativeId,
      projectId: row.initiative.projectId, action: "DRAFT_CLARIFICATION", success: true, kind: "reuse", model: reusable.model,
      resultSummary: { clarificationId: row.id, suggestionId: reusable.id, reused: true } });
    return { suggestion: reusable, reused: true };
  }
  await db.clarificationAiSuggestion.updateMany({ where: { clarificationId: row.id, status: "proposed", fingerprint: { not: fingerprint } }, data: { status: "stale" } });
  const allowed = await assertAiActionAllowed({ action: "DRAFT_CLARIFICATION", userId: params.userId,
    organizationId: params.organizationId, initiativeId: row.initiativeId, projectId: row.initiative.projectId });
  try {
    const message = await createAiResponse({
      model: AI_MODEL,
      max_tokens: allowed.capability.maxOutputTokens,
      system: `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\nDraft one concise answer to the engineering clarification using only the supplied records. Do not invent product behavior, dates, scope, estimates, or commitments. State uncertainty and what the Product Owner must decide when the evidence is insufficient. Do not mark the question answered or resolved.`,
      messages: [{ role: "user", content: JSON.stringify(source) }],
      tools: [TOOL], tool_choice: { type: "tool", name: TOOL_NAME },
    });
    const tool = message.content.find((item) => item.type === "tool_use");
    const parsed = resultSchema.safeParse(tool?.type === "tool_use" ? tool.input : null);
    if (!parsed.success) throw new Error("OpenAI returned an invalid clarification draft.");
    const suggestion = await db.clarificationAiSuggestion.create({ data: { organizationId: row.organizationId,
      clarificationId: row.id, fingerprint, draftAnswer: parsed.data.draftAnswer,
      informationUsed: parsed.data.informationUsed, model: AI_MODEL, generatedByUserId: params.userId } });
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: row.initiativeId,
      projectId: row.initiative.projectId, action: "DRAFT_CLARIFICATION", success: true, model: AI_MODEL,
      inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens, cacheReadInputTokens: message.usage.cache_read_input_tokens,
      aiJobId: allowed.jobId, resultSummary: { clarificationId: row.id, suggestionId: suggestion.id } });
    return { suggestion, reused: false };
  } catch (error) {
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: row.initiativeId,
      projectId: row.initiative.projectId, action: "DRAFT_CLARIFICATION", success: false, model: AI_MODEL,
      aiJobId: allowed.jobId, errorMessage: error instanceof Error ? error.message : "AI draft failed." });
    throw error;
  } finally {
    await allowed.release();
  }
}

