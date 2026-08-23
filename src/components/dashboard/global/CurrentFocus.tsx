import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { PrimaryInitiativeDetail } from "@/lib/dashboard/globalDashboardData";

/**
 * "My Work" honest substitute (Zone 1). There is no per-user story assignment
 * in the schema yet (ArtifactLayer has no assigneeId) — see
 * docs/V2-STANDARD-DASHBOARD.md §6. This shows the current sprint's planned
 * stories platform-wide, clearly labeled as such, rather than inventing a fake
 * assignment backend. Swap the data source for real assignment data once it
 * exists; the widget boundary/props shape here won't need to change.
 */
export default function CurrentFocus(props: { primary: PrimaryInitiativeDetail | null }) {
  const p = props.primary;
  return (
    <Card>
      <CardTitle>My Work / Current Focus</CardTitle>
      {!p ? (
        <EmptyState
          title="Nothing planned yet"
          description="Current-sprint work will appear here once an initiative's plan is generated."
        />
      ) : p.focusStories.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No stories planned yet.</p>
      ) : (
        <div className="mt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{p.focusLabel}</p>
          <ul className="mt-2 space-y-1.5">
            {p.focusStories.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-neutral-700">{s.title}</span>
                {s.points != null && <span className="shrink-0 text-xs text-neutral-400">{s.points} pts</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-neutral-400">
            Per-person assignment isn&apos;t tracked yet — showing planned work for the whole team.
          </p>
          <Link
            href={`/initiatives/${p.id}/workspace/epics`}
            className="mt-1 inline-block text-xs font-medium text-indigo-600 hover:underline"
          >
            Open stories →
          </Link>
        </div>
      )}
    </Card>
  );
}
