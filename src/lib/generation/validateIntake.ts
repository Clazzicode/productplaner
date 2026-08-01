import {
  EFFORT_POINTS,
  MIN_CUSTOMER_CHARS,
  MIN_OUTCOME_CHARS,
  MIN_PROBLEM_CHARS,
} from "./constants";
import { computeEffectiveCapacity } from "./cost";
import { findCycle } from "./dependencyGraph";
import { isOversizedCapability } from "./scoring";
import type { IntakeFlag, IntakeInput, IntakeValidation } from "./types";

export function computeCapacityPoints(input: {
  teamSize: number;
  velocityPerPersonPerSprint: number;
  capacityBufferPercent: number;
}): number {
  return (
    input.teamSize *
    input.velocityPerPersonPerSprint *
    (1 - input.capacityBufferPercent / 100)
  );
}

/**
 * FR-05: real-time intake validation. Hard errors block generation;
 * warnings are surfaced but don't block. All messages in plain language.
 */
export function validateIntake(input: IntakeInput): IntakeValidation {
  const errors: IntakeFlag[] = [];
  const warnings: IntakeFlag[] = [];
  const caps = input.capabilities;
  const byId = new Map(caps.map((c) => [c.id, c]));

  if (input.problemStatement.trim().length < MIN_PROBLEM_CHARS) {
    errors.push({
      code: "problem_too_short",
      message: `Describe the problem you're solving in at least a sentence (${MIN_PROBLEM_CHARS}+ characters). Everything in the plan is anchored to this answer.`,
    });
  }
  if (input.targetCustomer.trim().length < MIN_CUSTOMER_CHARS) {
    errors.push({
      code: "customer_too_short",
      message:
        "Name your target customer — user stories and acceptance criteria are written from this persona's point of view.",
    });
  }
  if (input.outcomeStatement.trim().length < MIN_OUTCOME_CHARS) {
    errors.push({
      code: "outcome_too_short",
      message:
        "State the outcome you're trying to achieve — the roadmap and release plan are sequenced against it.",
    });
  }

  if (caps.length === 0) {
    errors.push({
      code: "no_capabilities",
      message:
        "Add at least one capability. Capabilities are the features your product needs — each becomes a branch of the plan.",
    });
  } else if (!caps.some((c) => c.isMvp)) {
    errors.push({
      code: "no_mvp",
      message:
        "Mark at least one capability as required for the MVP — Phase 1 of the roadmap and Release 1 are built from your MVP scope.",
    });
  }

  const cycleIds = findCycle(caps);
  if (cycleIds.length > 0) {
    const names = cycleIds.map((id) => `"${byId.get(id)?.name ?? id}"`).join(", ");
    errors.push({
      code: "dependency_cycle",
      message: `These capabilities depend on each other in a circle: ${names}. Break the loop by removing one of the dependencies — nothing can be sequenced first when everything waits on everything else.`,
    });
  }

  // Cross-phase conflict: an MVP capability depending on a non-MVP one.
  for (const cap of caps.filter((c) => c.isMvp)) {
    for (const depId of cap.dependsOn) {
      const dep = byId.get(depId);
      if (dep && !dep.isMvp) {
        errors.push({
          code: "mvp_depends_on_non_mvp",
          message: `"${cap.name}" is marked required for MVP but depends on "${dep.name}", which is not. Mark "${dep.name}" as MVP too, or remove the dependency.`,
        });
      }
    }
  }

  if (!Number.isFinite(input.teamSize) || input.teamSize < 1) {
    errors.push({
      code: "team_size_invalid",
      message: "Team size must be at least 1 person — capacity can't be computed without a team.",
    });
  }
  if (input.sprintLengthWeeks < 1 || input.sprintLengthWeeks > 4) {
    errors.push({
      code: "sprint_length_invalid",
      message: "Sprint length must be between 1 and 4 weeks.",
    });
  }
  if (!(input.velocityPerPersonPerSprint > 0)) {
    errors.push({
      code: "velocity_invalid",
      message: "Velocity per person per sprint must be greater than zero.",
    });
  }
  if (input.capacityBufferPercent < 0 || input.capacityBufferPercent > 90) {
    errors.push({
      code: "buffer_invalid",
      message: "Capacity buffer must be between 0% and 90%.",
    });
  }

  // Soft warnings
  if (input.outcomeMetric.trim().length === 0) {
    warnings.push({
      code: "no_outcome_metric",
      message:
        "No measurable metric was given for the outcome — the roadmap will use qualitative framing only.",
    });
  }
  if (errors.length === 0) {
    const capacity = computeEffectiveCapacity(input);
    for (const cap of caps) {
      if (EFFORT_POINTS[cap.effortSize] > capacity) {
        warnings.push({
          code: "capability_exceeds_sprint",
          message: `"${cap.name}" (${cap.effortSize.toUpperCase()}, ${EFFORT_POINTS[cap.effortSize]} points) is bigger than one sprint's capacity (${capacity.toFixed(1)} points). Its sprint will be over-allocated.`,
        });
      }
      if (isOversizedCapability(cap)) {
        warnings.push({
          code: "capability_too_broad",
          message: `"${cap.name}" is estimated at ${EFFORT_POINTS[cap.effortSize]} points and may be too broad. Consider splitting it into smaller capabilities before planning.`,
        });
      }
    }
  }

  return { errors, warnings };
}
