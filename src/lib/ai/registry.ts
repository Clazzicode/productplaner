import { db } from "@/lib/db";
import type { AiActionKey, AiCapabilityConfig } from "./types";
import type { ContextLayer } from "./context/types";

// AI capability registry (req #5, docs/V2-AI-FOUNDATION.md). Mirrors the
// closest existing precedent, src/lib/sync/integrationSeed.ts's
// ensureProvidersSeeded(): a static seed array + idempotent bootstrap run
// lazily on first use, no separate seed script.
//
// Deliberate deviation from that precedent: the upsert's `update` clause is
// empty, not the full field set. IntegrationProvider re-syncs every field
// from code on every cold start because its fields aren't meant to be
// runtime-tunable. AiCapability's `enabled` flag, usage limits, and (as of
// Section 5) context/output-shape metadata are exactly what req #5/§24 ask
// to be configurable at runtime (e.g. by directly editing the row, or a
// future admin route) — so once a row exists, only its *existence* is
// code-controlled; live values are never clobbered by a redeploy or the
// next serverless cold start.

const AI_CAPABILITIES: AiCapabilityConfig[] = [
  {
    action: "ANALYZE_INTAKE",
    enabled: true,
    maxOutputTokens: 4096,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Analyzes an initiative's intake data and returns a qualitative summary, assumptions, missing information, risks, recommended roadmap phases, and rationale.",
    maxContextTokens: 6000,
    requiredContextLayers: ["initiative"],
    optionalContextLayers: ["project"],
    outputType: "qualitative_analysis",
    reusable: true,
  },
  {
    action: "DOCUMENT_UNDERSTANDING",
    enabled: true,
    maxOutputTokens: 4096,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Reads an uploaded document's (PDF/DOCX/PPTX) extracted chunks and proposes structured, source-cited planning facts/features/risks for individual review and approval — never auto-approved or written directly into Project/Initiative data.",
    maxContextTokens: 12000,
    requiredContextLayers: ["task"],
    optionalContextLayers: [],
    outputType: "context_extraction",
    reusable: false,
  },
  // Section 4 — AI Assist. Each of these proposes DRAFT AiAssistItem rows
  // alongside the deterministic plan; none ever write to Capability/
  // ArtifactLayer/Sprint/Release/Risk/CapabilityDependency/RoadmapStatus
  // directly — only an explicit user "Apply" does (src/lib/ai/assist/apply).
  {
    action: "ROADMAP_INSIGHTS",
    enabled: true,
    maxOutputTokens: 2048,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Reviews an initiative's approved plan and context for qualitative timing/dependency concerns — never states a date, sprint, or point estimate.",
    maxContextTokens: 6000,
    requiredContextLayers: ["initiative"],
    optionalContextLayers: ["project"],
    outputType: "insight",
    reusable: true,
  },
  {
    action: "PROPOSE_FEATURES",
    enabled: true,
    maxOutputTokens: 4096,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Proposes candidate new features based on approved intake/capabilities, for individual review and approval — never added to the plan automatically.",
    maxContextTokens: 8000,
    requiredContextLayers: ["initiative"],
    optionalContextLayers: ["project"],
    outputType: "feature_candidates",
    reusable: true,
  },
  {
    action: "PROPOSE_STORY_CONTENT",
    enabled: true,
    maxOutputTokens: 4096,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Proposes improved epic/story/acceptance-criterion titles and descriptions for one feature — never touches points, sprint assignment, or ordering.",
    maxContextTokens: 8000,
    requiredContextLayers: ["task", "initiative"],
    optionalContextLayers: ["project"],
    outputType: "story_content",
    reusable: true,
  },
  {
    action: "PROPOSE_DEPENDENCIES",
    enabled: true,
    maxOutputTokens: 2048,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Proposes candidate dependency edges between already-approved capabilities, for individual review and approval.",
    maxContextTokens: 6000,
    requiredContextLayers: ["task", "initiative"],
    optionalContextLayers: [],
    outputType: "dependency_candidates",
    reusable: true,
  },
  {
    action: "PROPOSE_RISKS",
    enabled: true,
    maxOutputTokens: 2048,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description: "Proposes candidate risks grounded in approved intake/capability data, for individual review and approval.",
    maxContextTokens: 6000,
    requiredContextLayers: ["initiative"],
    optionalContextLayers: ["project"],
    outputType: "risk_candidates",
    reusable: true,
  },
  {
    action: "RECOMMEND_RELEASES",
    enabled: true,
    maxOutputTokens: 2048,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Recommends release groupings or adjustments — a recommendation only, applied through the existing manual release routes, never a silent roadmap timing change.",
    maxContextTokens: 6000,
    requiredContextLayers: ["task", "initiative"],
    optionalContextLayers: ["project"],
    outputType: "release_recommendation",
    reusable: true,
  },
  {
    action: "RECOMMEND_SPRINTS",
    enabled: true,
    maxOutputTokens: 2048,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Recommends sprint structure using only user-provided team size/velocity — never invents capacity. Short-circuits with no AI call when that data is missing.",
    maxContextTokens: 4000,
    requiredContextLayers: ["task"],
    optionalContextLayers: [],
    outputType: "sprint_recommendation",
    reusable: true,
  },
  {
    action: "RECOMMEND_STATUS",
    enabled: true,
    maxOutputTokens: 1024,
    userMonthlyLimit: 50,
    organizationMonthlyLimit: 500,
    description:
      "Turns the platform's own deterministic Red/Yellow/Green recommendation (src/lib/roadmapStatus/recommend.ts) into plain-language why/impact copy — never computes its own color.",
    maxContextTokens: 2000,
    requiredContextLayers: ["task"],
    optionalContextLayers: [],
    outputType: "status_explanation",
    reusable: true,
  },
];

