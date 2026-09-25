import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext } from "@/lib/db";

// Guided-activation restructure (reference doc §13): kept in sync with
// WorkingRole (src/lib/onboarding/types.ts) by hand — this Zod schema is a
// standalone runtime check, not type-checked against that union, so tsc
// can't catch the two drifting apart the way it does for the
// Record<WorkingRole, ...> consumers elsewhere. Confirmed drifted and fixed
// via a real browser test: picking any of the three new roles previously
// 422'd here silently (the PATCH call is fire-and-forget from the caller),
// leaving the working role unpersisted with no visible error to the user.
const workingRoleSchema = z.object({
  workingRole: z.enum([
    "product_management",
    "project_manager",
    "product_owner",
    "business_analyst",
    "founder_business_lead",
    "other",
  ]),
});

/**
 * Persists Working Role onto the real User row (Step 8B). Called from the
 * onboarding flow alongside the existing cookie write — see
 * docs/V2-USERS-TEAMS.md "Working Role Cookie Transition" for why both still
 * happen during the transition period.
 */
async function PATCHHandler(request: Request) {
  const parsed = workingRoleSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);
  await db.user.update({
    where: { id: user.id },
    data: { workingRole: parsed.data.workingRole },
  });
  return NextResponse.json({ ok: true });
}

export const PATCH = withApi(PATCHHandler);
