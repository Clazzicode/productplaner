import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveMethodology } from "@/lib/generation/methodology";
import { proposeStoryContentResultSchema } from "@/lib/validation/schemas";
import { GLOBAL_PRODUCT_PLANNING_RULES, METHODOLOGY_AI_GUIDANCE } from "@/lib/ai/methodologyRules";
import { PLATFORM_SYSTEM_PROMPT } from "@/lib/ai/systemPrompt";
import { InsufficientContextError } from "@/lib/ai/errors";
import { computeContentProposalFingerprint } from "@/lib/ai/assist/fingerprint";
import { runAssistAction, type AiAssistItemDraft } from "@/lib/ai/assist/runAction";
import type { ContextTier } from "@/lib/ai/context/types";
import type { AiAssistItem } from "@prisma/client";

// PROPOSE_STORY_CONTENT (Section 4 §13/§15/§16) — the templated epic/story/
// AC text decompose.ts writes today (fixed "Core Implementation"/"Validation
// & Edge Cases" suffixes, a hardcoded story-want phrase bank, 3 fixed
// Given/When/Then ACs) is the real content gap this fills. Proposes better
// titles/bodies for the feature's CURRENT tree, and may propose brand-new
// stories/ACs — never points, sprintId, or ordering; src/lib/ai/assist/apply's
// content_proposal handler only ever touches title/body on an existing row,
// or creates a new one with points/sprintId left null for a human to size.

const TOOL_NAME = "submit_story_content";

const STORY_CONTENT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit improved epic/story/acceptance-criterion wording for this feature.",
  input_schema: {
    type: "object",
    properties: {
      epics: {
        type: "array",
        items: {
          type: "object",
          properties: {
            existingArtifactLayerId: {
              type: ["string", "null"],
              description: "Id of the epic you're rewording, or null if proposing a brand-new epic.",
            },
            title: { type: "string" },
            body: { type: "string" },
            stories: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  existingArtifactLayerId: { type: ["string", "null"] },
                  title: { type: "string" },
                  body: { type: "string", description: "Full \"As a ..., I want ..., so that ...\" sentence." },
                  acceptanceCriteria: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        existingArtifactLayerId: { type: ["string", "null"] },
                        title: { type: "string" },
                        body: { type: "string", description: "Given / When / Then." },
                      },
                      required: ["existingArtifactLayerId", "title", "body"],
                    },
                  },
                },
                required: ["existingArtifactLayerId", "title", "body"],
              },
            },
          },
          required: ["existingArtifactLayerId", "title", "body"],
        },
      },
      why: { type: "string" },
      informationUsed: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
      sources: { type: "array", items: { type: "string" } },
    },
    required: ["epics", "why", "informationUsed"],
  },
};

interface TreeNode {
  id: string;
  title: string;
  body: string;
  children: TreeNode[];
}

function formatTreeForPrompt(nodes: TreeNode[], depth = 0): string {
  return nodes
    .map((n) => {
      const indent = "  ".repeat(depth);
      const line = `${indent}- [id:${n.id}] ${n.title} — ${n.body}`;
      return n.children.length > 0 ? `${line}\n${formatTreeForPrompt(n.children, depth + 1)}` : line;
    })
    .join("\n");
}

export interface RunProposeStoryContentParams {
  featureArtifactLayerId: string;
  userId: string;
  organizationId: string;
}

export interface RunProposeStoryContentResult {
  decision: "generate_new" | "reuse" | "flag_stale";
  items: AiAssistItem[];
}

export async function runProposeStoryContent(params: RunProposeStoryContentParams): Promise<RunProposeStoryContentResult> {
  const { featureArtifactLayerId, userId, organizationId } = params;

  const feature = await db.artifactLayer.findUniqueOrThrow({
    where: { id: featureArtifactLayerId },
    select: {
      id: true,
      title: true,
      body: true,
      sourceCapability: { select: { name: true, description: true } },
      prototype: {
        select: {
          initiativeId: true,
          initiative: { select: { projectId: true, methodology: true } },
        },
      },
      children: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          title: true,
          body: true,
          children: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              body: true,
              children: { orderBy: { order: "asc" }, select: { id: true, title: true, body: true } },
            },
          },
        },
      },
    },
  });

  if (feature.children.length === 0) {
    throw new InsufficientContextError("This feature has no epics yet — generate the plan before requesting story suggestions.");
  }

  const { initiativeId } = feature.prototype;
  const { projectId, methodology: methodologyRaw } = feature.prototype.initiative;
  const methodology = resolveMethodology(methodologyRaw);
  const system = `${PLATFORM_SYSTEM_PROMPT}\n\n${GLOBAL_PRODUCT_PLANNING_RULES}\n\n${METHODOLOGY_AI_GUIDANCE[methodology]}\n\nYou propose epic/story/acceptance-criterion TEXT only — never a point estimate, sprint assignment, or ordering. Reference existingArtifactLayerId for a node you're rewording; use null only when proposing a genuinely new epic/story/AC. Propose clearer, more specific titles/wording — grounded in the feature's actual description, not generic phrasing. You may also propose a new story or acceptance criterion this feature is missing.`;

  const tree: TreeNode[] = feature.children.map((epic) => ({
    id: epic.id,
    title: epic.title,
    body: epic.body,
    children: epic.children.map((story) => ({
      id: story.id,
      title: story.title,
      body: story.body,
      children: story.children.map((ac) => ({ id: ac.id, title: ac.title, body: ac.body, children: [] })),
    })),
  }));

  // This feature's current tree is genuinely task-specific — no generic
  // loader could know which feature is in play — so it stays a hand-built
  // tier here, passed through as the "task" layer (always required, never
  // trimmed).
  const taskTier: ContextTier = {
    layer: "task",
    priority: 100,
    required: true,
    label: "Feature to improve",
    content: `Feature: ${feature.title}${feature.body ? ` — ${feature.body}` : ""}
${feature.sourceCapability?.description ? `Capability description: ${feature.sourceCapability.description}` : ""}

Current epic/story/acceptance-criterion tree (id in brackets):
${formatTreeForPrompt(tree)}`,
    sourceType: "ArtifactLayer",
    sourceId: featureArtifactLayerId,
  };

  const freshFingerprint = await computeContentProposalFingerprint(featureArtifactLayerId);

  const result = await runAssistAction({
    action: "PROPOSE_STORY_CONTENT",
    userId,
    organizationId,
    projectId,
    initiativeId,
    reuseScope: { targetType: "feature", targetId: featureArtifactLayerId },
    freshFingerprint,
    tool: STORY_CONTENT_TOOL,
    toolName: TOOL_NAME,
    system,
    extraTiers: [taskTier],
    schema: proposeStoryContentResultSchema,
    buildDrafts: (parsed): AiAssistItemDraft[] => [
      {
        targetType: "feature",
        targetId: featureArtifactLayerId,
        title: `Suggested wording for "${feature.title}"`,
        synopsis: parsed.why,
        informationUsed: parsed.informationUsed,
        why: parsed.why,
        impact: "Applying updates title/description text only — sizing, sprint assignment, and ordering are never changed.",
        assumptions: parsed.assumptions ?? [],
        sources: parsed.sources ?? [],
        rulesApplied: ["Never touches points, sprint assignment, or ordering — text only."],
        proposedContent: { epics: parsed.epics },
      },
    ],
  });

  return { decision: result.decision, items: result.items };
}
