import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import type { AccessIntelligence } from "@/lib/dashboard/adminDashboardData";

/** Access/permission signals (docs/V2-ORG-ADMIN-DASHBOARD.md §9) — read
 * straight from Step 8C's InitiativeAccess grants via
 * adminDashboardData.ts, the same rows /admin/access itself manages.
 * Presented as counts, not alarms — a handful of these being non-zero is
 * normal for a real organization. */
export default function AccessIntelligencePanel(props: { data: AccessIntelligence }) {
  const a = props.data;
  const rows: { label: string; value: number }[] = [
    { label: "Users with direct grants", value: a.usersWithDirectGrants },
    { label: "Users with no resource access", value: a.usersWithNoResourceAccess },
    { label: "External users with access", value: a.externalUsersWithAccess },
    { label: "External users without access", value: a.externalUsersWithoutAccess },
    { label: "Initiatives with external access", value: a.initiativesWithExternalAccess },
    { label: "Disabled users with stored grants", value: a.disabledUsersWithStoredGrants },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Access</CardTitle>
        <Link href="/admin/access" className="text-xs font-medium text-indigo-600 hover:underline">
          Manage →
        </Link>
      </div>
      <dl className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between border-b border-border-subtle pb-1.5 text-sm">
            <dt className="text-text-muted">{r.label}</dt>
            <dd className="font-semibold text-text-primary">{r.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
