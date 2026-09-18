import type Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";
import type { AiAssistItem } from "@prisma/client";
import { withTransaction } from "@/lib/db";
import { AI_MODEL, getAnthropicClient } from "@/lib/ai/client";
import { assertAiActionAllowed, recordAiUsage } from "@/lib/ai/usage";
import { setAiJobStatus, setAiJobContextAudit } from "@/lib/ai/job";
import { AiResponseValidationError, ContextBudgetExceededError } from "@/lib/ai/errors";
import type { AiActionKey } from "@/lib/ai/types";
import { assembleAiContext } from "@/lib/ai/context/assembleContext";
import type { ContextTier } from "@/lib/ai/context/types";
import { resolveReuseDecision, type ReuseDecision } from "./reuse";

// Shared AI Assist generation pipeline (Section 4 §2/§4, extended by
// Section 5 §2-4/§20-22). Every one of the 8 actions in src/lib/ai/actions/
// is a thin wrapper around this: check reuse (database/artifact reuse is
// checked FIRST and is what actually avoids a call — Section 5's caching
// below is a secondary efficiency measure layered on top, never a
// substitute) -> assemble bounded, budgeted context -> call Anthropic
// (cached stable system prompt, tool-use, 3-attempt retry on malformed
// output, same as analyzeIntake.ts) -> validate -> save one AiAssistItem row
// per proposed draft, status "proposed". Never writes to any table this
// platform treats as authoritative (Capability/ArtifactLayer/Sprint/
// Release/Risk/CapabilityDependency/RoadmapStatus) — only
// src/lib/ai/assist/apply does that, and only on an explicit user action.

export interface AiAssistItemDraft {
  /** Storage + supersession key for this specific draft. Batch categories
   * (propose features/risks) typically share one targetType/targetId across
   * every draft in a call; propose-dependencies gives each candidate its own
   * pair targetId. */
  targetType: string;
  targetId: string | null;
  title: string;
  synopsis: string;
  informationUsed: string;
  why: string;
  impact: string;
  assumptions: string[];
  sources: string[];
  rulesApplied: string[];
  proposedContent: unknown;
}

export interface RunAssistActionParams<T> {
  action: AiActionKey;
  userId: string;
  organizationId: string;
  projectId: string;
  initiativeId: string | null;
  /** Key used only to decide whether to call AI again — independent of each
   * draft's own storage targetType/targetId (see AiAssistItemDraft doc).
   * `targetId: undefined` means "match the most recent row of this
   * targetType regardless of targetId" (used by propose-dependencies, whose
   * candidates don't share one fixed targetId). */
  reuseScope: { targetType: string; targetId?: string | null };
  freshFingerprint: string;
  tool: Anthropic.Tool;
  toolName: string;
  /** Stable, code-level system prompt ONLY — PLATFORM_SYSTEM_PROMPT +
   * GLOBAL_PRODUCT_PLANNING_RULES + methodology guidance + any
   * action-specific instruction addendum. Never derived from project/
   * initiative/document data (Section 5's content-layer-separation
   * guardrail) — this is what gets the cache breakpoint below. */
  system: string;
  /** The action's own task-specific context (layer "task"/"artifact",
   * required: true) — the smallest useful package for this one task (§3),
   * unchanged from how each action already scopes its own query. Combined
   * with the centralized workspace/project/initiative tiers by
   * assembleAiContext to become the user-turn message content — never
   * merged into `system`. */
  extraTiers: ContextTier[];
  schema: ZodType<T>;
  buildDrafts: (result: T) => AiAssistItemDraft[];
}

export interface RunAssistActionResult {
  decision: ReuseDecision;
  items: AiAssistItem[];
  jobId: string | null;
}

