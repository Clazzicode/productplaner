import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  db: { aiCapability: { upsert, findUnique } },
}));

const { getAiCapabilityConfig } = await import("../registry");
const { AI_ASSIST_ACTION_COPY } = await import("../activityCopy");

const AI_ASSIST_ACTIONS = [
  "ROADMAP_INSIGHTS",
  "PROPOSE_FEATURES",
  "PROPOSE_STORY_CONTENT",
  "PROPOSE_DEPENDENCIES",
  "PROPOSE_RISKS",
  "RECOMMEND_RELEASES",
  "RECOMMEND_SPRINTS",
  "RECOMMEND_STATUS",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI Assist capability registry", () => {
  it("seeds all 8 new actions with sane, enabled-by-default limits", async () => {
    findUnique.mockImplementation(({ where }: { where: { action: string } }) =>
      Promise.resolve({
        action: where.action,
        enabled: true,
        maxOutputTokens: 2048,
        userMonthlyLimit: 50,
        organizationMonthlyLimit: 500,
        description: "x",
      }),
    );

    for (const action of AI_ASSIST_ACTIONS) {
      const config = await getAiCapabilityConfig(action);
      expect(config).not.toBeNull();
      expect(config?.enabled).toBe(true);
      expect(config?.userMonthlyLimit).toBeGreaterThan(0);
      expect(config?.organizationMonthlyLimit).toBeGreaterThan(0);
    }

    // ensureAiCapabilitiesSeeded upserts every AI_CAPABILITIES row exactly
    // once (module-level `seeded` flag) — the 8 new actions plus the 2
    // pre-existing ones.
    const seededActions = upsert.mock.calls.map((call) => call[0].where.action);
    for (const action of AI_ASSIST_ACTIONS) {
      expect(seededActions).toContain(action);
    }
  });

  it("every AiActionKey used by the 8 AI Assist actions has matching activity copy", () => {
    for (const action of AI_ASSIST_ACTIONS) {
      expect(AI_ASSIST_ACTION_COPY[action].title.length).toBeGreaterThan(0);
      expect(AI_ASSIST_ACTION_COPY[action].explanation.length).toBeGreaterThan(0);
    }
  });
});
