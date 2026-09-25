export type StatusColor = "green" | "yellow" | "red";
export type StatusEntityType = "project" | "initiative" | "feature" | "epic" | "story" | "sprint" | "release";

export const STATUS_LABELS: Record<StatusColor, string> = {
  green: "On Track",
  yellow: "Needs Attention",
  red: "At Risk",
};

/** A recommendation the system can explain from a known, objective condition
 * — never a numeric score (directive: "do not invent exact mathematical
 * thresholds ... until those rules are defined"). Each recommender in
 * recommend.ts documents exactly which directive-listed example condition it
 * implements. */
export interface StatusRecommendation {
  color: StatusColor;
  reason: string;
}

export interface ResolvedStatus {
  /** Current status, or null if nobody has set one yet and no recommendation
   * exists either. */
  color: StatusColor | null;
  source: "manual" | "system" | null;
  reason: string;
  /** Freshly computed each read — never persisted as truth on its own, only
   * surfaced so a user can Accept it (directive: "Do not let AI silently
   * change the status of approved work"). Null when nothing to recommend, or
   * when it matches the current color already (nothing to accept). */
  recommendation: StatusRecommendation | null;
}
