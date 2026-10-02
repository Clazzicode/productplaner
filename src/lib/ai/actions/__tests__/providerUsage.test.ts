import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), record: vi.fn(), gate: vi.fn(), release: vi.fn(),
  saveAnalysis: vi.fn(), saveUsage: vi.fn(), setStatus: vi.fn(), complete: vi.fn(),
}));
vi.mock("@/lib/ai/client", () => ({ AI_MODEL: "gpt-6-sol", createAiResponse: mocks.create }));
vi.mock("@/lib/ai/usage", () => ({ assertAiActionAllowed: mocks.gate, recordAiUsage: mocks.record }));
vi.mock("@/lib/ai/job", () => ({ setAiJobStatus: mocks.setStatus, completeAiJob: mocks.complete }));
vi.mock("@/lib/db", () => ({
  db: { initiative: { findUniqueOrThrow: async () => ({ methodology: "hybrid" }) } },
  withTransaction: async (fn: (tx: unknown) => unknown) => fn({
    intakeAiAnalysis: { create: mocks.saveAnalysis }, aiUsageEvent: { create: mocks.saveUsage },
  }),
}));
vi.mock("@/lib/generation/engine", () => ({ loadIntakeInput: async () => ({ initiativeName: "Test", capabilities: [] }) }));
import { runAnalyzeIntake } from "../analyzeIntake";
import { runDocumentUnderstanding } from "../documentUnderstanding";
const params = { initiativeId: "init-1", userId: "user-1", organizationId: "org-1" };
const documentParams = { ...params, projectId: "project-1", documentScope: "initiative_only" as const, chunks: [] };
const usage = { input_tokens: 1000, output_tokens: 1000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 };
const analysis = { summary: "Summary", assumptions: [], missingInformation: [], risks: [], recommendedRoadmapPhases: [], rationale: "Rationale" };
const expectedUsage = { model: "gpt-6-sol", inputTokens: 1000, outputTokens: 1000, cacheCreationInputTokens: 1000, cacheReadInputTokens: 1000 };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_MODEL", "gpt-6-sol");
  for (const kind of ["INPUT", "OUTPUT", "CACHE_WRITE", "CACHE_READ"])
    vi.stubEnv("OPENAI_" + kind + "_PRICE_PER_MILLION_USD", undefined);
  mocks.gate.mockResolvedValue({ capability: { maxOutputTokens: 4096 }, release: mocks.release, jobId: "job-1" });
  mocks.saveAnalysis.mockResolvedValue({ id: "analysis-1" });
  mocks.saveUsage.mockResolvedValue({ id: "usage-1" });
});
afterEach(() => vi.unstubAllEnvs());
describe("OpenAI intake and document accounting", () => {
  it("persists model, all token categories and cost with a validated intake analysis", async () => {
    mocks.create.mockResolvedValue({ content: [{ type: "tool_use", input: analysis }], usage });
    await runAnalyzeIntake(params);
    expect(mocks.saveUsage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ...expectedUsage, estimatedCostUsd: 0.0147, success: true, organizationId: "org-1",
    }) }));
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("accounts for each rejected intake attempt without saving a plan", async () => {
    mocks.create.mockResolvedValue({ content: [], usage });
    await expect(runAnalyzeIntake(params)).rejects.toThrow();
    expect(mocks.create).toHaveBeenCalledTimes(3);
    expect(mocks.record).toHaveBeenCalledTimes(3);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ ...expectedUsage, success: false }));
    expect(mocks.saveAnalysis).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("records document usage before returning proposals for review", async () => {
    mocks.create.mockResolvedValue({ content: [{ type: "tool_use", input: { items: [], features: [], risks: [] } }], usage });
    await runDocumentUnderstanding(documentParams);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ ...expectedUsage, success: true }));
  });
  it.each([null, { warnings: 3 }])("records a paid malformed document response", async input => {
    mocks.create.mockResolvedValue({ content: input === null ? [] : [{ type: "tool_use", input }], usage });
    await expect(runDocumentUnderstanding(documentParams)).rejects.toThrow();
    expect(mocks.record).toHaveBeenCalledOnce();
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ ...expectedUsage, success: false }));
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
