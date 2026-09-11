import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Standard @supabase/ssr Next.js App Router session-refresh recipe. Must run
 * on every request that might read the session (i.e. everything except
 * static assets) — Supabase Auth's access token is short-lived, and this is
 * what silently refreshes it and rewrites the updated cookie onto the
 * response before it reaches getCurrentUser().
 */
export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Touching getUser() (not getSession()) is what actually triggers the
  // refresh-if-needed + cookie rewrite; the result itself isn't used here.
  await supabase.auth.getUser();

  return response;
}
