import { NextResponse } from "next/server";

export type OrganizationRole = "owner" | "admin" | "member";

export function requireOrganizationRole(
  actor: { status: string; permissionRole: OrganizationRole; memberType: string },
  allowed: readonly OrganizationRole[],
): { ok: true } | { ok: false; response: NextResponse } {
  if (actor.status !== "active" || actor.memberType !== "internal" || !allowed.includes(actor.permissionRole)) {
    return { ok: false, response: NextResponse.json({ error: "Insufficient organization permissions." }, { status: 403 }) };
  }
  return { ok: true };
}
