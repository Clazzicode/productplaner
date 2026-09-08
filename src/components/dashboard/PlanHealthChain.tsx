import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";

export interface ChainLevel {
  label: string;
  href: string;
  total: number;
  locked: boolean | null; // null = agile layer, never locks
  warnings: number;
}

/** The connected planning chain (spec §1.4) — each level links to its workspace. */
export default function PlanHealthChain(props: { levels: ChainLevel[] }) {
  return (
    <Card>
      <CardTitle>Connected plan health</CardTitle>
      <ol className="mt-3 space-y-1">
        {props.levels.map((level, i) => (
          <li key={level.label}>
            <Link
              href={level.href}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition hover:bg-indigo-50"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                {level.label}
                <span className="text-neutral-400">· {level.total}</span>
              </span>
              <span className="flex items-center gap-1.5">
                {level.warnings > 0 && (
                  <Badge variant="amber">{level.warnings} warning{level.warnings > 1 ? "s" : ""}</Badge>
                )}
                {level.locked === null ? (
                  <Badge variant="neutral">flexible</Badge>
                ) : level.locked ? (
                  <Badge variant="emerald">locked</Badge>
                ) : (
                  <Badge variant="neutral">unlocked</Badge>
                )}
              </span>
            </Link>
            {i < props.levels.length - 1 && (
              <div className="ml-5 h-2 w-px bg-neutral-200" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
