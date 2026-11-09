"use client";

import Link from "next/link";
import { useState } from "react";
import { formatCalendarDate } from "@/lib/calendarDate";

type Release = {
  id: string; label: string; targetDate: string; cadence: string;
  featureCount: number; defectCount: number; blockerCount: number; qualityRisk: string;
};
type Feature = { id: string; title: string; releaseId: string | null };
const date = (value: string) => formatCalendarDate(value, { month: "short", day: "numeric" });
const cadence = (value: string) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Not set";

export default function RoadmapMilestonesView(props: {
  initiativeId: string; releases: Release[]; features: Feature[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(props.releases[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const selected = props.releases.find((release) => release.id === selectedId) ?? null;
  if (props.releases.length === 0) return <div className="roadmap-empty">
    <h3>No target releases yet</h3>
    <p>Create a release in Sprints & Releases to add cadence and target dates to this roadmap.</p>
    <Link href={`/initiatives/${props.initiativeId}/workspace/sprints`}>Open Sprints & Releases →</Link>
  </div>;
  return <div className="roadmap-stage roadmap-milestones-stage">
    <div className="roadmap-stage-main">
      <div className="roadmap-info"><span aria-hidden>ⓘ</span> Release targets add dates and cadence to the feature plan. They do not approve delivery.</div>
      <div className="roadmap-milestone-path" aria-label="Release target sequence">
        {props.releases.map((release) => <button key={release.id} type="button" onClick={() => { setSelectedId(release.id); setMobileOpen(true); }} className={release.id === selectedId ? "is-selected" : ""}>
          <span className="roadmap-milestone-dot" aria-hidden />
          <strong>{date(release.targetDate)}</strong><span>{release.label}</span>
        </button>)}
      </div>
      <div className="roadmap-milestone-cards">
        {props.releases.map((release) => <button type="button" key={release.id} className={`roadmap-milestone-card ${release.id === selectedId ? "is-selected" : ""}`} onClick={() => { setSelectedId(release.id); setMobileOpen(true); }}>
          <span className="roadmap-card-eyebrow">Target release</span>
          <strong className="roadmap-card-date">{date(release.targetDate)}</strong>
          <strong className="roadmap-card-title">{release.label}</strong>
          <span className="roadmap-cadence">▣ &nbsp; Cadence: {cadence(release.cadence)}</span>
          <span className="roadmap-card-facts"><span>Features: <b>{release.featureCount}</b></span><span>Active defects: <b>{release.defectCount}</b></span><span>Open blockers: <b>{release.blockerCount}</b></span><span>Quality risk: <b className={`risk-${release.qualityRisk}`}>{cadence(release.qualityRisk)}</b></span></span>
        </button>)}
      </div>
    </div>
    {selected && <aside className={`roadmap-detail roadmap-milestone-detail ${mobileOpen ? "is-mobile-open" : ""}`} aria-label={`${selected.label} details`}>
      <button type="button" className="roadmap-detail-close" aria-label="Close release details" onClick={() => { setMobileOpen(false); setSelectedId(null); }}>×</button>
      <h2>{selected.label}</h2>
      <dl className="roadmap-release-details"><div><dt>Target date</dt><dd>{date(selected.targetDate)}</dd></div><div><dt>Cadence</dt><dd>{cadence(selected.cadence)}</dd></div></dl>
      <div className="roadmap-linked-features"><h3>{selected.featureCount} linked features</h3>
        {props.features.filter((feature) => feature.releaseId === selected.id).map((feature) => <p key={feature.id}>{feature.title}</p>)}
        {selected.featureCount > 0 && !props.features.some((feature) => feature.releaseId === selected.id) && <p>Linked features are recorded in the release plan.</p>}
      </div>
      {(selected.blockerCount > 0 || selected.defectCount > 0) && <div className="roadmap-warning" role="note">
        {selected.blockerCount > 0 && <p>{selected.blockerCount} blocker{selected.blockerCount === 1 ? "" : "s"} require review before release readiness.</p>}
        {selected.defectCount > 0 && <p>{selected.defectCount} active defect{selected.defectCount === 1 ? "" : "s"} linked to this release.</p>}
      </div>}
      <Link className="roadmap-detail-link" href={`/initiatives/${props.initiativeId}/workspace/sprints`}>Open Sprints & Releases ↗</Link>
    </aside>}
  </div>;
}
