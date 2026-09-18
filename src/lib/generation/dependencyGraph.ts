import { EFFORT_POINTS, MVP_IMPORTANCE_SCORE, VALUE_SCORE } from "./constants";
import { computePriorityScore, deriveMvpImportance, hasScoringInputs } from "./scoring";
import type { CapabilityInput } from "./types";

/**
 * Kahn's algorithm over the capability dependency graph.
 * Returns the ids involved in a cycle (empty array = acyclic).
 */
export function findCycle(capabilities: CapabilityInput[]): string[] {
  const ids = new Set(capabilities.map((c) => c.id));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep id -> ids that depend on it

  for (const cap of capabilities) {
    if (!inDegree.has(cap.id)) inDegree.set(cap.id, 0);
    for (const dep of cap.dependsOn) {
      if (!ids.has(dep) || dep === cap.id) continue;
      inDegree.set(cap.id, (inDegree.get(cap.id) ?? 0) + 1);
      dependents.set(dep, [...(dependents.get(dep) ?? []), cap.id]);
    }
  }

  const queue = capabilities.filter((c) => (inDegree.get(c.id) ?? 0) === 0).map((c) => c.id);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of dependents.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (visited === capabilities.length) return [];
  return capabilities
    .filter((c) => (inDegree.get(c.id) ?? 0) > 0)
    .map((c) => c.id);
}

/**
 * Dependency-respecting priority order within one set of capabilities.
 * Kahn's algorithm where, among currently-available nodes, we always pick
 * per the §6 ordering rule: MVP importance desc → priority score desc →
 * business value desc → effort asc → original input order.
 * The §5 keys only apply when a capability actually carries the new scoring
 * inputs (riskLevel/mvpImportance) — legacy inputs without them order exactly
 * as before. Dependencies pointing outside the set are treated as already
 * satisfied (they live in an earlier phase).
 */
export function orderByDependencyAndPriority(
  capabilities: CapabilityInput[],
): CapabilityInput[] {
  const inSet = new Set(capabilities.map((c) => c.id));
  const byId = new Map(capabilities.map((c) => [c.id, c]));
  const remainingDeps = new Map<string, Set<string>>();
  for (const cap of capabilities) {
    remainingDeps.set(
      cap.id,
      new Set(cap.dependsOn.filter((d) => inSet.has(d) && d !== cap.id)),
    );
  }

  // §5 dependency importance is derived from how many caps in this set
  // depend on each capability.
  const dependedOnBy = new Map<string, number>();
  for (const cap of capabilities) {
    for (const d of cap.dependsOn) {
      if (inSet.has(d) && d !== cap.id) dependedOnBy.set(d, (dependedOnBy.get(d) ?? 0) + 1);
    }
  }

  const scoringActive = capabilities.some(hasScoringInputs);
  const pickBest = (available: CapabilityInput[]): CapabilityInput =>
    [...available].sort((a, b) => {
      if (scoringActive) {
        const mvpDiff =
          MVP_IMPORTANCE_SCORE[deriveMvpImportance(b)] -
          MVP_IMPORTANCE_SCORE[deriveMvpImportance(a)];
        if (mvpDiff !== 0) return mvpDiff;
        // Deliberately on default weights: this is deep-engine sort-comparator
        // tie-breaking with no org/initiative context threaded to it, and the
        // value never reaches a user — unlike workspace.ts's priorityByCapability,
        // which does use an initiative's resolved (possibly overridden) weights.
        const priorityDiff =
          computePriorityScore(b, dependedOnBy.get(b.id) ?? 0) -
          computePriorityScore(a, dependedOnBy.get(a.id) ?? 0);
        if (priorityDiff !== 0) return priorityDiff;
      }
      return (
        VALUE_SCORE[b.businessValue] - VALUE_SCORE[a.businessValue] ||
        EFFORT_POINTS[a.effortSize] - EFFORT_POINTS[b.effortSize] ||
        a.order - b.order
      );
    })[0];

  const result: CapabilityInput[] = [];
  const done = new Set<string>();
  while (result.length < capabilities.length) {
    const available = capabilities.filter(
      (c) => !done.has(c.id) && [...remainingDeps.get(c.id)!].every((d) => done.has(d)),
    );
    if (available.length === 0) {
      // Cycle inside this set (validation should have caught it) — append the
      // rest in input order so generation still terminates deterministically.
      const rest = capabilities.filter((c) => !done.has(c.id));
      for (const c of rest) {
        result.push(byId.get(c.id)!);
        done.add(c.id);
      }
      break;
    }
    const best = pickBest(available);
    result.push(best);
    done.add(best.id);
  }
  return result;
}
