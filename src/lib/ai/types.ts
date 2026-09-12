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
