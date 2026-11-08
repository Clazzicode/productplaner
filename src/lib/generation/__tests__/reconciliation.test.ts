import { describe, expect, it } from "vitest";
import { reconcile, type ExistingNode, type GeneratedNode } from "../reconciliation";

const node: GeneratedNode = { key: "feature:cap:epic:0:story:0", type: "story", parentKey: "feature:cap:epic:0", capabilityId: "cap", order: 0,
  title: "Generated title", body: "Updated generated body", points: 3, contentJson: "{}" };
const existing = (overrides: Partial<ExistingNode> = {}): ExistingNode => ({ id: "story", type: "story", parentId: "epic", sourceCapabilityId: "cap",
  generationKey: node.key, title: "Generated title", body: "Original generated body", points: 3, contentJson: "{}", archivedAt: null, backlogRevision: 2,
  sourceType: "generated", generatedBaseline: { title: "Generated title", body: "Original generated body", points: 3, contentJson: "{}" }, ...overrides });

describe("reviewed reconciliation preserves identity and human work", () => {
  it("proposes only generated fields that still equal their recorded baseline", () => {
    const result = reconcile([node], [existing({ title: "Human title" })])[0];
    expect(result).toMatchObject({ targetId: "story", kind: "change", changes: { body: node.body }, preservedFields: ["title"] });
    expect(result.before?.title).toBe("Human title");
  });
  it.each([{ sourceType: "manual" }, { sprintId: "committed-sprint" }, { approvedAt: new Date() }, { committed: true }])("preserves authored or committed work: %j", fields => {
    expect(reconcile([node], [existing(fields)])[0]).toMatchObject({ kind: "preserve", changes: {}, preservedFields: ["body"] });
  });
  it("does not infer a legacy story identity from an identical title", () => {
    expect(reconcile([node], [existing({ generationKey: null, generatedBaseline: null })])[0]).toMatchObject({ kind: "mapping_required", targetId: null, candidateIds: ["story"] });
  });
  it("does not duplicate ambiguous legacy features", () => {
    const feature = { ...node, type: "feature", key: "feature:cap" };
    const rows = [existing({ id: "a", type: "feature", generationKey: null }), existing({ id: "b", type: "feature", generationKey: null })];
    expect(reconcile([feature], rows)[0]).toMatchObject({ kind: "mapping_required", candidateIds: ["a", "b"] });
  });
  it("retains records whose generated source disappeared instead of deleting them", () => {
    expect(reconcile([], [existing()])).toMatchObject([{ kind: "orphan", targetId: "story", proposed: null, changes: {} }]);
  });
  it("never invents a baseline for legacy or manually edited content", () => {
    expect(reconcile([node], [existing({ generatedBaseline: null })])[0]).toMatchObject({ kind: "preserve", changes: {}, preservedFields: ["body"] });
  });
  it("does not resurrect an archived record or create a parallel identity", () => {
    expect(reconcile([node], [existing({ archivedAt: new Date() })])[0]).toMatchObject({ kind: "preserve", targetId: "story", changes: {}, preservedFields: expect.arrayContaining(["archivedAt"]) });
  });
  it("preserves phase metadata when containment is kept, avoiding contradictory reviewed changes", () => {
    const feature = { ...node, key: "feature:cap", type: "feature", contentJson: '{"phaseNumber":2}' };
    const row = existing({ type: "feature", generationKey: "feature:cap", contentJson: '{"phaseNumber":1}', generatedBaseline: { ...node, contentJson: '{"phaseNumber":1}' } });
    const result = reconcile([feature], [row])[0];
    expect(result.changes).not.toHaveProperty("contentJson");
    expect(result.preservedFields).toEqual(expect.arrayContaining(["parentId", "contentJson", "order"]));
  });
  it("proposes new records only where no compatible existing identity requires review", () => {
    expect(reconcile([node], [existing({ id: "unrelated", sourceCapabilityId: "other", generationKey: "other" })])[0]).toMatchObject({ kind: "add", targetId: null });
  });
});
