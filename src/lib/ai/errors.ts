// Typed AI-foundation errors, same pattern as src/lib/generation/engine.ts's
// IntakeInvalidError/AgileLayerLockedError — thrown deep in the call stack,
// caught by the API route and mapped to a status code there.

export class AiDisabledError extends Error {}

export class AiCapabilityDisabledError extends Error {}

export class AiUsageLimitExceededError extends Error {
  constructor(
    message: string,
    public scope: "user" | "organization",
  ) {
    super(message);
  }
}

export class AiRequestInProgressError extends Error {}

export class AiResponseValidationError extends Error {}

// AI Assist (Section 4) — thrown before assertAiActionAllowed/any AiJob is
// created, when an action has nothing meaningful to reason about yet (e.g.
// PROPOSE_FEATURES with zero capabilities and no problem statement, or
// RECOMMEND_SPRINTS with no team size entered). No AI call, no usage spend —
// "never invent capacity/velocity/content, ask for input instead."
export class InsufficientContextError extends Error {}

// AI Assist — thrown by src/lib/ai/assist/apply handlers when Apply would
// touch locked/approved content without explicit confirmation (mirrors
// src/lib/generation/engine.ts's ApprovedBaselineImpactError for the
// roadmap-recalculate flow, kept separate since that class is tightly
// coupled to recalculatePlan's own call site).
export class AiAssistApplyBlockedError extends Error {
  constructor(
    message: string,
    public reason: "approved_baseline" | "locked_layer",
  ) {
    super(message);
  }
}

// AI Assist — a proposed dependency edge that already exists (a human added
// it manually in the meantime, or a second Apply click) — a clean 409, not a
// crash, from the unique constraint on CapabilityDependency.
export class DependencyAlreadyExistsError extends Error {}

// Section 5 — thrown by assembleAiContext (src/lib/ai/context/assembleContext.ts)
// when the given organizationId/projectId/initiativeId don't form a real
// ownership chain (e.g. an initiativeId that doesn't belong to the given
// projectId) — a second, independent check beyond the route-level access
// guard, at the exact point where cross-scope data leakage would happen.
export class ContextScopeMismatchError extends Error {}

// Section 5 — thrown by assembleAiContext when the operation's *required*
// context tiers alone already exceed its configured maxContextTokens. Never
// silently truncated to fit — this stops the request instead of guessing
// which required fact is safe to drop. Carries the (lightweight,
// content-free) audit record so the caller can still write
// AiJob.contextAuditJson with overBudget:true even though generation never
// proceeded — "record that the limit was exceeded" per Section 5 §40.
export class ContextBudgetExceededError extends Error {
  constructor(
    message: string,
    public audit: import("./context/types").ContextAudit,
  ) {
    super(message);
  }
}
