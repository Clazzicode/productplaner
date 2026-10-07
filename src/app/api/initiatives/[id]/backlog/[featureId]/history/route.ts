import { withApi } from "@/lib/observability";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { establishAuthContext } from "@/lib/db";
import { listFeatureHistory } from "@/lib/backlog/service";

async function handler(_request: Request, { params }: { params: Promise<{ id: string; featureId: string }> }) {
  const { id, featureId } = await params;
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  establishAuthContext(auth.user.authUserId);
  const access = await requireInitiativeApiAccess(auth.user, id, "view");
  if (!access.ok) return access.response;
  return Response.json({ history: await listFeatureHistory(id, featureId) });
}
export const GET = withApi(handler);
