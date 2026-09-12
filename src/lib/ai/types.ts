// AI Foundation shared types (docs/V2-AI-FOUNDATION.md).

/** Registry key for an AI action. Add new actions here as they're built.
 * RESEARCH and GENERATION (directive §14B/§14C) aren't added yet — no
 * action implements them, and stubbing an unused union member ahead of the
 * code that needs it is dead weight. */
export type AiActionKey = "ANALYZE_INTAKE" | "DOCUMENT_UNDERSTANDING";

export interface AiCapabilityConfig {
  action: AiActionKey;
  enabled: boolean;
  maxOutputTokens: number;
  userMonthlyLimit: number;
  organizationMonthlyLimit: number;
  description: string;
}

/** AiJob.status vocabulary (directive §18-21's internal-stage table). Never
 * shown to the user directly — src/lib/ai/activityCopy.ts maps each value to
 * plain-language copy. Today's actions (single synchronous Anthropic calls)
 * only ever pass through queued -> extracting_information -> completed/failed
 * for real; the richer stages below are reserved for the multi-stage
 * pipelines Phase 4/5 add later. */
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
