// Status pill primitive — variants sourced from the exact class combinations
// already used across home/page.tsx STATUS_BADGES, LockBar and JiraSyncPanel.

export type BadgeVariant = "neutral" | "indigo" | "emerald" | "amber" | "red";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  indigo: "bg-indigo-100 text-indigo-700",
  emerald: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

export function Badge(props: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  title?: string;
}) {
  return (
    <span
      title={props.title}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${VARIANTS[props.variant ?? "neutral"]}`}
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
