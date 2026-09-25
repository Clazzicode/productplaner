import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveMethodology } from "@/lib/generation/methodology";
import { proposeDependenciesResultSchema } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeDependencyObservationFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { ContextTier } from "@/lib/ai/context/types";
import type { AiAssistItem } from "@prisma/client";

// PROPOSE_DEPENDENCIES (Section 4 §10) — only ever proposes edges between
// two already-approved Capabilities, one AiAssistItem per candidate pair.
// Deliberately narrower than crystallize.ts's "dependency" fieldKey (which
// no-ops because free-text-sourced dependencies can't reliably resolve to
// real capability ids) — here the model chooses from a closed, real id list
// given in the prompt, and every candidate is re-validated against that same
// list before being saved, never trusted from the model alone.

const TOOL_NAME = "submit_dependency_candidates";

const DEPENDENCY_CANDIDATES_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit candidate dependency edges between capabilities from the given list.",
  input_schema: {
    type: "object",
    properties: {
      candidates: {
        type: "array",
        description: "0-10 candidates. Use only the capability ids given — never invent an id.",
        items: {
          type: "object",
          properties: {
            fromCapabilityId: { type: "string", description: "This capability..." },
            toCapabilityId: { type: "string", description: "...depends on this one (must come first)." },
            why: { type: "string" },
            informationUsed: { type: "string" },
            assumptions: { type: "array", items: { type: "string" } },
            sources: { type: "array", items: { type: "string" } },
          },
          required: ["fromCapabilityId", "toCapabilityId", "why", "informationUsed"],
        },
      },
    },
  },
};

export interface RunProposeDependenciesParams {
  initiativeId: string;
  userId: string;
  organizationId: string;
}

export interface RunProposeDependenciesResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runProposeDependencies(params: RunProposeDependenciesParams): Promise<RunProposeDependenciesResult> {
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
            select: {
              id: true,
              name: true,
              description: true,
              dependsOnEdges: { select: { toCapabilityId: true } },
            },
          },
        },
      },
    },
  });
  const capabilities = initiative.intakeAnswerSet?.capabilities ?? [];

  if (capabilities.length < 2) {
    throw new InsufficientContextError("Approve at least two features before requesting dependency suggestions.");
  }

  const knownIds = new Set(capabilities.map((c) => c.id));
  const existingEdges = new Set(capabilities.flatMap((c) => c.dependsOnEdges.map((e) => `${c.id}>${e.toCapabilityId}`)));

  const methodology = resolveMethodology(initiative.methodology);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nOnly use capability ids from the list given — never invent one, and never propose a pair that already has a dependency link.`;

  // The generic "approved features" tier doesn't expose raw capability ids
  // (kept human-readable for actions that don't need them); this action's
  // tool schema needs exact ids to reference, so it builds its own
  // id-annotated task tier rather than reusing that generic one.
  const taskTier: ContextTier = {
    layer: "task",
    priority: 100,
    required: true,
    label: "Capabilities available for dependency linking",
    content: `Approved features (id: name — description):
${capabilities.map((c) => `- ${c.id}: ${c.name}${c.description ? ` — ${c.description}` : ""}`).join("\n")}

Existing dependency links: ${existingEdges.size > 0 ? [...existingEdges].join(", ") : "(none yet)"}

Propose dependency edges that appear to be missing — a feature that clearly needs another to exist first.`,
    sourceType: "Capability",
    sourceId: initiativeId,
  };

  const freshFingerprint = await computeDependencyObservationFingerprint(initiativeId);

  const result = await runAssistAction({
    action: "PROPOSE_DEPENDENCIES",
    userId,
    organizationId,
    projectId: initiative.projectId,
    initiativeId,
    // No single shared targetId across candidates (each pair is its own
    // slot) — reuse gate checks the most recent capability_pair row
    // regardless of which pair, matching this whole category's fingerprint.
    reuseScope: { targetType: "capability_pair", targetId: undefined },
    freshFingerprint,
    tool: DEPENDENCY_CANDIDATES_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [taskTier],
    schema: proposeDependenciesResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => {
      const nameById = new Map(capabilities.map((c) => [c.id, c.name]));
      return parsed.candidates
        .filter((c) => {
          if (c.fromCapabilityId === c.toCapabilityId) return false;
          if (!knownIds.has(c.fromCapabilityId) || !knownIds.has(c.toCapabilityId)) return false;
          if (existingEdges.has(`${c.fromCapabilityId}>${c.toCapabilityId}`)) return false;
          return true;
        })
        .map((c) => ({
          targetType: "capability_pair",
          targetId: `${c.fromCapabilityId}:${c.toCapabilityId}`,
          title: `"${nameById.get(c.fromCapabilityId)}" may depend on "${nameById.get(c.toCapabilityId)}"`,
          synopsis: c.why,
          informationUsed: c.informationUsed,
          why: c.why,
          impact: "Applying links these two features as a dependency.",
          assumptions: c.assumptions ?? [],
          sources: c.sources ?? [],
          rulesApplied: ["Only proposes edges between already-approved features — never a still-pending suggestion."],
          proposedContent: { fromCapabilityId: c.fromCapabilityId, toCapabilityId: c.toCapabilityId },
        }));
    },
  });

  return { decision: result.decision, items: result.items };
}
