import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import type { UsersIntelligence } from "@/lib/dashboard/adminDashboardData";

/** Membership intelligence (docs/V2-ORG-ADMIN-DASHBOARD.md §6) — every count
 * here is a real, org-scoped User row grouped by a real column
 * (status/memberType/workingRole/accessLevel). No ActivityLog exists yet, so
 * "recent status changes" is intentionally not shown — see docs. */
export default function UsersIntelligencePanel(props: { data: UsersIntelligence }) {
  const u = props.data;
  const rows: { label: string; value: number }[] = [
    { label: "Active", value: u.active },
    { label: "Disabled", value: u.disabled },
    { label: "Archived", value: u.archived },
    { label: "External", value: u.external },
    { label: "No working role", value: u.noWorkingRole },
    { label: "No team", value: u.noTeam },
    { label: "Organization Admins", value: u.admins },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Users</CardTitle>
        <Link href="/admin/users" className="text-xs font-medium text-indigo-600 hover:underline">
          Manage →
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
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
