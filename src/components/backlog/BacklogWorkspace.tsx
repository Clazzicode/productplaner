"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import FeatureEditor, { type FeatureOwnerOption } from "./FeatureEditor";
import PriorityEditor from "./PriorityEditor";
import {
  businessValueLabels, laneLabels, riskLevelLabels, statusLabels,
  type FeatureHistoryRecord, type FeatureInput, type FeatureRecord,
} from "@/lib/backlog/model";
import type { BacklogItemRecord } from "@/lib/backlog/unified";

type View = "features" | "backlog" | "roadmap";
const all = "all";

export default function BacklogWorkspace({ initiativeId, initialFeatures, initialItems, owners = [], canEdit, canPrioritize = false, demo = false }: {
  initiativeId: string; initialFeatures: FeatureRecord[]; initialItems?: BacklogItemRecord[];
  owners?: FeatureOwnerOption[]; canEdit: boolean; canPrioritize?: boolean; demo?: boolean;
}) {
  const [features, setFeatures] = useState(initialFeatures);
  const [items, setItems] = useState(initialItems ?? []);
  const [view, setView] = useState<View>("features");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [workType, setWorkType] = useState(all);
  const [readiness, setReadiness] = useState(all);
  const [ownerId, setOwnerId] = useState(all);
  const [status, setStatus] = useState(all);
  const [priority, setPriority] = useState(all);
  const [lane, setLane] = useState(all);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | "set_lane">("archive");
  const [bulkLane, setBulkLane] = useState<"now" | "next" | "later" | "unscheduled">("unscheduled");
  const [bulkReason, setBulkReason] = useState("");
  const [editing, setEditing] = useState<FeatureRecord | "new" | null>(null);
  const [prioritizing, setPrioritizing] = useState<BacklogItemRecord | null>(null);
  const [history, setHistory] = useState<FeatureHistoryRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const visibleFeatures = useMemo(() => features.filter(feature =>
    (showArchived || feature.backlogStatus !== "archived") &&
    `${feature.backlogKey} ${feature.name} ${feature.description} ${feature.owner?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [features, search, showArchived]);

  const visibleItems = useMemo(() => items.filter(item =>
    (showArchived || !item.archived) &&
    `${item.key ?? ""} ${item.title} ${item.description} ${item.owner?.name ?? ""}`.toLowerCase().includes(search.toLowerCase()) &&
    (workType === all || item.workType === workType) &&
    (readiness === all || item.readiness === readiness) &&
    (ownerId === all || (ownerId === "unassigned" ? !item.owner : item.owner?.id === ownerId)) &&
    (status === all || item.status === status) &&
    (priority === all || item.priorityLabel === priority) &&
    (lane === all || item.roadmapLane === lane)
  ), [items, search, showArchived, workType, readiness, ownerId, status, priority, lane]);

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

  async function refreshItems() {
    if (demo || !initialItems) return;
    const response = await fetch(`/api/initiatives/${initiativeId}/backlog/triage`);
    const data = await response.json() as { error?: string; items?: BacklogItemRecord[] };
    if (!response.ok) throw new Error(data.error || "The backlog could not be refreshed.");
    setItems(data.items ?? []);
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
      await refreshItems();
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
      if (result.features) setFeatures(result.features);
      await refreshItems(); setMessage("Feature order saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The order could not be saved."); }
    finally { setBusy(false); }
  }

  async function applyBulkTriage() {
    const chosen = items.filter(item => selected.includes(`${item.recordType}:${item.id}`));
    if (!chosen.length) { setMessage("Select at least one backlog item."); return; }
    if (bulkReason.trim().length < 3) { setMessage("Explain why these backlog items are changing."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/initiatives/${initiativeId}/backlog/triage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: bulkAction, ...(bulkAction === "set_lane" ? { lane: bulkLane } : {}),
          reason: bulkReason, items: chosen.map(item => ({ id: item.id, type: item.recordType, revision: item.revision })),
        }),
      });
      const data = await response.json() as { error?: string; items?: BacklogItemRecord[] };
      if (!response.ok) throw new Error(data.error || "Bulk triage could not be saved.");
      setItems(data.items ?? []); setSelected([]); setBulkReason("");
      const featuresResponse = await fetch(`/api/initiatives/${initiativeId}/backlog`);
      const featuresData = await featuresResponse.json() as { features?: FeatureRecord[] };
      if (featuresResponse.ok && featuresData.features) setFeatures(featuresData.features);
      setMessage(`${chosen.length} backlog item${chosen.length === 1 ? "" : "s"} updated.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bulk triage could not be saved."); }
    finally { setBusy(false); }
  }

  const tab = (id: View, label: string) => <button onClick={() => { setView(id); setEditing(null); setPrioritizing(null); }} className={`rounded-lg px-4 py-2 text-sm font-semibold ${view === id ? "bg-indigo-600 text-white" : "bg-white text-slate-700"}`}>{label}</button>;
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

  const options = (values: string[]) => [...new Set(values)].sort();
  const selectClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const selectedKey = (item: BacklogItemRecord) => `${item.recordType}:${item.id}`;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><div className="flex flex-wrap gap-2">{tab("features", "Features")}{tab("backlog", "Unified backlog")}{tab("roadmap", "Now / Next / Later")}</div>{canEdit && <button onClick={() => { setHistory([]); setEditing("new"); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">+ Add feature</button>}</div>
    <div className="flex flex-wrap items-center gap-4">
      <label className="min-w-64 flex-1"><span className="sr-only">Search backlog</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search backlog items or owners…" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" /></label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
    </div>
    {view === "backlog" && <div className="grid gap-2 rounded-xl border bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <select aria-label="Work type" className={selectClass} value={workType} onChange={e => setWorkType(e.target.value)}><option value={all}>All work types</option>{options(items.map(item => item.workType)).map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Readiness" className={selectClass} value={readiness} onChange={e => setReadiness(e.target.value)}><option value={all}>All readiness</option>{options(items.map(item => item.readiness)).map(value => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select>
      <select aria-label="Owner" className={selectClass} value={ownerId} onChange={e => setOwnerId(e.target.value)}><option value={all}>All owners</option><option value="unassigned">Unassigned</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>
      <select aria-label="Status" className={selectClass} value={status} onChange={e => setStatus(e.target.value)}><option value={all}>All statuses</option>{options(items.map(item => item.status)).map(value => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select>
      <select aria-label="Priority" className={selectClass} value={priority} onChange={e => setPriority(e.target.value)}><option value={all}>All priorities</option>{options(items.map(item => item.priorityLabel)).map(value => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select>
      <select aria-label="Roadmap placement" className={selectClass} value={lane} onChange={e => setLane(e.target.value)}><option value={all}>All roadmap placements</option>{options(items.map(item => item.roadmapLane)).map(value => <option key={value}>{laneLabels[value as keyof typeof laneLabels]}</option>)}</select>
    </div>}
    {view === "backlog" && canEdit && <div className="flex flex-wrap items-end gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
      <label className="text-sm font-medium">Bulk action<select className={selectClass + " block mt-1"} value={bulkAction} onChange={e => setBulkAction(e.target.value as typeof bulkAction)}><option value="archive">Archive</option><option value="restore">Restore</option><option value="set_lane">Set roadmap placement</option></select></label>
      {bulkAction === "set_lane" && <label className="text-sm font-medium">Placement<select className={selectClass + " block mt-1"} value={bulkLane} onChange={e => setBulkLane(e.target.value as typeof bulkLane)}>{(["unscheduled", "now", "next", "later"] as const).map(value => <option key={value} value={value}>{laneLabels[value]}</option>)}</select></label>}
      <label className="min-w-64 flex-1 text-sm font-medium">Reason<input className={selectClass + " block w-full mt-1"} value={bulkReason} onChange={e => setBulkReason(e.target.value)} placeholder="Why are these items changing?" /></label>
      <button disabled={busy || selected.length === 0} onClick={applyBulkTriage} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Apply to {selected.length} selected</button>
    </div>}
    {message && <p role="status" className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-700">{message}</p>}
    {prioritizing && canPrioritize && <PriorityEditor initiativeId={initiativeId} item={prioritizing} onSaved={refreshItems} onClose={() => setPrioritizing(null)} />}
    {editing && <FeatureEditor key={editing === "new" ? "new" : `${editing.id}-${editing.backlogRevision}`} feature={editing === "new" ? null : editing}
      owners={owners} features={features} busy={busy} onSave={save} onCancel={() => setEditing(null)} />}
    {editing && editing !== "new" && <section className="rounded-xl border bg-white p-4">
      <h2 className="font-semibold">Feature change history</h2>
      {history.length ? <ol className="mt-3 space-y-3">{history.map(item => <li key={item.id} className="border-l-2 border-indigo-200 pl-3 text-sm"><p className="font-medium">{item.reason || item.action}</p><p className="text-slate-500">{new Date(item.createdAt).toLocaleString()} · {item.actor?.name ?? "System"} · revision {item.revision}</p><p className="text-xs text-slate-500">Changed: {Object.keys(item.changes).join(", ") || "record created"}</p></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No saved changes yet.</p>}
    </section>}
    {view === "features" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleFeatures.map(feature => card(feature))}</div>}
    {view === "backlog" && visibleItems.length > 0 && <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[1050px] text-left text-sm">
      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-3"><span className="sr-only">Select</span></th><th className="p-3">Backlog item</th><th className="p-3">Type / source</th><th className="p-3">Owner</th><th className="p-3">Readiness / status</th><th className="p-3">Priority</th><th className="p-3">Roadmap</th><th className="p-3">Order</th></tr></thead>
      <tbody>{visibleItems.map(item => {
        const key = selectedKey(item); const featureIndex = item.recordType === "feature" ? features.findIndex(feature => feature.id === item.id) : -1;
        return <tr key={key} className="border-t align-top"><td className="p-3"><input aria-label={`Select ${item.title}`} type="checkbox" checked={selected.includes(key)} onChange={e => setSelected(current => e.target.checked ? [...current, key] : current.filter(value => value !== key))} /></td>
          <td className="p-3"><p className="font-semibold">{item.key ? `${item.key} · ` : ""}{item.title}</p><p className="mt-1 max-w-md line-clamp-2 text-xs text-slate-500">{item.description}</p>{item.archived && <span className="mt-1 inline-block rounded bg-slate-200 px-2 py-0.5 text-xs">Archived</span>}</td>
          <td className="p-3 capitalize">{item.workType.replaceAll("_", " ")}<p className="text-xs text-slate-500">{item.source}</p></td>
          <td className="p-3">{item.owner?.name ?? "Unassigned"}</td><td className="p-3 capitalize">{item.readiness.replaceAll("_", " ")}<p className="text-xs text-slate-500">{item.status.replaceAll("_", " ")}</p></td>
          <td className="p-3 capitalize">{item.priorityLabel.replaceAll("_", " ")}<p className="text-xs text-slate-500">{item.priorityScore == null ? "Not scored" : `${item.priorityScore} / 100`}</p>{item.dependencyAdjustedScore != null && item.dependencyAdjustedScore !== item.priorityScore && <p className="text-xs text-indigo-600">Dependency-adjusted: {item.dependencyAdjustedScore}</p>}{item.priorityReason && <p className="mt-1 max-w-48 text-xs normal-case text-slate-500">{item.priorityReason}</p>}{canPrioritize && !item.archived && <button onClick={() => { setPrioritizing(item); setEditing(null); }} className="mt-2 text-xs font-semibold text-indigo-700">Set priority</button>}</td>
          <td className="p-3">{laneLabels[item.roadmapLane]}</td>
          <td className="p-3">{featureIndex >= 0 && canEdit ? <div className="flex gap-1"><button disabled={busy || featureIndex === 0} aria-label={`Move ${item.title} up`} onClick={() => move(featureIndex, -1)} className="rounded border px-2 py-1 disabled:opacity-30">↑</button><button disabled={busy || featureIndex === features.length - 1} aria-label={`Move ${item.title} down`} onClick={() => move(featureIndex, 1)} className="rounded border px-2 py-1 disabled:opacity-30">↓</button></div> : "—"}</td>
        </tr>;
      })}</tbody>
    </table></div>}
    {view === "roadmap" && <div className="grid gap-5 lg:grid-cols-3">{(["now", "next", "later"] as const).map(roadmapLane => <section key={roadmapLane} className="rounded-xl bg-slate-100 p-4"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold">{laneLabels[roadmapLane]}</h2><span className="text-sm text-slate-500">{visibleFeatures.filter(item => item.backlogLane === roadmapLane).length}</span></div><div className="space-y-3">{visibleFeatures.filter(item => item.backlogLane === roadmapLane).map(feature => card(feature))}</div></section>)}</div>}
    {((view === "backlog" ? visibleItems : visibleFeatures).length === 0) && <p className="rounded-xl border border-dashed p-8 text-center text-slate-500">{showArchived ? "No backlog items match these filters." : "No active backlog items match. Clear filters or turn on Show archived."}</p>}
  </div>;
}
