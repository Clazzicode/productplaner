import type { AiAssistItem } from "@prisma/client";
import type { AiTool } from "@/lib/ai/providerTypes";
import type { ContextTier } from "@/lib/ai/context/types";
import { db } from "@/lib/db";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { GLOBAL_PRODUCT_PLANNING_RULES } from "@/lib/ai/methodologyRules";
import { hashFingerprintPayload } from "@/lib/generation/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import { requestSchema } from "@/lib/requests/model";
import { requirementReviewResultSchema } from "@/lib/requests/reviewModel";

const TOOL_NAME = "submit_requirement_review";
const REVIEW_TOOL: AiTool = {
  name: TOOL_NAME,
  description: "Submit a structured review of one Product Owner planning request.",
  input_schema: {
    type: "object",
    properties: {
      findings: { type: "array", maxItems: 12, items: { type: "object", properties: {
        category: { type: "string", enum: ["follow_up_question", "contradiction", "missing_business_rule", "risk", "dependency", "engineering_question", "missing_information"] },
        fieldKey: { type: "string", enum: ["problem", "requestedChange", "outcome", "userAffected", "businessValueNarrative", "businessRules", "inScope", "outOfScope", "assumptions", "dependencies", "risks", "stakeholders", "supportingMaterials", "definitionOfSuccess", "questions"] },
        title: { type: "string" }, detail: { type: "string" }, proposedValue: { type: "string" }, question: { type: "string" },
      }, required: ["category", "fieldKey", "title", "detail", "proposedValue", "question"] } },
      readiness: { type: "string", enum: ["needs_clarification", "ready_for_feature", "ready_for_story", "blocked_by_decision"] },
      summary: { type: "string" }, informationUsed: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } }, sources: { type: "array", items: { type: "string" } },
    },
    required: ["findings", "readiness", "summary", "informationUsed", "assumptions", "sources"],
  },
};

export async function computeRequirementReviewFingerprint(requestId: string): Promise<string> {
  const request = await db.planningRequest.findUniqueOrThrow({ where: { id: requestId }, select: { data: true, revision: true } });
  return hashFingerprintPayload(JSON.stringify({ revision: request.revision, data: request.data }));
}

export async function runRequirementReview(params: { requestId: string; userId: string; organizationId: string }): Promise<{ decision: "generate_new" | "reuse" | "flag_stale"; items: AiAssistItem[] }> {
  const row = await db.planningRequest.findUniqueOrThrow({ where: { id: params.requestId }, include: { initiative: { select: { id: true, projectId: true, organizationId: true } } } });
  if (row.initiative.organizationId !== params.organizationId) throw new Error("Request is outside this organization.");
  const request = requestSchema.parse(row.data);
  const fingerprint = await computeRequirementReviewFingerprint(row.id);
  const taskTier: ContextTier = {
    layer: "task", priority: 100, required: true, label: "Planning request to review",
    content: JSON.stringify({ requestId: row.id, revision: row.revision, request }, null, 2),
    sourceType: "PlanningRequest", sourceId: row.id,
  };
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\nReview one Product Owner request. Ask focused follow-up questions, identify contradictions, missing business rules, risks, dependencies, missing information, and questions engineering is likely to ask. Suggest wording only when grounded in the supplied request. Do not invent facts or silently convert assumptions into requirements. Return no more than 12 distinct findings. The Product Owner will approve, edit, or dismiss every finding individually.`;
  const result = await runAssistAction({
    action: "REVIEW_REQUIREMENTS", userId: params.userId, organizationId: params.organizationId,
    projectId: row.initiative.projectId, initiativeId: row.initiativeId,
    reuseScope: { targetType: "request_requirement_review", targetId: row.id }, freshFingerprint: fingerprint,
    tool: REVIEW_TOOL, toolName: TOOL_NAME, system, extraTiers: [taskTier], schema: requirementReviewResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => {
      const readiness: AiAssistItemDraft = {
        targetType: "request_requirement_review", targetId: row.id, title: "Requirements readiness assessment",
        synopsis: parsed.summary, informationUsed: parsed.informationUsed, why: parsed.summary,
        impact: "Applying records the suggested readiness status. It does not approve the request or create a feature.",
        assumptions: parsed.assumptions, sources: parsed.sources,
        rulesApplied: ["AI recommendations require Product Owner approval.", "Assumptions are never treated as confirmed requirements."],
        proposedContent: { requestId: row.id, category: "missing_information", fieldKey: "readiness", title: "Requirements readiness assessment", detail: parsed.summary, proposedValue: parsed.readiness, question: "" },
      };
      return [readiness, ...parsed.findings.map((finding, index): AiAssistItemDraft => ({
        targetType: "request_requirement", targetId: `${row.id}:${finding.fieldKey}:${index}`,
        title: finding.title, synopsis: finding.detail, informationUsed: parsed.informationUsed, why: finding.detail,
        impact: finding.fieldKey === "questions" ? "Applying adds this as an open, PO-owned clarification question." : `Applying updates the ${finding.fieldKey} requirement field with the proposed wording.`,
        assumptions: parsed.assumptions, sources: parsed.sources,
        rulesApplied: ["AI recommendations require Product Owner approval.", "No request field changes until Apply is selected."],
        proposedContent: { ...finding, requestId: row.id },
      }))];
    },
  });
  return { decision: result.decision, items: result.items };
}
