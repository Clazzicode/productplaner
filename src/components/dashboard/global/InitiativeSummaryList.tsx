import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { InitiativeOverview } from "@/lib/dashboard/globalDashboardData";

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Draft", variant: "neutral" },
  intake_in_progress: { label: "Intake in progress", variant: "amber" },
  generated: { label: "Prototype live", variant: "emerald" },
};

/** Compact cross-initiative summary (Zone 3) — highlights the primary
 * initiative and lists the rest. Not the future dense Initiatives table
 * (docs/V2-APPLICATION-SHELL-BLUEPRINT.md §9 "Data Table" layout) — that
 * remains a separate page at /initiatives; this is just enough to orient and
 * navigate. */
export default function InitiativeSummaryList(props: { initiatives: InitiativeOverview[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Your Initiatives</CardTitle>
        {props.initiatives.length > 0 && (
          <Link href="/initiatives" className="text-xs font-medium text-indigo-600 hover:underline">
            View all →
          </Link>
        )}
      </div>
      {props.initiatives.length === 0 ? (
        <EmptyState
          title="No initiatives yet"
          description="Create one and answer the eight guided planning questions to get a working plan."
          action={
            <Link
              href="/initiatives/new"
              className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Start your first plan
            </Link>
          }
        />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {props.initiatives.slice(0, 6).map((i) => {
            const status = STATUS_META[i.status] ?? STATUS_META.draft;
            const href = i.status === "generated" ? `/initiatives/${i.id}/dashboard` : `/initiatives/${i.id}/intake`;
            return (
              <li key={i.id}>
                <Link
                  href={href}
                  className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm transition hover:bg-indigo-50 ${
                    i.isPrimary ? "bg-neutral-50" : ""
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-neutral-800">{i.name}</span>
                    {i.isPrimary && <Badge variant="indigo">Primary</Badge>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {i.status === "generated" && (
                      <span className="text-xs text-neutral-400">
                        {i.lockedCount}/{i.totalLayers} locked
                      </span>
                    )}
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
