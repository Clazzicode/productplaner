import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { db, establishAuthContext, withTransaction } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// docs/V2-MULTI-TENANT-AUTH.md. Real Supabase Auth session, resolved to this
// app's User row via User.authUserId. Replaces the old plaintext
// "v2_current_user" cookie entirely — see git history for that version.

const ACTIVE_ORG_COOKIE = "v2_active_org";

const USER_INCLUDE = { profiles: { orderBy: { createdAt: "desc" as const }, take: 1 } };

type UserWithProfiles = Awaited<ReturnType<typeof loadUserByAuthId>>;

function loadUserByAuthId(authUserId: string) {
  return db.user.findUnique({ where: { authUserId }, include: USER_INCLUDE });
}

export interface CurrentUser extends NonNullable<UserWithProfiles> {
  /** Resolved *active* organization for this request (validated against
   * organization_members, falling back to homeOrganizationId) — kept under
   * this existing field name so the ~30 call sites that already read
   * `.organizationId` off getCurrentUser()'s result keep working unchanged. */
  organizationId: string;
  /** Derived fresh each request from the active org's OrganizationMember.role
   * ("owner"/"admin" -> "org_admin", "member" -> "standard_user"), so the
   * existing `accessLevel === "org_admin"` checks throughout the codebase
   * stay correct even for a user who is, say, owner of their own org but
   * only a member of someone else's. New code should prefer permissionRole. */
  accessLevel: string;
  /** The real, per-organization 3-tier role. Prefer this over accessLevel for
   * anything that needs to distinguish owner from admin (e.g. "only the
   * owner may delete this organization," last-owner safeguards). */
  permissionRole: "owner" | "admin" | "member";
}

async function resolveActiveMembership(authUserId: string, homeOrganizationId: string) {
  const store = await cookies();
  const requested = store.get(ACTIVE_ORG_COOKIE)?.value;

  if (requested) {
    // Never trust the cookie's org id by itself — it only wins if a real,
    // active membership row backs it up.
    const membership = await db.organizationMember.findFirst({
      where: { organizationId: requested, authUserId, status: "active" },
      select: { organizationId: true, role: true },
    });
    if (membership) return membership;
  }

  const home = await db.organizationMember.findFirst({
    where: { organizationId: homeOrganizationId, authUserId, status: "active" },
    select: { organizationId: true, role: true },
  });
  if (home) return home;

  // No membership row at all (shouldn't happen once backfilled) — fail safe
  // to the home org with the lowest permission role, never an elevated one.
  return { organizationId: homeOrganizationId, role: "member" as const };
}

function deriveAccessLevel(role: string): string {
  return role === "owner" || role === "admin" ? "org_admin" : "standard_user";
}

