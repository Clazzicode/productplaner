import { Card, CardTitle } from "@/components/ui/Card";

export interface ActivityItem {
  when: Date;
  label: string;
}

/** Derived from existing timestamps — no separate audit-log table. */
export default function RecentActivity(props: { items: ActivityItem[] }) {
  return (
    <Card>
      <CardTitle>Recent activity</CardTitle>
      {props.items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">No activity yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {props.items.map((item, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-neutral-600">{item.label}</span>
              <span className="shrink-0 text-xs text-neutral-400">
                {item.when.toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
