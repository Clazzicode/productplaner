import type { WorkingRole } from "@/lib/onboarding/types";
import type { BusinessValue, RiskLevel } from "@/lib/generation/types";
import type { HealthStatus } from "@/lib/generation/health";
import { ROLE_ROADMAP_COPY } from "./roleRoadmapCopy";

/**
 * Pure, role-aware view derivation over an already-generated plan — no
 * Prisma, no React. Mirrors timelineDerivation.ts's convention: DB-facing
 * assembly stays in the page, this module only reshapes data the engine
 * already produced. Working Role changes emphasis/grouping/vocabulary only,
 * never the underlying capabilities, cost, or dependency graph (same
 * governing principle as widgetRegistry.ts's ROLE_WIDGET_ORDER).
 */

export interface RoleRoadmapCapability {
  id: string;
  name: string;
  isMvp: boolean;
  businessValue: BusinessValue;
  riskLevel: RiskLevel;
  /** Capability.revenueImpactScore, passthrough — the PM/PO "revenue impact" business-value factor. */
  revenueImpactScore: number | null;
  /** Passthrough from the existing per-capability cost calc (§25). */
  estimatedCost: number;
  /** Passthrough only — never re-rendered as the protected dependency UI (plain names/lists elsewhere). */
  dependsOnNames: string[];
  /** Whether any of this capability's stories fall in an over-allocated sprint — feeds the SWOT Weaknesses bucket. */
  inOverAllocatedSprint: boolean;
}

export interface RoleRoadmapPhaseInput {
  phaseNumber: number;
  /** Real phase title (roadmap_phase.title), not a hardcoded PHASE_NAMES[n] — see dashboard/page.tsx assembly. */
  name: string;
  /** Start dates of sprints spanned by this phase, for quarter-label derivation. Empty when unscheduled. */
  sprintStartDates: Date[];
  capabilities: RoleRoadmapCapability[];
}

export interface RoleRoadmapInput {
  phases: RoleRoadmapPhaseInput[];
  cost: {
    estimatedInitiativeCost: number;
    budgetVariance: { amount: number; percent: number } | null;
    costHealth: HealthStatus | null;
  };
  scheduleHealth: HealthStatus;
  hasDependencyCycle: boolean;
  oversizedStoryCount: number;
  tooBroadCapabilityCount: number;
  /** From Release rows, passthrough — the closest existing "milestone-shaped" data. */
  milestones: { name: string; targetDate: Date; phaseNumber: number }[];
}

export interface RoleRoadmapPhaseView {
  phaseNumber: number;
  name: string;
  quarterLabel: string | null;
  items: RoleRoadmapCapability[];
}

export type ProductRoadmapView = {
  kind: "product";
  role: "product_management" | "product_owner";
  phases: RoleRoadmapPhaseView[];
  businessValueFraming: { label: string; factors: string[]; note: string };
  backlogReadiness: {
    oversizedStoryCount: number;
    tooBroadCapabilityCount: number;
    label: "ready" | "needs_refinement";
  };
};

export type ProjectRoadmapPhaseView = RoleRoadmapPhaseView & { themes: string[] };

export type ProjectRoadmapView = {
  kind: "project";
  role: "project_manager";
  phases: ProjectRoadmapPhaseView[];
  cost: RoleRoadmapInput["cost"];
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  sequencingNotes: string[];
  milestones: RoleRoadmapInput["milestones"];
};

export type RoleRoadmapView = ProductRoadmapView | ProjectRoadmapView;

/** Same quarter-labeling convention as timelineScale.ts's AxisMonth
 * ("Q1 2026", via Math.floor(month/3)+1), applied to a phase's earliest
 * spanned sprint start date. Null for an unscheduled phase — never fabricated. */
export function deriveQuarterLabel(sprintStartDates: Date[]): string | null {
  if (sprintStartDates.length === 0) return null;
  const earliest = sprintStartDates.reduce((min, d) => (d < min ? d : min), sprintStartDates[0]);
  const quarterNumber = Math.floor(earliest.getMonth() / 3) + 1;
  return `Q${quarterNumber} ${earliest.getFullYear()}`;
}

const PROJECT_PHASE_THEMES: string[][] = [
  ["Requirements", "Design", "Vendor dependency"],
  ["Build", "Integration", "Testing"],
  ["UAT", "Deployment", "Go-Live"],
];

/** Fixed, generic SDLC-stage template keyed by phase number — NOT derived
 * from the epic-archetype system (Core Implementation / Validation & Edge
 * Cases / Integration & Rollout), which doesn't map cleanly onto these
 * themes. Phase 1 -> Requirements/Design themes, phase 2 -> Build themes,
 * phase 3+ -> UAT/Deployment themes (collapses agile_scrum's unbounded
 * "Later N" windows into the final theme bucket). */
