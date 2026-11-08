import Link from "next/link";
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
      <CardTitle>Decision queue</CardTitle>
      {props.items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">
          Nothing needs a decision right now — the plan is consistent.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[#e7e9f4] overflow-hidden rounded-xl border border-[#e2e5f1]">
          {props.items.map((item, i) => (
            <li key={`${item.href}-${i}`} className="grid gap-2 bg-white p-3 text-sm sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
              <div className="min-w-0"><p className="font-semibold text-[#0d1b3e]">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.impact}</p></div>
              <div className="min-w-0"><Badge variant={SEVERITY_VARIANT[item.severity]}>{item.severity === "risk" ? "At risk" : item.severity}</Badge><p className="mt-1 text-xs text-slate-600">{item.action}</p></div>
              <Link href={item.href} className="text-xs font-semibold text-[#5145ed] hover:underline">Review →</Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
