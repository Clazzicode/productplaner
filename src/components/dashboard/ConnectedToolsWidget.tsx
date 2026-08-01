import Link from "next/link";
import ExplainCallout from "@/components/demo/ExplainCallout";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";

export interface ToolStatusView {
  name: string;
  status: string; // available | needs_configuration | demo_connected | sync_ready | sync_complete | demo_error
}

const STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  available: { label: "Available", variant: "neutral" },
  needs_configuration: { label: "Needs configuration", variant: "amber" },
  demo_connected: { label: "Demo connected", variant: "indigo" },
  sync_ready: { label: "Sync ready", variant: "indigo" },
  sync_complete: { label: "Sync complete", variant: "emerald" },
  demo_error: { label: "Demo error", variant: "red" },
};

export default function ConnectedToolsWidget(props: { tools: ToolStatusView[] }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Connected tools</CardTitle>
        <Link href="/integrations" className="text-xs font-medium text-indigo-600 hover:underline">
          Manage integrations →
        </Link>
      </div>
      {props.tools.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">
          No integrations set up yet — open the hub to connect a demo tool.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {props.tools.map((tool) => {
            const s = STATUS_LABELS[tool.status] ?? STATUS_LABELS.available;
            return (
              <li key={tool.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-neutral-700">{tool.name}</span>
                <Badge variant={s.variant}>{s.label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      <ExplainCallout>
        This area demonstrates how the plan could sync into the tools the team already uses. All
        connections are demo mode — no real credentials, no outbound calls — but state and sync
        logs persist like the real thing.
      </ExplainCallout>
    </Card>
  );
}
