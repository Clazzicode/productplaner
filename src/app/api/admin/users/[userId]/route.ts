import { withApi } from "@/lib/observability";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError, zodMessage } from "@/lib/api";
import { requireCurrentUserApi } from "@/lib/auth/session";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { isLastActiveOrgAdmin } from "@/lib/admin/safeguards";

const userPatchSchema = z
  .object({
    accessLevel: z.enum(["standard_user", "org_admin"]).optional(),
    // Guided-activation restructure (reference doc §13): kept in sync with
    // WorkingRole (src/lib/onboarding/types.ts) by hand — same drift
    // confirmed and fixed at /api/account/working-role and
    // /api/admin/dashboard-config/[workingRole].
    workingRole: z
      .enum([
        "product_management",
        "project_manager",
        "product_owner",
        "business_analyst",
        "founder_business_lead",
        "other",
      ])
      .nullable()
      .optional(),
    memberType: z.enum(["internal", "external"]).optional(),
    status: z.enum(["active", "disabled", "archived"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update." });

/**
 * Real, if narrow, server-side authorization: gated on the now-persisted
 * `User.accessLevel`. See docs/V2-USERS-TEAMS.md "Security Limitation" — this
 * is genuine enforcement of one axis (access level), not a fake check, but the
 * prototype still has exactly one session-bound user, so it has never been
 * exercised against a real second, lower-privileged user.
 */
async function PATCHHandler(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const guard = await requireCurrentUserApi();
  if (!guard.ok) return guard.response;
  const actor = guard.user;
  establishAuthContext(actor.authUserId);
  if (actor.accessLevel !== "org_admin") return jsonError("Only an Organization Admin can manage users.", 403);

  const parsed = userPatchSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(zodMessage(parsed.error), 422);

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target || target.homeOrganizationId !== actor.organizationId) return jsonError("User not found.", 404);
  const membership = target.authUserId ? await db.organizationMember.findUnique({
    where: { organizationId_authUserId: { organizationId: actor.organizationId, authUserId: target.authUserId } },
  }) : null;
  if (!membership) return jsonError("Member not found.", 404);
  if (membership.role === "owner" && (parsed.data.accessLevel || parsed.data.status)) {
    return jsonError("Owner access must be preserved. Transfer ownership before changing this membership.", 409);
  }
  if (actor.permissionRole !== "owner" && (membership.role === "admin" || parsed.data.accessLevel === "org_admin")) {
    return jsonError("Only an organization owner can manage administrators.", 403);
  }
  // User.status is global. This legacy screen must not disable a person in
  // other workspaces as a side effect of managing this membership.
  if (parsed.data.status && target.authUserId && await db.organizationMember.count({
    where: { authUserId: target.authUserId, organizationId: { not: actor.organizationId } },
  })) return jsonError("Manage this person's organization membership; global status changes are unavailable for multi-organization users.", 409);

  const demotingFromOrgAdmin = parsed.data.accessLevel === "standard_user" && target.accessLevel === "org_admin";
  const disabling = parsed.data.status && parsed.data.status !== "active" && target.status === "active";
  if (demotingFromOrgAdmin || disabling) {
    if (await isLastActiveOrgAdmin(userId, target.homeOrganizationId)) {
      return jsonError(
        "This is the only active Organization Admin — promote another user before changing this.",
        409,
      );
    }
  }

  const updated = await withTransaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: userId },
      data: parsed.data,
      select: { id: true, authUserId: true, accessLevel: true, workingRole: true, memberType: true, status: true },
    });
    // Keep OrganizationMember.role in sync with the legacy accessLevel column
    // whenever it changes — getCurrentUser() derives the *authoritative*
    // per-request accessLevel from this membership row, so leaving it stale
    // would make this PATCH silently do nothing from the target user's POV.
    if (parsed.data.accessLevel && row.authUserId) {
      await tx.organizationMember.updateMany({
        where: { organizationId: target.homeOrganizationId, authUserId: row.authUserId },
        data: { role: parsed.data.accessLevel === "org_admin" ? "admin" : "member" },
      });
    }
    return row;
  });
  return NextResponse.json(updated);
}

export const PATCH = withApi(PATCHHandler);
