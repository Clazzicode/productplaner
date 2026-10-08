"use client";

import Link from "next/link";
import { useState } from "react";

export interface PlanningFeature {
  id: string;
  name: string;
  description: string;
  backlogLane: string;
  backlogRevision: number;
  releaseId: string | null;
  businessValue: string;
  riskLevel: string;
  dependencyCount: number;
  dependencyWarnings: string[];
  defectCount: number;
  blockerCount: number;
  qualityRisk: "low" | "medium" | "high" | "critical";
}

export interface RoadmapReleaseOption {
  id: string;
  label: string;
  targetDate: string;
}

const lanes = [
  { id: "now", label: "Now", detail: "Highest-priority work being addressed first" },
  { id: "next", label: "Next", detail: "Work expected after the current focus" },
  { id: "later", label: "Later", detail: "Valuable work intentionally deferred" },
  { id: "unscheduled", label: "Unscheduled", detail: "Prioritized work still awaiting placement" },
] as const;

type LaneId = (typeof lanes)[number]["id"];

export default function RoadmapPlanningView(props: {
  initiativeId: string;
  features: PlanningFeature[];
  releases: RoadmapReleaseOption[];
  canEdit: boolean;
}) {
  const [features, setFeatures] = useState(props.features);

  if (features.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
      <h3 className="font-semibold text-slate-900">No roadmap features are available yet</h3>
      <p className="mt-1 text-sm text-slate-600">Approve an intake request and create its planning feature before generating the roadmap.</p>
      <Link href={`/initiatives/${props.initiativeId}/requests`} className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Review requests</Link>
    </div>;
  }

  const placedCount = features.filter((feature) => feature.backlogLane !== "unscheduled").length;
  return <div>
    {placedCount === 0 && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      {features.length} prioritized feature{features.length === 1 ? " is" : "s are"} available, but none have a roadmap placement. Assign them to Now, Next, or Later below.
    </div>}
    <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
      This planning view works without dates or sprint assignments. Dates and releases enrich the plan after Now, Next, Later, or Unscheduled placement.
    </div>
    <div className="grid gap-4 xl:grid-cols-4">
      {lanes.map((lane) => {
        const items = features.filter((feature) => feature.backlogLane === lane.id);
        return <section key={lane.id} className="rounded-xl bg-slate-100 p-4">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-950">{lane.label}</h3>
              <span className="text-sm text-slate-500">{items.length}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{lane.detail}</p>
          </div>
          <div className="space-y-3">
            {items.map((feature) => <FeatureCard
              key={feature.id}
              initiativeId={props.initiativeId}
              feature={feature}
              releases={props.releases}
              canEdit={props.canEdit}
              onSaved={(updated) => setFeatures((current) => current.map((item) =>
                item.id === updated.id ? { ...item, ...updated } : item
              ))}
            />)}
            {items.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 px-3 py-5 text-center text-xs text-slate-500">No features placed here.</p>}
          </div>
        </section>;
      })}
    </div>
    <Link href={`/initiatives/${props.initiativeId}/backlog`} className="mt-4 inline-block text-sm font-semibold text-indigo-700">Open the full feature backlog →</Link>
  </div>;
}

function FeatureCard(props: {
  initiativeId: string;
  feature: PlanningFeature;
  releases: RoadmapReleaseOption[];
  canEdit: boolean;
  onSaved: (updated: Pick<PlanningFeature, "id" | "backlogLane" | "backlogRevision" | "releaseId">) => void;
}) {
  const [lane, setLane] = useState<LaneId>(props.feature.backlogLane as LaneId);
  const [releaseId, setReleaseId] = useState(props.feature.releaseId ?? "");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState("");

  async function save() {
    setState("saving");
    setMessage("");
    const response = await fetch(`/api/initiatives/${props.initiativeId}/roadmap/features/${props.feature.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedRevision: props.feature.backlogRevision,
        lane,
        releaseId: releaseId || null,
        reason,
      }),
    });
    const body = await response.json().catch(() => ({})) as {
      id?: string; backlogLane?: string; backlogRevision?: number; releaseId?: string | null; error?: string;
    };
    if (!response.ok || !body.id || body.backlogRevision == null || !body.backlogLane) {
      setMessage(body.error ?? "Could not update the roadmap.");
      setState("idle");
      return;
    }
    props.onSaved({
      id: body.id,
      backlogLane: body.backlogLane,
      backlogRevision: body.backlogRevision,
      releaseId: body.releaseId ?? null,
    });
    setReason("");
    setMessage("Roadmap updated.");
    setState("idle");
  }

  const hasWarnings = props.feature.dependencyWarnings.length > 0 || props.feature.blockerCount > 0;
  return <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <h4 className="font-semibold text-slate-950">{props.feature.name}</h4>
    <p className="mt-1 line-clamp-3 text-xs text-slate-600">{props.feature.description || "No description yet."}</p>
    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
      <span className="rounded-full bg-indigo-50 px-2 py-1 capitalize text-indigo-700">{props.feature.businessValue.replaceAll("_", " ")} value</span>
      <span className="rounded-full bg-amber-50 px-2 py-1 capitalize text-amber-800">{props.feature.riskLevel} risk</span>
      {props.feature.dependencyCount > 0 && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{props.feature.dependencyCount} dependencies</span>}
      {props.feature.defectCount > 0 && <span className="rounded-full bg-rose-50 px-2 py-1 text-rose-700">{props.feature.defectCount} active defects</span>}
      {props.feature.blockerCount > 0 && <span className="rounded-full bg-red-100 px-2 py-1 text-red-800">{props.feature.blockerCount} blockers</span>}
      <span className="rounded-full bg-slate-100 px-2 py-1 capitalize text-slate-700">{props.feature.qualityRisk} quality risk</span>
    </div>
    {hasWarnings && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-950">
      {props.feature.blockerCount > 0 && <p>Resolve open blockers before committing this feature to delivery.</p>}
      {props.feature.dependencyWarnings.map((warning) => <p key={warning}>{warning}</p>)}
    </div>}
    {props.canEdit && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <label className="block text-[11px] font-medium text-slate-700">Roadmap placement
        <select value={lane} onChange={(event) => setLane(event.target.value as LaneId)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
          {lanes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
      <label className="block text-[11px] font-medium text-slate-700">Target release
        <select value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
          <option value="">No target release</option>
          {props.releases.map((release) => <option key={release.id} value={release.id}>{release.label} · {new Date(release.targetDate).toLocaleDateString()}</option>)}
        </select>
      </label>
      <label className="block text-[11px] font-medium text-slate-700">Change reason
        <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this changing?" className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
      </label>
      <button type="button" disabled={state === "saving" || reason.trim().length < 3} onClick={save} className="w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {state === "saving" ? "Saving…" : "Save roadmap change"}
      </button>
      {message && <p role="status" className={`text-[11px] ${message === "Roadmap updated." ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>}
    </div>}
  </article>;
}
