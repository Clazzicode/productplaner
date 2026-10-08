import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { requestRecord } from "@/lib/requests/service";
import RequestWorkspace from "@/components/requests/RequestWorkspace";
import { ContainedLayout } from "@/components/layout/PageLayouts";

export default async function RequestsPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const access = await requireInitiativeView(user, initiativeId);
  const [initiative, requests] = await Promise.all([
    db.initiative.findUnique({ where: { id: initiativeId }, select: { name: true } }),
    db.planningRequest.findMany({ where: { initiativeId }, orderBy: { updatedAt: "desc" } }),
  ]);
  if (!initiative) notFound();
  return <ContainedLayout>
    <div className="mb-6 space-y-2"><Link href={`/initiatives/${initiativeId}/intake`} className="text-sm text-indigo-700">{initiative.name} / Guided intake</Link>
      <h1 className="text-3xl font-bold">Requests & priorities</h1>
      <p className="text-slate-500">Capture the need, clarify the requirements, and record the PO’s priority decision.</p>
    </div>
    <RequestWorkspace initiativeId={initiativeId} initialRequests={requests.map(requestRecord)} canEdit={access.level === "edit" || access.level === "owner"} />
  </ContainedLayout>;
}
