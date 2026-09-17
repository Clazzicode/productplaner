import { describe, expect, it } from "vitest";
import { buildContextItems, normalizeValue, type CandidateItem, type CurrentValueSnapshot } from "../conflictDetection";

const candidate = (overrides: Partial<CandidateItem> & { fieldKey: string; value: string }): CandidateItem => ({
  kind: "explicit",
  scope: "project",
  sourceExcerpt: "excerpt",
  sourceChunkIndex: 0,
  sourceHeading: null,
  sourcePageNumber: null,
  sourceSlideNumber: null,
  ...overrides,
});

const emptySnapshot: CurrentValueSnapshot = { scalar: {}, existingFeatureNames: [], existingRiskDescriptions: [] };

describe("normalizeValue", () => {
  it("normalizes budget as a number regardless of formatting", () => {
    expect(normalizeValue("budget", "$150,000")).toBe(normalizeValue("budget", "150000"));
  });

  it("normalizes budget phrased as natural-language-adjacent text (found via live E2E testing)", () => {
    // The AI legitimately returns "150000 dollars" quoting a document like
    // "Project Budget: 150000 dollars" — this must normalize identically to
    // a plain "150000", or an identical value gets flagged as a false
    // conflict against the existing approved budget.
    expect(normalizeValue("budget", "150000 dollars")).toBe(normalizeValue("budget", "150000"));
    expect(normalizeValue("budget", "$150,000 USD")).toBe(normalizeValue("budget", "150000"));
  });

  it("normalizes dates to yyyy-mm-dd regardless of input format", () => {
    expect(normalizeValue("projected_go_live", "2027-03-01")).toBe(
      normalizeValue("projected_go_live", "March 1, 2027"),
    );
  });

  it("normalizes plain strings by trim+lowercase", () => {
    expect(normalizeValue("project_name", "  Acme Inc  ")).toBe(normalizeValue("project_name", "acme inc"));
  });
});

describe("buildContextItems", () => {
  it("creates a clean 'extracted' row when nothing exists yet", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "goal", value: "Ship faster" })],
      current: emptySnapshot,
      pending: [],
    });
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].status).toBe("extracted");
  });

  it("flags a conflict when a real existing approved value already differs", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "budget", value: "200000" })],
      current: { ...emptySnapshot, scalar: { budget: "150000" } },
      pending: [],
    });
    expect(toCreate[0].status).toBe("conflict");
    expect(toCreate[0].conflictsWithExistingValueText).toBe("150000");
  });

  it("skips (no row) when the proposed value exactly matches the existing approved value", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "budget", value: "$150,000" })],
      current: { ...emptySnapshot, scalar: { budget: "150000" } },
      pending: [],
    });
    expect(toCreate).toHaveLength(0);
  });

  it("links a cross-document conflict against another pending item for the same field", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "projected_go_live", value: "2027-04-01" })],
      current: emptySnapshot,
      pending: [{ id: "pending-1", fieldKey: "projected_go_live", value: "2027-03-01" }],
    });
    expect(toCreate[0].status).toBe("conflict");
    expect(toCreate[0].conflictsWithPendingItemId).toBe("pending-1");
  });

  it("skips (no row) when it exactly duplicates another pending item's value", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "projected_go_live", value: "March 1, 2027" })],
      current: emptySnapshot,
      pending: [{ id: "pending-1", fieldKey: "projected_go_live", value: "2027-03-01" }],
    });
    expect(toCreate).toHaveLength(0);
  });

  it("never conflicts two different features against each other — both created", () => {
    const { toCreate } = buildContextItems({
      candidates: [
        candidate({ fieldKey: "feature", value: "Bulk export", scope: "initiative" }),
        candidate({ fieldKey: "feature", value: "SSO login", scope: "initiative" }),
      ],
      current: emptySnapshot,
      pending: [],
    });
    expect(toCreate).toHaveLength(2);
    expect(toCreate.every((i) => i.status === "extracted")).toBe(true);
  });

  it("dedupes a feature that already exists live, without creating a conflict", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "feature", value: "Bulk export", scope: "initiative" })],
      current: { ...emptySnapshot, existingFeatureNames: ["Bulk Export"] },
      pending: [],
    });
    expect(toCreate).toHaveLength(0);
  });

  it("dedupes a risk that matches another pending risk from a different document", () => {
    const { toCreate } = buildContextItems({
      candidates: [candidate({ fieldKey: "risk", value: "Vendor lock-in", scope: "initiative" })],
      current: emptySnapshot,
      pending: [{ id: "pending-risk-1", fieldKey: "risk", value: "vendor lock-in" }],
    });
    expect(toCreate).toHaveLength(0);
  });
});
