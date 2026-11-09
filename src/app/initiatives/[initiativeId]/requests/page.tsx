import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireInitiativeView } from "@/lib/access/guards";
import { db, establishAuthContext } from "@/lib/db";
import { requestRecord } from "@/lib/requests/service";
import RequestWorkspace from "@/components/requests/RequestWorkspace";
import { ContainedLayout } from "@/components/layout/PageLayouts";

async function RequestsPage({ params }: { params: Promise<{ initiativeId: string }> }) {
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
    <div className="mb-5"><h1 className="text-[26px] font-semibold tracking-tight text-[#111b36]">Requests & priorities</h1></div>
    <RequestWorkspace initiativeId={initiativeId} initialRequests={requests.map(requestRecord)} canEdit={access.level === "edit" || access.level === "owner"} />
  </ContainedLayout>;
}

export default withAuthenticatedPage(RequestsPage);
