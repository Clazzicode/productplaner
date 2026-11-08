import { withAuthenticatedPage } from "@/lib/auth/entryPoints";
import { notFound } from "next/navigation";
import StakeholderMatrixPortal from "@/components/matrix/StakeholderMatrixPortal";
import { requireCurrentUser } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { loadStakeholderMatrix } from "@/lib/matrix/stakeholderMatrix";

export const dynamic = "force-dynamic";

async function StakeholderMatrixPage({ params }: { params: Promise<{ initiativeId: string }> }) {
  const { initiativeId } = await params;
  const user = await requireCurrentUser();
  establishAuthContext(user.authUserId);
  const data = await loadStakeholderMatrix(initiativeId);
  if (!data) notFound();
  return <StakeholderMatrixPortal data={data} />;
}

export default withAuthenticatedPage(StakeholderMatrixPage);
