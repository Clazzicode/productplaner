import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const resolveReuseDecision = vi.fn();
vi.mock("../reuse", () => ({ resolveReuseDecision }));

const assertAiActionAllowed = vi.fn();
const recordAiUsage = vi.fn();
vi.mock("@/lib/ai/usage", () => ({ assertAiActionAllowed, recordAiUsage }));

const setAiJobStatus = vi.fn();
const setAiJobContextAudit = vi.fn();
vi.mock("@/lib/ai/job", () => ({ setAiJobStatus, setAiJobContextAudit }));

const messagesCreate = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-test",
  getAnthropicClient: () => ({ messages: { create: messagesCreate } }),
}));

const withTransaction = vi.fn();
vi.mock("@/lib/db", () => ({ withTransaction }));

const assembleAiContext = vi.fn();
vi.mock("@/lib/ai/context/assembleContext", () => ({ assembleAiContext }));

const { runAssistAction } = await import("../runAction");

const STABLE_SYSTEM_PROMPT = "stable platform rules — never project/initiative data";
const ASSEMBLED_TEXT = "## Approved initiative information\nAssembled project/initiative/task data goes here.";

const FAKE_ASSEMBLED_CONTEXT = {
  tiers: [],
  text: ASSEMBLED_TEXT,
  estimatedTokens: 42,
  audit: { organizationId: "org-1", projectId: "proj-1", initiativeId: "init-1", recordsLoaded: [], overBudget: false },
};

const baseParams = {
  action: "PROPOSE_FEATURES" as const,
  userId: "user-1",
  organizationId: "org-1",
  projectId: "proj-1",
  initiativeId: "init-1",
  reuseScope: { targetType: "initiative", targetId: null },
  freshFingerprint: "fp-1",
  tool: { name: "submit", description: "d", input_schema: { type: "object" as const, properties: {} } },
  toolName: "submit",
  system: STABLE_SYSTEM_PROMPT,
  extraTiers: [],
  schema: z.object({ candidates: z.array(z.object({ name: z.string() })) }),
  buildDrafts: (parsed: { candidates: { name: string }[] }) =>
    parsed.candidates.map((c) => ({
      targetType: "initiative",
      targetId: null,
      title: c.name,
      synopsis: c.name,
      informationUsed: "x",
      why: "y",
      impact: "z",
      assumptions: [],
      sources: [],
      rulesApplied: [],
      proposedContent: c,
    })),
};

beforeEach(() => {
  vi.clearAllMocks();
  assembleAiContext.mockResolvedValue(FAKE_ASSEMBLED_CONTEXT);
});

describe("runAssistAction — reuse gate (existing, no meaningful change)", () => {
  it("reuse: makes NO Anthropic call, returns the existing item, and logs a kind:'reuse' ledger row", async () => {
    resolveReuseDecision.mockResolvedValueOnce({
      decision: "reuse",
      existingItem: { id: "item-1", aiJobId: "job-old" },
    });

    const result = await runAssistAction(baseParams);

    expect(result.decision).toBe("reuse");
    expect(result.items).toEqual([{ id: "item-1", aiJobId: "job-old" }]);
    expect(assertAiActionAllowed).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(assembleAiContext).not.toHaveBeenCalled();
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reuse",
        success: true,
        aiJobId: null,
        aiAssistItemId: "item-1",
      }),
    );
    // Zero tokens/cost — this is a bookkeeping row, not a real call.
    const call = recordAiUsage.mock.calls[0][0];
    expect(call.inputTokens ?? 0).toBe(0);
    expect(call.outputTokens ?? 0).toBe(0);
  });

  it("flag_stale: makes NO Anthropic call — never a silent regeneration — and also logs a kind:'reuse' row", async () => {
    resolveReuseDecision.mockResolvedValueOnce({
      decision: "flag_stale",
      existingItem: { id: "item-1", aiJobId: "job-old" },
    });

    const result = await runAssistAction(baseParams);

    expect(result.decision).toBe("flag_stale");
    expect(assertAiActionAllowed).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
    expect(recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ kind: "reuse", success: true }));
  });

  it("generate_new: calls Anthropic and saves a draft row per candidate", async () => {
    resolveReuseDecision.mockResolvedValueOnce({ decision: "generate_new", existingItem: null });
    assertAiActionAllowed.mockResolvedValueOnce({
      capability: { maxOutputTokens: 1024 },
      release: vi.fn(),
      jobId: "job-1",
    });
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { candidates: [{ name: "Bulk export" }] } }],
      usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 5, cache_read_input_tokens: 3 },
    });

    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "new-item-1" });
    withTransaction.mockImplementationOnce((fn: (tx: unknown) => unknown) =>
      fn({ aiAssistItem: { findFirst, create, update: vi.fn() } }),
    );

    const result = await runAssistAction(baseParams);

    expect(result.decision).toBe("generate_new");
    expect(result.items).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, cacheCreationInputTokens: 5, cacheReadInputTokens: 3 }),
    );
  });

  it("generate_new: system is a single cached block containing ONLY the stable prompt; assembled context goes in messages, never system", async () => {
    resolveReuseDecision.mockResolvedValueOnce({ decision: "generate_new", existingItem: null });
    assertAiActionAllowed.mockResolvedValueOnce({ capability: { maxOutputTokens: 1024 }, release: vi.fn(), jobId: "job-1" });
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { candidates: [] } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    withTransaction.mockImplementationOnce((fn: (tx: unknown) => unknown) =>
      fn({ aiAssistItem: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() } }),
    );

    await runAssistAction(baseParams);

    const call = messagesCreate.mock.calls[0][0];
    expect(call.system).toEqual([{ type: "text", text: STABLE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(JSON.stringify(call.system)).not.toContain(ASSEMBLED_TEXT);
    expect(call.messages).toEqual([{ role: "user", content: ASSEMBLED_TEXT }]);
  });

  it("generate_new: writes AiJob.contextAuditJson from the assembled context's audit", async () => {
    resolveReuseDecision.mockResolvedValueOnce({ decision: "generate_new", existingItem: null });
    assertAiActionAllowed.mockResolvedValueOnce({ capability: { maxOutputTokens: 1024 }, release: vi.fn(), jobId: "job-1" });
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { candidates: [] } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    withTransaction.mockImplementationOnce((fn: (tx: unknown) => unknown) =>
      fn({ aiAssistItem: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() } }),
    );

    await runAssistAction(baseParams);

    expect(setAiJobContextAudit).toHaveBeenCalledWith("job-1", FAKE_ASSEMBLED_CONTEXT.audit);
  });

  it("on a thrown Anthropic error: creates ZERO AiAssistItem rows and records failure", async () => {
    resolveReuseDecision.mockResolvedValueOnce({ decision: "generate_new", existingItem: null });
    const release = vi.fn();
    assertAiActionAllowed.mockResolvedValueOnce({ capability: { maxOutputTokens: 1024 }, release, jobId: "job-1" });
    messagesCreate.mockRejectedValueOnce(new Error("network error"));

    await expect(runAssistAction(baseParams)).rejects.toThrow("network error");

    expect(withTransaction).not.toHaveBeenCalled();
    expect(recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(release).toHaveBeenCalledTimes(1);
  });
});
