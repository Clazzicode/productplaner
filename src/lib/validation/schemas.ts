import { z } from "zod";

// Zod schemas for API payloads. These also carry the enum constraints that
// the SQLite schema can't express natively.

export const qualifyingSchema = z.object({
  role: z.enum([
    "senior_pm",
    "product_owner",
    "business_analyst",
    "project_manager",
    "scrum_master",
    "founder_first_timer",
    "executive_stakeholder",
  ]),
  experienceLevel: z.enum(["first_time", "some_experience", "experienced", "expert"]),
  teamComposition: z.enum(["solo", "small_team", "multiple_teams"]),
  productType: z.enum(["software_product", "non_product"]),
  executionTool: z.enum(["jira", "azure_devops", "aha", "other", "none"]),
  statedMethodology: z.enum(["hybrid", "agile_scrum", "waterfall", "kanban", "not_sure"]),
});

// Directive item 3: experience level must be changeable later in Settings.
// Reuses qualifyingSchema's own enum rather than redeclaring it, so the two
// can never drift apart.
export const qualifyingExperienceLevelPatchSchema = z.object({
  experienceLevel: qualifyingSchema.shape.experienceLevel,
});

// Account/workspace -> Project -> Initiative restructure: budget/target date/
// rate now live on Project (shared across its initiatives); an Initiative may
// still override any of the three (see initiativeOverridesPatchSchema below)
// but no longer sets them directly at creation.
export const projectCreateSchema = z.object({
  name: z.string().trim().min(3, "Give the project a name (3+ characters)."),
  description: z.string().trim().default(""),
  goal: z.string().trim().default(""),
  targetLaunchDate: z.coerce.date().nullable().optional(),
  budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
  averageHourlyRate: z.number().min(1).max(5000).optional(),
  planningApproach: z.string().trim().default(""),
});

