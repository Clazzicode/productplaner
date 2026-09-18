import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";
import { assertAiActionAllowed, recordAiUsage } from "@/lib/ai/usage";
import { setAiJobStatus } from "@/lib/ai/job";
import type { DocumentChunk } from "@/lib/documents/extractChunks";
import {
  contextExtractionFeatureSchema,
  contextExtractionItemSchema,
  contextExtractionResultSchema,
  contextExtractionRiskSchema,
  type ContextExtractionFeature,
  type ContextExtractionItem,
  type ContextExtractionRisk,
} from "@/lib/validation/schemas";

// DOCUMENT_UNDERSTANDING (directive §3) — reads a supplied document's
// extracted chunks and proposes structured, traceable ContextItem rows. This
// used to return one loosely-typed draft the client applied directly to
// local form state (src/components/questionnaire/ImportIntakePanel.tsx, now
// superseded); it now returns a flat, uniform item list the caller turns
// into real ContextItem rows (src/app/api/documents/[id]/analyze/route.ts),
// each with its own approval state and a citation back to the exact chunk
// it came from. Same action key as before — this is a richer schema on the
// same gateway-routed action, not a second one (usage-limit accounting for
// "analyzing an uploaded document" stays one bucket).
//
// Deliberately does not perform research (directive item 28) and does not
// write anything to the database itself — the analyze route persists only
// after this returns, and nothing here is ever auto-approved (directive
// item 17).

const TOOL_NAME = "submit_context_extraction";

const SYSTEM_PROMPT = `You extract structured planning facts from a document (a slide deck, spec, brief, business case, or similar), so a person can review, edit, and individually approve or reject each one before it becomes part of their project or initiative record. You will NOT generate a roadmap, features list, or plan — only extract what the document actually says.

The document is supplied as a numbered list of chunks, each with its heading/page/slide context. Every item you propose MUST cite a real sourceChunkIndex from that list — never a chunk index you weren't given, and never a fact without a specific chunk backing it.

Rules:
- Only include an item when the document gives reasonable, specific evidence for it. Never invent, guess, or pad with generic filler — an omitted fact is safe, a wrong one is not.
- Set kind:"explicit" only when the document directly states the fact in words you could quote. Set kind:"interpretation" when you are inferring or paraphrasing something the document implies but doesn't say outright (e.g. "this section describes something that sounds like a feature"). Never mark an inference as explicit.
- documentScope tells you what's actually eligible: when documentScope is "project_shared", every item's scope must be "project" and you must NOT propose anything in the features array (there is no project-level feature list). When documentScope is "initiative_only", every item's scope must be "initiative".
- effortSize/businessValue/riskLevel on a feature, and severity on a risk, are rough inferences at best — only set them when the document gives a real signal, otherwise omit them.
- projected_go_live / initiative_target_date values must be explicit dates (yyyy-mm-dd) or a plain date phrase actually written in the document — don't compute one from vague timeframes like "next quarter".
- budget values must be an explicit number the document actually states.
- Use the warnings array for anything ambiguous, conflicting, or worth a human double-checking, but don't use it as a dumping ground for items you weren't confident enough to include above.
Call the ${TOOL_NAME} tool exactly once with your findings.`;

const CONTEXT_EXTRACTION_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit the structured planning facts, features, and risks extracted from the document.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "Scalar planning facts (never features or risks — those have their own arrays below).",
        items: {
          type: "object",
          properties: {
            fieldKey: {
              type: "string",
              enum: [
                "project_name",
                "description",
                "goal",
                "budget",
                "projected_go_live",
                "team",
                "constraints",
                "stakeholders",
                "initiative_name",
                "initiative_goal",
                "success_measure",
                "initiative_target_date",
                "dependency",
                "assumption",
              ],
            },
            scope: { type: "string", enum: ["project", "initiative"] },
            kind: { type: "string", enum: ["explicit", "interpretation"] },
            value: { type: "string", description: "The fact itself, as plain text." },
            sourceChunkIndex: { type: "number" },
          },
          required: ["fieldKey", "scope", "kind", "value", "sourceChunkIndex"],
        },
      },
      features: {
        type: "array",
        description: "Distinct features/capabilities/workstreams described as part of the scope or roadmap. Only when documentScope is initiative_only.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            isMvp: { type: "boolean" },
            effortSize: { type: "string", enum: ["xs", "s", "m", "l", "xl"] },
            businessValue: { type: "string", enum: ["very_low", "low", "medium", "high", "critical"] },
            riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
            kind: { type: "string", enum: ["explicit", "interpretation"] },
            sourceChunkIndex: { type: "number" },
          },
          required: ["name", "kind", "sourceChunkIndex"],
        },
      },
      risks: {
        type: "array",
        description: "Distinct risks the document actually calls out.",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            kind: { type: "string", enum: ["explicit", "interpretation"] },
            sourceChunkIndex: { type: "number" },
          },
          required: ["description", "kind", "sourceChunkIndex"],
        },
      },
      warnings: {
        type: "array",
        description: "Notes about ambiguous, conflicting, or missing information the reviewer should double check.",
        items: { type: "string" },
      },
    },
    required: ["items", "features", "risks"],
  },
};