export function projectPhaseThemes(phaseNumber: number): string[] {
  const index = Math.min(Math.max(phaseNumber, 1), PROJECT_PHASE_THEMES.length) - 1;
  return PROJECT_PHASE_THEMES[index];
}

function buildSwot(input: RoleRoadmapInput): ProjectRoadmapView["swot"] {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  for (const phase of input.phases) {
    for (const cap of phase.capabilities) {
      const lowRisk = cap.riskLevel === "low" || cap.riskLevel === "medium";
      const highRisk = cap.riskLevel === "high" || cap.riskLevel === "critical";

      if (phase.phaseNumber === 1 && lowRisk && !cap.inOverAllocatedSprint) {
        strengths.push(`"${cap.name}" — on track for the MVP phase, ${cap.riskLevel} risk.`);
      }
      if (highRisk || cap.inOverAllocatedSprint) {
        weaknesses.push(
          cap.inOverAllocatedSprint
            ? `"${cap.name}" — scheduled in a sprint that's over capacity.`
            : `"${cap.name}" — ${cap.riskLevel} risk.`,
        );
      }
      if (phase.phaseNumber >= 2 && (cap.businessValue === "high" || cap.businessValue === "critical")) {
        opportunities.push(`"${cap.name}" — high business value, not yet in the current phase.`);
      }
    }
  }

  if (input.hasDependencyCycle) {
    threats.push(
      "A circular dependency exists between features — sequencing can't be fully resolved until it's broken.",
    );
  }
  if (input.cost.costHealth === "at_risk") {
    threats.push("Estimated cost is forecast to exceed budget.");
  }
  if (input.scheduleHealth === "at_risk") {
    threats.push("The schedule is at risk based on current sprint capacity.");
  }

  return { strengths, weaknesses, opportunities, threats };
}

function buildSequencingNotes(phases: RoleRoadmapPhaseInput[]): string[] {
  const { dependencySentence } = ROLE_ROADMAP_COPY.project_manager;
  const notes: string[] = [];
  for (const phase of phases) {
    for (const cap of phase.capabilities) {
      for (const blockerName of cap.dependsOnNames) {
        notes.push(dependencySentence(cap.name, blockerName));
      }
    }
  }
  return notes;
}

/** Shared by Product Manager and Product Owner — "closely connected"
 * experiences. Both now see backlog readiness (existing oversized-story /
 * too-broad-capability warnings, already computed elsewhere — no new
 * scoring), appended rather than shown in a visually distinct panel. */
export function deriveProductRoadmapView(
  role: "product_management" | "product_owner",
  input: RoleRoadmapInput,
): ProductRoadmapView {
  const copy = ROLE_ROADMAP_COPY[role];
  const needsRefinement = input.oversizedStoryCount > 0 || input.tooBroadCapabilityCount > 0;
  return {
    kind: "product",
    role,
    phases: input.phases.map((phase) => ({
      phaseNumber: phase.phaseNumber,
      name: phase.name,
      quarterLabel: deriveQuarterLabel(phase.sprintStartDates),
      items: phase.capabilities,
    })),
    businessValueFraming: copy.businessValueFraming,
    backlogReadiness: {
      oversizedStoryCount: input.oversizedStoryCount,
      tooBroadCapabilityCount: input.tooBroadCapabilityCount,
      label: needsRefinement ? "needs_refinement" : "ready",
    },
  };
}

export function deriveProjectRoadmapView(input: RoleRoadmapInput): ProjectRoadmapView {
  return {
    kind: "project",
    role: "project_manager",
    phases: input.phases.map((phase) => ({
      phaseNumber: phase.phaseNumber,
      name: phase.name,
      quarterLabel: deriveQuarterLabel(phase.sprintStartDates),
      themes: projectPhaseThemes(phase.phaseNumber),
      items: phase.capabilities,
    })),
    cost: input.cost,
    swot: buildSwot(input),
    sequencingNotes: buildSequencingNotes(input.phases),
    milestones: input.milestones,
  };
}

/** Entry point. Null/unset role falls back to Product Manager framing,
 * mirroring widgetRegistry.ts's own documented precedent for an unset role. */
export function deriveRoleRoadmapView(role: WorkingRole | null, input: RoleRoadmapInput): RoleRoadmapView {
  if (role === "project_manager") return deriveProjectRoadmapView(input);
  if (role === "product_owner") return deriveProductRoadmapView("product_owner", input);
  return deriveProductRoadmapView("product_management", input);
}
