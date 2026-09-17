import { beforeEach, describe, expect, it, vi } from "vitest";

const initiativeFindUnique = vi.fn();
const projectFindUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { initiative: { findUnique: initiativeFindUnique }, project: { findUnique: projectFindUnique } },
}));

const getAiCapabilityConfig = vi.fn();
vi.mock("@/lib/ai/registry", () => ({ getAiCapabilityConfig }));

const loadWorkspaceContextTier = vi.fn();
const loadProjectContextTier = vi.fn();
const loadInitiativeContextTier = vi.fn();
const loadApprovedFeaturesTier = vi.fn();
vi.mock("../loaders", () => ({
  loadWorkspaceContextTier,
  loadProjectContextTier,
  loadInitiativeContextTier,
  loadApprovedFeaturesTier,
}));

const { assembleAiContext } = await import("../assembleContext");
const { ContextBudgetExceededError, ContextScopeMismatchError } = await import("@/lib/ai/errors");

function fakeTier(layer: string, sourceId: string, content = `content for ${layer}:${sourceId}`) {
  return { layer, priority: 10, required: false, label: layer, content, sourceType: layer, sourceId, sourceVersion: "v1" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assembleAiContext — ownership chain validation (runs before anything else)", () => {
  it("throws ContextScopeMismatchError when the initiative doesn't belong to the given project", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-OTHER", organizationId: "org-1" });

    await expect(
      assembleAiContext({ action: "PROPOSE_FEATURES", organizationId: "org-1", projectId: "proj-A", initiativeId: "init-1", extraTiers: [] }),
    ).rejects.toThrow(ContextScopeMismatchError);

    // Nothing was loaded after the mismatch was found.
    expect(getAiCapabilityConfig).not.toHaveBeenCalled();
    expect(loadInitiativeContextTier).not.toHaveBeenCalled();
    expect(loadProjectContextTier).not.toHaveBeenCalled();
  });

  it("throws ContextScopeMismatchError when the initiative belongs to a different organization", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-OTHER" });

    await expect(
      assembleAiContext({ action: "PROPOSE_FEATURES", organizationId: "org-1", projectId: "proj-A", initiativeId: "init-1", extraTiers: [] }),
    ).rejects.toThrow(ContextScopeMismatchError);
    expect(getAiCapabilityConfig).not.toHaveBeenCalled();
  });

  it("throws ContextScopeMismatchError when a project (no initiative) doesn't belong to the given organization", async () => {
    projectFindUnique.mockResolvedValueOnce({ organizationId: "org-OTHER" });

    await expect(
      assembleAiContext({ action: "RECOMMEND_STATUS", organizationId: "org-1", projectId: "proj-A", initiativeId: null, extraTiers: [] }),
    ).rejects.toThrow(ContextScopeMismatchError);
    expect(getAiCapabilityConfig).not.toHaveBeenCalled();
  });

  it("proceeds when the ownership chain is consistent", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-1" });
    getAiCapabilityConfig.mockResolvedValueOnce({
      requiredContextLayers: [],
      optionalContextLayers: [],
      maxContextTokens: 10_000,
    });

    await expect(
      assembleAiContext({ action: "PROPOSE_FEATURES", organizationId: "org-1", projectId: "proj-A", initiativeId: "init-1", extraTiers: [] }),
    ).resolves.toBeTruthy();
  });
});

describe("assembleAiContext — project isolation", () => {
  it("only ever loads the given project's context, never another project's, even in the same organization", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-1" });
    getAiCapabilityConfig.mockResolvedValueOnce({
      requiredContextLayers: ["initiative"],
      optionalContextLayers: ["project"],
      maxContextTokens: 100_000,
    });
    loadInitiativeContextTier.mockResolvedValueOnce(fakeTier("initiative", "init-1"));
    loadApprovedFeaturesTier.mockResolvedValueOnce(fakeTier("initiative", "init-1-features"));
    loadProjectContextTier.mockResolvedValueOnce(fakeTier("project", "proj-A", "Project A's own approved facts"));

    const result = await assembleAiContext({
      action: "PROPOSE_FEATURES",
      organizationId: "org-1",
      projectId: "proj-A",
      initiativeId: "init-1",
      extraTiers: [],
    });

    expect(loadProjectContextTier).toHaveBeenCalledWith("proj-A");
    expect(loadProjectContextTier).not.toHaveBeenCalledWith("proj-B");
    expect(result.text).toContain("Project A's own approved facts");
    expect(result.text).not.toContain("Project B");
  });
});

