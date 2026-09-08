// Step 8C server-side enforcement helpers (docs/V2-RESOURCE-ACCESS.md §12).
// Every protected initiative page/route calls one of these — never
// `db.initiative.findUnique` directly followed by hand-rolled access logic.

import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getResolvedAccess } from "./initiativeAccess";
import { meetsMinimum, type PermissionLevel, type ResolvedAccess } from "./resolution";

/**
 * Page guard. `notFound()` for a missing/cross-org initiative (never
 * distinguishable from "doesn't exist" — docs/V2-RESOURCE-ACCESS.md §17);
 * redirects to `/access-denied` when the initiative is real but the user's
 * resolved level doesn't meet `minimum`. Returns the resolved access so the
 * caller can render level-appropriate UI without a second lookup.
 */
export async function requireInitiativePageAccess(
  userId: string,
  initiativeId: string,
  minimum: PermissionLevel,
): Promise<ResolvedAccess> {
  const access = await getResolvedAccess(userId, initiativeId);
  if (access === "not_found") notFound();
  if (!meetsMinimum(access.level, minimum)) {
    redirect(`/access-denied?initiativeId=${encodeURIComponent(initiativeId)}`);
  }
  return access;
}

export const requireInitiativeView = (userId: string, initiativeId: string) =>
  requireInitiativePageAccess(userId, initiativeId, "view");
export const requireInitiativeEdit = (userId: string, initiativeId: string) =>
  requireInitiativePageAccess(userId, initiativeId, "edit");
export const requireInitiativeOwner = (userId: string, initiativeId: string) =>
  requireInitiativePageAccess(userId, initiativeId, "owner");

/**
 * API route guard. Returns either the resolved access to proceed with, or a
 * ready-to-return NextResponse (404 for missing/cross-org, 403 for
 * insufficient level) — the route just does
 * `const guard = await requireInitiativeApiAccess(...); if (!guard.ok) return guard.response;`
 */
export async function requireInitiativeApiAccess(
  userId: string,
  initiativeId: string,
  minimum: PermissionLevel,
): Promise<{ ok: true; access: ResolvedAccess } | { ok: false; response: NextResponse }> {
  const access = await getResolvedAccess(userId, initiativeId);
  if (access === "not_found") {
    return { ok: false, response: NextResponse.json({ error: "Not found." }, { status: 404 }) };
  }
  if (!meetsMinimum(access.level, minimum)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "You don't have access to this initiative." }, { status: 403 }),
    };
  }
  return { ok: true, access };
}
