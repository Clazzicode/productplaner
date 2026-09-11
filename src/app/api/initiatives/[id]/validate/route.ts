import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { loadIntakeInput } from "@/lib/generation/engine";
import { validateIntake } from "@/lib/generation/validateIntake";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  establishAuthContext(authGuard.user.authUserId);
  const guard = await requireInitiativeApiAccess(authGuard.user, id, "view");
  if (!guard.ok) return guard.response;

  try {
    const intake = await loadIntakeInput(id);
    return NextResponse.json(validateIntake(intake));
  } catch {
    return jsonError("Initiative not found.", 404);
  }
}
