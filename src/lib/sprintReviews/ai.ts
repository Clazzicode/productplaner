import { z } from "zod";
import type { AiTool } from "@/lib/ai/providerTypes";
import { AI_MODEL, createAiResponse } from "@/lib/ai/client";
import { GLOBAL_PRODUCT_PLANNING_RULES } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { assertAiActionAllowed, recordAiUsage } from "@/lib/ai/usage";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";
import { hashFingerprintPayload } from "@/lib/generation/fingerprint";
import { loadReviewDetails } from "./service";

const outputSchema = z.object({ summary: z.string().trim().min(3).max(9000), informationUsed: z.string().trim().min(3).max(2000), followUps: z.array(z.object({ title: z.string().trim().min(3).max(1000) }).strict()).max(5) }).strict();
const TOOL_NAME = "submit_sprint_review_draft";
const TOOL: AiTool = { name: TOOL_NAME, description: "Submit one source-grounded sprint-review summary and optional follow-up suggestions.", input_schema: { type: "object", properties: { summary: { type: "string" }, informationUsed: { type: "string" }, followUps: { type: "array", maxItems: 5, items: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false } } }, required: ["summary", "informationUsed", "followUps"], additionalProperties: false } };

export async function generateSprintReviewDraft(params: { reviewId: string; userId: string; organizationId: string }) {
  const details = await loadReviewDetails(params.reviewId); if (!details || details.review.organizationId !== params.organizationId) throw new BusinessError("Sprint review not found.", 404);
  if (details.review.status === "finalized") throw new BusinessError("Reopen the finalized sprint review before drafting a new summary.", 409);
  const source = { agenda: details.review.draftSnapshot, meeting: { purpose: details.meeting.purpose, notes: details.meeting.notes, transcriptText: details.meeting.transcriptText, outcome: details.meeting.outcome }, decisions: details.decisions.map(item => ({ title: item.title, rationale: item.rationale })), existingFollowUps: details.actions.map(item => ({ title: item.title, status: item.status })), existingSummary: details.review.summary };
  const fingerprint = hashFingerprintPayload(JSON.stringify(source));
  const reusable = await db.sprintReviewAiSuggestion.findMany({ where: { reviewId: params.reviewId, fingerprint }, orderBy: [{ kind: "asc" }, { ordinal: "asc" }] });
  if (reusable.length) {
    const proposed = reusable.filter(item => item.status === "proposed"); if (!proposed.length) throw new BusinessError("The unchanged AI suggestions have already been used or dismissed. Update the review evidence before drafting again.", 409);
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: details.review.initiativeId, projectId: details.review.projectId, action: "DRAFT_SPRINT_REVIEW", success: true, kind: "reuse", model: proposed[0].model, resultSummary: { reviewId: params.reviewId, suggestionCount: proposed.length, reused: true } });
    return { suggestions: proposed, reused: true };
  }
  await db.sprintReviewAiSuggestion.updateMany({ where: { reviewId: params.reviewId, status: "proposed", fingerprint: { not: fingerprint } }, data: { status: "stale" } });
  const allowed = await assertAiActionAllowed({ action: "DRAFT_SPRINT_REVIEW", userId: params.userId, organizationId: params.organizationId, initiativeId: details.review.initiativeId, projectId: details.review.projectId });
  try {
    const message = await createAiResponse({ model: AI_MODEL, max_tokens: allowed.capability.maxOutputTokens, system: `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\nDraft a concise stakeholder-facing sprint review summary using only supplied records. You may suggest up to five follow-up titles, but do not invent completion, outcomes, decisions, owners, dates, metrics, or validation. State missing evidence clearly. The Product Owner must approve each result.`, messages: [{ role: "user", content: JSON.stringify(source) }], tools: [TOOL], tool_choice: { type: "tool", name: TOOL_NAME } });
    const tool = message.content.find(item => item.type === "tool_use"); const parsed = outputSchema.safeParse(tool?.type === "tool_use" ? tool.input : null); if (!parsed.success) throw new Error("OpenAI returned an invalid sprint-review draft.");
    await db.sprintReviewAiSuggestion.createMany({ data: [{ organizationId: params.organizationId, reviewId: params.reviewId, kind: "summary", fingerprint, ordinal: 0, content: parsed.data.summary, informationUsed: parsed.data.informationUsed, model: AI_MODEL, generatedByUserId: params.userId }, ...parsed.data.followUps.map((item, index) => ({ organizationId: params.organizationId, reviewId: params.reviewId, kind: "follow_up", fingerprint, ordinal: index, content: item.title, informationUsed: parsed.data.informationUsed, model: AI_MODEL, generatedByUserId: params.userId }))] });
    const suggestions = await db.sprintReviewAiSuggestion.findMany({ where: { reviewId: params.reviewId, fingerprint }, orderBy: [{ kind: "asc" }, { ordinal: "asc" }] });
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: details.review.initiativeId, projectId: details.review.projectId, action: "DRAFT_SPRINT_REVIEW", success: true, model: AI_MODEL, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, cacheCreationInputTokens: message.usage.cache_creation_input_tokens, cacheReadInputTokens: message.usage.cache_read_input_tokens, aiJobId: allowed.jobId, resultSummary: { reviewId: params.reviewId, suggestionCount: suggestions.length } });
    return { suggestions, reused: false };
  } catch (error) {
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: details.review.initiativeId, projectId: details.review.projectId, action: "DRAFT_SPRINT_REVIEW", success: false, model: AI_MODEL, aiJobId: allowed.jobId, errorMessage: error instanceof Error ? error.message : "AI draft failed." }); throw error;
  } finally { await allowed.release(); }
}
