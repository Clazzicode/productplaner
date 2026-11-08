export const JIRA_FIELD_OWNERSHIP = [
  { field: "Site, project and external issue identity", owner: "Jira", rule: "Source identifiers attach to the canonical Clarivia record; refresh never creates a parallel local identity." },
  { field: "Summary and description", owner: "Reviewed imported copy", rule: "Jira supplies proposed source content. Local edits require reviewed conflict resolution before replacement." },
  { field: "Story estimate", owner: "Reviewed imported copy", rule: "A proposed import shows the exact normalized estimate. Planning assignments and acceptance remain separate." },
  { field: "Jira status, priority, labels and updated time", owner: "Jira source evidence", rule: "Execution evidence does not approve a story, commit a sprint or finalize a release." },
  { field: "Lane, value, risk, owner and priority decisions", owner: "Clarivia", rule: "Refresh preserves these local planning decisions." },
  { field: "Acceptance criteria, PO decisions, dependencies and delivery links", owner: "Clarivia", rule: "Imports do not replace criteria, approvals, sprint/release assignments or external links." },
  { field: "Synchronization fingerprints, field hashes and timestamps", owner: "Clarivia synchronization service", rule: "Used for comparisons and stale-review checks; never substitutes for user approval." },
] as const;

export type JiraFieldComparison = { field: string; owner: string; before: unknown; proposed: unknown; sourceValue: unknown;
  localChanged: boolean | null; remoteChanged: boolean | null; willApply: boolean; omission?: string };
export type JiraFieldReview = { schemaVersion: 1; targetFingerprint: string | null; baselineAt: string | null;
  localChanged: boolean | null; remoteChanged: boolean | null; fields: JiraFieldComparison[]; preservedFields: string[] };
