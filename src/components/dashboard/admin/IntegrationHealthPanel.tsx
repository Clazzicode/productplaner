import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import type { IntegrationHealthSummary } from "@/lib/dashboard/adminDashboardData";

const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  available: { label: "Not connected", variant: "neutral" },
  needs_configuration: { label: "Needs configuration", variant: "amber" },
  demo_connected: { label: "Connected", variant: "emerald" },
  sync_ready: { label: "Sync ready", variant: "emerald" },
  sync_complete: { label: "Synced", variant: "emerald" },
  demo_error: { label: "Error", variant: "red" },
};

/** Honest integration state (docs/V2-ORG-ADMIN-DASHBOARD.md §13) — reads
 * real IntegrationConnection/IntegrationProvider rows, same tables
 * /integrations itself reads. Demo-mode sync is real stub data (a
 * SyncConnection/IntegrationConnection row genuinely exists once "connected"
 * from that page) — this never invents a healthy sync that didn't happen. */
export default function IntegrationHealthPanel(props: { data: IntegrationHealthSummary }) {
  const connected = props.data.connections.filter((c) => c.status !== "available");
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Integration Health</CardTitle>
        <Link href="/integrations" className="text-xs font-medium text-indigo-600 hover:underline">
          Manage →
        </Link>
      </div>
      {connected.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Nothing connected yet"
            description={`0 of ${props.data.totalProviders} available integrations connected.`}
          />
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {connected.map((c, i) => {
            const meta = STATUS_META[c.status] ?? STATUS_META.available;
            return (
              <li key={i} className="flex items-center justify-between border-b border-border-subtle pb-2 text-sm last:border-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">{c.providerName}</p>
                  <p className="text-xs text-text-muted">
                    {c.lastSyncAt ? `Last sync ${c.lastSyncAt.toLocaleDateString()}` : "Never synced"}
                  </p>
                </div>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