function toDbCreateData(c: AiCapabilityConfig) {
  return {
    action: c.action,
    enabled: c.enabled,
    maxOutputTokens: c.maxOutputTokens,
    userMonthlyLimit: c.userMonthlyLimit,
    organizationMonthlyLimit: c.organizationMonthlyLimit,
    description: c.description,
    maxContextTokens: c.maxContextTokens,
    requiredContextLayersJson: JSON.stringify(c.requiredContextLayers),
    optionalContextLayersJson: JSON.stringify(c.optionalContextLayers),
    outputType: c.outputType,
    reusable: c.reusable,
  };
}

function parseContextLayers(raw: string): ContextLayer[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed.filter((v) => typeof v === "string") as ContextLayer[]) : [];
  } catch {
    return [];
  }
}

let seeded = false;

export async function ensureAiCapabilitiesSeeded(): Promise<void> {
  if (seeded) return;
  for (const c of AI_CAPABILITIES) {
    const data = toDbCreateData(c);
    await db.aiCapability.upsert({
      where: { action: c.action },
      // `enabled`/limits/`description` stay admin-tunable at runtime (never
      // re-synced — see this module's header comment). The Section 5
      // context/output-shape metadata is different: it's a structural fact
      // about the operation, defined in code, not something an admin edits
      // — so it DOES re-sync on every cold start, the same way
      // IntegrationProvider's fields already do for the same reason. This
      // also backfills the specific per-action values onto the rows
      // Section 4 already seeded (which otherwise would have been stuck on
      // this migration's column defaults forever).
      update: {
        maxContextTokens: data.maxContextTokens,
        requiredContextLayersJson: data.requiredContextLayersJson,
        optionalContextLayersJson: data.optionalContextLayersJson,
        outputType: data.outputType,
        reusable: data.reusable,
      },
      create: data,
    });
  }
  seeded = true;
}

export async function getAiCapabilityConfig(action: AiActionKey): Promise<AiCapabilityConfig | null> {
  await ensureAiCapabilitiesSeeded();
  const row = await db.aiCapability.findUnique({ where: { action } });
  if (!row) return null;
  return {
    action: row.action as AiActionKey,
    enabled: row.enabled,
    maxOutputTokens: row.maxOutputTokens,
    userMonthlyLimit: row.userMonthlyLimit,
    organizationMonthlyLimit: row.organizationMonthlyLimit,
    description: row.description,
    maxContextTokens: row.maxContextTokens,
    requiredContextLayers: parseContextLayers(row.requiredContextLayersJson),
    optionalContextLayers: parseContextLayers(row.optionalContextLayersJson),
    outputType: row.outputType,
    reusable: row.reusable,
  };
}
