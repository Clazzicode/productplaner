import { redirect } from "next/navigation";
import { ContainedLayout } from "@/components/layout/PageLayouts";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { requireCurrentUser } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  if (user.profiles.length === 0) redirect("/welcome");
  const events = await db.auditEvent.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 100, include: { organization: { select: { name: true } } } });
  return <ContainedLayout>
    <PageHeader eyebrow="Organization" title="Activity" description="Security and planning events across your organization, ordered by most recent." />
    <Card className="mt-5 p-0">
      <div className="border-b border-border-subtle px-5 py-4"><h2 className="font-semibold">Recent activity</h2><p className="text-xs text-text-muted">Audit events are immutable and retained for traceability.</p></div>
      {events.length === 0 ? <p className="p-8 text-center text-sm text-text-muted">No activity has been recorded.</p> : <ol className="divide-y divide-border-subtle">{events.map((event) => <li key={event.id} className="flex gap-4 px-5 py-4">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-accent ring-4 ring-indigo-50" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-text-primary">{event.action.replaceAll(".", " ")}</p><Badge variant="indigo">{event.entityType}</Badge></div><p className="mt-1 text-xs text-text-muted">{event.entityId} · {event.createdAt.toLocaleString()}{event.requestId ? ` · Request ${event.requestId}` : ""}</p></div>
      </li>)}</ol>}
    </Card>
  </ContainedLayout>;
}
