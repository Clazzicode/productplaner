import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContextItemApiAccess } from "@/lib/access/documentAccess";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext, withTransaction } from "@/lib/db";
import { crystallize } from "@/lib/context/crystallize";

const resolveConflictSchema = z.object({ chosenValue: z.string().trim().min(1) });

// Document Import & Approved Context (directive items 13/14/25/32). The
// forced-choice conflict UI's only write path: the user explicitly picked a
// winning value (their own suggestion, the conflicting value, or a typed
// custom one) — this is the "New Information Detected -> Review -> User
// Decision -> Update Approved Context" path (item 25), never a silent
// overwrite. Crystallizing + approving both happen here, plus rejecting the
// linked conflicting item (if any) since the user just picked a side.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireContextItemApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;
  const item = guard.row;

  if (item.status !== "conflict") return jsonError("This item has no conflict to resolve.", 409);

  const parsed = resolveConflictSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const { chosenValue } = parsed.data;

  await withTransaction(async (tx) => {
    await crystallize(
      tx,
      { organizationId: item.organizationId, projectId: item.projectId, initiativeId: item.initiativeId, fieldKey: item.fieldKey },
      chosenValue,
    );
    await tx.contextItem.update({
      where: { id },
      data: { status: "approved", approvedValueText: chosenValue, approvedByUserId: user.id, approvedAt: new Date() },
    });
    if (item.conflictWithItemId) {
      // Conditional, not unconditional — a no-op if the other side was
      // already resolved independently (e.g. the user approved it directly
      // before coming back to this one).
      await tx.contextItem.updateMany({
        where: { id: item.conflictWithItemId, status: "conflict" },
        data: { status: "rejected" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
