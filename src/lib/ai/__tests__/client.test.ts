import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRequest } from "../providerTypes";
const { create, construct } = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  responses = { create };
  constructor(options: unknown) { construct(options); }
} }));
const request: AiRequest = {
  model: "gpt-6-sol", max_tokens: 2048,
  system: [{ type: "text", text: "Stable rules", cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: "Untrusted document content" }],
  tools: [{ name: "submit", input_schema: { type: "object", properties: { title: { type: "string" } } } }],
  tool_choice: { type: "tool", name: "submit" },
};
function response() { return {
  status: "completed", output: [{ type: "function_call", name: "submit", arguments: '{"title":"A proposal"}' }],
  usage: { input_tokens: 1000, output_tokens: 150,
    input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 },
    output_tokens_details: { reasoning_tokens: 50 } },
}; }
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-only-key"); vi.stubEnv("OPENAI_MODEL", undefined);
  vi.stubEnv("AI_ENABLED", "true");
  for (const kind of ["INPUT", "OUTPUT", "CACHE_WRITE", "CACHE_READ"])
    vi.stubEnv("OPENAI_" + kind + "_PRICE_PER_MILLION_USD", undefined);
  create.mockResolvedValue(response());
});
afterEach(() => vi.unstubAllEnvs());
describe("OpenAI Responses adapter", () => {
  it("keeps documents in user input and requires one validated function output", async () => {
    const { createAiResponse } = await import("../client");
    const result = await createAiResponse(request);
    expect(construct).toHaveBeenCalledWith({ apiKey: "test-only-key", maxRetries: 0, timeout: 90_000 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-6-sol", store: false, service_tier: "default", max_output_tokens: 2048,
      reasoning: { effort: "low" }, parallel_tool_calls: false,
      prompt_cache_options: { mode: "explicit", ttl: "30m" },
      tool_choice: { type: "function", name: "submit" },
      input: [
        { role: "developer", content: [{ type: "input_text", text: "Stable rules", prompt_cache_breakpoint: { mode: "explicit" } }] },
        { role: "user", content: "Untrusted document content" },
      ],
      tools: [expect.objectContaining({ type: "function", name: "submit", strict: false, parameters: request.tools[0].input_schema })],
    }));
    expect(result.content).toEqual([{ type: "tool_use", input: { title: "A proposal" } }]);
    expect(result.usage).toEqual({ input_tokens: 500, output_tokens: 150,
      cache_creation_input_tokens: 300, cache_read_input_tokens: 200 });
  });
  it.each(["truncated", "refused", "invalid-json", "wrong-function", "multiple-functions"])(
    "retains paid usage but rejects %s output", async kind => {
      const value = response();
      if (kind === "truncated") value.status = "incomplete";
      if (kind === "refused") value.output = [];
      if (kind === "invalid-json") value.output[0].arguments = "{broken";
      if (kind === "wrong-function") value.output[0].name = "other";
      if (kind === "multiple-functions") value.output.push(value.output[0]);
      create.mockResolvedValue(value);
      const { createAiResponse } = await import("../client");
      const result = await createAiResponse(request);
      expect(result.content).toEqual([]);
      expect(result.usage.output_tokens).toBe(150);
      expect(result.usage.cache_read_input_tokens).toBe(200);
    },
  );
  it.each(["disabled", "missing-key", "bad-pricing", "wrong-model"])("prevents API calls when %s", async kind => {
    if (kind === "disabled") vi.stubEnv("AI_ENABLED", "false");
    if (kind === "missing-key") vi.stubEnv("OPENAI_API_KEY", undefined);
    if (kind === "bad-pricing") vi.stubEnv("OPENAI_INPUT_PRICE_PER_MILLION_USD", "bad");
    const { createAiResponse } = await import("../client");
    await expect(createAiResponse({ ...request, model: kind === "wrong-model" ? "unpriced-model" : request.model })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("does not retry transport errors behind the action ledger", async () => {
    create.mockRejectedValue(new Error("Service unavailable"));
    const { createAiResponse } = await import("../client");
    await expect(createAiResponse(request)).rejects.toThrow("Service unavailable");
    expect(create).toHaveBeenCalledTimes(1);
  });
});
