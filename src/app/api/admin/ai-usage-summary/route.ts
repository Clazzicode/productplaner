import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import { getOrganizationUsageSummary } from "@/lib/ai/reporting";

// Section 5 §33 — usage reporting foundation (backend only). Org-admin
// gated, same accessLevel check every other /api/admin route already uses.
// No UI page consumes this yet — a full customer-facing dashboard may be
// added later, per §33's explicit "don't block on it."
async function GETHandler() {
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can view AI usage.", 403);

  const summary = await getOrganizationUsageSummary(actor.organizationId);
  return NextResponse.json(summary);
}

export const GET = withApi(GETHandler);
