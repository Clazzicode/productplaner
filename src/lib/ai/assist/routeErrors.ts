import { jsonError } from "@/lib/api";
import {
  AiCapabilityDisabledError,
  AiDisabledError,
  AiRequestInProgressError,
  AiResponseValidationError,
  AiUsageLimitExceededError,
  ContextBudgetExceededError,
  ContextScopeMismatchError,
  InsufficientContextError,
} from "@/lib/ai/errors";

// Shared error -> HTTP mapping for every AI Assist trigger route (Section 4/5)
// — same status codes src/app/api/initiatives/[id]/analyze-intake/route.ts
// already established, so the client's existing handling for those applies
// unchanged to the 8 new actions.
export function mapAssistActionError(err: unknown) {
  if (err instanceof AiDisabledError) return jsonError("AI features are currently disabled.", 503);
  if (err instanceof AiCapabilityDisabledError) return jsonError(err.message, 403);
  if (err instanceof AiUsageLimitExceededError) return jsonError(err.message, 429);
  if (err instanceof AiRequestInProgressError) return jsonError("This is already being generated.", 409);
  if (err instanceof AiResponseValidationError) {
    return jsonError("The AI response could not be validated — please try again.", 502);
  }
  if (err instanceof InsufficientContextError) return jsonError(err.message, 422);
  if (err instanceof ContextBudgetExceededError) {
    return jsonError("This needs more information than can be handled in one request — try narrowing what you're asking about.", 422);
  }
  if (err instanceof ContextScopeMismatchError) return jsonError("Not found.", 404);
  return jsonError("Could not complete this request — please try again.", 502);
}
