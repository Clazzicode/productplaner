# Authenticated entry points

Source: Avery's approved eight-findings plan, milestone 3. The existing transaction-local PostgreSQL claims, non-bypassing application role, missing-context failure and action-specific access checks remain in force.

Protected route exports use `withAuthenticatedApi` from `src/lib/auth/entryPoints.ts`. It keeps `withApi` outside the authentication scope, preserving request logging, origin enforcement, environment isolation and rate limits. It resolves the verified Supabase identity and active membership before awaiting the complete handler inside `withAuthenticatedDatabaseContext`.

```ts
export const GET = withAuthenticatedApi(async () => {
  const auth = await requireCurrentUserApi();
  if (!auth.ok) return auth.response;
  // Apply the appropriate initiative/action guard before reading records.
  return Response.json({ /* authorized result */ });
});
```

Protected server pages and layouts export `withAuthenticatedPage(Page)`. The public root shell uses `withOptionalAuthenticatedPage`: its anonymous branch has no user database claims. Existing handler calls to `getCurrentUser`, `requireCurrentUser` and `requireCurrentUserApi` reuse the verified request identity instead of repeating Supabase verification. This cache is scoped to one execution, never shared between requests or users. Service action guards still reload membership and grants for consequential decisions.

The scoped database identity includes the active workspace for service checks. Legacy `establishAuthContext` calls remain compatible inside the wrapper and retain that workspace for the same verified actor. PostgreSQL claims remain transaction-local. No service context or RLS bypass is granted by these wrappers.

Worker/service execution stays explicit. Verify its secret, signature or installation authority first, and await database operations inside the service scope:

```ts
await withServiceContext(async () => await db.$queryRaw`SELECT authorized_function()`);
```

Do not return a lazy Prisma operation from an unawaited service callback. Await every operation before its intended scope ends. Service context has a null user claim; ordinary tenant RLS still denies tenant reads.

`docs/ENTRY-POINT-INVENTORY.json` classifies every route, page and layout. Authentication callbacks, Forge callbacks, webhooks, workers, diagnostics, public shells, synthetic previews and authenticated aliases have explicit reasons. Exceptions also have source fingerprints: changing an exception requires reviewing its classification and reason. New server-action files are unclassified until explicitly reviewed. Run `npx tsx scripts/check-auth-entrypoints.ts`; CI and tests enforce this inventory.

The staging workflow runs real pooled-database tests for missing context, rollback, concurrent users, revoked membership and claim cleanup. These tests refuse any target except the independent staging project and create/remove isolated fixture organizations. Local unit tests are separate evidence and do not substitute for the staging run.
