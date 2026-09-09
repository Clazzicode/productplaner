import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

const workingRoleSchema = z.object({
  workingRole: z.enum(["product_management", "project_manager", "product_owner"]),
});

/**
 * Persists Working Role onto the real User row (Step 8B). Called from the
 * onboarding flow alongside the existing cookie write — see
 * docs/V2-USERS-TEAMS.md "Working Role Cookie Transition" for why both still
 * happen during the transition period.
 */
export async function PATCH(request: Request) {
  const parsed = workingRoleSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const user = await getCurrentUser();
  await db.user.update({
    where: { id: user.id },
    data: { workingRole: parsed.data.workingRole },
  });
  return NextResponse.json({ ok: true });
}
