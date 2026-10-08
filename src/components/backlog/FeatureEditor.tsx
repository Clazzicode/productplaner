"use client";
import { useState } from "react";
import {
  businessValueLabels, businessValues, featureSchema, lanes, laneLabels, riskLevelLabels, riskLevels,
  statuses, statusLabels, type FeatureInput, type FeatureRecord,
} from "@/lib/backlog/model";

export type FeatureOwnerOption = { id: string; name: string; email: string };

export default function FeatureEditor({ feature, owners, features, busy, onSave, onCancel }: {
  feature: FeatureRecord | null;
  owners: FeatureOwnerOption[];
  features: Pick<FeatureRecord, "id" | "name" | "backlogKey">[];
  busy: boolean;
  onSave: (data: FeatureInput, reason?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [data, setData] = useState<FeatureInput>(feature ? {
    name: feature.name, description: feature.description, backlogLane: feature.backlogLane, backlogStatus: feature.backlogStatus,
    ownerUserId: feature.ownerUserId, isMvp: feature.isMvp, businessValue: feature.businessValue,
    riskLevel: feature.riskLevel, dependsOnIds: feature.dependsOnIds,
  } : {
    name: "", description: "", backlogLane: "unscheduled", backlogStatus: "planned", ownerUserId: null,
    isMvp: false, businessValue: "medium", riskLevel: "medium", dependsOnIds: [],
  });
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900";
  const dependencyOptions = features.filter(option => option.id !== feature?.id);

  return <form className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5" onSubmit={async event => {
    event.preventDefault();
    const parsed = featureSchema.safeParse(data);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (feature && reason.trim().length < 3) { setError("Explain why this feature is changing."); return; }
    setError("");
    await onSave(parsed.data, feature ? reason.trim() : undefined);
  }}>
    <h2 className="mb-4 text-lg font-semibold">{feature ? `Edit ${feature.backlogKey ?? "feature"}` : "Add feature"}</h2>
    {feature?.sourceRequests.length ? <div className="mb-4 rounded-lg border border-indigo-100 bg-white p-3">
      <p className="text-sm font-semibold text-slate-800">Originating request</p>
      {feature.sourceRequests.map(source => <p key={source.id} className="mt-1 text-sm text-slate-600">
        {source.title} · {source.kind} · {source.source}{source.sourceReference ? ` · ${source.sourceReference}` : ""}
      </p>)}
    </div> : null}
    <fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm font-medium">Feature title<input required maxLength={160} className={field} value={data.name} onChange={e => setData({ ...data, name: e.target.value })} /></label>
      <label className="block text-sm font-medium">Purpose and requirements<textarea rows={5} maxLength={12000} className={field} value={data.description} onChange={e => setData({ ...data, description: e.target.value })} /></label>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-medium">Owner<select className={field} value={data.ownerUserId ?? ""} onChange={e => setData({ ...data, ownerUserId: e.target.value || null })}>
          <option value="">Unassigned</option>{owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name} ({owner.email})</option>)}
        </select></label>
        <label className="text-sm font-medium">Business value<select className={field} value={data.businessValue} onChange={e => setData({ ...data, businessValue: e.target.value as FeatureInput["businessValue"] })}>
          {businessValues.map(value => <option key={value} value={value}>{businessValueLabels[value]}</option>)}
        </select></label>
        <label className="text-sm font-medium">Delivery risk<select className={field} value={data.riskLevel} onChange={e => setData({ ...data, riskLevel: e.target.value as FeatureInput["riskLevel"] })}>
          {riskLevels.map(value => <option key={value} value={value}>{riskLevelLabels[value]}</option>)}
        </select></label>
        <label className="text-sm font-medium">Roadmap horizon<select className={field} value={data.backlogLane} onChange={e => setData({ ...data, backlogLane: e.target.value as FeatureInput["backlogLane"] })}>
          {lanes.map(lane => <option key={lane} value={lane}>{laneLabels[lane]}</option>)}
        </select></label>
        <label className="text-sm font-medium">Lifecycle status<select className={field} value={data.backlogStatus} onChange={e => setData({ ...data, backlogStatus: e.target.value as FeatureInput["backlogStatus"] })}>
          {statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select></label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-slate-300 bg-white p-3 text-sm font-medium">
          <input type="checkbox" checked={data.isMvp} onChange={e => setData({ ...data, isMvp: e.target.checked })} /> Included in MVP scope
        </label>
      </div>
      <fieldset className="rounded-lg border border-slate-200 bg-white p-3">
        <legend className="px-1 text-sm font-semibold">Dependencies</legend>
        {dependencyOptions.length ? <div className="grid gap-2 sm:grid-cols-2">
          {dependencyOptions.map(option => <label key={option.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={data.dependsOnIds.includes(option.id)} onChange={e => setData({
              ...data, dependsOnIds: e.target.checked ? [...data.dependsOnIds, option.id] : data.dependsOnIds.filter(id => id !== option.id),
            })} />
            <span>{option.backlogKey ? `${option.backlogKey} · ` : ""}{option.name}</span>
          </label>)}
        </div> : <p className="text-sm text-slate-500">No other features are available.</p>}
      </fieldset>
      {feature && <label className="block text-sm font-medium">Reason for change<textarea required minLength={3} maxLength={500} rows={2} className={field} value={reason} onChange={e => setReason(e.target.value)} placeholder={data.backlogStatus === "archived" ? "Why is this feature being archived?" : "What changed and why?"} /></label>}
      {!feature && <p className="text-sm text-slate-600">New features keep their selected scope, owner, value, risk, and dependencies in this one workflow.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3"><button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white" type="submit">{busy ? "Saving…" : "Save feature"}</button><button type="button" onClick={onCancel} className="rounded-lg border bg-white px-4 py-2">Cancel</button></div>
    </fieldset>
  </form>;
}
