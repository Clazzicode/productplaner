"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmPageNavigation, useUnsavedChanges } from "@/components/shell/unsavedChanges";

export interface PlanningFeature {
  id: string; name: string; description: string; backlogLane: string; backlogRevision: number;
  releaseId: string | null; businessValue: string; riskLevel: string; dependencyCount: number;
  dependencyWarnings: string[]; defectCount: number; blockerCount: number;
  qualityRisk: "low" | "medium" | "high" | "critical";
}
export interface RoadmapReleaseOption { id: string; label: string; targetDate: string }

const lanes = [
  { id: "now", label: "Now", detail: "Highest-priority focus", icon: "▤" },
  { id: "next", label: "Next", detail: "Expected after current focus", icon: "▷" },
  { id: "later", label: "Later", detail: "Intentionally deferred", icon: "◷" },
  { id: "unscheduled", label: "Unscheduled", detail: "Awaiting placement", icon: "▣" },
] as const;
type LaneId = (typeof lanes)[number]["id"];
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());

export default function RoadmapPlanningView(props: {
  initiativeId: string; features: PlanningFeature[]; releases: RoadmapReleaseOption[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [features, setFeatures] = useState(props.features);
  const [selectedId, setSelectedId] = useState<string | null>(props.features[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [warningsOnly, setWarningsOnly] = useState(false);
  const selected = features.find((feature) => feature.id === selectedId) ?? null;
  const visible = features.filter((feature) => {
    const query = search.trim().toLowerCase();
    return (!query || `${feature.name} ${feature.description}`.toLowerCase().includes(query))
      && (!warningsOnly || feature.blockerCount > 0 || feature.dependencyWarnings.length > 0);
  });
  if (features.length === 0) return <div className="roadmap-empty">
    <h3>No roadmap features are available yet</h3>
    <p>Approve an intake request and create its planning feature before placing it on the roadmap.</p>
    <Link href={`/initiatives/${props.initiativeId}/requests`}>Review requests →</Link>
  </div>;
  return <div className="roadmap-stage roadmap-planning-stage">
    <div className="roadmap-stage-main">
      <div className="roadmap-info"><span aria-hidden>ⓘ</span> Plan features without dates or sprint assignments. Add release context when known.</div>
      <div className="roadmap-controls">
        <label className="roadmap-search"><span aria-hidden>⌕</span><span className="sr-only">Search roadmap features</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search features..." /></label>
        <details className="roadmap-filter"><summary>Filter <span aria-hidden>⌄</span></summary><label><input type="checkbox" checked={warningsOnly} onChange={(event) => setWarningsOnly(event.target.checked)} /> Needs attention</label></details>
        <Link className="roadmap-backlog-link" href={`/initiatives/${props.initiativeId}/backlog`}>Open full feature backlog ↗</Link>
      </div>
      <div className="roadmap-lanes">
        {lanes.map((lane) => {
          const items = visible.filter((feature) => feature.backlogLane === lane.id);
          const total = features.filter((feature) => feature.backlogLane === lane.id).length;
          return <section className="roadmap-lane" key={lane.id} aria-label={`${lane.label} features`}>
            <div className="roadmap-lane-heading"><h3><span aria-hidden>{lane.icon}</span> {lane.label} <small>{total}</small></h3><p>{lane.detail}</p></div>
            <div className="roadmap-lane-cards">
              {items.map((feature) => <button type="button" key={feature.id}
                className={`roadmap-feature-card ${feature.id === selectedId ? "is-selected" : ""}`}
                onClick={() => { if (confirmPageNavigation()) { setSelectedId(feature.id); setMobileOpen(true); } }}>
                <strong>{feature.name}</strong>
                <span className="roadmap-feature-tags"><span>Value: {label(feature.businessValue)}</span>
                  {feature.dependencyCount > 0 && <span title={`${feature.dependencyCount} ${feature.dependencyCount === 1 ? "dependency" : "dependencies"}`}>↗ {feature.dependencyCount} dep.</span>}
                  {feature.blockerCount > 0 && <span className="is-warning">{feature.blockerCount} blockers</span>}
                </span>
              </button>)}
              {items.length === 0 && <p className="roadmap-lane-empty">{search || warningsOnly ? "No matching features" : "No features placed here"}</p>}
            </div>
          </section>;
        })}
      </div>
    </div>
    {selected && <aside className={`roadmap-detail roadmap-planning-detail ${mobileOpen ? "is-mobile-open" : ""}`} aria-label={`${selected.name} roadmap placement`}>
      <button type="button" className="roadmap-detail-close" aria-label="Close feature details" onClick={() => { if (confirmPageNavigation()) { setMobileOpen(false); setSelectedId(null); } }}>×</button>
      <span className="roadmap-eyebrow">◇ Planning feature</span>
      <h2>{selected.name}</h2>
      <RoadmapPlacementForm key={selected.id} initiativeId={props.initiativeId} feature={selected} releases={props.releases} canEdit={props.canEdit}
        onSaved={(updated) => { setFeatures((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item)); router.refresh(); }} />
    </aside>}
  </div>;
}

function RoadmapPlacementForm(props: {
  initiativeId: string; feature: PlanningFeature; releases: RoadmapReleaseOption[]; canEdit: boolean;
  onSaved: (updated: Pick<PlanningFeature, "id" | "backlogLane" | "backlogRevision" | "releaseId">) => void;
}) {
  const [lane, setLane] = useState<LaneId>(props.feature.backlogLane as LaneId);
  const [releaseId, setReleaseId] = useState(props.feature.releaseId ?? "");
  const [reason, setReason] = useState("");
  const [savedLane, setSavedLane] = useState(lane);
  const [savedReleaseId, setSavedReleaseId] = useState(releaseId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useUnsavedChanges(lane !== savedLane || releaseId !== savedReleaseId || reason.trim().length > 0);
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/initiatives/${props.initiativeId}/roadmap/features/${props.feature.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: props.feature.backlogRevision, lane, releaseId: releaseId || null, reason }),
      });
      const body = await response.json().catch(() => ({})) as { id?: string; backlogLane?: string; backlogRevision?: number; releaseId?: string | null; error?: string };
      if (!response.ok || !body.id || body.backlogRevision == null || !body.backlogLane) {
        setMessage(body.error ?? "Could not update the roadmap."); return;
      }
      props.onSaved({ id: body.id, backlogLane: body.backlogLane, backlogRevision: body.backlogRevision, releaseId: body.releaseId ?? null });
      setSavedLane(body.backlogLane as LaneId); setSavedReleaseId(body.releaseId ?? "");
      setReason(""); setMessage("Roadmap updated.");
    } catch { setMessage("Could not update the roadmap. Try again."); }
    finally { setSaving(false); }
  }
  return <div className="roadmap-detail-body">
    <label className="roadmap-field">Roadmap placement <span title="Planning placement does not commit a sprint.">ⓘ</span>
      <select value={lane} disabled={!props.canEdit} onChange={(event) => setLane(event.target.value as LaneId)}>{lanes.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    </label>
    <label className="roadmap-field">Release assignment <span title="Optional target release context.">ⓘ</span>
      <select value={releaseId} disabled={!props.canEdit} onChange={(event) => setReleaseId(event.target.value)}><option value="">None</option>{props.releases.map((release) => <option key={release.id} value={release.id}>{release.label}</option>)}</select>
    </label>
    <p className="roadmap-feature-description">{props.feature.description || "No description yet."}</p>
    <dl className="roadmap-facts"><div><dt>Business value</dt><dd>{label(props.feature.businessValue)}</dd></div><div><dt>Risk</dt><dd>{label(props.feature.riskLevel)}</dd></div><div><dt>Dependencies</dt><dd>{props.feature.dependencyCount}</dd></div></dl>
    {(props.feature.dependencyWarnings.length > 0 || props.feature.blockerCount > 0 || props.feature.defectCount > 0) && <div className="roadmap-warning" role="note">
      {props.feature.blockerCount > 0 && <p>{props.feature.blockerCount} open blocker{props.feature.blockerCount === 1 ? "" : "s"} require review before delivery commitment.</p>}
      {props.feature.defectCount > 0 && <p>{props.feature.defectCount} active defect{props.feature.defectCount === 1 ? "" : "s"} linked to this feature.</p>}
      {props.feature.dependencyWarnings.map((warning) => <p key={warning}>{warning}</p>)}
    </div>}
    {props.canEdit && <>
      <label className="roadmap-field">Reason for change<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this placement changing?" rows={3} /></label>
      <button className="roadmap-primary-button" type="button" disabled={saving || reason.trim().length < 3} onClick={() => void save()}>{saving ? "Saving…" : "Save placement"}</button>
    </>}
    {message && <p role="status" className="roadmap-save-message">{message}</p>}
    <p className="roadmap-explainer">This sets the roadmap placement. It does not commit the feature to a sprint.</p>
  </div>;
}
