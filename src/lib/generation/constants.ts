import type { BusinessValue, EffortSize, MvpImportance, RiskLevel } from "./types";

export const EFFORT_POINTS: Record<EffortSize, number> = {
  xs: 2,
  s: 3,
  m: 5,
  l: 8,
  xl: 13,
};

// §2 five-level business-value scale, scored 1–5. Ordering comparisons must
// use relative ranks only; phase placement checks labels explicitly (buildPlan).
export const VALUE_SCORE: Record<BusinessValue, number> = {
  very_low: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

// §2 weighted sub-factor scoring: each factor 1–5. Index signature keeps this
// structurally compatible with Record<string, number> (the shape resolved/
// stored weight overrides move around as) in both cast directions.
export interface ValueFactorWeights {
  [key: string]: number;
  customerImpact: number;
  revenueImpact: number;
  strategicAlignment: number;
  riskCompliance: number;
}

export const VALUE_FACTOR_WEIGHTS: ValueFactorWeights = {
  customerImpact: 0.3,
  revenueImpact: 0.3,
  strategicAlignment: 0.25,
  riskCompliance: 0.15,
} as const;

// §4 risk scale.
export const RISK_SCORE: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// §5 MVP importance scale.
export const MVP_IMPORTANCE_SCORE: Record<MvpImportance, number> = {
  required_for_mvp: 5,
  strongly_preferred: 4,
  useful_not_required: 3,
  future_enhancement: 2,
  optional: 1,
};

export const MVP_IMPORTANCE_LABELS: Record<MvpImportance, string> = {
  required_for_mvp: "Required for MVP",
  strongly_preferred: "Strongly preferred",
  useful_not_required: "Useful but not required",
  future_enhancement: "Future enhancement",
  optional: "Optional",
};

// §5 priority-score weights. Index signature keeps this structurally
// compatible with Record<string, number> in both cast directions.
export interface PriorityWeights {
  [key: string]: number;
  businessValue: number;
  mvpImportance: number;
  dependencyImportance: number;
  riskReduction: number;
}

export const PRIORITY_WEIGHTS: PriorityWeights = {
  businessValue: 0.45,
  mvpImportance: 0.25,
  dependencyImportance: 0.15,
  riskReduction: 0.15,
} as const;

// §9 story-point scale.
export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;

export const EFFORT_LABELS: Record<EffortSize, string> = {
  xs: "Extra small",
  s: "Small",
  m: "Medium",
  l: "Large",
  xl: "Extra large",
};

export const VALUE_LABELS: Record<BusinessValue, string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// §31 default prototype assumptions — used whenever the user does not provide
// a value, always labeled as assumptions in the UI, never as user data.
export const DEFAULT_ASSUMPTIONS = {
  sprintLengthWeeks: 2,
  utilizationRatePercent: 70,
  capacityBufferPercent: 15,
  hoursPerStoryPoint: 8,
  averageHourlyRate: 85,
  hoursPerSprintPerMember: 80,
  minimumCapabilities: 1,
  recommendedCapabilitiesMin: 3,
  recommendedCapabilitiesMax: 8,
} as const;

// §32 required prototype disclaimer, shown wherever estimates appear.
export const PROTOTYPE_DISCLAIMER =
  "Estimates are generated using configurable prototype assumptions. Story points are relative estimates and should not be treated as guaranteed hours, dates, or financial commitments. Teams should replace default assumptions with validated historical data when available.";

// How a capability decomposes, keyed by its effort size.
export const EPIC_TEMPLATE: Record<
  EffortSize,
  { epicCount: number; storiesPerEpic: number }
> = {
  xs: { epicCount: 1, storiesPerEpic: 2 },
  s: { epicCount: 1, storiesPerEpic: 2 },
  m: { epicCount: 2, storiesPerEpic: 3 },
  l: { epicCount: 3, storiesPerEpic: 3 },
  xl: { epicCount: 3, storiesPerEpic: 4 },
};

export const EPIC_NAME_SUFFIXES = [
  "Core Implementation",
  "Validation & Edge Cases",
  "Integration & Rollout",
] as const;

// Deterministic story "want" templates, one list per epic archetype,
// cycled by story index. "{cap}" is replaced with the feature title.
export const STORY_WANTS: string[][] = [
  // Core Implementation
  [
    "access {cap} from the main workspace",
    "complete the primary {cap} workflow end to end",
    "see my changes reflected immediately when working in {cap}",
    "pick up where I left off in {cap}",
  ],
  // Validation & Edge Cases
  [
    "see a clear, plain-language error when my input to {cap} is invalid",
    "be prevented from submitting incomplete data in {cap}",
    "recover my work if something goes wrong during {cap}",
    "confirm before any destructive action in {cap}",
  ],
  // Integration & Rollout
  [
    "use {cap} without re-entering data I have already provided elsewhere",
    "see {cap} reflected consistently across the rest of the product",
    "get in-context guidance the first time I use {cap}",
    "trust that {cap} keeps my existing data intact",
  ],
];

export const PHASE_NAMES: Record<number, string> = {
  1: "Phase 1 — MVP",
  2: "Phase 2 — Fast Follow",
  3: "Phase 3 — Later",
};

export const RELEASE_NAMES: Record<number, string> = {
  1: "Release 1 (MVP)",
  2: "Release 2 (Fast Follow)",
  3: "Release 3 (Later)",
};

export const MIN_PROBLEM_CHARS = 15;
export const MIN_CUSTOMER_CHARS = 5;
export const MIN_OUTCOME_CHARS = 10;
