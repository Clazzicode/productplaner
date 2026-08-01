// Methodology profiles — each axis is a real, testable difference in engine
// behavior (roadmap shape, lock strictness, sprint model), not just a label.
// Kept separate from constants.ts since this is behavior configuration, not a
// scoring/cost rule table.

import type { Methodology } from "./types";

export interface MethodologyProfile {
  id: Methodology;
  label: string;
  /** phased_mvp_gate: MVP/value-based 3-phase roadmap (today's behavior).
   *  continuous_backlog: one priority-ordered backlog, no MVP gate. */
  roadmapMode: "phased_mvp_gate" | "continuous_backlog";
  /** strict_sequence: layers lock in order (FR-12, today's behavior).
   *  unordered: any layer can lock any time — no rigid phase-gate ceremony. */
  lockGating: "strict_sequence" | "unordered";
  /** discrete: fixed-length sprints (today's behavior).
   *  continuous_flow: no sprint numbers; throughput/cycle-time framing. */
  sprintMode: "discrete" | "continuous_flow";
  /** always_flexible: sprints/releases editable regardless of waterfall lock
   *  state (today's behavior). locked_after_baseline: once the full baseline
   *  is approved, sprints/releases freeze too — a real waterfall schedule. */
  agileLayerGate: "always_flexible" | "locked_after_baseline";
}

export const METHODOLOGY_PROFILES: Record<Methodology, MethodologyProfile> = {
  hybrid: {
    id: "hybrid",
    label: "Hybrid Waterfall",
    roadmapMode: "phased_mvp_gate",
    lockGating: "strict_sequence",
    sprintMode: "discrete",
    agileLayerGate: "always_flexible",
  },
  agile_scrum: {
    id: "agile_scrum",
    label: "Agile / Scrum",
    roadmapMode: "continuous_backlog",
    lockGating: "unordered",
    sprintMode: "discrete",
    agileLayerGate: "always_flexible",
  },
  waterfall: {
    id: "waterfall",
    label: "Waterfall",
    roadmapMode: "phased_mvp_gate",
    lockGating: "strict_sequence",
    sprintMode: "discrete",
    agileLayerGate: "locked_after_baseline",
  },
  kanban: {
    id: "kanban",
    label: "Kanban",
    roadmapMode: "phased_mvp_gate",
    lockGating: "strict_sequence",
    sprintMode: "continuous_flow",
    agileLayerGate: "always_flexible",
  },
};

const KNOWN: readonly Methodology[] = ["hybrid", "agile_scrum", "waterfall", "kanban"];

/** Collapses qualifying's "not_sure" (and anything unrecognized) to hybrid. */
export function resolveMethodology(raw: string | null | undefined): Methodology {
  return (KNOWN as readonly string[]).includes(raw ?? "") ? (raw as Methodology) : "hybrid";
}

export function profileFor(raw: string | null | undefined): MethodologyProfile {
  return METHODOLOGY_PROFILES[resolveMethodology(raw)];
}
