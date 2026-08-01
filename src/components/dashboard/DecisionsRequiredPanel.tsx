import Link from "next/link";
import ExplainCallout from "@/components/demo/ExplainCallout";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";

export interface DecisionItem {
  title: string; // what happened
  impact: string; // why it matters
  action: string; // recommended action
  href: string; // link to the affected area
  severity: "info" | "warning" | "risk";
}

const SEVERITY_VARIANT: Record<DecisionItem["severity"], BadgeVariant> = {
  info: "indigo",
  warning: "amber",
  risk: "red",
};

export default function DecisionsRequiredPanel(props: { items: DecisionItem[] }) {
  return (
    <Card>
      <CardTitle>Decisions required</CardTitle>
      {props.items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">
          Nothing needs a decision right now — the plan is consistent.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {props.items.map((item, i) => (
            <li key={i} className="rounded-xl border border-neutral-200 p-3">
              <p className="flex items-start justify-between gap-2 text-sm font-medium">
                {item.title}
                <Badge variant={SEVERITY_VARIANT[item.severity]}>
                  {item.severity === "risk" ? "at risk" : item.severity}
                </Badge>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                <span className="font-medium text-neutral-600">Impact:</span> {item.impact}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                <span className="font-medium text-neutral-600">Recommended:</span> {item.action}
              </p>
              <Link href={item.href} className="mt-1.5 inline-block text-xs font-medium text-indigo-600 hover:underline">
                Review →
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ExplainCallout>
        Everything a PM needs to act on, in one place: each item says what happened, why it
        matters, and the recommended next step — with a link straight to the affected workspace.
      </ExplainCallout>
    </Card>
  );
}
