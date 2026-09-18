import type { BusinessValue, RiskLevel } from "@/lib/generation/types";

/**
 * Platform-specific (not dictionary) guidance for the Business Value and Risk
 * Level pickers — what each level actually does inside this platform's
 * planning logic, not a generic definition. Depth follows the same binary
 * `verbose` convention every other experience-varying copy table in the app
 * already uses (see roleGuidance.ts's depthFromExperience) — no 3-tier split
 * exists anywhere else to be consistent with.
 */

export interface LevelGuidance {
  short: string;
  long: string;
}

export const BUSINESS_VALUE_GUIDANCE: Record<BusinessValue, LevelGuidance> = {
  very_low: {
    short: "Feeds the priority score — marginal value rarely gets pulled into an earlier phase.",
    long: "Business value is one of the factors behind a feature's priority score, and (for non-MVP features) helps decide which roadmap phase it lands in. Very low value means this feature is unlikely to be prioritized ahead of others or pulled into an earlier phase — expect it toward the end of the roadmap.",
  },
  low: {
    short: "Feeds the priority score — low value rarely gets pulled into an earlier phase.",
    long: "Business value is one of the factors behind a feature's priority score, and (for non-MVP features) helps decide which roadmap phase it lands in. Low value means this feature is a lower priority relative to others and is unlikely to be pulled into an earlier phase.",
  },
  medium: {
    short: "Feeds the priority score and roadmap phase placement.",
    long: "Business value is one of the factors behind a feature's priority score, and (for non-MVP features) helps decide which roadmap phase it lands in. Medium value is a middle-of-the-pack priority — it competes with other medium and low value work for scheduling.",
  },
  high: {
    short: "Feeds the priority score — high value can pull a non-MVP feature into an earlier phase.",
    long: "Business value is one of the factors behind a feature's priority score, and (for non-MVP features) helps decide which roadmap phase it lands in. High value can pull a feature into Phase 2 even when it isn't required for the MVP.",
  },
  critical: {
    short: "Feeds the priority score — critical value can pull a non-MVP feature into an earlier phase.",
    long: "Business value is one of the factors behind a feature's priority score, and (for non-MVP features) helps decide which roadmap phase it lands in. Critical value has the same phase-pulling effect as High — it signals this feature matters enough to schedule sooner, even when it isn't required for the MVP.",
  },
};

export const RISK_LEVEL_GUIDANCE: Record<RiskLevel, LevelGuidance> = {
  low: {
    short: "Well understood — no special scheduling treatment.",
    long: "Risk level feeds the priority score and, for MVP features, influences sequencing. Low risk means this work is well understood — it doesn't get pulled earlier or flagged for extra scrutiny.",
  },
  medium: {
    short: "Some unknowns — no special scheduling treatment by itself.",
    long: "Risk level feeds the priority score and, for MVP features, influences sequencing. Medium risk means there are some unknowns, but on its own it doesn't trigger earlier scheduling the way High or Critical risk does.",
  },
  high: {
    short: "Real uncertainty — if also MVP, this gets scheduled earlier to reduce risk sooner.",
    long: "Risk level feeds the priority score and, for MVP features, influences sequencing. High risk reflects real technical or external uncertainty. If this feature is also marked required for the MVP, the plan schedules it earlier specifically so problems surface sooner rather than late in the roadmap.",
  },
  critical: {
    short: "Unproven or hard-dependency risk — if also MVP, this gets scheduled earliest.",
    long: "Risk level feeds the priority score and, for MVP features, influences sequencing. Critical risk reflects unproven technology or a hard external dependency. If this feature is also marked required for the MVP, it gets the strongest pull toward earlier scheduling of any risk level, so the riskiest unknowns are resolved first.",
  },
};

export function businessValueGuidance(level: BusinessValue, verbose: boolean): string {
  const g = BUSINESS_VALUE_GUIDANCE[level];
  return verbose ? g.long : g.short;
}

export function riskLevelGuidance(level: RiskLevel, verbose: boolean): string {
  const g = RISK_LEVEL_GUIDANCE[level];
  return verbose ? g.long : g.short;
}
