import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getBackgroundJobForCurrentOrganization } from "@/lib/jobs/queue";
import { withApi } from "@/lib/observability";

async function GETHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const job = await getBackgroundJobForCurrentOrganization((await params).id);
  if (!job) return Response.json({ error: "Background job not found." }, { status: 404 });
  return Response.json(job);
}

export const GET = withApi(GETHandler);

