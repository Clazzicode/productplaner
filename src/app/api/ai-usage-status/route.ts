import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { getOrganizationAiUsageStatus } from "@/lib/ai/budget";
import { establishAuthContext } from "@/lib/db";

export async function GET() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const status = await getOrganizationAiUsageStatus(user.organizationId);
  return NextResponse.json(status);
}