export async function runAssistAction<T>(params: RunAssistActionParams<T>): Promise<RunAssistActionResult> {
  const { action, userId, organizationId, projectId, initiativeId } = params;

  // Reuse gate — checked FIRST, unconditionally, before anything else in
  // this function. This is what actually avoids an AI call; nothing below
  // this block ever runs ahead of it.
  const reuse = await resolveReuseDecision({
    actionKey: action,
    targetType: params.reuseScope.targetType,
    targetId: params.reuseScope.targetId,
    initiativeId,
    projectId,
    freshFingerprint: params.freshFingerprint,
  });

  // "reuse" and "flag_stale" both skip the Anthropic call — the only
  // difference is what the caller shows the user (an up-to-date result vs.
  // a "this may need an update" prompt). Never a silent regeneration either
  // way (Section 4 §4). Section 5 §22: this is logged as its own
  // zero-token, zero-cost ledger row so usage analytics can show calls
  // avoided — previously invisible. No AiJob is created (nothing ran long
  // enough to need job tracking).
  if (reuse.decision !== "generate_new") {
    await recordAiUsage({
      userId,
      organizationId,
      initiativeId,
      projectId,
      action,
      kind: "reuse",
      success: true,
      aiJobId: null,
      aiAssistItemId: reuse.existingItem?.id ?? null,
    });
    return {
      decision: reuse.decision,
      items: reuse.existingItem ? [reuse.existingItem] : [],
      jobId: reuse.existingItem?.aiJobId ?? null,
    };
  }

  const { capability, release, jobId } = await assertAiActionAllowed({
    action,
    userId,
    organizationId,
    initiativeId,
    projectId,
  });

  try {
    await setAiJobStatus(jobId, "loading_context");

    let assembled;
    try {
      assembled = await assembleAiContext({
        action,
        organizationId,
        projectId,
        initiativeId,
        extraTiers: params.extraTiers,
      });
    } catch (err) {
      if (err instanceof ContextBudgetExceededError) {
        // Record that the limit was exceeded (§40) even though nothing was
        // sent — the audit is lightweight (ids/versions only) and safe to
        // persist even on this early-exit path.
        await setAiJobContextAudit(jobId, err.audit as unknown as Record<string, unknown>);
      }
      await recordAiUsage({
        userId,
        organizationId,
        initiativeId,
        projectId,
        aiJobId: jobId,
        action,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Failed to assemble AI context.",
      });
      throw err;
    }

    await setAiJobStatus(jobId, "checking_gaps");
    await setAiJobStatus(jobId, "building_recommendation");

    // Content-layer separation (Section 5 guardrail): the stable system
    // prompt — fixed, code-level, never containing project/initiative/
    // document-derived data — is the ONLY thing in `system`, as a single
    // cached block. The assembled context (data, ultimately traceable back
    // to user/document content) goes into `messages` as ordinary user-turn
    // content, at normal (not elevated) instruction authority — exactly
    // where analyzeIntake.ts/documentUnderstanding.ts already put their
    // task content.
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: params.system, cache_control: { type: "ephemeral" } },
    ];

    // Same stochastic-malformed-tool-call retry as analyzeIntake.ts — a
    // confirmed, not hypothetical, model quirk. Validation itself is never
    // loosened; only a strictly-validated response is ever saved.
    const MAX_ATTEMPTS = 3;
    let parsed: T | undefined;
    let response: Anthropic.Message | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        response = await getAnthropicClient().messages.create({
          model: AI_MODEL,
          max_tokens: capability.maxOutputTokens,
          system,
          messages: [{ role: "user", content: assembled.text }],
          tools: [params.tool],
          tool_choice: { type: "tool", name: params.toolName },
        });
      } catch (err) {
        await recordAiUsage({
          userId,
          organizationId,
          initiativeId,
          projectId,
          aiJobId: jobId,
          action,
          model: AI_MODEL,
          success: false,
          errorMessage: err instanceof Error ? err.message : "Anthropic API request failed.",
        });
        throw err;
      }

      const toolUse = response.content.find((block) => block.type === "tool_use");
      try {
        if (!toolUse) throw new Error("Model did not return structured output.");
        parsed = params.schema.parse(toolUse.input);
        break;
      } catch (err) {
        lastError = err;
        await recordAiUsage({
          userId,
          organizationId,
          initiativeId,
          projectId,
          aiJobId: jobId,
          action,
          model: AI_MODEL,
          success: false,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
          cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
          errorMessage: `Response failed validation (attempt ${attempt}/${MAX_ATTEMPTS}).`,
        });
      }
    }

    if (!parsed || !response) {
      throw new AiResponseValidationError(
        lastError instanceof Error ? lastError.message : "Response failed validation.",
      );
    }

    await setAiJobStatus(jobId, "validating_output");
    const drafts = params.buildDrafts(parsed);

    await setAiJobStatus(jobId, "saving_artifact");
    await setAiJobContextAudit(jobId, assembled.audit as unknown as Record<string, unknown>);
    // No AiAssistItem row is ever created outside this point — a thrown
    // error above (network failure, exhausted retries) leaves zero draft
    // rows and only "failed" AiUsageEvent/AiJob records, so existing
    // approved AND draft data stay untouched by construction (Section 4 §16).
    const items = await withTransaction(async (tx) => {
      const created: AiAssistItem[] = [];
      for (const draft of drafts) {
        const priorForSlot = await tx.aiAssistItem.findFirst({
          where: { actionKey: action, targetType: draft.targetType, targetId: draft.targetId, initiativeId, projectId },
          orderBy: { version: "desc" },
        });
        if (priorForSlot && (priorForSlot.status === "proposed" || priorForSlot.status === "stale")) {
          await tx.aiAssistItem.update({ where: { id: priorForSlot.id }, data: { status: "superseded" } });
        }
        const row = await tx.aiAssistItem.create({
          data: {
            organizationId,
            projectId,
            initiativeId,
            actionKey: action,
            targetType: draft.targetType,
            targetId: draft.targetId,
            status: "proposed",
            version: (priorForSlot?.version ?? 0) + 1,
            supersedesItemId: priorForSlot?.id ?? null,
            fingerprint: params.freshFingerprint,
            aiJobId: jobId,
            aiModelUsed: AI_MODEL,
            generatedByUserId: userId,
            title: draft.title,
            synopsis: draft.synopsis,
            informationUsed: draft.informationUsed,
            why: draft.why,
            impact: draft.impact,
            assumptionsJson: JSON.stringify(draft.assumptions),
            sourcesJson: JSON.stringify(draft.sources),
            rulesAppliedJson: JSON.stringify(draft.rulesApplied),
            proposedContentJson: JSON.stringify(draft.proposedContent),
          },
        });
        created.push(row);
      }
      return created;
    });

    await recordAiUsage({
      userId,
      organizationId,
      initiativeId,
      projectId,
      aiJobId: jobId,
      action,
      model: AI_MODEL,
      success: true,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      aiAssistItemId: items[0]?.id ?? null,
      resultSummary: { proposed: items.length },
    });

    return { decision: "generate_new", items, jobId };
  } finally {
    await release();
  }
}
