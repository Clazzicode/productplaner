import OpenAI from "openai";
import { AiDisabledError } from "./errors";
import { assertAiPricingConfigured } from "./pricing";
import type { AiMessage, AiRequest } from "./providerTypes";

export const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-6-sol";
export function isAiEnabled(): boolean { return process.env.AI_ENABLED !== "false"; }
let cachedClient: OpenAI | undefined;

/** Server-owned credentials only; never use a desktop login or browser key. */
function getOpenAIClient(): OpenAI {
  if (!isAiEnabled()) throw new AiDisabledError("AI features are currently disabled.");
  assertAiPricingConfigured();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  // Existing action pipelines own retries and record their token costs.
  return cachedClient ??= new OpenAI({ apiKey, maxRetries: 0, timeout: 90_000 });
}

/** Adapt OpenAI Responses to the existing validated proposal pipeline. */
export async function createAiResponse(request: AiRequest): Promise<AiMessage> {
  if (request.model !== AI_MODEL) throw new Error("AI requests must use the configured server model.");
  const systemBlocks = typeof request.system === "string"
    ? [{ type: "text" as const, text: request.system }] : request.system;
  const response = await getOpenAIClient().responses.create({
    model: request.model,
    store: false,
    service_tier: "default",
    reasoning: { effort: "low" },
    max_output_tokens: request.max_tokens,
    parallel_tool_calls: false,
    // Only stable developer content receives an explicit cache breakpoint.
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    input: [
      { role: "developer", content: systemBlocks.map(block => ({
        type: "input_text" as const, text: block.text,
        ...("cache_control" in block ? { prompt_cache_breakpoint: { mode: "explicit" as const } } : {}),
      })) },
      ...request.messages.map(message => ({ role: message.role, content: message.content })),
    ],
    tools: request.tools.map(tool => ({
      type: "function" as const, name: tool.name, description: tool.description,
      parameters: tool.input_schema,
      // Existing schemas omit uncertain fields. Keep optional semantics and
      // retain the existing Zod validators rather than invent required values.
      strict: false,
    })),
    tool_choice: { type: "function", name: request.tool_choice.name },
  });
  const content: AiMessage["content"] = [];
  const calls = response.output.filter(item => item.type === "function_call");
  // Retain usage on malformed, refused or truncated output. Callers record
  // the paid attempt before rejecting/retrying it; invalid output never saves.
  if (response.status === "completed" && calls.length === 1 && calls[0].name === request.tool_choice.name) {
    try { content.push({ type: "tool_use", input: JSON.parse(calls[0].arguments) }); }
    catch { /* Existing action validation handles malformed structured output. */ }
  }
  const read = response.usage?.input_tokens_details?.cached_tokens ?? 0;
  const written = response.usage?.input_tokens_details?.cache_write_tokens ?? 0;
  return { content, usage: {
    // OpenAI totals include cached reads/writes; ledger categories are disjoint.
    input_tokens: Math.max(0, (response.usage?.input_tokens ?? 0) - read - written),
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_creation_input_tokens: written,
    cache_read_input_tokens: read,
  } };
}
