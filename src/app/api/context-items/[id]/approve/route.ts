import { NextResponse } from "next/server";
import { z } from "zod";
import { requireContextItemApiAccess } from "@/lib/access/documentAccess";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext, withTransaction } from "@/lib/db";
import { crystallize } from "@/lib/context/crystallize";

const approveSchema = z.object({ value: z.string().trim().min(1).optional() });

// Document Import & Approved Context (directive items 16/17). Approve =
// crystallize (write the real value into the real Project/Initiative/
// Capability/Risk row it represents) + flip status, in one transaction, so
// approval status and the real write can never diverge. `value`, when
// given, is the user's edited wording (item 16: "the user's approved
// version [becomes] the canonical value") — omitted means accept the AI's
// suggested value as-is.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  const guard = await requireContextItemApiAccess(user, id, "edit");
  if (!guard.ok) return guard.response;
  const item = guard.row;

  if (item.status === "approved") return jsonError("Already approved.", 409);
  if (item.status === "rejected") return jsonError("This item was rejected — nothing to approve.", 409);
  if (item.status === "conflict") {
    return jsonError("This item has a conflict to resolve first — use resolve-conflict instead.", 409);
  }

  const parsed = approveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);
  const chosenValue = parsed.data.value ?? item.valueJson;

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
  });

  return NextResponse.json({ ok: true });
}
