import { Prisma, PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

// ---------- RLS request context (docs/V2-MULTI-TENANT-AUTH.md) ----------
// Postgres's auth.uid() reads current_setting('request.jwt.claims', true)::json->>'sub'.
// Prisma never goes through PostgREST, so nothing sets that GUC for us — we set
// it ourselves, per request, from the already-verified Supabase session. The
// claims value is trusted completely by every RLS policy: it must only ever be
// populated from getCurrentUser()'s verified `supabase.auth.getUser()` result
// (or explicitly marked "service", for trusted server-only code), never from
// anything client-suppliable.
//
// IMPORTANT, verified directly against the real dev and production Next.js
// server (not assumed): calling establishAuthContext() has NO effect on code
// that runs after this function itself returns to ITS OWN caller, if this
// function's call chain included an awaited `cookies()`/`headers()` call
// (Next.js's dynamic-API tracking silently drops unrelated AsyncLocalStorage
// state exactly at that return boundary — confirmed with an isolated probe
// route in both `next dev` and a production `next build && next start`).
// It DOES work correctly for any further code called from within the SAME
// function's continuing execution (including deeper nested function calls —
// e.g. into src/lib/access, src/lib/generation, etc.).
//
// Practical rule this drives: getCurrentUser() (src/lib/auth/session.ts)
// resolves identity but deliberately does NOT call establishAuthContext()
// itself — it awaits cookies() via the Supabase client, so anything it set
// would be silently lost the moment it returns. Instead, every page/Route
// Handler calls `establishAuthContext(user.authUserId)` itself, immediately
// after awaiting requireCurrentUser()/requireCurrentUserApi(), before any
// db/withTransaction use in that same function — see those call sites for
// the pattern. Getting this wrong fails LOUDLY (claimsJson() throws) rather
// than silently running unauthenticated, so a missed call site is a 500, not
// a security hole.
type AuthContext = { authUserId: string | null };

const authContext = new AsyncLocalStorage<AuthContext>();
const transactionContext = new AsyncLocalStorage<Prisma.TransactionClient>();

/**
 * Call this yourself, in the same function that will use `db`/`withTransaction`
 * (directly or via further nested calls) — see the module doc comment above
 * for exactly why. Typical shape:
 *   const user = await requireCurrentUser();
 *   establishAuthContext(user.authUserId);
 */
export function establishAuthContext(authUserId: string | null): void {
  authContext.enterWith({ authUserId });
}

export function currentAuthUserId(): string | null {
  return authContext.getStore()?.authUserId ?? null;
}

/** Narrow escape hatch for genuinely trusted, unauthenticated server code
 * (one-off scripts, seeding). Runs with no user claim — RLS policies keyed on
 * organization membership will see no matching rows, same as any anonymous
 * caller; this does NOT bypass RLS (only the DB role can do that). */
export function withServiceContext<T>(fn: () => T): T {
  return authContext.run({ authUserId: null }, fn);
}

function claimsJson(): string {
  const ctx = authContext.getStore();
  if (!ctx) {
    throw new Error(
      "Database access outside request auth context — call establishAuthContext(user.authUserId) " +
        "in the same function as this db call (see src/lib/db.ts), or wrap trusted server-only code " +
        "in withServiceContext().",
    );
  }
  return JSON.stringify({ sub: ctx.authUserId, role: "authenticated" });
}

// ---------- Prisma client ----------

const globalForPrisma = globalThis as unknown as { rawPrisma?: PrismaClient };

/** Unextended client. Used internally by withTransaction(), and directly by
 * one-off scripts (backfill, seeding) that manage their own connection/role
 * and don't run inside a request's auth context. Prefer `db` everywhere else. */
export const rawDb = globalForPrisma.rawPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.rawPrisma = rawDb;

/**
 * Default export for normal, single-operation queries. Every operation is
 * transparently run as `[set_config(...), <the operation>]` inside one
 * array-form $transaction, so RLS policies see a real auth.uid() with zero
 * changes needed at call sites (confirmed: array-form $transaction batches
 * onto one connection, set_config(..., true) is transaction-local so it's
 * safe under PgBouncer transaction pooling, and it does not leak to other
 * concurrent callers — verified directly against the live pooler).
 *
 * Do NOT pass `db` operations into `db.$transaction([...])` or
 * `db.$transaction(async (tx) => ...)` — each operation would independently
 * try to open its own nested transaction. Use `withTransaction()` instead for
 * anything that needs multiple statements to commit atomically.
 */
const requestDb = rawDb.$extends({
  name: "rls-request-context",
  query: {
    $allOperations({ args, query }) {
      const claims = claimsJson();
      return rawDb
        .$transaction([rawDb.$executeRaw`select set_config('request.jwt.claims', ${claims}, true)`, query(args)])
        .then(([, result]) => result);
    },
  },
});

// Business services may compose several existing services without opening
// independent transactions. Resolve delegates at call time, scoped to the
// async operation; concurrent requests never share a transaction client.
export const db = new Proxy(requestDb, {
  get(target, property) {
    const client = transactionContext.getStore() ?? target;
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Replacement for every previous `db.$transaction(...)` call (both array and
 * interactive form) — those would nest transactions once `db` is extended
 * (see above). Runs `fn` against the unextended client inside one real
 * transaction, with the RLS claim set once at the start of it.
 */
export function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  const existing = transactionContext.getStore();
  if (existing) return fn(existing);
  const claims = claimsJson();
  return rawDb.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('request.jwt.claims', ${claims}, true)`;
    return transactionContext.run(tx, () => fn(tx));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, ...options });
}