/**
 * Resolves the current request's authenticated user, or null if not signed
 * in / disabled. Verifies the session via `supabase.auth.getUser()` — this
 * re-validates the token against Supabase Auth; never decode a JWT locally
 * instead, that would let a forged cookie claim to be anyone.
 *
 * Establishes the RLS auth context using the now-verified authUser.id purely
 * for THIS function's own subsequent queries (loadUserByAuthId,
 * resolveActiveMembership both need a real auth.uid() to satisfy their own
 * RLS policies once RLS is enforced — e.g. `User`'s SELECT policy is
 * `authUserId = auth.uid() OR is_org_member(...)`). This establishment does
 * NOT survive back out to whoever calls getCurrentUser() — this function
 * awaits `cookies()`, and Next.js silently drops unrelated
 * AsyncLocalStorage state at the point a function like that returns to its
 * caller (verified directly against the dev and production server — see the
 * long comment in db.ts). Every caller must call
 * `establishAuthContext(user.authUserId)` itself, in the same function that
 * goes on to use `db`/`withTransaction` — requireCurrentUser()/
 * requireCurrentUserApi() do NOT do this for you (same reason); the page/
 * route calling them must.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();
  if (error || !authUser) return null;

  establishAuthContext(authUser.id);

  const user = await loadUserByAuthId(authUser.id);
  if (!user || user.status !== "active") return null;

  const membership = await resolveActiveMembership(authUser.id, user.homeOrganizationId);

  return {
    ...user,
    organizationId: membership.organizationId,
    accessLevel: deriveAccessLevel(membership.role),
    permissionRole: (membership.role as "owner" | "admin" | "member") ?? "member",
  };
}

/**
 * Server Component / page guard: redirects to /login instead of rendering
 * with a null user. Use in every page that previously assumed
 * getCurrentUser() always returns a row.
 *
 * IMPORTANT: this does NOT establish the RLS auth context, deliberately —
 * this function itself returns to ITS caller (the page), and per
 * getCurrentUser()'s doc comment, anything set here would be silently lost
 * at that return. The PAGE ITSELF must call
 * `establishAuthContext(user.authUserId)` right after awaiting this, before
 * using `db`/`withTransaction` (directly or via further nested calls) —
 * see any page in src/app for the pattern.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * API route guard: returns a ready-to-return 401 NextResponse instead of a
 * user when not signed in — mirrors this codebase's existing
 * `requireInitiativeApiAccess` ok/response shape (src/lib/access/guards.ts).
 *
 * IMPORTANT: same caveat as requireCurrentUser() above — does NOT establish
 * the RLS auth context itself. The ROUTE HANDLER must call
 * `establishAuthContext(guard.user.authUserId)` right after this resolves,
 * before using `db`/`withTransaction`.
 */
export async function requireCurrentUserApi(): Promise<
  { ok: true; user: CurrentUser } | { ok: false; response: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  return { ok: true, user };
}

/** Latest qualifying profile, or null if the user hasn't qualified yet. */
export async function getActiveProfile() {
  const user = await getCurrentUser();
  return user?.profiles[0] ?? null;
}

/**
 * Creates a brand-new personal workspace for a just-signed-up auth user:
 * one Organization (workspaceType "solo"), one User row bridged to it via
 * authUserId, that Organization's ownerUserId, and one OrganizationMember
 * row with role "owner" — the "solo user gets a workspace behind the scenes"
 * behavior, done as a single atomic transaction.
 */
export async function provisionSoloWorkspace(params: { authUserId: string; name: string; email: string }) {
  return withTransaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: `${params.name}'s Workspace`, workspaceType: "solo" },
    });
    const user = await tx.user.create({
      data: {
        authUserId: params.authUserId,
        homeOrganizationId: org.id,
        name: params.name,
        email: params.email,
        accessLevel: "org_admin",
      },
    });
    // Membership row created BEFORE the ownerUserId update, deliberately:
    // Organization's UPDATE policy is is_org_owner(id), which itself depends
    // on an active OrganizationMember row existing — updating ownerUserId
    // first would have nothing for that policy to match yet.
    await tx.organizationMember.create({
      data: { organizationId: org.id, authUserId: params.authUserId, role: "owner", status: "active" },
    });
    await tx.organization.update({ where: { id: org.id }, data: { ownerUserId: user.id } });
    return user;
  });
}

/**
 * Switches the caller's active organization for subsequent requests —
 * validated against a real, active membership row before the cookie is set
 * (never trust a client-supplied org id on its own). Caller must have
 * already called establishAuthContext(authUserId) in its own frame (see
 * getCurrentUser()'s doc comment) — this uses `db`, not `rawDb`.
 */
export async function setActiveOrganization(authUserId: string, organizationId: string): Promise<boolean> {
  const membership = await db.organizationMember.findFirst({
    where: { organizationId, authUserId, status: "active" },
    select: { organizationId: true },
  });
  if (!membership) return false;

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}

export async function clearActiveOrganizationCookie() {
  const store = await cookies();
  store.delete(ACTIVE_ORG_COOKIE);
}
