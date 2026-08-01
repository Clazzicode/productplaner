import Link from "next/link";
import { Badge, healthBadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { HEALTH_LABELS, type HealthStatus } from "@/lib/generation/health";

export interface SprintSummaryView {
  sprintNumber: number;
  plannedPoints: number;
  capacityPoints: number;
  storyCount: number;
  startDate: Date;
  endDate: Date;
}

export interface ReleaseSummaryView {
  name: string;
  sprintRange: string;
  points: number;
  targetDate: Date;
  health: HealthStatus;
}

export default function SprintReleaseStatus(props: {
  initiativeId: string;
  currentSprint: SprintSummaryView | null;
  releases: ReleaseSummaryView[];
}) {
  const s = props.currentSprint;
  const usage = s && s.capacityPoints > 0 ? Math.round((s.plannedPoints / s.capacityPoints) * 100) : 0;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Sprints &amp; releases</CardTitle>
        <Link
          href={`/initiatives/${props.initiativeId}/workspace/sprints`}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Open sprint plan →
        </Link>
      </div>

      {s ? (
        <div className="mt-3 rounded-xl bg-neutral-50 p-3">
          <p className="text-sm font-semibold">
            Sprint {s.sprintNumber}
            <span className="ml-2 font-normal text-neutral-500">
              {s.startDate.toLocaleDateString()} – {s.endDate.toLocaleDateString()}
            </span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {s.plannedPoints} / {s.capacityPoints} points planned · {usage}% capacity utilized ·{" "}
            {s.storyCount} stories
          </p>
          <ProgressBar percent={usage} over={usage > 100} className="mt-2" />
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">No sprints planned yet.</p>
      )}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-400">
            <th className="py-1.5 font-semibold">Release</th>
            <th className="py-1.5 font-semibold">Sprints</th>
            <th className="py-1.5 font-semibold">Points</th>
            <th className="py-1.5 font-semibold">Target</th>
            <th className="py-1.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {props.releases.map((r) => (
            <tr key={r.name} className="border-t border-neutral-100">
              <td className="py-2 font-medium">{r.name}</td>
              <td className="py-2 text-neutral-500">{r.sprintRange}</td>
              <td className="py-2 text-neutral-500">{r.points}</td>
              <td className="py-2 text-neutral-500">{r.targetDate.toLocaleDateString()}</td>
              <td className="py-2">
                <Badge variant={healthBadgeVariant(r.health)}>{HEALTH_LABELS[r.health]}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