describe("assembleAiContext — layer loading and budget", () => {
  it("loads every required and optional layer the operation declares", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-1" });
    getAiCapabilityConfig.mockResolvedValueOnce({
      requiredContextLayers: ["initiative"],
      optionalContextLayers: ["project", "workspace"],
      maxContextTokens: 100_000,
    });
    loadInitiativeContextTier.mockResolvedValueOnce(fakeTier("initiative", "init-1"));
    loadApprovedFeaturesTier.mockResolvedValueOnce(fakeTier("initiative", "init-1-features"));
    loadProjectContextTier.mockResolvedValueOnce(fakeTier("project", "proj-A"));
    loadWorkspaceContextTier.mockResolvedValueOnce(fakeTier("workspace", "org-1"));

    const result = await assembleAiContext({
      action: "PROPOSE_FEATURES",
      organizationId: "org-1",
      projectId: "proj-A",
      initiativeId: "init-1",
      extraTiers: [],
    });

    expect(loadInitiativeContextTier).toHaveBeenCalledWith("init-1");
    expect(loadProjectContextTier).toHaveBeenCalledWith("proj-A");
    expect(loadWorkspaceContextTier).toHaveBeenCalledWith("org-1");
    expect(result.tiers.map((t) => t.layer).sort()).toEqual(["initiative", "initiative", "project", "workspace"]);
  });

  it("drops optional layers under a tight budget but keeps required ones", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-1" });
    getAiCapabilityConfig.mockResolvedValueOnce({
      requiredContextLayers: ["initiative"],
      optionalContextLayers: ["project"],
      maxContextTokens: 20, // ~80 chars — enough for the required tier alone, not both
    });
    loadInitiativeContextTier.mockResolvedValueOnce(fakeTier("initiative", "init-1", "short"));
    loadApprovedFeaturesTier.mockResolvedValueOnce(fakeTier("initiative", "init-1-features", "short"));
    loadProjectContextTier.mockResolvedValueOnce(fakeTier("project", "proj-A", "x".repeat(400)));

    const result = await assembleAiContext({
      action: "PROPOSE_FEATURES",
      organizationId: "org-1",
      projectId: "proj-A",
      initiativeId: "init-1",
      extraTiers: [],
    });

    expect(result.tiers.every((t) => t.layer !== "project")).toBe(true);
    expect(result.audit.overBudget).toBe(false);
  });

  it("throws ContextBudgetExceededError (never proceeds) when required content alone overflows maxContextTokens", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-1" });
    getAiCapabilityConfig.mockResolvedValueOnce({
      requiredContextLayers: ["initiative"],
      optionalContextLayers: [],
      maxContextTokens: 1,
    });
    loadInitiativeContextTier.mockResolvedValueOnce(fakeTier("initiative", "init-1", "x".repeat(400)));
    loadApprovedFeaturesTier.mockResolvedValueOnce(fakeTier("initiative", "init-1-features", "x".repeat(400)));

    await expect(
      assembleAiContext({ action: "PROPOSE_FEATURES", organizationId: "org-1", projectId: "proj-A", initiativeId: "init-1", extraTiers: [] }),
    ).rejects.toThrow(ContextBudgetExceededError);
  });

  it("the audit on every returned/thrown result contains only {layer, type, id, version} references — never tier content", async () => {
    initiativeFindUnique.mockResolvedValueOnce({ projectId: "proj-A", organizationId: "org-1" });
    getAiCapabilityConfig.mockResolvedValueOnce({
      requiredContextLayers: ["initiative"],
      optionalContextLayers: [],
      maxContextTokens: 100_000,
    });
    loadInitiativeContextTier.mockResolvedValueOnce(fakeTier("initiative", "init-1", "secret-looking content"));
    loadApprovedFeaturesTier.mockResolvedValueOnce(fakeTier("initiative", "init-1-features", "more content"));

    const result = await assembleAiContext({
      action: "PROPOSE_FEATURES",
      organizationId: "org-1",
      projectId: "proj-A",
      initiativeId: "init-1",
      extraTiers: [],
    });

    const allowedKeys = new Set(["layer", "type", "id", "version"]);
    for (const record of result.audit.recordsLoaded) {
      for (const key of Object.keys(record)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
      expect(JSON.stringify(record)).not.toContain("secret-looking");
    }
  });
});
