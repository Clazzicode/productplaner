import { NextResponse } from "next/server";
import { requireInitiativeApiAccess } from "@/lib/access/guards";
import { jsonError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth/session";
import { loadIntakeInput } from "@/lib/generation/engine";
import { validateIntake } from "@/lib/generation/validateIntake";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  const guard = await requireInitiativeApiAccess(user.id, id, "view");
  if (!guard.ok) return guard.response;

  try {
    const intake = await loadIntakeInput(id);
    return NextResponse.json(validateIntake(intake));
  } catch {
    return jsonError("Initiative not found.", 404);
  }
}
