// TS union types standing in for enums (SQLite/Prisma has no native enum support).

export type EffortSize = "xs" | "s" | "m" | "l" | "xl";
export type BusinessValue = "very_low" | "low" | "medium" | "high" | "critical";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type MvpImportance =
  | "required_for_mvp"
  | "strongly_preferred"
  | "useful_not_required"
  | "future_enhancement"
  | "optional";

export type LayerType =
  | "roadmap"
  | "feature_hierarchy"
  | "epics"
  | "stories"
  | "acceptance_criteria";

export type ArtifactType =
  | "roadmap"
  | "roadmap_phase"
  | "feature"
  | "epic"
  | "story"
  | "acceptance_criterion";

export const LAYER_SEQUENCE: LayerType[] = [
  "roadmap",
  "feature_hierarchy",
  "epics",
  "stories",
  "acceptance_criteria",
];

export const LAYER_LABELS: Record<LayerType, string> = {
  roadmap: "Roadmap",
  feature_hierarchy: "Feature Hierarchy",
  epics: "Epics",
  stories: "User Stories",
  acceptance_criteria: "Acceptance Criteria",
};

// Which waterfall lock-layer governs each artifact row type.
export const LAYER_FOR_ARTIFACT: Record<ArtifactType, LayerType> = {
  roadmap: "roadmap",
  roadmap_phase: "roadmap",
  feature: "feature_hierarchy",
  epic: "epics",
  story: "stories",
  acceptance_criterion: "acceptance_criteria",
};

export const ARTIFACT_TYPES_FOR_LAYER: Record<LayerType, ArtifactType[]> = {
  roadmap: ["roadmap", "roadmap_phase"],
  feature_hierarchy: ["feature"],
  epics: ["epic"],
  stories: ["story"],
  acceptance_criteria: ["acceptance_criterion"],
};

// ---------- Intake input (validated shape the engine consumes) ----------

export interface CapabilityInput {
  id: string;
  name: string;
  description: string;
  isMvp: boolean;
  effortSize: EffortSize;
  businessValue: BusinessValue;
  order: number;
  /** capability ids this one depends on (they must come first) */
  dependsOn: string[];
  /** §4 risk level — when absent (legacy fixtures) scoring falls back to legacy ordering */
  riskLevel?: RiskLevel;
  /** §5 optional override; derived from isMvp when null/absent */
  mvpImportance?: MvpImportance | null;
  /** §2 weighted score snapshot, present only when sub-factor scoring was used */
  businessValueScore?: number | null;
}

export interface IntakeInput {
  initiativeName: string;
  problemStatement: string; // Q1
  targetCustomer: string; // Q2
  outcomeStatement: string; // Q3
  outcomeMetric: string; // Q3 (optional metric)
  teamSize: number; // Q7
  sprintLengthWeeks: number; // Q7
  velocityPerPersonPerSprint: number; // Q7 legacy points model
  capacityBufferPercent: number; // Q7
  /** §10–12 hours model — supersedes the points model when all three are present */
  hoursPerSprintPerMember?: number;
  utilizationRatePercent?: number;
  hoursPerStoryPoint?: number;
  /** §13 optional — capacity uses min(estimated, historical) when provided */
  historicalVelocityPoints?: number | null;
  startDate: Date;
  capabilities: CapabilityInput[]; // Q4/Q5/Q6/Q8 live per-capability
}

// ---------- Pure generation output (persisted by the engine) ----------

export type AcKind = "happy" | "validation" | "edge";

export interface PlannedAC {
  kind: AcKind;
  title: string;
  body: string; // Given / When / Then
}

export interface PlannedStory {
  title: string;
  body: string; // full "As a ..., I want ..., so that ..." sentence
  points: number;
  persona: string;
  want: string;
  benefit: string;
  sprintNumber: number; // assigned by the sprint packer
  acs: PlannedAC[];
}

export interface PlannedEpic {
  title: string;
  body: string;
  stories: PlannedStory[];
}

export interface PlannedFeature {
  capabilityId: string;
  title: string;
  body: string;
  isMvp: boolean;
  epics: PlannedEpic[];
}

export interface PlannedPhase {
  phaseNumber: number; // 1 = MVP, 2 = Fast Follow, 3 = Later
  name: string;
  startDate: Date;
  endDate: Date;
  capabilityIds: string[];
  features: PlannedFeature[];
}

export interface PlannedSprint {
  sprintNumber: number;
  phaseNumber: number;
  startDate: Date;
  endDate: Date;
  capacityPoints: number;
  plannedPoints: number;
}

export interface PlannedRelease {
  order: number;
  name: string;
  phaseNumber: number;
  targetDate: Date;
}

export interface GeneratedPlan {
  capacityPoints: number;
  roadmapTitle: string;
  roadmapBody: string;
  phases: PlannedPhase[];
  sprints: PlannedSprint[];
  releases: PlannedRelease[];
}

// ---------- Validation flags (FR-05) ----------

export interface IntakeFlag {
  code: string;
  message: string;
}

export interface IntakeValidation {
  errors: IntakeFlag[];
  warnings: IntakeFlag[];
}
