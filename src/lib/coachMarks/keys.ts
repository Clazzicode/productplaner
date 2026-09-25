// Coach mark copy registry (directive §4 "Experienced": "Use coach marks to
// explain: Projects, Initiatives, Import, Roadmap, Planning Workspace,
// Sprints/Releases, Research/Intelligence, Integrations"). Short and
// dismissible by design — this is the one place their text lives, so the
// account-menu "Replay Product Tour" action and every anchor point stay in
// sync with the same list.
//
// Research/Intelligence has no anchored surface yet (directive §37: research
// workflow is a later phase) — omitted rather than pointed at nothing.

export type CoachMarkKey =
  | "projects"
  | "initiatives"
  | "roadmap"
  | "planning_workspace"
  | "sprints_releases"
  | "integrations";

export interface CoachMarkCopy {
  title: string;
  body: string;
}

export const COACH_MARKS: Record<CoachMarkKey, CoachMarkCopy> = {
  projects: {
    title: "Projects",
    body: "A Project holds the context shared across its initiatives — budget, team, constraints. Create one per effort that might contain several initiatives.",
  },
  initiatives: {
    title: "Initiatives",
    body: "Each Initiative is one plan that gets generated — roadmap through acceptance criteria. A Project can hold more than one.",
  },
  roadmap: {
    title: "Roadmap",
    body: "The generated roadmap, organized into phases. Click any feature for why it was placed where it was.",
  },
  planning_workspace: {
    title: "Planning Workspace",
    body: "Features decompose into epics, stories, and acceptance criteria here — all traceable back to your intake answers.",
  },
  sprints_releases: {
    title: "Sprints & Releases",
    body: "Capacity-aware sprint packing and release grouping, recomputed whenever your assumptions change.",
  },
  integrations: {
    title: "Integrations",
    body: "Connect demo providers to see what a live sync would look like — no real credentials required yet.",
  },
};

export const COACH_MARK_KEYS = Object.keys(COACH_MARKS) as CoachMarkKey[];
