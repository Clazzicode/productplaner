import Link from "next/link";
import { redirect } from "next/navigation";
import { WideLayout } from "@/components/layout/PageLayouts";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");
  const decisions = await db.decision.findMany({
    where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" },
    include: { project: { select: { id: true, name: true } }, initiative: { select: { name: true } }, decidedByUser: { select: { name: true } } },
  });
  const approved = decisions.filter((decision) => decision.decidedAt != null);
  return <WideLayout>
    <PageHeader eyebrow="Delivery" title="Decisions" description="A durable record of choices that shape scope, delivery, and governance." />
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Total decisions" value={decisions.length} /><Metric label="Decided" value={approved.length} /><Metric label="Open for decision" value={decisions.length - approved.length} /></div>
    <Card className="mt-5 p-0">
      <div className="border-b border-border-subtle px-5 py-4"><h2 className="font-semibold">Decision register</h2><p className="text-xs text-text-muted">Recorded across all accessible projects.</p></div>
      {decisions.length === 0 ? <p className="p-8 text-center text-sm text-text-muted">No decisions have been recorded.</p> : <>
        <div className="grid gap-3 p-3 md:hidden">{decisions.map((decision) => <article key={decision.id} className="min-w-0 rounded-xl border border-border-subtle p-4 text-sm">
          <h3 className="break-words font-semibold">{decision.title}</h3>
          {decision.description && <p className="mt-1 break-words text-xs text-text-muted">{decision.description}</p>}
          <div className="mt-2"><Badge variant={decision.decidedAt ? "emerald" : "amber"}>{decision.decidedAt ? "Decided" : "Proposed"}</Badge></div>
          <p className="mt-3 text-text-secondary">Owner: {decision.decidedByUser?.name ?? "Unassigned"}</p>
          <p className="break-words">Project: <Link className="font-medium text-accent hover:underline" href={`/projects/${decision.project.id}`}>{decision.project.name}</Link>{decision.initiative && ` · ${decision.initiative.name}`}</p>
          <p className="mt-1 text-xs text-text-muted">{(decision.decidedAt ?? decision.createdAt).toLocaleDateString()}</p>
        </article>)}</div>
        <div className="hidden md:block"><Table>
        <TableHead><TableHeaderCell>Decision</TableHeaderCell><TableHeaderCell>Status</TableHeaderCell><TableHeaderCell>Owner</TableHeaderCell><TableHeaderCell>Project</TableHeaderCell><TableHeaderCell>Date</TableHeaderCell></TableHead>
        <TableBody>{decisions.map((decision) => <TableRow key={decision.id}>
          <TableCell className="min-w-80"><p className="font-semibold">{decision.title}</p>{decision.description && <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{decision.description}</p>}</TableCell>
          <TableCell><Badge variant={decision.decidedAt ? "emerald" : "amber"}>{decision.decidedAt ? "Decided" : "Proposed"}</Badge></TableCell>
          <TableCell className="text-text-secondary">{decision.decidedByUser?.name ?? "Unassigned"}</TableCell>
          <TableCell><Link className="font-medium text-accent hover:underline" href={`/projects/${decision.project.id}`}>{decision.project.name}</Link>{decision.initiative && <span className="block text-xs text-text-muted">{decision.initiative.name}</span>}</TableCell>
          <TableCell className="whitespace-nowrap text-text-muted">{(decision.decidedAt ?? decision.createdAt).toLocaleDateString()}</TableCell>
        </TableRow>)}</TableBody>
      </Table></div></>}
    </Card>
  </WideLayout>;
}

function Metric({ label, value }: { label: string; value: number }) { return <Card><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p><p className="mt-1 text-3xl font-bold text-text-primary">{value}</p></Card>; }
