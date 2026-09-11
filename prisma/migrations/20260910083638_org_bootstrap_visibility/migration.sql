-- Fix: creating a brand-new Organization inside provisionSoloWorkspace()
-- (src/lib/auth/session.ts) failed under RLS with "new row violates
-- row-level security policy for table Organization" — caught live, by an
-- actual end-to-end signup test through the real HTTP API after cutting
-- DATABASE_URL over to app_rw, not just synthetic policy testing.
--
-- Root cause: Postgres checks a table's SELECT policy visibility for
-- INSERT ... RETURNING (which is what Prisma's create() always uses), not
-- just the INSERT policy's WITH CHECK. organization_insert's WITH CHECK
-- (true) always passed, but organization_select's is_org_member(id) could
-- never match for a row that was JUST created — no OrganizationMember row
-- can reference it yet (it doesn't have an id available to insert against
-- until the Organization row itself commits). A genuine bootstrap
-- chicken-and-egg, same shape as the one organization_member_insert's
-- self-insert clause already solves for OrganizationMember — this is the
-- equivalent fix for Organization itself.
--
-- Fix: also allow visibility of a not-yet-owned org. Safe in practice
-- (not just in theory): every real Organization row passes through
-- provisionSoloWorkspace()'s single atomic transaction, which sets
-- ownerUserId before committing — so a row with ownerUserId IS NULL is only
-- ever visible to the same transaction that just created it (ordinary MVCC:
-- other sessions can't see uncommitted rows regardless of RLS), never to an
-- unrelated caller after the fact.

DROP POLICY IF EXISTS organization_select ON "Organization";

CREATE POLICY organization_select ON "Organization" FOR SELECT TO app_rw, authenticated
  USING (is_org_member(id) OR "ownerUserId" IS NULL);
