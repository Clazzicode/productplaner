import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { getOrganizationAiUsageStatus } from "@/lib/ai/budget";
import { establishAuthContext } from "@/lib/db";

async function GETHandler() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const user = authGuard.user;
  establishAuthContext(user.authUserId);

  const status = await getOrganizationAiUsageStatus(user.organizationId);
  return NextResponse.json(status);
}

export const GET = withApi(GETHandler);
