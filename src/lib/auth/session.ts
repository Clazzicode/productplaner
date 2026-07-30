import { db } from "@/lib/db";

// Single implicit user — real multi-tenant auth is out of scope for this
// prototype. Created lazily on first use (replaces a seed script).
const DEMO_EMAIL = "demo@planning.local";

export async function getCurrentUser() {
  const existing = await db.user.findUnique({
    where: { email: DEMO_EMAIL },
    include: { profiles: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (existing) return existing;

  try {
    const org = await db.organization.create({ data: { name: "Demo Organization" } });
    return await db.user.create({
      data: { organizationId: org.id, name: "Demo User", email: DEMO_EMAIL },
      include: { profiles: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  } catch {
    // Lost a create race with a parallel request — the user exists now.
    return (await db.user.findUnique({
      where: { email: DEMO_EMAIL },
      include: { profiles: { orderBy: { createdAt: "desc" }, take: 1 } },
    }))!;
  }
}

/** Latest qualifying profile, or null if the user hasn't qualified yet. */
export async function getActiveProfile() {
  const user = await getCurrentUser();
  return user.profiles[0] ?? null;
}
