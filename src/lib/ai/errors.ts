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
