import { notFound } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import RoadmapToolbar from "@/components/workspace/RoadmapToolbar";
import RoadmapViewSwitcher from "@/components/workspace/RoadmapViewSwitcher";
import RoadmapPlanningView, { type PlanningFeature } from "@/components/workspace/RoadmapPlanningView";
import RoadmapMilestonesView from "@/components/workspace/RoadmapMilestonesView";
import RoadmapConnectionsView from "@/components/workspace/RoadmapConnectionsView";
import TimelineRoadmap from "@/components/workspace/timeline/TimelineRoadmap";
import type { ClientRoadmapTimelineData, ClientTimelineFeature } from "@/lib/roadmap/loadRoadmapTimelineData";

export const dynamic = "force-dynamic";

const names = [
  "Guided setup checklist", "In-app product tours", "Saved views & filters",
  "Bulk request actions", "Advanced reporting & exports", "User group administration",
  "API rate limit controls", "Audit activity log", "Custom notification rules",
  "Data retention controls", "Environment management",
];
const laneByIndex = ["now", "now", "now", "next", "next", "next", "later", "later", "unscheduled", "unscheduled", "unscheduled"];
const dependencies: Record<number, number[]> = { 0: [2], 1: [0], 3: [0], 4: [0], 6: [4] };
const features: PlanningFeature[] = names.map((name, index) => ({
  id: `preview-feature-${index}`, name,
  description: index === 0 ? "Help new users get to value faster with a step-by-step setup checklist that guides them through the key configuration steps." : `Planning context for ${name.toLowerCase()}.`,
  backlogLane: laneByIndex[index], backlogRevision: 1,
  releaseId: index < 3 ? "foundation" : index < 6 ? "adoption" : null,
  businessValue: index === 0 || index === 3 || index === 4 ? "high" : "medium",
  riskLevel: index === 6 || index === 9 ? "medium" : "low",
  dependencyCount: dependencies[index]?.length ?? 0,
  dependencyWarnings: index === 0 ? ["Review dependency order before delivery commitment."] : [],
  defectCount: 0, blockerCount: index === 3 ? 1 : 0, qualityRisk: "low",
}));
const releases = [
  { id: "foundation", label: "Foundation release", targetDate: "2026-12-31T00:00:00.000Z", cadence: "monthly", featureCount: 3, defectCount: 0, blockerCount: 0, qualityRisk: "low" as const },
  { id: "adoption", label: "Adoption release", targetDate: "2027-02-28T00:00:00.000Z", cadence: "monthly", featureCount: 3, defectCount: 1, blockerCount: 1, qualityRisk: "high" as const },
  { id: "expansion", label: "Expansion release", targetDate: "2027-04-30T00:00:00.000Z", cadence: "monthly", featureCount: 2, defectCount: 0, blockerCount: 0, qualityRisk: "medium" as const },
];
const dates: Record<number, [string, string, "sprints" | "phase_range"]> = {
  0: ["2026-11-04", "2027-01-10", "sprints"], 1: ["2026-12-02", "2027-01-24", "sprints"],
  2: ["2026-12-09", "2027-02-15", "phase_range"], 3: ["2027-01-08", "2027-02-20", "sprints"],
  4: ["2027-01-14", "2027-02-28", "phase_range"],
};
function timelineFeature(index: number): ClientTimelineFeature {
  const date = dates[index];
  return {
    id: `preview-feature-${index}`, capabilityId: `preview-feature-${index}`, title: names[index],
    description: features[index].description, phaseNumber: index < 3 ? 1 : 2,
    phaseName: index < 3 ? "Phase 1 · Foundation" : "Phase 2 · Adoption", isMvp: index < 3,
    businessValue: features[index].businessValue, riskLevel: features[index].riskLevel,
    start: date ? `${date[0]}T00:00:00.000Z` : null, end: date ? `${date[1]}T00:00:00.000Z` : null,
    scheduleSource: date?.[2] ?? "unscheduled", health: null, epicCount: 1, storyCount: 3,
    dependsOnNames: (dependencies[index] ?? []).map((id) => names[id]),
    dependedOnByNames: Object.entries(dependencies).filter(([, ids]) => ids.includes(index)).map(([id]) => names[Number(id)]),
    dependencyWarnings: features[index].dependencyWarnings, defectCount: features[index].defectCount,
    blockerCount: features[index].blockerCount, qualityRisk: features[index].qualityRisk,
    releaseId: features[index].releaseId, releaseName: releases.find((release) => release.id === features[index].releaseId)?.label ?? null,
    releaseTargetDate: releases.find((release) => release.id === features[index].releaseId)?.targetDate ?? null,
    sprintRange: date?.[2] === "sprints" ? "Sprint 1–2" : null,
  };
}
const timelineData: ClientRoadmapTimelineData = {
  available: true, unavailableReason: null,
  phases: [
    { phaseNumber: 1, name: "Phase 1 · Foundation", features: [0, 1, 2].map(timelineFeature) },
    { phaseNumber: 2, name: "Phase 2 · Adoption", features: [3, 4].map(timelineFeature) },
  ],
  unscheduled: [5, 6, 7, 8, 9, 10].map(timelineFeature),
  releases,
  axisStart: "2026-11-01T00:00:00.000Z", axisEnd: "2027-04-30T00:00:00.000Z",
};

export default function RoadmapVisualPreview() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <div className="roadmap-visual-preview"><AppShell signedIn canManageWorkspace userName="Jordan Sample" accessLevel="standard_user"
    initiatives={[{ id: "guided-planning-po-roadmap", name: "Product Owner MVP Roadmap", status: "generated", canEdit: false, hasWorkspace: true, project: { id: "preview-project", name: "Guided Planning" }, syncConnections: [] }]}>
    <div className="roadmap-route-frame">
      <details className="roadmap-workspace-tools"><summary>Workspace context <span aria-hidden>⌄</span></summary><div className="roadmap-workspace-tools-content"><strong>Guided Planning</strong><p>Design preview only · no saved changes</p></div></details>
      <RoadmapToolbar title="Roadmap" description={<>Guided Planning / Product Owner MVP Roadmap</>}>
        <RoadmapViewSwitcher
          planning={<RoadmapPlanningView initiativeId="guided-planning-po-roadmap" features={features} releases={releases} canEdit={false} />}
          timeline={<TimelineRoadmap initiativeId="guided-planning-po-roadmap" data={timelineData} />}
          milestones={<RoadmapMilestonesView initiativeId="guided-planning-po-roadmap" releases={releases} features={features.map((feature) => ({ id: feature.id, title: feature.name, releaseId: feature.releaseId }))} />}
          connections={<RoadmapConnectionsView initiativeId="guided-planning-po-roadmap" features={features.map((feature, index) => ({ id: feature.id, name: feature.name, lane: feature.backlogLane, dependsOnIds: (dependencies[index] ?? []).map((id) => features[id].id), dependencyWarnings: feature.dependencyWarnings }))} />}
        />
      </RoadmapToolbar>
    </div>
  </AppShell></div>;
}
