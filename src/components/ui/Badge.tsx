// Status pill primitive — variants sourced from the exact class combinations
// already used across home/page.tsx STATUS_BADGES, LockBar and JiraSyncPanel.

export type BadgeVariant =
  | "neutral"
  | "indigo"
  | "emerald"
  | "amber"
  | "red"
  | "health-good"
  | "health-attention"
  | "health-warning"
  | "health-critical";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  // Distinct tokens from the four above — a future health-status badge must
  // never accidentally reskin value/risk/initiative-status badges, or vice
  // versa. See docs/V2-DESIGN-SYSTEM.md "Badge / Status Semantics".
  "health-good": "bg-health-good/10 text-health-good",
  "health-attention": "bg-health-attention/10 text-health-attention",
  "health-warning": "bg-health-warning/10 text-health-warning",
  "health-critical": "bg-health-critical/10 text-health-critical",
};

export function Badge(props: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={props.title}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${VARIANTS[props.variant ?? "neutral"]} ${props.className ?? ""}`}
    >
      {props.children}
    </span>
  );
}

// Domain mappings used across the planning workspaces.

export function valueBadgeVariant(businessValue: string): BadgeVariant {
  if (businessValue === "critical") return "emerald";
  if (businessValue === "high") return "indigo";
  return "neutral";
}

export function riskBadgeVariant(riskLevel: string): BadgeVariant {
  if (riskLevel === "critical") return "red";
  if (riskLevel === "high") return "amber";
  return "neutral";
}

export function healthBadgeVariant(status: "on_track" | "attention" | "at_risk"): BadgeVariant {
  if (status === "on_track") return "emerald";
  if (status === "attention") return "amber";
  return "red";
}

// Standard Dashboard (Step 7B) first real consumer of the four-tier health-*
// tokens provisioned in Step 6B. The real HealthStatus domain type still only
// has three values, so this maps to three of the four — "health-warning"
// stays reserved/unconsumed exactly as documented in
// docs/V2-DESIGN-SYSTEM.md §10, not force-mapped to something it doesn't mean.
export function healthTokenVariant(status: "on_track" | "attention" | "at_risk"): BadgeVariant {
  if (status === "on_track") return "health-good";
  if (status === "attention") return "health-attention";
  return "health-critical";
}

// Step 9B (docs/V2-ROADMAP-TIMELINE.md §8) — Timeline's Feature-level health is
// the first real consumer of the reserved `health-warning` token: it's a 4th
// state genuinely derivable at read time (over capacity but not yet due, vs.
// over capacity and already past due — see src/lib/roadmap/timelineDerivation.ts),
// not a forced mapping of the real 3-value HealthStatus domain above.
export function timelineHealthTokenVariant(status: "on_track" | "attention" | "warning" | "critical"): BadgeVariant {
  if (status === "on_track") return "health-good";
  if (status === "attention") return "health-attention";
  if (status === "warning") return "health-warning";
  return "health-critical";
}
