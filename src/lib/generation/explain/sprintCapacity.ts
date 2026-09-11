import type { Explanation, ExplanationTerm } from "@/lib/explainability/types";
import { computeAvailableTeamHours, computeEffectiveCapacity, computeUsableTeamHours, type CapacityInputs } from "../cost";

const round = (n: number) => Math.round(n * 100) / 100;

function usesHoursModel(input: CapacityInputs): boolean {
  return (
    (input.hoursPerSprintPerMember ?? 0) > 0 &&
    (input.utilizationRatePercent ?? 0) > 0 &&
    (input.hoursPerStoryPoint ?? 0) > 0
  );
}

/** Explains a sprint's effective capacity (§10-§13) — which model was used
 * (hours vs. legacy points), the intermediate values, and whether historical
 * velocity capped the result. `capacity` always comes from
 * computeEffectiveCapacity itself, never re-derived. */
export function explainSprintCapacity(input: CapacityInputs): Explanation {
  const capacity = computeEffectiveCapacity(input);
  const historical = input.historicalVelocityPoints ?? 0;

  if (usesHoursModel(input)) {
    const available = computeAvailableTeamHours({
      teamSize: input.teamSize,
      hoursPerSprintPerMember: input.hoursPerSprintPerMember!,
      utilizationRatePercent: input.utilizationRatePercent!,
    });
    const usable = computeUsableTeamHours(available, input.capacityBufferPercent);
    const preHistoryCapacity = Math.max(1, Math.floor(usable / input.hoursPerStoryPoint!));
    const cappedByHistory = historical > 0 && historical < preHistoryCapacity;

    const terms: ExplanationTerm[] = [
      { label: "Team size", value: input.teamSize },
      { label: "Hours per member per sprint", value: input.hoursPerSprintPerMember! },
      { label: "Utilization", value: `${input.utilizationRatePercent}%` },
      { label: "Available team hours", value: round(available) },
      { label: "Capacity buffer", value: `${input.capacityBufferPercent}%` },
      { label: "Usable hours", value: round(usable) },
      { label: "Hours per story point", value: input.hoursPerStoryPoint! },
    ];

    return {
      summary: `${capacity} points of capacity per sprint${cappedByHistory ? `, capped by historical velocity (${historical} points)` : ""} — from ${input.teamSize} people × ${input.hoursPerSprintPerMember} hrs × ${input.utilizationRatePercent}% utilization, minus a ${input.capacityBufferPercent}% buffer, divided by ${input.hoursPerStoryPoint} hours per point.`,
      terms,
      formula: "floor((team size × hours/member/sprint × utilization%) × (1 − buffer%) ÷ hours per story point)",
    };
  }

  const preHistoryCapacity = input.teamSize * input.velocityPerPersonPerSprint * (1 - input.capacityBufferPercent / 100);
  const cappedByHistory = historical > 0 && historical < preHistoryCapacity;
  const terms: ExplanationTerm[] = [
    { label: "Team size", value: input.teamSize },
    { label: "Velocity per person per sprint", value: input.velocityPerPersonPerSprint },
    { label: "Capacity buffer", value: `${input.capacityBufferPercent}%` },
  ];

  return {
    summary: `${capacity} points of capacity per sprint${cappedByHistory ? `, capped by historical velocity (${historical} points)` : ""} — from ${input.teamSize} people × ${input.velocityPerPersonPerSprint} points/person/sprint, minus a ${input.capacityBufferPercent}% buffer.`,
    terms,
    formula: "team size × velocity per person per sprint × (1 − buffer%)",
  };
}
