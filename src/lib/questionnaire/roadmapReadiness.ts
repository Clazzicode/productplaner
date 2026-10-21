export type ReadinessSeverity = "required" | "recommended";

export interface RoadmapReadinessGap {
  section: number;
  label: string;
  detail: string;
  severity: ReadinessSeverity;
}

interface ReadinessCapability {
  id?: string;
  name: string;
  description: string;
  isMvp: boolean;
  dependsOn?: readonly string[];
}

export interface RoadmapReadinessInput {
  name: string;
  problemStatement: string;
  targetCustomer: string;
  outcomeStatement: string;
  outcomeMetric: string;
  targetLaunchDate: string;
  budget: string;
  capabilities: readonly ReadinessCapability[];
  teamSize: number | "";
  historicalVelocityPoints: number | "";
}

export const READINESS_CHECK_COUNT = 11;

function hasDependencyCycle(capabilities: readonly ReadinessCapability[]): boolean {
  const byId = new Map(capabilities.filter((capability) => capability.id).map((capability) => [capability.id!, capability]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    const capability = byId.get(id);
    if (!capability) return false;
    visiting.add(id);
    for (const dependency of capability.dependsOn ?? []) {
      if (byId.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...byId.keys()].some(visit);
}

export function assessRoadmapReadiness(input: RoadmapReadinessInput): RoadmapReadinessGap[] {
  const gaps: RoadmapReadinessGap[] = [];
  const add = (gap: RoadmapReadinessGap) => gaps.push(gap);

  if (input.name.trim().length < 3) add({ section: 0, severity: "required", label: "Name the initiative", detail: "A clear initiative name becomes the roadmap's shared reference point." });
  if (input.problemStatement.trim().length < 20) add({ section: 0, severity: "required", label: "Describe the problem in a full sentence", detail: "The plan needs enough context to keep features tied to a real customer problem." });
  if (input.targetCustomer.trim().length < 3) add({ section: 0, severity: "required", label: "Identify the primary user or customer", detail: "Personas, stories, and acceptance criteria are written from this audience's perspective." });
  if (input.outcomeStatement.trim().length < 10) add({ section: 1, severity: "required", label: "State the desired outcome", detail: "The roadmap is sequenced toward this result, not just a list of features." });
  if (!input.outcomeMetric.trim()) add({ section: 1, severity: "recommended", label: "Add a measurable success signal", detail: "Without a metric, progress can only be described qualitatively." });
  if (!input.targetLaunchDate) add({ section: 1, severity: "recommended", label: "Add a target date", detail: "A date lets the planner expose schedule pressure and tradeoffs." });
  if (!input.budget.trim()) add({ section: 1, severity: "recommended", label: "Add a budget guardrail", detail: "A budget allows cost and scope tradeoffs to be explained." });
  if (input.capabilities.length === 0) add({ section: 2, severity: "required", label: "Add at least one feature", detail: "Features become the roadmap's scope, epics, and delivery work." });
  else {
    if (!input.capabilities.some((capability) => capability.isMvp)) add({ section: 2, severity: "required", label: "Choose the minimum viable scope", detail: "At least one feature must anchor the first roadmap phase." });
    if (input.capabilities.some((capability) => !capability.description.trim())) add({ section: 2, severity: "recommended", label: "Explain what every feature does", detail: "Descriptions improve decomposition into epics, stories, and acceptance criteria." });
    if (hasDependencyCycle(input.capabilities)) add({ section: 2, severity: "required", label: "Resolve circular feature dependencies", detail: "The detailed plan cannot sequence features that depend on each other in a loop." });
    const byId = new Map(input.capabilities.filter((capability) => capability.id).map((capability) => [capability.id!, capability]));
    if (input.capabilities.some((capability) => capability.isMvp && (capability.dependsOn ?? []).some((id) => byId.get(id)?.isMvp === false))) {
      add({ section: 2, severity: "required", label: "Resolve MVP dependency conflicts", detail: "An MVP feature depends on a later feature. Move the prerequisite into MVP or change the dependency." });
    }
  }
  if (input.teamSize === "" || input.teamSize < 1) add({ section: 3, severity: "required", label: "Enter the delivery team size", detail: "Capacity and forecast dates cannot be calculated without a team." });
  if (input.historicalVelocityPoints === "") add({ section: 3, severity: "recommended", label: "Add historical velocity if known", detail: "Real delivery history makes the forecast more credible than defaults alone." });
  return gaps;
}

export function readinessPercent(gaps: RoadmapReadinessGap[]): number {
  return Math.max(0, Math.round(((READINESS_CHECK_COUNT - Math.min(gaps.length, READINESS_CHECK_COUNT)) / READINESS_CHECK_COUNT) * 100));
}
