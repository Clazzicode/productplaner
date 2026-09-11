import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { establishAuthContext } from "@/lib/db";
import {
  getRoleConfigurationView,
  resetRoleConfiguration,
  saveRoleConfiguration,
} from "@/lib/dashboard/dashboardConfiguration";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard/widgetRegistry";
import type { WorkingRole } from "@/lib/onboarding/types";

const WORKING_ROLES: readonly WorkingRole[] = ["product_management", "project_manager", "product_owner"];
const WIDGET_IDS = DASHBOARD_WIDGETS.map((w) => w.id) as [string, ...string[]];

const saveSchema = z.object({
  widgets: z
    .array(
      z.object({
        id: z.enum(WIDGET_IDS),
        visible: z.boolean(),
      }),
    )
    .min(1),
});

function parseWorkingRole(value: string): WorkingRole | null {
  return (WORKING_ROLES as readonly string[]).includes(value) ? (value as WorkingRole) : null;
}

/**
 * ADMIN → Dashboard Configuration mutation routes (Step 8E —
 * docs/V2-DASHBOARD-CONFIGURATION.md). Same inline admin gate already used
 * by /api/admin/teams and /api/admin/users/[userId], extended with the
 * `status !== "active"` check this phase's brief explicitly requires (the
 * same addition already made for the Step 8D Admin Dashboard page).
 * Dashboard Configuration is presentation only — these routes never touch
 * `accessLevel`, `memberType`, or `InitiativeAccess`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ workingRole: string }> }) {
  const { workingRole: rawRole } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin" || actor.status !== "active") {
    return jsonError("Only an active Organization Admin can update Dashboard Configuration.", 403);
  }

  const workingRole = parseWorkingRole(rawRole);
  if (!workingRole) return jsonError("Unknown Working Role.", 400);

  const parsed = saveSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  await saveRoleConfiguration(actor.organizationId, workingRole, parsed.data.widgets);
  const view = await getRoleConfigurationView(actor.organizationId, workingRole);
  return NextResponse.json({ widgets: view });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ workingRole: string }> }) {
  const { workingRole: rawRole } = await params;
  const authGuard = await requireCurrentUserApi();
  if (!authGuard.ok) return authGuard.response;
  const actor = authGuard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin" || actor.status !== "active") {
    return jsonError("Only an active Organization Admin can update Dashboard Configuration.", 403);
  }

  const workingRole = parseWorkingRole(rawRole);
  if (!workingRole) return jsonError("Unknown Working Role.", 400);

  await resetRoleConfiguration(actor.organizationId, workingRole);
  const view = await getRoleConfigurationView(actor.organizationId, workingRole);
  return NextResponse.json({ widgets: view });
}
