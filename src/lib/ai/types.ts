// AI Foundation shared types (docs/V2-AI-FOUNDATION.md).

/** Registry key for an AI action. Add new actions here as they're built.
 * RESEARCH and GENERATION (directive §14B/§14C) aren't added yet — no
 * action implements them, and stubbing an unused union member ahead of the
 * code that needs it is dead weight.
 *
 * Section 4 — AI Assist: 8 actions that propose/observe DRAFT content
 * alongside the deterministic plan (src/lib/ai/assist/, src/lib/ai/actions/).
 * None of these compute dates/points/capacity/dependency order themselves —
 * GLOBAL_PRODUCT_PLANNING_RULES forbids it, and every AiAssistItem stays
 * status "proposed" until a user explicitly applies it. */
export type AiActionKey =
  | "ANALYZE_INTAKE"
  | "DOCUMENT_UNDERSTANDING"
  | "ROADMAP_INSIGHTS"
  | "PROPOSE_FEATURES"
  | "PROPOSE_STORY_CONTENT"
  | "PROPOSE_DEPENDENCIES"
  | "PROPOSE_RISKS"
  | "RECOMMEND_RELEASES"
  | "RECOMMEND_SPRINTS"
  | "RECOMMEND_STATUS";

export interface AiCapabilityConfig {
  action: AiActionKey;
  enabled: boolean;
  maxOutputTokens: number;
  userMonthlyLimit: number;
  organizationMonthlyLimit: number;
  description: string;
  // Section 5 — AI Operation Registry metadata (§5/§24), extending this
  // already-runtime-configurable per-action config.
  maxContextTokens: number;
  requiredContextLayers: import("./context/types").ContextLayer[];
  optionalContextLayers: import("./context/types").ContextLayer[];
  outputType: string;
  reusable: boolean;
}

/** AiJob.status vocabulary (directive §18-21's internal-stage table). Never
 * shown to the user directly — src/lib/ai/activityCopy.ts maps each value to
 * plain-language copy. ANALYZE_INTAKE/DOCUMENT_UNDERSTANDING (single
 * synchronous Anthropic calls) only ever pass through
 * queued -> extracting_information -> completed/failed for real; the AI
 * Assist actions (src/lib/ai/actions/*, Section 4) are the first to use the
 * richer loading_context -> checking_gaps -> building_recommendation ->
 * validating_output -> saving_artifact sequence this type already reserved. */
export type AiJobStatus =
  | "queued"
  | "validating_access"
  | "loading_context"
  | "processing_sources"
  | "extracting_information"
  | "checking_gaps"
  | "waiting_for_user"
  | "building_recommendation"
  | "validating_output"
  | "saving_artifact"
  | "completed"
  | "failed"
  | "cancelled";
