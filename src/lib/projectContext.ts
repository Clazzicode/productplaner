// Account/workspace -> Project -> Initiative restructure. Project now owns
// budget/averageHourlyRate/targetLaunchDate; Initiative only keeps an
// override for each (directive §9: "ask only initiative-specific questions
// ... unless the initiative overrides them"). Every call site that used to
// read Initiative.budget/averageHourlyRate/targetLaunchDate directly must
// resolve through here instead — never read the override columns raw.

export interface ProjectEconomics {
  budget: number | null;
  averageHourlyRate: number | null;
  targetLaunchDate: Date | null;
}

export interface InitiativeEconomicsOverride {
  budgetOverride: number | null;
  averageHourlyRateOverride: number | null;
  targetLaunchDateOverride: Date | null;
}

export interface ResolvedInitiativeEconomics {
  budget: number | null;
  averageHourlyRate: number | null;
  targetLaunchDate: Date | null;
}

/** Override-if-set, inherit-from-Project-if-null — the one place this
 * resolution happens, so every workspace/dashboard/cost-model call site
 * stays consistent. Use this when a caller needs all three; the single-field
 * helpers below exist for callers (mostly dashboards) that only select one
 * field and don't want to fetch the other two just to satisfy this shape. */
export function resolveInitiativeEconomics(
  initiative: InitiativeEconomicsOverride,
  project: ProjectEconomics,
): ResolvedInitiativeEconomics {
  return {
    budget: initiative.budgetOverride ?? project.budget,
    averageHourlyRate: initiative.averageHourlyRateOverride ?? project.averageHourlyRate,
    targetLaunchDate: initiative.targetLaunchDateOverride ?? project.targetLaunchDate,
  };
}

export function resolveTargetLaunchDate(
  initiative: { targetLaunchDateOverride: Date | null },
  project: { targetLaunchDate: Date | null },
): Date | null {
  return initiative.targetLaunchDateOverride ?? project.targetLaunchDate;
}

export function resolveBudget(
  initiative: { budgetOverride: number | null },
  project: { budget: number | null },
): number | null {
  return initiative.budgetOverride ?? project.budget;
}

export function resolveAverageHourlyRate(
  initiative: { averageHourlyRateOverride: number | null },
  project: { averageHourlyRate: number | null },
): number | null {
  return initiative.averageHourlyRateOverride ?? project.averageHourlyRate;
}
