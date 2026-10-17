import { z } from "zod";
import type { AiTool } from "@/lib/ai/providerTypes";
import { AI_MODEL, createAiResponse } from "@/lib/ai/client";
import { assertAiActionAllowed, recordAiUsage } from "@/lib/ai/usage";
import { GLOBAL_PRODUCT_PLANNING_RULES } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { hashFingerprintPayload } from "@/lib/generation/fingerprint";
import { BusinessError } from "@/lib/businessError";
import { db } from "@/lib/db";

const resultSchema = z.object({ content: z.string().trim().min(3).max(6000), informationUsed: z.string().trim().min(3).max(2000) }).strict();
const TOOL_NAME = "submit_demo_content_draft";
const TOOL: AiTool = { name: TOOL_NAME, description: "Submit one source-grounded demo content draft for Product Owner review.",
  input_schema: { type: "object", properties: { content: { type: "string" }, informationUsed: { type: "string" } }, required: ["content", "informationUsed"], additionalProperties: false } };

export async function generateDemoDraft(params: { demoItemId: string; kind: "purpose" | "completed_work"; userId: string; organizationId: string }) {
  const row = await db.demoItem.findUnique({ where: { id: params.demoItemId }, include: {
    initiative: { select: { projectId: true, methodology: true } }, sprint: { select: { sprintNumber: true, sprintPlan: { select: { goal: true } } } },
    story: { include: { children: { where: { type: "acceptance_criterion", archivedAt: null }, select: { title: true, body: true, approvedAt: true } } } },
    bug: { include: { request: { select: { data: true } } } },
  } });
  if (!row || row.organizationId !== params.organizationId) throw new BusinessError("Demo item not found.", 404);
  if (["demonstrated", "skipped", "carried_over"].includes(row.status)) throw new BusinessError("Reopen or prepare active demo work before drafting content.", 409);
  const source = { kind: params.kind, demo: { title: row.title, purpose: row.purpose, notes: row.notes, completedWork: row.completedWork },
    sprint: { number: row.sprint.sprintNumber, goal: row.sprint.sprintPlan?.goal ?? "" },
    story: row.story ? { title: row.story.title, body: row.story.body, acceptanceCriteria: row.story.children.map((item) => ({ title: item.title, body: item.body, approved: Boolean(item.approvedAt) })) } : null,
    bug: row.bug?.request.data ?? null };
  const fingerprint = hashFingerprintPayload(JSON.stringify(source));
  const reusable = await db.demoAiSuggestion.findUnique({ where: { demoItemId_kind_fingerprint: { demoItemId: row.id, kind: params.kind, fingerprint } } });
  if (reusable) {
    if (reusable.status !== "proposed") throw new BusinessError("This unchanged AI draft has already been used or dismissed. Update the source details before drafting again.", 409);
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: row.initiativeId, projectId: row.initiative.projectId,
      action: "DRAFT_DEMO_CONTENT", success: true, kind: "reuse", model: reusable.model, resultSummary: { demoItemId: row.id, suggestionId: reusable.id, reused: true } });
    return { suggestion: reusable, reused: true };
  }
  await db.demoAiSuggestion.updateMany({ where: { demoItemId: row.id, kind: params.kind, status: "proposed", fingerprint: { not: fingerprint } }, data: { status: "stale" } });
  const allowed = await assertAiActionAllowed({ action: "DRAFT_DEMO_CONTENT", userId: params.userId, organizationId: params.organizationId,
    initiativeId: row.initiativeId, projectId: row.initiative.projectId });
  try {
    const message = await createAiResponse({ model: AI_MODEL, max_tokens: allowed.capability.maxOutputTokens,
      system: `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\nDraft the requested demo ${params.kind === "purpose" ? "purpose statement" : "completed-work summary"} using only supplied records. Do not invent completion, readiness, outcomes, dates, or scope. State missing evidence clearly. The Product Owner must review the draft.`,
      messages: [{ role: "user", content: JSON.stringify(source) }], tools: [TOOL], tool_choice: { type: "tool", name: TOOL_NAME } });
    const tool = message.content.find((item) => item.type === "tool_use"); const parsed = resultSchema.safeParse(tool?.type === "tool_use" ? tool.input : null);
    if (!parsed.success) throw new Error("OpenAI returned invalid demo content.");
    const suggestion = await db.demoAiSuggestion.create({ data: { organizationId: row.organizationId, demoItemId: row.id, kind: params.kind,
      fingerprint, content: parsed.data.content, informationUsed: parsed.data.informationUsed, model: AI_MODEL, generatedByUserId: params.userId } });
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: row.initiativeId, projectId: row.initiative.projectId,
      action: "DRAFT_DEMO_CONTENT", success: true, model: AI_MODEL, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens, cacheReadInputTokens: message.usage.cache_read_input_tokens,
      aiJobId: allowed.jobId, resultSummary: { demoItemId: row.id, suggestionId: suggestion.id, kind: params.kind } });
    return { suggestion, reused: false };
  } catch (error) {
    await recordAiUsage({ userId: params.userId, organizationId: params.organizationId, initiativeId: row.initiativeId, projectId: row.initiative.projectId,
      action: "DRAFT_DEMO_CONTENT", success: false, model: AI_MODEL, aiJobId: allowed.jobId, errorMessage: error instanceof Error ? error.message : "AI draft failed." });
    throw error;
  } finally { await allowed.release(); }
}
