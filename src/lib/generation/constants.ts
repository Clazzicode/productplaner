import type { BusinessValue, EffortSize } from "./types";

export const EFFORT_POINTS: Record<EffortSize, number> = {
  xs: 2,
  s: 3,
  m: 5,
  l: 8,
  xl: 13,
};

export const VALUE_SCORE: Record<BusinessValue, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const EFFORT_LABELS: Record<EffortSize, string> = {
  xs: "Extra small",
  s: "Small",
  m: "Medium",
  l: "Large",
  xl: "Extra large",
};

export const VALUE_LABELS: Record<BusinessValue, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

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
