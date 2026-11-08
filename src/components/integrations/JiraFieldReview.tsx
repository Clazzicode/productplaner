import { JIRA_FIELD_OWNERSHIP, type JiraFieldReview as Review } from "@/lib/jira/fieldOwnership";

const display = (value: unknown) => value === null || value === undefined ? "Unknown / not set" : typeof value === "string" ? value || "(empty)" : JSON.stringify(value, null, 2);
const changeLabel = (value: boolean | null) => value === null ? "Unknown baseline" : value ? "Changed" : "Unchanged";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function JiraOwnershipContract() {
  return <details className="rounded-xl border border-neutral-200 bg-white p-5"><summary className="cursor-pointer font-semibold">Who owns each field?</summary><p className="mt-2 text-sm">Jira is read-only. Refresh creates a review; only selected imports change Clarivia. Local planning decisions stay in Clarivia.</p><dl className="mt-3 space-y-3">{JIRA_FIELD_OWNERSHIP.map((row) => <div key={row.field}><dt className="text-sm font-semibold">{row.field} · {row.owner}</dt><dd className="text-sm text-neutral-600">{row.rule}</dd></div>)}</dl></details>;
}

export default function JiraFieldReview({ value, action, targetId, payload }: { value: unknown; action: string; targetId: string | null; payload?: unknown }) {
  const data = object(value);
  if (data.schemaVersion !== 1) return <p className="mt-2 text-xs text-amber-800">Legacy review: refresh to inspect exact changes before approval.</p>;
  const review = data as unknown as Review;
  const eligible = ["create", "update"].includes(action);
  return <details className="mt-2 max-w-2xl"><summary className="cursor-pointer text-xs font-medium text-indigo-700">Review exact {payload ? "future export" : "import"} changes</summary><p className="my-2 text-xs">Canonical target: {targetId ?? "New record only if selected"}. {eligible ? "Only applies if selected and approved." : `No changes can be selected while this item is ${action}.`}</p>
    {Array.isArray(review.fields) ? <><p className="text-xs">Baseline: {review.baselineAt ? new Date(review.baselineAt).toLocaleString() : "Unknown / first import"}. Local: {changeLabel(review.localChanged)}. Jira: {changeLabel(review.remoteChanged)}.</p><div className="mt-2 space-y-3">{review.fields.map((field) => <section key={field.field} className="rounded border p-2 text-xs"><h4 className="font-semibold">{field.field} · {field.owner}</h4><p>Local: {changeLabel(field.localChanged)} · Jira: {changeLabel(field.remoteChanged)}</p><dl className="mt-1 grid gap-2 sm:grid-cols-2"><div><dt className="font-medium">Before</dt><dd className="whitespace-pre-wrap break-words">{display(field.before)}</dd></div><div><dt className="font-medium">{field.willApply && eligible ? "Proposed after approval" : "Preserved / no write"}</dt><dd className="whitespace-pre-wrap break-words">{display(field.proposed)}</dd></div></dl>{!field.willApply && <p className="mt-1">Jira evidence: {display(field.sourceValue)}</p>}{field.omission && <p className="mt-1">{field.omission}</p>}</section>)}</div><p className="mt-2 text-xs">Preserved: {review.preservedFields.join(", ")}.</p></> : <><p className="text-xs">Jira writes remain disabled until separately authorized. Frozen target and omissions:</p><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{display(data)}</pre><p className="mt-2 text-xs font-medium">Exact request payload</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{display(payload)}</pre></>}
  </details>;
}
