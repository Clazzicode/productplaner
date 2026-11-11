"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Item = {
  targetType: string; targetId: string; externalIssueId: string; externalKey: string; jiraUrl: string | null;
  deliveryStatusName: string | null; deliveryMappedStatus: string | null; deliveryPriorityName: string | null;
  deliveryLabels: unknown; jiraUpdatedAt: string | null; observedAt: string | null; checkedAt: string | null; revision: number; connectionStatus: string;
  poValidationStatus: string | null;
};
type Connection = { id: string; projectKey: string | null; status: string; lastSyncAt: string | null; lastSyncStatus: string | null };
type Payload = { items: Item[]; connections: Connection[] };

export default function JiraDeliveryLive({ initiativeId, target }: { initiativeId: string; target?: { type: string; id: string } }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const prior = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/initiatives/${encodeURIComponent(initiativeId)}/jira-delivery`, { cache: "no-store" });
        if (!response.ok) throw new Error("Jira delivery read failed");
        const next = await response.json() as Payload;
        if (disposed) return;
        const signature = JSON.stringify(next.items.map(item => [item.externalIssueId, item.revision]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
        if (prior.current !== null && prior.current !== signature) router.refresh();
        prior.current = signature;
        setData(next);
        setError(false);
      } catch {
        if (!disposed) setError(true);
      }
    }
    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    document.addEventListener("visibilitychange", load);
    return () => { disposed = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", load); };
  }, [initiativeId, router]);

  const items = data?.items.filter(item => !target || item.targetType === target.type && item.targetId === target.id) ?? [];
  const connected = data?.connections.some(connection => connection.status === "connected") ?? false;
  if (!data && !error) return <p className="text-xs text-neutral-500">Loading Jira delivery status…</p>;
  if (!data) return <p role="status" className="text-xs text-amber-800">Jira delivery status could not be refreshed.</p>;
  const counts = { inProgress: items.filter(item => item.deliveryMappedStatus === "in_progress").length, done: items.filter(item => item.deliveryMappedStatus === "done").length, blocked: items.filter(item => item.deliveryMappedStatus === "blocked").length };
  const awaitingPoValidation = items.filter(item => item.targetType === "story" && item.deliveryMappedStatus === "done" && item.poValidationStatus !== "accepted").length;
  const localHref = (item: Item) => `/initiatives/${encodeURIComponent(initiativeId)}/workspace/${item.targetType === "feature" ? "features" : item.targetType === "bug" ? "bugs" : "stories"}/${encodeURIComponent(item.targetId)}`;
  const stale = items.some(item => item.connectionStatus !== "connected" || !item.checkedAt || Date.now() - new Date(item.checkedAt).getTime() > 15 * 60_000)
    || data.connections.some(connection => connection.lastSyncStatus === "read_failed" || connection.status === "reauthorization_required");
  return <section aria-label="Jira delivery status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong>Jira delivery</strong><span className="text-xs text-slate-600">{connected ? "Connected" : "Connection needs attention"}{error ? " · Refresh failed" : ""}</span></div>
    {target ? items.length ? <div className="mt-2 space-y-2">{items.map(item => <div key={item.externalIssueId} className="flex flex-wrap items-center gap-2">
      {item.jiraUrl ? <a href={item.jiraUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline">{item.externalKey}</a> : <span className="font-medium">{item.externalKey}</span>}
      <span>{item.deliveryStatusName ?? "Status pending"}</span>
      {item.deliveryPriorityName && <span className="text-xs text-slate-600">Jira priority: {item.deliveryPriorityName}</span>}
      {Array.isArray(item.deliveryLabels) && item.deliveryLabels.length > 0 && <span className="text-xs text-slate-600">Jira labels: {item.deliveryLabels.join(", ")}</span>}
      {item.targetType === "story" && <span className="text-xs text-slate-600">PO validation: {item.poValidationStatus?.replaceAll("_", " ") ?? "not started"}</span>}
      <span className="text-xs text-slate-600">Jira updated: {item.jiraUpdatedAt ? new Date(item.jiraUpdatedAt).toLocaleString() : "unknown"} · Seen: {item.observedAt ? new Date(item.observedAt).toLocaleString() : "not yet"} · Checked: {item.checkedAt ? new Date(item.checkedAt).toLocaleString() : "not yet"}</span>
    </div>)}</div> : <p className="mt-2 text-xs text-slate-600">This item has no linked Jira issue.</p>
      : <><p className="mt-2 text-xs text-slate-700">{items.length} linked items · {counts.inProgress} in progress · {counts.done} done in Jira · {counts.blocked} blocked · {awaitingPoValidation} Jira Done stories awaiting PO validation. Jira Done does not mean product owner acceptance.</p>{items.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-blue-800">View linked Jira work</summary><div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{items.map(item => <div key={item.externalIssueId} className="rounded border border-sky-100 bg-white p-2 text-xs"><span className="font-medium capitalize">{item.targetType}</span> · {item.jiraUrl ? <a href={item.jiraUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">{item.externalKey}</a> : item.externalKey} · {item.deliveryStatusName ?? "Status pending"}{item.targetType === "story" ? ` · PO validation: ${item.poValidationStatus?.replaceAll("_", " ") ?? "not started"}` : ""}{item.deliveryPriorityName ? ` · Priority: ${item.deliveryPriorityName}` : ""}{Array.isArray(item.deliveryLabels) && item.deliveryLabels.length ? ` · Labels: ${item.deliveryLabels.join(", ")}` : ""}<span className="block text-slate-600">Jira updated: {item.jiraUpdatedAt ? new Date(item.jiraUpdatedAt).toLocaleString() : "unknown"} · Checked: {item.checkedAt ? new Date(item.checkedAt).toLocaleString() : "not yet"}</span><Link href={localHref(item)} className="mt-1 inline-block text-indigo-700 underline">Open in Clarivia</Link></div>)}</div></details>}</>}
    {stale && <p className="mt-2 text-xs text-amber-800">Jira data may be stale. Check the Jira integration connection or process queued work.</p>}
  </section>;
}