function formatChunksForPrompt(chunks: DocumentChunk[]): string {
  return chunks
    .map((chunk, i) => {
      const location = [
        chunk.pageNumber != null ? `page ${chunk.pageNumber}` : null,
        chunk.slideNumber != null ? `slide ${chunk.slideNumber}` : null,
        chunk.closestHeading ? `heading: "${chunk.closestHeading}"` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return `Chunk ${i}${location ? ` (${location})` : ""}:\n${chunk.text}`;
    })
    .join("\n\n");
}

export interface RunDocumentUnderstandingParams {
  chunks: DocumentChunk[];
  documentScope: "project_shared" | "initiative_only";
  initiativeId: string | null;
  projectId: string;
  userId: string;
  organizationId: string;
}

export interface ContextExtractionResult {
  items: ContextExtractionItem[];
  features: ContextExtractionFeature[];
  risks: ContextExtractionRisk[];
  warnings: string[];
}

export async function runDocumentUnderstanding(
  params: RunDocumentUnderstandingParams,
): Promise<ContextExtractionResult> {
  const { chunks, documentScope, initiativeId, projectId, userId, organizationId } = params;

  // src/lib/ai/usage.ts's dedup lock keys on initiativeId, falling back to
  // userId when null (project-shared analysis) — so two concurrent
  // project-shared analyses by the same user would briefly contend, even
  // across two different Projects. Not a real problem in practice (the UI
  // only ever has one upload-and-analyze in flight per review screen at a
  // time), just worth flagging here rather than "fixing" into something more
  // complex.
  const { capability, release, jobId } = await assertAiActionAllowed({
    action: "DOCUMENT_UNDERSTANDING",
    userId,
    organizationId,
    initiativeId,
    projectId,
  });

  try {
    await setAiJobStatus(jobId, "extracting_information");

    const requiredScope = documentScope === "project_shared" ? "project" : "initiative";
    const scopeInstruction = `documentScope is "${documentScope}" — every item's scope must be "${requiredScope}"${
      documentScope === "project_shared" ? ', and the "features" array must be empty' : ""
    }.`;

    let response: Anthropic.Message;
    try {
      response = await getAnthropicClient().messages.create({
        model: AI_MODEL,
        max_tokens: capability.maxOutputTokens,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${scopeInstruction}\n\nDocument chunks:\n\n${formatChunksForPrompt(chunks)}`,
          },
        ],
        tools: [CONTEXT_EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: TOOL_NAME },
      });
    } catch (err) {
      await recordAiUsage({
        userId,
        organizationId,
        initiativeId,
        aiJobId: jobId,
        action: "DOCUMENT_UNDERSTANDING",
        success: false,
        errorMessage: err instanceof Error ? err.message : "Anthropic API request failed.",
      });
      throw err;
    }

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse) {
      await recordAiUsage({
        userId,
        organizationId,
        initiativeId,
        aiJobId: jobId,
        action: "DOCUMENT_UNDERSTANDING",
        success: false,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        errorMessage: "Model did not return structured output.",
      });
      throw new Error("Model did not return structured output.");
    }

    await setAiJobStatus(jobId, "validating_output");
    const shape = contextExtractionResultSchema.parse(toolUse.input);
    const chunkCount = chunks.length;

    // Strict per-item validation, but a malformed single item never fails
    // the whole response — dropped item-by-item, visibly, here (not via a
    // schema-level .catch()). Also defensively re-checks the chunk index is
    // real and the scope matches what was actually requested — never trust
    // the model alone for either boundary.
    const items = shape.items.flatMap((raw) => {
      const parsed = contextExtractionItemSchema.safeParse(raw);
      if (!parsed.success) return [];
      if (parsed.data.sourceChunkIndex >= chunkCount) return [];
      if (parsed.data.scope !== requiredScope) return [];
      return [parsed.data];
    });

    // No project-level Capability home exists (Capability.intakeAnswerSetId
    // is required and 1:1 with Initiative) — drop any features returned for
    // a project_shared document outright, regardless of what the model did.
    const features =
      documentScope === "project_shared"
        ? []
        : shape.features.flatMap((raw) => {
            const parsed = contextExtractionFeatureSchema.safeParse(raw);
            if (!parsed.success) return [];
            if (parsed.data.sourceChunkIndex >= chunkCount) return [];
            return [parsed.data];
          });

    const risks = shape.risks.flatMap((raw) => {
      const parsed = contextExtractionRiskSchema.safeParse(raw);
      if (!parsed.success) return [];
      if (parsed.data.sourceChunkIndex >= chunkCount) return [];
      return [parsed.data];
    });

    const result: ContextExtractionResult = { items, features, risks, warnings: shape.warnings };

    await recordAiUsage({
      userId,
      organizationId,
      initiativeId,
      aiJobId: jobId,
      action: "DOCUMENT_UNDERSTANDING",
      success: true,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      resultSummary: {
        itemsExtracted: items.length,
        featuresExtracted: features.length,
        risksExtracted: risks.length,
        warnings: result.warnings,
      },
    });

    return result;
  } finally {
    await release();
  }
}
