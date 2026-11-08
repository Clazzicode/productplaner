import { db } from "@/lib/db";

// Compatibility stage labels and next-action recommendations only.
// Viewing planning work never depends on generation, a release or a sprint.
// Manual delivery records describe planning context; explicit commitment and
// approval evidence are reported separately by planning/readiness.ts.

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

/** Short, human label for the current stage — the "where things stand today"
 * half of a progress widget, paired with `nextAction.label` for "what's next". */
export const STAGE_LABEL: Record<LifecycleStage, string> = {
  no_initiative: "No initiative yet",
  initiative_no_plan: "Planning in progress",
  plan_generated_no_release: "Generated forecast available",
  release_no_sprint: "Delivery planning in progress",
  active_execution: "Delivery context recorded",
};

function actionFor(key: NextActionKey, initiativeId: string | null): NextAction {
  switch (key) {
    case "CREATE_INITIATIVE":
      return { key, label: "Create Initiative", href: "/initiatives/new" };
    case "GENERATE_PLAN":
      return { key, label: "Develop planning work", href: `/initiatives/${initiativeId}/overview` };
    case "CREATE_RELEASE":
      return { key, label: "Review delivery readiness", href: `/initiatives/${initiativeId}/workspace/release-readiness` };
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
