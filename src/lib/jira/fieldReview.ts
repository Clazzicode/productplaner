import { jiraHash } from "./crypto";
import type { JiraIssueSnapshot } from "./client";
import type { JiraFieldReview } from "./fieldOwnership";

export type FieldHashes = Record<string, { sourceHash: string; localHash: string }>;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const valueHash = (value: unknown) => jiraHash(JSON.stringify(value ?? null));
export const importedPoints = (value: number | null) => value ? Math.min(21, Math.max(1, Math.round(value))) : null;

export function localImportFields(targetType: string, value: unknown): Record<string, unknown> {
  const row = object(value);
  if (targetType === "feature") return { summary: row.name ?? null, description: row.description ?? null, planningStatus: row.backlogStatus ?? null };
  if (targetType === "story") return { summary: row.title ?? null, description: row.body ?? null, points: row.points ?? null, planningStatus: row.readinessStatus ?? null };
  const request = object(row.request);
  const bug = object(request.bug);
  return { summary: request.title ?? null, description: request.problem ?? null, observedBehavior: bug.observedBehavior ?? null, planningStatus: row.status ?? null };
}

function sourceFields(issue: JiraIssueSnapshot, targetType: string) {
  const description = typeof issue.description === "string" ? issue.description : "";
  return { summary: issue.summary, description, ...(targetType === "story" ? { points: issue.storyPoints } : {}),
    ...(targetType === "bug" ? { observedBehavior: description || "See the Jira issue." } : {}), planningStatus: issue.status };
}

export function fieldBaselines(issue: JiraIssueSnapshot, targetType: string, local: unknown): FieldHashes {
  const source = sourceFields(issue, targetType);
  const fields = localImportFields(targetType, local);
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, { sourceHash: valueHash(value), localHash: valueHash(fields[key]) }]));
}

export function buildImportFieldReview(input: { issue: JiraIssueSnapshot; targetType: string; local: unknown; targetFingerprint: string | null;
  baselineHashes: unknown; baselineAt: string | null; localChanged: boolean | null; remoteChanged: boolean | null }): JiraFieldReview {
  const local = localImportFields(input.targetType, input.local);
  const source = sourceFields(input.issue, input.targetType);
  const baselines = object(input.baselineHashes);
  const fields = Object.entries(source).map(([field, sourceValue]) => {
    const baseline = object(baselines[field]);
    let proposed = sourceValue;
    if (field === "points") proposed = importedPoints(input.issue.storyPoints);
    if (field === "description" && !sourceValue && input.targetType === "story") proposed = `Imported from Jira ${input.issue.key}.`;
    if (field === "description" && !sourceValue && input.targetType === "bug") proposed = `Bug reported in Jira as ${input.issue.key}.`;
    const preserved = field === "planningStatus";
    return { field, owner: preserved ? "Clarivia" : "Reviewed imported copy", before: input.local ? local[field] : null,
      proposed: preserved ? local[field] ?? (input.targetType === "feature" ? "planned" : input.targetType === "story" ? "needs_refinement" : "reported") : proposed, sourceValue,
      localChanged: typeof baseline.localHash === "string" ? valueHash(local[field]) !== baseline.localHash : null,
      remoteChanged: typeof baseline.sourceHash === "string" ? valueHash(sourceValue) !== baseline.sourceHash : null,
      willApply: !preserved && input.targetType !== "skip",
      ...(preserved ? { omission: "Jira execution status is evidence; local planning status and acceptance are preserved." } : {}) };
  });
  return { schemaVersion: 1, targetFingerprint: input.targetFingerprint, baselineAt: input.baselineAt,
    localChanged: input.localChanged, remoteChanged: input.remoteChanged, fields,
    preservedFields: ["canonical identity", "priority/lane/value/risk/owner decisions", "acceptance criteria and PO decisions", "dependencies", "sprint/release commitments", "external links"] };
}
