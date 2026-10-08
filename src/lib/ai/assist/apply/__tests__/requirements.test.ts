import { describe, expect, it, vi } from "vitest";
import { emptyRequest } from "@/lib/requests/model";
import { AiAssistApplyBlockedError } from "@/lib/ai/errors";
import { applyRequirementReview } from "../applyRequirementReview";

function completeRequest() {
  return {
    ...emptyRequest(),
    title: "Saved map views",
    requestor: "Tiana",
    problem: "Users lose configured map filters.",
    requestedChange: "Let users save map views.",
    outcome: "A saved view restores in one click.",
    userAffected: "Returning map users",
    businessValueNarrative: "Reduces repeated setup time.",
    businessRules: "A view belongs to its creator.",
    inScope: "Save and restore filters.",
    outOfScope: "Sharing views.",
    assumptions: "Users are signed in.",
    dependencies: "Authentication.",
    risks: "Filters may become obsolete.",
    stakeholders: "Product Owner and map users.",
    supportingMaterials: "Customer notes.",
    definitionOfSuccess: "A view restores in one click.",
  };
}

function buildTx(data = completeRequest()) {
  const row = { id: "request-1", initiativeId: "init-1", revision: 1, data };
  const revisionCreate = vi.fn().mockResolvedValue({ id: "revision-2" });
  return {
    row,
    tx: {
      planningRequest: {
        findFirst: vi.fn().mockResolvedValue(row),
        update: vi.fn().mockImplementation(({ data: update }: { data: { data: unknown } }) => Promise.resolve({ ...row, data: update.data, revision: 2 })),
      },
      initiative: { findUnique: vi.fn().mockResolvedValue({ organizationId: "org-1" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ name: "Avery" }) },
      requestRevision: { create: revisionCreate },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    revisionCreate,
  };
}

const item = {
  id: "assist-1", organizationId: "org-1", initiativeId: "init-1", generatedByUserId: "generator-1",
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("applyRequirementReview", () => {
  it("applies one reviewed field and records the person who approved it", async () => {
    const { tx, revisionCreate } = buildTx();
    const result = await applyRequirementReview(tx, item, {
      requestId: "request-1", category: "missing_business_rule", fieldKey: "businessRules",
      title: "Clarify ownership", detail: "Ownership is incomplete.", proposedValue: "A saved view belongs to its creator.", question: "",
    }, false, "approver-1");
    expect(tx.planningRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "request-1", initiativeId: "init-1", revision: 1 },
      data: expect.objectContaining({ data: expect.objectContaining({ businessRules: "A saved view belongs to its creator." }) }),
    }));
    expect(revisionCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      changedByUserId: "approver-1", sourceAiAssistItemId: "assist-1", fromRevision: 1, toRevision: 2,
    }) });
    expect(result).toEqual({ appliedEntityType: "planning_request", appliedEntityId: "request-1" });
  });

  it("adds a focused question owned by the person applying the suggestion", async () => {
    const { tx } = buildTx();
    await applyRequirementReview(tx, item, {
      requestId: "request-1", category: "engineering_question", fieldKey: "questions",
      title: "Clarify stale filters", detail: "Engineering needs failure behavior.", proposedValue: "",
      question: "What happens when a saved filter is no longer available?",
    }, false, "approver-1");
    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: "approver-1" }, select: { name: true } });
    expect(tx.planningRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      data: expect.objectContaining({ readiness: "needs_clarification", questions: [expect.objectContaining({ owner: "Avery" })] }),
    }) }));
  });

  it("requires explicit confirmation before reopening an approved request", async () => {
    const approved = { ...completeRequest(), status: "approved" as const, readiness: "ready_for_feature" as const,
      priority: { ...completeRequest().priority, decision: "now" as const, reason: "Customer need" } };
    const { tx } = buildTx(approved);
    const finding = { requestId: "request-1", category: "risk", fieldKey: "risks", title: "Add migration risk",
      detail: "Existing saved filters may need migration.", proposedValue: "Existing saved filters may need migration.", question: "" };
    await expect(applyRequirementReview(tx, item, finding, false, "approver-1")).rejects.toBeInstanceOf(AiAssistApplyBlockedError);
    expect(tx.planningRequest.update).not.toHaveBeenCalled();
    await applyRequirementReview(tx, item, finding, true, "approver-1");
    expect(tx.planningRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      data: expect.objectContaining({ status: "clarifying" }),
    }) }));
  });
});