export const projectPatchSchema = z
  .object({
    name: z.string().trim().min(3).optional(),
    description: z.string().trim().optional(),
    goal: z.string().trim().optional(),
    targetLaunchDate: z.coerce.date().nullable().optional(),
    budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
    averageHourlyRate: z.number().min(1).max(5000).optional(),
    planningApproach: z.string().trim().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

// `projectId` is optional: the Phase 2 Project-picker UI passes one to attach
// a new Initiative to an existing Project (reusing its shared context); until
// that UI exists, omitting it auto-creates a fresh, clean Project (directive
// §6 — a new Project inherits nothing from any other) from the same
// name/budget/rate/date fields this endpoint accepted directly before the
// Project layer existed, so the existing intake flows keep working unchanged.
export const roadmapStatusEntityTypeSchema = z.enum([
  "project",
  "initiative",
  "feature",
  "epic",
  "story",
  "sprint",
  "release",
]);

export const roadmapStatusSetSchema = z.object({
  color: z.enum(["green", "yellow", "red"]),
  reason: z.string().trim().max(500).default(""),
  // "system" only when accepting a recommendation the server itself computed
  // and echoed back — the route re-validates this, never trusts it blindly.
  source: z.enum(["manual", "system"]).default("manual"),
});

export const decisionCreateSchema = z.object({
  title: z.string().trim().min(3, "Give the decision a short title (3+ characters)."),
  description: z.string().trim().default(""),
  initiativeId: z.string().min(1).nullable().optional(),
});

export const riskCreateSchema = z.object({
  description: z.string().trim().min(3, "Describe the risk (3+ characters)."),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  initiativeId: z.string().min(1).nullable().optional(),
});

export const initiativeCreateSchema = z.object({
  projectId: z.string().min(1).optional(),
  name: z.string().trim().min(3, "Give the initiative a name (3+ characters)."),
  description: z.string().trim().default(""),
  intakeMethod: z.enum(["guided", "import", "use_project_context", "connect"]).nullable().optional(),
  targetLaunchDate: z.coerce.date().nullable().optional(),
  budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
  averageHourlyRate: z.number().min(1).max(5000).optional(),
});

export const initiativePatchSchema = z
  .object({
    name: z.string().trim().min(3).optional(),
    description: z.string().trim().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

// Initiative-specific override of a Project-level economic field — null
// explicitly clears the override back to inheriting the Project's value.
export const initiativeOverridesPatchSchema = z
  .object({
    targetLaunchDateOverride: z.coerce.date().nullable().optional(),
    budgetOverride: z.number().min(0).max(1_000_000_000).nullable().optional(),
    averageHourlyRateOverride: z.number().min(1).max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const intakePatchSchema = z.object({
  problemStatement: z.string().optional(),
  targetCustomer: z.string().optional(),
  outcomeStatement: z.string().optional(),
  outcomeMetric: z.string().optional(),
  teamSize: z.number().int().min(1).max(200).nullable().optional(),
  sprintLengthWeeks: z.number().int().min(1).max(4).optional(),
  velocityPerPersonPerSprint: z.number().min(0.5).max(40).optional(),
  capacityBufferPercent: z.number().int().min(0).max(90).optional(),
  hoursPerSprintPerMember: z.number().min(1).max(400).optional(),
  utilizationRatePercent: z.number().int().min(10).max(100).optional(),
  hoursPerStoryPoint: z.number().min(1).max(40).optional(),
  historicalVelocityPoints: z.number().min(0).max(1000).nullable().optional(),
});

// Capacity/cost assumptions stay editable after generation (§29 recalculation
// inputs) — unlike intake answers, which are permanent (FR-06).
export const assumptionsPatchSchema = z
  .object({
    averageHourlyRate: z.number().min(1).max(5000).optional(),
    budget: z.number().min(0).max(1_000_000_000).nullable().optional(),
    targetLaunchDate: z.coerce.date().nullable().optional(),
    utilizationRatePercent: z.number().int().min(10).max(100).optional(),
    capacityBufferPercent: z.number().int().min(0).max(90).optional(),
    hoursPerStoryPoint: z.number().min(1).max(40).optional(),
    hoursPerSprintPerMember: z.number().min(1).max(400).optional(),
    historicalVelocityPoints: z.number().min(0).max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export const effortSizeSchema = z.enum(["xs", "s", "m", "l", "xl"]);
export const businessValueSchema = z.enum(["very_low", "low", "medium", "high", "critical"]);
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const mvpImportanceSchema = z.enum([
  "required_for_mvp",
  "strongly_preferred",
  "useful_not_required",
  "future_enhancement",
  "optional",
]);

const factorScore = z.number().int().min(1).max(5).nullable().optional();

export const capabilityUpsertSchema = z.object({
  name: z.string().trim().min(3, "Name the capability (3+ characters)."),
  description: z.string().trim().default(""),
  isMvp: z.boolean(),
  effortSize: effortSizeSchema,
  businessValue: businessValueSchema,
  riskLevel: riskLevelSchema.default("medium"),
  mvpImportance: mvpImportanceSchema.nullable().optional(),
  customerImpactScore: factorScore,
  revenueImpactScore: factorScore,
  strategicAlignmentScore: factorScore,
  riskComplianceScore: factorScore,
  dependsOn: z.array(z.string()).default([]),
});

// Document Import & Approved Context (directive §3). Scalar fact fieldKeys
// the AI's generic `items[]` array may propose — "feature" and "risk" are
// deliberately NOT here: they arrive via their own typed arrays below
// (features/risks), since they're structured objects, not single string
// values, and get their ContextItem.fieldKey ("feature"/"risk") assigned by
// the caller from which array they came from, not from the model.
// "dependency"/"assumption" are valid extraction targets but are never
// crystallized into a real relation (see src/lib/context/crystallize.ts) —
// approving one is traceability-only, a deliberate scope cut.
export const contextExtractionFieldKeySchema = z.enum([
  "project_name",
  "description",
  "goal",
  "budget",
  "projected_go_live",
  "team",
  "constraints",
  "stakeholders",
  "initiative_name",
  "initiative_goal",
  "success_measure",
  "initiative_target_date",
  "dependency",
  "assumption",
]);
export const contextExtractionScopeSchema = z.enum(["project", "initiative"]);
export const contextItemKindSchema = z.enum(["explicit", "interpretation"]);

// Strict — the model's output is untrusted, but unlike the old lenient
// .catch()-per-field drafts (which silently substituted defaults for
// malformed pieces), a malformed item here is dropped whole, item-by-item,
// by the caller (src/lib/ai/actions/documentUnderstanding.ts, via
// .safeParse() per raw array element) — never schema-swallowed silently.
export const contextExtractionItemSchema = z.object({
  fieldKey: contextExtractionFieldKeySchema,
  scope: contextExtractionScopeSchema,
  kind: contextItemKindSchema,
  value: z.string().trim().min(1).max(2000),
  sourceChunkIndex: z.number().int().min(0),
});

export const contextExtractionFeatureSchema = z.object({
  name: z.string().trim().min(3),
  description: z.string().trim().optional(),
  isMvp: z.boolean().optional(),
  effortSize: effortSizeSchema.optional(),
  businessValue: businessValueSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  kind: contextItemKindSchema,
  sourceChunkIndex: z.number().int().min(0),
});

export const contextExtractionRiskSchema = z.object({
  description: z.string().trim().min(3),
  severity: riskLevelSchema.optional(),
  kind: contextItemKindSchema,
  sourceChunkIndex: z.number().int().min(0),
});

export const contextExtractionResultSchema = z.object({
  items: z.array(z.unknown()).optional().default([]),
  features: z.array(z.unknown()).optional().default([]),
  risks: z.array(z.unknown()).optional().default([]),
  warnings: z.array(z.string()).optional().default([]),
});
export type ContextExtractionItem = z.infer<typeof contextExtractionItemSchema>;
export type ContextExtractionFeature = z.infer<typeof contextExtractionFeatureSchema>;
export type ContextExtractionRisk = z.infer<typeof contextExtractionRiskSchema>;

export const artifactPatchSchema = z
  .object({
    title: z.string().trim().min(3).optional(),
    body: z.string().optional(),
    points: z.number().int().min(1).max(21).optional(),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined || v.points !== undefined, {
    message: "Nothing to update.",
  });

export const moveSprintSchema = z.object({
  sprintNumber: z.number().int().min(1),
});

export const layerTypeSchema = z.enum([
  "roadmap",
  "feature_hierarchy",
  "epics",
  "stories",
  "acceptance_criteria",
]);

export const syncActionSchema = z.object({
  action: z.enum(["connect", "sync"]),
});

export const recalculatePlanSchema = z.object({
  mode: z.enum(["full", "respect_locks"]),
  confirmApprovedImpact: z.boolean().optional(),
});

export const generateSchema = z.object({
  confirmApprovedImpact: z.boolean().optional(),
});

export const methodologySchema = z.enum(["hybrid", "agile_scrum", "waterfall", "kanban"]);

export const methodologyChangeSchema = z.object({
  methodology: methodologySchema,
});

export const movePhaseSchema = z.object({
  targetPhase: z.number().int().min(1).max(3),
});

// Guided-activation restructure: manual Create Release / Plan Sprint flows
// (src/app/api/initiatives/[id]/releases, src/app/api/releases/[releaseId]/sprints).
export const createReleaseSchema = z.object({
  phaseNumber: z.number().int().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  targetDate: z.coerce.date(),
});

export const createSprintSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  capacityPoints: z.number().min(0.1).max(10_000),
  storyIds: z.array(z.string()).default([]),
});

export const integrationActionSchema = z.object({
  action: z.enum(["connect", "configure", "sync", "disconnect", "reconnect"]),
  connectionId: z.string().optional(),
  initiativeId: z.string().nullable().optional(),
  workspaceName: z.string().trim().max(120).optional(),
  workspaceUrl: z.string().trim().max(300).optional(),
  projectKey: z.string().trim().max(20).optional(),
  projectName: z.string().trim().max(120).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

// AI Foundation (docs/V2-AI-FOUNDATION.md). The ANALYZE_INTAKE response
// shape — validated strictly (req #11), same posture as
// contextExtractionItemSchema above: a malformed response must fail loudly
// (or, for context extraction, be dropped item-by-item) rather than silently
// save partial/wrong data.
// Deliberately has no date/sprint/story-point/capacity field anywhere — the
// shape itself makes it structurally impossible for a saved AI response to
// carry a deterministic-calculation value (req #13).
export const analyzeIntakeResultSchema = z.object({
  summary: z.string().min(1),
  assumptions: z.array(z.string().min(1)).max(20),
  missingInformation: z.array(z.string().min(1)).max(20),
  risks: z.array(
    z.object({
      description: z.string().min(1),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ).max(20),
  recommendedRoadmapPhases: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().min(1),
      relatedCapabilities: z.array(z.string()).max(30).default([]),
    }),
  ).max(10),
  rationale: z.string().min(1),
});

export type AnalyzeIntakeResult = z.infer<typeof analyzeIntakeResultSchema>;

// ---------- AI Assist (Section 4) — tool-output schemas ----------
// Shared explainability fields every AI Assist candidate carries, captured
// at generation time (Section 4 §12: "do not generate explanations later
// from memory") — never a date/points/capacity/dependency-order field
// anywhere in this group, matching GLOBAL_PRODUCT_PLANNING_RULES.

const assistExplainFields = {
  why: z.string().min(1),
  informationUsed: z.string().min(1),
  assumptions: z.array(z.string().min(1)).max(10).default([]),
  sources: z.array(z.string().min(1)).max(10).default([]),
};

export const roadmapInsightResultSchema = z.object({
  title: z.string().min(1).max(120),
  synopsis: z.string().min(1).max(300),
  impact: z.string().min(1),
  ...assistExplainFields,
});
export type RoadmapInsightResult = z.infer<typeof roadmapInsightResultSchema>;

export const proposeFeatureCandidateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional(),
  isMvp: z.boolean().optional(),
  effortSize: effortSizeSchema.optional(),
  businessValue: businessValueSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  ...assistExplainFields,
});
export const proposeFeaturesResultSchema = z.object({
  candidates: z.array(proposeFeatureCandidateSchema).max(10),
});
export type ProposeFeatureCandidate = z.infer<typeof proposeFeatureCandidateSchema>;

const proposedAcSchema = z.object({
  existingArtifactLayerId: z.string().nullable(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1),
});
const proposedStorySchema = z.object({
  existingArtifactLayerId: z.string().nullable(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1),
  acceptanceCriteria: z.array(proposedAcSchema).max(6).default([]),
});
const proposedEpicSchema = z.object({
  existingArtifactLayerId: z.string().nullable(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1),
  stories: z.array(proposedStorySchema).max(10).default([]),
});
export const proposeStoryContentResultSchema = z.object({
  epics: z.array(proposedEpicSchema).max(6),
  ...assistExplainFields,
});
export type ProposeStoryContentResult = z.infer<typeof proposeStoryContentResultSchema>;

export const proposeDependencyCandidateSchema = z.object({
  fromCapabilityId: z.string().min(1),
  toCapabilityId: z.string().min(1),
  ...assistExplainFields,
});
export const proposeDependenciesResultSchema = z.object({
  candidates: z.array(proposeDependencyCandidateSchema).max(10),
});
export type ProposeDependencyCandidate = z.infer<typeof proposeDependencyCandidateSchema>;

export const proposeRiskCandidateSchema = z.object({
  description: z.string().trim().min(3).max(500),
  severity: riskLevelSchema.default("medium"),
  ...assistExplainFields,
});
export const proposeRisksResultSchema = z.object({
  candidates: z.array(proposeRiskCandidateSchema).max(10),
});
export type ProposeRiskCandidate = z.infer<typeof proposeRiskCandidateSchema>;

// Release/sprint recommendations deliberately have no date/points/capacity
// field — grouping-only content; the real date/points math stays engine- or
// user-owned. "Apply" pre-fills the existing manual release/sprint form
// rather than writing a date itself (src/lib/ai/assist/apply).
export const recommendReleasesResultSchema = z.object({
  recommendationType: z.enum(["new_grouping", "adjustment"]),
  targetReleaseId: z.string().nullable().default(null),
  suggestedName: z.string().trim().max(120).optional(),
  suggestedPhaseNumber: z.number().int().min(1).max(3).optional(),
  groupedCapabilityIds: z.array(z.string()).max(30).default([]),
  ...assistExplainFields,
});
export type RecommendReleasesResult = z.infer<typeof recommendReleasesResultSchema>;

export const recommendSprintsResultSchema = z.object({
  recommendationType: z.enum(["new_structure", "adjustment"]),
  targetSprintId: z.string().nullable().default(null),
  note: z.string().min(1),
  storyIdsToMove: z.array(z.string()).max(30).default([]),
  ...assistExplainFields,
});
export type RecommendSprintsResult = z.infer<typeof recommendSprintsResultSchema>;

export const recommendStatusResultSchema = z.object({
  impact: z.string().min(1),
  ...assistExplainFields,
});
export type RecommendStatusResult = z.infer<typeof recommendStatusResultSchema>;

// ---------- AI Assist — API request-body schemas ----------

export const aiAssistApplySchema = z.object({
  editedContent: z.record(z.string(), z.unknown()).optional(),
  confirmApprovedImpact: z.boolean().optional(),
});

export const aiAssistDismissSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const aiAssistMarkAppliedSchema = z.object({
  appliedEntityType: z.enum(["release", "sprint"]),
  appliedEntityId: z.string().min(1),
});

export const aiAssistContentTriggerSchema = z.object({
  featureId: z.string().min(1),
});

export const aiAssistStatusTriggerSchema = z.object({
  entityType: z.enum(["project", "initiative"]),
  entityId: z.string().min(1),
});
