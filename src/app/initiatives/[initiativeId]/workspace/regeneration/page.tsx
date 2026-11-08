import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { db } from "@/lib/db";
import RegenerationReview from "@/components/workspace/RegenerationReview";

async function RegenerationPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  await requireCollaborationAction(initiativeId, user.id, "edit");
  const proposals = await db.regenerationProposal.findMany({ where: { initiativeId }, orderBy: { createdAt: "desc" }, take: 5 });
  return <RegenerationReview initiativeId={initiativeId} proposals={JSON.parse(JSON.stringify(proposals))} />;
}
export default withAuthenticatedPage(RegenerationPage);
