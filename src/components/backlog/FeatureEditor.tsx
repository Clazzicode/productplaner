"use client";
import { useState } from "react";
import { featureSchema, lanes, laneLabels, statuses, statusLabels, type FeatureInput, type FeatureRecord } from "@/lib/backlog/model";

export default function FeatureEditor({ feature, busy, onSave, onCancel }: {
  feature: FeatureRecord | null; busy: boolean; onSave: (data: FeatureInput) => Promise<void>; onCancel: () => void;
}) {
  const [data, setData] = useState<FeatureInput>(feature ? { name: feature.name, description: feature.description, backlogLane: feature.backlogLane, backlogStatus: feature.backlogStatus }
    : { name: "", description: "", backlogLane: "unscheduled", backlogStatus: "planned" });
  const [error, setError] = useState("");
  const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900";
  return <form className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5" onSubmit={async event => {
    event.preventDefault(); const parsed = featureSchema.safeParse(data);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError(""); await onSave(parsed.data);
  }}>
    <h2 className="mb-4 text-lg font-semibold">{feature ? `Edit ${feature.backlogKey ?? "feature"}` : "Add feature"}</h2>
    <fieldset disabled={busy} className="space-y-4">
      <label className="block text-sm font-medium">Feature title<input required maxLength={160} className={field} value={data.name} onChange={e => setData({ ...data, name: e.target.value })} /></label>
      <label className="block text-sm font-medium">Purpose and requirements<textarea rows={4} maxLength={12000} className={field} value={data.description} onChange={e => setData({ ...data, description: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Roadmap horizon<select className={field} value={data.backlogLane} onChange={e => setData({ ...data, backlogLane: e.target.value as FeatureInput["backlogLane"] })}>{lanes.map(lane => <option key={lane} value={lane}>{laneLabels[lane]}</option>)}</select></label>
        <label className="text-sm font-medium">Delivery status<select className={field} value={data.backlogStatus} onChange={e => setData({ ...data, backlogStatus: e.target.value as FeatureInput["backlogStatus"] })}>{statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      </div>
      {!feature && <p className="text-sm text-slate-600">New features start outside MVP, with medium planning estimates. Review those estimates in guided intake before generating a plan.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3"><button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white" type="submit">{busy ? "Saving…" : "Save feature"}</button><button type="button" onClick={onCancel} className="rounded-lg border bg-white px-4 py-2">Cancel</button></div>
    </fieldset>
  </form>;
}
