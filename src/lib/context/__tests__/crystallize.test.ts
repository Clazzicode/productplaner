import { describe, expect, it, vi } from "vitest";
import { crystallize, type CrystallizeTarget } from "../crystallize";
import { PROJECT_CONTEXT_FIELDS, INITIATIVE_CONTEXT_FIELDS } from "../contextFields";

// Minimal stub covering only the Prisma.TransactionClient methods
// crystallize() actually calls — enough to prove every required
// PROJECT_CONTEXT_FIELDS/INITIATIVE_CONTEXT_FIELDS entry has a real,
// non-empty case (reaches into `tx`), and that dependency/assumption are
// the only intentional no-ops (never touch `tx` at all).
function buildStubTx() {
  return {
    project: {
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ teamCompositionJson: "{}", constraintsJson: "[]", stakeholdersJson: "[]" }),
    },
    initiative: { update: vi.fn().mockResolvedValue({}) },
    intakeAnswerSet: {
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "intake-1", capabilities: [] }),
    },
    capability: { create: vi.fn().mockResolvedValue({}) },
    risk: { create: vi.fn().mockResolvedValue({}) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const baseTarget: Omit<CrystallizeTarget, "fieldKey"> = {
  organizationId: "org-1",
  projectId: "project-1",
  initiativeId: "initiative-1",
};

const VALUE_FOR_FIELD: Record<string, string> = {
  project_name: "Acme",
  description: "A planning tool",
  goal: "Ship faster",
  budget: "150000",
  projected_go_live: "2027-03-01",
  team: "5 engineers",
  constraints: "Must integrate with Jira",
  stakeholders: "VP Product",
  initiative_name: "Q1 Initiative",
  initiative_goal: "Reduce cycle time",
  success_measure: "Cycle time under 5 days",
  initiative_target_date: "2027-01-15",
  feature: JSON.stringify({ name: "Bulk export" }),
  risk: JSON.stringify({ description: "Vendor lock-in" }),
};

function touchedAnyMethod(tx: ReturnType<typeof buildStubTx>): boolean {
  return Object.values(tx).some((model) =>
    Object.values(model as Record<string, ReturnType<typeof vi.fn>>).some((fn) => fn.mock.calls.length > 0),
  );
}

describe("crystallize — mapping table completeness", () => {
  for (const fieldKey of PROJECT_CONTEXT_FIELDS) {
    it(`"${fieldKey}" performs a real write`, async () => {
      const tx = buildStubTx();
      await crystallize(tx, { ...baseTarget, fieldKey }, VALUE_FOR_FIELD[fieldKey]);
      expect(touchedAnyMethod(tx)).toBe(true);
    });
  }

  for (const fieldKey of INITIATIVE_CONTEXT_FIELDS) {
    it(`"${fieldKey}" performs a real write`, async () => {
      const tx = buildStubTx();
      await crystallize(tx, { ...baseTarget, fieldKey }, VALUE_FOR_FIELD[fieldKey]);
      expect(touchedAnyMethod(tx)).toBe(true);
    });
  }

  it('"feature" creates a real Capability row', async () => {
    const tx = buildStubTx();
    await crystallize(tx, { ...baseTarget, fieldKey: "feature" }, VALUE_FOR_FIELD.feature);
    expect(tx.capability.create).toHaveBeenCalledTimes(1);
  });

  it('"risk" creates a real Risk row', async () => {
    const tx = buildStubTx();
    await crystallize(tx, { ...baseTarget, fieldKey: "risk" }, VALUE_FOR_FIELD.risk);
    expect(tx.risk.create).toHaveBeenCalledTimes(1);
  });

  it('"dependency" and "assumption" are intentional no-ops — never touch tx', async () => {
    for (const fieldKey of ["dependency", "assumption"]) {
      const tx = buildStubTx();
      await crystallize(tx, { ...baseTarget, fieldKey }, "some note");
      expect(touchedAnyMethod(tx)).toBe(false);
    }
  });

  it("throws for an initiative-scoped field when initiativeId is missing", async () => {
    const tx = buildStubTx();
    await expect(
      crystallize(tx, { ...baseTarget, initiativeId: null, fieldKey: "initiative_name" }, "Name"),
    ).rejects.toThrow();
  });
});
