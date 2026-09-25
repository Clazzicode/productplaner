import { db } from "@/lib/db";

// Guided-activation restructure. Centralized, pure lifecycle-state resolver —
// every screen that needs "what stage is this initiative at" or "what should
// the user do next" reads it from here, instead of re-deriving it locally
// (the old pattern: initiatives/[id]/dashboard/page.tsx and
// globalDashboardData.ts each hand-rolled their own display-only
// `nextAction` string). Pure/no I/O, same style as engine.ts's
// `determineRespectLocksBranch` — callers load the handful of DB facts and
// pass them in.
//
// `manualReleaseCount`/`manualSprintCount` count ONLY origin:"manual" rows.
// This is deliberate, not an oversight: pre-existing engine-auto-packed
// Release/Sprint rows (origin:"auto", the default for every row that existed
// before this restructure) never satisfy these gates, even for initiatives
// generated long ago — the new Create Release / Plan Sprint steps apply
// retroactively. See engine.ts's repackSprints/legacy-cleanup comments for
// what happens to those old auto rows once a prototype "graduates" to manual.
//
// The waterfall layer-lock ceremony (Roadmap/Features/Epics/Stories/
// Acceptance Criteria) that used to gate the step between "plan generated"
// and "release created" has been removed platform-wide (locking never made
// sense as a user-facing concept here) — a generated plan is immediately
// eligible for its first Release, no separate "review and lock the roadmap"
// stage in between. `src/lib/generation/locking.ts`'s lock/unlock machinery
// still exists but nothing calls it anymore; `LayerLock` rows just stay
// permanently unlocked.

export type LifecycleStage =
  | "no_initiative"
  | "initiative_no_plan"
  | "plan_generated_no_release"
  | "release_no_sprint"
  | "active_execution";

export type NextActionKey =
  | "CREATE_INITIATIVE"
  | "GENERATE_PLAN"
  | "CREATE_RELEASE"
  | "CREATE_SPRINT"
  | "OPERATIONAL_DASHBOARD";

export interface LifecycleInitiativeInput {
  id: string;
  status: string; // draft | intake_in_progress | generated
}

export interface LifecycleInput {
  initiative: LifecycleInitiativeInput | null;
  /** Release rows with origin:'manual' for this initiative's prototype. */
  manualReleaseCount: number;
  /** Sprint rows with origin:'manual' for this initiative's prototype. */
  manualSprintCount: number;
}

export interface NextAction {
  key: NextActionKey;
  label: string;
  href: string;
}

export interface LifecycleResolution {
  stage: LifecycleStage;
  nextAction: NextAction;
}

/** A 0-100 progress figure for the "plan completion" style widgets across the
 * per-initiative dashboard, global dashboard, admin dashboard, and Executive
 * Report — replaces the old locked-layer-count math (there are no more
 * layers to lock). Keyed on the same stage the resolver already computes, so
 * every one of those screens shows a consistent number. */
export const STAGE_PROGRESS_PERCENT: Record<LifecycleStage, number> = {
  no_initiative: 0,
  initiative_no_plan: 0,
  plan_generated_no_release: 33,
  release_no_sprint: 66,
  active_execution: 100,
};

/** Short, human label for the current stage — the "where things stand today"
 * half of a progress widget, paired with `nextAction.label` for "what's next". */
export const STAGE_LABEL: Record<LifecycleStage, string> = {
  no_initiative: "No initiative yet",
  initiative_no_plan: "Plan not generated",
  plan_generated_no_release: "Plan generated",
  release_no_sprint: "Release created",
  active_execution: "Fully active",
};

function actionFor(key: NextActionKey, initiativeId: string | null): NextAction {
  switch (key) {
    case "CREATE_INITIATIVE":
      return { key, label: "Create Initiative", href: "/initiatives/new" };
    case "GENERATE_PLAN":
      return { key, label: "Generate Plan", href: `/initiatives/${initiativeId}/intake` };
    case "CREATE_RELEASE":
      return { key, label: "Create First Release", href: `/initiatives/${initiativeId}/workspace/sprints` };
    case "CREATE_SPRINT":
      return { key, label: "Plan First Sprint", href: `/initiatives/${initiativeId}/workspace/sprints` };
    case "OPERATIONAL_DASHBOARD":
      return { key, label: "Go to Dashboard", href: `/initiatives/${initiativeId}/dashboard` };
  }
}

/**
 * The reference doc's next-best-action ladder, applied literally:
 *   no initiative -> generate plan -> create release -> create sprint ->
 *   operational dashboard.
 */
export function resolveLifecycleState(input: LifecycleInput): LifecycleResolution {
  const { initiative } = input;

  if (!initiative) {
    return { stage: "no_initiative", nextAction: actionFor("CREATE_INITIATIVE", null) };
  }
  if (initiative.status !== "generated") {
    return {
      stage: "initiative_no_plan",
      nextAction: actionFor("GENERATE_PLAN", initiative.id),
    };
  }
  if (input.manualReleaseCount === 0) {
    return {
      stage: "plan_generated_no_release",
      nextAction: actionFor("CREATE_RELEASE", initiative.id),
    };
  }
  if (input.manualSprintCount === 0) {
    return {
      stage: "release_no_sprint",
      nextAction: actionFor("CREATE_SPRINT", initiative.id),
    };
  }
  return {
    stage: "active_execution",
    nextAction: actionFor("OPERATIONAL_DASHBOARD", initiative.id),
  };
}

const EMPTY_INPUT: LifecycleInput = {
  initiative: null,
  manualReleaseCount: 0,
  manualSprintCount: 0,
};

/** Loads the DB facts `resolveLifecycleState` needs for one initiative. */
export async function loadLifecycleInput(initiativeId: string): Promise<LifecycleInput> {
  const row = await db.initiative.findUnique({
    where: { id: initiativeId },
    select: {
      id: true,
      status: true,
      prototype: {
        select: {
          releases: { where: { origin: "manual" }, select: { id: true } },
          sprints: { where: { origin: "manual" }, select: { id: true } },
        },
      },
    },
  });

  if (!row) return EMPTY_INPUT;

  return {
    initiative: { id: row.id, status: row.status },
    manualReleaseCount: row.prototype?.releases.length ?? 0,
    manualSprintCount: row.prototype?.sprints.length ?? 0,
  };
}
