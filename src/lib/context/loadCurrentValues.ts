import { db } from "@/lib/db";
import type { CurrentValueSnapshot } from "./conflictDetection";

// Document Import & Approved Context — shared by POST /api/documents/[id]/analyze
// (conflict detection) and GET /api/documents/[id]/context-items (gap
// detection for the review screen), so the two never drift on what "the
// current real value" means for a given scope.

export interface CurrentContextValues {
  /** For detectGaps() — the field's real display value, or null/undefined if unset. */
  display: Record<string, unknown>;
  /** For buildContextItems() — the same values, normalized for equality comparison. */
  snapshot: CurrentValueSnapshot;
}

export async function loadCurrentContextValues(params: {
  projectId: string;
  initiativeId: string | null;
}): Promise<CurrentContextValues> {
  const scalar: Record<string, string | undefined> = {};
  const display: Record<string, unknown> = {};
  let existingFeatureNames: string[] = [];

  if (params.initiativeId) {
    const initiative = await db.initiative.findUniqueOrThrow({
      where: { id: params.initiativeId },
      select: {
        name: true,
        targetLaunchDateOverride: true,
        intakeAnswerSet: {
          select: {
            outcomeStatement: true,
            outcomeMetric: true,
            capabilities: { select: { name: true } },
          },
        },
      },
    });
    scalar.initiative_name = initiative.name ? initiative.name.trim().toLowerCase() : undefined;
    scalar.initiative_goal = initiative.intakeAnswerSet?.outcomeStatement
      ? initiative.intakeAnswerSet.outcomeStatement.trim().toLowerCase()
      : undefined;
    scalar.success_measure = initiative.intakeAnswerSet?.outcomeMetric
      ? initiative.intakeAnswerSet.outcomeMetric.trim().toLowerCase()
      : undefined;
    scalar.initiative_target_date = initiative.targetLaunchDateOverride
      ? initiative.targetLaunchDateOverride.toISOString().slice(0, 10)
      : undefined;
    display.initiative_name = initiative.name || null;
    display.initiative_goal = initiative.intakeAnswerSet?.outcomeStatement || null;
    display.success_measure = initiative.intakeAnswerSet?.outcomeMetric || null;
    display.initiative_target_date = initiative.targetLaunchDateOverride;
    existingFeatureNames = initiative.intakeAnswerSet?.capabilities.map((c) => c.name) ?? [];
  } else {
    const project = await db.project.findUniqueOrThrow({
      where: { id: params.projectId },
      select: { name: true, description: true, goal: true, budget: true, targetLaunchDate: true },
    });
    scalar.project_name = project.name ? project.name.trim().toLowerCase() : undefined;
    scalar.description = project.description ? project.description.trim().toLowerCase() : undefined;
    scalar.goal = project.goal ? project.goal.trim().toLowerCase() : undefined;
    scalar.budget = project.budget != null ? String(project.budget) : undefined;
    scalar.projected_go_live = project.targetLaunchDate
      ? project.targetLaunchDate.toISOString().slice(0, 10)
      : undefined;
    display.project_name = project.name || null;
    display.description = project.description || null;
    display.goal = project.goal || null;
    display.budget = project.budget;
    display.projected_go_live = project.targetLaunchDate;
    // team/constraints/stakeholders are append-only lists (see
    // crystallize.ts) — never a single "current value," so gap detection
    // treats them as satisfied once at least one approved note exists.
    const raw = await db.project.findUniqueOrThrow({
      where: { id: params.projectId },
      select: { teamCompositionJson: true, constraintsJson: true, stakeholdersJson: true },
    });
    display.team = hasAnyNotes(raw.teamCompositionJson) ? "set" : null;
    display.constraints = hasNonEmptyArray(raw.constraintsJson) ? "set" : null;
    display.stakeholders = hasNonEmptyArray(raw.stakeholdersJson) ? "set" : null;
  }

  const existingRisks = await db.risk.findMany({
    where: { projectId: params.projectId, initiativeId: params.initiativeId },
    select: { description: true },
  });

  return {
    display,
    snapshot: { scalar, existingFeatureNames, existingRiskDescriptions: existingRisks.map((r) => r.description) },
  };
}

function hasAnyNotes(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as { notes?: unknown };
    return Array.isArray(parsed.notes) && parsed.notes.length > 0;
  } catch {
    return false;
  }
}

function hasNonEmptyArray(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
