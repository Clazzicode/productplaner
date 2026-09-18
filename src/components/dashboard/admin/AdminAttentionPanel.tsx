import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { AdminAttentionItem, AttentionSeverity } from "@/lib/dashboard/adminDashboardData";

const SEVERITY_META: Record<AttentionSeverity, { label: string; variant: BadgeVariant }> = {
  risk: { label: "Risk", variant: "health-critical" },
  warning: { label: "Warning", variant: "health-attention" },
  info: { label: "Info", variant: "neutral" },
};

/** Assembled from signals already computed for the other panels (single
 * active org admin, at-risk initiatives, disabled Owner grants, teams with
 * no access/members, users with no resource access, external users without
 * access, disabled users still holding grants) — never a second
 * calculation. Framed as admin attention, not security alerts: normal valid
 * states (e.g. one owner grant) are only surfaced when something about them
 * is actually worth a look. */
export default function AdminAttentionPanel(props: { items: AdminAttentionItem[] }) {
  return (
    <div id="admin-attention">
      <Card>
        <CardTitle>Admin Attention</CardTitle>
        {props.items.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing needs attention" description="No admin, access, or team signals are flagged right now." />
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {props.items.map((item, i) => (
              <li key={i} className="border-b border-border-subtle pb-3 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <Link href={item.href} className="text-sm font-medium text-neutral-800 hover:text-indigo-700 hover:underline">
                    {item.title}
                  </Link>
                  <Badge variant={SEVERITY_META[item.severity].variant}>{SEVERITY_META[item.severity].label}</Badge>
                </div>
                <p className="mt-1 text-xs text-text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
