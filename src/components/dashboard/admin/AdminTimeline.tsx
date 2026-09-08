import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { AdminTimelineEntry } from "@/lib/dashboard/adminDashboardData";

const KIND_META: Record<AdminTimelineEntry["kind"], { label: string; variant: BadgeVariant }> = {
  sprint: { label: "Sprint", variant: "neutral" },
  release: { label: "Release", variant: "indigo" },
  launch: { label: "Launch", variant: "emerald" },
};

/** Organization-wide checkpoints across every initiative (Zone: right rail),
 * distinct from the Standard Dashboard's personal timeline — always
 * initiative-labeled here (an admin benefits from the label even with one
 * generated initiative), where the Standard version only labels when there's
 * more than one. Same real Sprint/Release/Initiative fields, no calendar
 * integration. */
export default function AdminTimeline(props: { entries: AdminTimelineEntry[] }) {
  return (
    <section id="admin-timeline" className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <CardTitle>Upcoming Timeline</CardTitle>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
          Org-wide
        </span>
      </div>
      {props.entries.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing scheduled yet" description="Sprint, release, and launch checkpoints appear here once a plan is generated." />
        </div>
      ) : (
        <ol className="mt-4 space-y-0">
          {props.entries.map((entry, i) => (
            <li key={`${entry.kind}-${entry.label}-${i}`} className="relative flex gap-3 pb-5 pl-1 last:pb-0">
              {i < props.entries.length - 1 && (
                <span className="absolute top-2.5 left-[7px] h-full w-px bg-indigo-100" aria-hidden />
              )}
              <span className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 border-indigo-500 bg-white" aria-hidden />
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-400">{entry.date.toLocaleDateString()}</p>
                <Link href={entry.href} className="mt-0.5 block text-sm font-medium text-neutral-800 hover:text-indigo-700 hover:underline">
                  {entry.label}
                </Link>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant={KIND_META[entry.kind].variant}>{KIND_META[entry.kind].label}</Badge>
                  <span className="text-xs text-neutral-400">{entry.initiativeName}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
