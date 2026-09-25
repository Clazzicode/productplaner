import { beforeEach, describe, expect, it, vi } from "vitest";

const initiativeFindUniqueOrThrow = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { initiative: { findUniqueOrThrow: initiativeFindUniqueOrThrow } },
}));

const assertAiActionAllowed = vi.fn();
vi.mock("@/lib/ai/usage", () => ({
  assertAiActionAllowed,
  recordAiUsage: vi.fn(),
}));

const messagesCreate = vi.fn();
vi.mock("@/lib/ai/client", () => ({
  AI_MODEL: "claude-test",
  getAnthropicClient: () => ({ messages: { create: messagesCreate } }),
}));

const { runRecommendSprints } = await import("../recommendSprints");
const { InsufficientContextError } = await import("@/lib/ai/errors");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runRecommendSprints — never invents capacity/velocity", () => {
  it("throws InsufficientContextError and makes NO Anthropic call when team size is missing", async () => {
    initiativeFindUniqueOrThrow.mockResolvedValueOnce({
      projectId: "proj-1",
      methodology: "hybrid",
      intakeAnswerSet: { teamSize: null },
      prototype: { sprints: [{ id: "s1" }] },
    });

    await expect(
      runRecommendSprints({ initiativeId: "init-1", userId: "user-1", organizationId: "org-1" }),
    ).rejects.toThrow(InsufficientContextError);

    expect(assertAiActionAllowed).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("throws InsufficientContextError with no Anthropic call when no sprints exist yet", async () => {
    initiativeFindUniqueOrThrow.mockResolvedValueOnce({
      projectId: "proj-1",
      methodology: "hybrid",
      intakeAnswerSet: { teamSize: 6 },
      prototype: { sprints: [] },
    });

    await expect(
      runRecommendSprints({ initiativeId: "init-1", userId: "user-1", organizationId: "org-1" }),
    ).rejects.toThrow(InsufficientContextError);

    expect(assertAiActionAllowed).not.toHaveBeenCalled();
    expect(messagesCreate).not.toHaveBeenCalled();
  });
});
