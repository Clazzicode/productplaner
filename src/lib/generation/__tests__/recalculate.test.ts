import { describe, expect, it } from "vitest";
import { capabilitySetDrifted, determineRespectLocksBranch } from "../engine";

const locks = (states: Partial<Record<string, string>>) =>
  ["roadmap", "feature_hierarchy", "epics", "stories", "acceptance_criteria"].map((t) => ({
    layerType: t,
    state: states[t] ?? "unlocked",
  }));

describe("determineRespectLocksBranch", () => {
  it("falls back to full regenerate when nothing is locked", () => {
    expect(determineRespectLocksBranch(locks({}))).toEqual({ kind: "full_fallback_no_locks" });
  });

  it("only repacks sprints when every waterfall layer is locked", () => {
    expect(
      determineRespectLocksBranch(
        locks({
          roadmap: "locked",
          feature_hierarchy: "locked",
          epics: "locked",
          stories: "locked",
          acceptance_criteria: "locked",
        }),
      ),
    ).toEqual({ kind: "repack_only" });
  });

  it("anchors regeneration at the last locked layer in a contiguous locked prefix", () => {
    expect(
      determineRespectLocksBranch(locks({ roadmap: "locked" })),
    ).toEqual({ kind: "regen_below", anchorLayer: "roadmap" });

    expect(
      determineRespectLocksBranch(
        locks({ roadmap: "locked", feature_hierarchy: "locked", epics: "locked" }),
      ),
    ).toEqual({ kind: "regen_below", anchorLayer: "epics" });
  });
});

describe("capabilitySetDrifted", () => {
  it("is false when the capability set is unchanged", () => {
    expect(capabilitySetDrifted(["a", "b"], ["a", "b"])).toBe(false);
    expect(capabilitySetDrifted(["a", "b"], ["b", "a"])).toBe(false);
  });

  it("is true when a capability was added", () => {
    expect(capabilitySetDrifted(["a"], ["a", "b"])).toBe(true);
  });

  it("is true when a capability was removed", () => {
    expect(capabilitySetDrifted(["a", "b"], ["a"])).toBe(true);
  });

  it("is false for two empty sets", () => {
    expect(capabilitySetDrifted([], [])).toBe(false);
  });
});
