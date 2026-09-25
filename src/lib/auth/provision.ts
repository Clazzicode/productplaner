import type { User } from "@supabase/supabase-js";
import { db, establishAuthContext } from "@/lib/db";
import { provisionSoloWorkspace } from "@/lib/auth/session";

/** Call only with a user returned by verified Supabase Auth operations.
 * Provision after confirmation, not from the unverified sign-up response.
 * Retries cover simultaneous callback/sign-in requests and partial sign-ups.
 */
export async function ensureAuthenticatedWorkspace(user: User) {
  if (!user.email || !user.email_confirmed_at) throw new Error("Confirmed email required");
  establishAuthContext(user.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await db.user.findUnique({ where: { authUserId: user.id } });
    if (existing) return existing;
    try {
      return await provisionSoloWorkspace({
        authUserId: user.id,
        // Metadata is display text only, never an authorization input.
        name: typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name.slice(0, 100) : user.email.split("@")[0],
        email: user.email,
      });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      if (attempt === 2 || !["P2002", "P2034"].includes(String(code))) throw error;
    }
  }
  throw new Error("Workspace provisioning failed");
}
