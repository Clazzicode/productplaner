import { createHash } from "node:crypto";
import type { GeneratedPlan } from "./types";

export type GeneratedFields = { title: string; body: string; contentJson: string; points: number | null };
export type GeneratedNode = GeneratedFields & { key: string; parentKey: string | null; type: string; capabilityId: string | null; order: number };
export type ExistingNode = GeneratedFields & {
  id: string; type: string; parentId: string | null; sourceCapabilityId: string | null; generationKey: string | null;
  generatedBaseline: unknown; sourceType: string; archivedAt: Date | null; backlogRevision: number;
  sprintId?: string | null; approvedAt?: Date | null; committed?: boolean;
};
export type ReconciliationItem = {
  key: string; kind: "add" | "change" | "preserve" | "mapping_required" | "orphan";
  targetId: string | null; candidateIds: string[]; proposed: GeneratedNode | null;
  changes: Partial<GeneratedFields>; preservedFields: string[]; before: GeneratedFields | null;
};
export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fields = ["title", "body", "contentJson", "points"] as const;
const content = (node: GeneratedFields): GeneratedFields => Object.fromEntries(fields.map(field => [field, node[field]])) as GeneratedFields;

/** Structural keys are scoped to the canonical feature and decomposition slot.
 * Legacy story/criterion titles are never used to infer identity. */
export function generatedNodes(plan: GeneratedPlan): GeneratedNode[] {
  const nodes: GeneratedNode[] = [];
  const push = (key: string, parentKey: string | null, type: string, capabilityId: string | null, order: number, title: string, body: string, data: unknown = null, points: number | null = null) =>
    nodes.push({ key, parentKey, type, capabilityId, order, title, body, contentJson: data === null ? "{}" : JSON.stringify(data), points });
  push("roadmap", null, "roadmap", null, 0, plan.roadmapTitle, plan.roadmapBody);
  for (const [pi, phase] of plan.phases.entries()) {
    const phaseKey = `phase:${phase.phaseNumber}`;
    push(phaseKey, "roadmap", "roadmap_phase", null, pi, phase.name, `${phase.features.length} ${phase.features.length === 1 ? "feature" : "features"}, sequenced by dependencies and business value.`, {
      phaseNumber: phase.phaseNumber, startDate: phase.startDate.toISOString(), endDate: phase.endDate.toISOString(), capabilityIds: phase.capabilityIds,
    });
    for (const [fi, feature] of phase.features.entries()) {
      const featureKey = `feature:${feature.capabilityId}`;
      push(featureKey, phaseKey, "feature", feature.capabilityId, fi, feature.title, feature.body, { phaseNumber: phase.phaseNumber });
      for (const [ei, epic] of feature.epics.entries()) {
        const epicKey = `${featureKey}:epic:${ei}`;
        push(epicKey, featureKey, "epic", feature.capabilityId, ei, epic.title, epic.body, { epicIndex: ei, epicCount: feature.epics.length });
        for (const [si, story] of epic.stories.entries()) {
          const storyKey = `${epicKey}:story:${si}`;
          push(storyKey, epicKey, "story", feature.capabilityId, si, story.title, story.body, { persona: story.persona, want: story.want, benefit: story.benefit }, story.points);
          for (const [ai, ac] of story.acs.entries()) push(`${storyKey}:criterion:${ac.kind}:${ai}`, storyKey, "acceptance_criterion", feature.capabilityId, ai, ac.title, ac.body, { kind: ac.kind });
        }
      }
    }
  }
  return nodes;
}

function phaseNumber(row: ExistingNode) {
  try { return JSON.parse(row.contentJson ?? "{}").phaseNumber; } catch { return null; }
}

export function reconcile(nodes: GeneratedNode[], existing: ExistingNode[]): ReconciliationItem[] {
  const used = new Set<string>();
  const items: ReconciliationItem[] = [];
  for (const proposed of nodes) {
    const archived = existing.find(row => row.generationKey === proposed.key && row.archivedAt);
    if (archived) {
      used.add(archived.id);
      items.push({ key: proposed.key, kind: "preserve", targetId: archived.id, candidateIds: [], proposed, changes: {}, preservedFields: [...fields, "archivedAt"], before: content(archived) });
      continue;
    }
    const keyed = existing.filter(row => row.generationKey === proposed.key && !row.archivedAt);
    const legacy = existing.filter(row => !row.generationKey && !row.archivedAt && row.type === proposed.type && row.sourceCapabilityId === proposed.capabilityId && (
      proposed.type === "feature" || proposed.type === "roadmap" ||
      (proposed.type === "roadmap_phase" && phaseNumber(row) === Number(proposed.key.split(":")[1]))));
    const matches = keyed.length ? keyed : legacy;
    const match = matches.length === 1 && !used.has(matches[0].id) ? matches[0] : null;
    if (!match) {
      const candidates = existing.filter(row => !row.archivedAt && row.type === proposed.type && row.sourceCapabilityId === proposed.capabilityId && !used.has(row.id));
      items.push({ key: proposed.key, kind: candidates.length ? "mapping_required" : "add", targetId: null, candidateIds: candidates.map(row => row.id), proposed, changes: {}, preservedFields: [], before: null });
      continue;
    }
    used.add(match.id);
    const baseline = match.generatedBaseline as Partial<GeneratedFields> | null;
    const changes: Partial<GeneratedFields> = {};
    const preservedFields: string[] = [];
    for (const field of fields) {
      if (match[field] === proposed[field]) continue;
      // Regeneration preserves containment. Do not change phase metadata while
      // keeping the same parent; explicit roadmap movement remains a human action.
      if (field === "contentJson" && proposed.type === "feature" && phaseNumber(match) !== phaseNumber({ ...match, contentJson: proposed.contentJson })) {
        preservedFields.push("contentJson", "parentId", "order");
        continue;
      }
      if (!match.sprintId && !match.approvedAt && !match.committed && match.sourceType === "generated" && baseline && Object.hasOwn(baseline, field) && match[field] === baseline[field]) {
        Object.assign(changes, { [field]: proposed[field] });
      } else preservedFields.push(field);
    }
    items.push({ key: proposed.key, kind: Object.keys(changes).length ? "change" : "preserve", targetId: match.id, candidateIds: [], proposed, changes, preservedFields, before: content(match) });
  }
  for (const row of existing) if (!used.has(row.id) && !row.archivedAt) items.push({
    key: `retained:${row.id}`, kind: row.generationKey && !nodes.some(node => node.key === row.generationKey) ? "orphan" : "preserve",
    targetId: row.id, candidateIds: [], proposed: null, changes: {}, preservedFields: [...fields], before: content(row),
  });
  return items;
}
