import Link from "next/link";
import { Badge, riskBadgeVariant, valueBadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { VALUE_LABELS } from "@/lib/generation/constants";
import type { BusinessValue } from "@/lib/generation/types";

export interface TimelineItem {
  name: string;
  isMvp: boolean;
  businessValue: string;
  effortSize: string;
  riskLevel: string;
  estimatedCost: number;
  dependsOnNames: string[];
}

export interface TimelinePhase {
  name: string;
  items: TimelineItem[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Summary-level roadmap (spec §1.5) — detailed editing stays in the Roadmap workspace. */
export default function RoadmapTimeline(props: { initiativeId: string; phases: TimelinePhase[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Roadmap overview</CardTitle>
        <Link
          href={`/initiatives/${props.initiativeId}/workspace/roadmap`}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Open roadmap →
        </Link>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {props.phases.map((phase) => (
          <div key={phase.name} className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {phase.name}
            </p>
            <ul className="mt-2 space-y-2">
              {phase.items.map((item) => (
                <li key={item.name} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium">
                    {item.name}
                    {item.isMvp && (
                      <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                        MVP
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant={valueBadgeVariant(item.businessValue)}>
                      {VALUE_LABELS[item.businessValue as BusinessValue] ?? item.businessValue}
                    </Badge>
                    <Badge variant="neutral">{item.effortSize.toUpperCase()}</Badge>
                    <Badge variant={riskBadgeVariant(item.riskLevel)}>risk {item.riskLevel}</Badge>
                    <span className="text-xs text-neutral-500">{money(item.estimatedCost)}</span>
                  </p>
                  {item.dependsOnNames.length > 0 && (
                    <p className="mt-1 text-[11px] text-neutral-400">
                      depends on {item.dependsOnNames.join(", ")}
                    </p>
                  )}
                </li>
              ))}
              {phase.items.length === 0 && (
                <li className="px-1 text-xs text-neutral-400">Nothing planned in this phase.</li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  );
}
