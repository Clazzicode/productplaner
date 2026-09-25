// Section 5 — layered AI context (§2). Five conceptual layers, from broadest
// to most specific; every AI action's context package is built by combining
// whichever of these its operation declares as required/optional
// (AiCapability.requiredContextLayersJson/optionalContextLayersJson), never
// one giant undifferentiated context object.
export type ContextLayer = "workspace" | "project" | "initiative" | "artifact" | "task";

/**
 * One piece of assembled context. `content` is the only field that ever
 * holds real text — everything else is a lightweight reference, which is
 * exactly what makes `ContextAudit` below safe to persist as-is (§40's
 * "record only what was loaded, never the content itself").
 */
export interface ContextTier {
  layer: ContextLayer;
  /** Higher = kept longer under a tight budget. */
  priority: number;
  /** Never dropped by trimToBudget, regardless of priority — see tokenBudget.ts. */
  required: boolean;
  label: string;
  content: string;
  sourceType: string;
  sourceId: string;
  sourceVersion?: string;
}

/** One lightweight audit entry — id/version reference only, never content.
 * This is deliberately the exact shape persisted into AiJob.contextAuditJson
 * (see assembleContext.ts), so "what the audit records" and "what's safe to
 * persist" are the same type by construction. */
export interface ContextAuditRecord {
  layer: ContextLayer;
  type: string;
  id: string;
  version?: string;
}

export interface ContextAudit {
  organizationId: string;
  projectId: string | null;
  initiativeId: string | null;
  recordsLoaded: ContextAuditRecord[];
  overBudget: boolean;
}

export interface AssembledContext {
  tiers: ContextTier[];
  /** The tiers' content, joined for direct use as user-message content. */
  text: string;
  estimatedTokens: number;
  audit: ContextAudit;
}
