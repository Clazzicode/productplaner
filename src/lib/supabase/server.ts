import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { assertEnvironmentIsolation } from "@/lib/environment";

/**
 * Server-side Supabase client bound to the current request's cookies, for use
 * in Server Components, Route Handlers, and Server Actions. Always call
 * `.auth.getUser()` on the result (never `.getSession()`) when the caller's
 * identity matters — getUser() re-validates the token against Supabase Auth,
 * getSession() only decodes the local cookie and can be spoofed.
 */
export async function createSupabaseServerClient() {
  assertEnvironmentIsolation();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — middleware refreshes
            // the session cookie on the response instead. Safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * Service-role client for genuinely trusted, server-only operations that must
 * bypass RLS entirely (e.g. creating an auth.users row during backfill/admin
 * provisioning) or manage users directly via the Admin API. NEVER import this
 * into anything that runs in — or could be bundled for — the browser, and
 * never forward its key to a client. There is deliberately no cached/shared
 * instance here so every call site's need for this elevated client stays
 * explicit and easy to audit.
 */
export function createSupabaseServiceClient() {
  assertEnvironmentIsolation();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
