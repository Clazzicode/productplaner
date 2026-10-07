"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import FeatureEditor, { type FeatureOwnerOption } from "./FeatureEditor";
import {
  businessValueLabels, laneLabels, riskLevelLabels, statusLabels,
  type FeatureHistoryRecord, type FeatureInput, type FeatureRecord,
} from "@/lib/backlog/model";

type View = "features" | "backlog" | "roadmap";

export default function BacklogWorkspace({ initiativeId, initialFeatures, owners = [], canEdit, demo = false }: {
  initiativeId: string; initialFeatures: FeatureRecord[]; owners?: FeatureOwnerOption[]; canEdit: boolean; demo?: boolean;
}) {
  const [features, setFeatures] = useState(initialFeatures);
  const [view, setView] = useState<View>("features");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<FeatureRecord | "new" | null>(null);
  const [history, setHistory] = useState<FeatureHistoryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const visible = useMemo(() => features.filter(feature =>
    (showArchived || feature.backlogStatus !== "archived") &&
    `${feature.backlogKey} ${feature.name} ${feature.description} ${feature.owner?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [features, search, showArchived]);

  useEffect(() => {
    if (!editing || editing === "new" || demo) return;
    let active = true;
    fetch(`/api/initiatives/${initiativeId}/backlog/${editing.id}/history`)
      .then(async response => {
        const data = await response.json() as { error?: string; history?: FeatureHistoryRecord[] };
        if (!response.ok) throw new Error(data.error || "Feature history could not be loaded.");
        if (active) setHistory(data.history ?? []);
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : "Feature history could not be loaded."); });
    return () => { active = false; };
  }, [demo, editing, initiativeId]);

  async function call(body: unknown) {
    const response = await fetch(`/api/initiatives/${initiativeId}/backlog`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json() as { error?: string; feature?: FeatureRecord; features?: FeatureRecord[] };
    if (!response.ok) throw new Error(data.error || "The feature backlog could not be saved.");
    return data;
  }

  async function save(input: FeatureInput, reason?: string) {
    setBusy(true); setMessage("");
    try {
      const current = editing === "new" ? undefined : editing ?? undefined;
      if (demo) {
        const saved: FeatureRecord = current
          ? { ...current, ...input, owner: owners.find(owner => owner.id === input.ownerUserId) ?? null, backlogRevision: current.backlogRevision + 1 }
          : { ...input, id: `demo-feature-${Date.now()}`, backlogKey: null, backlogRevision: 1, order: features.length,
              owner: owners.find(owner => owner.id === input.ownerUserId) ?? null, sourceRequests: [] };
        setFeatures(previous => current ? previous.map(item => item.id === saved.id ? saved : item) : [...previous, saved]);
        setEditing(null); setMessage("Feature saved in this local demo."); return;
      }
      const result = await call({ action: "save", data: input, reason, ...(current ? { existing: { id: current.id, revision: current.backlogRevision } } : {}) });
      if (result.feature) setFeatures(previous => current ? previous.map(item => item.id === result.feature!.id ? result.feature! : item) : [...previous, result.feature!]);
      setEditing(null); setMessage(input.backlogStatus === "archived" ? "Feature archived. Turn on Show archived to view it." : "Feature saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The feature could not be saved."); }
    finally { setBusy(false); }
  }

  async function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= features.length) return;
    const reordered = [...features]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setBusy(true); setMessage("");
    try {
      if (demo) {
        setFeatures(reordered.map((item, order) => ({ ...item, order, backlogRevision: item.backlogRevision + 1 })));
        setMessage("Backlog order saved in this local demo."); return;
      }
      const result = await call({ action: "reorder", items: reordered.map(item => ({ id: item.id, revision: item.backlogRevision })) });
      if (result.features) setFeatures(result.features); setMessage("Backlog order saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The order could not be saved."); }
    finally { setBusy(false); }
  }

  const tab = (id: View, label: string) => <button onClick={() => { setView(id); setEditing(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === id ? "bg-indigo-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>;
  const badge = (feature: FeatureRecord) => {
    const colors = feature.backlogStatus === "in_progress" ? "bg-amber-100 text-amber-700" : feature.backlogStatus === "ready_for_review" ? "bg-emerald-100 text-emerald-700" : feature.backlogStatus === "archived" ? "bg-slate-200 text-slate-600" : "bg-slate-100 text-slate-700";
    return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors}`}>{statusLabels[feature.backlogStatus]}</span>;
  };
  const card = (feature: FeatureRecord, extra?: ReactNode) => <article key={feature.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-indigo-600">{feature.backlogKey ?? "FEATURE"}</p><h3 className="mt-1 font-semibold text-slate-950">{feature.name}</h3></div>{badge(feature)}</div>
    <p className="mt-2 line-clamp-3 text-sm text-slate-600">{feature.description}</p>
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
      <span className="rounded-full bg-indigo-50 px-2 py-1">{feature.isMvp ? "MVP" : "Post-MVP"}</span>
      <span className="rounded-full bg-slate-100 px-2 py-1">Value: {businessValueLabels[feature.businessValue]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-1">Risk: {riskLevelLabels[feature.riskLevel]}</span>
      <span className="rounded-full bg-slate-100 px-2 py-1">Owner: {feature.owner?.name ?? "Unassigned"}</span>
    </div>
    {feature.sourceRequests.length ? <p className="mt-3 text-xs text-slate-500">Origin: {feature.sourceRequests.map(source => source.title).join(", ")}</p> : null}
    {feature.dependsOnIds.length ? <p className="mt-1 text-xs text-slate-500">Dependencies: {feature.dependsOnIds.length}</p> : null}
    <div className="mt-4 flex items-center justify-between gap-2">{extra ?? <span className="text-xs font-medium text-slate-500">{laneLabels[feature.backlogLane]}</span>}{canEdit && <button className="text-sm font-semibold text-indigo-700" onClick={() => { setHistory([]); setEditing(feature); }}>Edit</button>}</div>
  </article>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><div className="flex flex-wrap gap-2">{tab("features", "Features")}{tab("backlog", "Backlog")}{tab("roadmap", "Now / Next / Later")}</div>{canEdit && <button onClick={() => { setHistory([]); setEditing("new"); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Add feature</button>}</div>
    <div className="flex flex-wrap items-center gap-4">
      <label className="min-w-64 flex-1"><span className="sr-only">Search features</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search features or owners…" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" /></label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
    </div>
    {message && <p role="status" className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{message}</p>}
    {editing && <FeatureEditor key={editing === "new" ? "new" : `${editing.id}-${editing.backlogRevision}`} feature={editing === "new" ? null : editing}
      owners={owners} features={features} busy={busy} onSave={save} onCancel={() => setEditing(null)} />}
    {editing && editing !== "new" && <section className="rounded-xl border bg-white p-4">
      <h2 className="font-semibold">Feature change history</h2>
      {history.length ? <ol className="mt-3 space-y-3">{history.map(item => <li key={item.id} className="border-l-2 border-indigo-200 pl-3 text-sm">
        <p className="font-medium">{item.reason || item.action}</p>
        <p className="text-slate-500">{new Date(item.createdAt).toLocaleString()} · {item.actor?.name ?? "System"} · revision {item.revision}</p>
        <p className="text-xs text-slate-500">Changed: {Object.keys(item.changes).join(", ") || "record created"}</p>
      </li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No saved changes yet.</p>}
    </section>}
    {view === "features" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(feature => card(feature))}</div>}
    {view === "backlog" && <div className="space-y-3">{visible.map(feature => {
      const index = features.findIndex(item => item.id === feature.id);
      return card(feature, <div className="flex items-center gap-2"><span className="w-8 text-center text-sm font-bold text-slate-500">{index + 1}</span>{canEdit && <><button disabled={busy || index === 0} aria-label={`Move ${feature.name} up`} onClick={() => move(index, -1)} className="rounded border px-2 py-1 disabled:opacity-30">↑</button><button disabled={busy || index === features.length - 1} aria-label={`Move ${feature.name} down`} onClick={() => move(index, 1)} className="rounded border px-2 py-1 disabled:opacity-30">↓</button></>}</div>);
    })}</div>}
    {view === "roadmap" && <div className="grid gap-5 lg:grid-cols-3">{(["now", "next", "later"] as const).map(lane => <section key={lane} className="rounded-xl bg-slate-100 p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{laneLabels[lane]}</h2><span className="text-sm text-slate-500">{visible.filter(item => item.backlogLane === lane).length}</span></div><div className="space-y-3">{visible.filter(item => item.backlogLane === lane).map(feature => card(feature))}</div></section>)}</div>}
    {visible.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">{showArchived ? "No features match these filters." : "No active features match. Turn on Show archived to view archived work."}</p>}
  </div>;
}
