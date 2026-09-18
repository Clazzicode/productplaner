import { describe, expect, it } from "vitest";
import { buildFingerprintPayload, type RoadmapInputsFingerprintInput } from "../fingerprint";

const baseCap = {
  id: "cap-1",
  isMvp: true,
  effortSize: "m",
  businessValue: "high",
  riskLevel: "medium",
  manualPhaseOverride: null as number | null,
};

const baseInput: RoadmapInputsFingerprintInput = {
  methodology: "hybrid",
  targetLaunchDateOverride: null,
  budgetOverride: null,
  averageHourlyRateOverride: null,
  project: { budget: 50000, averageHourlyRate: 85, targetLaunchDate: new Date("2027-01-01") },
  capabilities: [baseCap, { ...baseCap, id: "cap-2", businessValue: "medium" }],
  dependencyEdges: [{ fromCapabilityId: "cap-2", toCapabilityId: "cap-1" }],
};

describe("buildFingerprintPayload", () => {
  it("is stable for the same logical input", () => {
    expect(buildFingerprintPayload(baseInput)).toBe(buildFingerprintPayload(baseInput));
  });

  it("is independent of capability/edge array order", () => {
    const reordered: RoadmapInputsFingerprintInput = {
      ...baseInput,
      capabilities: [...baseInput.capabilities].reverse(),
      dependencyEdges: [...baseInput.dependencyEdges],
    };
    expect(buildFingerprintPayload(reordered)).toBe(buildFingerprintPayload(baseInput));
  });

  it("changes when a capability is added or removed", () => {
    const added: RoadmapInputsFingerprintInput = {
      ...baseInput,
      capabilities: [...baseInput.capabilities, { ...baseCap, id: "cap-3" }],
    };
    expect(buildFingerprintPayload(added)).not.toBe(buildFingerprintPayload(baseInput));
  });

  it("changes when a capability's business value (priority) changes", () => {
    const changed: RoadmapInputsFingerprintInput = {
      ...baseInput,
      capabilities: [{ ...baseCap, businessValue: "critical" }, baseInput.capabilities[1]],
    };
    expect(buildFingerprintPayload(changed)).not.toBe(buildFingerprintPayload(baseInput));
  });

  it("changes when a dependency edge is added", () => {
    const changed: RoadmapInputsFingerprintInput = {
      ...baseInput,
      dependencyEdges: [...baseInput.dependencyEdges, { fromCapabilityId: "cap-1", toCapabilityId: "cap-2" }],
    };
    expect(buildFingerprintPayload(changed)).not.toBe(buildFingerprintPayload(baseInput));
  });

  it("changes when the projected go-live date changes (override or inherited)", () => {
    const overridden: RoadmapInputsFingerprintInput = {
      ...baseInput,
      targetLaunchDateOverride: new Date("2027-06-01"),
    };
    expect(buildFingerprintPayload(overridden)).not.toBe(buildFingerprintPayload(baseInput));

    const projectChanged: RoadmapInputsFingerprintInput = {
      ...baseInput,
      project: { ...baseInput.project, targetLaunchDate: new Date("2027-06-01") },
    };
    expect(buildFingerprintPayload(projectChanged)).not.toBe(buildFingerprintPayload(baseInput));
  });

  it("changes when approved business info (budget/rate) changes", () => {
    const changed: RoadmapInputsFingerprintInput = {
      ...baseInput,
      project: { ...baseInput.project, budget: 75000 },
    };
    expect(buildFingerprintPayload(changed)).not.toBe(buildFingerprintPayload(baseInput));
  });

  it("changes when initiative scope (methodology) changes", () => {
    const changed: RoadmapInputsFingerprintInput = { ...baseInput, methodology: "agile_scrum" };
    expect(buildFingerprintPayload(changed)).not.toBe(buildFingerprintPayload(baseInput));
  });

  it("an override takes precedence over the inherited project value", () => {
    const overrideOnly: RoadmapInputsFingerprintInput = {
      ...baseInput,
      budgetOverride: 50000,
      project: { ...baseInput.project, budget: 999 },
    };
    const inheritedEquivalent: RoadmapInputsFingerprintInput = {
      ...baseInput,
      budgetOverride: null,
      project: { ...baseInput.project, budget: 50000 },
    };
    expect(buildFingerprintPayload(overrideOnly)).toBe(buildFingerprintPayload(inheritedEquivalent));
  });
});
