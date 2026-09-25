import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireProjectApiAccess } from "@/lib/access/projectAccess";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { createDocument } from "@/lib/documents/uploadDocument";

// Document Import & Approved Context (directive item 4). Uploaded here
// (Project Home) is project_shared by default — unless the caller supplies
// an initiativeId (the initiative-creation-time entry point, which offers a
// real project_shared vs. initiative_only choice), in which case it's
// initiative_only and scoped to that one initiative, same as if it had been
// uploaded from POST /api/initiatives/[id]/documents directly.
async function POSTHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireProjectApiAccess(user, id);
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("No file was uploaded.", 422);

  const initiativeIdRaw = form?.get("initiativeId");
  const initiativeId = typeof initiativeIdRaw === "string" && initiativeIdRaw.length > 0 ? initiativeIdRaw : null;
  if (initiativeId) {
    const initiative = await db.initiative.findUnique({ where: { id: initiativeId }, select: { projectId: true } });
    if (!initiative || initiative.projectId !== id) return jsonError("Initiative not found in this project.", 404);
  }

  const result = await createDocument({
    organizationId: user.organizationId,
    projectId: id,
    initiativeId,
    scope: initiativeId ? "initiative_only" : "project_shared",
    uploadedByUserId: user.id,
    file,
  });
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ documentId: result.documentId });
}

export const POST = withApi(POSTHandler);
