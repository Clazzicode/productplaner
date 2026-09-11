// AI Foundation shared types (docs/V2-AI-FOUNDATION.md).

/** Registry key for an AI action. Add new actions here as they're built. */
export type AiActionKey = "ANALYZE_INTAKE";

export interface AiCapabilityConfig {
  action: AiActionKey;
  enabled: boolean;
  maxOutputTokens: number;
  userMonthlyLimit: number;
  organizationMonthlyLimit: number;
  description: string;
}
