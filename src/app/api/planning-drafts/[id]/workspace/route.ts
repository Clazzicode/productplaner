import { withAuthenticatedApi } from "@/lib/auth/entryPoints";
import { requireCurrentUser } from "@/lib/auth/session";
import { requireCollaborationAction } from "@/lib/access/actionGuard";
import { withTransaction } from "@/lib/db";
import { ensureDraftWorkspace } from "@/lib/planning/draftWorkspace";
import { auditInitiative } from "@/lib/audit";

async function POSTHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  return withTransaction(async tx => {
    await requireCollaborationAction(id, user.id, "edit", user.organizationId);
    const prototype = await ensureDraftWorkspace(tx, id);
    await auditInitiative(id, "planning.workspace_initialized");
    return Response.json({ prototypeId: prototype.id });
  });
}
export const POST = withAuthenticatedApi(POSTHandler);
