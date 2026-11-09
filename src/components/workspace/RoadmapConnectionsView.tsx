"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type ConnectionFeature = {
  id: string; name: string; lane: string; dependsOnIds: string[]; dependencyWarnings: string[];
};
type Path = { key: string; d: string; warning: boolean };
const lanes = [
  { id: "now", name: "Now" }, { id: "next", name: "Next" },
  { id: "later", name: "Later" }, { id: "unscheduled", name: "Unscheduled" },
];
const laneRank = new Map(lanes.map((lane, index) => [lane.id, index]));
const laneLabel = (lane: string) => lanes.find((item) => item.id === lane)?.name ?? "Unscheduled";
function dependencyFirst(features: ConnectionFeature[]) {
  const byId = new Map(features.map((feature) => [feature.id, feature]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: ConnectionFeature[] = [];
  const visit = (feature: ConnectionFeature) => {
    if (visited.has(feature.id) || visiting.has(feature.id)) return;
    visiting.add(feature.id);
    feature.dependsOnIds.forEach((id) => { const dependency = byId.get(id); if (dependency) visit(dependency); });
    visiting.delete(feature.id);
    visited.add(feature.id);
    ordered.push(feature);
  };
  features.forEach(visit);
  return ordered;
}

/** Read-only relationship map from existing capability dependency edges. */
export default function RoadmapConnectionsView(props: { initiativeId: string; features: ConnectionFeature[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(props.features.find((feature) => feature.dependsOnIds.length > 0)?.id ?? props.features[0]?.id ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paths, setPaths] = useState<Path[]>([]);
  const graphRef = useRef<HTMLDivElement>(null);
  const selected = props.features.find((feature) => feature.id === selectedId) ?? null;
  const usedBy = selected ? props.features.filter((feature) => feature.dependsOnIds.includes(selected.id)) : [];
  const dependsOn = selected ? props.features.filter((feature) => selected.dependsOnIds.includes(feature.id)) : [];

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const featureById = new Map(props.features.map((feature) => [feature.id, feature]));
    const update = () => {
      const frame = graph.getBoundingClientRect();
      const next: Path[] = [];
      for (const feature of props.features) {
        const to = graph.querySelector<HTMLElement>(`[data-feature-id="${CSS.escape(feature.id)}"]`);
        if (!to) continue;
        const toRect = to.getBoundingClientRect();
        for (const dependencyId of feature.dependsOnIds) {
          const from = graph.querySelector<HTMLElement>(`[data-feature-id="${CSS.escape(dependencyId)}"]`);
          const dependency = featureById.get(dependencyId);
          if (!from || !dependency) continue;
          const fromRect = from.getBoundingClientRect();
          const sameLane = feature.lane === dependency.lane;
          const x1 = (sameLane ? fromRect.left + fromRect.width / 2 : fromRect.right) - frame.left;
          const y1 = (sameLane ? fromRect.bottom : fromRect.top + fromRect.height / 2) - frame.top;
          const x2 = (sameLane ? toRect.left + toRect.width / 2 : toRect.left) - frame.left;
          const y2 = (sameLane ? toRect.top : toRect.top + toRect.height / 2) - frame.top;
          const d = sameLane
            ? `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
          next.push({ key: `${dependencyId}-${feature.id}`, d, warning: (laneRank.get(dependency.lane) ?? 3) > (laneRank.get(feature.lane) ?? 3) });
        }
      }
      setPaths(next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(graph);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [props.features]);

  if (props.features.length === 0) return <div className="roadmap-empty">
    <h3>No feature connections yet</h3>
    <p>Add planning features and their dependencies to see how work is related.</p>
    <Link href={`/initiatives/${props.initiativeId}/backlog`}>Open full feature backlog →</Link>
  </div>;
  return <div className="roadmap-stage roadmap-connections-stage">
    <div className="roadmap-stage-main">
      <div className="roadmap-connections-heading"><span aria-hidden>◇</span><h2>Relationship preview</h2></div>
      <div className="roadmap-info"><span aria-hidden>ⓘ</span> This map is read-only. Edit feature dependencies in the full feature backlog.</div>
      <div className="roadmap-graph-surface">
        <span className="roadmap-eyebrow">Read-only preview</span>
        <div ref={graphRef} className="roadmap-graph">
          <svg className="roadmap-graph-lines" aria-hidden="true"><defs><marker id="roadmap-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#6960b8" /></marker><marker id="roadmap-arrow-warning" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#d39a24" /></marker></defs>
            {paths.map((path) => <path key={path.key} d={path.d} fill="none" stroke={path.warning ? "#d39a24" : "#6960b8"} strokeWidth="2" markerEnd={path.warning ? "url(#roadmap-arrow-warning)" : "url(#roadmap-arrow)"} />)}
          </svg>
          {lanes.filter((lane) => props.features.some((feature) => feature.lane === lane.id)).map((lane) => <section className={`roadmap-graph-lane ${lane.id === "unscheduled" ? "is-unscheduled" : ""}`} key={lane.id}><h3>{lane.name}</h3>
            {dependencyFirst(props.features.filter((feature) => feature.lane === lane.id)).map((feature) => <button type="button" data-feature-id={feature.id} key={feature.id} className={`roadmap-graph-node ${feature.id === selectedId ? "is-selected" : ""}`} onClick={() => { setSelectedId(feature.id); setMobileOpen(true); }}>{feature.name}</button>)}
          </section>)}
        </div>
        <Link className="roadmap-backlog-link" href={`/initiatives/${props.initiativeId}/backlog`}>Open full feature backlog ↗</Link>
      </div>
    </div>
    {selected && <aside className={`roadmap-detail roadmap-connection-detail ${mobileOpen ? "is-mobile-open" : ""}`} aria-label={`${selected.name} relationships`}>
      <button type="button" className="roadmap-detail-close" aria-label="Close connection details" onClick={() => { setMobileOpen(false); setSelectedId(null); }}>×</button>
      <h2>Selected relationship</h2><h3>{selected.name}</h3>
      <section><h4>Depends on</h4>{dependsOn.length ? dependsOn.map((feature) => <p key={feature.id}>{feature.name}</p>) : <p>None recorded</p>}</section>
      <section><h4>Used by</h4>{usedBy.length ? usedBy.map((feature) => <p key={feature.id}>{feature.name}</p>) : <p>None recorded</p>}</section>
      <section><h4>Planning placement</h4><span className="roadmap-placement-pill">{laneLabel(selected.lane)}</span></section>
      {selected.dependencyWarnings.length > 0 && <div className="roadmap-warning" role="note">{selected.dependencyWarnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
    </aside>}
  </div>;
}
