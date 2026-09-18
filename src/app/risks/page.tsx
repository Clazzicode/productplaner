import Link from "next/link";
import { redirect } from "next/navigation";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Badge, riskBadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RisksPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");
  const risks = await db.risk.findMany({
    where: { organizationId: user.organizationId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: { project: { select: { id: true, name: true } }, initiative: { select: { name: true } }, owner: { select: { name: true } } },
  });
  const active = risks.filter((risk) => !["closed", "mitigated"].includes(risk.status));
  const high = active.filter((risk) => ["high", "critical"].includes(risk.severity));
  const mitigated = risks.filter((risk) => risk.status === "mitigated");

  return (
    <WideLayout>
      <PageHeader eyebrow="Delivery" title="Risks & Blockers" description="Track delivery risks across projects and keep mitigation work visible." />
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Active risks" value={active.length} tone="text-red-600" />
        <Metric label="High or critical" value={high.length} tone="text-amber-600" />
        <Metric label="Mitigated" value={mitigated.length} tone="text-emerald-600" />
      </div>
      <Card className="mt-5 p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div><h2 className="font-semibold">Risk register</h2><p className="text-xs text-text-muted">Organization-wide view of recorded project and initiative risks.</p></div>
        </div>
        {risks.length === 0 ? <p className="p-8 text-center text-sm text-text-muted">No risks have been recorded.</p> : (
          <Table>
            <TableHead><TableHeaderCell>Risk / blocker</TableHeaderCell><TableHeaderCell>Severity</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Owner</TableHeaderCell><TableHeaderCell>Project</TableHeaderCell><TableHeaderCell>Updated</TableHeaderCell></TableHead>
            <TableBody>{risks.map((risk) => <TableRow key={risk.id}>
              <TableCell className="min-w-72 font-medium">{risk.description}</TableCell>
              <TableCell><Badge variant={riskBadgeVariant(risk.severity)}>{risk.severity}</Badge></TableCell>
              <TableCell><Badge variant={risk.status === "mitigated" || risk.status === "closed" ? "emerald" : "indigo"}>{risk.status}</Badge></TableCell>
              <TableCell className="text-text-secondary">{risk.owner?.name ?? "Unassigned"}</TableCell>
              <TableCell><Link className="font-medium text-accent hover:underline" href={`/projects/${risk.project.id}`}>{risk.project.name}</Link>{risk.initiative && <span className="block text-xs text-text-muted">{risk.initiative.name}</span>}</TableCell>
              <TableCell className="whitespace-nowrap text-text-muted">{risk.updatedAt.toLocaleDateString()}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
      </Card>
    </WideLayout>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <Card><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p></Card>;
}
