import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";

export interface UpcomingAction {
  label: string;
  href: string;
}

/** Generated from current plan state, not a calendar (spec §1.10). */
export default function UpcomingActions(props: {
  now: UpcomingAction[];
  next: UpcomingAction[];
  later: UpcomingAction[];
}) {
  const groups: [string, UpcomingAction[]][] = [
    ["Today", props.now],
    ["Next", props.next],
    ["Later", props.later],
  ];
  return (
    <Card>
      <CardTitle>Upcoming planning actions</CardTitle>
      <div className="mt-3 space-y-3">
        {groups.map(([title, actions]) =>
          actions.length === 0 ? null : (
            <div key={title}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                {title}
              </p>
              <ul className="mt-1 space-y-1">
                {actions.map((a) => (
                  <li key={a.label}>
                    <Link
                      href={a.href}
                      className="block rounded-lg px-2 py-1.5 text-sm text-neutral-600 transition hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {a.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </Card>
  );
}
