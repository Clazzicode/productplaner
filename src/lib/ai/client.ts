import Anthropic from "@anthropic-ai/sdk";
import { AiDisabledError } from "./errors";

// Centralized server-side Anthropic access (docs/V2-AI-FOUNDATION.md).
// Reads the server ANTHROPIC_API_KEY env var only — never a value sent from
// or exposed to the client. This is deliberately separate from the existing
// per-user key flow (User.anthropicApiKeyEncrypted, src/lib/intakeImport),
// which keeps using each user's own key for that one feature.

/** Global kill switch (req #8). Unset/missing = enabled; only the literal
 * string "false" disables. An env var, not a DB flag, so it still works
 * even if the database is unreachable. */
export function isAiEnabled(): boolean {
  return process.env.AI_ENABLED !== "false";
}

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!isAiEnabled()) throw new AiDisabledError("AI features are currently disabled.");
  if (!cachedClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}
