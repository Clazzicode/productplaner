// FR-10: every artifact links back to the intake answers that produced it.
// This builds the human-readable entries the trace drawer shows per artifact.

export interface TraceEntry {
  key: string; // q1..q8
  label: string;
  answer: string;
}

export interface TraceIntakeView {
  problemStatement: string;
  targetCustomer: string;
  outcomeStatement: string;
  outcomeMetric: string;
  teamSize: number | null;
  sprintLengthWeeks: number;
  velocityPerPersonPerSprint: number;
  capacityBufferPercent: number;
  mvpCount: number;
  totalCount: number;
}

export interface TraceCapabilityView {
  name: string;
  isMvp: boolean;
  effortSize: string;
  businessValue: string;
  dependsOnNames: string[];
}

const QUESTION_LABELS: Record<string, string> = {
  q1: "Q1 — What problem are you solving?",
  q2: "Q2 — Who is the target customer?",
  q3: "Q3 — What outcome are you trying to achieve?",
  q4: "Q4 — Is this capability required for the MVP?",
  q5: "Q5 — What dependencies exist?",
  q6: "Q6 — What level of effort is required?",
  q7: "Q7 — What is the team's available capacity?",
  q8: "Q8 — What business value will this deliver?",
};

export function traceEntriesFor(
  traceAnswerKeys: string,
  intake: TraceIntakeView,
  capability?: TraceCapabilityView | null,
): TraceEntry[] {
  const keys = traceAnswerKeys.split(",").map((k) => k.trim()).filter(Boolean);
  return keys.map((key) => {
    let answer = "";
    switch (key) {
      case "q1":
        answer = intake.problemStatement;
        break;
      case "q2":
        answer = intake.targetCustomer;
        break;
      case "q3":
        answer = intake.outcomeMetric
          ? `${intake.outcomeStatement} (measured by: ${intake.outcomeMetric})`
          : intake.outcomeStatement;
        break;
      case "q4":
        answer = capability
          ? `"${capability.name}": ${capability.isMvp ? "required for MVP" : "post-MVP"}`
          : `${intake.mvpCount} of ${intake.totalCount} capabilities marked required for MVP`;
        break;
      case "q5":
        answer = capability
          ? capability.dependsOnNames.length > 0
            ? `"${capability.name}" depends on: ${capability.dependsOnNames.join(", ")}`
            : `"${capability.name}" has no dependencies`
          : "Dependencies mapped per capability";
        break;
      case "q6":
        answer = capability
          ? `"${capability.name}": effort ${capability.effortSize.toUpperCase()}`
          : "Effort sized per capability";
        break;
      case "q7":
        answer = `Team of ${intake.teamSize ?? "?"}, ${intake.sprintLengthWeeks}-week sprints, ${intake.velocityPerPersonPerSprint} pts/person/sprint, ${intake.capacityBufferPercent}% buffer`;
        break;
      case "q8":
        answer = capability
          ? `"${capability.name}": ${capability.businessValue} business value`
          : "Business value ranked per capability";
        break;
      default:
        answer = "";
    }
    return { key, label: QUESTION_LABELS[key] ?? key.toUpperCase(), answer };
  });
}
