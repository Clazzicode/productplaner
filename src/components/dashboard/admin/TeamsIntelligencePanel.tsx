import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import type { TeamsIntelligence } from "@/lib/dashboard/adminDashboardData";

/** Team-level intelligence (docs/V2-ORG-ADMIN-DASHBOARD.md §7) — real Team/
 * TeamMember/InitiativeAccess counts, org-scoped. */
export default function TeamsIntelligencePanel(props: { data: TeamsIntelligence }) {
  const t = props.data;
  const rows: { label: string; value: number }[] = [
    { label: "Teams", value: t.total },
    { label: "With no members", value: t.zeroMembers },
    { label: "With no initiative access", value: t.noInitiativeAccess },
    { label: "With external members", value: t.withExternalMembers },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Teams / Membership</CardTitle>
        <Link href="/teams" className="text-xs font-medium text-indigo-600 hover:underline">
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
