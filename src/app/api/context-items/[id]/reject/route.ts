import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireContextItemApiAccess } from "@/lib/access/documentAccess";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

// Document Import & Approved Context (directive item 16/17) — no write, just
// a status flip. A rejected item never becomes part of the approved context.
async function POSTHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireContextItemApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;

  if (guard.row.status === "approved") return jsonError("Already approved — cannot reject.", 409);

  await db.contextItem.update({ where: { id }, data: { status: "rejected" } });
  return NextResponse.json({ ok: true });
}

export const POST = withApi(POSTHandler);
