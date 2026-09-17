import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";
import { createDocument } from "@/lib/documents/uploadDocument";

// Document Import & Approved Context (directive item 2/4) — "Add Documents"
// from inside a specific initiative. Always initiative_only; never shared
// with a sibling initiative in the same Project.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireInitiativeApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  const initiative = await db.initiative.findUnique({ where: { id }, select: { projectId: true } });
  if (!initiative) return jsonError("Not found.", 404);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return jsonError("No file was uploaded.", 422);

  const result = await createDocument({
    organizationId: user.organizationId,
    projectId: initiative.projectId,
    initiativeId: id,
    scope: "initiative_only",
    uploadedByUserId: user.id,
    file,
  });
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ documentId: result.documentId });
}
