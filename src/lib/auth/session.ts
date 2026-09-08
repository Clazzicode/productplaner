import { cookies } from "next/headers";
import { db } from "@/lib/db";

// Single implicit user by default — real multi-tenant auth is out of scope
// for this prototype. Created lazily on first use (replaces a seed script).
const DEFAULT_EMAIL = "owner@planning.local";

// Lightweight "act as this user" switcher (src/app/login), NOT real
// authentication — no password, no session token, just a cookie naming a
// User.id. It exists so per-account features (like the Settings API key)
// are actually testable as distinct accounts. Anyone who never visits
// /login keeps getting the default-user bootstrap below, unchanged.
const CURRENT_USER_COOKIE = "v2_current_user";

const USER_INCLUDE = { profiles: { orderBy: { createdAt: "desc" as const }, take: 1 } };

export async function getCurrentUser() {
  const store = await cookies();
  const selectedId = store.get(CURRENT_USER_COOKIE)?.value;
  if (selectedId) {
    const selected = await db.user.findUnique({ where: { id: selectedId }, include: USER_INCLUDE });
    if (selected) return selected;
  }

  const existing = await db.user.findUnique({
    where: { email: DEFAULT_EMAIL },
    include: USER_INCLUDE,
  });
  if (existing) return existing;

  try {
    const org = await db.organization.create({ data: { name: "New Organization" } });
    return await db.user.create({
      data: { organizationId: org.id, name: "New User", email: DEFAULT_EMAIL },
      include: USER_INCLUDE,
    });
  } catch {
    // Lost a create race with a parallel request — the user exists now.
    return (await db.user.findUnique({
      where: { email: DEFAULT_EMAIL },
      include: USER_INCLUDE,
    }))!;
  }
}

/** Latest qualifying profile, or null if the user hasn't qualified yet. */
export async function getActiveProfile() {
  const user = await getCurrentUser();
  return user.profiles[0] ?? null;
}

export async function setCurrentUserCookie(userId: string) {
  const store = await cookies();
  store.set(CURRENT_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearCurrentUserCookie() {
  const store = await cookies();
  store.delete(CURRENT_USER_COOKIE);
}
