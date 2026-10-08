"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { BacklogItemRecord } from "@/lib/backlog/unified";
import {
  calculatePriorityScore,
  priorityFibonacci,
  type PriorityDecisionRecord,
  type PriorityFactors,
} from "@/lib/prioritization/model";

type Recommendation = {
  id: string;
  status: string;
  synopsis: string;
  informationUsed: string;
  proposedContentJson: string;
};

const factorLabels: { key: keyof Pick<PriorityFactors, "businessValue" | "urgency" | "userImpact" | "dependencyImpact" | "risk">; label: string }[] = [
  { key: "businessValue", label: "Business value" },
  { key: "urgency", label: "Urgency" },
  { key: "userImpact", label: "User impact" },
  { key: "dependencyImpact", label: "Dependency impact" },
  { key: "risk", label: "Delivery risk" },
];

function effortFromPoints(points: number) {
  if (points <= 1) return 1;
  if (points <= 3) return 2;
  if (points <= 5) return 3;
  if (points <= 8) return 4;
  return 5;
}

export default function PriorityEditor({ initiativeId, item, onSaved, onClose }: {
  initiativeId: string;
  item: BacklogItemRecord;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [factors, setFactors] = useState<PriorityFactors>(item.priorityFactors);
  const [moscow, setMoscow] = useState(item.priorityLabel === "unscored" ? "should" : item.priorityLabel);
  const [roadmapLane, setRoadmapLane] = useState(item.roadmapLane);
  const [reason, setReason] = useState(item.priorityReason);
  const [source, setSource] = useState<"manual" | "ai">("manual");
  const [recommendationItemId, setRecommendationItemId] = useState<string | null>(null);
  const [history, setHistory] = useState<PriorityDecisionRecord[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const score = useMemo(() => calculatePriorityScore(factors), [factors]);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ entityType: item.recordType, entityId: item.id });
    const [historyResponse, recommendationResponse] = await Promise.all([
      fetch(`/api/initiatives/${initiativeId}/backlog/priority?${query}`),
      fetch(`/api/initiatives/${initiativeId}/backlog/priority/recommend?${query}`),
    ]);
    if (historyResponse.ok) {
      const data = await historyResponse.json() as { history?: PriorityDecisionRecord[] };
      setHistory(data.history ?? []);
    }
    if (recommendationResponse.ok) {
      const data = await recommendationResponse.json() as { items?: Recommendation[] };
      setRecommendations(data.items ?? []);
    }
  }, [initiativeId, item.id, item.recordType]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    if (reason.trim().length < 3) { setMessage("Explain why this priority is being set."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/initiatives/${initiativeId}/backlog/priority`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: item.recordType,
          entityId: item.id,
          expectedRevision: item.revision,
          factors,
          moscow,
          roadmapLane,
          reason,
          source,
          recommendationItemId,
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Priority could not be saved.");
      await onSaved();
      setMessage("Priority decision saved with its reason and history.");
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Priority could not be saved.");
    } finally { setBusy(false); }
  }

  async function generateRecommendation() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/initiatives/${initiativeId}/backlog/priority/recommend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType: item.recordType, entityId: item.id }),
      });
      const data = await response.json() as { error?: string; items?: Recommendation[] };
      if (!response.ok) throw new Error(data.error || "ChatGPT could not prepare the recommendation.");
      setRecommendations(data.items ?? []);
      setMessage(data.items?.length ? "Recommendation ready for review. Nothing has changed." : "The existing recommendation is still current.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ChatGPT could not prepare the recommendation.");
    } finally { setBusy(false); }
  }

  function applyRecommendationToForm(recommendation: Recommendation) {
    try {
      const proposal = JSON.parse(recommendation.proposedContentJson) as {
        factors: PriorityFactors; moscow: string; roadmapLane: BacklogItemRecord["roadmapLane"]; reason: string;
      };
      setFactors(proposal.factors);
      setMoscow(proposal.moscow);
      setRoadmapLane(item.recordType === "story" ? item.roadmapLane : proposal.roadmapLane);
      setReason(proposal.reason);
      setSource("ai");
      setRecommendationItemId(recommendation.id);
      setMessage("Suggestion copied into the form. Review it, then save to make the decision.");
    } catch {
      setMessage("This recommendation could not be read.");
    }
  }

  async function dismiss(recommendation: Recommendation) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/ai-assist-items/${recommendation.id}/dismiss`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Product Owner dismissed the priority recommendation." }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Recommendation could not be dismissed.");
      }
      await load(); setMessage("Recommendation dismissed. Priority was not changed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Recommendation could not be dismissed.");
    } finally { setBusy(false); }
  }

  const activeRecommendations = recommendations.filter(recommendation => recommendation.status === "proposed" || recommendation.status === "stale");
  return <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Priority decision</p><h2 className="text-xl font-bold">{item.title}</h2>
        <p className="mt-1 text-sm text-slate-500">Final decisions are limited to organization owners and administrators.</p></div>
      <button onClick={onClose} className="rounded-lg border px-3 py-2 text-sm">Close</button>
    </div>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {factorLabels.map(({ key, label }) => <label key={key} className="text-sm font-medium">{label}
        <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={factors[key]} onChange={event => {
          setFactors(current => ({ ...current, [key]: Number(event.target.value) })); setSource("manual"); setRecommendationItemId(null);
        }}>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value}</option>)}</select>
      </label>)}
      <label className="text-sm font-medium">Fibonacci effort
        <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={factors.effortPoints} onChange={event => {
          const effortPoints = Number(event.target.value) as PriorityFactors["effortPoints"];
          setFactors(current => ({ ...current, effortPoints, effort: effortFromPoints(effortPoints) }));
          setSource("manual"); setRecommendationItemId(null);
        }}>{priorityFibonacci.map(value => <option key={value} value={value}>{value}</option>)}</select>
      </label>
      <label className="text-sm font-medium">MoSCoW necessity
        <select className="mt-1 block w-full rounded-lg border px-3 py-2" value={moscow} onChange={event => { setMoscow(event.target.value); setSource("manual"); setRecommendationItemId(null); }}>
          <option value="must">Must</option><option value="should">Should</option><option value="could">Could</option><option value="wont_now">Won’t for now</option>
        </select>
      </label>
      <label className="text-sm font-medium">Roadmap placement
        <select disabled={item.recordType === "story"} className="mt-1 block w-full rounded-lg border px-3 py-2 disabled:bg-slate-100" value={roadmapLane} onChange={event => { setRoadmapLane(event.target.value as BacklogItemRecord["roadmapLane"]); setSource("manual"); setRecommendationItemId(null); }}>
          <option value="unscheduled">Unscheduled</option><option value="now">Now</option><option value="next">Next</option><option value="later">Later</option>
        </select>{item.recordType === "story" && <span className="mt-1 block text-xs text-slate-500">Stories inherit placement from their feature.</span>}
      </label>
    </div>
    <div className="mt-4 rounded-lg bg-indigo-50 p-4"><p className="text-sm font-medium">Calculated score</p><p className="text-2xl font-bold text-indigo-700">{score} / 100</p>
      <p className="text-xs text-slate-500">The saved ordering also accounts for features this item depends on or unblocks.</p></div>
    <label className="mt-4 block text-sm font-medium">Decision reason
      <textarea className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2" value={reason} onChange={event => { setReason(event.target.value); if (source === "ai") return; setRecommendationItemId(null); }} placeholder="Explain why the Product Owner chose this priority." />
    </label>
    <div className="mt-4 flex flex-wrap gap-3">
      <button disabled={busy} onClick={save} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save priority decision</button>
      <button disabled={busy} onClick={generateRecommendation} className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-40">Ask ChatGPT for one suggestion</button>
    </div>
    {message && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm">{message}</p>}
    {activeRecommendations.length > 0 && <div className="mt-5 space-y-3"><h3 className="font-semibold">ChatGPT suggestions awaiting review</h3>
      {activeRecommendations.map(recommendation => <article key={recommendation.id} className="rounded-lg border p-4"><p className="font-medium">{recommendation.synopsis}</p>
        <p className="mt-1 text-xs text-slate-500">Information used: {recommendation.informationUsed}</p>
        {recommendation.status === "stale" && <p className="mt-2 text-xs font-semibold text-amber-700">The backlog item changed after this suggestion was generated.</p>}
        <div className="mt-3 flex gap-2"><button disabled={busy} onClick={() => applyRecommendationToForm(recommendation)} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">Use suggestion</button>
          <button disabled={busy} onClick={() => dismiss(recommendation)} className="rounded border px-3 py-1.5 text-sm">Dismiss</button></div>
      </article>)}
    </div>}
    <div className="mt-5"><h3 className="font-semibold">Priority history</h3>
      {history.length ? <ol className="mt-2 space-y-2">{history.map(entry => <li key={entry.id} className="rounded-lg border p-3 text-sm">
        <p className="font-medium">{entry.moscow.replaceAll("_", " ")} · {entry.score}/100 · adjusted {entry.dependencyAdjustedScore}</p>
        <p>{entry.reason}</p><p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()} · {entry.changedBy?.name ?? "Unknown"} · {entry.source === "ai" ? "ChatGPT-assisted" : "Manual"}</p>
      </li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No final priority decision has been recorded yet.</p>}
    </div>
  </section>;
}
